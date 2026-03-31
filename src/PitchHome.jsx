import React, { useState, useEffect } from "react";

const SB_URL = "https://rmcxhorijitrhqyrvvkn.supabase.co/rest/v1/league_data";
const SB_KEY = "sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm";
const sbGet = async (key) => { try { const res = await fetch(SB_URL+"?key=eq."+encodeURIComponent(key), {headers:{"apikey":SB_KEY,"Authorization":"Bearer "+SB_KEY}}); const d=await res.json(); return d[0]?.value; } catch { return null; } };
const sbSet = async (key, value) => { try { await fetch(SB_URL, {method:"POST",headers:{"apikey":SB_KEY,"Authorization":"Bearer "+SB_KEY,"Content-Type":"application/json","Prefer":"resolution=merge-duplicates"},body:JSON.stringify({key,value,updated_at:new Date().toISOString()})}); } catch {} };

const COLORS = ["#F5A623","#4F8EF7","#2ECC71","#A855F7","#FF3D5A","#06B6D4"];

export default function PitchHome({ onEnter, user, onLogout, onSetupAdmin }) {
  const [pitches, setPitches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");
  const [pitchData, setPitchData] = useState({});
  const [liveTotal, setLiveTotal] = useState(0);
  const [matchTotal, setMatchTotal] = useState(0);

  useEffect(() => {
    const styleId = "tb-pulse-anim";
    if (!document.getElementById(styleId)) {
      const s = document.createElement("style");
      s.id = styleId;
      s.textContent = "@keyframes tbpulse{0%,100%{opacity:1}50%{opacity:0.3}}";
      document.head.appendChild(s);
    }
    (async () => {
      try {
        const data = await sbGet("pitches");
        const list = (data && Array.isArray(data)) ? data : [{id:"p1",name:"Pitch 1",hash:"",createdAt:new Date().toISOString()}];
        if (!data) await sbSet("pitches", list);
        setPitches(list);
        let lt = 0, mt = 0;
        const pd = {};
        for (const p of list) {
          const teams = await sbGet(p.id + "_teams") || [];
          const matches = await sbGet(p.id + "_matches") || [];
          const live = matches.filter(m => m.status === "live").length;
          lt += live; mt += matches.length;
          pd[p.id] = { teams, matchCount: matches.length, liveCount: live };
        }
        setLiveTotal(lt); setMatchTotal(mt); setPitchData(pd);
      } catch(e) { setPitches([{id:"p1",name:"Pitch 1",hash:"",createdAt:new Date().toISOString()}]); }
      setLoading(false);
    })();
  }, []);

  const createPitch = async () => {
    if (!newName.trim()) { setErr("Enter a pitch name"); return; }
    const id = "p" + (pitches.length + 1) + "_" + Date.now();
    const np = { id, name: newName.trim(), hash: "", createdAt: new Date().toISOString() };
    setNewName(""); setCreating(false); setErr("");
    onSetupAdmin(np, pitches);
  };

  if (loading) return (
    <div style={{minHeight:"100vh",background:"#080C14",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#F5A623",fontFamily:"Rajdhani,sans-serif",fontSize:20,letterSpacing:2}}>Loading…</div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"#080C14",fontFamily:"Barlow Condensed,sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700&family=Barlow+Condensed:wght@400;600;700;800&display=swap');`}</style>

      <div style={{background:"#0A0F1A",borderBottom:"1px solid #1E2D45",padding:"14px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <img src="/logo.png" style={{width:32,height:32,borderRadius:8,objectFit:"contain"}} alt="" />
          <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:20,color:"#F5A623",letterSpacing:2}}>TEEKHA BOUNCER</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:12,color:"#E2EAF4",fontWeight:700}}>{user?.email?.split("@")[0]}</div>
            <div style={{fontSize:10,color:"#4A5E78",display:"flex",alignItems:"center",gap:4,justifyContent:"flex-end"}}>
              <span style={{width:5,height:5,borderRadius:"50%",background:"#2ECC71",display:"inline-block"}} />online
            </div>
          </div>
          <button onClick={onLogout} style={{background:"transparent",border:"1px solid #1E2D45",borderRadius:6,padding:"5px 12px",color:"#4A5E78",fontSize:12,cursor:"pointer",fontWeight:700}}>LOGOUT</button>
        </div>
      </div>

      {liveTotal > 0 && (
        <div style={{background:"#FF3D5A11",borderBottom:"1px solid #FF3D5A22",padding:"12px 20px",display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:"#FF3D5A",flexShrink:0,animation:"tbpulse 1.5s infinite"}} />
          <div style={{flex:1}}>
            <div style={{fontSize:11,color:"#FF3D5A",fontWeight:700,letterSpacing:2}}>{liveTotal} MATCH{liveTotal>1?"ES":""} LIVE NOW</div>
            <div style={{fontSize:11,color:"#4A5E78",marginTop:1}}>Check Matches tab for live scores</div>
          </div>
          <div style={{fontSize:11,color:"#FF3D5A",fontWeight:700}}>LIVE</div>
        </div>
      )}

      <div style={{padding:"16px 20px 0"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:20}}>
          {[
            {num:pitches.length, label:"PITCHES"},
            {num:matchTotal, label:"MATCHES"},
            {num:liveTotal, label:"LIVE NOW", hi: liveTotal > 0},
          ].map((s,i) => (
            <div key={i} style={{background:"#0E1521",border:"1px solid #1E2D45",borderRadius:10,padding:"12px",textAlign:"center"}}>
              <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:26,fontWeight:700,color:s.hi?"#FF3D5A":"#F5A623",lineHeight:1}}>{s.num}</div>
              <div style={{fontSize:9,color:"#4A5E78",letterSpacing:2,marginTop:3}}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{fontSize:10,color:"#4A5E78",letterSpacing:3,marginBottom:12}}>YOUR PITCHES</div>

        {pitches.map((pitch, i) => {
          const color = COLORS[i % COLORS.length];
          const pd2 = pitchData[pitch.id] || {};
          const savedAdmin = (() => { try { return !!localStorage.getItem("tb_admin_" + pitch.id); } catch { return false; } })();
          const savedTeam = (() => { try { const s=localStorage.getItem("tb_myteam_" + pitch.id); return s?JSON.parse(s):null; } catch { return null; } })();
          const myLabel = savedAdmin ? "Admin" : savedTeam ? savedTeam.name : null;
          const myIcon = savedAdmin ? "KEY" : savedTeam ? "TEAM" : null;

          return (
            <div key={pitch.id} style={{background:"#0E1521",borderRadius:14,border:"1px solid "+color+"44",marginBottom:12,overflow:"hidden"}}>
              <div style={{padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:44,height:44,borderRadius:10,background:color+"22",border:"1px solid "+color+"44",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Rajdhani,sans-serif",fontWeight:800,fontSize:16,color:color,flexShrink:0}}>
                  {"P"+(i+1)}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:18,color:"#E2EAF4",letterSpacing:1}}>{pitch.name}</div>
                  <div style={{fontSize:11,color:"#4A5E78",marginTop:2,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <span>{pd2.teams?.length||0} teams</span>
                    {pd2.matchCount > 0 && <span>· {pd2.matchCount} matches</span>}
                    {pd2.liveCount > 0 && <span style={{color:"#FF3D5A",fontWeight:700}}>· {pd2.liveCount} live</span>}
                    {myLabel && <span style={{color:color,fontWeight:700}}>· {myIcon==="KEY"?"🔑":"🏏"} {myLabel}</span>}
                  </div>
                </div>
                <button onClick={() => onEnter(pitch)}
                  style={{background:color,border:"none",borderRadius:8,padding:"8px 16px",color:"#080C14",fontFamily:"Barlow Condensed,sans-serif",fontWeight:800,fontSize:13,cursor:"pointer",letterSpacing:1,flexShrink:0}}>
                  {myLabel ? "ENTER" : "JOIN"}
                </button>
              </div>
              {pd2.teams?.length > 0 && (
                <div style={{borderTop:"1px solid "+color+"22",padding:"8px 16px",display:"flex",gap:6,flexWrap:"wrap"}}>
                  {pd2.teams.map((t, ti) => (
                    <div key={t.id} style={{display:"flex",alignItems:"center",gap:4,background:"#080C14",borderRadius:6,padding:"3px 8px"}}>
                      <span style={{fontFamily:"Rajdhani,sans-serif",fontSize:11,color:"#4A5E78",minWidth:12}}>{ti+1}</span>
                      <span style={{width:6,height:6,borderRadius:"50%",background:t.color||"#888",flexShrink:0}} />
                      <span style={{fontSize:11,color:"#E2EAF4",fontWeight:600}}>{t.name.split(" ")[0]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {!creating ? (
          <button onClick={() => setCreating(true)}
            style={{width:"100%",background:"transparent",border:"1px dashed #1E2D45",borderRadius:14,padding:"16px",color:"#4A5E78",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer",letterSpacing:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:20}}>
            <span style={{fontSize:18,color:"#F5A623"}}>+</span> CREATE NEW PITCH
          </button>
        ) : (
          <div style={{background:"#0E1521",borderRadius:14,border:"1px solid #1E2D45",padding:20,marginBottom:20}}>
            <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:16,fontWeight:700,color:"#F5A623",marginBottom:12}}>NEW PITCH</div>
            <input value={newName} onChange={e=>{setNewName(e.target.value);setErr("");}} placeholder="e.g. Office IPL League" autoFocus
              onKeyDown={e=>e.key==="Enter"&&createPitch()}
              style={{width:"100%",background:"#080C14",border:"1px solid #1E2D45",borderRadius:8,padding:"10px 14px",color:"#E2EAF4",fontSize:15,fontFamily:"Barlow Condensed,sans-serif",outline:"none",marginBottom:10,boxSizing:"border-box"}} />
            {err && <div style={{color:"#FF3D5A",fontSize:12,marginBottom:8}}>{err}</div>}
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{setCreating(false);setNewName("");setErr("");}}
                style={{flex:1,background:"transparent",border:"1px solid #1E2D45",borderRadius:8,padding:10,color:"#4A5E78",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
              <button onClick={createPitch}
                style={{flex:2,background:"#F5A623",border:"none",borderRadius:8,padding:10,color:"#080C14",fontFamily:"Barlow Condensed,sans-serif",fontWeight:800,fontSize:15,cursor:"pointer"}}>CREATE AND SET UP</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
