# Configuration Finale : Réinitialisation de Mot de Passe

## ✅ Configuration actuelle

- **Domaine** : `syncpadel.app` ✅
- **Page web** : `public/reset-password.html` ✅
- **Code** : Utilise `https://syncpadel.app/reset-password` ✅
- **Route Vercel** : Configurée ✅

## 📧 Configuration requise dans Supabase Dashboard

### Étape 1 : Ajouter l'URL aux Redirect URLs

1. Allez dans **Supabase Dashboard** > **Authentication** > **URL Configuration**
2. Dans **Redirect URLs**, ajoutez :
   ```
   https://syncpadel.app/reset-password
   ```
3. Cliquez sur **Add URL**

### Étape 2 : Configurer le Site URL

Dans **Site URL**, configurez :
```
https://syncpadel.app
```

### Étape 3 : Sauvegarder

Cliquez sur **Save changes** en haut à droite.

## 🔄 Comment ça fonctionne

1. **L'utilisateur demande la réinitialisation** depuis l'app
2. **Supabase envoie un email** avec un lien vers :
   ```
   https://syncpadel.app/reset-password#access_token=TOKEN&type=recovery
   ```
3. **L'utilisateur clique sur le lien** dans l'email
4. **La page web s'ouvre** (`reset-password.html`)
5. **La page extrait le token** depuis l'URL
6. **La page redirige automatiquement** vers : `syncpadel://reset-password#access_token=TOKEN&type=recovery`
7. **L'application mobile s'ouvre automatiquement** (si installée)
8. **L'app détecte le deep link** et ouvre la page de réinitialisation

## 🚀 Déploiement

### Vercel

1. **Poussez les changements** sur votre repo
2. **Vercel déploiera automatiquement** la page `reset-password.html`
3. **L'URL sera accessible** : `https://syncpadel.app/reset-password`

## 🧪 Test

1. **Configurez Supabase Dashboard** (étapes ci-dessus)
2. **Déployez la page web** sur Vercel
3. **Redemandez un email** de réinitialisation depuis l'app
4. **Vérifiez l'email** - Le lien devrait pointer vers :
   ```
   https://syncpadel.app/reset-password#access_token=TOKEN&type=recovery
   ```
5. **Cliquez sur le lien** :
   - La page web s'ouvre brièvement
   - L'app s'ouvre automatiquement avec le token
   - La page de réinitialisation s'affiche

## 📝 Checklist finale

- [x] Domaine configuré : `syncpadel.app`
- [x] Page `reset-password.html` créée
- [x] Route Vercel configurée
- [x] Code utilise `https://syncpadel.app/reset-password`
- [ ] `https://syncpadel.app/reset-password` ajouté dans Redirect URLs (Supabase Dashboard)
- [ ] Site URL configuré à `https://syncpadel.app` (Supabase Dashboard)
- [ ] Page déployée sur Vercel
- [ ] Test d'envoi d'email réussi
- [ ] Le lien dans l'email pointe vers `https://syncpadel.app/reset-password#...`
- [ ] La page redirige vers le deep link
- [ ] L'app s'ouvre automatiquement

## 🔍 Dépannage

### L'erreur "requested path is invalid" persiste

1. **Vérifiez que `https://syncpadel.app/reset-password` est dans les Redirect URLs**
2. **Vérifiez que le Site URL est `https://syncpadel.app`**
3. **Redemandez un nouvel email** après avoir modifié la configuration

### La page web ne redirige pas vers l'app

1. **Vérifiez que le scheme est configuré** dans `app.config.js` : `scheme: ["padelsync", "syncpadel"]`
2. **Vérifiez que l'app est installée** (pas Expo Go)
3. **Testez le deep link manuellement** : `syncpadel://reset-password#test`

### La page web affiche "Application non trouvée"

Cela signifie que l'app n'est pas installée ou que le deep link ne fonctionne pas. Vérifiez :
1. Que l'app est bien installée sur l'appareil
2. Que le scheme `syncpadel://` est bien configuré
3. Testez avec une build native (pas Expo Go)

