// api/geocode.js — Vercel serverless function
//
// Proxies destination search to Geoapify's Geocoding API. The real API key
// lives only in this server-side environment variable (GEOAPIFY_API_KEY),
// set in Vercel: Project Settings → Environment Variables. It is never sent
// to the browser.
//
// Called by the client as: GET /api/geocode?text=Madrid

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    // This is the #1 cause of "works locally, breaks on Vercel": the env
    // var was never added to the Vercel project (or was added after the
    // last deploy — Vercel only injects vars present at build/deploy time).
    console.error("GEOAPIFY_API_KEY is not set in the environment.");
    return res.status(500).json({ error: "Server misconfigured: missing API key." });
  }

  const text = (req.query.text || "").toString().trim();
  if (!text) {
    return res.status(400).json({ error: "Missing required 'text' query parameter." });
  }

  const url =
    `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(text)}` +
    `&type=city&format=json&limit=1&apiKey=${apiKey}`;

  try {
    const upstream = await fetch(url);
    const data = await upstream.json();
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: "Upstream geocoding error.", details: data });
    }
    // Cache successful lookups briefly at the edge — cities don't move.
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
    return res.status(200).json(data);
  } catch (err) {
    console.error("Geocode proxy error:", err);
    return res.status(502).json({ error: "Could not reach geocoding service." });
  }
};
