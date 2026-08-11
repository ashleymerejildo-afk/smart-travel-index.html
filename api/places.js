// api/places.js — Vercel serverless function
//
// Proxies nearby-places search to Geoapify's Places API. Same rationale as
// api/geocode.js: keeps GEOAPIFY_API_KEY out of the client bundle.
//
// Called by the client as:
// GET /api/places?categories=...&lat=..&lng=..&radius=1500&limit=100

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    console.error("GEOAPIFY_API_KEY is not set in the environment.");
    return res.status(500).json({ error: "Server misconfigured: missing API key." });
  }

  const { categories, lat, lng, radius, limit } = req.query;
  const latNum = Number(lat), lngNum = Number(lng);

  if (!categories || !Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return res.status(400).json({ error: "Missing or invalid 'categories', 'lat', or 'lng'." });
  }

  // Clamp inputs the client controls, so this endpoint can't be abused to
  // pull absurdly large radii/limits against our API quota.
  const safeRadius = Math.min(Math.max(Number(radius) || 1500, 100), 5000);
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 100);

  const url =
    `https://api.geoapify.com/v2/places?categories=${encodeURIComponent(categories)}` +
    `&filter=circle:${lngNum},${latNum},${safeRadius}` +
    `&bias=proximity:${lngNum},${latNum}` +
    `&limit=${safeLimit}&apiKey=${apiKey}`;

  try {
    const upstream = await fetch(url);
    const data = await upstream.json();
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: "Upstream places error.", details: data });
    }
    res.setHeader("Cache-Control", "public, max-age=120, s-maxage=600");
    return res.status(200).json(data);
  } catch (err) {
    console.error("Places proxy error:", err);
    return res.status(502).json({ error: "Could not reach places service." });
  }
};
