-- Script de vérification des migrations de rôles
-- Exécutez ce script dans le SQL Editor de Supabase pour vérifier que tout est en place

-- 1. Vérifier les colonnes de rôles dans profiles
SELECT 
  '✅ Colonnes de rôles' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'profiles' 
      AND column_name = 'role'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'profiles' 
      AND column_name = 'club_id'
    ) THEN 'OK'
    ELSE '❌ MANQUANT'
  END as status;

-- 2. Vérifier les colonnes enrichies dans clubs
SELECT 
  '✅ Colonnes enrichies clubs' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'clubs' 
      AND column_name = 'call_button_enabled'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'clubs' 
      AND column_name = 'call_phone'
    ) THEN 'OK'
    ELSE '❌ MANQUANT'
  END as status;

-- 3. Vérifier les tables de gestion de club
SELECT 
  '✅ Tables club_posts et club_notifications' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_name = 'club_posts'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_name = 'club_notifications'
    ) THEN 'OK'
    ELSE '❌ MANQUANT'
  END as status;

-- 4. Vérifier les fonctions de rôles
SELECT 
  '✅ Fonctions de rôles' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.routines 
      WHERE routine_name = 'is_super_admin'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.routines 
      WHERE routine_name = 'is_club_manager'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.routines 
      WHERE routine_name = 'is_group_admin'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.routines 
      WHERE routine_name = 'can_manage_group'
    ) THEN 'OK'
    ELSE '❌ MANQUANT'
  END as status;

-- 5. Vérifier la migration des données (super_admins → super_admin)
SELECT 
  '✅ Migration super_admins' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM profiles 
      WHERE role = 'super_admin'
    ) THEN 'OK - ' || COUNT(*)::text || ' super_admin(s) trouvé(s)'
    ELSE '⚠️ Aucun super_admin trouvé'
  END as status
FROM profiles 
WHERE role = 'super_admin';

-- 6. Vérifier la migration des données (admins → admin)
SELECT 
  '✅ Migration admins' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM profiles 
      WHERE role = 'admin'
    ) THEN 'OK - ' || COUNT(*)::text || ' admin(s) trouvé(s)'
    ELSE '⚠️ Aucun admin trouvé'
  END as status
FROM profiles 
WHERE role = 'admin';

-- 7. Vérifier la distribution des rôles
SELECT 
  '📊 Distribution des rôles' as check_name,
  role,
  COUNT(*) as count
FROM profiles
GROUP BY role
ORDER BY 
  CASE role
    WHEN 'super_admin' THEN 1
    WHEN 'admin' THEN 2
    WHEN 'club_manager' THEN 3
    WHEN 'player' THEN 4
    ELSE 5
  END;

-- 8. Vérifier les club_managers avec club_id
SELECT 
  '✅ Club managers avec club_id' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM profiles 
      WHERE role = 'club_manager' AND club_id IS NOT NULL
    ) THEN 'OK - ' || COUNT(*)::text || ' club_manager(s) avec club_id'
    ELSE '⚠️ Aucun club_manager avec club_id'
  END as status
FROM profiles 
WHERE role = 'club_manager' AND club_id IS NOT NULL;

-- 9. Test des fonctions (nécessite d'être authentifié)
-- Décommentez ces lignes pour tester avec votre user_id
-- SELECT is_super_admin(auth.uid()) as "Je suis super_admin?";
-- SELECT is_club_manager('CLUB_ID_ICI'::uuid, auth.uid()) as "Je suis club_manager de ce club?";
-- SELECT can_manage_group('GROUP_ID_ICI'::uuid, auth.uid()) as "Je peux gérer ce groupe?";

-- 10. Vérifier les fonctions RPC mises à jour
SELECT 
  '✅ Fonctions RPC mises à jour' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.routines 
      WHERE routine_name = 'rpc_create_group'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.routines 
      WHERE routine_name = 'rpc_update_group'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.routines 
      WHERE routine_name = 'approve_join_request'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.routines 
      WHERE routine_name = 'cancel_match'
    ) THEN 'OK'
    ELSE '❌ MANQUANT'
  END as status;

