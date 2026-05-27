// ── UTILITY FUNCTIONS ─────────────────────────────────────────────────────────

export function parseJSON(text) {
  const clean = text.replace(/^```json\s*/m, "").replace(/^```\s*/m, "").replace(/```\s*$/m, "").trim();
  try { return JSON.parse(clean); } catch {}
  const lastBrace = clean.lastIndexOf("},");
  if (lastBrace > 0) {
    try { return JSON.parse(clean.slice(0, lastBrace + 1) + "]"); } catch {}
  }
  const lastBrace2 = clean.lastIndexOf("}");
  if (lastBrace2 > 0) {
    try { return JSON.parse(clean.slice(0, lastBrace2 + 1) + "]"); } catch {}
  }
  throw new Error("Could not parse response as JSON");
}

// ── CRICBUZZ API ──────────────────────────────────────────────────────────────
export async function cricbuzz(path) {
  const res = await fetch(`/api/cricbuzz?path=${encodeURIComponent(path)}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export async function fetchLiveScorecard(matchId) {
  const data = await cricbuzz(`mcenter/v1/${matchId}/full-scorecard`);
  return data;
}

export function extractIPL(data) {
  const ipl = [];
  if (data && data.typeMatches) {
    for (const type of data.typeMatches) {
      for (const series of (type.seriesMatches || [])) {
        const sm = series.seriesAdWrapper || series;
        if (sm.seriesName && sm.seriesName.includes("Indian Premier League")) {
          for (const match of (sm.matches || [])) {
            ipl.push(match.matchInfo);
          }
        }
      }
    }
  }
  return ipl;
}

export function parseScorecardToStats(scorecard, playerIndex) {
  const stats = {};
  const nameToId = {};
  for (const p of playerIndex) {
    nameToId[p.name.toLowerCase()] = p.id;
    const parts = p.name.toLowerCase().split(" ");
    if (parts.length > 1) nameToId[parts[parts.length-1]] = p.id;
  }

  const findId = (name) => {
    if (!name) return null;
    const n = name.toLowerCase().trim();
    if (nameToId[n]) return nameToId[n];
    for (const [key, id] of Object.entries(nameToId)) {
      if (n.includes(key) || key.includes(n)) return id;
    }
    return null;
  };

  const ensure = (pid, name) => {
    if (!stats[pid]) stats[pid] = { playerId: pid, name, runs:0, balls:0, fours:0, sixes:0, wickets:0, economy:null, overs:0, maidens:0, catches:0, stumpings:0, runouts:0, longestSix:false, mom:false, playingXI:false, dismissed:false };
  };

  try {
    for (const inning of (scorecard.scoreCard || [])) {
      for (const batter of (inning.batTeamDetails?.batsmenData ? Object.values(inning.batTeamDetails.batsmenData) : [])) {
        const pid = findId(batter.batName);
        if (!pid) continue;
        ensure(pid, batter.batName);
        stats[pid].runs += batter.runs || 0;
        stats[pid].fours += batter.fours || 0;
        stats[pid].sixes += batter.sixes || 0;
      }
      for (const bowler of (inning.bowlTeamDetails?.bowlersData ? Object.values(inning.bowlTeamDetails.bowlersData) : [])) {
        const pid = findId(bowler.bowlName);
        if (!pid) continue;
        ensure(pid, bowler.bowlName);
        stats[pid].wickets += bowler.wickets || 0;
        stats[pid].overs += parseFloat(bowler.overs) || 0;
        const eco = parseFloat(bowler.economy);
        if (!isNaN(eco)) stats[pid].economy = stats[pid].economy ? (stats[pid].economy + eco) / 2 : eco;
      }
      for (const batter of (inning.batTeamDetails?.batsmenData ? Object.values(inning.batTeamDetails.batsmenData) : [])) {
        const wkt = batter.outDesc || "";
        if (wkt.startsWith("c ")) {
          const fielder = wkt.split("c ")[1]?.split(" b ")[0]?.trim();
          const pid = findId(fielder);
          if (pid) { ensure(pid, fielder); stats[pid].catches += 1; }
        }
        if (wkt.startsWith("st ")) {
          const keeper = wkt.split("st ")[1]?.split(" b ")[0]?.trim();
          const pid = findId(keeper);
          if (pid) { ensure(pid, keeper); stats[pid].stumpings += 1; }
        }
        if (wkt.toLowerCase().includes("run out")) {
          const match = wkt.match(/run out \(([^)]+)\)/i);
          if (match) {
            for (const name of match[1].split("/")) {
              const pid = findId(name.trim());
              if (pid) { ensure(pid, name.trim()); stats[pid].runouts += 1; }
            }
          }
        }
      }
    }
  } catch(e) { console.error("Scorecard parse error:", e); }

  return Object.values(stats);
}

// ── POINTS ────────────────────────────────────────────────────────────────────
export const DEFAULT_POINTS = {
  run:1, four:8, six:12, fifty:10, century:20,
  wicket:25, fourWkt:8, fiveWkt:15, ecoBonus:10, ecoThreshold:6, ecoMinOvers:2,
  catch:8, stumping:12, runout:12,
  allRoundMinRuns:30, allRoundMinWkts:2, allRoundBonus:15,
  longestSix:50, captainMult:2, vcMult:1.5,
  maiden:0,
  srBonus:0, srBonusThreshold:150, srBonusMinBalls:10,
  momBonus:0,
  playingXIBonus:0,
  duckPenalty:0,
  srPenalty:0, srPenaltyThreshold:60, srPenaltyMinBalls:10,
  ecoPenalty:0, ecoPenaltyThreshold:10,
};

export function calcPoints(s, cfg) {
  const c = cfg || DEFAULT_POINTS;
  let p = 0;
  const runs   = +s.runs      || 0;
  const fours  = +s.fours     || 0;
  const sixes  = +s.sixes     || 0;
  const wkts   = +s.wickets   || 0;
  const eco    = s.economy !== "" && s.economy != null ? +s.economy : null;
  const ovs    = +s.overs     || 0;
  const catches= +s.catches   || 0;
  const stump  = +s.stumpings || 0;
  const ro     = +s.runouts   || 0;

  p += runs * c.run;
  p += fours * c.four;
  p += sixes * c.six;
  if      (runs >= 100) p += c.century;
  else if (runs >= 50)  p += c.fifty;

  p += wkts * c.wicket;
  if      (wkts >= 5) p += c.fiveWkt;
  else if (wkts >= 4) p += c.fourWkt;
  if (ovs >= c.ecoMinOvers && eco !== null && eco < c.ecoThreshold) p += c.ecoBonus;

  p += catches * c.catch;
  p += (stump) * c.stumping;
  p += (ro) * c.runout;

  if (runs >= c.allRoundMinRuns && wkts >= c.allRoundMinWkts) p += c.allRoundBonus;
  if (s.longestSix) p += c.longestSix;

  const maidens = +s.maidens || 0;
  if (c.maiden) p += maidens * c.maiden;

  const balls = +s.balls || 0;
  if (balls >= (c.srBonusMinBalls||10) && runs > 0) {
    const sr = (runs / balls) * 100;
    if (c.srBonus && sr >= (c.srBonusThreshold||150)) p += c.srBonus;
    if (c.srPenalty && sr < (c.srPenaltyThreshold||60) && s.dismissed) p -= c.srPenalty;
  }

  if (s.mom && c.momBonus) p += c.momBonus;
  if (s.playingXI && c.playingXIBonus) p += c.playingXIBonus;
  if (c.duckPenalty && runs === 0 && s.dismissed) p -= c.duckPenalty;
  if (c.ecoPenalty && ovs >= c.ecoMinOvers && eco !== null && eco > (c.ecoPenaltyThreshold||10)) p -= c.ecoPenalty;

  return Math.round(p);
}

export function calcBreakdown(s) {
  const runs   = +s.runs      || 0;
  const fours  = +s.fours     || 0;
  const sixes  = +s.sixes     || 0;
  const wkts   = +s.wickets   || 0;
  const eco    = s.economy !== "" && s.economy != null ? +s.economy : null;
  const ovs    = +s.overs     || 0;
  const catches= +s.catches   || 0;
  const stump  = +s.stumpings || 0;
  const ro     = +s.runouts   || 0;
  const items = [];
  if (runs)    items.push(`${runs} runs = +${runs}`);
  if (fours)   items.push(fours + "x4 = +" + (fours * 8));
  if (sixes)   items.push(sixes + "x6 = +" + (sixes * 12));
  if (runs>=100) items.push(`Century bonus = +20`);
  else if (runs>=50) items.push(`Half-century bonus = +10`);
  if (wkts)    items.push(wkts + " wkts = +" + (wkts * 25));
  if (wkts>=5) items.push(`5-wkt haul = +15`);
  else if (wkts>=4) items.push(`4-wkt haul = +8`);
  if (ovs>=2 && eco!==null && eco<6) items.push(`Economy <6 = +10`);
  if (catches) items.push(catches + (catches>1?" catches":" catch") + " = +" + (catches * 8));
  if (stump)   items.push(stump + " stumping" + (stump>1?"s":"") + " = +" + (stump * 12));
  if (ro)      items.push(ro + " run-out" + (ro>1?"s":"") + " = +" + (ro * 12));
  if (runs>=30&&wkts>=2) items.push(`All-round bonus = +15`);
  if (s.longestSix) items.push(`Longest six = +50`);
  return items;
}

// ── SUPABASE ──────────────────────────────────────────────────────────────────
export const SUPABASE_URL = "https://rmcxhorijitrhqyrvvkn.supabase.co";
const SUPABASE_KEY = "sb_publishable_V-AVbMHELIebUlnMl5h3dA_Yn4YEoHm";
export const SB_HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": "Bearer " + SUPABASE_KEY,
};

