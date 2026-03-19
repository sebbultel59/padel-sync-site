# Liste complète des notifications dans l'application Padel Sync

## 📱 Notifications Push (via Expo Push Notifications)

### 🎾 Notifications liées aux matchs

#### 1. **match_pending**
- **Quand** : Un nouveau match est créé et nécessite une confirmation (RSVP)
- **Titre** : "Nouveau match à confirmer"
- **Message** : "Un match est en RSVP. Donne ta réponse !"
- **Destinataires** : Les joueurs invités au match

#### 2. **rsvp_accepted**
- **Quand** : Un joueur confirme sa participation à un match
- **Titre** : "Un joueur a confirmé"
- **Message** : "[Nom du joueur] a confirmé sa participation."
- **Destinataires** : Les autres joueurs du match

#### 3. **rsvp_declined**
- **Quand** : Un joueur refuse un match
- **Titre** : "Un joueur a refusé"
- **Message** : "[Nom du joueur] a refusé le match."
- **Destinataires** : Les autres joueurs du match

#### 4. **rsvp_withdraw**
- **Quand** : Un joueur se retire d'un match après avoir accepté
- **Titre** : "Un joueur s'est retiré"
- **Message** : "[Nom du joueur] s'est retiré du match."
- **Destinataires** : Les autres joueurs du match

#### 5. **match_confirmed**
- **Quand** : Un match est validé (4 joueurs ont confirmé)
- **Titre** : "Match validé"
- **Message** : "Les 4 joueurs ont confirmé, c'est validé !"
- **Destinataires** : Les 4 joueurs du match
- **Fonction** : `dispatch-notifs` (via notification_jobs)

#### 6. **match_canceled**
- **Quand** : Un match est annulé
- **Titre** : "Match annulé"
- **Message** : "Le match a été annulé."
- **Destinataires** : Les joueurs du match

#### 7. **match_result_recorded**
- **Quand** : Un résultat de match est enregistré (status = 'completed')
- **Titre** : "Résultat enregistré"
- **Message** : "Le résultat du match a été enregistré : [score]"
- **Destinataires** : Les 4 joueurs du match
- **Fonction** : `dispatch-notifs` (via notification_jobs)
- **Trigger** : `trigger_notify_match_result_recorded` sur `match_results`

### 👥 Notifications liées aux groupes

#### 8. **group_member_join**
- **Quand** : Un nouveau membre rejoint un groupe
- **Titre** : "Nouveau membre"
- **Message** : "[Nom du joueur] a rejoint le groupe."
- **Destinataires** : Les membres du groupe

#### 9. **group_join_request_approved**
- **Quand** : Une demande de rejoindre un groupe est approuvée
- **Titre** : "Demande acceptée ✅"
- **Message** : "Ta demande pour rejoindre \"[Nom du groupe]\" a été acceptée"
- **Destinataires** : Le joueur qui a fait la demande
- **Fonction** : `dispatch-notifs` (via notification_jobs)
- **Trigger** : `trigger_notify_group_join_request` sur `group_join_requests`

#### 10. **group_join_request_rejected**
- **Quand** : Une demande de rejoindre un groupe est refusée
- **Titre** : "Demande refusée"
- **Message** : "Ta demande pour rejoindre \"[Nom du groupe]\" a été refusée"
- **Destinataires** : Le joueur qui a fait la demande
- **Fonction** : `dispatch-notifs` (via notification_jobs)
- **Trigger** : `trigger_notify_group_join_request` sur `group_join_requests`

#### 12. **group_member_leave**
- **Quand** : Un membre quitte un groupe
- **Titre** : "Départ d'un membre"
- **Message** : "[Nom du joueur] a quitté le groupe."
- **Destinataires** : Les membres du groupe

#### 14. **group_match_created**
- **Quand** : Un nouveau match est créé dans un groupe
- **Titre** : "Nouveau match"
- **Message** : "Un match a été créé dans ton groupe."
- **Destinataires** : Les membres du groupe

#### 16. **group_match_validated**
- **Quand** : Un match du groupe est validé
- **Titre** : "Match validé"
- **Message** : "Un match du groupe est désormais validé."
- **Destinataires** : Les membres du groupe

### 🔥 Notifications de disponibilité (créneaux chauds)

#### 18. **group_slot_hot_3**
- **Quand** : Un créneau atteint 3 joueurs disponibles
- **Titre** : "Ça se chauffe à 3 🔥"
- **Message** : "Un créneau atteint 3 joueurs disponibles."
- **Destinataires** : Les membres du groupe

#### 20. **group_slot_ready_4**
- **Quand** : Un créneau atteint 4 joueurs disponibles (match possible)
- **Titre** : "Nouveaux matchs possibles dans \"[Nom du groupe]\""
- **Message** : "Nouveaux matchs possibles dans \"[Nom du groupe]\""
- **Destinataires** : Les membres du groupe

#### 20b. **new_week_dispos**
- **Quand** : Tous les dimanches à 20h (rappel hebdomadaire)
- **Titre** : "Nouvelle semaine : Renseigne tes dispos"
- **Message** : "Nouvelle semaine : Renseigne tes dispos"
- **Destinataires** : Tous les membres d'au moins un groupe

