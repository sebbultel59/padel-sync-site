# Guide de test des nouvelles notifications

Ce guide explique comment tester les 4 nouvelles notifications implémentées.

## 📋 Prérequis

1. **Appliquer les migrations SQL** dans Supabase :
   ```sql
   -- Exécuter dans l'ordre :
   -- 1. trigger_notifications_badge_match_group.sql
   -- 2. add_reminder_preferences_to_notification_preferences.sql (si pas déjà fait)
   ```

2. **Redéployer la fonction edge** :
   ```bash
   supabase functions deploy dispatch-notifs
   ```

3. **Vérifier que le cron job `dispatch-notifs` est actif** (appel toutes les 30 secondes)

## 🧪 Tests à effectuer

### 1. Test : badge_unlocked (Trophée débloqué)

#### Méthode 1 : Via l'application (recommandé)
1. Jouer un match qui devrait débloquer un badge (ex: 5ème match pour "VOLUME_5_MATCHES")
2. Enregistrer le résultat du match
3. Vérifier que la notification "Nouveau trophée débloqué 🏆" apparaît

#### Méthode 2 : Via SQL (test direct)
```sql
-- 1. Trouver un utilisateur de test
SELECT id, display_name FROM profiles LIMIT 1;

-- 2. Trouver un badge disponible
SELECT id, code, label FROM badge_definitions WHERE is_active = true LIMIT 1;

-- 3. Insérer un badge pour cet utilisateur (simule le déblocage)
-- Remplacez USER_ID et BADGE_ID par les valeurs trouvées
INSERT INTO user_badges (user_id, badge_id, unlocked_at)
VALUES (
  'USER_ID',  -- Remplacez par l'ID utilisateur
  'BADGE_ID', -- Remplacez par l'ID badge
  NOW()
)
ON CONFLICT (user_id, badge_id) DO NOTHING;

-- 4. Vérifier que la notification_job a été créée
SELECT 
  id,
  kind,
  actor_id,
  recipients,
  payload,
  created_at,
  sent_at
FROM notification_jobs
WHERE kind = 'badge_unlocked'
ORDER BY created_at DESC
LIMIT 5;

-- 5. Vérifier que dispatch-notifs a été appelé (attendre ~30 secondes)
-- La colonne sent_at devrait être remplie
SELECT 
  id,
  kind,
  sent_at,
  created_at
FROM notification_jobs
WHERE kind = 'badge_unlocked'
ORDER BY created_at DESC
LIMIT 1;
```

### 2. Test : match_result_recorded (Résultat enregistré)

#### Méthode 1 : Via l'application (recommandé)
1. Créer un match confirmé avec 4 joueurs
2. Enregistrer le résultat du match via l'interface
3. Vérifier que les 4 joueurs reçoivent la notification "Résultat enregistré"

#### Méthode 2 : Via SQL (test direct)
```sql
-- 1. Trouver un match confirmé avec 4 joueurs
SELECT 
  m.id as match_id,
  m.group_id,
  m.status,
  COUNT(mr.id) as rsvp_count
FROM matches m
LEFT JOIN match_rsvps mr ON mr.match_id = m.id AND mr.status = 'yes'
WHERE m.status = 'confirmed'
GROUP BY m.id, m.group_id, m.status
HAVING COUNT(mr.id) = 4
LIMIT 1;

-- 2. Récupérer les IDs des 4 joueurs
SELECT 
  mr.user_id,
  p.display_name
FROM match_rsvps mr
JOIN profiles p ON p.id = mr.user_id
WHERE mr.match_id = 'MATCH_ID'  -- Remplacez par l'ID du match
  AND mr.status = 'yes';

-- 3. Créer un match_result avec status = 'completed'
-- Remplacez MATCH_ID et les player_ids par les valeurs trouvées
INSERT INTO match_results (
  match_id,
  team1_player1_id,
  team1_player2_id,
  team2_player1_id,
  team2_player2_id,
  winner_team,
  score_text,
  status,
  match_type,
  result_type
)
VALUES (
  'MATCH_ID',           -- ID du match
  'PLAYER1_ID',         -- Joueur 1 équipe 1
  'PLAYER2_ID',         -- Joueur 2 équipe 1
  'PLAYER3_ID',         -- Joueur 1 équipe 2
  'PLAYER4_ID',         -- Joueur 2 équipe 2
  'team1',              -- Équipe gagnante
  '6-4, 6-3',          -- Score
  'completed',         -- Statut (important !)
  'friendly',
  'standard'
)
ON CONFLICT (match_id) DO UPDATE
SET status = 'completed',
    score_text = EXCLUDED.score_text;

-- 4. Vérifier que les notification_jobs ont été créées (4 notifications)
SELECT 
  id,
  kind,
  actor_id,
  recipients,
  match_id,
  payload,
  created_at
FROM notification_jobs
WHERE kind = 'match_result_recorded'
  AND match_id = 'MATCH_ID'  -- Remplacez par l'ID du match
ORDER BY created_at DESC;

-- 5. Vérifier que dispatch-notifs a traité les notifications (attendre ~30 secondes)
SELECT 
  id,
  kind,
  sent_at,
  created_at
FROM notification_jobs
WHERE kind = 'match_result_recorded'
  AND match_id = 'MATCH_ID'
ORDER BY created_at DESC;
```

