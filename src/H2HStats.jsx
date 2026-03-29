import React, { useState } from "react";

function H2HStats({ teams, matches, points, assignments, players }) {
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");

  const getTeamTotal = (teamId, matchId) => {
    let total = 0;
    players.forEach(p => {
      if (assignments[p.id] === teamId && points[p.id] && points[p.id][matchId]) {
        total += points[p.id][matchId].final || points[p.id][matchId].base || 0;
      }
    });
    return total;
  };

  const played = matches.filter(m => {
    const hasPoints = players.some(p => points[p.id] && points[p.id][m.id]);
    return hasPoints;
  });

  const tA = teams.find(t => t.id === teamA);
  const tB = teams.find(t => t.id === teamB);

  const rows = played.map(m => {
    const aScore = getTeamTotal(teamA, m.id);
    const bScore = getTeamTotal(teamB, m.id);
    const winner = aScore > bScore ? "a" : bScore > aScore ? "b" : "draw";
    return { match: m, aScore, bScore, winner };
  });

  const aWins = rows.filter(r => r.winner === "a").length;
  const bWins = rows.filter(r => r.winner === "b").length;
  const draws = rows.filter(r => r.winner === "draw").length;
  const aTot = rows.reduce((s, r) => s + r.aScore, 0);
  const bTot = rows.reduce((s, r) => s + r.bScore, 0);

  const ready = teamA && teamB && teamA !== teamB;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 28, color: "#F5A623", letterSpacing: 2 }}>HEAD TO HEAD</h2>
        <div style={{ fontSize: 12, color: "#4A5E78" }}>{played.length} matches played</div>
      </div>

      {/* Team selectors */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <select value={teamA} onChange={e => setTeamA(e.target.value)}
          style={{ flex: 1, background: "#0E1521", border: "1px solid " + (tA ? tA.color : "#1E2D45"), borderRadius: 8, padding: "10px 12px", color: "#E2EAF4", fontSize: 14, fontFamily: "Barlow Condensed,sans-serif", fontWeight: 700, cursor: "pointer", outline: "none" }}>
          <option value="">Select Team 1</option>
          {teams.filter(t => t.id !== teamB).map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 800, fontSize: 18, color: "#4A5E78" }}>VS</div>
        <select value={teamB} onChange={e => setTeamB(e.target.value)}
          style={{ flex: 1, background: "#0E1521", border: "1px solid " + (tB ? tB.color : "#1E2D45"), borderRadius: 8, padding: "10px 12px", color: "#E2EAF4", fontSize: 14, fontFamily: "Barlow Condensed,sans-serif", fontWeight: 700, cursor: "pointer", outline: "none" }}>
          <option value="">Select Team 2</option>
          {teams.filter(t => t.id !== teamA).map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
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
          {/* Summary scoreboard */}
          <div style={{ background: "#0E1521", borderRadius: 12, padding: "20px 16px", marginBottom: 20, border: "1px solid #1E2D45" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: 15, color: tA.color, marginBottom: 6 }}>{tA.name}</div>
                <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 52, fontWeight: 800, color: aWins > bWins ? tA.color : "#E2EAF4", lineHeight: 1 }}>{aWins}</div>
                <div style={{ fontSize: 10, color: "#4A5E78", letterSpacing: 2, marginTop: 4 }}>WINS</div>
              </div>
              <div style={{ textAlign: "center", padding: "0 8px" }}>
                <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 24, fontWeight: 800, color: "#4A5E78" }}>{draws > 0 ? draws : ""}</div>
                {draws > 0 && <div style={{ fontSize: 10, color: "#4A5E78", letterSpacing: 1 }}>DRAW</div>}
                <div style={{ width: 1, height: 40, background: "#1E2D45", margin: "8px auto" }} />
              </div>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: 15, color: tB.color, marginBottom: 6 }}>{tB.name}</div>
                <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 52, fontWeight: 800, color: bWins > aWins ? tB.color : "#E2EAF4", lineHeight: 1 }}>{bWins}</div>
                <div style={{ fontSize: 10, color: "#4A5E78", letterSpacing: 2, marginTop: 4 }}>WINS</div>
              </div>
            </div>
            <div style={{ display: "flex", marginTop: 16, paddingTop: 16, borderTop: "1px solid #1E2D45", gap: 8 }}>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 20, fontWeight: 700, color: "#E2EAF4" }}>{aTot}</div>
                <div style={{ fontSize: 10, color: "#4A5E78", letterSpacing: 1 }}>TOTAL PTS</div>
              </div>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 20, fontWeight: 700, color: "#E2EAF4" }}>{bTot}</div>
                <div style={{ fontSize: 10, color: "#4A5E78", letterSpacing: 1 }}>TOTAL PTS</div>
              </div>
            </div>
          </div>

          {/* Per match breakdown */}
          <div style={{ fontSize: 11, color: "#4A5E78", letterSpacing: 2, fontWeight: 700, marginBottom: 10 }}>MATCH BREAKDOWN</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rows.map(r => (
              <div key={r.match.id} style={{ background: "#0E1521", borderRadius: 10, padding: "12px 16px", border: "1px solid #1E2D45" }}>
                <div style={{ fontSize: 11, color: "#4A5E78", marginBottom: 8 }}>Match {r.match.matchNum} — {r.match.team1} vs {r.match.team2}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 24, fontWeight: 800, color: r.winner === "a" ? tA.color : "#4A5E78" }}>{r.aScore}</div>
                  </div>
                  <div style={{ fontSize: 11, color: "#4A5E78", fontWeight: 700 }}>
                    {r.winner === "a" ? "← WIN" : r.winner === "b" ? "WIN →" : "DRAW"}
                  </div>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 24, fontWeight: 800, color: r.winner === "b" ? tB.color : "#4A5E78" }}>{r.bScore}</div>
                  </div>
                </div>
                {/* Mini progress bar */}
                <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: "#1E2D45", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: ((r.aScore / (r.aScore + r.bScore || 1)) * 100) + "%", background: tA.color, borderRadius: 2 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default H2HStats;
