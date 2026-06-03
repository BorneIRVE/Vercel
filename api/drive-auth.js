// api/drive-auth.js — Aide à obtenir le refresh token Google une seule fois
// Visite /api/drive-auth (sans paramètre) -> lien d'autorisation
// Google redirige vers /api/drive-auth?code=... -> affiche le refresh token à copier dans Vercel

module.exports = async function handler(req, res) {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send('<h2>Configuration manquante</h2><p>Ajoutez d\'abord GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans Vercel.</p>');
  }

  const redirectUri = `https://${req.headers.host}/api/drive-auth`;
  const code = req.query.code;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!code) {
    // Étape 1 : afficher le lien d'autorisation
    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id: id,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive',
      access_type: 'offline',
      prompt: 'consent',
    }).toString();
    return res.status(200).send(`
      <div style="font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px;">
        <h2>🔑 Autoriser l'accès à Google Drive</h2>
        <p>Cliquez sur le bouton pour autoriser le CRM à ranger vos fichiers dans votre Drive.</p>
        <a href="${authUrl}" style="display:inline-block;background:#0a1628;color:#fff;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:700;">Autoriser avec mon compte Google</a>
        <p style="color:#888;font-size:13px;margin-top:20px;">Redirect URI configurée : <code>${redirectUri}</code></p>
      </div>`);
  }

  // Étape 2 : échanger le code contre un refresh token
  try {
    const params = new URLSearchParams({
      code, client_id: id, client_secret: secret,
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    });
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const j = await r.json();
    if (!j.refresh_token) {
      return res.status(200).send(`<div style="font-family:sans-serif;max-width:600px;margin:40px auto;"><h2>⚠️ Pas de refresh token reçu</h2><p>Réponse : <pre>${JSON.stringify(j, null, 2)}</pre></p><p>Réessayez en révoquant d'abord l'accès sur <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.</p></div>`);
    }
    return res.status(200).send(`
      <div style="font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px;">
        <h2>✅ Autorisation réussie !</h2>
        <p>Copiez ce <strong>refresh token</strong> et ajoutez-le dans Vercel sous le nom <code>GOOGLE_REFRESH_TOKEN</code> :</p>
        <textarea readonly style="width:100%;height:80px;padding:10px;font-family:monospace;font-size:13px;border:2px solid #0a1628;border-radius:8px;" onclick="this.select()">${j.refresh_token}</textarea>
        <p style="color:#888;font-size:13px;margin-top:16px;">Après l'avoir ajouté dans Vercel, l'upload fonctionnera. Vous pouvez fermer cette page.</p>
      </div>`);
  } catch (err) {
    return res.status(500).send('<p>Erreur: ' + err.message + '</p>');
  }
};
