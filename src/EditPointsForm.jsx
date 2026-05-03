import React, { useState } from "react";
import { T, fonts } from "./Theme";

export default function EditPointsForm({ config, onSave, onCancel }) {
  const [cfg, setCfg] = useState({...config});
  const field = (label, key, step) => (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${T.border}33`}}>
      <div style={{fontSize:12,color:T.muted,flex:1}}>{label}</div>
      <input type="number" value={cfg[key]} step={step||1} min={0}
        onChange={e=>setCfg(prev=>({...prev,[key]:parseFloat(e.target.value)||0}))}
        style={{width:64,background:T.bg,border:`1px solid ${T.border}`,borderRadius:6,padding:"4px 8px",color:T.accent,fontSize:14,fontFamily:fonts.display,fontWeight:700,textAlign:"center",outline:"none"}} />
    </div>
  );
  return (
    <div style={{background:T.card,borderRadius:12,border:`1px solid ${T.accentBorder}`,padding:20,marginBottom:16}}>
      <div style={{fontFamily:fonts.display,fontSize:18,fontWeight:700,color:T.accent,letterSpacing:2,marginBottom:16}}>EDIT POINTS SYSTEM</div>
      <div style={{fontSize:11,color:T.muted,letterSpacing:1,marginBottom:8}}>BATTING</div>
      <div style={{fontSize:11,color:T.accent,letterSpacing:1,marginBottom:8}}>🏏 BATTING</div>
      {field("Per run","run",0.5)}{field("Per four","four")}{field("Per six","six")}
      {field("Half-century","fifty")}{field("Century","century")}
      {field("SR Bonus pts","srBonus")}{field("SR Bonus threshold","srBonusThreshold")}
      <div style={{fontSize:11,color:T.danger,letterSpacing:1,marginBottom:8,marginTop:12}}>PENALTIES</div>
      {field("Duck penalty","duckPenalty")}{field("SR penalty pts","srPenalty")}{field("SR penalty threshold","srPenaltyThreshold")}
      <div style={{fontSize:11,color:T.info,letterSpacing:1,marginBottom:8,marginTop:12}}>🎳 BOWLING</div>
      {field("Per wicket","wicket")}{field("4-wkt haul","fourWkt")}{field("5-wkt haul","fiveWkt")}
      {field("Maiden over","maiden")}{field("Economy bonus","ecoBonus")}{field("Economy < threshold","ecoThreshold",0.5)}
      {field("Min overs (eco)","ecoMinOvers",0.5)}{field("Economy penalty","ecoPenalty")}{field("Eco penalty > threshold","ecoPenaltyThreshold",0.5)}
      <div style={{fontSize:11,color:T.success,letterSpacing:1,marginBottom:8,marginTop:12}}>🧤 FIELDING</div>
      {field("Per catch","catch")}{field("Per stumping","stumping")}{field("Per run-out","runout")}
      <div style={{fontSize:11,color:T.purple,letterSpacing:1,marginBottom:8,marginTop:12}}>⭐ BONUSES</div>
      {field("All-round bonus","allRoundBonus")}{field("All-round min runs","allRoundMinRuns")}{field("All-round min wkts","allRoundMinWkts")}
      {field("Longest six","longestSix")}{field("MOM bonus","momBonus")}{field("Playing XI bonus","playingXIBonus")}
      {field("Captain mult","captainMult",0.5)}{field("VC mult","vcMult",0.5)}
      <div style={{display:"flex",gap:8,marginTop:16}}>
        <button onClick={onCancel} style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:10,color:T.muted,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
        <button onClick={()=>onSave(cfg)} style={{flex:2,background:`linear-gradient(135deg,${T.accent},${T.accentDim})`,border:"none",borderRadius:8,padding:10,color:T.bg,fontFamily:fonts.body,fontWeight:800,fontSize:14,cursor:"pointer"}}>SAVE POINTS</button>
      </div>
    </div>
  );
}
