-- ============================================
-- DIAGNOSTIC : Notification apparaît 2 fois
-- ============================================

-- 1. Vérifier le dernier job créé et ses recipients
SELECT 
  'Dernier job' as info,
  id,
  kind,
  array_length(recipients, 1) as nb_recipients,
  recipients,
  created_at,
  sent_at
FROM notification_jobs
WHERE kind = 'club_notification'
ORDER BY created_at DESC
LIMIT 1;

-- 2. Vérifier s'il y a des doublons dans le tableau recipients du dernier job
SELECT 
  'Doublons dans recipients' as info,
  id,
  kind,
  recipients,
  array_length(recipients, 1) as nb_total,
  (
    SELECT COUNT(DISTINCT unnest)
    FROM unnest(recipients) AS unnest
  ) as nb_uniques,
  CASE 
    WHEN array_length(recipients, 1) > (
      SELECT COUNT(DISTINCT unnest)
      FROM unnest(recipients) AS unnest
    ) THEN '❌ DOUBLONS DÉTECTÉS'
    ELSE '✅ Pas de doublons'
  END as status
FROM notification_jobs
WHERE kind = 'club_notification'
ORDER BY created_at DESC
LIMIT 1;

-- 3. Vérifier s'il y a plusieurs jobs pour la même notification récente
SELECT 
  'Jobs récents (dernières 5 minutes)' as info,
  id,
  kind,
  payload->>'message' as message,
  created_at,
  sent_at,
  array_length(recipients, 1) as nb_recipients
FROM notification_jobs
WHERE kind = 'club_notification'
AND created_at > NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC;

-- 4. Vérifier s'il y a plusieurs triggers sur club_notifications
SELECT 
  'Triggers sur club_notifications' as info,
  tgname as trigger_name,
  tgenabled as enabled,
  CASE tgenabled 
    WHEN 'O' THEN '✅ Activé'
    ELSE '❌ Désactivé'
  END as status
FROM pg_trigger
WHERE tgrelid = 'club_notifications'::regclass;

-- 5. Vérifier s'il y a plusieurs triggers sur notification_jobs
SELECT 
  'Triggers sur notification_jobs' as info,
  tgname as trigger_name,
  tgenabled as enabled,
  CASE tgenabled 
    WHEN 'O' THEN '✅ Activé'
    ELSE '❌ Désactivé'
  END as status
FROM pg_trigger
WHERE tgrelid = 'notification_jobs'::regclass;

