import React, { useState, useEffect, useMemo } from "react";

const IST_OFFSET = 5.5 * 60 * 60 * 1000;

// Get true IST regardless of machine timezone
function nowIST() {
  // Date.now() always returns UTC ms — just add IST offset
  return new Date(Date.now() + IST_OFFSET);
}

// ── Week bounds (Sat 12:00 AM → Fri 11:59 PM IST) ─────────────────────────
function getWeekBounds(weekOffset = 0) {
  const ist = nowIST();
  const day = ist.getUTCDay();
  const daysSinceSat = day === 6 ? 0 : day + 1;
  const sat = new Date(ist);
  sat.setUTCDate(ist.getUTCDate() - daysSinceSat - weekOffset * 7);
  const fri = new Date(sat);
  fri.setUTCDate(sat.getUTCDate() + 6);
  const fmt = d => d.toISOString().split("T")[0];
  return { satStr: fmt(sat), friStr: fmt(fri) };
}

// ── Snatch window: Sat 12:00 AM → Sat 12:00 PM IST ────────────────────────
function getSnatchWindowStatus() {
  const ist = nowIST();
  const day = ist.getUTCDay(); // 6 = Saturday
  const hour = ist.getUTCHours();
  const min = ist.getUTCMinutes();
  const totalMins = hour * 60 + min;
  const open = day === 6 && totalMins < 720;

  if (open) {
    const minsLeft = Math.max(0, 720 - totalMins);
    return { open: true, minsLeft, minsUntil: null };
  }

  // Find next Saturday midnight IST
  let daysUntilSat = (6 - day + 7) % 7;
  if (daysUntilSat === 0) daysUntilSat = 7; // Saturday but window closed — next week

  const todayMidnightIst = ist.getTime() - totalMins * 60000;
  const nextSatMs = todayMidnightIst + daysUntilSat * 24 * 60 * 60 * 1000;
  const minsUntil = Math.max(0, Math.floor((nextSatMs - ist.getTime()) / 60000));

  return { open: false, minsLeft: null, minsUntil };
}

// ── Who has snatch rights this week ────────────────────────────────────────
function getSnatchEligibleTeam(matches, points, players, teams, assignments, weekOffset = 0) {
  const week = getWeekBounds(weekOffset);
  const weekMatches = matches.filter(m => m.date >= week.satStr && m.date <= week.friStr);
  if (weekMatches.length === 0) return null;
  let bestPts = 0, bestTeamId = null;
  for (const match of weekMatches) {
    for (const player of players) {
      const d = points[player.id]?.[match.id];
      if (!d || !d.base) continue;
      if (d.base > bestPts) { bestPts = d.base; bestTeamId = assignments[player.id]; }
    }
  }
  if (!bestTeamId) return null;
  return { team: teams.find(t => t.id === bestTeamId), bestPts };
}

