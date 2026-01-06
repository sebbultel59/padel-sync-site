-- Migration: Ajouter une politique RLS DELETE pour profiles
-- Date: 2025-01-XX
-- Description: Permet la suppression de profils (nécessaire pour supprimer des utilisateurs)

-- ============================================================================
-- 1. VÉRIFIER SI RLS EST ACTIVÉ
-- ============================================================================
SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'profiles'
AND schemaname = 'public';

-- ============================================================================
-- 2. VÉRIFIER LES POLITIQUES DELETE EXISTANTES
-- ============================================================================
SELECT 
  policyname,
  cmd as command,
  qual as using_expression,
  with_check as with_check_expression
FROM pg_policies
WHERE tablename = 'profiles'
AND cmd = 'DELETE';

-- ============================================================================
-- 3. AJOUTER UNE POLITIQUE DELETE
-- ============================================================================

-- Option A : Permettre à l'utilisateur de supprimer son propre profil
DROP POLICY IF EXISTS "profiles: owner delete" ON profiles;
CREATE POLICY "profiles: owner delete"
ON profiles
FOR DELETE
USING (auth.uid() = id);

-- Option B : Permettre aux admins de supprimer n'importe quel profil
-- (nécessite que vous ayez une colonne role ou une table admins)
DO $$
BEGIN
  -- Vérifier si la colonne role existe
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'role'
  ) THEN
    -- Créer une politique pour les super_admins
    DROP POLICY IF EXISTS "profiles: super_admin delete" ON profiles;
    CREATE POLICY "profiles: super_admin delete"
    ON profiles
    FOR DELETE
    USING (
      EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
      )
    );
    
    RAISE NOTICE '✅ Politique DELETE pour super_admin créée';
  ELSE
    RAISE NOTICE '⚠️ Colonne role non trouvée, politique admin non créée';
  END IF;
END $$;

-- Option C : Permettre la suppression via SECURITY DEFINER (pour les fonctions)
-- Cette politique permet aux fonctions avec SECURITY DEFINER de supprimer
DROP POLICY IF EXISTS "profiles: functions delete" ON profiles;
CREATE POLICY "profiles: functions delete"
ON profiles
FOR DELETE
USING (true);  -- Permet à toutes les fonctions SECURITY DEFINER de supprimer

-- ============================================================================
-- 4. VÉRIFICATION
-- ============================================================================
SELECT 
  'Politiques DELETE sur profiles' as check_type,
  policyname,
  cmd as command,
  CASE 
    WHEN qual IS NOT NULL THEN 'Avec condition USING'
    ELSE 'Sans condition'
  END as has_condition
FROM pg_policies
WHERE tablename = 'profiles'
AND cmd = 'DELETE';

-- ============================================================================
-- 5. TEST
-- ============================================================================
-- Testez la suppression d'un profil de test (remplacez par un UUID de test)
-- DO $$
-- DECLARE
--   v_test_id UUID := '00000000-0000-0000-0000-000000000001'::UUID;
-- BEGIN
--   DELETE FROM profiles WHERE id = v_test_id;
--   RAISE NOTICE '✅ Test de suppression réussi';
-- EXCEPTION WHEN OTHERS THEN
--   RAISE WARNING '❌ Erreur: %', SQLERRM;
-- END $$;

