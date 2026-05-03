import React, { useState } from "react";
import { T, fonts } from "./Theme";

export default function EditPlayerModal({ player, onSave, onAdd, onClose }) {
  const isNew = !player.id;
  const [name, setName] = useState(player.name || "");
  const [iplTeam, setIplTeam] = useState(player.iplTeam || "");
  const [role, setRole] = useState(player.role || "Batsman");
  const [imageUrl, setImageUrl] = useState(player.imageUrl || "");
  const IPL_FRANCHISE = ["CSK","MI","RCB","KKR","SRH","RR","PBKS","DC","GT","LSG"];

  const submit = () => {
    if (!name.trim()) { alert("Enter player name"); return; }
    if (!iplTeam.trim()) { alert("Select IPL franchise"); return; }
    const id = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") + "-" + Date.now();
    if (isNew) onAdd({ id, name: name.trim(), iplTeam: iplTeam.trim(), role, imageUrl: imageUrl.trim() });
    else onSave({ ...player, name: name.trim(), iplTeam: iplTeam.trim(), role, imageUrl: imageUrl.trim() });
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.97)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:600,backdropFilter:"blur(8px)",padding:16}}>
      <div style={{background:T.bg,border:`3px solid ${T.accent}`,borderRadius:0,width:"100%",maxWidth:420,overflow:"hidden",boxShadow:`6px 6px 0 ${T.accent}33`,clipPath:"polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,0 100%)"}}>
        
        {/* Header */}
        <div style={{background:`linear-gradient(135deg,${T.accent},${T.accentDim})`,padding:"16px 24px"}}>
          <div style={{fontFamily:fonts.display,fontSize:26,fontWeight:900,color:T.bg,letterSpacing:3,textTransform:"uppercase",textShadow:"2px 2px 0 rgba(0,0,0,0.2)"}}>
            {isNew ? "✚ ADD PLAYER" : "✏️ EDIT PLAYER"}
          </div>
        </div>

        {/* Body */}
        <div style={{padding:"24px 24px 20px"}}>
          {/* Player Name */}
          <div style={{marginBottom:14}}>
            <div style={{fontFamily:fonts.display,fontSize:10,color:T.muted,letterSpacing:2,marginBottom:6,fontWeight:700}}>PLAYER NAME</div>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Full Name"
              style={{width:"100%",background:T.card,border:`1px solid ${T.border}`,borderRadius:0,padding:"10px 14px",color:T.text,fontSize:15,fontFamily:fonts.body,outline:"none",boxSizing:"border-box",borderLeft:`3px solid ${T.accent}`}} />
          </div>

          {/* IPL Franchise */}
          <div style={{marginBottom:14}}>
            <div style={{fontFamily:fonts.display,fontSize:10,color:T.muted,letterSpacing:2,marginBottom:6,fontWeight:700}}>IPL FRANCHISE</div>
            <select value={iplTeam} onChange={e=>setIplTeam(e.target.value)}
              style={{width:"100%",background:T.card,border:`1px solid ${T.border}`,borderRadius:0,padding:"10px 14px",color:T.text,fontSize:15,fontFamily:fonts.body,outline:"none",borderLeft:`3px solid ${T.accent}`}}>
              <option value="">— Select Franchise —</option>
              {IPL_FRANCHISE.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Role */}
          <div style={{marginBottom:14}}>
            <div style={{fontFamily:fonts.display,fontSize:10,color:T.muted,letterSpacing:2,marginBottom:6,fontWeight:700}}>ROLE</div>
            <select value={role} onChange={e=>setRole(e.target.value)}
              style={{width:"100%",background:T.card,border:`1px solid ${T.border}`,borderRadius:0,padding:"10px 14px",color:T.text,fontSize:15,fontFamily:fonts.body,outline:"none",borderLeft:`3px solid ${T.accent}`}}>
              {["Batsman","Bowler","All-Rounder","Wicket-Keeper"].map(r=><option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Image URL */}
          <div style={{marginBottom:20}}>
            <div style={{fontFamily:fonts.display,fontSize:10,color:T.muted,letterSpacing:2,marginBottom:6,fontWeight:700}}>IMAGE URL <span style={{color:T.muted,fontWeight:400}}>(OPTIONAL)</span></div>
            <input value={imageUrl} onChange={e=>setImageUrl(e.target.value)} placeholder="/players/player-id.jpg"
              style={{width:"100%",background:T.card,border:`1px solid ${T.border}`,borderRadius:0,padding:"10px 14px",color:T.text,fontSize:14,fontFamily:fonts.body,outline:"none",boxSizing:"border-box",borderLeft:`3px solid ${T.border}`}} />
            {imageUrl && (
              <div style={{marginTop:10,textAlign:"center",padding:12,background:T.card,border:`1px solid ${T.border}`,borderTop:`3px solid ${T.accent}`}}>
                <img src={imageUrl} alt="Preview"
                  onError={(e)=>{e.target.style.display='none';e.target.nextSibling.style.display='block'}}
                  style={{maxWidth:120,maxHeight:120,borderRadius:0,border:`2px solid ${T.accent}`,boxShadow:`4px 4px 0 ${T.accent}33`}} />
                <div style={{display:'none',color:T.danger,fontSize:12,marginTop:8,fontFamily:fonts.display,letterSpacing:1}}>⚠️ INVALID IMAGE URL</div>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div style={{display:"flex",gap:10}}>
            <button onClick={onClose}
              style={{flex:1,background:"transparent",border:`2px solid ${T.border}`,borderRadius:0,padding:12,color:T.muted,fontFamily:fonts.display,fontWeight:800,fontSize:14,letterSpacing:2,cursor:"pointer",clipPath:"polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)"}}>
              CANCEL
            </button>
            <button onClick={submit}
              style={{flex:2,background:`linear-gradient(135deg,${T.accent},${T.accentDim})`,border:"none",borderRadius:0,padding:12,color:T.bg,fontFamily:fonts.display,fontWeight:900,fontSize:15,letterSpacing:2,cursor:"pointer",clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)",boxShadow:`3px 3px 0 ${T.accent}44`}}>
              {isNew ? "ADD PLAYER" : "SAVE CHANGES"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
