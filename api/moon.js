export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const now = new Date();

    // Get day of year
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now - start;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);

    const hour = now.getUTCHours();

    // NASA frame calculation
    const frame = dayOfYear * 24 + hour;

    // Pad to 4 digits
    const frameStr = String(frame).padStart(4, "0");

    // ✅ 2026 dataset (stable)
    const baseUrl =
      "https://svs.gsfc.nasa.gov/vis/a000000/a005400/a005415/frames/730x730_1x1_30p/";

    const imageUrl = `${baseUrl}moon.${frameStr}.jpg`;

    res.status(200).json({
      image: imageUrl,
      frame: frameStr,
      date: now.toISOString()
    });

  } catch (error) {
    res.status(500).json({ error: "Failed to generate moon image" });
  }
}


/* 

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

*/