// api/avis.js — Récupère les avis Google Places (quand l'API est configurée)
// Nécessite la variable d'environnement GOOGLE_PLACES_API_KEY sur Vercel.
// Tant que la clé n'est pas définie, renvoie une liste vide (le site garde les avis manuels).
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  res.setHeader('Cache-Control', 's-maxage=3600'); // cache 1h

  const KEY = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = (req.query.placeId || '').trim();
  if (!KEY) return res.status(200).json({ avis: [], note: null, lien: null, info: 'API Google Places non configurée' });
  if (!placeId) return res.status(400).json({ error: 'placeId requis' });

  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=rating,reviews,url&language=fr&key=${KEY}`;
    const r = await fetch(url);
    const j = await r.json();
    if (j.status !== 'OK') return res.status(200).json({ avis: [], note: null, lien: null, info: j.status });
    const result = j.result || {};
    // Ne garder que les avis 4-5 étoiles, max 6
    const avis = (result.reviews || [])
      .filter(a => a.rating >= 4)
      .slice(0, 6)
      .map(a => ({ author_name: a.author_name, rating: a.rating, text: a.text }));
    return res.status(200).json({ avis, note: result.rating || null, lien: result.url || null });
  } catch (err) {
    return res.status(200).json({ avis: [], note: null, lien: null, error: err.message });
  }
};