const localCache = {};

export async function sbGet(rawKey) {
  if (localCache[rawKey] !== undefined) return localCache[rawKey];
  try {
    const res = await fetch(SUPABASE_URL + "/rest/v1/league_data?key=eq." + encodeURIComponent(rawKey) + "&select=key,value", {
      headers: SB_HEADERS,
    });
    const data = await res.json();
    const val = data?.[0]?.value ?? null;
    localCache[rawKey] = val;
    return val;
  } catch { return null; }
}

export async function sbGetMany(rawKeys) {
  const uncached = rawKeys.filter(k => localCache[k] === undefined);
  if (uncached.length > 0) {
    try {
      const inClause = uncached.map(k => `"${k}"`).join(",");
      const res = await fetch(
        SUPABASE_URL + "/rest/v1/league_data?key=in.(" + inClause + ")&select=key,value",
        { headers: SB_HEADERS }
      );
      const rows = await res.json();
      if (Array.isArray(rows)) {
        rows.forEach(row => { localCache[row.key] = row.value; });
      }
      uncached.forEach(k => { if (localCache[k] === undefined) localCache[k] = null; });
    } catch {
      uncached.forEach(k => { if (localCache[k] === undefined) localCache[k] = null; });
    }
  }
  return rawKeys.map(k => localCache[k] ?? null);
}

