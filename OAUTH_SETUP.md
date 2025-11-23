# Configuration de l'authentification OAuth

Ce guide explique comment configurer l'authentification OAuth avec Google, Facebook et Apple dans Supabase.

## Prérequis

1. Un projet Supabase actif
2. Les providers OAuth configurés dans leurs dashboards respectifs
3. L'application configurée avec le deep link `syncpadel://`

## Configuration dans Supabase Dashboard

### 1. Activer les providers

1. Connectez-vous au [Supabase Dashboard](https://app.supabase.com)
2. Sélectionnez votre projet
3. Allez dans **Authentication** > **Providers**
4. Activez les providers que vous souhaitez utiliser :
   - Google
   - Facebook
   - Apple (iOS uniquement)

### 2. Configurer Google OAuth

1. Dans **Authentication** > **Providers** > **Google**
2. Activez le provider
3. Récupérez vos identifiants depuis [Google Cloud Console](https://console.cloud.google.com/):
   - Créez un projet ou sélectionnez un projet existant
   - Activez l'API Google+ (ou Google Identity)
   - Créez des identifiants OAuth 2.0
   - Ajoutez les URI de redirection autorisés :
     - `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback`
     - `syncpadel://auth/callback` (pour mobile)
4. Copiez le **Client ID** et le **Client Secret** dans Supabase
5. Sauvegardez

### 3. Configurer Facebook OAuth

1. Dans **Authentication** > **Providers** > **Facebook**
2. Activez le provider
3. Récupérez vos identifiants depuis [Facebook Developers](https://developers.facebook.com/):
   - Créez une application Facebook
   - Ajoutez le produit "Facebook Login"
   - Dans les paramètres, ajoutez les URI de redirection autorisés :
     - `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback`
     - `syncpadel://auth/callback` (pour mobile)
4. Copiez l'**App ID** et l'**App Secret** dans Supabase
5. Sauvegardez

### 4. Configurer Apple Sign In (iOS uniquement)

1. Dans **Authentication** > **Providers** > **Apple**
2. Activez le provider
3. Récupérez vos identifiants depuis [Apple Developer](https://developer.apple.com/):
   - Créez un Service ID dans Certificates, Identifiers & Profiles
   - Configurez les domaines et les redirections
   - Créez une Key ID pour l'authentification
   - Téléchargez la clé privée (.p8)
4. Dans Supabase, configurez :
   - **Service ID** : L'identifiant de service Apple
   - **Key ID** : L'identifiant de la clé
   - **Private Key** : Le contenu du fichier .p8
5. Ajoutez les URI de redirection :
   - `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback`
   - `syncpadel://auth/callback` (pour mobile)
6. Sauvegardez

## Configuration de l'application

### Deep Link

Le deep link `syncpadel://` est déjà configuré dans `app.config.js`. Assurez-vous que :
- Le scheme est bien présent : `scheme: ["padelsync", "syncpadel"]`
- Les URI de redirection dans Supabase incluent `syncpadel://auth/callback`

### URI de redirection à configurer dans Supabase

Pour chaque provider, ajoutez ces URI de redirection :

- **Web** : `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback`
- **Mobile** : `syncpadel://auth/callback`

## Test de l'authentification

1. Lancez l'application
2. Allez sur l'écran de connexion/inscription
3. Cliquez sur un des boutons OAuth (Google, Facebook, ou Apple sur iOS)
4. Vous devriez être redirigé vers le navigateur pour l'authentification
5. Après l'authentification, vous devriez être redirigé vers l'application

## Dépannage

### L'authentification ne fonctionne pas

1. **Vérifiez les URI de redirection** :
   - Assurez-vous que `syncpadel://auth/callback` est bien configuré dans Supabase
   - Vérifiez que le scheme est bien présent dans `app.config.js`

2. **Vérifiez les identifiants** :
   - Vérifiez que les Client IDs et Secrets sont corrects
   - Pour Apple, vérifiez que la clé privée est correctement formatée

3. **Vérifiez les logs** :
   - Consultez les logs dans Supabase Dashboard > Authentication > Logs
   - Vérifiez les erreurs dans la console de l'application

### L'utilisateur est redirigé mais pas connecté

1. Vérifiez que le deep link est bien géré dans l'application
2. Vérifiez que les tokens sont correctement échangés
3. Vérifiez les logs de l'application pour les erreurs

### Apple Sign In ne s'affiche pas

- Apple Sign In n'est disponible que sur iOS
- Sur Android et Web, le bouton Apple ne s'affichera pas automatiquement

## Notes importantes

- Les comptes créés via OAuth ont généralement leur email vérifié automatiquement
- Les utilisateurs peuvent lier plusieurs providers à un même compte email
- Pour Apple, vous devez avoir un compte Apple Developer payant pour utiliser Sign in with Apple en production

