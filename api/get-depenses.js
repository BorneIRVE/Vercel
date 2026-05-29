module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KV_URL   = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  const CRM_PWD  = process.env.CRM_PASSWORD || 'irve2024';

  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${CRM_PWD}`) return res.status(401).json({ error: 'Non autorisé' });

  res.setHeader('Cache-Control', 'no-store');
  try {
    const r = await fetch(`${KV_URL}/get/irve_depenses`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
    const json = await r.json();
    let depenses = [];
    if (json.result) {
      const raw = json.result;
      depenses = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(depenses)) depenses = [];
    }
    return res.status(200).json({ depenses });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
};
