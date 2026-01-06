-- Diagnostic : Erreur lors de la suppression d'utilisateur
-- Remplacez USER_ID par l'UUID de l'utilisateur à diagnostiquer
-- Exemple: '12edb353-2333-4a92-9b7e-1a72b0395ff4'

DO $$
DECLARE
  v_user_id UUID := '12edb353-2333-4a92-9b7e-1a72b0395ff4'::UUID;  -- ⚠️ CHANGEZ ICI
  v_profile_exists BOOLEAN;
  v_auth_user_exists BOOLEAN;
  v_error_message TEXT;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'DIAGNOSTIC DE SUPPRESSION UTILISATEUR';
  RAISE NOTICE 'User ID: %', v_user_id;
  RAISE NOTICE '========================================';
  
  -- 1. Vérifier si le profil existe
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = v_user_id) INTO v_profile_exists;
  RAISE NOTICE '1. Profil existe: %', v_profile_exists;
  
  IF NOT v_profile_exists THEN
    RAISE WARNING '❌ Le profil n''existe pas !';
    RETURN;
  END IF;
  
  -- 2. Vérifier si le compte auth existe
  SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = v_user_id) INTO v_auth_user_exists;
  RAISE NOTICE '2. Compte auth existe: %', v_auth_user_exists;
  
  -- 3. Compter les références dans notification_jobs
  RAISE NOTICE '3. Références dans notification_jobs: %', 
    (SELECT COUNT(*) FROM notification_jobs WHERE actor_id = v_user_id);
  
  -- 4. Compter les autres références importantes
  RAISE NOTICE '4. Références dans match_rsvps: %', 
    (SELECT COUNT(*) FROM match_rsvps WHERE user_id = v_user_id);
  RAISE NOTICE '5. Références dans group_members: %', 
    (SELECT COUNT(*) FROM group_members WHERE user_id = v_user_id);
  RAISE NOTICE '6. Références dans availabilities: %', 
    (SELECT COUNT(*) FROM availabilities WHERE user_id = v_user_id);
  
  -- 5. Essayer de supprimer les notification_jobs avec cet actor_id
  BEGIN
    DELETE FROM notification_jobs WHERE actor_id = v_user_id;
    RAISE NOTICE '✅ notification_jobs supprimés avec succès';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '❌ Erreur lors de la suppression de notification_jobs: %', SQLERRM;
  END;
  
  -- 6. Essayer de supprimer le profil
  BEGIN
    DELETE FROM profiles WHERE id = v_user_id;
    RAISE NOTICE '✅ Profil supprimé avec succès';
  EXCEPTION WHEN OTHERS THEN
    v_error_message := SQLERRM;
    RAISE WARNING '❌ ERREUR lors de la suppression du profil: %', v_error_message;
    RAISE WARNING '   Code erreur: %', SQLSTATE;
    
    -- Afficher plus de détails sur l'erreur
    IF v_error_message LIKE '%foreign key%' THEN
      RAISE WARNING '   → Problème de clé étrangère détecté';
    ELSIF v_error_message LIKE '%constraint%' THEN
      RAISE WARNING '   → Problème de contrainte détecté';
    ELSIF v_error_message LIKE '%trigger%' THEN
      RAISE WARNING '   → Problème de trigger détecté';
    ELSIF v_error_message LIKE '%policy%' OR v_error_message LIKE '%RLS%' THEN
      RAISE WARNING '   → Problème de politique RLS détecté';
    END IF;
  END;
  
  -- 7. Essayer de supprimer le compte auth (nécessite les permissions)
  IF v_auth_user_exists THEN
    BEGIN
      DELETE FROM auth.users WHERE id = v_user_id;
      RAISE NOTICE '✅ Compte auth supprimé avec succès';
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '❌ Erreur lors de la suppression du compte auth: %', SQLERRM;
      RAISE WARNING '   Note: La suppression de auth.users nécessite des permissions spéciales';
    END;
  END IF;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'DIAGNOSTIC TERMINÉ';
  RAISE NOTICE '========================================';
  
END $$;

-- ============================================================================
-- VÉRIFICATIONS SUPPLÉMENTAIRES
-- ============================================================================

-- A. Vérifier les triggers sur profiles
SELECT 
  'Triggers sur profiles' as check_type,
  tgname as trigger_name,
  CASE tgenabled
    WHEN 'O' THEN 'Activé'
    WHEN 'D' THEN 'Désactivé'
    ELSE 'Autre'
  END as status
FROM pg_trigger
WHERE tgrelid = 'profiles'::regclass
AND tgenabled != 'D';

-- B. Vérifier les contraintes CHECK sur profiles
SELECT 
  'Contraintes CHECK sur profiles' as check_type,
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'profiles'::regclass
AND contype = 'c';

-- C. Vérifier les politiques RLS sur profiles
SELECT 
  'Politiques RLS sur profiles' as check_type,
  policyname,
  cmd as command,
  CASE 
    WHEN qual IS NOT NULL THEN 'Avec condition WHERE'
    ELSE 'Sans condition'
  END as has_condition
FROM pg_policies
WHERE tablename = 'profiles';