### 3. Test : group_join_request_approved (Demande acceptée)

#### Méthode 1 : Via l'application (recommandé)
1. Créer ou trouver un groupe public avec `join_policy = 'request'`
2. Faire une demande pour rejoindre ce groupe (depuis un autre compte)
3. Approuver la demande depuis un compte admin
4. Vérifier que la notification "Demande acceptée ✅" apparaît

#### Méthode 2 : Via SQL (test direct)
```sql
-- 1. Trouver un groupe public avec join_policy = 'request'
SELECT id, name, visibility, join_policy
FROM groups
WHERE visibility = 'public'
  AND join_policy = 'request'
LIMIT 1;

-- 2. Trouver un utilisateur qui n'est pas membre du groupe
SELECT p.id, p.display_name
FROM profiles p
WHERE p.id NOT IN (
  SELECT gm.user_id 
  FROM group_members gm 
  WHERE gm.group_id = 'GROUP_ID'  -- Remplacez par l'ID du groupe
)
LIMIT 1;

-- 3. Créer une demande de rejoindre
INSERT INTO group_join_requests (group_id, user_id, status)
VALUES (
  'GROUP_ID',   -- Remplacez par l'ID du groupe
  'USER_ID',    -- Remplacez par l'ID utilisateur
  'pending'
)
ON CONFLICT DO NOTHING;

-- 4. Trouver un admin du groupe
SELECT gm.user_id, p.display_name
FROM group_members gm
JOIN profiles p ON p.id = gm.user_id
WHERE gm.group_id = 'GROUP_ID'
  AND gm.role IN ('admin', 'owner')
LIMIT 1;

-- 5. Approuver la demande (simule l'action d'un admin)
UPDATE group_join_requests
SET status = 'approved',
    reviewed_at = NOW(),
    reviewed_by = 'ADMIN_USER_ID'  -- Remplacez par l'ID admin
WHERE id = (
  SELECT id FROM group_join_requests
  WHERE group_id = 'GROUP_ID'
    AND user_id = 'USER_ID'
    AND status = 'pending'
  LIMIT 1
);

-- 6. Vérifier que la notification_job a été créée
SELECT 
  id,
  kind,
  actor_id,
  recipients,
  group_id,
  payload,
  created_at
FROM notification_jobs
WHERE kind = 'group_join_request_approved'
ORDER BY created_at DESC
LIMIT 5;

-- 7. Vérifier que dispatch-notifs a traité la notification (attendre ~30 secondes)
SELECT 
  id,
  kind,
  sent_at,
  created_at
FROM notification_jobs
WHERE kind = 'group_join_request_approved'
ORDER BY created_at DESC
LIMIT 1;
```

### 4. Test : group_join_request_rejected (Demande refusée)

#### Méthode 1 : Via l'application (recommandé)
1. Créer ou trouver un groupe public avec `join_policy = 'request'`
2. Faire une demande pour rejoindre ce groupe
3. Refuser la demande depuis un compte admin
4. Vérifier que la notification "Demande refusée" apparaît

