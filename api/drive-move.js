// api/drive-move.js — Déplace le dossier d'un client d'un statut vers un autre
// Body: { client, annee, mois, ancienStatut, nouveauStatut }
// Structure: ROOT / annee / statut / mois / client

async function getAccessToken() {
  const id=process.env.GOOGLE_CLIENT_ID,secret=process.env.GOOGLE_CLIENT_SECRET,refresh=process.env.GOOGLE_REFRESH_TOKEN;
  if(!id||!secret||!refresh)throw new Error('OAuth non configuré');
  const params=new URLSearchParams({client_id:id,client_secret:secret,refresh_token:refresh,grant_type:'refresh_token'});
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params.toString()});
  const j=await r.json();if(!j.access_token)throw new Error('Auth échouée');return j.access_token;
}

async function findFolder(token, name, parentId) {
  const q = encodeURIComponent(`name='${name.replace(/'/g,"\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, { headers: { Authorization: 'Bearer ' + token } });
  const j = await r.json();
  return (j.files && j.files.length) ? j.files[0].id : null;
}
async function findOrCreateFolder(token, name, parentId) {
  const existing = await findFolder(token, name, parentId);
  if (existing) return existing;
  const cr = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const cj = await cr.json();
  if (!cj.id) throw new Error('Création dossier échouée');
  return cj.id;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const CRM_PWD = process.env.CRM_PASSWORD || 'irve2024';
  if (req.headers.authorization !== `Bearer ${CRM_PWD}`) return res.status(401).json({ error: 'Non autorisé' });

  try {
    const { client, annee, mois, ancienStatut, nouveauStatut } = req.body;
    if (!client || !nouveauStatut) return res.status(400).json({ error: 'client et nouveauStatut requis' });
    if (ancienStatut === nouveauStatut) return res.status(200).json({ success: true, moved: false, reason: 'même statut' });

    const ROOT = process.env.DRIVE_ROOT_FOLDER;
    if (!ROOT) return res.status(500).json({ error: 'DRIVE_ROOT_FOLDER non configuré' });

    const debug = { recherche: { client, annee, mois, ancienStatut, nouveauStatut }, etapes: [] };
    const token = await getAccessToken();

    // Trouver le dossier année
    const fAnnee = await findFolder(token, String(annee), ROOT);
    debug.etapes.push('Dossier année "' + annee + '": ' + (fAnnee ? 'TROUVÉ' : 'INTROUVABLE'));
    if (!fAnnee) return res.status(200).json({ success: true, moved: false, reason: 'année introuvable', debug });

    // Lister les sous-dossiers de l'année (les statuts)
    const lr = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${fAnnee}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id,name)`, { headers: { Authorization: 'Bearer ' + token } });
    const lj = await lr.json();
    const statuts = lj.files || [];
    debug.etapes.push('Sous-dossiers année: ' + statuts.map(s => s.name).join(', '));

    // Chercher le dossier client dans tous les statuts
    let fClient = null, statutTrouve = null, fMoisTrouve = null;
    for (const st of statuts) {
      const fMoisTest = await findFolder(token, mois, st.id);
      if (fMoisTest) {
        const fc = await findFolder(token, client, fMoisTest);
        if (fc) { fClient = fc; statutTrouve = st.name; fMoisTrouve = fMoisTest; break; }
      }
    }
    debug.etapes.push('Dossier client "' + client + '" dans mois "' + mois + '": ' + (fClient ? 'TROUVÉ dans statut "' + statutTrouve + '"' : 'INTROUVABLE'));

    if (!fClient) {
      return res.status(200).json({ success: true, moved: false, reason: 'dossier client introuvable', debug });
    }
    if (statutTrouve === nouveauStatut) {
      return res.status(200).json({ success: true, moved: false, reason: 'déjà dans le bon statut', debug });
    }

    // Créer la nouvelle arborescence statut/mois
    const fNewStatut = await findOrCreateFolder(token, nouveauStatut, fAnnee);
    const fNewMois = await findOrCreateFolder(token, mois, fNewStatut);

    // Récupérer le parent actuel
    const gr = await fetch(`https://www.googleapis.com/drive/v3/files/${fClient}?fields=parents`, { headers: { Authorization: 'Bearer ' + token } });
    const gj = await gr.json();
    const oldParents = (gj.parents || []).join(',');

    // Déplacer
    const mvr = await fetch(`https://www.googleapis.com/drive/v3/files/${fClient}?addParents=${fNewMois}&removeParents=${oldParents}&fields=id,parents`, {
      method: 'PATCH', headers: { Authorization: 'Bearer ' + token },
    });
    const mvj = await mvr.json();
    debug.etapes.push('Déplacement: ' + (mvj.id ? 'OK vers ' + nouveauStatut : 'ÉCHEC ' + JSON.stringify(mvj)));

    return res.status(200).json({ success: true, moved: true, debug });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
