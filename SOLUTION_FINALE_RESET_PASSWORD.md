# Solution Finale : Réinitialisation de Mot de Passe avec Deep Link

## 🔴 Problème

L'erreur "No API key found in request" apparaît car Supabase utilise `/auth/v1/verify` qui nécessite une clé API. De plus, Supabase ne peut pas utiliser directement un deep link dans les emails.

## ✅ Solution

Utiliser **directement le deep link** dans `redirectTo`. Supabase va automatiquement construire l'URL complète dans l'email avec le token.

### Code modifié

```javascript
const redirectTo = Platform.OS === 'web' && typeof window !== 'undefined'
  ? `${window.location.origin}/reset-password`
  : `syncpadel://reset-password`;
```

## 📧 Configuration dans Supabase Dashboard

### Étape 1 : Ajouter le deep link aux URLs autorisées ⚠️ CRUCIAL

1. Allez dans **Supabase Dashboard** > **Authentication** > **URL Configuration**
2. Dans **Redirect URLs**, ajoutez :
   - `syncpadel://reset-password`
   - `syncpadel://auth/callback`
3. Cliquez sur **Save**

**⚠️ SANS CETTE ÉTAPE, SUPABASE REFUSERA DE REDIRIGER VERS LE DEEP LINK**

### Étape 2 : Vérifier le template d'email

Votre template est correct ✅ :
```html
<a href="{{ .ConfirmationURL }}">Réinitialiser ton mot de passe</a>
```

`{{ .ConfirmationURL }}` contiendra automatiquement :
- Le deep link : `syncpadel://reset-password`
- Le token dans le hash : `#access_token=TOKEN&type=recovery`

## 🔄 Comment ça fonctionne

1. **L'utilisateur demande la réinitialisation** depuis l'app
2. **Supabase envoie un email** avec un lien qui pointe directement vers :
   ```
   syncpadel://reset-password#access_token=TOKEN&type=recovery
   ```
3. **L'utilisateur clique sur le lien** dans l'email
4. **L'application mobile s'ouvre automatiquement** (si installée)
5. **L'app détecte le deep link** et extrait le token
6. **L'app ouvre la page de réinitialisation** avec le token

## 🧪 Test

1. **Demander la réinitialisation** :
   - Cliquez sur "Mot de passe oublié ?"
   - Entrez votre email
   - Cliquez sur "Envoyer l'email de réinitialisation"

2. **Vérifier l'email** :
   - Ouvrez votre boîte mail
   - Le lien devrait pointer directement vers : `syncpadel://reset-password#access_token=...&type=recovery`

3. **Cliquer sur le lien** :
   - Sur mobile : L'application s'ouvre automatiquement
   - Sur web : Le navigateur ne peut pas ouvrir le deep link (normal)

## ⚠️ Important

### Sur mobile (iOS/Android)

- ✅ Le deep link fonctionne si l'app est installée
- ✅ L'app s'ouvre automatiquement quand on clique sur le lien
- ✅ Le token est extrait automatiquement depuis l'URL

### Sur web

- ❌ Les deep links ne fonctionnent pas dans un navigateur web
- ✅ Pour le web, utilisez une page web de réinitialisation
- ✅ Le code gère automatiquement les deux cas (web et mobile)

## 🔍 Dépannage

### Le lien ne fonctionne toujours pas

1. **Vérifiez que le deep link est dans les URLs autorisées** dans Supabase Dashboard
2. **Vérifiez que le scheme est bien configuré** dans `app.config.js` :
   ```javascript
   scheme: ["padelsync", "syncpadel"]
   ```
3. **Vérifiez les logs** dans Supabase Dashboard > Authentication > Logs
4. **Testez avec une build native** (pas Expo Go)

### L'erreur "No API key" apparaît toujours

Cette erreur ne devrait plus apparaître car on utilise maintenant directement le deep link au lieu de `/auth/v1/verify`.

Si l'erreur persiste :
1. Vérifiez que le code utilise bien `syncpadel://reset-password` (pas une URL HTTP)
2. Vérifiez que le deep link est dans les URLs autorisées
3. Redemandez un nouvel email de réinitialisation

## 📝 Checklist

- [x] Code modifié pour utiliser directement le deep link
- [ ] `syncpadel://reset-password` ajouté dans Redirect URLs (Supabase Dashboard)
- [ ] `syncpadel://auth/callback` ajouté dans Redirect URLs (Supabase Dashboard)
- [ ] Template d'email utilise `{{ .ConfirmationURL }}`
- [ ] Test d'envoi d'email réussi
- [ ] Le lien dans l'email pointe vers `syncpadel://reset-password#...`
- [ ] Le deep link ouvre l'app automatiquement
- [ ] La page de réinitialisation s'affiche correctement








