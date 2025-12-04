# Déploiement Urgent : Page de Réinitialisation

## 🔴 Problème

L'erreur 404 indique que la page `index.html` n'est pas encore déployée sur Vercel.

## ✅ Solution Immédiate

### Étape 1 : Pousser les changements sur Git

```bash
git add public/index.html public/reset-password.html vercel.json
git commit -m "Ajout page de réinitialisation de mot de passe"
git push
```

### Étape 2 : Vérifier le déploiement Vercel

1. Allez sur [Vercel Dashboard](https://vercel.com)
2. Vérifiez que le déploiement est en cours
3. Attendez que le déploiement soit terminé

### Étape 3 : Tester

Une fois déployé, testez l'URL :
```
https://syncpadel.app/#access_token=TEST&type=recovery
```

La page devrait rediriger vers le deep link.

## 🔄 Solution Alternative (Si Vercel ne fonctionne pas)

Si Vercel ne déploie pas automatiquement, vous pouvez :

1. **Déployer manuellement** :
   - Allez dans Vercel Dashboard
   - Cliquez sur "Redeploy" pour forcer un nouveau déploiement

2. **Vérifier la configuration** :
   - Assurez-vous que `outputDirectory: "public"` est bien dans `vercel.json`
   - Vérifiez que les fichiers sont bien dans le dossier `public/`

## 📝 Fichiers à déployer

- ✅ `public/index.html` - Page racine qui redirige vers le deep link
- ✅ `public/reset-password.html` - Page de réinitialisation
- ✅ `vercel.json` - Configuration Vercel avec les routes

## ⚠️ Important

Après le déploiement, **redemandez un nouvel email** de réinitialisation car l'ancien lien pointe vers une version non déployée.








