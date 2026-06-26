export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const response = await fetch("https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY");
    const data = await response.json();

    res.status(200).json({
      image: data.url,
      title: data.title
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch NASA data" });
  }
}


/* 
export default async function handler(req, res) {
    try {
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({ error: "Missing date" });
        }

        // Convert date → fixed time (noon UTC for now)
        const time = `${date}T12:00`;

        const nasaURL = `https://svs.gsfc.nasa.gov/api/dialamoon/${time}`;

        const response = await fetch(nasaURL);
        const data = await response.json();

        // Only return what you need
        res.setHeader("Access-Control-Allow-Origin", "*");

        res.status(200).json({
            imageUrl: data.image.url,
            phase: data.phase,
            age: data.age
        });

    } catch (err) {
        res.status(500).json({ error: "NASA fetch failed" });
    }
}
*/