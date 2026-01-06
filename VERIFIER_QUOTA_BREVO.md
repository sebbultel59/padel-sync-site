# Vérifier le quota Brevo (SMTP personnalisé)

Si vous utilisez Brevo (anciennement Sendinblue) comme SMTP personnalisé dans Supabase et que vous recevez l'erreur "email rate limit exceeded", cela peut être dû au quota Brevo dépassé.

## 🔍 Comment vérifier si Brevo est configuré

1. **Connectez-vous au [Supabase Dashboard](https://app.supabase.com)**
2. **Sélectionnez votre projet**
3. **Allez dans Authentication > Settings**
4. **Faites défiler jusqu'à "SMTP Settings"**
5. **Vérifiez si "Enable Custom SMTP" est activé**
   - Si oui, notez le **Host** (ex: `smtp-relay.brevo.com` ou `smtp-relay.sendinblue.com`)
   - Si Brevo est configuré, vous verrez probablement `smtp-relay.brevo.com` ou `smtp-relay.sendinblue.com`

## 📊 Vérifier votre quota Brevo

1. **Connectez-vous à votre compte [Brevo](https://www.brevo.com/)**
2. **Allez dans votre tableau de bord**
3. **Vérifiez la section "Usage" ou "Quota"**
   - Vous verrez le nombre d'emails envoyés aujourd'hui / ce mois
   - Vous verrez la limite de votre plan

### Plans Brevo et limites

- **Plan gratuit** : 300 emails/jour
- **Plan Lite** : 10 000 emails/mois
- **Plan Premium** : Limites plus élevées selon le plan

## ⚠️ Si le quota est dépassé

### Solutions immédiates

1. **Attendre la réinitialisation du quota**
   - Quota quotidien : se réinitialise à minuit (heure UTC)
   - Quota mensuel : se réinitialise le 1er du mois

2. **Vérifier les emails déjà envoyés**
   - Dans Brevo Dashboard > Statistics
   - Vérifiez si les emails ont bien été envoyés avant d'atteindre la limite

3. **Upgrader votre plan Brevo**
   - Si vous avez besoin d'envoyer plus d'emails
   - Allez dans Brevo Dashboard > Billing

### Solutions alternatives temporaires

1. **Désactiver temporairement le SMTP personnalisé**
   - Dans Supabase > Authentication > Settings > SMTP Settings
   - Désactivez "Enable Custom SMTP"
   - Supabase utilisera son service d'email par défaut (limite : ~3 emails/heure)
   - ⚠️ **Attention** : Les emails seront envoyés depuis `noreply@mail.app.supabase.io`

2. **Utiliser un autre fournisseur SMTP temporairement**
   - SendGrid (plan gratuit : 100 emails/jour)
   - Mailgun (plan gratuit : 100 emails/jour)
   - AWS SES (payant mais très économique)

## 🔧 Vérifier les logs Supabase

1. **Dans Supabase Dashboard**, allez dans **Authentication > Logs**
2. **Cherchez les erreurs récentes** pour votre email
3. **Vérifiez le message d'erreur** :
   - Si vous voyez "rate limit exceeded" → Quota Brevo dépassé
   - Si vous voyez "SMTP error" → Problème de configuration SMTP
   - Si vous voyez "authentication failed" → Problème avec les identifiants Brevo

## 📝 Checklist de diagnostic

- [ ] J'ai vérifié si Brevo est configuré dans Supabase > Authentication > Settings > SMTP Settings
- [ ] J'ai vérifié mon quota Brevo dans mon compte Brevo
- [ ] J'ai vérifié les logs Supabase > Authentication > Logs
- [ ] J'ai vérifié si le quota se réinitialise bientôt (quotidien ou mensuel)
- [ ] J'ai vérifié mon boîte mail (y compris le dossier spam) pour voir si des emails ont été envoyés avant d'atteindre la limite

## 🆘 Si le problème persiste

1. **Vérifiez la configuration SMTP dans Supabase**
   - Host : `smtp-relay.brevo.com` (ou `smtp-relay.sendinblue.com`)
   - Port : `587` (TLS) ou `465` (SSL)
   - Username : Votre clé SMTP Brevo
   - Password : Votre clé SMTP Brevo

2. **Testez la connexion SMTP**
   - Dans Brevo Dashboard, vérifiez que votre clé SMTP est active
   - Vous pouvez régénérer la clé SMTP si nécessaire

3. **Contactez le support Brevo**
   - Si vous pensez que le quota est incorrect
   - Si vous avez des questions sur votre plan

## 📚 Ressources

- [Documentation Brevo - SMTP](https://help.brevo.com/hc/fr/articles/209467485)
- [Documentation Supabase - SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Tableau de bord Brevo](https://app.brevo.com/)

