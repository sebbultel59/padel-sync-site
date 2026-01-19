-- Script pour vérifier votre configuration de notifications
-- Remplacez VOTRE_EMAIL@example.com par votre email

-- ============================================================================
-- ÉTAPE 1 : Trouver votre compte et vérifier le token Expo
-- ============================================================================
SELECT 
  '🔍 Votre compte' as etape,
  id as user_id,
  display_name,
  email,
  expo_push_token,
  CASE 
    WHEN expo_push_token IS NULL THEN '❌ Aucun token Expo - Réactivez les notifications dans l''app'
    WHEN expo_push_token LIKE 'ExponentPushToken[%' AND LENGTH(expo_push_token) > 20 THEN '✅ Token valide'
    ELSE '⚠️ Token suspect - Réinstallez l''app'
  END as token_status,
  LENGTH(expo_push_token) as token_length
FROM profiles
WHERE email = 'VOTRE_EMAIL@example.com'  -- ⚠️ REMPLACEZ PAR VOTRE EMAIL
LIMIT 1;

-- ============================================================================
-- ÉTAPE 2 : Vérifier vos préférences de notification
-- ============================================================================
-- Remplacez USER_ID par l'ID trouvé à l'étape 1
/*
SELECT 
  '⚙️ Vos préférences de notification' as etape,
  id,
  display_name,
  notification_preferences->'badge_unlocked' as badge_unlocked,
  notification_preferences->'match_result_recorded' as match_result,
  notification_preferences->'group_join_request_approved' as join_approved,
  notification_preferences->'group_join_request_rejected' as join_rejected,
  CASE 
    WHEN notification_preferences->'badge_unlocked' = 'false' THEN '❌ Désactivé'
    WHEN notification_preferences->'badge_unlocked' IS NULL THEN '✅ Activé (défaut)'
    ELSE '✅ Activé'
  END as status_badge,
  notification_preferences as toutes_preferences
FROM profiles
WHERE id = 'USER_ID_ICI';  -- ⚠️ REMPLACEZ PAR VOTRE USER_ID
*/

-- ============================================================================
-- ÉTAPE 3 : Voir vos notifications récentes
-- ============================================================================
-- Remplacez USER_ID par l'ID trouvé à l'étape 1
/*
SELECT 
  '📨 Vos notifications récentes' as etape,
  id,
  kind,
  actor_id,
  recipients,
  payload,
  created_at,
  sent_at,
  CASE 
    WHEN sent_at IS NULL THEN '⏳ En attente'
    WHEN sent_at IS NOT NULL THEN '✅ Envoyée à ' || sent_at::text
    ELSE '❓ Inconnu'
  END as status,
  EXTRACT(EPOCH FROM (NOW() - created_at))::int as age_secondes
FROM notification_jobs
WHERE 'USER_ID_ICI' = ANY(recipients)  -- ⚠️ REMPLACEZ PAR VOTRE USER_ID
  AND kind IN ('badge_unlocked', 'match_result_recorded', 'group_join_request_approved', 'group_join_request_rejected')
ORDER BY created_at DESC
LIMIT 10;
*/

-- ============================================================================
-- ÉTAPE 4 : Réactiver vos préférences si nécessaire
-- ============================================================================
-- Décommentez et exécutez si vos préférences sont à false
/*
UPDATE profiles
SET notification_preferences = COALESCE(notification_preferences, '{}'::jsonb) || '{
  "badge_unlocked": true,
  "match_result_recorded": true,
  "group_join_request_approved": true,
  "group_join_request_rejected": true
}'::jsonb
WHERE id = 'USER_ID_ICI'  -- ⚠️ REMPLACEZ PAR VOTRE USER_ID
RETURNING 
  id,
  display_name,
  notification_preferences;
*/

-- ============================================================================
-- ÉTAPE 5 : Créer une notification de test pour vous
-- ============================================================================
-- Décommentez et exécutez pour créer une notification de test
/*
INSERT INTO notification_jobs (
  kind,
  actor_id,
  recipients,
  payload,
  created_at
) VALUES (
  'badge_unlocked',
  'USER_ID_ICI',  -- ⚠️ REMPLACEZ PAR VOTRE USER_ID
  ARRAY['USER_ID_ICI'],  -- ⚠️ REMPLACEZ PAR VOTRE USER_ID
  jsonb_build_object('message', '🧪 TEST - Notification de test à ' || TO_CHAR(NOW(), 'HH24:MI:SS')),
  NOW()
)
RETURNING 
  id,
  kind,
  created_at,
  'Notification de test créée ✅' as status;
*/

-- ============================================================================
-- ÉTAPE 6 : Vérifier que la notification de test a été envoyée
-- ============================================================================
-- Attendez 30-60 secondes puis exécutez cette requête
/*
SELECT 
  '📤 État de la notification de test' as etape,
  id,
  kind,
  created_at,
  sent_at,
  CASE 
    WHEN sent_at IS NULL AND created_at < NOW() - INTERVAL '2 minutes' THEN '❌ Bloquée - Vérifier dispatch-notifs'
    WHEN sent_at IS NULL THEN '⏳ En attente d''envoi'
    WHEN sent_at IS NOT NULL THEN '✅ Envoyée à ' || sent_at::text
    ELSE '❓ Inconnu'
  END as status,
  EXTRACT(EPOCH FROM (NOW() - created_at))::int as age_secondes
FROM notification_jobs
WHERE kind = 'badge_unlocked'
  AND 'USER_ID_ICI' = ANY(recipients)  -- ⚠️ REMPLACEZ PAR VOTRE USER_ID
  AND created_at > NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC
LIMIT 1;
*/










