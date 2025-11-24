-- ============================================
-- CORRECTION COMPLÈTE : Notifications de club
-- ============================================

-- ÉTAPE 1 : Vérifier et corriger les permissions RLS sur notification_jobs
-- ============================================

-- Vérifier si RLS est activé
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE tablename = 'notification_jobs' 
    AND schemaname = 'public'
    AND rowsecurity = true
  ) THEN
    RAISE NOTICE '✅ RLS est activé sur notification_jobs';
    
    -- Créer une politique qui permet aux fonctions SECURITY DEFINER d'insérer
    DROP POLICY IF EXISTS "Functions can insert notification jobs" ON notification_jobs;
    CREATE POLICY "Functions can insert notification jobs"
      ON notification_jobs
      FOR INSERT
      WITH CHECK (true);
    
    RAISE NOTICE '✅ Politique INSERT créée pour les fonctions';
  ELSE
    RAISE NOTICE 'ℹ️ RLS n''est pas activé sur notification_jobs (c''est OK)';
  END IF;
END $$;

-- ÉTAPE 2 : Vérifier que la fonction a SECURITY DEFINER
-- ============================================
SELECT 
  proname as function_name,
  CASE 
    WHEN prosecdef THEN '✅ SECURITY DEFINER'
    ELSE '❌ Pas SECURITY DEFINER - CORRIGER !'
  END as status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'process_club_notification';

-- ÉTAPE 3 : Diagnostic des données
-- ============================================

-- 3.1 Vérifier les notifications de club existantes
SELECT 
  '📋 Notifications de club:' as info,
  COUNT(*) as total,
  MAX(created_at) as derniere
FROM club_notifications;

-- 3.2 Vérifier les groupes avec club_id
SELECT 
  '👥 Groupes avec club_id:' as info,
  COUNT(DISTINCT g.id) as groupes_avec_club,
  COUNT(DISTINCT g.club_id) as clubs_differents,
  COUNT(DISTINCT gm.user_id) as total_membres
FROM groups g
LEFT JOIN group_members gm ON gm.group_id = g.id
WHERE g.club_id IS NOT NULL;

-- 3.3 Détail par club
SELECT 
  '📊 Détail par club:' as info,
  g.club_id,
  c.name as club_name,
  COUNT(DISTINCT g.id) as nombre_groupes,
  COUNT(DISTINCT gm.user_id) as nombre_membres
FROM groups g
LEFT JOIN clubs c ON c.id = g.club_id
LEFT JOIN group_members gm ON gm.group_id = g.id
WHERE g.club_id IS NOT NULL
GROUP BY g.club_id, c.name
ORDER BY nombre_membres DESC;

-- ÉTAPE 4 : Test du trigger avec logs
-- ============================================
-- Décommentez et exécutez cette section pour tester

/*
DO $$
DECLARE
  v_club_id UUID;
  v_user_id UUID;
  v_notification_id UUID;
  v_job_count INTEGER;
  v_group_count INTEGER;
  v_member_count INTEGER;
BEGIN
  -- Trouver un club qui a des groupes avec membres
  SELECT 
    g.club_id,
    COUNT(DISTINCT g.id) as grp_count,
    COUNT(DISTINCT gm.user_id) as mem_count
  INTO v_club_id, v_group_count, v_member_count
  FROM groups g
  INNER JOIN group_members gm ON gm.group_id = g.id
  WHERE g.club_id IS NOT NULL
  GROUP BY g.club_id
  HAVING COUNT(DISTINCT gm.user_id) > 0
  LIMIT 1;
  
  IF v_club_id IS NULL THEN
    RAISE WARNING '❌ Aucun club avec groupes et membres trouvé';
    RAISE NOTICE 'Solution: Associez des groupes à un club avec UPDATE groups SET club_id = ...';
    RETURN;
  END IF;
  
  RAISE NOTICE '✅ Club trouvé: % (groupes: %, membres: %)', v_club_id, v_group_count, v_member_count;
  
  -- Récupérer un utilisateur club_manager
  SELECT id INTO v_user_id
  FROM profiles
  WHERE role = 'club_manager'
  AND club_id = v_club_id
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM profiles LIMIT 1;
  END IF;
  
  RAISE NOTICE '✅ Utilisateur pour test: %', v_user_id;
  
  -- Créer une notification de test
  RAISE NOTICE '📝 Création d''une notification de test...';
  INSERT INTO club_notifications (club_id, message, created_by)
  VALUES (v_club_id, 'Test automatique - ' || NOW()::text, v_user_id)
  RETURNING id INTO v_notification_id;
  
  RAISE NOTICE '✅ Notification créée: %', v_notification_id;
  RAISE NOTICE '⏳ Attente de 2 secondes pour que le trigger s''exécute...';
  
  -- Attendre que le trigger s'exécute
  PERFORM pg_sleep(2);
  
  -- Vérifier si un job a été créé
  SELECT COUNT(*) INTO v_job_count
  FROM notification_jobs 
  WHERE kind = 'club_notification' 
  AND payload->>'club_id' = v_club_id::text
  AND created_at > NOW() - INTERVAL '5 minutes';
  
  IF v_job_count > 0 THEN
    RAISE NOTICE '✅✅✅ SUCCÈS: % job(s) créé(s) !', v_job_count;
    RAISE NOTICE 'Vérifiez la table notification_jobs pour voir les détails';
  ELSE
    RAISE WARNING '❌❌❌ ÉCHEC: Aucun job créé';
    RAISE NOTICE 'Vérifiez les logs Supabase (Database > Logs) pour voir les messages du trigger';
    RAISE NOTICE 'Les messages commencent par [process_club_notification]';
  END IF;
END $$;
*/

-- ÉTAPE 5 : Vérifier les logs du trigger
-- ============================================
-- Allez dans Supabase Dashboard > Database > Logs
-- Cherchez les messages commençant par [process_club_notification]

-- ÉTAPE 6 : Solution si les groupes n'ont pas de club_id
-- ============================================
-- Si les groupes n'ont pas de club_id, exécutez :
/*
UPDATE groups 
SET club_id = 'VOTRE_CLUB_ID'
WHERE id IN ('GROUP_ID_1', 'GROUP_ID_2');
*/

