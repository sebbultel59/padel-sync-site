-- Script de test simple pour les nouvelles notifications
-- À exécuter dans Supabase SQL Editor

-- ============================================================================
-- ÉTAPE 1 : Vérifier que les triggers sont actifs
-- ============================================================================
SELECT 
  tgname as trigger_name,
  tgrelid::regclass as table_name,
  CASE tgenabled
    WHEN 'O' THEN '✅ Actif'
    WHEN 'D' THEN '❌ Désactivé'
    ELSE '❓ Inconnu'
  END as status
FROM pg_trigger
WHERE tgname IN (
  'trigger_notify_badge_unlocked',
  'trigger_notify_match_result_recorded',
  'trigger_notify_group_join_request'
)
ORDER BY tgname;

-- ============================================================================
-- ÉTAPE 2 : Test badge_unlocked
-- ============================================================================
-- Remplacez USER_ID et BADGE_ID par des valeurs réelles de votre base

-- 2a. Trouver un utilisateur et un badge
SELECT 
  'Utilisateurs disponibles:' as info,
  id as user_id,
  display_name
FROM profiles
LIMIT 5;

SELECT 
  'Badges disponibles:' as info,
  id as badge_id,
  code,
  label
FROM badge_definitions
WHERE is_active = true
LIMIT 5;

-- 2b. Débloquer un badge (remplacez les IDs)
/*
INSERT INTO user_badges (user_id, badge_id, unlocked_at)
VALUES (
  'USER_ID_ICI',   -- Remplacez par un user_id réel
  'BADGE_ID_ICI',  -- Remplacez par un badge_id réel
  NOW()
)
ON CONFLICT (user_id, badge_id) DO NOTHING
RETURNING *;
*/

-- 2c. Vérifier la notification créée
SELECT 
  'Notifications badge_unlocked créées:' as info,
  id,
  kind,
  actor_id,
  payload,
  created_at,
  CASE 
    WHEN sent_at IS NULL THEN '⏳ En attente'
    ELSE '✅ Envoyée'
  END as status
FROM notification_jobs
WHERE kind = 'badge_unlocked'
ORDER BY created_at DESC
LIMIT 5;

-- ============================================================================
-- ÉTAPE 3 : Test match_result_recorded
-- ============================================================================

-- 3a. Trouver un match confirmé avec 4 joueurs
SELECT 
  'Matches confirmés avec 4 joueurs:' as info,
  m.id as match_id,
  m.group_id,
  COUNT(mr.user_id) as rsvp_count,
  ARRAY_AGG(p.display_name) as joueurs
FROM matches m
LEFT JOIN match_rsvps mr ON mr.match_id = m.id AND mr.status = 'accepted'
LEFT JOIN profiles p ON p.id = mr.user_id
WHERE m.status = 'confirmed'
GROUP BY m.id, m.group_id
HAVING COUNT(mr.user_id) = 4
LIMIT 5;

-- 3b. Créer un résultat de match (remplacez MATCH_ID et les player_ids)
/*
-- D'abord, récupérer les joueurs du match
SELECT 
  mr.user_id,
  p.display_name,
  ROW_NUMBER() OVER (ORDER BY mr.created_at) as num
FROM match_rsvps mr
JOIN profiles p ON p.id = mr.user_id
WHERE mr.match_id = 'MATCH_ID_ICI'  -- Remplacez
  AND mr.status = 'accepted'
ORDER BY mr.created_at;

-- Ensuite, insérer le résultat (utilisez les user_id de la requête ci-dessus)
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
  'MATCH_ID_ICI',      -- Remplacez
  'PLAYER1_ID_ICI',    -- Premier joueur de la liste
  'PLAYER2_ID_ICI',    -- Deuxième joueur de la liste
  'PLAYER3_ID_ICI',    -- Troisième joueur de la liste
  'PLAYER4_ID_ICI',    -- Quatrième joueur de la liste
  'team1',
  '6-4, 6-3',
  'completed',         -- IMPORTANT : doit être 'completed'
  'friendly',
  'standard'
)
ON CONFLICT (match_id) DO UPDATE
SET status = 'completed',
    score_text = EXCLUDED.score_text
RETURNING *;
*/

-- 3c. Vérifier les notifications créées (devrait y en avoir 4)
SELECT 
  'Notifications match_result_recorded créées:' as info,
  id,
  kind,
  actor_id,
  match_id,
  payload,
  created_at,
  CASE 
    WHEN sent_at IS NULL THEN '⏳ En attente'
    ELSE '✅ Envoyée'
  END as status
