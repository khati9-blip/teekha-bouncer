import React, { useState, useEffect, useRef } from "react";
import { T, fonts } from "./Theme";
import { sbGet, sbSet, SUPABASE_URL, SB_HEADERS } from "./utils.js";
import FetchPlayers from "./FetchPlayers";

// ── Player category badge colors ──────────────────────────────────────────────
const CAT_COLORS = {
  PLATINUM: { bg:"#E5E4E244", border:"#E5E4E2", text:"#E5E4E2" },
  GOLD:     { bg:"#F5A62344", border:"#F5A623", text:"#F5A623" },
  SILVER:   { bg:"#94A3B844", border:"#94A3B8", text:"#94A3B8" },
  BRONZE:   { bg:"#CD7F3244", border:"#CD7F32", text:"#CD7F32" },
};
const CATS = ["PLATINUM","GOLD","SILVER","BRONZE"];

// ── Polling interval for real-time sync ───────────────────────────────────────
const POLL_MS = 2500;

export default function AuctionRoom({ auction: initialAuction, user, onBack, isAdmin }) {
  const [auction, setAuction] = useState(initialAuction);
  const [screen, setScreen] = useState(
    initialAuction.status === "live" ? "live" :
    initialAuction.status === "ended" ? "ended" :
    !initialAuction.pool || initialAuction.pool.length === 0 ? "setup" : "setup"
  );
  const [showFetchPlayers, setShowFetchPlayers] = useState(false);
  const [players, setPlayers] = useState(initialAuction.pool || []);
  const [categorizing, setCategorizing] = useState(false);
  const [categories, setCategories] = useState(initialAuction.categories || {});
  const pollRef = useRef(null);
  const [showSettings, setShowSettings] = useState(false);
const [settingsData, setSettingsData] = useState({
  name: auction.name,
  budget: auction.budget,
  maxSquad: auction.maxSquad,
  raiseBy: auction.raiseBy,
  catBase: auction.catBase || { PLATINUM: 2, GOLD: 1, SILVER: 0.5, BRONZE: 0.25 },
  teams: auction.teams || [],
});

  // ── Save auction to Supabase ──────────────────────────────────────────────
  const saveAuction = async (updated) => {
    setAuction(updated);
    // Load full list, update this auction
    const all = await sbGet("auctions") || [];
    const newAll = all.map(a => a.id === updated.id ? updated : a);
    await sbSet("auctions", newAll);
  };

  // ── Poll for updates (real-time sync) ─────────────────────────────────────
  useEffect(() => {
    if (screen !== "live") return;
    pollRef.current = setInterval(async () => {
      const all = await sbGet("auctions");
      if (Array.isArray(all)) {
        const fresh = all.find(a => a.id === auction.id);
        if (fresh) setAuction(fresh);
      }
    }, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [screen, auction.id]);

  // ── Handle players fetched ─────────────────────────────────────────────────
  const handlePlayersAdded = async (newPlayers) => {
    const merged = [...players, ...newPlayers.filter(n => !players.find(p => p.id === n.id))];
    setPlayers(merged);
    const updated = { ...auction, pool: merged };
    await saveAuction(updated);
    setShowFetchPlayers(false);
  };

  // ── Start auction: randomise queue ────────────────────────────────────────
  const startAuction = async () => {
    const queued = [...players].sort(() => Math.random() - 0.5).map(p => p.id);
    const updated = {
      ...auction,
      pool: players,
      queue: queued,
      status: "live",
      currentPlayer: queued[0] || null,
      currentBid: 0,
      currentBidder: null,
      timer: Date.now() + 30000,
    };
    await saveAuction(updated);
    setScreen("live");
  };

  // ── Save categories ───────────────────────────────────────────────────────
  const saveCats = async (cats) => {
    setCategories(cats);
    const updated = { ...auction, categories: cats };
    await saveAuction(updated);
  };

  return (
    <div style={{ minHeight:"100vh", background:T.bg, fontFamily:fonts.body }}>

      {/* ── HEADER ── */}
      <div style={{
        background:"linear-gradient(135deg,#0A0E14,#1A1F2E)",
        borderBottom:"3px solid #A855F7",
        padding:"14px 20px",
        display:"flex", alignItems:"center", justifyContent:"space-between",
        position:"sticky", top:0, zIndex:100,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={onBack} style={{ background:"transparent", border:"none", color:T.muted, fontSize:22, cursor:"pointer", lineHeight:1, padding:"0 4px" }}>←</button>
          <div>
            <div style={{ fontFamily:fonts.display, fontSize:16, fontWeight:900, color:"#A855F7", letterSpacing:2 }}>🔨 {auction.name}</div>
            <div style={{ fontFamily:fonts.body, fontSize:10, color:T.muted, letterSpacing:1, marginTop:2 }}>
              {auction.teams?.length} teams · ₹{auction.budget}Cr · Max {auction.maxSquad} players
            </div>
          </div>
        </div>
        <div
          onClick={() => auction.status === "setup" && setShowSettings(true)}
          style={{
            padding:"4px 12px",
            cursor: auction.status === "setup" ? "pointer" : "default",
            background: auction.status==="live" ? "rgba(239,68,68,0.2)" : auction.status==="ended" ? "rgba(34,197,94,0.2)" : "rgba(168,85,247,0.2)",
            border: `1px solid ${auction.status==="live" ? "#EF4444" : auction.status==="ended" ? "#22C55E" : "#A855F7"}`,
            fontFamily:fonts.display, fontSize:9, fontWeight:900, letterSpacing:2,
            color: auction.status==="live" ? "#EF4444" : auction.status==="ended" ? "#22C55E" : "#A855F7",
          }}>
          {auction.status==="live" ? "🔴 LIVE" : auction.status==="ended" ? "✅ ENDED" : "⚙️ SETUP ✎"}
        </div>
      </div>

      {/* ── SETTINGS MODAL ── */}
      {showSettings && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
          onClick={() => setShowSettings(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:T.card, border:"3px solid #A855F7", maxWidth:480, width:"100%", padding:28, maxHeight:"85vh", overflowY:"auto", clipPath:"polygon(10px 0%,100% 0%,calc(100% - 10px) 100%,0% 100%)" }}>

            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
              <div style={{ fontFamily:fonts.display, fontSize:18, fontWeight:900, color:"#A855F7", letterSpacing:3 }}>⚙️ EDIT AUCTION</div>
              <button onClick={() => setShowSettings(false)} style={{ background:"transparent", border:"none", color:T.muted, fontSize:20, cursor:"pointer" }}>✕</button>
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontFamily:fonts.display, fontSize:9, color:T.muted, letterSpacing:2, marginBottom:6, display:"block" }}>AUCTION NAME</label>
              <input value={settingsData.name} onChange={e => setSettingsData(p => ({...p, name: e.target.value}))}
                style={{ width:"100%", background:T.bg, border:`1px solid ${T.border}`, color:T.text, padding:"10px 12px", fontSize:13, fontFamily:fonts.body, outline:"none", boxSizing:"border-box" }} />
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
              <div>
                <label style={{ fontFamily:fonts.display, fontSize:9, color:T.muted, letterSpacing:2, marginBottom:6, display:"block" }}>BUDGET PER TEAM (CR)</label>
                <select value={settingsData.budget} onChange={e => setSettingsData(p => ({...p, budget: parseInt(e.target.value)}))}
                  style={{ width:"100%", background:T.bg, border:`1px solid ${T.border}`, color:T.text, padding:"10px 12px", fontSize:13, fontFamily:fonts.body, outline:"none", boxSizing:"border-box", cursor:"pointer" }}>
                  {[100,200,300,400,500,600,700,800,900,1000,1500,2000].map(b => <option key={b} value={b}>₹{b} Cr</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontFamily:fonts.display, fontSize:9, color:T.muted, letterSpacing:2, marginBottom:6, display:"block" }}>MAX SQUAD SIZE</label>
                <select value={settingsData.maxSquad} onChange={e => setSettingsData(p => ({...p, maxSquad: parseInt(e.target.value)}))}
                  style={{ width:"100%", background:T.bg, border:`1px solid ${T.border}`, color:T.text, padding:"10px 12px", fontSize:13, fontFamily:fonts.body, outline:"none", boxSizing:"border-box", cursor:"pointer" }}>
                  {[10,11,12,13,14,15,16,17,18,19,20,22,25,28,30].map(n => <option key={n} value={n}>{n} players</option>)}
                </select>
              </div>
              <div style={{ gridColumn:"1/-1" }}>
                <label style={{ fontFamily:fonts.display, fontSize:9, color:T.muted, letterSpacing:2, marginBottom:6, display:"block" }}>BID INCREMENT (CR)</label>
                <select value={settingsData.raiseBy} onChange={e => setSettingsData(p => ({...p, raiseBy: parseInt(e.target.value)}))}
                  style={{ width:"100%", background:T.bg, border:`1px solid ${T.border}`, color:T.text, padding:"10px 12px", fontSize:13, fontFamily:fonts.body, outline:"none", boxSizing:"border-box", cursor:"pointer" }}>
                  {[0.25,0.5,0.75,1,1.5,2,2.5,3,4,5,7.5,10,15,20,25,50,100].map(b => <option key={b} value={b}>+₹{b} Cr per bid</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontFamily:fonts.display, fontSize:9, color:T.muted, letterSpacing:2, marginBottom:8, display:"block" }}>BASE PRICE PER CATEGORY (CR)</label>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {["PLATINUM","GOLD","SILVER","BRONZE"].map(cat => (
                  <div key={cat} style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ fontSize:9, fontFamily:fonts.display, fontWeight:900, letterSpacing:1, width:60, flexShrink:0,
                      color: cat==="PLATINUM"?"#E5E4E2":cat==="GOLD"?"#F5A623":cat==="SILVER"?"#94A3B8":"#CD7F32" }}>{cat}</div>
                    <select value={settingsData.catBase[cat]} onChange={e => setSettingsData(p => ({...p, catBase:{...p.catBase,[cat]:parseFloat(e.target.value)}}))}
                      style={{ flex:1, background:T.bg, border:`1px solid ${T.border}`, color:T.text, padding:"6px 8px", fontSize:11, fontFamily:fonts.body, outline:"none", cursor:"pointer" }}>
                      {[0.25,0.5,0.75,1,1.5,2,2.5,3,4,5,7.5,10,15,20,25,50,100].map(v => <option key={v} value={v}>₹{v} Cr</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:20 }}>
              <label style={{ fontFamily:fonts.display, fontSize:9, color:T.muted, letterSpacing:2, marginBottom:8, display:"block" }}>TEAM NAMES & COLORS</label>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {settingsData.teams.map((team, i) => (
                  <div key={i} style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <input type="color" value={team.color}
                      onChange={e => { const u=[...settingsData.teams]; u[i]={...u[i],color:e.target.value}; setSettingsData(p=>({...p,teams:u})); }}
                      style={{ width:36, height:36, border:`1px solid ${T.border}`, background:"transparent", cursor:"pointer", padding:2, flexShrink:0 }} />
                    <input value={team.name}
                      onChange={e => { const u=[...settingsData.teams]; u[i]={...u[i],name:e.target.value}; setSettingsData(p=>({...p,teams:u})); }}
                      style={{ flex:1, background:T.bg, border:`1px solid ${T.border}`, color:T.text, padding:"10px 12px", fontSize:13, fontFamily:fonts.body, outline:"none" }} />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setShowSettings(false)}
                style={{ flex:1, background:"transparent", border:`1px solid ${T.border}`, color:T.muted, padding:"11px", fontFamily:fonts.display, fontWeight:700, fontSize:13, cursor:"pointer" }}>
                CANCEL
              </button>
              <button onClick={async () => {
                const updatedTeams = settingsData.teams.map(t => ({...t, budget: settingsData.budget}));
                const updated = { ...auction, name: settingsData.name, budget: settingsData.budget, maxSquad: settingsData.maxSquad, raiseBy: settingsData.raiseBy, catBase: settingsData.catBase, teams: updatedTeams };
                await saveAuction(updated);
                setShowSettings(false);
              }}
                style={{ flex:2, background:"linear-gradient(135deg,#A855F7,#7C3AED)", border:"none", color:"#fff", padding:"11px", fontFamily:fonts.display, fontWeight:900, fontSize:14, cursor:"pointer", letterSpacing:1 }}>
                💾 SAVE CHANGES →
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── SETUP SCREEN ── */}
      {screen === "setup" && (
        <div style={{ maxWidth:640, margin:"0 auto", padding:"24px 16px" }}>

          {/* Progress steps */}
          <div style={{ display:"flex", gap:0, marginBottom:28 }}>
            {[["1","FETCH PLAYERS", players.length > 0],["2","CATEGORISE", Object.keys(categories).length > 0],["3","START AUCTION", false]].map(([num, label, done], i) => (
              <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4, position:"relative" }}>
                {i > 0 && <div style={{ position:"absolute", left:0, top:14, width:"50%", height:2, background: done ? "#A855F7" : T.border }} />}
                {i < 2 && <div style={{ position:"absolute", right:0, top:14, width:"50%", height:2, background: T.border }} />}
                <div style={{
                  width:28, height:28, borderRadius:"50%", zIndex:1,
                  background: done ? "#A855F7" : "transparent",
                  border:`2px solid ${done ? "#A855F7" : T.border}`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:11, fontWeight:900, color: done ? "#fff" : T.muted, fontFamily:fonts.display,
                }}>{done ? "✓" : num}</div>
                <div style={{ fontSize:8, color:done?"#A855F7":T.muted, fontFamily:fonts.display, letterSpacing:1, textAlign:"center" }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Step 1: Fetch Players */}
          <div style={{
            background:T.card, border:`2px solid ${players.length>0?"#A855F744":T.border}`,
            borderLeft:`4px solid ${players.length>0?"#A855F7":T.border}`,
            padding:"18px 20px", marginBottom:12,
          }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontFamily:fonts.display, fontSize:14, fontWeight:900, color:players.length>0?"#A855F7":T.text, letterSpacing:1, marginBottom:4 }}>
                  {players.length > 0 ? `✓ ${players.length} PLAYERS FETCHED` : "STEP 1 — FETCH PLAYERS"}
                </div>
                <div style={{ fontFamily:fonts.body, fontSize:11, color:T.muted }}>
                  {players.length > 0 ? "Tap to add more or change source" : "Pull players from Cricbuzz, CricketData or AI"}
                </div>
              </div>
              <button onClick={() => setShowFetchPlayers(true)}
                style={{ background:"linear-gradient(135deg,#A855F7,#7C3AED)", border:"none", color:"#fff", padding:"8px 14px", fontFamily:fonts.display, fontWeight:800, fontSize:11, cursor:"pointer", letterSpacing:1, clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)" }}>
                {players.length > 0 ? "EDIT →" : "FETCH →"}
              </button>
            </div>

            {/* Player list preview */}
            {players.length > 0 && (
              <div style={{ marginTop:14 }}>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
                  {["Batsman","Bowler","All-Rounder","Wicket-Keeper"].map(role => {
                    const count = players.filter(p => p.role === role).length;
                    return count > 0 ? (
                      <div key={role} style={{ background:"rgba(168,85,247,0.1)", border:"1px solid #A855F733", padding:"3px 8px", fontSize:10, fontFamily:fonts.display, color:"#A855F7", letterSpacing:0.5 }}>
                        {role.split("-")[0].toUpperCase()}: {count}
                      </div>
                    ) : null;
                  })}
                  <div style={{ background:"rgba(255,255,255,0.05)", border:"1px solid #ffffff22", padding:"3px 8px", fontSize:10, fontFamily:fonts.display, color:T.muted }}>
                    TOTAL: {players.length}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Step 2: Categorise */}
          {players.length > 0 && (
            <div style={{
              background:T.card, border:`2px solid ${Object.keys(categories).length>0?"#F5A62344":T.border}`,
              borderLeft:`4px solid ${Object.keys(categories).length>0?"#F5A623":T.border}`,
              padding:"18px 20px", marginBottom:12,
            }}>
              <div style={{ fontFamily:fonts.display, fontSize:14, fontWeight:900, color:Object.keys(categories).length>0?"#F5A623":T.text, letterSpacing:1, marginBottom:4 }}>
                {Object.keys(categories).length > 0 ? `✓ PLAYERS CATEGORISED` : "STEP 2 — CATEGORISE PLAYERS"}
              </div>
              <div style={{ fontFamily:fonts.body, fontSize:11, color:T.muted, marginBottom:14 }}>
                Assign Platinum / Gold / Silver / Bronze tiers. Base price auto-set per category.
              </div>
              <CategoryEditor players={players} categories={categories} onSave={saveCats} />
            </div>
          )}

          {/* Step 3: Start */}
          {players.length > 0 && isAdmin && (
            <button onClick={startAuction}
              style={{
                width:"100%", background:"linear-gradient(135deg,#A855F7,#7C3AED)",
                border:"none", color:"#fff", padding:"16px",
                fontFamily:fonts.display, fontWeight:900, fontSize:16,
                cursor:"pointer", letterSpacing:3,
                clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)",
                boxShadow:"0 4px 24px #A855F744", marginTop:8,
              }}>
              🔨 START AUCTION →
            </button>
          )}
          {!isAdmin && players.length > 0 && (
            <div style={{ textAlign:"center", padding:16, fontFamily:fonts.body, fontSize:13, color:T.muted }}>
              Waiting for admin to start the auction…
            </div>
          )}

          {/* Team overview */}
          <div style={{ marginTop:20 }}>
            <div style={{ fontFamily:fonts.display, fontSize:10, color:T.muted, letterSpacing:2, marginBottom:10 }}>TEAMS</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {auction.teams?.map(team => (
                <div key={team.id} style={{
                  background:T.card, border:`2px solid ${team.color}33`,
                  borderLeft:`4px solid ${team.color}`, padding:"12px 14px",
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:10, height:10, background:team.color, borderRadius:"50%" }} />
                    <div style={{ fontFamily:fonts.display, fontSize:13, fontWeight:800, color:T.text, letterSpacing:0.5 }}>{team.name}</div>
                  </div>
                  <div style={{ fontFamily:fonts.body, fontSize:11, color:T.muted }}>₹{team.budget}Cr remaining</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── LIVE AUCTION SCREEN ── */}
      {screen === "live" && (
        <LiveAuction auction={auction} setAuction={setAuction} saveAuction={saveAuction}
          players={players} categories={categories} isAdmin={isAdmin} user={user}
          onEnd={() => setScreen("ended")} />
      )}

      {/* ── ENDED SCREEN ── */}
      {screen === "ended" && (
        <AuctionSummary auction={auction} players={players} onBack={onBack} saveAuction={saveAuction} />
      )}

      {/* ── FETCH PLAYERS MODAL ── */}
      {showFetchPlayers && (
        <FetchPlayers
          existingPlayers={players}
          tournamentId={auction.id}
          tournamentName={auction.name}
          onPlayersAdded={handlePlayersAdded}
          onClose={() => setShowFetchPlayers(false)}
        />
      )}
    </div>
  );
}

// ── Category Editor ───────────────────────────────────────────────────────────
function CategoryEditor({ players, categories, onSave }) {
  const [cats, setCats] = useState(categories);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("ALL");

  const setPlayerCat = (pid, cat) => {
    const updated = { ...cats, [pid]: cat };
    setCats(updated);
    onSave(updated);
  };

  const filtered = players.filter(p =>
    (!search || p.name.toLowerCase().includes(search.toLowerCase())) &&
    (filterCat === "ALL" || (filterCat === "NONE" ? !cats[p.id] : cats[p.id] === filterCat))
  );

  const catCounts = CATS.reduce((acc, c) => ({ ...acc, [c]: players.filter(p => cats[p.id] === c).length }), {});

  return (
    <div>
      {/* Category count pills */}
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
        {[["ALL", players.length, "#A855F7"], ...CATS.map(c => [c, catCounts[c], CAT_COLORS[c].border]), ["NONE", players.filter(p=>!cats[p.id]).length, T.muted]].map(([label, count, color]) => (
          <button key={label} onClick={() => setFilterCat(label)}
            style={{ background:filterCat===label?`${color}22`:"transparent", border:`1px solid ${filterCat===label?color:T.border}`, color:filterCat===label?color:T.muted, padding:"4px 10px", fontSize:10, fontFamily:fonts.display, fontWeight:800, cursor:"pointer", letterSpacing:1 }}>
            {label} {count}
          </button>
        ))}
      </div>

      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search player…"
        style={{ width:"100%", background:T.bg, border:`1px solid ${T.border}`, color:T.text, padding:"8px 12px", fontSize:12, fontFamily:fonts.body, outline:"none", boxSizing:"border-box", marginBottom:10 }} />

      <div style={{ maxHeight:300, overflowY:"auto", display:"flex", flexDirection:"column", gap:4 }}>
        {filtered.map(p => (
          <div key={p.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", background:"rgba(255,255,255,0.02)", borderLeft:`3px solid ${cats[p.id] ? CAT_COLORS[cats[p.id]].border : T.border}` }}>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:fonts.display, fontSize:12, fontWeight:700, color:T.text, letterSpacing:0.5 }}>{p.name}</div>
              <div style={{ fontFamily:fonts.body, fontSize:10, color:T.muted }}>{p.iplTeam || p.team || ""} · {p.role || ""}</div>
            </div>
            <div style={{ display:"flex", gap:4 }}>
              {CATS.map(c => (
                <button key={c} onClick={() => setPlayerCat(p.id, cats[p.id]===c ? null : c)}
                  style={{
                    padding:"3px 7px", fontSize:8, fontWeight:900, fontFamily:fonts.display, cursor:"pointer", letterSpacing:0.5,
                    background:cats[p.id]===c?`${CAT_COLORS[c].border}33`:"transparent",
                    border:`1px solid ${cats[p.id]===c?CAT_COLORS[c].border:T.border}`,
                    color:cats[p.id]===c?CAT_COLORS[c].text:T.muted,
                  }}>{c.slice(0,2)}</button>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div style={{ textAlign:"center", padding:16, color:T.muted, fontSize:12, fontFamily:fonts.body }}>No players found</div>}
      </div>
    </div>
  );
}

// ── Live Auction ──────────────────────────────────────────────────────────────
function LiveAuction({ auction, setAuction, saveAuction, players, categories, isAdmin, user, onEnd }) {
  const [timeLeft, setTimeLeft] = useState(30);
  const [bidding, setBidding] = useState(false);
  const timerRef = useRef(null);

  const currentPlayer = auction.currentPlayer ? players.find(p => p.id === auction.currentPlayer) : null;
  const currentTeam = auction.teams?.find(t => t.id === auction.currentBidder);
  const queueIdx = auction.queue?.indexOf(auction.currentPlayer) ?? 0;
  const remaining = auction.queue?.length - queueIdx - 1;

  const CAT_BASE = auction.catBase || { PLATINUM: 2, GOLD: 1, SILVER: 0.5, BRONZE: 0.25 };
  const playerCat = currentPlayer ? (categories[currentPlayer.id] || "BRONZE") : "BRONZE";
  const basePrice = CAT_BASE[playerCat];

  // Timer countdown
  useEffect(() => {
    if (!auction.timer) return;
    timerRef.current = setInterval(() => {
      const left = Math.max(0, Math.floor((auction.timer - Date.now()) / 1000));
      setTimeLeft(left);
      if (left <= 0) clearInterval(timerRef.current);
    }, 500);
    return () => clearInterval(timerRef.current);
  }, [auction.timer]);

  // Admin: place bid for a team
  const placeBid = async (teamId) => {
    const team = auction.teams.find(t => t.id === teamId);
    if (!team) return;
    const newBid = auction.currentBid > 0 ? auction.currentBid + basePrice : basePrice;
    if (team.budget < newBid) return;
    setBidding(true);
    const updated = {
      ...auction,
      currentBid: newBid,
      currentBidder: teamId,
      timer: Date.now() + 30000,
    };
    await saveAuction(updated);
    setBidding(false);
  };

  // Admin: sell to current bidder
  const sellPlayer = async () => {
    if (!auction.currentBidder || !currentPlayer) return;
    const updated = {
      ...auction,
      teams: auction.teams.map(t => {
        if (t.id === auction.currentBidder) {
          return {
            ...t,
            budget: t.budget - auction.currentBid,
            players: [...(t.players||[]), { ...currentPlayer, soldFor: auction.currentBid, category: playerCat }],
          };
        }
        return t;
      }),
      soldLog: [...(auction.soldLog||[]), { playerId: currentPlayer.id, playerName: currentPlayer.name, teamId: auction.currentBidder, price: auction.currentBid, category: playerCat }],
    };
    await moveToNext(updated);
  };

  // Admin: mark unsold
  const markUnsold = async () => {
    if (!currentPlayer) return;
    const updated = {
      ...auction,
      unsold: [...(auction.unsold||[]), currentPlayer.id],
    };
    await moveToNext(updated);
  };

  const moveToNext = async (base) => {
    const idx = base.queue.indexOf(base.currentPlayer);
    const nextId = base.queue[idx + 1] || null;
    const updated = {
      ...base,
      currentPlayer: nextId,
      currentBid: 0,
      currentBidder: null,
      timer: nextId ? Date.now() + 30000 : null,
      status: nextId ? "live" : "ended",
    };
    await saveAuction(updated);
    if (!nextId) onEnd();
  };

  if (!currentPlayer) return (
    <div style={{ textAlign:"center", padding:48 }}>
      <div style={{ fontSize:48, marginBottom:16 }}>🏆</div>
      <div style={{ fontFamily:fonts.display, fontSize:20, fontWeight:900, color:"#A855F7", letterSpacing:3 }}>AUCTION COMPLETE</div>
    </div>
  );

  const catColor = CAT_COLORS[playerCat]?.border || T.accent;

  return (
    <div style={{ maxWidth:640, margin:"0 auto", padding:"16px" }}>
      {/* Progress bar */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
        <div style={{ flex:1, height:4, background:T.border, borderRadius:2, overflow:"hidden" }}>
          <div style={{ width:`${((queueIdx)/(auction.queue?.length||1))*100}%`, height:"100%", background:"#A855F7", transition:"width 0.5s" }} />
        </div>
        <div style={{ fontFamily:fonts.display, fontSize:10, color:T.muted, letterSpacing:1, whiteSpace:"nowrap" }}>
          {queueIdx+1} / {auction.queue?.length} · {remaining} left
        </div>
      </div>

      {/* Current player card */}
      <div style={{
        background:`linear-gradient(135deg,${catColor}15,${catColor}05)`,
        border:`3px solid ${catColor}`,
        padding:"24px 20px", marginBottom:16, position:"relative",
        clipPath:"polygon(10px 0%,100% 0%,calc(100% - 10px) 100%,0% 100%)",
      }}>
        <div style={{ position:"absolute", top:12, right:16, background:`${catColor}22`, border:`1px solid ${catColor}`, padding:"3px 10px", fontFamily:fonts.display, fontSize:9, fontWeight:900, color:catColor, letterSpacing:2 }}>
          {playerCat}
        </div>
        <div style={{ fontFamily:fonts.display, fontSize:28, fontWeight:900, color:"#fff", letterSpacing:1, marginBottom:4 }}>
          {currentPlayer.name}
        </div>
        <div style={{ fontFamily:fonts.body, fontSize:13, color:T.muted, marginBottom:16 }}>
          {currentPlayer.iplTeam || ""} {currentPlayer.role ? `· ${currentPlayer.role}` : ""}
        </div>

        {/* Current bid display */}
        <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:8 }}>
          <div style={{ fontFamily:fonts.display, fontSize:42, fontWeight:900, color:catColor, lineHeight:1 }}>
            ₹{auction.currentBid > 0 ? auction.currentBid : basePrice}
          </div>
          <div style={{ fontFamily:fonts.body, fontSize:13, color:T.muted }}>Cr</div>
          {auction.currentBid === 0 && <div style={{ fontFamily:fonts.display, fontSize:10, color:T.muted, letterSpacing:1 }}>BASE PRICE</div>}
        </div>

        {/* Current bidder */}
        {currentTeam && (
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:8, height:8, background:currentTeam.color, borderRadius:"50%" }} />
            <div style={{ fontFamily:fonts.display, fontSize:12, fontWeight:800, color:currentTeam.color, letterSpacing:1 }}>
              {currentTeam.name} is leading
            </div>
          </div>
        )}

        {/* Timer */}
        <div style={{
          position:"absolute", bottom:12, right:16,
          fontFamily:fonts.display, fontSize:24, fontWeight:900,
          color: timeLeft <= 5 ? "#EF4444" : timeLeft <= 10 ? "#F5A623" : T.muted,
          letterSpacing:1,
        }}>
          {timeLeft}s
        </div>
      </div>

      {/* Bid buttons — admin bids on behalf of teams */}
      {isAdmin && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontFamily:fonts.display, fontSize:9, color:T.muted, letterSpacing:2, marginBottom:8 }}>BID FOR TEAM</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            {auction.teams?.map(team => {
              const newBid = auction.currentBid > 0 ? auction.currentBid + auction.raiseBy : basePrice;
              const canBid = team.budget >= newBid && team.id !== auction.currentBidder;
              const squadFull = (team.players?.length || 0) >= auction.maxSquad;
              return (
                <button key={team.id} onClick={() => canBid && !squadFull && placeBid(team.id)}
                  disabled={!canBid || squadFull || bidding}
                  style={{
                    background: team.id === auction.currentBidder ? `${team.color}33` : canBid && !squadFull ? `${team.color}18` : "rgba(255,255,255,0.02)",
                    border: `2px solid ${team.id === auction.currentBidder ? team.color : canBid && !squadFull ? `${team.color}88` : T.border}`,
                    color: canBid && !squadFull ? team.color : T.muted,
                    padding:"12px 10px", cursor:canBid&&!squadFull?"pointer":"not-allowed",
                    fontFamily:fonts.display, fontWeight:800, fontSize:11, letterSpacing:0.5,
                    opacity:!canBid||squadFull?0.5:1,
                  }}>
                  <div style={{ marginBottom:2 }}>{team.name}</div>
                  <div style={{ fontSize:9, opacity:0.7 }}>
                    {squadFull ? "SQUAD FULL" : `₹${newBid}Cr · Rem: ₹${team.budget}Cr`}
                  </div>
                  {team.id === auction.currentBidder && <div style={{ fontSize:8, marginTop:2, color:team.color }}>⭐ LEADING</div>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Admin controls */}
      {isAdmin && (
        <div style={{ display:"flex", gap:8, marginBottom:20 }}>
          <button onClick={markUnsold}
            style={{ flex:1, background:"rgba(239,68,68,0.1)", border:"2px solid #EF444444", color:"#EF4444", padding:"10px", fontFamily:fonts.display, fontWeight:800, fontSize:12, cursor:"pointer", letterSpacing:1 }}>
            ✗ UNSOLD
          </button>
          <button onClick={sellPlayer} disabled={!auction.currentBidder}
            style={{ flex:2, background:auction.currentBidder?"linear-gradient(135deg,#A855F7,#7C3AED)":"rgba(255,255,255,0.05)", border:"none", color:auction.currentBidder?"#fff":T.muted, padding:"10px", fontFamily:fonts.display, fontWeight:900, fontSize:13, cursor:auction.currentBidder?"pointer":"not-allowed", letterSpacing:1, opacity:auction.currentBidder?1:0.5 }}>
            🔨 SOLD{currentTeam ? ` → ${currentTeam.name}` : ""}
          </button>
        </div>
      )}

      {/* Team budgets */}
      <div style={{ marginTop:8 }}>
        <div style={{ fontFamily:fonts.display, fontSize:9, color:T.muted, letterSpacing:2, marginBottom:8 }}>TEAM BUDGETS</div>
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {auction.teams?.map(team => {
            const spent = (auction.teams.find(t=>t.id===team.id)?.budget !== team.budget) ? "—" : "";
            const pct = (team.budget / auction.budget) * 100;
            return (
              <div key={team.id} style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:8, height:8, background:team.color, borderRadius:"50%", flexShrink:0 }} />
                <div style={{ fontFamily:fonts.display, fontSize:11, fontWeight:700, color:T.text, width:120, flexShrink:0 }}>{team.name}</div>
                <div style={{ flex:1, height:6, background:T.border, borderRadius:3, overflow:"hidden" }}>
                  <div style={{ width:`${pct}%`, height:"100%", background:team.color, transition:"width 0.5s", borderRadius:3 }} />
                </div>
                <div style={{ fontFamily:fonts.display, fontSize:10, fontWeight:700, color:team.color, width:60, textAlign:"right" }}>₹{team.budget}Cr</div>
                <div style={{ fontFamily:fonts.body, fontSize:9, color:T.muted, width:40, textAlign:"right" }}>{team.players?.length||0}pl</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Auction Summary ───────────────────────────────────────────────────────────
function AuctionSummary({ auction, players, onBack, saveAuction }) {
  const [pushing, setPushing] = useState(false);
  const [pushed, setPushed] = useState(false);
  const [newPitchName, setNewPitchName] = useState(auction.name + " League");

  return (
    <div style={{ maxWidth:640, margin:"0 auto", padding:"24px 16px" }}>
      <div style={{ textAlign:"center", marginBottom:28 }}>
        <div style={{ fontSize:48, marginBottom:8 }}>🏆</div>
        <div style={{ fontFamily:fonts.display, fontSize:24, fontWeight:900, color:"#A855F7", letterSpacing:4 }}>AUCTION ENDED</div>
        <div style={{ fontFamily:fonts.body, fontSize:13, color:T.muted, marginTop:4 }}>{auction.soldLog?.length || 0} players sold · {auction.unsold?.length || 0} unsold</div>
      </div>

      {/* Team summaries */}
      <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:24 }}>
        {auction.teams?.map(team => (
          <div key={team.id} style={{ background:T.card, border:`2px solid ${team.color}33`, borderLeft:`4px solid ${team.color}`, padding:"14px 16px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
              <div style={{ fontFamily:fonts.display, fontSize:14, fontWeight:900, color:team.color }}>{team.name}</div>
              <div style={{ fontFamily:fonts.body, fontSize:11, color:T.muted }}>
                {team.players?.length || 0} players · ₹{auction.budget - team.budget}Cr spent · ₹{team.budget}Cr left
              </div>
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
              {(team.players || []).map(p => (
                <div key={p.id} style={{ background:`${team.color}18`, border:`1px solid ${team.color}44`, padding:"3px 8px", fontSize:10, fontFamily:fonts.display, color:team.color, letterSpacing:0.3 }}>
                  {p.name} <span style={{ opacity:0.6 }}>₹{p.soldFor}Cr</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Unsold */}
      {auction.unsold?.length > 0 && (
        <div style={{ background:T.card, border:`2px solid #EF444433`, borderLeft:"4px solid #EF4444", padding:"14px 16px", marginBottom:24 }}>
          <div style={{ fontFamily:fonts.display, fontSize:12, fontWeight:900, color:"#EF4444", letterSpacing:1, marginBottom:8 }}>UNSOLD PLAYERS ({auction.unsold.length})</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
            {auction.unsold.map(pid => {
              const p = players.find(pl => pl.id === pid);
              return p ? <div key={pid} style={{ background:"rgba(239,68,68,0.1)", border:"1px solid #EF444444", padding:"3px 8px", fontSize:10, fontFamily:fonts.body, color:"#EF4444" }}>{p.name}</div> : null;
            })}
          </div>
        </div>
      )}

      {/* Push to league */}
      {!pushed && (
        <div style={{ background:T.card, border:"2px solid #A855F744", padding:"20px", marginBottom:16 }}>
          <div style={{ fontFamily:fonts.display, fontSize:14, fontWeight:900, color:"#A855F7", letterSpacing:1, marginBottom:4 }}>PUSH TO LEAGUE</div>
          <div style={{ fontFamily:fonts.body, fontSize:12, color:T.muted, marginBottom:14 }}>
            Create a new pitch with these squads. Points, transfers and leaderboard will be active.
          </div>
          <input value={newPitchName} onChange={e=>setNewPitchName(e.target.value)}
            placeholder="New pitch name…"
            style={{ width:"100%", background:T.bg, border:`1px solid ${T.border}`, color:T.text, padding:"10px 12px", fontSize:13, fontFamily:fonts.body, outline:"none", boxSizing:"border-box", marginBottom:12 }} />
          <div style={{ fontFamily:fonts.body, fontSize:11, color:T.muted, marginBottom:14 }}>
            ⚠️ This will create a new pitch. You'll need to set the admin password after.
          </div>
          <button onClick={async () => {
            setPushing(true);
            const updated = { ...auction, status:"ended", pushedPitchName: newPitchName };
            await saveAuction(updated);
            setPushed(true);
            setPushing(false);
            // TODO Phase 3: actual pitch creation
            alert("Pitch creation coming in Phase 3! For now, auction result is saved.");
          }} disabled={pushing}
            style={{ width:"100%", background:"linear-gradient(135deg,#A855F7,#7C3AED)", border:"none", color:"#fff", padding:"12px", fontFamily:fonts.display, fontWeight:900, fontSize:14, cursor:pushing?"not-allowed":"pointer", letterSpacing:2, opacity:pushing?0.7:1 }}>
            {pushing ? "SAVING…" : "🚀 PUSH TO LEAGUE →"}
          </button>
        </div>
      )}
      {pushed && (
        <div style={{ background:"rgba(168,85,247,0.1)", border:"2px solid #A855F7", padding:"16px 20px", textAlign:"center", marginBottom:16 }}>
          <div style={{ fontFamily:fonts.display, fontSize:14, fontWeight:900, color:"#A855F7", letterSpacing:2 }}>✓ AUCTION SAVED</div>
          <div style={{ fontFamily:fonts.body, fontSize:12, color:T.muted, marginTop:4 }}>Phase 3 will auto-create the pitch.</div>
        </div>
      )}

      <button onClick={onBack}
        style={{ width:"100%", background:"transparent", border:`2px solid ${T.border}`, color:T.muted, padding:"12px", fontFamily:fonts.display, fontWeight:800, fontSize:13, cursor:"pointer", letterSpacing:2 }}>
        ← BACK TO AUCTIONS
      </button>
    </div>
  );
}
