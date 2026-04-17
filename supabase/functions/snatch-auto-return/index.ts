// Supabase Edge Function — Snatch Auto-Return
// Runs every Friday at 6:28 PM UTC (= 11:58 PM IST)
// Automatically returns snatched player to original team

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PITCH_ID = "p1"; // Update if you have multiple pitches

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
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ value }),
    }
  );
}

Deno.serve(async () => {
  try {
    const snatch = await getKey(`${PITCH_ID}_snatch`);

    if (!snatch?.active) {
      return new Response("No active snatch", { status: 200 });
    }

    const { pid, fromTeamId, byTeamId, pointsAtSnatch, startDate } = snatch.active;

    // Load points and matches
    const points = await getKey(`${PITCH_ID}_points`);
    const matches = await getKey(`${PITCH_ID}_matches`);
    const captains = await getKey(`${PITCH_ID}_captains`);
    const assignments = await getKey(`${PITCH_ID}_assignments`);
    const safePlayers = await getKey(`${PITCH_ID}_safePlayers`) || {};

    const snatchDateStr = startDate.split("T")[0];

    // Calculate snatchWeekPts — points earned by borrowing team during snatch week
    let snatchWeekPts = 0;
    const playerPoints = points?.[pid] || {};
    for (const [mid, d] of Object.entries(playerPoints) as [string, any][]) {
      const match = (matches || []).find((m: any) => m.id === mid);
      if (!match || match.date < snatchDateStr) continue;
      const cap = captains?.[`${mid}_${byTeamId}`] || {};
      let pts = d.base || 0;
      if (cap.captain === pid) pts *= 2;
      else if (cap.vc === pid) pts *= 1.5;
      snatchWeekPts += Math.round(pts);
    }

    // Calculate correct pointsAtSnatch — pre-snatch points for original team
    let correctPointsAtSnatch = 0;
    for (const [mid, d] of Object.entries(playerPoints) as [string, any][]) {
      const match = (matches || []).find((m: any) => m.id === mid);
      if (!match || match.date >= snatchDateStr) continue;
      const cap = captains?.[`${mid}_${fromTeamId}`] || {};
      let pts = d.base || 0;
      if (cap.captain === pid) pts *= 2;
      else if (cap.vc === pid) pts *= 1.5;
      correctPointsAtSnatch += Math.round(pts);
    }

    // Archive to history
    const newHistory = [
      ...(snatch.history || []),
      {
        ...snatch.active,
        pointsAtSnatch: correctPointsAtSnatch,
        returnDate: new Date().toISOString(),
        snatchWeekPts,
      },
    ];

    // Update snatch — clear active, add to history
    await setKey(`${PITCH_ID}_snatch`, {
      ...snatch,
      active: null,
      history: newHistory,
      weekNum: (snatch.weekNum || 1) + 1,
    });

    // Return player to original team in assignments
    const newAssignments = { ...assignments, [pid]: fromTeamId };
    await setKey(`${PITCH_ID}_assignments`, newAssignments);

    // Mark player as SAFE for original team
    const currentSafe = safePlayers[fromTeamId] || [];
    if (!currentSafe.includes(pid)) {
      const newSafe = { ...safePlayers, [fromTeamId]: [...currentSafe, pid] };
      await setKey(`${PITCH_ID}_safePlayers`, newSafe);
    }

    console.log(`✅ Snatch auto-return complete: ${pid} returned to ${fromTeamId}, snatchWeekPts=${snatchWeekPts}, pointsAtSnatch=${correctPointsAtSnatch}`);

    return new Response(
      JSON.stringify({ success: true, pid, fromTeamId, byTeamId, snatchWeekPts, pointsAtSnatch: correctPointsAtSnatch }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Snatch auto-return failed:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});
