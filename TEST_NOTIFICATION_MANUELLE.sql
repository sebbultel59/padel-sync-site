-- Script pour créer une notification de test manuellement
-- Utile pour tester si le système de notifications fonctionne

-- ============================================================================
-- ÉTAPE 1 : Trouver votre ID utilisateur
-- ============================================================================
SELECT 
  'Votre ID utilisateur:' as info,
  id,
  display_name,
  email,
  expo_push_token,
  CASE 
    WHEN expo_push_token IS NULL THEN '❌ Aucun token Expo'
    WHEN expo_push_token LIKE 'ExponentPushToken[%' THEN '✅ Token valide'
    ELSE '⚠️ Token invalide'
  END as token_status
FROM profiles
WHERE email = 'VOTRE_EMAIL@example.com'  -- Remplacez par votre email
LIMIT 1;

-- ============================================================================
-- ÉTAPE 2 : Vérifier vos préférences de notification
-- ============================================================================
-- Remplacez USER_ID par votre ID trouvé à l'étape 1
/*
SELECT 
  'Vos préférences:' as info,
  notification_preferences->'badge_unlocked' as badge_unlocked,
  notification_preferences->'match_result_recorded' as match_result,
  notification_preferences->'group_join_request_approved' as join_approved,
  notification_preferences->'group_join_request_rejected' as join_rejected
FROM profiles
WHERE id = 'USER_ID_ICI';  -- Remplacez par votre ID
*/

-- ============================================================================
-- ÉTAPE 3 : Créer une notification de test
-- ============================================================================
-- Remplacez USER_ID par votre ID trouvé à l'étape 1
/*
INSERT INTO notification_jobs (
  kind,
  actor_id,
  recipients,
  payload,
  created_at
) VALUES (
  'badge_unlocked',
  'USER_ID_ICI',  -- Remplacez par votre ID
  ARRAY['USER_ID_ICI'],  -- Remplacez par votre ID
  jsonb_build_object('message', '🎉 Test de notification - ' || TO_CHAR(NOW(), 'HH24:MI:SS')),
  NOW()
)
RETURNING 
  id,
  kind,
  created_at,
  'Notification créée avec succès ✅' as status;
*/

-- ============================================================================
-- ÉTAPE 4 : Vérifier que la notification a été créée
-- ============================================================================
SELECT 
  'Notifications de test créées:' as info,
  id,
  kind,
  actor_id,
  recipients,
  payload,
  created_at,
  sent_at,
  CASE 
    WHEN sent_at IS NULL THEN '⏳ En attente d''envoi'
    ELSE '✅ Déjà envoyée'
  END as status
FROM notification_jobs
WHERE kind = 'badge_unlocked'
  AND created_at > NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC
LIMIT 5;

-- ============================================================================
-- ÉTAPE 5 : Attendre ~30 secondes puis vérifier si envoyée
-- ============================================================================
-- Ré-exécuter cette requête après 30-60 secondes
/*
SELECT 
  'État après 30 secondes:' as info,
  id,
  kind,
  created_at,
  sent_at,
  CASE 
    WHEN sent_at IS NULL THEN '❌ Pas encore envoyée - Vérifier dispatch-notifs'
    ELSE '✅ Envoyée à ' || sent_at::text
  END as status
FROM notification_jobs
WHERE kind = 'badge_unlocked'
  AND created_at > NOW() - INTERVAL '2 minutes'
ORDER BY created_at DESC
LIMIT 1;
*/

-- ============================================================================
-- ÉTAPE 6 : Forcer l'appel de dispatch-notifs (si webhook configuré)
-- ============================================================================
-- Si vous avez un webhook configuré, il devrait être appelé automatiquement
-- Sinon, vous pouvez appeler manuellement depuis Supabase Dashboard > Edge Functions > dispatch-notifs > Invoke

-- ============================================================================
-- ÉTAPE 7 : Vérifier les logs de dispatch-notifs
-- ============================================================================
-- Aller dans Supabase Dashboard > Edge Functions > dispatch-notifs > Logs
-- Vérifier qu'il y a des logs récents et qu'il n'y a pas d'erreurs

-- ============================================================================
-- DÉPANNAGE : Si la notification n'est toujours pas envoyée
-- ============================================================================

-- 7a. Vérifier que dispatch-notifs peut lire notification_jobs
/*
SELECT 
  'Test de lecture notification_jobs:' as info,
  COUNT(*) as total_jobs,
  COUNT(CASE WHEN sent_at IS NULL THEN 1 END) as jobs_en_attente
FROM notification_jobs
WHERE kind = 'badge_unlocked'
  AND created_at > NOW() - INTERVAL '1 hour';
*/

-- 7b. Vérifier que votre token Expo est valide
/*
SELECT 
  'Vérification token Expo:' as info,
  id,
  display_name,
  expo_push_token,
  LENGTH(expo_push_token) as token_length,
  CASE 
    WHEN expo_push_token IS NULL THEN '❌ Aucun token'
    WHEN expo_push_token LIKE 'ExponentPushToken[%' AND LENGTH(expo_push_token) > 20 THEN '✅ Token valide'
    ELSE '⚠️ Token suspect'
  END as validation
FROM profiles
WHERE id = 'USER_ID_ICI';  -- Remplacez par votre ID
*/

-- 7c. Vérifier que vos préférences ne bloquent pas la notification
/*
SELECT 
  'Vérification préférences:' as info,
  id,
  notification_preferences->'badge_unlocked' as badge_unlocked_pref,
  CASE 
    WHEN notification_preferences->'badge_unlocked' = 'false' THEN '❌ Notification désactivée'
    WHEN notification_preferences->'badge_unlocked' IS NULL THEN '✅ Activée par défaut'
    WHEN notification_preferences->'badge_unlocked' = 'true' THEN '✅ Activée'
    ELSE '✅ Activée (valeur par défaut)'
  END as status
FROM profiles
WHERE id = 'USER_ID_ICI';  -- Remplacez par votre ID
*/









