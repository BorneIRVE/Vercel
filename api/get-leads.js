// api/get-leads.js — Lecture et mise à jour des leads depuis Vercel KV

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KV_URL   = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;
  const CRM_PWD  = process.env.CRM_PASSWORD || 'irve2024';
  if (!KV_URL || !KV_TOKEN) return res.status(500).json({ error: 'KV non configuré' });

  // ── GET — Lire les leads ─────────────────────
  if (req.method === 'GET') {
    // Vérifier le mot de passe dans le header
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${CRM_PWD}`) {
      return res.status(401).json({ error: 'Non autorisé' });
    }
    try {
      const r = await fetch(`${KV_URL}/get/crm_leads`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
      });
      const json = await r.json();
      const leads = json.result ? JSON.parse(json.result) : [];
      return res.status(200).json({ leads });
    } catch(err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST — Mettre à jour un lead (statut, notes) ─
  if (req.method === 'POST') {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${CRM_PWD}`) {
      return res.status(401).json({ error: 'Non autorisé' });
    }
    try {
      const { id, statut, notes, histo_action } = req.body;

      const r = await fetch(`${KV_URL}/get/crm_leads`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
      });
      const json = await r.json();
      let leads = json.result ? JSON.parse(json.result) : [];

      const lead = leads.find(l => l.id === id);
      if (!lead) return res.status(404).json({ error: 'Lead introuvable' });

      if (statut !== undefined) lead.statut = statut;
      if (notes  !== undefined) lead.notes  = notes;
      if (histo_action) {
        lead.histo = lead.histo || [];
        lead.histo.push({ date: new Date().toLocaleDateString('fr-FR'), action: histo_action });
      }

      await fetch(`${KV_URL}/set/crm_leads`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(JSON.stringify(leads)),
      });

      return res.status(200).json({ success: true });
    } catch(err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
