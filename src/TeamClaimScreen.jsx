import React, { useState } from "react";
import { T, fonts } from "./Theme";

// ── TEAM CLAIM SCREEN ─────────────────────────────────────────────────────────
function TeamClaimScreen({ pitch, user, onClaimed, onBack, onGuest, onAdmin, guestAllowed }) {
  const [mode, setMode] = useState(null); // null | 'teamid' | 'admin'
  const [teamIdInput, setTeamIdInput] = useState("");
  const [adminPw, setAdminPw] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [err, setErr] = useState("");
  const [step, setStep] = useState(1); // 1=enter ID, 2=set PIN
  const [claimedTeamInfo, setClaimedTeamInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  const sbGet = async (key) => { try { const res = await fetch("https://rmcxhorijitrhqyrvvkn.supabase.co/rest/v1/league_data?key=eq."+encodeURIComponent(key), {headers:{"apikey":"sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm","Authorization":"Bearer sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm"}}); const d=await res.json(); return d[0]?.value; } catch { return null; } };
  const sbSet = async (key, value) => { try { await fetch("https://rmcxhorijitrhqyrvvkn.supabase.co/rest/v1/league_data", {method:"POST",headers:{"apikey":"sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm","Authorization":"Bearer sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm","Content-Type":"application/json","Prefer":"resolution=merge-duplicates"},body:JSON.stringify({key,value,updated_at:new Date().toISOString()})}); } catch {} };
  const hashPw = async (pw) => { const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw)); return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join(""); };

  const submitTeamId = async () => {
    if (!teamIdInput.trim()) { setErr("Enter your Team ID"); return; }
    setLoading(true); setErr("");
    const identity = await sbGet(pitch.id + "_teamIdentity") || {};
    const entry = Object.values(identity).find(t => t.teamId === teamIdInput.trim().toUpperCase());
    if (!entry) { setErr("Invalid Team ID. Ask your admin for the correct ID."); setLoading(false); return; }
    if (entry.claimedBy && entry.claimedBy !== user.email) { setErr("This Team ID is already claimed by another player."); setLoading(false); return; }
    // Find team details
    const teams = await sbGet(pitch.id + "_teams") || [];
    // Find team by teamRef, or fall back to matching key (t0, t1 etc = team index)
    const identityKey = Object.keys(identity).find(k => identity[k].teamId === teamIdInput.trim().toUpperCase());
    const team = teams.find(t => t.id === entry.teamRef) || teams.find(t => t.id === identityKey);
    if (!team) { setErr("Team not found. Contact admin."); setLoading(false); return; }
    setClaimedTeamInfo({...team, teamId: entry.teamId});
    setStep(2);
    setLoading(false);
  };

  const submitPin = async () => {
    if (pin.length < 4) { setErr("PIN must be at least 4 digits"); return; }
    if (pin !== pinConfirm) { setErr("PINs don't match"); return; }
    setLoading(true);
    const pinHash = await hashPw(pin);
    // Save claim
    const identity = await sbGet(pitch.id + "_teamIdentity") || {};
    const key = Object.keys(identity).find(k => identity[k].teamId === claimedTeamInfo.teamId);
    if (key) { identity[key].claimedBy = user.email; identity[key].teamRef = claimedTeamInfo.id; identity[key].pinHash = pinHash; await sbSet(pitch.id + "_teamIdentity", identity); }
    // Save to localStorage
    try {
      localStorage.setItem("tb_myteam_" + pitch.id, JSON.stringify(claimedTeamInfo));
      localStorage.setItem("tb_pinHash_" + pitch.id, pinHash);
    } catch {}
    onClaimed(claimedTeamInfo, pinHash);
    setLoading(false);
  };

  const submitAdmin = async () => {
    if (!adminPw.trim()) { setErr("Enter admin password"); return; }
    setLoading(true); setErr("");
    const h = await hashPw(adminPw);
    // Check pitch-specific password keys only
    const pwhash = await sbGet(pitch.id + "_pwhash");
    const adminHash = await sbGet(pitch.id + "_adminHash");
    // For p1 (original pitch), also check legacy global key
    const legacyHash = pitch.id === "p1" ? await sbGet("p1_pwhash") : null;
    const oldPitchHash = pitch.hash && pitch.hash.length > 10 ? pitch.hash : null;
    if (h !== pwhash && h !== adminHash && h !== legacyHash && h !== oldPitchHash) {
      setErr("Wrong admin password"); setLoading(false); return;
    }
    // Migrate: save as adminHash for future logins
    if (!adminHash) await sbSet(pitch.id + "_adminHash", h);
    try { localStorage.setItem('tb_admin_' + pitch.id, '1'); localStorage.setItem('tb_pitch', JSON.stringify(pitch)); } catch {}
    // Save admin email to Supabase for cross-device recognition
    await sbSet(pitch.id + "_adminEmail", user.email);
    onAdmin();
    setLoading(false);
  };

  const inp = {width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"12px 16px",color:T.text,fontSize:16,fontFamily:fonts.body,outline:"none",marginBottom:10,boxSizing:"border-box"};

  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:fonts.body}}>
      <div style={{width:"100%",maxWidth:380}}>
        <button onClick={onBack} style={{background:"transparent",border:"none",color:T.muted,fontSize:13,cursor:"pointer",marginBottom:20,padding:0,display:"flex",alignItems:"center",gap:4}}>← Back to Pitches</button>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:40,marginBottom:8}}>🏏</div>
          <div style={{fontFamily:fonts.display,fontSize:26,fontWeight:700,color:T.accent,letterSpacing:2}}>{pitch.name}</div>
          <div style={{fontSize:12,color:T.muted,marginTop:4}}>How would you like to enter?</div>
        </div>

        {!mode && (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <button onClick={()=>{setMode("teamid");setErr("");}}
              style={{background:T.card,border:"2px solid #F5A62344",borderRadius:12,padding:"16px 20px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:14}}>
              <span style={{fontSize:28}}>🎫</span>
              <div>
                <div style={{fontFamily:fonts.display,fontWeight:700,fontSize:17,color:T.accent}}>Enter with Team ID</div>
                <div style={{fontSize:11,color:T.muted,marginTop:2}}>Use the Team ID given by your admin</div>
              </div>
            </button>
            {guestAllowed && (
              <button onClick={onGuest}
                style={{background:T.card,border:"2px solid #4A5E7833",borderRadius:12,padding:"16px 20px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:14}}>
                <span style={{fontSize:28}}>👁</span>
                <div>
                  <div style={{fontFamily:fonts.display,fontWeight:700,fontSize:17,color:T.text}}>Enter as Guest</div>
                  <div style={{fontSize:11,color:T.muted,marginTop:2}}>View only — no editing or transfers</div>
                </div>
              </button>
            )}
            {!guestAllowed && (
              <div style={{background:T.card,border:"2px solid #1E2D4533",borderRadius:12,padding:"16px 20px",display:"flex",alignItems:"center",gap:14,opacity:0.4}}>
                <span style={{fontSize:28}}>🚫</span>
                <div>
                  <div style={{fontFamily:fonts.display,fontWeight:700,fontSize:17,color:T.muted}}>Guest Access Disabled</div>
                  <div style={{fontSize:11,color:"#2D3E52",marginTop:2}}>Admin has restricted guest viewing</div>
                </div>
              </div>
            )}
            <button onClick={()=>{setMode("admin");setErr("");}}
              style={{background:T.card,border:"2px solid #4A5E7833",borderRadius:12,padding:"14px 20px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:14}}>
              <span style={{fontSize:24}}>🔑</span>
              <div>
                <div style={{fontFamily:fonts.display,fontWeight:700,fontSize:15,color:T.muted}}>Admin Entry</div>
                <div style={{fontSize:11,color:"#2D3E52",marginTop:2}}>For pitch administrators only</div>
              </div>
            </button>
          </div>
        )}

        {mode === "teamid" && step === 1 && (
          <div>
            <button onClick={()=>{setMode(null);setErr("");}} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:13,marginBottom:16,padding:0}}>← Back</button>
            <div style={{fontFamily:fonts.display,fontSize:18,fontWeight:700,color:T.text,marginBottom:4}}>🎫 ENTER TEAM ID</div>
            <div style={{fontSize:12,color:T.muted,marginBottom:16}}>Your admin will have shared a unique Team ID with you</div>
            <input value={teamIdInput} onChange={e=>{setTeamIdInput(e.target.value.toUpperCase());setErr("");}}
              onKeyDown={e=>e.key==="Enter"&&submitTeamId()}
              placeholder="e.g. TBL-X7K2" autoFocus style={inp} />
            {err && <div style={{color:T.danger,fontSize:12,marginBottom:10}}>{err}</div>}
            <button onClick={submitTeamId} disabled={loading}
              style={{width:"100%",background:`linear-gradient(135deg,${T.accent},${T.accentDim})`,border:"none",borderRadius:8,padding:12,color:T.bg,fontFamily:fonts.body,fontWeight:800,fontSize:15,cursor:"pointer"}}>
              {loading ? "CHECKING…" : "VERIFY TEAM ID →"}
            </button>
          </div>
        )}

        {mode === "teamid" && step === 2 && claimedTeamInfo && (
          <div>
            <div style={{background:T.accentBg,border:`1px solid ${T.accentBorder}`,borderRadius:10,padding:"12px 16px",marginBottom:16,textAlign:"center"}}>
              <div style={{fontSize:11,color:T.muted,letterSpacing:1,marginBottom:4}}>YOU ARE CLAIMING</div>
              <div style={{fontFamily:fonts.display,fontSize:22,fontWeight:700,color:claimedTeamInfo.color||"#F5A623"}}>{claimedTeamInfo.name}</div>
            </div>
            <div style={{fontFamily:fonts.display,fontSize:16,fontWeight:700,color:T.text,marginBottom:4}}>SET YOUR PIN</div>
            <div style={{fontSize:12,color:T.muted,marginBottom:12}}>This PIN is used for snatch, voting and approvals</div>
            <input type="password" inputMode="numeric" value={pin} onChange={e=>{setPin(e.target.value);setErr("");}} placeholder="Choose a 4+ digit PIN" autoFocus style={inp} />
            <input type="password" inputMode="numeric" value={pinConfirm} onChange={e=>{setPinConfirm(e.target.value);setErr("");}}
              onKeyDown={e=>e.key==="Enter"&&submitPin()} placeholder="Confirm PIN" style={inp} />
            {err && <div style={{color:T.danger,fontSize:12,marginBottom:10}}>{err}</div>}
            <button onClick={submitPin} disabled={loading}
              style={{width:"100%",background:`linear-gradient(135deg,${T.accent},${T.accentDim})`,border:"none",borderRadius:8,padding:12,color:T.bg,fontFamily:fonts.body,fontWeight:800,fontSize:15,cursor:"pointer"}}>
              {loading ? "SAVING…" : "CLAIM TEAM & ENTER →"}
            </button>
          </div>
        )}

        {mode === "admin" && (
          <div>
            <button onClick={()=>{setMode(null);setErr("");}} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:13,marginBottom:16,padding:0}}>← Back</button>
            <div style={{fontFamily:fonts.display,fontSize:18,fontWeight:700,color:T.text,marginBottom:4}}>🔑 ADMIN ENTRY</div>
            <div style={{fontSize:12,color:T.muted,marginBottom:16}}>Enter the admin password for this pitch</div>
            <input type="password" value={adminPw} onChange={e=>{setAdminPw(e.target.value);setErr("");}}
              onKeyDown={e=>e.key==="Enter"&&submitAdmin()} placeholder="Admin password…" autoFocus style={inp} />
            {err && <div style={{color:T.danger,fontSize:12,marginBottom:10}}>{err}</div>}
            <button onClick={submitAdmin} disabled={loading}
              style={{width:"100%",background:"linear-gradient(135deg,#4F8EF7,#1a5fb4)",border:"none",borderRadius:8,padding:12,color:"#fff",fontFamily:fonts.body,fontWeight:800,fontSize:15,cursor:"pointer"}}>
              {loading ? "VERIFYING…" : "ENTER AS ADMIN →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default TeamClaimScreen;
