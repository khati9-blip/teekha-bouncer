import React, { useState, useEffect } from "react";

const SB_URL = "https://rmcxhorijitrhqyrvvkn.supabase.co/rest/v1/league_data";
const SB_KEY = "sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm";
const sbGet = async (key) => { try { const res = await fetch(SB_URL+"?key=eq."+encodeURIComponent(key), {headers:{"apikey":SB_KEY,"Authorization":"Bearer "+SB_KEY}}); const d=await res.json(); return d[0]?.value; } catch { return null; } };
const sbSet = async (key, value) => { try { await fetch(SB_URL, {method:"POST",headers:{"apikey":SB_KEY,"Authorization":"Bearer "+SB_KEY,"Content-Type":"application/json","Prefer":"resolution=merge-duplicates"},body:JSON.stringify({key,value,updated_at:new Date().toISOString()})}); } catch {} };

const TIER_ORDER = { platinum:4, gold:3, silver:2, bronze:1, "":0 };
const TIER_COLORS = { platinum:"#B0BEC5", gold:"#F5A623", silver:"#94A3B8", bronze:"#CD7F32", "":"#4A5E78" };
const TIER_BG = { platinum:"#4A5E7833", gold:"#F5A62322", silver:"#94A3B822", bronze:"#CD7F3222", "":"#1E2D4533" };
const TIER_BORDER = { platinum:"#4A5E7866", gold:"#F5A62366", silver:"#94A3B855", bronze:"#CD7F3255", "":"#1E2D45" };

function TierBadge({ tier }) {
  if (!tier) return null;
  return (
    <span style={{fontSize:9,fontWeight:800,letterSpacing:1,padding:"1px 5px",borderRadius:4,
      fontFamily:"Barlow Condensed,sans-serif",textTransform:"uppercase",
      background:TIER_BG[tier],border:"1px solid "+TIER_BORDER[tier],color:TIER_COLORS[tier]}}>
      {tier==="platinum"?"PLAT":tier==="gold"?"GOLD":tier==="silver"?"SILV":"BRNZ"}
    </span>
  );
}

function Timer({ deadline }) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.floor((new Date(deadline) - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [deadline]);
  const m = Math.floor(left / 60);
  const s = left % 60;
  const urgent = left < 300;
  return (
    <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:28,fontWeight:700,
      color:urgent?"#FF3D5A":"#F5A623",textAlign:"center",letterSpacing:2}}>
      {left === 0 ? "TIME UP" : `${m}:${String(s).padStart(2,"0")}`}
      <div style={{fontSize:10,color:"#4A5E78",letterSpacing:2,marginTop:2}}>
        {left===0?"TIMER EXPIRED":"REMAINING"}
      </div>
    </div>
  );
}

// Check if a player from pool can be traded for any of team's remaining released players
function getValidMatches(poolPlayer, releasedPlayers, alreadyTraded) {
  const remaining = releasedPlayers.filter(p => !alreadyTraded.includes(p.id));
  return remaining.filter(rp =>
    rp.role === poolPlayer.role &&
    TIER_ORDER[poolPlayer.tier||""] <= TIER_ORDER[rp.tier||""]
  );
}

// Check if team can pass (no pool player matches any remaining released player)
function canPass(releasedPlayers, poolPlayers, alreadyTraded) {
  const remaining = releasedPlayers.filter(p => !alreadyTraded.includes(p.id));
  for (const rp of remaining) {
    for (const pp of poolPlayers) {
      if (pp.role === rp.role && TIER_ORDER[pp.tier||""] <= TIER_ORDER[rp.tier||""]) {
        return false; // found a valid match — cannot pass
      }
    }
  }
  return true; // no valid matches — can pass
}

