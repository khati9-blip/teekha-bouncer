export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // Check one squad in detail - CSK squadId 99705
    const r = await fetch("https://cricbuzz-cricket.p.rapidapi.com/series/v1/9241/squads/99705", {
      headers: {
        "x-rapidapi-host": "cricbuzz-cricket.p.rapidapi.com",
        "x-rapidapi-key": process.env.RAPIDAPI_KEY,
      },
    });
    const data = await r.json();
    res.json({ keys: Object.keys(data), sample: JSON.stringify(data).slice(0, 2000) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
