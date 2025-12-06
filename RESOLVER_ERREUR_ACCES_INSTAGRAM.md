# Résoudre l'erreur "You don't have access" pour Instagram Graph API

## 🔴 Problème

Vous voyez le message : **"You don't have access. This feature isn't available to you yet."**

Cela signifie que votre application Facebook n'a pas accès à Instagram Graph API.

## ✅ Solution : Ajouter Instagram Graph API à votre application

### Étape 1 : Accéder au tableau de bord de l'application

1. Allez sur [Facebook Developers Dashboard](https://developers.facebook.com/apps/)
2. Connectez-vous avec votre compte Facebook
3. Sélectionnez votre application (ex: "Padel Sync")

### Étape 2 : Ajouter le produit Instagram Graph API

1. Dans le tableau de bord de votre application, cherchez la section **"Ajouter des produits"** (Add Products) ou **"Products"** dans le menu de gauche
2. Recherchez **"Instagram Graph API"** dans la liste des produits disponibles
3. Cliquez sur **"Configurer"** (Set Up) ou **"Get Started"** à côté de "Instagram Graph API"

### Étape 3 : Configurer Instagram Graph API

1. Suivez les instructions à l'écran
2. Vous devrez peut-être :
   - Accepter les conditions d'utilisation
   - Configurer les paramètres de base
   - Vérifier que votre compte Instagram est connecté à une page Facebook

### Étape 4 : Vérifier que c'est activé

1. Dans le menu de gauche de votre application, vous devriez maintenant voir **"Instagram Graph API"** ou **"Instagram"**
2. Si c'est le cas, c'est bon ! ✅

### Étape 5 : Retourner sur Graph API Explorer

1. Allez sur [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Sélectionnez votre application dans le menu "Meta App"
3. Vous devriez maintenant pouvoir générer un token avec les permissions Instagram

## 🔄 Alternative : Utiliser une application existante avec Instagram Graph API

Si vous avez une autre application Facebook qui a déjà Instagram Graph API activé :

1. Dans Graph API Explorer, sélectionnez cette application dans le menu "Meta App"
2. Générez le token avec cette application
3. Utilisez l'App ID et App Secret de cette application pour l'échange de token long

## 📝 Notes importantes

- **Mode développement** : En mode développement, vous pouvez tester avec votre propre compte Instagram Business
- **Mode production** : Pour la production, vous devrez soumettre votre application pour révision par Meta
- **Permissions** : Assurez-vous que les permissions `instagram_basic`, `pages_show_list`, et `pages_read_engagement` sont disponibles

## ❓ Si le problème persiste

1. Vérifiez que votre compte Facebook a les droits administrateur sur l'application
2. Vérifiez que l'application est en mode "Development" (pas "Live")
3. Essayez de créer une nouvelle application et d'ajouter Instagram Graph API dès le début
4. Contactez le support Facebook Developers si nécessaire







