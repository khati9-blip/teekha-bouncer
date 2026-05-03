import React, { useState, useEffect } from "react";
import { T, fonts, GlobalStyles } from "./Theme";
import { SUPABASE_URL, SB_HEADERS } from "./utils.js";
import HomeHub from "./HomeHub";
import FeedbackWidget from "./FeedbackWidget";
import RulesSheet from "./RulesSheet";

// ── PITCH HOME SCREEN ────────────────────────────────────────────────────────
function PitchHome({ onEnter, user, onLogout, onSetupAdmin, pushNotif }) {
  const [pitches, setPitches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");

  const sbGet = async (key) => { try { const res = await fetch("https://rmcxhorijitrhqyrvvkn.supabase.co/rest/v1/league_data?key=eq."+encodeURIComponent(key), {headers:{"apikey":"sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm","Authorization":"Bearer sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm"}}); const d=await res.json(); return d[0]?.value; } catch { return null; } };
  const sbSet = async (key, value) => { try { await fetch("https://rmcxhorijitrhqyrvvkn.supabase.co/rest/v1/league_data", {method:"POST",headers:{"apikey":"sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm","Authorization":"Bearer sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm","Content-Type":"application/json","Prefer":"resolution=merge-duplicates"},body:JSON.stringify({key,value,updated_at:new Date().toISOString()})}); } catch {} };

  useEffect(() => {
    (async () => {
      try {
        const data = await sbGet("pitches");
        if (data && Array.isArray(data)) setPitches(data);
        else { const dp=[{id:"p1",name:"Pitch 1",hash:"",createdAt:new Date().toISOString()}]; await sbSet("pitches",dp); setPitches(dp); }
      } catch { setPitches([{id:"p1",name:"Pitch 1",hash:"",createdAt:new Date().toISOString()}]); }
      setLoading(false);
    })();
  }, []);

  const [expandedPitch, setExpandedPitch] = useState(null); // pitch showing HomeHub
  const [cloneModal, setCloneModal] = useState(null); // pitch being cloned
  const [cloneAdminPw, setCloneAdminPw] = useState("");
  const [cloneErr, setCloneErr] = useState("");
  const [cloning, setCloning] = useState(false);

  const handleClone = (pitch) => {
    setCloneModal(pitch);
    setCloneAdminPw("");
    setCloneErr("");
  };

  const confirmClone = async () => {
    if (!cloneAdminPw.trim()) { setCloneErr("Enter admin password"); return; }
    setCloning(true);
    try {
      // Verify admin password — same multi-source check as TeamClaimScreen
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cloneAdminPw));
      const h = Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
      const pwhash    = await sbGet(cloneModal.id + "_pwhash");
      const adminHash = await sbGet(cloneModal.id + "_adminHash");
      const legacyHash = cloneModal.id === "p1" ? await sbGet("p1_pwhash") : null;
      const oldPitchHash = cloneModal.hash && cloneModal.hash.length > 10 ? cloneModal.hash : null;
      if (h !== pwhash && h !== adminHash && h !== legacyHash && h !== oldPitchHash) {
        setCloneErr("❌ Wrong admin password"); setCloneAdminPw(""); setCloning(false); return;
      }

      // Create clone pitch
      const cloneId = "p" + (pitches.length + 1) + "_clone_" + Date.now();
      const clonePitch = {
        id: cloneId,
        name: cloneModal.name + " (Clone)",
        hash: cloneModal.hash,
        createdAt: new Date().toISOString(),
        isClone: true,
        clonedFrom: cloneModal.id,
        clonedFromName: cloneModal.name,
      };

      // Copy ALL data keys from original pitch dynamically
      // This ensures any new features added in future are automatically cloned
      const allRows = await fetch(
        `${SUPABASE_URL}/rest/v1/league_data?key=like.${encodeURIComponent(cloneModal.id + '_%')}&select=key`,
        { headers: SB_HEADERS }
      ).then(r => r.json());

      for (const row of (allRows || [])) {
        try {
          const suffix = row.key.slice(cloneModal.id.length + 1); // remove "p1_" prefix
          // Skip auth keys — clone uses its own password
          if (["pwhash","adminHash","adminEmail"].includes(suffix)) continue;
          const val = await sbGet(cloneModal.id + "_" + suffix);
          if (val !== null && val !== undefined) await sbSet(cloneId + "_" + suffix, val);
        } catch {}
      }

      // Reset transfers to closed state — don't inherit live window from original
      const originalTransfers = await sbGet(cloneModal.id + "_transfers") || {};
      await sbSet(cloneId + "_transfers", originalTransfers);

      // Copy pitchConfig exactly
      const originalPitchConfig = await sbGet(cloneModal.id + "_pitchConfig") || {
        transferStart: "Sunday 11:59 PM",
        transferEnd: "Monday 11:00 AM",
        snatchReturn: "Friday 11:58 PM",
        snatchWindow: "Saturday 12:00 AM to Saturday 12:00 PM",
      };
      await sbSet(cloneId + "_pitchConfig", originalPitchConfig);

      // Save clone pitch to pitch list
      const updated = [...pitches, clonePitch];
      await sbSet("pitches", updated);
      setPitches(updated);

      // Auto-grant admin access to clone
      try { localStorage.setItem("tb_admin_" + cloneId, "1"); } catch {}

      setCloneModal(null); setCloneAdminPw(""); setCloneErr("");
      pushNotif && pushNotif('system', `✅ Clone '${clonePitch.name}' created! Enter it to test.`, '🎉');
    } catch(e) { setCloneErr("Error: " + e.message); }
    setCloning(false);
  };

  const createPitch = async () => {
    if (!newName.trim()) { setErr("Enter a pitch name"); return; }
    if (pitches.length >= 1000) { setErr("Max 1000 pitches"); return; }
    const id = "p" + (pitches.length + 1) + "_" + Date.now();
    const newPitch = { id, name: newName.trim(), hash: "", createdAt: new Date().toISOString() };
    // Don't save pitch yet — only save after admin password is confirmed
    setNewName(""); setCreating(false); setErr("");
    onSetupAdmin(newPitch, pitches); // pass pitches so we can save after
  };

  const COLORS = ["#FF3D5A","#4F8EF7","#2ECC71","#F5A623","#A855F7","#06B6D4"];

  if (loading) return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <GlobalStyles />
      <img src="/logo.png" alt="Teekha Bouncer" style={{width:64,height:64,objectFit:"contain",borderRadius:18,animation:"tb-spin 2s linear infinite",boxShadow:`0 0 40px ${T.accent}44`}} />
      <div style={{fontFamily:fonts.display,fontSize:16,fontWeight:800,color:T.accent,letterSpacing:5}}>LOADING LEAGUES…</div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:fonts.body,position:"relative",overflow:"hidden"}}>
      <GlobalStyles />

      {/* Atmosphere */}
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0}}>
        <div style={{position:"absolute",top:-200,left:-200,width:600,height:600,background:`radial-gradient(circle,${T.accent}10 0%,transparent 70%)`,borderRadius:"50%"}} />
        <div style={{position:"absolute",bottom:-200,right:-200,width:500,height:500,background:`radial-gradient(circle,${T.danger}08 0%,transparent 70%)`,borderRadius:"50%"}} />
        <div style={{position:"absolute",inset:0,backgroundImage:`linear-gradient(${T.border}08 1px,transparent 1px),linear-gradient(90deg,${T.border}08 1px,transparent 1px)`,backgroundSize:"60px 60px"}} />
        <div style={{position:"absolute",top:"10%",right:"6%",fontSize:64,opacity:0.04,animation:"tb-float 7s ease-in-out infinite",fontFamily:"serif"}}>🏏</div>
        <div style={{position:"absolute",bottom:"15%",left:"4%",fontSize:80,opacity:0.03,animation:"tb-float 9s ease-in-out infinite 2s",fontFamily:"serif"}}>🏆</div>
      </div>

      {/* Header */}
