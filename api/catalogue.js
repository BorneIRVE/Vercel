// api/catalogue.js — Stocke catalogue (bornes), tarifs et options, partagés CRM + configurateur

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KV_URL   = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  const CRM_PWD  = process.env.CRM_PASSWORD || 'irve2024';
  if (!KV_URL || !KV_TOKEN) return res.status(500).json({ error: 'KV non configuré' });

  // GET — lecture publique (le configurateur en a besoin sans mot de passe)
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const r = await fetch(`${KV_URL}/get/irve_catalogue`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
      const json = await r.json();
      let data = null;
      if (json.result) {
        const raw = json.result;
        data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      }
      return res.status(200).json({ catalogue: data });
    } catch(err) { return res.status(500).json({ error: err.message }); }
  }

  // POST — sauvegarde protégée par mot de passe
  if (req.method === 'POST') {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${CRM_PWD}`) return res.status(401).json({ error: 'Non autorisé' });
    try {
      const data = req.body; // { bornes:[...], tarifs:{...}, options:[...] }
      await fetch(`${KV_URL}/set/irve_catalogue`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(JSON.stringify(data)),
      });
      return res.status(200).json({ success: true });
    } catch(err) { return res.status(500).json({ error: err.message }); }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
