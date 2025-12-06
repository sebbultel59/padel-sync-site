# 🚀 Quick Start : Configuration OAuth (5 minutes)

## 📋 URLs à retenir

```
Redirect URI Web:   https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback
Redirect URI Mobile: syncpadel://auth/callback
```

---

## ⚡ Configuration rapide

### Google (2 minutes)

1. **Google Cloud Console** → Créer OAuth 2.0 Client ID
   - Redirect URI : `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback`
   - Copier Client ID + Secret

2. **Supabase** → Authentication > Providers > Google
   - Activer
   - Coller Client ID + Secret
   - Ajouter les 2 redirect URIs ci-dessus
   - Save

### Facebook (2 minutes)

1. **Facebook Developers** → Créer App → Ajouter Facebook Login
   - Redirect URI : `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback`
   - Copier App ID + Secret

2. **Supabase** → Authentication > Providers > Facebook
   - Activer
   - Coller App ID + Secret
   - Ajouter les 2 redirect URIs ci-dessus
   - Save

### Apple (5 minutes - iOS uniquement)

1. **Apple Developer** → Créer Service ID + Key
   - Configurer Sign In with Apple
   - Télécharger la clé .p8
   - Copier Service ID + Key ID

2. **Supabase** → Authentication > Providers > Apple
   - Activer
   - Coller Service ID, Key ID, Private Key (.p8)
   - Ajouter les 2 redirect URIs ci-dessus
   - Save

---

## 🧪 Tester

```bash
npm install
npx expo start
```

Puis tester chaque bouton OAuth dans l'app !

---

## 📖 Guide complet

Pour les détails complets, voir : **`GUIDE_CONFIGURATION_OAUTH_ETAPE_PAR_ETAPE.md`**












