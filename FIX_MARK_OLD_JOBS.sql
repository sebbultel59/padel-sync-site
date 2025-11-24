-- ============================================
-- CORRECTION : Marquer les anciens jobs comme envoyés
-- ============================================

-- 1. Vérifier si la colonne sent_at existe
SELECT 
  'Colonne sent_at' as info,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'notification_jobs'
      AND column_name = 'sent_at'
    ) THEN '✅ Existe'
    ELSE '❌ N''existe pas'
  END as status;

-- 2. Créer la colonne si elle n'existe pas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'notification_jobs'
    AND column_name = 'sent_at'
  ) THEN
    ALTER TABLE notification_jobs
    ADD COLUMN sent_at TIMESTAMPTZ;
    
    RAISE NOTICE '✅ Colonne sent_at créée';
  ELSE
    RAISE NOTICE '✅ Colonne sent_at existe déjà';
  END IF;
END $$;

-- 3. Vérifier les jobs avant
SELECT 
  'Avant marquage' as info,
  COUNT(*) FILTER (WHERE sent_at IS NOT NULL) as envoyes,
  COUNT(*) FILTER (WHERE sent_at IS NULL) as non_envoyes,
  MIN(created_at) as plus_ancien,
  MAX(created_at) as plus_recent
FROM notification_jobs
WHERE kind = 'club_notification';

-- 4. Marquer TOUS les jobs club_notification comme envoyés
-- (même les récents, pour éviter qu'ils soient retraités)
UPDATE notification_jobs
SET sent_at = COALESCE(created_at, NOW())
WHERE kind = 'club_notification'
AND sent_at IS NULL;

-- 5. Vérifier après
SELECT 
  'Après marquage' as info,
  COUNT(*) FILTER (WHERE sent_at IS NOT NULL) as envoyes,
  COUNT(*) FILTER (WHERE sent_at IS NULL) as non_envoyes,
  COUNT(*) as total
FROM notification_jobs
WHERE kind = 'club_notification';

-- 6. Afficher les détails des jobs
SELECT 
  id,
  kind,
  created_at,
  sent_at,
  CASE 
    WHEN sent_at IS NOT NULL THEN '✅ Envoyé'
    ELSE '❌ Non envoyé'
  END as status,
  LEFT(payload->>'message', 30) as message
FROM notification_jobs
WHERE kind = 'club_notification'
ORDER BY created_at DESC
LIMIT 10;

