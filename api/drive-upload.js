// api/drive-upload.js — Upload de fichiers vers Google Drive avec arborescence Année/Mois/Client
// Utilise un compte de service Google (variables d'env: GOOGLE_SA_EMAIL, GOOGLE_SA_KEY, DRIVE_ROOT_FOLDER)

const crypto = require('crypto');

// — Authentification compte de service : génère un access token via JWT —
async function getAccessToken() {
  const email = process.env.GOOGLE_SA_EMAIL;
  let key = process.env.GOOGLE_SA_KEY;
  if (!email || !key) throw new Error('Compte de service Google non configuré');
  key = key.replace(/\\n/g, '\n'); // restaurer les sauts de ligne de la clé privée

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = b64(header) + '.' + b64(claim);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const signature = signer.sign(key, 'base64url');
  const jwt = unsigned + '.' + signature;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + jwt,
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Auth Google échouée: ' + JSON.stringify(j));
  return j.access_token;
}

// — Trouver ou créer un sous-dossier —
async function findOrCreateFolder(token, name, parentId) {
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const sr = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
    headers: { Authorization: 'Bearer ' + token },
  });
  const sj = await sr.json();
  if (sj.files && sj.files.length) return sj.files[0].id;
  // Créer
  const cr = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const cj = await cr.json();
  if (!cj.id) throw new Error('Création dossier échouée: ' + JSON.stringify(cj));
  return cj.id;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const CRM_PWD = process.env.CRM_PASSWORD || 'irve2024';
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${CRM_PWD}`) return res.status(401).json({ error: 'Non autorisé' });

  try {
    const { fileName, fileData, mimeType, annee, mois, client } = req.body;
    if (!fileName || !fileData) return res.status(400).json({ error: 'Fichier manquant' });

    const ROOT = process.env.DRIVE_ROOT_FOLDER;
    if (!ROOT) return res.status(500).json({ error: 'DRIVE_ROOT_FOLDER non configuré' });

    const token = await getAccessToken();
    // Arborescence Année / Mois / Client
    const fAnnee = await findOrCreateFolder(token, String(annee), ROOT);
    const fMois = await findOrCreateFolder(token, String(mois), fAnnee);
    const fClient = await findOrCreateFolder(token, String(client), fMois);

    // Upload multipart
    const boundary = '----irve' + Date.now();
    const meta = { name: fileName, parents: [fClient] };
    const buffer = Buffer.from(fileData, 'base64');
    const pre = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`;
    const post = `\r\n--${boundary}--`;
    const body = Buffer.concat([Buffer.from(pre, 'utf8'), buffer, Buffer.from(post, 'utf8')]);

    const ur = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    const uj = await ur.json();
    if (!uj.id) throw new Error('Upload échoué: ' + JSON.stringify(uj));

    // Rendre lisible par lien
    await fetch(`https://www.googleapis.com/drive/v3/files/${uj.id}/permissions?supportsAllDrives=true`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });

    return res.status(200).json({ success: true, link: uj.webViewLink || `https://drive.google.com/file/d/${uj.id}/view`, id: uj.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
