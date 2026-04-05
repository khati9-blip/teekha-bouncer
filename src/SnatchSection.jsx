import React, { useState, useEffect, useMemo } from "react";

// ── Week bounds (Sat 12:00 AM → Fri 11:59 PM IST, date strings) ────────────
function getWeekBounds(weekOffset = 0) {
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(Date.now() + IST_OFFSET);
  const day = nowIST.getUTCDay();
  const daysSinceSat = day === 6 ? 0 : day + 1;
  const sat = new Date(nowIST);
  sat.setUTCDate(nowIST.getUTCDate() - daysSinceSat - weekOffset * 7);
  const fri = new Date(sat);
  fri.setUTCDate(sat.getUTCDate() + 6);
  const fmt = d => d.toISOString().split("T")[0];
  return { satStr: fmt(sat), friStr: fmt(fri) };
}

// ── Snatch window: Sat 12:00 AM → Sat 12:00 PM IST ────────────────────────
function getSnatchWindowStatus() {
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(Date.now() + IST_OFFSET);
  const day = nowIST.getUTCDay(); // 6 = Saturday
  const hour = nowIST.getUTCHours();
  const open = day === 6 && hour >= 0 && hour < 12;
  // Time until next window
  const daysSinceSat = day === 6 ? 0 : day + 1;
  const nextSat = new Date(nowIST);
  nextSat.setUTCDate(nowIST.getUTCDate() - daysSinceSat + (day === 6 ? 7 : 0));
  nextSat.setUTCHours(0, 0, 0, 0);
  const minsLeft = open ? Math.max(0, Math.floor((new Date(nextSat.getTime() + 12*3600*1000) - nowIST) / 60000)) : null;
  const minsUntil = !open ? Math.floor((nextSat - nowIST) / 60000) : null;
  return { open, minsLeft, minsUntil };
}

// ── Who has snatch rights this week ────────────────────────────────────────
function getSnatchEligibleTeam(matches, points, players, teams, assignments) {
  const week = getWeekBounds(0);
  const weekMatches = matches.filter(m => m.date >= week.satStr && m.date <= week.friStr);
  if (weekMatches.length === 0) return null;

  let bestPts = 0;
  let bestTeamId = null;

  for (const match of weekMatches) {
    for (const player of players) {
      const d = points[player.id]?.[match.id];
      if (!d || !d.base) continue;
      if (d.base > bestPts) {
        bestPts = d.base;
        bestTeamId = assignments[player.id];
      }
    }
  }
  if (!bestTeamId) return null;
  return { team: teams.find(t => t.id === bestTeamId), bestPts };
}

