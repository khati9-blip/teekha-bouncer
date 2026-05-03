import React from "react";
import { T, fonts } from "./Theme";

export function Spinner() {
  return <div style={{width:24,height:24,border:`3px solid ${T.border}`,borderTop:`3px solid ${T.accent}`,borderRadius:"50%",animation:"spin 0.8s linear infinite",display:"inline-block"}} />;
}

export function Badge({ label, color="#4F8EF7" }) {
  return <span style={{background:color+"22",color,border:"1px solid "+color+"44",padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:600}}>{label}</span>;
}

export function Btn({ children, onClick, variant="primary", disabled, style:sx={} }) {
  const base={fontFamily:fonts.body,fontWeight:700,fontSize:15,letterSpacing:1,textTransform:"uppercase",border:"none",borderRadius:8,padding:"10px 22px",cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.5:1,...sx};
  const v={primary:{background:`linear-gradient(135deg,${T.accent},${T.accentDim})`,color:T.bg},blue:{background:"linear-gradient(135deg,#4F8EF7,#1a5fb4)",color:"#fff"},ghost:{background:"transparent",color:T.muted,border:`1px solid ${T.border}`},danger:{background:T.dangerBg,color:T.danger,border:`1px solid ${T.danger}44`}};
  return <button onClick={disabled?undefined:onClick} style={{...base,...v[variant],...sx}}>{children}</button>;
}

export function Card({ children, style:sx={}, accent }) {
  return <div style={{background:"var(--card)",borderRadius:12,border:"1px solid var(--border)",...(accent?{borderTop:"3px solid "+accent}:{}),...sx}}>{children}</div>;
}
