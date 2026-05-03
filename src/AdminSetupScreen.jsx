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
    await sbSet(pitch.id + "_pwhash", h);
    await sbSet(pitch.id + "_adminHash", h);
    const pitches = await sbGet("pitches") || [];
    const updated = pitches.map(p => p.id === pitch.id ? {...p, hash: h} : p);
    await sbSet("pitches", updated);
    onDone({...pitch, hash: h});
    setLoading(false);
  };

  const title = checking ? "LOADING…" : alreadySet ? "ENTER ADMIN PASSWORD" : "SET ADMIN PASSWORD";
  const subtitle = alreadySet
    ? "Enter your existing admin password to continue"
    : "This password will be used for all admin actions in this pitch";

  // Sharp, left-accented input — no border-radius
  const inp = (active) => ({
    width: "100%",
    boxSizing: "border-box",
    background: T.bg,
    border: `1px solid ${active ? T.accent + "88" : T.border}`,
    borderLeft: `3px solid ${active ? T.accent : T.border}`,
    borderRadius: 0,
    padding: "13px 16px",
    color: T.text,
    fontSize: 15,
    fontFamily: fonts.body,
    outline: "none",
    marginBottom: 10,
    letterSpacing: 0.5,
    transition: "border-color 0.2s",
  });

  const btnStyle = (disabled) => ({
    width: "100%",
    background: disabled ? T.border : `linear-gradient(90deg, ${T.accent}, #FF8C00)`,
    border: "none",
    clipPath: "polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)",
    padding: "15px",
    color: disabled ? T.muted : "#0A0E14",
    fontFamily: fonts.display,
    fontWeight: 900,
    fontSize: 15,
    letterSpacing: 3,
    textTransform: "uppercase",
    cursor: disabled ? "not-allowed" : "pointer",
    filter: disabled ? "none" : `drop-shadow(0 4px 14px ${T.accent}55)`,
    transition: "all 0.2s",
    marginTop: 4,
  });

  return (
    <div style={{
      minHeight: "100vh",
      background: T.bg,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
      fontFamily: fonts.body,
      position: "relative",
      overflow: "hidden",
    }}>

      {/* Diagonal bg stripes */}
      <div style={{position:"absolute",inset:0,pointerEvents:"none",overflow:"hidden",opacity:0.035}}>
        {[...Array(8)].map((_,i) => (
          <div key={i} style={{
            position:"absolute", top:0, bottom:0,
            left:`${i*14-10}%`, width:2,
            background:T.accent,
            transform:"skewX(-20deg)",
          }}/>
        ))}
      </div>

      {/* Back button */}
      <button onClick={onBack} style={{
        position:"absolute", top:20, left:20,
        background:"transparent", border:"none",
        color:T.muted, fontSize:12, cursor:"pointer",
        fontFamily:fonts.display, fontWeight:700,
        letterSpacing:1.5, padding:"6px 10px",
      }}>
        ← BACK
      </button>

      {/* Card */}
      <div style={{
        width:"100%", maxWidth:400,
        background:T.card,
        border:`1px solid ${T.border}`,
        clipPath:"polygon(0 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%)",
        padding:"36px 28px 40px",
        position:"relative",
      }}>

        {/* Top accent bar */}
        <div style={{
          position:"absolute", top:0, left:0, right:0, height:4,
          background:`linear-gradient(90deg, ${T.accent}, #FF8C00)`,
        }}/>

        {/* Icon */}
        <div style={{textAlign:"center", marginBottom:18}}>
          <div style={{
            display:"inline-flex", alignItems:"center", justifyContent:"center",
            width:60, height:60,
            background:`${T.accent}15`,
            border:`2px solid ${T.accent}44`,
            clipPath:"polygon(10px 0%, 100% 0%, calc(100% - 10px) 100%, 0% 100%)",
          }}>
            <span style={{fontSize:28}}>🔑</span>
          </div>
        </div>

        {/* Title */}
        <div style={{textAlign:"center", marginBottom:4}}>
          <div style={{
            fontFamily:fonts.display,
            fontSize:22, fontWeight:900,
            color:T.accent,
            letterSpacing:3,
            textTransform:"uppercase",
            textShadow:`0 0 20px ${T.accent}44`,
          }}>
            {title}
          </div>
        </div>

        {/* Pitch name + subtitle */}
        <div style={{textAlign:"center", marginBottom:24}}>
          <div style={{
            fontFamily:fonts.display, fontSize:13,
            color:T.text, fontWeight:700, letterSpacing:1, marginBottom:4,
          }}>
            {pitch.name}
          </div>
          <div style={{fontSize:11, color:T.muted, fontFamily:fonts.body, letterSpacing:0.5}}>
            {subtitle}
          </div>
        </div>

        {/* Divider */}
        <div style={{
          height:1,
          background:`linear-gradient(90deg, transparent, ${T.border}, transparent)`,
          marginBottom:20,
        }}/>

        {/* ── ENTER mode (password already set) ── */}
        {!checking && alreadySet && (
          <div>
            <div style={{fontSize:10,fontFamily:fonts.display,fontWeight:700,color:T.muted,letterSpacing:2,marginBottom:6}}>
              ADMIN PASSWORD
            </div>
            <input
              type="password" value={pw}
              onChange={e=>{setPw(e.target.value);setErr("");}}
              onKeyDown={async e=>{
                if(e.key==="Enter"){
                  setLoading(true);setErr("");
                  const h=await hashPw(pw);
                  const stored=await sbGet(pitch.id+"_pwhash")||(pitch.id==="p1"?await sbGet("p1_pwhash"):null)||await sbGet(pitch.id+"_adminHash")||pitch.hash||null;
                  if(h!==stored){setErr("Wrong password");setLoading(false);return;}
                  if(!await sbGet(pitch.id+"_pwhash")) await sbSet(pitch.id+"_pwhash",h);
                  if(!await sbGet(pitch.id+"_adminHash")) await sbSet(pitch.id+"_adminHash",h);
                  onDone({...pitch,hash:h});setLoading(false);
                }
              }}
              placeholder="Admin password…"
              autoFocus
              style={inp(!!pw)}
            />
            {err && (
              <div style={{
                background:"#FF3D5A18", border:"1px solid #FF3D5A44",
                borderLeft:"3px solid #FF3D5A",
                padding:"8px 12px", marginBottom:12,
                fontSize:12, color:"#FF3D5A", fontFamily:fonts.body,
              }}>⚠ {err}</div>
            )}
            <button
              onClick={async()=>{
                setLoading(true);setErr("");
                const h=await hashPw(pw);
                const stored=await sbGet(pitch.id+"_adminHash")||pitch.hash;
                if(h!==stored){setErr("Wrong password");setLoading(false);return;}
                onDone({...pitch,hash:h});setLoading(false);
              }}
              disabled={loading}
              style={btnStyle(loading)}
            >
              {loading?"VERIFYING…":"ENTER AS ADMIN →"}
            </button>
          </div>
        )}

        {/* ── SET mode (first time) ── */}
        {!checking && !alreadySet && (
          <div>
            <div style={{fontSize:10,fontFamily:fonts.display,fontWeight:700,color:T.muted,letterSpacing:2,marginBottom:6}}>
              CHOOSE PASSWORD
            </div>
            <input
              type="password" value={pw}
              onChange={e=>{setPw(e.target.value);setErr("");}}
              placeholder="Min. 4 characters"
              autoFocus
              style={inp(!!pw)}
            />
            <div style={{fontSize:10,fontFamily:fonts.display,fontWeight:700,color:T.muted,letterSpacing:2,marginBottom:6}}>
              CONFIRM PASSWORD
            </div>
            <input
              type="password" value={pwConfirm}
              onChange={e=>{setPwConfirm(e.target.value);setErr("");}}
              onKeyDown={e=>e.key==="Enter"&&submit()}
              placeholder="Re-enter password"
              style={{
                ...inp(!!pwConfirm),
                border: pwConfirm
                  ? `1px solid ${pwConfirm===pw ? "#2ECC7188" : "#FF3D5A88"}`
                  : `1px solid ${T.border}`,
                borderLeft: pwConfirm
                  ? `3px solid ${pwConfirm===pw ? "#2ECC71" : "#FF3D5A"}`
                  : `3px solid ${T.border}`,
              }}
            />
            {pwConfirm && pwConfirm===pw && (
              <div style={{fontSize:10,color:"#2ECC71",fontFamily:fonts.body,marginTop:-6,marginBottom:10,letterSpacing:0.5}}>
                ✓ Passwords match
              </div>
            )}
            {err && (
              <div style={{
                background:"#FF3D5A18", border:"1px solid #FF3D5A44",
                borderLeft:"3px solid #FF3D5A",
                padding:"8px 12px", marginBottom:12,
                fontSize:12, color:"#FF3D5A", fontFamily:fonts.body,
              }}>⚠ {err}</div>
            )}
            <button onClick={submit} disabled={loading} style={btnStyle(loading)}>
              {loading?"SETTING UP…":"SET PASSWORD & ENTER →"}
            </button>
          </div>
        )}

        {/* Corner triangle accent */}
        <div style={{
          position:"absolute", bottom:0, right:0,
          width:18, height:18,
          background:T.accent,
          clipPath:"polygon(100% 0%, 100% 100%, 0% 100%)",
          opacity:0.5,
        }}/>
      </div>

      {/* Footer badge */}
      <div style={{
        marginTop:24,
        fontFamily:fonts.display, fontSize:10,
        color:T.muted, letterSpacing:2,
        textTransform:"uppercase", opacity:0.4,
      }}>
        🏏 TEEKHA BOUNCER · ADMIN SETUP
      </div>
    </div>
  );
}