#### 20c. **availability_missing_all**
- **Quand** : Toutes les 48h (si aucune dispo n’est renseignée dans aucun groupe pour la semaine à venir)
- **Titre** : "Nouvelle semaine : Renseigne tes dispos"
- **Message** : "Nouvelle semaine : Renseigne tes dispos"
- **Destinataires** : Membres d’au moins un groupe, uniquement si aucune dispo n’est saisie

### 🏆 Notifications de badges et trophées

#### 21. **badge_unlocked**
- **Quand** : Un joueur débloque un nouveau badge/trophée
- **Titre** : "Nouveau trophée débloqué 🏆"
- **Message** : "[Nom du badge] débloqué !"
- **Destinataires** : Le joueur qui a débloqué le badge
- **Fonction** : `dispatch-notifs` (via notification_jobs)
- **Trigger** : `trigger_notify_badge_unlocked` sur `user_badges`

### 🏢 Notifications de club

#### 22. **club_notification**
- **Quand** : Un club manager envoie une notification
- **Titre** : Personnalisé (depuis `payload.title` ou "Message de votre club" par défaut)
- **Message** : Personnalisé (depuis `payload.message` ou `payload.body`)
- **Destinataires** : 
  - Tous les membres du club (si "Tous les membres" est sélectionné)
  - Membres d'un groupe spécifique (si "Un groupe" est sélectionné)
  - Admins uniquement (si "Admins uniquement" est sélectionné)
- **Création** : Via l'interface club manager (`app/clubs/[id]/notifications.js`)

## ⏰ Notifications de rappel (Rappels automatiques)

### 23. **Rappel J-24h (24 heures avant)**
- **Quand** : 24 heures avant le début d'un match confirmé
- **Titre** : "Rappel J-1 — [Nom du groupe]" ou "Rappel J-1 — Padel Sync"
- **Message** : Date et heure formatées (ex: "lundi 04 jan 09:00–10:30")
- **Destinataires** : Les 4 joueurs qui ont confirmé (RSVP "yes")
- **Fonction** : `push-reminders` (cron job)
- **Fréquence** : Vérifie toutes les 5 minutes (±5 min autour de J-24h)

### 24. **Rappel J-2h (2 heures avant)**
- **Quand** : 2 heures avant le début d'un match confirmé
- **Titre** : "Rappel 2h — [Nom du groupe]" ou "Rappel 2h — Padel Sync"
- **Message** : Date et heure formatées (ex: "lundi 04 jan 09:00–10:30")
- **Destinataires** : Les 4 joueurs qui ont confirmé (RSVP "yes")
- **Fonction** : `push-reminders` (cron job)
- **Fréquence** : Vérifie toutes les 5 minutes (±5 min autour de J-2h)

## 🔔 Notifications locales (dans l'app)

### Notifications système
- **Badge count** : Le nombre de notifications non lues est affiché sur l'icône de notification
- **Réinitialisation** : Le badge est remis à 0 quand l'utilisateur ouvre l'onglet notifications

### Alertes (Alert.alert)
- **Erreurs** : Affichées lors d'erreurs (ex: "Impossible d'envoyer la notification")
- **Confirmations** : Affichées lors d'actions réussies (ex: "La notification a été envoyée")
- **Permissions** : Demandes de permissions pour les notifications push

## 📊 Système technique

### Tables de base de données
- **notification_jobs** : Jobs de notifications à envoyer
- **club_notifications** : Notifications de club créées par les managers
- **matches** : Champs `reminder_24_sent_at` et `reminder_2h_sent_at` pour suivre les rappels

### Edge Functions Supabase
1. **dispatch-notifs** : Envoie les notifications depuis `notification_jobs`
2. **push-reminders** : Envoie les rappels automatiques (J-24h et J-2h)
3. **push-confirmed** : Envoie une notification quand un match est confirmé (via webhook)

### Triggers PostgreSQL
- Création automatique de `notification_jobs` lors d'événements (RSVP, création de match, etc.)
- Création automatique de `notification_jobs` pour les notifications de club
- `trigger_notify_badge_unlocked` : Notification quand un badge est débloqué
- `trigger_notify_match_result_recorded` : Notification quand un résultat de match est enregistré
- `trigger_notify_group_join_request` : Notifications pour les demandes de groupe (approuvées/rejetées)

### Configuration
- **Expo Push Tokens** : Enregistrés dans `profiles.expo_push_token`
- **Permissions** : Demandées au démarrage de l'app
- **Quiet Hours** : Les notifications ne sont pas envoyées entre 22h et 8h (configurable)

## 📝 Notes importantes

1. **Déduplication** : Les notifications sont dédupliquées pour éviter les doublons
2. **Historique** : Les notifications restent dans la table pour l'historique (non supprimées après envoi)
3. **Tokens invalides** : Les tokens Expo invalides sont ignorés
4. **Batching** : Les notifications sont envoyées par lots de 99 (limite Expo)
5. **Fallback** : Si Expo Push échoue, les notifications restent dans `notification_jobs` pour réessayer

