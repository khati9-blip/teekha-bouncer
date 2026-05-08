import React, { useState } from 'react';
import { hashPw } from './utils.js';

export default function PasswordModal({ onSuccess, onClose, storedHash, T, fonts }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [mode, setMode] = useState("login"); // login | forgot | enterCode
  const [sending, setSending] = useState(false);
  const isFirstTime = !storedHash;

  const inp = {width:"100%",background:T.bg,border:`2px solid ${err?"#FF3D5A":"#FF6B00"}`,borderRadius:0,padding:"12px 16px",color:T.text,fontSize:16,fontFamily:fonts.body,outline:"none",marginBottom:err?8:20,boxSizing:"border-box"};
  const cancelBtn = {flex:1,background:"transparent",border:`2px solid ${T.border}`,borderRadius:0,clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)",padding:"10px 16px",color:T.muted,fontFamily:fonts.display,fontWeight:800,fontSize:13,letterSpacing:1.5,cursor:"pointer"};
  const primaryBtn = (col="#FF6B00") => ({flex:2,background:col,border:"none",borderRadius:0,clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)",padding:"10px 16px",color:T.bg,fontFamily:fonts.display,fontWeight:800,fontSize:13,letterSpacing:1.5,cursor:"pointer",filter:`drop-shadow(3px 3px 0 ${col}88)`});

  const submit = async () => {
    if (!pw.trim()) { setErr("Enter a password"); return; }
    if (isFirstTime) { onSuccess(await hashPw(pw), true); }
    else {
      const h = await hashPw(pw);
      if (h === storedHash) onSuccess(null, false);
      else { setErr("❌ Wrong password"); setPw(""); }
    }
  };

  const sendCode = async () => {
    if (!pw.trim()) { setErr("Enter your admin email"); return; }
    setSending(true); setErr("");
    try {
      const res = await fetch("/api/reset-password", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ email: pw.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setPw(""); setMode("enterCode");
    } catch(e) { setErr("❌ " + e.message); }
    setSending(false);
  };

  const verifyCode = async () => {
    if (!pw.trim()) { setErr("Enter the reset code"); return; }
    try {
      const res = await fetch("/api/reset-password", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ verifyCode: pw.trim() }),
      });
      const data = await res.json();
      if (data.valid) {
        const newPw = prompt("✅ Code verified! Enter your NEW password:");
        if (!newPw) return;
        onSuccess(await hashPw(newPw), true);
        setMode("login"); setPw(""); setErr("");
      } else { setErr("❌ Wrong code. Try again."); setPw(""); }
    } catch(e) { setErr("❌ " + e.message); }
  };

  const reset = () => { setPw(""); setErr(""); };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.95)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:600,backdropFilter:"blur(6px)"}}>
      <div style={{background:T.card,borderRadius:16,border:`1px solid ${T.border}`,padding:32,width:"100%",maxWidth:360,margin:"0 16px"}}>

        {mode==="login" && <>
          <div style={{fontSize:36,textAlign:"center",marginBottom:8}}>🔐</div>
          <div style={{fontFamily:fonts.display,fontSize:22,fontWeight:800,color:"#FF6B00",textAlign:"center",letterSpacing:2,marginBottom:4}}>
            {isFirstTime ? "SET ADMIN PASSWORD" : "ADMIN PASSWORD"}
          </div>
          <div style={{fontSize:13,color:T.muted,textAlign:"center",marginBottom:24}}>
            {isFirstTime ? "Choose a password to protect squad changes" : "Enter password to modify squads"}
          </div>
          <input type="password" value={pw} onChange={e=>{setPw(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder={isFirstTime?"Choose admin password…":"Admin password…"} autoFocus style={inp} />
          {err && <div style={{color:T.danger,fontSize:13,marginBottom:16,textAlign:"center"}}>{err}</div>}
          <div style={{display:"flex",gap:10}}>
            <button onClick={onClose} style={cancelBtn}>CANCEL</button>
            <button onClick={submit} style={primaryBtn()}>{isFirstTime?"SET PASSWORD":"UNLOCK"}</button>
          </div>
          {!isFirstTime && (
            <div style={{marginTop:16,textAlign:"center",display:"flex",justifyContent:"center",gap:20}}>
              <button onClick={async()=>{const p=prompt("Enter NEW password:");if(!p)return;onSuccess(await hashPw(p),true);}} style={{background:"none",border:"none",color:"#FF6B00",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>Change password</button>
              <button onClick={()=>{reset();setMode("forgot");}} style={{background:"none",border:"none",color:"#FF6B00",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>Forgot password?</button>
            </div>
          )}
        </>}

        {mode==="forgot" && <>
          <div style={{fontSize:36,textAlign:"center",marginBottom:8}}>📧</div>
          <div style={{fontFamily:fonts.display,fontSize:22,fontWeight:700,color:T.accent,textAlign:"center",letterSpacing:2,marginBottom:4}}>RESET PASSWORD</div>
          <div style={{fontSize:13,color:T.muted,textAlign:"center",marginBottom:24}}>Enter the admin email — we'll send a reset code</div>
          <input type="email" value={pw} onChange={e=>{setPw(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&sendCode()} placeholder="Admin email address…" autoFocus style={inp} />
          {err && <div style={{color:T.danger,fontSize:13,marginBottom:16,textAlign:"center"}}>{err}</div>}
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>{reset();setMode("login");}} style={cancelBtn}>BACK</button>
            <button onClick={sendCode} disabled={sending} style={{...primaryBtn("#4F8EF7"),color:"#fff",opacity:sending?0.6:1}}>{sending?"SENDING…":"SEND CODE"}</button>
          </div>
        </>}

        {mode==="enterCode" && <>
          <div style={{fontSize:36,textAlign:"center",marginBottom:8}}>✉️</div>
          <div style={{fontFamily:fonts.display,fontSize:22,fontWeight:700,color:T.accent,textAlign:"center",letterSpacing:2,marginBottom:4}}>ENTER CODE</div>
          <div style={{fontSize:13,color:T.success,textAlign:"center",marginBottom:24}}>Reset code sent! Check your email inbox.</div>
          <input type="text" value={pw} onChange={e=>{setPw(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&verifyCode()} placeholder="Paste reset code…" autoFocus
            style={{...inp,letterSpacing:4,textAlign:"center"}} />
          {err && <div style={{color:T.danger,fontSize:13,marginBottom:16,textAlign:"center"}}>{err}</div>}
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>{reset();setMode("forgot");}} style={cancelBtn}>BACK</button>
            <button onClick={verifyCode} style={primaryBtn()}>VERIFY & RESET</button>
          </div>
        </>}

      </div>
    </div>
  );
}
