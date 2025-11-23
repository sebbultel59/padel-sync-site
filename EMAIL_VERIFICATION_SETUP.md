# Configuration de l'email de vérification

Pour que l'email de vérification fonctionne correctement, vous devez configurer Supabase dans le dashboard.

## Étapes de configuration

### 1. Activer l'email de vérification dans Supabase Dashboard

1. Connectez-vous au [Supabase Dashboard](https://app.supabase.com)
2. Sélectionnez votre projet
3. Allez dans **Authentication** > **Settings**
4. Dans la section **Email Auth**, activez :
   - ✅ **Enable email confirmations** (Confirmer l'email)
   - ✅ **Secure email change** (Sécuriser le changement d'email)

### 2. Configurer les templates d'email (optionnel)

1. Dans **Authentication** > **Email Templates**
2. Personnalisez le template **Confirm signup** si nécessaire
3. Vérifiez que l'URL de redirection est correcte :
   - Pour web : `https://votre-domaine.com/`
   - Pour mobile : l'URL sera gérée automatiquement par l'app

### 3. Vérifier les paramètres SMTP (si vous utilisez un SMTP personnalisé)

1. Dans **Authentication** > **Settings** > **SMTP Settings**
2. Si vous utilisez un SMTP personnalisé, configurez-le ici
3. Sinon, Supabase utilisera son service d'email par défaut

### 4. Tester l'envoi d'email

1. Créez un compte de test dans l'application
2. Vérifiez que l'email de vérification est bien reçu
3. Si l'email n'est pas reçu :
   - Vérifiez le dossier spam
   - Vérifiez les logs dans **Authentication** > **Logs**
   - Vérifiez que l'email de vérification est bien activé

## Comportement de l'application

- **Création de compte** : Un email de vérification est automatiquement envoyé
- **Connexion** : L'utilisateur ne peut pas se connecter si son email n'est pas vérifié
- **Renvoi d'email** : L'utilisateur peut demander un nouvel email de vérification depuis l'écran de connexion

## Migration SQL

La migration `require_email_verification.sql` ajoute une fonction helper pour vérifier l'email dans les politiques RLS si nécessaire.

## Dépannage

### L'email n'est pas envoyé

1. Vérifiez que "Enable email confirmations" est activé dans le dashboard
2. Vérifiez les logs dans **Authentication** > **Logs**
3. Vérifiez que l'adresse email est valide
4. Vérifiez le dossier spam

### L'utilisateur peut se connecter sans vérifier l'email

1. Vérifiez que le code vérifie bien `email_confirmed_at` lors de la connexion
2. Vérifiez que "Enable email confirmations" est activé dans le dashboard
3. Vérifiez que l'utilisateur n'a pas été créé avant l'activation de cette fonctionnalité

