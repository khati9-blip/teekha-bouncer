import React, { useState } from "react";
import { T, fonts } from "./Theme";

export default function MatchesPage({
  tournaments, setTournaments,
  matches, updMatches,
  points, updPoints,
  captains,
  liveScores,
  unlocked, isGuest,
  withPassword, storeSet, pushNotif,
  setCaptainMatch, setSmartStatsMatch, setConfirmAction,
  setAddTournamentModal,
  setFetchPlayerModal,
  setAiMatchModal,
  fetchMatchesForTournament,
  fetchFromCricketData,
}) {
  const [expandedTournaments, setExpandedTournaments] = useState({"t_ipl":true});
  const [expandedMatchId, setExpandedMatchId] = useState(null);
  return (
    <div className="fade-in">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div style={{display:"inline-block",background:T.accent,padding:"4px 16px 4px 12px",clipPath:"polygon(0 0,100% 0,calc(100% - 10px) 100%,0 100%)"}}>
          <h2 style={{fontFamily:fonts.display,fontSize:28,fontWeight:700,color:T.bg,letterSpacing:3,margin:0}}>MATCHES</h2>
        </div>
      </div>

      {/* Add tournament - always visible, password on click */}
      <button onClick={()=>withPassword(()=>setAddTournamentModal(true))}
        style={{width:"100%",background:T.card,border:`2px solid ${T.accent}`,padding:"14px 18px",marginBottom:16,cursor:"pointer",display:"flex",alignItems:"center",gap:12,fontFamily:fonts.display,clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)"}}>
        <span style={{fontSize:24,color:T.accent}}>➕</span>
        <div style={{textAlign:"left"}}>
          <div style={{fontWeight:800,fontSize:15,color:T.accent,letterSpacing:2,textTransform:"uppercase"}}>ADD TOURNAMENT</div>
          <div style={{fontSize:10,color:T.muted,marginTop:2,fontFamily:fonts.body,letterSpacing:1,textTransform:"uppercase"}}>Fetch from Cricbuzz or CricketData</div>
        </div>
      </button>

      {/* Source legend */}
      {unlocked && (
        <div style={{display:"flex",gap:8,marginBottom:12,fontSize:11,color:T.muted}}>
          <span style={{color:T.accent}}>🟠 CB</span> Cricbuzz · 100/month
          <span style={{marginLeft:8,color:T.success}}>🟢 CD</span> CricketData · 100/day
        </div>
      )}

      {/* Tournament collapsible sections */}
      {tournaments.map((tournament, tIdx) => {
        const tMatches = matches.filter(m => m.tournamentId === tournament.id || (!m.tournamentId && tournament.id === "t_ipl"));
        const isOpen = expandedTournaments[tournament.id];
        const liveCount = tMatches.filter(m=>m.status==="live").length;
        const TOURNEY_COLORS = ["#F5A623","#4F8EF7","#2ECC71","#A855F7","#FF3D5A","#06B6D4","#F97316","#EC4899"];
        const tColor = TOURNEY_COLORS[tIdx % TOURNEY_COLORS.length];
        return (
          <div key={tournament.id} style={{marginBottom:16,background:T.card,borderRadius:0,border:`2px solid ${tColor}`,overflow:"hidden",boxShadow:"3px 3px 0 "+tColor+"44"}}>
            {/* Tournament header */}
            <div style={{display:"flex",alignItems:"center",padding:"14px 18px",cursor:"pointer",gap:12,background:T.bg,borderBottom:isOpen?`2px solid ${tColor}`:"none"}}
              onClick={()=>setExpandedTournaments(prev=>({...prev,[tournament.id]:!prev[tournament.id]}))}>
              <div style={{flex:1}}>
                <div style={{fontFamily:fonts.display,fontSize:18,fontWeight:800,color:tColor,letterSpacing:2,textTransform:"uppercase"}}>{tournament.name}</div>
                <div style={{fontSize:10,color:T.muted,marginTop:3,fontFamily:fonts.body,letterSpacing:1}}>
                  {tMatches.length} matches{liveCount>0?" • "+liveCount+" LIVE 🔴":""}
                  {tournament.tradeSnatchEnabled && <span style={{marginLeft:8,color:T.purple,fontSize:10,fontWeight:800,fontFamily:fonts.display,letterSpacing:1.5}}>⚡ TRADE & SNATCH ON</span>}
                </div>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <button onClick={e=>{e.stopPropagation();withPassword(()=>fetchMatchesForTournament(tournament.id,tournament.name,tournament.seriesId));}}
                  style={{background:T.accent,border:"none",color:T.bg,clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)",padding:"6px 10px",cursor:"pointer",fontFamily:fonts.display,fontWeight:800,fontSize:10,letterSpacing:1.5,filter:"drop-shadow(2px 2px 0 #8B4500)"}}
                  title="Cricbuzz — 100 req/month free. Resets monthly.">🟠 CB</button>
                <button onClick={e=>{e.stopPropagation();withPassword(()=>fetchFromCricketData(tournament.id,tournament.name));}}
                  style={{background:"#2ECC71",border:"none",color:"#050F05",clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)",padding:"6px 10px",cursor:"pointer",fontFamily:fonts.display,fontWeight:800,fontSize:10,letterSpacing:1.5,filter:"drop-shadow(2px 2px 0 #0A5020)"}}
                  title="CricketData — 100 req/day free. Resets daily.">🟢 CD</button>
                <button onClick={e=>{e.stopPropagation();withPassword(()=>setFetchPlayerModal({tournamentId:tournament.id,tournamentName:tournament.name}));}}
                  style={{background:"#4F8EF7",border:"none",color:"#050F14",clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)",padding:"6px 10px",cursor:"pointer",fontFamily:fonts.display,fontWeight:800,fontSize:10,letterSpacing:1.5,filter:"drop-shadow(2px 2px 0 #1E3A5F)"}}
                  title="Fetch players for this tournament">👥 PLYR</button>
                <button onClick={e=>{e.stopPropagation();withPassword(()=>setAiMatchModal({tournamentId:tournament.id,tournamentName:tournament.name}));}}
                  style={{background:"#A855F7",border:"none",color:"#050F14",clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)",padding:"6px 10px",cursor:"pointer",fontFamily:fonts.display,fontWeight:800,fontSize:10,letterSpacing:1.5,filter:"drop-shadow(2px 2px 0 #5B21B6)"}}
                  title="Generate past matches using AI">🤖 AI</button>
                {tMatches.some(m=>m.aiGenerated) && (
                  <button onClick={e=>{e.stopPropagation();withPassword(()=>{
                    if(!window.confirm("Delete all AI-generated matches for "+tournament.name+"? This cannot be undone.")) return;
                    const updated = matches.filter(m=>!(m.tournamentId===tournament.id && m.aiGenerated));
                    updMatches(updated);
                  });}}
                    style={{background:"#FF3D5A",border:"none",color:"#FFFFFF",clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)",padding:"6px 10px",cursor:"pointer",fontFamily:fonts.display,fontWeight:800,fontSize:10,letterSpacing:1.5,filter:"drop-shadow(2px 2px 0 #8B0000)"}}
                    title="Delete all AI-generated matches">🗑 AI</button>
                )}
              </div>
              {/* Trade & Snatch toggle */}
              {(()=>{
                const tStarted = tMatches.some(m=>m.status==="completed");
                const isOn = tournament.tradeSnatchEnabled === undefined ? tStarted : !!tournament.tradeSnatchEnabled;
                return (
                  <button onClick={e=>{
                    e.stopPropagation();
                    if(tStarted&&isOn){alert("Tournament has started — Trade & Snatch cannot be disabled.");return;}
                    if(!isOn&&!confirm("Enable Trade & Snatch for "+tournament.name+"? Once the tournament starts this cannot be turned off.")) return;
                    if(isOn&&!tStarted){
                      withPassword(()=>{
                        const updated=tournaments.map(t=>t.id===tournament.id?{...t,tradeSnatchEnabled:false}:t);
                        setTournaments(updated);storeSet("tournaments",updated);
                      });
                    } else {
                      withPassword(()=>{
                        const updated=tournaments.map(t=>t.id===tournament.id?{...t,tradeSnatchEnabled:true}:t);
                        setTournaments(updated);storeSet("tournaments",updated);
                      });
                    }
                  }}
                  title={tStarted&&isOn?"Trade & Snatch — LOCKED (tournament started, irreversible)":isOn?"Trade & Snatch — ON (click to disable, admin password required)":"Trade & Snatch — OFF (click to enable, admin password required)"}
                  style={{background:isOn?"#A855F7":"transparent",border:`2px solid ${isOn?"#A855F7":T.border}`,clipPath:isOn?"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)":"none",padding:"5px 12px",cursor:tStarted&&isOn?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                    <span style={{fontSize:10,color:isOn?"#fff":T.muted,fontWeight:800,fontFamily:fonts.display,letterSpacing:1.5}}>T&S {isOn?"ON":"OFF"}</span>
                  </button>
                );
              })()}
              {unlocked && tournament.id !== "t_ipl" && (
                <button onClick={e=>{e.stopPropagation();if(!confirm("Remove this tournament?"))return;const updated=tournaments.filter(t=>t.id!==tournament.id);setTournaments(updated);storeSet("tournaments",updated);}}
                  style={{background:"transparent",border:`2px solid ${T.danger}`,color:T.danger,padding:"5px 8px",cursor:"pointer",fontSize:16,lineHeight:1}}>×</button>
              )}
            </div>

            {/* Matches list */}
            {isOpen && (
              <div style={{borderTop:`1px solid ${T.border}`,padding:"8px 8px"}}>
                {tMatches.length === 0 ? (
                  <div style={{textAlign:"center",padding:"24px",color:T.muted,fontSize:13}}>
                    No matches yet — hit ↻ REFRESH to fetch from Cricbuzz
                  </div>
                ) : (
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {(()=>{
                      const allTourneyMatches = [...matches.filter(m=>m.tournamentId===tournament.id||(!m.tournamentId&&tournament.id==="t_ipl"))];
                      allTourneyMatches.sort((a,b)=>{
                        const dateA=a.date||"9999";
                        const dateB=b.date||"9999";
                        if(dateA!==dateB) return dateB.localeCompare(dateA);
                        if(a.matchNum !== b.matchNum) return (b.matchNum||0) - (a.matchNum||0);
                        const o={live:0,completed:1,upcoming:2};
                        return (o[a.status]||2)-(o[b.status]||2);
                      });
                      const matchNumMap={};
                      allTourneyMatches.forEach((m,i)=>{matchNumMap[m.id]=allTourneyMatches.length-i;});
                      return allTourneyMatches.map((match)=>{
                        const displayNum=matchNumMap[match.id]||match.matchNum;
                        const completed=match.status==="completed";
                        const live=match.status==="live";
                        const liveScore=liveScores[match.id];
                        const isSynced=completed&&Object.keys(points).some(pid=>points[pid][match.id]);
                        const hasStats=Object.keys(points).some(pid=>points[pid][match.id]);
                        return (
                          <div key={match.id} style={{background:T.bg,borderRadius:0,border:`2px solid ${live?"#FF3D5A":completed?"#2ECC71":"#4A5E78"}`,borderLeft:`5px solid ${live?"#FF3D5A":completed?"#2ECC71":"#4A5E78"}`}}>
                            <div style={{display:"flex",alignItems:"center",padding:"12px 16px",gap:14,cursor:"pointer"}} onClick={()=>setExpandedMatchId(expandedMatchId===match.id?null:match.id)}>
                              <div style={{background:T.card,borderRadius:0,padding:"4px 10px",minWidth:44,textAlign:"center",flexShrink:0,border:`1px solid ${T.border}`}}>
                                <div style={{fontSize:9,color:T.muted,fontFamily:fonts.display,letterSpacing:1}}>M</div>
                                <div style={{fontSize:18,fontWeight:900,color:T.accent,fontFamily:fonts.display,letterSpacing:1}}>{displayNum}</div>
                              </div>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontWeight:800,fontSize:15,color:T.text,fontFamily:fonts.display,letterSpacing:1,textTransform:"uppercase"}}>
                                  {match.team1} <span style={{color:T.muted,fontWeight:700}}>vs</span> {match.team2}
                                </div>
                                <div style={{fontSize:10,color:T.muted,marginTop:3,fontFamily:fonts.body,letterSpacing:0.5}}>
                                  {match.date} • {match.time} IST • {match.venue}
                                </div>
                                {live&&liveScore&&<div style={{fontSize:11,color:T.accent,marginTop:2,fontFamily:fonts.display,fontWeight:700}}>{liveScore.score1} | {liveScore.score2}</div>}
                              </div>
                              <div style={{flexShrink:0,textAlign:"right"}}>
                                {live ? (
                                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
                                    <div style={{background:"#FF3D5A",clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)",padding:"4px 10px"}}>
                                      <span style={{fontSize:10,color:"#fff",fontWeight:800,fontFamily:fonts.display,letterSpacing:1.5}}>🔴 LIVE</span>
                                    </div>
                                    {unlocked && (
                                      <div style={{display:"flex",gap:3}}>
                                        <button onClick={e=>{e.stopPropagation();const upd=matches.map(m=>m.id===match.id?{...m,status:"completed"}:m);updMatches(upd);}} style={{fontSize:9,color:T.success,background:"transparent",border:`1px solid ${T.success}`,padding:"3px 6px",cursor:"pointer",fontFamily:fonts.display,fontWeight:700}}>✓ Done</button>
                                        <button onClick={e=>{e.stopPropagation();const upd=matches.map(m=>m.id===match.id?{...m,status:"upcoming"}:m);updMatches(upd);}} style={{fontSize:9,color:T.muted,background:"transparent",border:`1px solid ${T.border}`,padding:"3px 6px",cursor:"pointer",fontFamily:fonts.display,fontWeight:700}}>↩ Reset</button>
                                      </div>
                                    )}
                                  </div>
                                ) : completed ? (
                                  <div style={{textAlign:"right"}}>
                                    <div style={{background:isSynced?"#2ECC71":"#F5A623",clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)",padding:"4px 10px",marginBottom:2}}>
                                      <div style={{fontSize:10,fontWeight:800,color:isSynced?"#050F05":"#080C14",fontFamily:fonts.display,letterSpacing:1.5}}>
                                        {isSynced?"✓ SYNCED":"⚠ UNSYNCED"}
                                      </div>
                                    </div>
                                    <div style={{fontSize:9,color:T.muted,fontFamily:fonts.body,letterSpacing:1}}>COMPLETED</div>
                                  </div>
                                ) : (
                                  <div style={{textAlign:"right"}}>
                                    <div style={{background:T.card,border:`1px solid ${T.border}`,padding:"4px 10px",marginBottom:2}}>
                                      <span style={{fontSize:10,color:T.muted,fontWeight:800,fontFamily:fonts.display,letterSpacing:1.5}}>UPCOMING</span>
                                    </div>
                                    {unlocked&&<button onClick={e=>{e.stopPropagation();const upd=matches.map(m=>m.id===match.id?{...m,status:"live"}:m);updMatches(upd);}} style={{fontSize:9,color:"#FF3D5A",background:"transparent",border:`1px solid #FF3D5A`,padding:"3px 6px",cursor:"pointer",marginTop:2,fontFamily:fonts.display,fontWeight:700}}>🔴 Mark Live</button>}
                                  </div>
                                )}
                              </div>
                            </div>
                            {/* Expandable actions */}
                            {expandedMatchId===match.id && (
                              <div style={{borderTop:`1px solid ${T.border}`,padding:"10px 14px",display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                                {!isGuest&&<button onClick={()=>setCaptainMatch(match)}
                                  style={{background:T.infoBg,border:`1px solid ${T.info}44`,color:T.info,borderRadius:7,padding:"6px 12px",cursor:"pointer",fontFamily:fonts.body,fontWeight:700,fontSize:12}}>
                                  {captains[match.id+"_locked"]?"🔒 C/VC":"👑 SET C/VC"}
                                </button>}
                                {completed&&unlocked&&(
                                  <button onClick={()=>withPassword(()=>setSmartStatsMatch(match))}
                                    style={{background:T.accentBg,border:`1px solid ${T.accentBorder}`,color:T.accent,borderRadius:7,padding:"6px 12px",cursor:"pointer",fontFamily:fonts.body,fontWeight:700,fontSize:12}}>
                                    📊 {isSynced?"EDIT STATS":"SYNC STATS"}
                                  </button>
                                )}
                                {unlocked&&(
                                  <div style={{display:"flex",gap:6,marginLeft:"auto"}}>
                                    {match.status!=="live"&&<button onClick={()=>{const upd=matches.map(m=>m.id===match.id?{...m,status:"live"}:m);updMatches(upd);}}
                                      style={{background:T.dangerBg,border:`1px solid ${T.danger}44`,color:T.danger,borderRadius:7,padding:"6px 10px",cursor:"pointer",fontFamily:fonts.body,fontWeight:700,fontSize:11}}>🔴 LIVE</button>}
                                    {match.status!=="completed"&&<button onClick={()=>{const upd=matches.map(m=>m.id===match.id?{...m,status:"completed"}:m);updMatches(upd);}}
                                      style={{background:T.successBg,border:`1px solid ${T.success}44`,color:T.success,borderRadius:7,padding:"6px 10px",cursor:"pointer",fontFamily:fonts.body,fontWeight:700,fontSize:11}}>✓ DONE</button>}
                                    {match.status!=="upcoming"&&<button onClick={()=>{const upd=matches.map(m=>m.id===match.id?{...m,status:"upcoming"}:m);updMatches(upd);}}
                                      style={{background:"#4A5E7822",border:"1px solid #4A5E7844",color:T.muted,borderRadius:7,padding:"6px 10px",cursor:"pointer",fontFamily:fonts.body,fontWeight:700,fontSize:11}}>↩ RESET</button>}
                                    {hasStats&&<button onClick={()=>setConfirmAction({msg:`Clear ALL stats for Match ${match.matchNum}? This cannot be undone.`,fn:()=>{
                                      const newPts={...points};
                                      Object.keys(newPts).forEach(pid=>{if(newPts[pid][match.id])delete newPts[pid][match.id];});
                                      updPoints(newPts);
                                      pushNotif("stats",`Match ${match.matchNum} stats cleared`,"🗑");
                                    }})}
                                      style={{background:T.dangerBg,border:`1px solid ${T.danger}44`,color:T.danger,borderRadius:7,padding:"6px 10px",cursor:"pointer",fontFamily:fonts.body,fontWeight:700,fontSize:11}}>🗑 CLEAR STATS</button>}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
