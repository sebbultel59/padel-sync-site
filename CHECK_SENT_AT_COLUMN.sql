-- ============================================
-- VÉRIFIER SI LA COLONNE sent_at EXISTE
-- ============================================

-- Vérifier si la colonne sent_at existe
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'notification_jobs'
AND column_name = 'sent_at';

-- Si la colonne n'existe pas, la créer
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

-- Vérifier les jobs avec sent_at
SELECT 
  'Jobs avec sent_at' as info,
  COUNT(*) FILTER (WHERE sent_at IS NOT NULL) as envoyes,
  COUNT(*) FILTER (WHERE sent_at IS NULL) as non_envoyes,
  COUNT(*) as total
FROM notification_jobs
WHERE kind = 'club_notification';

