# IRVE Studio — Fonction Vercel (envoi email via Brevo)

## Déploiement

### Étape 1 — Mettre les fichiers sur GitHub
1. Créer un repo GitHub nommé `irve-studio-api`
2. Uploader les 3 fichiers :
   - Cliquer "Add file → Create new file", nommer `api/send-email.js`, coller le contenu
   - Répéter pour `vercel.json` et `package.json`

### Étape 2 — Déployer sur Vercel
1. vercel.com → Se connecter avec GitHub
2. "Add New Project" → Importer `irve-studio-api`
3. **Avant de cliquer Deploy** → "Environment Variables" → ajouter :
   - `BREVO_API_KEY`  = ta clé Brevo (commence par 6ccd...)
   - `MON_EMAIL`      = ton adresse email professionnelle
4. Cliquer **Deploy**
5. Tu obtiens une URL : `https://irve-studio-api.vercel.app`

### Étape 3 — Mettre à jour index.html sur GitHub
Remplacer dans le code :
```js
const VERCEL_API_URL = 'https://irve-studio-api.vercel.app/api/send-email';
const MON_EMAIL      = 'ton@email.fr';
```

### Tester
Ouvrir dans le navigateur :
https://irve-studio-api.vercel.app/api/send-email
→ Tu dois voir : {"error":"Method not allowed"} ✅

## Variables d'environnement requises
| Variable | Description |
|----------|-------------|
| `BREVO_API_KEY` | Clé API Brevo (Paramètres → Clés API) |
| `MON_EMAIL` | Ton adresse email (vérifiée dans Brevo) |
