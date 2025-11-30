# Résumé de configuration OAuth - Informations rapides

## ✅ Configuration locale terminée

Tous les fichiers nécessaires sont en place et configurés correctement.

## 📋 Informations Supabase

- **Project URL**: `https://iieiggyqcncbkjwsdcxl.supabase.co`
- **Project Ref**: `iieiggyqcncbkjwsdcxl`

## 🔗 Redirect URIs à configurer

Pour **chaque provider** (Google, Facebook, Apple), ajoutez ces redirect URIs :

### Dans Supabase Dashboard
1. Aller dans **Authentication** > **Providers**
2. Pour chaque provider activé, ajouter dans "Redirect URLs" :
   - `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback`
   - `syncpadel://auth/callback`

### Dans les providers externes

#### Google Cloud Console
- **Authorized redirect URIs** :
  - `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback`

#### Facebook Developers
- **Valid OAuth Redirect URIs** :
  - `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback`

#### Apple Developer
- Configurer le Service ID avec le redirect URI web

## 🚀 Checklist de configuration

### Étape 1 : Supabase Dashboard
- [ ] Aller dans Authentication > Providers
- [ ] Activer Google OAuth
  - [ ] Ajouter Client ID et Client Secret
  - [ ] Ajouter les redirect URIs
- [ ] Activer Facebook OAuth
  - [ ] Ajouter App ID et App Secret
  - [ ] Ajouter les redirect URIs
- [ ] Activer Apple OAuth (si iOS)
  - [ ] Ajouter Service ID, Key ID et Private Key
  - [ ] Ajouter les redirect URIs

### Étape 2 : Providers externes
- [ ] Google Cloud Console : créer/configurer OAuth 2.0 credentials
- [ ] Facebook Developers : créer/configurer l'application
- [ ] Apple Developer : configurer Service ID (si iOS)

### Étape 3 : Test
- [ ] Lancer l'application : `npm install && npx expo start`
- [ ] Tester Google OAuth
- [ ] Tester Facebook OAuth
- [ ] Tester Apple OAuth (iOS uniquement)
- [ ] Vérifier les logs dans Supabase Dashboard

## 🛠️ Commandes utiles

```bash
# Vérifier la configuration
node scripts/check-oauth-config.js

# Installer les dépendances
npm install

# Lancer l'application
npx expo start

# Lancer sur iOS
npx expo run:ios

# Lancer sur Android
npx expo run:android

# Lancer sur Web
npx expo start --web
```

## 📚 Documentation complète

- **Configuration détaillée** : Voir `OAUTH_SETUP.md`
- **Guide de test** : Voir `OAUTH_TEST_GUIDE.md`

## ⚠️ Notes importantes

1. Les redirect URIs doivent être **exactement** comme indiqué ci-dessus
2. Le deep link `syncpadel://auth/callback` doit être configuré dans Supabase
3. Apple Sign In n'est disponible que sur iOS
4. Les comptes OAuth ont généralement leur email vérifié automatiquement

## 🐛 Dépannage

Si l'authentification ne fonctionne pas :

1. Vérifier les redirect URIs dans Supabase Dashboard
2. Vérifier les redirect URIs dans les providers externes
3. Consulter les logs dans Supabase Dashboard > Authentication > Logs
4. Vérifier la console de l'application pour les erreurs
5. Exécuter `node scripts/check-oauth-config.js` pour vérifier la configuration locale







