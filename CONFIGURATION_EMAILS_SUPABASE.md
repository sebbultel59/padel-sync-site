# Configuration des emails dans Supabase Dashboard

Ce guide vous explique comment configurer les emails de vérification et de réinitialisation de mot de passe dans Supabase.

## 📋 Types d'emails à configurer

1. **Email de vérification** (lors de la création de compte)
2. **Email de réinitialisation de mot de passe** (mot de passe oublié)

---

## 🔧 ÉTAPE 1 : Activer l'envoi d'emails

### 1.1 Accéder aux paramètres

1. Connectez-vous au [Supabase Dashboard](https://app.supabase.com)
2. Sélectionnez votre projet
3. Allez dans **Authentication** > **Settings**

### 1.2 Activer les emails

Dans la section **Email Auth**, activez :

- ✅ **Enable email confirmations** (Confirmer l'email)
  - Oblige les utilisateurs à vérifier leur email avant de pouvoir se connecter
  - Un email est automatiquement envoyé lors de la création de compte

- ✅ **Enable email confirmations for password resets** (Confirmer l'email pour la réinitialisation)
  - Active l'envoi d'email pour la réinitialisation de mot de passe

- ✅ **Secure email change** (Sécuriser le changement d'email)
  - Requiert une confirmation par email lors du changement d'adresse email

### 1.3 Sauvegarder

Cliquez sur **Save** en bas de la page.

---

## 📧 ÉTAPE 2 : Configurer les templates d'email

### 2.1 Accéder aux templates

1. Dans Supabase Dashboard, allez dans **Authentication** > **Email Templates**
2. Vous verrez plusieurs templates disponibles

### 2.2 Template "Confirm signup" (Vérification de compte)

1. Cliquez sur **Confirm signup**
2. Vous pouvez personnaliser :
   - Le sujet de l'email
   - Le contenu de l'email
   - L'URL de redirection

3. **URL de redirection importante** :
   - Pour web : `https://votre-domaine.com/` ou `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback`
   - Pour mobile : L'application gère automatiquement la redirection via deep link

4. **Variables disponibles** :
   - `{{ .ConfirmationURL }}` : URL de confirmation
   - `{{ .Email }}` : Adresse email de l'utilisateur
   - `{{ .Token }}` : Token de confirmation (si nécessaire)

5. Exemple de template personnalisé :
   ```
   Sujet : Confirmez votre compte Padel Sync
   
   Bonjour,
   
   Merci de vous être inscrit sur Padel Sync !
   
   Cliquez sur le lien suivant pour confirmer votre compte :
   {{ .ConfirmationURL }}
   
   Si vous n'avez pas créé de compte, ignorez cet email.
   
   Cordialement,
   L'équipe Padel Sync
   ```

### 2.3 Template "Reset Password" (Réinitialisation de mot de passe)

1. Cliquez sur **Reset Password**
2. Personnalisez le sujet et le contenu
3. **URL de redirection** :
   - Pour web : `https://votre-domaine.com/reset-password`
   - Pour mobile : `syncpadel://reset-password` (géré par l'app)

4. Exemple de template :
   ```
   Sujet : Réinitialisation de votre mot de passe Padel Sync
   
   Bonjour,
   
   Vous avez demandé à réinitialiser votre mot de passe.
   
   Cliquez sur le lien suivant pour créer un nouveau mot de passe :
   {{ .ConfirmationURL }}
   
   Ce lien expire dans 1 heure.
   
   Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
   
   Cordialement,
   L'équipe Padel Sync
   ```

### 2.4 Sauvegarder les templates

Cliquez sur **Save** pour chaque template modifié.

---

## ⚙️ ÉTAPE 3 : Configurer SMTP (optionnel)

Par défaut, Supabase utilise son service d'email. Pour utiliser votre propre serveur SMTP :

### 3.1 Accéder aux paramètres SMTP

1. Dans **Authentication** > **Settings**
2. Faites défiler jusqu'à **SMTP Settings**

### 3.2 Configurer un SMTP personnalisé

1. Activez **Enable Custom SMTP**
2. Remplissez les informations :
   - **Sender email** : L'adresse email d'envoi (ex: noreply@syncpadel.app)
   - **Sender name** : Le nom de l'expéditeur (ex: Padel Sync)
   - **Host** : Le serveur SMTP (ex: smtp.gmail.com, smtp.sendgrid.net)
   - **Port** : Le port SMTP (généralement 587 pour TLS ou 465 pour SSL)
   - **Username** : Votre nom d'utilisateur SMTP
   - **Password** : Votre mot de passe SMTP
   - **Secure** : Cochez si vous utilisez SSL/TLS

3. **Exemples de fournisseurs SMTP** :
   - **SendGrid** : smtp.sendgrid.net, port 587
   - **Mailgun** : smtp.mailgun.org, port 587
   - **Gmail** : smtp.gmail.com, port 587 (nécessite un mot de passe d'application)
   - **AWS SES** : email-smtp.region.amazonaws.com, port 587

4. Cliquez sur **Save**

---

## 🧪 ÉTAPE 4 : Tester les emails

### 4.1 Tester l'email de vérification

1. Créez un compte de test dans votre application
2. Vérifiez votre boîte mail (et le dossier spam)
3. Cliquez sur le lien de confirmation
4. Vérifiez que vous pouvez maintenant vous connecter

### 4.2 Tester l'email de réinitialisation

1. Sur l'écran de connexion, cliquez sur "Mot de passe oublié ?"
2. Entrez votre email
3. Vérifiez votre boîte mail
4. Cliquez sur le lien de réinitialisation
5. Créez un nouveau mot de passe

### 4.3 Vérifier les logs

1. Dans Supabase Dashboard > **Authentication** > **Logs**
2. Vous verrez toutes les tentatives d'envoi d'email
3. En cas d'erreur, les détails seront affichés

---

## 🔍 Dépannage

### Les emails ne sont pas envoyés

1. **Vérifiez les paramètres** :
   - "Enable email confirmations" est activé
   - Les templates sont configurés
   - SMTP est configuré (si vous utilisez un SMTP personnalisé)

2. **Vérifiez les logs** :
   - Authentication > Logs dans Supabase Dashboard
   - Recherchez les erreurs d'envoi

3. **Vérifiez le dossier spam** :
   - Les emails peuvent être filtrés par votre fournisseur

4. **Vérifiez les limites** :
   - Supabase a des limites d'envoi d'email (gratuit : ~3 emails/heure)
   - Pour plus d'emails, configurez un SMTP personnalisé

### Les emails arrivent mais les liens ne fonctionnent pas

1. **Vérifiez les URLs de redirection** :
   - Dans les templates d'email
   - Dans le code de l'application

2. **Vérifiez les deep links** :
   - Pour mobile, vérifiez que `syncpadel://` est bien configuré
   - Vérifiez que l'app gère les deep links

### L'utilisateur ne reçoit pas l'email de réinitialisation

1. Vérifiez que l'email existe dans votre base de données
2. Vérifiez les logs dans Supabase Dashboard
3. Vérifiez que "Enable email confirmations for password resets" est activé

---

## 📝 Checklist de configuration

- [ ] "Enable email confirmations" activé dans Authentication > Settings
- [ ] "Enable email confirmations for password resets" activé
- [ ] Template "Confirm signup" configuré avec la bonne URL de redirection
- [ ] Template "Reset Password" configuré avec la bonne URL de redirection
- [ ] SMTP personnalisé configuré (optionnel, mais recommandé pour la production)
- [ ] Test d'envoi d'email de vérification réussi
- [ ] Test d'envoi d'email de réinitialisation réussi
- [ ] Vérification que les liens fonctionnent correctement

---

## 🔗 URLs de redirection à utiliser

### Pour les emails de vérification (signup)
- **Web** : `https://iieiggyqcncbkjwsdcxl.supabase.co/auth/v1/callback`
- **Mobile** : Géré automatiquement par l'application

### Pour les emails de réinitialisation (reset password)
- **Web** : `https://votre-domaine.com/reset-password`
- **Mobile** : `syncpadel://reset-password` ⚠️ **Utilisez exactement cette URL dans le template Supabase**

**Important** : Dans le template d'email Supabase, utilisez `{{ .ConfirmationURL }}` qui contiendra automatiquement le token. Le format final sera :
`syncpadel://reset-password#access_token=TOKEN&type=recovery`

---

## 📚 Ressources

- [Documentation Supabase - Email Auth](https://supabase.com/docs/guides/auth/auth-email)
- [Documentation Supabase - Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Documentation Supabase - SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

