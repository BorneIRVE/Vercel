// api/drive-list.js — Liste les fichiers d'un client sur Drive (recherche par nom de dossier client)
async function getAccessToken() {
  const id=process.env.GOOGLE_CLIENT_ID,secret=process.env.GOOGLE_CLIENT_SECRET,refresh=process.env.GOOGLE_REFRESH_TOKEN;
  if(!id||!secret||!refresh)throw new Error('OAuth non configuré');
  const params=new URLSearchParams({client_id:id,client_secret:secret,refresh_token:refresh,grant_type:'refresh_token'});
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params.toString()});
  const j=await r.json();if(!j.access_token)throw new Error('Auth échouée');return j.access_token;
}
module.exports = async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  if(req.method==='OPTIONS')return res.status(200).end();
  const CRM_PWD=process.env.CRM_PASSWORD||'irve2024';
  if(req.headers.authorization!==`Bearer ${CRM_PWD}`)return res.status(401).json({error:'Non autorisé'});
  res.setHeader('Cache-Control','no-store');
  try{
    var client=(req.query.client||'').trim();
    if(!client)return res.status(400).json({error:'client requis'});
    var token=await getAccessToken();
    // Chercher tous les dossiers portant le nom du client (peu importe où)
    var q=encodeURIComponent(`name='${client.replace(/'/g,"\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    var fr=await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,{headers:{Authorization:'Bearer '+token}});
    var fj=await fr.json();
    var files=[];
    if(fj.files&&fj.files.length){
      for(var i=0;i<fj.files.length;i++){
        var fq=encodeURIComponent(`'${fj.files[i].id}' in parents and trashed=false`);
        var lr=await fetch(`https://www.googleapis.com/drive/v3/files?q=${fq}&fields=files(id,name,webViewLink,mimeType,createdTime)&orderBy=createdTime desc`,{headers:{Authorization:'Bearer '+token}});
        var lj=await lr.json();
        if(lj.files)files=files.concat(lj.files);
      }
    }
    return res.status(200).json({files:files});
  }catch(err){return res.status(500).json({error:err.message});}
};
