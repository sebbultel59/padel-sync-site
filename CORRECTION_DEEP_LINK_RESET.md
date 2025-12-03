# Correction du Deep Link pour la Réinitialisation de Mot de Passe

## 🔴 Problème identifié

Le lien dans l'email ouvre `example.com` au lieu d'ouvrir l'application avec le deep link `syncpadel://reset-password`.

## 🔍 Cause du problème

Supabase ne peut **pas** rediriger directement vers un deep link custom dans les emails. Quand vous utilisez `syncpadel://reset-password` comme `redirectTo`, Supabase ne peut pas l'utiliser directement car :
1. Les emails sont ouverts dans un navigateur
2. Le navigateur ne peut pas ouvrir un deep link directement depuis un lien HTTP
3. Il faut passer par une page web intermédiaire qui redirige vers le deep link

## ✅ Solution

Utiliser l'URL de callback Supabase avec le paramètre `redirect_to` qui contient le deep link. Le format est :

```
https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/verify?redirect_to=syncpadel://reset-password
```

Quand l'utilisateur clique sur le lien dans l'email :
1. Il est redirigé vers l'URL Supabase
2. Supabase vérifie le token
3. Supabase redirige vers `syncpadel://reset-password#access_token=TOKEN&type=recovery`
4. L'application mobile s'ouvre automatiquement

## 📝 Configuration dans Supabase Dashboard

### Étape 1 : Ajouter le deep link aux URLs autorisées

1. Allez dans **Authentication** > **URL Configuration**
2. Dans **Redirect URLs**, ajoutez :
   - `syncpadel://reset-password`
   - `syncpadel://auth/callback`

### Étape 2 : Vérifier le template d'email

Votre template est correct ✅ :
```html
<a href="{{ .ConfirmationURL }}">Réinitialiser ton mot de passe</a>
```

`{{ .ConfirmationURL }}` contiendra automatiquement :
- L'URL de callback Supabase
- Le token de réinitialisation
- Le paramètre `redirect_to` vers votre deep link

## 🔧 Code modifié

Le code dans `app/(auth)/signin.js` a été modifié pour utiliser :

```javascript
const redirectTo = Platform.OS === 'web' && typeof window !== 'undefined'
  ? `${window.location.origin}/reset-password`
  : `${SUPABASE_URL}/auth/v1/verify?redirect_to=syncpadel://reset-password`;
```

## 🧪 Test

1. **Demander la réinitialisation** :
   - Cliquez sur "Mot de passe oublié ?"
   - Entrez votre email
   - Cliquez sur "Envoyer l'email de réinitialisation"

2. **Vérifier l'email** :
   - Ouvrez votre boîte mail
   - Le lien devrait pointer vers : `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/verify?token=...&type=recovery&redirect_to=syncpadel://reset-password`

3. **Cliquer sur le lien** :
   - Sur mobile : Le navigateur s'ouvre brièvement, puis l'application s'ouvre automatiquement
   - Sur web : Redirige vers votre page web de réinitialisation

## ⚠️ Important

### Si le deep link ne fonctionne toujours pas

1. **Vérifiez que le deep link est dans les URLs autorisées** dans Supabase Dashboard
2. **Vérifiez que le scheme est bien configuré** dans `app.config.js`
3. **Sur iOS** : Testez avec une build native (pas Expo Go)
4. **Sur Android** : Testez avec une build native (pas Expo Go)

### Si le lien ouvre toujours example.com

Cela signifie que Supabase n'a pas la bonne URL de redirection. Vérifiez :
1. Que le code utilise bien `${SUPABASE_URL}/auth/v1/verify?redirect_to=syncpadel://reset-password`
2. Que `SUPABASE_URL` est correct dans `config/env.js`
3. Que le deep link est dans les URLs autorisées dans Supabase Dashboard

## 📚 Références

- [Documentation Supabase - Password Reset](https://supabase.com/docs/guides/auth/auth-password-reset)
- [Documentation Supabase - Deep Links](https://supabase.com/docs/guides/auth/deep-linking)







