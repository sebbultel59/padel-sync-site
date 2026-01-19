-- Script de diagnostic complet pour les notifications
-- À exécuter dans Supabase SQL Editor pour identifier pourquoi les notifications ne sont pas reçues

-- ============================================================================
-- ÉTAPE 1 : Vérifier que les triggers sont actifs
-- ============================================================================
SELECT 
  '🔍 Vérification des triggers' as etape,
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
-- ÉTAPE 2 : Vérifier les notification_jobs créés récemment
-- ============================================================================
SELECT 
  '📋 Notification jobs créés (dernières 24h)' as etape,
  kind,
  COUNT(*) as total,
  COUNT(CASE WHEN sent_at IS NULL THEN 1 END) as en_attente,
  COUNT(CASE WHEN sent_at IS NOT NULL THEN 1 END) as envoyees,
  MAX(created_at) as derniere_creation
FROM notification_jobs
WHERE kind IN (
  'badge_unlocked',
  'match_result_recorded',
  'group_join_request_approved',
  'group_join_request_rejected'
)
AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY kind
ORDER BY kind;

-- ============================================================================
-- ÉTAPE 3 : Voir les détails des dernières notifications
-- ============================================================================
SELECT 
  '📨 Détails des dernières notifications' as etape,
  id,
  kind,
  actor_id,
  recipients,
  match_id,
  group_id,
  payload,
  created_at,
  sent_at,
  CASE 
    WHEN sent_at IS NULL THEN '⏳ En attente'
    WHEN sent_at IS NOT NULL THEN '✅ Envoyée'
    ELSE '❓ Inconnu'
  END as status,
  EXTRACT(EPOCH FROM (NOW() - created_at)) as age_secondes
FROM notification_jobs
WHERE kind IN (
  'badge_unlocked',
  'match_result_recorded',
  'group_join_request_approved',
  'group_join_request_rejected'
)
ORDER BY created_at DESC
LIMIT 10;

-- ============================================================================
-- ÉTAPE 4 : Vérifier les préférences de notification d'un utilisateur
-- ============================================================================
-- Remplacez USER_ID par votre ID utilisateur
/*
SELECT 
  '⚙️ Préférences de notification' as etape,
  id,
  display_name,
  email,
  notification_preferences->'badge_unlocked' as badge_unlocked,
  notification_preferences->'match_result_recorded' as match_result,
  notification_preferences->'group_join_request_approved' as join_approved,
  notification_preferences->'group_join_request_rejected' as join_rejected,
  notification_preferences as toutes_preferences
FROM profiles
WHERE id = 'USER_ID_ICI'  -- Remplacez par votre ID
LIMIT 1;
*/

-- ============================================================================
-- ÉTAPE 5 : Vérifier les tokens Expo Push
-- ============================================================================
-- Remplacez USER_ID par votre ID utilisateur
/*
SELECT 
  '📱 Tokens Expo Push' as etape,
  id,
  display_name,
  email,
  expo_push_token,
  CASE 
    WHEN expo_push_token IS NULL THEN '❌ Aucun token'
    WHEN expo_push_token LIKE 'ExponentPushToken[%' THEN '✅ Token valide'
    ELSE '⚠️ Token invalide'
  END as token_status
FROM profiles
WHERE id = 'USER_ID_ICI'  -- Remplacez par votre ID
LIMIT 1;
*/

-- ============================================================================
-- ÉTAPE 6 : Vérifier si dispatch-notifs est appelé
-- ============================================================================
-- Vérifier les logs dans Supabase Dashboard > Edge Functions > dispatch-notifs > Logs
-- Mais on peut aussi vérifier si les jobs sont marqués comme envoyés

SELECT 
  '🔄 État de traitement des notifications' as etape,
  kind,
  COUNT(*) as total,
  COUNT(CASE WHEN sent_at IS NULL AND created_at < NOW() - INTERVAL '5 minutes' THEN 1 END) as bloquees_anciennes,
  COUNT(CASE WHEN sent_at IS NULL AND created_at > NOW() - INTERVAL '5 minutes' THEN 1 END) as en_attente_recentes,
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

-- ============================================================================
-- ÉTAPE 7 : Test manuel - Créer une notification de test
-- ============================================================================
-- Remplacez USER_ID par votre ID utilisateur
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
  jsonb_build_object('message', 'Test de notification - ' || NOW()::text),
  NOW()
)
RETURNING *;
*/

-- ============================================================================
-- ÉTAPE 8 : Vérifier les permissions RLS sur notification_jobs
-- ============================================================================
SELECT 
  '🔐 Permissions RLS' as etape,
  tablename,
  rowsecurity as rls_active
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'notification_jobs';

SELECT 
  '🔐 Politiques RLS sur notification_jobs' as etape,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'notification_jobs';

-- ============================================================================
-- ÉTAPE 9 : Vérifier le cron job dispatch-notifs
-- ============================================================================
-- Vérifier dans Supabase Dashboard > Database > Cron Jobs
-- Ou exécuter cette requête si pg_cron est accessible :
/*
SELECT 
  '⏰ Cron jobs' as etape,
  jobid,
  jobname,
  schedule,
  active,
  command
FROM cron.job
WHERE jobname LIKE '%dispatch%' OR jobname LIKE '%notification%';
*/

-- ============================================================================
-- ÉTAPE 10 : Vérifier les webhooks
-- ============================================================================
-- Vérifier dans Supabase Dashboard > Database > Webhooks
-- Qu'un webhook appelle dispatch-notifs quand notification_jobs est créé

-- ============================================================================
-- RÉSUMÉ : Checklist de diagnostic
-- ============================================================================
SELECT 
  '✅ Checklist de diagnostic' as resume,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_notify_badge_unlocked' AND tgenabled = 'O'
  ) THEN '✅' ELSE '❌' END as trigger_badge,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_notify_match_result_recorded' AND tgenabled = 'O'
  ) THEN '✅' ELSE '❌' END as trigger_match_result,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_notify_group_join_request' AND tgenabled = 'O'
  ) THEN '✅' ELSE '❌' END as trigger_group_join,
  (SELECT COUNT(*) FROM notification_jobs 
   WHERE kind IN ('badge_unlocked', 'match_result_recorded', 'group_join_request_approved', 'group_join_request_rejected')
   AND created_at > NOW() - INTERVAL '24 hours') as notifications_crees_24h,
  (SELECT COUNT(*) FROM notification_jobs 
   WHERE kind IN ('badge_unlocked', 'match_result_recorded', 'group_join_request_approved', 'group_join_request_rejected')
   AND sent_at IS NOT NULL
   AND created_at > NOW() - INTERVAL '24 hours') as notifications_envoyees_24h;










