import React, { useState } from "react";
import { T, fonts } from "./Theme";

const PLAYOFF_ROUNDS = ["q1","elim","q2","final"];
const PLAYOFF_LABELS = { q1:"Qualifier 1", elim:"Eliminator", q2:"Qualifier 2", final:"Final" };
const PLAYOFF_SHORT = { q1:"Q1", elim:"EL", q2:"Q2", final:"🏆" };
const PLAYOFF_COLORS = { q1:"#4F8EF7", elim:"#FF3D5A", q2:"#A855F7", final:"#F5A623" };

function PlayoffSetupModal({ tournament, onSave, onClose }) {
  const existing = tournament.playoffs || {};
  const [enabled, setEnabled] = useState(existing.enabled || false);
  const [rounds, setRounds] = useState({
    q1:   { team1: existing.q1?.team1||"", team2: existing.q1?.team2||"", date: existing.q1?.date||"", time: existing.q1?.time||"07:30 pm", venue: existing.q1?.venue||"", winner: existing.q1?.winner||null, matchId: existing.q1?.matchId||"playoff_q1" },
    elim: { team1: existing.elim?.team1||"", team2: existing.elim?.team2||"", date: existing.elim?.date||"", time: existing.elim?.time||"07:30 pm", venue: existing.elim?.venue||"", winner: existing.elim?.winner||null, matchId: existing.elim?.matchId||"playoff_elim" },
    q2:   { team1: existing.q2?.team1||"", team2: existing.q2?.team2||"", date: existing.q2?.date||"", time: existing.q2?.time||"07:30 pm", venue: existing.q2?.venue||"", winner: existing.q2?.winner||null, matchId: existing.q2?.matchId||"playoff_q2" },
    final:{ team1: existing.final?.team1||"", team2: existing.final?.team2||"", date: existing.final?.date||"", time: existing.final?.time||"07:30 pm", venue: existing.final?.venue||"", winner: existing.final?.winner||null, matchId: existing.final?.matchId||"playoff_final" },
  });

  const setRound = (key, field, val) => setRounds(r => ({...r, [key]: {...r[key], [field]: val}}));
  const inp = (placeholder, val, onChange, w="100%") => (
    <input value={val} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      style={{width:w,background:T.bg,border:`1px solid ${T.border}`,color:T.text,padding:"7px 10px",fontSize:12,fontFamily:fonts.body,outline:"none",boxSizing:"border-box"}} />
  );

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"linear-gradient(135deg,#0f1419 0%,#1a1f2e 100%)",border:`3px solid #F5A623`,maxWidth:560,width:"100%",maxHeight:"90vh",overflowY:"auto",clipPath:"polygon(12px 0%,100% 0%,calc(100% - 12px) 100%,0% 100%)"}}>
        {/* Header */}
        <div style={{background:"linear-gradient(90deg,rgba(245,166,35,0.2),transparent)",borderBottom:"2px solid #F5A62344",padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontFamily:fonts.display,fontSize:16,fontWeight:900,color:"#F5A623",letterSpacing:3}}>🏆 PLAYOFFS SETUP</div>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",marginTop:2,fontFamily:fonts.body,letterSpacing:1}}>{tournament.name}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:11,color:enabled?"#F5A623":"rgba(255,255,255,0.4)",fontFamily:fonts.display,fontWeight:800,letterSpacing:1}}>{enabled?"ON":"OFF"}</span>
              <div onClick={()=>setEnabled(!enabled)} style={{width:40,height:20,background:enabled?"#F5A623":"#2a2f3e",borderRadius:10,cursor:"pointer",position:"relative",transition:"background 0.2s"}}>
                <div style={{position:"absolute",top:2,left:enabled?20:2,width:16,height:16,background:"#fff",borderRadius:"50%",transition:"left 0.2s"}}/>
              </div>
            </div>
            <button onClick={onClose} style={{background:"transparent",border:"none",color:"rgba(255,255,255,0.4)",fontSize:20,cursor:"pointer"}}>×</button>
          </div>
        </div>

        {/* Rounds */}
        <div style={{padding:"16px 20px"}}>
          {PLAYOFF_ROUNDS.map(key => (
            <div key={key} style={{marginBottom:16,background:`${PLAYOFF_COLORS[key]}0A`,border:`2px solid ${PLAYOFF_COLORS[key]}33`,padding:"12px 14px"}}>
              <div style={{fontSize:11,color:PLAYOFF_COLORS[key],fontWeight:900,letterSpacing:2,fontFamily:fonts.display,marginBottom:10}}>{PLAYOFF_SHORT[key]} · {PLAYOFF_LABELS[key].toUpperCase()}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
                {inp("Team 1", rounds[key].team1, v=>setRound(key,"team1",v))}
                {inp("Team 2", rounds[key].team2, v=>setRound(key,"team2",v))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr",gap:6,marginBottom:6}}>
                {inp("Date (YYYY-MM-DD)", rounds[key].date, v=>setRound(key,"date",v))}
                {inp("Time", rounds[key].time, v=>setRound(key,"time",v))}
                {inp("Venue", rounds[key].venue, v=>setRound(key,"venue",v))}
              </div>
              {/* Winner select */}
              {(rounds[key].team1 || rounds[key].team2) && (
                <div style={{display:"flex",gap:6,alignItems:"center",marginTop:4}}>
                  <span style={{fontSize:10,color:"rgba(255,255,255,0.4)",fontFamily:fonts.body,letterSpacing:1}}>WINNER:</span>
                  {["", rounds[key].team1, rounds[key].team2].filter(Boolean).map(t=>(
                    <button key={t} onClick={()=>setRound(key,"winner",t||null)}
                      style={{padding:"4px 10px",fontSize:11,fontWeight:800,fontFamily:fonts.display,cursor:"pointer",border:`2px solid ${rounds[key].winner===t?PLAYOFF_COLORS[key]:"#ffffff22"}`,background:rounds[key].winner===t?`${PLAYOFF_COLORS[key]}33`:"transparent",color:rounds[key].winner===t?PLAYOFF_COLORS[key]:"rgba(255,255,255,0.4)",letterSpacing:0.5}}>
                      {t||"TBD"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{padding:"12px 20px",borderTop:"2px solid #F5A62344",display:"flex",gap:8}}>
          <button onClick={onClose} style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,color:T.muted,padding:"10px",fontFamily:fonts.display,fontWeight:800,fontSize:13,cursor:"pointer",letterSpacing:1}}>CANCEL</button>
          <button onClick={()=>onSave({...rounds,enabled})} style={{flex:2,background:"#F5A623",border:"none",color:"#080C14",padding:"10px",fontFamily:fonts.display,fontWeight:900,fontSize:13,cursor:"pointer",letterSpacing:2}}>SAVE PLAYOFFS</button>
        </div>
      </div>
    </div>
  );
}

function PlayoffBracketModal({ tournament, onClose, unlocked, withPassword, onUpdate }) {
  const pl = tournament.playoffs || {};
  const rounds = {
    q1:    pl.q1    || {},
    elim:  pl.elim  || {},
    q2:    pl.q2    || {},
    final: pl.final || {},
  };

  // Derive Q2 teams from results
  const q2team1 = rounds.q1.winner || (rounds.q1.team1 ? `W: ${rounds.q1.team1}/${rounds.q1.team2}` : "W: Q1");
  const q2team2 = rounds.elim.winner || (rounds.elim.team1 ? `W: ${rounds.elim.team1}/${rounds.elim.team2}` : "W: EL");
  const finalTeam1 = rounds.q1.winner || "W: Q1";
  const finalTeam2 = rounds.q2.winner || "W: Q2";

  const MatchNode = ({ label, color, t1, t2, winner, date, sublabel }) => (
    <div style={{background:"linear-gradient(180deg,#0f1521 0%,#080c14 100%)",border:"1px solid "+color+"44",borderTop:"3px solid "+color,flex:1,minWidth:0,overflow:"hidden"}}>
      <div style={{background:"linear-gradient(90deg,"+color+"18,transparent)",padding:"8px 12px",borderBottom:"1px solid "+color+"22",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:10,fontWeight:900,color:color,fontFamily:fonts.display,letterSpacing:2}}>{label}</div>
          {sublabel&&<div style={{fontSize:8,color:"rgba(255,255,255,0.25)",fontFamily:fonts.body,letterSpacing:1,marginTop:1}}>{sublabel}</div>}
        </div>
        {date&&<div style={{fontSize:9,color:"rgba(255,255,255,0.25)",fontFamily:fonts.body}}>{date}</div>}
      </div>
      {[t1||"TBD",t2||"TBD"].map((team,i)=>{
        const isWin=winner&&winner===team;
        const isTBD=!team||team==="TBD";
        return (
          <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:isWin?("linear-gradient(90deg,"+color+"18,transparent)"):"transparent",borderBottom:i===0?"1px solid rgba(255,255,255,0.05)":"none",position:"relative"}}>
            {isWin&&<div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:color}}/>}
            <div style={{width:34,height:34,borderRadius:"50%",background:isWin?(color+"22"):"rgba(255,255,255,0.04)",border:"2px solid "+(isWin?color:"rgba(255,255,255,0.08)"),display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:900,color:isWin?color:"rgba(255,255,255,0.25)",fontFamily:fonts.display,flexShrink:0}}>
              {isTBD?"?":team.slice(0,3)}
            </div>
            <span style={{fontSize:14,fontWeight:isWin?900:600,color:isWin?color:isTBD?"rgba(255,255,255,0.2)":"rgba(255,255,255,0.75)",fontFamily:fonts.display,letterSpacing:1,textTransform:"uppercase",flex:1}}>{isTBD?"TBD":team}</span>
            {isWin&&<div style={{background:color,padding:"3px 8px",clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)",fontSize:8,fontWeight:900,color:"#080C14",fontFamily:fonts.display,letterSpacing:1.5}}>WIN</div>}
          </div>
        );
      })}
    </div>
  );

  const Arrow = ({vertical=false}) => (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(255,255,255,0.2)",fontSize:vertical?18:14,padding:vertical?"4px 0":"0 4px",flexShrink:0}}>
      {vertical ? "↓" : "→"}
    </div>
  );

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"linear-gradient(135deg,#080c14 0%,#0f1419 50%,#1a1f2e 100%)",border:`3px solid #F5A623`,maxWidth:700,width:"100%",maxHeight:"92vh",overflowY:"auto",clipPath:"polygon(16px 0%,100% 0%,calc(100% - 16px) 100%,0% 100%)",boxShadow:"0 0 60px rgba(245,166,35,0.15)"}}>

        {/* Header */}
        <div style={{background:"linear-gradient(90deg,rgba(245,166,35,0.15),transparent,rgba(245,166,35,0.05))",borderBottom:"2px solid #F5A62344",padding:"20px 24px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontFamily:fonts.display,fontSize:22,fontWeight:900,color:"#F5A623",letterSpacing:4,textTransform:"uppercase"}}>🏆 Playoffs</div>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",marginTop:3,fontFamily:fonts.body,letterSpacing:2,textTransform:"uppercase"}}>{tournament.name} · Road to the Final</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.5)",fontSize:18,cursor:"pointer",padding:"6px 12px",fontFamily:fonts.display}}>✕</button>
        </div>

        {/* Bracket */}
        <div style={{padding:"28px 24px"}}>

          {/* Top legend */}
          <div style={{display:"flex",gap:16,marginBottom:24,flexWrap:"wrap"}}>
            {PLAYOFF_ROUNDS.map(k=>(
              <div key={k} style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:10,height:10,background:PLAYOFF_COLORS[k],clipPath:"polygon(2px 0%,100% 0%,calc(100% - 2px) 100%,0% 100%)"}}/>
                <span style={{fontSize:10,color:PLAYOFF_COLORS[k],fontFamily:fonts.display,fontWeight:800,letterSpacing:1}}>{PLAYOFF_LABELS[k].toUpperCase()}</span>
              </div>
            ))}
          </div>

          {/* Round 1: Q1 + Eliminator */}
          <div style={{fontSize:10,color:"rgba(255,255,255,0.25)",fontFamily:fonts.display,letterSpacing:2,marginBottom:10}}>ROUND 1</div>
          <div style={{display:"flex",gap:8,marginBottom:6,alignItems:"stretch"}}>
            <MatchNode label="QUALIFIER 1" sublabel="Winner → Final · Loser → Q2" color={PLAYOFF_COLORS.q1}
              t1={rounds.q1.team1} t2={rounds.q1.team2} winner={rounds.q1.winner} date={rounds.q1.date} />
            <MatchNode label="ELIMINATOR" sublabel="Winner → Q2 · Loser out" color={PLAYOFF_COLORS.elim}
              t1={rounds.elim.team1} t2={rounds.elim.team2} winner={rounds.elim.winner} date={rounds.elim.date} />
          </div>
          <div style={{display:"flex",gap:8,marginBottom:8}}>
            <div style={{flex:1,textAlign:"center",fontSize:8,color:PLAYOFF_COLORS.q1+"88",fontFamily:fonts.display,letterSpacing:1}}>
              {rounds.q1.winner?"✓ "+rounds.q1.winner+" → FINAL":"WINNER → FINAL"}
            </div>
            <div style={{flex:1,textAlign:"center",fontSize:8,color:PLAYOFF_COLORS.elim+"88",fontFamily:fonts.display,letterSpacing:1}}>
              {rounds.elim.winner?"✓ "+rounds.elim.winner+" → Q2":"WINNER → Q2"}
            </div>
          </div>

          {/* Divider with flow lines */}
          <div style={{display:"flex",alignItems:"center",margin:"16px 0",gap:0}}>
            <div style={{flex:1,height:1,background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)"}}/>
            <div style={{padding:"4px 12px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",fontSize:9,color:"rgba(255,255,255,0.3)",fontFamily:fonts.display,letterSpacing:2}}>ROUND 2</div>
            <div style={{flex:1,height:1,background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)"}}/>
          </div>

          {/* Round 2: Q2 */}
          <div style={{display:"flex",justifyContent:"center",marginBottom:6}}>
            <div style={{width:"50%",minWidth:200}}>
              <MatchNode label="QUALIFIER 2" sublabel="Winner → Final" color={PLAYOFF_COLORS.q2}
                t1={q2team1} t2={q2team2} winner={rounds.q2.winner} date={rounds.q2.date} />
            </div>
          </div>
          <div style={{textAlign:"center",fontSize:8,color:PLAYOFF_COLORS.q2+"88",fontFamily:fonts.display,letterSpacing:1,marginBottom:8}}>
            {rounds.q2.winner?"✓ "+rounds.q2.winner+" → FINAL":"WINNER → FINAL"}
          </div>

          {/* Divider */}
          <div style={{display:"flex",alignItems:"center",margin:"16px 0",gap:0}}>
            <div style={{flex:1,height:1,background:"linear-gradient(90deg,transparent,#F5A62333,transparent)"}}/>
            <div style={{padding:"4px 12px",background:"rgba(245,166,35,0.08)",border:"1px solid #F5A62333",fontSize:9,color:"#F5A623",fontFamily:fonts.display,letterSpacing:2,fontWeight:900}}>🏆 GRAND FINAL</div>
            <div style={{flex:1,height:1,background:"linear-gradient(90deg,transparent,#F5A62333,transparent)"}}/>
          </div>

          {/* Final */}
          <div style={{display:"flex",justifyContent:"center"}}>
            <div style={{width:"60%",minWidth:220}}>
              <MatchNode label="FINAL" color={PLAYOFF_COLORS.final}
                t1={finalTeam1} t2={finalTeam2} winner={rounds.final.winner} date={rounds.final.date} />
            </div>
          </div>

          {/* Champion banner */}
          {rounds.final.winner && (
            <div style={{marginTop:24,background:"linear-gradient(135deg,rgba(245,166,35,0.15),rgba(245,166,35,0.05))",border:"2px solid #F5A623",padding:"16px 20px",textAlign:"center",clipPath:"polygon(12px 0%,100% 0%,calc(100% - 12px) 100%,0% 100%)"}}>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",fontFamily:fonts.display,letterSpacing:3,marginBottom:6}}>IPL 2026 CHAMPION</div>
              <div style={{fontSize:28,fontWeight:900,color:"#F5A623",fontFamily:fonts.display,letterSpacing:4,textTransform:"uppercase"}}>{rounds.final.winner}</div>
              <div style={{fontSize:20,marginTop:4}}>🏆</div>
            </div>
          )}

          {/* Edit button for admin */}
          {unlocked && (
            <div style={{marginTop:20,textAlign:"center"}}>
              <button onClick={()=>withPassword(()=>onUpdate())}
                style={{background:"rgba(245,166,35,0.1)",border:"2px solid #F5A62344",color:"#F5A623",padding:"8px 20px",fontFamily:fonts.display,fontWeight:800,fontSize:11,cursor:"pointer",letterSpacing:2}}>
                ✏️ EDIT BRACKET
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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
  const [playoffSetupTournament, setPlayoffSetupTournament] = useState(null);
  const [playoffBracketTournament, setPlayoffBracketTournament] = useState(null);
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
                <button onClick={e=>{e.stopPropagation();withPassword(()=>setPlayoffSetupTournament(tournament));}}
                    style={{background:tournament.playoffs?.enabled?"#F5A623":"#2a2f3e",border:tournament.playoffs?.enabled?"none":`1px solid #F5A62344`,color:tournament.playoffs?.enabled?"#080C14":"#F5A623",clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)",padding:"6px 10px",cursor:"pointer",fontFamily:fonts.display,fontWeight:800,fontSize:10,letterSpacing:1.5,filter:tournament.playoffs?.enabled?"drop-shadow(2px 2px 0 #8B4500)":"none"}}
                    title="Setup Playoffs Bracket">🏆 PO</button>
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
                {tournament.playoffs?.enabled && (
                  <div style={{marginBottom:8}}>
                    <button onClick={()=>setPlayoffBracketTournament(tournament)}
                      style={{width:"100%",background:"linear-gradient(135deg,rgba(245,166,35,0.12),rgba(245,166,35,0.06))",border:"2px solid #F5A62344",color:"#F5A623",padding:"12px 16px",cursor:"pointer",fontFamily:fonts.display,fontWeight:900,fontSize:13,letterSpacing:3,display:"flex",alignItems:"center",justifyContent:"center",gap:10,clipPath:"polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)"}}>
                      <span style={{fontSize:18}}>🏆</span>
                      <span>VIEW PLAYOFFS BRACKET</span>
                      <span style={{fontSize:18}}>🏆</span>
                    </button>
                  </div>
                )}
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
                        // Playoff label lookup
                        const pl = tournament.playoffs || {};
                        const playoffRound = PLAYOFF_ROUNDS.find(k => pl[k]?.matchId === match.id);
                        const playoffLabel = playoffRound ? PLAYOFF_SHORT[playoffRound] : null;
                        const playoffColor = playoffRound ? PLAYOFF_COLORS[playoffRound] : null;
                        return (
                          <div key={match.id} style={{background:T.bg,borderRadius:0,border:`2px solid ${live?"#FF3D5A":completed?"#2ECC71":"#4A5E78"}`,borderLeft:`5px solid ${live?"#FF3D5A":completed?"#2ECC71":"#4A5E78"}`}}>
                            <div style={{display:"flex",alignItems:"center",padding:"12px 16px",gap:14,cursor:"pointer"}} onClick={()=>setExpandedMatchId(expandedMatchId===match.id?null:match.id)}>
                              <div style={{background:playoffLabel?`${playoffColor}22`:T.card,borderRadius:0,padding:"4px 10px",minWidth:44,textAlign:"center",flexShrink:0,border:`1px solid ${playoffLabel?playoffColor:T.border}`}}>
                                {playoffLabel ? (
                                  <>
                                    <div style={{fontSize:8,color:playoffColor,fontFamily:fonts.display,letterSpacing:1,fontWeight:900}}>PO</div>
                                    <div style={{fontSize:13,fontWeight:900,color:playoffColor,fontFamily:fonts.display,letterSpacing:0.5}}>{playoffLabel}</div>
                                  </>
                                ) : (
                                  <>
                                    <div style={{fontSize:9,color:T.muted,fontFamily:fonts.display,letterSpacing:1}}>M</div>
                                    <div style={{fontSize:18,fontWeight:900,color:T.accent,fontFamily:fonts.display,letterSpacing:1}}>{displayNum}</div>
                                  </>
                                )}
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

      {/* Playoff Setup Modal */}
      {playoffSetupTournament && (
        <PlayoffSetupModal
          tournament={playoffSetupTournament}
          onClose={()=>setPlayoffSetupTournament(null)}
          onSave={(playoffs)=>{
            const updated = tournaments.map(t => t.id===playoffSetupTournament.id ? {...t,playoffs} : t);
            setTournaments(updated);
            storeSet("tournaments", updated);
            setPlayoffSetupTournament(null);
            pushNotif("system","Playoffs bracket updated!","🏆");
          }}
        />
      )}

      {/* Playoff Bracket Modal */}
      {playoffBracketTournament && (
        <PlayoffBracketModal
          tournament={tournaments.find(t=>t.id===playoffBracketTournament.id)||playoffBracketTournament}
          onClose={()=>setPlayoffBracketTournament(null)}
          unlocked={unlocked}
          withPassword={withPassword}
          onUpdate={()=>{
            setPlayoffBracketTournament(null);
            setPlayoffSetupTournament(tournaments.find(t=>t.id===playoffBracketTournament.id)||playoffBracketTournament);
          }}
        />
      )}
    </div>
  );
}
