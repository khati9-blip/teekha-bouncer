import React, { useState } from 'react';
import PlayerImage from './PlayerImage';

export default function DraftPage({
  T,
  fonts,
  players,
  setPlayers,
  teams,
  assignments,
  points,
  matches,
  unlocked,
  user,
  ruledOut,
  safePlayers,
  unsoldPool,
  poolLoading,
  squadView,
  myHighlights,
  myNotes,
  setFetchPlayerModal,
  setEditPlayer,
  setShowAllPlayersModal,
  saveHighlights,
  saveNotes,
  assignPlayer,
  removePlayer,
  toggleSafePlayer,
  toggleRuledOut,
  deletePlayer,
  withPassword,
  removeFromUnsoldPool,
  isPlayerSafeForTeam,
  storeSet,
}) {
  // Local state specific to DraftPage
  const [draftTab, setDraftTab] = useState('players');
  const [showCompare, setShowCompare] = useState(false);
  const [compareTeam, setCompareTeam] = useState("");
  const [compareRole, setCompareRole] = useState("All");
  const [compareTier, setCompareTier] = useState("All");
  const [highlightPlayer, setHighlightPlayer] = useState(null);
  const [selectedBulk, setSelectedBulk] = useState([]);
  const [playerSearch, setPlayerSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState(null);
  const [teamFilter, setTeamFilter] = useState(null);
  const [sortOrder, setSortOrder] = useState('null');
  const [editingNote, setEditingNote] = useState(null);
  const [noteInput, setNoteInput] = useState('');
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [unsoldSearch, setUnsoldSearch] = useState("");
  const [unsoldTierFilter, setUnsoldTierFilter] = useState("All");

  return (
    <div className="fade-in">
      <div style={{marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
          <div style={{display:"inline-block",background:T.accent,padding:"4px 16px 4px 12px",clipPath:"polygon(0 0,100% 0,calc(100% - 10px) 100%,0 100%)"}}>
            <h2 style={{fontFamily:fonts.display,fontSize:28,fontWeight:700,color:T.bg,letterSpacing:3,margin:0}}>PLAYER DRAFT</h2>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button onClick={()=>withPassword(()=>setFetchPlayerModal({tournamentId:null,tournamentName:"General"}))} 
              style={{background:"#4F8EF7",border:"none",color:"#050F14",clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)",padding:"9px 20px",cursor:"pointer",fontFamily:fonts.display,fontWeight:800,fontSize:13,letterSpacing:2,textTransform:"uppercase",filter:"drop-shadow(3px 3px 0 #1E3A5F)"}}>
              🌐 FETCH PLAYERS
            </button>
            <button onClick={()=>withPassword(()=>setEditPlayer({name:"",iplTeam:"",role:"Batsman"}))} 
              style={{background:"transparent",border:`2px solid ${T.accent}`,color:T.accent,clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)",padding:"7px 18px",cursor:"pointer",fontFamily:fonts.display,fontWeight:800,fontSize:13,letterSpacing:2,textTransform:"uppercase"}}>
              ✚ ADD
            </button>
            <button onClick={()=>{setDraftTab("players");setShowAllPlayersModal(true);}} 
              style={{background:squadView?T.accent:"transparent",border:`2px solid ${T.accent}`,color:squadView?T.bg:T.accent,clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)",padding:"7px 18px",cursor:"pointer",fontFamily:fonts.display,fontWeight:800,fontSize:13,letterSpacing:2,textTransform:"uppercase"}}>
              {squadView?"📋 LIST":"🏊 POOL"}
            </button>
          </div>
        </div>
        {/* Draft sub-tabs */}
        <div style={{display:"flex",gap:8,marginTop:12}}>
          {[{id:"players",label:"📋 PLAYERS"},{id:"unsold",label:"🏷️ UNSOLD POOL"}].map(t=>(
            <button key={t.id} onClick={()=>setDraftTab(t.id)}
              style={{flex:1,padding:"10px",border:draftTab===t.id?"none":`2px solid ${T.border}`,cursor:"pointer",fontFamily:fonts.display,fontWeight:800,fontSize:13,letterSpacing:2,textTransform:"uppercase",background:draftTab===t.id?T.accent:"transparent",color:draftTab===t.id?T.bg:T.muted,clipPath:draftTab===t.id?"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)":"none",transition:"all .15s"}}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* UNSOLD POOL TAB */}
      {draftTab==="unsold" && (
        <div>
          {/* COMPARE MODAL */}
          {showCompare && (
            <div onClick={()=>{setShowCompare(false);setHighlightPlayer(null);}} style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.75)",backdropFilter:"blur(8px)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
              <div onClick={e=>e.stopPropagation()} style={{width:"min(760px,95vw)",maxHeight:"85vh",display:"flex",flexDirection:"column",background:"rgba(15,18,28,0.95)",border:`2px solid #6B46C1`,borderTop:`4px solid #9F7AEA`,borderRadius:0,overflow:"hidden",boxShadow:"0 24px 80px rgba(107,70,193,0.4)"}}>
                {/* Header */}
                <div style={{padding:"16px 20px",borderBottom:`1px solid #6B46C133`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{fontFamily:fonts.display,fontWeight:900,fontSize:18,color:"#9F7AEA",letterSpacing:3}}>⚡ COMPARE SQUAD vs POOL</div>
                  <button onClick={()=>{setShowCompare(false);setHighlightPlayer(null);}} style={{background:"transparent",border:"none",color:T.muted,fontSize:20,cursor:"pointer"}}>✕</button>
                </div>
                {/* Filters */}
                <div style={{padding:"12px 20px",borderBottom:`1px solid #6B46C133`,display:"flex",gap:10,flexWrap:"wrap"}}>
                  <select value={compareTeam} onChange={e=>setCompareTeam(e.target.value)}
                    style={{flex:1,minWidth:150,background:"#0A0E14",border:`1px solid #6B46C1`,borderRadius:0,padding:"8px 12px",color:T.text,fontFamily:fonts.display,fontWeight:700,fontSize:12,letterSpacing:1,cursor:"pointer"}}>
                    <option value="">— Pick a team —</option>
                    {teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <select value={compareRole} onChange={e=>setCompareRole(e.target.value)}
                    style={{flex:1,minWidth:120,background:"#0A0E14",border:`1px solid #6B46C1`,borderRadius:0,padding:"8px 12px",color:T.text,fontFamily:fonts.display,fontWeight:700,fontSize:12,letterSpacing:1,cursor:"pointer"}}>
                    <option value="All">Role</option>
                    <option>Batsman</option>
                    <option>Bowler</option>
                    <option>All-Rounder</option>
                    <option>Wicket-Keeper</option>
                  </select>
                  <select value={compareTier} onChange={e=>setCompareTier(e.target.value)}
                    style={{flex:1,minWidth:120,background:"#0A0E14",border:`1px solid #6B46C1`,borderRadius:0,padding:"8px 12px",color:T.text,fontFamily:fonts.display,fontWeight:700,fontSize:12,letterSpacing:1,cursor:"pointer"}}>
                    <option value="All">Category</option>
                    <option value="gold">Gold</option>
                    <option value="silver">Silver</option>
                    <option value="bronze">Bronze</option>
                    <option value="platinum">Platinum</option>
                  </select>
                </div>
                {/* Content */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",flex:1,overflowY:"auto"}}>
                  {/* Left - Team Squad */}
                  <div style={{borderRight:`1px solid #6B46C133`,padding:"12px 16px"}}>
                    <div style={{fontFamily:fonts.display,fontWeight:800,fontSize:11,color:"#9F7AEA",letterSpacing:3,marginBottom:10,textTransform:"uppercase"}}>
                      {compareTeam ? teams.find(t=>t.id===compareTeam)?.name + " SQUAD" : "SELECT A TEAM"}
                    </div>
                    {compareTeam ? players.filter(p=>{
                      if(assignments[p.id]!==compareTeam) return false;
                      if(compareRole!=="All" && p.role!==compareRole) return false;
                      if(compareTier!=="All" && p.tier!==compareTier) return false;
                      return true;
                    }).map(p=>(
                      <div key={p.id} onClick={()=>setHighlightPlayer(highlightPlayer?.id===p.id?null:p)} style={{padding:"8px 10px",marginBottom:6,background:highlightPlayer?.id===p.id?"rgba(159,122,234,0.25)":"rgba(159,122,234,0.08)",border:`1px solid ${highlightPlayer?.id===p.id?"#9F7AEA":"#6B46C133"}`,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",transition:"all 0.2s"}}>
                        <div>
                          <div style={{fontFamily:fonts.display,fontWeight:700,fontSize:13,color:T.text}}>{p.name}</div>
                          <div style={{fontFamily:fonts.body,fontSize:10,color:T.muted}}>{p.iplTeam} · {p.role}</div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          {(()=>{const t=Object.values(points[p.id]||{}).reduce((s,d)=>s+(d.base||0),0);return t>0?<div style={{background:"#FF6B0022",border:"1px solid #FF6B0088",clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)",padding:"2px 8px",display:"flex",alignItems:"center",gap:3}}><span style={{fontFamily:fonts.display,fontWeight:900,fontSize:12,color:"#FF8C00"}}>{t}</span><span style={{fontFamily:fonts.display,fontSize:8,color:"#FF6B0088"}}>PTS</span></div>:null;})()}
                          {p.tier&&<span style={{background:p.tier==="gold"?"#F5A62322":p.tier==="silver"?"#94A3B822":p.tier==="bronze"?"#CD7F3222":"#4A5E7833",border:`1px solid ${p.tier==="gold"?"#F5A62366":p.tier==="silver"?"#94A3B855":p.tier==="bronze"?"#CD7F3255":"#4A5E7866"}`,color:p.tier==="gold"?"#F5A623":p.tier==="silver"?"#94A3B8":p.tier==="bronze"?"#CD7F32":"#B0BEC5",fontFamily:fonts.display,fontWeight:800,fontSize:10,letterSpacing:1.5,padding:"2px 8px",clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)"}}>{p.tier.toUpperCase()}</span>}
                        </div>
                      </div>
                    )) : <div style={{color:T.muted,fontSize:12,fontFamily:fonts.body,padding:20,textAlign:"center"}}>Pick a team to see their squad</div>}
                  </div>
                  {/* Right - Unsold Pool */}
                  <div style={{padding:"12px 16px"}}>
                    <div style={{fontFamily:fonts.display,fontWeight:800,fontSize:11,color:"#F5A623",letterSpacing:3,marginBottom:10,textTransform:"uppercase"}}>UNSOLD POOL</div>
                    {players.filter(p=>{
                      if(!unsoldPool.includes(p.id)) return false;
                      if(compareRole!=="All" && p.role!==compareRole) return false;
                      if(compareTier!=="All" && p.tier!==compareTier) return false;
                      return true;
                    }).map(p=>(
                      <div key={p.id} style={{padding:"8px 10px",marginBottom:6,background:highlightPlayer&&p.role===highlightPlayer.role&&(p.tier===highlightPlayer.tier||["bronze","silver","gold","platinum"].indexOf(p.tier)<=["bronze","silver","gold","platinum"].indexOf(highlightPlayer.tier))?"rgba(245,166,35,0.25)":"rgba(245,166,35,0.04)",border:`1px solid ${highlightPlayer&&p.role===highlightPlayer.role&&(p.tier===highlightPlayer.tier||["bronze","silver","gold","platinum"].indexOf(p.tier)<=["bronze","silver","gold","platinum"].indexOf(highlightPlayer.tier))?"#F5A623":"#F5A62322"}`,display:"flex",justifyContent:"space-between",alignItems:"center",transition:"all 0.2s"}}>
                        <div>
                          <div style={{fontFamily:fonts.display,fontWeight:700,fontSize:13,color:T.text}}>{p.name}</div>
                          <div style={{fontFamily:fonts.body,fontSize:10,color:T.muted}}>{p.iplTeam} · {p.role}</div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                          {(()=>{const totalPts=Object.values(points[p.id]||{}).reduce((s,d)=>s+(d.base||0),0);if(!totalPts)return null;return(<div style={{background:"#FF6B0022",border:"1px solid #FF6B0088",clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)",padding:"2px 8px",display:"flex",alignItems:"center",gap:4}}><span style={{fontFamily:fonts.display,fontWeight:900,fontSize:12,color:"#FF8C00"}}>{totalPts}</span><span style={{fontFamily:fonts.display,fontWeight:700,fontSize:8,color:"#FF6B0088",letterSpacing:1}}>PTS</span></div>);})()}
                          {p.tier && <span style={{background:p.tier==="gold"?"#F5A62322":p.tier==="silver"?"#94A3B822":p.tier==="bronze"?"#CD7F3222":"#4A5E7833",border:`1px solid ${p.tier==="gold"?"#F5A62366":p.tier==="silver"?"#94A3B855":p.tier==="bronze"?"#CD7F3255":"#4A5E7866"}`,color:p.tier==="gold"?"#F5A623":p.tier==="silver"?"#94A3B8":p.tier==="bronze"?"#CD7F32":"#B0BEC5",fontFamily:fonts.display,fontWeight:800,fontSize:10,letterSpacing:1.5,padding:"2px 8px",clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)"}}>{p.tier.toUpperCase()}</span>}
                        </div>

                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* Info banner */}
          <div style={{background:"#6B46C133",border:`2px solid #6B46C1`,borderLeft:`5px solid #6B46C1`,borderRadius:0,padding:"14px 18px",marginBottom:20,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
            <div>
              <div style={{fontFamily:fonts.display,fontWeight:800,color:"#9F7AEA",fontSize:14,letterSpacing:1.5,textTransform:"uppercase"}}>📦 UNSOLD POOL</div>
              <div style={{color:T.muted,fontSize:11,marginTop:3,fontFamily:fonts.body}}>Players available for pickup during transfer window</div>
            </div>
            <button onClick={()=>setShowCompare(true)} style={{background:"#9F7AEA",border:"none",color:T.bg,clipPath:"polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)",padding:"9px 18px",cursor:"pointer",fontFamily:fonts.display,fontWeight:800,fontSize:12,letterSpacing:1.5,textTransform:"uppercase",filter:"drop-shadow(3px 3px 0 #5B2C91)"}}>
              ⚡ COMPARE
            </button>
          </div>
          {/* Filters */}
          <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
            <input placeholder="🔍 Search players..." value={unsoldSearch} onChange={e=>setUnsoldSearch(e.target.value)} style={{flex:1,minWidth:200,background:T.card,border:`2px solid ${T.border}`,borderRadius:0,padding:"10px 14px",color:T.text,fontSize:13,fontFamily:fonts.body,outline:"none"}} />
            <select value={unsoldTierFilter} onChange={e=>setUnsoldTierFilter(e.target.value)} style={{background:T.card,border:`2px solid ${T.border}`,borderRadius:0,padding:"10px 14px",color:T.text,fontSize:13,fontFamily:fonts.display,fontWeight:700,letterSpacing:1,cursor:"pointer"}}>
              <option value="All">All Tiers</option>
              <option value="platinum">Platinum</option>
              <option value="gold">Gold</option>
              <option value="silver">Silver</option>
              <option value="bronze">Bronze</option>
            </select>
          </div>
          {/* Grid */}
          {poolLoading ? (
            <div style={{padding:40,textAlign:"center",color:T.muted,fontFamily:fonts.body}}>Loading unsold pool...</div>
          ) : (
            (() => {
              const filtered = players.filter(p => {
                if (!unsoldPool.includes(p.id)) return false;
                if (unsoldSearch && !p.name.toLowerCase().includes(unsoldSearch.toLowerCase()) && !(p.iplTeam||"").toLowerCase().includes(unsoldSearch.toLowerCase())) return false;
                if (unsoldTierFilter !== "All" && p.tier !== unsoldTierFilter) return false;
                return true;
              }).sort((a,b)=>{
                const pA = Object.values(points[a.id]||{}).reduce((s,d)=>s+(d?.base||0),0);
                const pB = Object.values(points[b.id]||{}).reduce((s,d)=>s+(d?.base||0),0);
                return pB - pA;
              });

              const tierGroups = {platinum:[],gold:[],silver:[],bronze:[],untiered:[]};
              filtered.forEach(p=>{
                if(p.tier==="platinum") tierGroups.platinum.push(p);
                else if(p.tier==="gold") tierGroups.gold.push(p);
                else if(p.tier==="silver") tierGroups.silver.push(p);
                else if(p.tier==="bronze") tierGroups.bronze.push(p);
                else tierGroups.untiered.push(p);
              });

              return Object.entries(tierGroups).map(([tier,pList])=>{
                if(pList.length===0) return null;
                const tierColors = {platinum:["#4A5E78","#B0BEC5","#4A5E7833","#4A5E7866"],gold:["#F5A623","#F5A623","#F5A62322","#F5A62366"],silver:["#94A3B8","#94A3B8","#94A3B822","#94A3B855"],bronze:["#CD7F32","#CD7F32","#CD7F3222","#CD7F3255"],untiered:["#6B46C1","#9F7AEA","#6B46C122","#6B46C144"]};
                const [borderCol,textCol,bg,borderSolid] = tierColors[tier];
                return (
                  <div key={tier} style={{marginBottom:28}}>
                    <div style={{background:bg,border:`2px solid ${borderSolid}`,borderLeft:`5px solid ${borderCol}`,borderRadius:0,padding:"10px 16px",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <div style={{fontFamily:fonts.display,fontWeight:800,fontSize:13,color:textCol,letterSpacing:2,textTransform:"uppercase"}}>
                        {tier==="untiered"?"NO TIER":tier} ({pList.length})
                      </div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12}}>
                      {pList.map(p=>{
                        const pid = p.id;
                        const totalPts = Object.values(points[pid]||{}).reduce((s,d)=>s+(d.base||0),0);
                        const matchesPlayed = Object.keys(points[pid]||{}).length;
                        const releasedByTeam = (() => {
                          const assigned = Object.keys(assignments).find(k => assignments[k] && players.find(pl=>pl.id===k));
                          if (!assigned) return null;
                          const team = teams.find(t => t.id === assignments[assigned]);
                          return team || null;
                        })();

                        return (
                          <div key={pid} style={{
                            background:T.card,
                            border:`2px solid ${borderSolid}`,
                            borderLeft:`5px solid ${borderCol}`,
                            borderRadius:0,
                            padding:"14px 16px",
                            display:"flex",
                            flexDirection:"column",
                            gap:10,
                            flexWrap:"wrap",
                            position:"relative",
                            overflow:"hidden"
                          }}>
                            {/* Player info */}
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:6}}>
                                <span style={{fontFamily:fonts.display,fontSize:16,fontWeight:900,color:myHighlights[pid]?"#F5A623":T.text,letterSpacing:1,textTransform:"uppercase"}}>
                                  {p.name}
                                </span>
                                {p.tier && (
                                  <span style={{fontSize:11,fontWeight:900,letterSpacing:2,padding:"4px 10px",fontFamily:fonts.display,textTransform:"uppercase",background:p.tier==="platinum"?"#4A5E7844":p.tier==="gold"?"#F5A62333":p.tier==="silver"?"#94A3B833":"#CD7F3233",border:`2px solid ${p.tier==="platinum"?"#4A5E78":p.tier==="gold"?"#F5A623":p.tier==="silver"?"#94A3B8":"#CD7F32"}`,color:p.tier==="platinum"?"#B0BEC5":p.tier==="gold"?"#F5A623":p.tier==="silver"?"#94A3B8":"#CD7F32",clipPath:"polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)",filter:"drop-shadow(2px 2px 0 rgba(0,0,0,0.5))"}}>
                                    {p.tier==="platinum"?"PLATINUM":p.tier==="gold"?"GOLD":p.tier==="silver"?"SILVER":"BRONZE"}
                                  </span>
                                )}
                                {releasedByTeam && (
                                  <span style={{fontSize:11,fontWeight:900,letterSpacing:1.5,padding:"4px 10px",fontFamily:fonts.display,background:releasedByTeam.color+"22",border:`2px solid ${releasedByTeam.color}`,color:releasedByTeam.color,clipPath:"polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)",display:"flex",alignItems:"center",gap:6}}>
                                    <span style={{width:6,height:6,borderRadius:"50%",background:releasedByTeam.color}}/>
                                    {releasedByTeam.name.toUpperCase()}
                                  </span>
                                )}
                                {!releasedByTeam && (
                                  <span style={{fontSize:10,fontWeight:800,letterSpacing:1.5,padding:"3px 8px",fontFamily:fonts.display,background:"#6B46C122",border:`1px solid #6B46C144`,color:"#9F7AEA"}}>UNSOLD</span>
                                )}
                              </div>
                              <div style={{fontSize:11,color:T.muted,fontFamily:fonts.body,marginBottom:4}}>
                                {p.iplTeam} • {p.role}
                              </div>
                              {(() => {
                                if(totalPts === 0 && matchesPlayed === 0) return null;
                                return (
                                  <div style={{display:"inline-flex",alignItems:"center",gap:6,marginBottom:6,marginTop:2}}>
                                    <div style={{background:"linear-gradient(135deg,#FF6B0022,#FF8C0022)",border:"2px solid #FF6B00",clipPath:"polygon(5px 0%,100% 0%,calc(100% - 5px) 100%,0% 100%)",padding:"3px 10px",display:"flex",alignItems:"center",gap:5}}>
                                      <span style={{fontFamily:fonts.display,fontWeight:900,fontSize:14,color:"#FF8C00",letterSpacing:1}}>{totalPts}</span>
                                      <span style={{fontFamily:fonts.display,fontWeight:700,fontSize:9,color:"#FF6B0099",letterSpacing:1.5,textTransform:"uppercase"}}>PTS</span>
                                    </div>
                                    {matchesPlayed > 0 && (
                                      <span style={{fontFamily:fonts.body,fontSize:10,color:T.muted}}>
                                        {matchesPlayed} match{matchesPlayed>1?"es":""}
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                              {myNotes[pid]&&editingNote!==pid&&(
                                <div style={{fontSize:11,color:"#4299E1",marginTop:6,fontStyle:"italic",background:"#4299E122",border:`1px solid #4299E144`,borderRadius:0,padding:"4px 10px",display:"inline-block"}}>
                                  📝 "{myNotes[pid]}"
                                </div>
                              )}
                              {editingNote===pid&&(
                                <div style={{display:"flex",gap:8,marginTop:8}}>
                                  <input autoFocus value={noteInput} onChange={e=>setNoteInput(e.target.value)}
                                    onKeyDown={async e=>{
                                      if(e.key==="Enter"){const u={...myNotes,[pid]:noteInput.trim()};if(!noteInput.trim())delete u[pid];await saveNotes(u);setEditingNote(null);}
                                      if(e.key==="Escape")setEditingNote(null);
                                    }}
                                    placeholder="Private note..." maxLength={100}
                                    style={{flex:1,background:T.bg,border:`2px solid #4299E1`,borderRadius:0,padding:"6px 10px",color:T.text,fontSize:12,fontFamily:fonts.body,outline:"none"}}
                                  />
                                  <button onClick={async()=>{const u={...myNotes,[pid]:noteInput.trim()};if(!noteInput.trim())delete u[pid];await saveNotes(u);setEditingNote(null);}}
                                    style={{background:"#4299E1",border:"none",borderRadius:0,padding:"6px 14px",color:T.bg,fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:fonts.display,letterSpacing:1,clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)"}}>
                                    SAVE
                                  </button>
                                  <button onClick={()=>setEditingNote(null)}
                                    style={{background:"transparent",border:`2px solid ${T.border}`,borderRadius:0,padding:"6px 10px",color:T.muted,fontSize:12,cursor:"pointer"}}>
                                    ✕
                                  </button>
                                </div>
                              )}
                            </div>
                            {/* Action buttons */}
                            <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
                              <button onClick={async()=>{const u={...myHighlights};u[pid]?delete u[pid]:u[pid]=true;await saveHighlights(u);}}
                                style={{background:myHighlights[pid]?"#F5A62333":"transparent",border:`2px solid ${myHighlights[pid]?"#F5A623":T.border}`,borderRadius:0,padding:"8px 12px",cursor:"pointer",fontSize:16,transition:"all .2s"}}
                                onMouseEnter={e => e.currentTarget.style.transform = "scale(1.1)"}
                                onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
                                {myHighlights[pid]?"⭐":"☆"}
                              </button>
                              <button onClick={()=>{setNoteInput(myNotes[pid]||"");setEditingNote(pid);}}
                                style={{background:myNotes[pid]?"#4299E133":"transparent",border:`2px solid ${myNotes[pid]?"#4299E1":T.border}`,borderRadius:0,padding:"8px 12px",cursor:"pointer",fontSize:14,transition:"all .2s"}}
                                onMouseEnter={e => e.currentTarget.style.transform = "scale(1.1)"}
                                onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
                                📝
                              </button>
                              {unlocked&&(
                                <button onClick={()=>removeFromUnsoldPool(pid)}
                                  style={{background:T.dangerBg,border:`2px solid ${T.danger}`,color:T.danger,borderRadius:0,padding:"8px 12px",cursor:"pointer",fontSize:12,fontFamily:fonts.display,fontWeight:800,letterSpacing:1,clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)"}}>
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          )}
        </div>
      )}

      {/* PLAYERS TAB */}
      {draftTab==="players" && <>
        {/* Lock/Unlock Banner */}
        <div style={{background:unlocked?"#2ECC7115":"#F5A62315",border:`2px solid ${unlocked?"#2ECC71":"#F5A623"}`,borderRadius:0,padding:"14px 18px",marginBottom:20,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",borderLeft:`5px solid ${unlocked?"#2ECC71":"#F5A623"}`}}>
          <div>
            <div style={{fontFamily:fonts.display,fontWeight:800,color:unlocked?"#2ECC71":"#F5A623",fontSize:16,letterSpacing:2,textTransform:"uppercase"}}>{unlocked?"🔓 Squad Changes Unlocked":"🔒 Squad Changes Locked"}</div>
            <div style={{color:T.muted,fontSize:11,marginTop:3,fontFamily:fonts.body,letterSpacing:0.5}}>{unlocked?"Assign, replace or remove freely":"Password required to modify squads"}</div>
          </div>
          <button onClick={()=>{if(unlocked)withPassword(()=>{});}} style={{background:unlocked?"#FF3D5A":"#F5A623",border:"none",color:unlocked?"#fff":T.bg,clipPath:"polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)",padding:"10px 20px",fontFamily:fonts.display,fontWeight:800,fontSize:13,letterSpacing:2,textTransform:"uppercase",cursor:"pointer",filter:unlocked?"drop-shadow(3px 3px 0 #8B0000)":"drop-shadow(3px 3px 0 #8B4500)"}}>
            {unlocked?"LOCK":"UNLOCK"}
          </button>
        </div>

        {/* TWO COLUMN LAYOUT */}
        <div style={{display:"flex",gap:16,alignItems:"start"}}>
          {/* Left - Filters */}
          <div style={{minWidth:200,position:"sticky",top:20}}>
            <div style={{background:T.card,border:`2px solid ${T.border}`,borderRadius:0,padding:16}}>
              <div style={{fontFamily:fonts.display,fontSize:14,fontWeight:800,color:T.accent,letterSpacing:2,marginBottom:14,textTransform:"uppercase"}}>FILTERS</div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <input placeholder="🔍 Search..." value={playerSearch} onChange={e=>setPlayerSearch(e.target.value)} style={{background:T.bg,border:`2px solid ${T.border}`,borderRadius:0,padding:"8px 12px",color:T.text,fontSize:12,fontFamily:fonts.body,outline:"none"}} />
                <select value={roleFilter||"All"} onChange={e=>setRoleFilter(e.target.value==="All"?null:e.target.value)} style={{background:T.bg,border:`2px solid ${T.border}`,borderRadius:0,padding:"8px 12px",color:T.text,fontSize:12,fontFamily:fonts.display,fontWeight:700,letterSpacing:1,cursor:"pointer"}}>
                  <option value="All">All Roles</option>
                  <option>Batsman</option>
                  <option>Bowler</option>
                  <option>All-Rounder</option>
                  <option>Wicket-Keeper</option>
                </select>
                <select value={teamFilter||"all"} onChange={e=>setTeamFilter(e.target.value==="all"?null:e.target.value)} style={{background:T.bg,border:`2px solid ${T.border}`,borderRadius:0,padding:"8px 12px",color:T.text,fontSize:12,fontFamily:fonts.display,fontWeight:700,letterSpacing:1,cursor:"pointer"}}>
                  <option value="all">All Teams</option>
                  <option value="unassigned">Unassigned</option>
                  {teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Right - Players List */}
          <div style={{flex:1}}>
            {/* Bulk actions bar */}
            {unlocked && selectedBulk.length > 0 && (
              <div style={{background:T.accentBg,padding:"12px 24px",borderBottom:`2px solid ${T.accentBorder}`,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <div style={{fontSize:13,color:T.accent,fontWeight:700,fontFamily:fonts.display,letterSpacing:1}}>{selectedBulk.length} SELECTED</div>
                {[["platinum","PLATINUM","#B0BEC5","#4A5E7833","#4A5E7866"],["gold","GOLD","#F5A623","#F5A62322","#F5A62366"],["silver","SILVER","#94A3B8","#94A3B822","#94A3B855"],["bronze","BRONZE","#CD7F32","#CD7F3222","#CD7F3255"]].map(([t,label,col,bg,br])=>(
                  <button key={t} onClick={()=>{const updated=players.map(p=>selectedBulk.includes(p.id)?{...p,tier:t}:p);setPlayers(updated);storeSet("players",updated);setSelectedBulk([]);}} style={{background:bg,border:`2px solid ${br}`,borderRadius:0,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:800,fontFamily:fonts.display,color:col,letterSpacing:1.5,clipPath:"polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)"}}>{label}</button>
                ))}
                <button onClick={()=>{const updated=players.map(p=>selectedBulk.includes(p.id)?{...p,tier:""}:p);setPlayers(updated);storeSet("players",updated);setSelectedBulk([]);}} style={{background:"transparent",border:`2px solid ${T.border}`,borderRadius:0,padding:"6px 12px",cursor:"pointer",fontSize:11,fontFamily:fonts.display,color:T.muted,letterSpacing:1.5}}>CLEAR TIER</button>
                <button onClick={()=>setSelectedBulk([])} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:11,marginLeft:"auto",fontFamily:fonts.display,letterSpacing:1}}>DESELECT ALL</button>
              </div>
            )}

            {/* Players list */}
            <div style={{padding:"20px 24px",overflowY:"auto",maxHeight:"calc(90vh - 240px)"}}>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {(() => {
                  // Filter players
                  let filteredPlayers = players.filter(p => {
                    if (playerSearch && !p.name.toLowerCase().includes(playerSearch.toLowerCase()) && !p.iplTeam.toLowerCase().includes(playerSearch.toLowerCase())) return false;
                    if (roleFilter && p.role !== roleFilter) return false;
                    if (teamFilter && teamFilter !== "unassigned" && assignments[p.id] !== teamFilter) return false;
                    if (teamFilter === "unassigned" && assignments[p.id]) return false;
                    return true;
                  });
                  
                  return filteredPlayers.map(p => {
                    const aTeam = teams.find(t=>t.id===assignments[p.id]);
                    const isAssigned = !!assignments[p.id];
                    const isRuledOut = ruledOut.includes(p.id);
                    const isSafe = isAssigned && isPlayerSafeForTeam(assignments[p.id], p.id);
                    
                    return (
                      <div key={p.id} style={{
                        padding:"12px 16px",
                        background:T.card,
                        borderRadius:0,
                        borderLeft:`5px solid ${isRuledOut?T.danger:aTeam?aTeam.color:T.border}`,
                        border:`2px solid ${isRuledOut?T.danger+"44":aTeam?aTeam.color+"44":T.border}`,
                        display:"flex",
                        alignItems:"center",
                        gap:12,
                        flexWrap:"wrap"
                      }}>
                        {/* Checkbox */}
                        {unlocked && (
                          <input type="checkbox" checked={selectedBulk.includes(p.id)} onChange={e=>setSelectedBulk(prev=>e.target.checked?[...prev,p.id]:prev.filter(x=>x!==p.id))} style={{width:16,height:16,cursor:"pointer",accentColor:T.accent,flexShrink:0}} />
                        )}
                        
                        {/* Player info */}
                        <div style={{flex:1,minWidth:200}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
                            <span style={{fontFamily:fonts.display,fontSize:15,fontWeight:800,color:isRuledOut?T.danger:T.text,letterSpacing:1,textDecoration:isRuledOut?"line-through":"none"}}>{p.name}</span>
                            {p.tier && <span style={{fontSize:9,fontWeight:800,letterSpacing:1,padding:"2px 6px",fontFamily:fonts.display,textTransform:"uppercase",background:p.tier==="platinum"?"#4A5E7833":p.tier==="gold"?"#F5A62322":p.tier==="silver"?"#94A3B822":"#CD7F3222",border:`1px solid ${p.tier==="platinum"?"#4A5E7866":p.tier==="gold"?"#F5A62366":p.tier==="silver"?"#94A3B855":"#CD7F3255"}`,color:p.tier==="platinum"?"#B0BEC5":p.tier==="gold"?"#F5A623":p.tier==="silver"?"#94A3B8":"#CD7F32"}}>{p.tier.toUpperCase()}</span>}
                            {isRuledOut && <span style={{fontSize:10,background:T.dangerBg,color:T.danger,padding:"2px 6px",fontFamily:fonts.display,fontWeight:800,letterSpacing:1}}>🚫 RULED OUT</span>}
                            {isSafe && <span style={{fontSize:10,background:"#2ECC7122",border:"1px solid #2ECC7144",color:"#2ECC71",padding:"2px 6px",fontFamily:fonts.display,fontWeight:700,letterSpacing:1}}>🛡️ SAFE</span>}
                          </div>
                          <div style={{fontSize:11,color:T.muted,fontFamily:fonts.body}}>
                            {p.iplTeam} • {p.role} {isAssigned && <span style={{marginLeft:8,color:aTeam?.color,fontWeight:700}}>→ {aTeam?.name}</span>}
                          </div>
                        </div>

                        {/* Team assignment */}
                        <select
                          value={assignments[p.id]||""}
                          onChange={e=>assignPlayer(p.id,e.target.value)}
                          disabled={!unlocked}
                          style={{background:aTeam?aTeam.color+"22":T.card,border:`2px solid ${aTeam?aTeam.color:T.border}`,borderRadius:0,padding:"8px 12px",color:aTeam?aTeam.color:T.muted,fontSize:12,fontFamily:fonts.display,fontWeight:700,letterSpacing:1,cursor:unlocked?"pointer":"not-allowed",minWidth:150,opacity:unlocked?1:0.6}}
                        >
                          <option value="">{isAssigned?"Move to…":"— Assign —"}</option>
                          {teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>

                        {/* Action buttons */}
                        {unlocked && (
                          <div style={{display:"flex",gap:6,flexShrink:0}}>
                            {isAssigned && (
                              <button onClick={()=>removePlayer(p.id)} style={{background:T.dangerBg,border:`2px solid ${T.danger}`,color:T.danger,borderRadius:0,padding:"6px 10px",cursor:"pointer",fontSize:12,fontFamily:fonts.display,fontWeight:700}}>✕</button>
                            )}
                            <button onClick={()=>{console.log("Edit button clicked", p); setEditPlayer(p);}} style={{background:T.infoBg,border:`2px solid ${T.info}`,color:T.info,borderRadius:0,padding:"6px 10px",cursor:"pointer",fontSize:12,fontFamily:fonts.display,fontWeight:700}}>✏️</button>
                            {isAssigned && (
                              <button onClick={()=>toggleSafePlayer(assignments[p.id],p.id)} style={{background:isSafe?"#2ECC7133":"transparent",border:`2px solid ${isSafe?"#2ECC71":T.border}`,color:isSafe?"#2ECC71":T.muted,borderRadius:0,padding:"6px 10px",cursor:"pointer",fontSize:12}}>🛡️</button>
                            )}
                            <button onClick={()=>withPassword(()=>toggleRuledOut(p.id))} style={{background:isRuledOut?T.dangerBg:"transparent",border:`2px solid ${T.danger}`,color:T.danger,borderRadius:0,padding:"6px 10px",cursor:"pointer",fontSize:12,fontFamily:fonts.display,fontWeight:700}}>🚫</button>
                            <button onClick={()=>deletePlayer(p.id)} style={{background:T.dangerBg,border:`2px solid ${T.danger}`,color:T.danger,borderRadius:0,padding:"6px 10px",cursor:"pointer",fontSize:11,fontFamily:fonts.display,fontWeight:700}}>🗑️</button>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        </div>
      </>}
    </div>
  );
}
