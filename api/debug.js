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
    const batArr = Array.isArray(inning1?.batsman) ? inning1.batsman : Object.values(inning1?.batsman||{});
    const bowlArr = Array.isArray(inning1?.bowler) ? inning1.bowler : Object.values(inning1?.bowler||{});
    res.json({
      sampleBatsman: batArr.slice(0,2),
      sampleBowler: bowlArr.slice(0,2),
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
