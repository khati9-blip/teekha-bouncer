import React, { useState, useEffect } from "react";
import FormChart from "./FormChart";
import H2HStats from "./H2HStats";

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
  // Fetch both recent and upcoming matches
  const extractIPL = (data) => {
    const ipl = [];
    if (data && data.typeMatches) {
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
  };

  try {
    // Fetch recent + upcoming in parallel
    const [recentData, upcomingData] = await Promise.all([
      cricbuzz("matches/v1/recent"),
      cricbuzz("matches/v1/upcoming")
    ]);

    const recent = extractIPL(recentData);
    const upcoming = extractIPL(upcomingData);

    // Merge — avoid duplicates by matchId
    const seen = new Set(recent.map(m => m.matchId));
    const all = [...recent];
    for (const m of upcoming) {
      if (!seen.has(m.matchId)) { all.push(m); seen.add(m.matchId); }
    }
    return all;
  } catch(e) {
    // Fallback to just recent
    const data = await cricbuzz("matches/v1/recent");
    return extractIPL(data);
  }
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

// Default points config (used when no custom config loaded yet)
const DEFAULT_POINTS = {
  run:1, four:8, six:12, fifty:10, century:20,
  wicket:25, fourWkt:8, fiveWkt:15, ecoBonus:10, ecoThreshold:6, ecoMinOvers:2,
  catch:8, stumping:12, runout:12,
  allRoundMinRuns:30, allRoundMinWkts:2, allRoundBonus:15,
  longestSix:50, captainMult:2, vcMult:1.5
};

function calcPoints(s, cfg) {
  const c = cfg || DEFAULT_POINTS;
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

  p += runs * c.run;
  p += fours * c.four;
  p += sixes * c.six;
  if      (runs >= 100) p += c.century;
  else if (runs >= 50)  p += c.fifty;

  p += wkts * c.wicket;
  if      (wkts >= 5) p += c.fiveWkt;
  else if (wkts >= 4) p += c.fourWkt;
  if (ovs >= c.ecoMinOvers && eco !== null && eco < c.ecoThreshold) p += c.ecoBonus;

  p += catches * c.catch;
  p += (stump) * c.stumping;
  p += (ro) * c.runout;

  if (runs >= c.allRoundMinRuns && wkts >= c.allRoundMinWkts) p += c.allRoundBonus;
  if (s.longestSix) p += c.longestSix;

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
  if (fours)   items.push(fours + "x4 = +" + (fours * 8));
  if (sixes)   items.push(sixes + "x6 = +" + (sixes * 12));
  if (runs>=100) items.push(`Century bonus = +20`);
  else if (runs>=50) items.push(`Half-century bonus = +10`);
  if (wkts)    items.push(wkts + " wkts = +" + (wkts * 25));
  if (wkts>=5) items.push(`5-wkt haul = +15`);
  else if (wkts>=4) items.push(`4-wkt haul = +8`);
  if (ovs>=2 && eco!==null && eco<6) items.push(`Economy <6 = +10`);
  if (catches) items.push(catches + (catches>1?" catches":" catch") + " = +" + (catches * 8));
  if (stump)   items.push(stump + " stumping" + (stump>1?"s":"") + " = +" + (stump * 12));
  if (ro)      items.push(ro + " run-out" + (ro>1?"s":"") + " = +" + (ro * 12));
  if (runs>=30&&wkts>=2) items.push(`All-round bonus = +15`);
  if (s.longestSix) items.push(`Longest six = +50`);
  return items;
}

const SUPABASE_URL = "https://rmcxhorijitrhqyrvvkn.supabase.co";
const SUPABASE_KEY = "sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm";
const SB_HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": "Bearer " + SUPABASE_KEY,
};

const localCache = {};

async function sbGet(rawKey) {
  if (localCache[rawKey] !== undefined) return localCache[rawKey];
  try {
    const res = await fetch(SUPABASE_URL + "/rest/v1/league_data?key=eq." + encodeURIComponent(rawKey) + "&select=value", {
      headers: SB_HEADERS,
    });
    const data = await res.json();
    const val = data?.[0]?.value ?? null;
    localCache[rawKey] = val;
    return val;
  } catch { return null; }
}

async function sbSet(rawKey, val) {
  localCache[rawKey] = val;
  try {
    await fetch(SUPABASE_URL + "/rest/v1/league_data", {
      method: "POST",
      headers: { ...SB_HEADERS, "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify({ key: rawKey, value: val, updated_at: new Date().toISOString() }),
    });
  } catch(e) { console.warn("sbSet failed:", e.message); }
}

async function sbDel(rawKey) {
  delete localCache[rawKey];
  try {
    await fetch(SUPABASE_URL + "/rest/v1/league_data?key=eq." + encodeURIComponent(rawKey), {
      method: "DELETE",
      headers: SB_HEADERS,
    });
  } catch(e) { console.warn("sbDel failed:", e.message); }
}

// Pitch-aware wrappers — set pitchId before using
let _pitchId = "p1";
const storeGet = (key) => sbGet(_pitchId + "_" + key);
const storeSet = (key, val) => sbSet(_pitchId + "_" + key, val);
const storeDel = (key) => sbDel(_pitchId + "_" + key);

// Generate a random Team ID like "TBL-X7K2"
function generateTeamId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "TBL-";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Snatch window: Saturday 12:00 AM IST to Saturday 12:00 PM IST
function getSnatchWindowStatus() {
  const now = new Date();
  // Convert to IST (UTC+5:30)
  const ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
  const day = ist.getUTCDay(); // 0=Sun, 6=Sat
  const hour = ist.getUTCHours();
  const min = ist.getUTCMinutes();
  const totalMins = hour * 60 + min;

  // Open: Saturday (day=6), 0:00 to 11:59
  if (day === 6 && totalMins < 720) {
    const minsLeft = 720 - totalMins;
    const h = Math.floor(minsLeft / 60);
    const m = minsLeft % 60;
    return { open: true, label: "WINDOW OPEN", timeLeft: h + "h " + m + "m left" };
  }

  // Closed — calculate time until next Saturday 12:00 AM IST
  let daysUntilSat = (6 - day + 7) % 7;
  if (day === 6 && totalMins >= 720) daysUntilSat = 7; // past noon Saturday, next week
  if (daysUntilSat === 0 && totalMins < 720) daysUntilSat = 0; // already open

  const minsUntilMidnight = (24 * 60) - totalMins;
  const totalMinsUntil = (daysUntilSat === 0 ? 0 : (daysUntilSat - 1) * 24 * 60 + minsUntilMidnight);
  const daysLeft = Math.floor(totalMinsUntil / (24 * 60));
  const hoursLeft = Math.floor((totalMinsUntil % (24 * 60)) / 60);

  let countdown = "";
  if (daysLeft > 0) countdown = daysLeft + "d " + hoursLeft + "h";
  else countdown = hoursLeft + "h " + (totalMinsUntil % 60) + "m";

  return { open: false, label: "WINDOW CLOSED", countdown: "Opens in " + countdown + " (Sat 12AM IST)" };
}

// User auth helpers
async function getUsers() {
  const data = await sbGet("users");
  return Array.isArray(data) ? data : [];
}
async function saveUsers(users) {
  await sbSet("users", users);
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
  body{font-family:'Barlow Condensed',sans-serif;background:var(--bg);color:var(--text);}
  select,input{font-family:inherit;}
  ::-webkit-scrollbar{width:6px;}::-webkit-scrollbar-track{background:var(--surface);}::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px;}
  .fade-in{animation:fadeIn .3s ease;}
  @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
  .desk-only{display:inline-flex}
  .mob-only{display:none}
  @media(max-width:600px){
    .desk-only{display:none!important}
    .mob-only{display:inline-flex!important}
  }
`;

function Spinner() { return <div style={{width:24,height:24,border:"3px solid #1E2D45",borderTop:"3px solid #F5A623",borderRadius:"50%",animation:"spin 0.8s linear infinite",display:"inline-block"}} />; }
function Badge({ label, color="#4F8EF7" }) { return <span style={{background:color+"22",color,border:"1px solid "+color+"44",padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:600}}>{label}</span>; }
function Btn({ children, onClick, variant="primary", disabled, style:sx={} }) {
  const base={fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:15,letterSpacing:1,textTransform:"uppercase",border:"none",borderRadius:8,padding:"10px 22px",cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.5:1,...sx};
  const v={primary:{background:"linear-gradient(135deg,#F5A623,#FF8C00)",color:"#080C14"},blue:{background:"linear-gradient(135deg,#4F8EF7,#1a5fb4)",color:"#fff"},ghost:{background:"transparent",color:"#4A5E78",border:"1px solid #1E2D45"},danger:{background:"#FF3D5A22",color:"#FF3D5A",border:"1px solid #FF3D5A44"}};
  return <button onClick={disabled?undefined:onClick} style={{...base,...v[variant],...sx}}>{children}</button>;
}
function Card({ children, style:sx={}, accent }) {
  return <div style={{background:"var(--card)",borderRadius:12,border:"1px solid var(--border)",...(accent?{borderTop:"3px solid "+accent}:{}),...sx}}>{children}</div>;
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
                style={{padding:"4px 10px",borderRadius:20,border:"1px solid "+(stats[p.id]?.played?"#2ECC71":"#1E2D45"),background:stats[p.id]?.played?"#2ECC7122":"transparent",color:stats[p.id]?.played?"#2ECC71":"#4A5E78",fontSize:12,fontFamily:"Barlow Condensed,sans-serif",cursor:"pointer",fontWeight:600}}>
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
                  {playingPlayers.sort((a,b)=>calcPoints(stats[b.id]||{}, pointsConfig)-calcPoints(stats[a.id]||{}, pointsConfig)).map(p => {
                    const s = stats[p.id] || {};
                    const pts = calcPoints(s, pointsConfig);
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


// ── SPLASH / AUTH SCREEN ─────────────────────────────────────────────────────
function SplashScreen({ onLogin }) {
  const [mode, setMode] = useState('splash'); // splash | login | signup
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const inputStyle = (hasErr) => ({
    width:"100%", background:"#080C14",
    border:"1px solid "+(hasErr?"#FF3D5A":"#1E2D45"),
    borderRadius:8, padding:"12px 16px", color:"#E2EAF4",
    fontSize:16, fontFamily:"Barlow Condensed,sans-serif",
    outline:"none", marginBottom:12, boxSizing:"border-box"
  });

  const handleSignup = async () => {
    if (!email.trim()) { setErr("Enter your email"); return; }
    if (!email.includes('@')) { setErr("Enter a valid email"); return; }
    if (!pw.trim() || pw.length < 6) { setErr("Password must be at least 6 characters"); return; }
    if (pw !== pw2) { setErr("Passwords don't match"); return; }
    setLoading(true); setErr('');
    try {
      const users = await getUsers();
      if (users.find(u => u.email.toLowerCase() === email.toLowerCase().trim())) {
        setErr("Email already registered. Please log in."); setLoading(false); return;
      }
      const hash = await hashPw(pw);
      const newUser = { email: email.toLowerCase().trim(), hash, createdAt: new Date().toISOString() };
      await saveUsers([...users, newUser]);
      onLogin(newUser);
    } catch(e) { setErr("Error: " + e.message); }
    setLoading(false);
  };

  const handleLogin = async () => {
    if (!email.trim()) { setErr("Enter your email"); return; }
    if (!pw.trim()) { setErr("Enter your password"); return; }
    setLoading(true); setErr('');
    try {
      const users = await getUsers();
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
      if (!user) { setErr("Email not found. Please sign up."); setLoading(false); return; }
      const hash = await hashPw(pw);
      if (hash !== user.hash) { setErr("Wrong password."); setLoading(false); return; }
      onLogin(user);
    } catch(e) { setErr("Error: " + e.message); }
    setLoading(false);
  };

  if (mode === 'splash') return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#080C14 0%,#0E1521 50%,#080C14 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"20px",fontFamily:"Barlow Condensed,sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&family=Barlow+Condensed:wght@400;600;700;800&display=swap');*{box-sizing:border-box;margin:0;padding:0;}body{background:#080C14;}`}</style>

      {/* Logo area */}
      <div style={{textAlign:"center",marginBottom:48}}>
        <img src="/logo.png" alt="Teekha Bouncer" style={{width:120,height:120,objectFit:"contain",borderRadius:20,marginBottom:16,boxShadow:"0 0 40px #F5A62344"}} />
        <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:42,color:"#F5A623",letterSpacing:4,lineHeight:1}}>TEEKHA</div>
        <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:42,color:"#E2EAF4",letterSpacing:4,lineHeight:1}}>BOUNCER</div>
        <div style={{fontSize:13,color:"#4A5E78",letterSpacing:6,marginTop:8,textTransform:"uppercase"}}>Fantasy Cricket League</div>
      </div>

      {/* Tagline */}
      <div style={{background:"#0E1521",border:"1px solid #1E2D45",borderRadius:12,padding:"16px 24px",marginBottom:40,textAlign:"center",maxWidth:320}}>
        <div style={{fontSize:14,color:"#94A3B8",lineHeight:1.6}}>
          Track fantasy points, manage squads, and compete with your friends across multiple leagues 🏆
        </div>
      </div>

      {/* Buttons */}
      <div style={{width:"100%",maxWidth:320,display:"flex",flexDirection:"column",gap:12}}>
        <button onClick={() => setMode('signup')}
          style={{background:"linear-gradient(135deg,#F5A623,#FF8C00)",border:"none",borderRadius:12,padding:"16px",color:"#080C14",fontFamily:"Barlow Condensed,sans-serif",fontWeight:800,fontSize:18,cursor:"pointer",letterSpacing:2}}>
          GET STARTED
        </button>
        <button onClick={() => setMode('login')}
          style={{background:"transparent",border:"2px solid #1E2D45",borderRadius:12,padding:"14px",color:"#E2EAF4",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:16,cursor:"pointer",letterSpacing:1}}>
          I HAVE AN ACCOUNT
        </button>
      </div>


    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"#080C14",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"20px",fontFamily:"Barlow Condensed,sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&family=Barlow+Condensed:wght@400;600;700;800&display=swap');*{box-sizing:border-box;margin:0;padding:0;}body{background:#080C14;color:#E2EAF4;}`}</style>

      <div style={{width:"100%",maxWidth:380}}>
        {/* Header */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <img src="/logo.png" alt="Teekha Bouncer" style={{width:64,height:64,objectFit:"contain",borderRadius:12,margin:"0 auto",display:"block"}} />
          <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:28,color:"#F5A623",letterSpacing:3,marginTop:8}}>
            {mode==='login' ? "WELCOME BACK" : "CREATE ACCOUNT"}
          </div>
          <div style={{fontSize:13,color:"#4A5E78",marginTop:4}}>
            {mode==='login' ? "Sign in to your Teekha Bouncer account" : "Join Teekha Bouncer League"}
          </div>
        </div>

        {/* Form */}
        <div style={{background:"#0E1521",borderRadius:16,border:"1px solid #1E2D45",padding:28}}>
          <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setErr('');}} placeholder="Email address" style={inputStyle(err && !pw)} />
          <input type="password" value={pw} onChange={e=>{setPw(e.target.value);setErr('');}} onKeyDown={e=>e.key==="Enter"&&(mode==='login'?handleLogin():null)} placeholder="Password" style={inputStyle(err && pw && !pw2)} />
          {mode==='signup' && (
            <input type="password" value={pw2} onChange={e=>{setPw2(e.target.value);setErr('');}} onKeyDown={e=>e.key==="Enter"&&handleSignup()} placeholder="Confirm password" style={inputStyle(false)} />
          )}
          {err && <div style={{color:"#FF3D5A",fontSize:13,marginBottom:12,textAlign:"center"}}>{err}</div>}
          <button onClick={mode==='login' ? handleLogin : handleSignup} disabled={loading}
            style={{width:"100%",background:"linear-gradient(135deg,#F5A623,#FF8C00)",border:"none",borderRadius:8,padding:14,color:"#080C14",fontFamily:"Barlow Condensed,sans-serif",fontWeight:800,fontSize:16,cursor:loading?"not-allowed":"pointer",opacity:loading?0.7:1,letterSpacing:1}}>
            {loading ? "PLEASE WAIT..." : mode==='login' ? "SIGN IN" : "CREATE ACCOUNT"}
          </button>
        </div>

        {/* Toggle */}
        <div style={{textAlign:"center",marginTop:20,fontSize:14,color:"#4A5E78"}}>
          {mode==='login' ? "Don't have an account? " : "Already have an account? "}
          <button onClick={()=>{setMode(mode==='login'?'signup':'login');setErr('');setPw('');setPw2('');}}
            style={{background:"none",border:"none",color:"#F5A623",fontSize:14,cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,textDecoration:"underline"}}>
            {mode==='login' ? "Sign up" : "Sign in"}
          </button>
        </div>

        <button onClick={() => setMode('splash')}
          style={{display:"block",margin:"16px auto 0",background:"none",border:"none",color:"#4A5E78",fontSize:12,cursor:"pointer"}}>
          ← Back
        </button>
      </div>
    </div>
  );
}


