-- ============================================
-- DIAGNOSTIC COMPLET - TOUT EN TABLEAUX
-- ============================================

-- 1. Vérifier que le trigger existe
SELECT 
  '1. Trigger existe ?' as etape,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ OUI'
    ELSE '❌ NON'
  END as resultat,
  COUNT(*) as nombre
FROM pg_trigger 
WHERE tgname = 'club_notifications_to_jobs_trigger';

-- 2. Vérifier que le trigger est activé
SELECT 
  '2. Trigger activé ?' as etape,
  CASE tgenabled 
    WHEN 'O' THEN '✅ OUI'
    ELSE '❌ NON'
  END as resultat,
  tgname as trigger_name
FROM pg_trigger 
WHERE tgname = 'club_notifications_to_jobs_trigger';

-- 3. Vérifier que la fonction existe
SELECT 
  '3. Fonction existe ?' as etape,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ OUI'
    ELSE '❌ NON'
  END as resultat,
  COUNT(*) as nombre
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'process_club_notification';

-- 4. Vérifier que la fonction a SECURITY DEFINER
SELECT 
  '4. Fonction SECURITY DEFINER ?' as etape,
  CASE prosecdef 
    WHEN true THEN '✅ OUI'
    ELSE '❌ NON'
  END as resultat,
  proname as function_name
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'process_club_notification';

-- 5. Vérifier les groupes et membres du club de test
SELECT 
  '5. Groupes et membres' as etape,
  COUNT(DISTINCT g.id) as groupes,
  COUNT(DISTINCT gm.user_id) as membres,
  'Club: Hercule & Hops' as info
FROM groups g
INNER JOIN group_members gm ON gm.group_id = g.id
WHERE g.club_id = 'cf119a51-9e37-41cc-8b48-2a4457030782';

-- 6. Test d'insertion directe dans notification_jobs
DO $$
DECLARE
  v_test_id UUID;
  v_error TEXT;
BEGIN
  BEGIN
    INSERT INTO notification_jobs (
      kind,
      recipients,
      payload,
      created_at
    )
    VALUES (
      'test_direct',
      ARRAY['00000000-0000-0000-0000-000000000001'::UUID],
      '{"test": true}'::jsonb,
      NOW()
    )
    RETURNING id INTO v_test_id;
    
    DELETE FROM notification_jobs WHERE id = v_test_id;
    
    -- Créer une table temporaire pour afficher le résultat
    CREATE TEMP TABLE IF NOT EXISTS test_results (etape TEXT, resultat TEXT);
    INSERT INTO test_results VALUES ('6. Insertion directe possible ?', '✅ OUI');
    
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    CREATE TEMP TABLE IF NOT EXISTS test_results (etape TEXT, resultat TEXT);
    INSERT INTO test_results VALUES ('6. Insertion directe possible ?', '❌ NON: ' || v_error);
  END;
END $$;

SELECT * FROM test_results;

-- 7. Compter les jobs club_notification existants
SELECT 
  '7. Jobs club_notification existants' as etape,
  COUNT(*) as nombre,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Il y en a'
    ELSE '❌ Aucun'
  END as resultat
FROM notification_jobs 
WHERE kind = 'club_notification';

-- 8. Créer une notification de test et vérifier immédiatement
DO $$
DECLARE
  v_club_id UUID := 'cf119a51-9e37-41cc-8b48-2a4457030782';
  v_user_id UUID;
  v_notification_id UUID;
  v_job_count_before INTEGER;
  v_job_count_after INTEGER;
BEGIN
  -- Récupérer un utilisateur
  SELECT DISTINCT gm.user_id INTO v_user_id
  FROM groups g
  INNER JOIN group_members gm ON gm.group_id = g.id
  WHERE g.club_id = v_club_id
  LIMIT 1;
  
  -- Compter avant
  SELECT COUNT(*) INTO v_job_count_before
  FROM notification_jobs 
  WHERE kind = 'club_notification';
  
  -- Créer notification
  INSERT INTO club_notifications (club_id, message, created_by)
  VALUES (v_club_id, 'Test diagnostic - ' || NOW()::text, v_user_id)
  RETURNING id INTO v_notification_id;
  
  -- Attendre
  PERFORM pg_sleep(2);
  
  -- Compter après
  SELECT COUNT(*) INTO v_job_count_after
  FROM notification_jobs 
  WHERE kind = 'club_notification';
  
  -- Afficher résultat
  CREATE TEMP TABLE IF NOT EXISTS test_trigger_result (etape TEXT, resultat TEXT, details TEXT);
  INSERT INTO test_trigger_result VALUES (
    '8. Test création notification',
    CASE 
      WHEN v_job_count_after > v_job_count_before THEN '✅ SUCCÈS - Job créé'
      ELSE '❌ ÉCHEC - Aucun job créé'
    END,
    'Avant: ' || v_job_count_before || ', Après: ' || v_job_count_after
  );
END $$;

SELECT * FROM test_trigger_result;

-- 9. Afficher les dernières notifications de club
SELECT 
  '9. Dernières notifications' as etape,
  id,
  club_id,
  LEFT(message, 30) as message,
  created_at
FROM club_notifications
ORDER BY created_at DESC
LIMIT 3;

