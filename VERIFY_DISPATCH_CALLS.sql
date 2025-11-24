-- ============================================
-- VÉRIFIER LES APPELS À dispatch-notifs
-- ============================================

-- 1. Vérifier si le trigger auto-dispatch existe
SELECT 
  'Trigger auto-dispatch' as info,
  tgname as trigger_name,
  tgenabled as enabled,
  CASE tgenabled 
    WHEN 'O' THEN '✅ Activé'
    WHEN 'D' THEN '❌ Désactivé'
    ELSE '❓ ' || tgenabled::text
  END as status,
  pg_get_triggerdef(oid) as definition
FROM pg_trigger
WHERE tgrelid = 'notification_jobs'::regclass
AND tgname LIKE '%dispatch%';

-- 2. Vérifier la fonction trigger_call_dispatch_notifications
SELECT 
  'Fonction trigger_call_dispatch' as info,
  proname as function_name,
  prosrc as source_code
FROM pg_proc
WHERE proname = 'trigger_call_dispatch_notifications';

-- 3. Vérifier les cron jobs (si pg_cron est activé)
-- Note: Cette requête peut échouer si pg_cron n'est pas activé, c'est normal
-- Si vous obtenez une erreur "relation cron.job does not exist", ignorez cette section
SELECT 
  'Cron jobs' as info,
  jobid,
  schedule,
  command,
  active
FROM cron.job
WHERE command LIKE '%dispatch-notifs%'
LIMIT 5;

-- 4. Résumé : Combien de mécanismes d'appel sont actifs ?
SELECT 
  'Résumé' as info,
  (SELECT COUNT(*) FROM pg_trigger WHERE tgrelid = 'notification_jobs'::regclass AND tgname LIKE '%dispatch%' AND tgenabled = 'O') as triggers_actifs,
  (SELECT COUNT(*) FROM pg_proc WHERE proname = 'trigger_call_dispatch_notifications') as fonction_existe,
  COALESCE((SELECT COUNT(*) FROM cron.job WHERE command LIKE '%dispatch-notifs%' AND active = true), 0) as cron_actifs;

-- 5. Recommandation
SELECT 
  CASE 
    WHEN (SELECT COUNT(*) FROM pg_trigger WHERE tgrelid = 'notification_jobs'::regclass AND tgname LIKE '%dispatch%' AND tgenabled = 'O') > 1 THEN
      '❌ PROBLÈME: Plusieurs triggers actifs sur notification_jobs'
    WHEN (SELECT COUNT(*) FROM pg_trigger WHERE tgrelid = 'notification_jobs'::regclass AND tgname LIKE '%dispatch%' AND tgenabled = 'O') = 1 
         AND COALESCE((SELECT COUNT(*) FROM cron.job WHERE command LIKE '%dispatch-notifs%' AND active = true), 0) > 0 THEN
      '⚠️ ATTENTION: Trigger ET cron actifs (risque de doublons)'
    WHEN (SELECT COUNT(*) FROM pg_trigger WHERE tgrelid = 'notification_jobs'::regclass AND tgname LIKE '%dispatch%' AND tgenabled = 'O') = 1 THEN
      '✅ OK: Un seul trigger actif'
    ELSE
      '❓ Aucun trigger auto-dispatch trouvé'
  END as recommendation;

