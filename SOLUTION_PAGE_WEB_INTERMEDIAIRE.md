# Solution : Page Web Intermédiaire pour Rediriger vers le Deep Link

## 🔴 Problème

Supabase redirige toujours vers `https://iieiggyqcncbkjwsdcxl.supabase.co/#access_token=...` (racine) au lieu d'utiliser le deep link, ce qui cause l'erreur "requested path is invalid".

## ✅ Solution

Créer une **page web intermédiaire** qui :
1. Reçoit le token depuis l'URL Supabase
2. Redirige automatiquement vers le deep link avec le token

### Fichiers créés

1. **`public/reset-password.html`** : Page web qui redirige vers le deep link
2. **Configuration Vercel** : Route ajoutée pour `/reset-password`
3. **Code modifié** : Utilise maintenant l'URL de la page web au lieu du deep link direct

## 🔄 Comment ça fonctionne

1. **L'utilisateur demande la réinitialisation** depuis l'app
2. **Le code envoie** `https://syncpadel.app/reset-password` comme `redirectTo`
3. **Supabase envoie un email** avec un lien vers :
   ```
   https://syncpadel.app/reset-password#access_token=TOKEN&type=recovery
   ```
4. **L'utilisateur clique sur le lien** dans l'email
5. **La page web s'ouvre** et extrait le token depuis l'URL
6. **La page redirige automatiquement** vers : `syncpadel://reset-password#access_token=TOKEN&type=recovery`
7. **L'application mobile s'ouvre automatiquement** (si installée)
8. **L'app détecte le deep link** et ouvre la page de réinitialisation

## 📧 Configuration dans Supabase Dashboard

### Étape 1 : Ajouter l'URL de la page web aux Redirect URLs

Dans **Supabase Dashboard** > **Authentication** > **URL Configuration** > **Redirect URLs**, ajoutez :

```
https://syncpadel.app/reset-password
```

⚠️ **Remplacez `syncpadel.app` par votre vrai domaine** si vous en avez un, sinon utilisez le domaine Vercel de votre projet.

### Étape 2 : Vérifier le Site URL

Dans **Site URL**, configurez :
```
https://syncpadel.app
```

Ou votre domaine Vercel.

### Étape 3 : Sauvegarder

Cliquez sur **Save changes**.

## 🚀 Déploiement

### Option 1 : Vercel (recommandé)

1. **Poussez les changements** sur votre repo
2. **Vercel déploiera automatiquement** la page `reset-password.html`
3. **L'URL sera** : `https://votre-projet.vercel.app/reset-password`

### Option 2 : Autre hébergeur

1. **Uploadez** le fichier `public/reset-password.html` sur votre serveur
2. **Configurez** une route pour `/reset-password`
3. **Mettez à jour** l'URL dans le code et Supabase

## 🔧 Code modifié

Le code utilise maintenant l'URL de la page web :

```javascript
const redirectTo = Platform.OS === 'web' && typeof window !== 'undefined'
  ? `${window.location.origin}/reset-password`
  : 'https://syncpadel.app/reset-password';
```

⚠️ **Remplacez `syncpadel.app` par votre vrai domaine** dans le code.

## 🧪 Test

1. **Déployez la page web** sur Vercel ou votre hébergeur
2. **Mettez à jour l'URL** dans le code et Supabase Dashboard
3. **Redemandez un email** de réinitialisation depuis l'app
4. **Vérifiez l'email** - Le lien devrait pointer vers :
   ```
   https://syncpadel.app/reset-password#access_token=TOKEN&type=recovery
   ```
5. **Cliquez sur le lien** :
   - La page web s'ouvre brièvement
   - L'app s'ouvre automatiquement avec le token
   - La page de réinitialisation s'affiche

## ⚠️ Important

### Domaine à utiliser

- **Si vous avez un domaine** : Utilisez-le (ex: `https://syncpadel.app`)
- **Si vous n'avez pas de domaine** : Utilisez votre domaine Vercel (ex: `https://votre-projet.vercel.app`)

### Mise à jour du code

Vous devez mettre à jour l'URL dans `app/(auth)/signin.js` :

```javascript
const redirectTo = 'https://VOTRE-DOMAINE.com/reset-password';
```

## 📝 Checklist

- [x] Page `reset-password.html` créée
- [x] Route Vercel configurée
- [ ] URL mise à jour dans le code (remplacer `syncpadel.app`)
- [ ] URL ajoutée dans Redirect URLs (Supabase Dashboard)
- [ ] Site URL configuré (Supabase Dashboard)
- [ ] Page déployée sur Vercel/hébergeur
- [ ] Test d'envoi d'email réussi
- [ ] Le lien dans l'email pointe vers la page web
- [ ] La page redirige vers le deep link
- [ ] L'app s'ouvre automatiquement

## 🔍 Dépannage

### La page web ne redirige pas vers l'app

1. **Vérifiez que le scheme est configuré** dans `app.config.js`
2. **Vérifiez que l'app est installée** (pas Expo Go)
3. **Testez le deep link manuellement** : `syncpadel://reset-password#test`

### L'erreur "requested path is invalid" persiste

1. **Vérifiez que l'URL de la page web est dans les Redirect URLs**
2. **Vérifiez que le Site URL est correct**
3. **Redemandez un nouvel email** après avoir modifié la configuration

