/**
 * pointsUtils.js — Snatch & ownership-aware point calculations
 *
 * Single source of truth used by MVPStats, AllTimeXI, WeeklyReport.
 * Mirrors the logic in App.jsx getTeamTotal() exactly.
 *
 * Rules:
 *  - Team A (original owner): counts all matches EXCEPT those during active snatch period
 *  - Team B (snatcher):       counts ONLY matches during snatch window
 *  - After return:            Team A resumes counting; Team B shows frozen historical loan pts
 *  - ownershipLog is used for trade history; snatch is handled separately
 */

/**
 * Get all base points for a player that belong to a specific team,
 * respecting snatch windows and ownership log.
 *
 * @param {string}   pid           - player id
 * @param {string}   teamId        - fantasy team id
 * @param {object}   points        - full points store { [pid]: { [matchId]: { base, stats } } }
 * @param {object}   captains      - captains store { [matchId_teamId]: { captain, vc } }
 * @param {Array}    matches       - all match objects (need .id and .date)
 * @param {object}   ownershipLog  - { [pid]: [{ teamId, from, to }] }
 * @param {object}   snatch        - snatch store { active, history }
 * @param {string[]} [matchIds]    - optional — restrict to these match ids (for weekly calcs)
 * @param {boolean}  [useCapMult]  - apply captain/VC multiplier (default true)
 * @returns {number} points
 */
