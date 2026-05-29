module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const KV_URL   = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  const CRM_PWD  = process.env.CRM_PASSWORD || 'irve2024';

  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${CRM_PWD}`) return res.status(401).json({ error: 'Non autorisé' });

  try {
    const { depenses } = req.body;
    if (!Array.isArray(depenses)) return res.status(400).json({ error: 'Format invalide' });

    const r = await fetch(`${KV_URL}/set/irve_depenses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(JSON.stringify(depenses)),
    });
    const json = await r.json();
    console.log('Dépenses sauvegardées:', depenses.length, '-', JSON.stringify(json));
    return res.status(200).json({ success: true });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
};
