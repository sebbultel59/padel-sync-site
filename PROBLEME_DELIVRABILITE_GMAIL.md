# Problème de délivrabilité Gmail : Emails marqués "Délivré" mais non reçus

## 🔍 Le problème

Les logs Brevo indiquent "Délivré" mais certains emails (notamment Gmail) ne sont pas reçus. C'est un problème de **délivrabilité** (email deliverability).

## 📊 Différence entre "Délivré" et "Reçu"

- **"Délivré" dans Brevo** : Le serveur SMTP de Gmail a accepté l'email
- **"Reçu par l'utilisateur"** : L'email est arrivé dans la boîte de réception

Gmail peut accepter l'email mais le filtrer/bloquer avant qu'il n'arrive dans la boîte de réception.

## 🎯 Pourquoi Gmail bloque les emails

### 1. Filtres anti-spam agressifs

Gmail a des filtres très stricts qui peuvent :
- Mettre l'email dans le dossier **Spam** (courrier indésirable)
- Bloquer complètement l'email sans notification
- Mettre l'email dans **Promotions** ou **Notifications**

### 2. Réputation de l'expéditeur

Si `no-reply@syncpadel.app` est un nouveau domaine ou a peu d'historique :
- Gmail peut être méfiant
- Les premiers emails peuvent être filtrés
- Il faut construire la réputation progressivement

### 3. Configuration DNS manquante

Pour améliorer la délivrabilité, il faut configurer :
- **SPF** (Sender Policy Framework)
- **DKIM** (DomainKeys Identified Mail)
- **DMARC** (Domain-based Message Authentication)

### 4. Contenu de l'email

Gmail analyse le contenu et peut bloquer si :
- Le sujet ressemble à du spam
- Le contenu HTML est suspect
- Il y a trop de liens
- Le ratio texte/image est suspect

## ✅ Solutions immédiates

### 1. Vérifier le dossier Spam

**Demandez à l'utilisateur de vérifier :**
1. Ouvrir Gmail
2. Aller dans **Spam** (courrier indésirable)
3. Chercher les emails de `no-reply@syncpadel.app`
4. Si trouvé, cliquer sur "Ce n'est pas du spam"

### 2. Ajouter l'expéditeur aux contacts

**Demandez à l'utilisateur de :**
1. Créer un contact avec l'email `no-reply@syncpadel.app`
2. Ou marquer l'email comme "Important" s'il arrive dans Spam

### 3. Vérifier les autres dossiers Gmail

Gmail peut mettre les emails dans :
- **Promotions**
- **Notifications**
- **Mises à jour**
- **Spam**

## 🔧 Solutions techniques (long terme)

### 1. Configurer SPF, DKIM et DMARC

#### SPF (Sender Policy Framework)

Ajoutez un enregistrement TXT dans votre DNS pour `syncpadel.app` :

```
v=spf1 include:spf.brevo.com ~all
```

Ou si vous utilisez plusieurs services :

```
v=spf1 include:spf.brevo.com include:_spf.google.com ~all
```

#### DKIM (DomainKeys Identified Mail)

1. **Dans Brevo Dashboard** :
   - Allez dans **Senders & IP** > **Domains**
   - Ajoutez votre domaine `syncpadel.app`
   - Brevo vous donnera des enregistrements DNS à ajouter

2. **Ajoutez les enregistrements DNS** :
   - Type : TXT
   - Nom : `brevo._domainkey` (ou ce que Brevo indique)
   - Valeur : (fournie par Brevo)

#### DMARC (Domain-based Message Authentication)

Ajoutez un enregistrement TXT pour `_dmarc.syncpadel.app` :

```
v=DMARC1; p=none; rua=mailto:dmarc@syncpadel.app
```

Au début, utilisez `p=none` pour surveiller sans bloquer. Plus tard, passez à `p=quarantine` puis `p=reject`.

### 2. Améliorer la réputation du domaine

#### Chauffage du domaine (Domain Warm-up)

