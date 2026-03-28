export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const r = await fetch("https://cricbuzz-cricket.p.rapidapi.com/mcenter/v1/149618/hscard", {
      headers: {
        "x-rapidapi-host": "cricbuzz-cricket.p.rapidapi.com",
        "x-rapidapi-key": process.env.RAPIDAPI_KEY,
      },
    });
    const data = await r.json();
    const inning1 = data.scorecard?.[0];
    res.json({
      sampleBatsman: inning1?.batsman?.slice(0,2) || [],
      sampleBowler: inning1?.bowler?.slice(0,2) || [],
      sampleFow: inning1?.fow?.slice(0,2) || [],
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
