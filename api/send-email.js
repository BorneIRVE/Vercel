const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

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
    console.log('tailles - etude:', (data.etude_pdf_b64||'').length, 'docx:', (data.docx_b64||'').length);

    // Convertir Word en PDF via LibreOffice
    let devisPdfB64 = null;
    if (data.docx_b64 && data.docx_b64.length > 100) {
      try {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'irve-'));
        const docxPath = path.join(tmpDir, 'devis.docx');
        const pdfPath  = path.join(tmpDir, 'devis.pdf');

        // Ãcrire le docx
        fs.writeFileSync(docxPath, Buffer.from(data.docx_b64, 'base64'));

        // Convertir avec LibreOffice
        execSync(`libreoffice --headless --convert-to pdf --outdir ${tmpDir} ${docxPath}`, { timeout: 25000 });

        if (fs.existsSync(pdfPath)) {
          devisPdfB64 = fs.readFileSync(pdfPath).toString('base64');
          console.log('Conversion LibreOffice OK - PDF:', devisPdfB64.length);
        }

        // Nettoyage
        fs.rmSync(tmpDir, { recursive: true });
      } catch(e) {
        console.error('LibreOffice error:', e.message);
        // Fallback: utiliser le PDF jsPDF si disponible
        devisPdfB64 = (data.devis_pdf_b64 && data.devis_pdf_b64.length > 100) ? data.devis_pdf_b64 : null;
      }
    }

    // PiÃ¨ces jointes
    const makeAtt = (b64, name) => (b64 && b64.length > 100) ? { name, content: b64 } : null;
    const attEtude = makeAtt(data.etude_pdf_b64, 'etude-irve-' + safeName + '-' + safeDate + '.pdf');
    const attDevisPdf  = makeAtt(devisPdfB64,    'devis-irve-' + safeName + '-' + safeDate + '.pdf');
    const attDocx  = makeAtt(data.docx_b64,      'devis-irve-' + safeName + '-' + safeDate + '.docx');

    console.log('PJ - etude:', !!attEtude, 'devis_pdf:', !!attDevisPdf, 'docx:', !!attDocx);

    // HTML client
    const htmlClient = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>'
      + '<body style="font-family:Arial,sans-serif;font-size:13px;color:#222;max-width:600px;margin:0 auto;padding:20px;">'
      + '<div style="background:#0a1628;color:white;padding:20px 24px;border-radius:8px;margin-bottom:20px;">'
      + '<h1 style="font-size:18px;margin:0 0 4px;font-weight:800;">Votre etude IRVE</h1>'
      + '<p style="font-size:11px;color:#8899bb;margin:0;">Etablie le ' + (data.date_etude||'') + '</p></div>'
      + '<p style="margin:0 0 12px;">Bonjour <strong>' + (data.nom||'') + '</strong>,</p>'
      + '<p style="margin:0 0 20px;line-height:1.6;">Veuillez trouver ci-joint votre etude tarifaire et votre devis d\'installation IRVE.</p>'
      + '<div style="background:#f5f9ff;border-left:4px solid #00875a;padding:16px 18px;border-radius:0 6px 6px 0;margin-bottom:20px;">'
      + '<p style="margin:0 0 8px;"><strong>Borne recommandee :</strong> ' + (data.borne_nom||'') + ' â ' + (data.borne_kw||'') + ' kW</p>'
      + '<p style="margin:0 0 8px;"><strong>Montant du devis :</strong> <span style="font-size:17px;font-weight:800;color:#00875a;">' + (data.devis_net||'') + ' EUR TTC</span></p>'
      + '<p style="margin:0 0 8px;"><strong>Meilleure offre :</strong> ' + (data.tarif_nom||'') + ' â ' + (data.tarif_off||'') + '</p>'
      + '<p style="margin:0;"><strong>Economie estimee :</strong> ' + (data.diff_actuel||'') + ' EUR/an</p></div>'
      + '<p style="margin:0 0 20px;line-height:1.6;">Ce devis est valable 30 jours. Contactez-nous pour toute question.</p>'
      + '<p style="margin:0;line-height:1.6;">Cordialement,<br><strong>' + (data.entreprise_nom||'IRVE Studio') + '</strong></p>'
      + '</body></html>';

    // HTML admin
    const lignesHtml = (data.lignes_devis||[]).map(l =>
      '<tr><td style="padding:5px 8px;border-bottom:1px solid #eee;">' + l.l + '</td>'
      + '<td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:right;">' + l.v + ' EUR HT</td></tr>'
    ).join('');
    const htmlAdmin = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>'
      + '<body style="font-family:Arial,sans-serif;font-size:13px;color:#222;max-width:640px;margin:0 auto;padding:20px;">'
      + '<div style="background:#0a1628;color:white;padding:16px 20px;border-radius:8px;margin-bottom:16px;">'
      + '<h1 style="font-size:16px;margin:0;">Nouvelle etude IRVE â ' + (data.nom||'') + '</h1>'
      + '<p style="font-size:11px;color:#8899bb;margin:4px 0 0;">Recue le ' + (data.date_etude||'') + '</p></div>'
      + '<p><strong>Email :</strong> ' + clientEmail + ' | <strong>Tel :</strong> ' + (data.tel||'-') + ' | <strong>CP :</strong> ' + (data.cp||'-') + '</p>'
      + '<p><strong>Installation :</strong> ' + (data.itype||'-') + ' | <strong>Bornes :</strong> ' + (data.nb_bornes||'1') + '</p>'
      + (data.msg ? '<p><strong>Message :</strong> ' + data.msg + '</p>' : '')
      + '<h3 style="margin:14px 0 6px;color:#00875a;">Devis</h3>'
      + '<table style="width:100%;border-collapse:collapse;font-size:12px;"><tbody>'
      + lignesHtml
      + '<tr><td style="padding:5px 8px;">TVA 5,5%</td><td style="padding:5px 8px;text-align:right;">' + (data.devis_tva||'') + ' EUR</td></tr>'
      + '<tr style="font-weight:800;background:#f0f0f0;"><td style="padding:6px 8px;">Total TTC</td><td style="padding:6px 8px;text-align:right;">' + (data.devis_ttc||'') + ' EUR</td></tr>'
      + (Number(data.devis_adv)>0 ? '<tr style="font-weight:800;color:#00875a;"><td style="padding:6px 8px;">Net ADVENIR</td><td style="padding:6px 8px;text-align:right;">' + (data.devis_net||'') + ' EUR</td></tr>' : '')
      + '</tbody></table>'
      + '<h3 style="margin:14px 0 6px;color:#00875a;">Recommandation</h3>'
      + '<p>' + (data.tarif_nom||'') + ' â ' + (data.tarif_off||'') + ' : ' + (data.facture_an||'') + ' EUR/an</p>'
      + '<p>vs actuel : ' + (data.diff_actuel||'') + ' EUR/an | Rentabilite : ' + (data.roi||'') + '</p>'
      + '</body></html>';

    const sendBrevo = async (to, toName, subject, htmlContent, atts) => {
      const validAtts = atts.filter(Boolean);
      const payload = { sender: {name:'IRVE Studio', email:MON_EMAIL}, to: [{email:to, name:toName}], subject, htmlContent };
      if (validAtts.length > 0) payload.attachment = validAtts;
      console.log('Envoi a', to, '- PJ:', validAtts.length);
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
        body: JSON.stringify(payload),
      });
      const txt = await r.text();
      console.log('Brevo', to, ':', r.status, txt.substring(0,100));
      if (!r.ok) throw new Error('Brevo ' + r.status + ': ' + txt.substring(0,100));
    };

    // Client : Ã©tude PDF + devis PDF (converti depuis Word)
    const errClient = await sendBrevo(clientEmail, data.nom,
      'Votre etude IRVE du ' + (data.date_etude||''),
      htmlClient, [attEtude, attDevisPdf]
    ).then(()=>null).catch(e=>e.message);

    // Admin : Ã©tude PDF + devis PDF + devis Word
    const errAdmin = await sendBrevo(MON_EMAIL, 'IRVE Studio',
      '[IRVE Studio] ' + (data.nom||'') + ' â ' + (data.date_etude||''),
      htmlAdmin, [attEtude, attDevisPdf, attDocx]
    ).then(()=>null).catch(e=>e.message);

    console.log('Resultats - client:', errClient||'OK', '- admin:', errAdmin||'OK');

    if (errClient && errAdmin) return res.status(500).json({ error: errClient });
    return res.status(200).json({ success: true });

  } catch(err) {
    console.error('Handler error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
