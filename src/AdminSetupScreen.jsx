import React, { useState } from "react";
import { T, fonts } from "./Theme";

export default function AdminSetupScreen({ pitch, onDone, onBack, sbGet, sbSet, hashPw }) {
  const [pw, setPw] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const [checking, setChecking] = useState(true);
  const [alreadySet, setAlreadySet] = useState(false);
  React.useEffect(() => {
    (async () => {
      const existing = await sbGet(pitch.id + "_adminHash") || (pitch.hash && pitch.hash.length > 10 ? pitch.hash : null);
      if (existing) setAlreadySet(true);
      setChecking(false);
    })();
  }, []);

  const submit = async () => {
    if (pw.length < 4) { setErr("Password must be at least 4 characters"); return; }
    if (pw !== pwConfirm) { setErr("Passwords don't match"); return; }
    setLoading(true);
    const h = await hashPw(pw);
    // Save as both pwhash (league admin password) and adminHash (entry password) - they are the same
    await sbSet(pitch.id + "_pwhash", h);
    await sbSet(pitch.id + "_adminHash", h);
    const pitches = await sbGet("pitches") || [];
    const updated = pitches.map(p => p.id === pitch.id ? {...p, hash: h} : p);
    await sbSet("pitches", updated);
    onDone({...pitch, hash: h});
    setLoading(false);
  };

  const inp = {width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"12px 16px",color:T.text,fontSize:16,fontFamily:fonts.body,outline:"none",marginBottom:10,boxSizing:"border-box"};

  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:fonts.body}}>
      <div style={{width:"100%",maxWidth:380}}>
        <button onClick={onBack} style={{background:"transparent",border:"none",color:T.muted,fontSize:13,cursor:"pointer",marginBottom:20,padding:0}}>← Back</button>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:40,marginBottom:8}}>🔑</div>
          <div style={{fontFamily:fonts.display,fontSize:24,fontWeight:700,color:T.accent,letterSpacing:2}}>
            {checking?"LOADING…":alreadySet?"ENTER ADMIN PASSWORD":"SET ADMIN PASSWORD"}
          </div>
          <div style={{fontSize:13,color:T.muted,marginTop:6}}>{pitch.name}</div>
          <div style={{fontSize:12,color:"#2D3E52",marginTop:4}}>
            {alreadySet?"Enter your existing admin password to continue":"This password will be used for all admin actions in this pitch"}
          </div>
        </div>
        {!checking && alreadySet ? (
          <div>
            <input type="password" value={pw} onChange={e=>{setPw(e.target.value);setErr("");}}
              onKeyDown={async e=>{
                if(e.key==="Enter"){
                  setLoading(true);setErr("");
                  const h=await hashPw(pw);
                  const stored=await sbGet(pitch.id+"_pwhash")||(pitch.id==="p1"?await sbGet("p1_pwhash"):null)||await sbGet(pitch.id+"_adminHash")||pitch.hash||null;
                  if(h!==stored){setErr("Wrong password");setLoading(false);return;}
                  // Sync both keys to be the same
                  if(!await sbGet(pitch.id+"_pwhash")) await sbSet(pitch.id+"_pwhash",h);
                  if(!await sbGet(pitch.id+"_adminHash")) await sbSet(pitch.id+"_adminHash",h);
                  onDone({...pitch,hash:h});setLoading(false);
                }
              }}
              placeholder="Admin password…" autoFocus style={inp} />
            {err && <div style={{color:T.danger,fontSize:12,marginBottom:10}}>{err}</div>}
            <button onClick={async()=>{
              setLoading(true);setErr("");
              const h=await hashPw(pw);
              const stored=await sbGet(pitch.id+"_adminHash")||pitch.hash;
              if(h!==stored){setErr("Wrong password");setLoading(false);return;}
              onDone({...pitch,hash:h});setLoading(false);
            }} disabled={loading}
              style={{width:"100%",background:`linear-gradient(135deg,${T.accent},${T.accentDim})`,border:"none",borderRadius:8,padding:13,color:T.bg,fontFamily:fonts.body,fontWeight:800,fontSize:16,cursor:"pointer",letterSpacing:1}}>
              {loading?"VERIFYING…":"ENTER AS ADMIN →"}
            </button>
          </div>
        ) : !checking ? (
          <div>
            <input type="password" value={pw} onChange={e=>{setPw(e.target.value);setErr("");}} placeholder="Choose admin password…" autoFocus style={inp} />
            <input type="password" value={pwConfirm} onChange={e=>{setPwConfirm(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="Confirm password…" style={inp} />
            {err && <div style={{color:T.danger,fontSize:12,marginBottom:10}}>{err}</div>}
            <button onClick={submit} disabled={loading}
              style={{width:"100%",background:`linear-gradient(135deg,${T.accent},${T.accentDim})`,border:"none",borderRadius:8,padding:13,color:T.bg,fontFamily:fonts.body,fontWeight:800,fontSize:16,cursor:"pointer"}}>
              {loading?"SETTING UP…":"SET PASSWORD & ENTER →"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
