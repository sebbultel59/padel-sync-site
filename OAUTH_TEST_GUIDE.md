# Guide de test de l'authentification OAuth

Ce guide vous aide à tester l'authentification OAuth après la configuration dans Supabase.

## Prérequis

1. ✅ Les providers OAuth configurés dans Supabase Dashboard
2. ✅ Les redirect URIs configurés dans chaque provider (Google, Facebook, Apple)
3. ✅ L'application compilée avec les nouvelles dépendances

## Configuration Supabase - Checklist

### 1. Vérifier les redirect URIs dans Supabase

Pour chaque provider (Google, Facebook, Apple), les redirect URIs doivent inclure :

- **Web** : `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback`
- **Mobile** : `syncpadel://auth/callback`

### 2. Vérifier les redirect URIs dans les providers externes

#### Google Cloud Console
- Aller dans [Google Cloud Console](https://console.cloud.google.com/)
- APIs & Services > Credentials
- Modifier vos identifiants OAuth 2.0
- Vérifier que les "Authorized redirect URIs" incluent :
  - `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback`

#### Facebook Developers
- Aller dans [Facebook Developers](https://developers.facebook.com/)
- Votre App > Settings > Basic
- Vérifier que les "Valid OAuth Redirect URIs" incluent :
  - `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback`

#### Apple Developer (si applicable)
- Vérifier que le Service ID est correctement configuré
- Vérifier que les domaines et redirections sont configurés

## Tests à effectuer

### Test 1 : Vérifier la compilation

```bash
npm install
npx expo start
```

Vérifier qu'il n'y a pas d'erreurs de compilation.

### Test 2 : Test sur Web

1. Lancer l'application en mode web : `npx expo start --web`
2. Aller sur l'écran de connexion
3. Cliquer sur un bouton OAuth (Google, Facebook)
4. Vérifier que :
   - Le navigateur s'ouvre pour l'authentification
   - Après l'authentification, vous êtes redirigé vers l'application
   - Vous êtes connecté

### Test 3 : Test sur iOS (Simulateur ou Device)

1. Lancer l'application : `npx expo run:ios`
2. Aller sur l'écran de connexion
3. Cliquer sur un bouton OAuth
4. Vérifier que :
   - Le navigateur Safari s'ouvre pour l'authentification
   - Après l'authentification, vous êtes redirigé vers l'application via le deep link
   - Vous êtes connecté
   - Le bouton Apple Sign In est visible (iOS uniquement)

### Test 4 : Test sur Android (Emulator ou Device)

1. Lancer l'application : `npx expo run:android`
2. Aller sur l'écran de connexion
3. Cliquer sur un bouton OAuth (Google, Facebook)
4. Vérifier que :
   - Le navigateur s'ouvre pour l'authentification
   - Après l'authentification, vous êtes redirigé vers l'application via le deep link
   - Vous êtes connecté
   - Le bouton Apple Sign In n'est PAS visible (normal, iOS uniquement)

### Test 5 : Test des deep links

1. Tester manuellement le deep link :
   ```bash
   # iOS Simulator
   xcrun simctl openurl booted "syncpadel://auth/callback#access_token=test&refresh_token=test"
   
   # Android Emulator
   adb shell am start -a android.intent.action.VIEW -d "syncpadel://auth/callback#access_token=test&refresh_token=test"
   ```

2. Vérifier que l'application gère correctement le deep link

## Dépannage

### L'authentification ne fonctionne pas

1. **Vérifier les logs Supabase** :
   - Aller dans Supabase Dashboard > Authentication > Logs
   - Vérifier les erreurs d'authentification

2. **Vérifier les redirect URIs** :
   - S'assurer que `syncpadel://auth/callback` est bien configuré dans Supabase
   - Vérifier que les redirect URIs dans les providers externes sont corrects

3. **Vérifier les identifiants** :
   - Vérifier que les Client IDs et Secrets sont corrects dans Supabase
   - Vérifier que les providers sont activés dans Supabase Dashboard

### L'utilisateur n'est pas redirigé après l'authentification

1. Vérifier que le deep link est bien configuré dans `app.config.js`
2. Vérifier que l'application écoute les deep links (code dans `signin.js`)
3. Vérifier les logs de l'application pour les erreurs

### Le bouton Apple Sign In ne s'affiche pas

- C'est normal sur Android et Web
- Apple Sign In n'est disponible que sur iOS
- Vérifier que vous testez sur un appareil iOS ou simulateur iOS

## Commandes utiles

```bash
# Installer les dépendances
npm install

# Lancer en mode développement
npx expo start

# Lancer sur iOS
npx expo run:ios

# Lancer sur Android
npx expo run:android

# Lancer sur Web
npx expo start --web

# Vérifier les deep links configurés
cat app.config.js | grep scheme
```

## Prochaines étapes après les tests

1. Si tout fonctionne : déployer en production
2. Si des erreurs : consulter les logs et corriger la configuration
3. Tester avec de vrais comptes utilisateurs (pas seulement des comptes de test)









