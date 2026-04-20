import { T, fonts, FONT_URL } from "./Theme";
import React, { useState, useEffect, useCallback } from "react";

const SB_URL = "https://rmcxhorijitrhqyrvvkn.supabase.co/rest/v1/league_data";
const SB_KEY = "sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm";
const sbGet = async (key) => { try { const res = await fetch(SB_URL+"?key=eq."+encodeURIComponent(key), {headers:{"apikey":SB_KEY,"Authorization":"Bearer "+SB_KEY}}); const d=await res.json(); return d[0]?.value; } catch { return null; } };
const sbSet = async (key, value) => { try { await fetch(SB_URL, {method:"POST",headers:{"apikey":SB_KEY,"Authorization":"Bearer "+SB_KEY,"Content-Type":"application/json","Prefer":"resolution=merge-duplicates"},body:JSON.stringify({key,value,updated_at:new Date().toISOString()})}); } catch {} };

const TIER_ORDER = { platinum:4, gold:3, silver:2, bronze:1, "":0 };
const TIER_COLORS = { platinum:"#B0BEC5", gold:"#F5A623", silver:"#94A3B8", bronze:"#CD7F32", "":"#4A5E78" };
const TIER_BG = { platinum:"#4A5E7833", gold:"#F5A62322", silver:"#94A3B822", bronze:"#CD7F3222", "":"#1E2D4533" };
const TIER_BORDER = { platinum:"#4A5E7866", gold:"#F5A62366", silver:"#94A3B855", bronze:"#CD7F3255", "":"#1E2D45" };

