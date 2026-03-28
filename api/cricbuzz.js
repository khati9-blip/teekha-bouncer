export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { path } = req.query;
  if (!path) return res.status(400).json({ error: "Missing path" });

  try {
    const response = await fetch(`https://cricbuzz-cricket.p.rapidapi.com/${path}`, {
      method: "GET",
      headers: {
        "x-rapidapi-host": "cricbuzz-cricket.p.rapidapi.com",
        "x-rapidapi-key": process.env.RAPIDAPI_KEY,
      },
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
