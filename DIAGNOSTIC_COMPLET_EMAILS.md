# Diagnostic complet : Emails de vérification non envoyés

## ✅ Vérifications déjà faites

- [x] "Confirm email" est activé dans Authentication > Sign In / Providers
- [x] "Allow new users to sign up" est activé

## 🔍 Vérifications supplémentaires à faire

### ÉTAPE 1 : Vérifier "Enable email confirmations" dans Settings

⚠️ **IMPORTANT** : Il y a DEUX endroits différents dans Supabase :

1. **Authentication > Sign In / Providers** → "Confirm email" (déjà activé ✅)
2. **Authentication > Settings** → "Enable email confirmations" (à vérifier)

**Vérifiez le deuxième** :

1. Allez dans **Authentication > Settings** (pas Sign In / Providers)
2. Dans la section **"Email Auth"**, vérifiez que :
   - ✅ **"Enable email confirmations"** est activé
   - ✅ **"Enable email confirmations for password resets"** est activé
3. **Cliquez sur "Save"** en bas de la page

### ÉTAPE 2 : Vérifier les logs Supabase

1. **Allez dans Authentication > Logs**
2. **Créez un compte de test** dans l'application
3. **Cherchez l'événement** `user_signup` pour votre email de test
4. **Vérifiez le statut** :
   - ✅ **Success** : L'email devrait être envoyé
   - ❌ **Error** : Cliquez pour voir le message d'erreur exact

**Erreurs courantes à chercher** :
- `email rate limit exceeded` → Quota Brevo/Supabase dépassé
- `SMTP error` → Problème de configuration SMTP
- `email confirmation not enabled` → Configuration manquante

### ÉTAPE 3 : Vérifier la configuration SMTP

1. **Dans Authentication > Settings**
2. **Faites défiler jusqu'à "SMTP Settings"**
3. **Vérifiez si "Enable Custom SMTP" est activé** :

   **Si OUI (SMTP Brevo configuré)** :
   - Vérifiez votre quota Brevo : [Brevo Dashboard](https://www.brevo.com/)
   - Plan gratuit : 300 emails/jour
   - Si quota dépassé → Attendre réinitialisation (minuit UTC) ou upgrader
   - Vérifiez les identifiants SMTP sont corrects

   **Si NON (SMTP Supabase par défaut)** :
   - Limite : ~3 emails/heure sur plan gratuit
   - Vérifiez que vous n'avez pas dépassé cette limite

### ÉTAPE 4 : Vérifier les templates d'email

1. **Allez dans Authentication > Email Templates**
2. **Cliquez sur "Confirm signup"**
3. **Vérifiez que** :
   - Le template existe et est actif
   - Il contient `{{ .ConfirmationURL }}` dans le contenu
   - Le sujet est défini
4. **Cliquez sur "Save"** si vous avez fait des modifications

### ÉTAPE 5 : Test avec logs détaillés

1. **Ouvrez la console du navigateur** (F12) ou les logs de l'app
2. **Créez un compte de test**
3. **Regardez les logs** pour voir :
   - Si `signUp` est appelé
   - Si une erreur est retournée
   - Le message d'erreur exact

## 🐛 Solutions selon le problème

### Problème 1 : "Enable email confirmations" pas activé dans Settings

**Solution** :
1. Authentication > Settings
2. Activez "Enable email confirmations" dans la section "Email Auth"
3. Cliquez sur "Save"
4. Testez à nouveau

### Problème 2 : Quota Brevo dépassé

**Solution** :
1. Vérifiez votre quota dans [Brevo Dashboard](https://www.brevo.com/)
2. Si dépassé :
   - Attendez la réinitialisation (quotidien à minuit UTC)
   - Ou upgrader votre plan Brevo
   - Ou désactivez temporairement le SMTP personnalisé

### Problème 3 : Erreur SMTP dans les logs

**Solution** :
1. Vérifiez les identifiants SMTP dans Supabase
2. Vérifiez que le Host est correct (`smtp-relay.brevo.com`)
3. Testez la connexion SMTP
4. Vérifiez les logs Brevo pour des erreurs

### Problème 4 : Limite Supabase atteinte

**Solution** :
1. Attendez 1 heure (limite : ~3 emails/heure)
2. Ou configurez un SMTP personnalisé (Brevo, SendGrid, etc.)

### Problème 5 : Email envoyé mais non reçu

**Solution** :
1. Vérifiez le dossier Spam
2. Vérifiez tous les dossiers Gmail (Promotions, Notifications, etc.)
3. Ajoutez `no-reply@syncpadel.app` aux contacts
4. Vérifiez les logs Brevo pour voir le statut de délivrabilité

## 📝 Checklist complète

- [ ] "Confirm email" activé dans Sign In / Providers ✅ (déjà fait)
- [ ] "Enable email confirmations" activé dans Settings > Email Auth
- [ ] "Save" cliqué après activation
- [ ] SMTP configuré correctement (si personnalisé)
- [ ] Quota Brevo/SMTP non dépassé
- [ ] Template "Confirm signup" existe et est correct
- [ ] Logs Supabase vérifiés (événement `user_signup`)
- [ ] Test de création de compte effectué
- [ ] Email reçu (ou vérifié dans Spam)

## 🔍 Diagnostic approfondi

### Vérifier dans les logs Supabase

1. **Authentication > Logs**
2. **Filtrez par** :
   - Event : `user_signup`
   - Date : Aujourd'hui
3. **Pour chaque événement** :
   - Vérifiez le statut (Success/Error)
   - Si Error, cliquez pour voir le message
   - Notez l'heure pour voir si c'est un problème de timing

### Vérifier dans les logs Brevo

1. **Brevo Dashboard > Statistics**
2. **Cherchez les emails récents** pour votre email de test
3. **Vérifiez le statut** :
   - "Envoyé" → Email envoyé par Brevo
   - "Délivré" → Email accepté par le serveur de destination
   - "Ouvert" → Email ouvert par l'utilisateur
   - "Bounced" → Email rejeté
   - "Blocked" → Email bloqué

## 🆘 Si rien ne fonctionne

1. **Vérifiez les deux endroits** :
   - Authentication > Sign In / Providers > "Confirm email" ✅
   - Authentication > Settings > "Enable email confirmations" ⚠️

2. **Vérifiez les logs Supabase** pour l'erreur exacte

3. **Testez avec un autre email** (différent fournisseur)

4. **Contactez le support Supabase** avec :
   - Les logs d'erreur
   - La date/heure de la tentative
   - L'email de test utilisé

