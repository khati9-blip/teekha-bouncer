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
      fontFamily:"Barlow Condensed,sans-serif",textTransform:"uppercase",
      background:TIER_BG[tier],border:"1px solid "+TIER_BORDER[tier],color:TIER_COLORS[tier]}}>
      {tier==="platinum"?"PLAT":tier==="gold"?"GOLD":tier==="silver"?"SILV":"BRNZ"}
    </span>
  );
}

// ── COUNTDOWN TIMER ──────────────────────────────────────────────────────────
function Timer({ deadline, label = "REMAINING" }) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.floor((new Date(deadline) - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [deadline]);
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const urgent = left < 300;
  return (
    <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:32,fontWeight:700,
      color:left===0?"#4A5E78":urgent?"#FF3D5A":"#F5A623",textAlign:"center",letterSpacing:2}}>
      {left === 0 ? "TIME UP" : h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`}
      <div style={{fontSize:10,color:"#4A5E78",letterSpacing:2,marginTop:2}}>{left===0?"EXPIRED":label}</div>
    </div>
  );
}

// ── AUTO WINDOW TIMING ───────────────────────────────────────────────────────
function getNextSundayIST() {
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

function getNextMondayIST() {
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

function isWithinReleaseWindow() {
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
  user, safePlayers
}) {
  const [pickModal, setPickModal] = useState(null); // {poolPlayer}
  const [sessionTeamId, setSessionTeamId] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null); // {message, onConfirm}
  const [showAutoOpenPrompt, setShowAutoOpenPrompt] = useState(false);
  const [tradeConfirmModal, setTradeConfirmModal] = useState(null); // {poolPlayer, releasedPlayer}
  const [resetConfirm, setResetConfirm] = useState(false);

  const phase = transfers?.phase || "closed";
  const myTeamId = myTeam?.id || sessionTeamId;
  const isPlayerSafe = (pid) => Object.values(safePlayers || {}).some(arr => arr.includes(pid));
  const sortedTeams = leaderboard.map(t => teams.find(x => x.id === t.id)).filter(Boolean);

  // ── AUTO WINDOW CHECK — prompt admin instead of auto-opening ──────────────
  useEffect(() => {
    if (!unlocked) return;
    if (phase === "closed" && isWithinReleaseWindow()) {
      setShowAutoOpenPrompt(true);
    }
  }, [unlocked]);

  // ── HELPERS ────────────────────────────────────────────────────────────────
  const getReleasedPlayers = (teamId) =>
    (transfers?.releases?.[teamId] || []).map(pid => players.find(p => p.id === pid)).filter(Boolean);

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
  const currentPickTeam = teams.find(t => t.id === currentPickTeamId);
  const isMyTurn = currentPickTeamId === myTeamId;

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
    delete newAssignments[releasedPlayer.id];

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

    const updated = {
      ...transfers,
      tradedPairs,
      currentPickTeam: allDone ? null : nextTeam,
      pickDeadline: allDone ? null : deadline,
      phase: allDone ? "done" : "trade",
    };

    onUpdateAssignments(newAssignments);
    onUpdateUnsoldPool(newPool);
    onUpdateOwnershipLog(newLog);
    onUpdateTransfers(updated);
    setTradeConfirmModal(null);
  };

  const handlePass = () => {
    if (!canPass(myTeamId)) { alert("You cannot pass — valid picks exist in the pool."); return; }
    const myReleased = getReleasedPlayers(myTeamId);
    const tradedPids = getTradedPairs(myTeamId).map(t => t.releasedPid);
    const remaining = myReleased.filter(p => !tradedPids.includes(p.id));

    // Return remaining released players to team + remove from unsold pool
    const newAssignments = { ...assignments };
    remaining.forEach(p => { newAssignments[p.id] = myTeamId; });
    const returnedPids = new Set(remaining.map(p => p.id));
    const newPool = unsoldPool.filter(id => !returnedPids.has(id));
    onUpdateUnsoldPool(newPool);

    const ineligible = [...(transfers.ineligible || []), ...remaining.map(p => p.id)];
    const nextTeam = getNextPickTeam(myTeamId, transfers.tradedPairs || []);
    const deadline = nextTeam ? new Date(Date.now() + 45 * 60 * 1000).toISOString() : null;

    onUpdateAssignments(newAssignments);
    onUpdateTransfers({
      ...transfers,
      ineligible,
      currentPickTeam: nextTeam || null,
      pickDeadline: deadline,
      phase: nextTeam ? "trade" : "done",
    });
  };

  const getNextPickTeam = (currentTeamId, tradedPairs) => {
    const order = sortedTeams.map(t => t.id);
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
    const firstTeam = sortedTeams[0]?.id;
    const deadline = new Date(Date.now() + 45 * 60 * 1000).toISOString();
    onUpdateTransfers({
      ...transfers,
      phase: "trade",
      currentPickTeam: firstTeam,
      pickDeadline: deadline,
      tradedPairs: [],
      ineligible: [],
    });
  });

  const resetTradePhase = () => withPassword(() => {
    setConfirmModal({ message: "⚠️ Reset trade phase? All picks will be erased and it restarts from the top team.", onConfirm: () => {

    // Restore released players to pool (undo all trades)
    const currentPairs = transfers.tradedPairs || [];
    let newAssignments = { ...assignments };
    let newPool = [...unsoldPool];
    let newLog = { ...(ownershipLog || {}) };

    for (const pair of currentPairs) {
      // Return picked player to pool
      delete newAssignments[pair.pickedPid];
      if (!newPool.includes(pair.pickedPid)) newPool.push(pair.pickedPid);
      // Return released player to team
      newAssignments[pair.releasedPid] = pair.teamId;
      newPool = newPool.filter(id => id !== pair.releasedPid);
      // Undo ownership log entries
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

    const firstTeam = sortedTeams[0]?.id;
    const deadline = new Date(Date.now() + 45 * 60 * 1000).toISOString();

    onUpdateAssignments(newAssignments);
    onUpdateUnsoldPool(newPool);
    onUpdateOwnershipLog(newLog);
    onUpdateTransfers({
      ...transfers,
      phase: "trade",
      currentPickTeam: firstTeam,
      pickDeadline: deadline,
      tradedPairs: [],
      ineligible: [],
      tradeStartedAt: new Date().toISOString(),
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

  const openReleaseManually = () => withPassword(() => {
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
      releaseDeadline: getNextMondayIST(),
      releases: {},
      tradedPairs: [],
      ineligible: [],
      currentPickTeam: null,
      pickDeadline: null,
      history,
    });
  });

  // ── CLEANUP: return un-traded released players to their teams ───────────────
  const returnUntradedPlayers = (currentTransfers, currentAssignments, currentPool) => {
    const tradedReleasedPids = new Set((currentTransfers.tradedPairs||[]).map(tp => tp.releasedPid));
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
    const newPool = currentPool.filter(pid => !untradedPids.has(pid) && !pickedPids.has(pid));
    return { newAssignments, newPool };
  };

  // ── NEXT AUTO OPEN INFO ──────────────────────────────────────────────────
  const nextAutoOpen = getNextSundayIST();
  const releaseDeadline = transfers?.releaseDeadline || getNextMondayIST();

  // ── RENDER ────────────────────────────────────────────────────────────────
  const phaseBadge = { closed:"#4A5E78", release:"#F5A623", trade:"#2ECC71", done:"#4F8EF7" };

  return (
    <div style={{fontFamily:"Barlow Condensed,sans-serif",paddingBottom:40}}>

      {/* HEADER */}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12,marginBottom:20}}>
        <div>
          <h2 style={{fontFamily:"Rajdhani,sans-serif",fontSize:28,color:"#F5A623",letterSpacing:2,marginBottom:4}}>TRANSFER WINDOW</h2>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <span style={{fontSize:11,color:"#4A5E78"}}>Week {transfers?.weekNum || 1}</span>
            <span style={{background:phaseBadge[phase]+"22",color:phaseBadge[phase],border:"1px solid "+phaseBadge[phase]+"44",padding:"2px 10px",borderRadius:20,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>
              {phase}
            </span>
            {phase === "closed" && (
              <span style={{fontSize:11,color:"#4A5E78"}}>Auto-opens Sun 11:59 PM IST</span>
            )}
          </div>
        </div>

        {/* Auto countdown to next window */}
        {phase === "closed" && (
          <div style={{background:"#0E1521",borderRadius:10,padding:"10px 16px",textAlign:"center",border:"1px solid #1E2D45"}}>
            <div style={{fontSize:10,color:"#4A5E78",letterSpacing:2,marginBottom:4}}>NEXT WINDOW OPENS</div>
            <Timer deadline={nextAutoOpen} label="UNTIL SUNDAY 11:59 PM IST" />
          </div>
        )}
        {phase === "release" && (
          <div style={{background:"#F5A62311",borderRadius:10,padding:"10px 16px",textAlign:"center",border:"1px solid #F5A62333"}}>
            <div style={{fontSize:10,color:"#F5A623",letterSpacing:2,marginBottom:4}}>RELEASE WINDOW CLOSES</div>
            <Timer deadline={releaseDeadline} label="MONDAY 11:00 AM IST" />
          </div>
        )}
      </div>

      {/* ADMIN CONTROLS */}
      {unlocked && (
        <div style={{background:"#0E1521",borderRadius:12,border:"1px solid #F5A62333",padding:16,marginBottom:20}}>
          <div style={{fontSize:11,color:"#F5A623",letterSpacing:2,fontWeight:700,marginBottom:12}}>🔑 ADMIN CONTROLS</div>
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
                  const nextTeam = getNextPickTeam(currentPickTeamId, transfers.tradedPairs);
                  const deadline = new Date(Date.now() + 45 * 60 * 1000).toISOString();
                  onUpdateTransfers({ ...transfers, currentPickTeam: nextTeam, pickDeadline: deadline });
                })} style={adminBtn("#4F8EF7")}>
                  ⏭ SKIP CURRENT TEAM
                </button>
                <button onClick={resetTradePhase} style={adminBtn("#A855F7")}>
                  🔄 RESET TRADE PHASE
                </button>
                <button onClick={() => withPassword(() => {
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
          </div>

          {/* Teams not compliant warning */}
          {phase === "release" && (
            <div style={{marginTop:12,display:"flex",flexWrap:"wrap",gap:6}}>
              {sortedTeams.filter(t => (transfers?.releases?.[t.id]||[]).length < 3).map(t => (
                <div key={t.id} style={{background:"#FF3D5A11",border:"1px solid #FF3D5A33",borderRadius:8,padding:"5px 10px",fontSize:11,color:"#FF3D5A"}}>
                  ⚠️ {t.name}: {(transfers?.releases?.[t.id]||[]).length}/3 released
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CLOSED STATE */}
      {phase === "closed" && (
        <div style={{background:"#0E1521",borderRadius:12,border:"1px solid #1E2D45",padding:40,textAlign:"center"}}>
          <div style={{fontSize:48,marginBottom:12}}>🔒</div>
          <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:22,fontWeight:700,color:"#4A5E78",letterSpacing:2,marginBottom:8}}>TRANSFER WINDOW CLOSED</div>
          <div style={{fontSize:13,color:"#4A5E78"}}>Opens automatically every Sunday at 11:59 PM IST</div>
        </div>
      )}

      {/* RELEASE PHASE */}
      {phase === "release" && (
        <div style={{marginBottom:20}}>
          <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:18,fontWeight:700,color:"#F5A623",letterSpacing:2,marginBottom:6}}>
            📤 RELEASE PHASE
          </div>
          <div style={{fontSize:12,color:"#4A5E78",marginBottom:16}}>
            Select up to 3 players to release. Window closes Monday 11:00 AM IST. You can change selections until then.
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
              <div key={team.id} style={{background:"#0E1521",borderRadius:12,border:"2px solid "+(isMe?team.color+"66":team.color+"22"),padding:16,marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:16,color:team.color}}>{team.name}</div>
                    {isMe && <span style={{fontSize:10,background:team.color+"22",color:team.color,border:"1px solid "+team.color+"44",borderRadius:20,padding:"2px 8px",fontWeight:700,letterSpacing:1}}>YOUR TEAM</span>}
                  </div>
                  <div style={{fontSize:12,color:allReleased===3?"#2ECC71":"#F5A623",fontWeight:700,background:allReleased===3?"#2ECC7111":"#F5A62311",padding:"3px 10px",borderRadius:20,border:"1px solid "+(allReleased===3?"#2ECC7133":"#F5A62333")}}>
                    {allReleased}/3 released
                  </div>
                </div>

                {/* Instruction for own team */}
                {isMe && (
                  <div style={{fontSize:12,color:"#4A5E78",marginBottom:10,background:"#F5A62308",border:"1px solid #F5A62322",borderRadius:8,padding:"7px 12px"}}>
                    Tap <strong style={{color:"#F5A623"}}>RELEASE</strong> to add a player to the pool. Tap <strong style={{color:"#FF3D5A"}}>UNDO</strong> to take them back. You can change until the window closes.
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
                          <div style={{fontSize:11,color:"#4A5E78"}}>{p.iplTeam} • {p.role}</div>
                        </div>
                        {/* Release/Undo button — only for own team, no lock needed */}
                        {isPlayerSafe(p.id) ? (
                            <span style={{fontSize:10,color:"#2ECC71",fontWeight:700,background:"#2ECC7111",border:"1px solid #2ECC7133",padding:"3px 8px",borderRadius:6,letterSpacing:0.5}}>🛡 SAFE</span>
                          ) : canEdit ? (
                            <button onClick={() => handleRelease(team.id, p.id)}
                              style={{background:isReleased?"#FF3D5A22":"#1E2D4533",border:"1px solid "+(isReleased?"#FF3D5A":"#1E2D45"),borderRadius:6,padding:"6px 14px",color:isReleased?"#FF3D5A":"#4A5E78",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"Barlow Condensed,sans-serif",letterSpacing:0.5}}>
                              {isReleased ? "UNDO ✕" : "RELEASE"}
                            </button>
                          ) : isReleased ? (
                            <span style={{fontSize:10,color:"#FF3D5A",fontWeight:700,background:"#FF3D5A11",border:"1px solid #FF3D5A33",padding:"3px 8px",borderRadius:6}}>RELEASED</span>
                          ) : null}
                        {/* Read-only view for admin */}
                        {!canEdit && isReleased && (
                          <span style={{fontSize:10,color:"#FF3D5A",fontWeight:700,background:"#FF3D5A11",border:"1px solid #FF3D5A33",padding:"3px 8px",borderRadius:6}}>RELEASED</span>
                        )}
                      </div>
                    );
                  })}
                  {teamPlayers.length === 0 && (
                    <div style={{fontSize:12,color:"#4A5E78",textAlign:"center",padding:16}}>No players in squad</div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Admin without myTeam: show team picker — only during release phase */}
          {!myTeamId && isAdmin && phase === "release" && (
            <div style={{background:"#F5A62311",borderRadius:12,border:"1px solid #F5A62333",padding:16,marginBottom:12}}>
              <div style={{fontSize:11,color:"#F5A623",letterSpacing:2,fontWeight:700,marginBottom:8}}>🔑 WHICH TEAM ARE YOU MANAGING?</div>
              <div style={{fontSize:12,color:"#4A5E78",marginBottom:10}}>You're logged in as admin. Select your team to manage releases.</div>
              <select onChange={e=>setSessionTeamId(e.target.value)} defaultValue=""
                style={{width:"100%",background:"#0E1521",border:"1px solid #F5A62344",borderRadius:8,padding:"10px 14px",color:"#E2EAF4",fontSize:14,fontFamily:"Barlow Condensed,sans-serif"}}>
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
            <div style={{background:"#0E1521",borderRadius:12,border:"2px solid "+currentPickTeam.color+"66",padding:20,marginBottom:16,textAlign:"center"}}>
              <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,marginBottom:4}}>NOW PICKING</div>
              <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:24,fontWeight:700,color:currentPickTeam.color,marginBottom:12,letterSpacing:1}}>
                {currentPickTeam.name} {isMyTurn ? "— YOUR TURN 🎯" : ""}
              </div>
              {transfers.pickDeadline && <Timer deadline={transfers.pickDeadline} label="TO MAKE A PICK" />}
            </div>
          )}

          {phase === "done" && (
            <div style={{background:"#2ECC7111",border:"1px solid #2ECC7133",borderRadius:12,padding:16,marginBottom:16,textAlign:"center"}}>
              <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:20,fontWeight:700,color:"#2ECC71"}}>✅ TRADE PHASE COMPLETE</div>
              <div style={{fontSize:12,color:"#4A5E78",marginTop:4}}>All trades finalised for Week {transfers.weekNum}</div>
            </div>
          )}

          {/* ── LIVE TRACK ──────────────────────────────────────────────── */}
          <div style={{background:"#0E1521",borderRadius:12,border:"1px solid #1E2D45",padding:16,marginBottom:16}}>
            <div style={{fontSize:11,color:"#F5A623",letterSpacing:2,fontWeight:700,marginBottom:14}}>📡 LIVE TRADE TRACK</div>
            {sortedTeams.map(team => {
              const released = getReleasedPlayers(team.id);
              if (released.length === 0) return null;
              const pairs = getTradedPairs(team.id);
              return (
                <div key={team.id} style={{marginBottom:14,paddingBottom:14,borderBottom:"1px solid #1E2D45"}}>
                  <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:14,fontWeight:700,color:team.color,letterSpacing:1,marginBottom:8}}>
                    {team.name}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {released.map(p => {
                      const pair = pairs.find(pr => pr.releasedPid === p.id);
                      const incoming = pair ? players.find(x => x.id === pair.pickedPid) : null;
                      const isIneligible = (transfers.ineligible||[]).includes(p.id);
                      return (
                        <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                          {/* Released player */}
                          <div style={{display:"flex",alignItems:"center",gap:5,background:"#FF3D5A11",border:"1px solid #FF3D5A33",borderRadius:8,padding:"5px 10px"}}>
                            <span style={{fontSize:12}}>⬇️</span>
                            <span style={{fontSize:12,color:"#FF3D5A",textDecoration:"line-through",fontWeight:700}}>{p.name}</span>
                            <TierBadge tier={p.tier} />
                            <span style={{fontSize:10,color:"#4A5E78"}}>{p.role}</span>
                          </div>

                          {/* Arrow + incoming or waiting */}
                          {incoming ? (
                            <>
                              <span style={{color:"#4A5E78",fontSize:14}}>→</span>
                              <div style={{display:"flex",alignItems:"center",gap:5,background:"#2ECC7111",border:"1px solid #2ECC7133",borderRadius:8,padding:"5px 10px"}}>
                                <span style={{fontSize:12}}>⬆️</span>
                                <span style={{fontSize:12,color:"#2ECC71",fontWeight:700}}>{incoming.name}</span>
                                <TierBadge tier={incoming.tier} />
                                <span style={{fontSize:10,color:"#4A5E78"}}>{incoming.role}</span>
                              </div>
                            </>
                          ) : isIneligible ? (
                            <>
                              <span style={{color:"#4A5E78",fontSize:14}}>→</span>
                              <div style={{background:"#4A5E7822",border:"1px solid #4A5E7844",borderRadius:8,padding:"5px 10px"}}>
                                <span style={{fontSize:11,color:"#4A5E78"}}>↩️ returned (passed)</span>
                              </div>
                            </>
                          ) : (
                            <>
                              <span style={{color:"#4A5E78",fontSize:14}}>→</span>
                              <div style={{background:"#F5A62311",border:"1px solid #F5A62333",borderRadius:8,padding:"5px 10px"}}>
                                <span style={{fontSize:11,color:"#F5A623",animation:"pulse 1.5s ease infinite"}}>⏳ waiting…</span>
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
            <div style={{background:"#0E1521",borderRadius:12,border:"1px solid #1E2D45",padding:14}}>
              <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,fontWeight:700,marginBottom:10}}>
                POOL ({sortedPool.length})
              </div>
              {sortedPool.length === 0 ? (
                <div style={{fontSize:12,color:"#4A5E78",textAlign:"center",padding:16}}>Pool empty</div>
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
                return (
                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:canPick?"#2ECC7111":"#080C14",borderRadius:8,border:"1px solid "+(canPick?"#2ECC7144":"#1E2D4544"),marginBottom:6}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                        <span style={{fontWeight:700,fontSize:12,color:"#E2EAF4"}}>{p.name}</span>
                        <TierBadge tier={p.tier} />
                        {isNewlyReleased && (
                          <span style={{fontSize:9,background:"#FF3D5A22",color:"#FF3D5A",border:"1px solid #FF3D5A44",borderRadius:4,padding:"1px 5px",fontWeight:700,letterSpacing:0.5}}>
                            RELEASED{releasedByTeam ? " · " + releasedByTeam.name : ""}
                          </span>
                        )}
                      </div>
                      <div style={{fontSize:10,color:"#4A5E78"}}>{p.iplTeam} • {p.role}</div>
                    </div>
                    {canPick && (
                      <button onClick={() => handlePickClick(p)}
                        style={{background:"#2ECC71",border:"none",borderRadius:6,padding:"5px 10px",color:"#080C14",fontSize:11,fontWeight:800,cursor:"pointer",flexShrink:0,fontFamily:"Barlow Condensed,sans-serif",letterSpacing:0.5}}>
                        PICK
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* My released players */}
            <div style={{background:"#0E1521",borderRadius:12,border:"1px solid #1E2D45",padding:14}}>
              <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,fontWeight:700,marginBottom:10}}>
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
                        <div key={p.id} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",background:traded?"#2ECC7111":ineligible?"#4A5E7822":"#080C14",borderRadius:8,border:"1px solid "+(traded?"#2ECC7144":ineligible?"#4A5E7844":"#1E2D44"),marginBottom:4}}>
                          <span style={{fontSize:11}}>{traded?"✅":ineligible?"↩️":"📤"}</span>
                          <div style={{flex:1}}>
                            <div style={{display:"flex",alignItems:"center",gap:4}}>
                              <span style={{fontWeight:700,fontSize:12,color:traded?"#2ECC71":ineligible?"#4A5E78":"#E2EAF4",textDecoration:traded?"line-through":"none"}}>{p.name}</span>
                              <TierBadge tier={p.tier} />
                            </div>
                            <div style={{fontSize:10,color:"#4A5E78"}}>{p.role}</div>
                          </div>
                          {traded && <span style={{fontSize:10,color:"#2ECC71",fontWeight:700}}>TRADED</span>}
                          {ineligible && !traded && <span style={{fontSize:10,color:"#4A5E78",fontWeight:700}}>RETURNED</span>}
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
            <div style={{background:"#0E1521",borderRadius:12,border:"2px solid #F5A62344",padding:16,marginBottom:16}}>
              <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:18,fontWeight:700,color:"#F5A623",marginBottom:6}}>🎯 YOUR TURN</div>
              <div style={{fontSize:12,color:"#4A5E78",marginBottom:12}}>
                Pick a player from the pool (highlighted green). Must be same role and same/lower tier as a player you released.
              </div>
              {canPass(myTeamId) && (
                <button onClick={handlePass}
                  style={{width:"100%",background:"#4A5E7822",border:"1px solid #4A5E78",borderRadius:10,padding:12,color:"#E2EAF4",fontFamily:"Barlow Condensed,sans-serif",fontWeight:800,fontSize:14,cursor:"pointer",letterSpacing:0.5}}>
                  PASS — No valid players in pool (your released players will return)
                </button>
              )}
            </div>
          )}

          {/* Trade summary */}
          <div style={{background:"#0E1521",borderRadius:12,border:"1px solid #1E2D45",padding:14}}>
            <div style={{fontSize:11,color:"#4A5E78",letterSpacing:2,fontWeight:700,marginBottom:10}}>TRADE ORDER</div>
            {sortedTeams.map((team, idx) => {
              const released = getReleasedPlayers(team.id);
              const pairs = getTradedPairs(team.id);
              const isCurrent = team.id === currentPickTeamId;
              return (
                <div key={team.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:isCurrent?team.color+"11":"transparent",borderRadius:8,marginBottom:4,border:isCurrent?"1px solid "+team.color+"33":"1px solid transparent"}}>
                  <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:13,color:"#4A5E78",minWidth:20}}>{idx+1}</div>
                  <div style={{flex:1}}>
                    <span style={{fontWeight:700,fontSize:13,color:isCurrent?team.color:"#E2EAF4"}}>{team.name}</span>
                    {isCurrent && <span style={{fontSize:10,color:team.color,marginLeft:6,fontWeight:700}}>← PICKING NOW</span>}
                  </div>
                  <div style={{fontSize:11,color:"#4A5E78"}}>{pairs.length}/{released.length} traded</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AUTO-OPEN PROMPT */}
      {showAutoOpenPrompt && (
        <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.95)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:800,padding:16}}>
          <div style={{background:"#141E2E",borderRadius:16,border:"1px solid #F5A62344",padding:24,width:"100%",maxWidth:380}}>
            <div style={{fontSize:28,marginBottom:8}}>⏰</div>
            <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:20,fontWeight:700,color:"#F5A623",marginBottom:8}}>TIME TO OPEN THE WINDOW</div>
            <div style={{fontSize:13,color:"#4A5E78",marginBottom:20}}>It's within the transfer window period (Sun 11:59 PM – Mon 11:00 AM IST). Do you want to open the release window now?</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowAutoOpenPrompt(false)}
                style={{flex:1,background:"transparent",border:"1px solid #1E2D45",borderRadius:8,padding:11,color:"#4A5E78",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>
                NOT YET
              </button>
              <button onClick={()=>{openReleaseManually();setShowAutoOpenPrompt(false);}}
                style={{flex:2,background:"linear-gradient(135deg,#F5A623,#FF8C00)",border:"none",borderRadius:8,padding:11,color:"#080C14",fontFamily:"Barlow Condensed,sans-serif",fontWeight:800,fontSize:15,cursor:"pointer"}}>
                📤 OPEN NOW
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM MODAL */}
      {confirmModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.95)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:800,padding:16}}>
          <div style={{background:"#141E2E",borderRadius:16,border:"1px solid #FF3D5A44",padding:24,width:"100%",maxWidth:380}}>
            <div style={{fontSize:22,marginBottom:12}}>⚠️</div>
            <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:18,fontWeight:700,color:"#FF3D5A",marginBottom:12}}>{confirmModal.message}</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setConfirmModal(null)}
                style={{flex:1,background:"transparent",border:"1px solid #1E2D45",borderRadius:8,padding:11,color:"#4A5E78",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>
                CANCEL
              </button>
              <button onClick={()=>{confirmModal.onConfirm();setConfirmModal(null);}}
                style={{flex:1,background:"#FF3D5A22",border:"1px solid #FF3D5A",borderRadius:8,padding:11,color:"#FF3D5A",fontFamily:"Barlow Condensed,sans-serif",fontWeight:800,fontSize:14,cursor:"pointer"}}>
                CONFIRM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PICK MODAL — choose which released player to swap */}
      {pickModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.97)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500,padding:16}}>
          <div style={{background:"#141E2E",borderRadius:16,border:"1px solid #1E2D45",padding:24,width:"100%",maxWidth:440}}>
            <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:20,fontWeight:700,color:"#2ECC71",letterSpacing:2,marginBottom:4}}>PICK PLAYER</div>
            <div style={{fontSize:12,color:"#4A5E78",marginBottom:6}}>
              Incoming: <strong style={{color:"#E2EAF4"}}>{pickModal.poolPlayer.name}</strong>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6,background:"#2ECC7111",border:"1px solid #2ECC7133",borderRadius:10,padding:"10px 14px",marginBottom:20}}>
              <span style={{fontSize:18}}>⬆️</span>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontWeight:700,color:"#2ECC71",fontSize:14}}>{pickModal.poolPlayer.name}</span>
                  <TierBadge tier={pickModal.poolPlayer.tier} />
                </div>
                <div style={{fontSize:11,color:"#4A5E78"}}>{pickModal.poolPlayer.role} • points reset to 0 • earns from next match</div>
              </div>
            </div>
            <div style={{fontSize:12,color:"#4A5E78",marginBottom:10}}>Select which of your released players goes out for them:</div>
            {pickModal.validMatches.map(rp => (
              <button key={rp.id} onClick={() => confirmTrade(pickModal.poolPlayer, rp)}
                style={{width:"100%",background:"#FF3D5A11",border:"1px solid #FF3D5A44",borderRadius:10,padding:12,marginBottom:8,cursor:"pointer",display:"flex",alignItems:"center",gap:10,textAlign:"left",fontFamily:"Barlow Condensed,sans-serif"}}>
                <span style={{fontSize:16}}>⬇️</span>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontWeight:700,fontSize:14,color:"#FF3D5A"}}>{rp.name}</span>
                    <TierBadge tier={rp.tier} />
                  </div>
                  <div style={{fontSize:11,color:"#4A5E78"}}>{rp.role} • points frozen at current total</div>
                </div>
              </button>
            ))}
            <button onClick={() => setPickModal(null)}
              style={{width:"100%",background:"transparent",border:"1px solid #1E2D45",borderRadius:10,padding:10,color:"#4A5E78",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer",marginTop:4}}>
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* FINAL CONFIRM MODAL */}
      {tradeConfirmModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.97)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:600,padding:16}}>
          <div style={{background:"#141E2E",borderRadius:16,border:"1px solid #1E2D45",padding:24,width:"100%",maxWidth:400}}>
            <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:20,fontWeight:700,color:"#F5A623",letterSpacing:2,marginBottom:16}}>CONFIRM TRADE</div>

            <div style={{background:"#2ECC7111",border:"1px solid #2ECC7133",borderRadius:10,padding:14,marginBottom:10,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:20}}>⬆️</span>
              <div>
                <div style={{fontSize:10,color:"#2ECC71",letterSpacing:1,marginBottom:2}}>JOINING YOUR SQUAD</div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontWeight:700,color:"#2ECC71",fontSize:15}}>{tradeConfirmModal.poolPlayer.name}</span>
                  <TierBadge tier={tradeConfirmModal.poolPlayer.tier} />
                </div>
                <div style={{fontSize:11,color:"#4A5E78"}}>{tradeConfirmModal.poolPlayer.role} • Points reset to 0 • earns from next match only</div>
              </div>
            </div>

            <div style={{background:"#FF3D5A11",border:"1px solid #FF3D5A33",borderRadius:10,padding:14,marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:20}}>⬇️</span>
              <div>
                <div style={{fontSize:10,color:"#FF3D5A",letterSpacing:1,marginBottom:2}}>LEAVING YOUR SQUAD</div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontWeight:700,color:"#FF3D5A",fontSize:15}}>{tradeConfirmModal.releasedPlayer.name}</span>
                  <TierBadge tier={tradeConfirmModal.releasedPlayer.tier} />
                </div>
                <div style={{fontSize:11,color:"#4A5E78"}}>{tradeConfirmModal.releasedPlayer.role} • Points frozen at current total • stays visible with ⬇️</div>
              </div>
            </div>

            <div style={{background:"#F5A62311",border:"1px solid #F5A62333",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:12,color:"#F5A623",textAlign:"center",fontWeight:700}}>
              ⚠️ This trade is permanent and cannot be undone this window
            </div>

            <div style={{display:"flex",gap:8}}>
              <button onClick={() => setTradeConfirmModal(null)}
                style={{flex:1,background:"transparent",border:"1px solid #1E2D45",borderRadius:8,padding:11,color:"#4A5E78",fontFamily:"Barlow Condensed,sans-serif",fontWeight:700,fontSize:14,cursor:"pointer"}}>CANCEL</button>
              <button onClick={executeTrade}
                style={{flex:2,background:"linear-gradient(135deg,#F5A623,#FF8C00)",border:"none",borderRadius:8,padding:11,color:"#080C14",fontFamily:"Barlow Condensed,sans-serif",fontWeight:800,fontSize:15,cursor:"pointer",letterSpacing:0.5}}>
                ✅ CONFIRM TRADE
              </button>
            </div>
          </div>
        </div>
      )}
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
    fontFamily: "Barlow Condensed,sans-serif",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    letterSpacing: 0.5,
  };
}