export default function SnatchSection({
  teams, players, assignments, snatch, points, matches,
  leaderboard, myTeam, isAdmin, unlocked, withPassword,
  teamIdentity, user, pitch,
  onUpdateSnatch, onUpdateAssignments, onUpdateOwnershipLog, ownershipLog,
  pushNotif
}) {
  const [windowStatus, setWindowStatus] = useState(getSnatchWindowStatus());
  const [pinInput, setPinInput] = useState("");
  const [pinErr, setPinErr] = useState("");
  const [selectingPlayer, setSelectingPlayer] = useState(false);
  const [selectedVictimTeam, setSelectedVictimTeam] = useState(null);

  useEffect(() => {
    const t = setInterval(() => setWindowStatus(getSnatchWindowStatus()), 30000);
    return () => clearInterval(t);
  }, []);

  // Who has snatch rights this week
  const eligibility = useMemo(() =>
    getSnatchEligibleTeam(matches, points, players, teams, assignments),
    [matches, points, players, teams, assignments]
  );

  const myTeamId = myTeam?.id;
  const isEligible = eligibility?.team?.id === myTeamId;
  const hasActivSnatch = !!snatch.active;
  const isMySnatch = snatch.active?.byTeamId === myTeamId;

  // Auto-return check (Friday 11:58 PM IST)
  useEffect(() => {
    if (!snatch.active) return;
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    const nowIST = new Date(Date.now() + IST_OFFSET);
    const day = nowIST.getUTCDay(); // 5 = Friday
    const hour = nowIST.getUTCHours();
    const min = nowIST.getUTCMinutes();
    if (day === 5 && hour === 23 && min >= 58) {
      handleReturn();
    }
  }, [snatch.active]);

  const handleReturn = () => {
    if (!snatch.active) return;
    const { pid, fromTeamId, pointsAtSnatch, startDate } = snatch.active;
    const snatchWeekPts = Object.values(points[pid] || {}).reduce((sum, d, i, arr) => {
      // Only count points after snatch start date
      return sum + (d?.base || 0);
    }, 0) - (pointsAtSnatch || 0);

    const newHistory = [...(snatch.history || []), {
      ...snatch.active,
      returnDate: new Date().toISOString(),
      snatchWeekPts: Math.max(0, snatchWeekPts),
    }];

    // Restore assignment
    const newAssignments = { ...assignments, [pid]: fromTeamId };
    // Update ownership log
    const now = new Date().toISOString().split("T")[0];
    const newLog = { ...ownershipLog };
    if (!newLog[pid]) newLog[pid] = [];
    newLog[pid] = newLog[pid].map(o =>
      o.teamId === snatch.active.byTeamId && !o.to ? { ...o, to: now } : o
    );
    newLog[pid] = [...newLog[pid], { teamId: fromTeamId, from: now, to: null }];

    onUpdateSnatch({ ...snatch, active: null, history: newHistory, weekNum: snatch.weekNum + 1 });
    onUpdateAssignments(newAssignments);
    onUpdateOwnershipLog(newLog);
    pushNotif("snatch", "Snatched player returned to original team", "↩️");
  };

  const confirmSnatch = async (pid) => {
    // Verify PIN
    const myIdentity = Object.values(teamIdentity || {}).find(t => t.claimedBy === user?.email);
    if (!myIdentity?.pinHash) { setPinErr("No PIN set for your team"); return; }
    const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pinInput));
    const h = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,"0")).join("");
    if (h !== myIdentity.pinHash) { setPinErr("Wrong PIN"); setPinInput(""); return; }

    const fromTeamId = assignments[pid];
    const playerTotalPts = Object.values(points[pid] || {}).reduce((s, d) => s + (d?.base || 0), 0);

    const active = {
      pid, byTeamId: myTeamId, fromTeamId,
      pointsAtSnatch: playerTotalPts,
      startDate: new Date().toISOString(),
    };

    // Move player to snatching team temporarily
    const newAssignments = { ...assignments, [pid]: myTeamId };
    const now = new Date().toISOString().split("T")[0];
    const newLog = { ...ownershipLog };
    if (!newLog[pid]) newLog[pid] = [];
    newLog[pid] = newLog[pid].map(o =>
      o.teamId === fromTeamId && !o.to ? { ...o, to: now } : o
    );
    newLog[pid] = [...newLog[pid], { teamId: myTeamId, from: now, to: null }];

    onUpdateSnatch({ ...snatch, active });
    onUpdateAssignments(newAssignments);
    onUpdateOwnershipLog(newLog);
    pushNotif("snatch", (myTeam?.name || "A team") + " snatched " + (players.find(p => p.id === pid)?.name || "a player"), "⚡");

    setSelectingPlayer(false);
    setSelectedVictimTeam(null);
    setPinInput("");
    setPinErr("");
  };

  const sBtn = (col, bg) => ({
    background: bg || col + "22",
    border: "1px solid " + col + "44",
    borderRadius: 8,
    padding: "8px 16px",
    color: col,
    fontFamily: "Barlow Condensed,sans-serif",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  });

  const snatched = snatch.active ? players.find(p => p.id === snatch.active.pid) : null;
  const snatchedFrom = snatch.active ? teams.find(t => t.id === snatch.active.fromTeamId) : null;
  const snatchedBy = snatch.active ? teams.find(t => t.id === snatch.active.byTeamId) : null;

  // Time display
  const formatMins = (mins) => {
    if (!mins) return "";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? h + "h " + m + "m" : m + "m";
  };

  return (
    <div style={{background:"#0E1521",borderRadius:14,border:"1px solid #A855F744",padding:16,marginTop:16}}>
      <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:18,fontWeight:700,color:"#A855F7",letterSpacing:2,marginBottom:4}}>
        ⚡ SNATCH WINDOW
      </div>

      {/* Window status */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:windowStatus.open?"#2ECC71":"#FF3D5A",flexShrink:0}} />
          <span style={{fontSize:12,color:windowStatus.open?"#2ECC71":"#FF3D5A",fontWeight:700}}>
            {windowStatus.open ? "WINDOW OPEN" : "WINDOW CLOSED"}
          </span>
        </div>
        <span style={{fontSize:11,color:"#4A5E78"}}>
          {windowStatus.open
            ? "Closes in " + formatMins(windowStatus.minsLeft)
            : "Opens Sat 12:00 AM IST" + (windowStatus.minsUntil ? " (" + formatMins(windowStatus.minsUntil) + ")" : "")}
        </span>
        <span style={{fontSize:11,color:"#4A5E78",marginLeft:"auto"}}>Sat 12:00 AM → 12:00 PM IST</span>
      </div>

      {/* Eligibility */}
      <div style={{background:"#080C14",borderRadius:10,padding:"10px 14px",marginBottom:14}}>
        <div style={{fontSize:10,color:"#4A5E78",letterSpacing:2,marginBottom:6}}>SNATCH RIGHTS THIS WEEK</div>
        {!eligibility ? (
          <div style={{fontSize:12,color:"#4A5E78"}}>No matches with stats this week — snatch unavailable</div>
        ) : (
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:10,height:10,borderRadius:"50%",background:eligibility.team?.color,flexShrink:0}} />
            <div>
              <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:16,fontWeight:700,color:eligibility.team?.color}}>
                {eligibility.team?.name}
              </div>
              <div style={{fontSize:11,color:"#4A5E78"}}>Best single match: {eligibility.bestPts} base pts this week</div>
            </div>
            {eligibility.team?.id === myTeamId && (
              <span style={{marginLeft:"auto",background:"#2ECC7122",border:"1px solid #2ECC7144",borderRadius:6,padding:"3px 8px",fontSize:11,color:"#2ECC71",fontWeight:700}}>YOU</span>
            )}
          </div>
        )}
      </div>

      {/* Active snatch */}
      {hasActivSnatch && (
        <div style={{background:"#A855F711",border:"1px solid #A855F744",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
          <div style={{fontSize:10,color:"#A855F7",letterSpacing:2,fontWeight:700,marginBottom:8}}>ACTIVE SNATCH</div>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:"#E2EAF4"}}>{snatched?.name}</div>
              <div style={{fontSize:11,color:"#4A5E78",marginTop:2}}>
                <span style={{color:snatchedBy?.color,fontWeight:700}}>{snatchedBy?.name}</span>
                <span style={{margin:"0 6px",color:"#4A5E78"}}>snatched from</span>
                <span style={{color:snatchedFrom?.color,fontWeight:700}}>{snatchedFrom?.name}</span>
              </div>
              <div style={{fontSize:10,color:"#4A5E78",marginTop:2}}>Returns Friday 11:58 PM IST</div>
            </div>
            {(isAdmin || unlocked) && (
              <button onClick={()=>withPassword(handleReturn)} style={{...sBtn("#2ECC71"),marginLeft:"auto"}}>
                ↩️ FORCE RETURN
              </button>
            )}
          </div>
        </div>
      )}

      {/* Snatch action — only for eligible team during window */}
      {!hasActivSnatch && windowStatus.open && isEligible && (
        <div>
          {!selectingPlayer ? (
            <button onClick={()=>setSelectingPlayer(true)} style={{...sBtn("#A855F7","#A855F722"),width:"100%",marginBottom:8}}>
              ⚡ ACTIVATE SNATCH
            </button>
          ) : (
            <div>
              <div style={{fontSize:11,color:"#4A5E78",marginBottom:10}}>Select a team to snatch from:</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                {teams.filter(t => t.id !== myTeamId).map(t => (
                  <button key={t.id} onClick={()=>setSelectedVictimTeam(t.id === selectedVictimTeam ? null : t.id)}
                    style={{background:selectedVictimTeam===t.id?t.color+"33":"transparent",border:"1px solid "+(selectedVictimTeam===t.id?t.color:t.color+"44"),borderRadius:8,padding:"6px 14px",color:t.color,fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:12,cursor:"pointer"}}>
                    {t.name}
                  </button>
                ))}
              </div>

              {selectedVictimTeam && (
                <div>
                  <div style={{fontSize:11,color:"#4A5E78",marginBottom:8}}>Select player to snatch:</div>
                  {players.filter(p => assignments[p.id] === selectedVictimTeam).map(p => (
                    <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#080C14",borderRadius:8,border:"1px solid #1E2D45",marginBottom:6}}>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,fontSize:13,color:"#E2EAF4"}}>{p.name}</div>
                        <div style={{fontSize:11,color:"#4A5E78"}}>{p.iplTeam} • {p.role}</div>
                      </div>
                      <button onClick={()=>{
                        if (!pinInput) { setPinErr("Enter your PIN first"); return; }
                        confirmSnatch(p.id);
                      }} style={{...sBtn("#A855F7"),fontSize:11,padding:"4px 12px"}}>SNATCH</button>
                    </div>
                  ))}

                  <div style={{marginTop:12}}>
                    <div style={{fontSize:11,color:"#4A5E78",marginBottom:6}}>Enter your team PIN to confirm:</div>
                    <input type="password" inputMode="numeric" value={pinInput}
                      onChange={e=>{setPinInput(e.target.value);setPinErr("");}}
                      placeholder="Your PIN"
                      style={{width:"100%",background:"#080C14",border:"1px solid "+(pinErr?"#FF3D5A":"#1E2D45"),borderRadius:8,padding:"8px 12px",color:"#E2EAF4",fontSize:14,fontFamily:"Barlow Condensed,sans-serif",outline:"none",boxSizing:"border-box",marginBottom:4}} />
                    {pinErr && <div style={{fontSize:11,color:"#FF3D5A",marginBottom:6}}>{pinErr}</div>}
                  </div>
                </div>
              )}

              <button onClick={()=>{setSelectingPlayer(false);setSelectedVictimTeam(null);setPinInput("");setPinErr("");}}
                style={{...sBtn("#4A5E78"),marginTop:8,width:"100%"}}>CANCEL</button>
            </div>
          )}
        </div>
      )}

      {!hasActivSnatch && windowStatus.open && !isEligible && eligibility && (
        <div style={{fontSize:12,color:"#4A5E78",textAlign:"center",padding:"10px 0"}}>
          Only <span style={{color:eligibility.team?.color,fontWeight:700}}>{eligibility.team?.name}</span> can snatch this week
        </div>
      )}

      {!hasActivSnatch && !windowStatus.open && (
        <div style={{fontSize:12,color:"#4A5E78",textAlign:"center",padding:"8px 0"}}>
          Window opens Saturday 12:00 AM IST
        </div>
      )}

      {/* Snatch history */}
      {(snatch.history || []).length > 0 && (
        <div style={{marginTop:14}}>
          <div style={{fontSize:10,color:"#4A5E78",letterSpacing:2,marginBottom:8}}>SNATCH HISTORY</div>
          {[...(snatch.history || [])].reverse().slice(0, 5).map((h, i) => {
            const sp = players.find(p => p.id === h.pid);
            const bt = teams.find(t => t.id === h.byTeamId);
            const ft = teams.find(t => t.id === h.fromTeamId);
            return (
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:"#080C14",borderRadius:8,marginBottom:4,fontSize:11}}>
                <span style={{color:"#4A5E78"}}>Wk {h.week||i+1}</span>
                <span style={{fontWeight:700,color:"#E2EAF4"}}>{sp?.name}</span>
                <span style={{color:"#4A5E78"}}>by</span>
                <span style={{color:bt?.color,fontWeight:700}}>{bt?.name}</span>
                <span style={{color:"#4A5E78"}}>from</span>
                <span style={{color:ft?.color,fontWeight:700}}>{ft?.name}</span>
                {h.snatchWeekPts != null && <span style={{marginLeft:"auto",color:"#F5A623",fontWeight:700}}>{h.snatchWeekPts} pts</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
