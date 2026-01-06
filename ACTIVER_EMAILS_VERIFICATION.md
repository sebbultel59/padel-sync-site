# Activer les emails de vérification dans Supabase

## 🎯 Objectif

S'assurer que les emails de vérification sont envoyés automatiquement lors de la création d'un compte.

## ✅ Vérifications à faire dans Supabase Dashboard

### ÉTAPE 1 : Vérifier que "Enable email confirmations" est activé

1. **Connectez-vous au [Supabase Dashboard](https://app.supabase.com)**
2. **Sélectionnez votre projet** (Padel-sync)
3. **Allez dans Authentication > Settings**
4. **Dans la section "Email Auth"**, vérifiez que :
   - ✅ **"Enable email confirmations"** est **ACTIVÉ** (toggle ON)
   - ✅ **"Secure email change"** est activé (recommandé)
5. **Cliquez sur "Save"** en bas de la page si vous avez fait des modifications

⚠️ **IMPORTANT** : Si "Enable email confirmations" est désactivé, **aucun email ne sera envoyé** lors de la création de compte.

### ÉTAPE 2 : Vérifier la configuration SMTP

1. **Toujours dans Authentication > Settings**
2. **Faites défiler jusqu'à "SMTP Settings"**
3. **Vérifiez si "Enable Custom SMTP" est activé** :
   
   **Si OUI (SMTP personnalisé configuré)** :
   - Vérifiez que le Host est correct (ex: `smtp-relay.brevo.com`)
   - Vérifiez que les identifiants sont corrects
   - Vérifiez votre quota Brevo (plan gratuit : 300 emails/jour)
   - Si le quota est dépassé, attendez la réinitialisation ou upgrader le plan
   
   **Si NON (SMTP Supabase par défaut)** :
   - Supabase utilisera son service d'email par défaut
   - Limite : ~3 emails/heure sur le plan gratuit
   - Les emails seront envoyés depuis `noreply@mail.app.supabase.io`

### ÉTAPE 3 : Vérifier les templates d'email

1. **Allez dans Authentication > Email Templates**
2. **Cliquez sur "Confirm signup"**
3. **Vérifiez que le template est actif** et contient :
   - Un sujet (ex: "Confirme ton inscription à PADEL Sync")
   - Un contenu avec `{{ .ConfirmationURL }}`
4. **Cliquez sur "Save"** si vous avez fait des modifications

### ÉTAPE 4 : Vérifier les logs

1. **Allez dans Authentication > Logs**
2. **Cherchez les événements récents** de type `user_signup`
3. **Vérifiez le statut** :
   - ✅ **Success** : L'email devrait être envoyé
   - ❌ **Error** : Cliquez pour voir le message d'erreur
   - Cherchez les erreurs "rate limit exceeded" ou "SMTP error"

## 🔧 Solutions selon le problème

### Problème 1 : "Enable email confirmations" est désactivé

**Solution** :
1. Activez "Enable email confirmations" dans Authentication > Settings
2. Cliquez sur "Save"
3. Testez en créant un nouveau compte

### Problème 2 : Quota Brevo dépassé

**Solution** :
1. Vérifiez votre quota dans [Brevo Dashboard](https://www.brevo.com/)
2. Attendez la réinitialisation (quotidien à minuit UTC)
3. Ou upgrader votre plan Brevo
4. Ou désactivez temporairement le SMTP personnalisé pour utiliser Supabase par défaut

### Problème 3 : Erreur SMTP

**Solution** :
1. Vérifiez les identifiants SMTP dans Supabase
2. Vérifiez que le Host est correct
3. Testez la connexion SMTP
4. Vérifiez les logs Brevo pour des erreurs

### Problème 4 : Template d'email manquant ou incorrect

**Solution** :
1. Vérifiez que le template "Confirm signup" existe
2. Vérifiez qu'il contient `{{ .ConfirmationURL }}`
3. Sauvegardez le template

## 🧪 Test après configuration

1. **Créez un compte de test** dans l'application
2. **Vérifiez les logs Supabase** :
   - Authentication > Logs
   - Cherchez l'événement `user_signup` pour votre email de test
   - Vérifiez que le statut est "Success"
3. **Vérifiez votre boîte mail** :
   - Boîte de réception
   - Dossier Spam
   - Tous les dossiers Gmail (Promotions, Notifications, etc.)
4. **Vérifiez les logs Brevo** (si SMTP personnalisé) :
   - Cherchez l'événement "Envoyé" pour votre email de test
   - Vérifiez le statut de délivrabilité

## 📝 Checklist rapide

- [ ] "Enable email confirmations" est activé dans Authentication > Settings
- [ ] "Save" a été cliqué après activation
- [ ] SMTP est configuré correctement (si personnalisé)
- [ ] Quota Brevo/SMTP n'est pas dépassé
- [ ] Template "Confirm signup" existe et est correct
- [ ] Test de création de compte effectué
- [ ] Logs Supabase vérifiés (événement `user_signup` avec statut Success)
- [ ] Email reçu (ou vérifié dans Spam)

## 🆘 Si ça ne fonctionne toujours pas

1. **Vérifiez les logs Supabase** pour voir l'erreur exacte
2. **Vérifiez les logs Brevo** (si SMTP personnalisé)
3. **Testez avec un autre email** (différent fournisseur)
4. **Contactez le support Supabase** si le problème persiste

## 📚 Ressources

- [Documentation Supabase - Email Auth](https://supabase.com/docs/guides/auth/auth-email)
- [Documentation Supabase - SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

