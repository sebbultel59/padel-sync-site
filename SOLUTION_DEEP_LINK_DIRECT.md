# Solution : Utiliser Directement le Deep Link

## 🔴 Problème

L'URL redirige vers `https://iieiggyqcncbkjwsdcxl.supabase.co/#access_token=...` (racine) au lieu de `/auth/v1/callback`, ce qui cause l'erreur "requested path is invalid".

## ✅ Solution

Utiliser **directement le deep link** `syncpadel://reset-password` dans `redirectTo`. Supabase va construire automatiquement l'URL complète dans l'email.

### Code modifié

```javascript
const redirectTo = Platform.OS === 'web' && typeof window !== 'undefined'
  ? `${window.location.origin}/reset-password`
  : 'syncpadel://reset-password';
```

## 📧 Configuration dans Supabase Dashboard

### Étape 1 : Vérifier le Site URL

Dans **Supabase Dashboard** > **Authentication** > **URL Configuration** > **Site URL** :

- Laissez **vide** ou mettez : `https://iieiggyqcncbkjwsdcxl.supabase.co`
- ⚠️ **Ne mettez PAS** de chemin comme `/auth/v1/callback` dans le Site URL

### Étape 2 : Vérifier les Redirect URLs

Dans **Redirect URLs**, vous devez avoir :

1. ✅ `syncpadel://reset-password` - **OBLIGATOIRE**
2. ✅ `syncpadel://auth/callback` - Pour OAuth
3. ✅ `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback` - Optionnel
4. ✅ `padelsync://` - Ancien scheme

**Supprimez** :
- ❌ `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/verify`
- ❌ Toute URL avec hash (`#access_token=...`)

### Étape 3 : Sauvegarder

Cliquez sur **Save changes**.

## 🔄 Comment ça fonctionne

1. **L'utilisateur demande la réinitialisation** depuis l'app
2. **Le code envoie** `syncpadel://reset-password` comme `redirectTo`
3. **Supabase envoie un email** avec un lien direct :
   ```
   syncpadel://reset-password#access_token=TOKEN&type=recovery
   ```
4. **L'utilisateur clique sur le lien** dans l'email
5. **L'application mobile s'ouvre automatiquement** (si installée)
6. **L'app détecte le deep link** et extrait le token
7. **L'app ouvre la page de réinitialisation** avec le token

## 🧪 Test

1. **Redemandez un email** de réinitialisation depuis l'app
2. **Vérifiez l'email** - Le lien devrait pointer directement vers :
   ```
   syncpadel://reset-password#access_token=TOKEN&type=recovery
   ```
3. **Cliquez sur le lien** :
   - Sur mobile : L'app s'ouvre automatiquement
   - Sur web : Le navigateur ne peut pas ouvrir le deep link (normal)

## ⚠️ Important

### Pourquoi ça ne fonctionnait pas avant ?

1. **Site URL avec chemin** : Si le Site URL contient un chemin, Supabase l'utilise comme base et ignore le `redirectTo`
2. **URL `/auth/v1/callback`** : Supabase ne peut pas utiliser cette URL comme `redirectTo` pour les emails de réinitialisation
3. **Deep link non autorisé** : Si `syncpadel://reset-password` n'est pas dans les Redirect URLs, Supabase refuse de l'utiliser

### Configuration finale

- **Site URL** : `https://iieiggyqcncbkjwsdcxl.supabase.co` (sans chemin)
- **Redirect URLs** : `syncpadel://reset-password` (obligatoire)
- **Code** : Utilise directement `syncpadel://reset-password`

## 🔍 Dépannage

### Le lien pointe toujours vers la racine Supabase

1. **Vérifiez que le Site URL ne contient pas de chemin**
2. **Vérifiez que `syncpadel://reset-password` est dans les Redirect URLs**
3. **Redemandez un nouvel email** après avoir modifié la configuration

### L'app ne s'ouvre pas sur mobile

1. **Vérifiez que le scheme est configuré** dans `app.config.js`
2. **Vérifiez que l'app est installée** (pas Expo Go)
3. **Testez avec une build native**

## 📝 Checklist

- [x] Code modifié pour utiliser directement `syncpadel://reset-password`
- [ ] Site URL configuré sans chemin (juste le domaine)
- [ ] `syncpadel://reset-password` dans Redirect URLs
- [ ] URLs invalides supprimées (`/auth/v1/verify`, URLs avec hash)
- [ ] Template d'email utilise `{{ .ConfirmationURL }}`
- [ ] Test d'envoi d'email réussi
- [ ] Le lien dans l'email pointe vers `syncpadel://reset-password#...`
- [ ] L'app s'ouvre automatiquement sur mobile











