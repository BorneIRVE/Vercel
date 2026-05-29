// api/save-lead.js — Sauvegarde un lead dans Vercel KV

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const data = req.body;
    if (!data || !data.nom) return res.status(400).json({ error: 'Données manquantes' });

    const KV_URL   = process.env.KV_REST_API_URL;
    const KV_TOKEN = process.env.KV_REST_API_TOKEN;
    if (!KV_URL || !KV_TOKEN) return res.status(500).json({ error: 'KV non configuré' });

    const lead = {
      id:     Date.now(),
      date:   new Date().toLocaleDateString('fr-FR'),
      nom:    data.nom    || '-',
      email:  data.email  || '-',
      tel:    data.tel    || '-',
      cp:     data.cp     || '-',
      itype:  data.itype  || '-',
      nb_b:   data.nb_b   || '1',
      borne:  data.borne  || '-',
      devis:  data.devis  || '-',
      tarif:  data.tarif  || '-',
      roi:    data.roi    || '-',
      msg:    data.msg    || '',
      statut: 'nouveau',
      notes:  '',
      histo:  [{ date: new Date().toLocaleDateString('fr-FR'), action: 'Lead créé automatiquement' }],
    };

    // Lire les leads existants
    let leads = [];
    try {
      const r = await fetch(`${KV_URL}/get/crm_leads`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
      });
      const json = await r.json();
      if (json.result) leads = JSON.parse(json.result);
    } catch(e) { leads = []; }

    // Ajouter le nouveau lead en tête
    leads.unshift(lead);

    // Sauvegarder
    await fetch(`${KV_URL}/set/crm_leads`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(JSON.stringify(leads)),
    });

    console.log('Lead sauvegardé:', lead.nom, lead.email);
    return res.status(200).json({ success: true, id: lead.id });

  } catch(err) {
    console.error('save-lead error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
