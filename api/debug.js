export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // Get recent matches to find SRH vs RCB match ID
    const r = await fetch("https://cricbuzz-cricket.p.rapidapi.com/matches/v1/recent", {
      headers: {
        "x-rapidapi-host": "cricbuzz-cricket.p.rapidapi.com",
        "x-rapidapi-key": process.env.RAPIDAPI_KEY,
      },
    });
    const data = await r.json();

    // Find all IPL matches
    const iplMatches = [];
    const walk = (obj) => {
      if (!obj || typeof obj !== "object") return;
      if (Array.isArray(obj)) { obj.forEach(walk); return; }
      if (obj.matchId && obj.seriesName && obj.seriesName.includes("Premier")) {
        iplMatches.push({
          matchId: obj.matchId,
          desc: obj.matchDesc,
          team1: obj.team1?.teamSName,
          team2: obj.team2?.teamSName,
          state: obj.state,
          status: obj.status,
          date: obj.startDate,
        });
      }
      Object.values(obj).forEach(walk);
    };
    walk(data);

    res.json({ iplMatches });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
