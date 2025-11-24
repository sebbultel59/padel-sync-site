-- ============================================
-- DEBUG : Pourquoi le trigger ne se déclenche pas
-- ============================================

-- 1. Vérifier que le trigger existe et est activé
SELECT 
  'Trigger status:' as info,
  tgname as trigger_name,
  tgrelid::regclass as table_name,
  CASE tgenabled 
    WHEN 'O' THEN '✅ Activé'
    WHEN 'D' THEN '❌ Désactivé'
    WHEN 'R' THEN '⚠️ Réplique'
    WHEN 'A' THEN '⚠️ Toujours'
    ELSE '❓ Inconnu: ' || tgenabled::text
  END as status,
  tgisinternal as is_internal
FROM pg_trigger 
WHERE tgname = 'club_notifications_to_jobs_trigger';

-- 2. Vérifier les permissions RLS sur club_notifications
SELECT 
  'RLS sur club_notifications:' as info,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'club_notifications'
AND schemaname = 'public';

-- 3. Vérifier les politiques RLS sur club_notifications
SELECT 
  'Politiques RLS:' as info,
  policyname,
  cmd as command,
  permissive,
  roles
FROM pg_policies
WHERE tablename = 'club_notifications'
ORDER BY cmd;

-- 4. Test direct de la fonction (sans trigger)
DO $$
DECLARE
  v_club_id UUID := 'cf119a51-9e37-41cc-8b48-2a4457030782';
  v_user_id UUID;
  v_test_notification RECORD;
  v_result TEXT;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'TEST DIRECT DE LA FONCTION';
  RAISE NOTICE '========================================';
  
  -- Récupérer un utilisateur
  SELECT id INTO v_user_id
  FROM profiles
  WHERE role = 'club_manager'
  AND club_id = v_club_id
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    SELECT DISTINCT gm.user_id INTO v_user_id
    FROM groups g
    INNER JOIN group_members gm ON gm.group_id = g.id
    WHERE g.club_id = v_club_id
    LIMIT 1;
  END IF;
  
  -- Créer une notification de test
  INSERT INTO club_notifications (club_id, message, created_by)
  VALUES (v_club_id, 'Test direct fonction - ' || NOW()::text, v_user_id)
  RETURNING * INTO v_test_notification;
  
  RAISE NOTICE 'Notification créée: %', v_test_notification.id;
  
  -- Appeler la fonction directement
  BEGIN
    PERFORM process_club_notification() FROM club_notifications WHERE id = v_test_notification.id;
    RAISE NOTICE '✅ Fonction exécutée sans erreur';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '❌ Erreur lors de l''exécution: %', SQLERRM;
  END;
  
  -- Nettoyer
  DELETE FROM club_notifications WHERE id = v_test_notification.id;
  
END $$;

-- 5. Vérifier si le trigger est bien attaché avec la bonne fonction
SELECT 
  'Détails du trigger:' as info,
  t.tgname as trigger_name,
  t.tgrelid::regclass as table_name,
  p.proname as function_name,
  t.tgtype::text as trigger_type,
  CASE 
    WHEN t.tgtype::integer & 2 = 2 THEN 'BEFORE'
    WHEN t.tgtype::integer & 64 = 64 THEN 'INSTEAD OF'
    ELSE 'AFTER'
  END as timing,
  CASE 
    WHEN t.tgtype::integer & 4 = 4 THEN 'INSERT'
    WHEN t.tgtype::integer & 8 = 8 THEN 'DELETE'
    WHEN t.tgtype::integer & 16 = 16 THEN 'UPDATE'
    ELSE 'UNKNOWN'
  END as event
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE t.tgname = 'club_notifications_to_jobs_trigger';

-- 6. Vérifier les permissions d'exécution sur la fonction
SELECT 
  'Permissions fonction:' as info,
  p.proname as function_name,
  p.prosecdef as security_definer,
  CASE 
    WHEN p.prosecdef THEN '✅ SECURITY DEFINER (contourne RLS)'
    ELSE '❌ Pas SECURITY DEFINER'
  END as status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'process_club_notification';

-- 7. Test : Vérifier si on peut insérer dans notification_jobs depuis la fonction
DO $$
DECLARE
  v_test_id UUID;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'TEST INSERTION DIRECTE DANS notification_jobs';
  RAISE NOTICE '========================================';
  
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
    
    RAISE NOTICE '✅ Insertion directe réussie: %', v_test_id;
    
    -- Nettoyer
    DELETE FROM notification_jobs WHERE id = v_test_id;
    
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '❌ Erreur insertion directe: %', SQLERRM;
    RAISE WARNING 'Code erreur: %', SQLSTATE;
  END;
END $$;

