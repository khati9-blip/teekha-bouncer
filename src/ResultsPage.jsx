import React, { useState } from "react";
import { T, fonts } from "./Theme";
import { calcBreakdown } from "./utils.js";
import PlayerImage from "./PlayerImage";

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
  // Extract player stats from points data (Supabase stats structure)
  const playerMatchData = points[stat.player.id]?.[md.matchId];
  const s = playerMatchData?.stats || {};
  
  setMatchDetailModal({
    player: stat.player,
    match: match,
    teamId: stat.team.id,
    points: md.points,
    base: md.base,
    mult: md.mult,
    stats: s,
    breakdown: calcBreakdown(s),
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
            style={{background:"linear-gradient(135deg, #1a1f2e 0%, #0f1419 100%)",border:`3px solid ${teams.find(t => t.id === matchDetailModal.teamId)?.color || T.accent}`,borderRadius:0,maxWidth:680,width:"100%",clipPath:"polygon(16px 0%, 100% 0%, calc(100% - 16px) 100%, 0% 100%)",boxShadow:`12px 12px 0 ${teams.find(t => t.id === matchDetailModal.teamId)?.color || T.accent}40`,overflow:"hidden",maxHeight:"90vh",display:"flex",flexDirection:"column"}}
          >
            {/* Hero Section with Large Player Image */}
            <div style={{position:"relative",overflow:"hidden",flexShrink:0,background:"linear-gradient(135deg, rgba(15,20,30,0.95) 0%, rgba(10,14,20,0.98) 100%)"}}>
              {/* Team Color Accent Strip */}
              <div style={{position:"absolute",top:0,left:0,right:0,height:4,background:`linear-gradient(90deg, ${teams.find(t => t.id === matchDetailModal.teamId)?.color || T.accent} 0%, ${teams.find(t => t.id === matchDetailModal.teamId)?.color || T.accent} 100%)`,zIndex:10}}></div>

              {/* Close Button */}
              <button
                onClick={() => setMatchDetailModal(null)}
                style={{position:"absolute",top:16,right:16,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(10px)",border:"2px solid rgba(255,255,255,0.2)",width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:20,color:"#fff",fontWeight:900,clipPath:"polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)",zIndex:30,transition:"all 0.2s"}}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.8)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(0,0,0,0.6)"}
              >
                ✕
              </button>

              {/* Large Player Image Container */}
              <div style={{position:"relative",height:420,overflow:"hidden"}}>
                {/* Player Image - Large */}
                <div style={{position:"absolute",left:0,top:0,bottom:0,width:"45%",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <div style={{width:"100%",height:"100%",position:"relative"}}>
                    <PlayerImage 
                      player={matchDetailModal.player} 
                      size="100%" 
                      borderRadius={0} 
                      teamColor={teams.find(t => t.id === matchDetailModal.teamId)?.color} 
                      showBackground={true} 
                    />
                  </div>
                  {/* Gradient overlay on image */}
                  <div style={{position:"absolute",top:0,right:0,bottom:0,width:80,background:"linear-gradient(90deg, transparent 0%, rgba(15,20,30,1) 100%)",pointerEvents:"none"}}></div>
                </div>

                {/* Player Info Overlay - Right Side */}
                <div style={{position:"absolute",right:0,top:0,bottom:0,width:"55%",padding:"32px 32px 32px 20px",display:"flex",flexDirection:"column",justifyContent:"center"}}>
                  {/* Tier badges */}
                  <div style={{display:"flex",gap:8,marginBottom:12}}>
                    {matchDetailModal.player.tier && (
                      <div style={{fontSize:9,fontWeight:800,letterSpacing:1.5,padding:"4px 10px",fontFamily:fonts.display,textTransform:"uppercase",background:matchDetailModal.player.tier==="platinum"?"#4A5E7833":matchDetailModal.player.tier==="gold"?"#F5A62322":matchDetailModal.player.tier==="silver"?"#94A3B822":"#CD7F3222",border:`2px solid ${matchDetailModal.player.tier==="platinum"?"#4A5E7866":matchDetailModal.player.tier==="gold"?"#F5A62366":matchDetailModal.player.tier==="silver"?"#94A3B855":"#CD7F3255"}`,color:matchDetailModal.player.tier==="platinum"?"#B0BEC5":matchDetailModal.player.tier==="gold"?"#F5A623":matchDetailModal.player.tier==="silver"?"#94A3B8":"#CD7F32",clipPath:"polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)"}}>
                        {matchDetailModal.player.tier === "platinum" ? "● SILVER" : matchDetailModal.player.tier === "gold" ? "● GOLD" : matchDetailModal.player.tier === "silver" ? "● SILVER" : "● BRONZE"}
                      </div>
                    )}
                    <div style={{fontSize:9,fontWeight:800,letterSpacing:1.5,padding:"4px 10px",fontFamily:fonts.display,textTransform:"uppercase",background:"rgba(255,255,255,0.05)",border:"2px solid rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.6)",clipPath:"polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)"}}>
                      {matchDetailModal.player.role?.toUpperCase() || "BATTER"}
                    </div>
                  </div>

                  {/* Player Name */}
                  <h2 style={{fontFamily:fonts.display,fontSize:42,fontWeight:900,color:"#fff",letterSpacing:3,margin:0,textTransform:"uppercase",textShadow:"3px 3px 8px rgba(0,0,0,0.7)",lineHeight:1.1,marginBottom:16}}>
                    {matchDetailModal.player.name}
                  </h2>

                  {/* Team Badge */}
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20}}>
                    <div style={{width:10,height:10,borderRadius:"50%",background:teams.find(t => t.id === matchDetailModal.teamId)?.color || T.accent}}></div>
                    <span style={{fontSize:16,fontWeight:800,color:teams.find(t => t.id === matchDetailModal.teamId)?.color || T.accent,fontFamily:fonts.display,letterSpacing:2,textTransform:"uppercase"}}>
                      {teams.find(t => t.id === matchDetailModal.teamId)?.name || "Unknown Team"}
                    </span>
                  </div>

                  {/* MVP Impact Points - Compact */}
                  <div style={{background:"rgba(255,255,255,0.05)",backdropFilter:"blur(10px)",border:"2px solid rgba(255,255,255,0.1)",padding:"16px 20px",clipPath:"polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)",marginBottom:16,maxWidth:420}}>
                    <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between"}}>
                      <div>
                        <div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontWeight:800,letterSpacing:2,marginBottom:4}}>MVP IMPACT POINTS</div>
                        <div style={{fontSize:56,fontWeight:900,color:"#F59E0B",fontFamily:fonts.display,lineHeight:1,textShadow:"2px 2px 8px rgba(245,158,11,0.3)"}}>
                          {matchDetailModal.points}
                          <span style={{fontSize:18,color:"rgba(255,255,255,0.4)",marginLeft:6}}>PTS</span>
                        </div>
                      </div>
                      
                      {/* Performance Badge */}
                      <div style={{background:matchDetailModal.points >= 100 ? "rgba(34,197,94,0.2)" : matchDetailModal.points >= 50 ? "rgba(245,158,11,0.2)" : "rgba(239,68,68,0.2)",border:matchDetailModal.points >= 100 ? "2px solid #22C55E" : matchDetailModal.points >= 50 ? "2px solid #F59E0B" : "2px solid #EF4444",padding:"6px 12px",clipPath:"polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)"}}>
                        <span style={{fontSize:11,fontWeight:900,color:matchDetailModal.points >= 100 ? "#22C55E" : matchDetailModal.points >= 50 ? "#F59E0B" : "#EF4444",letterSpacing:1.5}}>
                          {matchDetailModal.points >= 100 ? "🔥 HOT" : matchDetailModal.points >= 50 ? "⚡ GOOD" : "❄️ COLD"}
                        </span>
                      </div>
                    </div>
                    
                    {/* Performance Form Bar */}
                    <div style={{marginTop:12}}>
                      <div style={{fontSize:8,color:"rgba(255,255,255,0.4)",fontWeight:700,letterSpacing:1,marginBottom:4}}>PERFORMANCE FORM</div>
                      <div style={{height:6,background:"rgba(255,255,255,0.1)",borderRadius:3,overflow:"hidden",position:"relative"}}>
                        <div style={{position:"absolute",left:0,top:0,bottom:0,width:`${Math.min((matchDetailModal.points / 150) * 100, 100)}%`,background:matchDetailModal.points >= 100 ? "linear-gradient(90deg, #22C55E 0%, #10B981 100%)" : matchDetailModal.points >= 50 ? "linear-gradient(90deg, #F59E0B 0%, #D97706 100%)" : "linear-gradient(90deg, #EF4444 0%, #DC2626 100%)",transition:"width 0.8s ease-out"}}></div>
                      </div>
                    </div>
                  </div>

                  {/* Role & Captain Badge */}
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    {matchDetailModal.mult > 1 && (
                      <div style={{background:matchDetailModal.mult === 2 ? "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)" : "linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)",border:matchDetailModal.mult === 2 ? "2px solid #F59E0B" : "2px solid #6366F1",padding:"6px 14px",clipPath:"polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)"}}>
                        <span style={{fontSize:11,fontWeight:900,color:"#fff",letterSpacing:1.5}}>
                          {matchDetailModal.mult === 2 ? "⭐ CAPTAIN" : "🥈 VICE-CAPTAIN"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Match Info Bar */}
              <div style={{background:"rgba(0,0,0,0.3)",borderTop:"1px solid rgba(255,255,255,0.1)",padding:"12px 24px",display:"flex",gap:20,flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontWeight:700,letterSpacing:1}}>MATCH</div>
                  <div style={{fontSize:14,fontWeight:800,color:"#fff",fontFamily:fonts.display}}>#{matchDetailModal.match.matchNum}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontWeight:700,letterSpacing:1}}>VS</div>
                  <div style={{fontSize:14,fontWeight:800,color:"#fff",fontFamily:fonts.display}}>{matchDetailModal.match.opponent || matchDetailModal.match.team2 || "TBD"}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontWeight:700,letterSpacing:1}}>VENUE</div>
                  <div style={{fontSize:11,fontWeight:700,color:"#fff",fontFamily:fonts.body}}>{matchDetailModal.match.venue || "TBD"}</div>
                </div>
                {matchDetailModal.match.date && (
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontWeight:700,letterSpacing:1}}>DATE</div>
                    <div style={{fontSize:11,fontWeight:700,color:"#fff",fontFamily:fonts.body}}>
                      {new Date(matchDetailModal.match.date).toLocaleDateString('en-IN', {day:'numeric',month:'short'})}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Stats Section - Premium Design */}
            {(() => {
              const s = matchDetailModal.stats || {};
              const hasBat = s.played && (s.runs > 0 || s.balls > 0 || s.fours > 0 || s.sixes > 0);
              const hasBowl = s.overs > 0 || s.wickets > 0;
              const hasField = (s.catches > 0 || s.runouts > 0 || s.stumpings > 0);

              // Build itemised points rows from stats
              const ptRows = [];
              if (s.runs > 0)        ptRows.push({ label: `Runs (${s.runs})`, pts: s.runs, color: "#22C55E" });
              if (s.fours > 0)       ptRows.push({ label: `Fours (${s.fours} × 8)`, pts: s.fours * 8, color: "#3B82F6" });
              if (s.sixes > 0)       ptRows.push({ label: `Sixes (${s.sixes} × 12)`, pts: s.sixes * 12, color: "#22C55E" });
              if (s.runs >= 50 && s.runs < 100) ptRows.push({ label: "50-run bonus", pts: 10, color: "#F59E0B" });
              if (s.runs >= 100)     ptRows.push({ label: "Century bonus", pts: 20, color: "#F59E0B" });
              if (s.wickets > 0)     ptRows.push({ label: `Wickets (${s.wickets} × 25)`, pts: s.wickets * 25, color: "#EF4444" });
              if (s.wickets >= 4 && s.wickets < 5) ptRows.push({ label: "4-wicket bonus", pts: 8, color: "#F59E0B" });
              if (s.wickets >= 5)    ptRows.push({ label: "5-wicket bonus", pts: 15, color: "#F59E0B" });
              if (s.maidens > 0)     ptRows.push({ label: `Maidens (${s.maidens})`, pts: s.maidens * 4, color: "#EF4444" });
              if (s.economy > 0 && s.overs >= 2 && s.economy < 6)
                                     ptRows.push({ label: `Economy bonus (<6)`, pts: 10, color: "#10B981" });
              if (s.catches > 0)     ptRows.push({ label: `Catches (${s.catches} × 8)`, pts: s.catches * 8, color: "#8B5CF6" });
              if (s.stumpings > 0)   ptRows.push({ label: `Stumpings (${s.stumpings} × 12)`, pts: s.stumpings * 12, color: "#8B5CF6" });
              if (s.runouts > 0)     ptRows.push({ label: `Run-outs (${s.runouts} × 12)`, pts: s.runouts * 12, color: "#8B5CF6" });
              if (s.longestSix)      ptRows.push({ label: "Longest Six 🎯", pts: 50, color: "#F59E0B" });
              if (s.mom)             ptRows.push({ label: "Man of the Match 🏆", pts: 25, color: "#F59E0B" });
              // All-rounder bonus: ≥30 runs AND ≥2 wickets
              if (s.runs >= 30 && s.wickets >= 2)
                                     ptRows.push({ label: "All-rounder bonus", pts: 15, color: "#F59E0B" });
              const baseFromRows = ptRows.reduce((acc, r) => acc + r.pts, 0);

              return (
                <div style={{padding:"24px 24px 16px",overflowY:"auto",flex:1,WebkitOverflowScrolling:"touch"}}>
                  <div style={{fontSize:13,color:"rgba(255,255,255,0.7)",fontWeight:800,letterSpacing:2,marginBottom:20,fontFamily:fonts.display,textTransform:"uppercase"}}>
                    📊 Match Performance
                  </div>

                  {/* NOT PLAYED notice */}
                  {!s.played && (
                    <div style={{background:"rgba(239,68,68,0.1)",border:"2px solid rgba(239,68,68,0.3)",padding:"14px 20px",marginBottom:20,clipPath:"polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)",textAlign:"center"}}>
                      <div style={{fontSize:13,color:"#EF4444",fontWeight:800,letterSpacing:1.5,fontFamily:fonts.display}}>🚫 DID NOT PLAY</div>
                      <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginTop:4}}>Player was not in Playing XI for this match</div>
                    </div>
                  )}

                  {/* Batting Stats */}
                  {hasBat && (
                    <div style={{marginBottom:20}}>
                      <div style={{fontSize:11,color:"#22C55E",fontWeight:800,letterSpacing:2,marginBottom:10,fontFamily:fonts.display,display:"flex",alignItems:"center",gap:8}}>
                        <span>🏏</span><span>BATTING</span>
                      </div>
                      <div style={{background:"linear-gradient(135deg, rgba(34,197,94,0.05) 0%, rgba(22,163,74,0.05) 100%)",border:"2px solid rgba(34,197,94,0.2)",padding:"16px 16px 12px",clipPath:"polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)"}}>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(72px, 1fr))",gap:10,marginBottom:12}}>
                          {[
                            { val: s.runs || 0, label: "RUNS", color: "#22C55E", big: true },
                            { val: s.balls || 0, label: "BALLS", color: "#fff" },
                            ...(s.balls > 0 ? [{ val: ((s.runs||0)/(s.balls||1)*100).toFixed(1), label: "S/R", color: "#3B82F6" }] : []),
                            { val: s.sixes || 0, label: "6s", color: "#22C55E" },
                            { val: s.fours || 0, label: "4s", color: "#3B82F6" },
                            ...(s.dismissed ? [{ val: "OUT", label: "STATUS", color: "#EF4444" }] : [{ val: "N/O", label: "STATUS", color: "#22C55E" }]),
                          ].map((item, i) => (
                            <div key={i} style={{background:"rgba(0,0,0,0.3)",padding:"10px 6px",textAlign:"center",borderLeft:`3px solid ${item.color}`}}>
                              <div style={{fontSize:item.big?26:20,fontWeight:900,color:item.color,fontFamily:fonts.display,lineHeight:1}}>{item.val}</div>
                              <div style={{fontSize:8,color:"rgba(255,255,255,0.45)",marginTop:4,letterSpacing:1,fontWeight:700}}>{item.label}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Bowling Stats */}
                  {hasBowl && (
                    <div style={{marginBottom:20}}>
                      <div style={{fontSize:11,color:"#EF4444",fontWeight:800,letterSpacing:2,marginBottom:10,fontFamily:fonts.display,display:"flex",alignItems:"center",gap:8}}>
                        <span>⚡</span><span>BOWLING</span>
                      </div>
                      <div style={{background:"linear-gradient(135deg, rgba(239,68,68,0.05) 0%, rgba(220,38,38,0.05) 100%)",border:"2px solid rgba(239,68,68,0.2)",padding:"16px 16px 12px",clipPath:"polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)"}}>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(72px, 1fr))",gap:10}}>
                          {[
                            { val: s.wickets || 0, label: "WKTS", color: "#EF4444", big: true },
                            { val: s.overs || 0, label: "OVERS", color: "#fff" },
                            { val: s.maidens || 0, label: "MAIDENS", color: "#F59E0B" },
                            ...(s.overs > 0 ? [{ val: (s.economy || 0).toFixed(2), label: "ECON", color: s.economy < 6 ? "#10B981" : s.economy < 8 ? "#F59E0B" : "#EF4444" }] : []),
                          ].map((item, i) => (
                            <div key={i} style={{background:"rgba(0,0,0,0.3)",padding:"10px 8px",textAlign:"center",borderLeft:`3px solid ${item.color}`}}>
                              <div style={{fontSize:item.big?26:20,fontWeight:900,color:item.color,fontFamily:fonts.display,lineHeight:1}}>{item.val}</div>
                              <div style={{fontSize:8,color:"rgba(255,255,255,0.45)",marginTop:4,letterSpacing:1,fontWeight:700}}>{item.label}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Fielding Stats */}
                  {hasField && (
                    <div style={{marginBottom:20}}>
                      <div style={{fontSize:11,color:"#8B5CF6",fontWeight:800,letterSpacing:2,marginBottom:10,fontFamily:fonts.display,display:"flex",alignItems:"center",gap:8}}>
                        <span>🧤</span><span>FIELDING</span>
                      </div>
                      <div style={{background:"linear-gradient(135deg, rgba(139,92,246,0.05) 0%, rgba(124,58,237,0.05) 100%)",border:"2px solid rgba(139,92,246,0.2)",padding:"16px 16px 12px",clipPath:"polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)"}}>
                        <div style={{display:"flex",gap:10}}>
                          {[
                            ...(s.catches > 0 ? [{ val: s.catches, label: "CATCHES", color: "#8B5CF6" }] : []),
                            ...(s.runouts > 0 ? [{ val: s.runouts, label: "RUN-OUTS", color: "#8B5CF6" }] : []),
                            ...(s.stumpings > 0 ? [{ val: s.stumpings, label: "STUMPINGS", color: "#8B5CF6" }] : []),
                          ].map((item, i) => (
                            <div key={i} style={{flex:1,background:"rgba(0,0,0,0.3)",border:"2px solid rgba(139,92,246,0.4)",padding:"14px 8px",textAlign:"center",clipPath:"polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)"}}>
                              <div style={{fontSize:26,fontWeight:900,color:item.color,fontFamily:fonts.display,lineHeight:1}}>{item.val}</div>
                              <div style={{fontSize:8,color:"rgba(255,255,255,0.45)",marginTop:4,letterSpacing:1,fontWeight:700}}>{item.label}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── DETAILED POINTS BREAKDOWN ── */}
                  <div style={{background:"linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(217,119,6,0.08) 100%)",border:`2px solid ${T.accent}44`,borderRadius:0,overflow:"hidden"}}>
                    {/* Header */}
                    <div style={{background:"linear-gradient(135deg, rgba(245,158,11,0.2) 0%, rgba(217,119,6,0.2) 100%)",borderBottom:`2px solid ${T.accent}44`,padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <div style={{fontSize:11,color:T.accent,fontWeight:900,letterSpacing:2,fontFamily:fonts.display}}>
                        💰 POINTS BREAKDOWN
                      </div>
                      <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",fontFamily:fonts.body}}>
                        base: {matchDetailModal.base} pts
                      </div>
                    </div>

                    {/* Line items */}
                    <div style={{padding:"8px 0"}}>
                      {ptRows.length === 0 ? (
                        <div style={{padding:"12px 16px",fontSize:12,color:"rgba(255,255,255,0.3)",textAlign:"center",fontFamily:fonts.body}}>
                          No scoring contributions
                        </div>
                      ) : ptRows.map((row, i) => (
                        <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 16px",borderBottom:i < ptRows.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <div style={{width:3,height:16,background:row.color,borderRadius:2,flexShrink:0}}></div>
                            <span style={{fontSize:12,color:"rgba(255,255,255,0.75)",fontFamily:fonts.body,fontWeight:500}}>{row.label}</span>
                          </div>
                          <span style={{fontSize:13,fontWeight:900,color:row.color,fontFamily:fonts.display,letterSpacing:0.5}}>+{row.pts}</span>
                        </div>
                      ))}
                    </div>

                    {/* Subtotal divider */}
                    <div style={{borderTop:`2px solid ${T.accent}44`,padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(0,0,0,0.2)"}}>
                      <span style={{fontSize:11,color:"rgba(255,255,255,0.4)",fontFamily:fonts.body,letterSpacing:1}}>SUBTOTAL</span>
                      <span style={{fontSize:16,fontWeight:900,color:"rgba(255,255,255,0.7)",fontFamily:fonts.display}}>{matchDetailModal.base}</span>
                    </div>

                    {/* Captain / VC multiplier row */}
                    {matchDetailModal.mult > 1 && (
                      <div style={{padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",background:matchDetailModal.mult===2?"rgba(245,158,11,0.12)":"rgba(99,102,241,0.12)",borderTop:`2px solid ${matchDetailModal.mult===2?"#F59E0B":"#6366F1"}44`}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:14}}>{matchDetailModal.mult===2?"⭐":"🥈"}</span>
                          <span style={{fontSize:12,color:matchDetailModal.mult===2?"#F59E0B":"#818CF8",fontFamily:fonts.body,fontWeight:700}}>
                            {matchDetailModal.mult===2?"Captain Multiplier (2×)":"Vice-Captain Multiplier (1.5×)"}
                          </span>
                        </div>
                        <span style={{fontSize:13,fontWeight:900,color:matchDetailModal.mult===2?"#F59E0B":"#818CF8",fontFamily:fonts.display}}>
                          ×{matchDetailModal.mult}
                        </span>
                      </div>
                    )}

                    {/* Grand Total */}
                    <div style={{background:"linear-gradient(135deg, rgba(245,158,11,0.2) 0%, rgba(217,119,6,0.15) 100%)",borderTop:`2px solid ${T.accent}`,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:13,color:T.accent,fontWeight:900,fontFamily:fonts.display,letterSpacing:2}}>TOTAL</span>
                      <div style={{display:"flex",alignItems:"baseline",gap:6}}>
                        <span style={{fontSize:32,fontWeight:900,color:T.accent,fontFamily:fonts.display,lineHeight:1}}>{matchDetailModal.points}</span>
                        <span style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>PTS</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Footer */}
            <div style={{background:T.bg,padding:"16px 24px",flexShrink:0,borderTop:`2px solid ${T.border}`,display:"flex",justifyContent:"center"}}>
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
