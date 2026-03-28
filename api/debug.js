export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const endpoints = [
      "mcenter/v1/149618/commentary",
      "mcenter/v1/149618/hscard",
      "mcenter/v1/149618/leanback",
      "matches/v1/recent",
      "series/v1/9241/matches",
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
