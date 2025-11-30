# Guide : Obtenir un token Instagram/Facebook pour la synchronisation

Ce guide vous explique comment obtenir un token d'accès Facebook/Instagram pour tester la synchronisation Instagram dans l'application.

## Prérequis

1. ✅ Un compte Facebook
2. ✅ Un compte Instagram Business (ou Instagram connecté à une page Facebook)
3. ✅ Votre compte Instagram doit être connecté à une page Facebook

## Méthode 1 : Facebook Graph API Explorer (Recommandé pour tester)

### Étape 1 : Accéder à Graph API Explorer

1. Allez sur : https://developers.facebook.com/tools/explorer/
2. Connectez-vous avec votre compte Facebook

### Étape 2 : Créer ou sélectionner une application

1. En haut à droite, cliquez sur le menu déroulant "Meta App"
2. Si vous avez déjà une application, sélectionnez-la
3. Sinon, cliquez sur "Créer une application" :
   - Choisissez "Aucun type d'application" ou "Autre"
   - Donnez un nom à votre application (ex: "Padel Sync Test")
   - Cliquez sur "Créer l'application"

### Étape 2.5 : Ajouter Instagram Graph API (IMPORTANT)

**⚠️ Si vous voyez "You don't have access. This feature isn't available to you yet."**, vous devez d'abord ajouter le produit Instagram Graph API à votre application :

1. Allez sur [Facebook Developers Dashboard](https://developers.facebook.com/apps/)
2. Sélectionnez votre application (ou créez-en une nouvelle)
3. Dans le tableau de bord de l'application, cherchez la section "Ajouter des produits" (Add Products)
4. Recherchez "Instagram Graph API" dans la liste
5. Cliquez sur "Configurer" (Set Up) à côté de "Instagram Graph API"
6. Suivez les instructions pour configurer Instagram Graph API
7. Une fois configuré, retournez sur Graph API Explorer et réessayez

### Étape 3 : Obtenir un token utilisateur

1. Dans Graph API Explorer, vous verrez un champ "Token d'accès utilisateur"
2. Cliquez sur "Générer un token d'accès"
3. Une fenêtre s'ouvre pour sélectionner les permissions

### Étape 4 : Sélectionner les permissions nécessaires

Cochez les permissions suivantes :
- ✅ `instagram_basic` - Accès de base à Instagram
- ✅ `pages_show_list` - Voir la liste de vos pages Facebook
- ✅ `pages_read_engagement` - Lire les données d'engagement des pages
- ✅ `instagram_content_publish` (optionnel) - Pour publier sur Instagram

4. Cliquez sur "Générer un token d'accès"
5. Autorisez l'application si demandé

### Étape 5 : Copier le token

1. Le token apparaît dans le champ "Token d'accès utilisateur"
2. **⚠️ IMPORTANT** : Ce token expire dans 1-2 heures
3. Copiez ce token (vous en aurez besoin dans l'application)

### Étape 6 : Obtenir un token de longue durée (Optionnel)

Pour éviter que le token expire rapidement :

1. Dans Graph API Explorer, cliquez sur "i" à côté du token
2. Notez votre "User ID" (vous en aurez besoin)
3. Ouvrez un nouvel onglet et allez sur :
   ```
   https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=VOTRE_APP_ID&client_secret=VOTRE_APP_SECRET&fb_exchange_token=VOTRE_TOKEN_COURT
   ```
   Remplacez :
   - `VOTRE_APP_ID` : L'ID de votre application (visible dans les paramètres de l'app)
   - `VOTRE_APP_SECRET` : Le secret de l'application (visible dans les paramètres de l'app)
   - `VOTRE_TOKEN_COURT` : Le token que vous venez d'obtenir

4. Le résultat contient un `access_token` qui dure 60 jours

## Méthode 2 : Créer une application Facebook complète (Pour la production)

### Étape 1 : Créer l'application

1. Allez sur : https://developers.facebook.com/apps/
2. Cliquez sur "Créer une application"
3. Choisissez "Autre" comme type d'application
4. Donnez un nom (ex: "Padel Sync Instagram")
5. Ajoutez un email de contact
6. Cliquez sur "Créer l'application"

### Étape 2 : Ajouter Instagram Graph API

1. Dans le tableau de bord de votre application, allez dans "Ajouter des produits"
2. Recherchez "Instagram Graph API"
3. Cliquez sur "Configurer"
4. Suivez les instructions pour configurer Instagram

### Étape 3 : Configurer les permissions

1. Allez dans "Outils" > "Graph API Explorer"
2. Sélectionnez votre application
3. Cliquez sur "Générer un token d'accès"
4. Sélectionnez les permissions nécessaires (voir Méthode 1, Étape 4)

### Étape 4 : Obtenir l'App ID et App Secret

1. Dans le tableau de bord, allez dans "Paramètres" > "De base"
2. Notez votre "ID de l'application" (App ID)
3. Notez votre "Clé secrète de l'application" (App Secret) - cliquez sur "Afficher"

## Vérifier que votre Instagram est connecté à Facebook

Avant d'utiliser le token, assurez-vous que :

1. Votre compte Instagram est un compte Business ou Creator
2. Votre compte Instagram est connecté à une page Facebook :
   - Ouvrez Instagram sur mobile
   - Allez dans Paramètres > Compte > Passer à un compte professionnel
   - Connectez votre compte à une page Facebook

## Utiliser le token dans l'application

1. Ouvrez l'application Padel Sync
2. Allez dans "Gérer mon club" > "Infos"
3. Dans la section "Liens sociaux", trouvez "Synchronisation Instagram"
4. Cliquez sur "Connecter Instagram"
5. Collez votre token dans le champ
6. Cliquez sur "Connecter"

## Dépannage

### Erreur : "Token invalide"
- Vérifiez que le token n'a pas expiré
- Générez un nouveau token
- Assurez-vous d'avoir sélectionné toutes les permissions nécessaires

### Erreur : "Impossible de récupérer l'ID du compte Instagram"
- Vérifiez que votre compte Instagram est bien connecté à une page Facebook
- Vérifiez que votre compte Instagram est un compte Business/Creator
- Assurez-vous que le token a les permissions `pages_show_list`

### Le token expire trop vite
- Utilisez la Méthode 1, Étape 6 pour obtenir un token de longue durée (60 jours)
- Pour la production, implémentez un système de refresh automatique du token

## Sécurité

⚠️ **IMPORTANT** :
- Ne partagez jamais votre token avec d'autres personnes
- Ne commitez jamais le token dans le code source
- Les tokens doivent être stockés de manière sécurisée dans la base de données
- Pour la production, utilisez un flux OAuth complet au lieu de saisie manuelle

## Ressources utiles

- [Facebook Graph API Documentation](https://developers.facebook.com/docs/graph-api)
- [Instagram Graph API Documentation](https://developers.facebook.com/docs/instagram-api)
- [Facebook Graph API Explorer](https://developers.facebook.com/tools/explorer/)
- [Facebook Developers Dashboard](https://developers.facebook.com/apps/)


