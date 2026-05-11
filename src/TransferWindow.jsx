import { T, fonts, FONT_URL } from "./Theme";
import React, { useState, useEffect, useCallback } from "react";

// Pre-warm html2canvas in background — loads once, instant on click
let html2canvasPromise = null;
const preloadHtml2Canvas = () => {
  if (!html2canvasPromise) html2canvasPromise = import("html2canvas").then(m => m.default);
};

const SB_URL = "https://rmcxhorijitrhqyrvvkn.supabase.co/rest/v1/league_data";
const SB_KEY = "sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm";

const TIER_ORDER = { platinum:4, gold:3, silver:2, bronze:1, "":0 };
const TIER_COLORS = { platinum:"#B0BEC5", gold:"#F5A623", silver:"#94A3B8", bronze:"#CD7F32", "":"#4A5E78" };
const TIER_BG = { platinum:"#4A5E7833", gold:"#F5A62322", silver:"#94A3B822", bronze:"#CD7F3222", "":"#1E2D4533" };
const TIER_BORDER = { platinum:"#4A5E7866", gold:"#F5A62366", silver:"#94A3B855", bronze:"#CD7F3255", "":"#1E2D45" };

function TierBadge({ tier }) {
  if (!tier) return null;
  return (
    <span style={{fontSize:9,fontWeight:800,letterSpacing:1,padding:"2px 6px",borderRadius:0,clipPath:"polygon(3px 0%,100% 0%,calc(100% - 3px) 100%,0% 100%)",
      fontFamily:fonts.body,textTransform:"uppercase",
      background:TIER_BG[tier],border:"1px solid "+TIER_BORDER[tier],color:TIER_COLORS[tier]}}>
      {tier==="platinum"?"PLAT":tier==="gold"?"GOLD":tier==="silver"?"SILV":"BRNZ"}
    </span>
  );
}
// ── PLAYER CARD STYLES (global) ────────────────────────────────────────────

const PLAYER_CARD_STYLES = `
  .transfer-player-card .stats-overlay {
    transform: translateY(100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .transfer-player-card:hover .stats-overlay {
    transform: translateY(0);
  }
  .transfer-player-card .image-dark {
    opacity: 0.1;
    transition: opacity 0.3s ease;
  }
  .transfer-player-card:hover .image-dark {
    opacity: 0.6;
  }
`;

// ── PLAYER IMAGE CARD (for transfer selection) ────────────────────────────────

function PlayerCard({ player, isSelected, canClick, onClick, selectionColor, showPoints = true, points, height = 300 }) {
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <div
      className="transfer-player-card"
      style={{
        position: "relative",
        borderRadius: 12,
        overflow: "hidden",
        border: `3px solid ${isSelected ? selectionColor : T.border}`,
        boxShadow: isSelected ? `0 0 20px ${selectionColor}66, 0 4px 12px ${selectionColor}44` : "0 2px 8px rgba(0,0,0,0.3)",
        background: T.bg,
        height: height,
        cursor: canClick ? "pointer" : "default",
        transition: "all 0.3s ease",
        opacity: canClick ? 1 : 0.7
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={canClick ? onClick : undefined}
    >

      {/* Player Image */}
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 0
      }}>
        <img
          src={`https://rmcxhorijitrhqyrvvkn.supabase.co/storage/v1/object/public/player-images/${player.id}.png`}
          alt={player.name}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "top center"
          }}
          onError={(e) => {
            e.target.style.display = 'none';
          }}
        />
        <div
          className="image-dark"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(10, 14, 20, 0.6)"
          }}
        />
      </div>

      {/* Selected Checkmark */}
      {isSelected && (
        <div style={{
          position: "absolute",
          top: 8,
          right: 8,
          background: selectionColor,
          borderRadius: "50%",
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          zIndex: 2,
          boxShadow: `0 2px 8px ${selectionColor}88`
        }}>
          ✓
        </div>
      )}

      {/* Player Name Badge (always visible) */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        background: "rgba(10, 14, 20, 0.9)",
        backdropFilter: "blur(8px)",
        padding: "10px 12px",
        borderTop: `2px solid ${isSelected ? selectionColor : T.border}`,
        zIndex: 1
      }}>
        <div style={{
          fontFamily: fonts.display,
          fontWeight: 900,
          fontSize: 14,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: "#FFFFFF",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          marginBottom: 2
        }}>
          {player.name}
        </div>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: 10,
          color: "#94A3B8"
        }}>
          <TierBadge tier={player.tier} />
          <span>{player.role}</span>
        </div>
      </div>

      {/* Stats Overlay (slides up on hover) */}
      {showPoints && (
        <div
          className="stats-overlay"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            background: "rgba(10, 14, 20, 0.95)",
            backdropFilter: "blur(12px)",
            padding: "16px 12px",
            borderTop: `3px solid ${isSelected ? selectionColor : T.accent}`,
            zIndex: 1
          }}
        >
          <div style={{
            fontFamily: fonts.display,
            fontWeight: 900,
            fontSize: 14,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: "#FFFFFF",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            marginBottom: 8
          }}>
            {player.name}
          </div>
          
          <div style={{
            textAlign: "center",
            padding: "8px 0",
            marginBottom: 8,
            borderTop: `1px solid ${T.border}44`,
            borderBottom: `1px solid ${T.border}44`
          }}>
            <div style={{
              fontFamily: fonts.display,
              fontSize: 28,
              fontWeight: 900,
              color: isSelected ? selectionColor : T.accent,
              lineHeight: 1,
              textShadow: isSelected ? `0 0 20px ${selectionColor}aa` : `0 0 20px ${T.accent}aa`
            }}>
              {points || 0}
            </div>
            <div style={{
              fontFamily: fonts.display,
              fontSize: 8,
              color: "#64748B",
              letterSpacing: 1,
              marginTop: 4,
              fontWeight: 600
            }}>
              TOTAL POINTS
            </div>
          </div>

          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 10,
            color: "#94A3B8"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <TierBadge tier={player.tier} />
              <span>{player.role}</span>
            </div>
            <span>{player.iplTeam}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── COUNTDOWN TIMER ──────────────────────────────────────────────────────────
