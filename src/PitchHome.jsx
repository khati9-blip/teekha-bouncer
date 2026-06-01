import React, { useState, useEffect } from "react";
import { T, fonts, GlobalStyles } from "./Theme";
import { SUPABASE_URL, SB_HEADERS } from "./utils.js";
import HomeHub from "./HomeHub";
import AuctionRoom from "./AuctionRoom";
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
  const [mainTab, setMainTab] = useState("leagues");
  const [auctions, setAuctions] = useState([]);
  const [auctionsLoaded, setAuctionsLoaded] = useState(false);
  const [showCreateAuction, setShowCreateAuction] = useState(false);
  const [editingAuction, setEditingAuction] = useState(null);
  const [auctionPwModal, setAuctionPwModal] = useState(null); // auction object awaiting pw
  const [auctionPwInput, setAuctionPwInput] = useState("");
  const [auctionPwErr, setAuctionPwErr] = useState("");

  useEffect(() => {
    if (mainTab !== "auctions" || auctionsLoaded) return;
    (async () => { const data = await sbGet("auctions"); setAuctions(Array.isArray(data) ? data : []); setAuctionsLoaded(true); })();
  }, [mainTab, auctionsLoaded]);


  if (loading) return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <GlobalStyles />
      <img src="/logo.png" alt="Teekha Bouncer" style={{width:64,height:64,objectFit:"contain",borderRadius:18,animation:"tb-spin 2s linear infinite",boxShadow:`0 0 40px ${T.accent}44`}} />
      <div style={{fontFamily:fonts.display,fontSize:16,fontWeight:800,color:T.accent,letterSpacing:5}}>LOADING LEAGUES…</div>
    </div>
  );

  // Show AuctionRoom when an auction is selected
  if (editingAuction) return (
    <AuctionRoom
      auction={editingAuction}
      user={user}
      isAdmin={true}
      onBack={() => { setEditingAuction(null); setAuctionsLoaded(false); }}
    />
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
<div style={{position:"relative",zIndex:10,maxWidth:680,margin:"0 auto",padding:"32px 24px 24px"}}>
  <div style={{animation:"tb-fadeUp 0.6s ease both"}}>

    {/* Two big mode blocks */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:28}}>
      {/* LEAGUES block */}
      <div onClick={()=>setMainTab("leagues")} style={{
        background:mainTab==="leagues"?"linear-gradient(135deg,rgba(245,158,11,0.15),rgba(245,158,11,0.05))":"rgba(255,255,255,0.02)",
        border:mainTab==="leagues"?`3px solid ${T.accent}`:`3px solid ${T.border}`,
        borderRadius:0,padding:"24px 16px",cursor:"pointer",
        clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)",
        boxShadow:mainTab==="leagues"?`4px 4px 0 ${T.accent}44`:"none",
        transition:"all 0.2s",
      }}>
        <div style={{fontSize:32,marginBottom:10}}>🏏</div>
        <div style={{fontFamily:fonts.display,fontSize:16,fontWeight:900,color:mainTab==="leagues"?T.accent:T.muted,letterSpacing:3,marginBottom:6}}>LEAGUES</div>
        <div style={{fontFamily:fonts.body,fontSize:11,color:T.muted,lineHeight:1.5}}>Fantasy cricket with live points, transfers & leaderboard</div>
        {mainTab==="leagues" && <div style={{marginTop:10,width:24,height:3,background:T.accent}}/>}
      </div>

      {/* AUCTIONS block */}
      <div onClick={()=>setMainTab("auctions")} style={{
        background:mainTab==="auctions"?"linear-gradient(135deg,rgba(168,85,247,0.15),rgba(168,85,247,0.05))":"rgba(255,255,255,0.02)",
        border:mainTab==="auctions"?`3px solid #A855F7`:`3px solid ${T.border}`,
        borderRadius:0,padding:"24px 16px",cursor:"pointer",
        clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)",
        boxShadow:mainTab==="auctions"?"4px 4px 0 #A855F744":"none",
        transition:"all 0.2s",
      }}>
        <div style={{fontSize:32,marginBottom:10}}>🔨</div>
        <div style={{fontFamily:fonts.display,fontSize:16,fontWeight:900,color:mainTab==="auctions"?"#A855F7":T.muted,letterSpacing:3,marginBottom:6}}>AUCTIONS</div>
        <div style={{fontFamily:fonts.body,fontSize:11,color:T.muted,lineHeight:1.5}}>Live bidding to build your dream team from scratch</div>
        {mainTab==="auctions" && <div style={{marginTop:10,width:24,height:3,background:"#A855F7"}}/>}
      </div>
    </div>

    {/* LEAGUES TAB */}
    {mainTab === "leagues" && (<>
      <div style={{fontFamily:fonts.display,fontSize:28,fontWeight:900,color:T.text,letterSpacing:1,marginBottom:4}}>
        YOUR <span style={{color:T.accent}}>LEAGUES</span>
      </div>
      <p style={{fontFamily:fonts.body,fontSize:13,color:T.muted,marginTop:4,marginBottom:20,lineHeight:1.6}}>
        Select a pitch to manage your squad, track points and dominate the leaderboard
      </p>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
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
    </>)}

    {/* AUCTIONS TAB */}
    {mainTab === "auctions" && (<>
      <div style={{fontFamily:fonts.display,fontSize:28,fontWeight:900,color:T.text,letterSpacing:1,marginBottom:4}}>
        YOUR <span style={{color:"#A855F7"}}>AUCTIONS</span>
      </div>
      <p style={{fontFamily:fonts.body,fontSize:13,color:T.muted,marginTop:4,marginBottom:20,lineHeight:1.6}}>
        Run a live IPL-style auction to build squads before starting a league
      </p>

      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
        {!auctionsLoaded ? (
          <div style={{textAlign:"center",padding:"24px",fontFamily:fonts.display,fontSize:10,color:T.muted,letterSpacing:3}}>LOADING AUCTIONS…</div>
        ) : auctions.length === 0 ? (
          <div style={{background:T.card,border:"2px dashed #A855F733",padding:"32px 20px",textAlign:"center",clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)"}}>
            <div style={{fontSize:40,marginBottom:12}}>🔨</div>
            <div style={{fontFamily:fonts.display,fontSize:14,color:T.muted,letterSpacing:2,marginBottom:6}}>NO AUCTIONS YET</div>
            <div style={{fontFamily:fonts.body,fontSize:12,color:T.muted,opacity:0.6}}>Create your first auction to get started</div>
          </div>
        ) : auctions.map((auction, i) => {
          const statusColor = auction.status === "live" ? T.danger : auction.status === "ended" ? T.success : "#A855F7";
          const statusLabel = auction.status === "live" ? "🔴 LIVE" : auction.status === "ended" ? "✅ ENDED" : "⏳ SETUP";
          return (
            <div key={auction.id} style={{background:T.card,border:"2px solid #A855F722",borderLeft:"6px solid #A855F7",padding:"16px 18px",clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)",animation:`tb-fadeUp 0.4s ease ${i*0.07}s both`}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontFamily:fonts.display,fontSize:16,fontWeight:800,color:T.text,letterSpacing:0.5}}>{auction.name}</div>
                  <div style={{display:"flex",gap:8,marginTop:4,flexWrap:"wrap"}}>
                    <span style={{fontFamily:fonts.display,fontSize:9,color:statusColor,fontWeight:700,letterSpacing:1}}>{statusLabel}</span>
                    <span style={{fontFamily:fonts.body,fontSize:10,color:T.muted}}>{auction.teams?.length || 0} teams · ₹{auction.budget}Cr budget</span>
                    <span style={{fontFamily:fonts.body,fontSize:10,color:T.muted}}>Max {auction.maxSquad} players/team</span>
                  </div>
                </div>
                <button onClick={()=>{ setAuctionPwModal(auction); setAuctionPwInput(""); setAuctionPwErr(""); }}
                  style={{background:"linear-gradient(135deg,#A855F7,#7C3AED)",border:"none",color:"#fff",padding:"8px 14px",fontFamily:fonts.display,fontWeight:800,fontSize:11,cursor:"pointer",letterSpacing:1,clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)"}}>
                  {auction.status === "ended" ? "VIEW →" : "ENTER →"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {!showCreateAuction ? (
        <button onClick={()=>setShowCreateAuction(true)}
          style={{width:"100%",background:"transparent",border:"3px dashed #A855F755",borderRadius:0,padding:"18px",fontFamily:fonts.display,fontWeight:800,fontSize:14,color:"#A855F7",cursor:"pointer",letterSpacing:2,display:"flex",alignItems:"center",justifyContent:"center",gap:8,clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)"}}>
          🔨 CREATE NEW AUCTION
        </button>
      ) : (
        <AuctionCreateForm T={T} fonts={fonts}
          onCancel={()=>setShowCreateAuction(false)}
          onCreated={async (auction)=>{
            const updated = [...auctions, auction];
            await sbSet("auctions", updated);
            setAuctions(updated);
            setShowCreateAuction(false);
          }} />
      )}
    </>)}

      </div>
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

      {/* Auction Password Modal */}
      {auctionPwModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setAuctionPwModal(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.card,border:"3px solid #A855F7",maxWidth:360,width:"100%",padding:28,clipPath:"polygon(10px 0%,100% 0%,calc(100% - 10px) 100%,0% 100%)"}}>
            <div style={{fontFamily:fonts.display,fontSize:18,fontWeight:900,color:"#A855F7",letterSpacing:3,marginBottom:4}}>🔒 ENTER ROOM</div>
            <div style={{fontFamily:fonts.body,fontSize:12,color:T.muted,marginBottom:20}}>{auctionPwModal.name}</div>
            <input type="password" value={auctionPwInput} onChange={e=>{setAuctionPwInput(e.target.value);setAuctionPwErr("");}}
              onKeyDown={async e=>{if(e.key==="Enter"){const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(auctionPwInput)).then(buf=>Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join(""));if(hash===auctionPwModal.pwHash){setEditingAuction(auctionPwModal);setAuctionPwModal(null);}else setAuctionPwErr("Wrong password");}}}
              placeholder="Enter room password" autoFocus
              style={{width:"100%",background:T.bg,border:`2px solid ${auctionPwErr?"#EF4444":"#A855F744"}`,color:T.text,padding:"12px 14px",fontSize:14,fontFamily:fonts.body,outline:"none",boxSizing:"border-box",marginBottom:8}} />
            {auctionPwErr && <div style={{fontFamily:fonts.body,fontSize:11,color:"#EF4444",marginBottom:12}}>{auctionPwErr}</div>}
            <div style={{display:"flex",gap:8,marginTop:8}}>
              <button onClick={()=>setAuctionPwModal(null)} style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,color:T.muted,padding:"10px",fontFamily:fonts.display,fontWeight:700,fontSize:12,cursor:"pointer"}}>CANCEL</button>
              <button onClick={async()=>{const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(auctionPwInput)).then(buf=>Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join(""));if(hash===auctionPwModal.pwHash){setEditingAuction(auctionPwModal);setAuctionPwModal(null);}else setAuctionPwErr("Wrong password");}}
                style={{flex:2,background:"linear-gradient(135deg,#A855F7,#7C3AED)",border:"none",color:"#fff",padding:"10px",fontFamily:fonts.display,fontWeight:900,fontSize:13,cursor:"pointer",letterSpacing:1}}>
                ENTER →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function AuctionCreateForm({ T, fonts, onCancel, onCreated }) {
  const [name, setName] = useState("");
  const [numTeams, setNumTeams] = useState(4);
  const [budget, setBudget] = useState(1000);
  const [maxSquad, setMaxSquad] = useState(15);
  const [raiseBy, setRaiseBy] = useState(25);
  const [catBase, setCatBase] = useState({ PLATINUM: 2, GOLD: 1, SILVER: 0.5, BRONZE: 0.25 });
  const [teams, setTeams] = useState([
    {name:"Team 1",color:"#FF3D5A"},{name:"Team 2",color:"#4F8EF7"},
    {name:"Team 3",color:"#2ECC71"},{name:"Team 4",color:"#F5A623"},
  ]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [roomPassword, setRoomPassword] = useState("");
  const TEAM_COLORS = ["#FF3D5A","#4F8EF7","#2ECC71","#F5A623","#A855F7","#06B6D4","#FB923C","#10B981","#F43F5E","#8B5CF6"];

  const updateNumTeams = (n) => {
    const count = parseInt(n);
    setNumTeams(count);
    const updated = [...teams];
    while (updated.length < count) updated.push({name:"Team "+(updated.length+1),color:TEAM_COLORS[updated.length%TEAM_COLORS.length]});
    while (updated.length > count) updated.pop();
    setTeams(updated);
  };

  const inpStyle = {width:"100%",background:T.bg,border:`1px solid ${T.border}`,color:T.text,padding:"10px 12px",fontSize:13,fontFamily:fonts.body,outline:"none",boxSizing:"border-box"};
  const labelStyle = {fontFamily:fonts.display,fontSize:9,color:T.muted,letterSpacing:2,marginBottom:6,display:"block"};

  const handleCreate = async () => {
    if (!name.trim()) { setErr("Enter auction name"); return; }
    if (!roomPassword.trim()) { setErr("Set a room password"); return; }
    setSaving(true);
    const pwHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(roomPassword))
      .then(buf => Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join(""));
    const id = "auction_" + Date.now();
    const auction = {
      id, name: name.trim(), status: "setup",
      budget, maxSquad, raiseBy, catBase, pwHash,
      teams: teams.map((t,i) => ({id:"at"+i,name:t.name,color:t.color,budget,players:[]})),
      pool: [], queue: [], currentPlayer: null,
      currentBid: 0, currentBidder: null,
      timer: null, unsold: [], soldLog: [],
      createdAt: new Date().toISOString(),
    };
    await onCreated(auction);
    setSaving(false);
  };

  return (
    <div style={{background:T.card,border:"2px solid #A855F744",padding:24,clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)",animation:"tb-fadeUp 0.3s ease both"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <div style={{fontFamily:fonts.display,fontSize:18,fontWeight:900,color:"#A855F7",letterSpacing:3}}>🔨 NEW AUCTION</div>
        <button onClick={onCancel} style={{background:"transparent",border:"none",color:T.muted,fontSize:18,cursor:"pointer"}}>✕</button>
      </div>

      <div style={{marginBottom:16}}>
        <label style={labelStyle}>AUCTION NAME</label>
        <input value={name} onChange={e=>{setName(e.target.value);setErr("");}} placeholder="e.g. IPL Fantasy Auction 2025" style={inpStyle} autoFocus />
      </div>



      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        <div>
          <label style={labelStyle}>NUMBER OF TEAMS</label>
          <select value={numTeams} onChange={e=>updateNumTeams(e.target.value)} style={{...inpStyle,cursor:"pointer"}}>
            {[4,5,6,7,8,9,10].map(n=><option key={n} value={n}>{n} teams</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>BUDGET PER TEAM (CR)</label>
          <select value={budget} onChange={e=>setBudget(parseInt(e.target.value))} style={{...inpStyle,cursor:"pointer"}}>
            {[100,200,300,400,500,600,700,800,900,1000,1500,2000].map(b=><option key={b} value={b}>₹{b} Cr</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>MAX SQUAD SIZE</label>
          <select value={maxSquad} onChange={e=>setMaxSquad(parseInt(e.target.value))} style={{...inpStyle,cursor:"pointer"}}>
            {[10,11,12,13,14,15,16,17,18,19,20,22,25,28,30,35,40].map(n=><option key={n} value={n}>{n} players</option>)}
          </select>
        </div>

        <div style={{gridColumn:"1/-1"}}>
          <label style={labelStyle}>BID INCREMENT (CR)</label>
          <select value={raiseBy} onChange={e=>setRaiseBy(parseInt(e.target.value))} style={{...inpStyle,cursor:"pointer"}}>
            {[0.25,0.5,0.75,1,1.5,2,2.5,3,4,5,7.5,10,15,20,25,50,100].map(b=><option key={b} value={b}>+₹{b} Cr per bid</option>)}
          </select>
        </div>
        <div style={{gridColumn:"1/-1"}}>
          <label style={labelStyle}>BASE PRICE PER CATEGORY (CR)</label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {["PLATINUM","GOLD","SILVER","BRONZE"].map(cat => (
              <div key={cat} style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{fontSize:9,fontFamily:fonts.display,fontWeight:900,color:cat==="PLATINUM"?"#E5E4E2":cat==="GOLD"?"#F5A623":cat==="SILVER"?"#94A3B8":"#CD7F32",letterSpacing:1,width:60,flexShrink:0}}>{cat}</div>
                <select value={catBase[cat]} onChange={e=>setCatBase(p=>({...p,[cat]:parseFloat(e.target.value)}))} style={{...inpStyle,flex:1,padding:"6px 8px",fontSize:11}}>
                  {[0.25,0.5,0.75,1,1.5,2,2.5,3,4,5,7.5,10,15,20,25,50,100].map(v=><option key={v} value={v}>₹{v} Cr</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{marginBottom:20}}>
        <label style={labelStyle}>TEAM NAMES & COLORS</label>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {teams.map((team,i) => (
            <div key={i} style={{display:"flex",gap:8,alignItems:"center"}}>
              <input type="color" value={team.color} onChange={e=>{const u=[...teams];u[i]={...u[i],color:e.target.value};setTeams(u);}}
                style={{width:36,height:36,border:`1px solid ${T.border}`,background:"transparent",cursor:"pointer",padding:2,flexShrink:0}} />
              <input value={team.name} onChange={e=>{const u=[...teams];u[i]={...u[i],name:e.target.value};setTeams(u);}}
                placeholder={`Team ${i+1}`} style={{...inpStyle,flex:1}} />
            </div>
          ))}
        </div>
      </div>

      <div style={{marginBottom:16}}>
        <label style={labelStyle}>ROOM PASSWORD</label>
        <input type="password" value={roomPassword} onChange={e=>setRoomPassword(e.target.value)}
          placeholder="Set a password for this auction room"
          style={inpStyle} />
        <div style={{fontFamily:fonts.body,fontSize:10,color:T.muted,marginTop:4}}>Only people with this password can enter the auction</div>
      </div>

      {err && <div style={{fontFamily:fonts.body,color:T.danger,fontSize:12,marginBottom:12}}>{err}</div>}

      <div style={{display:"flex",gap:8}}>
        <button onClick={onCancel} style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,color:T.muted,padding:"11px",fontFamily:fonts.display,fontWeight:700,fontSize:13,cursor:"pointer"}}>CANCEL</button>
        <button onClick={handleCreate} disabled={saving} style={{flex:2,background:"linear-gradient(135deg,#A855F7,#7C3AED)",border:"none",color:"#fff",padding:"11px",fontFamily:fonts.display,fontWeight:900,fontSize:14,cursor:saving?"not-allowed":"pointer",opacity:saving?0.7:1,letterSpacing:1}}>
          {saving ? "CREATING\u2026" : "🔨 CREATE AUCTION →"}
        </button>
      </div>
    </div>
  );
}

export default PitchHome;
