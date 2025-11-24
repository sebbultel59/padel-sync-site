-- ============================================
-- TEST SIMPLE ET FINAL
-- ============================================

-- Créer une table temporaire pour les résultats
CREATE TEMP TABLE IF NOT EXISTS diagnostic_results (
  test_num INTEGER,
  test_name TEXT,
  status TEXT,
  details TEXT
);

-- Nettoyer
DELETE FROM diagnostic_results;

-- Test 1: Trigger existe ?
INSERT INTO diagnostic_results
SELECT 
  1,
  'Trigger existe ?',
  CASE WHEN COUNT(*) > 0 THEN '✅ OUI' ELSE '❌ NON' END,
  'Nombre: ' || COUNT(*)::text
FROM pg_trigger 
WHERE tgname = 'club_notifications_to_jobs_trigger';

-- Test 2: Trigger activé ?
INSERT INTO diagnostic_results
SELECT 
  2,
  'Trigger activé ?',
  CASE tgenabled 
    WHEN 'O' THEN '✅ OUI' 
    ELSE '❌ NON (code: ' || tgenabled::text || ')'
  END,
  'Trigger: ' || tgname
FROM pg_trigger 
WHERE tgname = 'club_notifications_to_jobs_trigger';

-- Test 3: Fonction existe avec SECURITY DEFINER ?
INSERT INTO diagnostic_results
SELECT 
  3,
  'Fonction SECURITY DEFINER ?',
  CASE 
    WHEN COUNT(*) = 0 THEN '❌ Fonction n''existe pas'
    WHEN prosecdef THEN '✅ OUI'
    ELSE '❌ NON'
  END,
  'Fonction: ' || proname
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'process_club_notification'
GROUP BY proname, prosecdef;

-- Test 4: Groupes et membres
INSERT INTO diagnostic_results
SELECT 
  4,
  'Groupes et membres du club',
  CASE 
    WHEN COUNT(DISTINCT gm.user_id) > 0 THEN '✅ OK'
    ELSE '❌ Aucun membre'
  END,
  'Groupes: ' || COUNT(DISTINCT g.id)::text || ', Membres: ' || COUNT(DISTINCT gm.user_id)::text
FROM groups g
INNER JOIN group_members gm ON gm.group_id = g.id
WHERE g.club_id = 'cf119a51-9e37-41cc-8b48-2a4457030782';

-- Test 5: Insertion directe possible ?
DO $$
DECLARE
  v_test_id UUID;
  v_success BOOLEAN := false;
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
    v_success := true;
    
    INSERT INTO diagnostic_results VALUES (5, 'Insertion directe possible ?', '✅ OUI', 'Test réussi');
    
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO diagnostic_results VALUES (5, 'Insertion directe possible ?', '❌ NON', SQLERRM);
  END;
END $$;

-- Test 6: Créer notification et vérifier job
DO $$
DECLARE
  v_club_id UUID := 'cf119a51-9e37-41cc-8b48-2a4457030782';
  v_user_id UUID;
  v_notification_id UUID;
  v_job_count_before INTEGER;
  v_job_count_after INTEGER;
BEGIN
  -- Récupérer utilisateur
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
  VALUES (v_club_id, 'Test final - ' || NOW()::text, v_user_id)
  RETURNING id INTO v_notification_id;
  
  -- Attendre
  PERFORM pg_sleep(3);
  
  -- Compter après
  SELECT COUNT(*) INTO v_job_count_after
  FROM notification_jobs 
  WHERE kind = 'club_notification';
  
  -- Résultat
  IF v_job_count_after > v_job_count_before THEN
    INSERT INTO diagnostic_results VALUES (
      6, 
      'Test création notification → job créé ?', 
      '✅ OUI', 
      'Avant: ' || v_job_count_before || ', Après: ' || v_job_count_after
    );
  ELSE
    INSERT INTO diagnostic_results VALUES (
      6, 
      'Test création notification → job créé ?', 
      '❌ NON', 
      'Avant: ' || v_job_count_before || ', Après: ' || v_job_count_after || ' (trigger ne fonctionne pas)'
    );
  END IF;
END $$;

-- Afficher tous les résultats
SELECT 
  test_num as "#",
  test_name as "Test",
  status as "Résultat",
  details as "Détails"
FROM diagnostic_results
ORDER BY test_num;

