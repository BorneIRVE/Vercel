// api/drive-upload.js — Upload vers Google Drive via OAuth (compte perso gratuit)
// Variables d'env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, DRIVE_ROOT_FOLDER

// — Obtenir un access token à partir du refresh token —
async function getAccessToken() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  const refresh = process.env.GOOGLE_REFRESH_TOKEN;
  if (!id || !secret || !refresh) throw new Error('OAuth Google non configuré (CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN)');

  const params = new URLSearchParams({
    client_id: id,
    client_secret: secret,
    refresh_token: refresh,
    grant_type: 'refresh_token',
  });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Auth Google échouée: ' + JSON.stringify(j));
  return j.access_token;
}

async function findOrCreateFolder(token, name, parentId) {
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const sr = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers: { Authorization: 'Bearer ' + token },
  });
  const sj = await sr.json();
  if (sj.files && sj.files.length) return sj.files[0].id;
  const cr = await fetch('https://www.googleapis.com/drive/v3/files', {
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
    // Construire l'arborescence : annee / [mois peut contenir des sous-dossiers séparés par /] / client
    let parent = ROOT;
    const segments = [String(annee)].concat(String(mois).split('/')).concat([String(client)]);
    for (const seg of segments) {
      if (seg && seg.trim()) parent = await findOrCreateFolder(token, seg.trim(), parent);
    }
    const fClient = parent;

    const boundary = '----irve' + Date.now();
    const meta = { name: fileName, parents: [fClient] };
    const buffer = Buffer.from(fileData, 'base64');
    const pre = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`;
    const post = `\r\n--${boundary}--`;
    const body = Buffer.concat([Buffer.from(pre, 'utf8'), buffer, Buffer.from(post, 'utf8')]);

    const ur = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    const uj = await ur.json();
    if (!uj.id) throw new Error('Upload échoué: ' + JSON.stringify(uj));

    await fetch(`https://www.googleapis.com/drive/v3/files/${uj.id}/permissions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });

    return res.status(200).json({ success: true, link: uj.webViewLink || `https://drive.google.com/file/d/${uj.id}/view`, id: uj.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
