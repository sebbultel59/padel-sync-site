# Obtenir un token Instagram sans accès au Dashboard

Si vous n'avez plus accès au Facebook Developers Dashboard, voici plusieurs méthodes alternatives.

## ⚠️ Clarification importante

**Le message "You don't have access" sur Facebook Dashboard n'est PAS lié à Supabase.**

- ✅ Notre code n'utilise **PAS de variables d'environnement Supabase**
- ✅ Tout fonctionne avec un **projet Supabase gratuit**
- ✅ Les tokens sont stockés dans la **table `instagram_tokens`** (base de données normale)
- ❌ Le problème d'accès Facebook Dashboard est un **problème Facebook/Meta**, pas Supabase

Voir `CLARIFICATION_TOKEN_INSTAGRAM.md` pour plus de détails.

## 🔄 Méthode 1 : Créer une application directement depuis Graph API Explorer

Cette méthode permet de créer une application et d'obtenir un token sans passer par le Dashboard.

### Étape 1 : Accéder à Graph API Explorer

1. Allez directement sur : **https://developers.facebook.com/tools/explorer/**
2. Connectez-vous avec votre compte Facebook

### Étape 2 : Créer une application depuis l'explorateur

1. Dans Graph API Explorer, cliquez sur le menu déroulant **"Meta App"** en haut à droite
2. Cliquez sur **"Créer une application"** ou **"Create App"**
3. Suivez les étapes :
   - Choisissez **"Aucun type d'application"** ou **"Other"**
   - Donnez un nom (ex: "Padel Sync Instagram")
   - Cliquez sur **"Créer l'application"**

### Étape 3 : Ajouter Instagram Graph API (si possible)

1. Après la création, Graph API Explorer devrait vous rediriger ou afficher un lien vers le Dashboard
2. Si vous pouvez accéder, ajoutez "Instagram Graph API" comme produit
3. **Si vous ne pouvez pas accéder**, passez à la Méthode 2

### Étape 4 : Générer le token

1. Dans Graph API Explorer, sélectionnez votre nouvelle application
2. Dans "Utilisateur ou Page", sélectionnez votre PAGE Facebook (ou votre compte)
3. Cliquez sur **"Generate Access Token"**
4. Sélectionnez les permissions :
   - `instagram_basic`
   - `pages_show_list`
   - `pages_read_engagement`
5. Copiez le token généré

## 🔄 Méthode 2 : Utiliser une application existante

Si vous avez déjà une application Facebook (même pour un autre projet) :

1. Allez sur **Graph API Explorer** : https://developers.facebook.com/tools/explorer/
2. Dans le menu "Meta App", sélectionnez une application existante
3. Essayez de générer un token avec les permissions Instagram
4. Si ça fonctionne, utilisez cette application

## 🔄 Méthode 3 : Utiliser un compte Facebook Business

Si vous avez un compte Facebook Business ou une page Facebook :

1. Connectez-vous avec le compte qui gère votre page Facebook
2. Allez sur Graph API Explorer
3. Créez une nouvelle application ou utilisez une existante
4. Générer le token pour la page Facebook directement

## 🔄 Méthode 4 : Demander l'accès à un collègue

Si quelqu'un d'autre a accès au Dashboard :

1. Demandez-lui de créer une application ou de vous donner l'accès à une existante
2. Il peut vous donner :
   - L'App ID
   - L'App Secret (optionnel, pour token long)
   - Ou générer un token directement

## 🔄 Méthode 5 : Utiliser un token utilisateur directement

**⚠️ Cette méthode est limitée mais peut fonctionner pour tester :**

1. Allez sur Graph API Explorer
2. Utilisez l'application par défaut "Graph API Explorer" (sans créer d'app)
3. Cliquez sur "Generate Access Token"
4. Sélectionnez les permissions Instagram
5. Générez le token

**Limitations :**
- Le token expire rapidement (1-2 heures)
- Certaines fonctionnalités peuvent être limitées
- Pas idéal pour la production

## 🔄 Méthode 6 : Vérifier les restrictions de votre compte

Si vous ne pouvez pas accéder au Dashboard, vérifiez :

1. **Vérifiez votre compte Facebook** :
   - Allez sur facebook.com
   - Vérifiez que votre compte n'est pas restreint
   - Vérifiez les notifications Facebook

