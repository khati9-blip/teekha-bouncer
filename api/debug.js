export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // Check squads endpoint for series 9241
    const squadsRes = await fetch("https://cricbuzz-cricket.p.rapidapi.com/series/v1/9241/squads", {
      headers: {
        "x-rapidapi-host": "cricbuzz-cricket.p.rapidapi.com",
        "x-rapidapi-key": process.env.RAPIDAPI_KEY,
      },
    });
    const squadsData = await squadsRes.json();
    res.json({ squadsData });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
