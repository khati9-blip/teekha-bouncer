import React, { useState, useEffect } from "react";

async function callAI(userPrompt, system = "Return only valid JSON.") {
  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: userPrompt }],
  };
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
}

function parseJSON(text) {
  // Try to extract a JSON array even if the response is truncated
  const clean = text.replace(/^```json\s*/m, "").replace(/^```\s*/m, "").replace(/```\s*$/m, "").trim();
  try { return JSON.parse(clean); } catch {}
  // Try to salvage truncated JSON by finding last complete object
  const lastBrace = clean.lastIndexOf("},");
  if (lastBrace > 0) {
    try { return JSON.parse(clean.slice(0, lastBrace + 1) + "]"); } catch {}
  }
  const lastBrace2 = clean.lastIndexOf("}");
  if (lastBrace2 > 0) {
    try { return JSON.parse(clean.slice(0, lastBrace2 + 1) + "]"); } catch {}
  }
  throw new Error("Could not parse response as JSON");
}


// ── CRICBUZZ API ──────────────────────────────────────────────────────────────
async function cricbuzz(path) {
  const res = await fetch(`/api/cricbuzz?path=${encodeURIComponent(path)}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function fetchIPLMatches() {
  // Get all series — find IPL 2026
  const data = await cricbuzz("series/v1/get-matches?seriesId=7607");
  return data;
}

async function fetchLiveScorecard(matchId) {
  const data = await cricbuzz(`mcenter/v1/${matchId}/full-scorecard`);
  return data;
}

async function fetchRecentIPLMatches() {
  const data = await cricbuzz("matches/v1/recent");
  // Filter for IPL matches
  const ipl = [];
  if (data.typeMatches) {
    for (const type of data.typeMatches) {
      for (const series of (type.seriesMatches || [])) {
        const sm = series.seriesAdWrapper || series;
        if (sm.seriesName && sm.seriesName.includes("Indian Premier League")) {
          for (const match of (sm.matches || [])) {
            ipl.push(match.matchInfo);
          }
        }
      }
    }
  }
  return ipl;
}

function parseScorecardToStats(scorecard, playerIndex) {
  // playerIndex: [{name, id}]
  const stats = {};
  const nameToId = {};
  for (const p of playerIndex) {
    nameToId[p.name.toLowerCase()] = p.id;
    // also try last name match
    const parts = p.name.toLowerCase().split(" ");
    if (parts.length > 1) nameToId[parts[parts.length-1]] = p.id;
  }

  const findId = (name) => {
    if (!name) return null;
    const n = name.toLowerCase().trim();
    if (nameToId[n]) return nameToId[n];
    // partial match
    for (const [key, id] of Object.entries(nameToId)) {
      if (n.includes(key) || key.includes(n)) return id;
    }
    return null;
  };

  const ensure = (pid, name) => {
    if (!stats[pid]) stats[pid] = { playerId: pid, name, runs:0, fours:0, sixes:0, wickets:0, economy:null, overs:0, catches:0, stumpings:0, runouts:0, longestSix:false };
  };

  try {
    for (const inning of (scorecard.scoreCard || [])) {
      // Batting
      for (const batter of (inning.batTeamDetails?.batsmenData ? Object.values(inning.batTeamDetails.batsmenData) : [])) {
        const pid = findId(batter.batName);
        if (!pid) continue;
        ensure(pid, batter.batName);
        stats[pid].runs += batter.runs || 0;
        stats[pid].fours += batter.fours || 0;
        stats[pid].sixes += batter.sixes || 0;
      }
      // Bowling
      for (const bowler of (inning.bowlTeamDetails?.bowlersData ? Object.values(inning.bowlTeamDetails.bowlersData) : [])) {
        const pid = findId(bowler.bowlName);
        if (!pid) continue;
        ensure(pid, bowler.bowlName);
        stats[pid].wickets += bowler.wickets || 0;
        stats[pid].overs += parseFloat(bowler.overs) || 0;
        const eco = parseFloat(bowler.economy);
        if (!isNaN(eco)) stats[pid].economy = stats[pid].economy ? (stats[pid].economy + eco) / 2 : eco;
      }
      // Fielding from wickets
      for (const batter of (inning.batTeamDetails?.batsmenData ? Object.values(inning.batTeamDetails.batsmenData) : [])) {
        const wkt = batter.outDesc || "";
        if (wkt.startsWith("c ")) {
          const fielder = wkt.split("c ")[1]?.split(" b ")[0]?.trim();
          const pid = findId(fielder);
          if (pid) { ensure(pid, fielder); stats[pid].catches += 1; }
        }
        if (wkt.startsWith("st ")) {
          const keeper = wkt.split("st ")[1]?.split(" b ")[0]?.trim();
          const pid = findId(keeper);
          if (pid) { ensure(pid, keeper); stats[pid].stumpings += 1; }
        }
        if (wkt.toLowerCase().includes("run out")) {
          const match = wkt.match(/run out \(([^)]+)\)/i);
          if (match) {
            for (const name of match[1].split("/")) {
              const pid = findId(name.trim());
              if (pid) { ensure(pid, name.trim()); stats[pid].runouts += 1; }
            }
          }
        }
      }
    }
  } catch(e) { console.error("Scorecard parse error:", e); }

  return Object.values(stats);
}

function calcPoints(s) {
  let p = 0;
  const runs   = +s.runs      || 0;
  const fours  = +s.fours     || 0;
  const sixes  = +s.sixes     || 0;
  const wkts   = +s.wickets   || 0;
  const eco    = s.economy !== "" && s.economy != null ? +s.economy : null;
  const ovs    = +s.overs     || 0;
  const catches= +s.catches   || 0;
  const stump  = +s.stumpings || 0;
  const ro     = +s.runouts   || 0;

  // ── BATTING ──────────────────────────────────────────────────────────────
  p += runs;           // 1 pt per run
  p += fours * 8;      // +8 per four
  p += sixes * 12;     // +12 per six
  // Milestone — only highest counts
  if      (runs >= 100) p += 20;   // +20 for century
  else if (runs >= 50)  p += 10;   // +10 for half-century

  // ── BOWLING ──────────────────────────────────────────────────────────────
  p += wkts * 25;      // 25 pts per wicket
  // Milestone — only highest counts
  if      (wkts >= 5) p += 15;   // +15 for 5-wkt haul
  else if (wkts >= 4) p += 8;    // +8 for 4-wkt haul
  // Economy bonus — min 2 overs bowled
  if (ovs >= 2 && eco !== null && eco < 6) p += 10;

  // ── FIELDING ─────────────────────────────────────────────────────────────
  p += catches * 8;          // +8 per catch
  p += (stump + ro) * 12;   // +12 per stumping or run-out

  // ── ALL-ROUND BONUS ──────────────────────────────────────────────────────
  if (runs >= 30 && wkts >= 2) p += 15;  // 30+ runs AND 2+ wickets

  // ── SPECIAL BONUS ────────────────────────────────────────────────────────
  if (s.longestSix) p += 50;   // Longest six of the match

  return Math.round(p);
}

// Point breakdown for display
function calcBreakdown(s) {
  const runs   = +s.runs      || 0;
  const fours  = +s.fours     || 0;
  const sixes  = +s.sixes     || 0;
  const wkts   = +s.wickets   || 0;
  const eco    = s.economy !== "" && s.economy != null ? +s.economy : null;
  const ovs    = +s.overs     || 0;
  const catches= +s.catches   || 0;
  const stump  = +s.stumpings || 0;
  const ro     = +s.runouts   || 0;
  const items = [];
  if (runs)    items.push(`${runs} runs = +${runs}`);
  if (fours)   items.push(`${fours}×4 = +${fours*8}`);
  if (sixes)   items.push(`${sixes}×6 = +${sixes*12}`);
  if (runs>=100) items.push(`Century bonus = +20`);
  else if (runs>=50) items.push(`Half-century bonus = +10`);
  if (wkts)    items.push(`${wkts} wkts = +${wkts*25}`);
  if (wkts>=5) items.push(`5-wkt haul = +15`);
  else if (wkts>=4) items.push(`4-wkt haul = +8`);
  if (ovs>=2 && eco!==null && eco<6) items.push(`Economy <6 = +10`);
  if (catches) items.push(`${catches} catch${catches>1?"es":""} = +${catches*8}`);
  if (stump)   items.push(`${stump} stumping${stump>1?"s":""} = +${stump*12}`);
  if (ro)      items.push(`${ro} run-out${ro>1?"s":""} = +${ro*12}`);
  if (runs>=30&&wkts>=2) items.push(`All-round bonus = +15`);
  if (s.longestSix) items.push(`Longest six = +50`);
  return items;
}

const SUPABASE_URL = "https://rmcxhorijitrhqyrvvkn.supabase.co";
const SUPABASE_KEY = "sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm";
const SB_HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
};

// Local cache to avoid slow reads
const localCache = {};

async function storeGet(key) {
  if (localCache[key] !== undefined) return localCache[key];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/league_data?key=eq.${encodeURIComponent(key)}&select=value`, {
      headers: SB_HEADERS,
    });
    const data = await res.json();
    const val = data?.[0]?.value ?? null;
    localCache[key] = val;
    return val;
  } catch { return null; }
}

async function storeSet(key, val) {
  localCache[key] = val;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/league_data`, {
      method: "POST",
      headers: { ...SB_HEADERS, "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify({ key, value: val, updated_at: new Date().toISOString() }),
    });
  } catch(e) { console.warn("storeSet failed:", e.message); }
}

