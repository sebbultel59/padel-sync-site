# Comment Redéployer sur Vercel

## 🚀 Méthode 1 : Pousser les changements sur Git (Recommandé)

C'est la méthode la plus simple et la plus propre :

```bash
# Ajouter les fichiers modifiés
git add public/index.html public/reset-password.html

# Créer un commit
git commit -m "Mise à jour ID App Store: id6754223924"

# Pousser sur Git
git push
```

Vercel détectera automatiquement le nouveau commit et redéploiera votre site.

## 🔄 Méthode 2 : Redéployer depuis le Dashboard Vercel

Si vous ne voulez pas faire de commit Git :

1. Allez sur [Vercel Dashboard](https://vercel.com)
2. Sélectionnez votre projet `padel-sync-site` (ou le nom de votre projet)
3. Allez dans l'onglet **Deployments**
4. Cliquez sur les **3 points** (⋯) à côté du dernier déploiement
5. Sélectionnez **Redeploy**
6. **Décochez** "Use existing Build Cache" (pour forcer un nouveau build)
7. Cliquez sur **Redeploy**

⚠️ **Note** : Cette méthode redéploiera la dernière version commitée. Si vous avez modifié les fichiers localement sans les committer, les changements ne seront pas déployés.

## ⏱️ Temps de déploiement

Le redéploiement prend généralement **10-30 secondes**. Vous pouvez suivre la progression dans le Dashboard Vercel.

## ✅ Vérifier le déploiement

Une fois le déploiement terminé, testez :

1. **Page d'accueil** : https://syncpadel.app/
2. **Avec token** : https://syncpadel.app/#access_token=TEST&type=recovery
3. **Vérifiez les liens** : Les boutons "Télécharger sur l'App Store" devraient pointer vers `id6754223924`

## 🔍 Vérifier que les changements sont déployés

Vous pouvez vérifier le code source de la page pour confirmer que l'ID est bien `id6754223924` :

1. Ouvrez https://syncpadel.app/ dans votre navigateur
2. Faites clic droit → "Afficher le code source"
3. Recherchez `id6754223924` dans le code






