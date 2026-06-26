export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");

    try {
        let { date } = req.query;

        // fallback to current time
        if (!date) {
            date = new Date().toISOString();
        }

        // 🔑 IMPORTANT: Dial-a-moon expects minute precision (no seconds/ms)
        const formattedDate = new Date(date)
            .toISOString()
            .slice(0, 16); // YYYY-MM-DDTHH:mm

        const nasaUrl = `https://svs.gsfc.nasa.gov/api/dialamoon/${formattedDate}`;

        const nasaRes = await fetch(nasaUrl);

        if (!nasaRes.ok) {
            throw new Error("NASA API failed");
        }

        const data = await nasaRes.json();

        return res.status(200).json({
            image: data.image?.url,
            phase: data.phase,
            date: data.time,
            frame: data.image?.filename?.match(/\d+/)?.[0] || null
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to fetch moon data" });
    }
}