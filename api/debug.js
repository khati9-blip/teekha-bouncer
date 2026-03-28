export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // Fetch live matches to find IPL series ID
    const liveRes = await fetch("https://cricbuzz-cricket.p.rapidapi.com/matches/v1/live", {
      headers: {
        "x-rapidapi-host": "cricbuzz-cricket.p.rapidapi.com",
        "x-rapidapi-key": process.env.RAPIDAPI_KEY,
      },
    });
    const liveData = await liveRes.json();

    // Find all series names
    const seriesFound = [];
    const walk = (obj, depth=0) => {
      if (!obj || typeof obj !== "object" || depth > 8) return;
      if (Array.isArray(obj)) { obj.forEach(o => walk(o, depth+1)); return; }
      const name = obj.seriesName || obj.name || "";
      if (name && (name.toLowerCase().includes("ipl") || name.toLowerCase().includes("premier"))) {
        seriesFound.push({ name, id: obj.seriesId || obj.id, keys: Object.keys(obj) });
      }
      Object.values(obj).forEach(v => walk(v, depth+1));
    };
    walk(liveData);

    res.json({ seriesFound, topLevelKeys: Object.keys(liveData) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
