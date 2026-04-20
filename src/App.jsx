import React, { useState, useEffect } from "react";
import FormChart from "./FormChart";
import H2HStats from "./H2HStats";
import MVPStats from "./MVPStats";
import TransferWindowComponent from "./TransferWindow";
import SnatchSection from "./SnatchSection";
import FetchPlayers from "./FetchPlayers";
import WeeklyReport from "./WeeklyReport";
import AllTimeXI from "./AllTimeXI";
import HomeHub from "./HomeHub";
import RulesSheet from "./RulesSheet";
import { T, fonts, GlobalStyles } from "./Theme";

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
    if (!stats[pid]) stats[pid] = { playerId: pid, name, runs:0, balls:0, fours:0, sixes:0, wickets:0, economy:null, overs:0, maidens:0, catches:0, stumpings:0, runouts:0, longestSix:false, mom:false, playingXI:false, dismissed:false };
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
  longestSix:50, captainMult:2, vcMult:1.5,
  // New parameters (default 0 = disabled)
  maiden:0,
  srBonus:0, srBonusThreshold:150, srBonusMinBalls:10,
  momBonus:0,
  playingXIBonus:0,
  duckPenalty:0,
  srPenalty:0, srPenaltyThreshold:60, srPenaltyMinBalls:10,
  ecoPenalty:0, ecoPenaltyThreshold:10,
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

  // ── NEW PARAMETERS ────────────────────────────────────────────────────────
  // Maiden overs
  const maidens = +s.maidens || 0;
  if (c.maiden) p += maidens * c.maiden;

  // Strike rate bonus/penalty (need balls faced)
  const balls = +s.balls || 0;
  if (balls >= (c.srBonusMinBalls||10) && runs > 0) {
    const sr = (runs / balls) * 100;
    if (c.srBonus && sr >= (c.srBonusThreshold||150)) p += c.srBonus;
    if (c.srPenalty && sr < (c.srPenaltyThreshold||60) && s.dismissed) p -= c.srPenalty;
  }

  // Man of the Match
  if (s.mom && c.momBonus) p += c.momBonus;

  // Playing XI bonus
  if (s.playingXI && c.playingXIBonus) p += c.playingXIBonus;

  // Duck (0 runs + dismissed)
  if (c.duckPenalty && runs === 0 && s.dismissed) p -= c.duckPenalty;

  // Economy penalty
  if (c.ecoPenalty && ovs >= c.ecoMinOvers && eco !== null && eco > (c.ecoPenaltyThreshold||10)) p -= c.ecoPenalty;

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
    const res = await fetch(SUPABASE_URL + "/rest/v1/league_data?key=eq." + encodeURIComponent(rawKey) + "&select=key,value", {
      headers: SB_HEADERS,
    });
    const data = await res.json();
    const val = data?.[0]?.value ?? null;
    localCache[rawKey] = val;
    return val;
  } catch { return null; }
}

// Batch fetch — single HTTP request for multiple keys
async function sbGetMany(rawKeys) {
  // Check cache first — only fetch uncached keys
  const uncached = rawKeys.filter(k => localCache[k] === undefined);
  if (uncached.length > 0) {
    try {
      const inClause = uncached.map(k => `"${k}"`).join(",");
      const res = await fetch(
        SUPABASE_URL + "/rest/v1/league_data?key=in.(" + encodeURIComponent(inClause) + ")&select=key,value",
        { headers: SB_HEADERS }
      );
      const rows = await res.json();
      // Cache all returned rows
      if (Array.isArray(rows)) {
        rows.forEach(row => { localCache[row.key] = row.value; });
      }
      // Cache nulls for keys not returned
      uncached.forEach(k => { if (localCache[k] === undefined) localCache[k] = null; });
    } catch {
      uncached.forEach(k => { if (localCache[k] === undefined) localCache[k] = null; });
    }
  }
  return rawKeys.map(k => localCache[k] ?? null);
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
  // IST offset in ms
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const istMs = now.getTime() + now.getTimezoneOffset() * 60000 + IST_OFFSET;
  const ist = new Date(istMs);
  const day = ist.getUTCDay(); // 0=Sun,6=Sat in UTC mode on IST-adjusted date
  const hour = ist.getUTCHours();
  const min = ist.getUTCMinutes();
  const totalMins = hour * 60 + min;

  // Open: Saturday (day=6), 0:00–11:59 IST
  if (day === 6 && totalMins < 720) {
    const minsLeft = 720 - totalMins;
    const h = Math.floor(minsLeft / 60);
    const m = minsLeft % 60;
    return { open: true, label: "WINDOW OPEN", timeLeft: h + "h " + m + "m left" };
  }

  // Find next Saturday midnight IST in ms
  let daysUntilSat = (6 - day + 7) % 7;
  if (daysUntilSat === 0) daysUntilSat = 7; // today is Sat but window closed — next week

  // Next Saturday midnight IST = today midnight IST + daysUntilSat days
  const todayMidnightIst = istMs - totalMins * 60000;
  const nextSatMidnightMs = todayMidnightIst + daysUntilSat * 24 * 60 * 60 * 1000;
  const diffMs = Math.max(0, nextSatMidnightMs - istMs);
  const diffMins = Math.floor(diffMs / 60000);

  const daysLeft = Math.floor(diffMins / 1440);
  const hoursLeft = Math.floor((diffMins % 1440) / 60);
  const minsLeft = diffMins % 60;

  let countdown = "";
  if (daysLeft > 0) countdown = daysLeft + "d " + hoursLeft + "h";
  else if (hoursLeft > 0) countdown = hoursLeft + "h " + minsLeft + "m";
  else if (minsLeft > 0) countdown = minsLeft + "m";
  else countdown = "opening soon";

  return { open: false, label: "WINDOW CLOSED", countdown: "Opens Sat 12:00 AM IST · " + countdown + " away" };
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

  const inp = {width:"100%",background:T.bg,border:`1px solid ${err?"#FF3D5A":"#1E2D45"}`,borderRadius:8,padding:"12px 16px",color:T.text,fontSize:16,fontFamily:fonts.body,outline:"none",marginBottom:err?8:20,boxSizing:"border-box"};
  const cancelBtn = {flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:11,color:T.muted,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"};
  const primaryBtn = (col="#F5A623") => ({flex:2,background:`linear-gradient(135deg,${col},${col}bb)`,border:"none",borderRadius:8,padding:11,color:T.bg,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"});

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
      <div style={{background:T.card,borderRadius:16,border:`1px solid ${T.border}`,padding:32,width:"100%",maxWidth:360,margin:"0 16px"}}>

        {mode==="login" && <>
          <div style={{fontSize:36,textAlign:"center",marginBottom:8}}>🔐</div>
          <div style={{fontFamily:fonts.display,fontSize:22,fontWeight:700,color:T.accent,textAlign:"center",letterSpacing:2,marginBottom:4}}>
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
              <button onClick={async()=>{const p=prompt("Enter NEW password:");if(!p)return;onSuccess(await hashPw(p),true);}} style={{background:"none",border:"none",color:T.muted,fontSize:12,cursor:"pointer",textDecoration:"underline"}}>Change password</button>
              <button onClick={()=>{reset();setMode("forgot");}} style={{background:"none",border:"none",color:T.danger,fontSize:12,cursor:"pointer",textDecoration:"underline"}}>Forgot password?</button>
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

const PALETTE = ["#FF3D5A","#4F8EF7","#2ECC71","#F5A623","#A855F7","#06B6D4","#FF6B35","#EC4899","#84CC16","#64748B"];
const ROLE_COLORS = { Batsman:"#4F8EF7", Bowler:"#FF3D5A", "All-Rounder":"#2ECC71", "Wicket-Keeper":"#F5A623" };
const ROLES = ["All","Batsman","Bowler","All-Rounder","Wicket-Keeper"];
const IPL_TEAMS = ["CSK","MI","RCB","KKR","SRH","RR","PBKS","DC","GT","LSG"];

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&family=Barlow+Condensed:wght@400;600;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  :root{--bg:#0C0C0F;--surface:#111118;--card:#111118;--border:#222230;--gold:#C9A84C;--text:#E8E0CC;--muted:#3A3A52;--accent:#4F8EF7;}
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

function Spinner() { return <div style={{width:24,height:24,border:`3px solid ${T.border}`,borderTop:`3px solid ${T.accent}`,borderRadius:"50%",animation:"spin 0.8s linear infinite",display:"inline-block"}} />; }
function Badge({ label, color="#4F8EF7" }) { return <span style={{background:color+"22",color,border:"1px solid "+color+"44",padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:600}}>{label}</span>; }
function Btn({ children, onClick, variant="primary", disabled, style:sx={} }) {
  const base={fontFamily:fonts.body,fontWeight:700,fontSize:15,letterSpacing:1,textTransform:"uppercase",border:"none",borderRadius:8,padding:"10px 22px",cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.5:1,...sx};
  const v={primary:{background:`linear-gradient(135deg,${T.accent},${T.accentDim})`,color:T.bg},blue:{background:"linear-gradient(135deg,#4F8EF7,#1a5fb4)",color:"#fff"},ghost:{background:"transparent",color:T.muted,border:`1px solid ${T.border}`},danger:{background:T.dangerBg,color:T.danger,border:`1px solid ${T.danger}44`}};
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
      <div style={{background:T.card,borderRadius:16,border:`1px solid ${T.border}`,padding:32,width:"100%",maxWidth:400,margin:"0 16px"}}>
        <div style={{fontFamily:fonts.display,fontSize:22,fontWeight:700,color:T.accent,letterSpacing:2,marginBottom:24}}>{isNew ? "✚ ADD PLAYER" : "✏️ EDIT PLAYER"}</div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:T.muted,letterSpacing:1,marginBottom:6}}>PLAYER NAME</div>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Full Name" style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",color:T.text,fontSize:15,fontFamily:fonts.body,outline:"none",boxSizing:"border-box"}} />
        </div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:T.muted,letterSpacing:1,marginBottom:6}}>IPL FRANCHISE</div>
          <select value={iplTeam} onChange={e=>setIplTeam(e.target.value)} style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",color:T.text,fontSize:15,fontFamily:fonts.body,outline:"none"}}>
            <option value="">— Select Franchise —</option>
            {IPL_FRANCHISE.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{marginBottom:24}}>
          <div style={{fontSize:11,color:T.muted,letterSpacing:1,marginBottom:6}}>ROLE</div>
          <select value={role} onChange={e=>setRole(e.target.value)} style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",color:T.text,fontSize:15,fontFamily:fonts.body,outline:"none"}}>
            {["Batsman","Bowler","All-Rounder","Wicket-Keeper"].map(r=><option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:11,color:T.muted,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
          <button onClick={submit} style={{flex:2,background:`linear-gradient(135deg,${T.accent},${T.accentDim})`,border:"none",borderRadius:8,padding:11,color:T.bg,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>{isNew ? "ADD PLAYER" : "SAVE CHANGES"}</button>
        </div>
      </div>
    </div>
  );
}



// ── SMART STATS MODAL (Cricbuzz auto-fill + manual edit) ────────────────────
function SmartStatsModal({ match, players, assignments, existingStats, onSave, onClose, pointsConfig }) {
  const matchPlayers = players.filter(p => assignments[p.id]);
  const emptyStats = (p) => ({ runs:0, balls:0, fours:0, sixes:0, wickets:0, economy:"", overs:0, maidens:0, catches:0, stumpings:0, runouts:0, longestSix:false, mom:false, playingXI:false, dismissed:false, played:false });

  const [stats, setStats] = React.useState(() => {
    const s = {};
    matchPlayers.forEach(p => {
      const existing = existingStats?.[p.id];
      s[p.id] = existing ? { ...existing, played:true } : emptyStats(p);
    });
    return s;
  });


  const fetchFromCricketData = async () => {
    if (!match.cricbuzzId) { setFetchStatus("❌ No match ID available"); return; }
    setFetching(true);
    setFetchStatus("Fetching from CricketData…");
    try {
      // CricketData: /cricket-match-scoreboard?matchid=ID (correct endpoint)
      const res = await fetch("/api/cricketdata?path=cricket-match-scoreboard&matchid=" + match.cricbuzzId);
      const data = await res.json();
      if (data?.message?.includes("not exist") || data?.error) {
        setFetchStatus("❌ CricketData: " + (data.message || data.error || "scorecard not found"));
        setFetching(false); return;
      }


      // CricketData scorecard structure
      // CricketData structure: response.firstInnings & response.secondInnings
      const innings = [data?.response?.firstInnings, data?.response?.secondInnings].filter(Boolean);

      const nameToPlayer = {};
      matchPlayers.forEach(p => {
        nameToPlayer[p.name.toLowerCase().trim()] = p;
        p.name.toLowerCase().split(" ").forEach(part => { if(part.length>2) nameToPlayer[part.trim()] = p; });
      });
      const findPlayer = (name) => {
        if (!name) return null;
        const n = name.toLowerCase().trim();
        if (nameToPlayer[n]) return nameToPlayer[n];
        const parts = n.split(" ");
        for (const part of parts) { if (part.length >= 5 && nameToPlayer[part]) return nameToPlayer[part]; }
        return null;
      };

      const newStats = {...stats};
      let matched = 0;

      innings.forEach(inn => {
        // Batting
        (inn.batters || inn.batting || innings.batting || []).forEach(b => {
          const p = findPlayer(b.name || b.batsman?.name);
          if (!p) return;
          matched++;
          newStats[p.id] = {
            ...newStats[p.id],
            runs: parseInt(b.r || b.runs || 0),
            balls: parseInt(b.b || b.balls || 0),
            fours: parseInt(b["4s"] || b.fours || 0),
            sixes: parseInt(b["6s"] || b.sixes || 0),
            dismissed: !!(b.dismissal || b.wicket),
            played: true,
          };
        });
        // Bowling
        (inn.bowlers || inn.bowling || []).forEach(bw => {
          const p = findPlayer(bw.name || bw.bowler?.name);
          if (!p) return;
          matched++;
          const overs = parseFloat(bw.o || bw.overs || 0);
          const runs = parseInt(bw.r || bw.runs || 0);
          const eco = overs > 0 ? Math.round((runs/overs)*100)/100 : 0;
          newStats[p.id] = {
            ...newStats[p.id],
            wickets: parseInt(bw.w || bw.wickets || 0),
            overs,
            economy: eco,
            maidens: parseInt(bw.m || bw.maidens || 0),
            played: true,
          };
        });
      });

      setStats(newStats);
      setFetchStatus("✅ CricketData: filled " + matched + " player entries");
    } catch(e) {
      setFetchStatus("❌ CricketData: " + e.message);
    }
    setFetching(false);
  };

  const [search, setSearch] = React.useState("");
  const [activeTab, setActiveTab] = React.useState("batting");
  const [fetching, setFetching] = React.useState(false);
  const [fetchStatus, setFetchStatus] = React.useState("");
  const [showPasteModal, setShowPasteModal] = React.useState(false);
  const [pasteText, setPasteText] = React.useState("");
  const [parsing, setParsing] = React.useState(false);

  const parseScorecard = async () => {
    if (!pasteText.trim()) return;
    setParsing(true);
    setFetchStatus("AI parsing scorecard…");
    try {
      const playerList = matchPlayers.map(p => p.name + " (" + (p.iplTeam||"") + ")").join(", ");
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 4000,
          system: "You are a cricket scorecard parser. Extract player stats from the scorecard text and return ONLY a valid JSON array. No markdown, no explanation.",
          messages: [{ role: "user", content: `Parse this cricket scorecard and extract stats for these players: ${playerList}.

Scorecard:
${pasteText}

Return ONLY a JSON array: [{"name":"Player Name","runs":0,"balls":0,"fours":0,"sixes":0,"dismissed":false,"wickets":0,"overs":0,"economy":0,"maidens":0,"catches":0,"stumpings":0,"runouts":0,"longestSix":false,"mom":false}]
Only include players who appear in the scorecard. Match names as closely as possible.` }],
        }),
      });
      const data = await res.json();
      const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      const clean = text.replace(/^```json\s*/m,"").replace(/^```\s*/m,"").replace(/```\s*$/m,"").trim();
      let parsed = [];
      try { parsed = JSON.parse(clean); } catch { throw new Error("Could not parse AI response"); }
      
      // Match parsed players to our matchPlayers
      const nameMap = {};
      matchPlayers.forEach(p => {
        nameMap[p.name.toLowerCase()] = p;
        p.name.toLowerCase().split(" ").forEach(part => { if(part.length > 3) nameMap[part] = p; });
      });
      const findP = (name) => {
        const n = (name||"").toLowerCase().trim();
        if (nameMap[n]) return nameMap[n];
        for (const part of n.split(" ")) { if(part.length >= 4 && nameMap[part]) return nameMap[part]; }
        return null;
      };

      const newStats = {...stats};
      let matched = 0;
      for (const entry of parsed) {
        const p = findP(entry.name);
        if (!p) continue;
        matched++;
        newStats[p.id] = {
          ...newStats[p.id],
          runs: +entry.runs || 0,
          balls: +entry.balls || 0,
          fours: +entry.fours || 0,
          sixes: +entry.sixes || 0,
          dismissed: !!entry.dismissed,
          wickets: +entry.wickets || 0,
          overs: +entry.overs || 0,
          economy: +entry.economy || 0,
          maidens: +entry.maidens || 0,
          catches: +entry.catches || 0,
          stumpings: +entry.stumpings || 0,
          runouts: +entry.runouts || 0,
          longestSix: !!entry.longestSix,
          mom: !!entry.mom,
          played: true,
        };
      }
      setStats(newStats);
      setFetchStatus("✅ Parsed " + matched + " players from scorecard");
      setShowPasteModal(false);
      setPasteText("");
    } catch(e) {
      setFetchStatus("❌ Parse failed: " + e.message);
    }
    setParsing(false);
  };

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

  // Paste scorecard modal
  const PasteModal = () => !showPasteModal ? null : (
    <div style={{position:"fixed",inset:0,background:"rgba(5,8,16,0.95)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:400,padding:20}}>
      <div style={{background:T.card,borderRadius:16,border:`1px solid ${T.purple}44`,width:"100%",maxWidth:500,display:"flex",flexDirection:"column",maxHeight:"85vh"}}>
        <div style={{padding:"18px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontFamily:fonts.display,fontWeight:800,fontSize:18,color:T.purple,letterSpacing:2}}>📋 PASTE SCORECARD</div>
            <div style={{fontSize:11,color:T.muted,marginTop:2}}>Paste from Cricinfo, Google, anywhere — AI will parse it</div>
          </div>
          <button onClick={()=>{setShowPasteModal(false);setPasteText("");}} style={{background:"#1E2D45",border:"none",borderRadius:8,width:30,height:30,color:T.sub,fontSize:16,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
          <div style={{fontSize:11,color:T.muted,marginBottom:8,lineHeight:1.6}}>
            Copy the scorecard text from any cricket website and paste it below. AI will extract all stats automatically.
          </div>
          <textarea value={pasteText} onChange={e=>setPasteText(e.target.value)}
placeholder="Paste scorecard text here... (e.g. V Kohli c Maxwell b Bumrah 82 (54) 8x4 3x6 / Bumrah 4-0-22-3)"
            rows={12} style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",color:T.text,fontSize:13,fontFamily:"monospace",outline:"none",resize:"vertical",boxSizing:"border-box"}} />
        </div>
        <div style={{padding:"14px 20px",borderTop:`1px solid ${T.border}`,display:"flex",gap:10}}>
          <button onClick={()=>{setShowPasteModal(false);setPasteText("");}} style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:10,padding:11,color:T.muted,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
          <button onClick={parseScorecard} disabled={!pasteText.trim()||parsing}
            style={{flex:2,background:"linear-gradient(135deg,#A855F7,#7C3AED)",border:"none",borderRadius:10,padding:11,color:"#fff",fontFamily:fonts.body,fontWeight:800,fontSize:14,cursor:!pasteText.trim()||parsing?"not-allowed":"pointer",opacity:!pasteText.trim()||parsing?0.6:1}}>
            {parsing?"🤖 PARSING…":"🤖 PARSE WITH AI"}
          </button>
        </div>
      </div>
    </div>
  );

  const tabBtn = (tab, label) => (
    <button onClick={()=>setActiveTab(tab)} style={{padding:"8px 16px",border:"none",cursor:"pointer",fontFamily:fonts.body,fontWeight:700,fontSize:13,letterSpacing:1,background:activeTab===tab?T.accent:"transparent",color:activeTab===tab?T.bg:T.muted,borderRadius:6}}>
      {label}
    </button>
  );

  const inp = {width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 4px",color:T.text,fontSize:14,fontFamily:fonts.body,textAlign:"center"};

  return (
    <><PasteModal />
    <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.97)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,backdropFilter:"blur(6px)"}}>
      <div style={{background:T.card,borderRadius:16,border:`1px solid ${T.border}`,width:"100%",maxWidth:720,margin:"0 12px",maxHeight:"92vh",display:"flex",flexDirection:"column"}}>

        {/* Header */}
        <div style={{padding:"18px 24px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
          <div style={{fontFamily:fonts.display,fontSize:20,fontWeight:700,color:T.accent,letterSpacing:2}}>📊 MATCH STATS — M{match.matchNum}</div>
          <div style={{color:T.muted,fontSize:13,marginTop:2}}>{match.team1} vs {match.team2} • {match.date} • {match.venue}</div>
          <div style={{marginTop:12,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <button onClick={fetchFromCricketData} disabled={fetching}
              style={{background:"linear-gradient(135deg,#2ECC71,#16a34a)",border:"none",borderRadius:8,padding:"9px 18px",color:"#fff",fontFamily:fonts.body,fontWeight:700,fontSize:13,cursor:fetching?"not-allowed":"pointer",opacity:fetching?0.6:1,letterSpacing:1}}>
              {fetching?"⏳ FETCHING…":"🟢 SYNC FROM CRICKETDATA"}
            </button>
            <button onClick={fetchFromCricbuzz} disabled={fetching}
              style={{background:"transparent",border:`1px solid ${T.info}44`,borderRadius:8,padding:"9px 14px",color:T.info,fontFamily:fonts.body,fontWeight:700,fontSize:12,cursor:fetching?"not-allowed":"pointer",opacity:fetching?0.6:1,letterSpacing:1}}>
              🟠 CRICBUZZ
            </button>
            <button onClick={()=>setShowPasteModal(true)} disabled={fetching}
              style={{background:"transparent",border:`1px solid ${T.purple}44`,borderRadius:8,padding:"9px 14px",color:T.purple,fontFamily:fonts.body,fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:1}}>
              📋 PASTE SCORECARD
            </button>
            {fetchStatus && <span style={{fontSize:12,color:fetchStatus.startsWith("✅")?"#2ECC71":fetchStatus.startsWith("❌")?"#FF3D5A":"#F5A623",marginTop:4,width:"100%"}}>{fetchStatus}</span>}
          </div>
        </div>

        {/* Step 1: Mark players */}
        <div style={{padding:"14px 24px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
          <div style={{fontSize:11,color:T.muted,letterSpacing:2,fontWeight:700,marginBottom:8}}>
            STEP 1 — MARK WHO PLAYED &nbsp;<span style={{color:T.success}}>({playingPlayers.length} selected)</span>
          </div>
          <input placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}
            style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 12px",color:T.text,fontSize:13,fontFamily:fonts.body,marginBottom:8,boxSizing:"border-box"}} />
          <div style={{maxHeight:100,overflowY:"auto",display:"flex",flexWrap:"wrap",gap:5}}>
            {filteredPlayers.map(p=>(
              <button key={p.id} onClick={()=>upd(p.id,"played",!stats[p.id]?.played)}
                style={{padding:"4px 10px",borderRadius:20,border:"1px solid "+(stats[p.id]?.played?"#2ECC71":"#1E2D45"),background:stats[p.id]?.played?"#2ECC7122":"transparent",color:stats[p.id]?.played?"#2ECC71":"#4A5E78",fontSize:12,fontFamily:fonts.body,cursor:"pointer",fontWeight:600}}>
                {stats[p.id]?.played?"✓ ":""}{p.name} <span style={{opacity:0.5,fontSize:10}}>({p.iplTeam})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: Stats tabs */}
        {playingPlayers.length > 0 && (
          <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
            <div style={{padding:"10px 24px",borderBottom:`1px solid ${T.border}`,flexShrink:0,display:"flex",gap:6,alignItems:"center"}}>
              <span style={{fontSize:11,color:T.muted,letterSpacing:2,fontWeight:700,marginRight:8}}>STEP 2 — ENTER / VERIFY STATS:</span>
              {tabBtn("batting","🏏 BATTING")}
              {tabBtn("bowling","🎳 BOWLING")}
              {tabBtn("fielding","🧤 FIELDING")}
              {tabBtn("preview","👁 PREVIEW")}
            </div>

            <div style={{overflowY:"auto",flex:1,padding:"8px 24px 16px"}}>

              {activeTab==="batting" && (
                <table style={{width:"100%",borderCollapse:"collapse",marginTop:8}}>
                  <thead>
                    <tr style={{fontSize:11,color:T.muted,letterSpacing:1,background:"#0E152188"}}>
                      <th style={{textAlign:"left",padding:"8px 6px",fontWeight:700}}>PLAYER</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:50}}>RUNS</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:45}}>BALLS</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:40}}>4s</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:40}}>6s</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:55}}>OUT</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:55}}>L6</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playingPlayers.map(p=>(
                      <tr key={p.id} style={{borderBottom:`1px solid ${T.border}33`}}>
                        <td style={{padding:"7px 6px",fontSize:13,color:T.text,fontWeight:600,fontFamily:fonts.body}}><div style={{display:"flex",alignItems:"center",gap:4}}>{p.name} {p.tier&&<span style={{fontSize:9,fontWeight:800,letterSpacing:1,padding:"1px 5px",borderRadius:4,fontFamily:fonts.body,textTransform:"uppercase",background:p.tier==="platinum"?"#4A5E7833":p.tier==="gold"?"#F5A62322":p.tier==="silver"?"#94A3B822":"#CD7F3222",border:"1px solid "+(p.tier==="platinum"?"#4A5E7866":p.tier==="gold"?"#F5A62366":p.tier==="silver"?"#94A3B855":"#CD7F3255"),color:p.tier==="platinum"?"#B0BEC5":p.tier==="gold"?"#F5A623":p.tier==="silver"?"#94A3B8":"#CD7F32"}}>{p.tier==="platinum"?"PLAT":p.tier==="gold"?"GOLD":p.tier==="silver"?"SILV":"BRNZ"}</span>}</div><span style={{fontSize:10,color:T.muted}}>{p.iplTeam} • {p.role}</span></td>
                        <td style={{padding:"4px"}}><input type="number" min="0" value={stats[p.id]?.runs||0} onChange={e=>upd(p.id,"runs",e.target.value)} style={inp} /></td>
                        <td style={{padding:"4px"}}><input type="number" min="0" value={stats[p.id]?.balls||0} onChange={e=>upd(p.id,"balls",e.target.value)} style={inp} /></td>
                        <td style={{padding:"4px"}}><input type="number" min="0" value={stats[p.id]?.fours||0} onChange={e=>upd(p.id,"fours",e.target.value)} style={inp} /></td>
                        <td style={{padding:"4px"}}><input type="number" min="0" value={stats[p.id]?.sixes||0} onChange={e=>upd(p.id,"sixes",e.target.value)} style={inp} /></td>
                        <td style={{padding:"4px",textAlign:"center"}}><input type="checkbox" checked={!!stats[p.id]?.dismissed} onChange={e=>upd(p.id,"dismissed",e.target.checked)} style={{width:18,height:18,accentColor:"#FF3D5A"}} /></td>
                        <td style={{padding:"4px",textAlign:"center"}}><input type="checkbox" checked={!!stats[p.id]?.longestSix} onChange={e=>upd(p.id,"longestSix",e.target.checked)} style={{width:18,height:18,accentColor:T.accent}} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {activeTab==="bowling" && (
                <table style={{width:"100%",borderCollapse:"collapse",marginTop:8}}>
                  <thead>
                    <tr style={{fontSize:11,color:T.muted,letterSpacing:1,background:"#0E152188"}}>
                      <th style={{textAlign:"left",padding:"8px 6px",fontWeight:700}}>PLAYER</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:55}}>WICKETS</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:50}}>OVERS</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:55}}>ECONOMY</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:50}}>MAIDENS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playingPlayers.map(p=>(
                      <tr key={p.id} style={{borderBottom:`1px solid ${T.border}33`}}>
                        <td style={{padding:"7px 6px",fontSize:13,color:T.text,fontWeight:600,fontFamily:fonts.body}}><div style={{display:"flex",alignItems:"center",gap:4}}>{p.name} {p.tier&&<span style={{fontSize:9,fontWeight:800,letterSpacing:1,padding:"1px 5px",borderRadius:4,fontFamily:fonts.body,textTransform:"uppercase",background:p.tier==="platinum"?"#4A5E7833":p.tier==="gold"?"#F5A62322":p.tier==="silver"?"#94A3B822":"#CD7F3222",border:"1px solid "+(p.tier==="platinum"?"#4A5E7866":p.tier==="gold"?"#F5A62366":p.tier==="silver"?"#94A3B855":"#CD7F3255"),color:p.tier==="platinum"?"#B0BEC5":p.tier==="gold"?"#F5A623":p.tier==="silver"?"#94A3B8":"#CD7F32"}}>{p.tier==="platinum"?"PLAT":p.tier==="gold"?"GOLD":p.tier==="silver"?"SILV":"BRNZ"}</span>}</div><span style={{fontSize:10,color:T.muted}}>{p.iplTeam} • {p.role}</span></td>
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
                    <tr style={{fontSize:11,color:T.muted,letterSpacing:1,background:"#0E152188"}}>
                      <th style={{textAlign:"left",padding:"8px 6px",fontWeight:700}}>PLAYER</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:65}}>CATCHES</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:75}}>STUMPINGS</th>
                      <th style={{padding:"8px 4px",fontWeight:700,minWidth:70}}>RUN OUTS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playingPlayers.map(p=>(
                      <tr key={p.id} style={{borderBottom:`1px solid ${T.border}33`}}>
                        <td style={{padding:"7px 6px",fontSize:13,color:T.text,fontWeight:600,fontFamily:fonts.body}}><div style={{display:"flex",alignItems:"center",gap:4}}>{p.name} {p.tier&&<span style={{fontSize:9,fontWeight:800,letterSpacing:1,padding:"1px 5px",borderRadius:4,fontFamily:fonts.body,textTransform:"uppercase",background:p.tier==="platinum"?"#4A5E7833":p.tier==="gold"?"#F5A62322":p.tier==="silver"?"#94A3B822":"#CD7F3222",border:"1px solid "+(p.tier==="platinum"?"#4A5E7866":p.tier==="gold"?"#F5A62366":p.tier==="silver"?"#94A3B855":"#CD7F3255"),color:p.tier==="platinum"?"#B0BEC5":p.tier==="gold"?"#F5A623":p.tier==="silver"?"#94A3B8":"#CD7F32"}}>{p.tier==="platinum"?"PLAT":p.tier==="gold"?"GOLD":p.tier==="silver"?"SILV":"BRNZ"}</span>}</div><span style={{fontSize:10,color:T.muted}}>{p.iplTeam} • {p.role}</span></td>
                        <td style={{padding:"4px"}}><input type="number" min="0" value={stats[p.id]?.catches||0} onChange={e=>upd(p.id,"catches",e.target.value)} style={inp} /></td>
                        <td style={{padding:"4px"}}><input type="number" min="0" value={stats[p.id]?.stumpings||0} onChange={e=>upd(p.id,"stumpings",e.target.value)} style={inp} /></td>
                        <td style={{padding:"4px"}}><input type="number" min="0" value={stats[p.id]?.runouts||0} onChange={e=>upd(p.id,"runouts",e.target.value)} style={inp} /></td>
                        <td style={{padding:"4px",textAlign:"center"}}><input type="checkbox" checked={!!stats[p.id]?.mom} onChange={e=>upd(p.id,"mom",e.target.checked)} style={{width:18,height:18,accentColor:T.accent}} /></td>
                        <td style={{padding:"4px",textAlign:"center"}}><input type="checkbox" checked={!!stats[p.id]?.playingXI} onChange={e=>upd(p.id,"playingXI",e.target.checked)} style={{width:18,height:18,accentColor:"#2ECC71"}} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {activeTab==="preview" && (
                <div style={{marginTop:8}}>
                  <div style={{fontSize:11,color:T.muted,letterSpacing:2,marginBottom:10}}>POINTS PREVIEW (before captain multiplier)</div>
                  {playingPlayers.sort((a,b)=>calcPoints(stats[b.id]||{}, pointsConfig||DEFAULT_POINTS)-calcPoints(stats[a.id]||{}, pointsConfig||DEFAULT_POINTS)).map(p => {
                    const s = stats[p.id] || {};
                    const pts = calcPoints(s, pointsConfig||DEFAULT_POINTS);
                    const bd = calcBreakdown(s);
                    return (
                      <div key={p.id} style={{background:T.card,borderRadius:8,padding:"10px 14px",marginBottom:6,display:"flex",alignItems:"flex-start",gap:12}}>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:600,fontSize:14,color:T.text,fontFamily:fonts.body}}>{p.name}</div>
                          <div style={{fontSize:11,color:T.muted,marginTop:2}}>{bd.length>0?bd.join(" • "):"No stats"}</div>
                        </div>
                        <div style={{fontFamily:fonts.display,fontSize:24,fontWeight:800,color:pts>0?"#F5A623":"#4A5E78"}}>{pts}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{padding:"14px 24px",borderTop:`1px solid ${T.border}`,display:"flex",gap:10,flexShrink:0}}>
          <button onClick={onClose} style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:11,color:T.muted,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
          <button onClick={submit} style={{flex:2,background:`linear-gradient(135deg,${T.accent},${T.accentDim})`,border:"none",borderRadius:8,padding:11,color:T.bg,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>✅ SAVE POINTS ({playingPlayers.length} players)</button>
        </div>
      </div>
    </div></>
  );
}


// ── SPLASH / AUTH SCREEN ─────────────────────────────────────────────────────
function SplashScreen({ onLogin }) {
  const [mode, setMode] = useState('splash'); // splash | login | signup | forgot | reset
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [codeSent, setCodeSent] = useState(false);

  const inputStyle = (hasErr) => ({
    width:"100%", background:T.bg,
    border:"1px solid "+(hasErr?"#FF3D5A":"#1E2D45"),
    borderRadius:8, padding:"12px 16px", color:T.text,
    fontSize:16, fontFamily:fonts.body,
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

  const sendResetCode = async () => {
    if (!email.trim() || !email.includes('@')) { setErr('Enter a valid email'); return; }
    setLoading(true); setErr('');
    try {
      const users = await getUsers();
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
      if (!user) { setErr('Email not found.'); setLoading(false); return; }
      const res = await fetch('/api/reset-password', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ email: email.toLowerCase().trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send code');
      setCodeSent(true); setErr('');
    } catch(e) { setErr('Error: ' + e.message); }
    setLoading(false);
  };

  const verifyResetCode = async () => {
    if (!resetCode.trim()) { setErr('Enter the code'); return; }
    setLoading(true); setErr('');
    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ verifyCode: resetCode.trim() })
      });
      const data = await res.json();
      if (data.valid) { setMode('reset'); setErr(''); }
      else { setErr('Wrong code. Try again.'); }
    } catch(e) { setErr('Error: ' + e.message); }
    setLoading(false);
  };

  const resetPassword = async () => {
    if (newPw.length < 6) { setErr('Password must be at least 6 characters'); return; }
    if (newPw !== newPw2) { setErr("Passwords don't match"); return; }
    setLoading(true); setErr('');
    try {
      const users = await getUsers();
      const hash = await hashPw(newPw);
      const updated = users.map(u => u.email.toLowerCase() === email.toLowerCase().trim() ? {...u, hash} : u);
      await saveUsers(updated);
      setMode('login'); setPw(''); setPw2(''); setResetCode(''); setNewPw(''); setNewPw2('');
      setErr(''); alert('✅ Password reset! Please log in with your new password.');
    } catch(e) { setErr('Error: ' + e.message); }
    setLoading(false);
  };

  if (mode === 'splash') return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#080C14 0%,#0E1521 50%,#080C14 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"20px",fontFamily:fonts.body}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:#0C0C0F;}`}</style>

      {/* Logo area */}
      <div style={{textAlign:"center",marginBottom:48}}>
        <img src="/logo.png" alt="Teekha Bouncer" style={{width:120,height:120,objectFit:"contain",borderRadius:20,marginBottom:16,boxShadow:"0 0 40px #F5A62344"}} />
        <div style={{fontFamily:fonts.display,fontWeight:700,fontSize:42,color:T.accent,letterSpacing:4,lineHeight:1}}>TEEKHA</div>
        <div style={{fontFamily:fonts.display,fontWeight:700,fontSize:42,color:T.text,letterSpacing:4,lineHeight:1}}>BOUNCER</div>
        <div style={{fontSize:13,color:T.muted,letterSpacing:6,marginTop:8,textTransform:"uppercase"}}>Fantasy Cricket League</div>
      </div>

      {/* Tagline */}
      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"16px 24px",marginBottom:40,textAlign:"center",maxWidth:320}}>
        <div style={{fontSize:14,color:T.sub,lineHeight:1.6}}>
          Track fantasy points, manage squads, and compete with your friends across multiple leagues 🏆
        </div>
      </div>

      {/* Buttons */}
      <div style={{width:"100%",maxWidth:320,display:"flex",flexDirection:"column",gap:12}}>
        <button onClick={() => setMode('signup')}
          style={{background:`linear-gradient(135deg,${T.accent},${T.accentDim})`,border:"none",borderRadius:12,padding:"16px",color:T.bg,fontFamily:fonts.body,fontWeight:800,fontSize:18,cursor:"pointer",letterSpacing:2}}>
          GET STARTED
        </button>
        <button onClick={() => setMode('login')}
          style={{background:"transparent",border:`2px solid ${T.border}`,borderRadius:12,padding:"14px",color:T.text,fontFamily:fonts.body,fontWeight:700,fontSize:16,cursor:"pointer",letterSpacing:1}}>
          I HAVE AN ACCOUNT
        </button>
      </div>


    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"20px",fontFamily:fonts.body}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&family=Barlow+Condensed:wght@400;600;700;800&display=swap');*{box-sizing:border-box;margin:0;padding:0;}body{background:#080C14;color:#E2EAF4;}`}</style>

      <div style={{width:"100%",maxWidth:380}}>
        {/* Header */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <img src="/logo.png" alt="Teekha Bouncer" style={{width:64,height:64,objectFit:"contain",borderRadius:12,margin:"0 auto",display:"block"}} />
          <div style={{fontFamily:fonts.display,fontWeight:700,fontSize:28,color:T.accent,letterSpacing:3,marginTop:8}}>
            {mode==='login' ? "WELCOME BACK" : "CREATE ACCOUNT"}
          </div>
          <div style={{fontSize:13,color:T.muted,marginTop:4}}>
            {mode==='login' ? "Sign in to your Teekha Bouncer account" : "Join Teekha Bouncer League"}
          </div>
        </div>

        {/* Form */}
        <div style={{background:T.card,borderRadius:16,border:`1px solid ${T.border}`,padding:28}}>
          <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setErr('');}} placeholder="Email address" style={inputStyle(err && !pw)} />
          <input type="password" value={pw} onChange={e=>{setPw(e.target.value);setErr('');}} onKeyDown={e=>e.key==="Enter"&&(mode==='login'?handleLogin():null)} placeholder="Password" style={inputStyle(err && pw && !pw2)} />
          {mode==='signup' && (
            <input type="password" value={pw2} onChange={e=>{setPw2(e.target.value);setErr('');}} onKeyDown={e=>e.key==="Enter"&&handleSignup()} placeholder="Confirm password" style={inputStyle(false)} />
          )}
          {err && <div style={{color:T.danger,fontSize:13,marginBottom:12,textAlign:"center"}}>{err}</div>}
          <button onClick={mode==='login' ? handleLogin : handleSignup} disabled={loading}
            style={{width:"100%",background:`linear-gradient(135deg,${T.accent},${T.accentDim})`,border:"none",borderRadius:8,padding:14,color:T.bg,fontFamily:fonts.body,fontWeight:800,fontSize:16,cursor:loading?"not-allowed":"pointer",opacity:loading?0.7:1,letterSpacing:1}}>
            {loading ? "PLEASE WAIT..." : mode==='login' ? "SIGN IN" : "CREATE ACCOUNT"}
          </button>
          {mode==='login' && (
            <div style={{textAlign:"center",marginTop:12}}>
              <button onClick={()=>{setMode('forgot');setErr('');setPw('');setCodeSent(false);setResetCode('');}}
                style={{background:"none",border:"none",color:T.danger,fontSize:12,cursor:"pointer",textDecoration:"underline",fontFamily:fonts.body}}>
                Forgot password?
              </button>
            </div>
          )}
        </div>

        {/* Toggle */}
        <div style={{textAlign:"center",marginTop:20,fontSize:14,color:T.muted}}>
          {mode==='login' ? "Don't have an account? " : "Already have an account? "}
          <button onClick={()=>{setMode(mode==='login'?'signup':'login');setErr('');setPw('');setPw2('');}}
            style={{background:"none",border:"none",color:T.accent,fontSize:14,cursor:"pointer",fontFamily:fonts.body,fontWeight:700,textDecoration:"underline"}}>
            {mode==='login' ? "Sign up" : "Sign in"}
          </button>
        </div>

        <button onClick={() => setMode('splash')}
          style={{display:"block",margin:"16px auto 0",background:"none",border:"none",color:T.muted,fontSize:12,cursor:"pointer"}}>
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
      <div style={{minHeight:"100vh",background:T.bg,padding:24,fontFamily:"monospace"}}>
        <div style={{color:T.danger,fontSize:18,marginBottom:16}}>💥 CRASH REPORT</div>
        <div style={{background:T.card,padding:16,borderRadius:8,color:T.text,fontSize:13,wordBreak:"break-all",whiteSpace:"pre-wrap"}}>{this.state.error}</div>
        <button onClick={()=>{ localStorage.clear(); window.location.reload(); }} style={{marginTop:20,background:"#F5A623",border:"none",borderRadius:8,padding:"10px 20px",color:T.bg,fontWeight:700,cursor:"pointer"}}>CLEAR & RELOAD</button>
      </div>
    );
    return this.props.children;
  }
}


