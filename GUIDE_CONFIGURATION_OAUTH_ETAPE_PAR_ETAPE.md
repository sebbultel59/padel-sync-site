# Guide étape par étape : Configuration OAuth dans Supabase

Ce guide vous accompagne pas à pas pour configurer l'authentification OAuth.

## 📋 Informations importantes

- **URL Supabase** : `https://iieiggyqcncbkjwsdcxl.supabase.co`
- **Redirect URI Web** : `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback`
- **Redirect URI Mobile** : `syncpadel://auth/callback`

---

## 🔵 ÉTAPE 1 : Configurer Google OAuth

### 1.1 Créer les identifiants Google

1. Allez sur [Google Cloud Console](https://console.cloud.google.com/)
2. Connectez-vous avec votre compte Google
3. Créez un nouveau projet ou sélectionnez un projet existant :
   - Cliquez sur le sélecteur de projet en haut
   - Cliquez sur "Nouveau projet"
   - Donnez un nom (ex: "Padel Sync")
   - Cliquez sur "Créer"

4. Activez l'API Google+ :
   - Menu > APIs & Services > Library
   - Recherchez "Google+ API" ou "Google Identity"
   - Cliquez sur "Enable"

5. Créez les identifiants OAuth 2.0 :
   - Menu > APIs & Services > Credentials
   - Cliquez sur "Create Credentials" > "OAuth client ID"
   - Si demandé, configurez l'écran de consentement OAuth :
     - Type d'application : External
     - Nom de l'application : Padel Sync
     - Email de support : votre email
     - Cliquez sur "Save and Continue" jusqu'à la fin
   
6. Créez le Client ID :
   - Type d'application : "Web application"
   - Nom : "Padel Sync Web"
   - **Authorized redirect URIs** : Ajoutez
     ```
     https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback
     ```
   - Cliquez sur "Create"
   - **Copiez le Client ID et le Client Secret** (vous en aurez besoin)

### 1.2 Configurer dans Supabase

1. Allez sur [Supabase Dashboard](https://app.supabase.com)
2. Sélectionnez votre projet
3. Menu gauche > **Authentication** > **Providers**
4. Trouvez **Google** et cliquez dessus
5. Activez le toggle "Enable Google provider"
6. Remplissez :
   - **Client ID (for OAuth)** : Collez le Client ID de Google
   - **Client Secret (for OAuth)** : Collez le Client Secret de Google
7. Dans **Redirect URLs**, ajoutez :
   ```
   https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback
   syncpadel://auth/callback
   ```
8. Cliquez sur **Save**

✅ Google OAuth est maintenant configuré !

---

## 🔵 ÉTAPE 2 : Configurer Facebook OAuth

### 2.1 Créer l'application Facebook

1. Allez sur [Facebook Developers](https://developers.facebook.com/)
2. Connectez-vous avec votre compte Facebook
3. Cliquez sur "My Apps" > "Create App"
4. Sélectionnez "Consumer" comme type d'application
5. Remplissez :
   - App Name : "Padel Sync"
   - App Contact Email : votre email
   - Cliquez sur "Create App"

6. Ajoutez le produit "Facebook Login" :
   - Dans le tableau de bord de l'app, trouvez "Facebook Login"
   - Cliquez sur "Set Up"
   - Sélectionnez "Web" comme plateforme

7. Configurez les paramètres :
   - Menu gauche > Settings > Basic
   - **App ID** : Copiez cette valeur
   - **App Secret** : Cliquez sur "Show" et copiez (vous en aurez besoin)
   - Ajoutez votre email dans "App Domains" si nécessaire

8. Configurez Facebook Login :
   - Menu gauche > Facebook Login > Settings
   - Dans **Valid OAuth Redirect URIs**, ajoutez :
     ```
     https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback
     ```
   - Cliquez sur "Save Changes"

### 2.2 Configurer dans Supabase

1. Dans Supabase Dashboard > **Authentication** > **Providers**
2. Trouvez **Facebook** et cliquez dessus
3. Activez le toggle "Enable Facebook provider"
4. Remplissez :
   - **App ID** : Collez l'App ID de Facebook
   - **App Secret** : Collez l'App Secret de Facebook
5. Dans **Redirect URLs**, ajoutez :
   ```
   https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback
   syncpadel://auth/callback
   ```
6. Cliquez sur **Save**

✅ Facebook OAuth est maintenant configuré !

---

## 🔵 ÉTAPE 3 : Configurer Apple Sign In (iOS uniquement)

### 3.1 Prérequis Apple

⚠️ **Important** : Vous devez avoir un compte Apple Developer payant (99$/an)

### 3.2 Créer le Service ID

1. Allez sur [Apple Developer](https://developer.apple.com/)
2. Connectez-vous avec votre compte Apple Developer
3. Allez dans **Certificates, Identifiers & Profiles**
4. Menu gauche > **Identifiers**
5. Cliquez sur le "+" pour créer un nouvel identifiant
6. Sélectionnez **Services IDs** > Continue
7. Remplissez :
   - Description : "Padel Sync Auth"
   - Identifier : `com.padelsync.auth` (ou similaire)
   - Cliquez sur Continue puis Register

8. Configurez le Service ID :
   - Cliquez sur le Service ID créé
   - Cochez "Sign In with Apple"
   - Cliquez sur "Configure"
   - Primary App ID : Sélectionnez votre App ID
   - Domains and Subdomains : Ajoutez `iieiggyqcncbkjwsdcxl.supabase.co`
   - Return URLs : Ajoutez
     ```
     https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback
     ```
   - Cliquez sur "Save" puis "Continue" puis "Register"

### 3.3 Créer la Key ID

1. Dans Apple Developer > **Certificates, Identifiers & Profiles**
2. Menu gauche > **Keys**
3. Cliquez sur le "+" pour créer une nouvelle clé
4. Remplissez :
   - Key Name : "Padel Sync Auth Key"
   - Cochez "Sign In with Apple"
   - Cliquez sur "Continue" puis "Register"
5. **Téléchargez la clé** (.p8) - ⚠️ Vous ne pourrez la télécharger qu'une seule fois !
6. **Copiez la Key ID** affichée

### 3.4 Configurer dans Supabase

1. Dans Supabase Dashboard > **Authentication** > **Providers**
2. Trouvez **Apple** et cliquez dessus
3. Activez le toggle "Enable Apple provider"
4. Remplissez :
   - **Services ID** : Le Service ID créé (ex: `com.padelsync.auth`)
   - **Secret Key** : Ouvrez le fichier .p8 téléchargé et copiez tout son contenu
   - **Key ID** : La Key ID copiée
   - **Team ID** : Votre Team ID Apple (trouvable dans Membership)
5. Dans **Redirect URLs**, ajoutez :
   ```
   https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback
   syncpadel://auth/callback
   ```
6. Cliquez sur **Save**

✅ Apple Sign In est maintenant configuré !

---

## 🧪 ÉTAPE 4 : Tester l'authentification

### 4.1 Préparer l'environnement

```bash
# Installer les dépendances
cd /Users/sebbultel/padel-sync
npm install

# Vérifier la configuration
node scripts/check-oauth-config.js
```

### 4.2 Tester sur Web

```bash
# Lancer l'application en mode web
npx expo start --web
```

1. Ouvrez votre navigateur sur l'URL affichée (généralement `http://localhost:8081`)
2. Allez sur l'écran de connexion
3. Cliquez sur "Créer un compte" ou "Se connecter"
4. Testez chaque bouton OAuth :
   - Cliquez sur "Google" → Devrait ouvrir Google
   - Cliquez sur "Facebook" → Devrait ouvrir Facebook
5. Après l'authentification, vous devriez être redirigé et connecté

### 4.3 Tester sur iOS (Simulateur ou Device)

```bash
# Lancer sur iOS
npx expo run:ios
```

1. L'application s'ouvre
2. Allez sur l'écran de connexion
3. Testez chaque bouton OAuth :
   - Google → Safari s'ouvre pour l'authentification
   - Facebook → Safari s'ouvre pour l'authentification
   - Apple → Interface Apple Sign In (iOS uniquement)
4. Après l'authentification, vous devriez être redirigé vers l'app et connecté

### 4.4 Tester sur Android (Emulator ou Device)

```bash
# Lancer sur Android
npx expo run:android
```

1. L'application s'ouvre
2. Allez sur l'écran de connexion
3. Testez les boutons OAuth :
   - Google → Navigateur s'ouvre
   - Facebook → Navigateur s'ouvre
   - ⚠️ Apple Sign In ne doit PAS apparaître (normal, iOS uniquement)

---

## 🔍 Vérification et dépannage

### Vérifier les logs Supabase

1. Allez dans Supabase Dashboard > **Authentication** > **Logs**
2. Vous verrez toutes les tentatives d'authentification
3. En cas d'erreur, les détails seront affichés

### Problèmes courants

#### ❌ "redirect_uri_mismatch"
- **Cause** : Le redirect URI n'est pas exactement le même
- **Solution** : Vérifiez que les redirect URIs sont identiques dans :
  - Supabase Dashboard
  - Google Cloud Console / Facebook Developers / Apple Developer

#### ❌ "invalid_client"
- **Cause** : Client ID ou Secret incorrect
- **Solution** : Vérifiez que vous avez copié les bonnes valeurs

#### ❌ L'utilisateur n'est pas redirigé après l'authentification
- **Cause** : Deep link non configuré ou non géré
- **Solution** : 
  - Vérifiez que `syncpadel://auth/callback` est dans les redirect URIs
  - Vérifiez que l'app écoute les deep links (code déjà en place)

#### ❌ Apple Sign In ne fonctionne pas
- **Cause** : Configuration Apple complexe
- **Solution** :
  - Vérifiez que le Service ID est correct
  - Vérifiez que la clé privée est bien formatée (tout le contenu du .p8)
  - Vérifiez que le Team ID est correct

---

## ✅ Checklist finale

- [ ] Google OAuth configuré dans Supabase
- [ ] Google redirect URIs configurés dans Google Cloud Console
- [ ] Facebook OAuth configuré dans Supabase
- [ ] Facebook redirect URIs configurés dans Facebook Developers
- [ ] Apple OAuth configuré dans Supabase (si iOS)
- [ ] Apple Service ID et Key ID configurés
- [ ] Test Google réussi
- [ ] Test Facebook réussi
- [ ] Test Apple réussi (si iOS)

---

## 📞 Besoin d'aide ?

- Consultez les logs dans Supabase Dashboard > Authentication > Logs
- Vérifiez la configuration avec : `node scripts/check-oauth-config.js`
- Consultez `OAUTH_SETUP.md` pour plus de détails
- Consultez `OAUTH_TEST_GUIDE.md` pour les tests avancés









