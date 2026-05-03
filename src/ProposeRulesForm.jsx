import React, { useState } from "react";
import { T, fonts } from "./Theme";

export default function ProposeRulesForm({ teams, eligibleVoters, onPropose, withPassword, tournamentStarted, isAdmin, onApplyDirect }) {
  const [open, setOpen] = useState(false);
  const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  // Generate all times in 30-min intervals + key times
  const times = (() => {
    const t = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 30) {
        const ampm = h < 12 ? "AM" : "PM";
        const hh = h === 0 ? 12 : h > 12 ? h - 12 : h;
        const mm = m === 0 ? "00" : "30";
        t.push(`${hh}:${mm} ${ampm}`);
      }
    }
    // Add key times not in 30-min grid, inserted in correct position
    const extras = ["11:45 AM","11:58 AM","11:59 AM","11:45 PM","11:58 PM","11:59 PM"];
    extras.forEach(x => { if (!t.includes(x)) t.push(x); });
    return t;
  })();

  const [tsDay, setTsDay] = useState("Sunday");
  const [tsTime, setTsTime] = useState("11:30 PM");
  const [teDay, setTeDay] = useState("Monday");
  const [teTime, setTeTime] = useState("11:00 AM");
  const [ssDay, setSsDay] = useState("Saturday");
  const [ssTime, setSsTime] = useState("12:00 AM");
  const [seDay, setSeDay] = useState("Saturday");
  const [seTime, setSeTime] = useState("12:00 PM");
  const [srDay, setSrDay] = useState("Friday");
  const [srTime, setSrTime] = useState("11:58 PM");

  const dayTime = (day, time) => day + " " + time;

  const hours = ["12","1","2","3","4","5","6","7","8","9","10","11"];
  const minutes = ["00","05","10","15","20","25","30","35","40","45","50","55","58","59"];

  const parseTime = (t) => {
    // Parse "11:30 PM" into {h:"11", m:"30", ampm:"PM"}
    const parts = t.split(" ");
    const ampm = parts[1] || "PM";
    const [h, m] = (parts[0] || "12:00").split(":");
    return { h: h || "12", m: m || "00", ampm };
  };

  const DayTimeRow = ({label, day, setDay, time, setTime}) => {
    const parsed = parseTime(time);
    const setH = h => setTime(`${h}:${parsed.m} ${parsed.ampm}`);
    const setM = m => setTime(`${parsed.h}:${m} ${parsed.ampm}`);
    const setAmpm = a => setTime(`${parsed.h}:${parsed.m} ${a}`);
    return (
      <div style={{marginBottom:12}}>
        <div style={{fontSize:11,color:T.muted,marginBottom:6,letterSpacing:1}}>{label}</div>
        <div style={{display:"flex",gap:6}}>
          <select value={day} onChange={e=>setDay(e.target.value)} style={{flex:"0 0 108px",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 8px",color:T.text,fontSize:12,fontFamily:fonts.body,cursor:"pointer",outline:"none"}}>
            {days.map(d=><option key={d} value={d}>{d}</option>)}
          </select>
          <select value={parsed.h} onChange={e=>setH(e.target.value)} style={{flex:1,background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 6px",color:T.text,fontSize:13,fontFamily:fonts.body,cursor:"pointer",outline:"none"}}>
            {hours.map(h=><option key={h} value={h}>{h}</option>)}
          </select>
          <select value={parsed.m} onChange={e=>setM(e.target.value)} style={{flex:1,background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 6px",color:T.text,fontSize:13,fontFamily:fonts.body,cursor:"pointer",outline:"none"}}>
            {minutes.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
          <select value={parsed.ampm} onChange={e=>setAmpm(e.target.value)} style={{flex:"0 0 60px",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 6px",color:T.text,fontSize:13,fontFamily:fonts.body,cursor:"pointer",outline:"none"}}>
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        </div>
      </div>
    );
  };

  const formRef = React.useRef(null);
  if (!open) return (
    <button onClick={()=>withPassword(()=>{setOpen(true);setTimeout(()=>formRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),50);})} style={{width:"100%",background:T.accentBg,border:`1px solid ${T.accentBorder}`,borderRadius:12,padding:14,color:T.accent,fontFamily:fonts.body,fontWeight:700,fontSize:15,cursor:"pointer"}}>
      ✏️ PROPOSE TIMING CHANGE (Admin)
    </button>
  );

  return (
    <div ref={formRef} style={{background:T.card,borderRadius:12,border:`1px solid ${T.accentBorder}`,padding:20}}>
      <div style={{fontFamily:fonts.display,fontSize:18,fontWeight:700,color:T.accent,letterSpacing:2,marginBottom:4}}>PROPOSE RULE CHANGE</div>
      <div style={{fontSize:11,color:T.muted,marginBottom:16}}>All {eligibleVoters.length} claimed teams must approve for changes to take effect.</div>

      {/* Transfer Window */}
      <div style={{background:T.bg,borderRadius:10,padding:"12px 14px",marginBottom:12,border:`1px solid ${T.border}`}}>
        <div style={{fontSize:11,color:"#4F8EF7",fontWeight:700,letterSpacing:1,marginBottom:10}}>🔄 TRANSFER WINDOW</div>
        <DayTimeRow label="Opens" day={tsDay} setDay={setTsDay} time={tsTime} setTime={setTsTime} />
        <DayTimeRow label="Closes" day={teDay} setDay={setTeDay} time={teTime} setTime={setTeTime} />
      </div>

      {/* Snatch Window */}
      <div style={{background:T.bg,borderRadius:10,padding:"12px 14px",marginBottom:12,border:`1px solid ${T.border}`}}>
        <div style={{fontSize:11,color:"#A855F7",fontWeight:700,letterSpacing:1,marginBottom:10}}>⚡ SNATCH WINDOW</div>
        <DayTimeRow label="Opens" day={ssDay} setDay={setSsDay} time={ssTime} setTime={setSsTime} />
        <DayTimeRow label="Closes" day={seDay} setDay={setSeDay} time={seTime} setTime={setSeTime} />
        <DayTimeRow label="Player Returns" day={srDay} setDay={setSrDay} time={srTime} setTime={setSrTime} />
      </div>

      <div style={{display:"flex",gap:8,marginTop:4}}>
        <button onClick={()=>setOpen(false)} style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:10,color:T.muted,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
        {isAdmin && onApplyDirect && (
          <button onClick={async ()=>{
            await onApplyDirect({
              "Transfer Start": dayTime(tsDay,tsTime),
              "Transfer End": dayTime(teDay,teTime),
              "Snatch Window": dayTime(ssDay,ssTime)+" to "+dayTime(seDay,seTime),
              "Snatch Return": dayTime(srDay,srTime),
            });
            setOpen(false);
          }} style={{flex:1,background:"#4F8EF722",border:"1px solid #4F8EF744",borderRadius:8,padding:10,color:"#4F8EF7",fontFamily:fonts.body,fontWeight:700,fontSize:13,cursor:"pointer"}}>
            🔑 APPLY DIRECT
          </button>
        )}
        <button onClick={()=>{
          onPropose({
            "Transfer Start": dayTime(tsDay,tsTime),
            "Transfer End": dayTime(teDay,teTime),
            "Snatch Window": dayTime(ssDay,ssTime)+" to "+dayTime(seDay,seTime),
            "Snatch Return": dayTime(srDay,srTime),
          });
          setOpen(false);
        }} style={{flex:2,background:"#F5A623",border:"none",borderRadius:8,padding:10,color:T.bg,fontFamily:fonts.body,fontWeight:800,fontSize:14,cursor:"pointer"}}>SUBMIT FOR VOTE</button>
      </div>
    </div>
  );
}
