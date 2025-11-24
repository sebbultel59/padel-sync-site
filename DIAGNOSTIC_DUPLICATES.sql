-- ============================================
-- DIAGNOSTIC : Notifications en multiples exemplaires
-- ============================================

-- 1. Vérifier s'il y a plusieurs triggers
SELECT 
  'Nombre de triggers' as info,
  COUNT(*) as nombre,
  array_agg(tgname) as trigger_names
FROM pg_trigger 
WHERE tgrelid = 'club_notifications'::regclass
AND tgname LIKE '%club_notification%';

-- 2. Vérifier les derniers jobs créés pour une notification
SELECT 
  'Jobs pour les dernières notifications' as info,
  nj.id as job_id,
  nj.kind,
  nj.created_at as job_created_at,
  cn.id as notification_id,
  cn.message,
  cn.created_at as notification_created_at,
  array_length(nj.recipients, 1) as nb_recipients
FROM notification_jobs nj
LEFT JOIN club_notifications cn ON (
  cn.club_id::text = nj.payload->>'club_id'
  AND ABS(EXTRACT(EPOCH FROM (nj.created_at - cn.created_at))) < 5
)
WHERE nj.kind = 'club_notification'
ORDER BY nj.created_at DESC
LIMIT 10;

-- 3. Compter les jobs par notification (approximatif par timestamp)
SELECT 
  'Jobs par notification (groupés par timestamp)' as info,
  DATE_TRUNC('second', created_at) as created_second,
  COUNT(*) as nombre_jobs,
  array_length(recipients, 1) as nb_recipients,
  payload->>'message' as message
FROM notification_jobs
WHERE kind = 'club_notification'
GROUP BY DATE_TRUNC('second', created_at), array_length(recipients, 1), payload->>'message'
ORDER BY created_second DESC
LIMIT 10;

-- 4. Vérifier s'il y a des doublons exacts
SELECT 
  'Doublons exacts' as info,
  kind,
  payload->>'club_id' as club_id,
  payload->>'message' as message,
  created_at,
  COUNT(*) as nombre
FROM notification_jobs
WHERE kind = 'club_notification'
GROUP BY kind, payload->>'club_id', payload->>'message', created_at
HAVING COUNT(*) > 1
ORDER BY created_at DESC
LIMIT 10;

