-- ============================================
-- CORRECTION DE LA CONTRAINTE notification_jobs
-- ============================================
-- La contrainte actuelle exige match_id OU group_id
-- Mais pour les notifications de club, les deux sont NULL
-- Solution : Modifier la contrainte pour permettre club_notification

-- 1. Vérifier la contrainte actuelle
SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'notification_jobs'::regclass
AND conname LIKE '%match_or_group%';

-- 2. Supprimer l'ancienne contrainte
ALTER TABLE notification_jobs 
DROP CONSTRAINT IF EXISTS notification_jobs_match_or_group_chk;

-- 3. Créer une nouvelle contrainte qui permet les notifications de club
ALTER TABLE notification_jobs
ADD CONSTRAINT notification_jobs_match_or_group_chk 
CHECK (
  -- Soit match_id est non NULL
  match_id IS NOT NULL 
  -- Soit group_id est non NULL
  OR group_id IS NOT NULL
  -- Soit c'est une notification de club (kind = 'club_notification')
  OR kind = 'club_notification'
);

-- 4. Vérifier que la nouvelle contrainte existe
SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'notification_jobs'::regclass
AND conname = 'notification_jobs_match_or_group_chk';

-- 5. Test : Vérifier qu'on peut maintenant insérer une notification de club
DO $$
DECLARE
  v_test_id UUID;
BEGIN
  INSERT INTO notification_jobs (
    kind,
    recipients,
    group_id,
    match_id,
    payload,
    created_at
  )
  VALUES (
    'club_notification',
    ARRAY['00000000-0000-0000-0000-000000000001'::UUID],
    NULL,
    NULL,
    '{"test": true}'::jsonb,
    NOW()
  )
  RETURNING id INTO v_test_id;
  
  RAISE NOTICE '✅ Test réussi ! Job créé: %', v_test_id;
  
  -- Nettoyer
  DELETE FROM notification_jobs WHERE id = v_test_id;
  
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '❌ Erreur: %', SQLERRM;
END $$;

