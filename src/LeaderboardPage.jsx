import React, { useState } from "react";
import { T, fonts } from "./Theme";
import { Badge } from "./UI.jsx";
import EditPointsForm from "./EditPointsForm.jsx";
import ProposeRulesForm from "./ProposeRulesForm.jsx";

const ROLE_COLORS = { Batsman:"#4F8EF7", Bowler:"#FF3D5A", "All-Rounder":"#2ECC71", "Wicket-Keeper":"#F5A623" };

export default function LeaderboardPage({
  leaderboard, teams, players, assignments, points, matches,
  snatch, ruledOut, notifications,
  pointsReady, pointsConfig, pitchConfig,
  ruleProposal, eligibleVoters, tournamentStarted,
  myTeam, teamIdentity, unlocked, isAdmin,
  transfers,
  votePin, setVotePin, votePinErr, setVotePinErr,
  getPlayerBreakdown, shareLeaderboard,
  proposeRuleChange, savePointsConfig, updRuleProposal,
  voteOnProposal, withPassword, storeGet, storeSet,
  setPitchConfig, updTransfers, pushNotif,
  setShowMvpModal,
}) {
  const [expandedTeam, setExpandedTeam] = useState(null);
  const [showRulesPanel, setShowRulesPanel] = useState(false);

  return (
    <div className="fade-in">
      <div style={{position:"relative"}}>
      <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{display:"inline-block",background:T.accent,padding:"4px 16px 4px 12px",clipPath:"polygon(0 0,100% 0,calc(100% - 10px) 100%,0 100%)"}}>
            <h2 style={{fontFamily:fonts.display,fontSize:28,fontWeight:700,color:T.bg,letterSpacing:3,margin:0}}>LEADERBOARD</h2>
          </div>
          <button className="mob-only" onClick={()=>setShowMvpModal(true)} style={{background:"linear-gradient(135deg,#FF6B00,#FF8C00)",border:"none",color:"#0A0E14",clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)",padding:"4px 14px",cursor:"pointer",fontFamily:fonts.display,fontWeight:800,fontSize:13,letterSpacing:2}}>⭐ MVP</button>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={shareLeaderboard} style={{background:"#25D366",border:"none",color:"#050F05",clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)",padding:"9px 20px",cursor:"pointer",fontFamily:fonts.display,fontWeight:800,fontSize:13,letterSpacing:2,textTransform:"uppercase",filter:"drop-shadow(3px 3px 0 #0A5020)"}}>
            📲 SHARE WHATSAPP
          </button>
        </div>
      </div>

      {leaderboard.length===0 ? (
        <div style={{padding:60,textAlign:"center",background:T.card,border:`1px solid ${T.border}`}}>
          <div style={{fontSize:56}}>🏆</div>
          <div style={{color:T.muted,marginTop:16}}>Set up your league first</div>
        </div>
      ) : (
        <>
          <div id="leaderboard-capture" style={{marginBottom:20}}>
            {leaderboard.map((team,i)=>{
              const medals=["🥇","🥈","🥉"];
              const breakdown=getPlayerBreakdown(team.id);
              const isOpen=expandedTeam===team.id;
              const ruledOutCount=breakdown.filter(p=>ruledOut.includes(p.id)).length;
              return(
                <div key={team.id} style={{background:T.card,borderRadius:0,marginBottom:6,borderLeft:"5px solid "+team.color,borderBottom:`1px solid ${T.border}`,overflow:"hidden"}}>
                  {/* Main row */}
                  <div className="leaderboard-card" style={{display:"flex",alignItems:"center",gap:16,padding:"18px 20px",cursor:"pointer"}} onClick={()=>setExpandedTeam(isOpen?null:team.id)}>
                    <div style={{fontFamily:fonts.display,fontSize:i===0?40:32,fontWeight:900,color:i===0?team.color:T.muted,minWidth:44,lineHeight:1}}>{medals[i]||("#"+(i+1))}</div>
                    <div style={{flex:1}}>
                      <div className="leaderboard-team-name" style={{fontWeight:900,fontSize:i===0?26:22,color:team.color,fontFamily:fonts.display,letterSpacing:2,textTransform:"uppercase",lineHeight:1}}>{team.name}</div>
                      <div style={{fontSize:11,color:T.muted,letterSpacing:2,marginTop:3,textTransform:"uppercase"}}>
                        {players.filter(p=>assignments[p.id]===team.id && !ruledOut.includes(p.id)).length} PLAYERS
                        {ruledOutCount>0&&<span style={{color:T.danger,marginLeft:8}}>· {ruledOutCount} RULED OUT</span>}
                      </div>
                    </div>
                    <div style={{textAlign:"right",display:"flex",alignItems:"center",gap:12}}>
                      <div>
                        {pointsReady ? (
                          <div className={i===0?"leaderboard-points-first leaderboard-points":"leaderboard-points"} style={{fontSize:i===0?48:36,fontWeight:900,color:i===0?T.accent:T.text,fontFamily:fonts.display,lineHeight:1,letterSpacing:1}}>{team.total.toLocaleString()}</div>
                        ) : (
                          <div style={{width:i===0?120:90,height:i===0?48:36,background:`linear-gradient(90deg,${T.border} 25%,${T.card} 50%,${T.border} 75%)`,backgroundSize:"200% 100%",animation:"tb-shimmer 1.2s infinite",borderRadius:4}} />
                        )}
                        <div style={{fontSize:10,color:T.muted,letterSpacing:3,textTransform:"uppercase",marginTop:2}}>PTS</div>
                      </div>
                      <span style={{color:team.color,fontSize:14,fontFamily:fonts.display,fontWeight:700}}>{isOpen?"▲":"▼"}</span>
                    </div>
                  </div>

                  {/* Collapsible player breakdown */}
                  {isOpen&&breakdown.length>0&&(
                    <div style={{borderTop:`1px solid ${T.border}`,padding:"12px 18px"}}>
                      <div style={{display:"flex",gap:8,marginBottom:10}}>
                        <div style={{flex:1,background:T.accent,color:T.bg,padding:"8px 12px",fontFamily:fonts.display,fontWeight:800,fontSize:11,letterSpacing:2,clipPath:"polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)"}}>PLAYER</div>
                        <div style={{width:90,background:T.accent,color:T.bg,padding:"8px 12px",fontFamily:fonts.display,fontWeight:800,fontSize:11,letterSpacing:2,clipPath:"polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)"}}>ROLE</div>
                        <div style={{width:70,background:T.accent,color:T.bg,padding:"8px 12px",fontFamily:fonts.display,fontWeight:800,fontSize:11,letterSpacing:2,textAlign:"right",clipPath:"polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)"}}>PTS</div>
                      </div>
                      {breakdown.map((p,idx)=>(
                        <div key={p.id} style={{display:"flex",alignItems:"center",padding:"9px 4px",borderBottom:`1px solid ${T.border}`,opacity:p.status==="snatched-out"||p.status==="snatch-returned-in"||p.status==="traded-out"||ruledOut.includes(p.id)?0.65:1}}>
                          <div style={{flex:1,fontFamily:fonts.display,fontWeight:900,fontSize:16,letterSpacing:1,textTransform:"uppercase",
                            color:ruledOut.includes(p.id)?T.danger:p.status==="traded-in"?T.success:p.status==="returned"?T.accent:p.status==="traded-out"?T.danger:idx===0&&p.status==="active"?T.accent:T.text,
                            textDecoration:p.status==="snatched-out"||p.status==="snatch-returned-in"||p.status==="traded-out"||ruledOut.includes(p.id)?"line-through":"none"}}>
                            {p.status==="traded-out"&&<span style={{marginRight:4}}>⬇️</span>}
                            {p.status==="traded-in"&&<span style={{marginRight:4}}>⬆️</span>}
                            {p.status==="returned"&&<span style={{marginRight:4}}>↩️</span>}
                            {ruledOut.includes(p.id)&&<span style={{marginRight:4}}>🚫</span>}
                            {p.name}
                            {p.tier && <span style={{fontSize:9,fontWeight:800,letterSpacing:1,padding:"2px 6px",marginLeft:6,fontFamily:fonts.display,textTransform:"uppercase",background:p.tier==="platinum"?"#4A5E7833":p.tier==="gold"?"#F5A62322":p.tier==="silver"?"#94A3B822":"#CD7F3222",border:`1px solid ${p.tier==="platinum"?"#4A5E7866":p.tier==="gold"?"#F5A62366":p.tier==="silver"?"#94A3B855":"#CD7F3255"}`,color:p.tier==="platinum"?"#B0BEC5":p.tier==="gold"?"#F5A623":p.tier==="silver"?"#94A3B8":"#CD7F32",clipPath:"polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)"}}>{p.tier.toUpperCase()}</span>}
                            {ruledOut.includes(p.id)&&<span style={{fontSize:9,color:T.danger,marginLeft:6,textDecoration:"none",fontWeight:700}}>RULED OUT</span>}
                            {!ruledOut.includes(p.id)&&p.status==="traded-out"&&<span style={{fontSize:9,color:T.danger,marginLeft:6,textDecoration:"none",fontWeight:700}}>→ {p.tradedFor}</span>}
                            {!ruledOut.includes(p.id)&&p.status==="traded-in"&&<span style={{fontSize:9,color:T.success,marginLeft:6,textDecoration:"none",fontWeight:700}}>FROM POOL</span>}
                            {!ruledOut.includes(p.id)&&p.status==="returned"&&<span style={{fontSize:9,color:T.accent,marginLeft:6,textDecoration:"none",fontWeight:700}}>↩ RETURNED</span>}
                            {!ruledOut.includes(p.id)&&p.status==="snatched-out"&&<span style={{fontSize:9,color:T.purple,marginLeft:6,textDecoration:"none",fontWeight:700}}>SNATCHED</span>}
                            {!ruledOut.includes(p.id)&&p.status==="snatched-in"&&<span style={{fontSize:9,color:T.success,marginLeft:6,textDecoration:"none",fontWeight:700}}>ON LOAN</span>}
                            {!ruledOut.includes(p.id)&&p.status==="snatch-returned-in"&&<span style={{fontSize:9,color:T.muted,marginLeft:6,textDecoration:"none"}}>RETURNED</span>}
                            {!ruledOut.includes(p.id)&&p.status==="released"&&<span style={{fontSize:9,color:T.muted,marginLeft:6,textDecoration:"none"}}>RELEASED</span>}
                          </div>
                          <div style={{width:90}}><Badge label={p.role||"—"} color={ROLE_COLORS[p.role]||"#4A5E78"} /></div>
                          <div style={{width:70,textAlign:"right",fontWeight:700,
                            color:ruledOut.includes(p.id)?T.danger:p.status==="traded-in"?T.success:p.status==="returned"?T.accent:p.status==="traded-out"||p.status==="snatched-out"||p.status==="snatch-returned-in"?T.muted:p.total>0?T.text:T.muted,
                            fontFamily:fonts.display,fontSize:17}}>
                            {p.total}
                            {ruledOut.includes(p.id)&&<span style={{fontSize:9,display:"block",color:T.danger,letterSpacing:0.5}}>FROZEN</span>}
                            {!ruledOut.includes(p.id)&&p.status==="traded-in"&&<span style={{fontSize:9,display:"block",color:T.success,letterSpacing:0.5}}>RESET</span>}
                            {!ruledOut.includes(p.id)&&p.status==="returned"&&<span style={{fontSize:9,display:"block",color:T.accent,letterSpacing:0.5}}>BACK</span>}
                            {!ruledOut.includes(p.id)&&p.status==="traded-out"&&<span style={{fontSize:9,display:"block",color:T.danger,letterSpacing:0.5}}>FROZEN</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {isOpen&&breakdown.length===0&&<div style={{padding:"16px 18px",color:T.muted,fontSize:13,borderTop:`1px solid ${T.border}`}}>No players assigned yet.</div>}
                </div>
              );
            })}
          </div>
        </>
      )}
      </div>
      </div>

      {/* LEAGUE RULES PANEL */}
      {showRulesPanel && (
        <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.97)",zIndex:200,overflowY:"auto",padding:24,fontFamily:fonts.body}}>
          <div style={{maxWidth:900,margin:"0 auto"}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
              <button onClick={()=>setShowRulesPanel(false)} style={{background:"transparent",border:"none",color:T.muted,fontSize:22,cursor:"pointer",padding:"0 4px"}}>←</button>
              <div style={{fontFamily:fonts.display,fontSize:26,fontWeight:700,color:T.accent,letterSpacing:2}}>POINTS & RULES</div>
            </div>

            {/* Points System */}
            <div style={{marginBottom:16}}>
              <style>{`
                @media(min-width:600px){.pts-grid{display:grid!important;grid-template-columns:1fr 1fr;gap:10px;}}
                @media(max-width:599px){.pts-grid{display:flex!important;flex-direction:column;gap:8px;}}
              `}</style>
              <div className="pts-grid" style={{marginBottom:10}}>
                {[
                  {label:"🏏 BATTING", color:T.accent, items:[
                    {name:"Per Run", val:pointsConfig.run, unit:"pt", pos:true},
                    {name:"Per Four", val:pointsConfig.four, unit:"pts", pos:true},
                    {name:"Per Six", val:pointsConfig.six, unit:"pts", pos:true},
                    {name:"Half-Century (50+)", val:pointsConfig.fifty, unit:"pts", pos:true},
                    {name:"Century (100+)", val:pointsConfig.century, unit:"pts", pos:true},
                    {name:"SR Bonus (SR>"+pointsConfig.srBonusThreshold+")", val:pointsConfig.srBonus, unit:"pts", pos:true},
                    {name:"Duck Penalty", val:pointsConfig.duckPenalty, unit:"pts", pos:false},
                    {name:"SR Penalty (SR<"+pointsConfig.srPenaltyThreshold+")", val:pointsConfig.srPenalty, unit:"pts", pos:false},
                  ]},
                  {label:"🎳 BOWLING", color:T.info, items:[
                    {name:"Per Wicket", val:pointsConfig.wicket, unit:"pts", pos:true},
                    {name:"4-Wicket Haul", val:pointsConfig.fourWkt, unit:"pts", pos:true},
                    {name:"5-Wicket Haul", val:pointsConfig.fiveWkt, unit:"pts", pos:true},
                    {name:"Economy Bonus (<"+pointsConfig.ecoThreshold+")", val:pointsConfig.ecoBonus, unit:"pts", pos:true},
                    {name:"Maiden Over", val:pointsConfig.maiden, unit:"pts", pos:true},
                    {name:"Economy Penalty (>"+pointsConfig.ecoPenaltyThreshold+")", val:pointsConfig.ecoPenalty, unit:"pts", pos:false},
                  ]},
                  {label:"🧤 FIELDING", color:T.success, items:[
                    {name:"Catch", val:pointsConfig.catch, unit:"pts", pos:true},
                    {name:"Stumping", val:pointsConfig.stumping, unit:"pts", pos:true},
                    {name:"Run-out", val:pointsConfig.runout, unit:"pts", pos:true},
                  ]},
                  {label:"⭐ BONUSES", color:"#A855F7", items:[
                    {name:"All-round ("+pointsConfig.allRoundMinRuns+"+R & "+pointsConfig.allRoundMinWkts+"+W)", val:pointsConfig.allRoundBonus, unit:"pts", pos:true},
                    {name:"Longest Six", val:pointsConfig.longestSix, unit:"pts", pos:true},
                    {name:"Man of the Match", val:pointsConfig.momBonus, unit:"pts", pos:true},
                    {name:"Playing XI", val:pointsConfig.playingXIBonus, unit:"pts", pos:true},
                    {name:"Captain Multiplier", val:pointsConfig.captainMult, unit:"×", pos:true},
                    {name:"VC Multiplier", val:pointsConfig.vcMult, unit:"×", pos:true},
                  ]},
                ].map(section => (
                  <div key={section.label} style={{background:T.card,border:`2px solid ${section.color}33`,borderTop:`3px solid ${section.color}`,borderRadius:0,overflow:"hidden",clipPath:"polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%)"}}>
                    <div style={{background:section.color+"18",padding:"10px 14px",borderBottom:`1px solid ${section.color}33`}}>
                      <div style={{fontFamily:fonts.display,fontSize:16,fontWeight:900,color:section.color,letterSpacing:3,textTransform:"uppercase"}}>{section.label}</div>
                    </div>
                    <div style={{padding:"4px 14px 10px"}}>
                      {section.items.map(item => (
                        <div key={item.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${T.border}22`,opacity:item.val===0?0.3:1}}>
                          <div style={{fontFamily:fonts.body,fontSize:13,color:item.val===0?T.muted:T.text}}>
                            {item.name}
                            {item.val===0 && <span style={{fontSize:10,color:"#2D3E52",marginLeft:6,letterSpacing:1}}>DISABLED</span>}
                          </div>
                          <div style={{fontFamily:fonts.display,fontSize:20,fontWeight:900,color:item.val===0?"#2D3E52":item.pos?"#F5A623":"#FF3D5A",letterSpacing:1}}>
                            {item.pos?"+":"-"}{item.val}
                            <span style={{fontSize:11,color:T.muted,fontWeight:400,marginLeft:2}}>{item.unit}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {(!ruleProposal || ruleProposal.status !== "pending") && (
                <button onClick={()=>withPassword(()=>setShowRulesPanel("points"))} style={{width:"100%",background:T.accentBg,border:`1px solid ${T.accentBorder}`,borderRadius:0,padding:12,color:T.accent,fontFamily:fonts.display,fontWeight:800,fontSize:14,letterSpacing:2,cursor:"pointer",clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)"}}>
                  ✏️ {(!tournamentStarted||!eligibleVoters.length)?"EDIT POINTS — ADMIN":"PROPOSE POINTS CHANGE — NEEDS TEAM VOTE"}
                </button>
              )}
            </div>

            {/* Timing Rules */}
            <div style={{background:T.card,border:`2px solid ${T.border}`,borderTop:`3px solid #4F8EF7`,borderRadius:0,marginBottom:16,overflow:"hidden",clipPath:"polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%)"}}>
              <div style={{background:"#4F8EF718",padding:"10px 14px",borderBottom:"1px solid #4F8EF733"}}>
                <div style={{fontFamily:fonts.display,fontSize:16,fontWeight:900,color:"#4F8EF7",letterSpacing:3}}>⏰ TIMING RULES</div>
              </div>
              <div style={{padding:"4px 14px 10px"}}>
                {[
                  ["Transfer Window", `${pitchConfig?.transferStart || "Sunday 11:59 PM"} → ${pitchConfig?.transferEnd || "Monday 11:00 AM"} IST`],
                  ["Snatch Window", pitchConfig?.snatchWindow ? pitchConfig.snatchWindow.replace(" to ", " → ") + " IST" : "Saturday 12:00 AM → 12:00 PM IST"],
                  ["Snatch Return", `${pitchConfig?.snatchReturn || "Friday 11:58 PM"} IST`],
                ].map(([label, val]) => (
                  <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${T.border}22`}}>
                    <div style={{fontFamily:fonts.body,fontSize:13,color:T.muted,letterSpacing:0.5}}>{label}</div>
                    <div style={{fontFamily:fonts.display,fontSize:15,fontWeight:800,color:T.text,letterSpacing:1}}>{val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pending proposal */}
            {ruleProposal && ruleProposal.status === "pending" && (
              <div style={{background:T.accentBg,borderRadius:12,border:`1px solid ${T.accentBorder}`,padding:20,marginBottom:16}}>
                <div style={{fontSize:11,color:T.accent,letterSpacing:2,fontWeight:700,marginBottom:4}}>⏳ PENDING PROPOSAL</div>
                <div style={{fontSize:11,color:T.muted,marginBottom:12}}>Proposed by {teams.find(t=>t.id===ruleProposal.proposedBy)?.name || "Admin"} • {new Date(ruleProposal.proposedAt).toLocaleDateString()}</div>
                {Object.entries(ruleProposal.changes).map(([key, val]) => (
                  <div key={key} style={{padding:"6px 0",borderBottom:`1px solid ${T.border}33`}}>
                    <div style={{fontSize:11,color:T.muted,marginBottom:key==="Points Change"?6:0}}>{key}</div>
                    {key === "Points Change" ? (() => {
                      try {
                        const proposed = JSON.parse(val);
                        return (
                          <div style={{display:"flex",flexDirection:"column",gap:5}}>
                            {Object.entries(proposed).filter(([k,v]) => pointsConfig[k] !== undefined && pointsConfig[k] !== v).map(([k,v]) => (
                              <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",borderRadius:6,background:"#F5A62318",border:"1px solid #F5A62344"}}>
                                <span style={{fontSize:13,color:T.text,fontWeight:600}}>{k}</span>
                                <span style={{fontSize:14,fontWeight:800,color:"#F5A623"}}>
                                  <span style={{fontSize:12,color:T.muted,fontWeight:400,marginRight:6}}>{pointsConfig[k]} →</span>
                                  {v}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      } catch { return <span style={{fontSize:12,color:T.accent,fontWeight:700}}>{val}</span>; }
                    })() : (
                      <div style={{fontSize:12,color:T.accent,fontWeight:700,textAlign:"right"}}>{val}</div>
                    )}
                  </div>
                ))}
                <div style={{marginTop:12}}>
                  <div style={{fontSize:11,color:T.muted,marginBottom:8}}>VOTES ({Object.keys(ruleProposal.votes).length}/{eligibleVoters.length}):</div>
                  {eligibleVoters.map(t => (
                    <div key={t.id} style={{display:"flex",justifyContent:"space-between",padding:"4px 0"}}>
                      <div style={{fontSize:12,color:t.color}}>{t.name}</div>
                      <div style={{fontSize:12,fontWeight:700,color:ruleProposal.votes[t.id]==="approved"?"#2ECC71":ruleProposal.votes[t.id]==="rejected"?"#FF3D5A":"#4A5E78"}}>{ruleProposal.votes[t.id]||"Pending"}</div>
                    </div>
                  ))}
                </div>
                {myTeam && eligibleVoters.some(t=>t.id===myTeam.id) && !ruleProposal.votes[myTeam.id] && (
                  <div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${T.border}`}}>
                    <div style={{fontSize:12,color:T.text,marginBottom:8}}>Cast your vote as <span style={{color:myTeam.color,fontWeight:700}}>{myTeam.name}</span></div>
                    <input type="password" value={votePin} onChange={e=>{setVotePin(e.target.value);setVotePinErr('');}} placeholder="Enter your team PIN" maxLength={6}
                      style={{width:"100%",background:T.bg,border:"1px solid "+(votePinErr?"#FF3D5A":"#1E2D45"),borderRadius:8,padding:"10px 14px",color:T.text,fontSize:18,letterSpacing:4,textAlign:"center",fontFamily:fonts.display,outline:"none",marginBottom:votePinErr?6:12,boxSizing:"border-box"}} />
                    {votePinErr && <div style={{color:T.danger,fontSize:12,marginBottom:10,textAlign:"center"}}>{votePinErr}</div>}
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>voteOnProposal(false)} style={{flex:1,background:T.dangerBg,border:`1px solid ${T.danger}44`,borderRadius:8,padding:10,color:T.danger,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>✕ REJECT</button>
                      <button onClick={()=>voteOnProposal(true)} style={{flex:1,background:T.successBg,border:`1px solid ${T.success}44`,borderRadius:8,padding:10,color:T.success,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>✓ APPROVE</button>
                    </div>
                  </div>
                )}
                <button onClick={()=>withPassword(()=>updRuleProposal(null))} style={{width:"100%",marginTop:10,background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:8,color:T.muted,fontFamily:fonts.body,fontWeight:700,fontSize:12,cursor:"pointer"}}>CANCEL PROPOSAL (Admin)</button>
              </div>
            )}

            {/* Last approved/rejected */}
            {ruleProposal && ruleProposal.status !== "pending" && (
              <div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,padding:16,marginBottom:16}}>
                <div style={{fontSize:11,color:ruleProposal.status==="approved"?"#2ECC71":"#FF3D5A",letterSpacing:2,fontWeight:700}}>
                  {ruleProposal.status==="approved"?"✓ LAST PROPOSAL APPROVED":"✕ LAST PROPOSAL REJECTED"}
                </div>
              </div>
            )}

            {/* Edit points form */}
            {showRulesPanel === "points" && unlocked && (
              <EditPointsForm config={pointsConfig} onSave={async(cfg)=>{
                if(!tournamentStarted || !eligibleVoters.length) {
                  await savePointsConfig(cfg);
                  setShowRulesPanel(true);
                  alert("Points system updated!");
                } else {
                  await proposeRuleChange({"Points Change": JSON.stringify(cfg)});
                  setShowRulesPanel(true);
                }
              }} onCancel={()=>setShowRulesPanel(true)} />
            )}

            {/* Propose timing change */}
            {showRulesPanel === true && (!ruleProposal || ruleProposal.status !== "pending") && (
              <ProposeRulesForm teams={teams} eligibleVoters={eligibleVoters} tournamentStarted={tournamentStarted} onPropose={proposeRuleChange} withPassword={withPassword} isAdmin={isAdmin}
                onApplyDirect={async (changes) => {
                  const existingConfig = await storeGet("pitchConfig") || {};
                  const newConfig = {
                    ...existingConfig,
                    ...(changes["Transfer Start"] ? { transferStart: changes["Transfer Start"] } : {}),
                    ...(changes["Transfer End"] ? { transferEnd: changes["Transfer End"] } : {}),
                    ...(changes["Snatch Return"] ? { snatchReturn: changes["Snatch Return"] } : {}),
                    ...(changes["Snatch Window"] ? { snatchWindow: changes["Snatch Window"] } : {}),
                  };
                  await storeSet("pitchConfig", newConfig);
                  setPitchConfig(newConfig);
                  if (transfers.phase === 'release') {
                    const resetTransfers = { ...transfers, phase: 'closed', releaseDeadline: null };
                    updTransfers(resetTransfers);
                    pushNotif("system", "✅ Config applied — transfer window closed. Will reopen at new time.", "⚙️");
                  } else {
                    pushNotif("system", "✅ Config applied directly — no vote needed.", "⚙️");
                  }
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