function Timer({ deadline, label = "REMAINING", onExpire }) {
  const [left, setLeft] = useState(0);
  const expiredRef = React.useRef(false);
  useEffect(() => {
    expiredRef.current = false;
    const tick = () => {
      const remaining = Math.max(0, Math.floor((new Date(deadline) - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0 && !expiredRef.current) {
        expiredRef.current = true;
        if (onExpire) onExpire();
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [deadline]);
  const d = Math.floor(left / 86400);
  const h = Math.floor((left % 86400) / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const urgent = left < 300;
  const display = left === 0 ? "OPENING..."
    : d > 0 ? `${d}d ${h}h ${m}m`
    : h > 0 ? `${h}h ${m}m`
    : `${m}:${String(s).padStart(2,"0")}`;
  return (
    <div style={{fontFamily:fonts.display,fontSize:d>0?28:32,fontWeight:900,
      color:left===0?"#4A5E78":urgent?T.danger:T.accent,textAlign:"center",letterSpacing:2}}>
      {display}
      <div style={{fontSize:10,color:T.muted,letterSpacing:3,marginTop:2,fontWeight:700}}>{left===0?"JUST A SEC...":label}</div>
    </div>
  );
}

// ── AUTO WINDOW TIMING ───────────────────────────────────────────────────────
function getNextTransferStartIST() {
  // Returns ISO string for next Sunday 23:59:00 IST (UTC+5:30)
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const day = istNow.getUTCDay(); // 0=Sun
  const daysUntilSunday = day === 0 ? 7 : 7 - day;
  const nextSunday = new Date(istNow);
  nextSunday.setUTCDate(istNow.getUTCDate() + daysUntilSunday);
  nextSunday.setUTCHours(18, 29, 0, 0); // 23:59 IST = 18:29 UTC
  return nextSunday.toISOString();
}

function getNextTransferEndIST() {
  // Returns ISO string for next Monday 05:30:00 UTC = 11:00 AM IST
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const day = istNow.getUTCDay();
  const h = istNow.getUTCHours();
  const m = istNow.getUTCMinutes();
  // If today IS Monday and we haven't hit 11 AM IST (05:30 UTC) yet — use TODAY
  const isMondayBeforeDeadline = day === 1 && (h < 5 || (h === 5 && m < 30));
  const daysUntilMonday = isMondayBeforeDeadline ? 0 : (day === 1 ? 7 : (8 - day) % 7);
  const nextMonday = new Date(istNow);
  nextMonday.setUTCDate(istNow.getUTCDate() + daysUntilMonday);
  nextMonday.setUTCHours(5, 30, 0, 0); // 11:00 IST = 05:30 UTC
  return nextMonday.toISOString();
}

function isWithinReleaseWindowDynamic() {
  // Sunday 11:59 PM → Monday 11:00 AM IST
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset);
  const day = ist.getUTCDay(); // 0=Sun,1=Mon
  const h = ist.getUTCHours(), m = ist.getUTCMinutes();
  if (day === 0 && (h > 23 || (h === 23 && m >= 59))) return true; // Sun 11:59 PM+
  if (day === 1 && (h < 5 || (h === 5 && m < 30))) return true; // Mon before 11 AM IST
  return false;
}

// ── TRANSFER WINDOW COMPONENT ────────────────────────────────────────────────
export default function TransferWindow({
  pitch, teams, players, assignments, transfers, unsoldPool,
  leaderboard, isAdmin, myTeam, unlocked, withPassword,
  onUpdateTransfers, onUpdateAssignments, onUpdateUnsoldPool,
  onUpdateOwnershipLog, ownershipLog, points,
  user, safePlayers, pitchConfig, ruledOut = []
}) {
  useEffect(() => {
    if (!document.getElementById('transfer-player-card-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'transfer-player-card-styles';
      styleEl.textContent = PLAYER_CARD_STYLES;
      document.head.appendChild(styleEl);
    }
  }, []);

  // Parse day/time from pitchConfig string like "Sunday 11:59 PM"
  const parseDayTime = (str, defDay, defH, defM) => {
    const days = {Sunday:0,Monday:1,Tuesday:2,Wednesday:3,Thursday:4,Friday:5,Saturday:6};
    if (!str) return { day: defDay, h: defH, m: defM };
    try {
      const parts = str.split(" ");
      const d = days[parts[0]] ?? defDay;
      const hhmm = parts[parts.length-2] || "11:59";
      const ampm = parts[parts.length-1] || "PM";
      let [hh, mm] = hhmm.split(":").map(Number);
      if (ampm === "PM" && hh !== 12) hh += 12;
      if (ampm === "AM" && hh === 12) hh = 0;
      return { day: d, h: hh, m: mm };
    } catch { return { day: defDay, h: defH, m: defM }; }
  };

  const transferStart = parseDayTime(pitchConfig?.transferStart, 0, 23, 59); // Sun 11:59 PM
  const transferEnd   = parseDayTime(pitchConfig?.transferEnd,   1,  11, 0); // Mon 11:00 AM

  const getNextTransferStartIST = () => {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const day = istNow.getUTCDay();
    const h = istNow.getUTCHours(), m = istNow.getUTCMinutes();

    const isBeforeStartToday = day === transferStart.day &&
      (h < transferStart.h || (h === transferStart.h && m < transferStart.m));

    const daysUntil = isBeforeStartToday ? 0 : (transferStart.day - day + 7) % 7 || 7;

    const next = new Date(istNow);
    next.setUTCDate(istNow.getUTCDate() + daysUntil);
    // Convert IST to UTC: subtract 5 hours 30 minutes
    const totalMinutesIST = transferStart.h * 60 + transferStart.m;
    const totalMinutesUTC = totalMinutesIST - 330; // 330 = 5.5 * 60
    next.setUTCHours(Math.floor(totalMinutesUTC / 60), totalMinutesUTC % 60, 0, 0);
    return next.toISOString();
  };

  const getNextTransferEndIST = () => {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const day = istNow.getUTCDay();
    const h = istNow.getUTCHours(), m = istNow.getUTCMinutes();

    const isBeforeDeadlineToday = day === transferEnd.day &&
      (h < transferEnd.h || (h === transferEnd.h && m < transferEnd.m));

    const daysUntil = isBeforeDeadlineToday ? 0 :
      day === transferEnd.day ? 0 :
      (transferEnd.day - day + 7) % 7 || 7;

    const next = new Date(istNow);
    next.setUTCDate(istNow.getUTCDate() + daysUntil);
    // Convert IST to UTC: subtract 5 hours 30 minutes
    const totalMinutesIST = transferEnd.h * 60 + transferEnd.m;
    const totalMinutesUTC = totalMinutesIST - 330;
    next.setUTCHours(Math.floor(totalMinutesUTC / 60), totalMinutesUTC % 60, 0, 0);
    return next.toISOString();
  };

  const isWithinReleaseWindowDynamic = () => {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(now.getTime() + istOffset);
    const day = ist.getUTCDay(), h = ist.getUTCHours(), m = ist.getUTCMinutes();
    const afterStart = day === transferStart.day &&
      (h > transferStart.h || (h === transferStart.h && m >= transferStart.m));
    const beforeEnd = day === transferEnd.day &&
      (h < transferEnd.h || (h === transferEnd.h && m < transferEnd.m));
    const betweenDays = transferStart.day !== transferEnd.day &&
      day !== transferStart.day &&
      day !== transferEnd.day &&
      ((transferStart.day < transferEnd.day)
        ? (day > transferStart.day && day < transferEnd.day)
        : (day > transferStart.day || day < transferEnd.day)); // handles week wrap e.g. Fri→Mon
    return afterStart || betweenDays || beforeEnd;
  };
  const [pickModal, setPickModal] = useState(null); // {poolPlayer}
  const [poolSearch, setPoolSearch] = useState("");
  const [sessionTeamId, setSessionTeamId] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null); // {message, onConfirm}
  const [twTab, setTwTab] = useState("window"); // "window" | "history"
  const [showReversalAlert, setShowReversalAlert] = useState(false);
  const [tradeConfirmModal, setTradeConfirmModal] = useState(null); // {poolPlayer, releasedPlayer}

  // Pre-warm html2canvas so share is instant when clicked
  useEffect(() => { preloadHtml2Canvas(); }, []);

  const rawPhase = transfers?.phase || "closed";
  const storedDeadline = transfers?.releaseDeadline;
  const calculatedDeadline = getNextTransferEndIST();
  // If stored deadline exists and passed — close. If no stored deadline, use calculated.
  const releaseDeadlinePassed = rawPhase === "release" && (
    storedDeadline ? new Date(storedDeadline) < new Date() : false
  );
  const phase = releaseDeadlinePassed ? "closed" : rawPhase;
  const myTeamId = myTeam?.id || sessionTeamId;
  const isPlayerSafe = (pid) => Object.values(safePlayers || {}).some(arr => arr.includes(pid));
  const sortedTeams = leaderboard.map(t => teams.find(x => x.id === t.id)).filter(Boolean);
  // Pick order: fewest active squad players first
  const pickOrder = [...teams].sort((a, b) => {
    const countA = players.filter(p => assignments[p.id] === a.id).length;
    const countB = players.filter(p => assignments[p.id] === b.id).length;
    return countA - countB; // ascending — fewest picks first
  });

  // ── HELPERS ────────────────────────────────────────────────────────────────
  const getReleasedPlayers = (teamId) => {
    const pickedByOthers = new Set(
      (transfers?.tradedPairs || [])
        .filter(tp => tp.teamId !== teamId)
        .map(tp => tp.pickedPid)
    );
    return (transfers?.releases?.[teamId] || [])
      .map(pid => players.find(p => p.id === pid))
      .filter(Boolean)
      .map(p => ({
        ...p,
        pickedByOther: pickedByOthers.has(p.id), // mark if another team picked this player
      }));
  };

  const getTradedPairs = (teamId) =>
    (transfers?.tradedPairs || []).filter(t => t.teamId === teamId);

  // Build pool: from unsoldPool but also exclude players already traded this window
  const tradedPickedPids = new Set((transfers?.tradedPairs || []).map(tp => tp.pickedPid));
  const poolPlayers = unsoldPool
    .filter(pid => !tradedPickedPids.has(pid))
    .map(pid => players.find(p => p.id === pid)).filter(Boolean);
  const sortedPool = [...poolPlayers].sort((a,b) =>
    (TIER_ORDER[b.tier||""] - TIER_ORDER[a.tier||""]) || a.name.localeCompare(b.name)
  );

 // ── FORCED AUTO-TRADE ─────────────────────────────────────────────────────
  // After every trade, check if any team now has exactly ONE valid pick left.
  // If yes — auto-execute that trade immediately before next team sees the pool.
  // Chains: keeps running until no more forced trades exist.
  const runForcedTrades = (state, skipTeamId) => {
    let current = { ...state };
    let changed = true;

    while (changed) {
      changed = false;
      const currentIneligible = new Set(transfers.ineligible || []);
      const alreadyPicked = new Set((current.newTradedPairs || []).map(tp => tp.pickedPid));

      // Rebuild pool players fresh each iteration
      const currentPoolPlayers = current.pool
        .filter(id => !alreadyPicked.has(id))
        .map(id => players.find(p => p.id === id)).filter(Boolean);

      for (const team of teams) {
        if (team.id === skipTeamId) continue; // current picking team picks manually
        const teamReleasedPids = new Set(transfers.releases?.[team.id] || []);
        const teamTradedPids = new Set(
          (current.newTradedPairs || [])
            .filter(tp => tp.teamId === team.id)
            .map(tp => tp.releasedPid)
        );
        const remainingReleased = [...teamReleasedPids]
          .filter(pid => !teamTradedPids.has(pid) && !currentIneligible.has(pid))
          .map(pid => players.find(p => p.id === pid)).filter(Boolean);

        if (remainingReleased.length === 0) continue;

        for (const rp of remainingReleased) {
          const validPicks = currentPoolPlayers.filter(pp =>
            !teamReleasedPids.has(pp.id) &&
            !alreadyPicked.has(pp.id) &&
            pp.role === rp.role &&
            TIER_ORDER[pp.tier||""] <= TIER_ORDER[rp.tier||""]
          );
          if (validPicks.length !== 1) continue;

          // If two released players from the SAME team both have this
          // as their only option — let the team choose manually
          const sameTeamConflict = remainingReleased.some(otherRp => {
            if (otherRp.id === rp.id) return false;
            const otherValid = currentPoolPlayers.filter(pp =>
              !teamReleasedPids.has(pp.id) &&
              !alreadyPicked.has(pp.id) &&
              pp.role === otherRp.role &&
              TIER_ORDER[pp.tier||""] <= TIER_ORDER[otherRp.tier||""]
            );
            return otherValid.length === 1 && otherValid[0].id === validPicks[0].id;
          });
          if (sameTeamConflict) continue;

          const pp = validPicks[0];
          const now = new Date().toISOString();

          const updAssignments = { ...current.newAssignments, [pp.id]: team.id };
          if (updAssignments[rp.id] === team.id) delete updAssignments[rp.id];

          let updLog = { ...(current.newLog || {}) };
          if (!updLog[rp.id]) updLog[rp.id] = [];
          updLog[rp.id] = updLog[rp.id].map(o =>
            o.teamId === team.id && !o.to ? { ...o, to: now } : o
          );
          if (!updLog[rp.id].some(o => o.teamId === team.id)) {
            updLog[rp.id].push({ teamId: team.id, from: "2025-01-01T00:00:00.000Z", to: now });
          }
          if (!updLog[pp.id]) updLog[pp.id] = [];
          updLog[pp.id] = updLog[pp.id].map(o => !o.to ? { ...o, to: now } : o);
          updLog[pp.id].push({ teamId: team.id, from: now, to: null });

          const updTradedPairs = [
            ...(current.newTradedPairs || []),
            {
              teamId: team.id,
              releasedPid: rp.id,
              pickedPid: pp.id,
              week: transfers.weekNum,
              timestamp: now,
              autoTraded: true,
            }
          ];

          const newAlreadyPicked = new Set(updTradedPairs.map(tp => tp.pickedPid));
          // Only add released player back to pool if not already picked by someone
          const updPool = current.pool.filter(id => !newAlreadyPicked.has(id));
          if (!newAlreadyPicked.has(rp.id)) updPool.push(rp.id);

          current = { newAssignments: updAssignments, pool: updPool, newTradedPairs: updTradedPairs, newLog: updLog };
          changed = true;
          break;
        }
        if (changed) break;
      }
    }
    return current;
  };

  const getValidMatches = (poolPlayer, teamId) => {
    // Can't pick your own released player
    const ownReleases = new Set(transfers.releases?.[teamId] || []);
    if (ownReleases.has(poolPlayer.id)) return [];

    const released = getReleasedPlayers(teamId);
    const tradedPids = getTradedPairs(teamId).map(t => t.releasedPid);
    const remaining = released.filter(p => !tradedPids.includes(p.id));

    const directMatches = remaining.filter(rp =>
      rp.role === poolPlayer.role &&
      TIER_ORDER[poolPlayer.tier||""] <= TIER_ORDER[rp.tier||""]
    );
    if (directMatches.length === 0) return [];

    // Hall's condition check — for every subset of remaining release slots
    // across all other teams, the union of valid picks must be >= subset size.
    // This catches all chain stranding scenarios, not just one step ahead.
    const poolAfterPick = sortedPool.filter(pp => pp.id !== poolPlayer.id);
    const ineligible = new Set(transfers.ineligible || []);

    // Build release slots for all other teams
    const releaseSlots = [];
    teams.forEach(t => {
      if (t.id === teamId) return;
      const tReleasedPids = new Set(transfers.releases?.[t.id] || []);
      const tTradedPids = new Set(getTradedPairs(t.id).map(tp => tp.releasedPid));
      const tRemaining = [...tReleasedPids]
        .filter(pid => !tTradedPids.has(pid) && !ineligible.has(pid))
        .map(pid => players.find(p => p.id === pid)).filter(Boolean);

      tRemaining.forEach(rp => {
        const validPicks = new Set(
          poolAfterPick
            .filter(pp =>
              !tReleasedPids.has(pp.id) &&
              pp.role === rp.role &&
              TIER_ORDER[pp.tier||""] <= TIER_ORDER[rp.tier||""]
            )
            .map(pp => pp.id)
        );
        releaseSlots.push({ validPicks, teamId: t.id });
      });
    });

    // Remove same-team conflicted slots before Hall's check.
    // If two slots from the same team share the same single valid pick
    // (e.g. DD has Jos Buttler + Dhruv Jurel both needing Kartik),
    // exclude them — auto-return will handle them, they shouldn't block others.
    const filteredSlots = releaseSlots.filter((slot, idx) => {
      if (slot.validPicks.size !== 1) return true;
      const singlePick = [...slot.validPicks][0];
      return !releaseSlots.some((other, otherIdx) =>
        otherIdx !== idx &&
        other.validPicks.size === 1 &&
        [...other.validPicks][0] === singlePick &&
        slot.teamId === other.teamId
      );
    });

    // Check Hall's condition for all non-empty subsets.
    // Only block if this pick CREATES a new violation — ignore pre-existing ones.
    const n = filteredSlots.length;

    // First compute current slots WITHOUT the pick to find pre-existing violations
    const currentSlots = [];
    teams.forEach(t => {
      if (t.id === teamId) return;
      const tReleasedPids = new Set(transfers.releases?.[t.id] || []);
      const tTradedPids = new Set(getTradedPairs(t.id).map(tp => tp.releasedPid));
      const tRemaining = [...tReleasedPids]
        .filter(pid => !tTradedPids.has(pid) && !ineligible.has(pid))
        .map(pid => players.find(p => p.id === pid)).filter(Boolean);
      tRemaining.forEach(rp => {
        const validPicks = new Set(
          sortedPool
            .filter(pp =>
              !tReleasedPids.has(pp.id) &&
              pp.role === rp.role &&
              TIER_ORDER[pp.tier||""] <= TIER_ORDER[rp.tier||""]
            )
            .map(pp => pp.id)
        );
        currentSlots.push({ validPicks });
      });
    });

    for (let mask = 1; mask < (1 << n); mask++) {
      const subset = [];
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) subset.push(i);
      }
      const unionAfter = new Set();
      subset.forEach(i => filteredSlots[i].validPicks.forEach(pid => unionAfter.add(pid)));

      if (unionAfter.size < subset.length) {
        // Violation after pick — check if it also existed before
        const unionBefore = new Set();
        subset.forEach(i => currentSlots[i]?.validPicks.forEach(pid => unionBefore.add(pid)));
        if (unionBefore.size >= subset.length) {
          // Pre-existing was fine, pick made it worse — block
          return [];
        }
        // Pre-existing violation — not our problem, continue
      }
    }

    return directMatches;
  };

  const canPass = (teamId) => {
    const released = getReleasedPlayers(teamId);
    const tradedPids = getTradedPairs(teamId).map(t => t.releasedPid);
    const remaining = released.filter(p => !tradedPids.includes(p.id));
    if (remaining.length === 0) return false;
   const teamReleasedPids = new Set(transfers.releases?.[teamId] || []);
    for (const rp of remaining) {
      for (const pp of sortedPool) {
        if (
          !teamReleasedPids.has(pp.id) &&
          pp.role === rp.role &&
          TIER_ORDER[pp.tier||""] <= TIER_ORDER[rp.tier||""]
        ) return false;
      }
    }
    return true;
  };

  const currentPickTeamId = transfers?.currentPickTeam;

  // ── AUTO-RETURN INELIGIBLE RELEASED PLAYERS ──────────────────────────────
  // Single unified effect — replaces two near-duplicate effects that were
  // causing double Supabase writes on every trade.
  React.useEffect(() => {
    if (phase !== "trade") return;
    const currentIneligible = new Set(transfers.ineligible || []);
    const newlyIneligible = [];

    teams.forEach(team => {
      const released = getReleasedPlayers(team.id); // includes pickedByOther flag
      const tradedPids = new Set(getTradedPairs(team.id).map(t => t.releasedPid));

      released.forEach(rp => {
        if (tradedPids.has(rp.id)) return;        // already traded
        if (currentIneligible.has(rp.id)) return;  // already returned
       if (rp.pickedByOther) {
          const hasValidPick = poolPlayers.some(pp => {
            const matches = getValidMatches(pp, team.id);
            return matches.some(m => m.id === rp.id);
          });
          if (hasValidPick) return; // still has options — fine
          newlyIneligible.push({ pid: rp.id, teamId: team.id });
          return;
        }
        // Check if any pool player is a valid pick specifically for THIS released player
        const hasValidPick = poolPlayers.some(pp => {
          const matches = getValidMatches(pp, team.id);
          return matches.some(m => m.id === rp.id);
        });
        if (!hasValidPick) newlyIneligible.push({ pid: rp.id, teamId: team.id });
      });
    });

    if (newlyIneligible.length === 0) return;

    const newAssignments = { ...assignments };
    const newPool = [...unsoldPool];
    const newIneligible = [...(transfers.ineligible || [])];

    newlyIneligible.forEach(({ pid, teamId }) => {
      newAssignments[pid] = teamId;
      const idx = newPool.indexOf(pid);
      if (idx > -1) newPool.splice(idx, 1);
      newIneligible.push(pid);
    });

    // Check if current picking team still has valid picks left
    const currentTeamStillHasPicks = (() => {
      if (!currentPickTeamId) return false;
      const rel = getReleasedPlayers(currentPickTeamId);
      const traded = new Set(getTradedPairs(currentPickTeamId).map(t => t.releasedPid));
      return rel.some(p => !traded.has(p.id) && !newIneligible.includes(p.id) && !p.pickedByOther);
    })();

    const nextTeam = currentTeamStillHasPicks
      ? currentPickTeamId
      : getNextPickTeam(currentPickTeamId, transfers.tradedPairs);

    onUpdateAssignments(newAssignments);
    onUpdateUnsoldPool(newPool);
    onUpdateTransfers({
      ...transfers,
      ineligible: newIneligible,
      currentPickTeam: nextTeam || null,
      pickDeadline: nextTeam && !currentTeamStillHasPicks
        ? new Date(Date.now() + 45 * 60 * 1000).toISOString()
        : currentTeamStillHasPicks ? transfers.pickDeadline : null,
      phase: !nextTeam ? "done" : "trade",
    });
  }, [phase, poolPlayers.map(p=>p.id).join(","), (transfers.tradedPairs||[]).length]);
  const currentPickTeam = teams.find(t => t.id === currentPickTeamId);
  const isMyTurn = currentPickTeamId === myTeamId;
  const effectiveTeamId = myTeamId || (unlocked ? currentPickTeamId : null);
  const myReversalAlert = (isMyTurn || unlocked) && transfers?.reversalAlert?.find(r => r.teamId === effectiveTeamId);

  // Auto-show reversal alert when it's my turn and I have a reversal
  React.useEffect(() => {
    if (myReversalAlert) setShowReversalAlert(true);
  }, [currentPickTeamId, myTeamId, unlocked]);

  // ── RELEASE ────────────────────────────────────────────────────────────────
  const handleRelease = (teamId, pid) => {
    if (phase !== "release") return;
    if (isPlayerSafe(pid)) { alert("This player is marked SAFE and cannot be released."); return; }
    if (ruledOut.includes(pid)) { setConfirmModal({message:"🚫 This player is ruled out for the season and cannot be released.", onConfirm:null}); return; }
    const current = transfers?.releases?.[teamId] || [];
    const isReleased = current.includes(pid);
    if (!isReleased && current.length >= 3) { alert("Max 3 releases per team"); return; }
    const updated = {
      ...transfers,
      releases: {
        ...transfers.releases,
        [teamId]: isReleased ? current.filter(x => x !== pid) : [...current, pid]
      }
    };
    
    // Update pool by calculating from current state, not individual add/remove
    const newPool = isReleased 
      ? unsoldPool.filter(id => id !== pid)  // removing: filter out
      : unsoldPool.includes(pid) ? unsoldPool : [...unsoldPool, pid];  // adding: append if not present
    
    onUpdateUnsoldPool(newPool);
    onUpdateTransfers(updated);
  };

  // ── PICK ───────────────────────────────────────────────────────────────────
  const handlePickClick = (poolPlayer) => {
    const actingTeamId = isMyTurn ? myTeamId : currentPickTeamId; // admin picks for current team
    const valid = getValidMatches(poolPlayer, actingTeamId);
    if (valid.length === 0) { alert("No valid match — must be same role and same/lower tier."); return; }
    setPickModal({ poolPlayer, validMatches: valid, actingTeamId });
  };

  const confirmTrade = (poolPlayer, releasedPlayer) => {
    setPickModal(null);
    setTradeConfirmModal({ poolPlayer, releasedPlayer, actingTeamId: pickModal?.actingTeamId });
  };

  const executeTrade = () => {
    const { poolPlayer, releasedPlayer, actingTeamId: tradeTeamId } = tradeConfirmModal;
    const tradeAsTeamId = tradeTeamId || myTeamId;
    const now = new Date().toISOString();
    const today = now.split("T")[0];

    // Update assignments
    const newAssignments = { ...assignments, [poolPlayer.id]: tradeAsTeamId };
    // Only remove the released player's assignment if it's still with this team
    // (it could have been picked by another team already — don't overwrite that)
    if (newAssignments[releasedPlayer.id] === tradeAsTeamId) {
      delete newAssignments[releasedPlayer.id];
    }

    // Update ownership log — freeze released player, reset incoming
    let newLog = { ...(ownershipLog || {}) };

    // Close released player's period for this team
    if (!newLog[releasedPlayer.id]) newLog[releasedPlayer.id] = [];
    newLog[releasedPlayer.id] = newLog[releasedPlayer.id].map(o =>
      o.teamId === tradeAsTeamId && !o.to ? { ...o, to: now } : o
    );
    if (!newLog[releasedPlayer.id].some(o => o.teamId === tradeAsTeamId)) {
      newLog[releasedPlayer.id].push({ teamId: tradeAsTeamId, from: "2025-01-01T00:00:00.000Z", to: now });
    }

    // Open new period for incoming player (points reset from now)
    if (!newLog[poolPlayer.id]) newLog[poolPlayer.id] = [];
    // Close any existing open period for this player
    newLog[poolPlayer.id] = newLog[poolPlayer.id].map(o => !o.to ? { ...o, to: now } : o);
    newLog[poolPlayer.id].push({ teamId: tradeAsTeamId, from: now, to: null });

    // Record trade pair
    const tradedPairs = [
      ...(transfers.tradedPairs || []),
      {
        teamId: tradeAsTeamId,
        releasedPid: releasedPlayer.id,
        pickedPid: poolPlayer.id,
        week: transfers.weekNum,
        timestamp: now,
      }
    ];

    // Update pool — remove picked player, add released player
    // Also remove any previously traded picks to keep pool clean
    const allPickedSoFar = new Set(tradedPairs.map(tp => tp.pickedPid));
    const newPool = unsoldPool.filter(id => !allPickedSoFar.has(id) && id !== poolPlayer.id);
    if (!newPool.includes(releasedPlayer.id)) newPool.push(releasedPlayer.id);

   // Run forced auto-trades — chain until no more single-option situations
    const forced = runForcedTrades({
      pool: newPool,
      newAssignments,
      newTradedPairs: tradedPairs,
      newLog,
    }, tradeAsTeamId);
    const finalAssignments = forced.newAssignments;
    const finalPool = forced.pool;
    const finalTradedPairs = forced.newTradedPairs;
    const finalLog = forced.newLog;

    // Advance to next team
    const nextTeam = getNextPickTeam(tradeAsTeamId, finalTradedPairs);
    const deadline = nextTeam ? new Date(Date.now() + 45 * 60 * 1000).toISOString() : null;
    const allDone = !nextTeam;

    // Clear reversal alert for this team (they've re-picked)
    const clearedAlerts = (transfers.reversalAlert || []).filter(a => a.teamId !== tradeAsTeamId);

    const updated = {
      ...transfers,
      tradedPairs,
      currentPickTeam: allDone ? null : nextTeam,
      pickDeadline: allDone ? null : deadline,
      phase: allDone ? "done" : "trade",
      reversalAlert: clearedAlerts.length > 0 ? clearedAlerts : null,
    };

   const dedupedPool = [...new Set(finalPool)];
    onUpdateAssignments(finalAssignments);
    onUpdateUnsoldPool(dedupedPool);
    onUpdateOwnershipLog(finalLog);
    onUpdateTransfers({ ...updated, tradedPairs: finalTradedPairs });
    setTradeConfirmModal(null);
  };

  const handlePass = () => {
    const actingId = myTeamId || currentPickTeamId; // admin acts for current team
    if (!canPass(actingId) && !unlocked) { alert("You cannot pass — valid picks exist in the pool."); return; }
    const myReleased = getReleasedPlayers(actingId);
    const tradedPids = getTradedPairs(actingId).map(t => t.releasedPid);
    const remaining = myReleased.filter(p => !tradedPids.includes(p.id));
    const currentTradedPairs = transfers.tradedPairs || [];

    // Detect reversals: ONLY from the untraded remaining players (Z)
    // X and Y were already successfully traded — those are permanent, no reversal
    // Only Z (couldn't find a match) triggers a reversal if another team picked Z
    const reversals = remaining.map(p => {
      const otherPick = currentTradedPairs.find(tp => tp.pickedPid === p.id && tp.teamId !== actingId);
      return otherPick ? { ...otherPick, returnedPlayerName: p.name } : null;
    }).filter(Boolean);

    const reversalPids = new Set(reversals.map(r => r.pickedPid));
    const trulySelfReturning = remaining.filter(p => !reversalPids.has(p.id));

    // Build new assignments
    const newAssignments = { ...assignments };
    // Return truly self-owned untraded players to this team
    trulySelfReturning.forEach(p => { newAssignments[p.id] = actingId; });
    // For reversals: player returns to the passing team (actingId)
    reversals.forEach(r => { newAssignments[r.pickedPid] = actingId; });

    // Fix ownershipLog — remove the stale open period written when the pick was made
    const newLog = { ...(ownershipLog || {}) };
    reversals.forEach(r => {
      const pid = r.pickedPid;
      if (!newLog[pid]) return;
      newLog[pid] = newLog[pid]
        .filter(o => !(o.teamId === r.teamId && o.to === null))  // remove Team B's open period
        .map(o =>
          o.teamId === actingId && o.to !== null                  // re-open Team A's closed period
            ? { ...o, to: null }
            : o
        );
    });

    // Pool: remove truly self-returning players; reversal players were already out of pool
    const returnedPids = new Set(trulySelfReturning.map(p => p.id));
    const newPool = unsoldPool.filter(id => !returnedPids.has(id));

    // Remove reversed trade pairs — affected teams need to re-pick
    const affectedTeamIds = [...new Set(reversals.map(r => r.teamId))];
    const newTradedPairs = currentTradedPairs.filter(tp =>
      !reversals.some(r => r.teamId === tp.teamId && r.pickedPid === tp.pickedPid)
    );

    // Build reversal alert for affected teams — also clear THIS team's own alert if they're passing as a re-pick
    const existingAlerts = (transfers.reversalAlert || []).filter(a => !affectedTeamIds.includes(a.teamId) && a.teamId !== actingId);
    const newAlerts = reversals.map(r => ({
      teamId: r.teamId,
      returnedPlayerName: r.returnedPlayerName,
      returnedToTeam: teams.find(t => t.id === actingId)?.name || "another team",
      releasedPid: r.releasedPid, // Y — still in pool for re-pick
    }));
    const reversalAlert = [...existingAlerts, ...newAlerts];

    // Ineligible: only truly self-returning players
    const ineligible = [...(transfers.ineligible || []), ...trulySelfReturning.map(p => p.id)];

    // Next team: affected teams get priority to re-pick, then normal order
    const nextTeam = affectedTeamIds[0] || getNextPickTeam(actingId, newTradedPairs);
    const deadline = nextTeam ? new Date(Date.now() + 45 * 60 * 1000).toISOString() : null;

    onUpdateAssignments(newAssignments);
    onUpdateUnsoldPool(newPool);
    onUpdateOwnershipLog(newLog);
    onUpdateTransfers({
      ...transfers,
      tradedPairs: newTradedPairs,
      ineligible,
      reversalAlert,
      currentPickTeam: nextTeam || null,
      pickDeadline: deadline,
      phase: nextTeam ? "trade" : "done",
    });
  };

  const getNextPickTeam = (currentTeamId, tradedPairs) => {
    const order = pickOrder.map(t => t.id);
    const idx = order.indexOf(currentTeamId);
    for (let i = 1; i <= order.length; i++) {
      const tid = order[(idx + i) % order.length];
      const released = getReleasedPlayers(tid);
      const traded = (tradedPairs || []).filter(t => t.teamId === tid).map(t => t.releasedPid);
      const ineligible = transfers.ineligible || [];
      const remaining = released.filter(p => !traded.includes(p.id) && !ineligible.includes(p.id));
      if (remaining.length > 0) return tid;
    }
    return null;
  };

  // ── ADMIN ACTIONS ─────────────────────────────────────────────────────────
  const startTradePhase = () => withPassword(() => {
    const totalPicks = Object.values(transfers.releases || {}).reduce((s, arr) => s + arr.length, 0) || (teams.length * 3);
    const msPerPick = 45 * 60 * 1000; // 45 mins per pick

    // Pick order: fewest squad players first — weakest team always gets priority
    const firstTeam = pickOrder[0]?.id;
    const deadline = new Date(Date.now() + msPerPick).toISOString();
    onUpdateTransfers({
      ...transfers,
      phase: "trade",
      currentPickTeam: firstTeam,
      pickDeadline: deadline,
      msPerPick,
      tradeStartedAt: new Date().toISOString(),
    });
    setConfirmModal({ message: `Trade phase started! ${totalPicks} total picks · 45 min per pick.`, onConfirm: null });
  });

  const resetTradePhase = () => withPassword(() => {
    setConfirmModal({ message: "⚠️ Full reset? All picks AND releases will be erased. Teams start fresh from release phase.", onConfirm: () => {

    const currentPairs = transfers.tradedPairs || [];
    let newAssignments = { ...assignments };
    let newLog = { ...(ownershipLog || {}) };

    // Undo all trades first
    for (const pair of currentPairs) {
      delete newAssignments[pair.pickedPid]; // remove picked player from team
      newAssignments[pair.releasedPid] = pair.teamId; // return released to original team
      if (newLog[pair.pickedPid]) {
        newLog[pair.pickedPid] = newLog[pair.pickedPid].filter(o =>
          !(o.teamId === pair.teamId && o.from > (transfers.tradeStartedAt || ""))
        );
      }
      if (newLog[pair.releasedPid]) {
        newLog[pair.releasedPid] = newLog[pair.releasedPid].map(o =>
          o.teamId === pair.teamId && o.to ? { ...o, to: null } : o
        );
      }
    }

    // Return all released players to their teams
    const allReleases = transfers.releases || {};
    Object.entries(allReleases).forEach(([teamId, pids]) => {
      pids.forEach(pid => {
        newAssignments[pid] = teamId; // return to original team
      });
    });

    const allReleasedPids = new Set(Object.values(allReleases).flat());
    const allPickedPids = new Set(currentPairs.map(p => p.pickedPid));

    // Restore pool:
    // - Released but not traded → going back to their teams, remove from pool
    // - Originally unsold players that were picked → trades undone, put back in pool
    // - Everything else → stays as is
    const newPool = unsoldPool.filter(id => {
      if (allReleasedPids.has(id) && !allPickedPids.has(id)) return false; // released not traded — going to team
      return true;
    });
    // Add back originally unsold players that were picked (trades are being undone)
    for (const pair of currentPairs) {
      if (!allReleasedPids.has(pair.pickedPid) && !newPool.includes(pair.pickedPid)) {
        newPool.push(pair.pickedPid);
      }
    }

    onUpdateAssignments(newAssignments);
    onUpdateUnsoldPool(newPool);
    onUpdateOwnershipLog(newLog);
    onUpdateTransfers({
      ...transfers,
      phase: "release",
      releases: {},
      tradedPairs: [],
      ineligible: [],
      currentPickTeam: null,
      pickDeadline: null,
      releaseDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24hrs to re-release
      tradeStartedAt: null,
    });
    }});
  });

  const closeWindow = () => withPassword(() => {
    setConfirmModal({ message: "Close the transfer window? All releases will be undone and players returned to their teams.", onConfirm: () => {
    // Collect all released player IDs across all teams
    const allReleasedPids = Object.values(transfers?.releases || {}).flat();

    // If in trade phase, also undo any completed trades
    const tradedPairs = transfers?.tradedPairs || [];
    let newAssignments = { ...assignments };
    let newLog = { ...(ownershipLog || {}) };

    for (const pair of tradedPairs) {
      // Return picked player to pool / undo assignment
      delete newAssignments[pair.pickedPid];
      // Return released player to their original team
      newAssignments[pair.releasedPid] = pair.teamId;
      // Undo ownership log
      if (newLog[pair.pickedPid]) {
        newLog[pair.pickedPid] = newLog[pair.pickedPid].filter(o =>
          !(o.teamId === pair.teamId && o.from > (transfers.tradeStartedAt || ""))
        );
      }
      if (newLog[pair.releasedPid]) {
        newLog[pair.releasedPid] = newLog[pair.releasedPid].map(o =>
          o.teamId === pair.teamId && o.to ? { ...o, to: null } : o
        );
      }
    }

    // Remove ALL released players from unsold pool (they go back to their teams)
    const newPool = unsoldPool.filter(pid => !allReleasedPids.includes(pid));

    onUpdateAssignments(newAssignments);
    onUpdateUnsoldPool(newPool);
    if (tradedPairs.length > 0) onUpdateOwnershipLog(newLog);
onUpdateTransfers({
      ...transfers,
      phase: "closed",
      suppressUntil: getNextTransferEndIST(), // don't auto-reopen until current window closes
      releases: {},
      tradedPairs: [],
      ineligible: [],
      currentPickTeam: null,
      pickDeadline: null,
    });
    }});
  });
  const startNewWeek = () => withPassword(() => {
    setConfirmModal({ message: "Start new week? This will archive this window's history and reset for a fresh transfer window.", onConfirm: () => {
    onUpdateTransfers({
      weekNum: (transfers.weekNum || 1) + 1,
      phase: "closed",
      suppressUntil: getNextTransferEndIST(), // don't auto-reopen until current window fully closes
      releases: {},
      tradedPairs: [],
      ineligible: [],
      currentPickTeam: null,
      pickDeadline: null,
      history: [
        ...(transfers.history || []),
        {
          week: transfers.weekNum,
          releases: transfers.releases,
          tradedPairs: transfers.tradedPairs,
          date: new Date().toISOString(),
        }
      ],
    });
    // Return un-traded released players to their teams + clean pool
    const { newAssignments: cleanAssign, newPool: cleanPool } = returnUntradedPlayers(transfers, assignments, unsoldPool);
    onUpdateAssignments(cleanAssign);
    onUpdateUnsoldPool(cleanPool);
    }});
  });

  const openReleaseManually = () => withPassword(() => doOpenRelease());

  const doOpenRelease = () => {
    // First: return any un-traded released players from previous window
    const { newAssignments: cleanAssign, newPool: cleanPool } = returnUntradedPlayers(transfers, assignments, unsoldPool);
    onUpdateAssignments(cleanAssign);
    onUpdateUnsoldPool(cleanPool);

    // Archive current window trades to history before opening new window
    const hasHistory = transfers.tradedPairs?.length > 0 || Object.values(transfers.releases||{}).some(a=>a.length>0);
    const history = hasHistory ? [
      ...(transfers.history || []),
      {
        week: transfers.weekNum || 1,
        releases: transfers.releases || {},
        tradedPairs: transfers.tradedPairs || [],
        date: new Date().toISOString(),
      }
    ] : (transfers.history || []);

    onUpdateTransfers({
      ...transfers,
      phase: "release",
      weekNum: hasHistory ? (transfers.weekNum || 1) + 1 : (transfers.weekNum || 1),
      releaseDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24hrs from now
      releases: {},
      tradedPairs: [],
      ineligible: [],
      currentPickTeam: null,
      pickDeadline: null,
      history,
    });
  };

  // ── CLEANUP: return un-traded released players to their teams ───────────────
  const returnUntradedPlayers = (currentTransfers, currentAssignments, currentPool) => {
    const tradedReleasedPids = new Set((currentTransfers.tradedPairs||[]).map(tp => tp.releasedPid));
    const allReleasedPids = new Set(Object.values(currentTransfers.releases || {}).flat());
    const newAssignments = { ...currentAssignments };
    const untradedPids = new Set();

    Object.entries(currentTransfers.releases || {}).forEach(([teamId, pids]) => {
      pids.forEach(pid => {
        if (!tradedReleasedPids.has(pid)) {
          newAssignments[pid] = teamId; // return to team
          untradedPids.add(pid);
        }
      });
    });

    const pickedPids = new Set((currentTransfers.tradedPairs||[]).map(tp => tp.pickedPid));
    // Only remove from pool if: player was released this week (untraded) OR was picked this week
    // Never touch originally unsold players who were already in the pool before this window
    const newPool = currentPool.filter(pid => {
      if (untradedPids.has(pid)) return false; // released but not traded — returned to team
      if (pickedPids.has(pid) && allReleasedPids.has(pid)) return false; // was released then picked — no longer in pool
      return true; // originally unsold — keep in pool
    });
    return { newAssignments, newPool };
  };

  // ── NEXT AUTO OPEN INFO ──────────────────────────────────────────────────
  const nextAutoOpen = getNextTransferStartIST();
  const releaseDeadline = storedDeadline || calculatedDeadline;

  // ── RENDER ────────────────────────────────────────────────────────────────
  const phaseBadge = { closed:"#4A5E78", release:"#F5A623", trade:"#2ECC71", done:"#4F8EF7" };

  return (
    <div style={{fontFamily:fonts.body,paddingBottom:40}}>

      {/* HEADER */}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12,marginBottom:20}}>
        <div>
          <div style={{display:"inline-block",background:T.accent,padding:"4px 16px 4px 12px",marginBottom:8,clipPath:"polygon(0 0,100% 0,calc(100% - 10px) 100%,0 100%)"}}>
            <h2 style={{fontFamily:fonts.display,fontSize:28,fontWeight:700,color:T.bg,letterSpacing:3,margin:0}}>TRANSFER WINDOW</h2>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <span style={{fontSize:11,color:T.muted}}>Week {transfers?.weekNum || 1}</span>
            <span style={{background:phaseBadge[phase]+"22",color:phaseBadge[phase],border:"1px solid "+phaseBadge[phase]+"44",padding:"2px 10px",borderRadius:0,clipPath:"polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>
              {phase}
            </span>
            {phase === "closed" && (
              <span style={{fontSize:11,color:T.sub,fontFamily:fonts.display,letterSpacing:1,fontWeight:600}}>AUTO-OPENS {(pitchConfig?.transferStart || "Sun 11:59 PM").toUpperCase()} IST</span>
            )}
          </div>
        </div>

        {/* Auto countdown to next window */}
        {phase === "closed" && (
          <div style={{background:T.card,borderRadius:0,padding:"10px 16px",textAlign:"center",border:`1px solid ${T.border}`}}>
            <div style={{fontSize:10,color:T.muted,letterSpacing:2,marginBottom:4}}>NEXT WINDOW OPENS</div>
            <Timer deadline={nextAutoOpen} label={"UNTIL " + (pitchConfig?.transferStart || "SUNDAY 11:59 PM") + " IST"}
              onExpire={() => {
                if (transfers.phase === "closed") doOpenRelease();
              }}
            />
            <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${T.border}33`}}>
              <div style={{fontSize:10,color:T.muted}}>🔄 <span style={{color:T.sub}}>{pitchConfig?.transferStart || "Sunday 11:59 PM"} → {pitchConfig?.transferEnd || "Monday 11:00 AM"} IST</span></div>
            </div>
          </div>
        )}
        {phase === "release" && (
          <div style={{background:T.accentBg,borderRadius:0,padding:"10px 16px",textAlign:"center",border:`1px solid ${T.accentBorder}`,borderTop:`3px solid ${T.accent}`}}>
            <div style={{fontSize:10,color:T.accent,letterSpacing:2,marginBottom:4}}>RELEASE WINDOW CLOSES</div>
            <Timer deadline={releaseDeadline} label={(pitchConfig?.transferEnd || "MONDAY 11:00 AM") + " IST"} />
          </div>
        )}
      </div>

      {/* TAB SWITCHER */}
      <div style={{display:"flex",gap:0,marginBottom:20,background:T.bg,borderRadius:0,padding:0,border:"none",borderBottom:`2px solid ${T.border}`}}>
        {[{id:"window",label:"⚡ TRANSFER"},{id:"history",label:"📜 HISTORY"}].map(tab=>(
          <button key={tab.id} onClick={()=>setTwTab(tab.id)}
            style={{flex:1,padding:"12px 0",border:"none",borderBottom:twTab===tab.id?`3px solid ${T.accent}`:"3px solid transparent",cursor:"pointer",fontFamily:fonts.display,fontWeight:800,fontSize:14,letterSpacing:2,textTransform:"uppercase",transition:"all 0.2s",
              background:"transparent",
              color: twTab===tab.id ? T.accent : T.muted,
              marginBottom:-2,
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {twTab==="history" && (
        <TransferHistory transfers={transfers} players={players} teams={teams} />
      )}

      {twTab==="window" && <>

      {/* ADMIN CONTROLS */}
      {unlocked && (
        <div style={{background:T.card,borderRadius:0,borderLeft:`3px solid ${T.accent}`,border:`1px solid ${T.accentBorder}`,padding:16,marginBottom:20}}>
          <div style={{fontSize:11,color:T.accent,letterSpacing:2,fontWeight:700,marginBottom:12}}>🔑 ADMIN CONTROLS</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>

            {/* Always visible: Open / Close window */}
            {(phase === "closed" || phase === "done") && (
              <button onClick={openReleaseManually} style={adminBtn("#F5A623")}>
                📤 OPEN WINDOW
              </button>
            )}
            {(phase === "release" || phase === "trade") && (
              <button onClick={closeWindow} style={adminBtn("#FF3D5A")}>
                ✕ CLOSE WINDOW
              </button>
            )}

            {/* Phase-specific actions — always show when unlocked */}
            {(phase === "release" || phase === "closed" || phase === "done") && (
              <button onClick={startTradePhase} style={adminBtn("#2ECC71")}>
                🏁 START TRADE PHASE
              </button>
            )}

            {(phase === "trade" || phase === "release" || phase === "closed") && (
              <>
              </>
            )}

            {phase === "done" && (
              <button onClick={startNewWeek} style={adminBtn("#F5A623")}>
                📅 START NEW WEEK
              </button>
            )}

            {phase === "trade" && (
              <>
                <button onClick={() => withPassword(() => {
                  // Force auto-pick: pick best available player for current team
                  const currentTeamId = transfers.currentPickTeam;
                  const released = getReleasedPlayers(currentTeamId);
                  const traded = (transfers.tradedPairs||[]).filter(p=>p.teamId===currentTeamId).map(p=>p.releasedPid);
                  const relPlayer = released.find(p => !traded.includes(p.id));
                  const available = unsoldPool
                    .map(pid => players.find(p => p.id === pid))
                    .filter(Boolean)
                    .sort((a,b) => {
                      const pA = Object.values((window._points||{})[a.id]||{}).reduce((s,d)=>s+(d?.base||0),0);
                      const pB = Object.values((window._points||{})[b.id]||{}).reduce((s,d)=>s+(d?.base||0),0);
                      return pB - pA;
                    });
                  const pick = available[0];
                  if (!pick || !relPlayer) { alert("Nothing to auto-pick"); return; }
                  const msPerPick = transfers.msPerPick || 45*60*1000;
                  const newPairs = [...(transfers.tradedPairs||[]), { teamId: currentTeamId, pickedPid: pick.id, releasedPid: relPlayer.id, timestamp: new Date().toISOString(), autoPicked: true }];
                  const nextTeam = getNextPickTeam(currentTeamId, newPairs);
                  const deadline = nextTeam ? new Date(Date.now() + msPerPick).toISOString() : null;
                  const newPhase = nextTeam ? "trade" : "done";
                  const newAssign = { ...assignments, [pick.id]: currentTeamId };
                  const newPool = unsoldPool.filter(x => x !== pick.id);
                  onUpdateAssignments(newAssign);
                  onUpdateUnsoldPool(newPool);
                  onUpdateTransfers({ ...transfers, tradedPairs: newPairs, currentPickTeam: nextTeam, pickDeadline: deadline, phase: newPhase });
                  alert(`🤖 Auto-picked ${pick.name} for ${teams.find(t=>t.id===currentTeamId)?.name}`);
                })} style={adminBtn("#F5A623")}>
                  🤖 FORCE AUTO-PICK
                </button>
                <button onClick={() => withPassword(() => {
                  const nextTeam = getNextPickTeam(currentPickTeamId, transfers.tradedPairs);
                  const msPerPick = transfers.msPerPick || 45*60*1000;
                  const deadline = nextTeam ? new Date(Date.now() + msPerPick).toISOString() : null;
                  onUpdateTransfers({ ...transfers, currentPickTeam: nextTeam, pickDeadline: deadline });
                })} style={adminBtn("#4F8EF7")}>
                  ⏭ SKIP CURRENT TEAM
                </button>
                <button onClick={resetTradePhase} style={adminBtn("#A855F7")}>
                  🔄 RESET TRADE PHASE
                </button>
                <button onClick={() => withPassword(() => {
                  const pairs = transfers.tradedPairs || [];
                  const totalReleased = Object.values(transfers.releases || {}).reduce((s, arr) => s + arr.length, 0);
                  if (pairs.length === 0 && totalReleased > 0) {
                    if (!confirm(`⚠️ WARNING: No trades have been recorded yet but ${totalReleased} players were released. Ending now will return ALL released players to their teams and undo any trades that happened outside this window.\n\nAre you sure you want to end the trade phase?`)) return;
                  }
                  const { newAssignments: cleanAssign, newPool: cleanPool } = returnUntradedPlayers(transfers, assignments, unsoldPool);
                  onUpdateAssignments(cleanAssign);
                  onUpdateUnsoldPool(cleanPool);
                  onUpdateTransfers({ ...transfers, phase: "done" });                })} style={adminBtn("#2ECC71")}>
                  ✅ END TRADE PHASE
                </button>
              </>
            )}

            {/* Full rollback — undo all trades and restore squads */}
            <button onClick={()=>setConfirmModal({
              message:"⚠️ FULL RESET: Undo ALL transfers across all weeks? Players return to their original teams, all trade history is wiped. This cannot be undone.",
              onConfirm:()=>{
                // Collect all trade pairs across current window + history
                const allPairs = [
                  ...(transfers.tradedPairs || []),
                  ...((transfers.history || []).flatMap(w => w.tradedPairs || []))
                ];
                // Reverse all trades: remove traded-in players, return traded-out players
                const newAssignments = { ...assignments };
                const poolAdditions = new Set();
                const poolRemovals = new Set();
                for (const pr of allPairs) {
                  // Traded-in player leaves the team
                  if (newAssignments[pr.pickedPid] === pr.teamId) {
                    delete newAssignments[pr.pickedPid];
                    poolAdditions.add(pr.pickedPid); // goes back to pool
                  }
                  // Traded-out player returns to their original team
                  newAssignments[pr.releasedPid] = pr.teamId;
                  poolRemovals.add(pr.releasedPid); // leaves pool
                }
                // Also return any released-but-not-traded players
                const allReleases = Object.entries({
                  ...(transfers.releases || {}),
                  ...((transfers.history || []).reduce((acc, w) => ({...acc, ...(w.releases || {})}), {}))
                });
                for (const [teamId, pids] of allReleases) {
                  for (const pid of pids) {
                    if (!allPairs.some(pr => pr.releasedPid === pid)) {
                      // Released but not traded — return to original team
                      newAssignments[pid] = teamId;
                      poolRemovals.add(pid);
                    }
                  }
                }
                // Update pool
                const newPool = [
                  ...unsoldPool.filter(pid => !poolRemovals.has(pid)),
                  ...[...poolAdditions].filter(pid => !unsoldPool.includes(pid))
                ];
                // Clear ownership log entries created by trades
                const tradedPids = new Set(allPairs.flatMap(pr => [pr.pickedPid, pr.releasedPid]));
                const newLog = { ...ownershipLog };
                for (const pid of tradedPids) {
                  if (newLog[pid]) {
                    // Keep only the first/original period (before any trades)
                    const original = newLog[pid][0];
                    if (original) {
                      newLog[pid] = [{ ...original, to: null }];
                    } else {
                      delete newLog[pid];
                    }
                  }
                }
                // Clear transfers entirely
                const cleaned = { phase:"closed", weekNum:1, releases:{}, tradedPairs:[], ineligible:[], history:[], currentPickTeam:null, pickDeadline:null, reversalAlert:null };
                onUpdateAssignments(newAssignments);
                onUpdateUnsoldPool(newPool);
                onUpdateOwnershipLog(newLog);
                onUpdateTransfers(cleaned);
              }
            })} style={adminBtn("#FF3D5A")}>
              ↩️ FULL RESET
            </button>
          </div>

          {/* Teams not compliant warning */}
          {phase === "release" && (
            <div style={{marginTop:12,display:"flex",flexWrap:"wrap",gap:6}}>
              {sortedTeams.filter(t => (transfers?.releases?.[t.id]||[]).length < 3).map(t => (
                <div key={t.id} style={{background:T.dangerBg,border:`1px solid ${T.danger}33`,borderLeft:`2px solid ${T.danger}`,borderRadius:0,padding:"5px 10px",fontSize:11,color:T.danger}}>
                  ⚠️ {t.name}: {(transfers?.releases?.[t.id]||[]).length}/3 released
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CLOSED STATE */}
      {phase === "closed" && (
        <div style={{background:T.card,borderRadius:0,border:`1px solid ${T.border}`,borderTop:`3px solid ${T.border}`,padding:40,textAlign:"center"}}>
          <div style={{fontSize:48,marginBottom:12}}>🔒</div>
          <div style={{fontFamily:fonts.display,fontSize:26,fontWeight:700,color:T.text,letterSpacing:3,marginBottom:8}}>TRANSFER WINDOW CLOSED</div>
          <div style={{fontSize:13,color:T.muted,marginBottom:12}}>Opens automatically every {pitchConfig?.transferStart || "Sunday at 11:59 PM IST"}</div>
          <div style={{display:"inline-flex",flexDirection:"column",gap:4,background:T.bg,borderRadius:0,padding:"10px 20px",border:`1px solid ${T.border}`}}>
            <div style={{fontSize:11,color:T.muted}}>🔄 Window: <span style={{color:T.text,fontWeight:600}}>{pitchConfig?.transferStart || "Sunday 11:59 PM"} → {pitchConfig?.transferEnd || "Monday 11:00 AM"} IST</span></div>
          </div>
        </div>
      )}

      {/* ── CURRENTLY RELEASED PLAYERS — TEAM GRID ───────────────────────── */}
      {(phase !== "done") && (() => {
        const allReleases = transfers.releases || {};
        const tradedPids = new Set((transfers.tradedPairs || []).map(tp => tp.releasedPid));
        // Build per-team data
        const teamGroups = Object.entries(allReleases)
          .map(([tid, pids]) => {
            const team = teams.find(t => t.id === tid);
            if (!team) return null;
            const releasedPlayers = pids.map(pid => {
              const p = players.find(pl => pl.id === pid);
              return p ? { ...p, traded: tradedPids.has(pid) } : null;
            }).filter(Boolean);
            if (releasedPlayers.length === 0) return null;
            return { team, players: releasedPlayers };
          })
          .filter(Boolean);

        if (teamGroups.length === 0) return null;

        const totalAvailable = teamGroups.reduce((s, g) => s + g.players.filter(p => !p.traded).length, 0);
        const totalTraded    = teamGroups.reduce((s, g) => s + g.players.filter(p => p.traded).length, 0);

        const shareReleased = async () => {
          const el = document.getElementById("tb-released-grid");
          if (!el) return;
          try {
            const h2c = await (html2canvasPromise || import("html2canvas").then(m => m.default));
            const canvas = await h2c(el, {
              backgroundColor: "#080808",
              scale: 2,
              useCORS: true,
              logging: false,
            });
            canvas.toBlob(async (blob) => {
              if (!blob) return;
              const file = new File([blob], "released-players.png", { type: "image/png" });
              if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: "Released Players" });
              } else {
                // Fallback: download
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "released-players.png";
                a.click();
              }
            }, "image/png");
          } catch(e) {
            console.error("Screenshot failed:", e);
          }
        };

        return (
          <div style={{marginTop:16,animation:"tb-fadeUp 0.4s ease both"}}>
            {/* Section header */}
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <div style={{background:T.danger,padding:"4px 16px 4px 12px",clipPath:"polygon(0 0,100% 0,calc(100% - 10px) 100%,0 100%)",display:"flex",alignItems:"center",gap:7}}>
                <span style={{fontSize:14}}>📤</span>
                <span style={{fontFamily:fonts.display,fontWeight:800,fontSize:15,color:"#fff",letterSpacing:3}}>RELEASED THIS WINDOW</span>
              </div>
              <div style={{flex:1,height:2,background:`linear-gradient(90deg,${T.danger}33,transparent)`}} />
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontFamily:fonts.display,fontSize:10,fontWeight:800,letterSpacing:1.5,color:T.danger,background:T.dangerBg,border:`1px solid ${T.danger}44`,padding:"3px 10px",clipPath:"polygon(5px 0%,100% 0%,calc(100% - 5px) 100%,0% 100%)"}}>
                  {totalAvailable} IN POOL
                </span>
                {totalTraded > 0 && (
                  <span style={{fontFamily:fonts.display,fontSize:10,fontWeight:800,letterSpacing:1.5,color:T.info,background:"#4F8EF711",border:"1px solid #4F8EF733",padding:"3px 10px",clipPath:"polygon(5px 0%,100% 0%,calc(100% - 5px) 100%,0% 100%)"}}>
                    {totalTraded} TRADED
                  </span>
                )}
                <button onClick={shareReleased}
                  style={{background:"#25D366",border:"none",borderRadius:0,clipPath:"polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)",padding:"5px 14px",cursor:"pointer",fontFamily:fonts.display,fontWeight:800,fontSize:11,letterSpacing:1.5,color:"#050F05",filter:"drop-shadow(2px 2px 0 #0A5020)",display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
                  📲 SHARE
                </button>
              </div>
            </div>

            {/* Team grid — captured as image */}
            <div id="tb-released-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10,padding:12,background:"#080808"}}>
              {teamGroups.map(({team, players:relPlayers}) => {
                const allTraded = relPlayers.every(p => p.traded);
                return (
                  <div key={team.id} style={{
                    background: allTraded ? T.bg : T.card,
                    border:`2px solid ${allTraded ? T.border : team.color+"55"}`,
                    borderTop:`3px solid ${allTraded ? T.border : team.color}`,
                    borderRadius:0,
                    padding:"12px 14px",
                    opacity: allTraded ? 0.6 : 1,
                    transition:"all 0.2s",
                    boxShadow: allTraded ? "none" : `0 2px 12px ${team.color}18`,
                  }}>
                    {/* Team name row */}
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                      <div style={{display:"flex",alignItems:"center",gap:7}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:team.color,boxShadow:`0 0 8px ${team.color}`,flexShrink:0}} />
                        <span style={{fontFamily:fonts.display,fontWeight:800,fontSize:13,color:team.color,letterSpacing:1,textTransform:"uppercase"}}>{team.name}</span>
                      </div>
                      <span style={{fontFamily:fonts.display,fontSize:10,fontWeight:700,letterSpacing:1,color:allTraded?T.muted:T.muted}}>
                        {relPlayers.length} RELEASED
                      </span>
                    </div>

                    {/* Player list */}
                    <div style={{display:"flex",flexDirection:"column",gap:5}}>
                      {relPlayers.map(p => (
                        <div key={p.id} style={{
                          display:"flex",alignItems:"center",gap:7,
                          padding:"7px 10px",
                          background: p.traded ? "#080C14" : team.color+"0D",
                          border:`1px solid ${p.traded ? T.border : team.color+"33"}`,
                          borderLeft:`3px solid ${p.traded ? T.border : team.color}`,
                          borderRadius:0,
                        }}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                              <span style={{fontFamily:fonts.display,fontWeight:700,fontSize:13,color:p.traded?T.muted:T.text,textDecoration:p.traded?"line-through":"none",letterSpacing:0.3}}>
                                {p.name}
                              </span>
                              <TierBadge tier={p.tier} />
                            </div>
                            <div style={{fontSize:10,color:T.muted,marginTop:1}}>{p.iplTeam} · {p.role}</div>
                          </div>
                          {p.traded ? (
                            <span style={{fontFamily:fonts.display,fontSize:9,fontWeight:800,letterSpacing:1,color:T.info,background:"#4F8EF711",border:"1px solid #4F8EF733",padding:"2px 7px",flexShrink:0,clipPath:"polygon(3px 0%,100% 0%,calc(100% - 3px) 100%,0% 100%)"}}>TRADED</span>
                          ) : (
                            <span style={{fontFamily:fonts.display,fontSize:9,fontWeight:800,letterSpacing:1,color:T.danger,background:T.dangerBg,border:`1px solid ${T.danger}44`,padding:"2px 7px",flexShrink:0,clipPath:"polygon(3px 0%,100% 0%,calc(100% - 3px) 100%,0% 100%)",animation:"tb-pulse 2s ease infinite"}}>FREE</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* RELEASE PHASE */}
      {phase === "release" && (
        <div style={{marginBottom:20}}>
          <div style={{fontFamily:fonts.display,fontSize:18,fontWeight:700,color:T.accent,letterSpacing:2,marginBottom:6}}>
            📤 RELEASE PHASE
          </div>
          <div style={{fontSize:12,color:T.muted,marginBottom:16}}>
            Window closes {pitchConfig?.transferEnd || "Monday 11:00 AM IST"}. You can change selections until then.
          </div>

          {sortedTeams.map(team => {
            const isMe = team.id === myTeamId;
            // Each team can edit their own releases freely — no lock needed
            // Admin (unlocked) sees all teams; non-admin only sees their own
            const canEdit = isMe || sessionTeamId === team.id || unlocked;
            const canSee = isMe || sessionTeamId === team.id || unlocked;
            if (!canSee) return null;

            const teamPlayers = players.filter(p => assignments[p.id] === team.id);
            const released = transfers?.releases?.[team.id] || [];
            const allReleased = released.length;

            return (
              <div key={team.id} style={{background:T.card,borderRadius:0,border:"1px solid "+(isMe?team.color+"66":team.color+"22"),borderLeft:"4px solid "+(isMe?team.color:team.color+"44"),padding:16,marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{fontFamily:fonts.display,fontWeight:700,fontSize:16,color:team.color}}>{team.name}</div>
                    {isMe && <span style={{fontSize:10,background:team.color+"22",color:team.color,border:"1px solid "+team.color+"44",borderRadius:0,clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)",padding:"2px 8px",fontWeight:700,letterSpacing:1}}>YOUR TEAM</span>}
                  </div>
                  <div style={{fontSize:12,color:allReleased===3?"#2ECC71":"#F5A623",fontWeight:700,background:allReleased===3?"#2ECC7111":"#F5A62311",padding:"3px 10px",borderRadius:0,clipPath:"polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)",border:"1px solid "+(allReleased===3?"#2ECC7133":"#F5A62333")}}>
                    {allReleased}/3 released
                  </div>
                </div>

                {/* Instruction for own team */}
                {isMe && (
                  <div style={{fontSize:12,color:T.muted,marginBottom:10,background:"#F5A62308",border:"1px solid #F5A62322",borderLeft:"3px solid #F5A62366",borderRadius:0,padding:"7px 12px"}}>
                    Tap <strong style={{color:T.accent}}>RELEASE</strong> to add a player to the pool. Tap <strong style={{color:T.danger}}>UNDO</strong> to take them back. You can change until the window closes.
                  </div>
                )}

                <div style={{display:"grid",gridTemplateColumns:"repeat(4, 1fr)",gap:8}}>
                  {teamPlayers.map(p => {
                    const isReleased = released.includes(p.id);
                    const pTotal = Object.values(points[p.id] || {}).reduce((s, m) => s + (m.base || 0), 0);
                    const canRelease = !ruledOut.includes(p.id) && !isPlayerSafe(p.id) && canEdit;
                    
                    return (
                      <div key={p.id} style={{position:"relative"}}>
                        <PlayerCard
                          player={p}
                          isSelected={isReleased}
                          canClick={canRelease}
                          onClick={() => canRelease && handleRelease(team.id, p.id)}
                          selectionColor={team.color}
                          showPoints={true}
                          points={pTotal}
                          height={250}
                        />
                        {ruledOut.includes(p.id) && (
                          <div style={{position:"absolute",top:8,left:8,background:"#FF3D5A",borderRadius:6,padding:"4px 8px",fontSize:9,fontWeight:800,color:"#FFF",zIndex:3,boxShadow:"0 2px 6px rgba(0,0,0,0.4)"}}>
                            🚫 RULED OUT
                          </div>
                        )}
                        {isPlayerSafe(p.id) && !ruledOut.includes(p.id) && (
                          <div style={{position:"absolute",top:8,left:8,background:T.success,borderRadius:6,padding:"4px 8px",fontSize:9,fontWeight:800,color:"#FFF",zIndex:3,boxShadow:"0 2px 6px rgba(0,0,0,0.4)"}}>
                            🛡 SAFE
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {teamPlayers.length === 0 && (
                    <div style={{gridColumn:"1 / -1",fontSize:12,color:T.muted,textAlign:"center",padding:32}}>No players in squad</div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Admin without myTeam: show team picker — only during release phase */}
          {!myTeamId && isAdmin && phase === "release" && (
            <div style={{background:T.accentBg,borderRadius:0,borderLeft:`3px solid ${T.accent}`,border:`1px solid ${T.accentBorder}`,padding:16,marginBottom:12}}>
              <div style={{fontSize:11,color:T.accent,letterSpacing:2,fontWeight:700,marginBottom:8}}>🔑 WHICH TEAM ARE YOU MANAGING?</div>
              <div style={{fontSize:12,color:T.muted,marginBottom:10}}>You're logged in as admin. Select your team to manage releases.</div>
              <select onChange={e=>setSessionTeamId(e.target.value)} defaultValue=""
                style={{width:"100%",background:T.card,border:`1px solid ${T.accentBorder}`,borderLeft:`3px solid ${T.accent}`,borderRadius:0,padding:"10px 14px",color:T.text,fontSize:14,fontFamily:fonts.body}}>
                <option value="">-- Select your team --</option>
                {sortedTeams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {/* TRADE PHASE */}
      {(phase === "trade" || phase === "done") && (
        <div>

          {/* Current pick timer */}
          {phase === "trade" && currentPickTeam && (
            <div style={{background:T.card,borderRadius:0,borderLeft:"4px solid "+currentPickTeam.color,border:"1px solid "+currentPickTeam.color+"44",padding:20,marginBottom:16,textAlign:"center"}}>
              <div style={{fontSize:11,color:T.muted,letterSpacing:2,marginBottom:4}}>NOW PICKING</div>
              <div style={{fontFamily:fonts.display,fontSize:24,fontWeight:700,color:currentPickTeam.color,marginBottom:12,letterSpacing:1}}>
                {currentPickTeam.name} {isMyTurn ? "— YOUR TURN 🎯" : ""}
              </div>
              {transfers.pickDeadline && <Timer deadline={transfers.pickDeadline} label="TO MAKE A PICK"
                onExpire={() => {}}
              />}
              {transfers.msPerPick && (
                <div style={{fontSize:11,color:T.muted,marginTop:8}}>
                  ⏱ {Math.round(transfers.msPerPick/60000)} min per pick
                  {transfers.matchStartTime && ` · Match at ${new Date(transfers.matchStartTime).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}`}
                </div>
              )}
            </div>
          )}

          {phase === "done" && (
            <div style={{background:"#2ECC7111",border:`1px solid ${T.success}33`,borderLeft:`3px solid ${T.success}`,borderRadius:0,padding:16,marginBottom:16,textAlign:"center"}}>
              <div style={{fontFamily:fonts.display,fontSize:20,fontWeight:700,color:T.success}}>✅ TRADE PHASE COMPLETE</div>
              <div style={{fontSize:12,color:T.muted,marginTop:4}}>All trades finalised for Week {transfers.weekNum}</div>
            </div>
          )}

          {/* ── LIVE TRACK ──────────────────────────────────────────────── */}
          <div style={{background:T.card,borderRadius:0,border:`1px solid ${T.border}`,borderTop:`3px solid ${T.accent}`,padding:20,marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
              <div style={{background:T.accent,padding:"4px 16px 4px 12px",clipPath:"polygon(0 0,100% 0,calc(100% - 10px) 100%,0 100%)",display:"flex",alignItems:"center",gap:7}}>
                <span style={{fontSize:13}}>📡</span>
                <span style={{fontFamily:fonts.display,fontWeight:800,fontSize:14,color:T.bg,letterSpacing:3}}>LIVE TRADE TRACK</span>
              </div>
              <div style={{flex:1,height:2,background:`linear-gradient(90deg,${T.accent}33,transparent)`}} />
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
            {sortedTeams.map(team => {
              const released = getReleasedPlayers(team.id);
              if (released.length === 0) return null;
              const pairs = getTradedPairs(team.id);
              const tradedCount = pairs.length;
              const totalCount = released.length;
              const allDone = tradedCount === totalCount;
              return (
                <div key={team.id} style={{background:T.bg,border:`1px solid ${team.color}33`,borderTop:`3px solid ${allDone?T.success:team.color}`,overflow:"hidden"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:team.color+"11",borderBottom:`1px solid ${team.color}22`}}>
                    <div style={{display:"flex",alignItems:"center",gap:7}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:team.color,boxShadow:`0 0 8px ${team.color}`}} />
                      <span style={{fontFamily:fonts.display,fontWeight:800,fontSize:13,color:team.color,letterSpacing:1}}>{team.name}</span>
                    </div>
                    <div style={{fontFamily:fonts.display,fontSize:10,fontWeight:800,letterSpacing:1,padding:"2px 8px",clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)",background:allDone?"#2ECC7122":team.color+"22",color:allDone?T.success:team.color,border:`1px solid ${allDone?T.success+"44":team.color+"44"}`}}>
                      {tradedCount}/{totalCount} TRADED
                    </div>
                  </div>
                  <div style={{padding:"10px 14px",display:"flex",flexDirection:"column",gap:8}}>
                    {released.map(p => {
                      const pair = pairs.find(pr => pr.releasedPid === p.id);
                      const incoming = pair ? players.find(x => x.id === pair.pickedPid) : null;
                      const isIneligible = (transfers.ineligible||[]).includes(p.id);
                      const takenByTeam = p.pickedByOther ? teams.find(t =>
                        (transfers.tradedPairs||[]).some(tp => tp.pickedPid === p.id && tp.teamId === t.id)
                      ) : null;
                      return (
                        <div key={p.id} style={{display:"grid",gridTemplateColumns:"1fr 24px 1fr",alignItems:"center",gap:4,opacity:p.pickedByOther?0.5:1}}>
                          <div style={{background:T.dangerBg,border:`1px solid ${T.danger}22`,borderLeft:`2px solid ${T.danger}`,padding:"6px 8px",minWidth:0}}>
                            <div style={{fontSize:9,color:T.danger,letterSpacing:1,fontWeight:700,marginBottom:2}}>OUT</div>
                            <div style={{fontFamily:fonts.display,fontWeight:700,fontSize:12,color:T.danger,textDecoration:"line-through",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
                            <div style={{display:"flex",alignItems:"center",gap:4,marginTop:2}}>
                              <TierBadge tier={p.tier} />
                              <span style={{fontSize:9,color:T.muted}}>{p.role}</span>
                            </div>
                          </div>
                          <div style={{textAlign:"center",fontSize:14,color:incoming?T.success:T.muted}}>{incoming?"⇄":"→"}</div>
                          {incoming ? (
                            <div style={{background:"#2ECC7111",border:`1px solid ${T.success}22`,borderLeft:`2px solid ${T.success}`,padding:"6px 8px",minWidth:0}}>
                              <div style={{fontSize:9,color:T.success,letterSpacing:1,fontWeight:700,marginBottom:2}}>IN</div>
                              <div style={{fontFamily:fonts.display,fontWeight:700,fontSize:12,color:T.success,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{incoming.name}</div>
                              <div style={{display:"flex",alignItems:"center",gap:4,marginTop:2}}>
                                <TierBadge tier={incoming.tier} />
                                <span style={{fontSize:9,color:T.muted}}>{incoming.role}</span>
                              </div>
                            </div>
                          ) : takenByTeam ? (
                            <div style={{background:"#4A5E7811",border:"1px solid #4A5E7833",padding:"6px 8px"}}>
                              <div style={{fontSize:9,color:T.muted,letterSpacing:1,fontWeight:700,marginBottom:2}}>TAKEN</div>
                              <div style={{fontSize:11,color:takenByTeam.color,fontWeight:700}}>by {takenByTeam.name}</div>
                            </div>
                          ) : isIneligible || phase==="done" || !currentPickTeamId ? (
                            <div style={{background:"#4A5E7811",border:"1px solid #4A5E7833",padding:"6px 8px"}}>
                              <div style={{fontSize:9,color:T.muted,letterSpacing:1,fontWeight:700,marginBottom:2}}>RETURNED</div>
                              <div style={{fontSize:11,color:T.muted}}>↩️ back to squad</div>
                            </div>
                          ) : (
                            <div style={{background:T.accentBg,border:`1px solid ${T.accentBorder}`,borderLeft:`2px solid ${T.accent}`,padding:"6px 8px"}}>
                              <div style={{fontSize:9,color:T.accent,letterSpacing:1,fontWeight:700,marginBottom:2}}>PENDING</div>
                              <div style={{fontSize:11,color:T.accent,animation:"pulse 1.5s ease infinite"}}>⏳ waiting…</div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            </div>
          </div>

          {/* ── POOL + MY RELEASES ───────────────────────────────────────── */}
          <div style={{display:"grid",gridTemplateColumns:"3fr 2fr",gap:16,marginBottom:16}}>

            {/* Unsold pool */}
            <div style={{background:T.card,borderRadius:0,border:`1px solid ${T.border}`,borderTop:`2px solid ${T.border}`,padding:14}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <div style={{fontSize:11,color:T.muted,letterSpacing:2,fontWeight:700}}>POOL ({sortedPool.length})</div>
                <input value={poolSearch} onChange={e=>setPoolSearch(e.target.value)} placeholder="Search..." style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:0,padding:"4px 8px",color:T.text,fontSize:11,fontFamily:fonts.body,outline:"none",width:110}} />
              </div>
              {sortedPool.length === 0 ? (
                <div style={{fontSize:12,color:T.muted,textAlign:"center",padding:16}}>Pool empty</div>
              ) : (() => {
                const filtered = sortedPool.filter(p => !poolSearch || p.name.toLowerCase().includes(poolSearch.toLowerCase()) || p.iplTeam?.toLowerCase().includes(poolSearch.toLowerCase()));
                const tierColors = {platinum:"#B0BEC5",gold:"#F5A623",silver:"#94A3B8",bronze:"#CD7F32","":"#4A5E78"};
                const tiers = ["platinum","gold","silver","bronze",""];
                return tiers.map(tier => {
                  const tierPlayers = filtered.filter(p => (p.tier||"") === tier);
                  if(tierPlayers.length === 0) return null;
                  return (
                    <React.Fragment key={tier}>
                      <div style={{fontSize:9,fontFamily:fonts.display,fontWeight:800,letterSpacing:2,color:tierColors[tier],background:tierColors[tier]+"11",padding:"3px 8px",marginBottom:4,marginTop:4,clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)"}}>{(tier||"UNRANKED").toUpperCase()} ({tierPlayers.length})</div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:8,marginBottom:8}}>
                        {tierPlayers.map(p => {
                          const canPickNow = (isMyTurn || unlocked) && phase==="trade" && !isPlayerSafe(p.id);
                          const pickAsTeam = isMyTurn ? myTeamId : currentPickTeamId;
                          const releasedByPickingTeam = (transfers?.releases?.[pickAsTeam]||[]).includes(p.id);
                          const valid = canPickNow && !releasedByPickingTeam ? getValidMatches(p, pickAsTeam) : [];
                          const canPick = valid.length > 0;
                          const isNewlyReleased = Object.values(transfers?.releases || {}).some(arr => arr.includes(p.id));
                          const releasedByTeam = isNewlyReleased ? teams.find(t => (transfers?.releases?.[t.id] || []).includes(p.id)) : null;
                          const pTotal = Object.values(points[p.id] || {}).reduce((s, m) => s + (m.base || 0), 0);
                          
                          return (
                            <div key={p.id} style={{position:"relative"}}>
                              <PlayerCard
                                player={p}
                                isSelected={false}
                                canClick={canPick}
                                onClick={() => canPick && handlePickClick(p)}
                                selectionColor={canPick ? "#2ECC71" : T.border}
                                showPoints={true}
                                points={pTotal}
                              />
                              {isPlayerSafe(p.id) && (
                                <div style={{position:"absolute",top:8,left:8,background:T.success,borderRadius:6,padding:"4px 8px",fontSize:9,fontWeight:800,color:"#FFF",zIndex:3,boxShadow:"0 2px 6px rgba(0,0,0,0.4)"}}>
                                  🛡 SAFE
                                </div>
                              )}
                              {isNewlyReleased && releasedByTeam && (
                                <div style={{position:"absolute",top:8,left:8,background:releasedByTeam.color,borderRadius:6,padding:"4px 8px",fontSize:9,fontWeight:800,color:"#FFF",zIndex:3,boxShadow:"0 2px 6px rgba(0,0,0,0.4)"}}>
                                  FROM {releasedByTeam.name.split(" ")[0].toUpperCase()}
                                </div>
                              )}
                              {canPick && (
                                <button onClick={() => handlePickClick(p)}
                                  style={{position:"absolute",top:8,right:8,background:"#2ECC71",border:"none",padding:"4px 10px",color:"#050F05",fontSize:10,fontWeight:800,cursor:"pointer",fontFamily:fonts.display,letterSpacing:2,clipPath:"polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)",textTransform:"uppercase",filter:"drop-shadow(2px 2px 0 #0A5020)",zIndex:3}}>
                                  PICK
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </React.Fragment>
                  );
                });
              })()}
            </div>

            {/* My released players */}
            <div style={{background:T.card,borderRadius:0,border:`1px solid ${T.border}`,borderTop:`2px solid ${T.border}`,padding:14}}>
              <div style={{fontSize:11,color:T.muted,letterSpacing:2,fontWeight:700,marginBottom:10}}>
                {myTeamId ? "MY RELEASED" : "ALL RELEASES"}
              </div>
              {sortedTeams.map(team => {
                const show = myTeamId ? team.id === myTeamId : true;
                if (!show && !unlocked) return null;
                const released = getReleasedPlayers(team.id);
                const pairs = getTradedPairs(team.id);
                if (released.length === 0) return null;
                return (
                  <div key={team.id} style={{marginBottom:10}}>
                    {(!myTeamId || unlocked) && <div style={{fontSize:11,color:team.color,fontWeight:700,marginBottom:4}}>{team.name}</div>}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:6}}>
                      {released.map(p => {
                        const traded = pairs.find(pr => pr.releasedPid === p.id);
                        const ineligible = (transfers.ineligible||[]).includes(p.id);
                        const pTotal = Object.values(points[p.id] || {}).reduce((s, m) => s + (m.base || 0), 0);
                        
                        return (
                          <div key={p.id} style={{position:"relative",opacity:traded||p.pickedByOther?0.6:1}}>
                            <PlayerCard
                              player={p}
                              isSelected={false}
                              canClick={false}
                              onClick={undefined}
                              selectionColor={team.color}
                              showPoints={true}
                              points={pTotal}
                            />
                            {traded && (
                              <div style={{position:"absolute",top:8,left:8,background:"#2ECC71",borderRadius:6,padding:"4px 8px",fontSize:9,fontWeight:800,color:"#FFF",zIndex:3,boxShadow:"0 2px 6px rgba(0,0,0,0.4)"}}>
                                ✅ TRADED
                              </div>
                            )}
                            {p.pickedByOther && !traded && (
                              <div style={{position:"absolute",top:8,left:8,background:"#FF3D5A",borderRadius:6,padding:"4px 8px",fontSize:9,fontWeight:800,color:"#FFF",zIndex:3,boxShadow:"0 2px 6px rgba(0,0,0,0.4)"}}>
                                🚫 TAKEN
                              </div>
                            )}
                            {ineligible && !traded && !p.pickedByOther && (
                              <div style={{position:"absolute",top:8,left:8,background:"#4A5E78",borderRadius:6,padding:"4px 8px",fontSize:9,fontWeight:800,color:"#FFF",zIndex:3,boxShadow:"0 2px 6px rgba(0,0,0,0.4)"}}>
                                ↩️ RETURNED
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* My turn actions */}
          {(isMyTurn || unlocked) && phase === "trade" && currentPickTeam && (
            <div style={{background:T.card,borderRadius:0,borderLeft:"4px solid "+(myReversalAlert?"#FF3D5A":"#F5A623"),border:"1px solid "+(myReversalAlert?"#FF3D5A44":"#F5A62344"),padding:16,marginBottom:16}}>
              <div style={{fontFamily:fonts.display,fontSize:18,fontWeight:700,color:myReversalAlert?"#FF3D5A":"#F5A623",marginBottom:6}}>{myReversalAlert?"⚠️ RE-PICK REQUIRED":"🎯 YOUR TURN"}</div>
              {myReversalAlert && (
                <div style={{background:T.dangerBg,border:`1px solid ${T.danger}33`,borderLeft:`3px solid ${T.danger}`,borderRadius:0,padding:"8px 12px",marginBottom:10,fontSize:12,color:T.danger}}>
                  <strong>{myReversalAlert.returnedPlayerName}</strong> returned to {myReversalAlert.returnedToTeam}. Pick another player or pass.
                </div>
              )}
              <div style={{fontSize:12,color:T.muted,marginBottom:12}}>
                Pick a player from the pool (highlighted green). Must be same role and same/lower tier as a player you released.
              </div>
              {canPass(myTeamId || currentPickTeamId) ? (
                <button onClick={handlePass}
                  style={{width:"100%",background:"#4A5E7822",border:"1px solid #4A5E78",borderRadius:0,clipPath:"polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)",padding:12,color:T.text,fontFamily:fonts.body,fontWeight:800,fontSize:14,cursor:"pointer",letterSpacing:0.5}}>
                  PASS — No valid players in pool (released players will return)
                </button>
              ) : (
                <div style={{fontSize:11,color:T.muted,textAlign:"center",padding:"8px 0"}}>
                  Valid picks exist in pool — PASS not allowed until pool is exhausted
                  {unlocked && (
                    <button onClick={handlePass}
                      style={{display:"block",width:"100%",marginTop:8,background:T.dangerBg,border:"1px dashed #FF3D5A44",borderRadius:0,padding:10,color:T.danger,fontFamily:fonts.body,fontWeight:700,fontSize:12,cursor:"pointer"}}>
                      ⚠️ ADMIN: FORCE PASS
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Trade summary */}
          <div style={{background:T.card,borderRadius:0,border:`1px solid ${T.border}`,borderTop:`2px solid ${T.border}`,padding:14}}>
            <div style={{fontSize:11,color:T.muted,letterSpacing:2,fontWeight:700,marginBottom:10}}>TRADE ORDER</div>
            {pickOrder.map((team, idx) => {
              const released = getReleasedPlayers(team.id);
              const pairs = getTradedPairs(team.id);
              const isCurrent = team.id === currentPickTeamId;
              return (
                <div key={team.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:isCurrent?team.color+"11":"transparent",borderRadius:0,borderLeft:isCurrent?"3px solid "+team.color:"3px solid transparent",marginBottom:4,border:isCurrent?"1px solid "+team.color+"33":"1px solid transparent"}}>
                  <div style={{fontFamily:fonts.display,fontSize:13,color:T.muted,minWidth:20}}>{idx+1}</div>
                  <div style={{flex:1}}>
                    <span style={{fontWeight:700,fontSize:13,color:isCurrent?team.color:T.text}}>{team.name}</span>
                    {isCurrent && <span style={{fontSize:10,color:team.color,marginLeft:6,fontWeight:700}}>← PICKING NOW</span>}
                  </div>
                  <div style={{fontSize:11,color:T.muted}}>{pairs.length}/{released.length} traded</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* REVERSAL ALERT MODAL */}
      {showReversalAlert && myReversalAlert && (
        <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.97)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:900,padding:16}}>
          <div style={{background:T.card,borderRadius:0,clipPath:"polygon(0 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) 100%,0 100%)",border:"1px solid #F5A62366",borderTop:"3px solid #F5A623",padding:24,width:"100%",maxWidth:400}}>
            <div style={{fontSize:32,textAlign:"center",marginBottom:8}}>⚠️</div>
            <div style={{fontFamily:fonts.display,fontSize:20,fontWeight:700,color:T.accent,textAlign:"center",letterSpacing:1,marginBottom:8}}>
              TRADE REVERSED
            </div>
            <div style={{background:T.dangerBg,border:`1px solid ${T.danger}33`,borderLeft:`3px solid ${T.danger}`,borderRadius:0,padding:"12px 16px",marginBottom:16,textAlign:"center"}}>
              <div style={{fontWeight:700,fontSize:16,color:T.danger,marginBottom:4}}>
                ⬇️ {myReversalAlert.returnedPlayerName}
              </div>
              <div style={{fontSize:12,color:T.muted}}>
                has returned to <strong style={{color:T.text}}>{myReversalAlert.returnedToTeam}</strong> — this player is no longer available.
              </div>
            </div>
            <div style={{fontSize:13,color:T.muted,textAlign:"center",marginBottom:20}}>
              Please choose another eligible player from the pool, or press PASS if no valid options remain.
            </div>
            <button onClick={()=>{
              setShowReversalAlert(false);
              // Clear just this team's alert
              const cleared = (transfers.reversalAlert||[]).filter(a=>a.teamId!==effectiveTeamId);
              onUpdateTransfers({...transfers, reversalAlert: cleared.length>0?cleared:null});
            }}
              style={{width:"100%",background:`linear-gradient(90deg,${T.accent},#FF8C00)`,border:"none",borderRadius:0,clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)",padding:13,color:"#0A0E14",fontFamily:fonts.display,fontWeight:900,fontSize:15,cursor:"pointer",letterSpacing:2,filter:`drop-shadow(0 4px 12px ${T.accent}55)`}}>
              GOT IT — LET ME RE-PICK
            </button>
          </div>
        </div>
      )}

      {/* CONFIRM MODAL */}
      {confirmModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.95)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:800,padding:16}}>
          <div style={{background:T.card,borderRadius:0,clipPath:"polygon(0 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) 100%,0 100%)",border:`1px solid ${confirmModal.onConfirm ? T.danger+"44" : T.success+"44"}`,borderTop:`3px solid ${confirmModal.onConfirm ? T.danger : T.success}`,padding:24,width:"100%",maxWidth:380}}>
            <div style={{fontSize:22,marginBottom:12}}>{confirmModal.onConfirm ? "⚠️" : "✅"}</div>
            <div style={{fontFamily:fonts.display,fontSize:18,fontWeight:700,color:confirmModal.onConfirm ? T.danger : T.success,marginBottom:12}}>{confirmModal.message}</div>
            <div style={{display:"flex",gap:8}}>
              {confirmModal.onConfirm ? (
                <>
                  <button onClick={()=>setConfirmModal(null)}
                    style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:0,clipPath:"polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)",padding:11,color:T.muted,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>
                    CANCEL
                  </button>
                  <button onClick={()=>{confirmModal.onConfirm();setConfirmModal(null);}}
                    style={{flex:1,background:T.dangerBg,border:"1px solid #FF3D5A",borderRadius:0,clipPath:"polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)",padding:11,color:T.danger,fontFamily:fonts.body,fontWeight:800,fontSize:14,cursor:"pointer"}}>
                    CONFIRM
                  </button>
                </>
              ) : (
                <button onClick={()=>setConfirmModal(null)}
                  style={{flex:1,background:"#2ECC7122",border:"1px solid #2ECC7144",borderRadius:0,clipPath:"polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)",padding:11,color:T.success,fontFamily:fonts.body,fontWeight:800,fontSize:14,cursor:"pointer"}}>
                  OK
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PICK MODAL — choose which released player to swap */}
      {pickModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.97)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500,padding:16}}>
          <div style={{background:T.card,borderRadius:0,clipPath:"polygon(0 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) 100%,0 100%)",border:`1px solid ${T.border}`,borderTop:`3px solid ${T.accent}`,padding:24,width:"100%",maxWidth:440}}>
            <div style={{fontFamily:fonts.display,fontSize:20,fontWeight:700,color:T.success,letterSpacing:2,marginBottom:4}}>PICK PLAYER</div>
            <div style={{fontSize:12,color:T.muted,marginBottom:6}}>
              Incoming: <strong style={{color:T.text}}>{pickModal.poolPlayer.name}</strong>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6,background:"#2ECC7111",border:`1px solid ${T.success}33`,borderLeft:`3px solid ${T.success}`,borderRadius:0,padding:"10px 14px",marginBottom:20}}>
              <span style={{fontSize:18}}>⬆️</span>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontWeight:700,color:T.success,fontSize:14}}>{pickModal.poolPlayer.name}</span>
                  <TierBadge tier={pickModal.poolPlayer.tier} />
                </div>
                <div style={{fontSize:11,color:T.muted}}>{pickModal.poolPlayer.role} • points reset to 0 • earns from next match</div>
              </div>
            </div>
            <div style={{fontSize:12,color:T.muted,marginBottom:10}}>Select which of your released players goes out for them:</div>
            {pickModal.validMatches.map(rp => (
              <button key={rp.id} onClick={() => confirmTrade(pickModal.poolPlayer, rp)}
                style={{width:"100%",background:T.dangerBg,border:`1px solid ${T.danger}44`,borderLeft:`3px solid ${T.danger}`,borderRadius:0,padding:12,marginBottom:8,cursor:"pointer",display:"flex",alignItems:"center",gap:10,textAlign:"left",fontFamily:fonts.body}}>
                <span style={{fontSize:16}}>⬇️</span>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontWeight:700,fontSize:14,color:T.danger}}>{rp.name}</span>
                    <TierBadge tier={rp.tier} />
                  </div>
                  <div style={{fontSize:11,color:T.muted}}>{rp.role} • points frozen at current total</div>
                </div>
              </button>
            ))}
            <button onClick={() => setPickModal(null)}
              style={{width:"100%",background:"transparent",border:`1px solid ${T.border}`,borderRadius:0,padding:10,color:T.muted,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer",marginTop:4}}>
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* FINAL CONFIRM MODAL */}
      {tradeConfirmModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.97)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:600,padding:16}}>
          <div style={{background:T.card,borderRadius:0,clipPath:"polygon(0 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) 100%,0 100%)",border:`1px solid ${T.border}`,borderTop:`3px solid ${T.accent}`,padding:24,width:"100%",maxWidth:400}}>
            <div style={{fontFamily:fonts.display,fontSize:20,fontWeight:700,color:T.accent,letterSpacing:2,marginBottom:16}}>CONFIRM TRADE</div>

            <div style={{background:"#2ECC7111",border:`1px solid ${T.success}33`,borderLeft:`3px solid ${T.success}`,borderRadius:0,padding:14,marginBottom:10,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:20}}>⬆️</span>
              <div>
                <div style={{fontSize:10,color:T.success,letterSpacing:1,marginBottom:2}}>JOINING YOUR SQUAD</div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontWeight:700,color:T.success,fontSize:15}}>{tradeConfirmModal.poolPlayer.name}</span>
                  <TierBadge tier={tradeConfirmModal.poolPlayer.tier} />
                </div>
                <div style={{fontSize:11,color:T.muted}}>{tradeConfirmModal.poolPlayer.role} • Points reset to 0 • earns from next match only</div>
              </div>
            </div>

            <div style={{background:T.dangerBg,border:`1px solid ${T.danger}33`,borderLeft:`3px solid ${T.danger}`,borderRadius:0,padding:14,marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:20}}>⬇️</span>
              <div>
                <div style={{fontSize:10,color:T.danger,letterSpacing:1,marginBottom:2}}>LEAVING YOUR SQUAD</div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontWeight:700,color:T.danger,fontSize:15}}>{tradeConfirmModal.releasedPlayer.name}</span>
                  <TierBadge tier={tradeConfirmModal.releasedPlayer.tier} />
                </div>
                <div style={{fontSize:11,color:T.muted}}>{tradeConfirmModal.releasedPlayer.role} • Points frozen at current total • stays visible with ⬇️</div>
              </div>
            </div>

            <div style={{background:T.accentBg,border:`1px solid ${T.accentBorder}`,borderLeft:`3px solid ${T.accent}`,borderRadius:0,padding:"10px 14px",marginBottom:16,fontSize:12,color:T.accent,textAlign:"center",fontWeight:700}}>
              ⚠️ This trade is permanent and cannot be undone this window
            </div>

            <div style={{display:"flex",gap:8}}>
              <button onClick={() => setTradeConfirmModal(null)}
                style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:0,clipPath:"polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)",padding:11,color:T.muted,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
              <button onClick={executeTrade}
                style={{flex:2,background:`linear-gradient(90deg,${T.accent},#FF8C00)`,border:"none",borderRadius:0,clipPath:"polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)",padding:11,color:"#0A0E14",fontFamily:fonts.display,fontWeight:900,fontSize:14,cursor:"pointer",letterSpacing:2}}>
                ✅ CONFIRM TRADE
              </button>
            </div>
          </div>
        </div>
      )}
  </>}
    </div>
  );
}

