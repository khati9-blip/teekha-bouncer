import { useState, useEffect } from "react";

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

function storeGet(key) {
  try { const v = localStorage.getItem(`tbl_${key}`); return v ? JSON.parse(v) : null; } catch { return null; }
}
function storeSet(key, val) {
  try { localStorage.setItem(`tbl_${key}`, JSON.stringify(val)); } catch {}
}
function storeDel(key) {
  try { localStorage.removeItem(`tbl_${key}`); } catch {}
}

async function hashPw(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function PasswordModal({ onSuccess, onClose, storedHash }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const isFirstTime = !storedHash;

  const submit = async () => {
    if (!pw.trim()) { setErr("Enter a password"); return; }
    if (isFirstTime) { onSuccess(await hashPw(pw), true); }
    else {
      const h = await hashPw(pw);
      if (h === storedHash) onSuccess(null, false);
      else { setErr("❌ Wrong password"); setPw(""); }
    }
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.95)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,backdropFilter:"blur(6px)"}}>
      <div style={{background:"#141E2E",borderRadius:16,border:"1px solid #1E2D45",padding:32,width:"100%",maxWidth:360,margin:"0 16px"}}>
        <div style={{fontSize:36,textAlign:"center",marginBottom:8}}>🔐</div>
        <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:22,fontWeight:700,color:"#F5A623",textAlign:"center",letterSpacing:2,marginBottom:4}}>
          {isFirstTime ? "SET LEAGUE PASSWORD" : "SQUAD LOCKED"}
        </div>
        <div style={{fontSize:13,color:"#4A5E78",textAlign:"center",marginBottom:24}}>
          {isFirstTime ? "Choose a password to protect squad changes" : "Enter password to modify squads"}
        </div>
        <input type="password" value={pw} onChange={e=>{setPw(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder={isFirstTime?"Choose a password…":"League password…"} autoFocus
          style={{width:"100%",background:"#080C14",border:`1px solid ${err?"#FF3D5A":"#1E2D45"}`,borderRadius:8,padding:"12px 16px",color:"#E2EAF4",fontSize:16,fontFamily:"Barlow Condensed,sans-serif",outline:"none",marginBottom:err?8:20,boxSizing:"border-box"}} />
        {err && <div style={{color:"#FF3D5A",fontSize:13,marginBottom:16,textAlign:"center"}}>{err}</div>}
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,background:"transparent",border:"1px solid #1E2D45",borderRadius:8,padding:11,color:"#4A5E78",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
          <button onClick={submit} style={{flex:2,background:"linear-gradient(135deg,#F5A623,#FF8C00)",border:"none",borderRadius:8,padding:11,color:"#080C14",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>
            {isFirstTime ? "SET PASSWORD" : "UNLOCK"}
          </button>
        </div>
        {!isFirstTime && <div style={{marginTop:16,textAlign:"center"}}><button onClick={async()=>{const p=prompt("Enter NEW password:");if(!p)return;onSuccess(await hashPw(p),true);}} style={{background:"none",border:"none",color:"#4A5E78",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>Change password</button></div>}
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
      const res = await fetch(`/api/cricbuzz?path=${encodeURIComponent("mcenter/v1/" + match.cricbuzzId + "/full-scorecard")}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const nameToPlayer = {};
      matchPlayers.forEach(p => {
        nameToPlayer[p.name.toLowerCase()] = p;
        const parts = p.name.toLowerCase().split(" ");
        parts.forEach(part => { if (part.length > 3) nameToPlayer[part] = p; });
      });

      const findPlayer = (name) => {
        if (!name) return null;
        const n = name.toLowerCase().trim();
        if (nameToPlayer[n]) return nameToPlayer[n];
        for (const [key, pl] of Object.entries(nameToPlayer)) {
          if (n.includes(key) || key.includes(n)) return pl;
        }
        return null;
      };

      const newStats = {...stats};
      let matched = 0;

      for (const inning of (data.scoreCard || [])) {
        // Batting
        const batsmen = inning.batTeamDetails?.batsmenData ? Object.values(inning.batTeamDetails.batsmenData) : [];
        for (const b of batsmen) {
          const pl = findPlayer(b.batName);
          if (!pl) continue;
          newStats[pl.id] = { ...newStats[pl.id], played:true, runs:+b.runs||0, fours:+b.fours||0, sixes:+b.sixes||0 };
          matched++;
        }
        // Bowling
        const bowlers = inning.bowlTeamDetails?.bowlersData ? Object.values(inning.bowlTeamDetails.bowlersData) : [];
        for (const b of bowlers) {
          const pl = findPlayer(b.bowlName);
          if (!pl) continue;
          const prev = newStats[pl.id] || emptyStats(pl);
          newStats[pl.id] = { ...prev, played:true, wickets:+b.wickets||0, overs:+b.overs||0, economy:b.economy||"" };
          matched++;
        }
        // Fielding from dismissal descriptions
        for (const b of batsmen) {
          const out = b.outDesc || "";
          if (out.startsWith("c ") && out.includes(" b ")) {
            const fielder = out.slice(2, out.indexOf(" b ")).trim();
            const pl = findPlayer(fielder);
            if (pl) { newStats[pl.id] = {...(newStats[pl.id]||emptyStats(pl)), played:true, catches:(+newStats[pl.id]?.catches||0)+1}; }
          }
          if (out.startsWith("st ")) {
            const keeper = out.slice(3, out.indexOf(" b ")).trim();
            const pl = findPlayer(keeper);
            if (pl) { newStats[pl.id] = {...(newStats[pl.id]||emptyStats(pl)), played:true, stumpings:(+newStats[pl.id]?.stumpings||0)+1}; }
          }
          if (out.toLowerCase().includes("run out")) {
            const m = out.match(/run out \(([^)]+)\)/i);
            if (m) {
              for (const name of m[1].split("/")) {
                const pl = findPlayer(name.trim());
                if (pl) { newStats[pl.id] = {...(newStats[pl.id]||emptyStats(pl)), played:true, runouts:(+newStats[pl.id]?.runouts||0)+1}; }
              }
            }
          }
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
  const [unlocked, setUnlocked] = useState(false);
  const [showPwModal, setShowPwModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [editPlayer, setEditPlayer] = useState(null); // player being edited
  const [smartStatsMatch, setSmartStatsMatch] = useState(null);
  const [squadView, setSquadView] = useState(false); // toggle squad view
  const [teamFilter, setTeamFilter] = useState(null); // filter by fantasy team
  const [sortOrder, setSortOrder] = useState('default'); // default | az | za

  useEffect(() => {
    const t=storeGet("teams"),p=storeGet("players"),a=storeGet("assignments"),m=storeGet("matches"),
          c=storeGet("captains"),pts=storeGet("points"),pg=storeGet("page"),tn=storeGet("tnames"),
          nt=storeGet("numteams"),ph=storeGet("pwhash");
    if(t)setTeams(t);if(p)setPlayers(p);if(a)setAssignments(a);if(m)setMatches(m);
    if(c)setCaptains(c);if(pts)setPoints(pts);if(pg)setPage(pg);if(tn)setTNames(tn);
    if(nt)setNumTeams(nt);if(ph)setPwHash(ph);
  }, []);

  const nav=(pg)=>{setPage(pg);storeSet("page",pg);};
  const upd=(setter,key)=>(val)=>{setter(val);storeSet(key,val);};
  const updTeams=upd(setTeams,"teams"),updAssign=upd(setAssignments,"assignments"),
        updMatches=upd(setMatches,"matches"),updCaptains=upd(setCaptains,"captains"),
        updPoints=upd(setPoints,"points");

  const withPassword=(action)=>{
    if(unlocked){action();return;}
    setPendingAction({fn:action});setShowPwModal(true);
  };
  const handlePwSuccess=(newHash,isSetting)=>{
    if(isSetting&&newHash){setPwHash(newHash);storeSet("pwhash",newHash);}
    if(!isSetting)setUnlocked(true);
    setShowPwModal(false);
    if(!isSetting&&pendingAction){pendingAction.fn();setPendingAction(null);}
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
            allPlayers.push({
              id: name.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"") + "-" + p.id,
              name, iplTeam: shortName, role: mappedRole, cricbuzzId: p.id,
            });
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

  const assignPlayer=(pid,tid)=>withPassword(()=>{const a={...assignments};if(!tid)delete a[pid];else a[pid]=tid;updAssign(a);});
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
    for(const[pid,matchData]of Object.entries(points)){
      if(assignments[pid]!==teamId)continue;
      for(const[mid,d]of Object.entries(matchData)){
        const cap=captains[`${mid}_${teamId}`]||{};
        let pts=d.base;
        if(cap.captain===pid)pts*=2;else if(cap.vc===pid)pts*=1.5;
        total+=pts;
      }
    }
    return Math.round(total);
  };

  const leaderboard=[...teams].map(t=>({...t,total:getTeamTotal(t.id)})).sort((a,b)=>b.total-a.total);
  const getPlayerBreakdown=(teamId)=>players.filter(p=>assignments[p.id]===teamId).map(p=>{
    let tot=0;
    for(const[mid,d]of Object.entries(points[p.id]||{})){
      const cap=captains[`${mid}_${teamId}`]||{};
      let pts=d.base;
      if(cap.captain===p.id)pts*=2;else if(cap.vc===p.id)pts*=1.5;
      tot+=pts;
    }
    return{...p,total:Math.round(tot)};
  }).sort((a,b)=>b.total-a.total);

  const navItems=[
    {id:"setup",label:"Setup",icon:"⚙️"},
    {id:"draft",label:"Draft",icon:"📋",disabled:teams.length===0},
    {id:"matches",label:"Matches",icon:"🏏",disabled:players.length===0},
    {id:"leaderboard",label:"Leaderboard",icon:"🏆",disabled:teams.length===0},
  ];

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
          existingStats={Object.fromEntries(Object.entries(points).map(([pid,m])=>m[smartStatsMatch.id]?[pid,m[smartStatsMatch.id].stats]:null).filter(Boolean))}
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
        {showPwModal&&<PasswordModal storedHash={pwHash} onSuccess={handlePwSuccess} onClose={()=>{setShowPwModal(false);setPendingAction(null);}} />}
        {editPlayer&&<EditPlayerModal player={editPlayer} onSave={(updated)=>{const updated_players=players.map(p=>p.id===updated.id?updated:p);setPlayers(updated_players);storeSet("players",updated_players);setEditPlayer(null);}} onAdd={(np)=>{const all=[...players,np];setPlayers(all);storeSet("players",all);setEditPlayer(null);}} onClose={()=>setEditPlayer(null)} />}

        <div style={{background:"linear-gradient(180deg,#0E1521 0%,#080C14 100%)",borderBottom:"1px solid #1E2D45",padding:"0 20px",display:"flex",alignItems:"stretch",position:"sticky",top:0,zIndex:50}}>
          <div style={{padding:"16px 24px 0 0",borderRight:"1px solid #1E2D45",marginRight:8}}>
            <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:18,color:"#F5A623",letterSpacing:2,lineHeight:1}}>🏏 TEEKHA</div>
            <div style={{fontSize:11,color:"#4A5E78",letterSpacing:3,textTransform:"uppercase"}}>Bouncer League</div>
          </div>
          <div style={{display:"flex",overflowX:"auto"}}>
            {navItems.map(n=>(
              <button key={n.id} onClick={()=>!n.disabled&&nav(n.id)} style={{background:"transparent",border:"none",cursor:n.disabled?"not-allowed":"pointer",padding:"0 20px",fontSize:14,fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:page===n.id?"#F5A623":n.disabled?"#1E2D45":"#4A5E78",borderBottom:page===n.id?"2px solid #F5A623":"2px solid transparent",whiteSpace:"nowrap"}}>
                {n.icon} {n.label}
              </button>
            ))}
          </div>
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8,padding:"0 0 0 12px"}}>
            <button onClick={()=>{if(unlocked)setUnlocked(false);else{setPendingAction(null);setShowPwModal(true);}}} style={{background:unlocked?"#2ECC7122":"transparent",border:`1px solid ${unlocked?"#2ECC71":"#1E2D45"}`,color:unlocked?"#2ECC71":"#4A5E78",fontSize:11,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif"}}>
              {unlocked?"🔓 UNLOCKED":"🔒 LOCKED"}
            </button>
            <button onClick={()=>withPassword(()=>{if(!confirm("Reset ALL data? This cannot be undone!"))return;["teams","players","assignments","matches","captains","points","page","pwhash"].forEach(k=>storeDel(k));window.location.reload();})} style={{background:"transparent",border:"1px solid #1E2D45",color:"#4A5E78",fontSize:11,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif"}}>RESET</button>
          </div>
        </div>

        {loading&&(
          <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.92)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",zIndex:200,backdropFilter:"blur(4px)"}}>
            <Spinner />
            <div style={{marginTop:16,color:"#F5A623",fontWeight:700,fontSize:16,textAlign:"center",padding:"0 20px"}}>{loading}</div>
            <div style={{marginTop:6,color:"#4A5E78",fontSize:13}}>Please wait…</div>
          </div>
        )}

        <div style={{maxWidth:860,margin:"0 auto",padding:"24px 16px"}}>

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
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:12}}>
                <h2 style={{fontFamily:"Rajdhani",fontSize:28,color:"#F5A623",letterSpacing:2}}>PLAYER DRAFT</h2>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <Btn variant="blue" onClick={fetchPlayers}>{players.length>0?`↻ REFRESH (${players.length})`:"🌐 FETCH IPL PLAYERS"}</Btn>
                <Btn variant="ghost" onClick={()=>withPassword(()=>setEditPlayer({name:"",iplTeam:"",role:"Batsman"}))}>✚ ADD PLAYER</Btn>
                <Btn variant={squadView?"primary":"ghost"} onClick={()=>setSquadView(v=>!v)}>{squadView?"📋 LIST VIEW":"👥 SQUAD VIEW"}</Btn>
              </div>
              </div>
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
                  const cnt=Object.values(assignments).filter(v=>v===t.id).length;
                  const active=teamFilter===t.id;
                  return(
                    <div key={t.id} onClick={()=>setTeamFilter(active?null:t.id)}
                      style={{background:active?t.color+"22":"#0E1521",borderRadius:8,padding:"7px 14px",borderLeft:`3px solid ${t.color}`,fontSize:13,cursor:"pointer",border:active?`1px solid ${t.color}`:"1px solid transparent",transition:"all .15s"}}>
                      <span style={{color:t.color,fontWeight:700}}>{t.name}</span>
                      <span style={{color:"#4A5E78",marginLeft:8}}>{cnt}p</span>
                      {active&&<span style={{color:t.color,marginLeft:6,fontSize:11}}>✓</span>}
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
                  <div style={{maxHeight:560,overflowY:"auto",display:"flex",flexDirection:"column",gap:5}}>
                    {filteredPlayers.map(p=>{
                      const aTeam=teams.find(t=>t.id===assignments[p.id]);
                      const isAssigned=!!assignments[p.id];
                      return(
                        <div key={p.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:"#0E1521",borderRadius:8,borderLeft:`3px solid ${aTeam?aTeam.color:"#1E2D45"}`}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:700,fontSize:14,color:"#E2EAF4"}}>{p.name}</div>
                            <div style={{fontSize:12,color:"#4A5E78",marginTop:2}}>{p.iplTeam} &nbsp;•&nbsp;<span style={{color:ROLE_COLORS[p.role]||"#94A3B8"}}>{p.role}</span>{isAssigned&&<span style={{marginLeft:8,color:aTeam?.color,fontWeight:700}}>→ {aTeam?.name}</span>}</div>
                          </div>
                          <select value={assignments[p.id]||""} onChange={e=>assignPlayer(p.id,e.target.value)} style={{background:"#141E2E",border:`1px solid ${aTeam?aTeam.color+"66":"#1E2D45"}`,borderRadius:6,padding:"6px 10px",color:aTeam?aTeam.color:"#4A5E78",fontSize:13,fontFamily:"Barlow Condensed",fontWeight:600,maxWidth:150,cursor:"pointer"}}>
                            <option value="">{isAssigned?"Move to…":"— Assign —"}</option>
                            {teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                          {isAssigned&&<button onClick={()=>removePlayer(p.id)} style={{background:"#FF3D5A22",border:"1px solid #FF3D5A44",color:"#FF3D5A",borderRadius:6,padding:"6px 10px",cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:13,flexShrink:0}}>✕</button>}
                          <button onClick={()=>withPassword(()=>setEditPlayer(p))} style={{background:"#4F8EF722",border:"1px solid #4F8EF744",color:"#4F8EF7",borderRadius:6,padding:"6px 10px",cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:13,flexShrink:0}}>✏️</button>
                          <button onClick={()=>deletePlayer(p.id)} style={{background:"#FF3D5A22",border:"1px solid #FF3D5A44",color:"#FF3D5A",borderRadius:6,padding:"6px 10px",cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:11,flexShrink:0}}>🗑️</button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
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
                            <Badge label={completed?(match.result?`✓ ${match.result}`:"DONE"):"UPCOMING"} color={completed?"#2ECC71":"#F5A623"} />
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
                                          <select value={cap.captain||""} onChange={e=>setCap(match.id,team.id,"captain",e.target.value)} style={{background:"#0E1521",border:"1px solid #1E2D45",borderRadius:6,padding:"7px 12px",color:"#E2EAF4",fontSize:13,fontFamily:"Barlow Condensed",maxWidth:200}}>
                                            <option value="">— Select Captain —</option>
                                            {teamPlayers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                                          </select>
                                        </div>
                                        <div>
                                          <div style={{fontSize:11,color:"#4A5E78",marginBottom:5}}>🥈 VICE CAPTAIN (1.5×)</div>
                                          <select value={cap.vc||""} onChange={e=>setCap(match.id,team.id,"vc",e.target.value)} style={{background:"#0E1521",border:"1px solid #1E2D45",borderRadius:6,padding:"7px 12px",color:"#E2EAF4",fontSize:13,fontFamily:"Barlow Condensed",maxWidth:200}}>
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
                                <button onClick={()=>setSmartStatsMatch(match)}
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

          {page==="leaderboard"&&(
            <div className="fade-in">
              <h2 style={{fontFamily:"Rajdhani",fontSize:28,color:"#F5A623",letterSpacing:2,marginBottom:24}}>LEADERBOARD</h2>
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
                            <div style={{fontSize:12,color:"#4A5E78"}}>{Object.values(assignments).filter(v=>v===team.id).length} players drafted</div>
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
