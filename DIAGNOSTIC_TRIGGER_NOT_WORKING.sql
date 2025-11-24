-- ============================================
-- DIAGNOSTIC : Pourquoi le trigger ne crée pas de jobs
-- ============================================

-- 1. Vérifier les dernières notifications de club
SELECT 
  'Dernières notifications de club:' as info,
  cn.id,
  cn.club_id,
  c.name as club_name,
  LEFT(cn.message, 50) as message_preview,
  cn.created_at,
  cn.created_by
FROM club_notifications cn
LEFT JOIN clubs c ON c.id = cn.club_id
ORDER BY cn.created_at DESC
LIMIT 5;

-- 2. Pour chaque notification, vérifier si le club a des groupes
SELECT 
  'Groupes pour les clubs des notifications:' as info,
  cn.id as notification_id,
  cn.club_id,
  c.name as club_name,
  COUNT(DISTINCT g.id) as nombre_groupes,
  COUNT(DISTINCT gm.user_id) as nombre_membres_total
FROM club_notifications cn
LEFT JOIN clubs c ON c.id = cn.club_id
LEFT JOIN groups g ON g.club_id = cn.club_id
LEFT JOIN group_members gm ON gm.group_id = g.id
GROUP BY cn.id, cn.club_id, c.name
ORDER BY cn.created_at DESC
LIMIT 5;

-- 3. Vérifier TOUS les groupes et leur club_id
SELECT 
  'Tous les groupes:' as info,
  g.id,
  g.name,
  g.club_id,
  c.name as club_name,
  COUNT(gm.user_id) as membres
FROM groups g
LEFT JOIN clubs c ON c.id = g.club_id
LEFT JOIN group_members gm ON gm.group_id = g.id
GROUP BY g.id, g.name, g.club_id, c.name
ORDER BY g.created_at DESC
LIMIT 10;

-- 4. Test manuel : créer une notification de test
-- Remplacez les UUIDs par des valeurs réelles de votre base
/*
DO $$
DECLARE
  v_club_id UUID;
  v_user_id UUID;
  v_notification_id UUID;
  v_job_count INTEGER;
BEGIN
  -- Récupérer un club qui a des groupes avec membres
  SELECT g.club_id INTO v_club_id
  FROM groups g
  INNER JOIN group_members gm ON gm.group_id = g.id
  WHERE g.club_id IS NOT NULL
  GROUP BY g.club_id
  HAVING COUNT(DISTINCT gm.user_id) > 0
  LIMIT 1;
  
  IF v_club_id IS NULL THEN
    RAISE NOTICE '❌ Aucun club avec groupes et membres trouvé';
    RETURN;
  END IF;
  
  -- Récupérer un utilisateur
  SELECT id INTO v_user_id
  FROM profiles
  WHERE role = 'club_manager'
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM profiles LIMIT 1;
  END IF;
  
  RAISE NOTICE 'Test avec club_id: %, user_id: %', v_club_id, v_user_id;
  
  -- Créer une notification de test
  INSERT INTO club_notifications (club_id, message, created_by)
  VALUES (v_club_id, 'Test notification - ' || NOW()::text, v_user_id)
  RETURNING id INTO v_notification_id;
  
  RAISE NOTICE 'Notification créée: %', v_notification_id;
  
  -- Attendre un peu
  PERFORM pg_sleep(2);
  
  -- Vérifier si un job a été créé
  SELECT COUNT(*) INTO v_job_count
  FROM notification_jobs 
  WHERE kind = 'club_notification' 
  AND payload->>'club_id' = v_club_id::text
  AND created_at > NOW() - INTERVAL '5 minutes';
  
  IF v_job_count > 0 THEN
    RAISE NOTICE '✅ SUCCÈS: % job(s) créé(s)', v_job_count;
  ELSE
    RAISE WARNING '❌ ÉCHEC: Aucun job créé';
    RAISE NOTICE 'Vérifiez les logs Supabase pour voir les messages du trigger';
  END IF;
END $$;
*/

-- 5. Vérifier les permissions RLS sur les tables nécessaires
SELECT 
  'Permissions RLS:' as info,
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename IN ('club_notifications', 'groups', 'group_members', 'notification_jobs')
AND schemaname = 'public';