FROM notification_jobs
WHERE kind = 'match_result_recorded'
ORDER BY created_at DESC
LIMIT 10;

-- ============================================================================
-- ÉTAPE 4 : Test group_join_request_approved/rejected
-- ============================================================================

-- 4a. Trouver un groupe public avec join_policy = 'request'
SELECT 
  'Groupes publics avec join_policy = request:' as info,
  id as group_id,
  name,
  visibility,
  join_policy
FROM groups
WHERE visibility = 'public'
  AND join_policy = 'request'
LIMIT 5;

-- 4b. Trouver un utilisateur qui n'est pas membre
/*
SELECT 
  'Utilisateurs non membres du groupe:' as info,
  p.id as user_id,
  p.display_name
FROM profiles p
WHERE p.id NOT IN (
  SELECT gm.user_id 
  FROM group_members gm 
  WHERE gm.group_id = 'GROUP_ID_ICI'  -- Remplacez
)
LIMIT 5;
*/

-- 4c. Créer une demande (remplacez GROUP_ID et USER_ID)
/*
INSERT INTO group_join_requests (group_id, user_id, status)
VALUES (
  'GROUP_ID_ICI',   -- Remplacez
  'USER_ID_ICI',    -- Remplacez
  'pending'
)
ON CONFLICT DO NOTHING
RETURNING *;
*/

-- 4d. Trouver un admin du groupe
/*
SELECT 
  'Admins du groupe:' as info,
  gm.user_id as admin_id,
  p.display_name,
  gm.role
FROM group_members gm
JOIN profiles p ON p.id = gm.user_id
WHERE gm.group_id = 'GROUP_ID_ICI'  -- Remplacez
  AND gm.role IN ('admin', 'owner')
LIMIT 5;
*/

-- 4e. Approuver la demande (remplacez les IDs)
/*
UPDATE group_join_requests
SET status = 'approved',
    reviewed_at = NOW(),
    reviewed_by = 'ADMIN_ID_ICI'  -- Remplacez par un admin_id
WHERE id = (
  SELECT id FROM group_join_requests
  WHERE group_id = 'GROUP_ID_ICI'
    AND user_id = 'USER_ID_ICI'
    AND status = 'pending'
  LIMIT 1
)
RETURNING *;
*/

-- 4f. Vérifier la notification créée
SELECT 
  'Notifications group_join_request créées:' as info,
  id,
  kind,
  actor_id,
  group_id,
  payload,
  created_at,
  CASE 
    WHEN sent_at IS NULL THEN '⏳ En attente'
    ELSE '✅ Envoyée'
  END as status
FROM notification_jobs
WHERE kind IN ('group_join_request_approved', 'group_join_request_rejected')
ORDER BY created_at DESC
LIMIT 10;

-- ============================================================================
-- ÉTAPE 5 : Vérification générale
-- ============================================================================

-- 5a. Voir toutes les notifications récentes
SELECT 
  'Toutes les notifications récentes:' as info,
  kind,
  COUNT(*) as count,
  COUNT(CASE WHEN sent_at IS NULL THEN 1 END) as en_attente,
  COUNT(CASE WHEN sent_at IS NOT NULL THEN 1 END) as envoyees
FROM notification_jobs
WHERE kind IN (
  'badge_unlocked',
  'match_result_recorded',
  'group_join_request_approved',
  'group_join_request_rejected'
)
AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY kind
ORDER BY kind;

-- 5b. Vérifier les préférences de notification d'un utilisateur
/*
SELECT 
  'Préférences de notification:' as info,
  id,
  display_name,
  notification_preferences->'badge_unlocked' as badge_unlocked,
  notification_preferences->'match_result_recorded' as match_result,
  notification_preferences->'group_join_request_approved' as join_approved,
  notification_preferences->'group_join_request_rejected' as join_rejected
FROM profiles
WHERE id = 'USER_ID_ICI'  -- Remplacez
LIMIT 1;
*/

-- ============================================================================
-- ÉTAPE 6 : Nettoyage (optionnel - pour refaire les tests)
-- ============================================================================

-- Supprimer les notifications de test (ATTENTION : supprime vraiment les données)
/*
DELETE FROM notification_jobs
WHERE kind IN (
  'badge_unlocked',
  'match_result_recorded',
  'group_join_request_approved',
  'group_join_request_rejected'
)
AND created_at > NOW() - INTERVAL '1 hour';
*/