function TierBadge({ tier }) {
  if (!tier) return null;
  return (
    <span style={{fontSize:9,fontWeight:800,letterSpacing:1,padding:"1px 5px",borderRadius:4,
      fontFamily:fonts.body,textTransform:"uppercase",
      background:TIER_BG[tier],border:"1px solid "+TIER_BORDER[tier],color:TIER_COLORS[tier]}}>
      {tier==="platinum"?"PLAT":tier==="gold"?"GOLD":tier==="silver"?"SILV":"BRNZ"}
    </span>
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
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const urgent = left < 300;
  return (
    <div style={{fontFamily:fonts.display,fontSize:32,fontWeight:700,
      color:left===0?"#4A5E78":urgent?"#FF3D5A":"#F5A623",textAlign:"center",letterSpacing:2}}>
      {left === 0 ? "OPENING..." : h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`}
      <div style={{fontSize:10,color:T.muted,letterSpacing:2,marginTop:2}}>{left===0?"JUST A SEC...":label}</div>
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
  onUpdateOwnershipLog, ownershipLog, points, onUpdatePoints,
  user, safePlayers, pitchConfig
}) {

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
    return afterStart || beforeEnd;
  };
  const [pickModal, setPickModal] = useState(null); // {poolPlayer}
  const [sessionTeamId, setSessionTeamId] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null); // {message, onConfirm}
  const [twTab, setTwTab] = useState("window"); // "window" | "history"
  const [showAutoOpenPrompt, setShowAutoOpenPrompt] = useState(false);
  const [showReversalAlert, setShowReversalAlert] = useState(false);
  const [tradeConfirmModal, setTradeConfirmModal] = useState(null); // {poolPlayer, releasedPlayer}
  const [resetConfirm, setResetConfirm] = useState(false);

  const rawPhase = transfers?.phase || "closed";
  const storedDeadline = transfers?.releaseDeadline;
  const calculatedDeadline = getNextTransferEndIST();
  // If stored deadline exists and passed — close. If no stored deadline, use calculated.
  const releaseDeadlinePassed = rawPhase === "release" && (
    storedDeadline ? new Date(storedDeadline) < new Date() : new Date(calculatedDeadline) < new Date()
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

  // ── AUTO WINDOW CHECK — prompt admin instead of auto-opening ──────────────
  useEffect(() => {
    const check = () => {
      if (!unlocked || phase !== "closed") { setShowAutoOpenPrompt(false); return; }
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const ist = new Date(now.getTime() + istOffset);
      const day = ist.getUTCDay(), h = ist.getUTCHours(), m = ist.getUTCMinutes();
      const afterStart = day === transferStart.day &&
        (h > transferStart.h || (h === transferStart.h && m >= transferStart.m));
      const beforeEnd = day === transferEnd.day &&
        (h < transferEnd.h || (h === transferEnd.h && m < transferEnd.m));
      const betweenDays = transferStart.day !== transferEnd.day && day !== transferStart.day && day !== transferEnd.day;
      const inWindow = afterStart || (betweenDays && beforeEnd);
      setShowAutoOpenPrompt(inWindow);
    };
    check();
    const interval = setInterval(check, 30000); // re-check every 30 seconds
    return () => clearInterval(interval);
  }, [unlocked, pitchConfig, phase]);

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

  const getTradedInPid = (releasedPid) => {
    const pair = (transfers?.tradedPairs || []).find(t => t.releasedPid === releasedPid);
    return pair ? players.find(p => p.id === pair.pickedPid) : null;
  };

  // Build pool: from unsoldPool but also exclude players already traded this window
  const tradedPickedPids = new Set((transfers?.tradedPairs || []).map(tp => tp.pickedPid));
  const poolPlayers = unsoldPool
    .filter(pid => !tradedPickedPids.has(pid))
    .map(pid => players.find(p => p.id === pid)).filter(Boolean);
  const sortedPool = [...poolPlayers].sort((a,b) =>
    (TIER_ORDER[b.tier||""] - TIER_ORDER[a.tier||""]) || a.name.localeCompare(b.name)
  );

  const getValidMatches = (poolPlayer, teamId) => {
    const released = getReleasedPlayers(teamId);
    const tradedPids = getTradedPairs(teamId).map(t => t.releasedPid);
    const remaining = released.filter(p => !tradedPids.includes(p.id));
    return remaining.filter(rp =>
      rp.role === poolPlayer.role &&
      TIER_ORDER[poolPlayer.tier||""] <= TIER_ORDER[rp.tier||""]
    );
  };

  const canPass = (teamId) => {
    const released = getReleasedPlayers(teamId);
    const tradedPids = getTradedPairs(teamId).map(t => t.releasedPid);
    const remaining = released.filter(p => !tradedPids.includes(p.id));
    if (remaining.length === 0) return false;
    for (const rp of remaining) {
      for (const pp of sortedPool) {
        if (pp.role === rp.role && TIER_ORDER[pp.tier||""] <= TIER_ORDER[rp.tier||""]) return false;
      }
    }
    return true;
  };

  const currentPickTeamId = transfers?.currentPickTeam;

  // After every trade — check if any released player now has no valid pool match
  // If so, immediately return it to its team and remove from pool
  React.useEffect(() => {
    if (phase !== "trade") return;
    const currentIneligible = new Set(transfers.ineligible || []);
    const newlyIneligible = [];

    teams.forEach(team => {
      const tradedPids = new Set(getTradedPairs(team.id).map(t => t.releasedPid));
      const releasedPids = transfers.releases?.[team.id] || [];

      releasedPids.forEach(pid => {
        if (tradedPids.has(pid)) return; // already traded ✅
        if (currentIneligible.has(pid)) return; // already returned
        // Check if this released player (in pool) has any valid match for THIS team
        const rp = players.find(p => p.id === pid);
        if (!rp) return;
        const hasMatch = poolPlayers.some(pp =>
          pp.id !== pid && // not itself
          pp.role === rp.role &&
          TIER_ORDER[pp.tier||""] <= TIER_ORDER[rp.tier||""]
        );
        if (!hasMatch) newlyIneligible.push({ pid, teamId: team.id });
      });
    });

    if (newlyIneligible.length === 0) return;

    // Return ineligible players to their teams
    const newAssignments = { ...assignments };
    const newPool = [...unsoldPool];
    const newIneligible = [...(transfers.ineligible || [])];

    newlyIneligible.forEach(({ pid, teamId }) => {
      newAssignments[pid] = teamId; // return to original team
      const idx = newPool.indexOf(pid);
      if (idx > -1) newPool.splice(idx, 1); // remove from pool
      newIneligible.push(pid);
    });

    // Check if current picking team now has nothing left
    const currentTeamPids = transfers.releases?.[currentPickTeamId] || [];
    const currentTeamTraded = new Set(getTradedPairs(currentPickTeamId).map(t => t.releasedPid));
    const currentTeamHasMore = currentTeamPids.some(pid =>
      !currentTeamTraded.has(pid) && !newIneligible.includes(pid)
    );

    const updatedTransfers = {
      ...transfers,
      ineligible: newIneligible,
    };

    if (!currentTeamHasMore && currentPickTeamId) {
      const nextTeam = getNextPickTeam(currentPickTeamId, transfers.tradedPairs);
      updatedTransfers.currentPickTeam = nextTeam || null;
      updatedTransfers.pickDeadline = nextTeam ? new Date(Date.now() + 45 * 60 * 1000).toISOString() : null;
      updatedTransfers.phase = nextTeam ? "trade" : "done";
    }

    onUpdateAssignments(newAssignments);
    onUpdateUnsoldPool(newPool);
    onUpdateTransfers(updatedTransfers);
  }, [phase, JSON.stringify(poolPlayers.map(p=>p.id)), JSON.stringify(transfers.tradedPairs)]);

  // Auto-return released players that have no valid replacement in pool
  // Runs whenever pool changes (after each trade)
  React.useEffect(() => {
    if (phase !== "trade") return;
    const currentIneligible = new Set(transfers.ineligible || []);
    const newlyIneligible = [];

    teams.forEach(team => {
      const released = getReleasedPlayers(team.id);
      const tradedPids = new Set(getTradedPairs(team.id).map(t => t.releasedPid));

      released.forEach(rp => {
        if (tradedPids.has(rp.id)) return; // already traded
        if (currentIneligible.has(rp.id)) return; // already returned
        if (rp.pickedByOther) return; // picked by another team — handled by reversal
        // Check if any valid pool player exists for this released player
        const hasMatch = poolPlayers.some(pp =>
          pp.role === rp.role && TIER_ORDER[pp.tier||""] <= TIER_ORDER[rp.tier||""]
        );
        if (!hasMatch) newlyIneligible.push({ teamId: team.id, pid: rp.id });
      });
    });

    if (newlyIneligible.length === 0) return;

    // Mark as ineligible and return to their teams
    const newAssignments = { ...assignments };
    const newPool = [...unsoldPool];
    newlyIneligible.forEach(({ teamId, pid }) => {
      newAssignments[pid] = teamId; // return to team
      const idx = newPool.indexOf(pid);
      if (idx > -1) newPool.splice(idx, 1); // remove from pool
    });

    const ineligible = [...currentIneligible, ...newlyIneligible.map(x => x.pid)];

    // Check if current picking team's turn should be skipped
    const nextTeam = getNextPickTeam(currentPickTeamId, transfers.tradedPairs || []);
    const currentTeamStillHasPicks = (() => {
      if (!currentPickTeamId) return false;
      const rel = getReleasedPlayers(currentPickTeamId);
      const traded = new Set(getTradedPairs(currentPickTeamId).map(t => t.releasedPid));
      return rel.some(p => !traded.has(p.id) && !ineligible.includes(p.id) && !p.pickedByOther);
    })();

    onUpdateAssignments(newAssignments);
    onUpdateUnsoldPool(newPool);
    onUpdateTransfers({
      ...transfers,
      ineligible,
      currentPickTeam: currentTeamStillHasPicks ? currentPickTeamId : nextTeam,
      pickDeadline: currentTeamStillHasPicks ? transfers.pickDeadline : (nextTeam ? new Date(Date.now() + 45 * 60 * 1000).toISOString() : null),
      phase: (!currentTeamStillHasPicks && !nextTeam) ? "done" : "trade",
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
    if (!isReleased) {
      // Adding to release — also add to unsold pool
      if (!unsoldPool.includes(pid)) onUpdateUnsoldPool([...unsoldPool, pid]);
    } else {
      // Undoing release — remove from unsold pool, player stays with team
      onUpdateUnsoldPool(unsoldPool.filter(id => id !== pid));
    }
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

    // Advance to next team
    const nextTeam = getNextPickTeam(tradeAsTeamId, tradedPairs);
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

    onUpdateAssignments(newAssignments);
    onUpdateUnsoldPool(newPool);
    onUpdateOwnershipLog(newLog);
    onUpdateTransfers(updated);
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
    // For reversals: H returns to Team B (the passer who released H)
    reversals.forEach(r => { newAssignments[r.pickedPid] = actingId; });

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

    const firstTeam = pickOrder[0]?.id;
    const deadline = new Date(Date.now() + msPerPick).toISOString();
    onUpdateTransfers({
      ...transfers,
      phase: "trade",
      currentPickTeam: firstTeam,
      pickDeadline: deadline,
      msPerPick,
      tradedPairs: [],
      ineligible: [],
    });
    alert(`✅ Trade phase started! 30 minutes per pick (${totalPicks} total picks).`);
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

    // Restore pool to original unsold pool (remove all released players)
    const allReleasedPids = new Set(Object.values(allReleases).flat());
    const allPickedPids = new Set(currentPairs.map(p => p.pickedPid));
    const newPool = unsoldPool.filter(id => !allReleasedPids.has(id) && !allPickedPids.has(id));

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
      releases: {},
      tradedPairs: [],
      ineligible: [],
      currentPickTeam: null,
      pickDeadline: null,
    });
    }});
  });

  const startNewWeek = () => withPassword(() => {
    if (!confirm("Start new week? This archives this window's history.")) return;
    onUpdateTransfers({
      weekNum: (transfers.weekNum || 1) + 1,
      phase: "closed",
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
      releaseDeadline: getNextTransferEndIST(),
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
          <h2 style={{fontFamily:fonts.display,fontSize:28,color:T.accent,letterSpacing:2,marginBottom:4}}>TRANSFER WINDOW</h2>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <span style={{fontSize:11,color:T.muted}}>Week {transfers?.weekNum || 1}</span>
            <span style={{background:phaseBadge[phase]+"22",color:phaseBadge[phase],border:"1px solid "+phaseBadge[phase]+"44",padding:"2px 10px",borderRadius:20,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>
              {phase}
            </span>
            {phase === "closed" && (
              <span style={{fontSize:11,color:T.muted}}>Auto-opens {pitchConfig?.transferStart || "Sun 11:59 PM"} IST</span>
            )}
          </div>
        </div>

        {/* Auto countdown to next window */}
        {phase === "closed" && (
          <div style={{background:T.card,borderRadius:10,padding:"10px 16px",textAlign:"center",border:`1px solid ${T.border}`}}>
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
          <div style={{background:T.accentBg,borderRadius:10,padding:"10px 16px",textAlign:"center",border:`1px solid ${T.accentBorder}`}}>
            <div style={{fontSize:10,color:T.accent,letterSpacing:2,marginBottom:4}}>RELEASE WINDOW CLOSES</div>
            <Timer deadline={releaseDeadline} label={(pitchConfig?.transferEnd || "MONDAY 11:00 AM") + " IST"} />
          </div>
        )}
      </div>

      {/* TAB SWITCHER */}
      <div style={{display:"flex",gap:6,marginBottom:20,background:T.bg,borderRadius:10,padding:4,border:`1px solid ${T.border}`}}>
        {[{id:"window",label:"🔄 Transfer Window"},{id:"history",label:"📜 History"}].map(tab=>(
          <button key={tab.id} onClick={()=>setTwTab(tab.id)}
            style={{flex:1,padding:"9px 0",borderRadius:8,border:"none",cursor:"pointer",fontFamily:fonts.body,fontWeight:700,fontSize:14,letterSpacing:0.5,transition:"all 0.2s",
              background:twTab===tab.id?"#1E2D45":"transparent",
              color:twTab===tab.id?"#F5A623":"#4A5E78"}}>
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
        <div style={{background:T.card,borderRadius:12,border:`1px solid ${T.accentBorder}`,padding:16,marginBottom:20}}>
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

            {/* Phase-specific actions */}
            {phase === "release" && (
              <button onClick={startTradePhase} style={adminBtn("#2ECC71")}>
                🏁 START TRADE PHASE
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
                  onUpdateTransfers({ ...transfers, phase: "done" });
                })} style={adminBtn("#2ECC71")}>
                  ✅ END TRADE PHASE
                </button>
              </>
            )}

            {phase === "done" && (
              <button onClick={startNewWeek} style={adminBtn("#F5A623")}>
                📅 START NEW WEEK
              </button>
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
                <div key={t.id} style={{background:T.dangerBg,border:`1px solid ${T.danger}33`,borderRadius:8,padding:"5px 10px",fontSize:11,color:T.danger}}>
                  ⚠️ {t.name}: {(transfers?.releases?.[t.id]||[]).length}/3 released
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CLOSED STATE */}
      {phase === "closed" && (
        <div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,padding:40,textAlign:"center"}}>
          <div style={{fontSize:48,marginBottom:12}}>🔒</div>
          <div style={{fontFamily:fonts.display,fontSize:22,fontWeight:700,color:T.muted,letterSpacing:2,marginBottom:8}}>TRANSFER WINDOW CLOSED</div>
          <div style={{fontSize:13,color:T.muted,marginBottom:12}}>Opens automatically every {pitchConfig?.transferStart || "Sunday at 11:59 PM IST"}</div>
          <div style={{display:"inline-flex",flexDirection:"column",gap:4,background:T.bg,borderRadius:10,padding:"10px 20px",border:`1px solid ${T.border}`}}>
            <div style={{fontSize:11,color:T.muted}}>🔄 Window: <span style={{color:T.text,fontWeight:600}}>{pitchConfig?.transferStart || "Sunday 11:59 PM"} → {pitchConfig?.transferEnd || "Monday 11:00 AM"} IST</span></div>
          </div>
        </div>
      )}

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
              <div key={team.id} style={{background:T.card,borderRadius:12,border:"2px solid "+(isMe?team.color+"66":team.color+"22"),padding:16,marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{fontFamily:fonts.display,fontWeight:700,fontSize:16,color:team.color}}>{team.name}</div>
                    {isMe && <span style={{fontSize:10,background:team.color+"22",color:team.color,border:"1px solid "+team.color+"44",borderRadius:20,padding:"2px 8px",fontWeight:700,letterSpacing:1}}>YOUR TEAM</span>}
                  </div>
                  <div style={{fontSize:12,color:allReleased===3?"#2ECC71":"#F5A623",fontWeight:700,background:allReleased===3?"#2ECC7111":"#F5A62311",padding:"3px 10px",borderRadius:20,border:"1px solid "+(allReleased===3?"#2ECC7133":"#F5A62333")}}>
                    {allReleased}/3 released
                  </div>
                </div>

                {/* Instruction for own team */}
                {isMe && (
                  <div style={{fontSize:12,color:T.muted,marginBottom:10,background:"#F5A62308",border:"1px solid #F5A62322",borderRadius:8,padding:"7px 12px"}}>
                    Tap <strong style={{color:T.accent}}>RELEASE</strong> to add a player to the pool. Tap <strong style={{color:T.danger}}>UNDO</strong> to take them back. You can change until the window closes.
                  </div>
                )}

                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {teamPlayers.map(p => {
                    const isReleased = released.includes(p.id);
                    return (
                      <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:isReleased?"#FF3D5A11":"#080C14",borderRadius:8,border:"1px solid "+(isReleased?"#FF3D5A44":"#1E2D45")}}>
                        <div style={{flex:1}}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            {isReleased && <span style={{fontSize:13}}>📤</span>}
                            <span style={{fontWeight:700,fontSize:13,color:isReleased?"#FF3D5A":"#E2EAF4",textDecoration:isReleased?"line-through":"none"}}>{p.name}</span>
                            <TierBadge tier={p.tier} />
                          </div>
                          <div style={{fontSize:11,color:T.muted}}>{p.iplTeam} • {p.role}</div>
                        </div>
                        {/* Release/Undo button — only for own team, no lock needed */}
                        {isPlayerSafe(p.id) ? (
                            <span style={{fontSize:10,color:T.success,fontWeight:700,background:"#2ECC7111",border:`1px solid ${T.success}33`,padding:"3px 8px",borderRadius:6,letterSpacing:0.5}}>🛡 SAFE</span>
                          ) : canEdit ? (
                            <button onClick={() => handleRelease(team.id, p.id)}
                              style={{background:isReleased?"#FF3D5A22":"#1E2D4533",border:"1px solid "+(isReleased?"#FF3D5A":"#1E2D45"),borderRadius:6,padding:"6px 14px",color:isReleased?"#FF3D5A":"#4A5E78",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:fonts.body,letterSpacing:0.5}}>
                              {isReleased ? "UNDO ✕" : "RELEASE"}
                            </button>
                          ) : isReleased ? (
                            <span style={{fontSize:10,color:T.danger,fontWeight:700,background:T.dangerBg,border:`1px solid ${T.danger}33`,padding:"3px 8px",borderRadius:6}}>RELEASED</span>
                          ) : null}
                        {/* Read-only view for admin */}
                        {!canEdit && isReleased && (
                          <span style={{fontSize:10,color:T.danger,fontWeight:700,background:T.dangerBg,border:`1px solid ${T.danger}33`,padding:"3px 8px",borderRadius:6}}>RELEASED</span>
                        )}
                      </div>
                    );
                  })}
                  {teamPlayers.length === 0 && (
                    <div style={{fontSize:12,color:T.muted,textAlign:"center",padding:16}}>No players in squad</div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Admin without myTeam: show team picker — only during release phase */}
          {!myTeamId && isAdmin && phase === "release" && (
            <div style={{background:T.accentBg,borderRadius:12,border:`1px solid ${T.accentBorder}`,padding:16,marginBottom:12}}>
              <div style={{fontSize:11,color:T.accent,letterSpacing:2,fontWeight:700,marginBottom:8}}>🔑 WHICH TEAM ARE YOU MANAGING?</div>
              <div style={{fontSize:12,color:T.muted,marginBottom:10}}>You're logged in as admin. Select your team to manage releases.</div>
              <select onChange={e=>setSessionTeamId(e.target.value)} defaultValue=""
                style={{width:"100%",background:T.card,border:`1px solid ${T.accentBorder}`,borderRadius:8,padding:"10px 14px",color:T.text,fontSize:14,fontFamily:fonts.body}}>
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
            <div style={{background:T.card,borderRadius:12,border:"2px solid "+currentPickTeam.color+"66",padding:20,marginBottom:16,textAlign:"center"}}>
              <div style={{fontSize:11,color:T.muted,letterSpacing:2,marginBottom:4}}>NOW PICKING</div>
              <div style={{fontFamily:fonts.display,fontSize:24,fontWeight:700,color:currentPickTeam.color,marginBottom:12,letterSpacing:1}}>
                {currentPickTeam.name} {isMyTurn ? "— YOUR TURN 🎯" : ""}
              </div>
              {transfers.pickDeadline && <Timer deadline={transfers.pickDeadline} label="TO MAKE A PICK"
                onExpire={() => {
                  if (phase !== "trade" || !currentPickTeamId) return;
                  // Auto-pick: for each remaining released player, pick a random valid pool player
                  const actingId = currentPickTeamId;
                  const tradedPids = new Set(getTradedPairs(actingId).map(t => t.releasedPid));
                  const ineligible = new Set(transfers.ineligible || []);
                  const remaining = (transfers.releases?.[actingId] || [])
                    .filter(pid => !tradedPids.has(pid) && !ineligible.has(pid));

                  if (remaining.length === 0) { handlePass(); return; }

                  // Try to auto-pick for each remaining released player
                  let currentPool = [...poolPlayers];
                  let currentAssignments = { ...assignments };
                  let currentTradedPairs = [...(transfers.tradedPairs || [])];
                  let currentOwnershipLog = { ...(ownershipLog || {}) };
                  let autoPickedAny = false;
                  const now = new Date().toISOString();

                  remaining.forEach(releasedPid => {
                    const rp = players.find(p => p.id === releasedPid);
                    if (!rp) return;
                    // Find valid matches from current pool
                    const validPool = currentPool.filter(pp =>
                      pp.role === rp.role && TIER_ORDER[pp.tier||""] <= TIER_ORDER[rp.tier||""]
                    );
                    if (validPool.length === 0) return; // no match — will be handled by ineligible logic

                    // Pick random valid player
                    const picked = validPool[Math.floor(Math.random() * validPool.length)];

                    // Apply trade
                    currentAssignments[picked.id] = actingId;
                    if (currentAssignments[releasedPid] === actingId) delete currentAssignments[releasedPid];

                    // Update ownership log
                    if (!currentOwnershipLog[releasedPid]) currentOwnershipLog[releasedPid] = [];
                    currentOwnershipLog[releasedPid] = currentOwnershipLog[releasedPid].map(o =>
                      o.teamId === actingId && !o.to ? { ...o, to: now } : o
                    );
                    if (!currentOwnershipLog[picked.id]) currentOwnershipLog[picked.id] = [];
                    currentOwnershipLog[picked.id] = currentOwnershipLog[picked.id].map(o => !o.to ? { ...o, to: now } : o);
                    currentOwnershipLog[picked.id].push({ teamId: actingId, from: now, to: null });

                    // Record trade pair
                    currentTradedPairs.push({ teamId: actingId, releasedPid, pickedPid: picked.id, week: transfers.weekNum, timestamp: now, autoPicked: true });

                    // Update pool
                    currentPool = currentPool.filter(p => p.id !== picked.id);
                    if (!currentPool.find(p => p.id === releasedPid)) currentPool.push(rp);

                    autoPickedAny = true;
                  });

                  if (!autoPickedAny) { handlePass(); return; }

                  const nextTeam = getNextPickTeam(actingId, currentTradedPairs);
                  const deadline = nextTeam ? new Date(Date.now() + 45 * 60 * 1000).toISOString() : null;

                  onUpdateAssignments(currentAssignments);
                  onUpdateUnsoldPool(currentPool.map(p => p.id));
                  onUpdateOwnershipLog(currentOwnershipLog);
                  onUpdateTransfers({
                    ...transfers,
                    tradedPairs: currentTradedPairs,
                    currentPickTeam: nextTeam || null,
                    pickDeadline: deadline,
                    phase: nextTeam ? "trade" : "done",
                  });
                }}
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
            <div style={{background:"#2ECC7111",border:`1px solid ${T.success}33`,borderRadius:12,padding:16,marginBottom:16,textAlign:"center"}}>
              <div style={{fontFamily:fonts.display,fontSize:20,fontWeight:700,color:T.success}}>✅ TRADE PHASE COMPLETE</div>
              <div style={{fontSize:12,color:T.muted,marginTop:4}}>All trades finalised for Week {transfers.weekNum}</div>
            </div>
          )}

          {/* ── LIVE TRACK ──────────────────────────────────────────────── */}
          <div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,padding:16,marginBottom:16}}>
            <div style={{fontSize:11,color:T.accent,letterSpacing:2,fontWeight:700,marginBottom:14}}>📡 LIVE TRADE TRACK</div>
            {sortedTeams.map(team => {
              const released = getReleasedPlayers(team.id);
              if (released.length === 0) return null;
              const pairs = getTradedPairs(team.id);
              return (
                <div key={team.id} style={{marginBottom:14,paddingBottom:14,borderBottom:`1px solid ${T.border}`}}>
                  <div style={{fontFamily:fonts.display,fontSize:14,fontWeight:700,color:team.color,letterSpacing:1,marginBottom:8}}>
                    {team.name}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {released.map(p => {
                      const pair = pairs.find(pr => pr.releasedPid === p.id);
                      const incoming = pair ? players.find(x => x.id === pair.pickedPid) : null;
                      const isIneligible = (transfers.ineligible||[]).includes(p.id);
                      const takenByTeam = p.pickedByOther ? teams.find(t =>
                        (transfers.tradedPairs||[]).some(tp => tp.pickedPid === p.id && tp.teamId === t.id)
                      ) : null;
                      return (
                        <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",opacity:p.pickedByOther?0.6:1}}>
                          {/* Released player */}
                          <div style={{display:"flex",alignItems:"center",gap:5,background:T.dangerBg,border:`1px solid ${T.danger}33`,borderRadius:8,padding:"5px 10px"}}>
                            <span style={{fontSize:12}}>⬇️</span>
                            <span style={{fontSize:12,color:T.danger,textDecoration:"line-through",fontWeight:700}}>{p.name}</span>
                            <TierBadge tier={p.tier} />
                            <span style={{fontSize:10,color:T.muted}}>{p.role}</span>
                          </div>

                          {/* Arrow + incoming or waiting */}
                          {incoming ? (
                            <>
                              <span style={{color:T.muted,fontSize:14}}>→</span>
                              <div style={{display:"flex",alignItems:"center",gap:5,background:"#2ECC7111",border:`1px solid ${T.success}33`,borderRadius:8,padding:"5px 10px"}}>
                                <span style={{fontSize:12}}>⬆️</span>
                                <span style={{fontSize:12,color:T.success,fontWeight:700}}>{incoming.name}</span>
                                <TierBadge tier={incoming.tier} />
                                <span style={{fontSize:10,color:T.muted}}>{incoming.role}</span>
                              </div>
                            </>
                          ) : takenByTeam ? (
                            <>
                              <span style={{color:T.muted,fontSize:14}}>→</span>
                              <div style={{background:"#4A5E7822",border:"1px solid #4A5E7844",borderRadius:8,padding:"5px 10px"}}>
                                <span style={{fontSize:11,color:T.muted}}>🚫 taken by <span style={{color:takenByTeam.color,fontWeight:700}}>{takenByTeam.name}</span></span>
                              </div>
                            </>
                          ) : isIneligible ? (
                            <>
                              <span style={{color:T.muted,fontSize:14}}>→</span>
                              <div style={{background:"#4A5E7822",border:"1px solid #4A5E7844",borderRadius:8,padding:"5px 10px"}}>
                                <span style={{fontSize:11,color:T.muted}}>↩️ returned (passed)</span>
                              </div>
                            </>
                          ) : (phase === "done" || !currentPickTeamId) ? (
                            <>
                              <span style={{color:T.muted,fontSize:14}}>→</span>
                              <div style={{background:"#4A5E7822",border:"1px solid #4A5E7844",borderRadius:8,padding:"5px 10px"}}>
                                <span style={{fontSize:11,color:T.muted}}>↩️ returned to squad</span>
                              </div>
                            </>
                          ) : (
                            <>
                              <span style={{color:T.muted,fontSize:14}}>→</span>
                              <div style={{background:T.accentBg,border:`1px solid ${T.accentBorder}`,borderRadius:8,padding:"5px 10px"}}>
                                <span style={{fontSize:11,color:T.accent,animation:"pulse 1.5s ease infinite"}}>⏳ waiting…</span>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── POOL + MY RELEASES ───────────────────────────────────────── */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>

            {/* Unsold pool */}
            <div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,padding:14}}>
              <div style={{fontSize:11,color:T.muted,letterSpacing:2,fontWeight:700,marginBottom:10}}>
                POOL ({sortedPool.length})
              </div>
              {sortedPool.length === 0 ? (
                <div style={{fontSize:12,color:T.muted,textAlign:"center",padding:16}}>Pool empty</div>
              ) : sortedPool.map(p => {
                const canPickNow = (isMyTurn || unlocked) && phase==="trade" && !isPlayerSafe(p.id);
                const pickAsTeam = isMyTurn ? myTeamId : currentPickTeamId;
                // Team cannot pick their own released player
                const releasedByPickingTeam = (transfers?.releases?.[pickAsTeam]||[]).includes(p.id);
                const valid = canPickNow && !releasedByPickingTeam ? getValidMatches(p, pickAsTeam) : [];
                const canPick = valid.length > 0;
                // Check if newly released this window vs pre-existing unsold
                const isNewlyReleased = Object.values(transfers?.releases || {}).some(arr => arr.includes(p.id));
                // Find which team released them
                const releasedByTeam = isNewlyReleased
                  ? teams.find(t => (transfers?.releases?.[t.id] || []).includes(p.id))
                  : null;
                const teamColor = releasedByTeam?.color || "#1E2D45";
                const cardBg = canPick ? "#2ECC7111" : isNewlyReleased ? "#FF3D5A08" : "#080C14";
                const cardBorder = canPick ? "#2ECC7144" : isNewlyReleased ? teamColor+"44" : "#1E2D4544";
                return (
                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:cardBg,borderRadius:8,border:"1px solid "+cardBorder,borderLeft:isNewlyReleased?"3px solid "+teamColor+"99":"1px solid "+cardBorder,marginBottom:6}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                        <span style={{fontWeight:700,fontSize:12,color:T.text}}>{p.name}</span>
                        <TierBadge tier={p.tier} />
                        {isPlayerSafe(p.id) && (
                          <span style={{fontSize:9,background:"#2ECC7111",color:T.success,border:`1px solid ${T.success}33`,borderRadius:4,padding:"1px 5px",fontWeight:700}}>🛡 SAFE</span>
                        )}
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2,flexWrap:"wrap"}}>
                        <span style={{fontSize:10,color:T.muted}}>{p.iplTeam} • {p.role}</span>
                        {isNewlyReleased && releasedByTeam && (
                          <span style={{display:"flex",alignItems:"center",gap:3,fontSize:9,fontWeight:800,letterSpacing:0.5,color:teamColor,background:teamColor+"15",border:"1px solid "+teamColor+"44",borderRadius:4,padding:"1px 6px"}}>
                            <span style={{width:5,height:5,borderRadius:"50%",background:teamColor,display:"inline-block",flexShrink:0}} />
                            FROM {releasedByTeam.name.toUpperCase()}
                          </span>
                        )}
                        {!isNewlyReleased && (
                          <span style={{fontSize:9,color:T.muted,background:"#1E2D4555",border:"1px solid #1E2D4599",borderRadius:4,padding:"1px 6px",fontWeight:700}}>UNSOLD</span>
                        )}
                      </div>
                    </div>
                    {canPick && (
                      <button onClick={() => handlePickClick(p)}
                        style={{background:"#2ECC71",border:"none",borderRadius:6,padding:"5px 10px",color:T.bg,fontSize:11,fontWeight:800,cursor:"pointer",flexShrink:0,fontFamily:fonts.body,letterSpacing:0.5}}>
                        PICK
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* My released players */}
            <div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,padding:14}}>
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
                    {released.map(p => {
                      const traded = pairs.find(pr => pr.releasedPid === p.id);
                      const ineligible = (transfers.ineligible||[]).includes(p.id);
                      return (
                        <div key={p.id} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",background:traded?"#2ECC7111":p.pickedByOther?"#FF3D5A11":ineligible?"#4A5E7822":"#080C14",borderRadius:8,border:"1px solid "+(traded?"#2ECC7144":p.pickedByOther?"#FF3D5A33":ineligible?"#4A5E7844":"#1E2D44"),marginBottom:4}}>
                          <span style={{fontSize:11}}>{traded?"✅":p.pickedByOther?"🚫":ineligible?"↩️":"📤"}</span>
                          <div style={{flex:1}}>
                            <div style={{display:"flex",alignItems:"center",gap:4}}>
                              <span style={{fontWeight:700,fontSize:12,color:traded?"#2ECC71":p.pickedByOther?"#FF3D5A":ineligible?"#4A5E78":"#E2EAF4",textDecoration:(traded||p.pickedByOther)?"line-through":"none"}}>{p.name}</span>
                              <TierBadge tier={p.tier} />
                            </div>
                            <div style={{fontSize:10,color:T.muted}}>{p.role}</div>
                          </div>
                          {traded && <span style={{fontSize:10,color:T.success,fontWeight:700}}>TRADED</span>}
                          {p.pickedByOther && !traded && <span style={{fontSize:10,color:"#FF3D5A",fontWeight:700}}>TAKEN</span>}
                          {ineligible && !traded && !p.pickedByOther && <span style={{fontSize:10,color:T.muted,fontWeight:700}}>RETURNED</span>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* My turn actions */}
          {(isMyTurn || unlocked) && phase === "trade" && currentPickTeam && (
            <div style={{background:T.card,borderRadius:12,border:"2px solid "+(myReversalAlert?"#FF3D5A44":"#F5A62344"),padding:16,marginBottom:16}}>
              <div style={{fontFamily:fonts.display,fontSize:18,fontWeight:700,color:myReversalAlert?"#FF3D5A":"#F5A623",marginBottom:6}}>{myReversalAlert?"⚠️ RE-PICK REQUIRED":"🎯 YOUR TURN"}</div>
              {myReversalAlert && (
                <div style={{background:T.dangerBg,border:`1px solid ${T.danger}33`,borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:12,color:T.danger}}>
                  <strong>{myReversalAlert.returnedPlayerName}</strong> returned to {myReversalAlert.returnedToTeam}. Pick another player or pass.
                </div>
              )}
              <div style={{fontSize:12,color:T.muted,marginBottom:12}}>
                Pick a player from the pool (highlighted green). Must be same role and same/lower tier as a player you released.
              </div>
              {canPass(myTeamId || currentPickTeamId) ? (
                <button onClick={handlePass}
                  style={{width:"100%",background:"#4A5E7822",border:"1px solid #4A5E78",borderRadius:10,padding:12,color:T.text,fontFamily:fonts.body,fontWeight:800,fontSize:14,cursor:"pointer",letterSpacing:0.5}}>
                  PASS — No valid players in pool (released players will return)
                </button>
              ) : (
                <div style={{fontSize:11,color:T.muted,textAlign:"center",padding:"8px 0"}}>
                  Valid picks exist in pool — PASS not allowed until pool is exhausted
                  {unlocked && (
                    <button onClick={handlePass}
                      style={{display:"block",width:"100%",marginTop:8,background:T.dangerBg,border:"1px dashed #FF3D5A44",borderRadius:10,padding:10,color:T.danger,fontFamily:fonts.body,fontWeight:700,fontSize:12,cursor:"pointer"}}>
                      ⚠️ ADMIN: FORCE PASS
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Trade summary */}
          <div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,padding:14}}>
            <div style={{fontSize:11,color:T.muted,letterSpacing:2,fontWeight:700,marginBottom:10}}>TRADE ORDER</div>
            {pickOrder.map((team, idx) => {
              const released = getReleasedPlayers(team.id);
              const pairs = getTradedPairs(team.id);
              const isCurrent = team.id === currentPickTeamId;
              return (
                <div key={team.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:isCurrent?team.color+"11":"transparent",borderRadius:8,marginBottom:4,border:isCurrent?"1px solid "+team.color+"33":"1px solid transparent"}}>
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

      {/* AUTO-OPEN PROMPT */}
      {showAutoOpenPrompt && (
        <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.95)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:800,padding:16}}>
          <div style={{background:T.card,borderRadius:16,border:`1px solid ${T.accentBorder}`,padding:24,width:"100%",maxWidth:380}}>
            <div style={{fontSize:28,marginBottom:8}}>⏰</div>
            <div style={{fontFamily:fonts.display,fontSize:20,fontWeight:700,color:T.accent,marginBottom:8}}>TIME TO OPEN THE WINDOW</div>
            <div style={{fontSize:13,color:T.muted,marginBottom:20}}>It's within the transfer window period ({pitchConfig?.transferStart || "Sun 11:59 PM"} – {pitchConfig?.transferEnd || "Mon 11:00 AM"} IST). Do you want to open the release window now?</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowAutoOpenPrompt(false)}
                style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:11,color:T.muted,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>
                NOT YET
              </button>
              <button onClick={()=>{openReleaseManually();setShowAutoOpenPrompt(false);}}
                style={{flex:2,background:`linear-gradient(135deg,${T.accent},${T.accentDim})`,border:"none",borderRadius:8,padding:11,color:T.bg,fontFamily:fonts.body,fontWeight:800,fontSize:15,cursor:"pointer"}}>
                📤 OPEN NOW
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REVERSAL ALERT MODAL */}
      {showReversalAlert && myReversalAlert && (
        <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.97)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:900,padding:16}}>
          <div style={{background:T.card,borderRadius:16,border:"2px solid #F5A62366",padding:24,width:"100%",maxWidth:400}}>
            <div style={{fontSize:32,textAlign:"center",marginBottom:8}}>⚠️</div>
            <div style={{fontFamily:fonts.display,fontSize:20,fontWeight:700,color:T.accent,textAlign:"center",letterSpacing:1,marginBottom:8}}>
              TRADE REVERSED
            </div>
            <div style={{background:T.dangerBg,border:`1px solid ${T.danger}33`,borderRadius:10,padding:"12px 16px",marginBottom:16,textAlign:"center"}}>
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
              style={{width:"100%",background:`linear-gradient(135deg,${T.accent},${T.accentDim})`,border:"none",borderRadius:10,padding:13,color:T.bg,fontFamily:fonts.body,fontWeight:800,fontSize:16,cursor:"pointer",letterSpacing:0.5}}>
              GOT IT — LET ME RE-PICK
            </button>
          </div>
        </div>
      )}

      {/* CONFIRM MODAL */}
      {confirmModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.95)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:800,padding:16}}>
          <div style={{background:T.card,borderRadius:16,border:`1px solid ${T.danger}44`,padding:24,width:"100%",maxWidth:380}}>
            <div style={{fontSize:22,marginBottom:12}}>⚠️</div>
            <div style={{fontFamily:fonts.display,fontSize:18,fontWeight:700,color:T.danger,marginBottom:12}}>{confirmModal.message}</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setConfirmModal(null)}
                style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:11,color:T.muted,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>
                CANCEL
              </button>
              <button onClick={()=>{confirmModal.onConfirm();setConfirmModal(null);}}
                style={{flex:1,background:T.dangerBg,border:"1px solid #FF3D5A",borderRadius:8,padding:11,color:T.danger,fontFamily:fonts.body,fontWeight:800,fontSize:14,cursor:"pointer"}}>
                CONFIRM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PICK MODAL — choose which released player to swap */}
      {pickModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.97)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500,padding:16}}>
          <div style={{background:T.card,borderRadius:16,border:`1px solid ${T.border}`,padding:24,width:"100%",maxWidth:440}}>
            <div style={{fontFamily:fonts.display,fontSize:20,fontWeight:700,color:T.success,letterSpacing:2,marginBottom:4}}>PICK PLAYER</div>
            <div style={{fontSize:12,color:T.muted,marginBottom:6}}>
              Incoming: <strong style={{color:T.text}}>{pickModal.poolPlayer.name}</strong>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6,background:"#2ECC7111",border:`1px solid ${T.success}33`,borderRadius:10,padding:"10px 14px",marginBottom:20}}>
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
                style={{width:"100%",background:T.dangerBg,border:`1px solid ${T.danger}44`,borderRadius:10,padding:12,marginBottom:8,cursor:"pointer",display:"flex",alignItems:"center",gap:10,textAlign:"left",fontFamily:fonts.body}}>
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
              style={{width:"100%",background:"transparent",border:`1px solid ${T.border}`,borderRadius:10,padding:10,color:T.muted,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer",marginTop:4}}>
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* FINAL CONFIRM MODAL */}
      {tradeConfirmModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.97)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:600,padding:16}}>
          <div style={{background:T.card,borderRadius:16,border:`1px solid ${T.border}`,padding:24,width:"100%",maxWidth:400}}>
            <div style={{fontFamily:fonts.display,fontSize:20,fontWeight:700,color:T.accent,letterSpacing:2,marginBottom:16}}>CONFIRM TRADE</div>

            <div style={{background:"#2ECC7111",border:`1px solid ${T.success}33`,borderRadius:10,padding:14,marginBottom:10,display:"flex",alignItems:"center",gap:10}}>
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

            <div style={{background:T.dangerBg,border:`1px solid ${T.danger}33`,borderRadius:10,padding:14,marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
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

            <div style={{background:T.accentBg,border:`1px solid ${T.accentBorder}`,borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:12,color:T.accent,textAlign:"center",fontWeight:700}}>
              ⚠️ This trade is permanent and cannot be undone this window
            </div>

            <div style={{display:"flex",gap:8}}>
              <button onClick={() => setTradeConfirmModal(null)}
                style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:11,color:T.muted,fontFamily:fonts.body,fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
              <button onClick={executeTrade}
                style={{flex:2,background:`linear-gradient(135deg,${T.accent},${T.accentDim})`,border:"none",borderRadius:8,padding:11,color:T.bg,fontFamily:fonts.body,fontWeight:800,fontSize:15,cursor:"pointer",letterSpacing:0.5}}>
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

  const history = [...currentWeekEntry, ...[...(transfers.history || [])].reverse()];

  if (history.length === 0) {
    return (
      <div style={{textAlign:"center",padding:"60px 20px",background:T.card,borderRadius:12,border:`1px solid ${T.border}`}}>
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
          <div key={wi} style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden"}}>
            {/* Week header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",borderBottom:`1px solid ${T.border}`,background:T.bg}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{background:T.accentBg,border:`1px solid ${T.accentBorder}`,borderRadius:8,padding:"4px 12px",fontFamily:fonts.display,fontWeight:800,fontSize:18,color:T.accent}}>
                  W{weekNum}{week.isCurrent ? " 🔴" : ""}
                </div>
                <div>
                  <div style={{fontFamily:fonts.display,fontWeight:700,fontSize:15,color:T.text,letterSpacing:1}}>
                    WEEK {weekNum} TRANSFERS
                  </div>
                  {date && <div style={{fontSize:11,color:T.muted}}>{date}</div>}
                </div>
              </div>
              <div style={{fontSize:12,color:T.muted,fontWeight:700}}>
                {pairs.length} trade{pairs.length!==1?"s":""}
              </div>
            </div>

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
                  <div style={{fontFamily:fonts.display,fontWeight:700,fontSize:13,color:team.color,letterSpacing:1,marginBottom:10}}>
                    {team.name}
                  </div>

                  {/* Traded pairs */}
                  {teamPairs.map((pr, i) => {
                    const out = getPlayer(pr.releasedPid);
                    const inn = getPlayer(pr.pickedPid);
                    return (
                      <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                        {/* Player out */}
                        <div style={{display:"flex",alignItems:"center",gap:6,background:T.dangerBg,border:`1px solid ${T.danger}33`,borderRadius:8,padding:"6px 12px",minWidth:0}}>
                          <span style={{fontSize:14}}>⬇️</span>
                          <div>
                            <div style={{fontWeight:700,fontSize:13,color:T.danger,textDecoration:"line-through"}}>{out?.name||pr.releasedPid}</div>
                            <div style={{fontSize:10,color:T.muted}}>{out?.role} • {out?.iplTeam}</div>
                          </div>
                        </div>
                        <span style={{color:T.muted,fontSize:18,fontWeight:300}}>→</span>
                        {/* Player in */}
                        <div style={{display:"flex",alignItems:"center",gap:6,background:"#2ECC7111",border:`1px solid ${T.success}33`,borderRadius:8,padding:"6px 12px",minWidth:0}}>
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
                          <div key={pid} style={{display:"flex",alignItems:"center",gap:5,background:T.accentBg,border:`1px solid ${T.accentBorder}`,borderRadius:8,padding:"4px 10px"}}>
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
          </div>
        );
      })}
    </div>
  );
}


function adminBtn(color) {
  return {
    background: color + "22",
    border: "1px solid " + color + "44",
    borderRadius: 8,
    padding: "8px 16px",
    color,
    fontFamily: fonts.body,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    letterSpacing: 0.5,
  };
}
