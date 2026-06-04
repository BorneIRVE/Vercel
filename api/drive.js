// api/drive.js — Fonction unique regroupant upload, list, move, auth Drive
// Action via ?action=upload|list|move|auth ou body.action

async function getAccessToken() {
  const id=process.env.GOOGLE_CLIENT_ID,secret=process.env.GOOGLE_CLIENT_SECRET,refresh=process.env.GOOGLE_REFRESH_TOKEN;
  if(!id||!secret||!refresh)throw new Error('OAuth Google non configuré');
  const params=new URLSearchParams({client_id:id,client_secret:secret,refresh_token:refresh,grant_type:'refresh_token'});
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params.toString()});
  const j=await r.json();if(!j.access_token)throw new Error('Auth Google échouée: '+JSON.stringify(j));return j.access_token;
}
async function findFolder(token,name,parentId){
  const q=encodeURIComponent(`name='${name.replace(/'/g,"\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const r=await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,{headers:{Authorization:'Bearer '+token}});
  const j=await r.json();return (j.files&&j.files.length)?j.files[0].id:null;
}
async function findOrCreateFolder(token,name,parentId){
  const ex=await findFolder(token,name,parentId);if(ex)return ex;
  const cr=await fetch('https://www.googleapis.com/drive/v3/files',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',parents:[parentId]})});
  const cj=await cr.json();if(!cj.id)throw new Error('Création dossier échouée: '+JSON.stringify(cj));return cj.id;
}

module.exports = async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  if(req.method==='OPTIONS')return res.status(200).end();

  const CRM_PWD=process.env.CRM_PASSWORD||'irve2024';
  const ROOT=process.env.DRIVE_ROOT_FOLDER;
  const action=(req.query.action)||(req.body&&req.body.action)||'';

  // === AUTH (GET, public) : aide à obtenir le refresh token ===
  if(action==='auth'){
    const id=process.env.GOOGLE_CLIENT_ID,secret=process.env.GOOGLE_CLIENT_SECRET;
    res.setHeader('Content-Type','text/html; charset=utf-8');
    if(!id||!secret)return res.status(200).send('<h2>Config manquante</h2><p>Ajoutez GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans Vercel.</p>');
    const redirectUri=`https://${req.headers.host}/api/drive?action=auth`;
    const code=req.query.code;
    if(!code){
      const authUrl='https://accounts.google.com/o/oauth2/v2/auth?'+new URLSearchParams({client_id:id,redirect_uri:redirectUri,response_type:'code',scope:'https://www.googleapis.com/auth/drive',access_type:'offline',prompt:'consent'}).toString();
      return res.status(200).send(`<div style="font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px;"><h2>🔑 Autoriser Google Drive</h2><a href="${authUrl}" style="display:inline-block;background:#0a1628;color:#fff;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:700;">Autoriser avec mon compte Google</a><p style="color:#888;font-size:13px;margin-top:20px;">Redirect URI: <code>${redirectUri}</code></p></div>`);
    }
    try{
      const params=new URLSearchParams({code,client_id:id,client_secret:secret,redirect_uri:redirectUri,grant_type:'authorization_code'});
      const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params.toString()});
      const j=await r.json();
      if(!j.refresh_token)return res.status(200).send(`<div style="font-family:sans-serif;max-width:600px;margin:40px auto;"><h2>⚠️ Pas de refresh token</h2><pre>${JSON.stringify(j,null,2)}</pre><p>Révoquez l'accès sur <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a> et réessayez.</p></div>`);
      return res.status(200).send(`<div style="font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px;"><h2>✅ Réussi !</h2><p>Copiez ce refresh token dans Vercel sous <code>GOOGLE_REFRESH_TOKEN</code> :</p><textarea readonly style="width:100%;height:80px;padding:10px;font-family:monospace;font-size:13px;border:2px solid #0a1628;border-radius:8px;" onclick="this.select()">${j.refresh_token}</textarea></div>`);
    }catch(err){return res.status(500).send('<p>Erreur: '+err.message+'</p>');}
  }

  // Les autres actions nécessitent le mot de passe
  if(req.headers.authorization!==`Bearer ${CRM_PWD}`)return res.status(401).json({error:'Non autorisé'});
  if(!ROOT)return res.status(500).json({error:'DRIVE_ROOT_FOLDER non configuré'});

  try{
    const token=await getAccessToken();

    // === FOLDERLINK (GET) : lien partageable du dossier année (ou année/mois) ===
    if(action==='folderlink'){
      res.setHeader('Cache-Control','no-store');
      const annee=(req.query.annee||'').trim();
      const mois=(req.query.mois||'').trim();
      if(!annee)return res.status(400).json({error:'annee requise'});
      let folder=await findFolder(token,annee,ROOT);
      if(!folder)return res.status(200).json({link:null,reason:'dossier année introuvable'});
      if(mois){
        const fm=await findFolder(token,mois,folder);
        if(!fm)return res.status(200).json({link:null,reason:'dossier mois introuvable'});
        folder=fm;
      }
      // Rendre le dossier accessible par lien
      try{await fetch(`https://www.googleapis.com/drive/v3/files/${folder}/permissions`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({role:'reader',type:'anyone'})});}catch(e){}
      return res.status(200).json({link:'https://drive.google.com/drive/folders/'+folder});
    }

    // === LIST (GET) : liste les fichiers d'un client ===
    if(action==='list'){
      res.setHeader('Cache-Control','no-store');
      const client=(req.query.client||'').trim();
      if(!client)return res.status(400).json({error:'client requis'});
      // Chercher les dossiers dont le nom contient le client (gère "Martin" -> "Martin-Paris")
      const q=encodeURIComponent(`name contains '${client.replace(/'/g,"\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
      const fr=await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,{headers:{Authorization:'Bearer '+token}});
      const fj=await fr.json();
      let files=[];
      // Pour chaque dossier client trouvé, lister récursivement (fichiers + contenu des sous-dossiers)
      async function listRec(folderId,prefix){
        const lq=encodeURIComponent(`'${folderId}' in parents and trashed=false`);
        const lr=await fetch(`https://www.googleapis.com/drive/v3/files?q=${lq}&fields=files(id,name,webViewLink,mimeType,createdTime)&orderBy=createdTime desc`,{headers:{Authorization:'Bearer '+token}});
        const lj=await lr.json();
        for(const f of (lj.files||[])){
          if(f.mimeType==='application/vnd.google-apps.folder'){
            await listRec(f.id,(prefix?prefix+' / ':'')+f.name);
          }else{
            files.push({id:f.id,name:(prefix?prefix+' / ':'')+f.name,webViewLink:f.webViewLink,mimeType:f.mimeType,createdTime:f.createdTime});
          }
        }
      }
      for(const folder of (fj.files||[])){
        await listRec(folder.id,'');
      }
      return res.status(200).json({files});
    }

    // === MOVE (POST) : déplace le dossier client vers un autre statut ===
    if(action==='move'){
      const {client,annee,mois,nouveauStatut,typeDossier}=req.body;
      if(!client||!nouveauStatut)return res.status(400).json({error:'client et nouveauStatut requis'});
      const typeD=typeDossier||'Chantiers directs';
      // Structure: Année / Mois / Statut / Type / Client
      const fAnnee=await findFolder(token,String(annee),ROOT);
      if(!fAnnee)return res.status(200).json({success:true,moved:false,reason:'année introuvable'});
      const fMois=await findFolder(token,String(mois),fAnnee);
      if(!fMois)return res.status(200).json({success:true,moved:false,reason:'mois introuvable'});
      // Chercher le dossier client dans tous les statuts de ce mois
      const sr=await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${fMois}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id,name)`,{headers:{Authorization:'Bearer '+token}});
      const sj=await sr.json();
      let fClient=null,statutTrouve=null;
      for(const st of (sj.files||[])){
        const fType=await findFolder(token,typeD,st.id);
        if(fType){const fc=await findFolder(token,String(client),fType);if(fc){fClient=fc;statutTrouve=st.name;break;}}
      }
      if(!fClient)return res.status(200).json({success:true,moved:false,reason:'dossier client introuvable'});
      if(statutTrouve===nouveauStatut)return res.status(200).json({success:true,moved:false,reason:'déjà dans le bon statut'});
      // Créer Mois/NouveauStatut/Type
      const fNewStatut=await findOrCreateFolder(token,nouveauStatut,fMois);
      const fNewType=await findOrCreateFolder(token,typeD,fNewStatut);
      const gr=await fetch(`https://www.googleapis.com/drive/v3/files/${fClient}?fields=parents`,{headers:{Authorization:'Bearer '+token}});
      const gj=await gr.json();
      await fetch(`https://www.googleapis.com/drive/v3/files/${fClient}?addParents=${fNewType}&removeParents=${(gj.parents||[]).join(',')}&fields=id,parents`,{method:'PATCH',headers:{Authorization:'Bearer '+token}});
      return res.status(200).json({success:true,moved:true});
    }

    // === UPLOAD (POST) : upload un fichier (réutilise/déplace le dossier client) ===
    if(action==='upload'||!action){
      const {fileName,fileData,mimeType,annee,mois,client,fraisFonctionnement,path}=req.body;
      if(!fileName||!fileData)return res.status(400).json({error:'Fichier manquant'});

      // Helper upload dans un dossier donné
      async function uploadInto(folderId){
        const boundary='----irve'+Date.now();
        const meta={name:fileName,parents:[folderId]};
        const buffer=Buffer.from(fileData,'base64');
        const pre=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mimeType||'application/octet-stream'}\r\n\r\n`;
        const post=`\r\n--${boundary}--`;
        const body=Buffer.concat([Buffer.from(pre,'utf8'),buffer,Buffer.from(post,'utf8')]);
        const ur=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':`multipart/related; boundary=${boundary}`},body});
        const uj=await ur.json();
        if(!uj.id)throw new Error('Upload échoué: '+JSON.stringify(uj));
        await fetch(`https://www.googleapis.com/drive/v3/files/${uj.id}/permissions`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({role:'reader',type:'anyone'})});
        return uj.webViewLink||`https://drive.google.com/file/d/${uj.id}/view`;
      }

      // Cas frais de fonctionnement : Frais-Fonctionnement / Année / Mois (à la racine)
      if(fraisFonctionnement){
        let p=await findOrCreateFolder(token,'Frais-Fonctionnement',ROOT);
        p=await findOrCreateFolder(token,String(annee),p);
        p=await findOrCreateFolder(token,String(mois),p);
        return res.status(200).json({success:true,link:await uploadInto(p)});
      }

      // Nouveau mode : chemin explicite (tableau de dossiers à créer en cascade depuis la racine)
      if(Array.isArray(path)&&path.length){
        let p=ROOT;
        for(const seg of path){ if(seg&&String(seg).trim()) p=await findOrCreateFolder(token,String(seg).trim(),p); }
        return res.status(200).json({success:true,link:await uploadInto(p)});
      }

      // Ancien mode (compat) : annee / [statut/mois] / client
      const parts=String(mois).split('/').filter(s=>s&&s.trim());
      const statutCible=parts[0]||'Nouveau';
      const moisCible=parts[1]||parts[0]||'';
      let p=await findOrCreateFolder(token,String(annee),ROOT);
      p=await findOrCreateFolder(token,statutCible,p);
      p=await findOrCreateFolder(token,moisCible,p);
      p=await findOrCreateFolder(token,String(client),p);
      return res.status(200).json({success:true,link:await uploadInto(p)});
    }

    return res.status(400).json({error:'Action inconnue: '+action});
  }catch(err){return res.status(500).json({error:err.message});}
};