async function storeDel(key) {
  delete localCache[key];
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/league_data?key=eq.${encodeURIComponent(key)}`, {
      method: "DELETE",
      headers: SB_HEADERS,
    });
  } catch(e) { console.warn("storeDel failed:", e.message); }
}

async function hashPw(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function PasswordModal({ onSuccess, onClose, storedHash }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [mode, setMode] = useState("login"); // login | forgot | enterCode
  const [sending, setSending] = useState(false);
  const isFirstTime = !storedHash;

  const inp = {width:"100%",background:"#080C14",border:`1px solid ${err?"#FF3D5A":"#1E2D45"}`,borderRadius:8,padding:"12px 16px",color:"#E2EAF4",fontSize:16,fontFamily:"Barlow Condensed,sans-serif",outline:"none",marginBottom:err?8:20,boxSizing:"border-box"};
  const cancelBtn = {flex:1,background:"transparent",border:"1px solid #1E2D45",borderRadius:8,padding:11,color:"#4A5E78",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"};
  const primaryBtn = (col="#F5A623") => ({flex:2,background:`linear-gradient(135deg,${col},${col}bb)`,border:"none",borderRadius:8,padding:11,color:"#080C14",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"});

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
    <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.95)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,backdropFilter:"blur(6px)"}}>
      <div style={{background:"#141E2E",borderRadius:16,border:"1px solid #1E2D45",padding:32,width:"100%",maxWidth:360,margin:"0 16px"}}>

        {mode==="login" && <>
          <div style={{fontSize:36,textAlign:"center",marginBottom:8}}>🔐</div>
          <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:22,fontWeight:700,color:"#F5A623",textAlign:"center",letterSpacing:2,marginBottom:4}}>
            {isFirstTime ? "SET LEAGUE PASSWORD" : "SQUAD LOCKED"}
          </div>
          <div style={{fontSize:13,color:"#4A5E78",textAlign:"center",marginBottom:24}}>
            {isFirstTime ? "Choose a password to protect squad changes" : "Enter password to modify squads"}
          </div>
          <input type="password" value={pw} onChange={e=>{setPw(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder={isFirstTime?"Choose a password…":"League password…"} autoFocus style={inp} />
          {err && <div style={{color:"#FF3D5A",fontSize:13,marginBottom:16,textAlign:"center"}}>{err}</div>}
          <div style={{display:"flex",gap:10}}>
            <button onClick={onClose} style={cancelBtn}>CANCEL</button>
            <button onClick={submit} style={primaryBtn()}>{isFirstTime?"SET PASSWORD":"UNLOCK"}</button>
          </div>
          {!isFirstTime && (
            <div style={{marginTop:16,textAlign:"center",display:"flex",justifyContent:"center",gap:20}}>
              <button onClick={async()=>{const p=prompt("Enter NEW password:");if(!p)return;onSuccess(await hashPw(p),true);}} style={{background:"none",border:"none",color:"#4A5E78",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>Change password</button>
              <button onClick={()=>{reset();setMode("forgot");}} style={{background:"none",border:"none",color:"#FF3D5A",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>Forgot password?</button>
            </div>
          )}
        </>}

        {mode==="forgot" && <>
          <div style={{fontSize:36,textAlign:"center",marginBottom:8}}>📧</div>
          <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:22,fontWeight:700,color:"#F5A623",textAlign:"center",letterSpacing:2,marginBottom:4}}>RESET PASSWORD</div>
          <div style={{fontSize:13,color:"#4A5E78",textAlign:"center",marginBottom:24}}>Enter the admin email — we'll send a reset code</div>
          <input type="email" value={pw} onChange={e=>{setPw(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&sendCode()} placeholder="Admin email address…" autoFocus style={inp} />
          {err && <div style={{color:"#FF3D5A",fontSize:13,marginBottom:16,textAlign:"center"}}>{err}</div>}
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>{reset();setMode("login");}} style={cancelBtn}>BACK</button>
            <button onClick={sendCode} disabled={sending} style={{...primaryBtn("#4F8EF7"),color:"#fff",opacity:sending?0.6:1}}>{sending?"SENDING…":"SEND CODE"}</button>
          </div>
        </>}

        {mode==="enterCode" && <>
          <div style={{fontSize:36,textAlign:"center",marginBottom:8}}>✉️</div>
          <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:22,fontWeight:700,color:"#F5A623",textAlign:"center",letterSpacing:2,marginBottom:4}}>ENTER CODE</div>
          <div style={{fontSize:13,color:"#2ECC71",textAlign:"center",marginBottom:24}}>Reset code sent! Check your email inbox.</div>
          <input type="text" value={pw} onChange={e=>{setPw(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&verifyCode()} placeholder="Paste reset code…" autoFocus
            style={{...inp,letterSpacing:4,textAlign:"center"}} />
          {err && <div style={{color:"#FF3D5A",fontSize:13,marginBottom:16,textAlign:"center"}}>{err}</div>}
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>{reset();setMode("forgot");}} style={cancelBtn}>BACK</button>
            <button onClick={verifyCode} style={primaryBtn()}>VERIFY & RESET</button>
          </div>
        </>}

      </div>
    </div>
  );
}

const PALETTE = ["#FF3D5A","#4F8EF7","#2ECC71","#F5A623","#A855F7","#06B6D4","#FF6B35","#EC4899","#84CC16","#64748B"];
const ROLE_COLORS = { Batsman:"#4F8EF7", Bowler:"#FF3D5A", "All-Rounder":"#2ECC71", "Wicket-Keeper":"#F5A623" };
const ROLES = ["All","Batsman","Bowler","All-Rounder","Wicket-Keeper"];
const IPL_TEAMS = ["CSK","MI","RCB","KKR","SRH","RR","PBKS","DC","GT","LSG"];

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&family=Barlow+Condensed:wght@400;600;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  :root{--bg:#080C14;--surface:#0E1521;--card:#141E2E;--border:#1E2D45;--gold:#F5A623;--text:#E2EAF4;--muted:#4A5E78;--accent:#4F8EF7;}
  .light-mode{--bg:#F0F4F8;--surface:#FFFFFF;--card:#FFFFFF;--border:#E2E8F0;--text:#1A202C;--muted:#718096;}
  body{font-family:'Barlow Condensed',sans-serif;background:var(--bg);color:var(--text);}
  select,input{font-family:inherit;}
  ::-webkit-scrollbar{width:6px;}::-webkit-scrollbar-track{background:var(--surface);}::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px;}
  .fade-in{animation:fadeIn .3s ease;}
  @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  @keyframes spin{to{transform:rotate(360deg)}}
`;

function Spinner() { return <div style={{width:24,height:24,border:"3px solid #1E2D45",borderTop:"3px solid #F5A623",borderRadius:"50%",animation:"spin 0.8s linear infinite",display:"inline-block"}} />; }
function Badge({ label, color="#4F8EF7" }) { return <span style={{background:color+"22",color,border:`1px solid ${color}44`,padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:600}}>{label}</span>; }
function Btn({ children, onClick, variant="primary", disabled, style:sx={} }) {
  const base={fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:15,letterSpacing:1,textTransform:"uppercase",border:"none",borderRadius:8,padding:"10px 22px",cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.5:1,...sx};
  const v={primary:{background:"linear-gradient(135deg,#F5A623,#FF8C00)",color:"#080C14"},blue:{background:"linear-gradient(135deg,#4F8EF7,#1a5fb4)",color:"#fff"},ghost:{background:"transparent",color:"#4A5E78",border:"1px solid #1E2D45"},danger:{background:"#FF3D5A22",color:"#FF3D5A",border:"1px solid #FF3D5A44"}};
  return <button onClick={disabled?undefined:onClick} style={{...base,...v[variant],...sx}}>{children}</button>;
}
function Card({ children, style:sx={}, accent }) {
  return <div style={{background:"var(--card)",borderRadius:12,border:"1px solid var(--border)",...(accent?{borderTop:`3px solid ${accent}`}:{}),...sx}}>{children}</div>;
}


// ── EDIT PLAYER MODAL ────────────────────────────────────────────────────────
function EditPlayerModal({ player, onSave, onAdd, onClose }) {
  const isNew = !player.id;
  const [name, setName] = useState(player.name || "");
  const [iplTeam, setIplTeam] = useState(player.iplTeam || "");
  const [role, setRole] = useState(player.role || "Batsman");
  const IPL_FRANCHISE = ["CSK","MI","RCB","KKR","SRH","RR","PBKS","DC","GT","LSG"];

  const submit = () => {
    if (!name.trim()) { alert("Enter player name"); return; }
    if (!iplTeam.trim()) { alert("Select IPL franchise"); return; }
    const id = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") + "-" + Date.now();
    if (isNew) onAdd({ id, name: name.trim(), iplTeam: iplTeam.trim(), role });
    else onSave({ ...player, name: name.trim(), iplTeam: iplTeam.trim(), role });
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.95)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,backdropFilter:"blur(6px)"}}>
      <div style={{background:"#141E2E",borderRadius:16,border:"1px solid #1E2D45",padding:32,width:"100%",maxWidth:400,margin:"0 16px"}}>
        <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:22,fontWeight:700,color:"#F5A623",letterSpacing:2,marginBottom:24}}>{isNew ? "✚ ADD PLAYER" : "✏️ EDIT PLAYER"}</div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:"#4A5E78",letterSpacing:1,marginBottom:6}}>PLAYER NAME</div>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Full Name" style={{width:"100%",background:"#080C14",border:"1px solid #1E2D45",borderRadius:8,padding:"10px 14px",color:"#E2EAF4",fontSize:15,fontFamily:"Barlow Condensed,sans-serif",outline:"none",boxSizing:"border-box"}} />
        </div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:"#4A5E78",letterSpacing:1,marginBottom:6}}>IPL FRANCHISE</div>
          <select value={iplTeam} onChange={e=>setIplTeam(e.target.value)} style={{width:"100%",background:"#080C14",border:"1px solid #1E2D45",borderRadius:8,padding:"10px 14px",color:"#E2EAF4",fontSize:15,fontFamily:"Barlow Condensed,sans-serif",outline:"none"}}>
            <option value="">— Select Franchise —</option>
            {IPL_FRANCHISE.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{marginBottom:24}}>
          <div style={{fontSize:11,color:"#4A5E78",letterSpacing:1,marginBottom:6}}>ROLE</div>
          <select value={role} onChange={e=>setRole(e.target.value)} style={{width:"100%",background:"#080C14",border:"1px solid #1E2D45",borderRadius:8,padding:"10px 14px",color:"#E2EAF4",fontSize:15,fontFamily:"Barlow Condensed,sans-serif",outline:"none"}}>
            {["Batsman","Bowler","All-Rounder","Wicket-Keeper"].map(r=><option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,background:"transparent",border:"1px solid #1E2D45",borderRadius:8,padding:11,color:"#4A5E78",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
          <button onClick={submit} style={{flex:2,background:"linear-gradient(135deg,#F5A623,#FF8C00)",border:"none",borderRadius:8,padding:11,color:"#080C14",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>{isNew ? "ADD PLAYER" : "SAVE CHANGES"}</button>
        </div>
      </div>
    </div>
  );
}



// ── SMART STATS MODAL (Cricbuzz auto-fill + manual edit) ────────────────────
function SmartStatsModal({ match, players, assignments, existingStats, onSave, onClose }) {
  const matchPlayers = players.filter(p => assignments[p.id]);
  const emptyStats = (p) => ({ runs:0, fours:0, sixes:0, wickets:0, economy:"", overs:0, catches:0, stumpings:0, runouts:0, longestSix:false, played:false });

  const [stats, setStats] = React.useState(() => {
    const s = {};
    matchPlayers.forEach(p => {
      const existing = existingStats?.[p.id];
      s[p.id] = existing ? { ...existing, played:true } : emptyStats(p);
    });
    return s;
  });

  const [search, setSearch] = React.useState("");
  const [activeTab, setActiveTab] = React.useState("batting");
  const [fetching, setFetching] = React.useState(false);
  const [fetchStatus, setFetchStatus] = React.useState("");

  const upd = (pid, field, val) => setStats(s => ({...s, [pid]: {...s[pid], [field]: val}}));

  const playingPlayers = matchPlayers.filter(p => stats[p.id]?.played);

  const filteredPlayers = matchPlayers.filter(p => {
    const s = search.toLowerCase();
    return p.name.toLowerCase().includes(s) || (p.iplTeam||"").toLowerCase().includes(s);
  });

  // ── Fetch from Cricbuzz ──
  const fetchFromCricbuzz = async () => {
    if (!match.cricbuzzId) {
      setFetchStatus("⚠️ No Cricbuzz ID for this match. Please enter stats manually.");
      return;
    }
    setFetching(true);
    setFetchStatus("Fetching scorecard from Cricbuzz…");
    try {
      // Use hscard endpoint (available on free plan)
      const res = await fetch(`/api/cricbuzz?path=${encodeURIComponent("mcenter/v1/" + match.cricbuzzId + "/hscard")}`);
      const data = await res.json();
      if (data.message) throw new Error(data.message);

      // Build name lookup from our players
      const nameToPlayer = {};
      matchPlayers.forEach(p => {
        nameToPlayer[p.name.toLowerCase().trim()] = p;
        // Also index by last name and first name
        const parts = p.name.toLowerCase().split(" ");
        parts.forEach(part => { if (part.length > 2) nameToPlayer[part.trim()] = p; });
      });

      const findPlayer = (name) => {
        if (!name) return null;
        const n = name.toLowerCase().trim();

        // 1. Exact full name match — always trust this
        if (nameToPlayer[n]) return nameToPlayer[n];

        // 2. Match by FULL last name (surname) — must be 5+ chars
        // e.g. Cricbuzz "Shivam Dube" → last name "dube" → find "Shivam Dube" in our list
        const nParts = n.split(" ");
        const nLast = nParts[nParts.length - 1];

        // Only match by last name if it's unique enough (5+ chars)
        if (nLast.length >= 5) {
          // Find all players with this last name
          const candidates = Object.entries(nameToPlayer).filter(([key]) => {
            const kParts = key.split(" ");
            return kParts[kParts.length - 1] === nLast;
          });
          // Only use if exactly ONE candidate — avoids false matches between similarly surnamed players
          if (candidates.length === 1) return candidates[0][1];
        }

        // 3. Full name starts-with match (handles nickname vs full name)
        // e.g. "virat" matching "virat kohli" — only if 6+ chars
        for (const [key, pl] of Object.entries(nameToPlayer)) {
          if (key.length >= 6 && n.length >= 6) {
            if (key === n) return pl;
            // Both must share first AND last name tokens
            const kParts = key.split(" ");
            if (kParts.length >= 2 && nParts.length >= 2) {
              const firstMatch = kParts[0] === nParts[0];
              const lastMatch = kParts[kParts.length-1] === nParts[nParts.length-1];
              if (firstMatch && lastMatch) return pl;
            }
          }
        }

        return null;
      };

      const newStats = {...stats};
      let matched = 0;

      for (const inning of (data.scorecard || [])) {
        // Batting — data is array or object of batsmen
        const batArr = Array.isArray(inning.batsman)
          ? inning.batsman
          : Object.values(inning.batsman || {});

        for (const b of batArr) {
          if (!b.name) continue;
          const pl = findPlayer(b.name);
          if (!pl) continue;
          newStats[pl.id] = {
            ...newStats[pl.id],
            played: true,
            runs: +b.runs || 0,
            fours: +b.fours || 0,
            sixes: +b.sixes || 0,
          };
          matched++;

          // Fielding from outdec e.g. "c Phil Salt b Jacob Duffy"
          const out = b.outdec || "";
          if (out.startsWith("c ") && out.includes(" b ")) {
            const fielderName = out.slice(2, out.indexOf(" b ")).trim();
            const fp = findPlayer(fielderName);
            if (fp) {
              newStats[fp.id] = {...(newStats[fp.id]||emptyStats(fp)), played:true, catches:(+(newStats[fp.id]?.catches)||0)+1};
            }
          } else if (out.startsWith("st ")) {
            const keeperName = out.slice(3, out.indexOf(" b ")).trim();
            const kp = findPlayer(keeperName);
            if (kp) {
              newStats[kp.id] = {...(newStats[kp.id]||emptyStats(kp)), played:true, stumpings:(+(newStats[kp.id]?.stumpings)||0)+1};
            }
          } else if (out.toLowerCase().includes("run out")) {
            const roMatch = out.match(/run out \(([^)]+)\)/i);
            if (roMatch) {
              for (const rname of roMatch[1].split("/")) {
                const rp = findPlayer(rname.trim());
                if (rp) {
                  newStats[rp.id] = {...(newStats[rp.id]||emptyStats(rp)), played:true, runouts:(+(newStats[rp.id]?.runouts)||0)+1};
                }
              }
            }
          }
        }

        // Bowling
        const bowlArr = Array.isArray(inning.bowler)
          ? inning.bowler
          : Object.values(inning.bowler || {});

        for (const b of bowlArr) {
          if (!b.name) continue;
          const pl = findPlayer(b.name);
          if (!pl) continue;
          const prev = newStats[pl.id] || emptyStats(pl);
          newStats[pl.id] = {
            ...prev,
            played: true,
            wickets: (+(prev.wickets)||0) + (+b.wickets||0),
            overs: (+(prev.overs)||0) + (+b.overs||0),
            economy: b.economy || prev.economy || "",
          };
          matched++;
        }
      }

      setStats(newStats);
      setFetchStatus(`✅ Fetched! ${matched} player records auto-filled. Review and correct if needed.`);
    } catch(e) {
      setFetchStatus("❌ Cricbuzz fetch failed: " + e.message + ". Enter stats manually below.");
    }
    setFetching(false);
  };

  const submit = () => {
    const result = Object.entries(stats)
      .filter(([pid, s]) => s.played)
      .map(([pid, s]) => ({ playerId:pid, ...s }));
    if (result.length === 0) { alert("Mark at least one player as played"); return; }
    onSave(result);
  };

  const tabBtn = (tab, label) => (
    <button onClick={()=>setActiveTab(tab)} style={{padding:"8px 16px",border:"none",cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:13,letterSpacing:1,background:activeTab===tab?"#F5A623":"transparent",color:activeTab===tab?"#080C14":"#4A5E78",borderRadius:6}}>
      {label}
    </button>
  );

  const inp = {width:"100%",background:"#080C14",border:"1px solid #1E2D45",borderRadius:6,padding:"6px 4px",color:"#E2EAF4",fontSize:14,fontFamily:"Barlow Condensed,sans-serif",textAlign:"center"};

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.97)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,backdropFilter:"blur(6px)"}}>
      <div style={{background:"#141E2E",borderRadius:16,border:"1px solid #1E2D45",width:"100%",maxWidth:720,margin:"0 12px",maxHeight:"92vh",display:"flex",flexDirection:"column"}}>

        {/* Header */}
        <div style={{padding:"18px 24px",borderBottom:"1px solid #1E2D45",flexShrink:0}}>
          <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:20,fontWeight:700,color:"#F5A623",letterSpacing:2}}>📊 MATCH STATS — M{match.matchNum}</div>
          <div style={{color:"#4A5E78",fontSize:13,marginTop:2}}>{match.team1} vs {match.team2} • {match.date} • {match.venue}</div>
          <div style={{marginTop:12,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <button onClick={fetchFromCricbuzz} disabled={fetching}
              style={{background:"linear-gradient(135deg,#4F8EF7,#1a5fb4)",border:"none",borderRadius:8,padding:"9px 18px",color:"#fff",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:13,cursor:fetching?"not-allowed":"pointer",opacity:fetching?0.6:1,letterSpacing:1}}>
              {fetching?"⏳ FETCHING…":"🌐 AUTO-FILL FROM CRICBUZZ"}
            </button>
            {fetchStatus && <span style={{fontSize:12,color:fetchStatus.startsWith("✅")?"#2ECC71":fetchStatus.startsWith("❌")?"#FF3D5A":"#F5A623"}}>{fetchStatus}</span>}
          </div>
        </div>

        {/* Step 1: Mark players */}
        <div style={{padding:"14px 24px",borderBottom:"1px solid #1E2D45",flexShrink:0}}>
          <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,fontWeight:700,marginBottom:8}}>
            STEP 1 — MARK WHO PLAYED &nbsp;<span style={{color:"#2ECC71"}}>({playingPlayers.length} selected)</span>
          </div>
          <input placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}
            style={{width:"100%",background:"#080C14",border:"1px solid #1E2D45",borderRadius:8,padding:"7px 12px",color:"#E2EAF4",fontSize:13,fontFamily:"Barlow Condensed",marginBottom:8,boxSizing:"border-box"}} />
          <div style={{maxHeight:100,overflowY:"auto",display:"flex",flexWrap:"wrap",gap:5}}>
            {filteredPlayers.map(p=>(
              <button key={p.id} onClick={()=>upd(p.id,"played",!stats[p.id]?.played)}
                style={{padding:"4px 10px",borderRadius:20,border:`1px solid ${stats[p.id]?.played?"#2ECC71":"#1E2D45"}`,background:stats[p.id]?.played?"#2ECC7122":"transparent",color:stats[p.id]?.played?"#2ECC71":"#4A5E78",fontSize:12,fontFamily:"Barlow Condensed,sans-serif",cursor:"pointer",fontWeight:600}}>
                {stats[p.id]?.played?"✓ ":""}{p.name} <span style={{opacity:0.5,fontSize:10}}>({p.iplTeam})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: Stats tabs */}
        {playingPlayers.length > 0 && (
          <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
            <div style={{padding:"10px 24px",borderBottom:"1px solid #1E2D45",flexShrink:0,display:"flex",gap:6,alignItems:"center"}}>
              <span style={{fontSize:11,color:"#4A5E78",letterSpacing:2,fontWeight:700,marginRight:8}}>STEP 2 — ENTER / VERIFY STATS:</span>
              {tabBtn("batting","🏏 BATTING")}
              {tabBtn("bowling","🎳 BOWLING")}
              {tabBtn("fielding","🧤 FIELDING")}
              {tabBtn("preview","👁 PREVIEW")}
            </div>

            <div style={{overflowY:"auto",flex:1,padding:"8px 24px 16px"}}>

              {activeTab==="batting" && (
                <table style={{width:"100%",borderCollapse:"collapse",marginTop:8}}>
                  <thead>
                    <tr style={{fontSize:11,color:"#4A5E78",letterSpacing:1,background:"#0E152188"}}>
                      <th style={{textAlign:"left",padding:"8px 6px",fontWeight:700}}>PLAYER</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:55}}>RUNS</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:45}}>4s</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:45}}>6s</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:70}}>LONGEST 6</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playingPlayers.map(p=>(
                      <tr key={p.id} style={{borderBottom:"1px solid #1E2D4533"}}>
                        <td style={{padding:"7px 6px",fontSize:13,color:"#E2EAF4",fontWeight:600}}>{p.name}<br/><span style={{fontSize:10,color:"#4A5E78"}}>{p.iplTeam} • {p.role}</span></td>
                        <td style={{padding:"4px"}}><input type="number" min="0" value={stats[p.id]?.runs||0} onChange={e=>upd(p.id,"runs",e.target.value)} style={inp} /></td>
                        <td style={{padding:"4px"}}><input type="number" min="0" value={stats[p.id]?.fours||0} onChange={e=>upd(p.id,"fours",e.target.value)} style={inp} /></td>
                        <td style={{padding:"4px"}}><input type="number" min="0" value={stats[p.id]?.sixes||0} onChange={e=>upd(p.id,"sixes",e.target.value)} style={inp} /></td>
                        <td style={{padding:"4px",textAlign:"center"}}><input type="checkbox" checked={!!stats[p.id]?.longestSix} onChange={e=>upd(p.id,"longestSix",e.target.checked)} style={{width:18,height:18,accentColor:"#F5A623"}} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {activeTab==="bowling" && (
                <table style={{width:"100%",borderCollapse:"collapse",marginTop:8}}>
                  <thead>
                    <tr style={{fontSize:11,color:"#4A5E78",letterSpacing:1,background:"#0E152188"}}>
                      <th style={{textAlign:"left",padding:"8px 6px",fontWeight:700}}>PLAYER</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:60}}>WICKETS</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:60}}>OVERS</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:70}}>ECONOMY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playingPlayers.map(p=>(
                      <tr key={p.id} style={{borderBottom:"1px solid #1E2D4533"}}>
                        <td style={{padding:"7px 6px",fontSize:13,color:"#E2EAF4",fontWeight:600}}>{p.name}<br/><span style={{fontSize:10,color:"#4A5E78"}}>{p.iplTeam} • {p.role}</span></td>
                        <td style={{padding:"4px"}}><input type="number" min="0" value={stats[p.id]?.wickets||0} onChange={e=>upd(p.id,"wickets",e.target.value)} style={inp} /></td>
                        <td style={{padding:"4px"}}><input type="number" min="0" step="0.1" value={stats[p.id]?.overs||0} onChange={e=>upd(p.id,"overs",e.target.value)} style={inp} /></td>
                        <td style={{padding:"4px"}}><input type="number" min="0" step="0.01" placeholder="—" value={stats[p.id]?.economy||""} onChange={e=>upd(p.id,"economy",e.target.value)} style={inp} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {activeTab==="fielding" && (
                <table style={{width:"100%",borderCollapse:"collapse",marginTop:8}}>
                  <thead>
                    <tr style={{fontSize:11,color:"#4A5E78",letterSpacing:1,background:"#0E152188"}}>
                      <th style={{textAlign:"left",padding:"8px 6px",fontWeight:700}}>PLAYER</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:65}}>CATCHES</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:75}}>STUMPINGS</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:70}}>RUN OUTS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playingPlayers.map(p=>(
                      <tr key={p.id} style={{borderBottom:"1px solid #1E2D4533"}}>
                        <td style={{padding:"7px 6px",fontSize:13,color:"#E2EAF4",fontWeight:600}}>{p.name}<br/><span style={{fontSize:10,color:"#4A5E78"}}>{p.iplTeam} • {p.role}</span></td>
                        <td style={{padding:"4px"}}><input type="number" min="0" value={stats[p.id]?.catches||0} onChange={e=>upd(p.id,"catches",e.target.value)} style={inp} /></td>
                        <td style={{padding:"4px"}}><input type="number" min="0" value={stats[p.id]?.stumpings||0} onChange={e=>upd(p.id,"stumpings",e.target.value)} style={inp} /></td>
                        <td style={{padding:"4px"}}><input type="number" min="0" value={stats[p.id]?.runouts||0} onChange={e=>upd(p.id,"runouts",e.target.value)} style={inp} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {activeTab==="preview" && (
                <div style={{marginTop:8}}>
                  <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,marginBottom:10}}>POINTS PREVIEW (before captain multiplier)</div>
                  {playingPlayers.sort((a,b)=>calcPoints(stats[b.id]||{})-calcPoints(stats[a.id]||{})).map(p => {
                    const s = stats[p.id] || {};
                    const pts = calcPoints(s);
                    const bd = calcBreakdown(s);
                    return (
                      <div key={p.id} style={{background:"#0E1521",borderRadius:8,padding:"10px 14px",marginBottom:6,display:"flex",alignItems:"flex-start",gap:12}}>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:700,fontSize:14,color:"#E2EAF4"}}>{p.name}</div>
                          <div style={{fontSize:11,color:"#4A5E78",marginTop:2}}>{bd.length>0?bd.join(" • "):"No stats"}</div>
                        </div>
                        <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:24,fontWeight:800,color:pts>0?"#F5A623":"#4A5E78"}}>{pts}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{padding:"14px 24px",borderTop:"1px solid #1E2D45",display:"flex",gap:10,flexShrink:0}}>
          <button onClick={onClose} style={{flex:1,background:"transparent",border:"1px solid #1E2D45",borderRadius:8,padding:11,color:"#4A5E78",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
          <button onClick={submit} style={{flex:2,background:"linear-gradient(135deg,#F5A623,#FF8C00)",border:"none",borderRadius:8,padding:11,color:"#080C14",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>✅ SAVE POINTS ({playingPlayers.length} players)</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState("setup");
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [matches, setMatches] = useState([]);
  const [captains, setCaptains] = useState({});
  const [points, setPoints] = useState({});
  const [loading, setLoading] = useState("");
  const [numTeams, setNumTeams] = useState(4);
  const [tNames, setTNames] = useState(Array.from({length:10},(_,i)=>`Team ${i+1}`));
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [expandedMatch, setExpandedMatch] = useState(null);
  const [expandedTeam, setExpandedTeam] = useState(null);
  const [pwHash, setPwHash] = useState(null);
  const [recoveryHash, setRecoveryHash] = useState(null);
  const [appReady, setAppReady] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  // PWA install prompt
  const [installPrompt, setInstallPrompt] = useState(null);
  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    });
  }, []);
  const installPWA = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstallPrompt(null);
  };

  const [statsPage, setStatsPage] = useState('top'); // top | h2h | form | mvp
  const [h2hTeam1, setH2hTeam1] = useState('');
  const [h2hTeam2, setH2hTeam2] = useState('');
  const [nextMatch, setNextMatch] = useState(null);
  const [countdown, setCountdown] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [showPwModal, setShowPwModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [editPlayer, setEditPlayer] = useState(null); // player being edited
  const [smartStatsMatch, setSmartStatsMatch] = useState(null);
  const [squadView, setSquadView] = useState(false); // toggle squad view
  const [teamFilter, setTeamFilter] = useState(null); // filter by fantasy team
  const [sortOrder, setSortOrder] = useState('default'); // default | az | za
  const [teamLogos, setTeamLogos] = useState({});
  const [safePlayers, setSafePlayers] = useState({}); // {teamId: [pid,pid,pid]}
  const [unsoldPool, setUnsoldPool] = useState([]); // manually managed unsold list
  const [draftTab, setDraftTab] = useState('players'); // players | unsold
  // ownershipLog: {pid: [{teamId, from: isoDate, to: isoDate|null}]}
  const [ownershipLog, setOwnershipLog] = useState({});
  const [transfers, setTransfers] = useState({
    weekNum: 1,
    phase: 'closed', // closed | release | pick | done
    releases: {}, // {teamId: [pid, pid]}
    picks: [],    // [{teamId, pid, timestamp}]
    currentPickTeam: null,
    pickDeadline: null,
    history: [],  // all past transfers
  });
  const [snatch, setSnatch] = useState({
    weekNum: 1,
    active: null, // {byTeamId, pid, fromTeamId, pointsAtSnatch, startDate}
    history: [],
  });

  // Countdown to next match
  useEffect(() => {
    const upcoming = matches.find(m => m.status !== 'completed');
    if (!upcoming) return;
    setNextMatch(upcoming);
    const tick = () => {
      const now = Date.now();
      const matchTime = new Date(upcoming.date + 'T14:00:00+05:30').getTime();
      const diff = matchTime - now;
      if (diff <= 0) { setCountdown('MATCH IN PROGRESS'); return; }
      const d = Math.floor(diff/86400000);
      const h = Math.floor((diff%86400000)/3600000);
      const m = Math.floor((diff%3600000)/60000);
      const s = Math.floor((diff%60000)/1000);
      setCountdown(`${d>0?d+'d ':''} ${h}h ${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [matches]);

  useEffect(() => {
    (async () => {
      try {
        const keys = ["teams","players","assignments","matches","captains","points","page","tnames","numteams","pwhash","recoveryHash","teamLogos","safePlayers","unsoldPool","transfers","snatch","ownershipLog"];
        const results = await Promise.all(keys.map(k => storeGet(k)));
        const [t,p,a,m,c,pts,pg,tn,nt,ph,rh,tl,sp,up,tr,sn,ol] = results;
        if(t) setTeams(t);
        if(p) setPlayers(p);
        if(a) setAssignments(a);
        if(m) setMatches(m);
        if(c) setCaptains(c);
        if(pts) setPoints(pts);
        if(pg) setPage(pg);
        if(tn) setTNames(tn);
        if(nt) setNumTeams(nt);
        if(ph) setPwHash(ph);
        if(rh) setRecoveryHash(rh);
        if(tl) setTeamLogos(tl);
        if(sp) setSafePlayers(sp);
        if(up) setUnsoldPool(up);
        if(tr) setTransfers(tr);
        if(sn) setSnatch(sn);
        if(ol) setOwnershipLog(ol);
      } catch(e) {
        console.error("Load error:", e);
      } finally {
        setAppReady(true);
      }
    })();
  }, []);

  const nav=(pg)=>{setPage(pg);storeSet("page",pg);};
  const upd=(setter,key)=>(val)=>{setter(val);storeSet(key,val);};
  const updTeams=upd(setTeams,"teams"),updAssign=upd(setAssignments,"assignments"),
        updMatches=upd(setMatches,"matches"),updCaptains=upd(setCaptains,"captains"),
        updPoints=upd(setPoints,"points");

  const toggleSafePlayer = (teamId, pid) => {
    withPassword(() => {
      const current = safePlayers[teamId] || [];
      let updated;
      if (current.includes(pid)) {
        updated = current.filter(x => x !== pid);
      } else {
        if (current.length >= 3) { alert("Max 3 safe players per team!"); return; }
        updated = [...current, pid];
      }
      const newSafe = { ...safePlayers, [teamId]: updated };
      setSafePlayers(newSafe);
      storeSet("safePlayers", newSafe);
    });
  };

  const isPlayerSafe = (pid) => Object.values(safePlayers).some(arr => arr.includes(pid));
  const isPlayerSafeForTeam = (teamId, pid) => (safePlayers[teamId]||[]).includes(pid);

  const addToUnsoldPool = (pid) => {
    withPassword(() => {
      if (unsoldPool.includes(pid)) return;
      const updated = [...unsoldPool, pid];
      setUnsoldPool(updated);
      storeSet("unsoldPool", updated);
    });
  };

  const removeFromUnsoldPool = (pid) => {
    withPassword(() => {
      const updated = unsoldPool.filter(x => x !== pid);
      setUnsoldPool(updated);
      storeSet("unsoldPool", updated);
    });
  };

  // ── TRANSFER HELPERS ────────────────────────────────────────────────────────
  const updOwnership = (val) => { setOwnershipLog(val); storeSet("ownershipLog", val); };

  // Record ownership change — close previous period, open new one
  const recordOwnership = (pid, newTeamId, log) => {
    const now = new Date().toISOString();
    const history = log[pid] ? [...log[pid]] : [];
    // Close previous period
    if (history.length > 0 && !history[history.length-1].to) {
      history[history.length-1].to = now;
    }
    // Open new period (null to = currently owned)
    if (newTeamId) history.push({ teamId: newTeamId, from: now, to: null });
    return { ...log, [pid]: history };
  };

  const updTransfers = (val) => { setTransfers(val); storeSet("transfers", val); };
  const updSnatch = (val) => { setSnatch(val); storeSet("snatch", val); };

  const openReleaseWindow = () => withPassword(() => {
    const updated = {...transfers, phase:'release', weekNum: transfers.weekNum};
    updTransfers(updated);
    alert("✅ Release window is now OPEN. Teams can release up to 3 players until Monday 11 AM.");
  });

  const closeReleaseWindow = () => withPassword(() => {
    const updated = {...transfers, phase:'pick'};
    // Set first picking team = #1 on leaderboard
    const firstTeam = leaderboard[0]?.id || null;
    const deadline = new Date(Date.now() + 45*60*1000).toISOString();
    updated.currentPickTeam = firstTeam;
    updated.pickDeadline = deadline;
    updTransfers(updated);
    alert(`✅ Release window CLOSED. ${leaderboard[0]?.name} picks first! 45 minutes on the clock.`);
  });

  const releasePlayer = (teamId, pid) => withPassword(() => {
    if (transfers.phase !== 'release') { alert("Release window is not open"); return; }
    const currentReleases = transfers.releases[teamId] || [];
    if (currentReleases.includes(pid)) { alert("Already released"); return; }
    if (currentReleases.length >= 3) { alert("Max 3 releases per team"); return; }
    if (isPlayerSafeForTeam(teamId, pid)) { alert("Safe players cannot be released!"); return; }

    // Remove from team assignment
    const newAssign = {...assignments};
    delete newAssign[pid];
    updAssign(newAssign);

    // Add to unsold pool
    const newUnsold = unsoldPool.includes(pid) ? unsoldPool : [...unsoldPool, pid];
    setUnsoldPool(newUnsold); storeSet("unsoldPool", newUnsold);

    // Record release
    const newReleases = {...transfers.releases, [teamId]: [...currentReleases, pid]};
    const updated = {...transfers, releases: newReleases};
    updTransfers(updated);
    alert(`✅ Player released to unsold pool`);
  });

  const pickPlayer = (pid) => withPassword(() => {
    if (transfers.phase !== 'pick') { alert("Pick phase not active"); return; }
    const pickingTeam = transfers.currentPickTeam;
    if (!pickingTeam) { alert("No team is currently picking"); return; }

    const releasedCount = (transfers.releases[pickingTeam]||[]).length;
    const pickedCount = transfers.picks.filter(pk=>pk.teamId===pickingTeam).length;
    if (pickedCount >= releasedCount) { alert("You can only pick as many as you released"); return; }
    if (!unsoldPool.includes(pid)) { alert("Player not in unsold pool"); return; }

    // Assign player to picking team
    const newAssign = {...assignments, [pid]: pickingTeam};
    updAssign(newAssign);

    // Remove from unsold pool
    const newUnsold = unsoldPool.filter(x => x !== pid);
    setUnsoldPool(newUnsold); storeSet("unsoldPool", newUnsold);

    // ✅ Record ownership transfer — points reset for new team from this moment
    const newLog = recordOwnership(pid, pickingTeam, ownershipLog);
    updOwnership(newLog);

    // Record pick and advance to next team
    const newPicks = [...transfers.picks, {teamId: pickingTeam, pid, timestamp: new Date().toISOString()}];
    const nextTeam = getNextPickTeam(pickingTeam, newPicks);
    const deadline = nextTeam ? new Date(Date.now() + 45*60*1000).toISOString() : null;
    const newPhase = nextTeam ? 'pick' : 'done';
    const updated = {...transfers, picks: newPicks, currentPickTeam: nextTeam, pickDeadline: deadline, phase: newPhase};
    if (newPhase === 'done') {
      updated.history = [...(transfers.history||[]), {week: transfers.weekNum, releases: transfers.releases, picks: newPicks, date: new Date().toISOString()}];
    }
    updTransfers(updated);
  });

  const skipCurrentTeam = () => withPassword(() => {
    const pickingTeam = transfers.currentPickTeam;
    const nextTeam = getNextPickTeam(pickingTeam, transfers.picks);
    const deadline = nextTeam ? new Date(Date.now() + 45*60*1000).toISOString() : null;
    const newPhase = nextTeam ? 'pick' : 'done';
    const updated = {...transfers, currentPickTeam: nextTeam, pickDeadline: deadline, phase: newPhase};
    updTransfers(updated);
    alert(nextTeam ? `Skipped. Now it's ${teams.find(t=>t.id===nextTeam)?.name}'s turn.` : "Transfer window complete!");
  });

  const getNextPickTeam = (currentTeamId, currentPicks) => {
    // Order by leaderboard. Each team picks once per released player
    const lb = [...teams].map(t=>({...t, total:getTeamTotal(t.id)})).sort((a,b)=>b.total-a.total);
    // Find teams that still have picks remaining
    for (const team of lb) {
      if (team.id === currentTeamId) continue; // skip current (they just picked)
      const released = (transfers.releases[team.id]||[]).length;
      const picked = currentPicks.filter(pk=>pk.teamId===team.id).length;
      if (released > 0 && picked < released) return team.id;
    }
    // Second round — check if current team has more picks
    const currentReleased = (transfers.releases[currentTeamId]||[]).length;
    const currentPicked = currentPicks.filter(pk=>pk.teamId===currentTeamId).length;
    if (currentPicked < currentReleased) return currentTeamId;
    return null; // all done
  };

  const resetTransferWindow = () => withPassword(() => {
    if (!confirm("Reset transfer window for new week?")) return;
    const updated = {
      weekNum: transfers.weekNum + 1,
      phase: 'closed', releases: {}, picks: [],
      currentPickTeam: null, pickDeadline: null,
      history: transfers.history || [],
    };
    updTransfers(updated);
  });

  // ── SNATCH HELPERS ───────────────────────────────────────────────────────
  const activateSnatch = (byTeamId, pid, fromTeamId) => withPassword(() => {
    if (isPlayerSafe(pid)) { alert("🛡️ Safe players cannot be snatched!"); return; }
    if (snatch.active) { alert("A snatch is already active this week"); return; }
    const pointsAtSnatch = Object.values(points[pid]||{}).reduce((s,d)=>s+d.base,0);
    const active = { byTeamId, pid, fromTeamId, pointsAtSnatch, startDate: new Date().toISOString() };
    // Move player to snatching team temporarily
    const newAssign = {...assignments, [pid]: byTeamId};
    updAssign(newAssign);
    updSnatch({...snatch, active, weekNum: snatch.weekNum});
    alert(`✅ Snatch activated! Player moved to ${teams.find(t=>t.id===byTeamId)?.name} for 1 week.`);
  });

  const returnSnatched = () => withPassword(() => {
    if (!snatch.active) { alert("No active snatch"); return; }
    const {pid, fromTeamId} = snatch.active;
    // Return player to original team
    const newAssign = {...assignments, [pid]: fromTeamId};
    updAssign(newAssign);
    const newHistory = [...(snatch.history||[]), {...snatch.active, returnDate: new Date().toISOString()}];
    updSnatch({...snatch, active: null, history: newHistory, weekNum: snatch.weekNum+1});
    alert(`✅ Snatched player returned to their original team.`);
  });

  const uploadTeamLogo=(teamId, file)=>{
    const reader = new FileReader();
    reader.onload = (e) => {
      const newLogos = {...teamLogos, [teamId]: e.target.result};
      setTeamLogos(newLogos);
      storeSet('teamLogos', newLogos);
    };
    reader.readAsDataURL(file);
  };

  const withPassword=(action)=>{
    if(unlocked){action();return;}
    setPendingAction({fn:action});setShowPwModal(true);
  };
  const handlePwSuccess=(newHash,isSetting,newRecoveryHash)=>{
    if(isSetting&&newHash){setPwHash(newHash);storeSet("pwhash",newHash);}
    if(newRecoveryHash){setRecoveryHash(newRecoveryHash);storeSet("recoveryHash",newRecoveryHash);}
    if(!isSetting&&!newRecoveryHash)setUnlocked(true);
    // After first time setting password, prompt to set recovery phrase
    if(isSetting&&newHash&&!recoveryHash){
      setShowPwModal(true); // keep modal open but switch to setRecovery mode - handled via re-render
    } else {
      setShowPwModal(false);
    }
    if(!isSetting&&!newRecoveryHash&&pendingAction){pendingAction.fn();setPendingAction(null);}
  };

  const createTeams=()=>{
    const t=Array.from({length:numTeams},(_,i)=>({id:`t${i}`,name:tNames[i]||`Team ${i+1}`,color:PALETTE[i]}));
    updTeams(t);storeSet("tnames",tNames);storeSet("numteams",numTeams);nav("draft");
  };

  const fetchPlayers=async()=>{
    setLoading("Fetching IPL 2026 squads from Cricbuzz…");
    try {
      let allPlayers = [];
      let cricbuzzSuccess = false;
      const IPL_SERIES_ID = 9241; // IPL 2026 confirmed series ID

      try {
        setLoading("Fetching squad list from Cricbuzz…");
        const squadsRes = await fetch(`/api/cricbuzz?path=${encodeURIComponent("series/v1/" + IPL_SERIES_ID + "/squads")}`);
        const squadsData = await squadsRes.json();

        const squadList = squadsData.squads || squadsData.squadItems ||
          squadsData.squadDetailsList || squadsData.teamSquadList || [];

        console.log("Squads response keys:", Object.keys(squadsData), "List length:", squadList.length);

        // Filter out header rows (isHeader:true), keep only real squads
        const realSquads = squadList.filter(s => !s.isHeader && s.squadId);
        if (realSquads.length === 0) throw new Error("No real squads found");

        for (let i = 0; i < realSquads.length; i++) {
          const squad = realSquads[i];
          const squadId = squad.squadId;
          // squadType holds the full team name e.g. "Chennai Super Kings"
          const teamName = squad.squadType || "";
          setLoading(`Cricbuzz: Fetching ${teamName}… (${i+1}/${realSquads.length})`);

          const teamRes = await fetch(`/api/cricbuzz?path=${encodeURIComponent("series/v1/" + IPL_SERIES_ID + "/squads/" + squadId)}`);
          const teamData = await teamRes.json();

          // Players are under "player" key, with isHeader rows mixed in
          const playerList = (teamData.player || []).filter(p => !p.isHeader && p.id);

          // Map full team name to short code
          const TEAM_MAP = {
            "Chennai Super Kings": "CSK", "Mumbai Indians": "MI",
            "Royal Challengers Bengaluru": "RCB", "Royal Challengers Bangalore": "RCB",
            "Kolkata Knight Riders": "KKR", "Sunrisers Hyderabad": "SRH",
            "Rajasthan Royals": "RR", "Punjab Kings": "PBKS",
            "Delhi Capitals": "DC", "Gujarat Titans": "GT",
            "Lucknow Super Giants": "LSG",
          };
          const shortName = TEAM_MAP[teamName] ||
            IPL_TEAMS.find(t => teamName.toUpperCase().includes(t)) ||
            teamName.slice(0,3).toUpperCase();

          for (const p of playerList) {
            const name = p.name || "";
            if (!name) continue;
            const role = (p.role || "").toLowerCase();
            let mappedRole = "Batsman";
            if (role.includes("wk") || role.includes("wicket")) mappedRole = "Wicket-Keeper";
            else if (role.includes("bowling allrounder") || role.includes("batting allrounder")) mappedRole = "All-Rounder";
            else if (role.includes("bowler") || role.includes("fast") || role.includes("spin")) mappedRole = "Bowler";
            else if (role.includes("batsman") || role.includes("batter")) mappedRole = "Batsman";
            const pid = (p.id ? String(p.id) : name.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,""));
            // Skip duplicates
            if (!allPlayers.find(x => x.id === pid)) {
              allPlayers.push({
                id: pid, name, iplTeam: shortName, role: mappedRole, cricbuzzId: p.id,
              });
            }
          }
        }
        if (allPlayers.length > 30) cricbuzzSuccess = true;
      } catch(e) {
        console.warn("Cricbuzz squad fetch failed:", e.message);
        setLoading("Cricbuzz failed — using AI fallback…");
      }

      // Fallback to AI
      if (!cricbuzzSuccess || allPlayers.length < 30) {
        setLoading("Using AI for squad data…");
        allPlayers = [];
        for (let i = 0; i < IPL_TEAMS.length; i++) {
          const team = IPL_TEAMS[i];
          setLoading(`AI: Fetching ${team} squad… (${i+1}/10)`);
          try {
            const text = await callAI(
              `List exactly 20 players in the ${team} IPL 2026 squad. Return ONLY a JSON array, nothing else: [{"id":"name-slug","name":"Full Name","iplTeam":"${team}","role":"Batsman|Bowler|All-Rounder|Wicket-Keeper"}]`,
              "Return ONLY a valid JSON array. No markdown. No explanation. No extra text."
            );
            // Try to salvage even truncated JSON
            let squad = [];
            try { squad = parseJSON(text); }
            catch {
              const lastBrace = text.lastIndexOf("}");
              if (lastBrace > 0) {
                try { squad = JSON.parse(text.slice(0, lastBrace+1) + "]"); } catch {}
              }
            }
            allPlayers = [...allPlayers, ...squad];
          } catch(e) {
            console.warn(`Failed to fetch ${team}:`, e.message);
          }
        }
      }

      setPlayers(allPlayers);
      storeSet("players", allPlayers);
      alert(`✅ Loaded ${allPlayers.length} players from ${cricbuzzSuccess ? "Cricbuzz 🏏" : "AI (Cricbuzz fallback)"}`);
    } catch(e) {
      alert("Failed: " + e.message);
    }
    setLoading("");
  };

  const assignPlayer=(pid,tid)=>withPassword(()=>{
    const a={...assignments};
    if(!tid) { delete a[pid]; }
    else {
      a[pid]=tid;
      // Record initial ownership if not already tracked
      if(!ownershipLog[pid]||ownershipLog[pid].length===0) {
        const newLog = recordOwnership(pid, tid, ownershipLog);
        updOwnership(newLog);
      }
    }
    updAssign(a);
  });
  const removePlayer=(pid)=>withPassword(()=>{const a={...assignments};delete a[pid];updAssign(a);});
  const deletePlayer=(pid)=>withPassword(()=>{
    if(!confirm("Delete this player completely?")) return;
    const a={...assignments};delete a[pid];updAssign(a);
    const up=players.filter(p=>p.id!==pid);setPlayers(up);storeSet("players",up);
  });

  const filteredPlayers=players.filter(p=>{
    const s=search.toLowerCase();
    const matchesSearch=(p.name.toLowerCase().includes(s)||(p.iplTeam||"").toLowerCase().includes(s));
    const matchesRole=(roleFilter==="All"||p.role===roleFilter);
    const matchesTeam=!teamFilter||(teamFilter==="unassigned"?!assignments[p.id]:assignments[p.id]===teamFilter);
    return matchesSearch&&matchesRole&&matchesTeam;
  }).sort((a,b)=>{
    if(sortOrder==="az") return a.name.localeCompare(b.name);
    if(sortOrder==="za") return b.name.localeCompare(a.name);
    return 0;
  });

  const fetchMatches=async()=>{
    setLoading("Fetching live IPL matches from Cricbuzz…");
    try {
      const ipl = await fetchRecentIPLMatches();
      if (ipl.length === 0) {
        // fallback to AI if no live matches found
        const text=await callAI(
          `List all 74 matches of IPL 2026. Return ONLY a raw JSON array: [{"id":"m1","matchNum":1,"date":"2025-03-22","team1":"CSK","team2":"MI","venue":"Chepauk","status":"upcoming|completed","result":"winner or null"}].`,
          "Cricket expert. Return ONLY a raw JSON array. No markdown."
        );
        updMatches(parseJSON(text));
      } else {
        const formatted = ipl.map((m, i) => ({
          id: "m" + (m.matchId || i+1),
          cricbuzzId: m.matchId,
          matchNum: i+1,
          date: m.startDate ? new Date(parseInt(m.startDate)).toISOString().split("T")[0] : "TBD",
          team1: m.team1?.teamSName || m.team1?.teamName || "TBA",
          team2: m.team2?.teamSName || m.team2?.teamName || "TBA",
          venue: m.venueInfo?.ground || m.venueInfo?.city || "TBD",
          status: m.state === "Complete" ? "completed" : "upcoming",
          result: m.status || null,
        }));
        updMatches(formatted);
      }
    } catch(e){
      alert("Cricbuzz error: "+e.message+". Falling back to AI data.");
      try {
        const text=await callAI(
          `List all 74 matches of IPL 2026. Return ONLY a raw JSON array: [{"id":"m1","matchNum":1,"date":"2025-03-22","team1":"CSK","team2":"MI","venue":"Chepauk","status":"upcoming|completed","result":"winner or null"}].`,
          "Cricket expert. Return ONLY a raw JSON array. No markdown."
        );
        updMatches(parseJSON(text));
      } catch(e2){alert("Error: "+e2.message);}
    }
    setLoading("");
  };

  const syncPoints=async(match)=>{
    setLoading(`Syncing Match ${match.matchNum}……`);
    try {
      let stats = [];
      if (match.cricbuzzId) {
        // Use real Cricbuzz scorecard
        try {
          const scorecard = await fetchLiveScorecard(match.cricbuzzId);
          const playerIndex = players.map(p=>({name:p.name, id:p.id}));
          stats = parseScorecardToStats(scorecard, playerIndex);
        } catch(e) {
          console.warn("Cricbuzz scorecard failed, falling back to AI:", e.message);
        }
      }
      // Fallback to AI if Cricbuzz fails or no cricbuzzId
      if (stats.length === 0) {
        setLoading(`Syncing Match ${match.matchNum} via AI…`);
        const playerIndex=players.map(p=>`${p.name}::${p.id}`).join("|");
        const text=await callAI(
          `Scorecard for IPL 2026 Match ${match.matchNum}: ${match.team1} vs ${match.team2} on ${match.date} at ${match.venue}. Match names to IDs from: ${playerIndex}. Return ONLY a JSON array: [{"playerId":"id","name":"name","runs":0,"fours":0,"sixes":0,"wickets":0,"economy":null,"overs":0,"catches":0,"stumpings":0,"runouts":0,"longestSix":false}].`,
          "Cricket expert. Return ONLY a raw JSON array."
        );
        stats = parseJSON(text);
      }
      const newPts={...points};
      for(const s of stats){
        if(!s.playerId)continue;
        const pts=calcPoints(s);
        if(!newPts[s.playerId])newPts[s.playerId]={};
        newPts[s.playerId][match.id]={base:pts,stats:s};
      }
      updPoints(newPts);
      alert(`✅ Points synced for Match ${match.matchNum}!`);
    } catch(e){alert("Sync failed: "+e.message);}
    setLoading("");
  };

  const setCap=(matchId,teamId,type,pid)=>{
    const key=`${matchId}_${teamId}`;
    updCaptains({...captains,[key]:{...(captains[key]||{}),[type]:pid}});
  };

  const getTeamTotal=(teamId)=>{
    let total=0;
    // Include ALL players that have ever been owned by this team
    const allPids = new Set([
      ...players.filter(p=>assignments[p.id]===teamId).map(p=>p.id),
      ...Object.entries(ownershipLog).filter(([pid,periods])=>periods.some(o=>o.teamId===teamId)).map(([pid])=>pid)
    ]);
    for(const pid of allPids){
      const periods = (ownershipLog[pid]||[]).filter(o=>o.teamId===teamId);
      for(const[mid,d] of Object.entries(points[pid]||{})){
        const m = matches.find(x=>x.id===mid);
        if(!m) continue;
        const matchDate = new Date(m.date);
        const owned = periods.length === 0
          ? assignments[pid]===teamId // no log = only if currently owned
          : periods.some(o=>{
              const from = new Date(o.from);
              const to = o.to ? new Date(o.to) : new Date('2099-01-01');
              return matchDate >= from && matchDate <= to;
            });
        if(!owned) continue;
        const cap=captains[`${mid}_${teamId}`]||{};
        let pts=d.base;
        if(cap.captain===pid)pts*=2;else if(cap.vc===pid)pts*=1.5;
        total+=pts;
      }
    }
    return Math.round(total);
  };

  const leaderboard=[...teams].map(t=>({...t,total:getTeamTotal(t.id)})).sort((a,b)=>b.total-a.total);
  const getPlayerBreakdown=(teamId)=>{
    // Helper: get points for player during team's ownership period(s)
    const getPtsForTeam = (pid, tid) => {
      const periods = (ownershipLog[pid]||[]).filter(o=>o.teamId===tid);
      let tot = 0;
      for(const[mid,d] of Object.entries(points[pid]||{})){
        const m = matches.find(x=>x.id===mid);
        if(!m) continue;
        const matchDate = new Date(m.date);
        // Check if match falls within any ownership period for this team
        const owned = periods.length === 0
          ? true // no log = original owner, count all
          : periods.some(o => {
              const from = new Date(o.from);
              const to = o.to ? new Date(o.to) : new Date('2099-01-01');
              return matchDate >= from && matchDate <= to;
            });
        if(!owned) continue;
        const cap=captains[`${mid}_${tid}`]||{};
        let pts=d.base;
        if(cap.captain===pid)pts*=2;else if(cap.vc===pid)pts*=1.5;
        tot+=pts;
      }
      return Math.round(tot);
    };

    // Active players in squad
    const active = players.filter(p=>assignments[p.id]===teamId).map(p=>{
      const tot = getPtsForTeam(p.id, teamId);
      const isSnatched = snatch.active?.pid===p.id && snatch.active?.fromTeamId===teamId;
      return{...p,total:tot,status:isSnatched?"snatched":"active"};
    });

    // Historical players — released via transfer but points still count
    const releasedPids = transfers.history?.flatMap(w=>
      (w.releases[teamId]||[]).filter(pid=> !(w.picks||[]).some(pk=>pk.teamId===teamId&&pk.pid===pid))
    ) || [];
    const historical = releasedPids.map(pid=>{
      const p = players.find(x=>x.id===pid);
      if(!p||assignments[p.id]===teamId) return null;
      // Only count points during THIS team's ownership period
      const tot = getPtsForTeam(pid, teamId);
      return p?{...p,total:tot,status:"released"}:null;
    }).filter(Boolean);

    // Snatched player this team borrowed
    const snatchedIn = snatch.active?.byTeamId===teamId ? (() => {
      const p = players.find(x=>x.id===snatch.active.pid);
      if(!p) return null;
      // Only count points scored AFTER snatch started
      const snatchDate = snatch.active.startDate;
      let tot=0;
      for(const[mid,d]of Object.entries(points[p.id]||{})){
        const m = matches.find(x=>x.id===mid);
        if(m && new Date(m.date) >= new Date(snatchDate)) tot+=d.base;
      }
      return p?{...p,total:Math.round(tot),status:"snatched-in"}:null;
    })() : null;

    return [...active, ...historical, ...(snatchedIn?[snatchedIn]:[])].sort((a,b)=>b.total-a.total);
  };

  // ── WHATSAPP SHARE ───────────────────────────────────────────────────────────
  const shareToWhatsApp = (text) => {
    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  };


  const exportToPDF = async () => {
    const { jsPDF } = await import("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    const doc = new jsPDF();
    doc.setFillColor(8, 12, 20);
    doc.rect(0, 0, 210, 297, 'F');
    doc.setTextColor(245, 166, 35);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("TEEKHA BOUNCER LEAGUE", 105, 20, {align:"center"});
    doc.setFontSize(12);
    doc.setTextColor(74, 94, 120);
    doc.text("Leaderboard — " + new Date().toLocaleDateString(), 105, 30, {align:"center"});
    let y = 50;
    leaderboard.forEach((team, i) => {
      doc.setFillColor(20, 30, 46);
      doc.roundedRect(15, y-8, 180, 18, 3, 3, 'F');
      doc.setTextColor(226, 234, 244);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(`#${i+1} ${team.name}`, 25, y+4);
      doc.setTextColor(245, 166, 35);
      doc.text(`${team.total} pts`, 185, y+4, {align:"right"});
      y += 24;
    });
    doc.save("teekha-bouncer-leaderboard.pdf");
  };

  const shareLeaderboard = () => {
    const lb = leaderboard.map((t,i)=>`${["🥇","🥈","🥉"][i]||`#${i+1}`} ${t.name}: ${t.total} pts`).join("\n");
    const text = `🏏 *Teekha Bouncer League*\n*Leaderboard Update*\n\n${lb}\n\n_teekha-bouncer.vercel.app_`;
    shareToWhatsApp(text);
  };

  const shareMatchResult = (match) => {
    const matchPts = leaderboard.map(t=>{
      const pts = players.filter(p=>assignments[p.id]===t.id&&points[p.id]?.[match.id])
        .reduce((s,p)=>s+(points[p.id][match.id].base||0),0);
      return `${t.name}: ${pts} pts`;
    }).join("\n");
    const text = `🏏 *Teekha Bouncer League*\n*Match ${match.matchNum}: ${match.team1} vs ${match.team2}*\n${match.result||""}\n\n${matchPts}\n\n_teekha-bouncer.vercel.app_`;
    shareToWhatsApp(text);
  };

  // ── STATS HELPERS ────────────────────────────────────────────────────────────
  const getPlayerSeasonStats = () => {
    return players.filter(p => assignments[p.id]).map(p => {
      const matchPoints = Object.entries(points[p.id] || {}).map(([mid, d]) => ({
        matchId: mid, pts: d.base, stats: d.stats
      }));
      const total = matchPoints.reduce((s, m) => s + m.pts, 0);
      const matchesPlayed = matchPoints.length;
      const avg = matchesPlayed > 0 ? Math.round(total / matchesPlayed) : 0;
      const nonZero = matchPoints.filter(m => m.pts > 0).length;
      const consistency = matchesPlayed > 0 ? Math.round((nonZero / matchesPlayed) * 100) : 0;
      const best = matchPoints.reduce((max, m) => m.pts > max ? m.pts : max, 0);
      const last5 = matchPoints.slice(-5).map(m => m.pts);
      const team = teams.find(t => t.id === assignments[p.id]);
      return { ...p, total, matchesPlayed, avg, consistency, best, last5, teamColor: team?.color || '#4A5E78', teamName: team?.name || '' };
    }).sort((a, b) => b.total - a.total);
  };

  const getH2H = (teamId1, teamId2) => {
    const completedMatches = matches.filter(m => m.status === 'completed' && Object.keys(points).some(pid => points[pid][m.id]));
    return completedMatches.map(match => {
      const t1pts = players.filter(p => assignments[p.id] === teamId1 && points[p.id]?.[match.id])
        .reduce((s, p) => {
          const cap = captains[`${match.id}_${teamId1}`] || {};
          let pts = points[p.id][match.id].base;
          if (cap.captain === p.id) pts *= 2; else if (cap.vc === p.id) pts *= 1.5;
          return s + pts;
        }, 0);
      const t2pts = players.filter(p => assignments[p.id] === teamId2 && points[p.id]?.[match.id])
        .reduce((s, p) => {
          const cap = captains[`${match.id}_${teamId2}`] || {};
          let pts = points[p.id][match.id].base;
          if (cap.captain === p.id) pts *= 2; else if (cap.vc === p.id) pts *= 1.5;
          return s + pts;
        }, 0);
      return { match, t1pts: Math.round(t1pts), t2pts: Math.round(t2pts), winner: t1pts > t2pts ? teamId1 : t2pts > t1pts ? teamId2 : 'draw' };
    });
  };

  const navItems=[
    {id:"draft",label:"Draft",icon:"📋",disabled:teams.length===0},
    {id:"matches",label:"Matches",icon:"🏏",disabled:players.length===0},
    {id:"transfer",label:"Transfer",icon:"🔄",disabled:teams.length===0},
    {id:"results",label:"Results",icon:"📊",disabled:teams.length===0},
    {id:"leaderboard",label:"Board",icon:"🏆",disabled:teams.length===0},
  ];

  if (!appReady) return (
    <>
      <style>{css}</style>
      <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
        <img src="/logo.png" style={{width:80,height:80,objectFit:"contain",borderRadius:12,animation:"spin 2s linear infinite"}} />
        <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:22,fontWeight:700,color:"#F5A623",letterSpacing:3}}>TEEKHA BOUNCER</div>
        <div style={{color:"#4A5E78",fontSize:14,letterSpacing:1}}>Loading league data…</div>
      </div>
    </>
  );

  return (
    <>
      <style>{css}</style>
      <div style={{minHeight:"100vh",background:"var(--bg)"}} className={darkMode?"":"light-mode"}>
        {editPlayer&&<EditPlayerModal player={editPlayer}
          onSave={(updated)=>{const up=players.map(p=>p.id===updated.id?updated:p);setPlayers(up);storeSet("players",up);setEditPlayer(null);}}
          onAdd={(np)=>{const all=[...players,np];setPlayers(all);storeSet("players",all);setEditPlayer(null);}}
          onClose={()=>setEditPlayer(null)} />}
        {smartStatsMatch&&<SmartStatsModal
          match={smartStatsMatch}
          players={players}
          assignments={assignments}
          existingStats={Object.fromEntries(Object.entries(points).filter(([pid,m])=>m[smartStatsMatch.id]).map(([pid,m])=>[pid,m[smartStatsMatch.id].stats]))}
          onSave={(statsList)=>{
            const newPts={...points};
            for(const s of statsList){
              if(!s.playerId)continue;
              const pts=calcPoints(s);
              if(!newPts[s.playerId])newPts[s.playerId]={};
              newPts[s.playerId][smartStatsMatch.id]={base:pts,stats:s};
            }
            updPoints(newPts);
            setSmartStatsMatch(null);
            alert("✅ Points saved for " + statsList.length + " players!");
          }}
          onClose={()=>setSmartStatsMatch(null)}
        />}
        {showPwModal&&<PasswordModal storedHash={pwHash} recoveryHash={recoveryHash} onSuccess={handlePwSuccess} onClose={()=>{setShowPwModal(false);setPendingAction(null);}} />}
        {editPlayer&&<EditPlayerModal player={editPlayer} onSave={(updated)=>{const updated_players=players.map(p=>p.id===updated.id?updated:p);setPlayers(updated_players);storeSet("players",updated_players);setEditPlayer(null);}} onAdd={(np)=>{const all=[...players,np];setPlayers(all);storeSet("players",all);setEditPlayer(null);}} onClose={()=>setEditPlayer(null)} />}

        {/* TOP BAR */}
        <div style={{background:"linear-gradient(180deg,#0E1521 0%,#080C14 100%)",borderBottom:"1px solid #1E2D45",padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:50}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <img src="/logo.png" alt="Teekha Bouncer" style={{height:36,width:36,objectFit:"contain",borderRadius:6}} />
            <div>
              <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:17,color:"#F5A623",letterSpacing:2,lineHeight:1}}>TEEKHA</div>
              <div style={{fontSize:9,color:"#4A5E78",letterSpacing:2,textTransform:"uppercase"}}>Bouncer League</div>
            </div>
          </div>
          {nextMatch && countdown && (
            <div style={{flex:1,textAlign:"center",display:"none"}}>
            </div>
          )}
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <button onClick={()=>setDarkMode(d=>!d)}
              style={{background:"transparent",border:"1px solid #1E2D45",color:"#4A5E78",fontSize:16,borderRadius:6,padding:"5px 10px",cursor:"pointer"}}>
              {darkMode?"☀️":"🌙"}
            </button>
            <button onClick={()=>{if(unlocked)setUnlocked(false);else{setPendingAction(null);setShowPwModal(true);}}}
              style={{background:unlocked?"#2ECC7122":"transparent",border:`1px solid ${unlocked?"#2ECC71":"#1E2D45"}`,color:unlocked?"#2ECC71":"#4A5E78",fontSize:13,borderRadius:6,padding:"6px 12px",cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700}}>
              {unlocked?"🔓 ON":"🔒 OFF"}
            </button>
            {installPrompt && (
              <button onClick={installPWA}
                style={{background:"#4F8EF722",border:"1px solid #4F8EF744",color:"#4F8EF7",fontSize:11,borderRadius:6,padding:"5px 10px",cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700}}>
                📲 INSTALL
              </button>
            )}
            <button onClick={()=>withPassword(()=>{if(!confirm("Reset ALL data? This cannot be undone!"))return;["teams","players","assignments","matches","captains","points","page","pwhash"].forEach(k=>storeDel(k));window.location.reload();})}
              style={{background:"transparent",border:"1px solid #1E2D45",color:"#4A5E78",fontSize:13,borderRadius:6,padding:"6px 10px",cursor:"pointer"}}>⚙️</button>
          </div>
        </div>

        {/* BOTTOM NAV */}
        <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:50,background:"#0E1521",borderTop:"1px solid #1E2D45",display:"flex",paddingBottom:"max(8px, env(safe-area-inset-bottom))"}}>
          {navItems.map(n=>(
            <button key={n.id} onClick={()=>!n.disabled&&nav(n.id)}
              style={{flex:1,background:"transparent",border:"none",cursor:n.disabled?"not-allowed":"pointer",padding:"10px 2px 6px",display:"flex",flexDirection:"column",alignItems:"center",gap:3,opacity:n.disabled?0.25:1,borderTop:page===n.id?"2px solid #F5A623":"2px solid transparent",transition:"all .15s"}}>
              <span style={{fontSize:22,lineHeight:1}}>{n.icon}</span>
              <span style={{fontSize:9,fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,letterSpacing:0.5,color:page===n.id?"#F5A623":"#4A5E78",textTransform:"uppercase"}}>{n.label}</span>
            </button>
          ))}
        </div>

        {loading&&(
          <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.92)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",zIndex:200,backdropFilter:"blur(4px)"}}>
            <Spinner />
            <div style={{marginTop:16,color:"#F5A623",fontWeight:700,fontSize:16,textAlign:"center",padding:"0 20px"}}>{loading}</div>
            <div style={{marginTop:6,color:"#4A5E78",fontSize:13}}>Please wait…</div>
          </div>
        )}

        <div style={{maxWidth:860,margin:"0 auto",padding:"20px 16px 90px"}}>

          {/* ── COUNTDOWN BANNER ── */}
          {nextMatch && countdown && (
            <div style={{background:"linear-gradient(135deg,#0E1521,#141E2E)",border:"1px solid #F5A62333",borderRadius:12,padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,fontWeight:700}}>NEXT MATCH</div>
                <div style={{fontSize:14,fontWeight:700,color:"#E2EAF4",marginTop:2}}>{nextMatch.team1} <span style={{color:"#4A5E78"}}>vs</span> {nextMatch.team2}</div>
                <div style={{fontSize:11,color:"#4A5E78",marginTop:2}}>{nextMatch.date} • {nextMatch.venue}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:11,color:"#F5A623",letterSpacing:2,fontWeight:700}}>SET YOUR C/VC BEFORE</div>
                <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:24,fontWeight:800,color:"#F5A623",letterSpacing:2}}>{countdown}</div>
              </div>
            </div>
          )}

          {page==="setup"&&(
            <div className="fade-in">
              <h2 style={{fontFamily:"Rajdhani",fontSize:28,color:"#F5A623",letterSpacing:2,marginBottom:24}}>LEAGUE SETUP</h2>
              <Card sx={{padding:24,marginBottom:16}}>
                <div style={{fontWeight:700,color:"#4A5E78",letterSpacing:2,fontSize:12,marginBottom:16}}>NUMBER OF TEAMS</div>
                <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:12}}>
                  <span style={{fontSize:48,fontFamily:"Rajdhani",fontWeight:800,color:"#F5A623",minWidth:60}}>{numTeams}</span>
                  <input type="range" min={2} max={10} value={numTeams} onChange={e=>{setNumTeams(+e.target.value);storeSet("numteams",+e.target.value);}} style={{flex:1,accentColor:"#F5A623",height:6}} />
                </div>
                <div style={{display:"flex",justifyContent:"space-between",color:"#4A5E78",fontSize:12}}><span>2 teams</span><span>10 teams</span></div>
              </Card>
              <Card sx={{padding:24,marginBottom:20}}>
                <div style={{fontWeight:700,color:"#4A5E78",letterSpacing:2,fontSize:12,marginBottom:16}}>TEAM NAMES</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12}}>
                  {Array.from({length:numTeams},(_,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:PALETTE[i],flexShrink:0}} />
                      <input value={tNames[i]} onChange={e=>{const n=[...tNames];n[i]=e.target.value;setTNames(n);}} style={{flex:1,background:"#080C14",border:"1px solid #1E2D45",borderRadius:8,padding:"9px 14px",color:"#E2EAF4",fontSize:15,fontFamily:"Barlow Condensed,sans-serif",fontWeight:600}} placeholder={`Team ${i+1}`} />
                    </div>
                  ))}
                </div>
              </Card>
              <Card sx={{padding:20,marginBottom:20}}>
                <div style={{fontWeight:700,color:"#4A5E78",letterSpacing:2,fontSize:12,marginBottom:14}}>POINTS SYSTEM</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:14,fontSize:13}}>
                  {[{title:"🏏 BATTING",items:["1 pt per run","8 pts per four","12 pts per six","+10 for 50+","+20 for 100+"]},{title:"🎳 BOWLING",items:["25 pts per wicket","+8 for 4-wkt haul","+15 for 5+ wickets","+10 econ <6 (min 2 ov)"]},{title:"🧤 FIELDING",items:["8 pts per catch","12 pts stumping","12 pts run-out"]},{title:"⭐ BONUSES",items:["30+ runs & 2+ wkts = +15","Longest six = +50","Captain = 2× pts","VC = 1.5× pts"]}].map(sec=>(
                    <div key={sec.title}>
                      <div style={{color:"#F5A623",fontWeight:700,fontSize:12,letterSpacing:1,marginBottom:8}}>{sec.title}</div>
                      {sec.items.map(item=><div key={item} style={{color:"#94A3B8",marginBottom:4}}>• {item}</div>)}
                    </div>
                  ))}
                </div>
              </Card>
              <Btn onClick={createTeams} sx={{width:"100%",padding:"14px",fontSize:17}}>CREATE LEAGUE & CONTINUE →</Btn>
            </div>
          )}

          {page==="draft"&&(
            <div className="fade-in">
              <div style={{marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
                  <h2 style={{fontFamily:"Rajdhani",fontSize:28,color:"#F5A623",letterSpacing:2}}>PLAYER DRAFT</h2>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <Btn variant="blue" onClick={fetchPlayers} sx={{fontSize:13,padding:"8px 14px"}}>{players.length>0?`↻ REFRESH`:"🌐 FETCH PLAYERS"}</Btn>
                    <Btn variant="ghost" onClick={()=>withPassword(()=>setEditPlayer({name:"",iplTeam:"",role:"Batsman"}))} sx={{fontSize:13,padding:"8px 14px"}}>✚ ADD</Btn>
                    <Btn variant={squadView?"primary":"ghost"} onClick={()=>setSquadView(v=>!v)} sx={{fontSize:13,padding:"8px 14px"}}>{squadView?"📋 LIST":"👥 SQUAD"}</Btn>
                  </div>
                </div>
                {/* Draft sub-tabs */}
                <div style={{display:"flex",background:"#0E1521",borderRadius:10,padding:4,gap:4}}>
                  {[{id:"players",label:"📋 Players"},{id:"unsold",label:"🏷️ Unsold Pool"}].map(t=>(
                    <button key={t.id} onClick={()=>setDraftTab(t.id)}
                      style={{flex:1,padding:"8px",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,letterSpacing:1,background:draftTab===t.id?"#F5A623":"transparent",color:draftTab===t.id?"#080C14":"#4A5E78",transition:"all .15s"}}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* UNSOLD POOL TAB */}
              {draftTab==="unsold" && (
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                    <div style={{fontSize:13,color:"#4A5E78"}}>
                      Players in the unsold pool can be picked up during the transfer window.
                    </div>
                    <span style={{background:"#F5A62322",color:"#F5A623",border:"1px solid #F5A62344",borderRadius:6,padding:"4px 10px",fontSize:12,fontWeight:700}}>{unsoldPool.length} players</span>
                  </div>

                  {/* Add unassigned players to pool */}
                  <div style={{marginBottom:16}}>
                    <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,fontWeight:700,marginBottom:10}}>ADD FROM UNASSIGNED PLAYERS</div>
                    <div style={{maxHeight:160,overflowY:"auto",display:"flex",flexWrap:"wrap",gap:6}}>
                      {players.filter(p=>!assignments[p.id]&&!unsoldPool.includes(p.id)).map(p=>(
                        <button key={p.id} onClick={()=>addToUnsoldPool(p.id)}
                          style={{padding:"5px 12px",borderRadius:20,border:"1px solid #1E2D45",background:"transparent",color:"#4A5E78",fontSize:12,fontFamily:"Barlow Condensed,sans-serif",cursor:"pointer"}}>
                          + {p.name} <span style={{opacity:0.5}}>({p.iplTeam})</span>
                        </button>
                      ))}
                      {players.filter(p=>!assignments[p.id]&&!unsoldPool.includes(p.id)).length===0&&(
                        <div style={{color:"#4A5E78",fontSize:13}}>All unassigned players are already in the pool</div>
                      )}
                    </div>
                  </div>

                  {/* Current unsold pool */}
                  <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,fontWeight:700,marginBottom:10}}>CURRENT UNSOLD POOL</div>
                  {unsoldPool.length===0 ? (
                    <div style={{textAlign:"center",padding:"32px",color:"#4A5E78",fontSize:14,background:"#0E1521",borderRadius:10}}>
                      Pool is empty — add players above
                    </div>
                  ) : (
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {unsoldPool.map(pid=>{
                        const p = players.find(x=>x.id===pid);
                        if(!p) return null;
                        return (
                          <div key={pid} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:"#0E1521",borderRadius:8,border:"1px solid #1E2D4566"}}>
                            <div style={{flex:1}}>
                              <div style={{fontWeight:700,fontSize:14,color:"#E2EAF4"}}>{p.name}</div>
                              <div style={{fontSize:12,color:"#4A5E78"}}>{p.iplTeam} • {p.role}</div>
                            </div>
                            <button onClick={()=>removeFromUnsoldPool(pid)}
                              style={{background:"#FF3D5A22",border:"1px solid #FF3D5A44",color:"#FF3D5A",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:12,fontFamily:"Barlow Condensed,sans-serif",fontWeight:700}}>
                              REMOVE
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* PLAYERS TAB */}
              {draftTab==="players" && <>
              <div style={{background:unlocked?"#2ECC7112":"#F5A62310",border:`1px solid ${unlocked?"#2ECC7133":"#F5A62333"}`,borderRadius:10,padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                <div>
                  <span style={{fontWeight:700,color:unlocked?"#2ECC71":"#F5A623",fontSize:14}}>{unlocked?"🔓 Squad changes unlocked":"🔒 Squad changes are locked"}</span>
                  <span style={{color:"#4A5E78",fontSize:12,marginLeft:10}}>{unlocked?"Assign, replace or remove freely":"Password required to modify squads"}</span>
                </div>
                <button onClick={()=>{if(unlocked)setUnlocked(false);else{setPendingAction(null);setShowPwModal(true);}}} style={{background:unlocked?"#FF3D5A22":"#F5A62322",border:`1px solid ${unlocked?"#FF3D5A44":"#F5A62344"}`,color:unlocked?"#FF3D5A":"#F5A623",borderRadius:7,padding:"7px 16px",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                  {unlocked?"LOCK":"UNLOCK"}
                </button>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
                {teams.map(t=>{
                  const cnt=players.filter(p=>assignments[p.id]===t.id).length;
                  const active=teamFilter===t.id;
                  return(
                    <div key={t.id} style={{position:"relative",display:"flex",alignItems:"center",background:active?t.color+"22":"#0E1521",borderRadius:8,borderLeft:`3px solid ${t.color}`,fontSize:13,border:active?`1px solid ${t.color}`:"1px solid transparent",transition:"all .15s",overflow:"hidden"}}>
                      {teamLogos[t.id]&&<img src={teamLogos[t.id]} style={{position:"absolute",right:0,top:0,height:"100%",opacity:0.15,objectFit:"contain",pointerEvents:"none"}} />}
                      <div onClick={()=>setTeamFilter(active?null:t.id)} style={{padding:"7px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:6,flex:1}}>
                        {teamLogos[t.id]&&<img src={teamLogos[t.id]} style={{width:22,height:22,objectFit:"contain",borderRadius:4}} />}
                        <span style={{color:t.color,fontWeight:700}}>{t.name}</span>
                        <span style={{color:"#4A5E78"}}>{cnt}p</span>
                        {active&&<span style={{color:t.color,fontSize:11}}>✓</span>}
                      </div>
                      <label title="Upload team logo" style={{padding:"7px 8px",cursor:"pointer",color:"#4A5E78",fontSize:12,borderLeft:"1px solid #1E2D4555"}}>
                        📷
                        <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>e.target.files[0]&&uploadTeamLogo(t.id,e.target.files[0])} />
                      </label>
                    </div>
                  );
                })}
                <div onClick={()=>setTeamFilter("unassigned")}
                  style={{background:teamFilter==="unassigned"?"#4A5E7833":"#0E1521",borderRadius:8,padding:"7px 14px",fontSize:13,cursor:"pointer",border:teamFilter==="unassigned"?"1px solid #4A5E78":"1px solid transparent",transition:"all .15s"}}>
                  <span style={{color:"#4A5E78"}}>Unassigned: </span>
                  <span style={{color:"#E2EAF4"}}>{players.filter(p=>!assignments[p.id]).length}</span>
                  {teamFilter==="unassigned"&&<span style={{color:"#4A5E78",marginLeft:6,fontSize:11}}>✓</span>}
                </div>
              </div>
              {players.length===0?(
                <Card sx={{padding:60,textAlign:"center"}}>
                  <div style={{fontSize:56}}>🏏</div>
                  <div style={{color:"#4A5E78",marginTop:16,fontSize:16}}>Click "Fetch IPL Players" to load all 10 squads</div>
                  <div style={{color:"#4A5E78",marginTop:8,fontSize:13}}>This fetches each team one by one — takes about 30 seconds</div>
                </Card>
              ):squadView?(
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {teams.map(team=>{
                    const teamPlayers=players.filter(p=>assignments[p.id]===team.id);
                    const unassignedCount=players.filter(p=>!assignments[p.id]).length;
                    return(
                      <Card key={team.id} accent={team.color} sx={{overflow:"hidden"}}>
                        <div style={{padding:"14px 18px",borderBottom:"1px solid #1E2D45",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                          <div>
                            <span style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:18,color:team.color,letterSpacing:1}}>{team.name}</span>
                            <span style={{color:"#4A5E78",fontSize:13,marginLeft:10}}>{teamPlayers.length} players</span>
                          </div>
                        </div>
                        {teamPlayers.length===0?(
                          <div style={{padding:"16px 18px",color:"#4A5E78",fontSize:13}}>No players assigned yet</div>
                        ):(
                          <div style={{padding:"8px 0"}}>
                            {["Batsman","Wicket-Keeper","All-Rounder","Bowler"].map(role=>{
                              const rp=teamPlayers.filter(p=>p.role===role);
                              if(rp.length===0) return null;
                              return(
                                <div key={role}>
                                  <div style={{padding:"6px 18px",fontSize:11,color:"#4A5E78",letterSpacing:2,fontWeight:700,background:"#0E152188"}}>{role.toUpperCase()}S ({rp.length})</div>
                                  {rp.map(p=>(
                                    <div key={p.id} style={{display:"flex",alignItems:"center",padding:"8px 18px",borderBottom:"1px solid #1E2D4522",gap:10}}>
                                      <div style={{flex:1}}>
                                        <span style={{fontSize:14,fontWeight:600,color:"#E2EAF4"}}>{p.name}</span>
                                        <span style={{fontSize:12,color:"#4A5E78",marginLeft:8}}>{p.iplTeam}</span>
                                      </div>
                                      <button onClick={()=>withPassword(()=>setEditPlayer(p))} style={{background:"#4F8EF722",border:"1px solid #4F8EF744",color:"#4F8EF7",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:12}}>✏️</button>
                                      <button onClick={()=>removePlayer(p.id)} style={{background:"#FF3D5A22",border:"1px solid #FF3D5A44",color:"#FF3D5A",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:12}}>✕</button>
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                  <Card sx={{padding:16}}>
                    <div style={{color:"#4A5E78",fontSize:13,textAlign:"center"}}>
                      <span style={{color:"#E2EAF4",fontWeight:700}}>{players.filter(p=>!assignments[p.id]).length}</span> players unassigned
                    </div>
                  </Card>
                </div>
              ):(
                <>
                  <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
                    <input placeholder="Search name or franchise…" value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1,minWidth:180,background:"#0E1521",border:"1px solid #1E2D45",borderRadius:8,padding:"10px 14px",color:"#E2EAF4",fontSize:14,fontFamily:"Barlow Condensed"}} />
                    <select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)} style={{background:"#0E1521",border:"1px solid #1E2D45",borderRadius:8,padding:"10px 14px",color:"#E2EAF4",fontSize:14,fontFamily:"Barlow Condensed"}}>
                      {ROLES.map(r=><option key={r}>{r}</option>)}
                    </select>
                    <select value={sortOrder} onChange={e=>setSortOrder(e.target.value)} style={{background:"#0E1521",border:"1px solid #1E2D45",borderRadius:8,padding:"10px 14px",color:"#E2EAF4",fontSize:14,fontFamily:"Barlow Condensed"}}>
                      <option value="default">Default</option>
                      <option value="az">A → Z</option>
                      <option value="za">Z → A</option>
                    </select>
                  </div>
                  <div style={{position:"relative",maxHeight:560,overflowY:"auto",display:"flex",flexDirection:"column",gap:5}}>
                    {teamFilter&&teamFilter!=="unassigned"&&teamLogos[teamFilter]&&(
                      <img src={teamLogos[teamFilter]} style={{position:"sticky",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:280,opacity:0.06,pointerEvents:"none",zIndex:0,objectFit:"contain",margin:"0 auto",display:"block"}} />
                    )}
                    {filteredPlayers.map(p=>{
                      const aTeam=teams.find(t=>t.id===assignments[p.id]);
                      const isAssigned=!!assignments[p.id];
                      return(
                        <div key={p.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:"#0E1521",borderRadius:8,borderLeft:`3px solid ${aTeam?aTeam.color:"#1E2D45"}`}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:"flex",alignItems:"center",gap:6}}>
                              <span style={{fontWeight:700,fontSize:14,color:"#E2EAF4"}}>{p.name}</span>
                              {isAssigned&&isPlayerSafeForTeam(assignments[p.id],p.id)&&<span style={{background:"#2ECC7122",color:"#2ECC71",border:"1px solid #2ECC7144",borderRadius:10,fontSize:10,padding:"1px 6px",fontWeight:700}}>🛡️ SAFE</span>}
                            </div>
                            <div style={{fontSize:12,color:"#4A5E78",marginTop:2}}>{p.iplTeam} &nbsp;•&nbsp;<span style={{color:ROLE_COLORS[p.role]||"#94A3B8"}}>{p.role}</span>{isAssigned&&<span style={{marginLeft:8,color:aTeam?.color,fontWeight:700}}>→ {aTeam?.name}</span>}</div>
                          </div>
                          <select value={assignments[p.id]||""} onChange={e=>assignPlayer(p.id,e.target.value)} style={{background:"#141E2E",border:`1px solid ${aTeam?aTeam.color+"66":"#1E2D45"}`,borderRadius:6,padding:"6px 10px",color:aTeam?aTeam.color:"#4A5E78",fontSize:13,fontFamily:"Barlow Condensed",fontWeight:600,maxWidth:150,cursor:"pointer"}}>
                            <option value="">{isAssigned?"Move to…":"— Assign —"}</option>
                            {teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                          {isAssigned&&<button onClick={()=>removePlayer(p.id)} style={{background:"#FF3D5A22",border:"1px solid #FF3D5A44",color:"#FF3D5A",borderRadius:6,padding:"6px 10px",cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:13,flexShrink:0}}>✕</button>}
                          <button onClick={()=>withPassword(()=>setEditPlayer(p))} style={{background:"#4F8EF722",border:"1px solid #4F8EF744",color:"#4F8EF7",borderRadius:6,padding:"6px 10px",cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:13,flexShrink:0}}>✏️</button>
                          {isAssigned && <button onClick={()=>toggleSafePlayer(assignments[p.id],p.id)}
                            title={isPlayerSafeForTeam(assignments[p.id],p.id)?"Remove safe status":"Mark as safe player"}
                            style={{background:isPlayerSafeForTeam(assignments[p.id],p.id)?"#2ECC7133":"transparent",border:`1px solid ${isPlayerSafeForTeam(assignments[p.id],p.id)?"#2ECC71":"#1E2D45"}`,color:isPlayerSafeForTeam(assignments[p.id],p.id)?"#2ECC71":"#4A5E78",borderRadius:6,padding:"6px 10px",cursor:"pointer",fontSize:13,flexShrink:0}}>🛡️</button>}
                          <button onClick={()=>deletePlayer(p.id)} style={{background:"#FF3D5A22",border:"1px solid #FF3D5A44",color:"#FF3D5A",borderRadius:6,padding:"6px 10px",cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:11,flexShrink:0}}>🗑️</button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              </> }
            </div>
          )}

          {page==="matches"&&(
            <div className="fade-in">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12}}>
                <h2 style={{fontFamily:"Rajdhani",fontSize:28,color:"#F5A623",letterSpacing:2}}>MATCHES</h2>
                <Btn variant="blue" onClick={fetchMatches}>{matches.length>0?`↻ REFRESH (${matches.length})`:"🌐 FETCH SCHEDULE"}</Btn>
              </div>
              {matches.length===0?(
                <Card sx={{padding:60,textAlign:"center"}}><div style={{fontSize:56}}>📅</div><div style={{color:"#4A5E78",marginTop:16,fontSize:16}}>Click "Fetch Schedule" to load IPL 2026 matches</div></Card>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {matches.map(match=>{
                    const open=expandedMatch===match.id,completed=match.status==="completed",synced=Object.keys(points).some(pid=>points[pid][match.id]);
                    return(
                      <Card key={match.id} sx={{overflow:"hidden"}}>
                        <div style={{display:"flex",alignItems:"center",padding:"14px 18px",cursor:"pointer",gap:14}} onClick={()=>setExpandedMatch(open?null:match.id)}>
                          <div style={{background:"#080C14",borderRadius:6,padding:"4px 10px",minWidth:44,textAlign:"center"}}>
                            <div style={{fontSize:11,color:"#4A5E78"}}>M</div>
                            <div style={{fontSize:18,fontWeight:800,color:"#F5A623",fontFamily:"Rajdhani"}}>{match.matchNum}</div>
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:700,fontSize:15,color:"#E2EAF4"}}>{match.team1} <span style={{color:"#4A5E78"}}>vs</span> {match.team2}</div>
                            <div style={{fontSize:12,color:"#4A5E78",marginTop:2}}>{match.date} • {match.venue}</div>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            {synced&&<Badge label="✓ SYNCED" color="#2ECC71" />}
                            <Badge label={completed?(match.result?`✓ ${match.result}`:"DONE"):match.status==="live"?"🔴 LIVE":"UPCOMING"} color={completed?"#2ECC71":match.status==="live"?"#FF3D5A":"#F5A623"} />
                            <span style={{color:"#4A5E78",fontSize:12}}>{open?"▲":"▼"}</span>
                          </div>
                        </div>
                        {open&&(
                          <div style={{padding:"0 18px 18px",borderTop:"1px solid #1E2D45"}}>
                            <div style={{marginTop:16}}>
                              <div style={{fontSize:12,color:"#4A5E78",letterSpacing:2,fontWeight:700,marginBottom:14}}>CAPTAIN & VICE CAPTAIN (MATCH {match.matchNum})</div>
                              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                                {teams.map(team=>{
                                  const key=`${match.id}_${team.id}`,cap=captains[key]||{},teamPlayers=players.filter(p=>assignments[p.id]===team.id);
                                  return(
                                    <div key={team.id} style={{background:"#080C14",borderRadius:8,padding:"12px 16px",borderLeft:`3px solid ${team.color}`}}>
                                      <div style={{color:team.color,fontWeight:700,fontSize:13,letterSpacing:1,marginBottom:10}}>{team.name.toUpperCase()}</div>
                                      <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
                                        <div>
                                          <div style={{fontSize:11,color:"#4A5E78",marginBottom:5}}>⭐ CAPTAIN (2×)</div>
                                          <select value={cap.captain||""} onChange={e=>withPassword(()=>setCap(match.id,team.id,"captain",e.target.value))} style={{background:"#0E1521",border:"1px solid #1E2D45",borderRadius:6,padding:"7px 12px",color:"#E2EAF4",fontSize:13,fontFamily:"Barlow Condensed",maxWidth:200}}>
                                            <option value="">— Select Captain —</option>
                                            {teamPlayers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                                          </select>
                                        </div>
                                        <div>
                                          <div style={{fontSize:11,color:"#4A5E78",marginBottom:5}}>🥈 VICE CAPTAIN (1.5×)</div>
                                          <select value={cap.vc||""} onChange={e=>withPassword(()=>setCap(match.id,team.id,"vc",e.target.value))} style={{background:"#0E1521",border:"1px solid #1E2D45",borderRadius:6,padding:"7px 12px",color:"#E2EAF4",fontSize:13,fontFamily:"Barlow Condensed",maxWidth:200}}>
                                            <option value="">— Select V. Captain —</option>
                                            {teamPlayers.filter(p=>p.id!==cap.captain).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                                          </select>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            {completed&&(
                              <div style={{marginTop:16,display:"flex",gap:8,flexDirection:"column"}}>
                                <button onClick={()=>withPassword(()=>setSmartStatsMatch(match))}
                                  style={{width:"100%",background:synced?"#1E2D45":"linear-gradient(135deg,#F5A623,#FF8C00)",color:synced?"#4A5E78":"#080C14",border:"none",borderRadius:8,padding:13,fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"Barlow Condensed",letterSpacing:1}}>
                                  {synced?"↻ EDIT / RE-SYNC STATS":"📊 SYNC STATS & CALCULATE POINTS"}
                                </button>
                                {!synced&&<div style={{fontSize:11,color:"#4A5E78",textAlign:"center"}}>Auto-fills from Cricbuzz • manually editable • 100% accurate</div>}
                              </div>
                            )}
                            {!completed&&<div style={{marginTop:16,padding:"12px 16px",background:"#080C14",borderRadius:8,fontSize:13,color:"#4A5E78",textAlign:"center"}}>Points sync available once match is completed</div>}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}



          {page==="transfer" && (
            <div className="fade-in">
              <h2 style={{fontFamily:"Rajdhani",fontSize:28,color:"#F5A623",letterSpacing:2,marginBottom:6}}>TRANSFER WINDOW</h2>
              <div style={{fontSize:13,color:"#4A5E78",marginBottom:20}}>Week {transfers.weekNum} • Status: <span style={{color:transfers.phase==="closed"?"#FF3D5A":transfers.phase==="release"?"#F5A623":transfers.phase==="pick"?"#2ECC71":"#4A5E78",fontWeight:700,textTransform:"uppercase"}}>{transfers.phase}</span></div>

              {/* Admin Controls */}
              <div style={{background:"#0E1521",borderRadius:12,padding:16,marginBottom:16,border:"1px solid #1E2D45"}}>
                <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,fontWeight:700,marginBottom:12}}>⚙️ ADMIN CONTROLS</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {transfers.phase==="closed" && <Btn onClick={openReleaseWindow} sx={{fontSize:13}}>📤 OPEN RELEASE WINDOW</Btn>}
                  {transfers.phase==="release" && <Btn onClick={closeReleaseWindow} variant="blue" sx={{fontSize:13}}>🔒 CLOSE RELEASES & START PICKS</Btn>}
                  {transfers.phase==="pick" && <Btn onClick={skipCurrentTeam} variant="ghost" sx={{fontSize:13}}>⏭ SKIP CURRENT TEAM</Btn>}
                  {(transfers.phase==="done"||transfers.phase==="closed") && <Btn onClick={resetTransferWindow} variant="ghost" sx={{fontSize:13}}>🔁 RESET FOR NEXT WEEK</Btn>}
                </div>
              </div>

              {/* Release Phase */}
              {(transfers.phase==="release"||transfers.phase==="pick"||transfers.phase==="done") && (
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,fontWeight:700,marginBottom:12}}>TEAM RELEASES</div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {teams.map(team=>{
                      const released = (transfers.releases[team.id]||[]);
                      const teamPlayers = players.filter(p=>assignments[p.id]===team.id);
                      return (
                        <div key={team.id} style={{background:"#0E1521",borderRadius:10,border:`1px solid ${team.color}33`,padding:14}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:released.length>0||transfers.phase==="release"?10:0}}>
                            <span style={{fontWeight:700,color:team.color,fontFamily:"Rajdhani,sans-serif",fontSize:15}}>{team.name}</span>
                            <span style={{fontSize:12,color:"#4A5E78"}}>{released.length}/3 released</span>
                          </div>
                          {released.length>0 && (
                            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:transfers.phase==="release"?10:0}}>
                              {released.map(pid=>{
                                const p=players.find(x=>x.id===pid);
                                return <span key={pid} style={{background:"#FF3D5A22",color:"#FF3D5A",border:"1px solid #FF3D5A44",borderRadius:16,padding:"3px 10px",fontSize:12}}>{p?.name||pid}</span>;
                              })}
                            </div>
                          )}
                          {transfers.phase==="release" && released.length<3 && (
                            <div>
                              <div style={{fontSize:11,color:"#4A5E78",marginBottom:6}}>Select players to release (max 3, safe players excluded):</div>
                              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                                {teamPlayers.filter(p=>!released.includes(p.id)&&!isPlayerSafeForTeam(team.id,p.id)).map(p=>(
                                  <button key={p.id} onClick={()=>releasePlayer(team.id,p.id)}
                                    style={{padding:"4px 10px",borderRadius:16,border:"1px solid #1E2D45",background:"transparent",color:"#4A5E78",fontSize:12,fontFamily:"Barlow Condensed,sans-serif",cursor:"pointer"}}>
                                    📤 {p.name}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Pick Phase */}
              {transfers.phase==="pick" && (
                <div>
                  <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,fontWeight:700,marginBottom:12}}>PICK PHASE — UNSOLD POOL</div>

                  {/* Current turn indicator */}
                  {transfers.currentPickTeam && (() => {
                    const team = teams.find(t=>t.id===transfers.currentPickTeam);
                    const deadline = transfers.pickDeadline ? new Date(transfers.pickDeadline) : null;
                    const minsLeft = deadline ? Math.max(0, Math.round((deadline-Date.now())/60000)) : 0;
                    return (
                      <div style={{background:team?.color+"22",border:`1px solid ${team?.color}44`,borderRadius:10,padding:14,marginBottom:12}}>
                        <div style={{fontWeight:700,color:team?.color,fontFamily:"Rajdhani,sans-serif",fontSize:18}}>{team?.name}'s TURN</div>
                        <div style={{fontSize:13,color:"#4A5E78",marginTop:4}}>
                          ⏱ {minsLeft} minutes remaining •
                          Can pick: {(transfers.releases[transfers.currentPickTeam]||[]).length - transfers.picks.filter(pk=>pk.teamId===transfers.currentPickTeam).length} player(s)
                        </div>
                      </div>
                    );
                  })()}

                  {/* Unsold pool to pick from */}
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {unsoldPool.map(pid=>{
                      const p=players.find(x=>x.id===pid);
                      if(!p) return null;
                      return (
                        <div key={pid} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:"#0E1521",borderRadius:8}}>
                          <div style={{flex:1}}>
                            <div style={{fontWeight:700,fontSize:14,color:"#E2EAF4"}}>{p.name}</div>
                            <div style={{fontSize:12,color:"#4A5E78"}}>{p.iplTeam} • {p.role}</div>
                          </div>
                          <button onClick={()=>pickPlayer(pid)}
                            style={{background:"linear-gradient(135deg,#2ECC71,#16a34a)",border:"none",borderRadius:6,padding:"7px 14px",color:"#fff",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                            PICK ✓
                          </button>
                        </div>
                      );
                    })}
                    {unsoldPool.length===0&&<div style={{textAlign:"center",padding:24,color:"#4A5E78"}}>Unsold pool is empty</div>}
                  </div>
                </div>
              )}

              {transfers.phase==="done" && (
                <div style={{textAlign:"center",padding:40,background:"#0E1521",borderRadius:12}}>
                  <div style={{fontSize:48}}>✅</div>
                  <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:22,color:"#2ECC71",fontWeight:700,marginTop:8}}>WEEK {transfers.weekNum} TRANSFERS COMPLETE</div>
                  <div style={{fontSize:13,color:"#4A5E78",marginTop:8}}>{transfers.picks.length} players transferred this week</div>
                </div>
              )}

              {transfers.phase==="closed" && transfers.weekNum===1 && (
                <div style={{textAlign:"center",padding:40,background:"#0E1521",borderRadius:12}}>
                  <div style={{fontSize:48}}>🔒</div>
                  <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:20,color:"#4A5E78",fontWeight:700,marginTop:8}}>TRANSFER WINDOW CLOSED</div>
                  <div style={{fontSize:13,color:"#4A5E78",marginTop:8}}>Opens Sunday 11:59 PM — Week {transfers.weekNum}</div>
                </div>
              )}

              {/* Snatch Power Section */}
              <div style={{marginTop:24,background:"#0E1521",borderRadius:12,border:"1px solid #A855F744",padding:16}}>
                <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:18,fontWeight:700,color:"#A855F7",letterSpacing:2,marginBottom:4}}>⚡ SNATCH POWER</div>
                <div style={{fontSize:12,color:"#4A5E78",marginBottom:14}}>Week {snatch.weekNum} • Leaderboard #1 gets to snatch 1 player for 1 week. Safe players are protected.</div>

                {snatch.active ? (
                  <div>
                    <div style={{background:"#A855F722",border:"1px solid #A855F744",borderRadius:8,padding:12,marginBottom:12}}>
                      <div style={{fontSize:12,color:"#A855F7",fontWeight:700,marginBottom:4}}>ACTIVE SNATCH</div>
                      {(() => {
                        const p=players.find(x=>x.id===snatch.active.pid);
                        const byTeam=teams.find(t=>t.id===snatch.active.byTeamId);
                        const fromTeam=teams.find(t=>t.id===snatch.active.fromTeamId);
                        return <div style={{fontSize:13,color:"#E2EAF4"}}><strong>{p?.name}</strong> snatched by <span style={{color:byTeam?.color}}>{byTeam?.name}</span> from <span style={{color:fromTeam?.color}}>{fromTeam?.name}</span> • {snatch.active.pointsAtSnatch} pts at time of snatch</div>;
                      })()}
                    </div>
                    <Btn onClick={returnSnatched} variant="ghost" sx={{fontSize:13}}>↩️ RETURN PLAYER (END SNATCH)</Btn>
                  </div>
                ) : (
                  <div>
                    <div style={{fontSize:13,color:"#E2EAF4",marginBottom:12}}>
                      Current snatch power: <span style={{color:leaderboard[0]?.color,fontWeight:700}}>{leaderboard[0]?.name||"—"}</span>
                    </div>
                    <div style={{fontSize:11,color:"#4A5E78",marginBottom:10}}>SELECT A PLAYER TO SNATCH (safe players excluded):</div>
                    <div style={{maxHeight:200,overflowY:"auto",display:"flex",flexDirection:"column",gap:5}}>
                      {players.filter(p=>assignments[p.id]&&assignments[p.id]!==leaderboard[0]?.id&&!isPlayerSafe(p.id)).map(p=>{
                        const fromTeam=teams.find(t=>t.id===assignments[p.id]);
                        return (
                          <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#141E2E",borderRadius:7}}>
                            <div style={{flex:1}}>
                              <span style={{fontWeight:600,fontSize:13,color:"#E2EAF4"}}>{p.name}</span>
                              <span style={{fontSize:11,color:fromTeam?.color,marginLeft:8}}>{fromTeam?.name}</span>
                            </div>
                            <button onClick={()=>activateSnatch(leaderboard[0]?.id,p.id,assignments[p.id])}
                              style={{background:"#A855F722",border:"1px solid #A855F744",color:"#A855F7",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:12}}>
                              ⚡ SNATCH
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {page==="stats" && (
            <div className="fade-in">
              <h2 style={{fontFamily:"Rajdhani",fontSize:28,color:"#F5A623",letterSpacing:2,marginBottom:16}}>STATS & INSIGHTS</h2>

              {/* Sub tabs */}
              <div style={{display:"flex",background:"#0E1521",borderRadius:10,padding:4,gap:3,marginBottom:20,overflowX:"auto"}}>
                {[{id:"top",label:"🏅 Top Players"},{id:"mvp",label:"⭐ MVP"},{id:"h2h",label:"⚔️ Head-to-Head"},{id:"form",label:"📈 Form Chart"},{id:"results",label:"📋 Results"}].map(t=>(
                  <button key={t.id} onClick={()=>setStatsPage(t.id)}
                    style={{flex:"0 0 auto",padding:"8px 14px",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:13,background:statsPage===t.id?"#F5A623":"transparent",color:statsPage===t.id?"#080C14":"#4A5E78",whiteSpace:"nowrap"}}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* ── TOP PERFORMERS ── */}
              {statsPage==="top" && (() => {
                const allStats = getPlayerSeasonStats();
                const categories = [
                  {label:"🏏 TOP BATSMEN", color:"#4F8EF7", filter: p => (p.stats?.runs||0) > 0, sort: (a,b) => (Object.values(points[b.id]||{}).reduce((s,d)=>s+(d.stats?.runs||0),0)) - (Object.values(points[a.id]||{}).reduce((s,d)=>s+(d.stats?.runs||0),0))},
                  {label:"🎳 TOP BOWLERS", color:"#FF3D5A", filter: p => (p.stats?.wickets||0) > 0, sort: (a,b) => (Object.values(points[b.id]||{}).reduce((s,d)=>s+(d.stats?.wickets||0),0)) - (Object.values(points[a.id]||{}).reduce((s,d)=>s+(d.stats?.wickets||0),0))},
                  {label:"🏆 MOST POINTS", color:"#F5A623", filter: ()=>true, sort: (a,b)=>b.total-a.total},
                  {label:"🎯 MOST CONSISTENT", color:"#2ECC71", filter: p=>p.matchesPlayed>0, sort: (a,b)=>b.consistency-a.consistency},
                ];
                return (
                  <div style={{display:"flex",flexDirection:"column",gap:16}}>
                    {categories.map(cat=>(
                      <div key={cat.label} style={{background:"#0E1521",borderRadius:12,overflow:"hidden",border:`1px solid ${cat.color}33`}}>
                        <div style={{padding:"12px 16px",background:cat.color+"11",borderBottom:`1px solid ${cat.color}33`}}>
                          <span style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:16,color:cat.color,letterSpacing:1}}>{cat.label}</span>
                        </div>
                        {allStats.filter(cat.filter).sort(cat.sort).slice(0,5).map((p,i)=>(
                          <div key={p.id} style={{display:"flex",alignItems:"center",padding:"10px 16px",borderBottom:"1px solid #1E2D4522"}}>
                            <span style={{fontFamily:"Rajdhani,sans-serif",fontSize:20,fontWeight:800,color:i===0?cat.color:"#4A5E78",minWidth:28}}>#{i+1}</span>
                            <div style={{flex:1,marginLeft:8}}>
                              <div style={{fontWeight:700,fontSize:14,color:"#E2EAF4"}}>{p.name}</div>
                              <div style={{fontSize:11,color:p.teamColor}}>{p.teamName} • {p.matchesPlayed} matches</div>
                            </div>
                            <div style={{textAlign:"right"}}>
                              <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:20,fontWeight:800,color:i===0?cat.color:"#E2EAF4"}}>
                                {cat.label.includes("CONSISTENT") ? p.consistency+"%" : p.total+" pts"}
                              </div>
                              <div style={{fontSize:10,color:"#4A5E78"}}>avg {p.avg}/match</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}

                    {/* Biggest score ever */}
                    {(() => {
                      const best = getPlayerSeasonStats().reduce((max,p) => p.best > max.best ? p : max, {best:0});
                      if(!best.best) return null;
                      return (
                        <div style={{background:"linear-gradient(135deg,#F5A62322,#FF8C0011)",border:"1px solid #F5A62366",borderRadius:12,padding:20,textAlign:"center"}}>
                          <div style={{fontSize:11,color:"#F5A623",letterSpacing:2,fontWeight:700,marginBottom:4}}>🔥 BIGGEST SINGLE-MATCH SCORE</div>
                          <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:48,fontWeight:800,color:"#F5A623"}}>{best.best}</div>
                          <div style={{fontSize:16,fontWeight:700,color:"#E2EAF4"}}>{best.name}</div>
                          <div style={{fontSize:12,color:"#4A5E78",marginTop:2}}>{best.teamName}</div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}

              {/* ── MVP ── */}
              {statsPage==="mvp" && (() => {
                const allStats = getPlayerSeasonStats();
                const mvp = allStats[0];
                if(!mvp) return <div style={{textAlign:"center",padding:40,color:"#4A5E78"}}>No data yet</div>;
                return (
                  <div style={{display:"flex",flexDirection:"column",gap:12}}>
                    <div style={{background:"linear-gradient(135deg,#F5A62333,#FF8C0011)",border:"2px solid #F5A623",borderRadius:16,padding:28,textAlign:"center"}}>
                      <div style={{fontSize:11,color:"#F5A623",letterSpacing:3,fontWeight:700,marginBottom:12}}>⭐ MOST VALUABLE PLAYER</div>
                      <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:36,fontWeight:800,color:"#F5A623"}}>{mvp.name}</div>
                      <div style={{fontSize:14,color:mvp.teamColor,marginTop:4}}>{mvp.teamName} • {mvp.iplTeam}</div>
                      <div style={{display:"flex",justifyContent:"center",gap:24,marginTop:20}}>
                        {[{label:"TOTAL PTS",val:mvp.total},{label:"AVG/MATCH",val:mvp.avg},{label:"BEST",val:mvp.best},{label:"CONSISTENCY",val:mvp.consistency+"%"}].map(s=>(
                          <div key={s.label} style={{textAlign:"center"}}>
                            <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:28,fontWeight:800,color:"#E2EAF4"}}>{s.val}</div>
                            <div style={{fontSize:10,color:"#4A5E78",letterSpacing:1}}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Top 10 overall */}
                    <div style={{background:"#0E1521",borderRadius:12,overflow:"hidden"}}>
                      <div style={{padding:"12px 16px",borderBottom:"1px solid #1E2D45",fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:15,color:"#F5A623",letterSpacing:1}}>OVERALL RANKINGS</div>
                      {allStats.slice(0,10).map((p,i)=>(
                        <div key={p.id} style={{display:"flex",alignItems:"center",padding:"10px 16px",borderBottom:"1px solid #1E2D4522",background:i===0?"#F5A62308":"transparent"}}>
                          <span style={{fontFamily:"Rajdhani,sans-serif",fontSize:18,fontWeight:800,color:["#F5A623","#94A3B8","#CD7C2F"][i]||"#4A5E78",minWidth:28}}>#{i+1}</span>
                          <div style={{flex:1,marginLeft:8}}>
                            <div style={{fontWeight:700,fontSize:14,color:"#E2EAF4"}}>{p.name}</div>
                            <div style={{fontSize:11,color:p.teamColor}}>{p.teamName}</div>
                          </div>
                          <div style={{display:"flex",gap:16,textAlign:"right"}}>
                            <div><div style={{fontFamily:"Rajdhani,sans-serif",fontSize:18,fontWeight:700,color:"#E2EAF4"}}>{p.total}</div><div style={{fontSize:9,color:"#4A5E78"}}>PTS</div></div>
                            <div><div style={{fontFamily:"Rajdhani,sans-serif",fontSize:18,fontWeight:700,color:"#94A3B8"}}>{p.consistency}%</div><div style={{fontSize:9,color:"#4A5E78"}}>CONSIST.</div></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* ── HEAD TO HEAD ── */}
              {statsPage==="h2h" && (
                <div>
                  <div style={{display:"flex",gap:10,marginBottom:20,alignItems:"center",flexWrap:"wrap"}}>
                    <select value={h2hTeam1} onChange={e=>setH2hTeam1(e.target.value)} style={{flex:1,minWidth:120,background:"#0E1521",border:"1px solid #1E2D45",borderRadius:8,padding:"10px 14px",color:"#E2EAF4",fontSize:14,fontFamily:"Barlow Condensed"}}>
                      <option value="">Team 1</option>
                      {teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <span style={{color:"#F5A623",fontWeight:800,fontFamily:"Rajdhani,sans-serif",fontSize:20}}>VS</span>
                    <select value={h2hTeam2} onChange={e=>setH2hTeam2(e.target.value)} style={{flex:1,minWidth:120,background:"#0E1521",border:"1px solid #1E2D45",borderRadius:8,padding:"10px 14px",color:"#E2EAF4",fontSize:14,fontFamily:"Barlow Condensed"}}>
                      <option value="">Team 2</option>
                      {teams.filter(t=>t.id!==h2hTeam1).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  {h2hTeam1&&h2hTeam2&&(()=>{
                    const t1=teams.find(t=>t.id===h2hTeam1), t2=teams.find(t=>t.id===h2hTeam2);
                    const h2h=getH2H(h2hTeam1,h2hTeam2);
                    const t1wins=h2h.filter(m=>m.winner===h2hTeam1).length;
                    const t2wins=h2h.filter(m=>m.winner===h2hTeam2).length;
                    const t1total=h2h.reduce((s,m)=>s+m.t1pts,0);
                    const t2total=h2h.reduce((s,m)=>s+m.t2pts,0);
                    if(h2h.length===0) return <div style={{textAlign:"center",padding:40,color:"#4A5E78"}}>No completed matches yet</div>;
                    return (
                      <div style={{display:"flex",flexDirection:"column",gap:12}}>
                        {/* Summary */}
                        <div style={{background:"#0E1521",borderRadius:12,padding:20,display:"flex",alignItems:"center",gap:16}}>
                          <div style={{flex:1,textAlign:"center"}}>
                            <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:800,fontSize:22,color:t1.color}}>{t1.name}</div>
                            <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:48,fontWeight:800,color:t1wins>t2wins?t1.color:"#4A5E78"}}>{t1wins}</div>
                            <div style={{fontSize:11,color:"#4A5E78",letterSpacing:1}}>WINS</div>
                            <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:20,color:"#E2EAF4",marginTop:4}}>{t1total} pts</div>
                          </div>
                          <div style={{fontSize:24,color:"#4A5E78",fontWeight:800}}>:</div>
                          <div style={{flex:1,textAlign:"center"}}>
                            <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:800,fontSize:22,color:t2.color}}>{t2.name}</div>
                            <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:48,fontWeight:800,color:t2wins>t1wins?t2.color:"#4A5E78"}}>{t2wins}</div>
                            <div style={{fontSize:11,color:"#4A5E78",letterSpacing:1}}>WINS</div>
                            <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:20,color:"#E2EAF4",marginTop:4}}>{t2total} pts</div>
                          </div>
                        </div>
                        {/* Per match */}
                        {h2h.map(({match,t1pts,t2pts,winner})=>(
                          <div key={match.id} style={{background:"#0E1521",borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
                            <div style={{flex:1}}>
                              <div style={{fontSize:12,color:"#4A5E78"}}>M{match.matchNum} • {match.date}</div>
                              <div style={{fontSize:13,color:"#E2EAF4",fontWeight:600,marginTop:2}}>{match.team1} vs {match.team2}</div>
                            </div>
                            <div style={{display:"flex",gap:16,alignItems:"center"}}>
                              <div style={{textAlign:"center"}}>
                                <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:22,fontWeight:800,color:winner===h2hTeam1?t1.color:"#E2EAF4"}}>{t1pts}</div>
                                <div style={{fontSize:9,color:"#4A5E78"}}>{t1.name.split(' ')[0]}</div>
                              </div>
                              <span style={{color:"#4A5E78",fontWeight:700}}>-</span>
                              <div style={{textAlign:"center"}}>
                                <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:22,fontWeight:800,color:winner===h2hTeam2?t2.color:"#E2EAF4"}}>{t2pts}</div>
                                <div style={{fontSize:9,color:"#4A5E78"}}>{t2.name.split(' ')[0]}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  {(!h2hTeam1||!h2hTeam2)&&<div style={{textAlign:"center",padding:40,color:"#4A5E78",fontSize:14}}>Select two teams to compare</div>}
                </div>
              )}

              {/* ── PLAYER FORM CHART ── */}
              {statsPage==="form" && (() => {
                const allStats = getPlayerSeasonStats().filter(p=>p.matchesPlayed>0);
                return (
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    <div style={{fontSize:13,color:"#4A5E78",marginBottom:4}}>Last 5 match points for each player. Taller bar = better performance.</div>
                    {allStats.slice(0,20).map(p=>{
                      const max = Math.max(...p.last5, 1);
                      return (
                        <div key={p.id} style={{background:"#0E1521",borderRadius:10,padding:"12px 14px"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                            <div>
                              <span style={{fontWeight:700,fontSize:14,color:"#E2EAF4"}}>{p.name}</span>
                              <span style={{fontSize:11,color:p.teamColor,marginLeft:8}}>{p.teamName}</span>
                            </div>
                            <span style={{fontFamily:"Rajdhani,sans-serif",fontWeight:800,fontSize:18,color:"#F5A623"}}>{p.total} pts</span>
                          </div>
                          {p.last5.length>0 ? (
                            <div style={{display:"flex",alignItems:"flex-end",gap:4,height:40}}>
                              {p.last5.map((pts,i)=>(
                                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                                  <div style={{fontSize:9,color:"#4A5E78"}}>{pts}</div>
                                  <div style={{width:"100%",background:pts>0?p.teamColor:"#1E2D45",borderRadius:"3px 3px 0 0",height:Math.max(4,Math.round((pts/max)*30))+"px",transition:"height .3s"}} />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{fontSize:12,color:"#4A5E78"}}>No match data yet</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* ── RESULTS (moved here) ── */}
              {statsPage==="results" && (
              <div>
              <h2 style={{fontFamily:"Rajdhani",fontSize:28,color:"#F5A623",letterSpacing:2,marginBottom:24}}>MATCH RESULTS</h2>

              {matches.filter(m=>m.status==="completed"&&Object.keys(points).some(pid=>points[pid][m.id])).length===0 ? (
                <div style={{textAlign:"center",padding:60,color:"#4A5E78"}}>
                  <div style={{fontSize:56}}>📊</div>
                  <div style={{marginTop:16,fontSize:16}}>No match results yet. Sync stats from the Matches tab first.</div>
                </div>
              ) : (
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {matches.filter(m=>m.status==="completed"&&Object.keys(points).some(pid=>points[pid][m.id])).map(match=>{
                    const open = expandedMatch===match.id;

                    // Build per-team breakdown for this match
                    const teamBreakdowns = teams.map(team=>{
                      const teamPts = players
                        .filter(p=>assignments[p.id]===team.id&&points[p.id]?.[match.id])
                        .map(p=>{
                          const d = points[p.id][match.id];
                          const cap = captains[`${match.id}_${team.id}`]||{};
                          let pts = d.base;
                          let mult = 1;
                          if(cap.captain===p.id){pts*=2;mult=2;}
                          else if(cap.vc===p.id){pts*=1.5;mult=1.5;}
                          return {...p, base:d.base, pts:Math.round(pts), mult, stats:d.stats, breakdown:calcBreakdown(d.stats)};
                        }).sort((a,b)=>b.pts-a.pts);
                      const total = teamPts.reduce((s,p)=>s+p.pts,0);
                      return {team, players:teamPts, total};
                    }).sort((a,b)=>b.total-a.total);

                    return (
                      <div key={match.id} style={{background:"#0E1521",borderRadius:12,border:"1px solid #1E2D45",overflow:"hidden"}}>
                        {/* Match header */}
                        <div style={{display:"flex",alignItems:"center",padding:"14px 18px",cursor:"pointer",gap:14}} onClick={()=>setExpandedMatch(open?null:match.id)}>
                          <div style={{background:"#080C14",borderRadius:6,padding:"4px 10px",minWidth:44,textAlign:"center"}}>
                            <div style={{fontSize:11,color:"#4A5E78"}}>M</div>
                            <div style={{fontSize:18,fontWeight:800,color:"#F5A623",fontFamily:"Rajdhani"}}>{match.matchNum}</div>
                          </div>
                          <div style={{flex:1}}>
                            <div style={{fontWeight:700,fontSize:15,color:"#E2EAF4"}}>{match.team1} <span style={{color:"#4A5E78"}}>vs</span> {match.team2}</div>
                            <div style={{fontSize:12,color:"#4A5E78",marginTop:2}}>{match.date} • {match.result||match.venue}</div>
                          </div>
                          <span style={{color:"#4A5E78",fontSize:12}}>{open?"▲":"▼"}</span>
                        </div>

                        {/* Expanded breakdown */}
                        {open && (
                          <div style={{borderTop:"1px solid #1E2D45",padding:"16px 18px",display:"flex",flexDirection:"column",gap:14}}>
                            {teamBreakdowns.map((tb,rank)=>(
                              <div key={tb.team.id} style={{background:"#080C14",borderRadius:10,border:`1px solid ${tb.team.color}33`,overflow:"hidden"}}>
                                {/* Team header */}
                                <div style={{padding:"10px 16px",borderBottom:"1px solid #1E2D4544",display:"flex",alignItems:"center",justifyContent:"space-between",background:tb.team.color+"11"}}>
                                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                                    <span style={{fontSize:20}}>{["🥇","🥈","🥉"][rank]||`#${rank+1}`}</span>
                                    <span style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:16,color:tb.team.color,letterSpacing:1}}>{tb.team.name}</span>
                                  </div>
                                  <span style={{fontFamily:"Rajdhani,sans-serif",fontWeight:800,fontSize:22,color:"#F5A623"}}>{tb.total} pts</span>
                                </div>

                                {/* Players */}
                                {tb.players.length===0 ? (
                                  <div style={{padding:"12px 16px",color:"#4A5E78",fontSize:13}}>No players scored in this match</div>
                                ) : (
                                  tb.players.map(p=>(
                                    <div key={p.id} style={{padding:"10px 16px",borderBottom:"1px solid #1E2D4522",display:"flex",alignItems:"flex-start",gap:12}}>
                                      <div style={{flex:1,minWidth:0}}>
                                        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                                          <span style={{fontWeight:700,fontSize:14,color:"#E2EAF4"}}>{p.name}</span>
                                          {p.mult>1 && <span style={{background:p.mult===2?"#F5A62322":"#94A3B822",color:p.mult===2?"#F5A623":"#94A3B8",border:`1px solid ${p.mult===2?"#F5A62344":"#94A3B844"}`,fontSize:10,padding:"1px 7px",borderRadius:10,fontWeight:700}}>
                                            {p.mult===2?"⭐ CAPTAIN 2×":"🥈 VC 1.5×"}
                                          </span>}
                                        </div>
                                        <div style={{fontSize:11,color:"#4A5E78",marginTop:3}}>{p.breakdown.join(" • ")||"No contributions"}</div>
                                      </div>
                                      <div style={{textAlign:"right",flexShrink:0}}>
                                        <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:800,fontSize:20,color:p.pts>0?"#F5A623":"#4A5E78"}}>{p.pts}</div>
                                        {p.mult>1&&<div style={{fontSize:10,color:"#4A5E78"}}>base: {p.base}</div>}
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

              </div>
              )}

            </div>
          )}

          {page==="leaderboard"&&(
            <div className="fade-in">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24,flexWrap:"wrap",gap:10}}>
                <h2 style={{fontFamily:"Rajdhani",fontSize:28,color:"#F5A623",letterSpacing:2}}>LEADERBOARD</h2>
<div style={{display:"flex",gap:8}}>
                <button onClick={shareLeaderboard}
                  style={{background:"#25D36622",border:"1px solid #25D36644",color:"#25D366",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:6}}>
                  <span>📲</span> WHATSAPP
                </button>
                <button onClick={exportToPDF}
                  style={{background:"#FF3D5A22",border:"1px solid #FF3D5A44",color:"#FF3D5A",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:6}}>
                  <span>📄</span> PDF
                </button>
                </div>
              </div>
              {leaderboard.length===0?(
                <Card sx={{padding:60,textAlign:"center"}}><div style={{fontSize:56}}>🏆</div><div style={{color:"#4A5E78",marginTop:16}}>Set up your league first</div></Card>
              ):(
                <>
                  <div style={{marginBottom:32}}>
                    {leaderboard.map((team,i)=>{
                      const medals=["🥇","🥈","🥉"],mc=["#F5A623","#94A3B8","#CD7C2F"];
                      return(
                        <div key={team.id} style={{display:"flex",alignItems:"center",gap:16,background:"#0E1521",borderRadius:10,padding:"16px 20px",marginBottom:8,borderLeft:`4px solid ${team.color}`}}>
                          <div style={{fontSize:28,minWidth:36}}>{medals[i]||`#${i+1}`}</div>
                          <div style={{flex:1}}>
                            <div style={{fontWeight:700,fontSize:18,color:team.color,fontFamily:"Rajdhani",letterSpacing:1}}>{team.name}</div>
                            <div style={{fontSize:12,color:"#4A5E78"}}>{players.filter(p=>assignments[p.id]===team.id).length} players drafted</div>
                          </div>
                          <div style={{textAlign:"right"}}>
                            <div style={{fontSize:32,fontWeight:800,color:i<3?mc[i]:"#E2EAF4",fontFamily:"Rajdhani"}}>{team.total}</div>
                            <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2}}>POINTS</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{fontWeight:700,color:"#4A5E78",letterSpacing:2,fontSize:12,marginBottom:16}}>TEAM PLAYER BREAKDOWN</div>
                  {leaderboard.map(team=>{
                    const breakdown=getPlayerBreakdown(team.id),isOpen=expandedTeam===team.id;
                    const safeCount=(safePlayers[team.id]||[]).length;
                    return(
                      <Card key={team.id} accent={team.color} sx={{marginBottom:12,overflow:"hidden"}}>
                        <div style={{display:"flex",alignItems:"center",padding:"14px 18px",cursor:"pointer"}} onClick={()=>setExpandedTeam(isOpen?null:team.id)}>
                          <div style={{flex:1}}><span style={{fontWeight:700,color:team.color,fontFamily:"Rajdhani",fontSize:17,letterSpacing:1}}>{team.name}</span><span style={{color:"#4A5E78",marginLeft:10,fontSize:13}}>{breakdown.length} players</span></div>
                          <span style={{color:"#F5A623",fontWeight:800,fontFamily:"Rajdhani",fontSize:22,marginRight:16}}>{team.total} pts</span>
                          <span style={{color:"#4A5E78",fontSize:12}}>{isOpen?"▲":"▼"}</span>
                        </div>
                        {isOpen&&breakdown.length>0&&(
                          <div style={{borderTop:"1px solid #1E2D45",padding:"12px 18px"}}>
                            <div style={{display:"flex",fontSize:11,color:"#4A5E78",marginBottom:10,padding:"0 4px"}}><span style={{flex:1}}>PLAYER</span><span style={{width:90}}>ROLE</span><span style={{width:70,textAlign:"right"}}>POINTS</span></div>
                            {breakdown.map((p,idx)=>(
                              <div key={p.id} style={{display:"flex",alignItems:"center",padding:"9px 4px",borderBottom:"1px solid #1E2D45"}}>
                                <div style={{flex:1,fontWeight:idx<3?700:400,fontSize:14,color:idx===0?"#F5A623":"#E2EAF4"}}>{p.name}</div>
                                <div style={{width:90}}><Badge label={p.role||"—"} color={ROLE_COLORS[p.role]||"#4A5E78"} /></div>
                                <div style={{width:70,textAlign:"right",fontWeight:700,color:p.total>0?"#E2EAF4":"#4A5E78",fontFamily:"Rajdhani",fontSize:17}}>{p.total}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        {isOpen&&breakdown.length===0&&<div style={{padding:"16px 18px",color:"#4A5E78",fontSize:13,borderTop:"1px solid #1E2D45"}}>No players assigned yet.</div>}
                      </Card>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