function TransferHistory({ transfers, players, teams }) {
  const currentWeek = transfers.weekNum || 1;
  const [expandedWeeks, setExpandedWeeks] = React.useState(new Set([0])); // First week expanded by default
  const getPlayer = (pid) => players.find(p => p.id === pid);
  const getTeam   = (tid) => teams.find(t => t.id === tid);

  // Include current week trades if any exist (even before archiving)
  const currentTrades = transfers.tradedPairs || [];
  const currentReleases = transfers.releases || {};
  const hasCurrentActivity = currentTrades.length > 0 || Object.values(currentReleases).some(r => r.length > 0);

  const currentWeekEntry = hasCurrentActivity ? [{
    week: currentWeek,
    tradedPairs: currentTrades,
    releases: currentReleases,
    returnedPlayers: [],
    isCurrent: true,
  }] : [];

  const history = [...currentWeekEntry, ...[...(transfers.history || [])].reverse()]
    .filter(w => (w.tradedPairs || []).length > 0); // only show weeks with actual trades

  if (history.length === 0) {
    return (
      <div style={{textAlign:"center",padding:"60px 20px",background:T.card,borderRadius:0,border:`1px solid ${T.border}`,borderTop:`2px solid ${T.border}`}}>
        <div style={{fontSize:48,marginBottom:12}}>📜</div>
        <div style={{fontFamily:fonts.display,fontSize:20,fontWeight:700,color:T.muted,letterSpacing:2}}>NO HISTORY YET</div>
        <div style={{fontSize:13,color:T.muted,marginTop:6}}>Completed transfer windows will appear here.</div>
      </div>
    );
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {history.map((week, wi) => {
        const weekNum = week.week || (currentWeek - history.length + wi + (history.length - wi - 1));
        const date = week.date ? new Date(week.date).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}) : "";
        const pairs = week.tradedPairs || [];
        const releases = week.releases || {};

        // Group by team
        const teamIds = [...new Set([
          ...pairs.map(p => p.teamId),
          ...Object.keys(releases)
        ])];

        const hadActivity = teamIds.some(tid => {
          const teamPairs = pairs.filter(p=>p.teamId===tid);
          const teamReleases = releases[tid]||[];
          return teamPairs.length > 0 || teamReleases.length > 0;
        });

        return (
  <div key={wi} style={{background:T.card,borderRadius:0,border:`2px solid ${week.isCurrent?T.accent:T.border}`,overflow:"hidden",boxShadow:week.isCurrent?"3px 3px 0 "+T.accent+"44":"none"}}>
    {/* Week header - CLICKABLE */}
    <div 
      onClick={() => {
        const newExpanded = new Set(expandedWeeks);
        if (newExpanded.has(wi)) {
          newExpanded.delete(wi);
        } else {
          newExpanded.add(wi);
        }
        setExpandedWeeks(newExpanded);
      }}
      style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",borderBottom:expandedWeeks.has(wi)?`2px solid ${week.isCurrent?T.accent:T.border}`:"none",background:T.bg,cursor:"pointer"}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{background:week.isCurrent?T.accent:T.accentBg,border:`1px solid ${week.isCurrent?T.accent:T.accentBorder}`,borderRadius:0,padding:"6px 14px",fontFamily:fonts.display,fontWeight:900,fontSize:20,color:week.isCurrent?T.bg:T.accent,clipPath:"polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)",filter:week.isCurrent?"drop-shadow(2px 2px 0 #8B4500)":"none"}}>
          W{weekNum}{week.isCurrent ? " 🔴" : ""}
        </div>
        <div>
          <div style={{fontFamily:fonts.display,fontWeight:800,fontSize:16,color:T.text,letterSpacing:2,textTransform:"uppercase"}}>
            WEEK {weekNum} TRANSFERS
          </div>
          {date && <div style={{fontSize:11,color:T.muted,marginTop:2,fontFamily:fonts.body}}>{date}</div>}
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{fontSize:12,color:T.muted,fontWeight:700,fontFamily:fonts.display,letterSpacing:1}}>
          {pairs.length} TRADE{pairs.length!==1?"S":""}
        </div>
        <span style={{color:T.accent,fontSize:20,fontFamily:fonts.display,fontWeight:700,lineHeight:1}}>
          {expandedWeeks.has(wi) ? "▲" : "▼"}
        </span>
      </div>
    </div>

    {/* Collapsible content */}
    {expandedWeeks.has(wi) && (
      <>
        {!hadActivity && (
          <div style={{padding:"16px 18px",fontSize:13,color:T.muted}}>No trades this window.</div>
        )}

        {/* Per-team breakdown */}
        {hadActivity && teamIds.map(tid => {
          const team = getTeam(tid);
          if (!team) return null;
          const teamPairs = pairs.filter(p=>p.teamId===tid);
          const teamReleases = releases[tid]||[];
          const tradedReleasedPids = new Set(teamPairs.map(p=>p.releasedPid));
          const returnedPids = week.isCurrent ? [] : teamReleases.filter(pid => !tradedReleasedPids.has(pid));

          if (teamPairs.length === 0 && returnedPids.length === 0) return null;

          return (
            <div key={tid} style={{padding:"14px 18px",borderBottom:`1px solid ${T.border}33`}}>
              {/* Team name */}
              <div style={{fontFamily:fonts.display,fontWeight:800,fontSize:14,color:team.color,letterSpacing:2,marginBottom:10,textTransform:"uppercase"}}>
                {team.name}
              </div>

              {/* Traded pairs */}
              {teamPairs.map((pr, i) => {
                const out = getPlayer(pr.releasedPid);
                const inn = getPlayer(pr.pickedPid);
                return (
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                    {/* Player out */}
                    <div style={{display:"flex",alignItems:"center",gap:6,background:T.dangerBg,border:`1px solid ${T.danger}33`,borderRadius:0,padding:"6px 12px",minWidth:0}}>
                      <span style={{fontSize:14}}>⬇️</span>
                      <div>
                        <div style={{fontWeight:700,fontSize:13,color:T.danger,textDecoration:"line-through"}}>{out?.name||pr.releasedPid}</div>
                        <div style={{fontSize:10,color:T.muted}}>{out?.role} • {out?.iplTeam}</div>
                      </div>
                    </div>
                    <span style={{color:T.muted,fontSize:18,fontWeight:300}}>→</span>
                    {/* Player in */}
                    <div style={{display:"flex",alignItems:"center",gap:6,background:"#2ECC7111",border:`1px solid ${T.success}33`,borderRadius:0,padding:"6px 12px",minWidth:0}}>
                      <span style={{fontSize:14}}>⬆️</span>
                      <div>
                        <div style={{fontWeight:700,fontSize:13,color:T.success}}>{inn?.name||pr.pickedPid}</div>
                        <div style={{fontSize:10,color:T.muted}}>{inn?.role} • {inn?.iplTeam}</div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Players who were released but returned (no trade) */}
              {returnedPids.length > 0 && (
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
                  {returnedPids.map(pid => {
                    const p = getPlayer(pid);
                    return (
                      <div key={pid} style={{display:"flex",alignItems:"center",gap:5,background:T.accentBg,border:`1px solid ${T.accentBorder}`,borderRadius:0,padding:"4px 10px"}}>
                        <span style={{fontSize:11}}>↩️</span>
                        <span style={{fontSize:12,color:T.accent,fontWeight:700}}>{p?.name||pid}</span>
                        <span style={{fontSize:10,color:T.muted}}>returned</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </>
    )}
  </div>
        );
      })}
    </div>
  );
}


function adminBtn(color) {
  return {
    background: color,
    border: "none",
    padding: "9px 28px",
    clipPath: "polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)",
    filter: `drop-shadow(3px 3px 0 ${color}88)`,
    color: color === "#FF3D5A" || color === "#A855F7" || color === "#4F8EF7" ? "#fff" : "#0F0800",
    fontFamily: fonts.display,
    fontWeight: 800,
    fontSize: 13,
    letterSpacing: 3,
    cursor: "pointer",
    textTransform: "uppercase",
  };
}