#### Méthode 2 : Via SQL (test direct)
```sql
-- 1. Créer une demande (voir test précédent)
-- 2. Refuser la demande
UPDATE group_join_requests
SET status = 'rejected',
    reviewed_at = NOW(),
    reviewed_by = 'ADMIN_USER_ID'  -- Remplacez par l'ID admin
WHERE id = (
  SELECT id FROM group_join_requests
  WHERE group_id = 'GROUP_ID'
    AND user_id = 'USER_ID'
    AND status = 'pending'
  LIMIT 1
);

-- 3. Vérifier que la notification_job a été créée
SELECT 
  id,
  kind,
  actor_id,
  recipients,
  group_id,
  payload,
  created_at
FROM notification_jobs
WHERE kind = 'group_join_request_rejected'
ORDER BY created_at DESC
LIMIT 5;
```

## 🔍 Vérifications générales

### Vérifier que les triggers sont actifs
```sql
SELECT 
  tgname as trigger_name,
  tgrelid::regclass as table_name,
  tgenabled as enabled
FROM pg_trigger
WHERE tgname IN (
  'trigger_notify_badge_unlocked',
  'trigger_notify_match_result_recorded',
  'trigger_notify_group_join_request'
)
ORDER BY tgname;
```

### Vérifier les préférences de notification
```sql
-- Vérifier qu'un utilisateur a les nouvelles préférences
SELECT 
  id,
  display_name,
  notification_preferences->'badge_unlocked' as badge_unlocked,
  notification_preferences->'match_result_recorded' as match_result,
  notification_preferences->'group_join_request_approved' as join_approved,
  notification_preferences->'group_join_request_rejected' as join_rejected
FROM profiles
WHERE id = 'USER_ID';  -- Remplacez par un ID utilisateur
```

### Vérifier que dispatch-notifs fonctionne
```sql
-- Voir les dernières notifications envoyées
SELECT 
  id,
  kind,
  created_at,
  sent_at,
  CASE 
    WHEN sent_at IS NULL THEN '⏳ En attente'
    ELSE '✅ Envoyée'
  END as status
FROM notification_jobs
WHERE kind IN (
  'badge_unlocked',
  'match_result_recorded',
  'group_join_request_approved',
  'group_join_request_rejected'
)
ORDER BY created_at DESC
LIMIT 20;
```

### Vérifier les logs de dispatch-notifs
1. Aller dans Supabase Dashboard > Edge Functions > dispatch-notifs > Logs
2. Vérifier que les notifications sont traitées
3. Vérifier qu'il n'y a pas d'erreurs

## 🐛 Dépannage

### Les notifications ne sont pas créées
- Vérifier que les triggers sont actifs (requête SQL ci-dessus)
- Vérifier les logs PostgreSQL pour voir si les triggers s'exécutent
- Vérifier que les permissions RLS permettent l'INSERT dans `notification_jobs`

### Les notifications sont créées mais pas envoyées
- Vérifier que `dispatch-notifs` est appelé (cron job ou webhook)
- Vérifier les logs de `dispatch-notifs` dans Supabase Dashboard
- Vérifier que les utilisateurs ont des `expo_push_token` valides
- Vérifier que les préférences de notification ne sont pas à `false`

### Les notifications sont envoyées mais pas reçues
- Vérifier les permissions de notification sur l'appareil
- Vérifier que l'app est ouverte ou en arrière-plan
- Vérifier que les tokens Expo sont valides
- Vérifier les logs Expo Push dans Supabase Dashboard

## ✅ Checklist de test complète

- [ ] Migration SQL appliquée
- [ ] Fonction `dispatch-notifs` redéployée
- [ ] Test `badge_unlocked` : notification créée et envoyée
- [ ] Test `match_result_recorded` : 4 notifications créées et envoyées
- [ ] Test `group_join_request_approved` : notification créée et envoyée
- [ ] Test `group_join_request_rejected` : notification créée et envoyée
- [ ] Test désactivation préférence : notification non envoyée quand préférence = false
- [ ] Vérification dans l'app : notifications reçues sur l'appareil







