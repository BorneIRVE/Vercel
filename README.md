# IRVE Studio — API Vercel (envoi email)

## Déploiement en 10 minutes

### Étape 1 — Créer un compte Vercel
→ vercel.com → Sign up with GitHub

### Étape 2 — Déployer ce dossier
1. Dans ce dossier `irve-vercel/`, ouvrir un terminal
2. Installer Vercel CLI : `npm i -g vercel`
3. Lancer : `vercel`
4. Suivre les instructions (lier à ton compte, nom du projet)
5. À la fin tu obtiens une URL : `https://irve-studio-api.vercel.app`

**Ou sans terminal :** importer directement depuis vercel.com → New Project → Upload folder

### Étape 3 — Ajouter les variables d'environnement
Dans le dashboard Vercel → ton projet → Settings → Environment Variables :

| Nom | Valeur |
|-----|--------|
| `BREVO_API_KEY` | Ta clé Brevo (commence par `6ccd...`) |
| `MON_EMAIL` | Ton adresse email professionnelle |

Cliquer **Save** puis **Redeploy** (obligatoire pour que les variables soient prises en compte).

### Étape 4 — Mettre à jour index.html
Dans ton fichier `index.html` (sur GitHub), remplacer :
```js
const VERCEL_API_URL = 'https://ton-projet.vercel.app/api/send-email';
const MON_EMAIL      = 'votre@email.fr';
```
Par :
```js
const VERCEL_API_URL = 'https://irve-studio-api.vercel.app/api/send-email';  // ton URL Vercel
const MON_EMAIL      = 'ton@email.fr';  // ton email
```

### Étape 5 — Tester
Ouvrir dans un navigateur :
```
https://irve-studio-api.vercel.app/api/send-email
```
Tu dois voir : `{"error":"Method not allowed"}` → c'est normal, ça confirme que la fonction tourne.

---

## Structure du projet

```
irve-vercel/
├── api/
│   └── send-email.js   ← La fonction serverless
├── vercel.json         ← Config Vercel (timeout 30s)
└── package.json        ← Minimal
```

## Coût
- Vercel gratuit : 100 GB-hours/mois, largement suffisant
- Chaque email = ~1 seconde de compute
- 0 € pour ton usage

## Mettre à jour la clé Brevo
Vercel dashboard → Settings → Environment Variables → modifier `BREVO_API_KEY` → Redeploy
