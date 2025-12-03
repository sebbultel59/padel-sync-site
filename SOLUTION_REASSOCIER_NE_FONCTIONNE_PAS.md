# Solution : "Réassocier" ne fonctionne pas

## Problème

Vous voyez une page Facebook qui demande de "Réassocier Sébastien Bultel à Padel Sync ?" mais cliquer sur "Réassocier" ne fait rien.

## Cause

L'application "Padel Sync" n'est pas correctement configurée ou a des problèmes de permissions. C'est un problème Facebook/Meta, pas lié à votre code.

## Solution : Utiliser "Graph API Explorer" par défaut

**C'est la solution la plus simple et la plus fiable :**

### Étapes

1. **Allez sur Graph API Explorer** : https://developers.facebook.com/tools/explorer/

2. **Dans le menu "Meta App"**, sélectionnez **"Graph API Explorer"** (application par défaut)
   - C'est l'application par défaut de Facebook
   - Pas besoin de configuration
   - Pas de problème de réassociation
   - Fonctionne immédiatement

3. **Dans "Utilisateur ou Page"**, sélectionnez votre **PAGE Facebook**
   - Important : sélectionnez votre page, pas votre compte utilisateur
   - Voir `GUIDE_SELECTIONNER_PAGE_FACEBOOK.md` pour les détails

4. **Cliquez sur "Generate Access Token"**

5. **Sélectionnez les permissions** :
   - ✅ `instagram_basic`
   - ✅ `pages_show_list`
   - ✅ `pages_read_engagement`

6. **Copiez le token** et mettez-le dans l'application Padel Sync

### Avantages de "Graph API Explorer"

- ✅ Fonctionne immédiatement, sans configuration
- ✅ Pas de problème de réassociation
- ✅ Pas besoin d'accéder au Dashboard
- ✅ Parfait pour tester

### Inconvénient

- ⚠️ Le token expire dans 1-2 heures (mais permet de tester la fonctionnalité)

## Alternative : Corriger l'application "Padel Sync"

Si vous voulez absolument utiliser "Padel Sync", vous devez :

1. **Accéder au Dashboard Facebook** : https://developers.facebook.com/apps/
2. **Sélectionner "Padel Sync"**
3. **Vérifier la configuration** :
   - Paramètres > De base
   - Vérifier que l'App ID et App Secret sont corrects
   - Ajouter une plateforme "Web" si nécessaire
4. **Réessayer**

**Mais c'est plus compliqué et pas nécessaire pour tester.**

## Recommandation

**Utilisez "Graph API Explorer"** pour l'instant. C'est la solution la plus simple et la plus fiable. Vous pourrez toujours créer une application personnalisée plus tard si nécessaire.

## Si vous avez besoin d'un token long

Si vous voulez un token qui dure 60 jours :

1. Utilisez "Graph API Explorer" pour obtenir un token court
2. Dans l'application Padel Sync, fournissez :
   - L'App ID de "Graph API Explorer" (visible dans Graph API Explorer)
   - L'App Secret (si vous pouvez l'obtenir)
3. L'application échangera automatiquement le token court en token long

**Note** : Pour la production, vous devrez créer une application Facebook correctement configurée, mais pour tester, "Graph API Explorer" est parfait.



