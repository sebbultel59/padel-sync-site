-- ============================================
-- DIAGNOSTIC : Plus de notifications envoyées
-- ============================================

-- 1. Vérifier les derniers jobs créés
SELECT 
  'Derniers jobs créés' as info,
  id,
  kind,
  created_at,
  sent_at,
  CASE 
    WHEN sent_at IS NULL THEN '⏳ En attente'
    WHEN sent_at IS NOT NULL THEN '✅ Envoyé'
  END as status,
  array_length(recipients, 1) as nb_recipients,
  payload->>'message' as message
FROM notification_jobs
WHERE kind = 'club_notification'
ORDER BY created_at DESC
LIMIT 10;

-- 2. Vérifier les jobs récents non envoyés (dernières 5 minutes)
SELECT 
  'Jobs récents non envoyés' as info,
  id,
  kind,
  created_at,
  sent_at,
  array_length(recipients, 1) as nb_recipients,
  payload->>'message' as message
FROM notification_jobs
WHERE kind = 'club_notification'
AND sent_at IS NULL
AND created_at > NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC;

-- 3. Vérifier les jobs récents envoyés (dernières 5 minutes)
SELECT 
  'Jobs récents envoyés' as info,
  id,
  kind,
  created_at,
  sent_at,
  array_length(recipients, 1) as nb_recipients,
  payload->>'message' as message
FROM notification_jobs
WHERE kind = 'club_notification'
AND sent_at IS NOT NULL
AND created_at > NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC;

-- 4. Compter les jobs par statut
SELECT 
  'Statistiques' as info,
  COUNT(*) FILTER (WHERE sent_at IS NULL) as en_attente,
  COUNT(*) FILTER (WHERE sent_at IS NOT NULL) as envoyes,
  COUNT(*) as total
FROM notification_jobs
WHERE kind = 'club_notification'
AND created_at > NOW() - INTERVAL '1 hour';

