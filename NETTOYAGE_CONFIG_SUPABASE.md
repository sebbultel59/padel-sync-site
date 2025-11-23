# Nettoyage de la Configuration Supabase

## 🔴 Problèmes identifiés dans votre configuration

Dans votre configuration Supabase, il y a plusieurs URLs invalides :

1. ❌ `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/verify` - Cette URL cause l'erreur "requested path is invalid"
2. ❌ `syncpadel://reset-password#access_token=TOKEN&type=recovery` - Les URLs avec hash ne sont pas valides dans les redirects
3. ✅ `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback` - C'est la bonne URL à garder
4. ✅ `syncpadel://reset-password` - OK pour le deep link direct
5. ✅ `syncpadel://auth/callback` - OK pour OAuth
6. ✅ `padelsync://` - OK

## ✅ Solution : Nettoyer la configuration

### Étape 1 : Supprimer les URLs invalides

Dans **Supabase Dashboard** > **Authentication** > **URL Configuration** > **Redirect URLs** :

1. **Supprimez** ces URLs (décochez-les et supprimez-les) :
   - ❌ `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/verify`
   - ❌ `syncpadel://reset-password#access_token=TOKEN&type=recovery`

2. **Gardez** ces URLs :
   - ✅ `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback`
   - ✅ `syncpadel://reset-password`
   - ✅ `syncpadel://auth/callback`
   - ✅ `padelsync://`

### Étape 2 : Vérifier le Site URL

Dans **Site URL**, configurez :
```
https://iieiggyqcncbkjwsdcxl.supabase.co
```

### Étape 3 : Sauvegarder

Cliquez sur **Save changes** en haut à droite.

## 🔧 Configuration finale

Après nettoyage, vous devriez avoir **4 URLs** dans Redirect URLs :

1. `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback`
2. `syncpadel://reset-password`
3. `syncpadel://auth/callback`
4. `padelsync://`

## 📝 Pourquoi ces URLs ?

- **`/auth/v1/callback`** : URL standard de Supabase pour les callbacks (réinitialisation, OAuth, etc.)
- **`syncpadel://reset-password`** : Deep link pour ouvrir directement l'app (si configuré)
- **`syncpadel://auth/callback`** : Deep link pour les callbacks OAuth
- **`padelsync://`** : Ancien scheme (gardé pour compatibilité)

## ⚠️ Important

Les URLs avec des hash (`#access_token=...`) ne sont **PAS** valides dans les Redirect URLs. Le hash est ajouté dynamiquement par Supabase quand il génère le lien dans l'email.

## 🧪 Après nettoyage

1. **Redemandez un email** de réinitialisation depuis l'app
2. **Vérifiez l'email** - Le lien devrait pointer vers :
   ```
   https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback#access_token=TOKEN&type=recovery
   ```
3. **Cliquez sur le lien** - L'erreur "requested path is invalid" ne devrait plus apparaître