export default function TransferWindow({
  pitch, teams, players, assignments, transfers, unsoldPool,
  leaderboard, isAdmin, myTeam, unlocked, withPassword,
  onUpdateTransfers, onUpdateAssignments, onUpdateUnsoldPool,
  onUpdateOwnershipLog, ownershipLog, points, onUpdatePoints,
  user, safePlayers
}) {
  const [tradeModal, setTradeModal] = useState(null); // {poolPlayer, validReleased}
  const [matchModal, setMatchModal] = useState(null); // {poolPlayer, selectedMatch}
  const [releaseConfirm, setReleaseConfirm] = useState(null);
  const [forceReleaseTeam, setForceReleaseTeam] = useState(null);
  const [forceReleasePid, setForceReleasePid] = useState(null);

  const phase = transfers.phase;
  const myTeamId = myTeam?.id;
  const sortedTeams = leaderboard.map(t => teams.find(x => x.id === t.id)).filter(Boolean);

  // Get released players for a team
  const getReleasedPlayers = (teamId) =>
    (transfers.releases?.[teamId] || []).map(pid => players.find(p => p.id === pid)).filter(Boolean);

  // Get already traded pids for a team
  const getTradedPids = (teamId) =>
    (transfers.tradedPairs || []).filter(t => t.teamId === teamId).map(t => t.releasedPid);

  // Check if player is safe (cannot be released or traded)
  const isPlayerSafe = (teamId, pid) => (safePlayers?.[teamId] || []).includes(pid);

  // Pool players (with player details)
  const poolPlayers = unsoldPool.map(pid => players.find(p => p.id === pid)).filter(Boolean);

  // Sort pool by tier desc
  const sortedPool = [...poolPlayers].sort((a,b) =>
    (TIER_ORDER[b.tier||""] - TIER_ORDER[a.tier||""]) || a.name.localeCompare(b.name)
  );

  // Current pick team
  const currentPickTeamId = transfers.currentPickTeam;
  const isMyTurn = currentPickTeamId === myTeamId;
  const currentPickTeam = teams.find(t => t.id === currentPickTeamId);

  // Handle releasing a player
  const handleRelease = async (teamId, pid) => {
    const current = transfers.releases?.[teamId] || [];
    if (current.includes(pid)) {
      // Un-release
      const updated = { ...transfers, releases: { ...transfers.releases, [teamId]: current.filter(x => x !== pid) } };
      onUpdateTransfers(updated);
    } else {
      if (current.length >= 3) { alert("You can only release 3 players."); return; }
      if (isPlayerSafe(teamId, pid)) { alert("🛡️ Safe players cannot be released!"); return; }
      const updated = { ...transfers, releases: { ...transfers.releases, [teamId]: [...current, pid] } };
      // Add to unsold pool
      if (!unsoldPool.includes(pid)) onUpdateUnsoldPool([...unsoldPool, pid]);
      onUpdateTransfers(updated);
    }
  };

  // Handle picking a player from pool
  const handlePickPlayer = (poolPlayer) => {
    const myReleased = getReleasedPlayers(myTeamId);
    const tradedPids = getTradedPids(myTeamId);
    const validMatches = getValidMatches(poolPlayer, myReleased, tradedPids);
    if (validMatches.length === 0) {
      alert("This player does not match any of your remaining released players (like-for-like + same/lower tier).");
      return;
    }
    setTradeModal({ poolPlayer, validMatches });
  };

  // Confirm trade after selecting which released player to match
  const confirmTrade = async (poolPlayer, releasedPlayer) => {
    const newAssignments = { ...assignments, [poolPlayer.id]: myTeamId };
    delete newAssignments[releasedPlayer.id]; // remove from team

    // Update ownership log
    const now = new Date().toISOString().split("T")[0];
    const newLog = { ...ownershipLog };
    // Close old owner period for released player
    if (!newLog[releasedPlayer.id]) newLog[releasedPlayer.id] = [];
    newLog[releasedPlayer.id] = newLog[releasedPlayer.id].map(o =>
      o.teamId === myTeamId && !o.to ? { ...o, to: now } : o
    );
    // Open new period for incoming player
    if (!newLog[poolPlayer.id]) newLog[poolPlayer.id] = [];
    newLog[poolPlayer.id] = [...newLog[poolPlayer.id], { teamId: myTeamId, from: now, to: null }];

    // Record trade pair
    const tradedPairs = [...(transfers.tradedPairs || []), {
      teamId: myTeamId,
      releasedPid: releasedPlayer.id,
      pickedPid: poolPlayer.id,
      week: transfers.weekNum,
      timestamp: new Date().toISOString(),
    }];

    // Move pool player out of unsold pool
    const newPool = unsoldPool.filter(id => id !== poolPlayer.id);
    // Put released player in pool for others to pick
    if (!newPool.includes(releasedPlayer.id)) newPool.push(releasedPlayer.id);

    // Next team
    const nextTeam = getNextPickTeam(myTeamId, tradedPairs);
    const deadline = new Date(Date.now() + 45 * 60 * 1000).toISOString();
    const allDone = checkAllDone(tradedPairs, newPool);

    const updated = {
      ...transfers,
      tradedPairs,
      currentPickTeam: allDone ? null : nextTeam,
      pickDeadline: allDone ? null : deadline,
      phase: allDone ? "done" : "trade",
    };

    onUpdateAssignments(newAssignments);
    onUpdateUnsoldPool(newPool);
    onUpdateOwnershipLog(newLog);
    onUpdateTransfers(updated);
    setTradeModal(null);
    setMatchModal(null);
  };

  // Handle pass
  const handlePass = async () => {
    const myReleased = getReleasedPlayers(myTeamId);
    const tradedPids = getTradedPids(myTeamId);
    const remaining = myReleased.filter(p => !tradedPids.includes(p.id));

    if (!canPass(remaining, sortedPool, [])) {
      alert("You cannot pass — there are still valid players in the pool matching your criteria.");
      return;
    }

    // Return all remaining released players to team
    const newAssignments = { ...assignments };
    remaining.forEach(p => { newAssignments[p.id] = myTeamId; });

    // Mark them as ineligible this window
    const ineligible = [...(transfers.ineligible || []), ...remaining.map(p => p.id)];

    const tradedPairs = [...(transfers.tradedPairs || [])];
    const nextTeam = getNextPickTeam(myTeamId, tradedPairs);
    const deadline = new Date(Date.now() + 45 * 60 * 1000).toISOString();
    const allDone = checkAllDone(tradedPairs, sortedPool.filter(p => !ineligible.includes(p.id)));

    const updated = {
      ...transfers,
      tradedPairs,
      ineligible,
      currentPickTeam: allDone ? null : nextTeam,
      pickDeadline: allDone ? null : deadline,
      phase: allDone ? "done" : "trade",
    };

    onUpdateAssignments(newAssignments);
    onUpdateTransfers(updated);
  };

  // Get next team in leaderboard order who still has untraded released players
  const getNextPickTeam = (currentTeamId, tradedPairs) => {
    const order = sortedTeams.map(t => t.id);
    const idx = order.indexOf(currentTeamId);
    // Try all teams after current, then wrap
    for (let i = 1; i <= order.length; i++) {
      const tid = order[(idx + i) % order.length];
      const released = getReleasedPlayers(tid);
      const traded = (tradedPairs || []).filter(t => t.teamId === tid).map(t => t.releasedPid);
      const ineligible = transfers.ineligible || [];
      const remaining = released.filter(p => !traded.includes(p.id) && !ineligible.includes(p.id));
      if (remaining.length > 0) return tid;
    }
    return null;
  };

  // Check if all trading is done
  const checkAllDone = (tradedPairs, pool) => {
    for (const team of sortedTeams) {
      const released = getReleasedPlayers(team.id);
      const traded = (tradedPairs || []).filter(t => t.teamId === team.id).map(t => t.releasedPid);
      const ineligible = transfers.ineligible || [];
      const remaining = released.filter(p => !traded.includes(p.id) && !ineligible.includes(p.id));
      if (remaining.length === 0) continue;
      if (canPass(remaining, pool, [])) continue; // they can pass, so not blocking
      // They have remaining and can trade — not done
      for (const rp of remaining) {
        for (const pp of pool) {
          if (pp.role === rp.role && TIER_ORDER[pp.tier||""] <= TIER_ORDER[rp.tier||""]) return false;
        }
      }
    }
    return true;
  };

  const inp = {width:"100%",background:"#080C14",border:"1px solid #1E2D45",borderRadius:8,padding:"8px 12px",color:"#E2EAF4",fontSize:13,fontFamily:"Barlow Condensed,sans-serif",outline:"none",marginBottom:8,boxSizing:"border-box"};

  return (
    <div style={{fontFamily:"Barlow Condensed,sans-serif",paddingBottom:40}}>
      <h2 style={{fontFamily:"Rajdhani,sans-serif",fontSize:28,color:"#F5A623",letterSpacing:2,marginBottom:4}}>TRANSFER WINDOW</h2>
      <div style={{fontSize:12,color:"#4A5E78",marginBottom:20}}>
        Week {transfers.weekNum} • Status: <span style={{color:phase==="closed"?"#FF3D5A":phase==="release"?"#F5A623":phase==="trade"?"#2ECC71":"#4A5E78",fontWeight:700,textTransform:"uppercase"}}>{phase}</span>
        <span style={{marginLeft:8,color:"#4A5E78"}}>• Window: Sunday 11:59 PM → Monday 11:00 AM IST</span>
      </div>

      {/* ADMIN CONTROLS */}
      {unlocked && (
        <div style={{background:"#0E1521",borderRadius:12,border:"1px solid #1E2D45",padding:16,marginBottom:20}}>
          <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,fontWeight:700,marginBottom:12}}>ADMIN CONTROLS</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {phase==="closed" && (
              <button onClick={()=>withPassword(()=>{
                onUpdateTransfers({...transfers,phase:"release",releases:{},tradedPairs:[],ineligible:[]});
              })} style={{background:"#F5A62322",border:"1px solid #F5A62344",borderRadius:8,padding:"8px 16px",color:"#F5A623",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                📤 OPEN RELEASE WINDOW
              </button>
            )}
            {phase==="release" && (
              <>
                <button onClick={()=>withPassword(()=>{
                  // Force all teams who haven't released 3 players — keep what they have
                  const firstTeam = sortedTeams[0]?.id;
                  const deadline = new Date(Date.now() + 45 * 60 * 1000).toISOString();
                  onUpdateTransfers({...transfers, phase:"trade", currentPickTeam:firstTeam, pickDeadline:deadline, tradedPairs:[], ineligible:[]});
                })} style={{background:"#2ECC7122",border:"1px solid #2ECC7133",borderRadius:8,padding:"8px 16px",color:"#2ECC71",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                  🏁 START TRADE PHASE
                </button>
                <button onClick={()=>withPassword(()=>{
                  onUpdateTransfers({...transfers,phase:"closed"});
                })} style={{background:"#FF3D5A22",border:"1px solid #FF3D5A44",borderRadius:8,padding:"8px 16px",color:"#FF3D5A",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                  ✕ CANCEL WINDOW
                </button>
                {/* Force release for non-compliant teams */}
                {sortedTeams.filter(t => (transfers.releases?.[t.id]||[]).length < 3).map(t => (
                  <div key={t.id} style={{background:"#FF3D5A11",border:"1px solid #FF3D5A33",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#FF3D5A"}}>
                    {t.name} released only {(transfers.releases?.[t.id]||[]).length}/3 players
                  </div>
                ))}
              </>
            )}
            {phase==="trade" && (
              <>
                <button onClick={()=>withPassword(()=>{
                  const nextTeam = getNextPickTeam(currentPickTeamId, transfers.tradedPairs);
                  const deadline = new Date(Date.now() + 45 * 60 * 1000).toISOString();
                  onUpdateTransfers({...transfers, currentPickTeam:nextTeam, pickDeadline:deadline});
                })} style={{background:"#4F8EF722",border:"1px solid #4F8EF744",borderRadius:8,padding:"8px 16px",color:"#4F8EF7",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                  ⏭ SKIP CURRENT TEAM
                </button>
                <button onClick={()=>withPassword(()=>{
                  onUpdateTransfers({...transfers,phase:"done"});
                })} style={{background:"#2ECC7122",border:"1px solid #2ECC7133",borderRadius:8,padding:"8px 16px",color:"#2ECC71",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                  ✅ END TRADE PHASE
                </button>
              </>
            )}
            {phase==="done" && (
              <button onClick={()=>withPassword(()=>{
                onUpdateTransfers({weekNum:transfers.weekNum+1,phase:"closed",releases:{},picks:[],tradedPairs:[],ineligible:[],currentPickTeam:null,pickDeadline:null,history:[...(transfers.history||[]),{week:transfers.weekNum,releases:transfers.releases,tradedPairs:transfers.tradedPairs,date:new Date().toISOString()}]});
                onUpdateUnsoldPool([]);
              })} style={{background:"#F5A62322",border:"1px solid #F5A62344",borderRadius:8,padding:"8px 16px",color:"#F5A623",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                🔄 START NEW WEEK
              </button>
            )}
          </div>
        </div>
      )}

      {/* RELEASE PHASE */}
      {phase==="release" && (
        <div style={{marginBottom:20}}>
          <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:18,fontWeight:700,color:"#F5A623",letterSpacing:2,marginBottom:12}}>
            📤 RELEASE PHASE — Select 3 players to release
          </div>
          <div style={{fontSize:12,color:"#4A5E78",marginBottom:16}}>
            Window closes Monday 11:00 AM IST. You can change selections until then.
          </div>

          {sortedTeams.map(team => {
            const isMe = team.id === myTeamId;
            const canEdit = isMe || unlocked;
            if (!canEdit) return null;
            const teamPlayers = players.filter(p => assignments[p.id] === team.id);
            const released = transfers.releases?.[team.id] || [];

            return (
              <div key={team.id} style={{background:"#0E1521",borderRadius:12,border:"1px solid "+team.color+"33",padding:16,marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:16,color:team.color}}>{team.name}</div>
                  <div style={{fontSize:12,color:released.length===3?"#2ECC71":"#F5A623",fontWeight:700}}>
                    {released.length}/3 released
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {teamPlayers.map(p => {
                    const isReleased = released.includes(p.id);
                    return (
                      <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:isReleased?"#FF3D5A11":"#080C14",borderRadius:8,border:"1px solid "+(isReleased?"#FF3D5A44":"#1E2D45")}}>
                        <div style={{flex:1}}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontWeight:700,fontSize:13,color:isReleased?"#FF3D5A":"#E2EAF4"}}>{p.name}</span>
                            <TierBadge tier={p.tier} />
                          </div>
                          <div style={{fontSize:11,color:"#4A5E78"}}>{p.iplTeam} • {p.role}</div>
                        </div>
                        {canEdit && (
                          isPlayerSafe(team.id, p.id) ? (
                            <span style={{fontSize:10,color:"#2ECC71",fontWeight:700}}>🛡️ SAFE</span>
                          ) : (
                          <button onClick={()=>handleRelease(team.id, p.id)}
                            style={{background:isReleased?"#FF3D5A22":"transparent",border:"1px solid "+(isReleased?"#FF3D5A":"#1E2D45"),borderRadius:6,padding:"4px 10px",color:isReleased?"#FF3D5A":"#4A5E78",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif"}}>
                            {isReleased?"UNDO":"RELEASE"}
                          </button>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TRADE PHASE */}
      {(phase==="trade" || phase==="done") && (
        <div>
          {/* Current team timer */}
          {phase==="trade" && currentPickTeam && (
            <div style={{background:"#0E1521",borderRadius:12,border:"1px solid "+currentPickTeam.color+"44",padding:16,marginBottom:16,textAlign:"center"}}>
              <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,marginBottom:4}}>NOW PICKING</div>
              <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:22,fontWeight:700,color:currentPickTeam.color,marginBottom:8}}>
                {currentPickTeam.name}
              </div>
              {transfers.pickDeadline && <Timer deadline={transfers.pickDeadline} />}
            </div>
          )}

          {phase==="done" && (
            <div style={{background:"#2ECC7111",border:"1px solid #2ECC7133",borderRadius:12,padding:16,marginBottom:16,textAlign:"center"}}>
              <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:20,fontWeight:700,color:"#2ECC71"}}>TRADE PHASE COMPLETE ✅</div>
            </div>
          )}

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
            {/* Unsold pool */}
            <div style={{background:"#0E1521",borderRadius:12,border:"1px solid #1E2D45",padding:14}}>
              <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,fontWeight:700,marginBottom:10}}>UNSOLD POOL ({sortedPool.length})</div>
              {sortedPool.length === 0 ? (
                <div style={{fontSize:12,color:"#4A5E78",textAlign:"center",padding:16}}>Pool is empty</div>
              ) : sortedPool.map(p => {
                const myReleased = getReleasedPlayers(myTeamId);
                const tradedPids = getTradedPids(myTeamId);
                const validMatches = isMyTurn ? getValidMatches(p, myReleased, tradedPids) : [];
                const myReleasedIds = (transfers.releases?.[myTeamId] || []);
                const isMyOwnRelease = myReleasedIds.includes(p.id);
                const canPick = isMyTurn && validMatches.length > 0 && phase==="trade" && !isMyOwnRelease;
                return (
                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:canPick?"#2ECC7111":isMyOwnRelease?"#FF3D5A08":"#080C14",borderRadius:8,border:"1px solid "+(canPick?"#2ECC7144":isMyOwnRelease?"#FF3D5A22":"#1E2D4544"),marginBottom:6,opacity:isMyOwnRelease?0.5:1}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                        <span style={{fontWeight:700,fontSize:12,color:"#E2EAF4"}}>{p.name}</span>
                        <TierBadge tier={p.tier} />
                      </div>
                      <div style={{fontSize:10,color:"#4A5E78"}}>{p.iplTeam} • {p.role}</div>
                    </div>
                    {isMyOwnRelease ? (
                      <span style={{fontSize:9,color:"#FF3D5A",fontWeight:700,flexShrink:0}}>YOUR RELEASE</span>
                    ) : canPick ? (
                      <button onClick={()=>handlePickPlayer(p)}
                        style={{background:"#2ECC71",border:"none",borderRadius:6,padding:"4px 10px",color:"#080C14",fontSize:11,fontWeight:800,cursor:"pointer",flexShrink:0,fontFamily:"Barlow Condensed,sans-serif"}}>
                        PICK
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {/* My released players */}
            <div style={{background:"#0E1521",borderRadius:12,border:"1px solid #1E2D45",padding:14}}>
              <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,fontWeight:700,marginBottom:10}}>
                {myTeamId ? "MY RELEASED PLAYERS" : "ALL RELEASES"}
              </div>
              {sortedTeams.map(team => {
                const show = myTeamId ? team.id === myTeamId : true;
                if (!show && !unlocked) return null;
                const released = getReleasedPlayers(team.id);
                const tradedPids = getTradedPids(team.id);
                if (released.length === 0) return null;
                return (
                  <div key={team.id} style={{marginBottom:10}}>
                    {(!myTeamId || unlocked) && <div style={{fontSize:11,color:team.color,fontWeight:700,marginBottom:4}}>{team.name}</div>}
                    {released.map(p => {
                      const traded = tradedPids.includes(p.id);
                      const ineligible = (transfers.ineligible||[]).includes(p.id);
                      return (
                        <div key={p.id} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",background:traded?"#2ECC7111":ineligible?"#4A5E7822":"#080C14",borderRadius:8,border:"1px solid "+(traded?"#2ECC7144":ineligible?"#4A5E7844":"#1E2D44"),marginBottom:4}}>
                          <span style={{fontSize:11,marginRight:2}}>{traded?"✅":ineligible?"↩️":"📤"}</span>
                          <div style={{flex:1}}>
                            <div style={{display:"flex",alignItems:"center",gap:4}}>
                              <span style={{fontWeight:700,fontSize:12,color:traded?"#2ECC71":ineligible?"#4A5E78":"#E2EAF4",textDecoration:traded?"line-through":"none"}}>{p.name}</span>
                              <TierBadge tier={p.tier} />
                            </div>
                            <div style={{fontSize:10,color:"#4A5E78"}}>{p.role}</div>
                          </div>
                          {traded && <span style={{fontSize:10,color:"#2ECC71",fontWeight:700}}>TRADED</span>}
                          {ineligible && !traded && <span style={{fontSize:10,color:"#4A5E78",fontWeight:700}}>RETURNED</span>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* My turn actions */}
          {isMyTurn && phase==="trade" && (
            <div style={{background:"#0E1521",borderRadius:12,border:"1px solid #F5A62344",padding:16,marginBottom:16}}>
              <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:16,fontWeight:700,color:"#F5A623",marginBottom:8}}>YOUR TURN</div>
              <div style={{fontSize:12,color:"#4A5E78",marginBottom:12}}>
                Pick a player from the pool (highlighted in green). Must be like-for-like role and same or lower tier.
              </div>
              {(() => {
                const myReleased = getReleasedPlayers(myTeamId);
                const tradedPids = getTradedPids(myTeamId);
                const passAllowed = canPass(
                  myReleased.filter(p => !tradedPids.includes(p.id)),
                  sortedPool, []
                );
                return passAllowed ? (
                  <button onClick={handlePass}
                    style={{width:"100%",background:"#4A5E7822",border:"1px solid #4A5E78",borderRadius:10,padding:12,color:"#E2EAF4",fontFamily:"Barlow Condensed,sans-serif",fontWeight:800,fontSize:14,cursor:"pointer"}}>
                    PASS — No valid players available (your unreleased players will return)
                  </button>
                ) : (
                  <div style={{fontSize:11,color:"#4A5E78",textAlign:"center",padding:8}}>
                    Valid picks are highlighted in green in the pool above
                  </div>
                );
              })()}
            </div>
          )}

          {/* All teams summary */}
          <div style={{background:"#0E1521",borderRadius:12,border:"1px solid #1E2D45",padding:14}}>
            <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,fontWeight:700,marginBottom:10}}>TRADE SUMMARY</div>
            {sortedTeams.map((team, idx) => {
              const released = getReleasedPlayers(team.id);
              const tradedPids = getTradedPids(team.id);
              const traded = (transfers.tradedPairs||[]).filter(t=>t.teamId===team.id);
              const isCurrent = team.id === currentPickTeamId;
              return (
                <div key={team.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:isCurrent?team.color+"11":"transparent",borderRadius:8,marginBottom:4,border:isCurrent?"1px solid "+team.color+"33":"1px solid transparent"}}>
                  <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:13,color:"#4A5E78",minWidth:16}}>{idx+1}</div>
                  <div style={{flex:1}}>
                    <span style={{fontWeight:700,fontSize:13,color:isCurrent?team.color:"#E2EAF4"}}>{team.name}</span>
                    {isCurrent && <span style={{fontSize:10,color:team.color,marginLeft:6,fontWeight:700}}>← PICKING</span>}
                  </div>
                  <div style={{fontSize:11,color:"#4A5E78"}}>
                    {traded.length}/{released.length} traded
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TRADE MODAL — pick which released player to match */}
      {tradeModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.97)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500,padding:16,fontFamily:"Barlow Condensed,sans-serif"}} onClick={()=>setTradeModal(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#141E2E",borderRadius:16,border:"1px solid #1E2D45",padding:24,width:"100%",maxWidth:420}}>
            <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:20,fontWeight:700,color:"#2ECC71",letterSpacing:2,marginBottom:4}}>CONFIRM TRADE</div>
            <div style={{fontSize:12,color:"#4A5E78",marginBottom:16}}>
              You are picking <strong style={{color:"#E2EAF4"}}>{tradeModal.poolPlayer.name}</strong> ({tradeModal.poolPlayer.role} / {tradeModal.poolPlayer.tier||"No tier"}).
              Select which of your released players is being traded for this player:
            </div>
            {tradeModal.validMatches.map(rp => (
              <button key={rp.id} onClick={()=>setMatchModal({poolPlayer:tradeModal.poolPlayer,releasedPlayer:rp})}
                style={{width:"100%",background:"#FF3D5A11",border:"1px solid #FF3D5A44",borderRadius:10,padding:12,marginBottom:8,cursor:"pointer",display:"flex",alignItems:"center",gap:10,textAlign:"left"}}>
                <span style={{fontSize:16}}>📤</span>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontWeight:700,fontSize:14,color:"#FF3D5A"}}>{rp.name}</span>
                    <TierBadge tier={rp.tier} />
                  </div>
                  <div style={{fontSize:11,color:"#4A5E78"}}>{rp.role} — will leave your squad</div>
                </div>
              </button>
            ))}
            <button onClick={()=>setTradeModal(null)}
              style={{width:"100%",background:"transparent",border:"1px solid #1E2D45",borderRadius:10,padding:10,color:"#4A5E78",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer",marginTop:4}}>
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* CONFIRM MATCH MODAL */}
      {matchModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.97)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:600,padding:16,fontFamily:"Barlow Condensed,sans-serif"}} onClick={()=>setMatchModal(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#141E2E",borderRadius:16,border:"1px solid #1E2D45",padding:24,width:"100%",maxWidth:400}}>
            <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:20,fontWeight:700,color:"#F5A623",letterSpacing:2,marginBottom:16}}>FINAL CONFIRMATION</div>
            <div style={{background:"#2ECC7111",border:"1px solid #2ECC7133",borderRadius:10,padding:12,marginBottom:10,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:16}}>⬆️</span>
              <div>
                <div style={{fontSize:11,color:"#4A5E78",marginBottom:2}}>INCOMING</div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontWeight:700,color:"#2ECC71"}}>{matchModal.poolPlayer.name}</span>
                  <TierBadge tier={matchModal.poolPlayer.tier} />
                </div>
                <div style={{fontSize:11,color:"#4A5E78"}}>{matchModal.poolPlayer.role} — points reset, counts from next match</div>
              </div>
            </div>
            <div style={{background:"#FF3D5A11",border:"1px solid #FF3D5A33",borderRadius:10,padding:12,marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:16}}>⬇️</span>
              <div>
                <div style={{fontSize:11,color:"#4A5E78",marginBottom:2}}>LEAVING</div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontWeight:700,color:"#FF3D5A"}}>{matchModal.releasedPlayer.name}</span>
                  <TierBadge tier={matchModal.releasedPlayer.tier} />
                </div>
                <div style={{fontSize:11,color:"#4A5E78"}}>{matchModal.releasedPlayer.role} — points frozen at current total</div>
              </div>
            </div>
            <div style={{fontSize:12,color:"#FF3D5A",marginBottom:16,textAlign:"center",fontWeight:700}}>
              This trade is permanent and cannot be undone this window.
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setMatchModal(null)}
                style={{flex:1,background:"transparent",border:"1px solid #1E2D45",borderRadius:8,padding:10,color:"#4A5E78",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
              <button onClick={()=>confirmTrade(matchModal.poolPlayer, matchModal.releasedPlayer)}
                style={{flex:2,background:"#F5A623",border:"none",borderRadius:8,padding:10,color:"#080C14",fontFamily:"Barlow Condensed,sans-serif",fontWeight:800,fontSize:15,cursor:"pointer"}}>CONFIRM TRADE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