class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  componentDidCatch(error, info) { this.setState({ error: error.message + " | " + info.componentStack?.split("\n")[1] }); }
  static getDerivedStateFromError(error) { return { error: error.message }; }
  render() {
    if (this.state.error) return (
      <div style={{minHeight:"100vh",background:"#080C14",padding:24,fontFamily:"monospace"}}>
        <div style={{color:"#FF3D5A",fontSize:18,marginBottom:16}}>💥 CRASH REPORT</div>
        <div style={{background:"#0E1521",padding:16,borderRadius:8,color:"#E2EAF4",fontSize:13,wordBreak:"break-all",whiteSpace:"pre-wrap"}}>{this.state.error}</div>
        <button onClick={()=>{ localStorage.clear(); window.location.reload(); }} style={{marginTop:20,background:"#F5A623",border:"none",borderRadius:8,padding:"10px 20px",color:"#080C14",fontWeight:700,cursor:"pointer"}}>CLEAR & RELOAD</button>
      </div>
    );
    return this.props.children;
  }
}

// ── PITCH HOME SCREEN ────────────────────────────────────────────────────────
function PitchHome({ onEnter, user, onLogout }) {
  const [pitches, setPitches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPw, setNewPw] = useState("");
  const [err, setErr] = useState("");
  const [enterPitchId, setEnterPitchId] = useState(null);
  const [enterPw, setEnterPw] = useState("");
  const [enterErr, setEnterErr] = useState("");
  const [settingPasswordFor, setSettingPasswordFor] = useState(null);
  const [newPitchPw, setNewPitchPw] = useState("");
  const [changingPasswordFor, setChangingPasswordFor] = useState(null);
  const [oldPitchPw, setOldPitchPw] = useState("");
  const [newChangePw, setNewChangePw] = useState("");
  const [changeErr, setChangeErr] = useState("");
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotStep, setForgotStep] = useState('email'); // email | code
  const [forgotCode, setForgotCode] = useState("");
  const [forgotSending, setForgotSending] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await sbGet("pitches");
        if (data && Array.isArray(data)) {
          setPitches(data);
        } else {
          const p1hash = await sbGet("p1_pwhash");
          const defaultPitches = [{ id: "p1", name: "Pitch 1", hash: p1hash || "", createdAt: new Date().toISOString() }];
          await sbSet("pitches", defaultPitches);
          setPitches(defaultPitches);
        }
      } catch(e) {
        console.error("PitchHome load error:", e);
        setPitches([{ id: "p1", name: "Pitch 1", hash: "", createdAt: new Date().toISOString() }]);
      }
      setLoading(false);
    })();
  }, []);

  const createPitch = async () => {
    if (!newName.trim()) { setErr("Enter a pitch name"); return; }
    if (!newPw.trim()) { setErr("Set a password"); return; }
    if (pitches.length >= 1000) { setErr("Max 1000 pitches reached"); return; }
    const id = "p" + Date.now();
    const hash = await hashPw(newPw);
    const pitch = { id, name: newName.trim(), hash, createdAt: new Date().toISOString(), creatorEmail: user?.email || '' };
    const updated = [...pitches, pitch];
    await sbSet("pitches", updated);
    setPitches(updated);
    setCreating(false);
    setNewName(""); setNewPw(""); setErr("");
    alert("Pitch created! You can now enter " + pitch.name);
  };

  const tryEnter = async (pitch) => {
    if (!pitch.hash) {
      // No pitch password set yet — prompt to set one
      setSettingPasswordFor(pitch.id);
      setEnterPw(""); setEnterErr("");
      return;
    }
    setEnterPitchId(pitch.id);
    setEnterPw(""); setEnterErr("");
  };

  const submitEnter = async () => {
    const pitch = pitches.find(p => p.id === enterPitchId);
    if (!pitch) return;
    const h = await hashPw(enterPw);
    if (h === pitch.hash) {
      _pitchId = pitch.id;
      onEnter(pitch);
    } else {
      setEnterErr("Wrong password");
      setEnterPw("");
    }
  };

  const sendPitchResetCode = async () => {
    if (!forgotEmail.trim()) { setEnterErr("Enter your email"); return; }
    setForgotSending(true); setEnterErr("");
    try {
      const res = await fetch("/api/reset-password", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setForgotStep('code'); setForgotCode("");
    } catch(e) { setEnterErr("❌ " + e.message); }
    setForgotSending(false);
  };

  const verifyPitchResetCode = async () => {
    if (!forgotCode.trim()) { setEnterErr("Enter the code"); return; }
    try {
      const res = await fetch("/api/reset-password", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ verifyCode: forgotCode.trim() }),
      });
      const data = await res.json();
      if (data.valid) {
        const newPw = prompt("Code verified! Enter your NEW pitch password:");
        if (!newPw) return;
        const h = await hashPw(newPw);
        const updated = pitches.map(p => p.id === enterPitchId ? {...p, hash: h} : p);
        await sbSet("pitches", updated);
        setPitches(updated);
        setForgotMode(false); setForgotStep('email'); setForgotEmail(""); setForgotCode("");
        setEnterPitchId(null);
        alert("Password reset! Please enter your new password.");
      } else { setEnterErr("❌ Wrong code. Try again."); setForgotCode(""); }
    } catch(e) { setEnterErr("❌ " + e.message); }
  };

  const setFirstPassword = async () => {
    if (!newPitchPw.trim()) { setEnterErr("Enter a password"); return; }
    const pitch = pitches.find(p => p.id === settingPasswordFor);
    if (!pitch) return;
    const h = await hashPw(newPitchPw);
    const updated = pitches.map(p => p.id === settingPasswordFor ? {...p, hash: h} : p);
    await sbSet("pitches", updated);
    setPitches(updated);
    _pitchId = pitch.id;
    onEnter({...pitch, hash: h});
    setSettingPasswordFor(null);
    setNewPitchPw("");
  };

  const changePassword = async () => {
    if (!oldPitchPw.trim()) { setChangeErr("Enter current password"); return; }
    if (!newChangePw.trim()) { setChangeErr("Enter new password"); return; }
    const pitch = pitches.find(p => p.id === changingPasswordFor);
    if (!pitch) return;
    const oldHash = await hashPw(oldPitchPw);
    if (oldHash !== pitch.hash) { setChangeErr("Wrong current password"); setOldPitchPw(""); return; }
    const newHash = await hashPw(newChangePw);
    const updated = pitches.map(p => p.id === changingPasswordFor ? {...p, hash: newHash} : p);
    await sbSet("pitches", updated);
    setPitches(updated);
    setChangingPasswordFor(null);
    setOldPitchPw(""); setNewChangePw(""); setChangeErr("");
    alert("Password changed successfully!");
  };

  const COLORS = ["#FF3D5A","#4F8EF7","#2ECC71","#F5A623","#A855F7","#06B6D4","#FF6B35","#EC4899"];

  if (loading) return (
    <div style={{minHeight:"100vh",background:"#080C14",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:28,fontWeight:700,color:"#F5A623",letterSpacing:3}}>TEEKHA BOUNCER</div>
      <div style={{color:"#4A5E78",fontSize:14}}>Loading pitches...</div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"#080C14",color:"#E2EAF4"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&family=Barlow+Condensed:wght@400;600;700;800&display=swap');*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Barlow Condensed',sans-serif;background:#080C14;color:#E2EAF4;}`}</style>

      {/* Header */}
      <div style={{background:"#0E1521",borderBottom:"1px solid #1E2D45",padding:"16px 20px",display:"flex",alignItems:"center",gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:10,flex:1}}>
          <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:22,color:"#F5A623",letterSpacing:3}}>🏏 TEEKHA BOUNCER</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{fontSize:11,color:"#4A5E78",textAlign:"right"}}>
            <div style={{color:"#E2EAF4",fontWeight:700}}>{user?.email?.split('@')[0]}</div>
            <div>{user?.email?.split('@')[1]}</div>
          </div>
          <button onClick={onLogout} style={{background:"transparent",border:"1px solid #1E2D45",borderRadius:6,padding:"5px 10px",color:"#4A5E78",fontSize:11,cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700}}>LOGOUT</button>
        </div>
      </div>

      <div style={{maxWidth:600,margin:"0 auto",padding:"24px 16px 100px"}}>
        <div style={{marginBottom:24}}>
          <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:22,fontWeight:700,color:"#E2EAF4",letterSpacing:2,marginBottom:4}}>SELECT YOUR PITCH</div>
          <div style={{fontSize:13,color:"#4A5E78"}}>Each pitch is an independent league. Enter your pitch to manage teams, track points and view the leaderboard.</div>
        </div>

        {/* Pitch list */}
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
          {pitches.map((pitch, i) => (
            <div key={pitch.id} onClick={() => tryEnter(pitch)}
              style={{background:"#0E1521",borderRadius:12,border:"2px solid " + (COLORS[i % COLORS.length] + "44"),padding:"16px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:16,transition:"border .15s"}}
            >
              <div style={{width:44,height:44,borderRadius:10,background:COLORS[i % COLORS.length] + "22",border:"2px solid " + COLORS[i % COLORS.length] + "66",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <span style={{fontFamily:"Rajdhani,sans-serif",fontWeight:800,fontSize:18,color:COLORS[i % COLORS.length]}}>{"P"+(i+1)}</span>
              </div>
              <div style={{flex:1}}>
                <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:18,color:"#E2EAF4",letterSpacing:1}}>{pitch.name}</div>
                <div style={{fontSize:11,color:"#4A5E78",marginTop:2}}>Created {new Date(pitch.createdAt).toLocaleDateString()}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                <div style={{fontSize:12,color:COLORS[i % COLORS.length],fontWeight:700,letterSpacing:1}}>ENTER →</div>
                <button onClick={e=>{e.stopPropagation();setChangingPasswordFor(pitch.id);setOldPitchPw("");setNewChangePw("");setChangeErr("");}}
                  style={{background:"transparent",border:"none",color:"#4A5E78",fontSize:10,cursor:"pointer",textDecoration:"underline",padding:0,fontFamily:"Barlow Condensed,sans-serif"}}>change password</button>
              </div>
            </div>
          ))}
        </div>

        {/* Create new pitch */}
        {!creating ? (
          <button onClick={() => setCreating(true)}
            style={{width:"100%",background:"linear-gradient(135deg,#F5A623,#FF8C00)",border:"none",borderRadius:12,padding:"14px",color:"#080C14",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:16,cursor:"pointer",letterSpacing:1}}>
            + CREATE NEW PITCH
          </button>
        ) : (
          <div style={{background:"#0E1521",borderRadius:12,border:"1px solid #1E2D45",padding:20}}>
            <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:18,color:"#F5A623",letterSpacing:2,marginBottom:16}}>NEW PITCH</div>
            <input value={newName} onChange={e=>{setNewName(e.target.value);setErr("");}} placeholder="Pitch name (e.g. Office League 2026)"
              style={{width:"100%",background:"#080C14",border:"1px solid #1E2D45",borderRadius:8,padding:"11px 14px",color:"#E2EAF4",fontSize:15,fontFamily:"Barlow Condensed,sans-serif",marginBottom:10,boxSizing:"border-box"}} />
            <input type="password" value={newPw} onChange={e=>{setNewPw(e.target.value);setErr("");}} placeholder="Set pitch password"
              style={{width:"100%",background:"#080C14",border:"1px solid #1E2D45",borderRadius:8,padding:"11px 14px",color:"#E2EAF4",fontSize:15,fontFamily:"Barlow Condensed,sans-serif",marginBottom:err?8:16,boxSizing:"border-box"}} />
            {err && <div style={{color:"#FF3D5A",fontSize:13,marginBottom:12}}>{err}</div>}
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{setCreating(false);setNewName("");setNewPw("");setErr("");}}
                style={{flex:1,background:"transparent",border:"1px solid #1E2D45",borderRadius:8,padding:11,color:"#4A5E78",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
              <button onClick={createPitch}
                style={{flex:2,background:"linear-gradient(135deg,#F5A623,#FF8C00)",border:"none",borderRadius:8,padding:11,color:"#080C14",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>CREATE PITCH</button>
            </div>
          </div>
        )}
      </div>

      {/* Set first password modal */}
      {settingPasswordFor && (
        <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.95)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300}}>
          <div style={{background:"#141E2E",borderRadius:16,border:"1px solid #1E2D45",padding:32,width:"100%",maxWidth:340,margin:"0 16px"}}>
            <div style={{fontSize:32,textAlign:"center",marginBottom:8}}>🔐</div>
            <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:22,fontWeight:700,color:"#F5A623",textAlign:"center",letterSpacing:2,marginBottom:4}}>
              SET PITCH PASSWORD
            </div>
            <div style={{fontSize:13,color:"#4A5E78",textAlign:"center",marginBottom:20}}>
              {pitches.find(p=>p.id===settingPasswordFor)?.name} — set a password to protect this pitch
            </div>
            <input type="password" value={newPitchPw} onChange={e=>{setNewPitchPw(e.target.value);setEnterErr("");}} onKeyDown={e=>e.key==="Enter"&&setFirstPassword()} placeholder="Choose pitch password..." autoFocus
              style={{width:"100%",background:"#080C14",border:"1px solid "+(enterErr?"#FF3D5A":"#1E2D45"),borderRadius:8,padding:"12px 16px",color:"#E2EAF4",fontSize:16,fontFamily:"Barlow Condensed,sans-serif",outline:"none",marginBottom:enterErr?8:20,boxSizing:"border-box"}} />
            {enterErr && <div style={{color:"#FF3D5A",fontSize:13,marginBottom:16,textAlign:"center"}}>{enterErr}</div>}
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{setSettingPasswordFor(null);setNewPitchPw("");setEnterErr("");}}
                style={{flex:1,background:"transparent",border:"1px solid #1E2D45",borderRadius:8,padding:11,color:"#4A5E78",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
              <button onClick={setFirstPassword}
                style={{flex:2,background:"linear-gradient(135deg,#F5A623,#FF8C00)",border:"none",borderRadius:8,padding:11,color:"#080C14",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>SET & ENTER</button>
            </div>
          </div>
        </div>
      )}

      {/* Change password modal */}
      {changingPasswordFor && (
        <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.95)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300}}>
          <div style={{background:"#141E2E",borderRadius:16,border:"1px solid #1E2D45",padding:32,width:"100%",maxWidth:340,margin:"0 16px"}}>
            <div style={{fontSize:32,textAlign:"center",marginBottom:8}}>🔑</div>
            <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:22,fontWeight:700,color:"#F5A623",textAlign:"center",letterSpacing:2,marginBottom:4}}>CHANGE PASSWORD</div>
            <div style={{fontSize:13,color:"#4A5E78",textAlign:"center",marginBottom:20}}>{pitches.find(p=>p.id===changingPasswordFor)?.name}</div>
            <input type="password" value={oldPitchPw} onChange={e=>{setOldPitchPw(e.target.value);setChangeErr("");}} placeholder="Current password..." autoFocus
              style={{width:"100%",background:"#080C14",border:"1px solid "+(changeErr?"#FF3D5A":"#1E2D45"),borderRadius:8,padding:"12px 16px",color:"#E2EAF4",fontSize:15,fontFamily:"Barlow Condensed,sans-serif",outline:"none",marginBottom:10,boxSizing:"border-box"}} />
            <input type="password" value={newChangePw} onChange={e=>{setNewChangePw(e.target.value);setChangeErr("");}} onKeyDown={e=>e.key==="Enter"&&changePassword()} placeholder="New password..."
              style={{width:"100%",background:"#080C14",border:"1px solid "+(changeErr?"#FF3D5A":"#1E2D45"),borderRadius:8,padding:"12px 16px",color:"#E2EAF4",fontSize:15,fontFamily:"Barlow Condensed,sans-serif",outline:"none",marginBottom:changeErr?8:20,boxSizing:"border-box"}} />
            {changeErr && <div style={{color:"#FF3D5A",fontSize:13,marginBottom:16,textAlign:"center"}}>{changeErr}</div>}
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{setChangingPasswordFor(null);setOldPitchPw("");setNewChangePw("");setChangeErr("");}}
                style={{flex:1,background:"transparent",border:"1px solid #1E2D45",borderRadius:8,padding:11,color:"#4A5E78",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
              <button onClick={changePassword}
                style={{flex:2,background:"linear-gradient(135deg,#F5A623,#FF8C00)",border:"none",borderRadius:8,padding:11,color:"#080C14",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>CHANGE PASSWORD</button>
            </div>
          </div>
        </div>
      )}

      {/* Enter password modal */}
      {enterPitchId && (
        <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.95)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300}}>
          <div style={{background:"#141E2E",borderRadius:16,border:"1px solid #1E2D45",padding:32,width:"100%",maxWidth:340,margin:"0 16px"}}>
            <div style={{fontSize:32,textAlign:"center",marginBottom:8}}>🏏</div>
            <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:22,fontWeight:700,color:"#F5A623",textAlign:"center",letterSpacing:2,marginBottom:4}}>
              {pitches.find(p=>p.id===enterPitchId)?.name}
            </div>
            {!forgotMode ? <>
              <div style={{fontSize:13,color:"#4A5E78",textAlign:"center",marginBottom:20}}>Enter pitch password to continue</div>
              <input type="password" value={enterPw} onChange={e=>{setEnterPw(e.target.value);setEnterErr("");}} onKeyDown={e=>e.key==="Enter"&&submitEnter()} placeholder="Pitch password..." autoFocus
                style={{width:"100%",background:"#080C14",border:"1px solid "+(enterErr?"#FF3D5A":"#1E2D45"),borderRadius:8,padding:"12px 16px",color:"#E2EAF4",fontSize:16,fontFamily:"Barlow Condensed,sans-serif",outline:"none",marginBottom:enterErr?8:20,boxSizing:"border-box"}} />
              {enterErr && <div style={{color:"#FF3D5A",fontSize:13,marginBottom:16,textAlign:"center"}}>{enterErr}</div>}
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>{setEnterPitchId(null);setEnterPw("");setEnterErr("");}}
                  style={{flex:1,background:"transparent",border:"1px solid #1E2D45",borderRadius:8,padding:11,color:"#4A5E78",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
                <button onClick={submitEnter}
                  style={{flex:2,background:"linear-gradient(135deg,#F5A623,#FF8C00)",border:"none",borderRadius:8,padding:11,color:"#080C14",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>ENTER PITCH</button>
              </div>
              <div style={{textAlign:"center",marginTop:14}}>
                <button onClick={()=>{setForgotMode(true);setForgotStep('email');setForgotEmail("");setForgotCode("");setEnterErr("");}}
                  style={{background:"none",border:"none",color:"#FF3D5A",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>Forgot pitch password?</button>
              </div>
            </> : <>
              {forgotStep==='email' ? <>
                <div style={{fontSize:13,color:"#4A5E78",textAlign:"center",marginBottom:20}}>Enter the admin email to receive a reset code</div>
                <input type="email" value={forgotEmail} onChange={e=>{setForgotEmail(e.target.value);setEnterErr("");}} onKeyDown={e=>e.key==="Enter"&&sendPitchResetCode()} placeholder="Admin email..." autoFocus
                  style={{width:"100%",background:"#080C14",border:"1px solid "+(enterErr?"#FF3D5A":"#1E2D45"),borderRadius:8,padding:"12px 16px",color:"#E2EAF4",fontSize:16,fontFamily:"Barlow Condensed,sans-serif",outline:"none",marginBottom:enterErr?8:20,boxSizing:"border-box"}} />
                {enterErr && <div style={{color:"#FF3D5A",fontSize:13,marginBottom:16,textAlign:"center"}}>{enterErr}</div>}
                <div style={{display:"flex",gap:10}}>
                  <button onClick={()=>{setForgotMode(false);setEnterErr("");}}
                    style={{flex:1,background:"transparent",border:"1px solid #1E2D45",borderRadius:8,padding:11,color:"#4A5E78",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>BACK</button>
                  <button onClick={sendPitchResetCode} disabled={forgotSending}
                    style={{flex:2,background:"linear-gradient(135deg,#4F8EF7,#1a5fb4)",border:"none",borderRadius:8,padding:11,color:"#fff",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:forgotSending?"not-allowed":"pointer",opacity:forgotSending?0.6:1}}>
                    {forgotSending?"SENDING...":"SEND CODE"}
                  </button>
                </div>
              </> : <>
                <div style={{fontSize:13,color:"#2ECC71",textAlign:"center",marginBottom:20}}>Code sent! Check your email inbox.</div>
                <input type="text" value={forgotCode} onChange={e=>{setForgotCode(e.target.value);setEnterErr("");}} onKeyDown={e=>e.key==="Enter"&&verifyPitchResetCode()} placeholder="Enter reset code..." autoFocus
                  style={{width:"100%",background:"#080C14",border:"1px solid "+(enterErr?"#FF3D5A":"#1E2D45"),borderRadius:8,padding:"12px 16px",color:"#E2EAF4",fontSize:16,fontFamily:"Barlow Condensed,sans-serif",outline:"none",marginBottom:enterErr?8:20,boxSizing:"border-box",letterSpacing:4,textAlign:"center"}} />
                {enterErr && <div style={{color:"#FF3D5A",fontSize:13,marginBottom:16,textAlign:"center"}}>{enterErr}</div>}
                <div style={{display:"flex",gap:10}}>
                  <button onClick={()=>{setForgotStep('email');setEnterErr("");}}
                    style={{flex:1,background:"transparent",border:"1px solid #1E2D45",borderRadius:8,padding:11,color:"#4A5E78",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>BACK</button>
                  <button onClick={verifyPitchResetCode}
                    style={{flex:2,background:"linear-gradient(135deg,#F5A623,#FF8C00)",border:"none",borderRadius:8,padding:11,color:"#080C14",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>VERIFY & RESET</button>
                </div>
              </>}
            </>}
          </div>
        </div>
      )}
    </div>
  );
}


// ── TEAM CLAIM SCREEN ────────────────────────────────────────────────────────
function TeamClaimScreen({ pitch, user, teams, onClaimed, onBack }) {
  const [teamIdentity, setTeamIdentity] = useState({});
  const [loading, setLoading] = useState(true);
  const [enteredCode, setEnteredCode] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [step, setStep] = useState("enter"); // enter | setpin | admin | adminpin
  const [adminPw, setAdminPw] = useState("");
  const [claimingTeam, setClaimingTeam] = useState(null);
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [teamsData, setTeamsData] = useState([]);
  useEffect(() => {
    (async () => {
      const [ti, ts] = await Promise.all([storeGet("teamIdentity"), storeGet("teams")]);
      setTeamIdentity(ti || {});
      if (ts && Array.isArray(ts)) setTeamsData(ts);
      setLoading(false);
    })();
  }, []);

  // Check if this user already has a team
  const myTeam = teams.find(t => teamIdentity[t.id]?.claimedBy === user.email);

  const handleEnterCode = () => {
    setErr("");
    const code = enteredCode.trim().toUpperCase();
    // Find which team this code belongs to
    const match = teamsData.find(t => teamIdentity[t.id]?.teamId === code);
    if (!match) { setErr("Invalid Team ID. Ask your admin for the correct code."); return; }
    if (teamIdentity[match.id]?.claimedBy && teamIdentity[match.id].claimedBy !== user.email) {
      setErr("This team is already claimed by another player."); return;
    }
    setClaimingTeam(match);
    setStep("setpin");
    setPin(""); setPin2("");
  };

  const handleSetPin = async () => {
    if (pin.length < 4) { setErr("PIN must be at least 4 digits"); return; }
    if (pin !== pin2) { setErr("PINs don't match"); return; }
    setSubmitting(true);
    try {
      const pinHash = await hashPw(pin);
      const updated = { ...teamIdentity, [claimingTeam.id]: { ...teamIdentity[claimingTeam.id], claimedBy: user.email, pinHash } };
      await storeSet("teamIdentity", updated);
      setTeamIdentity(updated);
      onClaimed(claimingTeam, pinHash);
    } catch(e) { setErr("Error: " + e.message); }
    setSubmitting(false);
  };

  if (loading) return (
    <div style={{minHeight:"100vh",background:"#080C14",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#F5A623",fontFamily:"Rajdhani,sans-serif",fontSize:20}}>Loading...</div>
    </div>
  );

  if (myTeam) {
    // Already claimed — go straight in
    onClaimed(myTeam, teamIdentity[myTeam.id]?.pinHash);
    return null;
  }

  return (
    <div style={{minHeight:"100vh",background:"#080C14",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"Barlow Condensed,sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&family=Barlow+Condensed:wght@400;600;700;800&display=swap');*{box-sizing:border-box;margin:0;padding:0;}body{background:#080C14;color:#E2EAF4;}`}</style>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{width:"100%",marginBottom:16}}>
          <button onClick={onBack} style={{background:"transparent",border:"none",color:"#4A5E78",fontSize:13,cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif",padding:0,display:"flex",alignItems:"center",gap:4}}>
            ← Back to Pitches
          </button>
        </div>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontSize:40,marginBottom:8}}>🏏</div>
          <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:28,fontWeight:700,color:"#F5A623",letterSpacing:3}}>{pitch.name}</div>
          <div style={{fontSize:14,color:"#4A5E78",marginTop:4}}>Claim your fantasy team to continue</div>
        </div>

        <div style={{background:"#0E1521",borderRadius:16,border:"1px solid #1E2D45",padding:28}}>
          {(() => {
            if (step === "enter") return (
              <>
                <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:20,fontWeight:700,color:"#E2EAF4",letterSpacing:2,marginBottom:4}}>ENTER TEAM ID</div>
                <div style={{fontSize:12,color:"#4A5E78",marginBottom:16}}>Ask your league admin for your Team ID code</div>
                <input value={enteredCode} onChange={e=>{setEnteredCode(e.target.value.toUpperCase());setErr("");}}
                  onKeyDown={e=>e.key==="Enter"&&handleEnterCode()}
                  placeholder="e.g. TBL-X7K2" autoFocus maxLength={8}
                  style={{width:"100%",background:"#080C14",border:"1px solid "+(err?"#FF3D5A":"#1E2D45"),borderRadius:8,padding:"12px 16px",color:"#F5A623",fontSize:22,fontFamily:"Rajdhani,sans-serif",fontWeight:700,letterSpacing:4,textAlign:"center",outline:"none",marginBottom:err?8:16,boxSizing:"border-box"}} />
                {err && <div style={{color:"#FF3D5A",fontSize:13,marginBottom:16,textAlign:"center"}}>{err}</div>}
                <button onClick={handleEnterCode} style={{width:"100%",background:"linear-gradient(135deg,#F5A623,#FF8C00)",border:"none",borderRadius:8,padding:14,color:"#080C14",fontFamily:"Barlow Condensed,sans-serif",fontWeight:800,fontSize:16,cursor:"pointer",letterSpacing:1}}>CLAIM TEAM</button>
                <div style={{marginTop:20,paddingTop:16,borderTop:"1px solid #1E2D45"}}>
                  <div style={{fontSize:11,color:"#4A5E78",marginBottom:8,textAlign:"center"}}>League admin? Use your admin password to enter and claim a team</div>
                  <button onClick={()=>setStep("admin")} style={{width:"100%",background:"transparent",border:"1px solid #1E2D45",borderRadius:8,padding:10,color:"#4A5E78",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}>🔒 ADMIN ENTRY</button>
                </div>
              </>
            );
            if (step === "setpin") return (
              <>
                <div style={{background:claimingTeam.color+"22",border:"1px solid "+claimingTeam.color+"44",borderRadius:10,padding:"12px 16px",marginBottom:20,textAlign:"center"}}>
                  <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:22,fontWeight:700,color:claimingTeam.color}}>{claimingTeam.name}</div>
                  <div style={{fontSize:12,color:"#4A5E78",marginTop:4}}>You are claiming this team</div>
                </div>
                <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:18,fontWeight:700,color:"#E2EAF4",letterSpacing:2,marginBottom:4}}>SET YOUR PIN</div>
                <div style={{fontSize:12,color:"#4A5E78",marginBottom:16}}>You will use this PIN to authorize snatch actions</div>
                <input type="password" value={pin} onChange={e=>{setPin(e.target.value);setErr("");}}
                  placeholder="Enter 4+ digit PIN" maxLength={6}
                  style={{width:"100%",background:"#080C14",border:"1px solid "+(err?"#FF3D5A":"#1E2D45"),borderRadius:8,padding:"12px 16px",color:"#E2EAF4",fontSize:20,letterSpacing:6,textAlign:"center",fontFamily:"Rajdhani,sans-serif",outline:"none",marginBottom:10,boxSizing:"border-box"}} />
                <input type="password" value={pin2} onChange={e=>{setPin2(e.target.value);setErr("");}}
                  onKeyDown={e=>e.key==="Enter"&&handleSetPin()}
                  placeholder="Confirm PIN" maxLength={6}
                  style={{width:"100%",background:"#080C14",border:"1px solid "+(err?"#FF3D5A":"#1E2D45"),borderRadius:8,padding:"12px 16px",color:"#E2EAF4",fontSize:20,letterSpacing:6,textAlign:"center",fontFamily:"Rajdhani,sans-serif",outline:"none",marginBottom:err?8:16,boxSizing:"border-box"}} />
                {err && <div style={{color:"#FF3D5A",fontSize:13,marginBottom:16,textAlign:"center"}}>{err}</div>}
                <div style={{display:"flex",gap:10}}>
                  <button onClick={()=>{setStep("enter");setErr("");}} style={{flex:1,background:"transparent",border:"1px solid #1E2D45",borderRadius:8,padding:12,color:"#4A5E78",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>BACK</button>
                  <button onClick={handleSetPin} disabled={submitting} style={{flex:2,background:"linear-gradient(135deg,#F5A623,#FF8C00)",border:"none",borderRadius:8,padding:12,color:"#080C14",fontFamily:"Barlow Condensed,sans-serif",fontWeight:800,fontSize:16,cursor:submitting?"not-allowed":"pointer",opacity:submitting?0.7:1}}>{submitting?"SAVING...":"SET PIN & ENTER"}</button>
                </div>
              </>
            );
            if (step === "admin") return (
              <>
                <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:20,fontWeight:700,color:"#E2EAF4",letterSpacing:2,marginBottom:4}}>ADMIN ENTRY</div>
                <div style={{fontSize:12,color:"#4A5E78",marginBottom:16}}>Enter your league admin password to continue</div>
                <input type="password" value={adminPw} onChange={e=>{setAdminPw(e.target.value);setErr("");}} placeholder="Admin password..." autoFocus
                  style={{width:"100%",background:"#080C14",border:"1px solid "+(err?"#FF3D5A":"#1E2D45"),borderRadius:8,padding:"12px 16px",color:"#E2EAF4",fontSize:16,fontFamily:"Barlow Condensed,sans-serif",outline:"none",marginBottom:err?8:16,boxSizing:"border-box"}} />
                {err && <div style={{color:"#FF3D5A",fontSize:13,marginBottom:16,textAlign:"center"}}>{err}</div>}
                <div style={{display:"flex",gap:10}}>
                  <button onClick={()=>{setStep("enter");setAdminPw("");setErr("");}} style={{flex:1,background:"transparent",border:"1px solid #1E2D45",borderRadius:8,padding:12,color:"#4A5E78",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>BACK</button>
                  <button onClick={async()=>{
                    const ph = await storeGet("pwhash");
                    const h = await hashPw(adminPw);
                    if(h===ph){const ti=await storeGet("teamIdentity");setTeamIdentity(ti||{});setStep("adminpick");setErr("");}
                    else setErr("Wrong admin password");
                  }} style={{flex:2,background:"linear-gradient(135deg,#4F8EF7,#1a5fb4)",border:"none",borderRadius:8,padding:12,color:"#fff",fontFamily:"Barlow Condensed,sans-serif",fontWeight:800,fontSize:15,cursor:"pointer"}}>ENTER</button>
                </div>
              </>
            );
            if (step === "adminpick") return (
              <>
                <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:20,fontWeight:700,color:"#E2EAF4",letterSpacing:2,marginBottom:4}}>PICK YOUR TEAM</div>
                <div style={{fontSize:12,color:"#4A5E78",marginBottom:16}}>Select the team you manage</div>
                <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
                  {teamsData.map(t => {
                    const claimed = teamIdentity[t.id]?.claimedBy;
                    const isMe = claimed===user.email;
                    return (
                      <button key={t.id} onClick={()=>{if(!claimed||isMe){setClaimingTeam(t);setStep("setpin");setPin("");setPin2("");setErr("");}}}
                        style={{padding:"12px 16px",borderRadius:10,border:"2px solid "+(isMe?"#2ECC71":claimed?"#1E2D45":t.color+"44"),background:isMe?"#2ECC7122":claimed?"#1E2D4522":t.color+"11",cursor:claimed&&!isMe?"not-allowed":"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:12,opacity:claimed&&!isMe?0.5:1}}>
                        <div style={{flex:1}}>
                          <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:16,color:isMe?"#2ECC71":claimed?"#4A5E78":t.color}}>{t.name}</div>
                          <div style={{fontSize:11,color:"#4A5E78",marginTop:2}}>{isMe?"Your team":claimed?"Claimed":"Available"}</div>
                        </div>
                        {!claimed && <span style={{color:t.color,fontSize:12,fontWeight:700}}>SELECT</span>}
                        {isMe && <span style={{color:"#2ECC71",fontSize:12,fontWeight:700}}>YOUR TEAM</span>}
                      </button>
                    );
                  })}
                </div>
                <button onClick={()=>setStep("enter")} style={{width:"100%",background:"transparent",border:"1px solid #1E2D45",borderRadius:8,padding:10,color:"#4A5E78",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}>BACK</button>
              </>
            );
            return null;
          })()}
        </div>
      </div>
    </div>
  );
}


// ── EDIT POINTS FORM ─────────────────────────────────────────────────────────
function EditPointsForm({ config, onSave, onCancel }) {
  const [cfg, setCfg] = useState({...config});
  const field = (label, key, step) => (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #1E2D4533"}}>
      <div style={{fontSize:12,color:"#4A5E78",flex:1}}>{label}</div>
      <input type="number" value={cfg[key]} step={step||1} min={0}
        onChange={e=>setCfg(prev=>({...prev,[key]:parseFloat(e.target.value)||0}))}
        style={{width:64,background:"#080C14",border:"1px solid #1E2D45",borderRadius:6,padding:"4px 8px",color:"#F5A623",fontSize:14,fontFamily:"Rajdhani,sans-serif",fontWeight:700,textAlign:"center",outline:"none"}} />
    </div>
  );
  return (
    <div style={{background:"#0E1521",borderRadius:12,border:"1px solid #F5A62344",padding:20,marginBottom:16}}>
      <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:18,fontWeight:700,color:"#F5A623",letterSpacing:2,marginBottom:16}}>EDIT POINTS SYSTEM</div>
      <div style={{fontSize:11,color:"#4A5E78",letterSpacing:1,marginBottom:8}}>BATTING</div>
      {field("Per run",        "run",      0.5)}
      {field("Per four",       "four")}
      {field("Per six",        "six")}
      {field("Half-century",   "fifty")}
      {field("Century",        "century")}
      <div style={{fontSize:11,color:"#4A5E78",letterSpacing:1,marginBottom:8,marginTop:12}}>BOWLING</div>
      {field("Per wicket",     "wicket")}
      {field("4-wkt haul",     "fourWkt")}
      {field("5-wkt haul",     "fiveWkt")}
      {field("Economy bonus",  "ecoBonus")}
      {field("Economy <",      "ecoThreshold", 0.5)}
      {field("Min overs (eco)","ecoMinOvers", 0.5)}
      <div style={{fontSize:11,color:"#4A5E78",letterSpacing:1,marginBottom:8,marginTop:12}}>FIELDING</div>
      {field("Per catch",      "catch")}
      {field("Per stumping",   "stumping")}
      {field("Per run-out",    "runout")}
      <div style={{fontSize:11,color:"#4A5E78",letterSpacing:1,marginBottom:8,marginTop:12}}>BONUSES</div>
      {field("All-round bonus","allRoundBonus")}
      {field("All-round min runs","allRoundMinRuns")}
      {field("All-round min wkts","allRoundMinWkts")}
      {field("Longest six",    "longestSix")}
      {field("Captain mult",   "captainMult", 0.5)}
      {field("VC mult",        "vcMult",       0.5)}
      <div style={{display:"flex",gap:8,marginTop:16}}>
        <button onClick={onCancel} style={{flex:1,background:"transparent",border:"1px solid #1E2D45",borderRadius:8,padding:10,color:"#4A5E78",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
        <button onClick={()=>onSave(cfg)} style={{flex:2,background:"linear-gradient(135deg,#F5A623,#FF8C00)",border:"none",borderRadius:8,padding:10,color:"#080C14",fontFamily:"Barlow Condensed,sans-serif",fontWeight:800,fontSize:14,cursor:"pointer"}}>SAVE POINTS</button>
      </div>
    </div>
  );
}


// ── PROPOSE RULES FORM ───────────────────────────────────────────────────────
function ProposeRulesForm({ teams, eligibleVoters, onPropose }) {
  const [open, setOpen] = useState(false);
  const [transferDay, setTransferDay] = useState("Sunday");
  const [transferTime, setTransferTime] = useState("11:00 AM");
  const [snatchStart, setSnatchStart] = useState("Saturday 12:00 AM");
  const [snatchEnd, setSnatchEnd] = useState("Saturday 12:00 PM");
  const [snatchReturn, setSnatchReturn] = useState("Friday 11:58 PM");

  const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const times = ["12:00 AM","1:00 AM","2:00 AM","3:00 AM","6:00 AM","9:00 AM","10:00 AM","11:00 AM","12:00 PM","1:00 PM","3:00 PM","6:00 PM","9:00 PM","10:00 PM","11:00 PM","11:58 PM"];

  if (!open) return (
    <button onClick={()=>setOpen(true)} style={{width:"100%",background:"#F5A62322",border:"1px solid #F5A62344",borderRadius:12,padding:14,color:"#F5A623",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:15,cursor:"pointer"}}>
      + PROPOSE RULE CHANGE
    </button>
  );

  const sel = (label, val, setVal, opts) => (
    <div style={{marginBottom:12}}>
      <div style={{fontSize:11,color:"#4A5E78",marginBottom:4,letterSpacing:1}}>{label}</div>
      <select value={val} onChange={e=>setVal(e.target.value)} style={{width:"100%",background:"#080C14",border:"1px solid #1E2D45",borderRadius:8,padding:"8px 12px",color:"#E2EAF4",fontSize:14,fontFamily:"Barlow Condensed,sans-serif",cursor:"pointer",outline:"none"}}>
        {opts.map(o=><option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <div style={{background:"#0E1521",borderRadius:12,border:"1px solid #F5A62344",padding:20}}>
      <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:18,fontWeight:700,color:"#F5A623",letterSpacing:2,marginBottom:4}}>PROPOSE RULE CHANGE</div>
      <div style={{fontSize:11,color:"#4A5E78",marginBottom:16}}>All {eligibleVoters.length} claimed teams must approve for changes to take effect.</div>
      {sel("Transfer Window Start Day", transferDay, setTransferDay, days)}
      {sel("Transfer Window End Time", transferTime, setTransferTime, times)}
      {sel("Snatch Window Start", snatchStart, setSnatchStart, days.map(d=>d+" 12:00 AM").concat(days.map(d=>d+" 12:00 PM")))}
      {sel("Snatch Window End", snatchEnd, setSnatchEnd, days.map(d=>d+" 12:00 PM").concat(days.map(d=>d+" 6:00 PM")))}
      {sel("Snatch Return Time", snatchReturn, setSnatchReturn, days.map(d=>d+" 11:58 PM").concat(days.map(d=>d+" 11:00 PM")))}
      <div style={{display:"flex",gap:8,marginTop:4}}>
        <button onClick={()=>setOpen(false)} style={{flex:1,background:"transparent",border:"1px solid #1E2D45",borderRadius:8,padding:10,color:"#4A5E78",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
        <button onClick={()=>{onPropose({"Transfer Start":transferDay,"Transfer End":transferTime,"Snatch Window":snatchStart+" → "+snatchEnd,"Snatch Return":snatchReturn});setOpen(false);}} style={{flex:2,background:"linear-gradient(135deg,#F5A623,#FF8C00)",border:"none",borderRadius:8,padding:10,color:"#080C14",fontFamily:"Barlow Condensed,sans-serif",fontWeight:800,fontSize:14,cursor:"pointer"}}>SUBMIT FOR VOTE</button>
      </div>
    </div>
  );
}


function App({ pitch, onLeave, user, onLogout, myTeam, myPinHash }) {
  const [page, setPage] = useState("setup");
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [matches, setMatches] = useState([]);
  const [captains, setCaptains] = useState({});
  const [points, setPoints] = useState({});
  const [loading, setLoading] = useState("");
  const [numTeams, setNumTeams] = useState(4);
  const [tNames, setTNames] = useState(Array.from({length:10},(_,i)=>"Team "+(i+1)));
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [expandedMatch, setExpandedMatch] = useState(null);
  const [expandedTeam, setExpandedTeam] = useState(null);
  const [pwHash, setPwHash] = useState(null);
  const [recoveryHash, setRecoveryHash] = useState(null);
  const [appReady, setAppReady] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [teamIdentity, setTeamIdentity] = useState({});
  const [snatchPinModal, setSnatchPinModal] = useState(null);
  const [ruleProposal, setRuleProposal] = useState(null);
  const [pointsConfig, setPointsConfig] = useState({
    run:1, four:8, six:12, fifty:10, century:20,
    wicket:25, fourWkt:8, fiveWkt:15, ecoBonus:10, ecoThreshold:6, ecoMinOvers:2,
    catch:8, stumping:12, runout:12,
    allRoundMinRuns:30, allRoundMinWkts:2, allRoundBonus:15,
    longestSix:50, captainMult:2, vcMult:1.5
  }); // loaded from supabase
  const [showRulesPanel, setShowRulesPanel] = useState(false);
  const [votePin, setVotePin] = useState('');
  const [votePinErr, setVotePinErr] = useState(''); // {pid, fromTeamId}
  const [snatchPin, setSnatchPin] = useState('');
  const [snatchPinErr, setSnatchPinErr] = useState('');
  const [snatchWindowStatus, setSnatchWindowStatus] = useState(getSnatchWindowStatus());
  const [liveScores, setLiveScores] = useState({});
  const pollRef = React.useRef(null);
  const [unlocked, setUnlocked] = useState(false);
  const isAdmin = user && pitch && (pitch.creatorEmail === user.email || !pitch.creatorEmail);
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

  useEffect(() => {
    (async () => {
      try {
        const keys = ["teams","players","assignments","matches","captains","points","page","tnames","numteams","pwhash","recoveryHash","teamLogos","safePlayers","unsoldPool","transfers","snatch","ownershipLog","teamIdentity","ruleProposal","pointsConfig"];
        const results = await Promise.all(keys.map(k => storeGet(k)));
        const [t,p,a,m,c,pts,pg,tn,nt,ph,rh,tl,sp,up,tr,sn,ol,ti] = results;
        if(t) setTeams(t);
        if(p) setPlayers(p);
        if(a) setAssignments(a);
        if(m) setMatches(m);
        if(c) setCaptains(c);
        if(pts) setPoints(pts);
        if(pg && typeof pg === 'string') setPage(pg);
        if(tn) setTNames(tn);
        if(nt) setNumTeams(nt);
        if(ph) setPwHash(ph);
        if(rh) setRecoveryHash(rh);
        if(tl) setTeamLogos(tl);
        if(sp) setSafePlayers(sp);
        if(up) setUnsoldPool(up);
        if(tr && typeof tr === 'object') setTransfers(tr);
        if(sn && typeof sn === 'object') setSnatch(sn);
        if(ol && typeof ol === 'object') setOwnershipLog(ol);
        if(ti && typeof ti === 'object') setTeamIdentity(ti);
        const rp = results[keys.indexOf("ruleProposal")];
        if(rp && typeof rp === 'object') setRuleProposal(rp);
        const pc = results[keys.indexOf('pointsConfig')];
        if(pc && typeof pc === 'object') setPointsConfig(prev=>({...prev,...pc}));
      } catch(e) {
        console.error("Load error:", e.message);
      } finally {
        setAppReady(true);
      }
    })();
  }, []);

  // Auto-refresh schedule when upcoming matches < 5
  useEffect(() => {
    if (!appReady) return;
    const upcomingCount = matches.filter(m => m.status === "upcoming").length;
    if (upcomingCount < 5) {
      fetchMatches();
    }
  }, [appReady]);

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
  const initiateSnatch = (pid, fromTeamId) => {
    if (!snatchWindowStatus.open) { alert("Snatch window is closed! Opens Saturday 12AM IST."); return; }
    if (isPlayerSafe(pid)) { alert("Safe players cannot be snatched!"); return; }
    if (snatch.active) { alert("You have already used your snatch this week."); return; }
    setSnatchPinModal({ pid, fromTeamId });
    setSnatchPin(''); setSnatchPinErr('');
  };

  const confirmSnatch = async () => {
    if (!snatchPinModal) return;
    const { pid, fromTeamId } = snatchPinModal;
    const byTeamId = leaderboard[0]?.id;
    if (!byTeamId) return;
    const ti = teamIdentity[byTeamId];
    if (!ti?.pinHash) { setSnatchPinErr("No PIN set for your team. Contact admin."); return; }
    const h = await hashPw(snatchPin);
    if (h !== ti.pinHash) { setSnatchPinErr("Wrong PIN. Try again."); setSnatchPin(''); return; }
    if (!window.confirm("FINAL WARNING: This action CANNOT be undone until Friday 11:58 PM. Are you sure?")) {
      setSnatchPinModal(null); return;
    }
    const pointsAtSnatch = Object.values(points[pid]||{}).reduce((s,d)=>s+d.base,0);
    const active = { byTeamId, pid, fromTeamId, pointsAtSnatch, startDate: new Date().toISOString() };
    const a = {...assignments, [pid]: byTeamId};
    updAssign(a);
    updSnatch({...snatch, active, weekNum: snatch.weekNum});
    setSnatchPinModal(null);
    alert("Snatch activated! Player moves to " + (teams.find(t=>t.id===byTeamId)?.name) + " until Friday 11:58 PM.");
  };

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
    setLoading("Fetching IPL 2026 matches from Cricbuzz…");
    try {
      const extractIPL = (data) => {
        const ipl = [];
        if (!data || !data.typeMatches) return ipl;
        for (const type of data.typeMatches) {
          for (const series of (type.seriesMatches || [])) {
            const sm = series.seriesAdWrapper || series;
            if (sm.seriesName && sm.seriesName.includes("Indian Premier League")) {
              for (const match of (sm.matches || [])) {
                ipl.push({info: match.matchInfo, score: match.matchScore});
              }
            }
          }
        }
        return ipl;
      };

      const [recentData, upcomingData, liveData] = await Promise.all([
        fetch("/api/cricbuzz?path="+encodeURIComponent("matches/v1/recent")).then(r=>r.json()).catch(()=>({})),
        fetch("/api/cricbuzz?path="+encodeURIComponent("matches/v1/upcoming")).then(r=>r.json()).catch(()=>({})),
        fetch("/api/cricbuzz?path="+encodeURIComponent("matches/v1/live")).then(r=>r.json()).catch(()=>({})),
      ]);

      // Merge all three sources — "Complete" state always wins over "In Progress"
      const matchMap = new Map();
      for (const m of [...extractIPL(liveData), ...extractIPL(recentData), ...extractIPL(upcomingData)]) {
        const id = m.info?.matchId;
        if (!id) continue;
        const existing = matchMap.get(id);
        if (!existing || m.info?.state === "Complete") {
          matchMap.set(id, m);
        }
      }
      const fetched = Array.from(matchMap.values());

      if (fetched.length === 0) {
        alert("No IPL matches found from Cricbuzz right now.");
        setLoading(""); return;
      }

      const fetchedMap = {};
      fetched.forEach(m => { if (m.info?.matchId) fetchedMap[m.info.matchId] = m; });

      const updated = matches.map(m => {
        if (m.cricbuzzId && fetchedMap[m.cricbuzzId]) {
          const f = fetchedMap[m.cricbuzzId].info;
          return {
            ...m,
            status: m.status === "completed" ? "completed" : f.state === "Complete" ? "completed" : f.state === "In Progress" ? "live" : "upcoming",
            result: m.result || f.status || null,
          };
        }
        return m;
      });

      const existingCricbuzzIds = new Set(matches.map(m => m.cricbuzzId).filter(Boolean));
      let nextNum = matches.length + 1;
      fetched.forEach(({info: m}) => {
        if (!m || existingCricbuzzIds.has(m.matchId)) return;
        updated.push({
          id: "m"+m.matchId,
          cricbuzzId: m.matchId,
          matchNum: nextNum++,
          date: m.startDate ? new Date(parseInt(m.startDate)).toISOString().split("T")[0] : "TBD",
          time: m.startDate ? new Date(parseInt(m.startDate)).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Kolkata"}) : "",
          team1: m.team1?.teamSName || m.team1?.teamName || "TBA",
          team2: m.team2?.teamSName || m.team2?.teamName || "TBA",
          venue: m.venueInfo?.ground ? m.venueInfo.ground+(m.venueInfo.city?", "+m.venueInfo.city:"") : (m.venueInfo?.city || "TBD"),
          status: m.state === "Complete" ? "completed" : m.state === "In Progress" ? "live" : "upcoming",
          result: m.status || null,
        });
      });

      updMatches(updated);
      const live = updated.filter(m => m.status === "live").length;
      const upcoming = updated.filter(m => m.status === "upcoming").length;
      const completed = updated.filter(m => m.status === "completed").length;
      alert("Updated! "+completed+" completed, "+live+" live, "+upcoming+" upcoming.");
    } catch(e){
      alert("Error: "+e.message);
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
        const pts=calcPoints(s, pointsConfig);
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
    const allPids = new Set([
      ...players.filter(p=>assignments[p.id]===teamId).map(p=>p.id),
      ...Object.entries(ownershipLog).filter(([pid,periods])=>periods.some(o=>o.teamId===teamId)).map(([pid])=>pid)
    ]);

    // Add snatched-in player (currently on loan to this team)
    if (snatch.active?.byTeamId===teamId) allPids.add(snatch.active.pid);

    for(const pid of allPids){
      const periods = (ownershipLog[pid]||[]).filter(o=>o.teamId===teamId);

      // If this player is currently snatched AWAY from this team — freeze at pointsAtSnatch
      if(snatch.active?.pid===pid && snatch.active?.fromTeamId===teamId) {
        total += snatch.active.pointsAtSnatch;
        continue;
      }

      // If this player is currently snatched IN to this team — only count post-snatch points
      if(snatch.active?.pid===pid && snatch.active?.byTeamId===teamId) {
        const snatchDate = snatch.active.startDate.split('T')[0];
        for(const[mid,d] of Object.entries(points[pid]||{})){
          const m = matches.find(x=>x.id===mid);
          if(m && m.date >= snatchDate) total+=d.base;
        }
        continue;
      }

      // Historical snatch: player was snatched away, now returned — freeze contributed pts
      const histSnatchedAway = (snatch.history||[]).find(h=>h.pid===pid && h.fromTeamId===teamId);
      if(histSnatchedAway) {
        // Count all points EXCEPT those during the snatch period
        for(const[mid,d] of Object.entries(points[pid]||{})){
          const m = matches.find(x=>x.id===mid);
          if(!m) continue;
          const matchDate = m.date;
          const snatchStart = histSnatchedAway.startDate.split('T')[0];
          const snatchEnd = histSnatchedAway.returnDate ? histSnatchedAway.returnDate.split('T')[0] : '2099-01-01';
          if(matchDate >= snatchStart && matchDate <= snatchEnd) continue; // skip snatch week
          const cap=captains[mid+"_"+teamId]||{};
          let pts=d.base;
          if(cap.captain===pid)pts*=2;else if(cap.vc===pid)pts*=1.5;
          total+=pts;
        }
        continue;
      }

      // Historical snatch: player was snatched IN, now returned — freeze snatch week pts
      const histSnatchedIn = (snatch.history||[]).find(h=>h.pid===pid && h.byTeamId===teamId);
      if(histSnatchedIn) {
        total += (histSnatchedIn.snatchWeekPts||0);
        continue;
      }

      // Normal ownership
      for(const[mid,d] of Object.entries(points[pid]||{})){
        const m = matches.find(x=>x.id===mid);
        if(!m) continue;
        const matchDate = new Date(m.date);
        const owned = periods.length === 0
          ? assignments[pid]===teamId
          : periods.some(o=>{
              const from = new Date(o.from);
              const to = o.to ? new Date(o.to) : new Date('2099-01-01');
              return matchDate >= from && matchDate <= to;
            });
        if(!owned) continue;
        const cap=captains[mid+"_"+teamId]||{};
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
      const snatchDate = snatch.active.startDate;
      let tot=0;
      for(const[mid,d]of Object.entries(points[p.id]||{})){
        const m = matches.find(x=>x.id===mid);
        if(m && new Date(m.date) >= new Date(snatchDate)) tot+=d.base;
      }
      return p?{...p,total:Math.round(tot),status:"snatched-in",frozenAt:Math.round(tot)}:null;
    })() : null;

    // Players currently snatched AWAY from this team (show struck-through, frozen pts)
    const snatchedOut = (snatch.active?.fromTeamId===teamId) ? (() => {
      const p = players.find(x=>x.id===snatch.active.pid);
      if(!p) return null;
      return {...p, total: snatch.active.pointsAtSnatch, status:"snatched-out", frozenAt: snatch.active.pointsAtSnatch};
    })() : null;

    // Historical: players returned after snatch (show in B's pool struck-through)
    const snatchHistoryForTeam = (snatch.history||[]).map(h => {
      const p = players.find(x=>x.id===h.pid);
      if(!p) return null;
      // If this team snatched the player — show them struck-through with snatch week pts
      if(h.byTeamId===teamId) return {...p, total: h.snatchWeekPts||0, status:"snatch-returned-in", frozenAt: h.snatchWeekPts||0};
      return null;
    }).filter(Boolean);

    const allActive = [...active, ...(snatchedOut?[snatchedOut]:[])];
    return [...allActive, ...historical, ...(snatchedIn?[snatchedIn]:[]), ...snatchHistoryForTeam].sort((a,b)=>b.total-a.total);
  };

  const shareLeaderboard = () => {
    const medals = ['🥇','🥈','🥉'];
    const lines = leaderboard.map((t, i) => (medals[i] || ('#'+(i+1))) + ' ' + t.name + ': ' + t.total + ' pts');
    const text = '🏏 Teekha Bouncer League\n' + (pitch ? pitch.name : '') + '\nLeaderboard\n\n' + lines.join('\n') + '\n\nteekha-bouncer.vercel.app';
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  };

  const fetchLiveScores = async () => {
    try {
      // Use recent endpoint which has live matches
      const res = await fetch("/api/cricbuzz?path=" + encodeURIComponent("matches/v1/recent"));
      const data = await res.json();
      const scores = {};
      if (data && data.typeMatches) {
        for (const type of data.typeMatches) {
          for (const series of (type.seriesMatches || [])) {
            const sm = series.seriesAdWrapper || series;
            if (sm.seriesName && sm.seriesName.includes("Indian Premier League")) {
              for (const m of (sm.matches || [])) {
                const info = m.matchInfo;
                const score = m.matchScore;
                if (info && info.matchId && info.state === "In Progress") {
                  const t1 = score?.team1Score?.inngs1;
                  const t2 = score?.team2Score?.inngs1;
                  scores["m"+info.matchId] = {
                    team1Score: t1 ? t1.runs+"/"+t1.wickets+" ("+parseFloat(t1.overs).toFixed(1)+" ov)" : null,
                    team2Score: t2 ? t2.runs+"/"+t2.wickets+" ("+parseFloat(t2.overs).toFixed(1)+" ov)" : null,
                    status: info.status || "",
                    state: info.state,
                  };
                }
              }
            }
          }
        }
      }
      setLiveScores(scores);
    } catch(e) { console.warn("Live scores fetch failed:", e.message); }
  };

  // Poll live scores every 60s when on matches page
  useEffect(() => {
    if (page === "matches") {
      fetchLiveScores();
      pollRef.current = setInterval(fetchLiveScores, 60000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [page]);

  // Update snatch window status every minute
  useEffect(() => {
    const t = setInterval(() => setSnatchWindowStatus(getSnatchWindowStatus()), 60000);
    return () => clearInterval(t);
  }, []);

  // Auto-return snatched player on Friday 11:58 PM IST
  useEffect(() => {
    if (!snatch.active) return;
    const check = () => {
      const now = new Date();
      const ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
      const day = ist.getUTCDay(); // 5 = Friday
      const hour = ist.getUTCHours();
      const min = ist.getUTCMinutes();
      if (day === 5 && hour === 23 && min >= 58) {
        // Auto return!
        const { pid, fromTeamId, byTeamId, pointsAtSnatch } = snatch.active;
        // Calculate points earned during snatch week for B
        const snatchDate = snatch.active.startDate;
        let snatchWeekPts = 0;
        Object.entries(points[pid] || {}).forEach(([mid, d]) => {
          const match = matches.find(m => m.id === mid);
          if (match && match.date >= snatchDate.split('T')[0]) {
            snatchWeekPts += d.base;
          }
        });
        const newHistory = [...(snatch.history || []), {
          ...snatch.active,
          returnDate: new Date().toISOString(),
          snatchWeekPts,
        }];
        // Return player to original team
        const a = {...assignments, [pid]: fromTeamId};
        updAssign(a);
        updSnatch({...snatch, active: null, history: newHistory, weekNum: snatch.weekNum + 1});
      }
    };
    check();
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, [snatch.active]);


  const savePointsConfig = async (cfg) => {
    setPointsConfig(cfg);
    await storeSet("pointsConfig", cfg);
  };

  const updRuleProposal = async (val) => {
    setRuleProposal(val);
    await storeSet("ruleProposal", val);
  };

  // Teams with claimed IDs = eligible voters
  // Tournament is "started" if any matches have been played
  const tournamentStarted = matches.some(m => m.status === "completed") && teams.length > 0;
  const eligibleVoters = teams.filter(t => teamIdentity[t.id]?.claimedBy);

  const proposeRuleChange = async (changes) => {
    const proposal = {
      id: Date.now().toString(),
      proposedBy: myTeam?.id || 'admin',
      proposedAt: new Date().toISOString(),
      changes, // { transferDay, transferTime, snatchStart, snatchEnd, snatchReturn }
      votes: {}, // { teamId: 'approved' | 'rejected' }
      status: 'pending'
    };
    await updRuleProposal(proposal);
  };

  const voteOnProposal = async (approve) => {
    if (!myTeam || !ruleProposal) return;
    const ti = teamIdentity[myTeam.id];
    if (!ti?.pinHash) { setVotePinErr("No PIN set for your team"); return; }
    const h = await hashPw(votePin);
    if (h !== ti.pinHash) { setVotePinErr("Wrong PIN"); setVotePin(''); return; }

    const newVotes = { ...ruleProposal.votes, [myTeam.id]: approve ? 'approved' : 'rejected' };
    const allApproved = eligibleVoters.every(t => newVotes[t.id] === 'approved');
    const anyRejected = Object.values(newVotes).includes('rejected');

    let newProposal = { ...ruleProposal, votes: newVotes };

    if (anyRejected) {
      newProposal.status = 'rejected';
      await updRuleProposal(newProposal);
      alert("Rule change rejected.");
    } else if (allApproved) {
      newProposal.status = 'approved';
      await updRuleProposal(newProposal);
      // Apply the rule changes
      alert("All teams approved! Rules updated.");
    } else {
      await updRuleProposal(newProposal);
    }
    setVotePin(''); setVotePinErr('');
  };

  // Check if current user has pending vote
  const pendingVote = ruleProposal?.status === 'pending' && myTeam &&
    eligibleVoters.some(t => t.id === myTeam.id) &&
    !ruleProposal.votes[myTeam.id];

  const navItems=[
    {id:"draft",label:"Draft",icon:"📋",disabled:teams.length===0},
    {id:"matches",label:"Matches",icon:"🏏",disabled:players.length===0},
    {id:"transfer",label:"Transfer",icon:"🔄",disabled:teams.length===0},
    {id:"results",label:"Results",icon:"📊",disabled:teams.length===0||matches.length===0},
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
      <div style={{minHeight:"100vh",background:"var(--bg)"}}>
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
              const pts=calcPoints(s, pointsConfig);
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
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <button onClick={()=>setDrawerOpen(true)} style={{background:"transparent",border:"none",cursor:"pointer",padding:"6px 4px",display:"flex",flexDirection:"column",justifyContent:"center",gap:4,flexShrink:0,position:"relative"}}>
              <span style={{display:"block",width:20,height:2,background:"#E2EAF4",borderRadius:2}} />
              <span style={{display:"block",width:20,height:2,background:"#E2EAF4",borderRadius:2}} />
              <span style={{display:"block",width:20,height:2,background:"#E2EAF4",borderRadius:2}} />
              {pendingVote && <span style={{position:"absolute",top:2,right:2,width:8,height:8,background:"#FF3D5A",borderRadius:"50%"}} />}
            </button>
            <div style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}} onClick={onLeave} title="Back to pitches">
            <img src="/logo.png" alt="Teekha Bouncer" style={{height:36,width:36,objectFit:"contain",borderRadius:6}} />
            <div>
              <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:14,color:"#F5A623",letterSpacing:1,lineHeight:1}}>TEEKHA BOUNCER LEAGUE</div>
              <div style={{fontSize:9,color:"#4A5E78",letterSpacing:1,marginTop:2}}>{pitch ? pitch.name : ""} {user ? "• "+user.email.split("@")[0] : ""}</div>
            </div>
          </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <button onClick={()=>{if(unlocked)setUnlocked(false);else{setPendingAction(null);setShowPwModal(true);}}} style={{background:unlocked?"#2ECC7122":"transparent",border:"1px solid "+(unlocked?"#2ECC71":"#1E2D45"),color:unlocked?"#2ECC71":"#4A5E78",fontSize:13,borderRadius:6,padding:"6px 12px",cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700}}>
              <span className="desk-only">{unlocked?"🔓 ON":"🔒 OFF"}</span>
              <span className="mob-only">{unlocked?"🔓":"🔒"}</span>
            </button>
            <button onClick={()=>withPassword(()=>{if(!confirm("Reset ALL data? This cannot be undone!"))return;["teams","players","assignments","matches","captains","points","page","pwhash"].forEach(k=>storeDel(k));window.location.reload();})} style={{background:"transparent",border:"1px solid #1E2D45",color:"#4A5E78",fontSize:13,borderRadius:6,padding:"6px 10px",cursor:"pointer"}}>⚙️</button>
            <button onClick={onLogout} style={{background:"#FF3D5A22",border:"1px solid #FF3D5A44",color:"#FF3D5A",fontSize:13,borderRadius:6,padding:"6px 10px",cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700}}>
              <span className="desk-only">LOGOUT</span>
              <span className="mob-only" style={{fontSize:11}}>OUT</span>
            </button>
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
                      <input value={tNames[i]} onChange={e=>{const n=[...tNames];n[i]=e.target.value;setTNames(n);}} style={{flex:1,background:"#080C14",border:"1px solid #1E2D45",borderRadius:8,padding:"9px 14px",color:"#E2EAF4",fontSize:15,fontFamily:"Barlow Condensed,sans-serif",fontWeight:600}} placeholder={"Team "+(i+1)} />
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
                    <Btn variant="blue" onClick={()=>withPassword(fetchPlayers)} sx={{fontSize:13,padding:"8px 14px"}}>{players.length>0?"↻ REFRESH":"🌐 FETCH PLAYERS"}</Btn>
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
              <div style={{background:unlocked?"#2ECC7112":"#F5A62310",border:"1px solid "+(unlocked?"#2ECC7133":"#F5A62333"),borderRadius:10,padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                <div>
                  <span style={{fontWeight:700,color:unlocked?"#2ECC71":"#F5A623",fontSize:14}}>{unlocked?"🔓 Squad changes unlocked":"🔒 Squad changes are locked"}</span>
                  <span style={{color:"#4A5E78",fontSize:12,marginLeft:10}}>{unlocked?"Assign, replace or remove freely":"Password required to modify squads"}</span>
                </div>
                <button onClick={()=>{if(unlocked)setUnlocked(false);else{setPendingAction(null);setShowPwModal(true);}}} style={{background:unlocked?"#FF3D5A22":"#F5A62322",border:"1px solid "+(unlocked?"#FF3D5A44":"#F5A62344"),color:unlocked?"#FF3D5A":"#F5A623",borderRadius:7,padding:"7px 16px",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                  {unlocked?"LOCK":"UNLOCK"}
                </button>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
                {teams.map(t=>{
                  const cnt=players.filter(p=>assignments[p.id]===t.id).length;
                  const active=teamFilter===t.id;
                  return(
                    <div key={t.id} style={{position:"relative",display:"flex",alignItems:"center",background:active?t.color+"22":"#0E1521",borderRadius:8,borderLeft:"3px solid "+t.color,fontSize:13,border:active?"1px solid "+t.color:"1px solid transparent",transition:"all .15s",overflow:"hidden"}}>
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
                        <div key={p.id} style={{padding:"10px 14px",background:"#0E1521",borderRadius:8,borderLeft:"3px solid "+(aTeam?aTeam.color:"#1E2D45")}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                            <div style={{minWidth:0,flex:1}}>
                              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                                <span style={{fontWeight:700,fontSize:14,color:"#E2EAF4"}}>{p.name}</span>
                                {isAssigned&&isPlayerSafeForTeam(assignments[p.id],p.id)&&<span style={{background:"#2ECC7122",color:"#2ECC71",border:"1px solid #2ECC7144",borderRadius:10,fontSize:9,padding:"1px 5px",fontWeight:700}}>🛡️</span>}
                              </div>
                              <div style={{fontSize:11,color:"#4A5E78",marginTop:2}}>{p.iplTeam} • <span style={{color:ROLE_COLORS[p.role]||"#94A3B8"}}>{p.role}</span>{isAssigned&&<span style={{marginLeft:6,color:aTeam?.color,fontWeight:700}}>{aTeam?.name}</span>}</div>
                            </div>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <select value={assignments[p.id]||""} onChange={e=>assignPlayer(p.id,e.target.value)} style={{flex:1,background:"#141E2E",border:"1px solid "+(aTeam?aTeam.color+"66":"#1E2D45"),borderRadius:6,padding:"6px 8px",color:aTeam?aTeam.color:"#4A5E78",fontSize:12,fontFamily:"Barlow Condensed",fontWeight:600,cursor:"pointer",minWidth:0}}>
                              <option value="">{isAssigned?"Move to…":"— Assign —"}</option>
                              {teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                            {isAssigned&&<button onClick={()=>removePlayer(p.id)} style={{background:"#FF3D5A22",border:"1px solid #FF3D5A44",color:"#FF3D5A",borderRadius:6,padding:"6px 8px",cursor:"pointer",fontSize:13,flexShrink:0}}>✕</button>}
                            <button onClick={()=>withPassword(()=>setEditPlayer(p))} style={{background:"#4F8EF722",border:"1px solid #4F8EF744",color:"#4F8EF7",borderRadius:6,padding:"6px 8px",cursor:"pointer",fontSize:13,flexShrink:0}}>✏️</button>
                            {isAssigned&&<button onClick={()=>toggleSafePlayer(assignments[p.id],p.id)} style={{background:isPlayerSafeForTeam(assignments[p.id],p.id)?"#2ECC7133":"transparent",border:"1px solid "+(isPlayerSafeForTeam(assignments[p.id],p.id)?"#2ECC71":"#1E2D45"),color:isPlayerSafeForTeam(assignments[p.id],p.id)?"#2ECC71":"#4A5E78",borderRadius:6,padding:"6px 8px",cursor:"pointer",fontSize:13,flexShrink:0}}>🛡️</button>}
                            <button onClick={()=>deletePlayer(p.id)} style={{background:"#FF3D5A22",border:"1px solid #FF3D5A44",color:"#FF3D5A",borderRadius:6,padding:"6px 8px",cursor:"pointer",fontSize:11,flexShrink:0}}>🗑️</button>
                          </div>
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
                <Btn variant="blue" onClick={fetchMatches}>{matches.length>0?"↻ REFRESH ("+matches.length+")":"🌐 FETCH SCHEDULE"}</Btn>
              </div>
              {matches.length===0?(
                <Card sx={{padding:60,textAlign:"center"}}><div style={{fontSize:56}}>📅</div><div style={{color:"#4A5E78",marginTop:16,fontSize:16}}>Click "Fetch Schedule" to load IPL 2026 matches</div></Card>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {(() => {
                    const sorted = [...matches].sort((a,b)=>{
                      const order = {completed:0, live:1, upcoming:2};
                      const ao = order[a.status]??2, bo = order[b.status]??2;
                      if (ao !== bo) return ao - bo;
                      return (a.date||"").localeCompare(b.date||"");
                    });
                    let upcomingCount = 0;
                    return sorted.filter(m => {
                      if (m.status !== "upcoming") return true;
                      upcomingCount++;
                      return upcomingCount <= 5;
                    });
                  })().map(match=>{
                    const open=expandedMatch===match.id,completed=match.status==="completed",synced=Object.keys(points).some(pid=>points[pid][match.id]);
                    return(
                      <Card key={match.id} sx={{overflow:"hidden"}}>
                        <div style={{display:"flex",alignItems:"center",padding:"12px 14px",cursor:"pointer",gap:10}} onClick={()=>setExpandedMatch(open?null:match.id)}>
                          <div style={{background:"#080C14",borderRadius:6,padding:"4px 8px",minWidth:36,textAlign:"center",flexShrink:0}}>
                            <div style={{fontSize:9,color:"#4A5E78"}}>M</div>
                            <div style={{fontSize:16,fontWeight:800,color:"#F5A623",fontFamily:"Rajdhani"}}>{match.matchNum}</div>
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:700,fontSize:14,color:"#E2EAF4",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{match.team1} <span style={{color:"#4A5E78"}}>vs</span> {match.team2}</div>
                            {liveScores[match.id] && liveScores[match.id].team1Score ? (
                              <div style={{marginTop:3}}>
                                <div style={{fontSize:11,color:"#E2EAF4",fontWeight:600}}>{match.team1}: <span style={{color:"#F5A623",fontFamily:"Rajdhani,sans-serif",fontSize:13,fontWeight:700}}>{liveScores[match.id].team1Score}</span></div>
                                {liveScores[match.id].team2Score && <div style={{fontSize:11,color:"#E2EAF4",fontWeight:600}}>{match.team2}: <span style={{color:"#4F8EF7",fontFamily:"Rajdhani,sans-serif",fontSize:13,fontWeight:700}}>{liveScores[match.id].team2Score}</span></div>}
                              </div>
                            ) : (
                              <div style={{fontSize:11,color:"#4A5E78",marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{match.date}{match.time?" • "+match.time+" IST":""} • {match.venue}</div>
                            )}
                          </div>
                          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                            {synced&&<span style={{fontSize:9,color:"#2ECC71",fontWeight:700}}>✓ SYNCED</span>}
                            {match.status==="live" || (liveScores[match.id] && liveScores[match.id].state !== "Complete") ? (
                              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                                <span style={{fontSize:9,color:"#FF3D5A",fontWeight:700,animation:"pulse 1s infinite"}}>🔴 LIVE</span>
                                {unlocked && <button onClick={e=>{e.stopPropagation();const upd=matches.map(m=>m.id===match.id?{...m,status:"completed"}:m);updMatches(upd);}} style={{fontSize:9,color:"#4A5E78",background:"transparent",border:"1px solid #1E2D45",borderRadius:4,padding:"2px 6px",cursor:"pointer"}}>Mark Done</button>}
                              </div>
                            ) : (
                              <span style={{fontSize:9,color:completed?"#2ECC71":"#F5A623",fontWeight:700,maxWidth:80,textAlign:"right",lineHeight:1.2}}>{completed?(match.result?"✓ "+match.result.slice(0,25):"DONE"):"UPCOMING"}</span>
                            )}
                            <span style={{color:"#4A5E78",fontSize:11}}>{open?"▲":"▼"}</span>
                          </div>
                        </div>
                        {open&&(
                          <div style={{padding:"0 18px 18px",borderTop:"1px solid #1E2D45"}}>
                            <div style={{marginTop:16}}>
                              <div style={{fontSize:12,color:"#4A5E78",letterSpacing:2,fontWeight:700,marginBottom:4}}>CAPTAIN & VICE CAPTAIN</div>
                              {!completed && <div style={{fontSize:11,color:"#F5A62388",marginBottom:14}}>⚡ Set before match starts — affects fantasy points</div>}
                              {completed && <div style={{fontSize:11,color:"#2ECC7188",marginBottom:14}}>✓ Points already calculated for this match</div>}
                              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                                {teams.map(team=>{
                                  const key=`${match.id}_${team.id}`,cap=captains[key]||{},teamPlayers=players.filter(p=>assignments[p.id]===team.id);
                                  return(
                                    <div key={team.id} style={{background:"#080C14",borderRadius:8,padding:"12px 16px",borderLeft:"3px solid "+team.color}}>
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

                {/* Team Identity Management */}
                <div style={{background:"#080C14",borderRadius:10,padding:"14px 16px",marginBottom:12,border:"1px solid #1E2D45"}}>
                  <div style={{fontSize:11,color:"#F5A623",letterSpacing:2,fontWeight:700,marginBottom:10}}>🔑 TEAM IDs</div>
                  <div style={{fontSize:11,color:"#4A5E78",marginBottom:10}}>Share these codes with each team manager so they can claim their team</div>
                  {teams.map(t => {
                    const ti = teamIdentity[t.id] || {};
                    return (
                      <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,padding:"8px 12px",background:"#0E1521",borderRadius:8,border:"1px solid "+t.color+"33"}}>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:700,fontSize:13,color:t.color}}>{t.name}</div>
                          <div style={{fontSize:11,color:"#4A5E78",marginTop:2}}>{ti.claimedBy ? "Claimed by "+ti.claimedBy : "Unclaimed"}</div>
                        </div>
                        {ti.claimedBy ? (
                          <span style={{fontSize:11,color:"#2ECC71",fontWeight:700,background:"#2ECC7122",padding:"4px 10px",borderRadius:6}}>✓ CLAIMED</span>
                        ) : ti.teamId ? (
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:16,fontWeight:800,color:"#F5A623",letterSpacing:2,background:"#F5A62322",padding:"4px 10px",borderRadius:6}}>{ti.teamId}</div>
                            <button onClick={async()=>{
                              if(!confirm("Reset Team ID?")) return;
                              const updated = {...teamIdentity, [t.id]: {teamId: generateTeamId()}};
                              setTeamIdentity(updated);
                              await storeSet("teamIdentity", updated);
                            }} style={{background:"transparent",border:"1px solid #1E2D45",color:"#4A5E78",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:10,fontFamily:"Barlow Condensed,sans-serif"}}>↺</button>
                          </div>
                        ) : (
                          <button onClick={async()=>{
                            const newId = generateTeamId();
                            const updated = {...teamIdentity, [t.id]: {...ti, teamId: newId}};
                            setTeamIdentity(updated);
                            await storeSet("teamIdentity", updated);
                          }} style={{background:"#F5A62322",border:"1px solid #F5A62344",color:"#F5A623",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontFamily:"Barlow Condensed,sans-serif",fontWeight:700}}>GENERATE</button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {transfers.phase==="closed" && <Btn onClick={openReleaseWindow} sx={{fontSize:13}}>📤 OPEN RELEASE WINDOW</Btn>}
                  {transfers.phase==="release" && <Btn onClick={closeReleaseWindow} variant="blue" sx={{fontSize:13}}>🔒 CLOSE RELEASES & START PICKS</Btn>}
                  {transfers.phase==="pick" && <Btn onClick={skipCurrentTeam} variant="ghost" sx={{fontSize:13}}>⏭ SKIP CURRENT TEAM</Btn>}
                  {(transfers.phase==="done"||transfers.phase==="closed") && <Btn onClick={resetTransferWindow} variant="ghost" sx={{fontSize:13}}>🔁 RESET FOR NEXT WEEK</Btn>}
                  {(transfers.phase==="release"||transfers.phase==="pick") && <Btn onClick={()=>withPassword(()=>{if(!confirm("Cancel transfer window? All releases and picks this week will be discarded."))return;updTransfers({...transfers,phase:"closed",releases:{},picks:[],currentPickTeam:null,pickDeadline:null});alert("Transfer window cancelled.");})  } variant="ghost" sx={{fontSize:13,color:"#FF3D5A"}}>✕ CANCEL WINDOW</Btn>}
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
                        <div key={team.id} style={{background:"#0E1521",borderRadius:10,border:"1px solid "+team.color+"33",padding:14}}>
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
                      <div style={{background:team?.color+"22",border:"1px solid "+(team?.color||"#1E2D45")+"44",borderRadius:10,padding:14,marginBottom:12}}>
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
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:18,fontWeight:700,color:"#A855F7",letterSpacing:2}}>⚡ SNATCH POWER</div>
                  <div style={{fontSize:10,fontWeight:700,color:snatchWindowStatus.open?"#2ECC71":"#FF3D5A",background:snatchWindowStatus.open?"#2ECC7122":"#FF3D5A22",padding:"3px 8px",borderRadius:20,letterSpacing:1}}>{snatchWindowStatus.label}</div>
                </div>
                {!snatchWindowStatus.open && <div style={{fontSize:11,color:"#4A5E78",marginBottom:8}}>{snatchWindowStatus.countdown}</div>}
                <div style={{fontSize:12,color:"#4A5E78",marginBottom:14}}>Week {snatch.weekNum} • #1 team gets to snatch 1 player (Sat 12AM–12PM IST). Returns Friday 11:58 PM.</div>

                {snatch.active ? (
                  <div>
                    <div style={{background:"#A855F722",border:"1px solid #A855F744",borderRadius:8,padding:12,marginBottom:12}}>
                      <div style={{fontSize:11,color:"#A855F7",fontWeight:700,letterSpacing:1,marginBottom:6}}>ACTIVE SNATCH</div>
                      {(() => {
                        const p=players.find(x=>x.id===snatch.active.pid);
                        const byTeam=teams.find(t=>t.id===snatch.active.byTeamId);
                        const fromTeam=teams.find(t=>t.id===snatch.active.fromTeamId);
                        const returnDate = "Friday 11:58 PM";
                        return (
                          <div>
                            <div style={{fontSize:13,color:"#E2EAF4",marginBottom:4}}><strong>{p?.name}</strong> snatched by <span style={{color:byTeam?.color,fontWeight:700}}>{byTeam?.name}</span></div>
                            <div style={{fontSize:11,color:"#4A5E78"}}>From: <span style={{color:fromTeam?.color}}>{fromTeam?.name}</span> • {snatch.active.pointsAtSnatch} pts at snatch • Returns: {returnDate}</div>
                          </div>
                        );
                      })()}
                    </div>
                    {unlocked && <Btn onClick={returnSnatched} variant="ghost" sx={{fontSize:12}}>↩️ FORCE RETURN (ADMIN)</Btn>}
                  </div>
                ) : (
                  <div>
                    <div style={{fontSize:13,color:"#E2EAF4",marginBottom:10}}>
                      Snatch power this week: <span style={{color:leaderboard[0]?.color,fontWeight:700}}>{leaderboard[0]?.name||"—"}</span>
                    </div>
                    {snatchWindowStatus.open ? (
                      <div>
                        <div style={{fontSize:11,color:"#4A5E78",marginBottom:8}}>⚡ Window is open — {leaderboard[0]?.name} can snatch 1 player now. Safe players excluded.</div>
                        <div style={{maxHeight:220,overflowY:"auto",display:"flex",flexDirection:"column",gap:5}}>
                          {players.filter(p=>assignments[p.id]&&assignments[p.id]!==leaderboard[0]?.id&&!isPlayerSafe(p.id)).map(p=>{
                            const fromTeam=teams.find(t=>t.id===assignments[p.id]);
                            const isMyTeam = myTeam?.id === leaderboard[0]?.id;
                            return (
                              <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#141E2E",borderRadius:7}}>
                                <div style={{flex:1}}>
                                  <div style={{fontWeight:600,fontSize:13,color:"#E2EAF4"}}>{p.name}</div>
                                  <div style={{fontSize:11,color:fromTeam?.color}}>{fromTeam?.name}</div>
                                </div>
                                {isMyTeam ? (
                                  <button onClick={()=>initiateSnatch(p.id,assignments[p.id])}
                                    style={{background:"#A855F722",border:"1px solid #A855F744",color:"#A855F7",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:12}}>
                                    ⚡ SNATCH
                                  </button>
                                ) : (
                                  <div style={{fontSize:10,color:"#4A5E78"}}>Only {leaderboard[0]?.name} can snatch</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div style={{fontSize:12,color:"#4A5E78",padding:"12px",background:"#141E2E",borderRadius:8,textAlign:"center"}}>
                        Snatch window opens Saturday 12:00 AM IST
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {page==="results" && (
            <div className="fade-in">
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
                              <div key={tb.team.id} style={{background:"#080C14",borderRadius:10,border:"1px solid "+tb.team.color+"33",overflow:"hidden"}}>
                                {/* Team header */}
                                <div style={{padding:"10px 16px",borderBottom:"1px solid #1E2D4544",display:"flex",alignItems:"center",justifyContent:"space-between",background:tb.team.color+"11"}}>
                                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                                    <span style={{fontSize:20}}>{"#"+(rank+1)}</span>
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
                                          {p.mult>1 && <span style={{background:p.mult===2?"#F5A62322":"#94A3B822",color:p.mult===2?"#F5A623":"#94A3B8",border:"1px solid "+(p.mult===2?"#F5A62344":"#94A3B844"),fontSize:10,padding:"1px 7px",borderRadius:10,fontWeight:700}}>
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
          )}

          {page==="form" && (
            <div className="fade-in">
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
                <button onClick={()=>nav("leaderboard")} style={{background:"transparent",border:"none",color:"#4A5E78",fontSize:22,cursor:"pointer",lineHeight:1,padding:"0 4px"}}>←</button>
                <h2 style={{fontFamily:"Rajdhani",fontSize:28,color:"#F5A623",letterSpacing:2}}>PLAYER FORM</h2>
              </div>
              <FormChart players={players} assignments={assignments} points={points} teams={teams} />
            </div>
          )}

          {page==="h2h" && (
            <div className="fade-in">
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
                <button onClick={()=>nav("leaderboard")} style={{background:"transparent",border:"none",color:"#4A5E78",fontSize:22,cursor:"pointer",lineHeight:1,padding:"0 4px"}}>←</button>
                <h2 style={{fontFamily:"Rajdhani",fontSize:28,color:"#F5A623",letterSpacing:2}}>HEAD TO HEAD</h2>
              </div>
              <H2HStats teams={teams} matches={matches} points={points} assignments={assignments} players={players} />
            </div>
          )}

          {page==="leaderboard"&&(
            <div className="fade-in">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:8}}>
                <h2 style={{fontFamily:"Rajdhani",fontSize:28,color:"#F5A623",letterSpacing:2}}>LEADERBOARD</h2>
                <button onClick={shareLeaderboard} style={{background:"#25D36622",border:"1px solid #25D36644",color:"#25D366",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:13}}>
                  📲 SHARE WHATSAPP
                </button>
              </div>
              {leaderboard.length===0?(
                <Card sx={{padding:60,textAlign:"center"}}><div style={{fontSize:56}}>🏆</div><div style={{color:"#4A5E78",marginTop:16}}>Set up your league first</div></Card>
              ):(
                <>
                  <div style={{marginBottom:32}}>
                    {leaderboard.map((team,i)=>{
                      const medals=["🥇","🥈","🥉"],mc=["#F5A623","#94A3B8","#CD7C2F"];
                      return(
                        <div key={team.id} style={{display:"flex",alignItems:"center",gap:16,background:"#0E1521",borderRadius:10,padding:"16px 20px",marginBottom:8,borderLeft:"4px solid "+team.color}}>
                          <div style={{fontSize:28,minWidth:36}}>{medals[i]||("#"+(i+1))}</div>
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
                              <div key={p.id} style={{display:"flex",alignItems:"center",padding:"9px 4px",borderBottom:"1px solid #1E2D45",opacity:p.status==="snatched-out"||p.status==="snatch-returned-in"?0.6:1}}>
                                <div style={{flex:1,fontWeight:idx<3?700:400,fontSize:14,color:idx===0&&p.status==="active"?"#F5A623":"#E2EAF4",textDecoration:p.status==="snatched-out"||p.status==="snatch-returned-in"?"line-through":"none"}}>
                                  {p.name}
                                  {p.status==="snatched-out"&&<span style={{fontSize:9,color:"#A855F7",marginLeft:6,textDecoration:"none",fontWeight:700}}> SNATCHED</span>}
                                  {p.status==="snatched-in"&&<span style={{fontSize:9,color:"#2ECC71",marginLeft:6,textDecoration:"none",fontWeight:700}}> ON LOAN</span>}
                                  {p.status==="snatch-returned-in"&&<span style={{fontSize:9,color:"#4A5E78",marginLeft:6,textDecoration:"none"}}> RETURNED</span>}
                                  {p.status==="released"&&<span style={{fontSize:9,color:"#4A5E78",marginLeft:6,textDecoration:"none"}}> RELEASED</span>}
                                </div>
                                <div style={{width:90}}><Badge label={p.role||"—"} color={ROLE_COLORS[p.role]||"#4A5E78"} /></div>
                                <div style={{width:70,textAlign:"right",fontWeight:700,color:p.status==="snatched-out"||p.status==="snatch-returned-in"?"#4A5E78":p.total>0?"#E2EAF4":"#4A5E78",fontFamily:"Rajdhani",fontSize:17}}>{p.total}</div>
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

        {/* LEAGUE RULES PANEL */}
        {showRulesPanel && (
          <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.97)",zIndex:200,overflowY:"auto",padding:24,fontFamily:"Barlow Condensed,sans-serif"}}>
            <div style={{maxWidth:500,margin:"0 auto"}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
                <button onClick={()=>setShowRulesPanel(false)} style={{background:"transparent",border:"none",color:"#4A5E78",fontSize:22,cursor:"pointer",padding:"0 4px"}}>←</button>
                <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:26,fontWeight:700,color:"#F5A623",letterSpacing:2}}>POINTS & RULES</div>
              </div>

              {/* Points System */}
              <div style={{background:"#0E1521",borderRadius:12,border:"1px solid #1E2D45",padding:20,marginBottom:16}}>
                <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,fontWeight:700,marginBottom:12}}>🏏 POINTS SYSTEM</div>
                {[
                  ["Run",pointsConfig.run,"pt"],["Four",pointsConfig.four,"pts"],["Six",pointsConfig.six,"pts"],
                  ["Half-century (50+)",pointsConfig.fifty,"pts"],["Century (100+)",pointsConfig.century,"pts"],
                  ["Wicket",pointsConfig.wicket,"pts"],["4-wkt haul",pointsConfig.fourWkt,"pts"],["5-wkt haul",pointsConfig.fiveWkt,"pts"],
                  ["Economy bonus (<"+pointsConfig.ecoThreshold+")",pointsConfig.ecoBonus,"pts"],
                  ["Catch",pointsConfig.catch,"pts"],["Stumping",pointsConfig.stumping,"pts"],["Run-out",pointsConfig.runout,"pts"],
                  ["All-round bonus",pointsConfig.allRoundBonus,"pts ("+pointsConfig.allRoundMinRuns+"+ runs & "+pointsConfig.allRoundMinWkts+"+ wkts)"],
                  ["Longest six",pointsConfig.longestSix,"pts"],["Captain multiplier",pointsConfig.captainMult,"×"],["VC multiplier",pointsConfig.vcMult,"×"],
                ].map(([label,val,unit])=>(
                  <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid #1E2D4533"}}>
                    <div style={{fontSize:12,color:"#4A5E78"}}>{label}</div>
                    <div style={{fontSize:13,color:"#F5A623",fontWeight:700,fontFamily:"Rajdhani,sans-serif"}}>{val} <span style={{color:"#4A5E78",fontWeight:400,fontSize:11}}>{unit}</span></div>
                  </div>
                ))}
                {(!tournamentStarted || !eligibleVoters.length) && unlocked && (
                  <button onClick={()=>setShowRulesPanel("points")} style={{width:"100%",marginTop:12,background:"#F5A62322",border:"1px solid #F5A62344",borderRadius:8,padding:8,color:"#F5A623",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}>✏️ EDIT POINTS (FREE — Tournament not started)</button>
                )}
                {tournamentStarted && !!eligibleVoters.length && unlocked && (!ruleProposal || ruleProposal.status !== "pending") && (
                  <button onClick={()=>setShowRulesPanel("points")} style={{width:"100%",marginTop:12,background:"#F5A62322",border:"1px solid #F5A62344",borderRadius:8,padding:8,color:"#F5A623",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}>✏️ PROPOSE POINTS CHANGE (Needs all-team vote)</button>
                )}
              </div>

              {/* Current Rules */}
              <div style={{background:"#0E1521",borderRadius:12,border:"1px solid #1E2D45",padding:20,marginBottom:16}}>
                <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,fontWeight:700,marginBottom:12}}>CURRENT RULES</div>
                {[
                  ["Transfer Window", "Sunday → Monday 11:00 AM IST"],
                  ["Snatch Window", "Saturday 12:00 AM → 12:00 PM IST"],
                  ["Snatch Return", "Friday 11:58 PM IST"],
                ].map(([label, val]) => (
                  <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #1E2D4533"}}>
                    <div style={{fontSize:13,color:"#4A5E78"}}>{label}</div>
                    <div style={{fontSize:13,color:"#E2EAF4",fontWeight:700}}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Pending proposal */}
              {ruleProposal && ruleProposal.status === "pending" && (
                <div style={{background:"#F5A62311",borderRadius:12,border:"1px solid #F5A62344",padding:20,marginBottom:16}}>
                  <div style={{fontSize:11,color:"#F5A623",letterSpacing:2,fontWeight:700,marginBottom:4}}>⏳ PENDING PROPOSAL</div>
                  <div style={{fontSize:11,color:"#4A5E78",marginBottom:12}}>Proposed by {teams.find(t=>t.id===ruleProposal.proposedBy)?.name || "Admin"} • {new Date(ruleProposal.proposedAt).toLocaleDateString()}</div>
                  {Object.entries(ruleProposal.changes).map(([key, val]) => (
                    <div key={key} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #1E2D4533"}}>
                      <div style={{fontSize:12,color:"#4A5E78"}}>{key}</div>
                      <div style={{fontSize:12,color:"#F5A623",fontWeight:700}}>{val}</div>
                    </div>
                  ))}
                  <div style={{marginTop:12}}>
                    <div style={{fontSize:11,color:"#4A5E78",marginBottom:8}}>VOTES ({Object.keys(ruleProposal.votes).length}/{eligibleVoters.length}):</div>
                    {eligibleVoters.map(t => (
                      <div key={t.id} style={{display:"flex",justifyContent:"space-between",padding:"4px 0"}}>
                        <div style={{fontSize:12,color:t.color}}>{t.name}</div>
                        <div style={{fontSize:12,fontWeight:700,color:ruleProposal.votes[t.id]==="approved"?"#2ECC71":ruleProposal.votes[t.id]==="rejected"?"#FF3D5A":"#4A5E78"}}>{ruleProposal.votes[t.id]||"Pending"}</div>
                      </div>
                    ))}
                  </div>
                  {/* Vote section for current user */}
                  {myTeam && eligibleVoters.some(t=>t.id===myTeam.id) && !ruleProposal.votes[myTeam.id] && (
                    <div style={{marginTop:16,paddingTop:16,borderTop:"1px solid #1E2D45"}}>
                      <div style={{fontSize:12,color:"#E2EAF4",marginBottom:8}}>Cast your vote as <span style={{color:myTeam.color,fontWeight:700}}>{myTeam.name}</span></div>
                      <input type="password" value={votePin} onChange={e=>{setVotePin(e.target.value);setVotePinErr('');}} placeholder="Enter your team PIN" maxLength={6}
                        style={{width:"100%",background:"#080C14",border:"1px solid "+(votePinErr?"#FF3D5A":"#1E2D45"),borderRadius:8,padding:"10px 14px",color:"#E2EAF4",fontSize:18,letterSpacing:4,textAlign:"center",fontFamily:"Rajdhani,sans-serif",outline:"none",marginBottom:votePinErr?6:12,boxSizing:"border-box"}} />
                      {votePinErr && <div style={{color:"#FF3D5A",fontSize:12,marginBottom:10,textAlign:"center"}}>{votePinErr}</div>}
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>voteOnProposal(false)} style={{flex:1,background:"#FF3D5A22",border:"1px solid #FF3D5A44",borderRadius:8,padding:10,color:"#FF3D5A",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>✕ REJECT</button>
                        <button onClick={()=>voteOnProposal(true)} style={{flex:1,background:"#2ECC7122",border:"1px solid #2ECC7144",borderRadius:8,padding:10,color:"#2ECC71",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>✓ APPROVE</button>
                      </div>
                    </div>
                  )}
                  {/* Admin cancel proposal */}
                  {unlocked && (
                    <button onClick={()=>updRuleProposal(null)} style={{width:"100%",marginTop:10,background:"transparent",border:"1px solid #1E2D45",borderRadius:8,padding:8,color:"#4A5E78",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:12,cursor:"pointer"}}>CANCEL PROPOSAL (ADMIN)</button>
                  )}
                </div>
              )}

              {/* Last approved/rejected */}
              {ruleProposal && ruleProposal.status !== "pending" && (
                <div style={{background:"#0E1521",borderRadius:12,border:"1px solid #1E2D45",padding:16,marginBottom:16}}>
                  <div style={{fontSize:11,color:ruleProposal.status==="approved"?"#2ECC71":"#FF3D5A",letterSpacing:2,fontWeight:700}}>
                    {ruleProposal.status==="approved"?"✓ LAST PROPOSAL APPROVED":"✕ LAST PROPOSAL REJECTED"}
                  </div>
                </div>
              )}

              {/* Edit points form */}
              {showRulesPanel === "points" && unlocked && (
                <EditPointsForm config={pointsConfig} onSave={async(cfg)=>{
                  if(!tournamentStarted || !eligibleVoters.length) {
                    await savePointsConfig(cfg);
                    setShowRulesPanel(true);
                    alert("Points system updated!");
                  } else {
                    await proposeRuleChange({"Points Change": JSON.stringify(cfg)});
                    setShowRulesPanel(true);
                  }
                }} onCancel={()=>setShowRulesPanel(true)} />
              )}

              {/* Propose new timing change — admin only */}
              {showRulesPanel === true && unlocked && (!ruleProposal || ruleProposal.status !== "pending") && (
                <ProposeRulesForm teams={teams} eligibleVoters={eligibleVoters} tournamentStarted={tournamentStarted} onPropose={proposeRuleChange} />
              )}
            </div>
          </div>
        )}

        {/* SNATCH PIN MODAL */}
        {snatchPinModal && (
          <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.96)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:24}}>
            <div style={{background:"#141E2E",borderRadius:16,border:"1px solid #A855F744",padding:32,width:"100%",maxWidth:340}}>
              <div style={{fontSize:32,textAlign:"center",marginBottom:8}}>⚡</div>
              <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:22,fontWeight:700,color:"#A855F7",textAlign:"center",letterSpacing:2,marginBottom:4}}>CONFIRM SNATCH</div>
              <div style={{fontSize:13,color:"#FF3D5A",textAlign:"center",marginBottom:4,fontWeight:700}}>This action cannot be undone!</div>
              <div style={{fontSize:12,color:"#4A5E78",textAlign:"center",marginBottom:16}}>Player returns Friday 11:58 PM. Enter your team PIN to confirm.</div>
              <div style={{background:"#080C14",borderRadius:8,padding:"10px 14px",marginBottom:16,textAlign:"center"}}>
                <div style={{fontWeight:700,fontSize:15,color:"#E2EAF4"}}>{players.find(x=>x.id===snatchPinModal.pid)?.name}</div>
                <div style={{fontSize:12,color:teams.find(t=>t.id===snatchPinModal.fromTeamId)?.color,marginTop:2}}>from {teams.find(t=>t.id===snatchPinModal.fromTeamId)?.name}</div>
              </div>
              <input type="password" value={snatchPin} onChange={e=>{setSnatchPin(e.target.value);setSnatchPinErr('');}}
                onKeyDown={e=>e.key==="Enter"&&confirmSnatch()}
                placeholder="Your team PIN" autoFocus maxLength={6}
                style={{width:"100%",background:"#080C14",border:"1px solid "+(snatchPinErr?"#FF3D5A":"#A855F744"),borderRadius:8,padding:"12px 16px",color:"#E2EAF4",fontSize:20,letterSpacing:6,textAlign:"center",fontFamily:"Rajdhani,sans-serif",outline:"none",marginBottom:snatchPinErr?8:16,boxSizing:"border-box"}} />
              {snatchPinErr && <div style={{color:"#FF3D5A",fontSize:13,marginBottom:16,textAlign:"center"}}>{snatchPinErr}</div>}
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>{setSnatchPinModal(null);setSnatchPin('');setSnatchPinErr('');}}
                  style={{flex:1,background:"transparent",border:"1px solid #1E2D45",borderRadius:8,padding:12,color:"#4A5E78",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
                <button onClick={confirmSnatch}
                  style={{flex:2,background:"linear-gradient(135deg,#A855F7,#7C3AED)",border:"none",borderRadius:8,padding:12,color:"#fff",fontFamily:"Barlow Condensed,sans-serif",fontWeight:800,fontSize:15,cursor:"pointer"}}>CONFIRM SNATCH</button>
              </div>
            </div>
          </div>
        )}

        {drawerOpen && (
          <div onClick={()=>setDrawerOpen(false)} style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.6)",display:"flex"}}>
            <div onClick={e=>e.stopPropagation()} style={{width:260,background:"#0E1521",borderRight:"1px solid #1E2D45",display:"flex",flexDirection:"column",height:"100%"}}>
              <div style={{padding:"20px 16px",borderBottom:"1px solid #1E2D45",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:16,color:"#F5A623",letterSpacing:2}}>MENU</div>
                <button onClick={()=>setDrawerOpen(false)} style={{background:"transparent",border:"none",color:"#4A5E78",fontSize:20,cursor:"pointer",lineHeight:1}}>×</button>
              </div>
              <div style={{flex:1,padding:"12px 8px",overflowY:"auto"}}>
                <button onClick={()=>{nav("form");setDrawerOpen(false);}} style={{width:"100%",background:page==="form"?"#F5A62322":"transparent",border:"1px solid "+(page==="form"?"#F5A62344":"transparent"),borderRadius:10,padding:"12px 14px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:12,marginBottom:4}}>
                  <span style={{fontSize:22}}>📈</span>
                  <div>
                    <div style={{fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,color:page==="form"?"#F5A623":"#E2EAF4"}}>Player Form Chart</div>
                    <div style={{fontSize:11,color:"#4A5E78",marginTop:1}}>Last 5 matches per player</div>
                  </div>
                </button>
                <button onClick={()=>{nav("h2h");setDrawerOpen(false);}} style={{width:"100%",background:page==="h2h"?"#4F8EF722":"transparent",border:"1px solid "+(page==="h2h"?"#4F8EF744":"transparent"),borderRadius:10,padding:"12px 14px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:12,marginBottom:4}}>
                  <span style={{fontSize:22}}>⚔️</span>
                  <div>
                    <div style={{fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,color:page==="h2h"?"#4F8EF7":"#E2EAF4"}}>Head to Head</div>
                    <div style={{fontSize:11,color:"#4A5E78",marginTop:1}}>Compare two teams across matches</div>
                  </div>
                </button>

                {/* Team IDs - admin only */}
                {unlocked && (
                  <div style={{marginTop:8,paddingTop:8,borderTop:"1px solid #1E2D45"}}>
                    <div style={{fontSize:10,color:"#F5A623",letterSpacing:2,fontWeight:700,padding:"4px 6px 8px"}}>🔑 TEAM IDs (ADMIN)</div>
                    {teams.map(t => {
                      const ti = teamIdentity[t.id] || {};
                      return (
                        <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,padding:"8px 10px",background:"#080C14",borderRadius:8,border:"1px solid "+t.color+"33"}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:700,fontSize:12,color:t.color}}>{t.name}</div>
                            <div style={{fontSize:10,color:"#4A5E78",marginTop:1}}>{ti.claimedBy ? ti.claimedBy.split("@")[0] : "Unclaimed"}</div>
                          </div>
                          {ti.claimedBy ? (
                            <span style={{fontSize:10,color:"#2ECC71",fontWeight:700}}>✓ CLAIMED</span>
                          ) : ti.teamId ? (
                            <div style={{display:"flex",alignItems:"center",gap:4}}>
                              <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:14,fontWeight:800,color:"#F5A623",letterSpacing:2,background:"#F5A62322",padding:"3px 8px",borderRadius:6}}>{ti.teamId}</div>
                              <button onClick={async()=>{
                                if(!confirm("Reset this Team ID?")) return;
                                const newId = generateTeamId();
                                const updated = {...teamIdentity, [t.id]: {teamId: newId}};
                                setTeamIdentity(updated);
                                await storeSet("teamIdentity", updated);
                              }} style={{background:"transparent",border:"1px solid #1E2D45",color:"#4A5E78",borderRadius:4,padding:"2px 5px",cursor:"pointer",fontSize:10}}>↺</button>
                            </div>
                          ) : (
                            <button onClick={async()=>{
                              const newId = generateTeamId();
                              const updated = {...teamIdentity, [t.id]: {...ti, teamId: newId}};
                              setTeamIdentity(updated);
                              await storeSet("teamIdentity", updated);
                            }} style={{background:"#F5A62322",border:"1px solid #F5A62344",color:"#F5A623",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,fontFamily:"Barlow Condensed,sans-serif",fontWeight:700}}>GENERATE</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pending vote notification */}
              {pendingVote && (
                <div style={{margin:"0 8px 8px",background:"#FF3D5A11",border:"1px solid #FF3D5A33",borderRadius:10,padding:"12px 14px"}}>
                  <div style={{fontSize:11,color:"#FF3D5A",fontWeight:700,letterSpacing:1,marginBottom:4}}>⚡ VOTE NEEDED</div>
                  <div style={{fontSize:11,color:"#E2EAF4",marginBottom:8}}>A rule change has been proposed and needs your vote.</div>
                  <button onClick={()=>{setShowRulesPanel(true);setDrawerOpen(false);}} style={{width:"100%",background:"#FF3D5A22",border:"1px solid #FF3D5A",borderRadius:6,padding:"7px",color:"#FF3D5A",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:12,cursor:"pointer"}}>VIEW & VOTE →</button>
                </div>
              )}

              {/* Points & Rules button */}
              <button onClick={()=>{setShowRulesPanel(true);setDrawerOpen(false);}} style={{width:"100%",background:"transparent",border:"none",padding:"10px 14px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:20}}>📋</span>
                <div style={{flex:1}}>
                  <div style={{fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,color:"#E2EAF4"}}>Points & Rules</div>
                  <div style={{fontSize:11,color:"#4A5E78"}}>Points system & league timing</div>
                </div>
                {pendingVote && <span style={{width:8,height:8,background:"#FF3D5A",borderRadius:"50%",flexShrink:0}} />}
              </button>

              <div style={{padding:"16px",borderTop:"1px solid #1E2D45"}}>
                <button onClick={onLogout} style={{width:"100%",background:"#FF3D5A11",border:"1px solid #FF3D5A33",borderRadius:8,padding:"10px",color:"#FF3D5A",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>LOGOUT</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Root() {
  const [currentUser, setCurrentUser] = useState(() => {
    try { const s = localStorage.getItem('tb_user'); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [currentPitch, setCurrentPitch] = useState(() => {
    try {
      const s = localStorage.getItem('tb_pitch');
      const p = s ? JSON.parse(s) : null;
      if (p) _pitchId = p.id;
      return p;
    } catch { return null; }
  });
  const [myTeam, setMyTeam] = useState(() => {
    try { const s = localStorage.getItem('tb_myteam'); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [myPinHash, setMyPinHash] = useState(() => {
    try { return localStorage.getItem('tb_pinHash') || null; } catch { return null; }
  });
  const [teamsClaimed, setTeamsClaimed] = useState(() => {
    try { return !!localStorage.getItem('tb_myteam'); } catch { return false; }
  });

  const handleLogin = (user) => {
    setCurrentUser(user);
    try { localStorage.setItem('tb_user', JSON.stringify(user)); } catch {}
  };
  const handleLogout = () => {
    setCurrentUser(null); setCurrentPitch(null); setMyTeam(null); setMyPinHash(null); setTeamsClaimed(false);
    try { ['tb_user','tb_pitch','tb_myteam','tb_pinHash'].forEach(k=>localStorage.removeItem(k)); } catch {}
  };
  const handleEnter = (pitch) => {
    _pitchId = pitch.id;
    setCurrentPitch(pitch);
    // Reset team claim when entering a new pitch
    const savedTeam = localStorage.getItem('tb_myteam');
    const skipped = localStorage.getItem('tb_skipped');
    if (!savedTeam && !skipped) { setMyTeam(null); setMyPinHash(null); setTeamsClaimed(false); }
    try { localStorage.setItem('tb_pitch', JSON.stringify(pitch)); } catch {}
  };
  const handleLeave = () => {
    setCurrentPitch(null);
    try { localStorage.removeItem('tb_pitch'); } catch {}
  };
  const handleClaimed = (team, pinHash) => {
    setMyTeam(team); setMyPinHash(pinHash); setTeamsClaimed(true);
    try { localStorage.setItem('tb_myteam', JSON.stringify(team)); if(pinHash) localStorage.setItem('tb_pinHash', pinHash); } catch {}
  };
  try {
    if (!currentUser) return <SplashScreen onLogin={handleLogin} />;
    if (!currentPitch) return <PitchHome onEnter={handleEnter} user={currentUser} onLogout={handleLogout} />;
    if (!teamsClaimed) return <TeamClaimScreen pitch={currentPitch} user={currentUser} teams={[]} onClaimed={handleClaimed} onBack={handleLeave} />;
    return <App pitch={currentPitch} onLeave={handleLeave} user={currentUser} onLogout={handleLogout} myTeam={myTeam} myPinHash={myPinHash} />;
  } catch(e) {
    return <div style={{minHeight:"100vh",background:"#080C14",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16,padding:24,fontFamily:"Barlow Condensed,sans-serif"}}>
      <div style={{fontSize:48}}>⚠️</div>
      <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:22,color:"#FF3D5A",fontWeight:700}}>Something went wrong</div>
      <div style={{color:"#4A5E78",fontSize:13,textAlign:"center"}}>{e.message}</div>
      <button onClick={()=>{localStorage.clear();window.location.reload();}} style={{background:"#F5A623",border:"none",borderRadius:8,padding:"10px 20px",color:"#080C14",fontWeight:700,fontFamily:"Barlow Condensed,sans-serif",fontSize:14,cursor:"pointer",marginTop:8}}>CLEAR & RELOAD</button>
    </div>;
  }
}

export default Root;
