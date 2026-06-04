module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KV_URL   = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  const CRM_PWD  = process.env.CRM_PASSWORD || 'irve2024';

  console.log('get-leads - KV configuré:', !!KV_URL, !!KV_TOKEN);

  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: 'Base de données non configurée. Ajoutez KV_REST_API_URL et KV_REST_API_TOKEN dans Vercel.' });
  }

  // Vérifier le mot de passe
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${CRM_PWD}`) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  // GET — Lire les leads
  if (req.method === 'GET') {
    // Désactiver le cache navigateur
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    try {
      const r = await fetch(`${KV_URL}/get/crm_leads`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
      });
      const json = await r.json();
      console.log('KV GET status:', r.status, '- result type:', typeof json.result, '- value:', JSON.stringify(json).substring(0,200));
      let leads = [];
      if (json.result) {
        const raw = json.result;
        leads = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!Array.isArray(leads)) leads = [];
      }
      console.log('Leads retournés:', leads.length);
      return res.status(200).json({ leads });
    } catch(err) {
      console.error('get-leads GET error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — Créer ou mettre à jour un lead
  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const { id, statut, histo_action, _create } = body;

      const r = await fetch(`${KV_URL}/get/crm_leads`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
      });
      const json = await r.json();
      let leads = [];
      if (json.result) {
        const raw = json.result;
        leads = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!Array.isArray(leads)) leads = [];
      }

      // Création d'un nouveau lead (ex: sous-traitance saisie manuellement)
      if (_create) {
        const newLead = Object.assign({}, body);
        delete newLead._create;
        if (!newLead.id) newLead.id = Date.now();
        if (!newLead.date) newLead.date = new Date().toLocaleDateString('fr-FR');
        newLead.histo = [{ date: new Date().toLocaleDateString('fr-FR'), action: histo_action || 'Créé manuellement' }];
        delete newLead.histo_action;
        leads.push(newLead);
        await fetch(`${KV_URL}/set/crm_leads`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(leads),
        });
        return res.status(200).json({ success: true, id: newLead.id });
      }

      const lead = leads.find(l => l.id === id);
      if (!lead) return res.status(404).json({ error: 'Lead introuvable' });

      if (statut === '__delete__') {
        leads = leads.filter(l => l.id !== id);
      } else {
        // Mettre à jour tous les champs fournis (sauf id et histo_action)
        Object.keys(body).forEach(function(k){
          if (k === 'id' || k === 'histo_action') return;
          lead[k] = body[k];
        });
        if (histo_action) {
          lead.histo = lead.histo || [];
          lead.histo.push({ date: new Date().toLocaleDateString('fr-FR'), action: histo_action });
        }
      }

      await fetch(`${KV_URL}/set/crm_leads`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(leads),
      });

      return res.status(200).json({ success: true });
    } catch(err) {
      console.error('get-leads POST error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
