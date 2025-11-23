# Fix : Le lien redirige vers example.com au lieu de l'app

## 🔴 Problème

Le lien dans l'email de réinitialisation pointe vers `example.com` au lieu de l'URL Supabase ou du deep link.

## 🔍 Cause

Supabase utilise `example.com` comme URL de redirection par défaut quand :
1. L'URL de redirection n'est pas correctement configurée dans le Dashboard
2. Ou l'URL de redirection n'est pas dans la liste des URLs autorisées

## ✅ Solution : Configuration dans Supabase Dashboard

### Étape 1 : Configurer l'URL de redirection par défaut

1. Allez dans **Supabase Dashboard** > **Authentication** > **URL Configuration**
2. Dans la section **Site URL**, configurez :
   - **Site URL** : `https://iieiggyqcncbkjwsdcxl.supabase.co`
   - OU laissez vide si vous utilisez uniquement des deep links

### Étape 2 : Ajouter les URLs de redirection autorisées

Dans **Redirect URLs**, ajoutez **TOUTES** ces URLs :

```
https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/verify
syncpadel://reset-password
syncpadel://auth/callback
```

⚠️ **IMPORTANT** : Ajoutez les URLs une par une, cliquez sur "Add" après chaque URL.

### Étape 3 : Vérifier le template d'email

1. Allez dans **Authentication** > **Email Templates** > **Reset Password**
2. Assurez-vous que le template utilise `{{ .ConfirmationURL }}` :
   ```html
   <a href="{{ .ConfirmationURL }}">Réinitialiser ton mot de passe</a>
   ```

## 🔧 Code

Le code a été modifié pour utiliser l'URL complète de Supabase :

```javascript
const redirectTo = `${SUPABASE_URL}/auth/v1/verify?redirect_to=${encodeURIComponent('syncpadel://reset-password')}`;
```

## 🧪 Test

1. **Demander la réinitialisation** depuis l'app
2. **Vérifier l'email** - Le lien devrait maintenant pointer vers :
   ```
   https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/verify?token=...&type=recovery&redirect_to=syncpadel://reset-password
   ```
3. **Cliquer sur le lien** :
   - Le navigateur s'ouvre sur l'URL Supabase
   - Supabase vérifie le token
   - Supabase redirige vers `syncpadel://reset-password#access_token=...&type=recovery`
   - L'app s'ouvre automatiquement

## ⚠️ Si ça ne fonctionne toujours pas

1. **Vérifiez les logs** dans Supabase Dashboard > Authentication > Logs
2. **Vérifiez que l'URL est bien dans la liste** des URLs autorisées
3. **Testez avec une URL web** d'abord pour vérifier que le token fonctionne :
   ```
   https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/verify?token=TOKEN&type=recovery&redirect_to=https://example.com
   ```

## 📝 Checklist

- [ ] Site URL configuré dans Supabase Dashboard
- [ ] `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/verify` dans Redirect URLs
- [ ] `syncpadel://reset-password` dans Redirect URLs
- [ ] `syncpadel://auth/callback` dans Redirect URLs
- [ ] Template d'email utilise `{{ .ConfirmationURL }}`
- [ ] Code utilise l'URL complète avec `redirect_to`
- [ ] Test d'envoi d'email réussi
- [ ] Le lien dans l'email pointe vers Supabase (pas example.com)
- [ ] Le deep link fonctionne et ouvre l'app

