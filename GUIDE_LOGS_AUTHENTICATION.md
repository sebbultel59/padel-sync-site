# Guide : Voir les logs d'authentification dans Supabase

## 📍 Accès aux logs

### Méthode 1 : Via le Dashboard Supabase

1. **Connectez-vous au [Supabase Dashboard](https://app.supabase.com)**
2. **Sélectionnez votre projet** (dans la liste des projets)
3. **Dans le menu de gauche**, cliquez sur **"Authentication"**
4. **Cliquez sur "Logs"** dans le sous-menu (sous "MANAGE" ou "CONFIGURATION")

### Méthode 2 : Navigation directe

1. Allez directement sur : `https://app.supabase.com/project/iieiggyqcncbkjwsdcxl/auth/logs`
   - Remplacez `[VOTRE_PROJECT_ID]` par l'ID de votre projet (ex: `iieiggyqcncbkjwsdcxl`)

## 🔍 Ce que vous verrez dans les logs

Les logs d'authentification affichent :

- **Toutes les tentatives d'authentification** (connexion, inscription, etc.)
- **Les envois d'emails** (vérification, réinitialisation de mot de passe)
- **Les erreurs** (rate limit, SMTP errors, etc.)
- **Les événements OAuth** (si configuré)
- **Les timestamps** de chaque événement

## 📊 Informations disponibles

### Colonnes dans le tableau des logs

- **Timestamp** : Date et heure de l'événement
- **Event** : Type d'événement (ex: `user_signup`, `user_login`, `token_refreshed`)
- **User ID** : Identifiant de l'utilisateur concerné
- **IP Address** : Adresse IP de la requête
- **Status** : Succès ou erreur
- **Details** : Informations supplémentaires (message d'erreur, etc.)

### Types d'événements courants

- `user_signup` : Création d'un compte
- `user_login` : Connexion
- `token_refreshed` : Rafraîchissement du token
- `user_repeated_signup` : Tentative de création d'un compte existant
- `email_sent` : Email envoyé (vérification, réinitialisation)
- `email_rate_limit_exceeded` : Limite de taux d'email atteinte
- `smtp_error` : Erreur SMTP

## 🔎 Filtrer les logs

### Par utilisateur

1. Dans la barre de recherche en haut, entrez :
   - L'email de l'utilisateur
   - L'ID utilisateur (UID)
   - Le nom d'utilisateur

### Par type d'événement

1. Utilisez les filtres disponibles dans l'interface
2. Ou cherchez des mots-clés comme :
   - `rate limit`
   - `email`
   - `error`
   - `signup`
   - `login`

### Par date

1. Utilisez le sélecteur de date en haut de la page
2. Sélectionnez une plage de dates pour voir les logs d'une période spécifique

## 🐛 Trouver les erreurs d'envoi d'email

### Pour les emails de vérification

1. **Filtrez par événement** : Cherchez `user_signup` ou `email_sent`
2. **Cherchez les erreurs** : Filtrez par statut "error"
3. **Vérifiez le message d'erreur** dans la colonne "Details"

### Pour les emails de réinitialisation

1. **Filtrez par événement** : Cherchez `password_recovery` ou `email_sent`
2. **Cherchez les erreurs** : Filtrez par statut "error"
3. **Vérifiez le message d'erreur** dans la colonne "Details"

### Erreurs courantes à chercher

- **`email rate limit exceeded`** : Limite de taux atteinte (Supabase ou SMTP)
- **`smtp_error`** : Problème avec la configuration SMTP
- **`email_confirmation_not_enabled`** : Vérification d'email non activée
- **`invalid_email`** : Adresse email invalide

## 📝 Exemple de recherche

### Trouver pourquoi un email n'a pas été envoyé

1. **Allez dans Authentication > Logs**
2. **Dans la barre de recherche**, entrez l'email de l'utilisateur
3. **Filtrez par date** : Sélectionnez la date de la tentative
4. **Cherchez les événements** :
   - `user_signup` pour les emails de vérification
   - `password_recovery` pour les emails de réinitialisation
5. **Vérifiez le statut** :
   - ✅ **Success** : L'email a été envoyé
   - ❌ **Error** : Cliquez pour voir le message d'erreur

### Vérifier le quota Brevo/SMTP

1. **Cherchez** `rate limit` ou `rate_limit` dans les logs
2. **Vérifiez le timestamp** pour voir quand la limite a été atteinte
3. **Comptez les emails envoyés** dans la période concernée

## 🔗 Accès rapide

### URL directe (remplacez PROJECT_ID)

```
https://app.supabase.com/project/PROJECT_ID/auth/logs
```

Pour votre projet :
```
https://app.supabase.com/project/iieiggyqcncbkjwsdcxl/auth/logs
```

## 💡 Astuces

1. **Exportez les logs** : Certains plans Supabase permettent d'exporter les logs
2. **Utilisez les filtres** : Combinez plusieurs filtres pour affiner votre recherche
3. **Vérifiez les timestamps** : Les logs sont en UTC, ajustez selon votre fuseau horaire
4. **Regardez les détails** : Cliquez sur une ligne pour voir plus de détails sur l'événement

## 🆘 Si vous ne voyez pas les logs

1. **Vérifiez vos permissions** : Vous devez être administrateur du projet
2. **Vérifiez que vous êtes sur le bon projet** : Sélectionnez le bon projet dans le dashboard
3. **Actualisez la page** : Parfois les logs mettent quelques secondes à se charger
4. **Vérifiez la date** : Les logs peuvent être filtrés par date par défaut

## 📚 Ressources

- [Documentation Supabase - Auth Logs](https://supabase.com/docs/guides/auth/auth-logs)
- [Documentation Supabase - Monitoring](https://supabase.com/docs/guides/platform/logs)

