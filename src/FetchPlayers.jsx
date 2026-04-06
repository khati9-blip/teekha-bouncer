import React, { useState, useRef } from "react";

async function callAI(userPrompt, system = "Return only valid JSON.") {
  const body = { model: "claude-sonnet-4-20250514", max_tokens: 4000, system, messages: [{ role: "user", content: userPrompt }] };
  const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
}

function parseJSON(text) {
  const clean = text.replace(/^```json\s*/m, "").replace(/^```\s*/m, "").replace(/```\s*$/m, "").trim();
  try { return JSON.parse(clean); } catch {}
  const lb = clean.lastIndexOf("},");
  if (lb > 0) { try { return JSON.parse(clean.slice(0, lb + 1) + "]"); } catch {} }
  return [];
}

function mapRole(role = "") {
  const r = role.toLowerCase();
  if (r.includes("wk") || r.includes("wicket")) return "Wicket-Keeper";
  if (r.includes("allrounder") || r.includes("all-rounder")) return "All-Rounder";
  if (r.includes("bowl") || r.includes("fast") || r.includes("spin") || r.includes("pace")) return "Bowler";
  return "Batsman";
}

function slugify(name) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

const POPULAR_LEAGUES = [
  { name: "IPL 2025", teams: "CSK, MI, RCB, KKR, SRH, RR, PBKS, DC, GT, LSG" },
  { name: "IPL 2026", teams: "CSK, MI, RCB, KKR, SRH, RR, PBKS, DC, GT, LSG" },
  { name: "BBL (Big Bash)", teams: "Sydney Sixers, Melbourne Stars, Perth Scorchers, Brisbane Heat, Adelaide Strikers, Hobart Hurricanes, Sydney Thunder, Melbourne Renegades" },
  { name: "PSL", teams: "Karachi Kings, Lahore Qalandars, Quetta Gladiators, Peshawar Zalmi, Islamabad United, Multan Sultans" },
  { name: "The Hundred", teams: "London Spirit, Oval Invincibles, Southern Brave, Welsh Fire, Trent Rockets, Northern Superchargers, Birmingham Phoenix, Manchester Originals" },
  { name: "SA20", teams: "MI Cape Town, Paarl Royals, Durban Super Giants, Joburg Super Kings, Pretoria Capitals, Sunrisers Eastern Cape" },
];

const TAB_STYLE = (active) => ({
  flex: 1, padding: "10px 4px", border: "none", borderRadius: 8,
  background: active ? "#1E2D45" : "transparent",
  color: active ? "#F5A623" : "#4A5E78",
  fontFamily: "Barlow Condensed,sans-serif", fontWeight: 700, fontSize: 12,
  cursor: "pointer", letterSpacing: 0.3,
});

const BTN = (color) => ({
  background: `linear-gradient(135deg,${color},${color}BB)`,
  border: "none", borderRadius: 10, padding: "11px 20px",
  color: "#080C14", fontFamily: "Barlow Condensed,sans-serif",
  fontWeight: 800, fontSize: 14, cursor: "pointer",
});

const INP = {
  width: "100%", background: "#080C14", border: "1px solid #1E2D45",
  borderRadius: 8, padding: "10px 14px", color: "#E2EAF4", fontSize: 14,
  fontFamily: "Barlow Condensed,sans-serif", outline: "none",
  marginBottom: 10, boxSizing: "border-box",
};

// ── CricketData Tab ──────────────────────────────────────────────────────
function CricketDataTab({ existingPlayers, onDone, setStatus }) {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [selected, setSelected] = useState(null);
  const [fetching, setFetching] = useState(false);

  const loadSeries = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cricketdata?path=cricket-series").then(r => r.json()).catch(() => ({}));
      const data = res?.response || [];
      setSeries((Array.isArray(data) ? data : []).map(s => ({
        id: s?.id || s?.url || s?.series || "",
        name: s?.title || s?.series || s?.name || "",
      })).filter(s => s.name));
    } catch (e) { setStatus("❌ " + e.message); }
    setLoading(false);
  };

  const fetch_ = async () => {
    if (!selected) return;
    setFetching(true);
    setStatus("Fetching from CricketData…");
    try {
      let raw = [];
      for (const ep of ["cricket-players", "cricket-squad"]) {
        const res = await fetch(`/api/cricketdata?path=${ep}&seriesid=${encodeURIComponent(selected.id)}`).then(r => r.json()).catch(() => ({}));
        raw = res?.response || res?.players || res?.data || [];
        if (Array.isArray(raw) && raw.length > 0) break;
      }
      if (!raw.length) { setStatus("❌ No players found. Try AI Generate."); setFetching(false); return; }
      const ex = new Set(existingPlayers.map(p => p.id));
      const out = raw.map(p => {
        const name = p.name || p.playerName || p.fullName || "";
        if (!name) return null;
        const id = p.id ? String(p.id) : slugify(name);
        if (ex.has(id)) return null;
        return { id, name, iplTeam: p.teamName || p.team || "", role: mapRole(p.role || p.playerRole || "") };
      }).filter(Boolean);
      setStatus(`✅ ${out.length} new players from CricketData`);
      onDone(out);
    } catch (e) { setStatus("❌ " + e.message); }
    setFetching(false);
  };

  const filtered = series.filter(s => !input || s.name.toLowerCase().includes(input.toLowerCase()));

  return (
    <div>
      <div style={{ fontSize: 12, color: "#4A5E78", marginBottom: 14, lineHeight: 1.5 }}>Fetch squads from <span style={{ color: "#2ECC71" }}>CricketData</span> — 100 req/day.</div>
      {series.length === 0 ? (
        <button onClick={loadSeries} disabled={loading} style={{ ...BTN("#2ECC71"), width: "100%" }}>
          {loading ? "Loading…" : "🟢 LOAD TOURNAMENT LIST"}
        </button>
      ) : (
        <>
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="Search tournament…" autoFocus style={INP} />
          <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid #1E2D45", borderRadius: 8, marginBottom: 12 }}>
            {filtered.slice(0, 30).map(s => (
              <div key={s.id} onClick={() => setSelected(s)}
                style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #1E2D4433", background: selected?.id === s.id ? "#2ECC7122" : "transparent", color: selected?.id === s.id ? "#2ECC71" : "#E2EAF4", fontSize: 13 }}>
                {s.name} {selected?.id === s.id && "✓"}
              </div>
            ))}
            {filtered.length === 0 && <div style={{ padding: 16, color: "#4A5E78", fontSize: 13, textAlign: "center" }}>No results</div>}
          </div>
          {selected && <div style={{ background: "#2ECC7111", border: "1px solid #2ECC7133", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "#2ECC71" }}>Selected: <strong>{selected.name}</strong></div>}
          <button onClick={fetch_} disabled={!selected || fetching} style={{ ...BTN("#2ECC71"), width: "100%", opacity: !selected || fetching ? 0.5 : 1 }}>
            {fetching ? "Fetching…" : "🟢 FETCH SQUADS"}
          </button>
        </>
      )}
    </div>
  );
}

// ── AI Generate Tab ──────────────────────────────────────────────────────
function AIGenerateTab({ existingPlayers, onDone, setStatus }) {
  const [mode, setMode] = useState(null);
  const [preset, setPreset] = useState(null);
  const [custom, setCustom] = useState("");
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState("");

  const run = async (teamList) => {
    const teams = teamList.map(t => t.trim()).filter(Boolean);
    setGenerating(true);
    const ex = new Set(existingPlayers.map(p => p.id));
    const all = [];
    for (let i = 0; i < teams.length; i++) {
      const team = teams[i];
      setProgress(`${team}… (${i + 1}/${teams.length})`);
      setStatus(`AI: generating ${team}…`);
      try {
        const text = await callAI(
          `List 18 players for ${team} in the current/most recent cricket season. Return ONLY a JSON array: [{"id":"slug","name":"Full Name","iplTeam":"${team}","role":"Batsman|Bowler|All-Rounder|Wicket-Keeper"}]. No markdown.`,
          "Cricket expert. Return ONLY valid JSON array."
        );
        for (const p of parseJSON(text)) {
          if (!p.name) continue;
          const id = p.id || slugify(p.name);
          if (ex.has(id)) continue;
          ex.add(id);
          all.push({ id, name: p.name, iplTeam: p.iplTeam || team, role: mapRole(p.role || "") });
        }
      } catch (e) { console.warn(team, e.message); }
    }
    setStatus(`✅ AI generated ${all.length} players`);
    setGenerating(false);
    setProgress("");
    onDone(all);
  };

  return (
    <div>
      <div style={{ fontSize: 12, color: "#4A5E78", marginBottom: 14 }}>Use AI to generate squads for any cricket league worldwide.</div>
      {!mode && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={() => setMode("preset")} style={{ ...BTN("#A855F7"), width: "100%", padding: "14px" }}>🏆 POPULAR LEAGUES</button>
          <button onClick={() => setMode("custom")} style={{ background: "#4A5E7822", border: "1px solid #4A5E7844", borderRadius: 10, padding: "14px", color: "#94A3B8", fontFamily: "Barlow Condensed,sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>✏️ CUSTOM TEAMS</button>
        </div>
      )}
      {mode === "preset" && (
        <div>
          <button onClick={() => setMode(null)} style={{ background: "none", border: "none", color: "#4A5E78", cursor: "pointer", fontSize: 13, marginBottom: 10, padding: 0 }}>← Back</button>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {POPULAR_LEAGUES.map(l => (
              <div key={l.name} onClick={() => setPreset(l)}
                style={{ padding: "12px 14px", background: preset?.name === l.name ? "#A855F722" : "#080C14", border: `1px solid ${preset?.name === l.name ? "#A855F744" : "#1E2D45"}`, borderRadius: 8, cursor: "pointer" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: preset?.name === l.name ? "#A855F7" : "#E2EAF4" }}>{l.name}</div>
                <div style={{ fontSize: 11, color: "#4A5E78", marginTop: 2 }}>{l.teams.split(",").length} teams</div>
              </div>
            ))}
          </div>
          {preset && <button onClick={() => run(preset.teams.split(","))} disabled={generating} style={{ ...BTN("#A855F7"), width: "100%", opacity: generating ? 0.6 : 1 }}>{generating ? progress : `🤖 GENERATE ${preset.name.toUpperCase()}`}</button>}
        </div>
      )}
      {mode === "custom" && (
        <div>
          <button onClick={() => setMode(null)} style={{ background: "none", border: "none", color: "#4A5E78", cursor: "pointer", fontSize: 13, marginBottom: 10, padding: 0 }}>← Back</button>
          <div style={{ fontSize: 11, color: "#4A5E78", marginBottom: 6 }}>Team names, comma-separated:</div>
          <textarea value={custom} onChange={e => setCustom(e.target.value)} placeholder="e.g. Mumbai Indians, Chennai Super Kings, RCB" rows={4} style={{ ...INP, resize: "vertical" }} />
          <div style={{ fontSize: 11, color: "#4A5E78", marginBottom: 10 }}>{custom.split(",").filter(t => t.trim()).length} teams</div>
          <button onClick={() => run(custom.split(","))} disabled={!custom.trim() || generating} style={{ ...BTN("#A855F7"), width: "100%", opacity: !custom.trim() || generating ? 0.5 : 1 }}>{generating ? progress : "🤖 GENERATE SQUADS"}</button>
        </div>
      )}
    </div>
  );
}

// ── Manual Tab ───────────────────────────────────────────────────────────
function ManualTab({ existingPlayers, onDone, setStatus }) {
  const [sub, setSub] = useState("single");
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [role, setRole] = useState("Batsman");
  const [bulk, setBulk] = useState("");
  const [preview, setPreview] = useState([]);
  const fileRef = useRef(null);
  const ROLES = ["Batsman", "Bowler", "All-Rounder", "Wicket-Keeper"];

  const addSingle = () => {
    if (!name.trim()) return;
    onDone([{ id: slugify(name.trim()), name: name.trim(), iplTeam: team.trim(), role }]);
    setStatus("✅ Added " + name.trim());
    setName(""); setTeam("");
  };

  const parseBulk = (text) => text.split("\n").filter(l => l.trim()).map(line => {
    const [n, t, r] = line.split(",").map(p => p.trim());
    return { id: slugify(n || ""), name: n || "", iplTeam: t || "", role: mapRole(r || "") };
  }).filter(p => p.name);

  const addBulk = () => {
    const ex = new Set(existingPlayers.map(p => p.id));
    const out = parseBulk(bulk).filter(p => !ex.has(p.id));
    onDone(out);
    setStatus(`✅ Added ${out.length} players`);
    setBulk(""); setPreview([]);
  };

  const handleCSV = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split("\n").filter(l => l.trim());
      const data = lines[0]?.toLowerCase().includes("name") ? lines.slice(1) : lines;
      const ex = new Set(existingPlayers.map(p => p.id));
      const out = data.map(line => {
        const [n, t, r] = line.split(",").map(p => p.trim().replace(/"/g, ""));
        return { id: slugify(n || ""), name: n || "", iplTeam: t || "", role: mapRole(r || "") };
      }).filter(p => p.name && !ex.has(p.id));
      onDone(out);
      setStatus(`✅ Imported ${out.length} players`);
    };
    reader.readAsText(file);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 4, background: "#080C14", borderRadius: 8, padding: 4, marginBottom: 14 }}>
        {[["single", "➕ Single"], ["bulk", "📋 Bulk"], ["csv", "📁 CSV"]].map(([id, label]) => (
          <button key={id} onClick={() => setSub(id)} style={{ flex: 1, padding: "7px 4px", border: "none", borderRadius: 6, background: sub === id ? "#1E2D45" : "transparent", color: sub === id ? "#E2EAF4" : "#4A5E78", fontFamily: "Barlow Condensed,sans-serif", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>{label}</button>
        ))}
      </div>

      {sub === "single" && (
        <div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Player name" onKeyDown={e => e.key === "Enter" && addSingle()} style={INP} autoFocus />
          <input value={team} onChange={e => setTeam(e.target.value)} placeholder="Team (e.g. RCB)" style={INP} />
          <select value={role} onChange={e => setRole(e.target.value)} style={{ ...INP, cursor: "pointer", marginBottom: 14 }}>
            {ROLES.map(r => <option key={r}>{r}</option>)}
          </select>
          <button onClick={addSingle} disabled={!name.trim()} style={{ ...BTN("#4F8EF7"), width: "100%", opacity: !name.trim() ? 0.5 : 1 }}>➕ ADD PLAYER</button>
        </div>
      )}

      {sub === "bulk" && (
        <div>
          <div style={{ fontSize: 12, color: "#4A5E78", marginBottom: 8 }}>One per line: <code style={{ color: "#F5A623" }}>Name, Team, Role</code></div>
          <textarea value={bulk} onChange={e => { setBulk(e.target.value); setPreview(parseBulk(e.target.value)); }} placeholder={"Rohit Sharma, MI, Batsman\nJasprit Bumrah, MI, Bowler"} rows={6} style={{ ...INP, resize: "vertical", fontFamily: "monospace", fontSize: 12 }} />
          {preview.length > 0 && (
            <div style={{ background: "#080C14", borderRadius: 8, border: "1px solid #1E2D45", padding: "8px 12px", marginBottom: 10, maxHeight: 100, overflowY: "auto" }}>
              {preview.slice(0, 6).map((p, i) => <div key={i} style={{ fontSize: 11, color: "#94A3B8" }}><span style={{ color: "#E2EAF4" }}>{p.name}</span>{p.iplTeam && <span style={{ color: "#4A5E78" }}> · {p.iplTeam}</span>}</div>)}
              {preview.length > 6 && <div style={{ fontSize: 11, color: "#4A5E78" }}>+{preview.length - 6} more</div>}
            </div>
          )}
          <button onClick={addBulk} disabled={!preview.length} style={{ ...BTN("#4F8EF7"), width: "100%", opacity: !preview.length ? 0.5 : 1 }}>➕ ADD {preview.length} PLAYERS</button>
        </div>
      )}

      {sub === "csv" && (
        <div>
          <div style={{ fontSize: 12, color: "#4A5E78", marginBottom: 12, lineHeight: 1.6 }}>Upload a <code style={{ color: "#F5A623" }}>.csv</code> — columns: Name, Team, Role</div>
          <div onClick={() => fileRef.current?.click()} style={{ border: "2px dashed #1E2D45", borderRadius: 12, padding: "28px 20px", textAlign: "center", cursor: "pointer", marginBottom: 10 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
            <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: 15, color: "#E2EAF4" }}>Click to upload CSV</div>
          </div>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleCSV} style={{ display: "none" }} />
          <div style={{ fontSize: 11, color: "#4A5E78", textAlign: "center" }}>
            <a href="data:text/csv;charset=utf-8,Name%2CTeam%2CRole%0AVirat%20Kohli%2CRCB%2CBatsman" download="template.csv" style={{ color: "#4F8EF7", textDecoration: "none" }}>⬇️ Download template</a>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────
export default function FetchPlayers({ existingPlayers, onPlayersAdded, onClose, tournamentId, tournamentName }) {
  const [tab, setTab] = useState("cd");
  const [status, setStatus] = useState("");
  const [added, setAdded] = useState(0);

  const handleDone = (players) => {
    if (!players.length) return;
    setAdded(a => a + players.length);
    onPlayersAdded(players);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(8,12,20,0.97)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20, fontFamily: "Barlow Condensed,sans-serif" }}>
      <div style={{ background: "#141E2E", borderRadius: 16, border: "1px solid #1E2D45", width: "100%", maxWidth: 440, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ padding: "20px 22px 14px", borderBottom: "1px solid #1E2D45", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
            <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 22, fontWeight: 800, color: "#F5A623", letterSpacing: 2 }}>FETCH PLAYERS</div>
            <button onClick={onClose} style={{ background: "#1E2D45", border: "none", borderRadius: 8, width: 30, height: 30, color: "#94A3B8", fontSize: 16, cursor: "pointer" }}>✕</button>
          </div>
          <div style={{ fontSize: 11, color: "#4A5E78" }}>
            {tournamentName && <span style={{ color: "#4F8EF7", marginRight: 6 }}>🏆 {tournamentName} ·</span>}
            {existingPlayers.length} in pool
            {added > 0 && <span style={{ color: "#2ECC71", marginLeft: 8 }}>· +{added} added this session</span>}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, padding: "12px 16px 0", flexShrink: 0 }}>
          <button onClick={() => setTab("cd")} style={TAB_STYLE(tab === "cd")}>🟢 CricketData</button>
          <button onClick={() => setTab("ai")} style={TAB_STYLE(tab === "ai")}>🤖 AI Generate</button>
          <button onClick={() => setTab("manual")} style={TAB_STYLE(tab === "manual")}>✏️ Manual</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px" }}>
          {tab === "cd" && <CricketDataTab existingPlayers={existingPlayers} onDone={handleDone} setStatus={setStatus} />}
          {tab === "ai" && <AIGenerateTab existingPlayers={existingPlayers} onDone={handleDone} setStatus={setStatus} />}
          {tab === "manual" && <ManualTab existingPlayers={existingPlayers} onDone={handleDone} setStatus={setStatus} />}
        </div>

        {/* Status */}
        {status && (
          <div style={{ padding: "10px 22px", borderTop: "1px solid #1E2D45", fontSize: 12, flexShrink: 0, color: status.startsWith("✅") ? "#2ECC71" : status.startsWith("❌") ? "#FF3D5A" : "#F5A623" }}>
            {status}
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: "12px 22px", borderTop: "1px solid #1E2D45", flexShrink: 0 }}>
          <button onClick={onClose} style={{ width: "100%", background: "transparent", border: "1px solid #1E2D45", borderRadius: 10, padding: 11, color: "#4A5E78", fontFamily: "Barlow Condensed,sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
            {added > 0 ? `DONE — ${added} players added` : "CLOSE"}
          </button>
        </div>
      </div>
    </div>
  );
}
