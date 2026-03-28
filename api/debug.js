export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // Test scorecard for match 149618 (SRH vs RCB)
    const r = await fetch("https://cricbuzz-cricket.p.rapidapi.com/mcenter/v1/149618/full-scorecard", {
      headers: {
        "x-rapidapi-host": "cricbuzz-cricket.p.rapidapi.com",
        "x-rapidapi-key": process.env.RAPIDAPI_KEY,
      },
    });
    const data = await r.json();
    // Return first innings batting summary
    const inning1 = data.scoreCard?.[0];
    const batsmen = inning1?.batTeamDetails?.batsmenData ? Object.values(inning1.batTeamDetails.batsmenData).slice(0,3) : [];
    const bowlers = inning1?.bowlTeamDetails?.bowlersData ? Object.values(inning1.bowlTeamDetails.bowlersData).slice(0,3) : [];
    res.json({ topLevelKeys: Object.keys(data), inningKeys: inning1 ? Object.keys(inning1) : [], batsmen, bowlers });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
