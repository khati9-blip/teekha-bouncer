import React, { useState, useEffect, useMemo } from 'react';
import PlayerImage from './PlayerImage';

// ── ALL-TIME MVP SLIDESHOW ───────────────────────────────────────────────────
export default function MVPSlideshow({ players, assignments, teams, points, fonts, T, PALETTE, inline }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Calculate top 5 players by total points
  const topPlayers = useMemo(() => {
    const playerTotals = players.map(p => {
      const total = Object.values(points[p.id] || {}).reduce((sum, matchData) => {
        return sum + (matchData?.total || matchData?.base || 0);
      }, 0);
      return { ...p, totalPoints: total };
    }).filter(p => p.totalPoints > 0)
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, 5);
    return playerTotals;
  }, [players, points]);

  // Auto-rotate every 4 seconds
  useEffect(() => {
    if (topPlayers.length === 0) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % topPlayers.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [topPlayers.length]);

  console.log("topPlayers", topPlayers, "points keys", Object.keys(points).length, "players", players.length);
if (topPlayers.length === 0) return null;

  const currentPlayer = topPlayers[currentIndex];
  const teamId = assignments[currentPlayer.id];
  const team = teams.find(t => t.id === teamId);
  const teamColor = team ? PALETTE[teams.indexOf(team)] : T.accent;
  
  const rankIcons = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
  const rankLabels = ["1ST", "2ND", "3RD", "4TH", "5TH"];

  return (
    <div className={`mvp-slideshow${inline ? "" : " desk-sidebar"}`} onClick={() => setCurrentIndex(prev => (prev + 1) % topPlayers.length)} style={{
      position: inline ? "relative" : "fixed",
      top: inline ? "auto" : 80,
      bottom: inline ? "auto" : 60,
      left: inline ? "auto" : 50,
      width: inline ? "100%" : 220,
      height: inline ? "auto" : "auto",
      background: `linear-gradient(160deg, ${T.bg} 0%, #0A0E14 100%)`,
      border: `3px solid ${teamColor}`,
      borderLeft: `6px solid ${teamColor}`,
      borderRadius: 0,
      clipPath: inline ? "none" : "polygon(0% 0%, 100% 0%, calc(100% - 12px) 100%, 0% 100%)",
      padding: inline ? "10px 12px" : "0px 16px 0px 16px",
      marginTop: inline ? 0 : -70,
      maxWidth: inline ? 340 : "none",
      margin: inline ? "0 auto" : 0,
      boxSizing: "border-box",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      gap: inline ? 6 : 12,
      boxShadow: `0 8px 32px ${teamColor}40, inset 0 0 60px ${teamColor}15`,
      overflow: inline ? "hidden" : "auto",
      zIndex: inline ? 1 : 10,
      boxSizing: "border-box"
    }}>
      {/* Background glow */}
      <div style={{
        position: "absolute",
        inset: -100,
        background: `radial-gradient(circle at center, ${teamColor}20 0%, transparent 70%)`,
        animation: "tb-float 3s ease-in-out infinite",
        pointerEvents: "none"
      }} />

      {/* "ALL-TIME MVP" Banner */}
      <div style={{
        background: "linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%)",
        clipPath: "polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)",
        padding: "8px 16px",
        position: "relative",
        zIndex: 1,
        whiteSpace: "nowrap",
        boxShadow: "4px 4px 0 rgba(255,107,0,0.3)"
      }}>
        <div style={{
          fontFamily: fonts.display,
          fontSize: 12,
          fontWeight: 900,
          color: "#0A0E14",
          letterSpacing: 2,
          textTransform: "uppercase",
          textShadow: "1px 1px 0 rgba(255,255,255,0.3)"
        }}>
          ⭐ ALL-TIME MVP ⭐
        </div>
      </div>

      {/* Rank Badge */}
      <div style={{
        fontSize: 36,
        lineHeight: 1,
        animation: "tb-scaleIn 0.5s ease both",
        filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.4))",
        position: "relative",
        zIndex: 1
      }} key={currentIndex}>
        {rankIcons[currentIndex]}
      </div>

      {/* Player Image */}
      <div style={{
        position: "relative",
        width: "100%",
        maxWidth: inline ? 150 : 200,
        aspectRatio: "2/3",
        animation: "tb-scaleIn 0.6s ease both",
        zIndex: 1,
        cursor: "pointer"
      }} key={`img-${currentIndex}`}>
        <PlayerImage 
          player={currentPlayer} 
          size="100%" 
          isResponsive={true}
        />
        <div style={{
          position: "absolute",
          inset: -6,
          border: `6px solid ${teamColor}`,
          clipPath: "polygon(16px 0%, 100% 0%, calc(100% - 16px) 100%, 0% 100%)",
          boxShadow: `0 0 30px ${teamColor}80, inset 0 0 30px ${teamColor}30`,
          pointerEvents: "none"
        }} />
      </div>

      {/* Player Info */}
      <div style={{
        textAlign: "center",
        animation: "tb-fadeUp 0.7s ease both",
        position: "relative",
        zIndex: 1
      }} key={`info-${currentIndex}`}>
        <div style={{
          fontFamily: fonts.display,
          fontSize: 13,
          fontWeight: 800,
          color: teamColor,
          letterSpacing: 3,
          marginBottom: 8,
          textTransform: "uppercase"
        }}>
          {rankLabels[currentIndex]} PLACE
        </div>
        <div style={{
          fontFamily: fonts.display,
          fontSize: 18,
          fontWeight: 900,
          color: T.text,
          letterSpacing: 2,
          lineHeight: 1.2,
          marginBottom: 8,
          textShadow: "2px 2px 0 rgba(0,0,0,0.3)"
        }}>
          {currentPlayer.name}
        </div>
        {team && (
          <div style={{
            fontFamily: fonts.body,
            fontSize: 13,
            color: teamColor,
            fontWeight: 700,
            marginBottom: 12
          }}>
            {team.name}
          </div>
        )}
        <div style={{
          background: `${teamColor}22`,
          border: `2px solid ${teamColor}`,
          borderRadius: 0,
          clipPath: "polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)",
          padding: "10px 20px",
          display: "inline-block"
        }}>
          <div style={{
            fontFamily: fonts.display,
            fontSize: 24,
            fontWeight: 900,
            color: teamColor,
            letterSpacing: 1
          }}>
            {currentPlayer.totalPoints.toFixed(1)}
          </div>
          <div style={{
            fontFamily: fonts.body,
            fontSize: 10,
            color: T.muted,
            letterSpacing: 2,
            textTransform: "uppercase",
            marginTop: 2
          }}>
            Total Points
          </div>
        </div>
      </div>

      {/* Progress Dots */}
      <div style={{
        display: "flex",
        gap: 8,
        position: "relative",
        zIndex: 1
      }}>
        {topPlayers.map((_, idx) => (
          <div
            key={idx}
            style={{
              width: idx === currentIndex ? 24 : 8,
              height: 8,
              background: idx === currentIndex ? teamColor : `${T.muted}40`,
              borderRadius: 4,
              transition: "all 0.3s",
              cursor: "pointer"
            }}
            onClick={() => setCurrentIndex(idx)}
          />
        ))}
      </div>
    </div>
  );
}
