import React, { useState } from "react";
import { T, fonts } from "./Theme";
import { calcBreakdown } from "./utils.js";

export default function ResultsPage({
  matches, points, teams, players,
  captains, assignments, ownershipLog,
  snatch, ruledOut, nav,
}) {
  const [expandedMatch, setExpandedMatch] = useState(null);
  const [filterTeam, setFilterTeam] = useState(null); // null = all teams
  const [viewMode, setViewMode] = useState("match"); // "match" or "player"
  const [playerSearch, setPlayerSearch] = useState(""); // player search query
  const [matchDetailModal, setMatchDetailModal] = useState(null); // {player, match, teamId, points, base, mult}

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{background:"linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",padding:"16px 24px",marginBottom:24,clipPath:"polygon(0% 0%,100% 0%,calc(100% - 12px) 100%,0% 100%)",boxShadow:"4px 4px 0 rgba(217,119,6,0.3)"}}>
        <h2 style={{fontFamily:fonts.display,fontSize:32,fontWeight:900,color:"#0A0E14",letterSpacing:4,margin:0,textTransform:"uppercase",textShadow:"2px 2px 0 rgba(255,255,255,0.2)"}}>
          🏆 MATCH RESULTS
        </h2>
        <div style={{fontSize:11,color:"rgba(10,14,20,0.7)",marginTop:4,fontFamily:fonts.body,letterSpacing:1}}>
          Team performances & player breakdowns
        </div>
      </div>

      {/* Filter Controls */}
      <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap",alignItems:"center"}}>
        {/* Team Filter */}
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:12,color:T.muted,fontFamily:fonts.body,fontWeight:700,letterSpacing:1}}>TEAM:</span>
          <select 
            value={filterTeam || "all"} 
            onChange={(e) => setFilterTeam(e.target.value === "all" ? null : e.target.value)}
            style={{background:T.card,border:`2px solid ${T.border}`,borderRadius:0,padding:"8px 12px",color:T.text,fontFamily:fonts.display,fontSize:14,fontWeight:700,cursor:"pointer",clipPath:"polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)"}}
          >
            <option value="all">ALL TEAMS</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* View Mode Toggle */}
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:12,color:T.muted,fontFamily:fonts.body,fontWeight:700,letterSpacing:1}}>VIEW:</span>
          <div style={{display:"flex",gap:4}}>
            <button
              onClick={() => setViewMode("match")}
              style={{background:viewMode==="match"?"linear-gradient(135deg, #F59E0B 0%, #D97706 100%)":T.card,border:`2px solid ${viewMode==="match"?"#F59E0B":T.border}`,borderRadius:0,padding:"8px 16px",color:viewMode==="match"?"#0A0E14":T.text,fontFamily:fonts.display,fontSize:12,fontWeight:800,cursor:"pointer",letterSpacing:1,clipPath:"polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)"}}
            >
              📊 MATCH-WISE
            </button>
            <button
              onClick={() => setViewMode("player")}
              style={{background:viewMode==="player"?"linear-gradient(135deg, #F59E0B 0%, #D97706 100%)":T.card,border:`2px solid ${viewMode==="player"?"#F59E0B":T.border}`,borderRadius:0,padding:"8px 16px",color:viewMode==="player"?"#0A0E14":T.text,fontFamily:fonts.display,fontSize:12,fontWeight:800,cursor:"pointer",letterSpacing:1,clipPath:"polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)"}}
            >
              👤 PLAYER-WISE
            </button>
          </div>
        </div>

        {/* Player Search (only show in player-wise view) */}
        {viewMode === "player" && (
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:12,color:T.muted,fontFamily:fonts.body,fontWeight:700,letterSpacing:1}}>SEARCH:</span>
            <input
              type="text"
              placeholder="Search player..."
              value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
              style={{background:T.card,border:`2px solid ${T.border}`,borderRadius:0,padding:"8px 12px",color:T.text,fontFamily:fonts.body,fontSize:14,minWidth:200,outline:"none",clipPath:"polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)"}}
            />
            {playerSearch && (
              <button
                onClick={() => setPlayerSearch("")}
                style={{background:T.border,border:"none",borderRadius:0,padding:"8px 12px",color:T.muted,fontFamily:fonts.display,fontSize:12,fontWeight:700,cursor:"pointer",clipPath:"polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)"}}
              >
                ✕ CLEAR
              </button>
            )}
          </div>
        )}

        {/* Running Total (only show when team is filtered) */}
        {filterTeam && viewMode === "match" && (() => {
          const team = teams.find(t => t.id === filterTeam);
          const completedMatches = matches.filter(m=>m.status==="completed"&&Object.keys(points).some(pid=>points[pid][m.id])).sort((a,b)=>{
            if(a.date !== b.date) return (a.date||"").localeCompare(b.date||"");
            return (a.matchNum||0) - (b.matchNum||0);
          });
          
          let runningTotal = 0;
          completedMatches.forEach(match => {
            const matchDateStr = match.date || "9999-12-31";
            const teamPts = players
              .filter(p => {
                if (!points[p.id]?.[match.id]) return false;
                const periods = (ownershipLog[p.id]||[]).filter(o=>o.teamId===filterTeam);
                if (periods.length > 0) {
                  return periods.some(o => {
                    const fromDate = o.from ? o.from.split('T')[0] : '0000-01-01';
                    const toDate = o.to ? o.to.split('T')[0] : '2099-12-31';
                    return matchDateStr >= fromDate && matchDateStr < toDate;
                  });
                }
                return assignments[p.id] === filterTeam;
              })
              .reduce((sum, p) => {
                const d = points[p.id][match.id];
                const cap = captains[`${match.id}_${filterTeam}`]||{};
                let pts = d.base;
                if(cap.captain===p.id) pts*=2;
                else if(cap.vc===p.id) pts*=1.5;
                return sum + Math.round(pts);
              }, 0);
            runningTotal += teamPts;
          });

          return (
            <div style={{marginLeft:"auto",background:"linear-gradient(135deg, #2ECC71 0%, #27AE60 100%)",border:"2px solid #2ECC71",padding:"10px 20px",clipPath:"polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)",boxShadow:"4px 4px 0 rgba(46,204,113,0.3)"}}>
              <div style={{fontSize:10,color:"rgba(10,14,20,0.7)",fontFamily:fonts.body,fontWeight:700,letterSpacing:2}}>TOTAL FOR {team?.name.toUpperCase()}</div>
              <div style={{fontSize:28,fontWeight:900,color:"#0A0E14",fontFamily:fonts.display,letterSpacing:1}}>{runningTotal}</div>
            </div>
          );
        })()}
      </div>

      {matches.filter(m=>m.status==="completed"&&Object.keys(points).some(pid=>points[pid][m.id])).length===0 ? (
        <div style={{textAlign:"center",padding:80,color:T.muted,background:T.card,border:`2px solid ${T.border}`,borderRadius:0}}>
          <div style={{fontSize:64}}>📊</div>
          <div style={{marginTop:20,fontSize:16,fontFamily:fonts.display,fontWeight:700,letterSpacing:1}}>NO MATCH RESULTS YET</div>
          <div style={{marginTop:8,fontSize:13,color:T.muted}}>Sync stats from the Matches tab first</div>
        </div>
      ) : viewMode === "player" ? (
        // PLAYER-WISE VIEW
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {(() => {
            const completedMatches = matches.filter(m=>m.status==="completed"&&Object.keys(points).some(pid=>points[pid][m.id]));
            const teamToShow = filterTeam ? teams.find(t => t.id === filterTeam) : null;
            const teamsToShow = filterTeam ? [teamToShow] : teams;

            // Group all points by player across all matches
            const playerStats = {};
            
            teamsToShow.forEach(team => {
              players.forEach(p => {
                let totalPts = 0;
                let matchCount = 0;
                const matchDetails = [];

                completedMatches.forEach(match => {
                  const matchDateStr = match.date || "9999-12-31";
                  const d = points[p.id]?.[match.id];
                  if (!d) return;

                  // Check ownership
                  const periods = (ownershipLog[p.id]||[]).filter(o=>o.teamId===team.id);
                  const owned = periods.length === 0
                    ? assignments[p.id] === team.id
                    : periods.some(o => {
                        const fromDate = o.from ? o.from.split('T')[0] : '0000-01-01';
                        const toDate = o.to ? o.to.split('T')[0] : '2099-12-31';
                        return matchDateStr >= fromDate && matchDateStr < toDate;
                      });
                  
                  if (!owned) return;

                  const cap = captains[`${match.id}_${team.id}`]||{};
                  let pts = d.base;
                  let mult = 1;
                  if(cap.captain===p.id) { pts*=2; mult=2; }
                  else if(cap.vc===p.id) { pts*=1.5; mult=1.5; }
                  
                  totalPts += Math.round(pts);
                  matchCount++;
                  matchDetails.push({
                    matchId: match.id,
                    matchNum: match.matchNum,
                    date: match.date,
                    base: d.base,
                    points: Math.round(pts),
                    mult
                  });
                });

                if (matchCount > 0) {
                  const key = `${team.id}_${p.id}`;
                  playerStats[key] = {
                    player: p,
                    team,
                    totalPts,
                    matchCount,
                    matchDetails,
                    avgPts: Math.round(totalPts / matchCount)
                  };
                }
              });
            });

            const sortedPlayers = Object.values(playerStats).sort((a, b) => b.totalPts - a.totalPts);

            // Filter by search query
            const filteredPlayers = playerSearch
              ? sortedPlayers.filter(stat => 
                  stat.player.name.toLowerCase().includes(playerSearch.toLowerCase())
                )
              : sortedPlayers;

            // Show no results message if search returned nothing
            if (filteredPlayers.length === 0) {
              return (
                <div style={{textAlign:"center",padding:40,color:T.muted,fontFamily:fonts.body}}>
                  No players found matching "{playerSearch}"
                </div>
              );
            }

            return filteredPlayers.map((stat, idx) => (
              <div key={`${stat.team.id}_${stat.player.id}`} style={{background:T.card,border:`2px solid ${T.border}`,borderLeft:`5px solid ${stat.team.color}`,borderRadius:0,padding:"16px 20px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:fonts.display,fontWeight:900,fontSize:20,color:stat.team.color,letterSpacing:1,textTransform:"uppercase"}}>{stat.player.name}</div>
                    <div style={{fontSize:12,color:T.muted,marginTop:4}}>
                      {stat.team.name} • {stat.matchCount} matches • Avg: {stat.avgPts} pts/match
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:36,fontWeight:900,color:T.accent,fontFamily:fonts.display,letterSpacing:1}}>{stat.totalPts}</div>
                    <div style={{fontSize:10,color:T.muted,letterSpacing:1}}>TOTAL PTS</div>
                  </div>
                </div>
                
                {/* Match details */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(120px, 1fr))",gap:8,marginTop:12}}>
                  {stat.matchDetails.map(md => {
                    const match = matches.find(m => m.id === md.matchId);
                    return (
                      <div 
                        key={md.matchId} 
                        onClick={() => {
  // Extract player stats from points data
  const playerMatchData = points[stat.player.id]?.[md.matchId];
  
  setMatchDetailModal({
    player: stat.player,
    match: match,
    teamId: stat.team.id,
    points: md.points,
    base: md.base,
    mult: md.mult,
    matchData: playerMatchData ? {
      bat: playerMatchData.bat || null,
      bowl: playerMatchData.bowl || null,
      ct: playerMatchData.ct || 0,
      ro: playerMatchData.ro || 0,
      st: playerMatchData.st || 0
    } : {}
  });
}}
                        style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:0,padding:"8px",textAlign:"center",cursor:"pointer",transition:"all 0.2s",position:"relative"}}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = T.accent + "22";
                          e.currentTarget.style.borderColor = T.accent;
                          e.currentTarget.style.transform = "translateY(-2px)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = T.bg;
                          e.currentTarget.style.borderColor = T.border;
                          e.currentTarget.style.transform = "translateY(0)";
                        }}
                      >
                        <div style={{fontSize:10,color:T.muted,marginBottom:4}}>M{md.matchNum}</div>
                        <div style={{fontSize:18,fontWeight:900,color:md.points>50?T.success:T.text,fontFamily:fonts.display}}>{md.points}</div>
                        {md.mult > 1 && <div style={{fontSize:9,color:T.accent,marginTop:2}}>{md.mult===2?"⭐C":"🥈VC"}</div>}
                        <div style={{fontSize:8,color:T.muted,marginTop:4}}>📊 CLICK</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ));
          })()}
        </div>
      ) : (
        // MATCH-WISE VIEW (existing code)
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {(() => {
            let completedMatches = [...matches.filter(m=>m.status==="completed"&&Object.keys(points).some(pid=>points[pid][m.id]))];
            
            // Filter by team if selected
            if (filterTeam) {
              completedMatches = completedMatches.filter(match => {
                const matchDateStr = match.date || "9999-12-31";
                return players.some(p => {
                  if (!points[p.id]?.[match.id]) return false;
                  const periods = (ownershipLog[p.id]||[]).filter(o=>o.teamId===filterTeam);
                  if (periods.length > 0) {
                    return periods.some(o => {
                      const fromDate = o.from ? o.from.split('T')[0] : '0000-01-01';
                      const toDate = o.to ? o.to.split('T')[0] : '2099-12-31';
                      return matchDateStr >= fromDate && matchDateStr < toDate;
                    });
                  }
                  return assignments[p.id] === filterTeam;
                });
              });
            }
            
            completedMatches = completedMatches.sort((a,b)=>{
  if(a.date !== b.date) return (b.date||"9999").localeCompare(a.date||"9999");
  return (b.matchNum||0) - (a.matchNum||0);
});
return completedMatches.map((match,idx)=>{
const open = expandedMatch===match.id;
const displayNum = match.matchNum || (completedMatches.length - idx);

            const matchDateStr = match.date || "9999-12-31";
            const teamsToShow = filterTeam ? teams.filter(t => t.id === filterTeam) : teams;
            const teamBreakdowns = teamsToShow.map(team=>{
              const teamPts = players
                .filter(p => {
                  if (!points[p.id]?.[match.id]) return false;
                  const periods = (ownershipLog[p.id]||[]).filter(o=>o.teamId===team.id);
                  if (periods.length > 0) {
                    return periods.some(o => {
                      const fromDate = o.from ? o.from.split('T')[0] : '0000-01-01';
                      const toDate = o.to ? o.to.split('T')[0] : '2099-12-31';
                      return matchDateStr >= fromDate && matchDateStr < toDate;
                    });
                  }
                  const histSnatchedIn = (snatch.history||[]).find(h=>h.pid===p.id && h.byTeamId===team.id);
                  if (histSnatchedIn) {
                    const snatchStart = histSnatchedIn.startDate.split('T')[0];
                    const snatchEnd = histSnatchedIn.returnDate ? histSnatchedIn.returnDate.split('T')[0] : '2099-01-01';
                    return matchDateStr >= snatchStart && matchDateStr < snatchEnd;
                  }
                  if (snatch.active?.pid===p.id && snatch.active?.fromTeamId===team.id) {
                    return matchDateStr < snatch.active.startDate.split('T')[0];
                  }
                  const histAway = (snatch.history||[]).find(h=>h.pid===p.id && h.fromTeamId===team.id);
                  if (histAway) {
                    const snatchStart = histAway.startDate.split('T')[0];
                    const snatchEnd = histAway.returnDate ? histAway.returnDate.split('T')[0] : '2099-01-01';
                    return matchDateStr < snatchStart || matchDateStr >= snatchEnd;
                  }
                  return assignments[p.id] === team.id;
                })
                .map(p=>{
                  const d = points[p.id][match.id];
                  const cap = captains[`${match.id}_${team.id}`]||{};
                  let pts = d.base;
                  let mult = 1;
                  if(cap.captain===p.id){pts*=2;mult=2;}
                  else if(cap.vc===p.id){pts*=1.5;mult=1.5;}
                  const isSnatchedAway = snatch.active?.pid===p.id && snatch.active?.fromTeamId===team.id;
                  const wasSnatchedAway = (snatch.history||[]).some(h=>h.pid===p.id && h.fromTeamId===team.id);
                  const tradedOut = assignments[p.id] !== team.id && !isSnatchedAway && !wasSnatchedAway;
                  const snatchedOut = isSnatchedAway;
                  const snatchReturned = wasSnatchedAway && assignments[p.id]===team.id;
                  return {...p, base:d.base, pts:Math.round(pts), mult, stats:d.stats, breakdown:calcBreakdown(d.stats), tradedOut, snatchedOut, snatchReturned};
                }).sort((a,b)=>b.pts-a.pts);
              const total = teamPts.reduce((s,p)=>s+p.pts,0);
              return {team, players:teamPts, total};
            }).sort((a,b)=>b.total-a.total);

            const winner = teamBreakdowns[0];
            const isTie = teamBreakdowns.length > 1 && teamBreakdowns[0].total === teamBreakdowns[1].total;

            return (
              <div key={match.id} style={{
                background:T.bg,
                border:`2px solid ${open?"#F59E0B":T.border}`,
                borderLeft:`5px solid ${open?"#F59E0B":T.border}`,
                borderRadius:0,
                overflow:"hidden",
                boxShadow:open?"4px 4px 0 rgba(245,158,11,0.2)":"none",
                transition:"all .2s"
              }}>
                {/* Match header - clickable */}
                <div style={{
                  display:"flex",
                  alignItems:"center",
                  padding:"16px 20px",
                  cursor:"pointer",
                  gap:16,
                  background:open?"#F59E0B11":"transparent",
                  borderBottom:open?`2px solid #F59E0B33`:"none"
                }} onClick={()=>setExpandedMatch(open?null:match.id)}>
                  {/* Match number badge */}
                  <div style={{
                    background:"linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
                    padding:"8px 14px",
                    borderRadius:0,
                    clipPath:"polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)",
                    boxShadow:"2px 2px 0 rgba(217,119,6,0.4)",
                    minWidth:60,
                    textAlign:"center"
                  }}>
                    <div style={{fontSize:10,color:"rgba(10,14,20,0.7)",fontFamily:fonts.display,letterSpacing:1.5,fontWeight:700}}>MATCH</div>
                    <div style={{fontSize:22,fontWeight:900,color:"#0A0E14",fontFamily:fonts.display,letterSpacing:1}}>{displayNum}</div>
                  </div>

                  {/* Match info */}
                  <div style={{flex:1}}>
                    <div style={{fontFamily:fonts.display,fontWeight:800,fontSize:17,color:T.text,letterSpacing:1}}>
                      {match.team1} <span style={{color:T.muted,fontWeight:400}}>vs</span> {match.team2}
                    </div>
                    <div style={{fontSize:11,color:T.muted,marginTop:4,fontFamily:fonts.body}}>
                      {match.date} • {match.result||match.venue}
                    </div>
                  </div>

                  {/* Show filtered team's total for this match */}
                  {filterTeam && (() => {
                    const filteredTeamBreakdown = teamBreakdowns.find(tb => tb.team.id === filterTeam);
                    if (!filteredTeamBreakdown) return null;
                    return (
                      <div style={{background:filteredTeamBreakdown.team.color+"22",border:`2px solid ${filteredTeamBreakdown.team.color}`,borderRadius:0,padding:"10px 16px",marginRight:12,clipPath:"polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)"}}>
                        <div style={{fontSize:9,color:filteredTeamBreakdown.team.color,fontFamily:fonts.display,letterSpacing:1.5,fontWeight:700}}>{filteredTeamBreakdown.team.name}</div>
                        <div style={{fontSize:22,fontWeight:900,color:filteredTeamBreakdown.team.color,fontFamily:fonts.display,marginTop:2}}>{filteredTeamBreakdown.total}</div>
                      </div>
                    );
                  })()}

                  {/* Winner indicator */}
                  {!isTie && winner && (
                    <div style={{
                      background:winner.team.color+"22",
                      border:`2px solid ${winner.team.color}`,
                      padding:"8px 16px",
                      borderRadius:0,
                      clipPath:"polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)"
                    }}>
                      <div style={{fontSize:9,color:winner.team.color,fontFamily:fonts.display,letterSpacing:1.5,fontWeight:700}}>WINNER</div>
                      <div style={{fontSize:14,fontWeight:900,color:winner.team.color,fontFamily:fonts.display,marginTop:2}}>{winner.team.name}</div>
                    </div>
                  )}

                  {/* Expand icon */}
                  <span style={{color:open?"#F59E0B":T.muted,fontSize:14,fontWeight:900}}>{open?"▲":"▼"}</span>
                </div>

                {/* Expanded breakdown */}
                {open && (
                  <div style={{padding:"20px",display:"flex",flexDirection:"column",gap:14,background:T.card}}>
                    {teamBreakdowns.map((tb,rank)=>{
                      const isWinner = rank === 0 && !isTie;
                      return (
                        <div key={tb.team.id} style={{
                          background:T.bg,
                          border:`3px solid ${isWinner?"#F59E0B":tb.team.color+"44"}`,
                          borderLeft:`6px solid ${isWinner?"#F59E0B":tb.team.color}`,
                          borderRadius:0,
                          overflow:"hidden",
                          boxShadow:isWinner?"4px 4px 0 rgba(245,158,11,0.3)":"2px 2px 0 "+tb.team.color+"22"
                        }}>
                          {/* Team header */}
                          <div style={{
                            padding:"14px 20px",
                            borderBottom:`2px solid ${isWinner?"#F59E0B44":tb.team.color+"33"}`,
                            display:"flex",
                            alignItems:"center",
                            justifyContent:"space-between",
                            background:isWinner?"linear-gradient(135deg, #F59E0B22 0%, #D9770622 100%)":tb.team.color+"11"
                          }}>
                            <div style={{display:"flex",alignItems:"center",gap:12}}>
                              <span style={{fontSize:24,fontWeight:900,fontFamily:fonts.display,color:isWinner?"#F59E0B":tb.team.color}}>
                                {isWinner?"🥇":"#"+(rank+1)}
                              </span>
                              <span style={{fontFamily:fonts.display,fontWeight:900,fontSize:18,color:isWinner?"#F59E0B":tb.team.color,letterSpacing:2,textTransform:"uppercase"}}>
                                {tb.team.name}
                              </span>
                            </div>
                            <div style={{fontFamily:fonts.display,fontWeight:900,fontSize:28,color:isWinner?"#F59E0B":T.accent,letterSpacing:1}}>
                              {tb.total}
                            </div>
                          </div>

                          {/* Players */}
                          {tb.players.length===0 ? (
                            <div style={{padding:"16px 20px",color:T.muted,fontSize:13,textAlign:"center"}}>No players scored in this match</div>
                          ) : (
                            <div>
                              {tb.players.map((p,pidx)=>(
                                <div key={p.id} style={{
                                  padding:"12px 20px",
                                  borderBottom:pidx<tb.players.length-1?`1px solid ${T.border}44`:"none",
                                  display:"flex",
                                  alignItems:"center",
                                  gap:14,
                                  opacity:p.tradedOut||p.snatchedOut?0.5:1,
                                  background:p.pts>50?isWinner?"#F59E0B0A":"#2ECC710A":"transparent"
                                }}>
                                  <div style={{flex:1,minWidth:0}}>
                                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
                                      <span style={{
                                        fontFamily:fonts.display,
                                        fontWeight:800,
                                        fontSize:15,
                                        color:p.tradedOut?T.muted:p.snatchedOut?"#9F7AEA":p.snatchReturned?"#9F7AEA":ruledOut.includes(p.id)?T.danger:T.text,
                                        letterSpacing:0.5,
                                        textDecoration:p.tradedOut||p.snatchedOut?"line-through":"none"
                                      }}>
                                        {p.name}
                                      </span>
                                      {p.tradedOut && <span style={{fontSize:9,color:T.danger,background:T.dangerBg,border:`1px solid ${T.danger}44`,borderRadius:0,padding:"2px 6px",fontWeight:800,letterSpacing:1,fontFamily:fonts.display}}>TRADED</span>}
                                      {p.snatchedOut && <span style={{fontSize:9,color:"#9F7AEA",background:"#9F7AEA22",border:"1px solid #9F7AEA44",borderRadius:0,padding:"2px 6px",fontWeight:800,letterSpacing:1,fontFamily:fonts.display}}>⚡ SNATCHED</span>}
                                      {p.snatchReturned && <span style={{fontSize:9,color:"#9F7AEA",background:"#9F7AEA22",border:"1px solid #9F7AEA44",borderRadius:0,padding:"2px 6px",fontWeight:800,letterSpacing:1,fontFamily:fonts.display}}>↩️ BACK</span>}
                                      {ruledOut.includes(p.id) && <span style={{fontSize:9,color:T.danger,background:T.dangerBg,border:`1px solid ${T.danger}44`,borderRadius:0,padding:"2px 6px",fontWeight:800,letterSpacing:1,fontFamily:fonts.display}}>🚫 OUT</span>}
                                      {p.mult>1 && (
                                        <span style={{
                                          background:p.mult===2?"#F59E0B33":"#94A3B833",
                                          color:p.mult===2?"#F59E0B":"#94A3B8",
                                          border:`2px solid ${p.mult===2?"#F59E0B":"#94A3B8"}`,
                                          fontSize:10,padding:"2px 8px",borderRadius:0,
                                          fontWeight:900,letterSpacing:1,fontFamily:fonts.display,
                                          clipPath:"polygon(3px 0%, 100% 0%, calc(100% - 3px) 100%, 0% 100%)"
                                        }}>
                                          {p.mult===2?"⭐ CAPTAIN 2×":"🥈 VC 1.5×"}
                                        </span>
                                      )}
                                    </div>
                                    <div style={{fontSize:11,color:T.muted,fontFamily:fonts.body}}>
                                      {p.breakdown.join(" • ")||"No contributions"}
                                    </div>
                                  </div>
                                  <div style={{textAlign:"right",flexShrink:0}}>
                                    <div style={{fontFamily:fonts.display,fontWeight:900,fontSize:24,color:p.pts>50?"#F59E0B":p.pts>0?"#2ECC71":"#4A5E78",letterSpacing:1}}>
                                      {p.pts}
                                    </div>
                                    {p.mult>1&&<div style={{fontSize:10,color:T.muted,fontFamily:fonts.body}}>base: {p.base}</div>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })})()}
        </div>
      )}

      {/* Match Detail Modal - Cricket Card Style */}
      {matchDetailModal && (
        <div 
          onClick={() => setMatchDetailModal(null)}
          style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.9)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:20}}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{background:"linear-gradient(135deg, #1a1f2e 0%, #0f1419 100%)",border:`3px solid ${T.accent}`,borderRadius:0,maxWidth:600,width:"100%",clipPath:"polygon(16px 0%, 100% 0%, calc(100% - 16px) 100%, 0% 100%)",boxShadow:"12px 12px 0 rgba(245,158,11,0.4)",overflow:"hidden"}}
          >
            {/* Header - Match Info */}
            <div style={{background:"linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",padding:"16px 24px",position:"relative"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontFamily:fonts.display,fontSize:20,fontWeight:900,color:"#0A0E14",letterSpacing:1}}>
                    MATCH {matchDetailModal.match.matchNum}
                  </div>
                  <div style={{fontSize:11,color:"rgba(10,14,20,0.7)",fontFamily:fonts.body,marginTop:2}}>
                    {matchDetailModal.match.date} • {matchDetailModal.match.venue || `${matchDetailModal.match.team1} vs ${matchDetailModal.match.team2}`}
                  </div>
                </div>
                <button
                  onClick={() => setMatchDetailModal(null)}
                  style={{background:"rgba(10,14,20,0.3)",border:"none",width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",clipPath:"polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)",fontSize:20,color:"#0A0E14",fontWeight:900}}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Player Card Header */}
            <div style={{background:"linear-gradient(135deg, #2a3142 0%, #1f2533 100%)",padding:"24px",borderBottom:`2px solid ${T.border}`}}>
              <div style={{display:"flex",gap:20,alignItems:"center"}}>
                {/* Player Image */}
                <div style={{width:100,height:100,background:`linear-gradient(135deg, ${teams.find(t=>t.id===matchDetailModal.teamId)?.color}22 0%, ${teams.find(t=>t.id===matchDetailModal.teamId)?.color}44 100%)`,border:`3px solid ${teams.find(t=>t.id===matchDetailModal.teamId)?.color}`,borderRadius:0,clipPath:"polygon(12px 0%, 100% 0%, calc(100% - 12px) 100%, 0% 100%)",overflow:"hidden",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {matchDetailModal.player.image ? (
                    <img src={matchDetailModal.player.image} alt={matchDetailModal.player.name} style={{width:"100%",height:"100%",objectFit:"cover"}} />
                  ) : (
                    <div style={{fontSize:40,fontWeight:900,color:teams.find(t=>t.id===matchDetailModal.teamId)?.color,fontFamily:fonts.display}}>
                      {matchDetailModal.player.name.charAt(0)}
                    </div>
                  )}
                </div>

                {/* Player Info */}
                <div style={{flex:1}}>
                  <div style={{fontFamily:fonts.display,fontSize:24,fontWeight:900,color:T.text,letterSpacing:1,marginBottom:4}}>
                    {matchDetailModal.player.name}
                  </div>
                  <div style={{fontSize:13,color:teams.find(t=>t.id===matchDetailModal.teamId)?.color,fontFamily:fonts.body,fontWeight:700,marginBottom:8}}>
                    {teams.find(t => t.id === matchDetailModal.teamId)?.name}
                  </div>
                  <div style={{display:"inline-block",background:matchDetailModal.mult>1?"linear-gradient(135deg, #F59E0B 0%, #D97706 100%)":T.border,padding:"4px 12px",clipPath:"polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)",fontSize:11,fontWeight:800,color:matchDetailModal.mult>1?"#0A0E14":T.muted,letterSpacing:1}}>
                    {matchDetailModal.mult === 2 ? "⭐ CAPTAIN" : matchDetailModal.mult === 1.5 ? "🥈 VICE-CAPTAIN" : "PLAYER"}
                  </div>
                </div>

                {/* Points Badge */}
                <div style={{textAlign:"center",background:"linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",padding:"16px 24px",clipPath:"polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)",boxShadow:"6px 6px 0 rgba(245,158,11,0.3)"}}>
                  <div style={{fontSize:42,fontWeight:900,color:"#0A0E14",fontFamily:fonts.display,letterSpacing:1,lineHeight:1}}>
                    {matchDetailModal.points}
                  </div>
                  <div style={{fontSize:9,color:"rgba(10,14,20,0.7)",letterSpacing:1.5,marginTop:4,fontWeight:700}}>POINTS</div>
                </div>
              </div>
            </div>

            {/* Stats Section */}
            <div style={{padding:24}}>
              {/* Batting Stats */}
              {matchDetailModal.matchData.bat && (
                <div style={{marginBottom:20}}>
                  <div style={{fontSize:11,color:T.accent,fontWeight:800,letterSpacing:2,marginBottom:12,fontFamily:fonts.display}}>
                    🏏 BATTING PERFORMANCE
                  </div>
                  <div style={{background:T.card,border:`2px solid ${T.border}`,padding:16,borderRadius:0}}>
                    <div style={{display:"flex",gap:12,marginBottom:16}}>
                      {/* Runs */}
                      <div style={{flex:1,background:T.bg,padding:12,textAlign:"center",borderLeft:`3px solid ${T.accent}`}}>
                        <div style={{fontSize:28,fontWeight:900,color:T.accent,fontFamily:fonts.display}}>{matchDetailModal.matchData.bat.r || 0}</div>
                        <div style={{fontSize:9,color:T.muted,marginTop:2,letterSpacing:1}}>RUNS</div>
                      </div>
                      {/* Balls */}
                      <div style={{flex:1,background:T.bg,padding:12,textAlign:"center",borderLeft:`3px solid ${T.muted}`}}>
                        <div style={{fontSize:28,fontWeight:900,color:T.text,fontFamily:fonts.display}}>{matchDetailModal.matchData.bat.b || 0}</div>
                        <div style={{fontSize:9,color:T.muted,marginTop:2,letterSpacing:1}}>BALLS</div>
                      </div>
                      {/* Strike Rate */}
                      {matchDetailModal.matchData.bat.b > 0 && (
                        <div style={{flex:1,background:T.bg,padding:12,textAlign:"center",borderLeft:`3px solid ${T.success}`}}>
                          <div style={{fontSize:28,fontWeight:900,color:T.success,fontFamily:fonts.display}}>
                            {((matchDetailModal.matchData.bat.r / matchDetailModal.matchData.bat.b) * 100).toFixed(1)}
                          </div>
                          <div style={{fontSize:9,color:T.muted,marginTop:2,letterSpacing:1}}>S/R</div>
                        </div>
                      )}
                    </div>

                    {/* Boundaries */}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4, 1fr)",gap:8}}>
                      <div style={{background:"linear-gradient(135deg, rgba(34,197,94,0.1) 0%, rgba(22,163,74,0.1) 100%)",border:`2px solid rgba(34,197,94,0.3)`,padding:"10px",textAlign:"center",clipPath:"polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)"}}>
                        <div style={{fontSize:20,fontWeight:900,color:"#22C55E",fontFamily:fonts.display}}>{matchDetailModal.matchData.bat['6s'] || 0}</div>
                        <div style={{fontSize:8,color:"#22C55E",marginTop:2,fontWeight:700,letterSpacing:1}}>SIXES</div>
                      </div>
                      <div style={{background:"linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(37,99,235,0.1) 100%)",border:`2px solid rgba(59,130,246,0.3)`,padding:"10px",textAlign:"center",clipPath:"polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)"}}>
                        <div style={{fontSize:20,fontWeight:900,color:"#3B82F6",fontFamily:fonts.display}}>{matchDetailModal.matchData.bat['4s'] || 0}</div>
                        <div style={{fontSize:8,color:"#3B82F6",marginTop:2,fontWeight:700,letterSpacing:1}}>FOURS</div>
                      </div>
                      <div style={{background:T.bg,border:`2px solid ${T.border}`,padding:"10px",textAlign:"center",clipPath:"polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)"}}>
                        <div style={{fontSize:20,fontWeight:900,color:T.text,fontFamily:fonts.display}}>{((matchDetailModal.matchData.bat['4s'] || 0) * 4 + (matchDetailModal.matchData.bat['6s'] || 0) * 6)}</div>
                        <div style={{fontSize:8,color:T.muted,marginTop:2,fontWeight:700,letterSpacing:1}}>BOUNDARY</div>
                      </div>
                      <div style={{background:T.bg,border:`2px solid ${T.border}`,padding:"10px",textAlign:"center",clipPath:"polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)"}}>
                        <div style={{fontSize:20,fontWeight:900,color:T.text,fontFamily:fonts.display}}>
                          {(matchDetailModal.matchData.bat.r || 0) - ((matchDetailModal.matchData.bat['4s'] || 0) * 4 + (matchDetailModal.matchData.bat['6s'] || 0) * 6)}
                        </div>
                        <div style={{fontSize:8,color:T.muted,marginTop:2,fontWeight:700,letterSpacing:1}}>SINGLES</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Bowling Stats */}
              {matchDetailModal.matchData.bowl && (
                <div style={{marginBottom:20}}>
                  <div style={{fontSize:11,color:"#EF4444",fontWeight:800,letterSpacing:2,marginBottom:12,fontFamily:fonts.display}}>
                    ⚡ BOWLING PERFORMANCE
                  </div>
                  <div style={{background:T.card,border:`2px solid ${T.border}`,padding:16,borderRadius:0}}>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(5, 1fr)",gap:8}}>
                      <div style={{background:T.bg,padding:12,textAlign:"center",borderLeft:`3px solid #EF4444`}}>
                        <div style={{fontSize:24,fontWeight:900,color:"#EF4444",fontFamily:fonts.display}}>{matchDetailModal.matchData.bowl.w || 0}</div>
                        <div style={{fontSize:9,color:T.muted,marginTop:2,letterSpacing:1}}>WKTS</div>
                      </div>
                      <div style={{background:T.bg,padding:12,textAlign:"center",borderLeft:`3px solid ${T.muted}`}}>
                        <div style={{fontSize:24,fontWeight:900,color:T.text,fontFamily:fonts.display}}>{matchDetailModal.matchData.bowl.o || 0}</div>
                        <div style={{fontSize:9,color:T.muted,marginTop:2,letterSpacing:1}}>OVERS</div>
                      </div>
                      <div style={{background:T.bg,padding:12,textAlign:"center",borderLeft:`3px solid ${T.muted}`}}>
                        <div style={{fontSize:24,fontWeight:900,color:T.text,fontFamily:fonts.display}}>{matchDetailModal.matchData.bowl.r || 0}</div>
                        <div style={{fontSize:9,color:T.muted,marginTop:2,letterSpacing:1}}>RUNS</div>
                      </div>
                      <div style={{background:T.bg,padding:12,textAlign:"center",borderLeft:`3px solid ${T.muted}`}}>
                        <div style={{fontSize:24,fontWeight:900,color:T.text,fontFamily:fonts.display}}>{matchDetailModal.matchData.bowl.m || 0}</div>
                        <div style={{fontSize:9,color:T.muted,marginTop:2,letterSpacing:1}}>MDNS</div>
                      </div>
                      {matchDetailModal.matchData.bowl.o > 0 && (
                        <div style={{background:T.bg,padding:12,textAlign:"center",borderLeft:`3px solid ${T.success}`}}>
                          <div style={{fontSize:24,fontWeight:900,color:T.success,fontFamily:fonts.display}}>
                            {((matchDetailModal.matchData.bowl.r || 0) / (matchDetailModal.matchData.bowl.o || 1)).toFixed(2)}
                          </div>
                          <div style={{fontSize:9,color:T.muted,marginTop:2,letterSpacing:1}}>ECON</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Fielding Stats */}
              {(matchDetailModal.matchData.ct > 0 || matchDetailModal.matchData.ro > 0 || matchDetailModal.matchData.st > 0) && (
                <div style={{marginBottom:20}}>
                  <div style={{fontSize:11,color:"#8B5CF6",fontWeight:800,letterSpacing:2,marginBottom:12,fontFamily:fonts.display}}>
                    🧤 FIELDING
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    {matchDetailModal.matchData.ct > 0 && (
                      <div style={{flex:1,background:T.card,border:`2px solid #8B5CF6`,padding:12,textAlign:"center",clipPath:"polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)"}}>
                        <div style={{fontSize:24,fontWeight:900,color:"#8B5CF6",fontFamily:fonts.display}}>{matchDetailModal.matchData.ct}</div>
                        <div style={{fontSize:9,color:T.muted,marginTop:2,letterSpacing:1}}>CATCHES</div>
                      </div>
                    )}
                    {matchDetailModal.matchData.ro > 0 && (
                      <div style={{flex:1,background:T.card,border:`2px solid #8B5CF6`,padding:12,textAlign:"center",clipPath:"polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)"}}>
                        <div style={{fontSize:24,fontWeight:900,color:"#8B5CF6",fontFamily:fonts.display}}>{matchDetailModal.matchData.ro}</div>
                        <div style={{fontSize:9,color:T.muted,marginTop:2,letterSpacing:1}}>RUN-OUTS</div>
                      </div>
                    )}
                    {matchDetailModal.matchData.st > 0 && (
                      <div style={{flex:1,background:T.card,border:`2px solid #8B5CF6`,padding:12,textAlign:"center",clipPath:"polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)"}}>
                        <div style={{fontSize:24,fontWeight:900,color:"#8B5CF6",fontFamily:fonts.display}}>{matchDetailModal.matchData.st}</div>
                        <div style={{fontSize:9,color:T.muted,marginTop:2,letterSpacing:1}}>STUMPINGS</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Points Calculation */}
              <div style={{background:"linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(217,119,6,0.15) 100%)",border:`2px solid ${T.accent}`,padding:20,borderRadius:0}}>
                <div style={{fontSize:11,color:T.accent,fontWeight:800,letterSpacing:2,marginBottom:12,textAlign:"center"}}>
                  💰 POINTS BREAKDOWN
                </div>
                <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:16,fontSize:18,fontWeight:900,fontFamily:fonts.display,color:T.accent}}>
                  <span>{matchDetailModal.base}</span>
                  <span style={{color:T.muted}}>×</span>
                  <span>{matchDetailModal.mult}</span>
                  <span style={{color:T.muted}}>=</span>
                  <span style={{fontSize:28}}>{matchDetailModal.points}</span>
                </div>
                <div style={{textAlign:"center",marginTop:8,fontSize:10,color:T.muted}}>
                  Base Points × {matchDetailModal.mult === 2 ? "Captain (2×)" : matchDetailModal.mult === 1.5 ? "Vice-Captain (1.5×)" : "Multiplier (1×)"}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{background:T.bg,padding:"16px 24px",borderTop:`2px solid ${T.border}`,display:"flex",justifyContent:"center"}}>
              <button
                onClick={() => setMatchDetailModal(null)}
                style={{background:"linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",border:"none",borderRadius:0,padding:"12px 32px",color:"#0A0E14",fontFamily:fonts.display,fontSize:14,fontWeight:900,cursor:"pointer",letterSpacing:1.5,clipPath:"polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)",boxShadow:"6px 6px 0 rgba(245,158,11,0.3)"}}
              >
                ✕ CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
