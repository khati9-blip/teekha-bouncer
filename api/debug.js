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
    const batsmen = inning1?.batTeamDetails?.batsmenData 
      ? Object.values(inning1.batTeamDetails.batsmenData).slice(0,2)
      : [];
    const bowlers = inning1?.bowlTeamDetails?.bowlersData
      ? Object.values(inning1.bowlTeamDetails.bowlersData).slice(0,2)
      : [];
    res.json({ 
      scorecardKeys: data.scorecard?.[0] ? Object.keys(data.scorecard[0]) : [],
      batTeamDetailsKeys: inning1?.batTeamDetails ? Object.keys(inning1.batTeamDetails) : [],
      sampleBatsman: batsmen[0] || null,
      sampleBowler: bowlers[0] || null,
      innings: data.scorecard?.length
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