2. **Essayez un autre navigateur** :
   - Parfois les cookies/cache bloquent l'accès
   - Essayez en navigation privée

3. **Vérifiez les droits administrateur** :
   - Si l'application appartient à quelqu'un d'autre, demandez les droits administrateur

## 🔄 Méthode 7 : Créer un nouveau compte Facebook (dernier recours)

Si rien ne fonctionne :

1. Créez un nouveau compte Facebook (avec un email différent)
2. Créez une page Facebook pour votre club
3. Connectez votre Instagram Business à cette page
4. Créez une nouvelle application depuis ce compte
5. Utilisez cette application pour générer le token

**⚠️ Note :** Cette méthode nécessite de reconnecter Instagram à la nouvelle page Facebook.

## 📝 Recommandation

**Pour tester rapidement :**
- Utilisez la **Méthode 1** (créer depuis Graph API Explorer)
- Ou la **Méthode 5** (token utilisateur direct)
- Utilisez une application existante comme "Padel Sync" ou "Padel Sync - Club Integration"

**Pour la production :**
- Il faudra résoudre le problème d'accès au Dashboard
- Ou utiliser un compte Facebook Business avec accès complet
- Ou continuer à utiliser Graph API Explorer pour générer de nouveaux tokens

## 💡 Utiliser une application existante

Si vous avez déjà des applications Facebook (comme "Padel Sync" visible dans vos paramètres) :

1. Allez sur **Graph API Explorer** : https://developers.facebook.com/tools/explorer/
2. Dans le menu "Meta App", sélectionnez **"Padel Sync"** (ou une autre application existante)
3. Dans "Utilisateur ou Page", sélectionnez votre **PAGE Facebook** (recommandé)
4. Cliquez sur **"Generate Access Token"**
5. Sélectionnez les permissions : `instagram_basic`, `pages_show_list`, `pages_read_engagement`
6. Copiez le token et mettez-le dans la table `instagram_tokens` via la console Supabase

## 🔴 Erreur "Invalid platform app"

Si vous voyez l'erreur **"Invalid platform app"** ou **"Les paramètres de demandes ne sont pas valides: Invalid platform app"** :

### Solution 1 : Ajouter une plateforme à l'application

1. Allez sur [Facebook Developers Dashboard](https://developers.facebook.com/apps/)
2. Sélectionnez votre application (ex: "Padel Sync")
3. Dans le menu de gauche, allez dans **"Paramètres"** > **"De base"**
4. Faites défiler jusqu'à la section **"Ajouter une plateforme"** ou **"Add Platform"**
5. Cliquez sur **"Ajouter une plateforme"** et sélectionnez **"Site Web"** ou **"Web"**
6. Ajoutez une URL (peut être une URL temporaire comme `https://localhost` ou `https://example.com`)
7. Cliquez sur **"Enregistrer les modifications"**

### Solution 2 : Utiliser Graph API Explorer directement

Si vous ne pouvez pas accéder au Dashboard :

1. Allez sur **Graph API Explorer** : https://developers.facebook.com/tools/explorer/
2. Dans le menu "Meta App", sélectionnez l'application **"Graph API Explorer"** (application par défaut)
3. Cette application n'a pas besoin de configuration de plateforme
4. Générez le token avec cette application
5. **Note** : Ce token expire rapidement (1-2 heures), mais permet de tester

### Solution 3 : Créer une nouvelle application depuis Graph API Explorer

1. Allez sur **Graph API Explorer** : https://developers.facebook.com/tools/explorer/
2. Cliquez sur **"Meta App"** > **"Créer une application"**
3. Choisissez **"Aucun type d'application"** ou **"Other"**
4. Donnez un nom et créez l'application
5. **Important** : Après création, vous devrez peut-être ajouter une plateforme, mais Graph API Explorer peut fonctionner sans

## ❓ Si aucune méthode ne fonctionne

1. Contactez le support Facebook Developers : https://developers.facebook.com/support/
2. Vérifiez si votre compte Facebook a des restrictions
3. Essayez de récupérer l'accès à votre compte Facebook original
4. Utilisez l'application "Graph API Explorer" par défaut pour générer un token de test

