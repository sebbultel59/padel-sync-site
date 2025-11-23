# Guide : Configuration du Deep Link pour la Réinitialisation de Mot de Passe

## 🔧 Problème résolu

Le deep link `syncpadel://reset-password` ne fonctionnait pas car Supabase envoyait un lien vers une page web inexistante.

## ✅ Solution implémentée

1. **Page de réinitialisation créée** : `app/(auth)/reset-password.js`
2. **Gestion des deep links** : L'app détecte automatiquement les liens `syncpadel://reset-password`
3. **Fonction "Mot de passe oublié"** : Ajoutée dans `app/(auth)/signin.js`

## 📧 Configuration dans Supabase Dashboard

### Étape 1 : Ajouter le deep link aux URLs autorisées ⚠️ IMPORTANT

1. Allez dans **Authentication** > **URL Configuration**
2. Dans **Redirect URLs**, ajoutez :
   - `syncpadel://reset-password`
   - `syncpadel://auth/callback`
3. Cliquez sur **Save**

**⚠️ Cette étape est CRUCIALE** - Sans cela, Supabase refusera de rediriger vers le deep link.

### Étape 2 : Configurer le template d'email

1. Allez dans **Authentication** > **Email Templates**
2. Cliquez sur **Reset Password**
3. Dans le template, utilisez `{{ .ConfirmationURL }}` qui contiendra automatiquement :
   - L'URL de callback Supabase
   - Le token de réinitialisation
   - Le paramètre `redirect_to` vers votre deep link

Votre template actuel est correct ✅ :
```html
<a href="{{ .ConfirmationURL }}">Réinitialiser ton mot de passe</a>
```

### Étape 3 : URL de redirection dans le code

Le code utilise maintenant l'URL de callback Supabase avec le paramètre `redirect_to` :
```javascript
`${SUPABASE_URL}/auth/v1/verify?redirect_to=syncpadel://reset-password`
```

Cela permet à Supabase de vérifier le token puis de rediriger vers le deep link.

### Étape 4 : Format du lien dans l'email

Quand Supabase envoie l'email, le lien pointera vers :
```
https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/verify?token=TOKEN&type=recovery&redirect_to=syncpadel://reset-password
```

Quand l'utilisateur clique sur ce lien :
1. Le navigateur s'ouvre brièvement sur l'URL Supabase
2. Supabase vérifie le token
3. Supabase redirige vers : `syncpadel://reset-password#access_token=TOKEN&type=recovery`
4. L'application mobile s'ouvre automatiquement
5. L'application détecte le deep link et ouvre la page de réinitialisation

## 🧪 Test

1. **Demander la réinitialisation** :
   - Sur l'écran de connexion, cliquez sur "Mot de passe oublié ?"
   - Entrez votre email
   - Cliquez sur "Envoyer l'email de réinitialisation"

2. **Vérifier l'email** :
   - Ouvrez votre boîte mail
   - Cliquez sur le lien de réinitialisation

3. **Sur mobile** :
   - Le lien devrait ouvrir l'application automatiquement
   - La page de réinitialisation s'affiche
   - Entrez votre nouveau mot de passe

## ⚠️ Important

### Si le deep link ne fonctionne pas

1. **Vérifiez que le scheme est bien configuré** dans `app.config.js` :
   ```javascript
   scheme: ["padelsync", "syncpadel"]
   ```

2. **Vérifiez le template d'email dans Supabase** :
   - Le template doit utiliser `{{ .ConfirmationURL }}`
   - Ne modifiez pas manuellement l'URL dans le template

3. **Sur iOS** :
   - Assurez-vous que l'app est installée (pas Expo Go)
   - Les deep links fonctionnent mieux avec une build native

4. **Sur Android** :
   - Vérifiez que les permissions sont correctes
   - Testez avec une build native (pas Expo Go)

## 🔍 Dépannage

### Le lien ouvre le navigateur au lieu de l'app

**Cause** : Le template d'email dans Supabase n'utilise pas la bonne URL.

**Solution** :
1. Dans Supabase Dashboard > Authentication > Email Templates > Reset Password
2. Vérifiez que le template utilise `{{ .ConfirmationURL }}`
3. Ne mettez pas d'URL manuelle dans le template

### L'app s'ouvre mais la page de réinitialisation ne s'affiche pas

**Cause** : Le deep link n'est pas correctement parsé.

**Solution** :
1. Vérifiez les logs de l'application
2. Vérifiez que `app/(auth)/reset-password.js` existe
3. Vérifiez que le gestionnaire de deep link dans `signin.js` détecte bien `reset-password`

### L'email n'est pas envoyé

**Cause** : La configuration Supabase n'est pas correcte.

**Solution** :
1. Vérifiez que "Enable email confirmations for password resets" est activé
2. Vérifiez les logs dans Supabase Dashboard > Authentication > Logs
3. Vérifiez que l'email existe dans votre base de données

## 📝 Checklist

- [x] Page `app/(auth)/reset-password.js` créée
- [x] Fonction `onForgotPassword` ajoutée dans `signin.js`
- [x] Gestionnaire de deep link pour `reset-password` ajouté
- [ ] Template d'email "Reset Password" configuré dans Supabase avec `{{ .ConfirmationURL }}`
- [ ] "Enable email confirmations for password resets" activé dans Supabase
- [ ] Test d'envoi d'email réussi
- [ ] Test de clic sur le lien dans l'email réussi
- [ ] Test de réinitialisation du mot de passe réussi

## 🔗 URLs à utiliser

- **URL de redirection dans le code** : `syncpadel://reset-password`
- **Template d'email** : Utiliser `{{ .ConfirmationURL }}` (Supabase ajoutera automatiquement le token)
- **Format final du lien** : `syncpadel://reset-password#access_token=TOKEN&type=recovery`

