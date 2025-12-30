-- Diagnostic pour identifier pourquoi les notifications se répètent 4 fois

-- ============================================================================
-- ÉTAPE 1 : Vérifier s'il y a plusieurs notification_jobs pour le même événement
-- ============================================================================
SELECT 
  '🔍 Jobs créés récemment' as etape,
  id,
  kind,
  actor_id,
  recipients,
  array_length(recipients, 1) as nb_recipients,
  created_at,
  sent_at,
  payload
FROM notification_jobs
WHERE kind IN ('badge_unlocked', 'match_result_recorded', 'group_join_request_approved', 'group_join_request_rejected')
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 20;

-- ============================================================================
-- ÉTAPE 2 : Vérifier s'il y a des doublons dans recipients
-- ============================================================================
SELECT 
  '🔍 Doublons dans recipients' as etape,
  id,
  kind,
  recipients,
  array_length(recipients, 1) as nb_total,
  array_length(ARRAY(SELECT DISTINCT unnest(recipients)), 1) as nb_uniques,
  CASE 
    WHEN array_length(recipients, 1) > array_length(ARRAY(SELECT DISTINCT unnest(recipients)), 1) 
    THEN '❌ DOUBLONS DÉTECTÉS'
    ELSE '✅ Pas de doublons'
  END as status
FROM notification_jobs
WHERE kind IN ('badge_unlocked', 'match_result_recorded', 'group_join_request_approved', 'group_join_request_rejected')
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 10;

-- ============================================================================
-- ÉTAPE 3 : Vérifier si plusieurs jobs sont créés pour le même événement
-- ============================================================================
-- Pour badge_unlocked
SELECT 
  '🔍 Jobs badge_unlocked groupés' as etape,
  actor_id,
  DATE_TRUNC('second', created_at) as created_second,
  COUNT(*) as nb_jobs,
  array_agg(id) as job_ids,
  array_agg(array_length(recipients, 1)) as nb_recipients_per_job
FROM notification_jobs
WHERE kind = 'badge_unlocked'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY actor_id, DATE_TRUNC('second', created_at)
HAVING COUNT(*) > 1
ORDER BY created_second DESC;

-- Pour match_result_recorded
SELECT 
  '🔍 Jobs match_result_recorded groupés' as etape,
  match_id,
  DATE_TRUNC('second', created_at) as created_second,
  COUNT(*) as nb_jobs,
  array_agg(id) as job_ids,
  array_agg(array_length(recipients, 1)) as nb_recipients_per_job
FROM notification_jobs
WHERE kind = 'match_result_recorded'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY match_id, DATE_TRUNC('second', created_at)
HAVING COUNT(*) > 1
ORDER BY created_second DESC;

-- ============================================================================
-- ÉTAPE 4 : Vérifier combien de fois un utilisateur apparaît dans recipients
-- ============================================================================
-- Remplacez USER_ID par votre ID utilisateur
/*
SELECT 
  '🔍 Occurrences de votre ID dans recipients' as etape,
  id,
  kind,
  recipients,
  (
    SELECT COUNT(*)
    FROM unnest(recipients) AS r
    WHERE r = 'USER_ID_ICI'::UUID  -- Remplacez par votre ID
  ) as nb_occurrences_dans_ce_job
FROM notification_jobs
WHERE kind IN ('badge_unlocked', 'match_result_recorded', 'group_join_request_approved', 'group_join_request_rejected')
  AND 'USER_ID_ICI'::UUID = ANY(recipients)  -- Remplacez par votre ID
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 10;
*/

-- ============================================================================
-- ÉTAPE 5 : Vérifier si dispatch-notifs a été appelé plusieurs fois
-- ============================================================================
-- Vérifier dans Supabase Dashboard > Edge Functions > dispatch-notifs > Logs
-- Cherchez si dispatch-notifs est appelé plusieurs fois rapidement

-- ============================================================================
-- ÉTAPE 6 : Vérifier les triggers (s'ils s'exécutent plusieurs fois)
-- ============================================================================
SELECT 
  '🔍 Triggers actifs' as etape,
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







