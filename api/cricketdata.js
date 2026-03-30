export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { path, matchId, matchid } = req.query;
  if (!path) return res.status(400).json({ error: "Missing path" });

  // Build URL with all query params except 'path'
  const params = new URLSearchParams();
  if (matchId) params.set('matchid', matchId);
  if (matchid) params.set('matchid', matchid);

  const paramStr = params.toString();
  const url = "https://cricket-api-free-data.p.rapidapi.com/" + path + (paramStr ? "?" + paramStr : "");

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-rapidapi-host": "cricket-api-free-data.p.rapidapi.com",
        "x-rapidapi-key": process.env.RAPIDAPI_KEY,
      },
    });
    const data = await response.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
