# Diagnostic : Email de confirmation non reçu

Si vous ne recevez pas l'email de confirmation lors de la création de compte, suivez ce guide de diagnostic.

## 🔍 Vérifications à faire

### 0. Cas spécial : Compte déjà existant

Si vous voyez dans les logs Supabase un événement `user_repeated_signup`, cela signifie que vous essayez de créer un compte qui existe déjà.

**Solution** :
1. **Dans l'application**, après avoir tenté de créer le compte, une alerte apparaîtra
2. **Cliquez sur "Renvoyer l'email de vérification"** pour recevoir un nouvel email
3. **Ou cliquez sur "Me connecter"** si votre compte est déjà vérifié et que vous vous souvenez de votre mot de passe

**Vérifier si votre compte existe déjà** :
1. **Dans Supabase Dashboard**, allez dans **Authentication > Users**
2. **Cherchez votre email** dans la liste
3. **Cliquez sur l'utilisateur** pour voir ses détails
4. **Vérifiez le statut de l'email** :
   - Si l'email n'est **pas vérifié** : vous verrez un indicateur ou l'email sera en attente de vérification
   - Si l'email est **vérifié** : vous pouvez vous connecter directement avec votre mot de passe
   - **Astuce** : Essayez de vous connecter directement dans l'application. Si ça fonctionne, votre compte est vérifié. Si vous obtenez une erreur de vérification, renvoyez l'email.

### 1. Vérifier la configuration Supabase Dashboard

1. **Connectez-vous au [Supabase Dashboard](https://app.supabase.com)**
2. **Sélectionnez votre projet**
3. **Allez dans Authentication > Settings**

#### Vérifications importantes :

- ✅ **"Enable email confirmations"** doit être **ACTIVÉ**
  - Si désactivé, aucun email ne sera envoyé
  - Activez-le et cliquez sur **Save**

- ✅ **Vérifiez les limites d'envoi**
  - Plan gratuit : ~3 emails/heure par utilisateur
  - Si vous avez déjà envoyé plusieurs emails, attendez un peu

### 2. Vérifier les logs Supabase

1. **Dans Supabase Dashboard**, allez dans **Authentication > Logs**
2. **Cherchez les entrées récentes** pour votre email
3. **Vérifiez les erreurs** :
   - Si vous voyez une erreur, notez le message
   - Les erreurs courantes :
     - "Email rate limit exceeded" → Trop d'emails envoyés
     - "SMTP configuration error" → Problème de configuration SMTP

### 3. Vérifier le dossier spam

- **Vérifiez votre dossier spam/courrier indésirable**
- **Cherchez les emails de** `noreply@mail.app.supabase.io` ou votre domaine SMTP personnalisé
- **Ajoutez l'expéditeur à vos contacts** si nécessaire

### 4. Vérifier les templates d'email

1. **Dans Supabase Dashboard**, allez dans **Authentication > Email Templates**
2. **Vérifiez le template "Confirm signup"** :
   - Le template doit être actif
   - L'URL de redirection doit être correcte
   - Pour mobile : `syncpadel://` ou l'URL de votre app
   - Pour web : `https://votre-domaine.com/` ou l'URL Supabase callback

### 5. Tester avec un autre email

- **Essayez avec un autre fournisseur d'email** (Gmail, Outlook, etc.)
- **Certains fournisseurs bloquent les emails** de Supabase par défaut
- **Vérifiez les filtres anti-spam** de votre fournisseur

### 6. Vérifier la configuration SMTP (si personnalisée)

Si vous utilisez un SMTP personnalisé :

1. **Dans Authentication > Settings > SMTP Settings**
2. **Vérifiez que la configuration est correcte** :
   - Serveur SMTP
   - Port
   - Identifiants
   - Expéditeur

### 7. Utiliser le bouton "Renvoyer l'email"

Dans l'application, après la création de compte :
- **Cliquez sur "Renvoyer l'email"** dans l'alerte
- **Attendez quelques minutes** avant de renvoyer (pour éviter les limites)

## 🔧 Solutions courantes

### Solution 1 : Activer "Enable email confirmations"

**Problème** : L'option est désactivée dans Supabase

**Solution** :
1. Supabase Dashboard > Authentication > Settings
2. Activez **"Enable email confirmations"**
3. Cliquez sur **Save**
4. Réessayez de créer un compte

### Solution 2 : Attendre la limite de taux

**Problème** : Trop d'emails envoyés récemment

**Solution** :
- Attendez 1 heure
- Réessayez de créer un compte ou utilisez "Renvoyer l'email"

### Solution 3 : Configurer un SMTP personnalisé

**Problème** : Les emails Supabase sont bloqués ou non reçus

**Solution** :
1. Configurez un SMTP personnalisé (Gmail, SendGrid, etc.)
2. Dans Supabase Dashboard > Authentication > Settings > SMTP Settings
3. Entrez vos identifiants SMTP
4. Testez l'envoi

### Solution 4 : Vérifier les URLs de redirection

**Problème** : Les liens dans l'email ne fonctionnent pas

**Solution** :
1. Vérifiez les URLs dans Authentication > Email Templates
2. Pour mobile : `syncpadel://` ou votre deep link
3. Pour web : URL de votre site ou callback Supabase

## 📝 Checklist de diagnostic

- [ ] "Enable email confirmations" est activé dans Supabase
- [ ] J'ai vérifié les logs Supabase pour des erreurs
- [ ] J'ai vérifié mon dossier spam
- [ ] J'ai attendu au moins 1 heure depuis le dernier envoi
- [ ] J'ai testé avec un autre email
- [ ] Les templates d'email sont correctement configurés
- [ ] Les URLs de redirection sont correctes
- [ ] J'ai utilisé le bouton "Renvoyer l'email" dans l'app

## 🆘 Si rien ne fonctionne

1. **Vérifiez les logs Supabase** pour des erreurs spécifiques
2. **Contactez le support Supabase** si le problème persiste
3. **Vérifiez votre configuration SMTP** si vous en utilisez un
4. **Testez avec un compte de test** sur un autre fournisseur d'email

## 📧 Informations utiles pour le support

Si vous contactez le support, fournissez :
- L'adresse email utilisée
- La date/heure de la tentative
- Les logs Supabase (screenshots)
- Le message d'erreur (s'il y en a)
- La configuration SMTP (si personnalisée)

