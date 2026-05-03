import React from "react";
import { T, fonts } from "./Theme";

export default function FixOwnershipModal({ players, teams, ownershipLog, onSave, onClose }) {
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
