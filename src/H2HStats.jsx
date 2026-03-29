import React, { useState } from "react";

function H2HStats({ teams, matches, points, assignments, players, captains }) {
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [expandedMatch, setExpandedMatch] = useState(null);

  const getTeamMatchData = (teamId, matchId) => {
    const cap = captains?.[matchId + "_" + teamId] || {};
    let total = 0;
    const playerRows = [];
    players.forEach(p => {
      if (assignments[p.id] !== teamId) return;
      const d = points[p.id]?.[matchId];
      if (!d) return;
      let pts = d.base || 0;
      let mult = 1;
      let role = "";
      if (cap.captain === p.id) { pts = Math.round(pts * 2); mult = 2; role = "C"; }
      else if (cap.vc === p.id) { pts = Math.round(pts * 1.5); mult = 1.5; role = "VC"; }
      total += pts;
      playerRows.push({ ...p, pts, base: d.base || 0, mult, role });
    });
    playerRows.sort((a, b) => b.pts - a.pts);
    return { total, playerRows };
  };

  const played = matches.filter(m =>
    players.some(p => points[p.id]?.[m.id])
  );

  const tA = teams.find(t => t.id === teamA);
  const tB = teams.find(t => t.id === teamB);

  const rows = played.map(m => {
    const aData = getTeamMatchData(teamA, m.id);
    const bData = getTeamMatchData(teamB, m.id);
    const winner = aData.total > bData.total ? "a" : bData.total > aData.total ? "b" : "draw";
    return { match: m, aScore: aData.total, bScore: bData.total, aPlayers: aData.playerRows, bPlayers: bData.playerRows, winner };
  });

  const aWins = rows.filter(r => r.winner === "a").length;
  const bWins = rows.filter(r => r.winner === "b").length;
  const draws = rows.filter(r => r.winner === "draw").length;
  const aTot = rows.reduce((s, r) => s + r.aScore, 0);
  const bTot = rows.reduce((s, r) => s + r.bScore, 0);
  const ready = teamA && teamB && teamA !== teamB;

  const PlayerList = ({ playerRows, color }) => (
    <div style={{ flex: 1 }}>
      {playerRows.map(p => (
        <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #1E2D4422" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, color: "#E2EAF4", fontWeight: p.role ? 700 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {p.name}
              {p.role && <span style={{ fontSize: 9, color: "#F5A623", background: "#F5A62333", borderRadius: 4, padding: "1px 4px", marginLeft: 4 }}>{p.role}</span>}
            </div>
            <div style={{ fontSize: 10, color: "#4A5E78" }}>{p.role}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
            <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 15, fontWeight: 800, color }}>
              {p.pts}
            </div>
            {p.mult > 1 && <div style={{ fontSize: 9, color: "#4A5E78" }}>{p.base}×{p.mult}</div>}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 28, color: "#F5A623", letterSpacing: 2 }}>HEAD TO HEAD</h2>
        <div style={{ fontSize: 12, color: "#4A5E78" }}>{played.length} matches played</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <select value={teamA} onChange={e => setTeamA(e.target.value)}
          style={{ flex: 1, background: "#0E1521", border: "1px solid " + (tA ? tA.color : "#1E2D45"), borderRadius: 8, padding: "10px 12px", color: "#E2EAF4", fontSize: 14, fontFamily: "Barlow Condensed,sans-serif", fontWeight: 700, cursor: "pointer", outline: "none" }}>
          <option value="">Select Team 1</option>
          {teams.filter(t => t.id !== teamB).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 800, fontSize: 18, color: "#4A5E78" }}>VS</div>
        <select value={teamB} onChange={e => setTeamB(e.target.value)}
          style={{ flex: 1, background: "#0E1521", border: "1px solid " + (tB ? tB.color : "#1E2D45"), borderRadius: 8, padding: "10px 12px", color: "#E2EAF4", fontSize: 14, fontFamily: "Barlow Condensed,sans-serif", fontWeight: 700, cursor: "pointer", outline: "none" }}>
          <option value="">Select Team 2</option>
          {teams.filter(t => t.id !== teamA).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {!ready && (
        <div style={{ textAlign: "center", padding: 48, color: "#4A5E78" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚔️</div>
          <div style={{ fontSize: 15 }}>Select two teams to compare</div>
        </div>
      )}

      {ready && played.length === 0 && (
        <div style={{ textAlign: "center", padding: 48, color: "#4A5E78" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 15 }}>No match data yet</div>
        </div>
      )}

      {ready && played.length > 0 && (
        <div>
          {/* Summary */}
          <div style={{ background: "#0E1521", borderRadius: 12, padding: "20px 16px", marginBottom: 20, border: "1px solid #1E2D45" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: 15, color: tA.color, marginBottom: 6 }}>{tA.name}</div>
                <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 52, fontWeight: 800, color: aWins > bWins ? tA.color : "#E2EAF4", lineHeight: 1 }}>{aWins}</div>
                <div style={{ fontSize: 10, color: "#4A5E78", letterSpacing: 2, marginTop: 4 }}>WINS</div>
              </div>
              <div style={{ textAlign: "center", padding: "0 12px" }}>
                {draws > 0 && <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 20, fontWeight: 800, color: "#4A5E78" }}>{draws}</div>}
                {draws > 0 && <div style={{ fontSize: 9, color: "#4A5E78", letterSpacing: 1, marginBottom: 4 }}>DRAW</div>}
                <div style={{ width: 1, height: 32, background: "#1E2D45", margin: "0 auto" }} />
              </div>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: 15, color: tB.color, marginBottom: 6 }}>{tB.name}</div>
                <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 52, fontWeight: 800, color: bWins > aWins ? tB.color : "#E2EAF4", lineHeight: 1 }}>{bWins}</div>
                <div style={{ fontSize: 10, color: "#4A5E78", letterSpacing: 2, marginTop: 4 }}>WINS</div>
              </div>
            </div>
            <div style={{ display: "flex", marginTop: 16, paddingTop: 16, borderTop: "1px solid #1E2D45" }}>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 22, fontWeight: 700, color: aTot > bTot ? tA.color : "#E2EAF4" }}>{aTot}</div>
                <div style={{ fontSize: 10, color: "#4A5E78", letterSpacing: 1 }}>TOTAL PTS</div>
              </div>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 22, fontWeight: 700, color: bTot > aTot ? tB.color : "#E2EAF4" }}>{bTot}</div>
                <div style={{ fontSize: 10, color: "#4A5E78", letterSpacing: 1 }}>TOTAL PTS</div>
              </div>
            </div>
          </div>

          {/* Per match breakdown */}
          <div style={{ fontSize: 11, color: "#4A5E78", letterSpacing: 2, fontWeight: 700, marginBottom: 10 }}>MATCH BREAKDOWN</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rows.map(r => {
              const open = expandedMatch === r.match.id;
              return (
                <div key={r.match.id} style={{ background: "#0E1521", borderRadius: 10, border: "1px solid #1E2D45", overflow: "hidden" }}>
                  {/* Match header */}
                  <div onClick={() => setExpandedMatch(open ? null : r.match.id)}
                    style={{ padding: "12px 16px", cursor: "pointer" }}>
                    <div style={{ fontSize: 11, color: "#4A5E78", marginBottom: 8 }}>M{r.match.matchNum} — {r.match.team1} vs {r.match.team2}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 26, fontWeight: 800, color: r.winner === "a" ? tA.color : "#4A5E78" }}>{r.aScore}</div>
                        <div style={{ fontSize: 9, color: "#4A5E78" }}>{tA.name}</div>
                      </div>
                      <div style={{ fontSize: 11, color: "#4A5E78", fontWeight: 700, textAlign: "center", minWidth: 50 }}>
                        {r.winner === "a" ? "← WIN" : r.winner === "b" ? "WIN →" : "DRAW"}
                        <div style={{ fontSize: 10, color: "#2D3E52", marginTop: 2 }}>{open ? "▲" : "▼"}</div>
                      </div>
                      <div style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 26, fontWeight: 800, color: r.winner === "b" ? tB.color : "#4A5E78" }}>{r.bScore}</div>
                        <div style={{ fontSize: 9, color: "#4A5E78" }}>{tB.name}</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 8, height: 3, borderRadius: 2, background: "#1E2D45", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: ((r.aScore / (r.aScore + r.bScore || 1)) * 100) + "%", background: tA.color, borderRadius: 2 }} />
                    </div>
                  </div>

                  {/* Expanded player breakdown */}
                  {open && (
                    <div style={{ borderTop: "1px solid #1E2D45", padding: "12px 16px" }}>
                      <div style={{ display: "flex", gap: 16 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, color: tA.color, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>{tA.name.toUpperCase()}</div>
                          <PlayerList playerRows={r.aPlayers} color={tA.color} />
                        </div>
                        <div style={{ width: 1, background: "#1E2D45" }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, color: tB.color, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>{tB.name.toUpperCase()}</div>
                          <PlayerList playerRows={r.bPlayers} color={tB.color} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default H2HStats;