export async function sbSet(rawKey, val) {
  localCache[rawKey] = val;
  try {
    await fetch(SUPABASE_URL + "/rest/v1/league_data", {
      method: "POST",
      headers: { ...SB_HEADERS, "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify({ key: rawKey, value: val, updated_at: new Date().toISOString() }),
    });
  } catch(e) { console.warn("sbSet failed:", e.message); }
}

export async function sbDel(rawKey) {
  delete localCache[rawKey];
  try {
    await fetch(SUPABASE_URL + "/rest/v1/league_data?key=eq." + encodeURIComponent(rawKey), {
      method: "DELETE",
      headers: SB_HEADERS,
    });
  } catch(e) { console.warn("sbDel failed:", e.message); }
}



// ── HELPERS ───────────────────────────────────────────────────────────────────
export function generateTeamId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "TBL-";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function getSnatchWindowStatus() {
  const now = new Date();
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const istMs = now.getTime() + now.getTimezoneOffset() * 60000 + IST_OFFSET;
  const ist = new Date(istMs);
  const day = ist.getUTCDay();
  const hour = ist.getUTCHours();
  const min = ist.getUTCMinutes();
  const totalMins = hour * 60 + min;

  if (day === 6 && totalMins < 720) {
    const minsLeft = 720 - totalMins;
    const h = Math.floor(minsLeft / 60);
    const m = minsLeft % 60;
    return { open: true, label: "WINDOW OPEN", timeLeft: h + "h " + m + "m left" };
  }

  let daysUntilSat = (6 - day + 7) % 7;
  if (daysUntilSat === 0) daysUntilSat = 7;

  const todayMidnightIst = istMs - totalMins * 60000;
  const nextSatMidnightMs = todayMidnightIst + daysUntilSat * 24 * 60 * 60 * 1000;
  const diffMs = Math.max(0, nextSatMidnightMs - istMs);
  const diffMins = Math.floor(diffMs / 60000);

  const daysLeft = Math.floor(diffMins / 1440);
  const hoursLeft = Math.floor((diffMins % 1440) / 60);
  const minsLeft = diffMins % 60;

  let countdown = "";
  if (daysLeft > 0) countdown = daysLeft + "d " + hoursLeft + "h";
  else if (hoursLeft > 0) countdown = hoursLeft + "h " + minsLeft + "m";
  else if (minsLeft > 0) countdown = minsLeft + "m";
  else countdown = "opening soon";

  return { open: false, label: "WINDOW CLOSED", countdown: "Opens Sat 12:00 AM IST · " + countdown + " away" };
}

export async function getUsers() {
  const data = await sbGet("users");
  return Array.isArray(data) ? data : [];
}

export async function saveUsers(users) {
  await sbSet("users", users);
}

export async function hashPw(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
