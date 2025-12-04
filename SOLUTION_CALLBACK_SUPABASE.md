# Solution : Utiliser le Callback Supabase pour la Réinitialisation

## 🔴 Problème

L'erreur `{"error":"requested path is invalid"}` apparaît car Supabase ne peut pas rediriger directement vers un deep link `syncpadel://reset-password` depuis les emails.

## ✅ Solution

Utiliser l'URL de callback Supabase standard `/auth/v1/callback` qui gère automatiquement les redirections avec les tokens.

### Code modifié

```javascript
const redirectTo = Platform.OS === 'web' && typeof window !== 'undefined'
  ? `${window.location.origin}/reset-password`
  : `${SUPABASE_URL}/auth/v1/callback`;
```

## 🔄 Comment ça fonctionne

1. **L'utilisateur demande la réinitialisation** depuis l'app
2. **Supabase envoie un email** avec un lien vers :
   ```
   https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback#access_token=TOKEN&type=recovery
   ```
3. **L'utilisateur clique sur le lien** dans l'email
4. **Le navigateur s'ouvre** sur l'URL Supabase
5. **L'app détecte le deep link** (si configuré) ou **l'app gère l'URL** via le gestionnaire de deep links
6. **L'app extrait le token** depuis l'URL
7. **L'app ouvre la page de réinitialisation** avec le token

## 📧 Configuration dans Supabase Dashboard

### Étape 1 : Ajouter l'URL de callback aux URLs autorisées

1. Allez dans **Supabase Dashboard** > **Authentication** > **URL Configuration**
2. Dans **Redirect URLs**, ajoutez :
   - `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback`
   - `syncpadel://reset-password` (optionnel, pour le deep link direct)
   - `syncpadel://auth/callback` (pour OAuth)
3. Cliquez sur **Save**

### Étape 2 : Vérifier le template d'email

Votre template est correct ✅ :
```html
<a href="{{ .ConfirmationURL }}">Réinitialiser ton mot de passe</a>
```

`{{ .ConfirmationURL }}` contiendra automatiquement :
- L'URL de callback Supabase : `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback`
- Le token dans le hash : `#access_token=TOKEN&type=recovery`

## 🔧 Gestion dans l'application

Le code a été modifié pour détecter les callbacks Supabase avec des tokens de réinitialisation :

```javascript
// Détecte : https://PROJECT.supabase.co/auth/v1/callback#access_token=...&type=recovery
if (url.includes('/auth/v1/callback')) {
  const params = new URLSearchParams(urlParts[1]);
  const accessToken = params.get('access_token');
  const type = params.get('type');
  
  if (accessToken && type === 'recovery') {
    router.replace(`/reset-password?access_token=${accessToken}`);
  }
}
```

## 🧪 Test

1. **Demander la réinitialisation** :
   - Cliquez sur "Mot de passe oublié ?"
   - Entrez votre email
   - Cliquez sur "Envoyer l'email de réinitialisation"

2. **Vérifier l'email** :
   - Ouvrez votre boîte mail
   - Le lien devrait pointer vers : `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback#access_token=...&type=recovery`

3. **Cliquer sur le lien** :
   - Sur mobile : Le navigateur s'ouvre, puis l'app détecte le callback et s'ouvre
   - Sur web : Redirige vers votre page web de réinitialisation

## ⚠️ Important

### Sur mobile

- Le navigateur s'ouvre brièvement sur l'URL Supabase
- L'app doit être configurée pour gérer les URLs Supabase ou utiliser un deep link
- Le gestionnaire de deep links dans `signin.js` détecte automatiquement le callback

### Alternative : Deep Link direct

Si vous voulez que l'app s'ouvre directement sans passer par le navigateur, vous pouvez :
1. Configurer un **Universal Link** (iOS) ou **App Link** (Android)
2. Ou utiliser un service intermédiaire qui redirige vers le deep link

## 🔍 Dépannage

### L'erreur "requested path is invalid" persiste

1. **Vérifiez que l'URL de callback est dans les URLs autorisées** :
   - `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback`
2. **Vérifiez que le code utilise bien** `/auth/v1/callback` (pas `/auth/v1/verify`)
3. **Redemandez un nouvel email** de réinitialisation

### L'app ne s'ouvre pas automatiquement

1. **Vérifiez que le gestionnaire de deep links** dans `signin.js` détecte bien `/auth/v1/callback`
2. **Vérifiez les logs** de l'application pour voir si le callback est détecté
3. **Testez avec une build native** (pas Expo Go)

## 📝 Checklist

- [x] Code modifié pour utiliser `/auth/v1/callback`
- [ ] `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback` ajouté dans Redirect URLs
- [ ] Gestionnaire de deep links mis à jour pour détecter les callbacks
- [ ] Template d'email utilise `{{ .ConfirmationURL }}`
- [ ] Test d'envoi d'email réussi
- [ ] Le lien dans l'email pointe vers le callback Supabase
- [ ] L'app détecte le callback et ouvre la page de réinitialisation