export function getOwnershipPts(pid, teamId, points, captains, matches, ownershipLog, snatch, matchIds, useCapMult = true) {
  const matchSet  = matchIds ? new Set(matchIds) : null;
  const periods   = (ownershipLog?.[pid] || []).filter(o => o.teamId === teamId);
  const active    = snatch?.active;
  const history   = snatch?.history || [];

  // ── Is this player currently snatched AWAY from this team? ──────────────
  const isSnatchedAway =
    active?.pid === pid &&
    (active?.fromTeamId === teamId ||
      (active?.fromTeamId !== teamId && /* player assigned to this team but snatching team is different */
        false)); // handled below via fromTeamId check

  const snatchedAwayFromThisTeam = active?.pid === pid && active?.fromTeamId === teamId;

  // ── Is this player currently snatched INTO this team? ───────────────────
  const snatchedIntoThisTeam = active?.pid === pid && active?.byTeamId === teamId;

  // ── Historical snatch: player was snatched away from this team, now returned ──
  const histAway = history.find(h => h.pid === pid && h.fromTeamId === teamId);

  // ── Historical snatch: player was snatched into this team, now returned ──
  const histIn   = history.find(h => h.pid === pid && h.byTeamId === teamId);

  // ────────────────────────────────────────────────────────────────────────
  // Case 1: Player currently snatched AWAY from this team → frozen total
  // ────────────────────────────────────────────────────────────────────────
  if (snatchedAwayFromThisTeam) {
    return active.pointsAtSnatch || 0;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Case 2: Player currently snatched INTO this team → only post-snatch pts
  // ────────────────────────────────────────────────────────────────────────
  if (snatchedIntoThisTeam) {
    const snatchDateStr = active.startDate?.split("T")[0] || "0000-01-01";
    let total = 0;
    for (const [mid, d] of Object.entries(points[pid] || {})) {
      if (matchSet && !matchSet.has(mid)) continue;
      const m = matches.find(x => x.id === mid);
      if (!m || m.date < snatchDateStr) continue;
      let pts = d.base || 0;
      if (useCapMult) {
        const cap = captains?.[mid + "_" + teamId] || {};
        if (cap.captain === pid) pts = Math.round(pts * 2);
        else if (cap.vc === pid) pts = Math.round(pts * 1.5);
      }
      total += pts;
    }
    return total;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Case 3: Historical snatch INTO this team → frozen loan pts only
  // ────────────────────────────────────────────────────────────────────────
  if (histIn && !histAway) {
    // Only return points earned during the loan window
    const snatchStart = histIn.startDate?.split("T")[0]  || "0000-01-01";
    const snatchEnd   = histIn.returnDate?.split("T")[0] || "9999-12-31";
    let total = 0;
    for (const [mid, d] of Object.entries(points[pid] || {})) {
      if (matchSet && !matchSet.has(mid)) continue;
      const m = matches.find(x => x.id === mid);
      if (!m) continue;
      if (m.date < snatchStart || m.date > snatchEnd) continue;
      let pts = d.base || 0;
      if (useCapMult) {
        const cap = captains?.[mid + "_" + teamId] || {};
        if (cap.captain === pid) pts = Math.round(pts * 2);
        else if (cap.vc === pid) pts = Math.round(pts * 1.5);
      }
      total += pts;
    }
    return total;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Case 4: Historical snatch AWAY from this team → all pts EXCEPT snatch window
  // ────────────────────────────────────────────────────────────────────────
  if (histAway) {
    const snatchStart = histAway.startDate?.split("T")[0]  || "0000-01-01";
    const snatchEnd   = histAway.returnDate?.split("T")[0] || "9999-12-31";
    let total = 0;
    for (const [mid, d] of Object.entries(points[pid] || {})) {
      if (matchSet && !matchSet.has(mid)) continue;
      const m = matches.find(x => x.id === mid);
      if (!m) continue;
      // Skip matches during snatch window
      if (m.date >= snatchStart && m.date <= snatchEnd) continue;
      // Check ownership for non-snatch periods
      const matchDate = new Date(m.date);
      const owned = periods.length === 0
        ? true
        : periods.some(o => matchDate >= new Date(o.from) && matchDate <= (o.to ? new Date(o.to) : new Date("2099-01-01")));
      if (!owned) continue;
      let pts = d.base || 0;
      if (useCapMult) {
        const cap = captains?.[mid + "_" + teamId] || {};
        if (cap.captain === pid) pts = Math.round(pts * 2);
        else if (cap.vc === pid) pts = Math.round(pts * 1.5);
      }
      total += pts;
    }
    return total;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Case 5: Normal — no snatch involved, use ownershipLog
  // ────────────────────────────────────────────────────────────────────────
  let total = 0;
  for (const [mid, d] of Object.entries(points[pid] || {})) {
    if (matchSet && !matchSet.has(mid)) continue;
    const m = matches.find(x => x.id === mid);
    if (!m) continue;
    const matchDate = new Date(m.date);
    const owned = periods.length === 0
      ? true // no log = original owner since season start
      : periods.some(o => matchDate >= new Date(o.from) && matchDate <= (o.to ? new Date(o.to) : new Date("2099-01-01")));
    if (!owned) continue;
    let pts = d.base || 0;
    if (useCapMult) {
      const cap = captains?.[mid + "_" + teamId] || {};
      if (cap.captain === pid) pts = Math.round(pts * 2);
      else if (cap.vc === pid) pts = Math.round(pts * 1.5);
    }
    total += pts;
  }
  return total;
}

/**
 * Get all player IDs that belong to a team across all time
 * (current assignments + ownership log + snatch history).
 */
export function getAllTeamPids(teamId, players, assignments, ownershipLog, snatch) {
  const pids = new Set();

  // Currently assigned
  for (const p of players) {
    if (assignments[p.id] === teamId) pids.add(p.id);
  }

  // Ever owned via ownershipLog (trades)
  for (const [pid, periods] of Object.entries(ownershipLog || {})) {
    if (periods.some(o => o.teamId === teamId)) pids.add(pid);
  }

  // Currently snatched into this team
  if (snatch?.active?.byTeamId === teamId) pids.add(snatch.active.pid);

  // Historically snatched into this team
  for (const h of (snatch?.history || [])) {
    if (h.byTeamId === teamId) pids.add(h.pid);
  }

  return [...pids];
}

/**
 * Determine snatch status of a player relative to a team.
 * Returns: "active-away" | "active-in" | "hist-away" | "hist-in" | null
 */
export function getSnatchStatus(pid, teamId, snatch) {
  const active  = snatch?.active;
  const history = snatch?.history || [];

  if (active?.pid === pid) {
    if (active.fromTeamId === teamId) return "active-away";
    if (active.byTeamId   === teamId) return "active-in";
  }
  const h = history.find(h => h.pid === pid);
  if (h) {
    if (h.fromTeamId === teamId) return "hist-away";
    if (h.byTeamId   === teamId) return "hist-in";
  }
  return null;
}
