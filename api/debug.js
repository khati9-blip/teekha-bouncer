export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // Try different scorecard endpoints
    const endpoints = [
      "mcenter/v1/149618/full-scorecard",
      "mcenter/v1/149618/scorecard",
      "matches/v1/149618/scorecard",
    ];

    const results = {};
    for (const ep of endpoints) {
      const r = await fetch(`https://cricbuzz-cricket.p.rapidapi.com/${ep}`, {
        headers: {
          "x-rapidapi-host": "cricbuzz-cricket.p.rapidapi.com",
          "x-rapidapi-key": process.env.RAPIDAPI_KEY,
        },
      });
      const data = await r.json();
      results[ep] = { status: r.status, keys: Object.keys(data), message: data.message || null };
    }
    res.json(results);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
