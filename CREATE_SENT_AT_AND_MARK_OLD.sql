-- ============================================
-- CRÉER LA COLONNE sent_at ET MARQUER LES ANCIENS JOBS
-- ============================================

-- 1. Créer la colonne sent_at si elle n'existe pas
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

-- 2. Marquer tous les anciens jobs comme envoyés pour éviter qu'ils soient retraités
-- (on considère qu'ils ont été envoyés il y a au moins 1 heure)
UPDATE notification_jobs
SET sent_at = created_at + INTERVAL '1 hour'
WHERE sent_at IS NULL
AND created_at < NOW() - INTERVAL '1 hour';

-- 3. Afficher le résultat
SELECT 
  'Résultat' as info,
  COUNT(*) FILTER (WHERE sent_at IS NOT NULL) as jobs_envoyes,
  COUNT(*) FILTER (WHERE sent_at IS NULL) as jobs_non_envoyes,
  COUNT(*) as total
FROM notification_jobs
WHERE kind = 'club_notification';

