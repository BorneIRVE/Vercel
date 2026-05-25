// api/send-email.js — Vercel Serverless Function (CommonJS)
// Envoi email via Brevo API v3 avec pièces jointes PDF + Word

module.exports = async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const data = req.body;

    if (!data || !data.nom || !data.email) {
      return res.status(400).json({ error: 'Nom et email requis' });
    }

    const BREVO_KEY = process.env.BREVO_API_KEY;
    const MON_EMAIL = process.env.MON_EMAIL;

    if (!BREVO_KEY || !MON_EMAIL) {
      return res.status(500).json({ error: 'Variables manquantes : BREVO_API_KEY et MON_EMAIL' });
    }

    // HTML email
    const lignesHtml = (data.lignes_devis || []).map(function(l) {
      return '<tr><td>' + l.l + '</td><td style="text-align:right;font-weight:600;">' + l.v + ' EUR HT</td></tr>';
    }).join('');

    const classHtml = (data.classement || []).map(function(r, i) {
      var bg   = i === 0 ? 'background:#e8fff4;font-weight:700;' : (i % 2 === 0 ? 'background:#f8f8f8;' : '');
      var dc   = i === 0 ? '#00875a' : '#555';
      var difc = String(r.diff || '').startsWith('-') ? '#00875a' : '#c0392b';
      return '<tr style="' + bg + '"><td style="color:' + dc + ';">' + (i === 0 ? '*' : i + 1) + '</td>'
        + '<td>' + r.n + '</td><td>' + r.o + '</td>'
        + '<td style="text-align:right;">' + r.ft + ' EUR</td>'
        + '<td style="text-align:right;color:' + difc + ';">' + r.diff + ' EUR</td></tr>';
    }).join('');

    var advRow = Number(data.devis_adv) > 0
      ? '<tr style="font-weight:800;color:#00875a;"><td>Net apres prime ADVENIR</td><td style="text-align:right;">' + data.devis_net + ' EUR</td></tr>'
      : '';

    var msgRow = data.msg
      ? '<div class="row"><span class="lbl">Message</span><span class="val">' + data.msg + '</span></div>'
      : '';

    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>'
      + 'body{font-family:Arial,sans-serif;font-size:13px;color:#222;max-width:620px;margin:0 auto;padding:20px;}'
      + '.hd{background:#0a1628;color:white;padding:16px 20px;border-radius:8px;margin-bottom:16px;}'
      + '.hd h1{font-size:16px;margin:0;}.hd p{font-size:11px;color:#8899bb;margin:4px 0 0;}'
      + '.bloc{background:#f5f9ff;border-left:4px solid #00875a;padding:12px 16px;margin-bottom:12px;border-radius:0 6px 6px 0;}'
      + '.bloc h2{font-size:13px;font-weight:700;color:#00875a;margin:0 0 8px;}'
      + '.row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #e8e8e8;font-size:12px;}'
      + '.lbl{color:#888;}.val{font-weight:600;}'
      + 'table{width:100%;border-collapse:collapse;font-size:11px;margin-top:8px;}'
      + 'th{background:#0a1628;color:white;padding:5px 7px;text-align:left;font-size:10px;}'
      + 'td{padding:5px 7px;border-bottom:1px solid #eee;}'
      + '.ft{font-size:10px;color:#aaa;margin-top:14px;border-top:1px solid #eee;padding-top:8px;}'
      + '</style></head><body>'
      + '<div class="hd"><h1>Nouvelle etude IRVE - ' + data.nom + '</h1>'
      + '<p>Recue le ' + data.date_etude + ' via IRVE Studio</p></div>'
      + '<div class="bloc"><h2>Coordonnees client</h2>'
      + '<div class="row"><span class="lbl">Nom</span><span class="val">' + data.nom + '</span></div>'
      + '<div class="row"><span class="lbl">Email</span><span class="val">' + data.email + '</span></div>'
      + '<div class="row"><span class="lbl">Telephone</span><span class="val">' + (data.tel || '-') + '</span></div>'
      + '<div class="row"><span class="lbl">Code postal</span><span class="val">' + (data.cp || '-') + '</span></div>'
      + '<div class="row"><span class="lbl">Installation</span><span class="val">' + (data.itype || '-') + '</span></div>'
      + msgRow + '</div>'
      + '<div class="bloc"><h2>Devis borne retenue</h2>'
      + '<div class="row"><span class="lbl">Borne</span><span class="val">' + data.borne_nom + ' (' + data.borne_marque + ')</span></div>'
      + '<div class="row"><span class="lbl">Puissance</span><span class="val">' + data.borne_kw + ' kW - ' + data.nb_bornes + ' borne(s)</span></div>'
      + '<table><tbody>' + lignesHtml
      + '<tr><td>TVA 5,5%</td><td style="text-align:right;">' + data.devis_tva + ' EUR</td></tr>'
      + '<tr style="font-weight:700;"><td>Total TTC</td><td style="text-align:right;">' + data.devis_ttc + ' EUR</td></tr>'
      + advRow + '</tbody></table></div>'
      + '<div class="bloc"><h2>Recommandation tarifaire</h2>'
      + '<div class="row"><span class="lbl">Fournisseur</span><span class="val">' + data.tarif_nom + ' - ' + data.tarif_off + '</span></div>'
      + '<div class="row"><span class="lbl">Facture estimee</span><span class="val">' + data.facture_an + ' EUR/an</span></div>'
      + '<div class="row"><span class="lbl">vs actuel</span><span class="val">' + data.diff_actuel + ' EUR/an</span></div>'
      + '<div class="row"><span class="lbl">ROI borne</span><span class="val">' + data.roi + '</span></div>'
      + '<div class="row"><span class="lbl">Cout 100km VE</span><span class="val">' + data.c100km + ' EUR</span></div></div>'
      + '<div class="bloc"><h2>Classement des offres</h2>'
      + '<table><thead><tr><th>#</th><th>Fournisseur</th><th>Offre</th><th>Facture/an</th><th>Diff.</th></tr></thead>'
      + '<tbody>' + classHtml + '</tbody></table></div>'
      + '<div class="ft">IRVE Studio - Devis estimatif valable 30 jours - ' + data.date_etude + '</div>'
      + '</body></html>';

    // Pièces jointes
    var safeName = (data.nom || 'client').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
    var safeDate = (data.date_etude || '').replace(/\//g, '-');
    var attachments = [];

    if (data.pdf_b64) {
      attachments.push({ name: 'etude-irve-' + safeName + '-' + safeDate + '.pdf', content: data.pdf_b64 });
    }
    if (data.docx_b64) {
      attachments.push({ name: 'devis-irve-' + safeName + '-' + safeDate + '.docx', content: data.docx_b64 });
    }

    // Appel Brevo
    var brevoResp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
      body: JSON.stringify({
        sender:      { name: 'IRVE Studio', email: MON_EMAIL },
        to:          [{ email: MON_EMAIL, name: 'IRVE Studio' }],
        subject:     '[IRVE Studio] Nouvelle etude - ' + data.nom + ' - ' + data.date_etude,
        htmlContent: html,
        attachment:  attachments,
      }),
    });

    if (!brevoResp.ok) {
      var err = await brevoResp.json().catch(function() { return {}; });
      throw new Error(err.message || 'Brevo HTTP ' + brevoResp.status);
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('send-email error:', err.message);
    return res.status(500).json({ error: err.message || 'Erreur interne' });
  }
};