// ── FEEDBACK WIDGET ───────────────────────────────────────────────────────────
function FeedbackWidget({ pitches, user }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(user?.email?.split("@")[0] || "");
  const [pitch, setPitch] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [sent, setSent] = React.useState(false);

  const YOUR_WHATSAPP = "YOUR_WHATSAPP_NUMBER"; // e.g. "919876543210"
  const YOUR_EMAIL    = "YOUR_EMAIL@gmail.com";

  const buildText = () =>
    `🏏 Teekha Bouncer Feedback\n\nFrom: ${name}\nPitch: ${pitch || "General"}\n\nMessage:\n${message}`;

  const sendWhatsApp = () => {
    window.open("https://wa.me/" + YOUR_WHATSAPP + "?text=" + encodeURIComponent(buildText()), "_blank");
    setSent(true);
  };

  const sendEmail = () => {
    const subject = encodeURIComponent("Teekha Bouncer Feedback — " + (pitch || "General"));
    const body = encodeURIComponent(buildText());
    window.open("mailto:" + YOUR_EMAIL + "?subject=" + subject + "&body=" + body, "_blank");
    setSent(true);
  };

  const reset = () => { setOpen(false); setMessage(""); setSent(false); };

  const canSend = name.trim() && message.trim();

  return (
    <>
      {/* Feedback button — below pitch cards */}
      <div style={{textAlign:"center",marginTop:20,animation:"tb-fadeUp 0.5s ease 0.4s both"}}>
        <button onClick={()=>setOpen(true)}
          style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 24px",fontFamily:fonts.display,fontWeight:700,fontSize:13,color:T.sub,cursor:"pointer",letterSpacing:1,transition:"all 0.2s",display:"inline-flex",alignItems:"center",gap:8}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=T.infoBg;e.currentTarget.style.color=T.info;e.currentTarget.style.background=T.infoBg;}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.sub;e.currentTarget.style.background="transparent";}}>
          💬 SEND FEEDBACK
        </button>
        <div style={{fontFamily:fonts.body,fontSize:11,color:T.muted,marginTop:6}}>Suggestions, bug reports, feature requests — all welcome</div>
      </div>

      {/* Backdrop */}
      {open && <div onClick={reset} style={{position:"fixed",inset:0,background:"rgba(5,8,16,0.8)",zIndex:500,backdropFilter:"blur(4px)",animation:"tb-fadeIn 0.2s ease both"}} />}

      {/* Modal */}
      {open && (
        <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:600,width:"min(440px,95vw)",maxHeight:"90vh",display:"flex",flexDirection:"column",background:T.card,borderRadius:18,border:`1px solid ${T.border}`,boxShadow:"0 24px 80px rgba(0,0,0,0.6)",overflow:"hidden",animation:"tb-fadeUp 0.3s ease both"}}>
          {/* Header */}
          <div style={{padding:"20px 22px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <div style={{fontFamily:fonts.display,fontWeight:800,fontSize:19,color:T.accent,letterSpacing:1}}>💬 SEND FEEDBACK</div>
              <div style={{fontFamily:fonts.body,fontSize:12,color:T.muted,marginTop:3}}>We read every message — help us make this better</div>
            </div>
            <button onClick={reset} style={{background:T.border,border:"none",borderRadius:8,width:30,height:30,color:T.sub,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>
          {/* What kind of feedback */}
          <div style={{padding:"10px 22px",background:T.accentBg,borderBottom:`1px solid ${T.border}`,display:"flex",gap:14,flexWrap:"wrap"}}>
            {[["🐛","Bug"],["💡","Feature"],["⚙️","Rule change"],["📊","Points"],["🎨","Design"]].map(([emoji,label])=>(
              <div key={label} style={{fontFamily:fonts.body,fontSize:11,color:T.muted,display:"flex",alignItems:"center",gap:4}}>
                <span>{emoji}</span><span>{label}</span>
              </div>
            ))}
          </div>

          {/* Body */}
          <div style={{padding:"18px 22px",overflowY:"auto",flex:1}}>
            {sent ? (
              <div style={{textAlign:"center",padding:"24px 0"}}>
                <div style={{fontSize:48,marginBottom:12}}>🎉</div>
                <div style={{fontFamily:fonts.display,fontWeight:800,fontSize:18,color:T.success,marginBottom:6}}>FEEDBACK SENT!</div>
                <div style={{fontFamily:fonts.body,fontSize:13,color:T.muted,marginBottom:20}}>Thanks for helping improve the app.</div>
                <button onClick={reset} style={{fontFamily:fonts.display,fontWeight:700,fontSize:13,background:T.accentBg,border:`1px solid ${T.accentBorder}`,borderRadius:10,padding:"10px 24px",color:T.accent,cursor:"pointer",letterSpacing:0.5}}>CLOSE</button>
              </div>
            ) : (
              <>
                {/* Name */}
                <div style={{fontFamily:fonts.display,fontSize:10,fontWeight:700,color:T.muted,letterSpacing:2,marginBottom:6}}>YOUR NAME</div>
                <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name or username"
                  style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:9,padding:"10px 14px",color:T.text,fontSize:14,fontFamily:fonts.body,outline:"none",marginBottom:14,boxSizing:"border-box"}} />

                {/* Pitch */}
                <div style={{fontFamily:fonts.display,fontSize:10,fontWeight:700,color:T.muted,letterSpacing:2,marginBottom:6}}>PITCH / LEAGUE (optional)</div>
                <select value={pitch} onChange={e=>setPitch(e.target.value)}
                  style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:9,padding:"10px 14px",color:pitch?T.text:T.muted,fontSize:14,fontFamily:fonts.body,outline:"none",marginBottom:14,boxSizing:"border-box",cursor:"pointer"}}>
                  <option value="">— Select your pitch —</option>
                  {(pitches||[]).map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
                  <option value="General">General / No specific pitch</option>
                </select>

                {/* Message */}
                <div style={{fontFamily:fonts.display,fontSize:10,fontWeight:700,color:T.muted,letterSpacing:2,marginBottom:6}}>YOUR FEEDBACK</div>
                <textarea value={message} onChange={e=>setMessage(e.target.value)}
                  placeholder="Share your suggestion, bug report, or feature request..."
                  rows={5}
                  style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:9,padding:"10px 14px",color:T.text,fontSize:14,fontFamily:fonts.body,outline:"none",resize:"vertical",boxSizing:"border-box",lineHeight:1.5}} />

                {/* Buttons */}
                <div style={{display:"flex",gap:10,marginTop:16}}>
                  <button onClick={sendWhatsApp} disabled={!canSend}
                    style={{flex:1,background:canSend?"#25D36622":"#25D36611",border:`1px solid ${canSend?"#25D36644":"#25D36622"}`,borderRadius:10,padding:"11px",color:canSend?"#25D366":T.muted,fontFamily:fonts.display,fontWeight:700,fontSize:13,cursor:canSend?"pointer":"not-allowed",letterSpacing:0.5,display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"all 0.2s"}}>
                    📲 WHATSAPP
                  </button>
                  <button onClick={sendEmail} disabled={!canSend}
                    style={{flex:1,background:canSend?T.infoBg:"#4F8EF711",border:`1px solid ${canSend?T.info+"44":"#4F8EF722"}`,borderRadius:10,padding:"11px",color:canSend?T.info:T.muted,fontFamily:fonts.display,fontWeight:700,fontSize:13,cursor:canSend?"pointer":"not-allowed",letterSpacing:0.5,display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"all 0.2s"}}>
                    ✉️ EMAIL
                  </button>
                </div>
                <div style={{fontFamily:fonts.body,fontSize:11,color:T.muted,textAlign:"center",marginTop:10}}>
                  Fill in your name and message to enable sending
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── PITCH HOME SCREEN ────────────────────────────────────────────────────────
function PitchHome({ onEnter, user, onLogout, onSetupAdmin }) {
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

      // Copy all data keys from original to clone
      const dataKeys = ["teams","players","assignments","matches","captains","points","page","tnames","numteams","pwhash","pointsConfig","adminHash","adminEmail","teamIdentity","guestAllowed","tournaments","safePlayers","unsoldPool","transfers","ownershipLog","snatch"];
      for (const key of dataKeys) {
        try {
          const val = await sbGet(cloneModal.id + "_" + key);
          if (val !== null && val !== undefined) await sbSet(cloneId + "_" + key, val);
        } catch {}
      }

      // Reset transfers to closed state — don't inherit live window from original
      const originalTransfers = await sbGet(cloneModal.id + "_transfers") || {};
      await sbSet(cloneId + "_transfers", {
        ...originalTransfers,
        phase: "closed",
        releases: {},
        tradedPairs: [],
        currentPickTeam: null,
        pickDeadline: null,
        releaseDeadline: null,
      });

      // Create fresh pitchConfig with defaults for clone
      await sbSet(cloneId + "_pitchConfig", {
        transferStart: "Sunday 11:59 PM",
        transferEnd: "Monday 11:00 AM",
        snatchReturn: "Friday 11:58 PM",
        snatchWindow: "Saturday 12:00 AM to Saturday 12:00 PM",
      });

      // Save clone pitch to pitch list
      const updated = [...pitches, clonePitch];
      await sbSet("pitches", updated);
      setPitches(updated);

      // Auto-grant admin access to clone
      try { localStorage.setItem("tb_admin_" + cloneId, "1"); } catch {}

      setCloneModal(null); setCloneAdminPw(""); setCloneErr("");
      alert("✅ Clone created! Enter '" + clonePitch.name + "' to test.");
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
      <div style={{position:"relative",zIndex:10,borderBottom:`1px solid ${T.border}`,backdropFilter:"blur(20px)",background:`${T.bg}CC`}}>
        <div style={{maxWidth:680,margin:"0 auto",padding:"14px 24px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <img src="/logo.png" alt="Teekha Bouncer" style={{width:36,height:36,borderRadius:10,objectFit:"contain",boxShadow:`0 0 20px ${T.accent}33`}} />
            <div>
              <div style={{fontFamily:fonts.display,fontSize:17,fontWeight:800,color:T.accent,letterSpacing:3,lineHeight:1}}>TEEKHA BOUNCER</div>
              <div style={{fontFamily:fonts.body,fontSize:9,color:T.muted,letterSpacing:3,marginTop:2}}>FANTASY CRICKET LEAGUE</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{textAlign:"right"}}>
              <div style={{fontFamily:fonts.display,fontSize:12,fontWeight:700,color:T.text,letterSpacing:0.5}}>{user?.email?.split("@")[0]}</div>
              <div style={{fontFamily:fonts.body,fontSize:9,color:T.muted,letterSpacing:1}}>{user?.email?.split("@")[1]}</div>
            </div>
            <button onClick={onLogout}
              style={{fontFamily:fonts.display,fontWeight:700,fontSize:10,letterSpacing:1.5,background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 14px",color:T.sub,cursor:"pointer",transition:"all 0.2s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=T.dangerBg;e.currentTarget.style.color=T.danger;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.sub;}}>
              LOGOUT
            </button>
          </div>
        </div>
      </div>

      {/* Hero */}
      <div style={{position:"relative",zIndex:10,maxWidth:680,margin:"0 auto",padding:"44px 24px 28px"}}>
        <div style={{animation:"tb-fadeUp 0.6s ease both"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <div style={{width:3,height:24,background:`linear-gradient(180deg,${T.accent},${T.accentDim})`,borderRadius:2}} />
            <div style={{fontFamily:fonts.display,fontSize:9,fontWeight:700,color:T.accent,letterSpacing:4}}>DESIGN YOUR OWN LEAGUES</div>
          </div>
          <h1 style={{fontFamily:fonts.display,fontSize:40,fontWeight:900,color:T.text,letterSpacing:0,margin:0,lineHeight:1.05}}>
            YOUR <span style={{color:T.accent}}>LEAGUES</span>
          </h1>
          <p style={{fontFamily:fonts.body,fontSize:13,color:T.muted,marginTop:8,letterSpacing:0.3}}>
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
                style={{borderRadius:14,border:`1px solid ${isExpanded ? color+"55" : T.border}`,background:isExpanded ? color+"0A" : T.card,overflow:"hidden",animation:`tb-fadeUp 0.5s ease ${i*0.07}s both`,position:"relative",transition:"border-color 0.25s,background 0.25s"}}>
                <div style={{height:2,background:`linear-gradient(90deg,${color},${color}33,transparent)`,opacity:isExpanded?1:0.25,transition:"opacity 0.3s"}} />
                <div style={{padding:"14px 16px",display:"flex",alignItems:"center",gap:10,cursor:"pointer"}} onClick={()=>setExpandedPitch(isExpanded?null:pitch.id)}>
                  <div style={{width:46,height:46,borderRadius:11,background:color+"18",border:`1px solid ${color}33`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0,position:"relative"}}>
                    <div style={{fontFamily:fonts.display,fontWeight:800,fontSize:12,color:color,letterSpacing:1}}>P{i+1}</div>
                    {returning && <div style={{position:"absolute",top:-3,right:-3,width:7,height:7,borderRadius:"50%",background:color,boxShadow:`0 0 6px ${color}`}} />}
                  </div>
                  <div style={{flex:1,minWidth:0,overflow:"hidden"}}>
                    <div style={{fontFamily:fonts.display,fontWeight:700,fontSize:15,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pitch.name}</div>
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
            style={{width:"100%",background:"transparent",border:`1px dashed ${T.border}`,borderRadius:12,padding:"15px",fontFamily:fonts.display,fontWeight:700,fontSize:13,color:T.muted,cursor:"pointer",letterSpacing:2,display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all 0.2s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=T.accentBorder;e.currentTarget.style.color=T.accent;e.currentTarget.style.background=T.accentBg;}}
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
        {/* Feedback */}
        <FeedbackWidget pitches={pitches} user={user} />
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
    </div>
  );
}


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


function ChatWindow({ myTeam, teams, unlocked, withPassword, storeGet, storeSet, isGuest }) {
  const [open, setOpen] = React.useState(false);
  const [maximized, setMaximized] = React.useState(false);
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState('');
  const [unread, setUnread] = React.useState(0);
  const [pinned, setPinned] = React.useState(null);
  const [showMention, setShowMention] = React.useState(false);
  const [lastSeen] = React.useState(() => { try { return parseInt(localStorage.getItem('tb_chatLastSeen')||'0'); } catch { return 0; } });
  const endRef = React.useRef(null);

  const load = async () => {
    const data = await storeGet("chat") || {};
    const msgs = data.messages || [];
    setMessages(msgs);
    setPinned(data.pinned || null);
    if (!open) setUnread(msgs.filter(m => m.ts > lastSeen && m.senderId !== myTeam?.id).length);
  };

  React.useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);
  React.useEffect(() => { if (open) { setUnread(0); try { localStorage.setItem('tb_chatLastSeen', Date.now().toString()); } catch {} setTimeout(() => endRef.current?.scrollIntoView({behavior:'smooth'}), 100); } }, [open, messages.length]);

  const send = async () => {
    if (!input.trim() || !myTeam || input.length > 200) return;
    const msg = { id: Date.now().toString(), text: input.trim(), senderId: myTeam.id, senderName: myTeam.name, senderColor: myTeam.color, ts: Date.now(), reactions: {} };
    const data = await storeGet("chat") || {};
    const msgs = [...(data.messages || []), msg].slice(-50);
    await storeSet("chat", {...data, messages: msgs});
    setMessages(msgs); setInput(''); setShowMention(false);
    setTimeout(() => endRef.current?.scrollIntoView({behavior:'smooth'}), 50);
  };

  const react = async (msgId, emoji) => {
    const data = await storeGet("chat") || {};
    const msgs = (data.messages || []).map(m => {
      if (m.id !== msgId) return m;
      const r = {...(m.reactions||{})}; const u = r[emoji] || [];
      if (u.includes(myTeam?.id)) { r[emoji] = u.filter(x=>x!==myTeam?.id); if(!r[emoji].length) delete r[emoji]; }
      else r[emoji] = [...u, myTeam?.id];
      return {...m, reactions:r};
    });
    await storeSet("chat", {...data, messages: msgs}); setMessages(msgs);
  };

  const del = async (msgId, needPw) => {
    const doDelete = async () => { const data = await storeGet("chat")||{}; const msgs=(data.messages||[]).filter(m=>m.id!==msgId); await storeSet("chat",{...data,messages:msgs}); setMessages(msgs); };
    if (needPw) withPassword(doDelete); else doDelete();
  };

  const pin = async (msg) => {
    withPassword(async () => { const data = await storeGet("chat")||{}; const np = pinned?.id===msg.id?null:msg; await storeSet("chat",{...data,pinned:np}); setPinned(np); });
  };

  const renderText = (text) => text.split(' ').map((w,i) => {
    if (w.startsWith('@')) { const t = teams.find(t=>t.name.toLowerCase().includes(w.slice(1).toLowerCase())); return React.createElement('span',{key:i,style:{color:t?t.color:T.info,fontWeight:700}},(i>0?' ':'')+w); }
    return React.createElement('span',{key:i},(i>0?' ':'')+w);
  });

  const [pos, setPos] = React.useState(() => {
    try { const s = localStorage.getItem('tb_chatPos'); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [dragging, setDragging] = React.useState(false);
  const dragRef = React.useRef(null);
  const startRef = React.useRef(null);

  const onDragStart = (e) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    startRef.current = {
      mx: clientX,
      my: clientY,
      px: pos ? pos.x : 8,
      py: pos ? pos.y : window.innerHeight - 130,
    };
    setDragging(true);
    e.preventDefault();
  };

  React.useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const dx = clientX - startRef.current.mx;
      const dy = clientY - startRef.current.my;
      const nx = Math.max(8, Math.min(window.innerWidth - 60, startRef.current.px + dx));
      const ny = Math.max(8, Math.min(window.innerHeight - 130, startRef.current.py + dy));
      const newPos = { x: nx, y: ny };
      setPos(newPos);
      try { localStorage.setItem('tb_chatPos', JSON.stringify(newPos)); } catch {}
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    };
  }, [dragging]);

  const floatStyle = pos
    ? { position: "fixed", left: pos.x, top: pos.y, zIndex: 500, fontFamily: fonts.body }
    : { position: "fixed", bottom: "calc(env(safe-area-inset-bottom) + 72px)", left: 8, zIndex: 500, fontFamily: fonts.body };

  // Chat window always opens upward from button position
  const chatW = maximized ? Math.min(520, window.innerWidth * 0.9) : Math.min(320, window.innerWidth * 0.85);
  const chatH = maximized ? Math.min(600, window.innerHeight * 0.8) : Math.min(420, window.innerHeight * 0.6);
  const btnX  = pos ? pos.x : 8;
  const btnY  = pos ? pos.y : window.innerHeight - 130;
  const chatLeft = Math.min(btnX, window.innerWidth - chatW - 8);
  const chatTop  = Math.max(8, btnY - chatH - 12);

  return React.createElement('div', { ref: dragRef, style: floatStyle },
    !open && React.createElement('button', {
      onClick: () => setOpen(true),
      onMouseDown: onDragStart,
      onTouchStart: onDragStart,
      style: { width: 52, height: 52, borderRadius: "50%", background: "linear-gradient(135deg,#4F8EF7,#1a5fb4)", border: "none", cursor: dragging ? "grabbing" : "grab", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(79,142,247,0.4)", position: "relative", userSelect: "none", touchAction: "none" }
    },
      React.createElement('span', { style: { fontSize: 22 } }, "💬"),
      unread > 0 && React.createElement('span', { style: { position: "absolute", top: -2, right: -2, background: "#FF3D5A", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff" } }, unread > 9 ? "9+" : unread)
    ),
    open && React.createElement('div',{style:{position:"fixed",left:chatLeft,top:chatTop,width:chatW,height:chatH,background:T.card,borderRadius:16,border:`1px solid ${T.info}44`,display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,0.6)",overflow:"hidden",zIndex:501}},
      React.createElement('div',{style:{background:"#4F8EF711",borderBottom:"1px solid #4F8EF733",padding:"10px 14px",display:"flex",alignItems:"center",gap:8}},
        React.createElement('span',{style:{fontSize:16}},"💬"),
        React.createElement('div',{style:{flex:1,fontFamily:fonts.display,fontWeight:700,fontSize:15,color:T.info,letterSpacing:1}},"PITCH CHAT"),
        React.createElement('button',{onClick:()=>setMaximized(v=>!v),style:{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:14,padding:"2px 6px"}},maximized?"⊡":"⊞"),
        React.createElement('button',{onClick:()=>setOpen(false),style:{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:16,padding:"2px 6px"}},"✕")
      ),
      pinned && React.createElement('div',{style:{background:T.accentBg,borderBottom:"1px solid #F5A62322",padding:"6px 14px",display:"flex",alignItems:"center",gap:6}},
        React.createElement('span',{style:{fontSize:11}},"📌"),
        React.createElement('div',{style:{flex:1,fontSize:11,color:T.accent,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},pinned.senderName+": "+pinned.text),
        unlocked && React.createElement('button',{onClick:()=>pin(pinned),style:{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:10}},"✕")
      ),
      React.createElement('div',{style:{flex:1,overflowY:"auto",padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}},
        messages.length===0 && React.createElement('div',{style:{textAlign:"center",color:"#2D3E52",fontSize:13,marginTop:40}},"No messages yet. Say hello! 👋"),
        messages.map(msg => {
          // ── System notification (C/VC announcements) ──────────────────
          if (msg.type === "system") {
            return React.createElement('div', { key: msg.id, style: { display: "flex", flexDirection: "column", alignItems: "center", margin: "4px 0" } },
              React.createElement('div', { style: { background: "#F5A62311", border: "1px solid #F5A62333", borderRadius: 10, padding: "7px 14px", maxWidth: "90%", textAlign: "center" } },
                React.createElement('div', { style: { fontSize: 12, color: "#F5A623", fontWeight: 600, fontFamily: fonts.body, lineHeight: 1.4 } }, msg.text),
                React.createElement('div', { style: { fontSize: 9, color: T.muted, marginTop: 3 } }, new Date(msg.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }))
              )
            );
          }
          // ── Regular chat message ──────────────────────────────────────
          const isMe = msg.senderId === myTeam?.id;
          return React.createElement('div',{key:msg.id,style:{display:"flex",flexDirection:"column",alignItems:isMe?"flex-end":"flex-start"}},
            React.createElement('div',{style:{maxWidth:"80%",background:isMe?"#4F8EF722":"#141E2E",border:"1px solid "+(isMe?"#4F8EF744":"#1E2D45"),borderRadius:isMe?"12px 12px 4px 12px":"12px 12px 12px 4px",padding:"7px 10px"}},
              !isMe && React.createElement('div',{style:{fontSize:10,color:msg.senderColor||"#4F8EF7",fontWeight:700,marginBottom:3}},msg.senderName),
              React.createElement('div',{style:{fontSize:13,color:T.text,lineHeight:1.4}},renderText(msg.text)),
              React.createElement('div',{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:4,gap:4}},
                React.createElement('div',{style:{fontSize:9,color:"#2D3E52"}},new Date(msg.ts).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})),
                React.createElement('div',{style:{display:"flex",gap:3,flexWrap:"wrap"}},
                  ...Object.entries(msg.reactions||{}).map(([emoji,users]) => React.createElement('button',{key:emoji,onClick:()=>react(msg.id,emoji),style:{background:users.includes(myTeam?.id)?"#4F8EF733":"#1E2D45",border:"none",borderRadius:10,padding:"1px 6px",cursor:"pointer",fontSize:11,color:T.text}},emoji+" "+users.length)),
                  ...["👍","🔥","😂","💀","🏏"].map(emoji => React.createElement('button',{key:emoji,onClick:()=>react(msg.id,emoji),style:{background:"transparent",border:"none",cursor:"pointer",fontSize:11,opacity:0.4,padding:"1px 2px"}},emoji)),
                  (isMe||unlocked) && React.createElement('button',{onClick:()=>del(msg.id,!isMe),style:{background:"transparent",border:"none",color:T.danger,cursor:"pointer",fontSize:10,opacity:0.5}},"✕"),
                  unlocked && React.createElement('button',{onClick:()=>pin(msg),style:{background:"transparent",border:"none",color:T.accent,cursor:"pointer",fontSize:10,opacity:0.5}},"📌")
                )
              )
            )
          );
        }),
        React.createElement('div',{ref:endRef})
      ),
      myTeam && !isGuest
        ? React.createElement('div',{style:{borderTop:`1px solid ${T.border}`,padding:"8px 10px"}},
            showMention && React.createElement('div',{style:{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,marginBottom:6,overflow:"hidden"}},
              ...teams.map(t=>React.createElement('button',{key:t.id,onClick:()=>{const last=input.lastIndexOf('@');setInput(input.slice(0,last)+'@'+t.name+' ');setShowMention(false);},style:{width:"100%",background:"transparent",border:"none",padding:"7px 12px",textAlign:"left",cursor:"pointer",color:t.color,fontSize:13,fontWeight:700,fontFamily:fonts.body,display:"block"}},"@"+t.name))
            ),
            React.createElement('div',{style:{display:"flex",gap:6}},
              React.createElement('input',{value:input,onChange:e=>{const v=e.target.value;setInput(v);const last=v.lastIndexOf('@');setShowMention(last>=0&&last===v.length-1);},onKeyDown:e=>{if(e.key==="Enter"){e.preventDefault();send();setShowMention(false);}if(e.key==="Escape")setShowMention(false);},placeholder:"Message as "+myTeam.name+"... (@ to tag)",maxLength:200,style:{flex:1,background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",color:T.text,fontSize:13,fontFamily:fonts.body,outline:"none"}}),
              React.createElement('button',{onClick:send,style:{background:"#4F8EF7",border:"none",borderRadius:8,padding:"8px 12px",color:"#fff",cursor:"pointer",fontSize:14}},"➤")
            ),
            React.createElement('div',{style:{fontSize:9,color:"#2D3E52",marginTop:4,textAlign:"right"}},input.length+"/200")
          )
        : React.createElement('div',{style:{borderTop:`1px solid ${T.border}`,padding:"10px",textAlign:"center",fontSize:11,color:"#2D3E52"}},isGuest?"👁 Guests can read only":"Claim a team to chat")
    )
  );
}



// ── Fix Ownership Modal ───────────────────────────────────────────────────────
function FixOwnershipModal({ players, teams, ownershipLog, onSave, onClose }) {
  const [search, setSearch] = React.useState("");
  const [selectedPid, setSelectedPid] = React.useState(null);
  const [localLog, setLocalLog] = React.useState(ownershipLog);
  const [saved, setSaved] = React.useState(false);

  const filteredPlayers = players.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  ).filter(p => ownershipLog[p.id]); // only show players with ownership entries

  const selectedPlayer = players.find(p => p.id === selectedPid);
  const periods = localLog[selectedPid] || [];

  const deletePeriod = (idx) => {
    const newPeriods = periods.filter((_, i) => i !== idx);
    setLocalLog(prev => ({ ...prev, [selectedPid]: newPeriods }));
    setSaved(false);
  };

  const handleSave = () => {
    onSave(localLog);
    setSaved(true);
  };

  const teamName = (tid) => teams.find(t => t.id === tid)?.name || tid;
  const teamColor = (tid) => teams.find(t => t.id === tid)?.color || "#4A5E78";
  const fmt = (iso) => {
    if (!iso) return "Now";
    try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }); }
    catch { return iso; }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(8,12,20,0.97)", zIndex: 600, display: "flex", flexDirection: "column", fontFamily: fonts.body }}>

      {/* Header */}
      <div style={{ background: T.card, borderBottom: `1px solid ${T.border}`, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 18, color: T.danger, letterSpacing: 2 }}>🔧 FIX OWNERSHIP LOG</div>
          <div style={{ fontFamily: fonts.body, fontSize: 11, color: T.muted, marginTop: 2 }}>Delete bad ownership periods to fix leaderboard totals</div>
        </div>
        <button onClick={onClose} style={{ background: T.border, border: "none", borderRadius: 8, width: 30, height: 30, color: T.sub, fontSize: 14, cursor: "pointer" }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {/* Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search player name..."
          style={{ width: "100%", background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", color: T.text, fontSize: 14, fontFamily: fonts.body, outline: "none", marginBottom: 12, boxSizing: "border-box" }}
        />

        {/* Player list */}
        {!selectedPid && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontFamily: fonts.display, fontSize: 9, color: T.muted, letterSpacing: 2, marginBottom: 4 }}>
              PLAYERS WITH OWNERSHIP LOG ({filteredPlayers.length})
            </div>
            {filteredPlayers.map(p => {
              const periods = ownershipLog[p.id] || [];
              return (
                <button key={p.id} onClick={() => setSelectedPid(p.id)}
                  style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: fonts.body, fontWeight: 700, fontSize: 14, color: T.text }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                      {periods.length} period{periods.length !== 1 ? "s" : ""} · {periods.map(o => teamName(o.teamId)).join(" → ")}
                    </div>
                  </div>
                  <span style={{ color: T.muted, fontSize: 16 }}>›</span>
                </button>
              );
            })}
            {filteredPlayers.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: T.muted, fontSize: 14 }}>
                {search ? "No players found" : "No players with ownership log"}
              </div>
            )}
          </div>
        )}

        {/* Period detail view */}
        {selectedPid && (
          <div>
            <button onClick={() => { setSelectedPid(null); setSaved(false); }}
              style={{ background: "transparent", border: "none", color: T.accent, fontSize: 13, cursor: "pointer", padding: "0 0 14px", display: "flex", alignItems: "center", gap: 6 }}>
              ‹ Back to player list
            </button>

            <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 18, color: T.text, marginBottom: 4 }}>{selectedPlayer?.name}</div>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 16 }}>{selectedPlayer?.role} · {selectedPlayer?.iplTeam}</div>

            <div style={{ fontFamily: fonts.display, fontSize: 9, color: T.muted, letterSpacing: 2, marginBottom: 10 }}>OWNERSHIP PERIODS</div>

            {periods.length === 0 ? (
              <div style={{ textAlign: "center", padding: 30, color: T.muted, fontSize: 13 }}>No periods — all cleared</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {periods.map((o, idx) => (
                  <div key={idx} style={{ background: T.card, borderRadius: 10, border: `1px solid ${o.to ? T.border : teamColor(o.teamId) + "55"}`, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: teamColor(o.teamId), flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: fonts.body, fontWeight: 700, fontSize: 14, color: teamColor(o.teamId) }}>{teamName(o.teamId)}</div>
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                        {fmt(o.from)} → {fmt(o.to)}
                        {!o.to && <span style={{ marginLeft: 6, color: T.success, fontWeight: 700 }}>CURRENT</span>}
                        {o.from?.startsWith("2025-01-01") && <span style={{ marginLeft: 6, color: T.danger, fontSize: 10, fontWeight: 700 }}>⚠ SEASON START</span>}
                      </div>
                    </div>
                    <button onClick={() => deletePeriod(idx)}
                      style={{ background: T.dangerBg, border: `1px solid ${T.danger}33`, borderRadius: 8, padding: "6px 12px", color: T.danger, fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                      DELETE
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Warning */}
            <div style={{ background: "#F5A62311", border: "1px solid #F5A62333", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#F5A623" }}>
              ⚠️ Deleting a period removes those points from that team's total. Only delete periods that were created by mistake via the assignment editor, not legitimate trade periods.
            </div>

            {/* Save button */}
            <button onClick={handleSave}
              style={{ width: "100%", background: saved ? T.successBg : T.danger, border: "none", borderRadius: 10, padding: "14px", color: saved ? T.success : "#fff", fontFamily: fonts.display, fontWeight: 800, fontSize: 15, cursor: "pointer", letterSpacing: 1 }}>
              {saved ? "✅ SAVED" : "💾 SAVE CHANGES"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Push a system notification into pitch chat ────────────────────────────────
async function pushCaptainNotification(text) {
  try {
    const chatKey = _pitchId + "_chat";
    const res = await fetch(
      SUPABASE_URL + "/rest/v1/league_data?key=eq." + encodeURIComponent(chatKey) + "&select=value",
      { headers: SB_HEADERS }
    );
    const rows = await res.json();
    const chat = rows?.[0]?.value || { messages: [] };
    const msg = {
      id:       Date.now().toString(),
      type:     "system",
      text,
      ts:       Date.now(),
      reactions: {},
    };
    chat.messages = [...(chat.messages || []), msg];
    await fetch(SUPABASE_URL + "/rest/v1/league_data", {
      method:  "POST",
      headers: { ...SB_HEADERS, "Prefer": "resolution=merge-duplicates" },
      body:    JSON.stringify({ key: chatKey, value: chat, updated_at: new Date().toISOString() }),
    });
  } catch(e) { console.warn("Captain notification failed:", e.message); }
}

function CaptainModal({ match, teams, players, assignments, captains, points, myTeam, unlocked, isGuest, withPassword, onSave, onClose }) {
  const isLocked = !!captains[match.id+"_locked"];

  // Local state to avoid stale closure bug — copy on open, save on close
  const [local, setLocal] = React.useState(() => {
    const init = {};
    teams.forEach(t => { init[t.id] = { ...(captains[match.id+"_"+t.id] || {}) }; });
    return init;
  });

  const canEdit = (teamId) => {
    if (isLocked) return false;
    if (isGuest) return false;
    if (unlocked) return true; // admin can edit all
    return myTeam?.id === teamId; // team managers only their own
  };

  const handleChange = (teamId, role, value) => {
    setLocal(prev => ({
      ...prev,
      [teamId]: { ...prev[teamId], [role]: value }
    }));
  };

  const buildNotifications = (teamsToCheck, latestCaptains) => {
    const msgs = [];
    for (const t of teamsToCheck) {
      const oldCap = latestCaptains[match.id + "_" + t.id] || {};
      const newCap = local[t.id] || {};
      const getName = (pid) => players.find(p => p.id === pid)?.name || "—";

      const capChanged = newCap.captain && newCap.captain !== oldCap.captain;
      const vcChanged  = newCap.vc && newCap.vc !== oldCap.vc;
      const isNew = !oldCap.captain && !oldCap.vc;

      if (!capChanged && !vcChanged) continue;

      if (isNew || (capChanged && vcChanged)) {
        msgs.push(`👑 ${t.name} set ${getName(newCap.captain)} as Captain & ${getName(newCap.vc)} as VC — M${match.matchNum}`);
      } else if (capChanged) {
        const from = oldCap.captain ? `${getName(oldCap.captain)} → ` : "";
        msgs.push(`🔄 ${t.name} changed Captain: ${from}${getName(newCap.captain)} — M${match.matchNum}`);
      } else if (vcChanged) {
        const from = oldCap.vc ? `${getName(oldCap.vc)} → ` : "";
        msgs.push(`🔄 ${t.name} changed VC: ${from}${getName(newCap.vc)} — M${match.matchNum}`);
      }
    }
    return msgs;
  };

  const saveAndClose = async () => {
    try {
      const res = await fetch(
        `https://rmcxhorijitrhqyrvvkn.supabase.co/rest/v1/league_data?key=eq.${encodeURIComponent(_pitchId + "_captains")}&select=value`,
        { headers: { apikey: "sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm", Authorization: "Bearer sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm" } }
      );
      const data = await res.json();
      const latestCaptains = data?.[0]?.value || {};
      if (latestCaptains[match.id + "_locked"]) {
        alert("🔒 Admin has locked C/VC selections for this match. Your changes were not saved.");
        onClose();
        return;
      }
      const updated = { ...latestCaptains };
      const teamsToCheck = unlocked ? teams : (myTeam ? [myTeam] : []);
      if (unlocked) {
        teams.forEach(t => { updated[match.id + "_" + t.id] = local[t.id]; });
      } else if (myTeam) {
        updated[match.id + "_" + myTeam.id] = local[myTeam.id];
      }
      onSave(updated);
      // Push notifications for each team that changed C/VC
      const notifications = buildNotifications(teamsToCheck, latestCaptains);
      for (const msg of notifications) await pushCaptainNotification(msg);
      onClose();
    } catch (e) {
      const updated = { ...captains };
      if (updated[match.id + "_locked"]) {
        alert("🔒 C/VC is locked. Your changes were not saved.");
        onClose();
        return;
      }
      if (unlocked) {
        teams.forEach(t => { updated[match.id + "_" + t.id] = local[t.id]; });
      } else if (myTeam) {
        updated[match.id + "_" + myTeam.id] = local[myTeam.id];
      }
      onSave(updated);
      onClose();
    }
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.96)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:16,fontFamily:fonts.body}}>
      <div style={{background:T.card,borderRadius:16,border:`1px solid ${T.border}`,padding:24,width:"100%",maxWidth:480,maxHeight:"85vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <div style={{fontFamily:fonts.display,fontSize:20,fontWeight:700,color:isLocked?"#FF3D5A":"#F5A623",letterSpacing:2}}>
            {isLocked?"🔒 C/VC LOCKED":"👑 SET C / VC"}
          </div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:T.muted,fontSize:18,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{fontSize:12,color:T.muted,marginBottom:isLocked?8:16}}>M{match.matchNum} — {match.team1} vs {match.team2}</div>

        {isLocked && <div style={{background:T.dangerBg,border:`1px solid ${T.danger}33`,borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:12,color:T.danger}}>🔒 Captain/VC selections are locked.</div>}

        {teams.map(team => {
          const cap = local[team.id] || {};
          // Only show players whose iplTeam is one of the two match teams AND currently assigned to this team
          const matchTeams = [match.team1, match.team2].map(t => t.toLowerCase().trim());
          const teamPlayers = players.filter(p =>
            assignments[p.id] === team.id &&
            matchTeams.some(mt => (p.iplTeam || "").toLowerCase().trim().includes(mt) || mt.includes((p.iplTeam || "").toLowerCase().trim()))
          );
          const validPids = new Set(teamPlayers.map(p => p.id));
          // Clear stale C/VC selections — if saved player is no longer in squad, treat as unset
          const cleanCap = {
            captain: validPids.has(cap.captain) ? cap.captain : "",
            vc:      validPids.has(cap.vc)      ? cap.vc      : "",
          };
          const editable = canEdit(team.id);
          const isMyTeam = myTeam?.id === team.id;

          return (
            <div key={team.id} style={{background:T.card,borderRadius:10,border:"2px solid "+(isMyTeam?team.color+"66":team.color+"22"),padding:14,marginBottom:10,opacity:(!editable&&!isLocked&&!unlocked&&myTeam&&!isMyTeam)?0.5:1}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <div style={{fontFamily:fonts.display,fontWeight:700,fontSize:14,color:team.color}}>{team.name}</div>
                {isMyTeam && <span style={{fontSize:9,background:team.color+"22",color:team.color,border:"1px solid "+team.color+"44",borderRadius:10,padding:"1px 7px",fontWeight:700,letterSpacing:0.5}}>YOUR TEAM</span>}
                {!editable && !isLocked && !unlocked && myTeam && !isMyTeam && (
                  <span style={{fontSize:9,color:T.muted,background:"#1E2D4555",border:`1px solid ${T.border}`,borderRadius:10,padding:"1px 7px",fontWeight:700}}>VIEW ONLY</span>
                )}
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {["captain","vc"].map(role => (
                  <div key={role}>
                    <div style={{fontSize:10,color:T.muted,letterSpacing:1,marginBottom:6}}>{role==="captain"?"⭐ CAPTAIN (2×)":"🥈 VICE CAPTAIN (1.5×)"}</div>
                    {editable ? (
                      teamPlayers.length === 0 ? (
                        <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",fontSize:12,color:T.muted,fontFamily:fonts.body}}>
                          No players from {match.team1} or {match.team2}
                        </div>
                      ) : (
                      <select value={cleanCap[role]||""} onChange={e=>handleChange(team.id, role, e.target.value)}
                        style={{width:"100%",background:T.bg,border:"1px solid "+(isMyTeam?team.color+"44":"#1E2D45"),borderRadius:8,padding:"7px 10px",color:T.text,fontSize:13,fontFamily:fonts.body,cursor:"pointer",outline:"none"}}>
                        <option value="">— None —</option>
                        {teamPlayers.map(p=>(
                          <option key={p.id} value={p.id} disabled={(role==="vc"&&cleanCap.captain===p.id)||(role==="captain"&&cleanCap.vc===p.id)}>
                            {p.name} ({p.iplTeam})
                          </option>
                        ))}
                      </select>
                      )
                    ) : (
                      <div style={{background:T.bg,borderRadius:8,padding:"8px 12px",fontWeight:700,color:role==="captain"?"#F5A623":"#94A3B8",fontSize:14}}>
                        {teamPlayers.find(p=>p.id===cleanCap[role])?.name||"—"}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div style={{display:"flex",gap:8,marginTop:4}}>
          {!isLocked && unlocked && (
            <button onClick={()=>withPassword(()=>onSave({...captains,[match.id+"_locked"]:true}))}
              style={{flex:1,background:T.dangerBg,border:`1px solid ${T.danger}44`,borderRadius:10,padding:12,color:T.danger,fontFamily:fonts.body,fontWeight:800,fontSize:14,cursor:"pointer"}}>
              🔒 LOCK
            </button>
          )}
          {isLocked && unlocked && (
            <button onClick={()=>withPassword(()=>{const u={...captains};delete u[match.id+"_locked"];onSave(u);})}
              style={{flex:1,background:T.successBg,border:`1px solid ${T.success}33`,borderRadius:10,padding:12,color:T.success,fontFamily:fonts.body,fontWeight:800,fontSize:14,cursor:"pointer"}}>
              🔓 UNLOCK
            </button>
          )}
          <button onClick={isLocked ? onClose : saveAndClose}
            style={{flex:2,background:"#F5A623",border:"none",borderRadius:10,padding:12,color:T.bg,fontFamily:fonts.body,fontWeight:800,fontSize:15,cursor:"pointer"}}>
            {isLocked?"CLOSE":"✅ SAVE & CLOSE"}
          </button>
        </div>
      </div>
    </div>
  );
}

function App({ pitch, onLeave, onLeaveGuest, user, onLogout, myTeam, myPinHash, isGuest, isAdmin }) {
  // Clone banner shown at very top if this is a clone pitch
  const [page, setPage] = useState(() => { try { return localStorage.getItem("tb_page_" + pitch?.id) || "leaderboard"; } catch { return "leaderboard"; } });
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [matches, setMatches] = useState([]);
  const [tournaments, setTournaments] = useState([{id:"t_ipl",name:"Indian Premier League",open:true}]);
  const [expandedTournaments, setExpandedTournaments] = useState({"t_ipl":true});
  const [newTournamentName, setNewTournamentName] = useState("");
  const [expandedMatchId, setExpandedMatchId] = useState(null);
  const [captainMatch, setCaptainMatch] = useState(null);
  const [transferSubTab, setTransferSubTab] = useState("transfer"); // "transfer" | "snatch"
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
  const [fetchPlayerModal, setFetchPlayerModal] = useState(null);
  const [aiMatchModal, setAiMatchModal] = useState(null); // {tournamentId, tournamentName}
  const [aiMatchCount, setAiMatchCount] = useState(10);
  const [aiMatchGenerating, setAiMatchGenerating] = useState(false);
  const [aiMatchError, setAiMatchError] = useState("");
  const [aiMatchSuccess, setAiMatchSuccess] = useState("");
  const [aiMatchText, setAiMatchText] = useState("");
  const [aiMatchReplace, setAiMatchReplace] = useState(false); // null | { tournamentId, tournamentName }
  const [addTournamentModal, setAddTournamentModal] = useState(false);
  const [addTournamentSource, setAddTournamentSource] = useState(null);
  const [addTournamentSeries, setAddTournamentSeries] = useState([]);
  const [addTournamentSeriesLoading, setAddTournamentSeriesLoading] = useState(false);
  const [addTournamentSeriesInput, setAddTournamentSeriesInput] = useState('');
  const [addTournamentSelected, setAddTournamentSelected] = useState(null);
  const [fetchPlayerSource, setFetchPlayerSource] = useState(null); // 'cb' | 'cd'
  const [fetchPlayerSeries, setFetchPlayerSeries] = useState([]);
  const [fetchPlayerSeriesLoading, setFetchPlayerSeriesLoading] = useState(false);
  const [fetchPlayerSeriesInput, setFetchPlayerSeriesInput] = useState('');
  const [fetchPlayerSelectedSeries, setFetchPlayerSelectedSeries] = useState(null);
  const [teamIdsOpen, setTeamIdsOpen] = useState(false);
  const [ruleProposal, setRuleProposal] = useState(null);
  const [pitchConfig, setPitchConfig] = useState({});
  const [pointsConfig, setPointsConfig] = useState({
    run:1, four:8, six:12, fifty:10, century:20,
    wicket:25, fourWkt:8, fiveWkt:15, ecoBonus:10, ecoThreshold:6, ecoMinOvers:2,
    catch:8, stumping:12, runout:12,
    allRoundMinRuns:30, allRoundMinWkts:2, allRoundBonus:15,
    longestSix:50, captainMult:2, vcMult:1.5
  }); // loaded from supabase
  const [showRulesPanel, setShowRulesPanel] = useState(false);
  const [guestToast, setGuestToast] = useState(false);
  const [guestAllowed, setGuestAllowed] = useState(() => pitch?.guestAllowed !== false);
  const [adminClaimModal, setAdminClaimModal] = useState(false);
  const [adminClaimTeam, setAdminClaimTeam] = useState(null);
  const [adminPin, setAdminPin] = useState('');
  const [adminPinConfirm, setAdminPinConfirm] = useState('');
  const [adminPinErr, setAdminPinErr] = useState('');
  const TOURNEY_COLORS = ["#F5A623","#4F8EF7","#2ECC71","#A855F7","#FF3D5A","#06B6D4","#F97316","#EC4899"];
  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLastRead, setNotifLastRead] = useState(() => { try { return parseInt(localStorage.getItem('tb_notifLastRead')||'0'); } catch { return 0; } });
  const [broadcastInput, setBroadcastInput] = useState('');
  const [votePin, setVotePin] = useState('');
  const [votePinErr, setVotePinErr] = useState(''); // {pid, fromTeamId}
  const [snatchWindowStatus, setSnatchWindowStatus] = useState(getSnatchWindowStatus());
  const [liveScores, setLiveScores] = useState({});
  const pollRef = React.useRef(null);
  const [unlocked, setUnlocked] = useState(false);
  const [showPwModal, setShowPwModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [editPlayer, setEditPlayer] = useState(null); // player being edited
  const [smartStatsMatch, setSmartStatsMatch] = useState(null);
  const [squadView, setSquadView] = useState(false);
  const [showMVP, setShowMVP] = useState(false);
  const [showAllTimeXI, setShowAllTimeXI] = useState(false);
  const [showWeeklyReport, setShowWeeklyReport] = useState(false);
  const [showFixOwnership, setShowFixOwnership] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // {msg, fn}
  const [selectedBulk, setSelectedBulk] = useState([]); // toggle squad view
  const [teamFilter, setTeamFilter] = useState(null); // filter by fantasy team
  const [sortOrder, setSortOrder] = useState('default'); // default | az | za
  const [teamLogos, setTeamLogos] = useState({});
  const [safePlayers, setSafePlayers] = useState({}); // {teamId: [pid,pid,pid]}
  const [unsoldPool, setUnsoldPool] = useState([]);
  const [myHighlights, setMyHighlights] = useState({});
  const [myNotes, setMyNotes] = useState({});
  const [editingNote, setEditingNote] = useState(null);
  const [noteInput, setNoteInput] = useState(''); // manually managed unsold list
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
  const [transfersLoaded, setTransfersLoaded] = useState(false);
  const [snatch, setSnatch] = useState({
    weekNum: 1,
    active: null, // {byTeamId, pid, fromTeamId, pointsAtSnatch, startDate}
    history: [],
  });

  useEffect(() => {
    (async () => {
      try {
        // ── Instant load from localStorage cache ──────────────────────────
        try {
          const cached = localStorage.getItem('tb_appdata_' + _pitchId);
          if (cached) {
            const d = JSON.parse(cached);
            if(d.teams)       setTeams(d.teams);
            if(d.players)     setPlayers(d.players);
            if(d.assignments) setAssignments(d.assignments);
            if(d.matches)     setMatches(d.matches);
            if(d.captains)    setCaptains(d.captains);
            // Note: transfers intentionally NOT loaded from cache — always fetch fresh from Supabase
            if(d.snatch && typeof d.snatch === 'object')       setSnatch(d.snatch);
            if(d.tournaments && Array.isArray(d.tournaments))  { setTournaments(d.tournaments); const exp={}; d.tournaments.forEach(t=>exp[t.id]=true); setExpandedTournaments(exp); }
            setAppReady(true); // show UI immediately from cache
          }
        } catch {}

        // ── Pass 1: Critical keys from Supabase ───────────────────────────
        const criticalKeys = ["teams","assignments","matches","captains","tnames","numteams","pwhash","transfers","snatch","teamIdentity","pointsConfig","tournaments","safePlayers","pitchConfig"];
        const rawCritical = criticalKeys.map(k => _pitchId + "_" + k);
        const critResults = await sbGetMany(rawCritical);
        const [t,a,m,c,tn,nt,ph,tr,sn,ti,pc,tv,sp,pcfg] = critResults;
        if(t) setTeams(t);
        if(a) setAssignments(a);
        if(m) setMatches(m);
        if(c) setCaptains(c);
        if(tn) setTNames(tn);
        if(nt) setNumTeams(nt);
        if(ph) setPwHash(ph);
        else { const ah = await sbGet(_pitchId + "_adminHash"); if(ah) { setPwHash(ah); storeSet("pwhash", ah); } }
        if(tr && typeof tr === 'object') { setTransfers(tr); setTransfersLoaded(true); }
        else setTransfersLoaded(true); // even if null, we know Supabase responded
        if(sn && typeof sn === 'object') setSnatch(sn);
        if(ti && typeof ti === 'object') setTeamIdentity(ti);
        if(pc && typeof pc === 'object') setPointsConfig(prev=>({...prev,...pc}));
        if(tv && Array.isArray(tv)) { setTournaments(tv); const exp={}; tv.forEach(t=>exp[t.id]=true); setExpandedTournaments(exp); }
        if(sp) setSafePlayers(sp);
        if(pcfg && typeof pcfg === 'object') setPitchConfig(pcfg);
        setAppReady(true);

        // ── Pass 2: Heavy keys in background ─────────────────────────────
        const heavyKeys = ["players","points","ownershipLog","recoveryHash","teamLogos","unsoldPool","ruleProposal"];
        const rawHeavy = heavyKeys.map(k => _pitchId + "_" + k);
        const heavyResults = await sbGetMany(rawHeavy);
        const [p,pts,ol,rh,tl,up,rp] = heavyResults;
        if(p) setPlayers(p);
        if(pts) setPoints(pts);
        if(ol && typeof ol === 'object') setOwnershipLog(ol);
        if(rh) setRecoveryHash(rh);
        if(tl) setTeamLogos(tl);
        if(up) setUnsoldPool(up);
        if(rp && typeof rp === 'object') setRuleProposal(rp);

        // ── Save fresh data to localStorage for next instant load ─────────
        try {
          const toCache = { teams: t, players: p, assignments: a, matches: m, captains: c, snatch: sn, tournaments: tv };
          localStorage.setItem('tb_appdata_' + _pitchId, JSON.stringify(toCache));
        } catch {}

      } catch(e) {
        console.error("Load error:", e.message);
        setAppReady(true);
      }
    })();
  }, []);

  // Auto-navigate admin to setup when no teams exist
  useEffect(() => {
    if (!appReady) return;
    if (isAdmin && teams.length === 0 && page !== "setup") {
      setPage("setup");
    }
  }, [appReady, isAdmin, teams.length]);

  // ── Refs to prevent double-firing of auto actions ────────────────────────
  const autoReleaseRanRef = React.useRef(false);
  const autoPickRanRef    = React.useRef(null); // stores last pickDeadline processed

  // ── AUTO-RELEASE & AUTO-START TRADE ──────────────────────────────────────
  useEffect(() => {
    if (!appReady) return;

    // ── Helper: IST date string ───────────────────────────────────────────
    const istNow = () => new Date(Date.now() + new Date().getTimezoneOffset()*60000 + 5.5*3600000);

    // ── Helper: find next match start time ───────────────────────────────
    const getNextMatchTime = () => {
      if (transfers.matchStartTime) return new Date(transfers.matchStartTime);
      const now = istNow();
      const todayStr = now.toISOString().split("T")[0]; // IST date
      const upcoming = [...matches]
        .filter(m => m.status !== "completed" && m.date >= todayStr)
        .sort((a, b) => {
          const da = a.date + (a.time ? " " + a.time : " 20:00");
          const db = b.date + (b.time ? " " + b.time : " 20:00");
          return da.localeCompare(db);
        });
      if (upcoming.length > 0) {
        const m = upcoming[0];
        const timeStr = m.time || "20:00";
        const dt = new Date(`${m.date}T${timeStr}:00+05:30`);
        if (dt > Date.now()) return dt;
      }
      return new Date(Date.now() + 8 * 3600000); // fallback
    };

    // ── Auto-release: when release deadline passes ────────────────────────
    if (transfers.phase === 'release') {
      const deadline = transfers.releaseDeadline ? new Date(transfers.releaseDeadline) : null;
      const isAfterNoon = istNow().getUTCHours() >= 12;

      // Only auto-release if: deadline passed AND past noon AND haven't run yet this session
      if (deadline && Date.now() > deadline.getTime() && isAfterNoon && !autoReleaseRanRef.current) {
        autoReleaseRanRef.current = true; // prevent double-fire in this session

        const newReleases = { ...transfers.releases };
        const newAssign = { ...assignments };
        const newPool = [...unsoldPool];
        const notifications = [];

        for (const team of teams) {
          const released = [...(newReleases[team.id] || [])];
          if (released.length >= 3) { newReleases[team.id] = released; continue; }
          const eligible = players.filter(p =>
            assignments[p.id] === team.id &&
            !released.includes(p.id) &&
            !Object.values(safePlayers || {}).flat().includes(p.id)
          );
          const shuffled = [...eligible].sort(() => Math.random() - 0.5);
          const toRelease = shuffled.slice(0, 3 - released.length);
          for (const p of toRelease) {
            delete newAssign[p.id];
            if (!newPool.includes(p.id)) newPool.push(p.id);
            released.push(p.id);
          }
          newReleases[team.id] = released;
          if (toRelease.length > 0) {
            notifications.push(`⚠️ System auto-released ${toRelease.map(p=>p.name).join(", ")} for ${team.name} (missed deadline)`);
          }
        }

        // Save auto-released players
        updAssign(newAssign);
        setUnsoldPool(newPool); storeSet("unsoldPool", newPool);
        for (const msg of notifications) pushNotif('transfer', msg, '🤖');

        // Auto-start trade phase immediately
        const matchTime = getNextMatchTime();
        const totalPicks = Object.values(newReleases).reduce((s, arr) => s + arr.length, 0);
        const msAvail = Math.max(0, matchTime.getTime() - Date.now() - 30 * 60000);
        const msPerPick = totalPicks > 0 ? Math.max(15 * 60000, Math.floor(msAvail / totalPicks)) : 45 * 60000;
        const minPerPick = Math.round(msPerPick / 60000);
        const firstTeam = [...teams].sort((a,b) =>
          players.filter(p => newAssign[p.id] === a.id).length -
          players.filter(p => newAssign[p.id] === b.id).length
        )[0]?.id;
        updTransfers({
          ...transfers,
          phase: 'trade',
          releases: newReleases,
          currentPickTeam: firstTeam,
          pickDeadline: new Date(Date.now() + msPerPick).toISOString(),
          matchStartTime: matchTime.toISOString(),
          msPerPick,
          tradedPairs: [],
          ineligible: [],
        });
        pushNotif('transfer', `🏁 Trade phase auto-started! ⏱ ${minPerPick} min per pick · Match at ${matchTime.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})} IST`, '🏁');
      }
    }

    // ── Auto-pick: when pick deadline expires ─────────────────────────────
    // Guard: only fire once per unique pickDeadline value
    if (
      transfers.phase === 'trade' &&
      transfers.pickDeadline &&
      transfers.currentPickTeam &&
      autoPickRanRef.current !== transfers.pickDeadline && // not already processed
      Date.now() > new Date(transfers.pickDeadline).getTime()
    ) {
      autoPickRanRef.current = transfers.pickDeadline; // mark as processed

      const currentTeamId = transfers.currentPickTeam;
      const released = (transfers.releases[currentTeamId] || []);
      const traded = (transfers.tradedPairs || []).filter(p => p.teamId === currentTeamId).map(p => p.releasedPid);
      const releasedPid = released.find(pid => !traded.includes(pid));

      if (releasedPid && unsoldPool.length > 0) {
        const available = unsoldPool
          .map(pid => players.find(p => p.id === pid))
          .filter(Boolean)
          .sort((a, b) => {
            const pA = Object.values(points[a.id]||{}).reduce((s,d)=>s+(d?.base||0),0);
            const pB = Object.values(points[b.id]||{}).reduce((s,d)=>s+(d?.base||0),0);
            return pB - pA;
          });
        const pick = available[0];
        if (pick) {
          const newAssign2 = { ...assignments, [pick.id]: currentTeamId };
          const newPool2 = unsoldPool.filter(x => x !== pick.id);
          const newLog = recordOwnership(pick.id, currentTeamId, ownershipLog);
          updAssign(newAssign2);
          setUnsoldPool(newPool2); storeSet("unsoldPool", newPool2);
          updOwnership(newLog);
          const newPairs = [...(transfers.tradedPairs||[]), { teamId: currentTeamId, pickedPid: pick.id, releasedPid, timestamp: new Date().toISOString(), autoPicked: true }];
          const msPerPick = transfers.msPerPick || 45*60000;
          const getNext = () => {
            const order = [...teams].sort((a,b) =>
              players.filter(p=>newAssign2[p.id]===a.id).length -
              players.filter(p=>newAssign2[p.id]===b.id).length
            ).map(t=>t.id);
            const idx = order.indexOf(currentTeamId);
            for (let i = 1; i <= order.length; i++) {
              const tid = order[(idx+i)%order.length];
              const rel = (transfers.releases[tid]||[]);
              const trd = newPairs.filter(p=>p.teamId===tid).map(p=>p.releasedPid);
              if (rel.filter(pid=>!trd.includes(pid)).length > 0) return tid;
            }
            return null;
          };
          const nextTeam = getNext();
          const newPhase = nextTeam ? 'trade' : 'done';
          updTransfers({ ...transfers, tradedPairs: newPairs, currentPickTeam: nextTeam, pickDeadline: nextTeam ? new Date(Date.now()+msPerPick).toISOString() : null, phase: newPhase });
          pushNotif('transfer', `🤖 System auto-picked ${pick.name} for ${teams.find(t=>t.id===currentTeamId)?.name} (time expired)`, '🤖');
        }
      }
    }
  }, [appReady, transfers.phase, transfers.pickDeadline, transfers.releaseDeadline]);
  // Fires for everyone (not just admin) — silently opens release window if
  // it's within the configured transfer window and still closed.
  useEffect(() => {
    if (!appReady) return;
    if (!transfersLoaded) return; // wait for Supabase to respond before acting
    if (transfers.phase !== 'closed') return;

    const now = new Date();
    const ist = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 5.5 * 3600000);
    const day = ist.getUTCDay(), h = ist.getUTCHours(), m = ist.getUTCMinutes();

    const parseDay = (str, def) => {
      const days = {Sunday:0,Monday:1,Tuesday:2,Wednesday:3,Thursday:4,Friday:5,Saturday:6};
      if (!str) return def;
      const d = str.split(" ")[0];
      return days[d] ?? def;
    };
    const parseTime = (str, defH, defM) => {
      if (!str) return {h: defH, m: defM};
      const parts = str.split(" ");
      const hhmm = parts[parts.length - 2] || "11:59";
      const ampm = parts[parts.length - 1] || "PM";
      let [hh, mm] = hhmm.split(":").map(Number);
      if (ampm === "PM" && hh !== 12) hh += 12;
      if (ampm === "AM" && hh === 12) hh = 0;
      return {h: hh, m: mm};
    };

    const startDay = parseDay(pitchConfig?.transferStart, 0);
    const startTime = parseTime(pitchConfig?.transferStart, 23, 59);
    const endDay = parseDay(pitchConfig?.transferEnd, 1);
    const endTime = parseTime(pitchConfig?.transferEnd, 11, 0);

    const afterStart = day === startDay && (h > startTime.h || (h === startTime.h && m >= startTime.m));
    const beforeEnd = day === endDay && (h < endTime.h || (h === endTime.h && m < endTime.m));
    const betweenDays = startDay !== endDay && (
      startDay < endDay
        ? (day > startDay && day < endDay)
        : (day > startDay || day < endDay)
    );

    const inWindow = afterStart || beforeEnd || betweenDays;
    if (!inWindow) return;

    // Calculate correct deadline
    const dlEndDay = parseDay(pitchConfig?.transferEnd, 1);
    const dlEndTime = parseTime(pitchConfig?.transferEnd, 11, 0);
    const istNow2 = new Date(Date.now() + new Date().getTimezoneOffset() * 60000 + 5.5 * 3600000);
    const daysUntilEnd = (dlEndDay - istNow2.getUTCDay() + 7) % 7;
    const deadline = new Date(istNow2);
    deadline.setUTCDate(istNow2.getUTCDate() + daysUntilEnd);
    deadline.setUTCHours(dlEndTime.h - 5, dlEndTime.m + 30, 0, 0);

    const updated = { ...transfers, phase: 'release', weekNum: transfers.weekNum, releaseDeadline: deadline.toISOString() };
    updTransfers(updated);
    pushNotif('transfer', 'Transfer window is now open — release your players!', '📤');
  }, [appReady, transfersLoaded, transfers.phase, transfers.weekNum, pitchConfig]);

  // ── LOAD USER-SPECIFIC NOTES & HIGHLIGHTS ────────────────────────────────
  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      try {
        const emailKey = user.email.replace(/[@.]/g, "_");
        const hlKey    = _pitchId + "_hl_" + emailKey;
        const notesKey = _pitchId + "_notes_" + emailKey;
        const [hl, notes] = await sbGetMany([hlKey, notesKey]);
        if (hl && typeof hl === "object") setMyHighlights(hl);
        if (notes && typeof notes === "object") setMyNotes(notes);
      } catch {}
    })();
  }, [user?.email]);

  // ── CRICKETDATA fetch ──────────────────────────────────────────────────────
  const fetchFromCricketData = async (tournamentId, tournamentName) => {
    setLoading("Fetching from CricketData for " + tournamentName + "…");
    try {
      // First fetch series to understand structure
      const fetchWithTimeout = (url, ms=8000) => {
        const controller = new AbortController();
        const timer = setTimeout(()=>controller.abort(), ms);
        return fetch(url, {signal:controller.signal}).then(r=>r.json()).catch(()=>({})).finally(()=>clearTimeout(timer));
      };
      const [scheduleRes, liveRes, resultsRes] = await Promise.all([
        fetchWithTimeout("/api/cricketdata?path=cricket-schedule"),
        fetchWithTimeout("/api/cricketdata?path=currentMatches"),
        fetchWithTimeout("/api/cricketdata?path=cricket-results"),
      ]);
      const seriesRes = {};

      // Parse matches from CricketData schedule structure:
      // response.schedules[].scheduleAdWrapper.matchScheduleList[].{seriesName, matchInfo[]}
      const found = [];
      const schedules = scheduleRes?.response?.schedules || [];
      // CricketData live scores structure: response is array of live match objects
      const liveList = liveRes?.response || [];
      const liveMatches = Array.isArray(liveList) ? liveList : [];


      const liveMap = {};
      liveMatches.forEach(m => {
        const id = m?.matchId || m?.matchInfo?.matchId || m?.id;
        if (id) liveMap[String(id)] = m;
      });






      // Update match statuses using cricbuzzId (same IDs across both sources)
      const updatedExisting = matches.map(m => {
        if (m.status === "completed") return m;
        const lm = liveMap[String(m.cricbuzzId)];
        if (lm) {
          const isComplete = lm?.matchStatus === "complete" || lm?.status === "Complete";
          return {...m, status: isComplete ? "completed" : "live"};
        }
        return m;
      });
      if (JSON.stringify(updatedExisting) !== JSON.stringify(matches)) {
        updMatches(updatedExisting);
      }

      schedules.forEach(s => {
        (s?.scheduleAdWrapper?.matchScheduleList || []).forEach(item => {
          const seriesName = item?.seriesName || "";
          if (!seriesName.toLowerCase().includes(tournamentName.toLowerCase())) return;
          (item?.matchInfo || []).forEach(m => {
            const live = liveMap[m?.matchId];
            found.push({ info: m, live });
          });
        });
      });

      // Add completed matches from results endpoint
      const resultsList = resultsRes?.response || [];
      const completedMatches = Array.isArray(resultsList) ? resultsList : [];
      completedMatches.forEach(m => {
        const seriesName = m?.seriesName || m?.series || m?.name || "";
        if (!seriesName.toLowerCase().includes(tournamentName.toLowerCase())) return;
        const matchId = m?.matchId || m?.id;
        if (!matchId) return;
        if (!found.some(f => String(f.info?.matchId) === String(matchId))) {
          found.push({ info: { ...m, matchId }, live: { ...m, matchStatus: "complete", status: "Complete" } });
        }
      });

      if (found.length === 0) {
        // Show available series names to help admin find correct name
        const availableSeries = [];
        const debugSeries = [];
        schedules.forEach(s => {
          (s?.scheduleAdWrapper?.matchScheduleList || []).forEach(item => {
            const n = item?.seriesName || "";
            if(n && !debugSeries.includes(n)) debugSeries.push(n);
          });
        });
        const allItems2 = debugSeries;
        allItems2.forEach(item => {
          const n = item || "";
          if (n && !availableSeries.includes(n)) availableSeries.push(n);
        });
        alert("No matches found for [" + tournamentName + "] in CricketData.\n\nAvailable series:\n" + (availableSeries.slice(0,10).join("\n") || "None returned"));
        setLoading(""); return;
      }

      const existingIds = new Set(matches.map(m => m.cricbuzzId).filter(Boolean));
      const updated = [...matches];
      let nextNum = matches.length + 1;

      found.forEach(({ info: m, live }) => {
        if (!m?.matchId) return;
        const existing = updated.find(x => x.cdMatchId === m.matchId || x.cricbuzzId === m.matchId);
        const isLive = !!live;
        const isComplete = m?.status === "Complete" || m?.matchStatus === "complete";
        const status = isComplete ? "completed" : isLive ? "live" : "upcoming";

        if (existing) {
          existing.status = existing.status === "completed" ? "completed" : status;
          if (!existing.cdMatchId) existing.cdMatchId = m.matchId;
        } else if (!existingIds.has(m.matchId)) {
          updated.push({
            id: "cd_" + m.matchId,
            cricbuzzId: m.matchId,
            tournamentId,
            matchNum: nextNum++,
            date: m.startDate ? new Date(parseInt(m.startDate)).toISOString().split("T")[0] : "TBD",
            time: m.startDate ? new Date(parseInt(m.startDate)).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Kolkata"}) : "",
            team1: m.team1?.teamSName || m.team1?.teamName || "TBA",
            team2: m.team2?.teamSName || m.team2?.teamName || "TBA",
            venue: m.venueInfo?.ground ? m.venueInfo.ground + (m.venueInfo.city ? ", " + m.venueInfo.city : "") : "TBD",
            status,
            result: m.matchDesc || null,
          });
        }
      });

      updMatches(updated);
      const tM = updated.filter(m => m.tournamentId === tournamentId);
      alert("CricketData: " + tM.filter(m=>m.status==="completed").length + " completed, " + tM.filter(m=>m.status==="live").length + " live, " + tM.filter(m=>m.status==="upcoming").length + " upcoming.");
    } catch(e) {
      alert("CricketData error: " + e.message);
    }
    setLoading("");
  };



  const fetchTournamentSeriesSuggestions = async (source) => {
    setAddTournamentSeriesLoading(true);
    setAddTournamentSeries([]);
    try {
      if (source === 'cb') {
        const [r1, r2] = await Promise.all([
          fetch("/api/cricbuzz?path=" + encodeURIComponent("series/v1/domestic")).then(r=>r.json()).catch(()=>({})),
          fetch("/api/cricbuzz?path=" + encodeURIComponent("series/v1/international")).then(r=>r.json()).catch(()=>({})),
        ]);
        const all = [];
        [r1, r2].forEach(data => {
          (data?.seriesMapProto || data?.seriesMap || []).forEach(month => {
            (month?.series || []).forEach(s => {
              if (s?.id && s?.name) all.push({ id: s.id, name: s.name, source: 'cb' });
            });
          });
        });
        setAddTournamentSeries(all);
      } else {
        const res = await fetch("/api/cricketdata?path=cricket-series").then(r=>r.json()).catch(()=>({}));
        const seriesData = res?.response || [];
        const all = [];
        (Array.isArray(seriesData) ? seriesData : []).forEach(s => {
          const name = s?.title || s?.series || s?.name || "";
          const id = s?.url || s?.id || name;
          if (name) all.push({ id, name, source: 'cd' });
        });
        setAddTournamentSeries(all);
      }
    } catch(e) { console.error(e); }
    setAddTournamentSeriesLoading(false);
  };

  const confirmAddTournament = async () => {
    if (!addTournamentSelected) return;
    const newT = {
      id: "t_" + Date.now(),
      name: addTournamentSelected.name,
      seriesId: addTournamentSelected.id,
      source: addTournamentSource,
    };
    const updated = [...tournaments, newT];
    setTournaments(updated);
    setExpandedTournaments(prev => ({...prev, [newT.id]: true}));
    storeSet("tournaments", updated);
    setAddTournamentModal(false);
    setAddTournamentSource(null);
    setAddTournamentSeries([]);
    setAddTournamentSeriesInput('');
    setAddTournamentSelected(null);
  };

  const fetchSeriesSuggestions = async (source) => {
    setFetchPlayerSeriesLoading(true);
    setFetchPlayerSeries([]);
    try {
      if (source === 'cb') {
        // Cricbuzz: fetch series list
        const res = await fetch("/api/cricbuzz?path=" + encodeURIComponent("series/v1/domestic")).then(r=>r.json()).catch(()=>({}));
        const res2 = await fetch("/api/cricbuzz?path=" + encodeURIComponent("series/v1/international")).then(r=>r.json()).catch(()=>({}));
        const all = [];
        [res, res2].forEach(data => {
          (data?.seriesMapProto || data?.seriesMap || []).forEach(month => {
            (month?.series || []).forEach(s => {
              if (s?.id && s?.name) all.push({ id: s.id, name: s.name });
            });
          });
        });
        setFetchPlayerSeries(all);
      } else {
        // CricketData: fetch series
        const res = await fetch("/api/cricketdata?path=cricket-series").then(r=>r.json()).catch(()=>({}));
        const seriesData = res?.response || [];
        const all = [];
        (Array.isArray(seriesData) ? seriesData : []).forEach(s => {
          const name = s?.title || s?.series || s?.name || "";
          const id = s?.url || s?.id || name;
          if (name) all.push({ id, name });
        });
        setFetchPlayerSeries(all);
      }
    } catch(e) {
      console.error("Series fetch error:", e);
    }
    setFetchPlayerSeriesLoading(false);
  };

  const fetchPlayersFromSeries = async () => {
    if (!fetchPlayerSelectedSeries) return;
    setFetchPlayerModal(false);
    if (fetchPlayerSource === 'cb') {
      // Use existing Cricbuzz fetchPlayers with selected series ID
      const seriesId = fetchPlayerSelectedSeries.id;
      await fetchPlayersFromCricbuzz(seriesId);
    } else {
      alert("CricketData player fetch coming soon — use Cricbuzz for now.");
    }
  };


  // ── NOTIFICATIONS ─────────────────────────────────────────────────────────
  const pushNotif = async (type, text, emoji) => {
    const data = await storeGet("notifications") || {};
    const existing = data.list || [];
    const notif = { id: Date.now().toString(), type, text, emoji: emoji||"🔔", ts: Date.now() };
    const updated = [...existing, notif].slice(-30);
    await storeSet("notifications", {list: updated});
    setNotifications(updated);
  };

  const loadNotifications = async () => {
    const data = await storeGet("notifications") || {};
    setNotifications(data.list || []);
  };

  const markNotifsRead = () => {
    const now = Date.now();
    setNotifLastRead(now);
    try { localStorage.setItem('tb_notifLastRead', now.toString()); } catch {}
  };

  const clearNotifications = async () => {
    await storeSet("notifications", {list: []});
    setNotifications([]);
  };

  const broadcastNotif = async () => {
    if (!broadcastInput.trim()) return;
    await pushNotif("broadcast", broadcastInput.trim(), "📢");
    setBroadcastInput('');
  };

  React.useEffect(() => {
    loadNotifications();
    const t = setInterval(loadNotifications, 30000);
    return () => clearInterval(t);
  }, []);

  const unreadNotifCount = notifications.filter(n => n.ts > notifLastRead).length;

  const nav=(pg)=>{setPage(pg);storeSet("page",pg);try{localStorage.setItem("tb_page_"+pitch?.id,pg);}catch{}};
  const upd=(setter,key)=>(val)=>{setter(val);storeSet(key,val);};
  const updTeams=upd(setTeams,"teams"),updAssign=upd(setAssignments,"assignments"),
        updMatches=upd(setMatches,"matches"),updCaptains=upd(setCaptains,"captains"),
        updPoints=upd(setPoints,"points");

  const saveHighlights = async (updated) => { setMyHighlights(updated); await storeSet("hl_"+(user?.email||"").replace(/[@.]/g,"_"), updated); };
  const saveNotes = async (updated) => { setMyNotes(updated); await storeSet("notes_"+(user?.email||"").replace(/[@.]/g,"_"), updated); };

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
    pushNotif('transfer', 'Transfer window opened — release your players now', '📤');
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
    // Archive current window to history before clearing
    const hasActivity = (transfers.tradedPairs||[]).length > 0 || Object.values(transfers.releases||{}).some(a=>a.length>0);
    const newHistory = hasActivity
      ? [...(transfers.history||[]), { week: transfers.weekNum, releases: transfers.releases||{}, tradedPairs: transfers.tradedPairs||[], date: new Date().toISOString() }]
      : (transfers.history||[]);
    const updated = {
      weekNum: transfers.weekNum + 1,
      phase: 'closed', releases: {}, picks: [], tradedPairs: [], ineligible: [],
      currentPickTeam: null, pickDeadline: null,
      history: newHistory,
    };
    updTransfers(updated);
  });

  // ── SNATCH HELPERS ───────────────────────────────────────────────────────






  const uploadTeamLogo=(teamId, file)=>{
    const reader = new FileReader();
    reader.onload = (e) => {
      const newLogos = {...teamLogos, [teamId]: e.target.result};
      setTeamLogos(newLogos);
      storeSet('teamLogos', newLogos);
    };
    reader.readAsDataURL(file);
  };

  const showGuestMsg = () => {
    setGuestToast(true);
    setTimeout(() => setGuestToast(false), 2500);
  };

  const withPassword=(action)=>{
    if(isGuest){showGuestMsg();return;}
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

  const fetchPlayersFromCricbuzz=async(seriesId)=>{
    const useSeriesId = seriesId || 9241;
    setLoading("Fetching squads from Cricbuzz…");
    try {
      let allPlayers = [];
      let cricbuzzSuccess = false;

      try {
        setLoading("Fetching squad list from Cricbuzz…");
        const squadsRes = await fetch(`/api/cricbuzz?path=${encodeURIComponent("series/v1/" + useSeriesId + "/squads")}`);
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

          const teamRes = await fetch(`/api/cricbuzz?path=${encodeURIComponent("series/v1/" + useSeriesId + "/squads/" + squadId)}`);
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
      // Record ownership — always use season start so ALL historical match points count
      const seasonStart = "2025-01-01T00:00:00.000Z";
      const existingPeriods = ownershipLog[pid] || [];
      const alreadyOwned = existingPeriods.some(o => o.teamId === tid && !o.to);
      if (alreadyOwned) {
        // Fix existing period — ensure from is season start (in case it was set to today)
        const updatedPeriods = existingPeriods.map(o =>
          o.teamId === tid && !o.to ? { ...o, from: seasonStart } : o
        );
        updOwnership({ ...ownershipLog, [pid]: updatedPeriods });
      } else {
        // Close any open period for another team, open new from season start
        const updatedPeriods = existingPeriods.map(o => !o.to ? {...o, to: new Date().toISOString()} : o);
        updatedPeriods.push({ teamId: tid, from: seasonStart, to: null });
        updOwnership({ ...ownershipLog, [pid]: updatedPeriods });
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

  // ── CRICBUZZ fetch ────────────────────────────────────────────────────────
  const generateAiMatches = async () => {
    if (!aiMatchModal) return;
    const { tournamentId, tournamentName } = aiMatchModal;
    if (!aiMatchText.trim()) { setAiMatchError("Please paste the schedule text first."); return; }
    setAiMatchGenerating(true);
    setAiMatchError("");
    try {
      const prompt = `Extract ALL cricket matches from this Cricbuzz schedule text. Return ONLY a JSON array, nothing else.

Each match object must have exactly these fields:
- matchNum: integer match number
- team1: short code like SRH, RCB, MI, CSK, KKR, RR, GT, PBKS, DC, LSG
- team2: short code
- date: YYYY-MM-DD format
- venue: stadium name and city
- status: "completed" if scores/result shown, "upcoming" if not
- result: result string if available, else empty string

Team name mappings:
Sunrisers Hyderabad=SRH, Royal Challengers Bengaluru=RCB, Royal Challengers Bangalore=RCB,
Mumbai Indians=MI, Kolkata Knight Riders=KKR, Chennai Super Kings=CSK,
Rajasthan Royals=RR, Gujarat Titans=GT, Punjab Kings=PBKS,
Delhi Capitals=DC, Lucknow Super Giants=LSG

IMPORTANT: Extract ONLY what is in the text. Do not invent matches.

Schedule text:
${aiMatchText.slice(0, 3000)}`;

      const text = await callAI(prompt, "You extract cricket match data from text. Return ONLY a valid JSON array. No markdown fences. No explanation. No extra text.");
      const clean = text.replace(/\`\`\`json|\`\`\`/g, "").trim();
      const jsonStart = clean.indexOf("[");
      const jsonEnd = clean.lastIndexOf("]");
      if (jsonStart === -1 || jsonEnd === -1) {
        setAiMatchError("Could not parse schedule. Try pasting a smaller portion of the text.");
        setAiMatchGenerating(false); return;
      }
      const parsed = JSON.parse(clean.slice(jsonStart, jsonEnd + 1));
      if (!Array.isArray(parsed) || parsed.length === 0) {
        setAiMatchError("No matches found in the pasted text.");
        setAiMatchGenerating(false); return;
      }

      const base = aiMatchReplace ? matches.filter(m => m.tournamentId !== tournamentId) : [...matches];
      const existing = aiMatchReplace ? [] : matches.filter(m => m.tournamentId === tournamentId);
      let nextNum = Math.max(...(existing.map(m => m.matchNum || 0)), 0) + 1;
      let added = 0, skipped = 0;

      parsed.forEach(m => {
        if (!m.team1 || !m.team2 || !m.date) return;
        if (!aiMatchReplace) {
          const isDup = existing.some(ex =>
            ex.date === m.date &&
            ((ex.team1 === m.team1 && ex.team2 === m.team2) ||
             (ex.team1 === m.team2 && ex.team2 === m.team1))
          );
          if (isDup) { skipped++; return; }
        }
        base.push({
          id: "ai_" + tournamentId + "_" + (m.matchNum || nextNum) + "_" + Date.now() + "_" + Math.random().toString(36).slice(2),
          tournamentId,
          matchNum: m.matchNum || nextNum,
          team1: m.team1, team2: m.team2,
          date: m.date, time: "7:30 PM",
          venue: m.venue || "",
          status: m.status || "upcoming",
          result: m.result || "",
          aiGenerated: true,
        });
        nextNum++; added++;
      });

      updMatches(base);
      setAiMatchSuccess("Added " + added + " matches" + (skipped > 0 ? " (" + skipped + " skipped — already exist)" : "") + ". Sync stats for completed matches via scorecard paste.");
    } catch(e) {
      setAiMatchError("Error: " + e.message);
    }
    setAiMatchGenerating(false);
  };

  
    const fetchMatchesForTournament = async (tournamentId, tournamentName) => {
    setLoading("Fetching from Cricbuzz for " + tournamentName + "…");
    try {
      const extractForTournament = (data) => {
        const found = [];
        if (!data || !data.typeMatches) return found;
        for (const type of data.typeMatches) {
          for (const series of (type.seriesMatches || [])) {
            const sm = series.seriesAdWrapper || series;
            if (sm.seriesName && sm.seriesName.toLowerCase().includes(tournamentName.toLowerCase())) {
              for (const match of (sm.matches || [])) {
                found.push({info: match.matchInfo, score: match.matchScore});
              }
            }
          }
        }
        return found;
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
          tournamentId: tournamentId,
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
      const tMatches = updated.filter(m => m.tournamentId === tournamentId);
      const live = tMatches.filter(m => m.status === "live").length;
      const upcoming = tMatches.filter(m => m.status === "upcoming").length;
      const completed = tMatches.filter(m => m.status === "completed").length;
      alert(tournamentName + ": " + completed + " completed, " + live + " live, " + upcoming + " upcoming.");
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

  // Fix active snatch pointsAtSnatch to include C/VC multipliers — only pre-snatch matches
  useEffect(()=>{
    if(!snatch.active) return;
    const {pid, fromTeamId, startDate} = snatch.active;
    const snatchDateStr = startDate?.split('T')[0] || '9999-01-01';
    const correctPts = Object.entries(points[pid]||{}).reduce((s,[mid,d])=>{
      const m = matches.find(x=>x.id===mid);
      if(!m || m.date >= snatchDateStr) return s; // skip post-snatch matches
      const cap = captains[mid+"_"+fromTeamId]||{};
      let pts = d.base||0;
      if(cap.captain===pid) pts*=2; else if(cap.vc===pid) pts*=1.5;
      return s + Math.round(pts);
    },0);
    if(correctPts !== snatch.active.pointsAtSnatch) {
      const updated = {...snatch, active:{...snatch.active, pointsAtSnatch: correctPts}};
      setSnatch(updated);
      storeSet("snatch", updated);
    }
  },[snatch.active?.pid, snatch.active?.pointsAtSnatch, points, captains, matches]);

  const getTeamTotal=(teamId)=>{
    let total=0;
    const allPids = new Set([
      ...players.filter(p=>assignments[p.id]===teamId).map(p=>p.id),
      ...Object.entries(ownershipLog).filter(([pid,periods])=>periods.some(o=>o.teamId===teamId)).map(([pid])=>pid)
    ]);

    // Add snatched-in player (currently on loan to this team)
    if (snatch.active?.byTeamId===teamId) allPids.add(snatch.active.pid);
    // Add snatched-away player to original team so freeze logic runs
    if (snatch.active?.fromTeamId===teamId) allPids.add(snatch.active.pid);

    for(const pid of allPids){
      const periods = (ownershipLog[pid]||[]).filter(o=>o.teamId===teamId);

      // If this player is currently snatched AWAY from this team — freeze at pointsAtSnatch
      const isSnatchedAway = snatch.active?.pid===pid && 
        (snatch.active?.fromTeamId===teamId || 
         (assignments[pid]===teamId && snatch.active?.byTeamId!==teamId));
      if(isSnatchedAway) {
        total += snatch.active.pointsAtSnatch || 0;
        continue;
      }

      // If this player is currently snatched IN to this team — only count post-snatch points with C/VC
      if(snatch.active?.pid===pid && snatch.active?.byTeamId===teamId) {
        const snatchDate = snatch.active.startDate.split('T')[0];
        for(const[mid,d] of Object.entries(points[pid]||{})){
          const m = matches.find(x=>x.id===mid);
          if(!m || m.date < snatchDate) continue;
          const cap=captains[mid+"_"+teamId]||{};
          let pts=d.base;
          if(cap.captain===pid) pts*=2; else if(cap.vc===pid) pts*=1.5;
          total+=Math.round(pts);
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
        // If no ownership log periods, player must be currently assigned to this team
        if(periods.length === 0) {
          if(assignments[pid] !== teamId) continue; // not their player — skip
          // Currently assigned, count all points
          const cap=captains[mid+"_"+teamId]||{};
          let pts=d.base;
          if(cap.captain===pid)pts*=2;else if(cap.vc===pid)pts*=1.5;
          total+=Math.round(pts);
          continue;
        }
        const owned = periods.some(o=>{
          const fromDate = (o.from||"").split("T")[0];
          const toDate   = o.to ? o.to.split("T")[0] : "2099-01-01";
          const mDate    = m.date;
          return mDate >= fromDate && mDate <= toDate;
        });
        if(!owned) continue;
        const cap=captains[mid+"_"+teamId]||{};
        let pts=d.base;
        if(cap.captain===pid)pts*=2;else if(cap.vc===pid)pts*=1.5;
        total+=Math.round(pts);
      }
    }
    return total;
  };

  const getPlayerBreakdown=(teamId)=>{
    // Helper: get points for player during team's ownership period(s)
    const getPtsForTeam = (pid, tid) => {
      const periods = (ownershipLog[pid]||[]).filter(o=>o.teamId===tid);
      let tot = 0;

      // Active snatch: player currently snatched away from this team — freeze at pointsAtSnatch
      if(snatch.active?.pid===pid && snatch.active?.fromTeamId===tid) {
        return snatch.active.pointsAtSnatch || 0;
      }
      // Active snatch: player currently on loan TO this team — only post-snatch points
      if(snatch.active?.pid===pid && snatch.active?.byTeamId===tid) {
        const snatchDate = snatch.active.startDate.split('T')[0];
        for(const[mid,d] of Object.entries(points[pid]||{})){
          const m = matches.find(x=>x.id===mid);
          if(!m || m.date < snatchDate) continue;
          const cap=captains[`${mid}_${tid}`]||{};
          let pts=d.base;
          if(cap.captain===pid)pts*=2;else if(cap.vc===pid)pts*=1.5;
          tot+=Math.round(pts);
        }
        return tot;
      }

      // Historical snatch: player was snatched away from this team, now returned
      const histSnatchedAway = (snatch.history||[]).find(h=>h.pid===pid && h.fromTeamId===tid);
      // Historical snatch: player was snatched IN to this team, now returned — use frozen pts
      const histSnatchedIn = (snatch.history||[]).find(h=>h.pid===pid && h.byTeamId===tid);
      if(histSnatchedIn) return histSnatchedIn.snatchWeekPts || 0;

      for(const[mid,d] of Object.entries(points[pid]||{})){
        const m = matches.find(x=>x.id===mid);
        if(!m) continue;
        // Skip matches during snatch period for original team
        if(histSnatchedAway) {
          const snatchStart = histSnatchedAway.startDate.split('T')[0];
          const snatchEnd = histSnatchedAway.returnDate ? histSnatchedAway.returnDate.split('T')[0] : '2099-01-01';
          if(m.date >= snatchStart && m.date <= snatchEnd) continue;
        }
        // Check if match falls within any ownership period for this team
        const owned = periods.length === 0
          ? true // no log = original owner, count all
          : periods.some(o => {
              const fromDate = (o.from||"").split("T")[0];
              const toDate   = o.to ? o.to.split("T")[0] : "2099-01-01";
              return m.date >= fromDate && m.date <= toDate;
            });
        if(!owned) continue;
        const cap=captains[`${mid}_${tid}`]||{};
        let pts=d.base;
        if(cap.captain===pid)pts*=2;else if(cap.vc===pid)pts*=1.5;
        tot+=Math.round(pts);
      }
      return tot;
    };

    // Collect ALL traded-out/in pids across ALL history + current window
    const allTradedOutPids = new Set(); // all players ever traded OUT of this team
    const allTradedInPids  = new Set(); // all players ever traded INTO this team
    const tradedOutMeta = {}; // pid -> {tradedFor name}
    const tradedInMeta  = {}; // pid -> {tradedFor name}

    for (const w of [...(transfers.history||[]), { tradedPairs: transfers.tradedPairs||[], releases: transfers.releases||{} }]) {
      for (const pr of (w.tradedPairs||[]).filter(pr=>pr.teamId===teamId)) {
        allTradedOutPids.add(pr.releasedPid);
        allTradedInPids.add(pr.pickedPid);
        const incoming = players.find(x=>x.id===pr.pickedPid);
        const outgoing = players.find(x=>x.id===pr.releasedPid);
        tradedOutMeta[pr.releasedPid] = incoming?.name || "?";
        tradedInMeta[pr.pickedPid]    = outgoing?.name || "?";
      }
    }

    // Players in BOTH sets = traded out then returned (boomerang)
    // BUT only count as "returned" if they were originally on this team BEFORE any trades
    // i.e. they appear in tradedOut first (week-chronologically) then tradedIn
    // If they were tradedIn first then tradedOut, they're just gone — show as traded-out
    const allWeeks = [...(transfers.history||[]), { tradedPairs: transfers.tradedPairs||[], releases: transfers.releases||{} }];
    const firstAppearance = {}; // pid -> 'in' or 'out' (whichever came first for this team)
    for (const w of allWeeks) {
      for (const pr of (w.tradedPairs||[]).filter(pr=>pr.teamId===teamId)) {
        if (!firstAppearance[pr.releasedPid]) firstAppearance[pr.releasedPid] = 'out';
        if (!firstAppearance[pr.pickedPid])   firstAppearance[pr.pickedPid]   = 'in';
      }
    }
    // "returned" = originally traded OUT first, then came back IN
    const returnedPids    = new Set([...allTradedInPids].filter(id =>
      allTradedOutPids.has(id) &&
      assignments[id]===teamId &&
      firstAppearance[id] === 'out' // was released first, then came back
    ));
    // traded-out-then-back-in but originally picked = just gone (not returned)
    const pickThenReleasedPids = new Set([...allTradedInPids].filter(id =>
      allTradedOutPids.has(id) && firstAppearance[id] === 'in'
    ));
    // Net traded-in: came in and stayed (not released later)
    const netTradedInPids  = new Set([...allTradedInPids].filter(id => !allTradedOutPids.has(id)));
    // Net traded-out: originally released and never came back, OR picked then released
    const netTradedOutPids = new Set([
      ...[...allTradedOutPids].filter(id => !returnedPids.has(id) && !pickThenReleasedPids.has(id)),
      ...pickThenReleasedPids
    ]);

    // Source of truth for who is physically in the squad right now
    const inSquadNow = new Set(players.filter(p=>assignments[p.id]===teamId).map(p=>p.id));

    // Active players — physically in squad now, not a trade-history special case
    // Note: we intentionally DON'T exclude netTradedOutPids here —
    // if a traded-out player was manually re-added, inSquadNow catches them as active
    // and currentTradedAway's cross-check (inSquadNow.has → null) prevents double-display
    const active = players.filter(p=>
      inSquadNow.has(p.id) &&
      !netTradedInPids.has(p.id) &&
      !returnedPids.has(p.id) &&
      !(snatch.active?.pid === p.id && snatch.active?.byTeamId === teamId)
    ).map(p=>{
      const tot = getPtsForTeam(p.id, teamId);
      const isSnatched = snatch.active?.pid===p.id && snatch.active?.fromTeamId===teamId;
      return{...p,total:tot,status:isSnatched?"snatched":"active"};
    });

    // Returned players (↩️ yellow — traded out then came back, and currently in squad)
    const returnedPlayers = [...returnedPids].map(pid=>{
      const p = players.find(x=>x.id===pid);
      if(!p) return null;
      if(!inSquadNow.has(pid)) return null;
      const tot = getPtsForTeam(pid, teamId);
      return {...p, total:tot, status:"returned", tradedFor: tradedInMeta[pid]||"?"};
    }).filter(Boolean);

    // Traded-in players (green ⬆️ — in trade history AND currently in squad)
    const currentTradedIn = [...netTradedInPids].map(pid=>{
      const p = players.find(x=>x.id===pid);
      if(!p) return null;
      if(!inSquadNow.has(pid)) return null;
      const tot = getPtsForTeam(pid, teamId);
      return {...p, total:tot, status:"traded-in", tradedFor: tradedInMeta[pid]||"?"};
    }).filter(Boolean);

    // Traded-out players (strikethrough ⬇️ — in trade history AND NOT currently in squad)
    const currentTradedAway = [...netTradedOutPids].map(pid=>{
      const p = players.find(x=>x.id===pid);
      if(!p) return null;
      if(inSquadNow.has(pid)) return null; // manually re-added → show as active instead
      const tot = getPtsForTeam(pid, teamId);
      return {...p, total:tot, status:"traded-out", tradedFor: tradedOutMeta[pid]||"?"};
    }).filter(Boolean);

    const historical = [];

    // Snatched player this team borrowed
    const snatchedIn = snatch.active?.byTeamId===teamId ? (() => {
      const p = players.find(x=>x.id===snatch.active.pid);
      if(!p) return null;
      const snatchDate = snatch.active.startDate.split('T')[0];
      let tot=0;
      for(const[mid,d]of Object.entries(points[p.id]||{})){
        const m = matches.find(x=>x.id===mid);
        if(!m || m.date < snatchDate) continue;
        const cap=captains[`${mid}_${teamId}`]||{};
        let pts=d.base;
        if(cap.captain===p.id)pts*=2;else if(cap.vc===p.id)pts*=1.5;
        tot+=Math.round(pts);
      }
      return p?{...p,total:tot,status:"snatched-in",frozenAt:tot}:null;
    })() : null;

    // Players currently snatched AWAY from this team (show struck-through, frozen pts)
    const snatchedOut = (snatch.active?.fromTeamId===teamId) ? (() => {
      const p = players.find(x=>x.id===snatch.active.pid);
      if(!p) return null;
      return {...p, total: snatch.active.pointsAtSnatch, status:"snatched-out", frozenAt: snatch.active.pointsAtSnatch};
    })() : null;

    // Historical: players returned after snatch
    const snatchHistoryForTeam = (snatch.history||[]).map(h => {
      const p = players.find(x=>x.id===h.pid);
      if(!p) return null;
      // Snatching team — show their loan pts
      if(h.byTeamId===teamId) return {...p, total: h.snatchWeekPts||0, status:"snatch-returned-in", frozenAt: h.snatchWeekPts||0};
      // Original team — show player with their total (all pts minus snatch period, handled by getPtsForTeam via ownershipLog)
      if(h.fromTeamId===teamId && assignments[p.id]===teamId) return null; // already in active list
      return null;
    }).filter(Boolean);

    const allActive = [...active, ...(snatchedOut?[snatchedOut]:[])];
    return [...allActive, ...returnedPlayers, ...currentTradedIn, ...currentTradedAway, ...historical, ...(snatchedIn?[snatchedIn]:[]), ...snatchHistoryForTeam].sort((a,b)=>b.total-a.total);
  };

  // Leaderboard — total derived from getPlayerBreakdown so it always matches individual player sum
  const leaderboard = [...teams].map(t => {
    const breakdown = getPlayerBreakdown(t.id);
    const total = breakdown.reduce((s, p) => s + (p.total || 0), 0);
    return { ...t, total };
  }).sort((a, b) => b.total - a.total);

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

  // Auto-update match statuses + auto-lock C/VC when match goes live
  // Smart polling: +1+2+3 mins then every 30 mins for status
  // +0+1 mins then every 10 mins for C/VC lock
  useEffect(() => {
    if (!appReady || matches.length === 0) return;

    const checkAndUpdate = async (matchesToCheck) => {
      try {
        const [liveRes, resultsRes] = await Promise.all([
          fetch("/api/cricketdata?path=currentMatches").then(r=>r.json()).catch(()=>({})),
          fetch("/api/cricketdata?path=cricket-results").then(r=>r.json()).catch(()=>({})),
        ]);
        const liveList = Array.isArray(liveRes?.response) ? liveRes.response : [];
        const liveIds = new Set(liveList.map(m => String(m?.matchId || m?.id)).filter(Boolean));
        const resultsList = Array.isArray(resultsRes?.response) ? resultsRes.response : [];
        const completedIds = new Set(resultsList.map(m => String(m?.matchId || m?.id)).filter(Boolean));

        let matchesChanged = false;
        let captainsChanged = false;
        const updatedMatches = matches.map(m => {
          if (!m.cricbuzzId) return m;
          const id = String(m.cricbuzzId);
          if (m.status === "completed") return m;
          if (completedIds.has(id)) { matchesChanged = true; return { ...m, status: "completed" }; }
          if (liveIds.has(id)) { matchesChanged = true; return { ...m, status: "live" }; }
          return m;
        });
        if (matchesChanged) updMatches(updatedMatches);

        // Auto-lock C/VC for matches that just went live
        const newCaptains = { ...captains };
        matches.forEach(m => {
          if (!m.cricbuzzId) return;
          const id = String(m.cricbuzzId);
          const isLive = liveIds.has(id) || completedIds.has(id);
          const alreadyLocked = !!captains[m.id + "_locked"];
          if (isLive && !alreadyLocked) {
            newCaptains[m.id + "_locked"] = true;
            captainsChanged = true;
            pushNotif('match', `🔒 C/VC locked for ${m.team1} vs ${m.team2} — match is live!`, '🔒');
          }
        });
        if (captainsChanged) updCaptains(newCaptains);

      } catch(e) { console.warn("Auto status/lock check failed:", e.message); }
    };

    const timeouts = [];
    const scheduled = new Set();

    const scheduleForMatch = (m, matchMins) => {
      const IST_OFFSET = 5.5 * 60 * 60 * 1000;
      const nowIST = new Date(Date.now() + IST_OFFSET);
      const nowMins = nowIST.getUTCHours() * 60 + nowIST.getUTCMinutes();

      // C/VC lock checks: match time +0 and +1 min, then every 10 mins up to 5 hours
      [0, 1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 120, 150, 180, 210, 240, 270, 300].forEach(offset => {
        const targetMins = matchMins + offset;
        const delayMs = (targetMins - nowMins) * 60 * 1000;
        if (delayMs >= 0 && delayMs < 5.5 * 60 * 60 * 1000) {
          timeouts.push(setTimeout(() => checkAndUpdate([m]), delayMs));
        }
      });

      // Status checks: +1+2+3 then every 30 mins
      [1, 2, 3, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300].forEach(offset => {
        const targetMins = matchMins + offset;
        const delayMs = (targetMins - nowMins) * 60 * 1000;
        if (delayMs > 0 && delayMs < 5.5 * 60 * 60 * 1000) {
          timeouts.push(setTimeout(() => checkAndUpdate([m]), delayMs));
        }
      });
    };

    const masterCheck = () => {
      const IST_OFFSET = 5.5 * 60 * 60 * 1000;
      const nowIST = new Date(Date.now() + IST_OFFSET);
      const todayStr = nowIST.toISOString().split("T")[0];
      const nowMins = nowIST.getUTCHours() * 60 + nowIST.getUTCMinutes();

      matches.forEach(m => {
        if (m.date !== todayStr || m.status === "completed") return;
        if (scheduled.has(m.id)) return;
        const timeStr = m.time || "20:00";
        const [hh, mm] = timeStr.split(":").map(Number);
        const matchMins = hh * 60 + mm;
        if (nowMins >= matchMins - 10 && nowMins <= matchMins + 300) {
          scheduled.add(m.id);
          scheduleForMatch(m, matchMins);
        }
      });
    };

    masterCheck();
    const masterInterval = setInterval(masterCheck, 60 * 1000);

    return () => {
      clearInterval(masterInterval);
      timeouts.forEach(clearTimeout);
    };
  }, [appReady, matches.length]);

  // Update snatch window status every minute
  useEffect(() => {
    const t = setInterval(() => setSnatchWindowStatus(getSnatchWindowStatus()), 60000);
    return () => clearInterval(t);
  }, []);

  // Auto-return is handled by Supabase Edge Function (snatch-auto-return)
  // which runs every minute and checks the configured return time from pitchConfig
  // App.jsx only handles the pointsAtSnatch correction useEffect below


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
      // Apply the rule changes — save to pitchConfig
      const existingConfig = await storeGet("pitchConfig") || {};
      const changes = ruleProposal.changes || {};
      const newConfig = {
        ...existingConfig,
        ...(changes["Snatch Return"] ? { snatchReturn: changes["Snatch Return"] } : {}),
        ...(changes["Transfer Start"] ? { transferStart: changes["Transfer Start"] } : {}),
        ...(changes["Transfer End"] ? { transferEnd: changes["Transfer End"] } : {}),
        ...(changes["Snatch Window"] ? { snatchWindow: changes["Snatch Window"] } : {}),
      };
      await storeSet("pitchConfig", newConfig);
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
    ...(isAdmin && teams.length===0 ? [{id:"setup",label:"Setup",icon:"🏗️"}] : []),
    {id:"draft",label:"Draft",icon:"📋"},
    {id:"matches",label:"Matches",icon:"🏏"},
    {id:"transfer",label:"Transfer",icon:"🔄",disabled:teams.length===0},
    {id:"results",label:"Results",icon:"📊"},
    {id:"leaderboard",label:"Board",icon:"🏆",disabled:teams.length===0},
  ];

  if (!appReady) return (
    <>
      <style>{css}</style>
      <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
        <img src="/logo.png" style={{width:80,height:80,objectFit:"contain",borderRadius:12,animation:"spin 2s linear infinite"}} />
        <div style={{fontFamily:fonts.display,fontSize:22,fontWeight:700,color:T.accent,letterSpacing:3}}>TEEKHA BOUNCER</div>
        <div style={{color:T.muted,fontSize:14,letterSpacing:1}}>Loading league data…</div>
      </div>
    </>
  );

  return (
    <>
      <GlobalStyles />
      {isGuest && <div style={{background:"#4A5E7822",borderBottom:`1px solid ${T.border}`,padding:"6px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:11,fontFamily:fonts.body}}><span style={{color:T.muted}}>👁 Guest — read only</span><button onClick={onLeaveGuest||onLeave} style={{background:"transparent",border:"none",color:T.accent,fontSize:11,cursor:"pointer",fontWeight:700,fontFamily:fonts.body}}>CLAIM TEAM →</button></div>}
      {pitch?.isClone && (
        <div style={{background:"linear-gradient(90deg,#A855F718,#7C3AED18)",borderBottom:"2px solid #A855F766",padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"center",gap:12}}>
          <span style={{fontSize:20}}>🧬</span>
          <div>
            <span style={{fontFamily:fonts.display,fontWeight:800,fontSize:15,color:T.purple,letterSpacing:2}}>CLONE PITCH</span>
            <span style={{color:T.muted,fontSize:12,marginLeft:10}}>Cloned from <span style={{color:T.text,fontWeight:600}}>{pitch.clonedFromName}</span> · Changes here won't affect the original</span>
          </div>
        </div>
      )}
      {guestToast && <div style={{position:"fixed",top:60,left:"50%",transform:"translateX(-50%)",background:"#1E2D45",border:"1px solid #4A5E78",borderRadius:10,padding:"10px 20px",zIndex:9999,fontFamily:fonts.body,fontSize:14,color:T.text,display:"flex",alignItems:"center",gap:8,boxShadow:"0 4px 20px rgba(0,0,0,0.5)"}}>
        <span style={{fontSize:18}}>👁</span>
        <span>View only — <strong style={{color:T.accent}}>guests cannot make changes</strong></span>
      </div>}
      <ChatWindow myTeam={myTeam} teams={teams} unlocked={unlocked} withPassword={withPassword} storeGet={storeGet} storeSet={storeSet} isGuest={isGuest} />
      <style>{css}</style>
      <div style={{minHeight:"100vh",background:"var(--bg)"}}>
        {editPlayer&&<EditPlayerModal player={editPlayer}
          onSave={(updated)=>{const up=players.map(p=>p.id===updated.id?updated:p);setPlayers(up);storeSet("players",up);setEditPlayer(null);}}
          onAdd={(np)=>{const all=[...players,np];setPlayers(all);storeSet("players",all);setEditPlayer(null);}}
          onClose={()=>setEditPlayer(null)} />}
        {smartStatsMatch&&<SmartStatsModal pointsConfig={pointsConfig}
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
            pushNotif("stats", "Match "+smartStatsMatch.matchNum+" stats synced — points updated", "📊");
            alert("✅ Points saved for " + statsList.length + " players!");
          }}
          onClose={()=>setSmartStatsMatch(null)}
        />}

        {showPwModal&&<PasswordModal storedHash={pwHash} recoveryHash={recoveryHash} onSuccess={handlePwSuccess} onClose={()=>{setShowPwModal(false);setPendingAction(null);}} />}
        {editPlayer&&<EditPlayerModal player={editPlayer} onSave={(updated)=>{const updated_players=players.map(p=>p.id===updated.id?updated:p);setPlayers(updated_players);storeSet("players",updated_players);setEditPlayer(null);}} onAdd={(np)=>{const all=[...players,np];setPlayers(all);storeSet("players",all);setEditPlayer(null);}} onClose={()=>setEditPlayer(null)} />}

        {/* TOP BAR */}
        <div style={{background:"linear-gradient(180deg,#0E1521 0%,#080C14 100%)",borderBottom:`1px solid ${T.border}`,padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:50}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <button onClick={()=>setDrawerOpen(true)} style={{background:"transparent",border:"none",cursor:"pointer",padding:"6px 4px",display:"flex",flexDirection:"column",justifyContent:"center",gap:4,flexShrink:0,position:"relative"}}>
              <span style={{display:"block",width:20,height:2,background:"#E2EAF4",borderRadius:2}} />
              <span style={{display:"block",width:20,height:2,background:"#E2EAF4",borderRadius:2}} />
              <span style={{display:"block",width:20,height:2,background:"#E2EAF4",borderRadius:2}} />
              {(pendingVote || unreadNotifCount > 0) && <span style={{position:"absolute",top:2,right:2,width:8,height:8,background:"#FF3D5A",borderRadius:"50%"}} />}
            </button>
            <div style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}} onClick={onLeave} title="Back to pitches">
            <img src="/logo.png" alt="Teekha Bouncer" style={{height:36,width:36,objectFit:"contain",borderRadius:6}} />
            <div>
              <div style={{fontFamily:fonts.display,fontWeight:700,fontSize:14,color:T.accent,letterSpacing:1,lineHeight:1}}>TEEKHA BOUNCER LEAGUE</div>
              <div style={{fontSize:9,color:T.muted,letterSpacing:1,marginTop:2}}>{pitch ? pitch.name : ""} {user ? "• "+user.email.split("@")[0] : ""}</div>
            </div>
          </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <button onClick={onLeave} style={{background:"#4F8EF722",border:"1px solid #4F8EF744",color:"#4F8EF7",fontSize:13,borderRadius:6,padding:"6px 12px",cursor:"pointer",fontFamily:fonts.body,fontWeight:700}}>
              <span className="desk-only">🏠 HOME</span>
              <span className="mob-only">🏠</span>
            </button>
            <button onClick={()=>{if(unlocked)setUnlocked(false);else{setPendingAction(null);setShowPwModal(true);}}} style={{background:unlocked?"#2ECC7122":"transparent",border:"1px solid "+(unlocked?"#2ECC71":"#1E2D45"),color:unlocked?"#2ECC71":"#4A5E78",fontSize:13,borderRadius:6,padding:"6px 12px",cursor:"pointer",fontFamily:fonts.body,fontWeight:700}}>
              <span className="desk-only">{unlocked?"🔓 ON":"🔒 OFF"}</span>
              <span className="mob-only">{unlocked?"🔓":"🔒"}</span>
            </button>
            <button onClick={()=>withPassword(()=>{if(!confirm("Reset ALL data? This cannot be undone!"))return;["teams","players","assignments","matches","captains","points","page","pwhash"].forEach(k=>storeDel(k));window.location.reload();})} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.muted,fontSize:13,borderRadius:6,padding:"6px 10px",cursor:"pointer"}}>⚙️</button>
            <button onClick={onLogout} style={{background:T.dangerBg,border:`1px solid ${T.danger}44`,color:T.danger,fontSize:13,borderRadius:6,padding:"6px 10px",cursor:"pointer",fontFamily:fonts.body,fontWeight:700}}>
              <span className="desk-only">LOGOUT</span>
              <span className="mob-only" style={{fontSize:11}}>OUT</span>
            </button>
          </div>
        </div>

        {/* BOTTOM NAV */}
        <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:50,background:T.card,borderTop:`1px solid ${T.border}`,display:"flex",paddingBottom:"max(8px, env(safe-area-inset-bottom))"}}>
          {navItems.map(n=>(
            <button key={n.id} onClick={()=>!n.disabled&&nav(n.id)}
              style={{flex:1,background:"transparent",border:"none",cursor:n.disabled?"not-allowed":"pointer",padding:"10px 2px 6px",display:"flex",flexDirection:"column",alignItems:"center",gap:3,opacity:n.disabled?0.25:1,borderTop:page===n.id?"2px solid #F5A623":"2px solid transparent",transition:"all .15s"}}>
              <span style={{fontSize:22,lineHeight:1}}>{n.icon}</span>
              <span style={{fontSize:9,fontFamily:fonts.body,fontWeight:700,letterSpacing:0.5,color:page===n.id?"#F5A623":"#4A5E78",textTransform:"uppercase"}}>{n.label}</span>
            </button>
          ))}
        </div>

        {loading&&(
          <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.92)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",zIndex:200,backdropFilter:"blur(4px)"}}>
            <Spinner />
            <div style={{marginTop:16,color:T.accent,fontWeight:700,fontSize:16,textAlign:"center",padding:"0 20px"}}>{loading}</div>
            <div style={{marginTop:6,color:T.muted,fontSize:13}}>Please wait…</div>
          </div>
        )}

        <div style={{maxWidth:860,margin:"0 auto",padding:"20px 16px 90px"}}>

          {page==="setup"&&(
            <div className="fade-in">
              <h2 style={{fontFamily:"Rajdhani",fontSize:28,color:T.accent,letterSpacing:2,marginBottom:24}}>LEAGUE SETUP</h2>
              <Card sx={{padding:24,marginBottom:16}}>
                <div style={{fontWeight:700,color:T.muted,letterSpacing:2,fontSize:12,marginBottom:16}}>NUMBER OF TEAMS</div>
                <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:12}}>
                  <span style={{fontSize:48,fontFamily:"Rajdhani",fontWeight:800,color:T.accent,minWidth:60}}>{numTeams}</span>
                  <input type="range" min={2} max={10} value={numTeams} onChange={e=>{setNumTeams(+e.target.value);storeSet("numteams",+e.target.value);}} style={{flex:1,accentColor:T.accent,height:6}} />
                </div>
                <div style={{display:"flex",justifyContent:"space-between",color:T.muted,fontSize:12}}><span>2 teams</span><span>10 teams</span></div>
              </Card>
              <Card sx={{padding:24,marginBottom:20}}>
                <div style={{fontWeight:700,color:T.muted,letterSpacing:2,fontSize:12,marginBottom:16}}>TEAM NAMES</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12}}>
                  {Array.from({length:numTeams},(_,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:PALETTE[i],flexShrink:0}} />
                      <input value={tNames[i]} onChange={e=>{const n=[...tNames];n[i]=e.target.value;setTNames(n);}} style={{flex:1,background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 14px",color:T.text,fontSize:15,fontFamily:fonts.body,fontWeight:600}} placeholder={"Team "+(i+1)} />
                    </div>
                  ))}
                </div>
              </Card>
              <Card sx={{padding:20,marginBottom:20}}>
                <div style={{fontWeight:700,color:T.muted,letterSpacing:2,fontSize:12,marginBottom:14}}>POINTS SYSTEM</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:14,fontSize:13}}>
                  {[{title:"🏏 BATTING",items:["1 pt per run","8 pts per four","12 pts per six","+10 for 50+","+20 for 100+"]},{title:"🎳 BOWLING",items:["25 pts per wicket","+8 for 4-wkt haul","+15 for 5+ wickets","+10 econ <6 (min 2 ov)"]},{title:"🧤 FIELDING",items:["8 pts per catch","12 pts stumping","12 pts run-out"]},{title:"⭐ BONUSES",items:["30+ runs & 2+ wkts = +15","Longest six = +50","Captain = 2× pts","VC = 1.5× pts"]}].map(sec=>(
                    <div key={sec.title}>
                      <div style={{color:T.accent,fontWeight:700,fontSize:12,letterSpacing:1,marginBottom:8}}>{sec.title}</div>
                      {sec.items.map(item=><div key={item} style={{color:T.sub,marginBottom:4}}>• {item}</div>)}
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
                  <h2 style={{fontFamily:"Rajdhani",fontSize:28,color:T.accent,letterSpacing:2}}>PLAYER DRAFT</h2>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <Btn variant="blue" onClick={()=>withPassword(()=>setFetchPlayerModal({tournamentId:null,tournamentName:"General"}))} sx={{fontSize:13,padding:"8px 14px"}}>🌐 FETCH PLAYERS</Btn>
                    <Btn variant="ghost" onClick={()=>withPassword(()=>setEditPlayer({name:"",iplTeam:"",role:"Batsman"}))} sx={{fontSize:13,padding:"8px 14px"}}>✚ ADD</Btn>
                    <Btn variant={squadView?"primary":"ghost"} onClick={()=>setSquadView(v=>!v)} sx={{fontSize:13,padding:"8px 14px"}}>{squadView?"📋 LIST":"👥 SQUAD"}</Btn>
                  </div>
                </div>
                {/* Draft sub-tabs */}
                <div style={{display:"flex",background:T.card,borderRadius:10,padding:4,gap:4}}>
                  {[{id:"players",label:"📋 Players"},{id:"unsold",label:"🏷️ Unsold Pool"}].map(t=>(
                    <button key={t.id} onClick={()=>setDraftTab(t.id)}
                      style={{flex:1,padding:"8px",border:"none",borderRadius:8,cursor:"pointer",fontFamily:fonts.body,fontWeight:700,fontSize:14,letterSpacing:1,background:draftTab===t.id?"#F5A623":"transparent",color:draftTab===t.id?"#080C14":"#4A5E78",transition:"all .15s"}}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* UNSOLD POOL TAB */}
              {draftTab==="unsold" && (
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                    <div style={{fontSize:13,color:T.muted}}>
                      Players in the unsold pool can be picked up during the transfer window.
                    </div>
                    <span style={{background:T.accentBg,color:T.accent,border:`1px solid ${T.accentBorder}`,borderRadius:6,padding:"4px 10px",fontSize:12,fontWeight:700}}>{unsoldPool.length} players</span>
                  </div>

                  {/* Add unassigned players to pool */}
                  <div style={{marginBottom:16}}>
                    <div style={{fontSize:11,color:T.muted,letterSpacing:2,fontWeight:700,marginBottom:10}}>ADD FROM UNASSIGNED PLAYERS</div>
                    <div style={{maxHeight:160,overflowY:"auto",display:"flex",flexWrap:"wrap",gap:6}}>
                      {players.filter(p=>!assignments[p.id]&&!unsoldPool.includes(p.id)).map(p=>(
                        <button key={p.id} onClick={()=>addToUnsoldPool(p.id)}
                          style={{padding:"5px 12px",borderRadius:20,border:`1px solid ${T.border}`,background:"transparent",color:T.muted,fontSize:12,fontFamily:fonts.body,cursor:"pointer"}}>
                          + {p.name} <span style={{opacity:0.5}}>({p.iplTeam})</span>
                        </button>
                      ))}
                      {players.filter(p=>!assignments[p.id]&&!unsoldPool.includes(p.id)).length===0&&(
                        <div style={{color:T.muted,fontSize:13}}>All unassigned players are already in the pool</div>
                      )}
                    </div>
                  </div>

                  {/* Current unsold pool */}
                  <div style={{fontSize:11,color:T.muted,letterSpacing:2,fontWeight:700,marginBottom:10}}>CURRENT UNSOLD POOL</div>
                  {unsoldPool.length===0 ? (
                    <div style={{textAlign:"center",padding:"32px",color:T.muted,fontSize:14,background:T.card,borderRadius:10}}>
                      Pool is empty — add players above
                    </div>
                  ) : (
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {unsoldPool.map(pid=>{
                        const p = players.find(x=>x.id===pid);
                        if(!p) return null;
                        // Check if released this window by a team
                        const releasedByTeam = teams.find(t=>(transfers?.releases?.[t.id]||[]).includes(pid));
                        const cardBg = releasedByTeam ? releasedByTeam.color+"0D" : myHighlights[pid] ? "#F5A62311" : "#0E1521";
                        const cardBorder = releasedByTeam ? releasedByTeam.color+"44" : myHighlights[pid] ? "#F5A62344" : "#1E2D4566";
                        const cardBorderLeft = releasedByTeam ? "3px solid "+releasedByTeam.color+"99" : "1px solid "+cardBorder;
                        return (
                          <div key={pid} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",background:cardBg,borderRadius:8,border:"1px solid "+cardBorder,borderLeft:cardBorderLeft,flexWrap:"wrap"}}>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                                <span style={{fontWeight:700,fontSize:14,color:myHighlights[pid]?"#F5A623":"#E2EAF4"}}>{p.name}</span>
                                {p.tier&&<span style={{fontSize:9,fontWeight:800,letterSpacing:1,padding:"1px 5px",borderRadius:4,fontFamily:fonts.body,textTransform:"uppercase",background:p.tier==="platinum"?"#4A5E7833":p.tier==="gold"?"#F5A62322":p.tier==="silver"?"#94A3B822":"#CD7F3222",border:"1px solid "+(p.tier==="platinum"?"#4A5E7866":p.tier==="gold"?"#F5A62366":p.tier==="silver"?"#94A3B855":"#CD7F3255"),color:p.tier==="platinum"?"#B0BEC5":p.tier==="gold"?"#F5A623":p.tier==="silver"?"#94A3B8":"#CD7F32"}}>{p.tier==="platinum"?"PLAT":p.tier==="gold"?"GOLD":p.tier==="silver"?"SILV":"BRNZ"}</span>}
                                {releasedByTeam && (
                                  <span style={{display:"flex",alignItems:"center",gap:3,fontSize:9,fontWeight:800,letterSpacing:0.5,color:releasedByTeam.color,background:releasedByTeam.color+"15",border:"1px solid "+releasedByTeam.color+"44",borderRadius:4,padding:"1px 6px"}}>
                                    <span style={{width:5,height:5,borderRadius:"50%",background:releasedByTeam.color,display:"inline-block",flexShrink:0}}/>
                                    {releasedByTeam.name.toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <div style={{fontSize:11,color:T.muted}}>{p.iplTeam} • {p.role}{!releasedByTeam&&<span style={{marginLeft:6,fontSize:9,color:T.muted,background:"#1E2D4555",border:"1px solid #1E2D4599",borderRadius:3,padding:"0px 4px",fontWeight:700}}>UNSOLD</span>}</div>
                              {myNotes[pid]&&editingNote!==pid&&<div style={{fontSize:11,color:T.accent,marginTop:4,fontStyle:"italic",background:T.accentBg,borderRadius:4,padding:"3px 8px",display:"inline-block"}}>"{myNotes[pid]}"</div>}
                              {editingNote===pid&&(
                                <div style={{display:"flex",gap:6,marginTop:6}}>
                                  <input autoFocus value={noteInput} onChange={e=>setNoteInput(e.target.value)} onKeyDown={async e=>{if(e.key==="Enter"){const u={...myNotes,[pid]:noteInput.trim()};if(!noteInput.trim())delete u[pid];await saveNotes(u);setEditingNote(null);}if(e.key==="Escape")setEditingNote(null);}} placeholder="Private note..." maxLength={100} style={{flex:1,background:T.bg,border:`1px solid ${T.accentBorder}`,borderRadius:6,padding:"4px 8px",color:T.text,fontSize:12,fontFamily:fonts.body,outline:"none"}} />
                                  <button onClick={async()=>{const u={...myNotes,[pid]:noteInput.trim()};if(!noteInput.trim())delete u[pid];await saveNotes(u);setEditingNote(null);}} style={{background:"#F5A623",border:"none",borderRadius:6,padding:"4px 10px",color:T.bg,fontWeight:800,fontSize:12,cursor:"pointer"}}>SAVE</button>
                                  <button onClick={()=>setEditingNote(null)} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:6,padding:"4px 8px",color:T.muted,fontSize:12,cursor:"pointer"}}>✕</button>
                                </div>
                              )}
                            </div>
                            <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                              <button onClick={async()=>{const u={...myHighlights};u[pid]?delete u[pid]:u[pid]=true;await saveHighlights(u);}} style={{background:myHighlights[pid]?"#F5A62333":"transparent",border:"1px solid "+(myHighlights[pid]?"#F5A62366":"#1E2D45"),borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:14}}>
                                {myHighlights[pid]?"⭐":"☆"}
                              </button>
                              <button onClick={()=>{setNoteInput(myNotes[pid]||"");setEditingNote(pid);}} style={{background:myNotes[pid]?"#4F8EF722":"transparent",border:"1px solid "+(myNotes[pid]?"#4F8EF744":"#1E2D45"),borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:13}}>📝</button>
                              {unlocked&&<button onClick={()=>removeFromUnsoldPool(pid)} style={{background:T.dangerBg,border:`1px solid ${T.danger}44`,color:T.danger,borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:11,fontFamily:fonts.body,fontWeight:700}}>✕</button>}
                            </div>
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
                  <span style={{color:T.muted,fontSize:12,marginLeft:10}}>{unlocked?"Assign, replace or remove freely":"Password required to modify squads"}</span>
                </div>
                <button onClick={()=>{if(unlocked)setUnlocked(false);else{setPendingAction(null);setShowPwModal(true);}}} style={{background:unlocked?"#FF3D5A22":"#F5A62322",border:"1px solid "+(unlocked?"#FF3D5A44":"#F5A62344"),color:unlocked?"#FF3D5A":"#F5A623",borderRadius:7,padding:"7px 16px",fontFamily:fonts.body,fontWeight:700,fontSize:13,cursor:"pointer"}}>
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
                        <span style={{color:T.muted}}>{cnt}p</span>
                        {active&&<span style={{color:t.color,fontSize:11}}>✓</span>}
                      </div>
                      <label title="Upload team logo" style={{padding:"7px 8px",cursor:"pointer",color:T.muted,fontSize:12,borderLeft:"1px solid #1E2D4555"}}>
                        📷
                        <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>e.target.files[0]&&uploadTeamLogo(t.id,e.target.files[0])} />
                      </label>
                    </div>
                  );
                })}
                <div onClick={()=>setTeamFilter("unassigned")}
                  style={{background:teamFilter==="unassigned"?"#4A5E7833":"#0E1521",borderRadius:8,padding:"7px 14px",fontSize:13,cursor:"pointer",border:teamFilter==="unassigned"?"1px solid #4A5E78":"1px solid transparent",transition:"all .15s"}}>
                  <span style={{color:T.muted}}>Unassigned: </span>
                  <span style={{color:T.text}}>{players.filter(p=>!assignments[p.id]).length}</span>
                  {teamFilter==="unassigned"&&<span style={{color:T.muted,marginLeft:6,fontSize:11}}>✓</span>}
                </div>
              </div>
              {players.length===0?(
                <Card sx={{padding:60,textAlign:"center"}}>
                  <div style={{fontSize:56}}>🏏</div>
                  <div style={{color:T.muted,marginTop:16,fontSize:16}}>Click "Fetch Players" to load squads</div>
                  <div style={{color:T.muted,marginTop:8,fontSize:13}}>Choose from any cricket league — IPL, BBL, PSL, The Hundred and more</div>
                </Card>
              ):squadView?(
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {teams.map(team=>{
                    const teamPlayers=players.filter(p=>assignments[p.id]===team.id);
                    const unassignedCount=players.filter(p=>!assignments[p.id]).length;
                    return(
                      <Card key={team.id} accent={team.color} sx={{overflow:"hidden"}}>
                        <div style={{padding:"14px 18px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                          <div>
                            <span style={{fontFamily:fonts.display,fontWeight:700,fontSize:18,color:team.color,letterSpacing:1}}>{team.name}</span>
                            <span style={{color:T.muted,fontSize:13,marginLeft:10}}>{teamPlayers.length} players</span>
                          </div>
                        </div>
                        {teamPlayers.length===0?(
                          <div style={{padding:"16px 18px",color:T.muted,fontSize:13}}>No players assigned yet</div>
                        ):(
                          <div style={{padding:"8px 0"}}>
                            {["Batsman","Wicket-Keeper","All-Rounder","Bowler"].map(role=>{
                              const rp=teamPlayers.filter(p=>p.role===role);
                              if(rp.length===0) return null;
                              return(
                                <div key={role}>
                                  <div style={{padding:"6px 18px",fontSize:11,color:T.muted,letterSpacing:2,fontWeight:700,background:"#0E152188"}}>{role.toUpperCase()}S ({rp.length})</div>
                                  {rp.map(p=>(
                                    <div key={p.id} style={{display:"flex",alignItems:"center",padding:"8px 18px",borderBottom:"1px solid #1E2D4522",gap:10}}>
                                      <div style={{flex:1}}>
                                        <span style={{fontSize:14,fontWeight:600,color:T.text}}>{p.name}</span>
                                        <span style={{fontSize:12,color:T.muted,marginLeft:8}}>{p.iplTeam}</span>
                                      </div>
                                      <button onClick={()=>withPassword(()=>setEditPlayer(p))} style={{background:T.infoBg,border:`1px solid ${T.info}44`,color:T.info,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:12}}>✏️</button>
                                      <button onClick={()=>removePlayer(p.id)} style={{background:T.dangerBg,border:`1px solid ${T.danger}44`,color:T.danger,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:12}}>✕</button>
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
                    <div style={{color:T.muted,fontSize:13,textAlign:"center"}}>
                      <span style={{color:T.text,fontWeight:700}}>{players.filter(p=>!assignments[p.id]).length}</span> players unassigned
                    </div>
                  </Card>
                </div>
              ):(
                <>
                  <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
                    <input placeholder="Search name or franchise…" value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1,minWidth:180,background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",color:T.text,fontSize:14,fontFamily:fonts.body}} />
                    <select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",color:T.text,fontSize:14,fontFamily:fonts.body}}>
                      {ROLES.map(r=><option key={r}>{r}</option>)}
                    </select>
                    <select value={sortOrder} onChange={e=>setSortOrder(e.target.value)} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",color:T.text,fontSize:14,fontFamily:fonts.body}}>
                      <option value="default">Default</option>
                      <option value="az">A → Z</option>
                      <option value="za">Z → A</option>
                    </select>
                  </div>
                  <div style={{position:"relative",maxHeight:560,overflowY:"auto",display:"flex",flexDirection:"column",gap:5}}>
                    {teamFilter&&teamFilter!=="unassigned"&&teamLogos[teamFilter]&&(
                      <img src={teamLogos[teamFilter]} style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:280,opacity:0.06,pointerEvents:"none",zIndex:0,objectFit:"contain"}} />
                    )}
                    {unlocked && selectedBulk.length > 0 && (
                      <div style={{background:T.card,border:`1px solid ${T.accentBorder}`,borderRadius:10,padding:"10px 14px",marginBottom:10,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <div style={{fontSize:12,color:T.accent,fontWeight:700,minWidth:60}}>{selectedBulk.length} selected</div>
                        {[["platinum","PLATINUM","#B0BEC5","#4A5E7833","#4A5E7866"],["gold","GOLD","#F5A623","#F5A62322","#F5A62366"],["silver","SILVER","#94A3B8","#94A3B822","#94A3B855"],["bronze","BRONZE","#CD7F32","#CD7F3222","#CD7F3255"]].map(([t,label,col,bg,br])=>(
                          <button key={t} onClick={()=>{const updated=players.map(p=>selectedBulk.includes(p.id)?{...p,tier:t}:p);setPlayers(updated);storeSet("players",updated);setSelectedBulk([]);}} style={{background:bg,border:"1px solid "+br,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:800,fontFamily:fonts.body,color:col,letterSpacing:1}}>{label}</button>
                        ))}
                        <button onClick={()=>{const updated=players.map(p=>selectedBulk.includes(p.id)?{...p,tier:""}:p);setPlayers(updated);storeSet("players",updated);setSelectedBulk([]);}} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontFamily:fonts.body,color:T.muted}}>CLEAR</button>
                        <button onClick={()=>setSelectedBulk([])} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:11,marginLeft:"auto"}}>deselect all</button>
                      </div>
                    )}
                    {filteredPlayers.map(p=>{
                      const aTeam=teams.find(t=>t.id===assignments[p.id]);
                      const isAssigned=!!assignments[p.id];
                      return(
                        <div key={p.id} style={{padding:"10px 14px",background:T.card,borderRadius:8,borderLeft:"3px solid "+(aTeam?aTeam.color:"#1E2D45")}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                            <div style={{minWidth:0,flex:1}}>
                              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                                {unlocked&&<input type="checkbox" checked={selectedBulk.includes(p.id)} onChange={e=>setSelectedBulk(prev=>e.target.checked?[...prev,p.id]:prev.filter(x=>x!==p.id))} style={{width:14,height:14,cursor:"pointer",accentColor:T.accent,flexShrink:0}} />}
                                <span style={{fontWeight:600,fontSize:14,color:T.text,fontFamily:fonts.body}}>{p.name}</span>
                                {p.tier&&<span style={{fontSize:9,fontWeight:800,letterSpacing:1,padding:"1px 5px",borderRadius:4,fontFamily:fonts.body,textTransform:"uppercase",background:p.tier==="platinum"?"#4A5E7833":p.tier==="gold"?"#F5A62322":p.tier==="silver"?"#94A3B822":"#CD7F3222",border:"1px solid "+(p.tier==="platinum"?"#4A5E7866":p.tier==="gold"?"#F5A62366":p.tier==="silver"?"#94A3B855":"#CD7F3255"),color:p.tier==="platinum"?"#B0BEC5":p.tier==="gold"?"#F5A623":p.tier==="silver"?"#94A3B8":"#CD7F32"}}>{p.tier==="platinum"?"PLAT":p.tier==="gold"?"GOLD":p.tier==="silver"?"SILV":"BRNZ"}</span>}
                                {isAssigned&&isPlayerSafeForTeam(assignments[p.id],p.id)&&<span style={{background:T.successBg,color:T.success,border:`1px solid ${T.success}44`,borderRadius:10,fontSize:9,padding:"1px 5px",fontWeight:700}}>🛡️</span>}
                              </div>
                              <div style={{fontSize:11,color:T.muted,marginTop:2}}>{p.iplTeam} • <span style={{color:ROLE_COLORS[p.role]||"#94A3B8"}}>{p.role}</span>{isAssigned&&<span style={{marginLeft:6,color:aTeam?.color,fontWeight:700}}>{aTeam?.name}</span>}</div>
                            </div>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <select value={assignments[p.id]||""} onChange={e=>assignPlayer(p.id,e.target.value)} style={{flex:1,background:T.card,border:"1px solid "+(aTeam?aTeam.color+"66":"#1E2D45"),borderRadius:6,padding:"6px 8px",color:aTeam?aTeam.color:T.muted,fontSize:12,fontFamily:fonts.body,fontWeight:600,cursor:"pointer",minWidth:0}}>
                              <option value="">{isAssigned?"Move to…":"— Assign —"}</option>
                              {teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                            {isAssigned&&<button onClick={()=>removePlayer(p.id)} style={{background:T.dangerBg,border:`1px solid ${T.danger}44`,color:T.danger,borderRadius:6,padding:"6px 8px",cursor:"pointer",fontSize:13,flexShrink:0}}>✕</button>}
                            <button onClick={()=>withPassword(()=>setEditPlayer(p))} style={{background:T.infoBg,border:`1px solid ${T.info}44`,color:T.info,borderRadius:6,padding:"6px 8px",cursor:"pointer",fontSize:13,flexShrink:0}}>✏️</button>
                            {isAssigned&&<button onClick={()=>toggleSafePlayer(assignments[p.id],p.id)} style={{background:isPlayerSafeForTeam(assignments[p.id],p.id)?"#2ECC7133":"transparent",border:"1px solid "+(isPlayerSafeForTeam(assignments[p.id],p.id)?"#2ECC71":"#1E2D45"),color:isPlayerSafeForTeam(assignments[p.id],p.id)?"#2ECC71":"#4A5E78",borderRadius:6,padding:"6px 8px",cursor:"pointer",fontSize:13,flexShrink:0}}>🛡️</button>}
                            <button onClick={()=>deletePlayer(p.id)} style={{background:T.dangerBg,border:`1px solid ${T.danger}44`,color:T.danger,borderRadius:6,padding:"6px 8px",cursor:"pointer",fontSize:11,flexShrink:0}}>🗑️</button>
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
                <h2 style={{fontFamily:"Rajdhani",fontSize:28,color:T.accent,letterSpacing:2}}>MATCHES</h2>
              </div>

              {/* Add tournament - always visible, password on click */}
              <button onClick={()=>withPassword(()=>setAddTournamentModal(true))}
                style={{width:"100%",background:T.card,borderRadius:10,border:`1px solid ${T.border}`,padding:"12px 16px",marginBottom:16,cursor:"pointer",display:"flex",alignItems:"center",gap:10,fontFamily:fonts.body}}>
                <span style={{fontSize:18}}>➕</span>
                <div style={{textAlign:"left"}}>
                  <div style={{fontWeight:700,fontSize:14,color:T.accent}}>ADD TOURNAMENT</div>
                  <div style={{fontSize:11,color:T.muted,marginTop:1}}>Fetch from Cricbuzz or CricketData</div>
                </div>
              </button>

              {/* Source legend */}
              {unlocked && (
                <div style={{display:"flex",gap:8,marginBottom:12,fontSize:11,color:T.muted}}>
                  <span style={{color:T.accent}}>🟠 CB</span> Cricbuzz · 100/month
                  <span style={{marginLeft:8,color:T.success}}>🟢 CD</span> CricketData · 100/day
                </div>
              )}

              {/* Tournament collapsible sections */}
              {tournaments.map((tournament, tIdx) => {
                const tMatches = matches.filter(m => m.tournamentId === tournament.id || (!m.tournamentId && tournament.id === "t_ipl"));
                const isOpen = expandedTournaments[tournament.id];
                const liveCount = tMatches.filter(m=>m.status==="live").length;
                const TOURNEY_COLORS = ["#F5A623","#4F8EF7","#2ECC71","#A855F7","#FF3D5A","#06B6D4","#F97316","#EC4899"];
                const tColor = TOURNEY_COLORS[tIdx % TOURNEY_COLORS.length];
                return (
                  <div key={tournament.id} style={{marginBottom:12,background:T.card,borderRadius:12,border:"1px solid "+tColor+"44",overflow:"hidden"}}>
                    {/* Tournament header */}
                    <div style={{display:"flex",alignItems:"center",padding:"12px 16px",cursor:"pointer",gap:10,background:tColor+"0D",borderBottom:isOpen?"1px solid "+tColor+"33":"none"}}
                      onClick={()=>setExpandedTournaments(prev=>({...prev,[tournament.id]:!prev[tournament.id]}))}>
                      <div style={{flex:1}}>
                        <div style={{fontFamily:fonts.display,fontSize:16,fontWeight:700,color:tColor,letterSpacing:1}}>{tournament.name}</div>
                        <div style={{fontSize:11,color:T.muted,marginTop:2}}>
                          {tMatches.length} matches{liveCount>0?" • "+liveCount+" LIVE 🔴":""}
                          {tournament.tradeSnatchEnabled && <span style={{marginLeft:6,color:T.purple,fontSize:10,fontWeight:700}}>⚡ TRADE & SNATCH ON</span>}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:4}}>
                        <div style={{position:"relative",display:"inline-block"}} className="tooltip-wrap">
                          <button onClick={e=>{e.stopPropagation();withPassword(()=>fetchMatchesForTournament(tournament.id,tournament.name,tournament.seriesId));}}
                            style={{background:T.accentBg,border:`1px solid ${T.accentBorder}`,color:T.accent,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontFamily:fonts.body,fontWeight:700,fontSize:10}}
                            title="Cricbuzz — 100 req/month free. Resets monthly.">🟠 CB</button>
                        </div>
                        <div style={{position:"relative",display:"inline-block"}}>
                          <button onClick={e=>{e.stopPropagation();withPassword(()=>fetchFromCricketData(tournament.id,tournament.name));}}
                            style={{background:T.successBg,border:`1px solid ${T.success}44`,color:T.success,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontFamily:fonts.body,fontWeight:700,fontSize:10}}
                            title="CricketData — 100 req/day free. Resets daily.">🟢 CD</button>
                        </div>
                        <div style={{position:"relative",display:"inline-block"}}>
                          <button onClick={e=>{e.stopPropagation();withPassword(()=>setFetchPlayerModal({tournamentId:tournament.id,tournamentName:tournament.name}));}}
                            style={{background:T.infoBg,border:`1px solid ${T.info}44`,color:T.info,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontFamily:fonts.body,fontWeight:700,fontSize:10}}
                            title="Fetch players for this tournament">👥 PLAYERS</button>
                        </div>
                        <div style={{position:"relative",display:"inline-block"}}>
                          <button onClick={e=>{e.stopPropagation();withPassword(()=>setAiMatchModal({tournamentId:tournament.id,tournamentName:tournament.name}));}}
                            style={{background:T.purpleBg,border:`1px solid ${T.purple}44`,color:T.purple,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontFamily:fonts.body,fontWeight:700,fontSize:10}}
                            title="Generate past matches using AI">🤖 AI MATCHES</button>
                        </div>
                        {tMatches.some(m=>m.aiGenerated) && (
                          <div style={{position:"relative",display:"inline-block"}}>
                            <button onClick={e=>{e.stopPropagation();withPassword(()=>{
                              if(!window.confirm("Delete all AI-generated matches for "+tournament.name+"? This cannot be undone.")) return;
                              const updated = matches.filter(m=>!(m.tournamentId===tournament.id && m.aiGenerated));
                              updMatches(updated);
                            });}}
                              style={{background:T.dangerBg,border:`1px solid ${T.danger}44`,color:T.danger,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontFamily:fonts.body,fontWeight:700,fontSize:10}}
                              title="Delete all AI-generated matches">🗑 AI</button>
                          </div>
                        )}
                      </div>
                      {/* Trade & Snatch toggle */}
                      {(() => {
                        const tStarted = tMatches.some(m => m.status === "completed");
                        // Auto-enable if matches already played and not explicitly set
                        const isOn = tournament.tradeSnatchEnabled === undefined ? tStarted : !!tournament.tradeSnatchEnabled;
                        return (
                          <button onClick={e=>{
                            e.stopPropagation();
                            if (tStarted && isOn) { alert("Tournament has started — Trade & Snatch cannot be disabled."); return; }
                            if (!isOn && !confirm("Enable Trade & Snatch for " + tournament.name + "? Once the tournament starts this cannot be turned off.")) return;
                            if (isOn && !tStarted) {
                              withPassword(()=>{
                                const updated = tournaments.map(t=>t.id===tournament.id?{...t,tradeSnatchEnabled:false}:t);
                                setTournaments(updated); storeSet("tournaments",updated);
                              });
                            } else {
                              withPassword(()=>{
                                const updated = tournaments.map(t=>t.id===tournament.id?{...t,tradeSnatchEnabled:true}:t);
                                setTournaments(updated); storeSet("tournaments",updated);
                              });
                            }
                          }}
                          title={tStarted&&isOn?"Trade & Snatch — LOCKED (tournament started, irreversible)":isOn?"Trade & Snatch — ON (click to disable, admin password required)":"Trade & Snatch — OFF (click to enable, admin password required)"}
                          style={{background:isOn?"#A855F722":"transparent",border:"2px solid "+(isOn?"#A855F7":tColor+"44"),borderRadius:20,padding:"3px 10px",cursor:tStarted&&isOn?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
                            <span style={{width:24,height:13,background:isOn?"#A855F7":"#1E2D45",borderRadius:10,position:"relative",transition:"background .2s",display:"inline-block",flexShrink:0}}>
                              <span style={{position:"absolute",top:2,left:isOn?12:2,width:9,height:9,background:"#fff",borderRadius:"50%",transition:"left .2s",display:"block"}} />
                            </span>
                            <span style={{fontSize:9,color:isOn?"#A855F7":"#4A5E78",fontWeight:700,whiteSpace:"nowrap"}}>T&S</span>
                          </button>
                        );
                      })()}
                      {unlocked && tournament.id !== "t_ipl" && (
                        <button onClick={e=>{e.stopPropagation();if(!confirm("Remove this tournament?"))return;const updated=tournaments.filter(t=>t.id!==tournament.id);setTournaments(updated);storeSet("tournaments",updated);}}
                          style={{background:"transparent",border:`1px solid ${T.border}`,color:T.muted,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11}}>✕</button>
                      )}
                      <span style={{color:tColor,fontSize:12,opacity:0.7}}>{isOpen?"▲":"▼"}</span>
                    </div>

                    {/* Matches list */}
                    {isOpen && (
                      <div style={{borderTop:`1px solid ${T.border}`,padding:"8px 8px"}}>
                        {tMatches.length === 0 ? (
                          <div style={{textAlign:"center",padding:"24px",color:T.muted,fontSize:13}}>
                            No matches yet — hit ↻ REFRESH to fetch from Cricbuzz
                          </div>
                        ) : (
                          <div style={{display:"flex",flexDirection:"column",gap:6}}>
                            {(() => {
                              // Sort all tournament matches by date globally and renumber
                              const allTourneyMatches = [...matches.filter(m => m.tournamentId === tournament.id || (!m.tournamentId && tournament.id === "t_ipl"))];
                              allTourneyMatches.sort((a,b)=>{
                                const dateA = a.date || "9999";
                                const dateB = b.date || "9999";
                                if (dateA !== dateB) return dateA.localeCompare(dateB);
                                const o={live:0,completed:1,upcoming:2};
                                return (o[a.status]||2)-(o[b.status]||2);
                              });
                              // Assign correct match numbers based on date order
                              const matchNumMap = {};
                              allTourneyMatches.forEach((m, i) => { matchNumMap[m.id] = i + 1; });
                              const sorted = allTourneyMatches;
                              return sorted.map((match,idx) => {
                                const displayNum = matchNumMap[match.id] || match.matchNum;
                                const completed = match.status==="completed";
                                const live = match.status==="live";
                                const liveScore = liveScores[match.id];
                                const isSynced = completed && Object.keys(points).some(pid=>points[pid][match.id]);
                                return (
                                  <div key={match.id} style={{background:T.card,borderRadius:10,border:"1px solid "+(live?"#FF3D5A33":completed?"#2ECC7122":"#1E2D45")}}>
                                    <div style={{display:"flex",alignItems:"center",padding:"10px 14px",gap:12,cursor:"pointer"}} onClick={()=>setExpandedMatchId(expandedMatchId===match.id?null:match.id)}>
                                      <div style={{background:T.bg,borderRadius:6,padding:"3px 8px",minWidth:38,textAlign:"center",flexShrink:0}}>
                                        <div style={{fontSize:9,color:T.muted}}>M</div>
                                        <div style={{fontSize:16,fontWeight:800,color:T.accent,fontFamily:"Rajdhani"}}>{displayNum}</div>
                                      </div>
                                      <div style={{flex:1,minWidth:0}}>
                                        <div style={{fontWeight:600,fontSize:14,color:T.text,fontFamily:fonts.body}}>{match.team1} <span style={{color:T.muted}}>vs</span> {match.team2}</div>
                                        <div style={{fontSize:11,color:T.muted,marginTop:2}}>{match.date} • {match.time} IST • {match.venue}</div>
                                        {live && liveScore && <div style={{fontSize:11,color:T.accent,marginTop:2}}>{liveScore.score1} | {liveScore.score2}</div>}
                                      </div>
                                      <div style={{flexShrink:0,textAlign:"right"}}>
                                        {live ? (
                                          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
                                            <span style={{fontSize:10,color:T.danger,fontWeight:700}}>🔴 LIVE</span>
                                            {unlocked && (
                                              <div style={{display:"flex",gap:3}}>
                                                <button onClick={e=>{e.stopPropagation();const upd=matches.map(m=>m.id===match.id?{...m,status:"completed"}:m);updMatches(upd);}} style={{fontSize:9,color:T.muted,background:"transparent",border:`1px solid ${T.border}`,borderRadius:4,padding:"2px 5px",cursor:"pointer"}}>✓ Done</button>
                                                <button onClick={e=>{e.stopPropagation();const upd=matches.map(m=>m.id===match.id?{...m,status:"upcoming"}:m);updMatches(upd);}} style={{fontSize:9,color:T.muted,background:"transparent",border:`1px solid ${T.border}`,borderRadius:4,padding:"2px 5px",cursor:"pointer"}}>↩ Reset</button>
                                              </div>
                                            )}
                                          </div>
                                        ) : completed ? (
                                          <div style={{textAlign:"right"}}>
                                            <div style={{fontSize:10,fontWeight:700,color:isSynced?"#2ECC71":"#F5A623"}}>
                                              {isSynced ? "✓ SYNCED" : "⚠ UNSYNCED"}
                                            </div>
                                            <div style={{fontSize:9,color:T.muted,marginTop:1}}>COMPLETED</div>
                                          </div>
                                        ) : (
                                          <div style={{textAlign:"right"}}>
                                            <span style={{fontSize:10,color:T.muted,fontWeight:700}}>UPCOMING</span>
                                            {unlocked && <div><button onClick={e=>{e.stopPropagation();const upd=matches.map(m=>m.id===match.id?{...m,status:"live"}:m);updMatches(upd);}} style={{fontSize:9,color:T.danger,background:"transparent",border:`1px solid ${T.danger}44`,borderRadius:4,padding:"2px 5px",cursor:"pointer",marginTop:2}}>🔴 Mark Live</button></div>}
                                          </div>
                                        )}
                                    {/* Expandable actions for all matches */}
                                    {expandedMatchId===match.id && (
                                      <div style={{borderTop:`1px solid ${T.border}`,padding:"10px 14px",display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                                        {!isGuest && <button onClick={()=>setCaptainMatch(match)}
                                          style={{background:T.infoBg,border:`1px solid ${T.info}44`,color:T.info,borderRadius:7,padding:"6px 12px",cursor:"pointer",fontFamily:fonts.body,fontWeight:700,fontSize:12}}>
                                          {captains[match.id+"_locked"]?"🔒 C/VC":"👑 SET C/VC"}
                                        </button>}
                                        {completed && unlocked && (
                                          <button onClick={()=>withPassword(()=>setSmartStatsMatch(match))}
                                            style={{background:T.accentBg,border:`1px solid ${T.accentBorder}`,color:T.accent,borderRadius:7,padding:"6px 12px",cursor:"pointer",fontFamily:fonts.body,fontWeight:700,fontSize:12}}>
                                            📊 {isSynced?"EDIT STATS":"SYNC STATS"}
                                          </button>
                                        )}
                                        {unlocked && (
                                          <div style={{display:"flex",gap:6,marginLeft:"auto"}}>
                                            {match.status!=="live" && <button onClick={()=>{const upd=matches.map(m=>m.id===match.id?{...m,status:"live"}:m);updMatches(upd);}}
                                              style={{background:T.dangerBg,border:`1px solid ${T.danger}44`,color:T.danger,borderRadius:7,padding:"6px 10px",cursor:"pointer",fontFamily:fonts.body,fontWeight:700,fontSize:11}}>🔴 LIVE</button>}
                                            {match.status!=="completed" && <button onClick={()=>{const upd=matches.map(m=>m.id===match.id?{...m,status:"completed"}:m);updMatches(upd);}}
                                              style={{background:T.successBg,border:`1px solid ${T.success}44`,color:T.success,borderRadius:7,padding:"6px 10px",cursor:"pointer",fontFamily:fonts.body,fontWeight:700,fontSize:11}}>✓ DONE</button>}
                                            {match.status!=="upcoming" && <button onClick={()=>{const upd=matches.map(m=>m.id===match.id?{...m,status:"upcoming"}:m);updMatches(upd);}}
                                              style={{background:"#4A5E7822",border:"1px solid #4A5E7844",color:T.muted,borderRadius:7,padding:"6px 10px",cursor:"pointer",fontFamily:fonts.body,fontWeight:700,fontSize:11}}>↩ RESET</button>}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                      </div>
                                    </div>

                                    {/* Expanded match actions */}
                                    {expandedMatchId===match.id && completed && (
                                      <div style={{borderTop:`1px solid ${T.border}`,padding:"10px 14px",display:"flex",gap:8,flexWrap:"wrap"}}>
                                        <button onClick={()=>withPassword(()=>setSmartStatsMatch(match))}
                                          style={{background:T.accentBg,border:`1px solid ${T.accentBorder}`,color:T.accent,borderRadius:7,padding:"6px 12px",cursor:"pointer",fontFamily:fonts.body,fontWeight:700,fontSize:12}}>
                                          📊 {isSynced?"EDIT STATS":"SYNC STATS"}
                                        </button>
                                        {!isGuest && <button onClick={()=>setCaptainMatch(match)}
                                          style={{background:T.infoBg,border:`1px solid ${T.info}44`,color:T.info,borderRadius:7,padding:"6px 12px",cursor:"pointer",fontFamily:fonts.body,fontWeight:700,fontSize:12}}>
                                          {captains[match.id+"_locked"]?"🔒 C/VC":"👑 SET C/VC"}
                                        </button>}
                                      </div>
                                    )}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {page==="transfer" && (
            <div className="fade-in">
              {/* Sub-tabs */}
              <div style={{display:"flex",gap:4,background:T.card,borderRadius:12,padding:4,marginBottom:16,border:`1px solid ${T.border}`}}>
                {[["transfer","🔄 Transfer Window"],["snatch","⚡ Snatch Window"]].map(([id,label])=>(
                  <button key={id} onClick={()=>setTransferSubTab(id)}
                    style={{flex:1,padding:"10px",border:"none",borderRadius:9,background:transferSubTab===id?T.bg:"transparent",color:transferSubTab===id?T.accent:T.muted,fontFamily:fonts.display,fontWeight:700,fontSize:13,cursor:"pointer",letterSpacing:0.5,transition:"all 0.2s",boxShadow:transferSubTab===id?`0 2px 8px rgba(0,0,0,0.3)`:undefined}}>
                    {label}
                  </button>
                ))}
              </div>

              {transferSubTab==="transfer" && (
                <TransferWindowComponent
                  pitch={pitch}
                  teams={teams}
                  players={players}
                  assignments={assignments}
                  transfers={transfers}
                  unsoldPool={unsoldPool}
                  leaderboard={leaderboard}
                  isAdmin={isAdmin}
                  myTeam={myTeam}
                  unlocked={unlocked}
                  withPassword={withPassword}
                  ownershipLog={ownershipLog}
                  points={points}
                  user={user}
                  pitchConfig={pitchConfig}
                  onUpdateTransfers={(val)=>{setTransfers(val);storeSet("transfers",val);}}
                  onUpdateAssignments={updAssign}
                  onUpdateUnsoldPool={(val)=>{setUnsoldPool(val);storeSet("unsoldPool",val);}}
                  onUpdateOwnershipLog={(val)=>{setOwnershipLog(val);storeSet("ownershipLog",val);}}
                  onUpdatePoints={updPoints}
                  safePlayers={safePlayers}
                />
              )}

              {transferSubTab==="snatch" && (
                <SnatchSection
                  teams={teams}
                  players={players}
                  assignments={assignments}
                  snatch={snatch}
                  points={points}
                  matches={matches}
                  captains={captains}
                  leaderboard={leaderboard}
                  myTeam={myTeam}
                  isAdmin={isAdmin}
                  unlocked={unlocked}
                  withPassword={withPassword}
                  teamIdentity={teamIdentity}
                  user={user}
                  pitch={pitch}
                  ownershipLog={ownershipLog}
                  safePlayers={safePlayers}
                  pushNotif={pushNotif}
                  pitchConfig={pitchConfig}
                  onUpdateSnatch={(val)=>{setSnatch(val);storeSet("snatch",val);}}
                  onUpdateAssignments={updAssign}
                  onUpdateOwnershipLog={(val)=>{setOwnershipLog(val);storeSet("ownershipLog",val);}}
                  onUpdateSafePlayers={(val)=>{setSafePlayers(val);storeSet("safePlayers",val);}}
                />
              )}
            </div>
          )}

          {page==="results" && (
            <div className="fade-in">
              <h2 style={{fontFamily:"Rajdhani",fontSize:28,color:T.accent,letterSpacing:2,marginBottom:24}}>MATCH RESULTS</h2>

              {matches.filter(m=>m.status==="completed"&&Object.keys(points).some(pid=>points[pid][m.id])).length===0 ? (
                <div style={{textAlign:"center",padding:60,color:T.muted}}>
                  <div style={{fontSize:56}}>📊</div>
                  <div style={{marginTop:16,fontSize:16}}>No match results yet. Sync stats from the Matches tab first.</div>
                </div>
              ) : (
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {[...matches.filter(m=>m.status==="completed"&&Object.keys(points).some(pid=>points[pid][m.id]))].sort((a,b)=>(a.date||"9999").localeCompare(b.date||"9999")).map((match,idx,arr)=>{
                    const open = expandedMatch===match.id;
                    const displayNum = idx + 1;

                    // Build per-team breakdown — include traded-out players with strikethrough
                    const matchDateStr = match.date || "9999-12-31";
                    const teamBreakdowns = teams.map(team=>{
                      // Find all players who were with this team during this match (via ownershipLog or current assignment)
                      const teamPts = players
                        .filter(p => {
                          if (!points[p.id]?.[match.id]) return false;
                          // Check ownershipLog for this team during match date
                          const periods = (ownershipLog[p.id]||[]).filter(o=>o.teamId===team.id);
                          if (periods.length > 0) {
                            return periods.some(o => (!o.from || o.from <= matchDateStr+"Z") && (!o.to || o.to >= matchDateStr));
                          }
                          // If player snatched away from this team — include for pre-snatch matches
                          if (snatch.active?.pid===p.id && snatch.active?.fromTeamId===team.id) {
                            return matchDateStr < snatch.active.startDate.split('T')[0];
                          }
                          // If player was snatched away historically — include for pre-snatch & post-return matches
                          const histAway = (snatch.history||[]).find(h=>h.pid===p.id && h.fromTeamId===team.id);
                          if (histAway) {
                            const snatchStart = histAway.startDate.split('T')[0];
                            const snatchEnd = histAway.returnDate ? histAway.returnDate.split('T')[0] : '2099-01-01';
                            return matchDateStr < snatchStart || matchDateStr > snatchEnd;
                          }
                          // Fallback: current assignment
                          return assignments[p.id] === team.id;
                        })
                        .map(p=>{
                          const d = points[p.id][match.id];
                          const cap = captains[`${match.id}_${team.id}`]||{};
                          let pts = d.base;
                          let mult = 1;
                          if(cap.captain===p.id){pts*=2;mult=2;}
                          else if(cap.vc===p.id){pts*=1.5;mult=1.5;}
                          // Is this player still on the team?
                          const isSnatchedAway = snatch.active?.pid===p.id && snatch.active?.fromTeamId===team.id;
                          const wasSnatchedAway = (snatch.history||[]).some(h=>h.pid===p.id && h.fromTeamId===team.id);
                          const tradedOut = assignments[p.id] !== team.id && !isSnatchedAway && !wasSnatchedAway;
                          const snatchedOut = isSnatchedAway;
                          const snatchReturned = wasSnatchedAway && assignments[p.id]===team.id;
                          return {...p, base:d.base, pts:Math.round(pts), mult, stats:d.stats, breakdown:calcBreakdown(d.stats), tradedOut, snatchedOut, snatchReturned};
                        }).sort((a,b)=>b.pts-a.pts);
                      const total = teamPts.reduce((s,p)=>s+p.pts,0);
                      return {team, players:teamPts, total};
                    }).sort((a,b)=>b.total-a.total);

                    return (
                      <div key={match.id} style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden"}}>
                        {/* Match header */}
                        <div style={{display:"flex",alignItems:"center",padding:"14px 18px",cursor:"pointer",gap:14}} onClick={()=>setExpandedMatch(open?null:match.id)}>
                          <div style={{background:T.bg,borderRadius:6,padding:"4px 10px",minWidth:44,textAlign:"center"}}>
                            <div style={{fontSize:11,color:T.muted}}>M</div>
                            <div style={{fontSize:18,fontWeight:800,color:T.accent,fontFamily:"Rajdhani"}}>{displayNum}</div>
                          </div>
                          <div style={{flex:1}}>
                            <div style={{fontWeight:700,fontSize:15,color:T.text}}>{match.team1} <span style={{color:T.muted}}>vs</span> {match.team2}</div>
                            <div style={{fontSize:12,color:T.muted,marginTop:2}}>{match.date} • {match.result||match.venue}</div>
                          </div>
                          <span style={{color:T.muted,fontSize:12}}>{open?"▲":"▼"}</span>
                        </div>

                        {/* Expanded breakdown */}
                        {open && (
                          <div style={{borderTop:`1px solid ${T.border}`,padding:"16px 18px",display:"flex",flexDirection:"column",gap:14}}>
                            {teamBreakdowns.map((tb,rank)=>(
                              <div key={tb.team.id} style={{background:T.bg,borderRadius:10,border:"1px solid "+tb.team.color+"33",overflow:"hidden"}}>
                                {/* Team header */}
                                <div style={{padding:"10px 16px",borderBottom:`1px solid ${T.border}44`,display:"flex",alignItems:"center",justifyContent:"space-between",background:tb.team.color+"11"}}>
                                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                                    <span style={{fontSize:20}}>{"#"+(rank+1)}</span>
                                    <span style={{fontFamily:fonts.display,fontWeight:700,fontSize:16,color:tb.team.color,letterSpacing:1}}>{tb.team.name}</span>
                                  </div>
                                  <span style={{fontFamily:fonts.display,fontWeight:800,fontSize:22,color:T.accent}}>{tb.total} pts</span>
                                </div>

                                {/* Players */}
                                {tb.players.length===0 ? (
                                  <div style={{padding:"12px 16px",color:T.muted,fontSize:13}}>No players scored in this match</div>
                                ) : (
                                  tb.players.map(p=>(
                                    <div key={p.id} style={{padding:"10px 16px",borderBottom:"1px solid #1E2D4522",display:"flex",alignItems:"flex-start",gap:12,opacity:p.tradedOut||p.snatchedOut?0.6:1,background:p.snatchReturned?T.purple+"0A":"transparent"}}>
                                      <div style={{flex:1,minWidth:0}}>
                                        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                                          <span style={{fontWeight:700,fontSize:14,color:p.tradedOut?T.muted:p.snatchedOut?T.purple:p.snatchReturned?T.purple:T.text,textDecoration:p.tradedOut||p.snatchedOut?"line-through":"none"}}>{p.name}</span>
                                          {p.tradedOut && <span style={{fontSize:9,color:T.danger,background:T.dangerBg,border:`1px solid ${T.danger}33`,borderRadius:4,padding:"1px 5px",fontWeight:700,letterSpacing:0.5}}>TRADED OUT</span>}
                                          {p.snatchedOut && <span style={{fontSize:9,color:T.purple,background:T.purpleBg,border:`1px solid ${T.purple}33`,borderRadius:4,padding:"1px 5px",fontWeight:700,letterSpacing:0.5}}>⚡ SNATCHED</span>}
                                          {p.snatchReturned && <span style={{fontSize:9,color:T.purple,background:T.purpleBg,border:`1px solid ${T.purple}33`,borderRadius:4,padding:"1px 5px",fontWeight:700,letterSpacing:0.5}}>↩️ RETURNED</span>}
                                          {p.mult>1 && <span style={{background:p.mult===2?"#F5A62322":"#94A3B822",color:p.mult===2?"#F5A623":"#94A3B8",border:"1px solid "+(p.mult===2?"#F5A62344":"#94A3B844"),fontSize:10,padding:"1px 7px",borderRadius:10,fontWeight:700}}>
                                            {p.mult===2?"⭐ CAPTAIN 2×":"🥈 VC 1.5×"}
                                          </span>}
                                        </div>
                                        <div style={{fontSize:11,color:T.muted,marginTop:3}}>{p.breakdown.join(" • ")||"No contributions"}</div>
                                      </div>
                                      <div style={{textAlign:"right",flexShrink:0}}>
                                        <div style={{fontFamily:fonts.display,fontWeight:800,fontSize:20,color:p.pts>0?"#F5A623":"#4A5E78"}}>{p.pts}</div>
                                        {p.mult>1&&<div style={{fontSize:10,color:T.muted}}>base: {p.base}</div>}
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
                <button onClick={()=>nav("leaderboard")} style={{background:"transparent",border:"none",color:T.muted,fontSize:22,cursor:"pointer",lineHeight:1,padding:"0 4px"}}>←</button>
                <h2 style={{fontFamily:"Rajdhani",fontSize:28,color:T.accent,letterSpacing:2}}>PLAYER FORM</h2>
              </div>
              <FormChart players={players} assignments={assignments} points={points} teams={teams} matches={matches} snatch={snatch} />
            </div>
          )}

          {page==="h2h" && (
            <div className="fade-in">
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
                <button onClick={()=>nav("leaderboard")} style={{background:"transparent",border:"none",color:T.muted,fontSize:22,cursor:"pointer",lineHeight:1,padding:"0 4px"}}>←</button>
                <h2 style={{fontFamily:"Rajdhani",fontSize:28,color:T.accent,letterSpacing:2}}>HEAD TO HEAD</h2>
              </div>
              <H2HStats teams={teams} matches={matches} points={points} assignments={assignments} players={players} captains={captains} ownershipLog={ownershipLog} snatch={snatch} />
            </div>
          )}

          {page==="leaderboard"&&(
            <div className="fade-in">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:8}}>
                <h2 style={{fontFamily:"Rajdhani",fontSize:28,color:T.accent,letterSpacing:2}}>LEADERBOARD</h2>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>

                  <button onClick={shareLeaderboard} style={{background:"#25D36622",border:"1px solid #25D36644",color:"#25D366",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontFamily:fonts.body,fontWeight:700,fontSize:13}}>
                    📲 SHARE WHATSAPP
                  </button>
                </div>
              </div>
              {leaderboard.length===0?(
                <Card sx={{padding:60,textAlign:"center"}}><div style={{fontSize:56}}>🏆</div><div style={{color:T.muted,marginTop:16}}>Set up your league first</div></Card>
              ):(
                <>
                  <div style={{marginBottom:32}}>
                    {leaderboard.map((team,i)=>{
                      const medals=["🥇","🥈","🥉"],mc=["#F5A623","#94A3B8","#CD7C2F"];
                      return(
                        <div key={team.id} style={{display:"flex",alignItems:"center",gap:16,background:T.card,borderRadius:10,padding:"16px 20px",marginBottom:8,borderLeft:"4px solid "+team.color}}>
                          <div style={{fontSize:28,minWidth:36}}>{medals[i]||("#"+(i+1))}</div>
                          <div style={{flex:1}}>
                            <div style={{fontWeight:700,fontSize:18,color:team.color,fontFamily:"Rajdhani",letterSpacing:1}}>{team.name}</div>
                            <div style={{fontSize:12,color:T.muted}}>{players.filter(p=>assignments[p.id]===team.id).length} players drafted</div>
                          </div>
                          <div style={{textAlign:"right"}}>
                            <div style={{fontSize:32,fontWeight:800,color:i<3?mc[i]:"#E2EAF4",fontFamily:"Rajdhani"}}>{team.total}</div>
                            <div style={{fontSize:11,color:T.muted,letterSpacing:2}}>POINTS</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{fontWeight:700,color:T.muted,letterSpacing:2,fontSize:12,marginBottom:16}}>TEAM PLAYER BREAKDOWN</div>
                  {leaderboard.map(team=>{
                    const breakdown=getPlayerBreakdown(team.id),isOpen=expandedTeam===team.id;
                    const activeCount=breakdown.filter(p=>p.status!=="traded-out"&&p.status!=="snatched-out"&&p.status!=="snatch-returned-in"&&p.status!=="released").length;
                    const safeCount=(safePlayers[team.id]||[]).length;
                    return(
                      <Card key={team.id} accent={team.color} sx={{marginBottom:12,overflow:"hidden"}}>
                        <div style={{display:"flex",alignItems:"center",padding:"14px 18px",cursor:"pointer"}} onClick={()=>setExpandedTeam(isOpen?null:team.id)}>
                          <div style={{flex:1}}><span style={{fontWeight:700,color:team.color,fontFamily:"Rajdhani",fontSize:17,letterSpacing:1}}>{team.name}</span><span style={{color:T.muted,marginLeft:10,fontSize:13}}>{activeCount} players</span></div>
                          <span style={{color:T.accent,fontWeight:800,fontFamily:"Rajdhani",fontSize:22,marginRight:16}}>{team.total} pts</span>
                          <span style={{color:team.color,fontSize:12,opacity:0.7}}>{isOpen?"▲":"▼"}</span>
                        </div>
                        {isOpen&&breakdown.length>0&&(
                          <div style={{borderTop:`1px solid ${T.border}`,padding:"12px 18px"}}>
                            <div style={{display:"flex",fontSize:11,color:T.muted,marginBottom:10,padding:"0 4px"}}><span style={{flex:1}}>PLAYER</span><span style={{width:90}}>ROLE</span><span style={{width:70,textAlign:"right"}}>POINTS</span></div>
                            {breakdown.map((p,idx)=>(
                              <div key={p.id} style={{display:"flex",alignItems:"center",padding:"9px 4px",borderBottom:`1px solid ${T.border}`,opacity:p.status==="snatched-out"||p.status==="snatch-returned-in"||p.status==="traded-out"?0.65:1}}>
                                <div style={{flex:1,fontWeight:idx<3?700:400,fontSize:14,
                                  color:p.status==="traded-in"?"#2ECC71":p.status==="returned"?"#F5A623":p.status==="traded-out"?"#FF3D5A":idx===0&&p.status==="active"?"#F5A623":"#E2EAF4",
                                  textDecoration:p.status==="snatched-out"||p.status==="snatch-returned-in"||p.status==="traded-out"?"line-through":"none"}}>
                                  {p.status==="traded-out"&&<span style={{marginRight:4}}>⬇️</span>}
                                  {p.status==="traded-in"&&<span style={{marginRight:4}}>⬆️</span>}
                                  {p.status==="returned"&&<span style={{marginRight:4}}>↩️</span>}
                                  {p.name}
                                  {p.status==="traded-out"&&<span style={{fontSize:9,color:T.danger,marginLeft:6,textDecoration:"none",fontWeight:700}}>→ {p.tradedFor}</span>}
                                  {p.status==="traded-in"&&<span style={{fontSize:9,color:T.success,marginLeft:6,textDecoration:"none",fontWeight:700}}>FROM POOL</span>}
                                  {p.status==="returned"&&<span style={{fontSize:9,color:T.accent,marginLeft:6,textDecoration:"none",fontWeight:700}}>↩ RETURNED</span>}
                                  {p.status==="snatched-out"&&<span style={{fontSize:9,color:T.purple,marginLeft:6,textDecoration:"none",fontWeight:700}}> SNATCHED</span>}
                                  {p.status==="snatched-in"&&<span style={{fontSize:9,color:T.success,marginLeft:6,textDecoration:"none",fontWeight:700}}> ON LOAN</span>}
                                  {p.status==="snatch-returned-in"&&<span style={{fontSize:9,color:T.muted,marginLeft:6,textDecoration:"none"}}> RETURNED</span>}
                                  {p.status==="released"&&<span style={{fontSize:9,color:T.muted,marginLeft:6,textDecoration:"none"}}> RELEASED</span>}
                                </div>
                                <div style={{width:90}}><Badge label={p.role||"—"} color={ROLE_COLORS[p.role]||"#4A5E78"} /></div>
                                <div style={{width:70,textAlign:"right",fontWeight:700,
                                  color:p.status==="traded-in"?"#2ECC71":p.status==="returned"?"#F5A623":p.status==="traded-out"||p.status==="snatched-out"||p.status==="snatch-returned-in"?"#4A5E78":p.total>0?"#E2EAF4":"#4A5E78",
                                  fontFamily:"Rajdhani",fontSize:17}}>
                                  {p.total}
                                  {p.status==="traded-in"&&<span style={{fontSize:9,display:"block",color:T.success,letterSpacing:0.5}}>RESET</span>}
                                  {p.status==="returned"&&<span style={{fontSize:9,display:"block",color:T.accent,letterSpacing:0.5}}>BACK</span>}
                                  {p.status==="traded-out"&&<span style={{fontSize:9,display:"block",color:T.danger,letterSpacing:0.5}}>FROZEN</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {isOpen&&breakdown.length===0&&<div style={{padding:"16px 18px",color:T.muted,fontSize:13,borderTop:`1px solid ${T.border}`}}>No players assigned yet.</div>}
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
          <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.97)",zIndex:200,overflowY:"auto",padding:24,fontFamily:fonts.body}}>
            <div style={{maxWidth:500,margin:"0 auto"}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
                <button onClick={()=>setShowRulesPanel(false)} style={{background:"transparent",border:"none",color:T.muted,fontSize:22,cursor:"pointer",padding:"0 4px"}}>←</button>
                <div style={{fontFamily:fonts.display,fontSize:26,fontWeight:700,color:T.accent,letterSpacing:2}}>POINTS & RULES</div>
              </div>

              {/* Points System */}
              {/* Points System - Beautiful Display */}
              <div style={{marginBottom:16}}>
                {[
                  {label:"🏏 BATTING",color:T.accent,items:[
                    {name:"Per Run",val:pointsConfig.run,unit:"pt",pos:true},
                    {name:"Per Four",val:pointsConfig.four,unit:"pts",pos:true},
                    {name:"Per Six",val:pointsConfig.six,unit:"pts",pos:true},
                    {name:"Half-Century (50+)",val:pointsConfig.fifty,unit:"pts",pos:true},
                    {name:"Century (100+)",val:pointsConfig.century,unit:"pts",pos:true},
                    {name:"SR Bonus (SR>"+pointsConfig.srBonusThreshold+")",val:pointsConfig.srBonus,unit:"pts",pos:true},
                    {name:"Duck Penalty",val:pointsConfig.duckPenalty,unit:"pts",pos:false},
                    {name:"SR Penalty (SR<"+pointsConfig.srPenaltyThreshold+")",val:pointsConfig.srPenalty,unit:"pts",pos:false},
                  ]},
                  {label:"🎳 BOWLING",color:T.info,items:[
                    {name:"Per Wicket",val:pointsConfig.wicket,unit:"pts",pos:true},
                    {name:"4-Wicket Haul",val:pointsConfig.fourWkt,unit:"pts",pos:true},
                    {name:"5-Wicket Haul",val:pointsConfig.fiveWkt,unit:"pts",pos:true},
                    {name:"Economy Bonus (<"+pointsConfig.ecoThreshold+")",val:pointsConfig.ecoBonus,unit:"pts",pos:true},
                    {name:"Maiden Over",val:pointsConfig.maiden,unit:"pts",pos:true},
                    {name:"Economy Penalty (>"+pointsConfig.ecoPenaltyThreshold+")",val:pointsConfig.ecoPenalty,unit:"pts",pos:false},
                  ]},
                  {label:"🧤 FIELDING",color:T.success,items:[
                    {name:"Catch",val:pointsConfig.catch,unit:"pts",pos:true},
                    {name:"Stumping",val:pointsConfig.stumping,unit:"pts",pos:true},
                    {name:"Run-out",val:pointsConfig.runout,unit:"pts",pos:true},
                  ]},
                  {label:"⭐ BONUSES",color:T.purple,items:[
                    {name:"All-round ("+pointsConfig.allRoundMinRuns+"+R & "+pointsConfig.allRoundMinWkts+"+W)",val:pointsConfig.allRoundBonus,unit:"pts",pos:true},
                    {name:"Longest Six",val:pointsConfig.longestSix,unit:"pts",pos:true},
                    {name:"Man of the Match",val:pointsConfig.momBonus,unit:"pts",pos:true},
                    {name:"Playing XI",val:pointsConfig.playingXIBonus,unit:"pts",pos:true},
                    {name:"Captain Multiplier",val:pointsConfig.captainMult,unit:"×",pos:true},
                    {name:"VC Multiplier",val:pointsConfig.vcMult,unit:"×",pos:true},
                  ]},
                ].map(section=>(
                  <div key={section.label} style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,marginBottom:8,overflow:"hidden"}}>
                    <div style={{background:section.color+"18",borderBottom:"1px solid "+section.color+"33",padding:"8px 14px"}}>
                      <div style={{fontFamily:fonts.display,fontSize:14,fontWeight:700,color:section.color,letterSpacing:2}}>{section.label}</div>
                    </div>
                    <div style={{padding:"2px 14px 6px"}}>
                      {section.items.map(item=>(
                        <div key={item.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid #1E2D4222",opacity:item.val===0?0.3:1}}>
                          <div style={{fontSize:12,color:T.sub}}>{item.name}{item.val===0&&<span style={{fontSize:10,color:"#2D3E52",marginLeft:6}}>disabled</span>}</div>
                          <div style={{fontFamily:fonts.display,fontSize:16,fontWeight:800,color:item.val===0?"#2D3E52":item.pos?"#F5A623":"#FF3D5A"}}>{item.pos?"+":"-"}{item.val}<span style={{fontSize:10,color:T.muted,fontWeight:400,marginLeft:2}}>{item.unit}</span></div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {(!ruleProposal || ruleProposal.status !== "pending") && (
                  <button onClick={()=>withPassword(()=>setShowRulesPanel("points"))} style={{width:"100%",background:T.accentBg,border:`1px solid ${T.accentBorder}`,borderRadius:10,padding:10,color:T.accent,fontFamily:fonts.body,fontWeight:700,fontSize:13,cursor:"pointer"}}>
                    ✏️ {(!tournamentStarted||!eligibleVoters.length)?"EDIT POINTS — Admin":"PROPOSE POINTS CHANGE — Needs Team Vote"}
                  </button>
                )}
              </div>

              {/* Current Rules */}
              <div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,padding:20,marginBottom:16}}>
                <div style={{fontSize:11,color:T.muted,letterSpacing:2,fontWeight:700,marginBottom:12}}>⏰ TIMING RULES</div>
                {[
                  ["Transfer Window", `${pitchConfig?.transferStart || "Sunday 11:59 PM"} → ${pitchConfig?.transferEnd || "Monday 11:00 AM"} IST`],
                  ["Snatch Window", pitchConfig?.snatchWindow ? pitchConfig.snatchWindow.replace(" to ", " → ") + " IST" : "Saturday 12:00 AM → 12:00 PM IST"],
                  ["Snatch Return", `${pitchConfig?.snatchReturn || "Friday 11:58 PM"} IST`],
                ].map(([label, val]) => (
                  <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${T.border}33`}}>
                    <div style={{fontSize:13,color:T.muted}}>{label}</div>
                    <div style={{fontSize:13,color:T.text,fontWeight:700}}>{val}</div>
                  </div>
                ))}
              </div>


              {/* Pending proposal */}
              {ruleProposal && ruleProposal.status === "pending" && (
                <div style={{background:T.accentBg,borderRadius:12,border:`1px solid ${T.accentBorder}`,padding:20,marginBottom:16}}>
                  <div style={{fontSize:11,color:T.accent,letterSpacing:2,fontWeight:700,marginBottom:4}}>⏳ PENDING PROPOSAL</div>
                  <div style={{fontSize:11,color:T.muted,marginBottom:12}}>Proposed by {teams.find(t=>t.id===ruleProposal.proposedBy)?.name || "Admin"} • {new Date(ruleProposal.proposedAt).toLocaleDateString()}</div>
                  {Object.entries(ruleProposal.changes).map(([key, val]) => (
                    <div key={key} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${T.border}33`}}>
                      <div style={{fontSize:12,color:T.muted}}>{key}</div>
                      <div style={{fontSize:12,color:T.accent,fontWeight:700}}>{val}</div>
                    </div>
                  ))}
                  <div style={{marginTop:12}}>
                    <div style={{fontSize:11,color:T.muted,marginBottom:8}}>VOTES ({Object.keys(ruleProposal.votes).length}/{eligibleVoters.length}):</div>
                    {eligibleVoters.map(t => (
                      <div key={t.id} style={{display:"flex",justifyContent:"space-between",padding:"4px 0"}}>
                        <div style={{fontSize:12,color:t.color}}>{t.name}</div>
                        <div style={{fontSize:12,fontWeight:700,color:ruleProposal.votes[t.id]==="approved"?"#2ECC71":ruleProposal.votes[t.id]==="rejected"?"#FF3D5A":"#4A5E78"}}>{ruleProposal.votes[t.id]||"Pending"}</div>
                      </div>
                    ))}
                  </div>
                  {/* Vote section for current user */}
                  {myTeam && eligibleVoters.some(t=>t.id===myTeam.id) && !ruleProposal.votes[myTeam.id] && (
                    <div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${T.border}`}}>
                      <div style={{fontSize:12,color:T.text,marginBottom:8}}>Cast your vote as <span style={{color:myTeam.color,fontWeight:700}}>{myTeam.name}</span></div>
                      <input type="password" value={votePin} onChange={e=>{setVotePin(e.target.value);setVotePinErr('');}} placeholder="Enter your team PIN" maxLength={6}
                        style={{width:"100%",background:T.bg,border:"1px solid "+(votePinErr?"#FF3D5A":"#1E2D45"),borderRadius:8,padding:"10px 14px",color:T.text,fontSize:18,letterSpacing:4,textAlign:"center",fontFamily:fonts.display,outline:"none",marginBottom:votePinErr?6:12,boxSizing:"border-box"}} />
                      {votePinErr && <div style={{color:T.danger,fontSize:12,marginBottom:10,textAlign:"center"}}>{votePinErr}</div>}
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>voteOnProposal(false)} style={{flex:1,background:T.dangerBg,border:`1px solid ${T.danger}44`,borderRadius:8,padding:10,color:T.danger,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>✕ REJECT</button>
                        <button onClick={()=>voteOnProposal(true)} style={{flex:1,background:T.successBg,border:`1px solid ${T.success}44`,borderRadius:8,padding:10,color:T.success,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>✓ APPROVE</button>
                      </div>
                    </div>
                  )}
                  {/* Admin cancel proposal */}
                  <button onClick={()=>withPassword(()=>updRuleProposal(null))} style={{width:"100%",marginTop:10,background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:8,color:T.muted,fontFamily:fonts.body,fontWeight:700,fontSize:12,cursor:"pointer"}}>CANCEL PROPOSAL (Admin)</button>
                </div>
              )}

              {/* Last approved/rejected */}
              {ruleProposal && ruleProposal.status !== "pending" && (
                <div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,padding:16,marginBottom:16}}>
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

              {/* Propose new timing change — always visible, needs admin password */}
              {showRulesPanel === true && (!ruleProposal || ruleProposal.status !== "pending") && (
                <ProposeRulesForm teams={teams} eligibleVoters={eligibleVoters} tournamentStarted={tournamentStarted} onPropose={proposeRuleChange} withPassword={withPassword} isAdmin={isAdmin}
                  onApplyDirect={async (changes) => {
                    const existingConfig = await storeGet("pitchConfig") || {};
                    const newConfig = {
                      ...existingConfig,
                      ...(changes["Transfer Start"] ? { transferStart: changes["Transfer Start"] } : {}),
                      ...(changes["Transfer End"] ? { transferEnd: changes["Transfer End"] } : {}),
                      ...(changes["Snatch Return"] ? { snatchReturn: changes["Snatch Return"] } : {}),
                      ...(changes["Snatch Window"] ? { snatchWindow: changes["Snatch Window"] } : {}),
                    };
                    await storeSet("pitchConfig", newConfig);
                    setPitchConfig(newConfig);
                    alert("✅ Config applied directly — no vote needed.");
                  }}
                />
              )}
            </div>
          </div>
        )}

        {/* ADD TOURNAMENT MODAL */}
        {addTournamentModal && (
          <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.97)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:24,fontFamily:fonts.body}}>
            <div style={{background:T.card,borderRadius:16,border:`1px solid ${T.border}`,padding:28,width:"100%",maxWidth:420}}>
              <div style={{fontFamily:fonts.display,fontSize:22,fontWeight:700,color:T.accent,letterSpacing:2,marginBottom:4}}>ADD TOURNAMENT</div>
              <div style={{fontSize:12,color:T.muted,marginBottom:20}}>Choose source then search for your tournament</div>

              {!addTournamentSource ? (
                <div>
                  <div style={{fontSize:11,color:T.muted,letterSpacing:2,marginBottom:10}}>SELECT SOURCE</div>
                  <div style={{display:"flex",gap:10}}>
                    <button onClick={()=>{setAddTournamentSource('cb');fetchTournamentSeriesSuggestions('cb');}}
                      style={{flex:1,background:T.accentBg,border:"2px solid #F5A62344",borderRadius:10,padding:"14px 10px",cursor:"pointer",textAlign:"center"}}>
                      <div style={{fontSize:20,marginBottom:4}}>🟠</div>
                      <div style={{fontWeight:700,fontSize:14,color:T.accent}}>Cricbuzz</div>
                      <div style={{fontSize:10,color:T.muted,marginTop:2}}>100 req/month</div>
                    </button>
                    <button onClick={()=>{setAddTournamentSource('cd');fetchTournamentSeriesSuggestions('cd');}}
                      style={{flex:1,background:T.successBg,border:"2px solid #2ECC7144",borderRadius:10,padding:"14px 10px",cursor:"pointer",textAlign:"center"}}>
                      <div style={{fontSize:20,marginBottom:4}}>🟢</div>
                      <div style={{fontWeight:700,fontSize:14,color:T.success}}>CricketData</div>
                      <div style={{fontSize:10,color:T.muted,marginTop:2}}>100 req/day</div>
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                    <button onClick={()=>{setAddTournamentSource(null);setAddTournamentSeries([]);setAddTournamentSeriesInput('');setAddTournamentSelected(null);}}
                      style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:18,padding:0}}>←</button>
                    <div style={{fontSize:13,color:addTournamentSource==='cb'?"#F5A623":"#2ECC71",fontWeight:700}}>
                      {addTournamentSource==='cb'?"🟠 Cricbuzz":"🟢 CricketData"}
                    </div>
                  </div>
                  <div style={{fontSize:11,color:T.muted,letterSpacing:2,marginBottom:8}}>SEARCH TOURNAMENT</div>
                  <input value={addTournamentSeriesInput} onChange={e=>setAddTournamentSeriesInput(e.target.value)}
                    placeholder="Search tournament..." autoFocus
                    style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",color:T.text,fontSize:14,fontFamily:fonts.body,outline:"none",marginBottom:8,boxSizing:"border-box"}} />
                  {addTournamentSeriesLoading ? (
                    <div style={{textAlign:"center",padding:16,color:T.muted,fontSize:13}}>Fetching tournaments...</div>
                  ) : (
                    <div style={{maxHeight:220,overflowY:"auto",border:`1px solid ${T.border}`,borderRadius:8,marginBottom:12}}>
                      {addTournamentSeries
                        .filter(s=>!addTournamentSeriesInput||s.name.toLowerCase().includes(addTournamentSeriesInput.toLowerCase()))
                        .slice(0,25)
                        .map(s=>(
                          <div key={s.id} onClick={()=>setAddTournamentSelected(s)}
                            style={{padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid #1E2D4433",background:addTournamentSelected?.id===s.id?"#F5A62322":"transparent",color:addTournamentSelected?.id===s.id?"#F5A623":"#E2EAF4",fontSize:13}}>
                            {s.name}
                            {addTournamentSelected?.id===s.id&&<span style={{marginLeft:8}}>✓</span>}
                          </div>
                        ))}
                      {addTournamentSeries.filter(s=>!addTournamentSeriesInput||s.name.toLowerCase().includes(addTournamentSeriesInput.toLowerCase())).length===0&&(
                        <div style={{padding:16,color:T.muted,fontSize:13,textAlign:"center"}}>No tournaments found</div>
                      )}
                    </div>
                  )}
                  {addTournamentSelected&&(
                    <div style={{background:T.accentBg,border:`1px solid ${T.accentBorder}`,borderRadius:8,padding:"8px 12px",marginBottom:4,fontSize:12,color:T.accent}}>
                      Selected: <strong>{addTournamentSelected.name}</strong>
                    </div>
                  )}
                </div>
              )}

              <div style={{display:"flex",gap:10,marginTop:16}}>
                <button onClick={()=>{setAddTournamentModal(false);setAddTournamentSource(null);setAddTournamentSeries([]);setAddTournamentSeriesInput('');setAddTournamentSelected(null);}}
                  style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:11,color:T.muted,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
                {addTournamentSelected&&(
                  <button onClick={confirmAddTournament}
                    style={{flex:2,background:`linear-gradient(135deg,${T.accent},${T.accentDim})`,border:"none",borderRadius:8,padding:11,color:T.bg,fontFamily:fonts.body,fontWeight:800,fontSize:15,cursor:"pointer"}}>ADD TOURNAMENT</button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* FETCH PLAYERS MODAL */}
        {/* AI Match Generator Modal */}
        {aiMatchModal && (
          <div style={{position:"fixed",inset:0,background:"rgba(5,8,16,0.95)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:20}}>
            <div style={{background:T.card,borderRadius:18,border:`1px solid ${T.purple}44`,padding:28,width:"100%",maxWidth:420,boxShadow:"0 24px 80px rgba(0,0,0,0.7)"}}>
              <div style={{textAlign:"center",marginBottom:20}}>
                <div style={{fontSize:36,marginBottom:8}}>🤖</div>
                <div style={{fontFamily:fonts.display,fontWeight:800,fontSize:20,color:T.purple,letterSpacing:1,marginBottom:4}}>AI MATCH GENERATOR</div>
                <div style={{fontFamily:fonts.body,fontSize:13,color:T.muted}}>
                  Extracting matches for <span style={{color:T.text,fontWeight:600}}>{aiMatchModal.tournamentName}</span>
                </div>
              </div>

              <div style={{background:T.bg,borderRadius:10,padding:"12px 14px",marginBottom:20,border:`1px solid ${T.border}`}}>
                <div style={{fontFamily:fonts.body,fontSize:12,color:T.muted,marginBottom:4}}>ℹ️ AI will generate match fixtures with dates, teams and venues. You'll still need to sync stats manually for each match.</div>
              </div>

              <div style={{display:"flex",gap:8,marginBottom:16}}>
                <button onClick={()=>setAiMatchReplace(false)}
                  style={{flex:1,padding:"8px",borderRadius:8,border:`1px solid ${!aiMatchReplace?T.success:T.border}`,background:!aiMatchReplace?T.successBg:"transparent",color:!aiMatchReplace?T.success:T.muted,fontFamily:fonts.display,fontWeight:700,fontSize:11,cursor:"pointer"}}>
                  ➕ ADD NEW ONLY
                </button>
                <button onClick={()=>setAiMatchReplace(true)}
                  style={{flex:1,padding:"8px",borderRadius:8,border:`1px solid ${aiMatchReplace?T.danger:T.border}`,background:aiMatchReplace?T.dangerBg:"transparent",color:aiMatchReplace?T.danger:T.muted,fontFamily:fonts.display,fontWeight:700,fontSize:11,cursor:"pointer"}}>
                  🗑 CLEAR & REPLACE ALL
                </button>
              </div>
              <div style={{fontFamily:fonts.display,fontSize:10,fontWeight:700,color:T.muted,letterSpacing:2,marginBottom:8}}>PASTE SCHEDULE FROM CRICBUZZ</div>
              <div style={{fontFamily:fonts.body,fontSize:11,color:T.muted,marginBottom:8}}>
                Go to Cricbuzz → your tournament → Schedule tab → select all text → paste below
              </div>
              <textarea
                value={aiMatchText}
                onChange={e=>setAiMatchText(e.target.value)}
                placeholder="Paste schedule text from Cricbuzz here..."
                rows={8}
                style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:9,padding:"10px 14px",color:T.text,fontSize:12,fontFamily:fonts.body,outline:"none",resize:"vertical",boxSizing:"border-box",marginBottom:16,lineHeight:1.5}}
              />

              {aiMatchError && (
                <div style={{background:T.dangerBg,border:`1px solid ${T.danger}33`,borderRadius:8,padding:"10px 14px",marginBottom:12,fontFamily:fonts.body,fontSize:12,color:T.danger}}>
                  ❌ {aiMatchError}
                </div>
              )}
              {aiMatchSuccess && (
                <div style={{background:T.successBg,border:`1px solid ${T.success}33`,borderRadius:8,padding:"10px 14px",marginBottom:12,fontFamily:fonts.body,fontSize:12,color:T.success}}>
                  {aiMatchSuccess}
                </div>
              )}
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>{setAiMatchModal(null);setAiMatchError("");setAiMatchSuccess("");setAiMatchText("");setAiMatchReplace(false);}}
                  style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:10,padding:12,color:T.muted,fontFamily:fonts.display,fontWeight:700,fontSize:13,cursor:"pointer"}}>
                  {aiMatchSuccess ? "CLOSE" : "CANCEL"}
                </button>
                {!aiMatchSuccess && (
                  <button onClick={()=>{setAiMatchError("");generateAiMatches();}} disabled={aiMatchGenerating}
                    style={{flex:2,background:aiMatchGenerating?"#A855F733":`linear-gradient(135deg,${T.purple},#7C3AED)`,border:"none",borderRadius:10,padding:12,color:"#fff",fontFamily:fonts.display,fontWeight:800,fontSize:14,cursor:aiMatchGenerating?"not-allowed":"pointer",letterSpacing:0.5}}>
                    {aiMatchGenerating ? "⏳ PARSING…" : "📋 PARSE SCHEDULE"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {fetchPlayerModal && (
          <FetchPlayers
            existingPlayers={players}
            tournamentId={fetchPlayerModal.tournamentId}
            tournamentName={fetchPlayerModal.tournamentName}
            onPlayersAdded={(newOnes) => {
              // Tag players with tournamentId if provided
              const tagged = newOnes.map(p => fetchPlayerModal.tournamentId ? {...p, tournamentId: fetchPlayerModal.tournamentId} : p);
              const all = [...players, ...tagged.filter(n => !players.find(p => p.id === n.id))];
              setPlayers(all); storeSet("players", all);
            }}
            onClose={() => {
              setFetchPlayerModal(null);
              setFetchPlayerSource(null);
              setFetchPlayerSeries([]);
              setFetchPlayerSeriesInput('');
              setFetchPlayerSelectedSeries(null);
            }}
          />
        )}

                {/* CAPTAIN PICKER MODAL */}
        {captainMatch && <CaptainModal
          match={captainMatch}
          teams={teams}
          players={players}
          assignments={assignments}
          captains={captains}
          points={points}
          myTeam={myTeam || (() => {
            if (!user?.email || !teamIdentity) return null;
            const found = Object.entries(teamIdentity).find(([,t]) => t.claimedBy === user.email);
            if (!found) return null;
            const [key, entry] = found;
            const tid = entry.teamRef || key;
            return teams.find(t => t.id === tid) || null;
          })()}
          unlocked={unlocked}
          isGuest={isGuest}
          withPassword={withPassword}
          onSave={(updated) => updCaptains(updated)}
          onClose={() => setCaptainMatch(null)}
        />}

        {/* GENERIC CONFIRM MODAL */}
        {confirmAction && (
          <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.95)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500,padding:16,fontFamily:fonts.body}}>
            <div style={{background:T.card,borderRadius:16,border:`1px solid ${T.danger}44`,padding:24,width:"100%",maxWidth:380}}>
              <div style={{fontSize:22,marginBottom:12,textAlign:"center"}}>⚠️</div>
              <div style={{fontSize:14,color:T.text,marginBottom:20,textAlign:"center",lineHeight:1.5}}>{confirmAction.msg}</div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setConfirmAction(null)} style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:11,color:T.muted,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
                <button onClick={()=>{confirmAction.fn();setConfirmAction(null);}} style={{flex:1,background:T.dangerBg,border:"1px solid #FF3D5A",borderRadius:8,padding:11,color:T.danger,fontFamily:fonts.body,fontWeight:800,fontSize:14,cursor:"pointer"}}>CONFIRM</button>
              </div>
            </div>
          </div>
        )}

        {showFixOwnership && (
          <FixOwnershipModal
            players={players}
            teams={teams}
            ownershipLog={ownershipLog}
            onSave={(newLog) => { updOwnership(newLog); }}
            onClose={() => setShowFixOwnership(false)}
          />
        )}

        {showWeeklyReport && (
          <WeeklyReport
            teams={teams}
            players={players}
            assignments={assignments}
            points={points}
            captains={captains}
            matches={matches}
            snatch={snatch}
            onClose={()=>setShowWeeklyReport(false)}
          />
        )}

        {showMVP && (
          <MVPStats
            players={players}
            teams={teams}
            assignments={assignments}
            points={points}
            captains={captains}
            matches={matches}
            snatch={snatch}
            onClose={()=>setShowMVP(false)}
          />
        )}

        {showAllTimeXI && (
          <AllTimeXI
            teams={teams}
            players={players}
            assignments={assignments}
            points={points}
            snatch={snatch}
            onClose={()=>setShowAllTimeXI(false)}
          />
        )}

        {/* ADMIN CLAIM TEAM MODAL */}
        {adminClaimModal && adminClaimTeam && (
          <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.97)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:400,padding:20,fontFamily:fonts.body}}>
            <div style={{background:T.card,borderRadius:16,border:`1px solid ${T.border}`,padding:24,width:"100%",maxWidth:360}}>
              <div style={{fontFamily:fonts.display,fontSize:20,fontWeight:700,color:T.success,marginBottom:4}}>CLAIM YOUR TEAM</div>
              <div style={{background:T.successBg,border:`1px solid ${T.success}33`,borderRadius:8,padding:"10px 14px",marginBottom:16,textAlign:"center"}}>
                <div style={{fontSize:11,color:T.muted,marginBottom:2}}>Claiming as admin</div>
                <div style={{fontFamily:fonts.display,fontSize:20,fontWeight:700,color:adminClaimTeam.color}}>{adminClaimTeam.name}</div>
              </div>
              <div style={{fontSize:12,color:T.muted,marginBottom:12}}>Set a PIN for snatch, voting and approvals</div>
              <input type="password" inputMode="numeric" value={adminPin}
                onChange={e=>{setAdminPin(e.target.value);setAdminPinErr('');}}
                placeholder="Choose a 4+ digit PIN" autoFocus
                style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",color:T.text,fontSize:14,fontFamily:fonts.body,outline:"none",marginBottom:8,boxSizing:"border-box"}} />
              <input type="password" inputMode="numeric" value={adminPinConfirm}
                onChange={e=>{setAdminPinConfirm(e.target.value);setAdminPinErr('');}}
                onKeyDown={async e=>{if(e.key==="Enter") await doAdminClaim();}}
                placeholder="Confirm PIN"
                style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",color:T.text,fontSize:14,fontFamily:fonts.body,outline:"none",marginBottom:8,boxSizing:"border-box"}} />
              {adminPinErr && <div style={{color:T.danger,fontSize:12,marginBottom:8}}>{adminPinErr}</div>}
              <div style={{display:"flex",gap:8,marginTop:4}}>
                <button onClick={()=>{setAdminClaimModal(false);setAdminClaimTeam(null);}}
                  style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:10,color:T.muted,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
                <button onClick={async()=>{
                  if(adminPin.length<4){setAdminPinErr("PIN must be at least 4 digits");return;}
                  if(adminPin!==adminPinConfirm){setAdminPinErr("PINs don't match");return;}
                  const hashBuf = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(adminPin));
                  const pinHash = Array.from(new Uint8Array(hashBuf)).map(b=>b.toString(16).padStart(2,"0")).join("");
                  // Save to teamIdentity
                  const identity = await storeGet("teamIdentity") || {};
                  const key = adminClaimTeam.id;
                  identity[key] = {...(identity[key]||{}), claimedBy: user.email, pinHash, teamRef: adminClaimTeam.id};
                  await storeSet("teamIdentity", identity);
                  setTeamIdentity(identity);
                  // Save to localStorage and reload so Root picks up the new team
                  const teamData = {...adminClaimTeam};
                  try { localStorage.setItem('tb_myteam_'+pitch.id, JSON.stringify(teamData)); localStorage.setItem('tb_pinHash_'+pitch.id, pinHash); } catch {}
                  setAdminClaimModal(false); setAdminClaimTeam(null);
                  alert("✅ You've claimed "+adminClaimTeam.name+"! Reloading to apply changes.");
                  window.location.reload();
                }}
                  style={{flex:2,background:"linear-gradient(135deg,#2ECC71,#16a34a)",border:"none",borderRadius:8,padding:10,color:"#fff",fontFamily:fonts.body,fontWeight:800,fontSize:15,cursor:"pointer"}}>CLAIM & SET PIN</button>
              </div>
            </div>
          </div>
        )}

        {drawerOpen && (
          <div onClick={()=>setDrawerOpen(false)} style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.6)",display:"flex"}}>
            <div onClick={e=>e.stopPropagation()} style={{width:260,background:T.card,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",height:"100%"}}>
              <div style={{padding:"20px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontFamily:fonts.display,fontWeight:700,fontSize:16,color:T.accent,letterSpacing:2}}>MENU</div>
                <button onClick={()=>setDrawerOpen(false)} style={{background:"transparent",border:"none",color:T.muted,fontSize:20,cursor:"pointer",lineHeight:1}}>×</button>
              </div>
              <div style={{flex:1,padding:"12px 8px",overflowY:"auto"}}>
                <button onClick={()=>{nav("form");setDrawerOpen(false);}} style={{width:"100%",background:page==="form"?"#F5A62322":"transparent",border:"1px solid "+(page==="form"?"#F5A62344":"transparent"),borderRadius:10,padding:"12px 14px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:12,marginBottom:4}}>
                  <span style={{fontSize:22}}>📈</span>
                  <div>
                    <div style={{fontFamily:fonts.body,fontWeight:700,fontSize:14,color:page==="form"?"#F5A623":"#E2EAF4"}}>Player Form Chart</div>
                    <div style={{fontSize:11,color:T.muted,marginTop:1}}>Last 5 matches per player</div>
                  </div>
                </button>
                <button onClick={()=>{nav("h2h");setDrawerOpen(false);}} style={{width:"100%",background:page==="h2h"?"#4F8EF722":"transparent",border:"1px solid "+(page==="h2h"?"#4F8EF744":"transparent"),borderRadius:10,padding:"12px 14px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:12,marginBottom:4}}>
                  <span style={{fontSize:22}}>⚔️</span>
                  <div>
                    <div style={{fontFamily:fonts.body,fontWeight:700,fontSize:14,color:page==="h2h"?"#4F8EF7":"#E2EAF4"}}>Head to Head</div>
                    <div style={{fontSize:11,color:T.muted,marginTop:1}}>Compare two teams across matches</div>
                  </div>
                </button>

                {/* Notifications */}
                <div style={{marginTop:4}}>
                <button onClick={()=>{setShowMVP(true);setDrawerOpen(false);}} style={{width:"100%",background:"transparent",border:"none",padding:"10px 14px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:12}}>
                  <span style={{fontSize:20}}>🏅</span>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:fonts.body,fontWeight:600,fontSize:14,color:T.text,fontFamily:fonts.body}}>MVP Stats</div>
                    <div style={{fontSize:11,color:T.muted}}>Weekly player performance</div>
                  </div>
                </button>
                <button onClick={()=>{setShowAllTimeXI(true);setDrawerOpen(false);}} style={{width:"100%",background:"transparent",border:"none",padding:"10px 14px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:12}}>
                  <span style={{fontSize:20}}>🏏</span>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:fonts.body,fontWeight:600,fontSize:14,color:T.text}}>All Time XI</div>
                    <div style={{fontSize:11,color:T.muted}}>Top 11 per team by base points</div>
                  </div>
                </button>
                <button onClick={()=>{setShowWeeklyReport(true);setDrawerOpen(false);}} style={{width:"100%",background:showWeeklyReport?"#2ECC7122":"transparent",border:"1px solid "+(showWeeklyReport?"#2ECC7144":"transparent"),borderRadius:10,padding:"10px 14px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:12,marginBottom:4}}>
                  <span style={{fontSize:20}}>📋</span>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:fonts.body,fontWeight:600,fontSize:14,color:T.text,fontFamily:fonts.body}}>Weekly Report</div>
                    <div style={{fontSize:11,color:T.muted}}>This week & last week summary</div>
                  </div>
                </button>
                  <button onClick={()=>{setNotifOpen(o=>!o);if(!notifOpen)markNotifsRead();}} style={{width:"100%",background:"transparent",border:"none",padding:"10px 14px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:12}}>
                    <span style={{fontSize:20,position:"relative"}}>
                      🔔
                      {unreadNotifCount>0 && <span style={{position:"absolute",top:-4,right:-4,background:"#FF3D5A",borderRadius:"50%",width:14,height:14,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,color:"#fff"}}>{unreadNotifCount}</span>}
                    </span>
                    <div style={{flex:1}}>
                      <div style={{fontFamily:fonts.body,fontWeight:600,fontSize:14,color:T.text,fontFamily:fonts.body}}>Notifications</div>
                      <div style={{fontSize:11,color:T.muted,marginTop:1}}>{unreadNotifCount>0?unreadNotifCount+" unread":"All caught up"}</div>
                    </div>
                    <span style={{color:T.muted,fontSize:11}}>{notifOpen?"▲":"▼"}</span>
                  </button>
                  {notifOpen && (
                    <div style={{background:T.bg,borderRadius:10,margin:"0 8px 8px",border:`1px solid ${T.border}`,maxHeight:280,overflowY:"auto"}}>
                      {notifications.length===0 && <div style={{padding:16,textAlign:"center",color:"#2D3E52",fontSize:12}}>No notifications yet</div>}
                      {[...notifications].reverse().map(n=>(
                        <div key={n.id} style={{padding:"10px 14px",borderBottom:"1px solid #1E2D4433",background:n.ts>notifLastRead?"#F5A62308":"transparent"}}>
                          <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
                            <span style={{fontSize:14,flexShrink:0}}>{n.emoji}</span>
                            <div style={{flex:1}}>
                              <div style={{fontSize:12,color:T.text,lineHeight:1.4}}>{n.text}</div>
                              <div style={{fontSize:10,color:"#2D3E52",marginTop:3}}>{new Date(n.ts).toLocaleString("en-IN",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
                            </div>
                            {n.ts>notifLastRead && <span style={{width:6,height:6,borderRadius:"50%",background:"#F5A623",flexShrink:0,marginTop:4}} />}
                          </div>
                        </div>
                      ))}
                      {unlocked && (
                        <div style={{padding:"8px 10px",borderTop:`1px solid ${T.border}`}}>
                          <div style={{display:"flex",gap:6,marginBottom:6}}>
                            <input value={broadcastInput} onChange={e=>setBroadcastInput(e.target.value)} placeholder="Broadcast message..."
                              onKeyDown={e=>e.key==="Enter"&&broadcastNotif()}
                              style={{flex:1,background:T.card,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 10px",color:T.text,fontSize:12,fontFamily:fonts.body,outline:"none"}} />
                            <button onClick={broadcastNotif} style={{background:T.accentBg,border:`1px solid ${T.accentBorder}`,color:T.accent,borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:12,fontFamily:fonts.body,fontWeight:700}}>📢</button>
                          </div>
                          <button onClick={()=>withPassword(clearNotifications)} style={{width:"100%",background:"transparent",border:`1px solid ${T.border}`,borderRadius:6,padding:"5px",color:T.muted,fontSize:11,cursor:"pointer",fontFamily:fonts.body}}>Clear all notifications</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Team IDs - collapsible */}
                <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${T.border}`}}>
                  <button onClick={()=>setTeamIdsOpen(o=>!o)} style={{width:"100%",background:"transparent",border:"none",padding:"4px 6px 8px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div style={{fontSize:10,color:T.accent,letterSpacing:2,fontWeight:700}}>🔑 TEAM IDs</div>
                    <span style={{fontSize:10,color:T.muted}}>{teamIdsOpen?"▲":"▼"}</span>
                  </button>
                  {teamIdsOpen && teams.map(t => {
                    const ti = teamIdentity[t.id] || {};
                    return (
                      <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,padding:"8px 10px",background:T.bg,borderRadius:8,border:"1px solid "+t.color+"33"}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:12,color:t.color}}>{t.name}</div>
                          <div style={{fontSize:10,color:T.muted,marginTop:1}}>{ti.claimedBy ? ti.claimedBy.split("@")[0] : "Unclaimed"}</div>
                        </div>
                        {ti.claimedBy ? (
                          <div style={{display:"flex",alignItems:"center",gap:4}}>
                            <span style={{fontSize:10,color:T.success,fontWeight:700}}>✓ {ti.claimedBy.split("@")[0]}</span>
                            <button onClick={async()=>{
                              if(!confirm("Reset claim for "+t.name+"?")) return;
                              const updated = {...teamIdentity, [t.id]: {...ti, claimedBy:null, pinHash:null}};
                              setTeamIdentity(updated);
                              await storeSet("teamIdentity", updated);
                            }} style={{background:T.dangerBg,border:`1px solid ${T.danger}33`,color:T.danger,borderRadius:4,padding:"2px 5px",cursor:"pointer",fontSize:9,fontWeight:700}}>RESET</button>
                          </div>
                        ) : ti.teamId ? (
                          <div style={{display:"flex",alignItems:"center",gap:4}}>
                            <div style={{fontFamily:fonts.display,fontSize:14,fontWeight:800,color:T.accent,letterSpacing:2,background:T.accentBg,padding:"3px 8px",borderRadius:6}}>{ti.teamId}</div>
                            <button onClick={()=>{setAdminClaimTeam(t);setAdminClaimModal(true);setAdminPin('');setAdminPinConfirm('');setAdminPinErr('');}}
                              style={{background:T.successBg,border:`1px solid ${T.success}44`,color:T.success,borderRadius:4,padding:"2px 5px",cursor:"pointer",fontSize:9,fontWeight:700}}>CLAIM</button>
                            <button onClick={()=>withPassword(async()=>{
                              if(!confirm("Reset this Team ID?")) return;
                              const newId = generateTeamId();
                              const updated = {...teamIdentity, [t.id]: {teamId: newId}};
                              setTeamIdentity(updated);
                              await storeSet("teamIdentity", updated);
                            })} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.muted,borderRadius:4,padding:"2px 5px",cursor:"pointer",fontSize:10}}>↺</button>
                          </div>
                        ) : (
                          <div style={{display:"flex",alignItems:"center",gap:4}}>
                            <button onClick={()=>withPassword(async()=>{
                              const newId = generateTeamId();
                              const updated = {...teamIdentity, [t.id]: {...ti, teamId: newId}};
                              setTeamIdentity(updated);
                              await storeSet("teamIdentity", updated);
                            })} style={{background:T.accentBg,border:`1px solid ${T.accentBorder}`,color:T.accent,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,fontFamily:fonts.body,fontWeight:700}}>GENERATE</button>
                            <button onClick={()=>{setAdminClaimTeam(t);setAdminClaimModal(true);setAdminPin('');setAdminPinConfirm('');setAdminPinErr('');}}
                              style={{background:T.successBg,border:`1px solid ${T.success}44`,color:T.success,borderRadius:4,padding:"2px 5px",cursor:"pointer",fontSize:9,fontWeight:700}}>CLAIM</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pending vote notification */}
              {pendingVote && (
                <div style={{margin:"0 8px 8px",background:T.dangerBg,border:`1px solid ${T.danger}33`,borderRadius:10,padding:"12px 14px"}}>
                  <div style={{fontSize:11,color:T.danger,fontWeight:700,letterSpacing:1,marginBottom:4}}>⚡ VOTE NEEDED</div>
                  <div style={{fontSize:11,color:T.text,marginBottom:8}}>A rule change has been proposed and needs your vote.</div>
                  <button onClick={()=>{setShowRulesPanel(true);setDrawerOpen(false);}} style={{width:"100%",background:T.dangerBg,border:"1px solid #FF3D5A",borderRadius:6,padding:"7px",color:T.danger,fontFamily:fonts.body,fontWeight:700,fontSize:12,cursor:"pointer"}}>VIEW & VOTE →</button>
                </div>
              )}

              {/* Points & Rules button */}
              <button onClick={()=>{setShowRulesPanel(true);setDrawerOpen(false);}} style={{width:"100%",background:"transparent",border:"none",padding:"10px 14px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:20}}>📋</span>
                <div style={{flex:1}}>
                  <div style={{fontFamily:fonts.body,fontWeight:600,fontSize:14,color:T.text,fontFamily:fonts.body}}>Points & Rules</div>
                  <div style={{fontSize:11,color:T.muted}}>Points system & league timing</div>
                </div>
                {pendingVote && <span style={{width:8,height:8,background:"#FF3D5A",borderRadius:"50%",flexShrink:0}} />}
              </button>

              {/* Fix Ownership — admin only */}
              {isAdmin && (
                <button onClick={()=>{setShowFixOwnership(true);setDrawerOpen(false);}} style={{width:"100%",background:"transparent",border:"none",padding:"10px 14px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:12}}>
                  <span style={{fontSize:20}}>🔧</span>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:fonts.body,fontWeight:600,fontSize:14,color:T.text}}>Fix Ownership Log</div>
                    <div style={{fontSize:11,color:T.muted}}>Fix player points attribution errors</div>
                  </div>
                </button>
              )}

              {/* Guest Access toggle - always visible to admin */}
              {isAdmin && (
                <div style={{padding:"8px 14px 0"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:T.bg,borderRadius:10,border:`1px solid ${T.border}`}}>
                    <div>
                      <div style={{fontFamily:fonts.body,fontWeight:700,fontSize:13,color:T.text}}>👁 Guest Access</div>
                      <div style={{fontSize:10,color:T.muted,marginTop:2}}>Allow guests to view this pitch</div>
                    </div>
                    <button onClick={async()=>{
                      const now = !guestAllowed;
                      const pws = await sbGet("pitches") || [];
                      const updated = pws.map(p=>p.id===pitch.id?{...p,guestAllowed:now}:p);
                      await sbSet("pitches", updated);
                      setGuestAllowed(now);
                    }} style={{background:"none",border:"none",cursor:"pointer",padding:0,flexShrink:0}}>
                      <span style={{width:44,height:24,borderRadius:12,background:guestAllowed?"#2ECC71":"#1E2D45",position:"relative",transition:"background 0.2s",display:"inline-block"}}>
                        <span style={{position:"absolute",top:3,left:guestAllowed?23:3,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"left 0.2s",display:"block"}} />
                      </span>
                    </button>
                  </div>
                </div>
              )}
              <div style={{padding:"16px",borderTop:`1px solid ${T.border}`}}>
                <button onClick={onLogout} style={{width:"100%",background:T.dangerBg,border:`1px solid ${T.danger}33`,borderRadius:8,padding:"10px",color:T.danger,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>LOGOUT</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function AdminSetupScreen({ pitch, onDone, onBack, sbGet, sbSet, hashPw }) {
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


function Root() {
  const [currentUser, setCurrentUser] = useState(() => {
    try { const s = localStorage.getItem('tb_user'); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [currentPitch, setCurrentPitch] = useState(() => {
    try { const s = localStorage.getItem('tb_pitch'); const p = s ? JSON.parse(s) : null; if(p) _pitchId = p.id; return p; } catch { return null; }
  });
  const [pendingPitches, setPendingPitches] = useState(null);
  // Restore full session from localStorage on refresh
  const [screen, setScreen] = useState(() => {
    try {
      const saved = localStorage.getItem('tb_screen') || 'pitches';
      // Only restore 'pitches' or 'app' — transitional screens reset to pitches
      if (saved === 'pitches') return 'pitches';
      if (saved === 'app') {
        const pitch = JSON.parse(localStorage.getItem('tb_pitch') || 'null');
        if (!pitch) return 'pitches';
        // Only restore app if we have credentials
        if (localStorage.getItem('tb_admin_' + pitch.id) || localStorage.getItem('tb_myteam_' + pitch.id)) return 'app';
      }
      return 'pitches';
    } catch { return 'pitches'; }
  });

  // Save screen to localStorage whenever it changes
  const setScreenAndSave = (s) => {
    setScreen(s);
    try { localStorage.setItem('tb_screen', s); } catch {}
  };
  const [myTeam, setMyTeam] = useState(() => {
    try {
      const pitch = JSON.parse(localStorage.getItem('tb_pitch') || 'null');
      if (!pitch) return null;
      const t = localStorage.getItem('tb_myteam_' + pitch.id);
      return t ? JSON.parse(t) : null;
    } catch { return null; }
  });
  const [myPinHash, setMyPinHash] = useState(() => {
    try {
      const pitch = JSON.parse(localStorage.getItem('tb_pitch') || 'null');
      if (!pitch) return null;
      return localStorage.getItem('tb_pinHash_' + pitch.id) || null;
    } catch { return null; }
  });
  const [isGuest, setIsGuest] = useState(false);
  const [isAdmin, setIsAdmin] = useState(() => {
    try {
      const pitch = JSON.parse(localStorage.getItem('tb_pitch') || 'null');
      if (!pitch) return false;
      return !!localStorage.getItem('tb_admin_' + pitch.id);
    } catch { return false; }
  });

  const sbGet = async (key) => { try { const res = await fetch("https://rmcxhorijitrhqyrvvkn.supabase.co/rest/v1/league_data?key=eq."+encodeURIComponent(key), {headers:{"apikey":"sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm","Authorization":"Bearer sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm"}}); const d=await res.json(); return d[0]?.value; } catch { return null; } };
  const sbSet = async (key, value) => { try { await fetch("https://rmcxhorijitrhqyrvvkn.supabase.co/rest/v1/league_data", {method:"POST",headers:{"apikey":"sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm","Authorization":"Bearer sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm","Content-Type":"application/json","Prefer":"resolution=merge-duplicates"},body:JSON.stringify({key,value,updated_at:new Date().toISOString()})}); } catch {} };
  const hashPw = async (pw) => { const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw)); return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join(""); };

  const handleLogin = (user) => {
    setCurrentUser(user);
    try { localStorage.setItem('tb_user', JSON.stringify(user)); } catch {}
  };

  const handleLogout = () => {
    setCurrentUser(null); setCurrentPitch(null); setMyTeam(null); setMyPinHash(null);
    setIsGuest(false); setIsAdmin(false); setScreenAndSave('pitches');
    try { localStorage.removeItem('tb_user'); } catch {}
  };

  const handleEnterPitch = async (pitch) => {
    _pitchId = pitch.id;
    setCurrentPitch(pitch);
    // Save pitch to localStorage for refresh restoration
    try { localStorage.setItem('tb_pitch', JSON.stringify(pitch)); } catch {}
    // Clear legacy keys
    try { localStorage.removeItem('tb_myteam'); localStorage.removeItem('tb_pinHash'); localStorage.removeItem('tb_skipped'); } catch {}
    // Guests always see 3-option screen
    try { localStorage.removeItem('tb_guest_' + pitch.id); } catch {}

    // Check localStorage first (fastest)
    try {
      const savedAdmin = localStorage.getItem('tb_admin_' + pitch.id);
      if (savedAdmin) { setIsAdmin(true); setIsGuest(false); setMyTeam(null); setScreenAndSave('app'); return; }
      const savedTeam = localStorage.getItem('tb_myteam_' + pitch.id);
      const savedPin = localStorage.getItem('tb_pinHash_' + pitch.id);
      if (savedTeam) { setMyTeam(JSON.parse(savedTeam)); setMyPinHash(savedPin||null); setIsGuest(false); setIsAdmin(false); setScreenAndSave('app'); return; }
    } catch {}

    // Check Supabase by email (works across devices)
    try {
      const userEmail = currentUser?.email;
      if (userEmail) {
        // Fetch adminEmail, teamIdentity and teams in ONE request
        const [adminEmail, identity, teams] = await sbGetMany([
          pitch.id + "_adminEmail",
          pitch.id + "_teamIdentity",
          pitch.id + "_teams",
        ]);

        if (adminEmail === userEmail) {
          try { localStorage.setItem('tb_admin_' + pitch.id, '1'); } catch {}
          setIsAdmin(true); setIsGuest(false); setMyTeam(null); setScreenAndSave('app'); return;
        }

        const identityObj = identity || {};
        const entry = Object.values(identityObj).find(t => t.claimedBy === userEmail);
        if (entry) {
          const teamsArr = teams || [];
          const team = teamsArr.find(t => t.id === entry.teamRef) || teamsArr.find((t,i) => "t"+i === Object.keys(identityObj).find(k=>identityObj[k].claimedBy===userEmail));
          if (team) {
            const teamData = {...team, teamId: entry.teamId};
            try { localStorage.setItem('tb_myteam_' + pitch.id, JSON.stringify(teamData)); if(entry.pinHash) localStorage.setItem('tb_pinHash_' + pitch.id, entry.pinHash); } catch {}
            setMyTeam(teamData); setMyPinHash(entry.pinHash||null); setIsGuest(false); setIsAdmin(false); setScreenAndSave('app'); return;
          }
        }
      }
    } catch(e) { console.error("Email check error:", e); }

    // First time - fetch fresh pitch data to check guestAllowed, then show join screen
    try {
      const pitches = await sbGet("pitches") || [];
      const freshPitch = pitches.find(p => p.id === pitch.id);
      if (freshPitch) setCurrentPitch(freshPitch);
      if (freshPitch?.guestAllowed === false) {
        // Guest access is off — only show claim/admin options, not guest entry
        setCurrentPitch({ ...freshPitch });
      }
    } catch {}
    setScreenAndSave('join');
  };

  const handleSetupAdmin = (pitch, existingPitches) => {
    _pitchId = pitch.id;
    setCurrentPitch(pitch);
    if (existingPitches) setPendingPitches(existingPitches);
    setScreenAndSave('adminSetup');
  };

  const handleClaimed = (team, pinHash) => {
    setMyTeam(team); setMyPinHash(pinHash); setIsGuest(false); setIsAdmin(false);
    setScreenAndSave('app');
  };

  const handleGuestEnter = () => {
    try { localStorage.setItem('tb_guest_' + currentPitch.id, '1'); } catch {}
    setIsGuest(true); setIsAdmin(false); setMyTeam(null);
    setScreenAndSave('app');
  };

  const handleAdminEnter = () => {
    setIsAdmin(true); setIsGuest(false); setMyTeam(null);
    setScreenAndSave('app');
  };

  const handleLeave = () => {
    setCurrentPitch(null); setMyTeam(null); setMyPinHash(null);
    setIsGuest(false); setIsAdmin(false); setScreenAndSave('pitches');
  };
  const handleLeaveGuest = () => {
    // Clear guest key so they see the 3-option screen next time
    try { if (currentPitch) localStorage.removeItem('tb_guest_' + currentPitch.id); } catch {}
    setCurrentPitch(null); setMyTeam(null); setMyPinHash(null);
    setIsGuest(false); setIsAdmin(false); setScreenAndSave('pitches');
  };

  try {
    if (!currentUser) return <SplashScreen onLogin={handleLogin} />;

    if (screen === 'pitches') return (
      <PitchHome onEnter={handleEnterPitch} user={currentUser} onLogout={handleLogout} onSetupAdmin={handleSetupAdmin} />
    );

    if (screen === 'join') return (
      <TeamClaimScreen pitch={currentPitch} user={currentUser}
        onClaimed={handleClaimed} onBack={handleLeave}
        onGuest={handleGuestEnter} onAdmin={handleAdminEnter}
        guestAllowed={currentPitch?.guestAllowed !== false} />
    );

    if (screen === 'adminSetup') return (
      <AdminSetupScreen pitch={currentPitch} onDone={async (pitch)=>{
        // Save pitch to Supabase only now that password is set
        if (pendingPitches !== null) {
          const updated = [...pendingPitches, pitch];
          await sbSet("pitches", updated);
          setPendingPitches(null);
        }
        // Auto-create pitchConfig with defaults for this new pitch
        await sbSet(pitch.id + "_pitchConfig", {
          transferStart: "Sunday 11:59 PM",
          transferEnd: "Monday 11:00 AM",
          snatchReturn: "Friday 11:58 PM",
          snatchWindow: "Saturday 12:00 AM to Saturday 12:00 PM",
        });
        setCurrentPitch(pitch); setIsAdmin(true);
        try { localStorage.setItem('tb_admin_' + pitch.id, '1'); } catch {}
        setScreenAndSave('app');
      }} onBack={()=>{ setPendingPitches(null); handleLeave(); }} sbGet={sbGet} sbSet={sbSet} hashPw={hashPw} />
    );

    if (screen === 'app') return (
      <App pitch={currentPitch} onLeave={handleLeave} user={currentUser}
        onLogout={handleLogout} myTeam={myTeam} myPinHash={myPinHash}
        isGuest={isGuest} isAdmin={isAdmin} />
    );
  } catch(e) {
    return <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16,padding:24,fontFamily:fonts.body}}>
      <div style={{fontSize:48}}>⚠️</div>
      <div style={{fontFamily:fonts.display,fontSize:22,color:T.danger,fontWeight:700}}>CRASH: {e.message}</div>
      <button onClick={()=>{localStorage.clear();window.location.reload();}} style={{background:"#F5A623",border:"none",borderRadius:8,padding:"10px 20px",color:T.bg,fontWeight:700,fontFamily:fonts.body,fontSize:14,cursor:"pointer",marginTop:8}}>CLEAR AND RELOAD</button>
    </div>;
  }
}


export default Root;
function EditPointsForm({ config, onSave, onCancel }) {
  const [cfg, setCfg] = useState({...config});
  const field = (label, key, step) => (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${T.border}33`}}>
      <div style={{fontSize:12,color:T.muted,flex:1}}>{label}</div>
      <input type="number" value={cfg[key]} step={step||1} min={0}
        onChange={e=>setCfg(prev=>({...prev,[key]:parseFloat(e.target.value)||0}))}
        style={{width:64,background:T.bg,border:`1px solid ${T.border}`,borderRadius:6,padding:"4px 8px",color:T.accent,fontSize:14,fontFamily:fonts.display,fontWeight:700,textAlign:"center",outline:"none"}} />
    </div>
  );
  return (
    <div style={{background:T.card,borderRadius:12,border:`1px solid ${T.accentBorder}`,padding:20,marginBottom:16}}>
      <div style={{fontFamily:fonts.display,fontSize:18,fontWeight:700,color:T.accent,letterSpacing:2,marginBottom:16}}>EDIT POINTS SYSTEM</div>
      <div style={{fontSize:11,color:T.muted,letterSpacing:1,marginBottom:8}}>BATTING</div>
      <div style={{fontSize:11,color:T.accent,letterSpacing:1,marginBottom:8}}>🏏 BATTING</div>
      {field("Per run","run",0.5)}{field("Per four","four")}{field("Per six","six")}
      {field("Half-century","fifty")}{field("Century","century")}
      {field("SR Bonus pts","srBonus")}{field("SR Bonus threshold","srBonusThreshold")}
      <div style={{fontSize:11,color:T.danger,letterSpacing:1,marginBottom:8,marginTop:12}}>PENALTIES</div>
      {field("Duck penalty","duckPenalty")}{field("SR penalty pts","srPenalty")}{field("SR penalty threshold","srPenaltyThreshold")}
      <div style={{fontSize:11,color:T.info,letterSpacing:1,marginBottom:8,marginTop:12}}>🎳 BOWLING</div>
      {field("Per wicket","wicket")}{field("4-wkt haul","fourWkt")}{field("5-wkt haul","fiveWkt")}
      {field("Maiden over","maiden")}{field("Economy bonus","ecoBonus")}{field("Economy < threshold","ecoThreshold",0.5)}
      {field("Min overs (eco)","ecoMinOvers",0.5)}{field("Economy penalty","ecoPenalty")}{field("Eco penalty > threshold","ecoPenaltyThreshold",0.5)}
      <div style={{fontSize:11,color:T.success,letterSpacing:1,marginBottom:8,marginTop:12}}>🧤 FIELDING</div>
      {field("Per catch","catch")}{field("Per stumping","stumping")}{field("Per run-out","runout")}
      <div style={{fontSize:11,color:T.purple,letterSpacing:1,marginBottom:8,marginTop:12}}>⭐ BONUSES</div>
      {field("All-round bonus","allRoundBonus")}{field("All-round min runs","allRoundMinRuns")}{field("All-round min wkts","allRoundMinWkts")}
      {field("Longest six","longestSix")}{field("MOM bonus","momBonus")}{field("Playing XI bonus","playingXIBonus")}
      {field("Captain mult","captainMult",0.5)}{field("VC mult","vcMult",0.5)}
      <div style={{display:"flex",gap:8,marginTop:16}}>
        <button onClick={onCancel} style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:10,color:T.muted,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
        <button onClick={()=>onSave(cfg)} style={{flex:2,background:`linear-gradient(135deg,${T.accent},${T.accentDim})`,border:"none",borderRadius:8,padding:10,color:T.bg,fontFamily:fonts.body,fontWeight:800,fontSize:14,cursor:"pointer"}}>SAVE POINTS</button>
      </div>
    </div>
  );
}


// ── PROPOSE RULES FORM ───────────────────────────────────────────────────────

function ProposeRulesForm({ teams, eligibleVoters, onPropose, withPassword, tournamentStarted, isAdmin, onApplyDirect }) {
  const [open, setOpen] = useState(false);
  const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  // Generate all times in 30-min intervals + key times
  const times = (() => {
    const t = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 30) {
        const ampm = h < 12 ? "AM" : "PM";
        const hh = h === 0 ? 12 : h > 12 ? h - 12 : h;
        const mm = m === 0 ? "00" : "30";
        t.push(`${hh}:${mm} ${ampm}`);
      }
    }
    // Add key times not in 30-min grid, inserted in correct position
    const extras = ["11:45 AM","11:58 AM","11:59 AM","11:45 PM","11:58 PM","11:59 PM"];
    extras.forEach(x => { if (!t.includes(x)) t.push(x); });
    return t;
  })();

  const [tsDay, setTsDay] = useState("Sunday");
  const [tsTime, setTsTime] = useState("11:30 PM");
  const [teDay, setTeDay] = useState("Monday");
  const [teTime, setTeTime] = useState("11:00 AM");
  const [ssDay, setSsDay] = useState("Saturday");
  const [ssTime, setSsTime] = useState("12:00 AM");
  const [seDay, setSeDay] = useState("Saturday");
  const [seTime, setSeTime] = useState("12:00 PM");
  const [srDay, setSrDay] = useState("Friday");
  const [srTime, setSrTime] = useState("11:58 PM");

  const dayTime = (day, time) => day + " " + time;

  const hours = ["12","1","2","3","4","5","6","7","8","9","10","11"];
  const minutes = ["00","05","10","15","20","25","30","35","40","45","50","55","58","59"];

  const parseTime = (t) => {
    // Parse "11:30 PM" into {h:"11", m:"30", ampm:"PM"}
    const parts = t.split(" ");
    const ampm = parts[1] || "PM";
    const [h, m] = (parts[0] || "12:00").split(":");
    return { h: h || "12", m: m || "00", ampm };
  };

  const DayTimeRow = ({label, day, setDay, time, setTime}) => {
    const parsed = parseTime(time);
    const setH = h => setTime(`${h}:${parsed.m} ${parsed.ampm}`);
    const setM = m => setTime(`${parsed.h}:${m} ${parsed.ampm}`);
    const setAmpm = a => setTime(`${parsed.h}:${parsed.m} ${a}`);
    return (
      <div style={{marginBottom:12}}>
        <div style={{fontSize:11,color:T.muted,marginBottom:6,letterSpacing:1}}>{label}</div>
        <div style={{display:"flex",gap:6}}>
          <select value={day} onChange={e=>setDay(e.target.value)} style={{flex:"0 0 108px",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 8px",color:T.text,fontSize:12,fontFamily:fonts.body,cursor:"pointer",outline:"none"}}>
            {days.map(d=><option key={d} value={d}>{d}</option>)}
          </select>
          <select value={parsed.h} onChange={e=>setH(e.target.value)} style={{flex:1,background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 6px",color:T.text,fontSize:13,fontFamily:fonts.body,cursor:"pointer",outline:"none"}}>
            {hours.map(h=><option key={h} value={h}>{h}</option>)}
          </select>
          <select value={parsed.m} onChange={e=>setM(e.target.value)} style={{flex:1,background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 6px",color:T.text,fontSize:13,fontFamily:fonts.body,cursor:"pointer",outline:"none"}}>
            {minutes.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
          <select value={parsed.ampm} onChange={e=>setAmpm(e.target.value)} style={{flex:"0 0 60px",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 6px",color:T.text,fontSize:13,fontFamily:fonts.body,cursor:"pointer",outline:"none"}}>
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        </div>
      </div>
    );
  };

  if (!open) return (
    <button onClick={()=>withPassword(()=>setOpen(true))} style={{width:"100%",background:T.accentBg,border:`1px solid ${T.accentBorder}`,borderRadius:12,padding:14,color:T.accent,fontFamily:fonts.body,fontWeight:700,fontSize:15,cursor:"pointer"}}>
      ✏️ PROPOSE TIMING CHANGE (Admin)
    </button>
  );

  return (
    <div style={{background:T.card,borderRadius:12,border:`1px solid ${T.accentBorder}`,padding:20}}>
      <div style={{fontFamily:fonts.display,fontSize:18,fontWeight:700,color:T.accent,letterSpacing:2,marginBottom:4}}>PROPOSE RULE CHANGE</div>
      <div style={{fontSize:11,color:T.muted,marginBottom:16}}>All {eligibleVoters.length} claimed teams must approve for changes to take effect.</div>

      {/* Transfer Window */}
      <div style={{background:T.bg,borderRadius:10,padding:"12px 14px",marginBottom:12,border:`1px solid ${T.border}`}}>
        <div style={{fontSize:11,color:"#4F8EF7",fontWeight:700,letterSpacing:1,marginBottom:10}}>🔄 TRANSFER WINDOW</div>
        <DayTimeRow label="Opens" day={tsDay} setDay={setTsDay} time={tsTime} setTime={setTsTime} />
        <DayTimeRow label="Closes" day={teDay} setDay={setTeDay} time={teTime} setTime={setTeTime} />
      </div>

      {/* Snatch Window */}
      <div style={{background:T.bg,borderRadius:10,padding:"12px 14px",marginBottom:12,border:`1px solid ${T.border}`}}>
        <div style={{fontSize:11,color:"#A855F7",fontWeight:700,letterSpacing:1,marginBottom:10}}>⚡ SNATCH WINDOW</div>
        <DayTimeRow label="Opens" day={ssDay} setDay={setSsDay} time={ssTime} setTime={setSsTime} />
        <DayTimeRow label="Closes" day={seDay} setDay={setSeDay} time={seTime} setTime={setSeTime} />
        <DayTimeRow label="Player Returns" day={srDay} setDay={setSrDay} time={srTime} setTime={setSrTime} />
      </div>

      <div style={{display:"flex",gap:8,marginTop:4}}>
        <button onClick={()=>setOpen(false)} style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:10,color:T.muted,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
        {isAdmin && onApplyDirect && (
          <button onClick={async ()=>{
            await onApplyDirect({
              "Transfer Start": dayTime(tsDay,tsTime),
              "Transfer End": dayTime(teDay,teTime),
              "Snatch Window": dayTime(ssDay,ssTime)+" to "+dayTime(seDay,seTime),
              "Snatch Return": dayTime(srDay,srTime),
            });
            setOpen(false);
          }} style={{flex:1,background:"#4F8EF722",border:"1px solid #4F8EF744",borderRadius:8,padding:10,color:"#4F8EF7",fontFamily:fonts.body,fontWeight:700,fontSize:13,cursor:"pointer"}}>
            🔑 APPLY DIRECT
          </button>
        )}
        <button onClick={()=>{
          onPropose({
            "Transfer Start": dayTime(tsDay,tsTime),
            "Transfer End": dayTime(teDay,teTime),
            "Snatch Window": dayTime(ssDay,ssTime)+" to "+dayTime(seDay,seTime),
            "Snatch Return": dayTime(srDay,srTime),
          });
          setOpen(false);
        }} style={{flex:2,background:"#F5A623",border:"none",borderRadius:8,padding:10,color:T.bg,fontFamily:fonts.body,fontWeight:800,fontSize:14,cursor:"pointer"}}>SUBMIT FOR VOTE</button>
      </div>
    </div>
  );
}



