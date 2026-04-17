// Supabase Edge Function — Snatch Auto-Return
// Runs every minute via cron: "* * * * *"
// Dynamically handles ALL pitches — reads pitch list from Supabase
// Each pitch can have its own snatch return time via pitchConfig

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const headers = {
  "apikey": SUPABASE_SERVICE_KEY,
  "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function getKey(key: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/league_data?key=eq.${key}&select=value`,
    { headers }
  );
  const rows = await res.json();
  return rows[0]?.value ?? null;
}

async function setKey(key: string, value: unknown) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/league_data?key=eq.${key}`,
    { method: "PATCH", headers, body: JSON.stringify({ value }) }
  );
}

function parseReturnTime(timeStr: string) {
  const days: Record<string, number> = {
    Sunday:0, Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6
  };
  const defaults = { day: 5, hour: 23, minute: 58 }; // Friday 11:58 PM IST
  if (!timeStr) return defaults;
  try {
    const parts = timeStr.split(" ");
    const dayStr = parts[0];
    const ampm = parts[parts.length - 1];
    const hhmm = parts[parts.length - 2];
    const [hhStr, mmStr] = hhmm.split(":");
    let hour = parseInt(hhStr);
    const minute = parseInt(mmStr);
    if (ampm === "PM" && hour !== 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    return { day: days[dayStr] ?? 5, hour, minute };
  } catch { return defaults; }
}

async function processSnatchReturn(pitchId: string, currentDay: number, currentHour: number, currentMinute: number) {
  // Read pitch config for dynamic return time
  const pitchConfig = await getKey(`${pitchId}_pitchConfig`);
  const returnTimeStr = pitchConfig?.snatchReturn || "Friday 11:58 PM";
  const { day, hour, minute } = parseReturnTime(returnTimeStr);

  // Check if it's time for this pitch
  if (currentDay !== day || currentHour !== hour || currentMinute !== minute) return null;

  // Check for active snatch
  const snatch = await getKey(`${pitchId}_snatch`);
  if (!snatch?.active) return { pitchId, result: "no active snatch" };

  const { pid, fromTeamId, byTeamId, startDate } = snatch.active;
  const points = await getKey(`${pitchId}_points`);
  const matches = await getKey(`${pitchId}_matches`);
  const captains = await getKey(`${pitchId}_captains`);
  const assignments = await getKey(`${pitchId}_assignments`);
  const safePlayers = await getKey(`${pitchId}_safePlayers`) || {};
  const snatchDateStr = startDate.split("T")[0];

  let snatchWeekPts = 0;
  let correctPointsAtSnatch = 0;
  const playerPoints = points?.[pid] || {};

  for (const [mid, d] of Object.entries(playerPoints) as [string, any][]) {
    const match = (matches || []).find((m: any) => m.id === mid);
    if (!match) continue;
    if (match.date >= snatchDateStr) {
      const cap = captains?.[`${mid}_${byTeamId}`] || {};
      let pts = d.base || 0;
      if (cap.captain === pid) pts *= 2;
      else if (cap.vc === pid) pts *= 1.5;
      snatchWeekPts += Math.round(pts);
    } else {
      const cap = captains?.[`${mid}_${fromTeamId}`] || {};
      let pts = d.base || 0;
      if (cap.captain === pid) pts *= 2;
      else if (cap.vc === pid) pts *= 1.5;
      correctPointsAtSnatch += Math.round(pts);
    }
  }

  const newHistory = [...(snatch.history || []), {
    ...snatch.active,
    pointsAtSnatch: correctPointsAtSnatch,
    returnDate: new Date().toISOString(),
    snatchWeekPts,
  }];

  await setKey(`${pitchId}_snatch`, {
    ...snatch, active: null, history: newHistory,
    weekNum: (snatch.weekNum || 1) + 1
  });
  await setKey(`${pitchId}_assignments`, { ...assignments, [pid]: fromTeamId });

  const currentSafe = safePlayers[fromTeamId] || [];
  if (!currentSafe.includes(pid)) {
    await setKey(`${pitchId}_safePlayers`, {
      ...safePlayers, [fromTeamId]: [...currentSafe, pid]
    });
  }

  return { pitchId, result: "returned", pid, fromTeamId, byTeamId, snatchWeekPts, correctPointsAtSnatch };
}

Deno.serve(async () => {
  try {
    // Get current IST time
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    const ist = new Date(Date.now() + IST_OFFSET);
    const currentDay = ist.getUTCDay();
    const currentHour = ist.getUTCHours();
    const currentMinute = ist.getUTCMinutes();

    // Get all pitches dynamically
    const pitches = await getKey("pitches") || [];
    const pitchIds = pitches.map((p: any) => p.id).filter(Boolean);

    if (pitchIds.length === 0) {
      return new Response("No pitches found", { status: 200 });
    }

    // Process each pitch
    const results = await Promise.all(
      pitchIds.map((pitchId: string) =>
        processSnatchReturn(pitchId, currentDay, currentHour, currentMinute)
      )
    );

    const processed = results.filter(Boolean);
    return new Response(
      JSON.stringify({ processed, time: `Day ${currentDay} ${currentHour}:${String(currentMinute).padStart(2,"0")} IST` }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});
