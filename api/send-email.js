module.exports.config = { api: { bodyParser: { sizeLimit: '10mb' } } };

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const data = req.body;
    if (!data || !data.nom || !data.email) return res.status(400).json({ error: 'Nom et email requis' });

    const BREVO_KEY = process.env.BREVO_API_KEY;
    const MON_EMAIL = process.env.MON_EMAIL;
    if (!BREVO_KEY || !MON_EMAIL) return res.status(500).json({ error: 'Variables manquantes' });

    const clientEmail = data.client_email || data.email;
    const safeName = (data.nom||'client').replace(/\s+/g,'-').replace(/[^a-zA-Z0-9-]/g,'');
    const safeDate = (data.date_etude||'').replace(/\//g,'-');

    console.log('client:', clientEmail, '| admin:', MON_EMAIL);
    console.log('tailles - etude:', (data.etude_pdf_b64||'').length, 'devis:', (data.devis_pdf_b64||'').length, 'docx:', (data.docx_b64||'').length);

    // Pièces jointes
    const makeAtt = (b64, name) => (b64 && b64.length > 500) ? { name, content: b64 } : null;
    const attEtude = makeAtt(data.etude_pdf_b64, 'etude-irve-' + safeName + '-' + safeDate + '.pdf');
    const attDevis = makeAtt(data.devis_pdf_b64, 'devis-irve-' + safeName + '-' + safeDate + '.pdf');
    const attDocx  = makeAtt(data.docx_b64,      'devis-irve-' + safeName + '-' + safeDate + '.docx');
    console.log('PJ - etude:', !!attEtude, 'devis_pdf:', !!attDevis, 'docx:', !!attDocx);

    // HTML client
    const htmlClient = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:Arial,sans-serif;font-size:13px;color:#222;max-width:600px;margin:0 auto;padding:20px;">'
      + '<div style="background:#0a1628;color:white;padding:16px 20px;border-radius:8px;margin-bottom:16px;">'
      + '<h1 style="font-size:16px;margin:0;">Votre etude IRVE</h1>'
      + '<p style="font-size:11px;color:#8899bb;margin:4px 0 0;">Etablie le ' + (data.date_etude||'') + '</p></div>'
      + '<p>Bonjour ' + (data.nom||'') + ',</p>'
      + '<p style="margin:12px 0;">Veuillez trouver ci-joint votre etude tarifaire et votre devis IRVE.</p>'
      + '<div style="background:#f5f9ff;border-left:4px solid #00875a;padding:14px 18px;border-radius:0 6px 6px 0;">'
      + '<p><strong>Borne :</strong> ' + (data.borne_nom||'') + ' — ' + (data.borne_kw||'') + ' kW</p>'
      + '<p style="margin-top:8px;"><strong>Devis :</strong> <span style="font-size:16px;font-weight:800;color:#00875a;">' + (data.devis_net||'') + ' EUR TTC</span></p>'
      + '<p style="margin-top:8px;"><strong>Meilleure offre :</strong> ' + (data.tarif_nom||'') + ' — ' + (data.tarif_off||'') + '</p>'
      + '<p style="margin-top:8px;"><strong>Economie estimee :</strong> ' + (data.diff_actuel||'') + ' EUR/an</p>'
      + '</div>'
      + '<p style="margin-top:16px;font-size:11px;color:#888;">Devis valable 30 jours.</p>'
      + '</body></html>';

    // HTML admin
    const lignesHtml = (data.lignes_devis||[]).map(l => '<tr><td style="padding:4px 6px;border-bottom:1px solid #eee;">' + l.l + '</td><td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:right;">' + l.v + ' EUR HT</td></tr>').join('');
    const htmlAdmin = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:Arial,sans-serif;font-size:13px;color:#222;max-width:640px;margin:0 auto;padding:20px;">'
      + '<h2 style="color:#0a1628;">Nouvelle etude IRVE — ' + (data.nom||'') + '</h2>'
      + '<p><strong>Email client :</strong> ' + clientEmail + '</p>'
      + '<p><strong>Tel :</strong> ' + (data.tel||'-') + ' | <strong>CP :</strong> ' + (data.cp||'-') + '</p>'
      + '<p><strong>Installation :</strong> ' + (data.itype||'-') + ' | <strong>Bornes :</strong> ' + (data.nb_bornes||'1') + '</p>'
      + (data.msg ? '<p><strong>Message :</strong> ' + data.msg + '</p>' : '')
      + '<h3 style="color:#00875a;margin-top:16px;">Devis</h3>'
      + '<table style="width:100%;border-collapse:collapse;font-size:12px;"><tbody>'
      + lignesHtml
      + '<tr><td style="padding:4px 6px;border-bottom:1px solid #eee;">TVA 5,5%</td><td style="padding:4px 6px;text-align:right;">' + (data.devis_tva||'') + ' EUR</td></tr>'
      + '<tr><td style="padding:4px 6px;font-weight:700;">Total TTC</td><td style="padding:4px 6px;font-weight:700;text-align:right;">' + (data.devis_ttc||'') + ' EUR</td></tr>'
      + (Number(data.devis_adv)>0 ? '<tr><td style="padding:4px 6px;color:#00875a;font-weight:800;">Net ADVENIR</td><td style="padding:4px 6px;color:#00875a;font-weight:800;text-align:right;">' + (data.devis_net||'') + ' EUR</td></tr>' : '')
      + '</tbody></table>'
      + '<h3 style="color:#00875a;margin-top:16px;">Recommandation</h3>'
      + '<p>' + (data.tarif_nom||'') + ' — ' + (data.tarif_off||'') + ' : ' + (data.facture_an||'') + ' EUR/an | vs actuel : ' + (data.diff_actuel||'') + ' EUR/an</p>'
      + '<p>Rentabilite : ' + (data.roi||'') + ' | Cout 100km : ' + (data.c100km||'') + ' EUR</p>'
      + '</body></html>';

    const sendBrevo = async (to, toName, subject, htmlContent, atts) => {
      const validAtts = atts.filter(Boolean);
      const payload = {
        sender:      { name: 'IRVE Studio', email: MON_EMAIL },
        to:          [{ email: to, name: toName }],
        subject,
        htmlContent,
      };
      if (validAtts.length > 0) payload.attachment = validAtts;
      console.log('sendBrevo to:', to, '| atts:', validAtts.length);
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
        body:    JSON.stringify(payload),
      });
      const txt = await r.text();
      console.log('Brevo response', to, ':', r.status, txt.substring(0, 150));
      if (!r.ok) throw new Error('Brevo ' + r.status + ': ' + txt.substring(0, 100));
    };

    // Envoi 1 : email au client (etude PDF + devis PDF)
    const errClient = await sendBrevo(
      clientEmail, data.nom,
      'Votre etude IRVE du ' + (data.date_etude||''),
      htmlClient,
      [attEtude, attDevis]
    ).then(() => null).catch(e => e.message);

    console.log('Envoi client:', errClient || 'OK');

    // Envoi 2 : email admin (etude PDF + devis PDF + Word)
    const errAdmin = await sendBrevo(
      MON_EMAIL, 'IRVE Studio',
      '[IRVE Studio] ' + (data.nom||'') + ' — ' + (data.date_etude||''),
      htmlAdmin,
      [attEtude, attDevis, attDocx]
    ).then(() => null).catch(e => e.message);

    console.log('Envoi admin:', errAdmin || 'OK');

    if (errClient && errAdmin) {
      return res.status(500).json({ error: 'Echec total: client=' + errClient + ' admin=' + errAdmin });
    }
    if (errClient) {
      return res.status(500).json({ error: 'Echec envoi client: ' + errClient });
    }

    return res.status(200).json({ success: true });

  } catch(err) {
    console.error('Handler error:', err.message);
    return res.status(500).json({ error: err.message || 'Erreur interne' });
  }
};