<div style={{position:"relative",zIndex:10,borderBottom:`4px solid ${T.accent}`,backdropFilter:"blur(20px)",background:"linear-gradient(135deg, #0A0E14 0%, #1A1F2E 100%)",boxShadow:"0 4px 20px rgba(245,158,11,0.3)"}}>
        <div style={{maxWidth:680,margin:"0 auto",padding:"16px 24px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:48,height:48,background:`linear-gradient(135deg, ${T.accent} 0%, #D97706 100%)`,display:"flex",alignItems:"center",justifyContent:"center",clipPath:"polygon(5px 0%, 100% 0%, calc(100% - 5px) 100%, 0% 100%)",boxShadow:"4px 4px 0 rgba(217,119,6,0.4)"}}>
              <img src="/logo.png" alt="Teekha Bouncer" style={{width:34,height:34,objectFit:"contain",filter:"drop-shadow(1px 1px 0 rgba(0,0,0,0.3))"}} />
            </div>
            <div>
              <div style={{fontFamily:fonts.display,fontSize:20,fontWeight:900,color:T.accent,letterSpacing:4,lineHeight:1,textShadow:"2px 2px 0 rgba(245,158,11,0.2)"}}>TEEKHA BOUNCER</div>
              <div style={{fontFamily:fonts.body,fontSize:9,color:T.muted,letterSpacing:3,marginTop:3,fontWeight:700}}>FANTASY CRICKET LEAGUE</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{textAlign:"right"}}>
              <div style={{fontFamily:fonts.display,fontSize:13,fontWeight:800,color:T.text,letterSpacing:1}}>{user?.email?.split("@")[0]}</div>
              <div style={{fontFamily:fonts.body,fontSize:9,color:T.muted,letterSpacing:1}}>{user?.email?.split("@")[1]}</div>
            </div>
            <button onClick={onLogout}
              style={{fontFamily:fonts.display,fontWeight:800,fontSize:11,letterSpacing:2,background:"#FF3D5A",border:"none",borderRadius:0,padding:"8px 16px",color:"#FFFFFF",cursor:"pointer",clipPath:"polygon(5px 0%, 100% 0%, calc(100% - 5px) 100%, 0% 100%)",boxShadow:"3px 3px 0 rgba(139,0,0,0.5)",transition:"all 0.2s"}}
              onMouseEnter={e=>{e.currentTarget.style.transform="translate(-2px, -2px)";e.currentTarget.style.boxShadow="5px 5px 0 rgba(139,0,0,0.5)";}}
              onMouseLeave={e=>{e.currentTarget.style.transform="translate(0, 0)";e.currentTarget.style.boxShadow="3px 3px 0 rgba(139,0,0,0.5)";}}>
              LOGOUT
            </button>
          </div>
        </div>
      </div>

      {/* Hero */}
<div style={{position:"relative",zIndex:10,maxWidth:680,margin:"0 auto",padding:"48px 24px 32px"}}>
  <div style={{animation:"tb-fadeUp 0.6s ease both"}}>
    <div style={{display:"inline-block",background:`linear-gradient(135deg, ${T.accent} 0%, #D97706 100%)`,padding:"6px 20px 6px 14px",clipPath:"polygon(0 0, 100% 0, calc(100% - 12px) 100%, 0 100%)",marginBottom:16,boxShadow:"4px 4px 0 rgba(217,119,6,0.3)"}}>
      <div style={{fontFamily:fonts.display,fontSize:11,fontWeight:900,color:"#0A0E14",letterSpacing:4,textShadow:"1px 1px 0 rgba(255,255,255,0.2)"}}>DESIGN YOUR OWN LEAGUES</div>
    </div>
    <h1 style={{fontFamily:fonts.display,fontSize:48,fontWeight:900,color:T.text,letterSpacing:1,margin:0,lineHeight:1.05,textShadow:"3px 3px 0 rgba(245,158,11,0.1)"}}>
      YOUR <span style={{color:T.accent,background:`linear-gradient(135deg, ${T.accent} 0%, #D97706 100%)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>LEAGUES</span>
    </h1>
    <p style={{fontFamily:fonts.body,fontSize:14,color:T.muted,marginTop:12,letterSpacing:0.5,lineHeight:1.6}}>
      Select a pitch to manage your squad, track points and dominate the leaderboard
    </p>
  </div>

        {/* Pitch cards */}
        <div style={{display:"flex",flexDirection:"column",gap:10,marginTop:28}}>
          {pitches.map((pitch, i) => {
            const color = COLORS[i % COLORS.length];
            const pitchTeamKey = "tb_myteam_" + pitch.id;
            const pitchGuestKey = "tb_guest_" + pitch.id;
            const pitchAdminKey = "tb_admin_" + pitch.id;
            const savedTeam = (() => { try { const s=localStorage.getItem(pitchTeamKey); return s?JSON.parse(s):null; } catch { return null; } })();
            const savedGuest = (() => { try { return !!localStorage.getItem(pitchGuestKey); } catch { return false; } })();
            const savedAdmin = (() => { try { return !!localStorage.getItem(pitchAdminKey); } catch { return false; } })();
            const returning = savedTeam || savedGuest || savedAdmin;
            const isExpanded = expandedPitch === pitch.id;
            const roleLabel = savedAdmin ? "🔑 Admin" : savedTeam ? "🏏 " + savedTeam.name : savedGuest ? "👁 Guest" : null;
            return (
              <div key={pitch.id}
  style={{borderRadius:0,border:`3px solid ${isExpanded ? color : T.border}44`,borderLeft:`6px solid ${color}`,background:isExpanded ? color+"0D" : T.card,overflow:"hidden",animation:`tb-fadeUp 0.5s ease ${i*0.07}s both`,position:"relative",transition:"all 0.25s",boxShadow:isExpanded?`5px 5px 0 ${color}33`:"none"}}>
  <div style={{height:3,background:`linear-gradient(90deg,${color},${color}55,transparent)`,opacity:isExpanded?1:0.4,transition:"opacity 0.3s"}} />
  <div style={{padding:"16px 18px",display:"flex",alignItems:"center",gap:12,cursor:"pointer"}} onClick={()=>setExpandedPitch(isExpanded?null:pitch.id)}>
    <div style={{width:52,height:52,borderRadius:0,background:color+"22",border:`2px solid ${color}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0,position:"relative",clipPath:"polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)",boxShadow:`3px 3px 0 ${color}44`}}>
      <div style={{fontFamily:fonts.display,fontWeight:900,fontSize:16,color:color,letterSpacing:1,textShadow:`1px 1px 0 ${color}33`}}>P{i+1}</div>
      {returning && <div style={{position:"absolute",top:-4,right:-4,width:10,height:10,borderRadius:"50%",background:color,boxShadow:`0 0 10px ${color}`,border:"2px solid #0A0E14"}} />}
    </div>
    <div style={{flex:1,minWidth:0,overflow:"hidden"}}>
      <div style={{fontFamily:fonts.display,fontWeight:800,fontSize:17,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",letterSpacing:0.5}}>{pitch.name}</div>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginTop:3,flexWrap:"wrap"}}>
                      {roleLabel && <span style={{fontFamily:fonts.display,fontSize:9,fontWeight:700,letterSpacing:1,background:color+"18",border:`1px solid ${color}33`,color,borderRadius:4,padding:"1px 7px"}}>{roleLabel}</span>}
                      {pitch.isClone && <span style={{fontFamily:fonts.display,fontSize:9,fontWeight:700,letterSpacing:1,background:T.purpleBg,border:`1px solid ${T.purple}33`,color:T.purple,borderRadius:4,padding:"1px 6px"}}>CLONE</span>}
                      {!returning && <span style={{fontFamily:fonts.body,fontSize:10,color:T.muted}}>Created {new Date(pitch.createdAt).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</span>}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:7,alignItems:"center",flexShrink:0}}>
                    {savedAdmin && !pitch.isClone && (
                      <button onClick={(e)=>{e.stopPropagation();handleClone(pitch);}}
                        style={{background:T.purpleBg,border:`1px solid ${T.purple}33`,borderRadius:8,padding:"7px 10px",color:T.purple,fontFamily:fonts.display,fontWeight:700,fontSize:11,cursor:"pointer",letterSpacing:0.5}}>
                        🧬
                      </button>
                    )}
                    <button onClick={(e)=>{e.stopPropagation();onEnter(pitch);}}
                      style={{background:`linear-gradient(135deg,${color},${color}AA)`,border:"none",borderRadius:9,padding:"8px 14px",color:T.bg,fontFamily:fonts.display,fontWeight:800,fontSize:12,cursor:"pointer",letterSpacing:0.5,boxShadow:`0 4px 14px ${color}33`,whiteSpace:"nowrap",flexShrink:0,transition:"all 0.15s"}}>
                      {returning ? "ENTER →" : "JOIN →"}
                    </button>
                  </div>
                  <div style={{color,fontSize:11,opacity:0.5,marginLeft:2,transform:isExpanded?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.3s"}}>▼</div>
                </div>
                {isExpanded && (
                  <div style={{borderTop:`1px solid ${color}18`,padding:"0 16px 4px"}}>
                    <HomeHub pitchId={pitch.id} user={user} savedTeamId={savedTeam?.id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Create pitch */}
        <div style={{marginTop:14,animation:"tb-fadeUp 0.5s ease 0.28s both"}}>
        {!creating ? (
          <button onClick={()=>setCreating(true)}
  style={{width:"100%",background:"transparent",border:`3px dashed ${T.border}`,borderRadius:0,padding:"18px",fontFamily:fonts.display,fontWeight:800,fontSize:14,color:T.muted,cursor:"pointer",letterSpacing:2,display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all 0.3s",clipPath:"polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)"}}
  onMouseEnter={e=>{e.currentTarget.style.borderColor=T.accent;e.currentTarget.style.color=T.accent;e.currentTarget.style.background=T.accent+"11";}}
  onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.muted;e.currentTarget.style.background="transparent";}}>
  ＋ CREATE NEW PITCH
</button>
        ) : (
          <div style={{background:T.card,borderRadius:13,border:`1px solid ${T.accentBorder}`,padding:20,animation:"tb-fadeUp 0.3s ease both"}}>
            <div style={{fontFamily:fonts.display,fontSize:16,fontWeight:800,color:T.accent,letterSpacing:2,marginBottom:14}}>NEW PITCH</div>
            <input value={newName} onChange={e=>{setNewName(e.target.value);setErr("");}} placeholder="e.g. Office IPL League 2025" autoFocus
              onKeyDown={e=>e.key==="Enter"&&createPitch()}
              style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:9,padding:"11px 14px",color:T.text,fontSize:14,fontFamily:fonts.body,outline:"none",marginBottom:10,boxSizing:"border-box"}} />
            {err && <div style={{fontFamily:fonts.body,color:T.danger,fontSize:12,marginBottom:10}}>{err}</div>}
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{setCreating(false);setNewName("");setErr("");}} style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:9,padding:11,color:T.sub,fontFamily:fonts.display,fontWeight:700,fontSize:13,cursor:"pointer",letterSpacing:0.5}}>CANCEL</button>
              <button onClick={createPitch} style={{flex:2,background:`linear-gradient(135deg,${T.accent},${T.accentDim})`,border:"none",borderRadius:9,padding:11,color:T.bg,fontFamily:fonts.display,fontWeight:800,fontSize:14,cursor:"pointer",boxShadow:`0 4px 20px ${T.accent}33`,letterSpacing:0.5}}>CREATE & SET UP →</button>
            </div>
          </div>
        )}
        </div>
        {/* Feedback */}
        <FeedbackWidget pitches={pitches} user={user} T={T} fonts={fonts} />
      </div>

      <RulesSheet />

      {/* Clone Modal */}
      {cloneModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.97)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,backdropFilter:"blur(8px)"}}>
          <div style={{background:T.card,borderRadius:18,border:`1px solid ${T.purple}44`,padding:32,width:"100%",maxWidth:380,margin:"0 16px",boxShadow:"0 32px 80px rgba(0,0,0,0.8)",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:100,height:2,background:`linear-gradient(90deg,transparent,${T.purple},transparent)`}} />
            <div style={{fontSize:32,textAlign:"center",marginBottom:10}}>🧬</div>
            <div style={{fontFamily:fonts.display,fontSize:20,fontWeight:800,color:T.purple,textAlign:"center",letterSpacing:2,marginBottom:6}}>CLONE PITCH</div>
            <div style={{fontFamily:fonts.body,fontSize:13,color:T.sub,textAlign:"center",marginBottom:8}}>
              Creating a clone of <span style={{color:T.text,fontWeight:600}}>{cloneModal.name}</span>
            </div>
            <div style={{fontFamily:fonts.body,fontSize:12,color:T.sub,textAlign:"center",marginBottom:22,background:T.purpleBg,border:`1px solid ${T.purple}33`,borderRadius:8,padding:"8px 12px"}}>
              All data will be copied. Changes in the clone won't affect the original.
            </div>
            <div style={{fontFamily:fonts.display,fontSize:10,color:T.muted,letterSpacing:2,marginBottom:8}}>ADMIN PASSWORD</div>
            <input type="password" value={cloneAdminPw} onChange={e=>{setCloneAdminPw(e.target.value);setCloneErr("");}} onKeyDown={e=>e.key==="Enter"&&confirmClone()} placeholder="Enter admin password…" autoFocus
              style={{width:"100%",background:T.bg,border:`1px solid ${cloneErr?T.danger:T.border}`,borderRadius:9,padding:"12px 14px",color:T.text,fontSize:14,fontFamily:fonts.body,outline:"none",marginBottom:cloneErr?8:20,boxSizing:"border-box"}} />
            {cloneErr && <div style={{background:T.dangerBg,border:`1px solid ${T.danger}33`,borderRadius:8,padding:"8px 14px",color:T.danger,fontFamily:fonts.body,fontSize:13,marginBottom:18,textAlign:"center"}}>{cloneErr}</div>}
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{setCloneModal(null);setCloneAdminPw("");setCloneErr("");}} style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:9,padding:12,color:T.sub,fontFamily:fonts.display,fontWeight:700,fontSize:13,cursor:"pointer"}}>CANCEL</button>
              <button onClick={confirmClone} disabled={cloning} style={{flex:2,background:`linear-gradient(135deg,${T.purple},#7C3AED)`,border:"none",borderRadius:9,padding:12,color:"#fff",fontFamily:fonts.display,fontWeight:800,fontSize:14,cursor:cloning?"not-allowed":"pointer",opacity:cloning?0.7:1}}>
                {cloning ? "CLONING…" : "🧬 CREATE CLONE →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PitchHome;
