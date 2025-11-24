-- ============================================
-- DIAGNOSTIC : Notification apparaît 3 fois
-- ============================================

-- 1. Vérifier le dernier job créé
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

-- 2. Vérifier s'il y a des doublons dans le tableau recipients
SELECT 
  'Doublons dans recipients' as info,
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
WHERE kind = 'club_notification'
ORDER BY created_at DESC
LIMIT 5;

-- 3. Vérifier combien de fois un utilisateur apparaît dans les recipients
-- Remplacez 'VOTRE_USER_ID' par votre ID réel
/*
SELECT 
  'Occurrences utilisateur' as info,
  id,
  kind,
  (
    SELECT COUNT(*)
    FROM unnest(recipients) AS r
    WHERE r = 'VOTRE_USER_ID'::UUID
  ) as nb_occurrences
FROM notification_jobs
WHERE kind = 'club_notification'
AND 'VOTRE_USER_ID'::UUID = ANY(recipients)
ORDER BY created_at DESC
LIMIT 5;
*/

-- 4. Vérifier s'il y a plusieurs jobs pour la même notification
SELECT 
  'Jobs par notification' as info,
  payload->>'club_id' as club_id,
  payload->>'message' as message,
  DATE_TRUNC('second', created_at) as created_second,
  COUNT(*) as nb_jobs,
  array_agg(id) as job_ids
FROM notification_jobs
WHERE kind = 'club_notification'
GROUP BY payload->>'club_id', payload->>'message', DATE_TRUNC('second', created_at)
HAVING COUNT(*) > 1
ORDER BY created_second DESC;

-- 5. Vérifier les appels à dispatch-notifs (via les logs si possible)
-- Cette requête ne fonctionnera que si vous avez une table de logs
-- Sinon, vérifiez dans Supabase Dashboard > Edge Functions > dispatch-notifs > Logs