Si c'est un nouveau domaine :
1. **Commencez petit** : Envoyez quelques emails par jour
2. **Augmentez progressivement** : 10, 20, 50, 100 emails/jour
3. **Surveillez les taux** :
   - Taux d'ouverture > 20%
   - Taux de clic > 2%
   - Taux de spam < 0.1%

#### Bonnes pratiques

- **Envoyez uniquement aux utilisateurs qui ont demandé** (double opt-in)
- **Respectez les désabonnements** immédiatement
- **Évitez les mots spam** dans le sujet (FREE, URGENT, etc.)
- **Utilisez un format texte simple** en plus du HTML
- **Incluez un lien de désabonnement** dans chaque email

### 3. Vérifier la configuration Brevo

1. **Dans Brevo Dashboard** :
   - Allez dans **Senders & IP** > **Senders**
   - Vérifiez que `no-reply@syncpadel.app` est vérifié
   - Vérifiez le statut de vérification

2. **Vérifiez la réputation** :
   - Brevo Dashboard > **Statistics**
   - Vérifiez les taux de délivrabilité
   - Vérifiez les plaintes de spam

### 4. Améliorer le contenu des emails

#### Sujet de l'email

✅ **Bon** :
- "Confirme ton inscription à PADEL Sync"
- "Renouvelle ton mot de passe"

❌ **Éviter** :
- "URGENT : Confirme maintenant !"
- "FREE - Confirme ton compte"
- "CLIQUEZ ICI MAINTENANT"

#### Contenu HTML

- **Évitez les images uniquement** : Incluez du texte
- **Ratio texte/image** : Au moins 60% de texte
- **Liens** : Maximum 2-3 liens par email
- **Format texte** : Incluez une version texte en plus du HTML

## 🔍 Diagnostic

### Vérifier si l'email est bloqué par Gmail

1. **Demandez à l'utilisateur de vérifier** :
   - Dossier Spam
   - Dossier Promotions
   - Tous les dossiers

2. **Utilisez un outil de test** :
   - [Mail Tester](https://www.mail-tester.com/)
   - Envoyez un email à l'adresse fournie
   - Vérifiez le score (objectif : > 8/10)

3. **Vérifiez les logs Brevo** :
   - Cherchez les événements pour `sebbultel59@gmail.com`
   - Vérifiez s'il y a des événements "Bounced" ou "Blocked"
   - Comparez avec `sebastien.bultel@ac-lille.fr` qui fonctionne

### Pourquoi ça fonctionne pour ac-lille.fr mais pas Gmail ?

- **ac-lille.fr** : Domaine éducatif, filtres moins stricts
- **Gmail** : Filtres très stricts, réputation importante
- **Gmail** : Analyse plus approfondie du contenu et de la réputation

## 📝 Checklist de vérification

- [ ] SPF configuré dans le DNS
- [ ] DKIM configuré dans le DNS (via Brevo)
- [ ] DMARC configuré dans le DNS
- [ ] Domaine vérifié dans Brevo
- [ ] Expéditeur vérifié dans Brevo
- [ ] Utilisateurs vérifient le dossier Spam
- [ ] Contenu des emails optimisé (pas de mots spam)
- [ ] Format texte inclus en plus du HTML
- [ ] Lien de désabonnement présent
- [ ] Réputation du domaine en cours de construction

## 🆘 Solutions immédiates pour les utilisateurs

### Message à envoyer aux utilisateurs qui ne reçoivent pas les emails

```
Bonjour,

Si vous ne recevez pas l'email de vérification, veuillez :

1. Vérifier votre dossier Spam/Courrier indésirable
2. Chercher dans tous les dossiers Gmail (Promotions, Notifications, etc.)
3. Ajouter no-reply@syncpadel.app à vos contacts
4. Si toujours rien, contactez le support

Merci !
```

## 📚 Ressources

- [Documentation Brevo - Domain Authentication](https://help.brevo.com/hc/fr/articles/209467485)
- [Documentation Brevo - Improve Deliverability](https://help.brevo.com/hc/fr/articles/360019268419)
- [Gmail - Why emails go to spam](https://support.google.com/mail/answer/81126)
- [Mail Tester](https://www.mail-tester.com/) - Tester la délivrabilité