export default function SnatchSection({
  teams, players, assignments, snatch, points, matches, captains,
  leaderboard, myTeam, isAdmin, unlocked, withPassword,
  teamIdentity, user, pitch,
  onUpdateSnatch, onUpdateAssignments, onUpdateOwnershipLog, ownershipLog,
  safePlayers, onUpdateSafePlayers, pushNotif
}) {
  const [windowStatus, setWindowStatus] = useState(getSnatchWindowStatus());
  const [pinInput, setPinInput] = useState("");
  const [pinErr, setPinErr] = useState("");
  const [selectingPlayer, setSelectingPlayer] = useState(false);
  const [selectedVictimTeam, setSelectedVictimTeam] = useState(null);
  const [pinModal, setPinModal] = useState(null); // player object to confirm snatch

  useEffect(() => {
    const t = setInterval(() => setWindowStatus(getSnatchWindowStatus()), 30000);
    return () => clearInterval(t);
  }, []);

  const eligibility = useMemo(() => {
    // When snatch window is open (Saturday), look at previous week's matches
    // because the current week just started today (Saturday) with no matches yet
    const weekOffset = windowStatus.open ? 1 : 0;
    return getSnatchEligibleTeam(matches, points, players, teams, assignments, weekOffset);
  }, [matches, points, players, teams, assignments, windowStatus.open]);

  const myTeamId = myTeam?.id;
  const isEligible = eligibility?.team?.id === myTeamId;
  const hasActivSnatch = !!snatch.active;

  // Auto-return handled by Edge Function on Supabase
  // Only manual force-return via admin button remains here

  const handleReturn = (activeSnatch = snatch.active) => {
    if (!activeSnatch) return;
    const { pid, fromTeamId, byTeamId, startDate } = activeSnatch;
    const snatchDateStr = (startDate || "").split("T")[0];

    // Calculate snatchWeekPts correctly — post-snatch matches with C/VC for byTeam
    let snatchWeekPts = 0;
    Object.entries(points[pid] || {}).forEach(([mid, d]) => {
      const match = matches.find(m => m.id === mid);
      if (!match || match.date < snatchDateStr) return;
      const cap = (captains || {})[mid + "_" + byTeamId] || {};
      let pts = d?.base || 0;
      if (cap.captain === pid) pts *= 2;
      else if (cap.vc === pid) pts *= 1.5;
      snatchWeekPts += Math.round(pts);
    });

    // Calculate correct pointsAtSnatch — pre-snatch matches for fromTeam
    let correctPointsAtSnatch = 0;
    Object.entries(points[pid] || {}).forEach(([mid, d]) => {
      const match = matches.find(m => m.id === mid);
      if (!match || match.date >= snatchDateStr) return;
      const cap = (captains || {})[mid + "_" + fromTeamId] || {};
      let pts = d?.base || 0;
      if (cap.captain === pid) pts *= 2;
      else if (cap.vc === pid) pts *= 1.5;
      correctPointsAtSnatch += Math.round(pts);
    });

    const newHistory = [...(snatch.history || []), {
      ...activeSnatch,
      pointsAtSnatch: correctPointsAtSnatch,
      returnDate: new Date().toISOString(),
      snatchWeekPts,
    }];

    const newAssignments = { ...assignments, [pid]: fromTeamId };

    // Mark player permanently safe
    const safeObj = (Array.isArray(safePlayers) || !safePlayers) ? {} : { ...safePlayers };
    const teamSafe = safeObj[fromTeamId] || [];
    if (!teamSafe.includes(pid)) safeObj[fromTeamId] = [...teamSafe, pid];
    onUpdateSafePlayers(safeObj);

    onUpdateSnatch({ ...snatch, active: null, history: newHistory, weekNum: (snatch.weekNum || 1) + 1 });
    onUpdateAssignments(newAssignments);
    pushNotif("snatch", "Snatched player returned & marked 🛡 SAFE permanently", "↩️");
  };

  const confirmSnatch = async (pid) => {
    const actingTeamId = myTeamId || eligibility?.team?.id;
    if (!unlocked) {
      const myIdentity = Object.values(teamIdentity || {}).find(t => t.claimedBy === user?.email);
      if (!myIdentity?.pinHash) { setPinErr("No PIN set for your team"); return; }
      const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pinInput));
      const h = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
      if (h !== myIdentity.pinHash) { setPinErr("Wrong PIN"); setPinInput(""); return; }
    }
    const fromTeamId = assignments[pid];
    // Calculate pointsAtSnatch WITH C/VC multipliers to match getTeamTotal logic
    const playerTotalPts = Object.entries(points[pid]||{}).reduce((s,[mid,d])=>{
      const cap = (captains||{})[mid+"_"+fromTeamId]||{};
      let pts = d?.base||0;
      if(cap.captain===pid) pts*=2; else if(cap.vc===pid) pts*=1.5;
      return s + Math.round(pts);
    },0);
    const active = { pid, byTeamId: actingTeamId, fromTeamId, pointsAtSnatch: playerTotalPts, startDate: new Date().toISOString() };
    const newAssignments = { ...assignments, [pid]: actingTeamId };
    const now = new Date().toISOString().split("T")[0];
    const newLog = { ...ownershipLog };
    if (!newLog[pid]) newLog[pid] = [];
    newLog[pid] = newLog[pid].map(o => o.teamId === fromTeamId && !o.to ? { ...o, to: now } : o);
    newLog[pid] = [...newLog[pid], { teamId: actingTeamId, from: now, to: null }];
    onUpdateSnatch({ ...snatch, active });
    onUpdateAssignments(newAssignments);
    onUpdateOwnershipLog(newLog);
    const actingTeam = teams.find(t => t.id === actingTeamId);
    pushNotif("snatch", (actingTeam?.name || "A team") + " snatched " + (players.find(p => p.id === pid)?.name || "a player"), "⚡");
    setSelectingPlayer(false); setSelectedVictimTeam(null); setPinInput(""); setPinErr(""); setPinModal(null);
  };

  const formatMins = (mins) => {
    if (!mins && mins !== 0) return "";
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    if (d > 0) return d + "d " + h + "h";
    if (h > 0) return h + "h " + m + "m";
    if (m > 0) return m + "m";
    return "opening soon";
  };

  const sBtn = (col, bg) => ({
    background: bg || col + "22", border: "1px solid " + col + "44", borderRadius: 8,
    padding: "8px 16px", color: col, fontFamily: "Barlow Condensed,sans-serif",
    fontWeight: 700, fontSize: 13, cursor: "pointer",
  });

  const snatched = snatch.active ? players.find(p => p.id === snatch.active.pid) : null;
  const snatchedFrom = snatch.active ? teams.find(t => t.id === snatch.active.fromTeamId) : null;
  const snatchedBy = snatch.active ? teams.find(t => t.id === snatch.active.byTeamId) : null;

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
            : "Opens Sat 12:00 AM IST · " + formatMins(windowStatus.minsUntil) + " away"}
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
              <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:16,fontWeight:700,color:eligibility.team?.color}}>{eligibility.team?.name}</div>
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
              <button onClick={()=>withPassword(handleReturn)} style={{...sBtn("#2ECC71"),marginLeft:"auto"}}>↩️ FORCE RETURN</button>
            )}
          </div>
        </div>
      )}

      {/* Snatch action — only for eligible team OR admin override */}
      {!hasActivSnatch && windowStatus.open && (isEligible || unlocked) && (
        <div>
          {unlocked && !isEligible && eligibility && (
            <div style={{background:"#F5A62311",border:"1px solid #F5A62333",borderRadius:8,padding:"8px 12px",marginBottom:8,fontSize:11,color:"#F5A623"}}>
              🔑 Admin override — eligible team is <strong>{eligibility.team?.name}</strong>
            </div>
          )}
          {!selectingPlayer ? (
            <button onClick={()=>setSelectingPlayer(true)} style={{...sBtn("#A855F7","#A855F722"),width:"100%",marginBottom:8,cursor:"pointer",pointerEvents:"all"}}>⚡ ACTIVATE SNATCH</button>
          ) : (
            <div>
              <div style={{fontSize:11,color:"#4A5E78",marginBottom:10}}>Select a team to snatch from:</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                {teams.filter(t => t.id !== (myTeamId || eligibility?.team?.id)).map(t => (
                  <button key={t.id} onClick={()=>setSelectedVictimTeam(t.id === selectedVictimTeam ? null : t.id)}
                    style={{background:selectedVictimTeam===t.id?t.color+"33":"transparent",border:"1px solid "+(selectedVictimTeam===t.id?t.color:t.color+"44"),borderRadius:8,padding:"6px 14px",color:t.color,fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:12,cursor:"pointer"}}>
                    {t.name}
                  </button>
                ))}
              </div>
              {selectedVictimTeam && (
                <div>
                  <div style={{fontSize:11,color:"#4A5E78",marginBottom:8}}>Select player to snatch:</div>
                  {players.filter(p => assignments[p.id] === selectedVictimTeam).map(p => {
                    const safeArr = Array.isArray(safePlayers) ? safePlayers : Object.values(safePlayers||{}).flat();
                    const isSafe = safeArr.includes(p.id);
                    return (
                    <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#080C14",borderRadius:8,border:"1px solid "+(isSafe?"#4A5E7844":"#1E2D45"),marginBottom:6,opacity:isSafe?0.6:1}}>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,fontSize:13,color:"#E2EAF4",display:"flex",alignItems:"center",gap:6}}>
                          {p.name}
                          {isSafe && <span style={{fontSize:10,background:"#4A5E7833",border:"1px solid #4A5E7866",borderRadius:4,padding:"1px 6px",color:"#94A3B8",fontWeight:700}}>🛡 SAFE</span>}
                        </div>
                        <div style={{fontSize:11,color:"#4A5E78"}}>{p.iplTeam} • {p.role}</div>
                      </div>
                      {isSafe ? (
                        <div style={{fontSize:11,color:"#4A5E78",padding:"4px 12px"}}>🛡 Protected</div>
                      ) : (
                        <button onClick={()=>{ if (unlocked) { confirmSnatch(p.id); } else { setPinModal(p); setPinInput(""); setPinErr(""); } }}
                          style={{...sBtn("#A855F7"),fontSize:11,padding:"4px 12px",cursor:"pointer"}}>SNATCH</button>
                      )}
                    </div>
                    );
                  })}

                </div>
              )}
              <button onClick={()=>{setSelectingPlayer(false);setSelectedVictimTeam(null);setPinInput("");setPinErr("");}}
                style={{...sBtn("#4A5E78"),marginTop:8,width:"100%"}}>CANCEL</button>
            </div>
          )}
        </div>
      )}

      {!hasActivSnatch && windowStatus.open && !isEligible && !unlocked && eligibility && (
        <div style={{fontSize:12,color:"#4A5E78",textAlign:"center",padding:"10px 0"}}>
          Only <span style={{color:eligibility.team?.color,fontWeight:700}}>{eligibility.team?.name}</span> can snatch this week
        </div>
      )}

      {!hasActivSnatch && !windowStatus.open && (
        <div style={{fontSize:12,color:"#4A5E78",textAlign:"center",padding:"8px 0"}}>Window opens Saturday 12:00 AM IST</div>
      )}

      {/* PIN Confirmation Modal */}
      {pinModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(5,8,16,0.9)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#111118",borderRadius:18,border:"1px solid #A855F744",padding:28,width:"100%",maxWidth:360,boxShadow:"0 24px 80px rgba(0,0,0,0.7)"}}>
            <div style={{textAlign:"center",marginBottom:20}}>
              <div style={{fontSize:32,marginBottom:8}}>⚡</div>
              <div style={{fontFamily:"'Exo 2',sans-serif",fontSize:18,fontWeight:800,color:"#A855F7",letterSpacing:1,marginBottom:4}}>CONFIRM SNATCH</div>
              <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:13,color:"#9AA5B8"}}>
                You are snatching <span style={{color:"#E8E0CC",fontWeight:700}}>{pinModal.name}</span>
              </div>
              <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:12,color:"#9AA5B8",marginTop:4}}>
                {pinModal.iplTeam} · {pinModal.role}
              </div>
            </div>
            <div style={{fontFamily:"'Exo 2',sans-serif",fontSize:10,fontWeight:700,color:"#9AA5B8",letterSpacing:2,marginBottom:8}}>ENTER YOUR TEAM PIN</div>
            <input
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={e=>{setPinInput(e.target.value);setPinErr("");}}
              onKeyDown={e=>e.key==="Enter"&&confirmSnatch(pinModal.id)}
              placeholder="••••"
              autoFocus
              style={{width:"100%",background:"#0C0C0F",border:`1px solid ${pinErr?"#FF3D5A":"#222230"}`,borderRadius:10,padding:"14px 16px",color:"#E8E0CC",fontSize:20,fontFamily:"monospace",outline:"none",marginBottom:8,boxSizing:"border-box",textAlign:"center",letterSpacing:8}}
            />
            {pinErr && <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:12,color:"#FF3D5A",textAlign:"center",marginBottom:8}}>{pinErr}</div>}
            <div style={{display:"flex",gap:10,marginTop:12}}>
              <button onClick={()=>{setPinModal(null);setPinInput("");setPinErr("");}}
                style={{flex:1,background:"transparent",border:"1px solid #222230",borderRadius:10,padding:12,color:"#9AA5B8",fontFamily:"'Exo 2',sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                CANCEL
              </button>
              <button onClick={()=>confirmSnatch(pinModal.id)} disabled={!pinInput.trim()}
                style={{flex:2,background:pinInput.trim()?"linear-gradient(135deg,#A855F7,#7C3AED)":"#A855F733",border:"none",borderRadius:10,padding:12,color:"#fff",fontFamily:"'Exo 2',sans-serif",fontWeight:800,fontSize:14,cursor:pinInput.trim()?"pointer":"not-allowed",letterSpacing:0.5}}>
                ⚡ CONFIRM SNATCH
              </button>
            </div>
          </div>
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
