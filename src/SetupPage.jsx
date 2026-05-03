import React from "react";
import { T, fonts } from "./Theme";
import { Btn, Card } from "./UI.jsx";

export default function SetupPage({ numTeams, setNumTeams, tNames, setTNames, createTeams, storeSet, PALETTE }) {
  return (
    <div className="fade-in">
      <h2 style={{fontFamily:"Rajdhani",fontSize:28,color:T.accent,letterSpacing:2,marginBottom:24}}>LEAGUE SETUP</h2>
      <Card sx={{padding:24,marginBottom:16}}>
        <div style={{fontWeight:700,color:T.muted,letterSpacing:2,fontSize:12,marginBottom:16}}>NUMBER OF TEAMS</div>
        <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:12}}>
          <span style={{fontSize:48,fontFamily:"Rajdhani",fontWeight:800,color:T.accent,minWidth:60}}>{numTeams}</span>
          <input type="range" min={2} max={10} value={numTeams} onChange={e=>{setNumTeams(+e.target.value);storeSet("numteams",+e.target.value);}} style={{flex:1,accentColor:T.accent,height:6}} />
        </div>
        <div style={{display:"flex",justifyContent:"space-between",color:T.muted,fontSize:12}}><span>2 teams</span><span>10 teams</span></div>
      </Card>
      <Card sx={{padding:24,marginBottom:20}}>
        <div style={{fontWeight:700,color:T.muted,letterSpacing:2,fontSize:12,marginBottom:16}}>TEAM NAMES</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12}}>
          {Array.from({length:numTeams},(_,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:PALETTE[i],flexShrink:0}} />
              <input value={tNames[i]} onChange={e=>{const n=[...tNames];n[i]=e.target.value;setTNames(n);}} style={{flex:1,background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 14px",color:T.text,fontSize:15,fontFamily:fonts.body,fontWeight:600}} placeholder={"Team "+(i+1)} />
            </div>
          ))}
        </div>
      </Card>
      <Card sx={{padding:20,marginBottom:20}}>
        <div style={{fontWeight:700,color:T.muted,letterSpacing:2,fontSize:12,marginBottom:14}}>POINTS SYSTEM</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:14,fontSize:13}}>
          {[{title:"🏏 BATTING",items:["1 pt per run","8 pts per four","12 pts per six","+10 for 50+","+20 for 100+"]},{title:"🎳 BOWLING",items:["25 pts per wicket","+8 for 4-wkt haul","+15 for 5+ wickets","+10 econ <6 (min 2 ov)"]},{title:"🧤 FIELDING",items:["8 pts per catch","12 pts stumping","12 pts run-out"]},{title:"⭐ BONUSES",items:["30+ runs & 2+ wkts = +15","Longest six = +50","Captain = 2× pts","VC = 1.5× pts"]}].map(sec=>(
            <div key={sec.title}>
              <div style={{color:T.accent,fontWeight:700,fontSize:12,letterSpacing:1,marginBottom:8}}>{sec.title}</div>
              {sec.items.map(item=><div key={item} style={{color:T.sub,marginBottom:4}}>• {item}</div>)}
            </div>
          ))}
        </div>
      </Card>
      <Btn onClick={createTeams} sx={{width:"100%",padding:"14px",fontSize:17}}>CREATE LEAGUE & CONTINUE →</Btn>
    </div>
  );
}
