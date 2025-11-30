-- Migration: Vérification et correction finale des permissions pour groups
-- Date: 2025-11-23
-- S'assure que les politiques RLS permettent bien la création de groupes via les fonctions RPC

-- 1. Vérifier que RLS est activé
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

-- 2. Supprimer toutes les politiques INSERT existantes et les recréer
DROP POLICY IF EXISTS "RPC functions can create groups" ON groups;
DROP POLICY IF EXISTS "Anyone can create groups" ON groups;
DROP POLICY IF EXISTS "Authenticated users can create groups" ON groups;
DROP POLICY IF EXISTS "Users can create groups" ON groups;

-- 3. Créer une politique INSERT permissive pour les fonctions RPC
-- Les fonctions SECURITY DEFINER contournent RLS, mais on crée quand même une politique
-- pour être sûr que tout fonctionne correctement
CREATE POLICY "RPC functions can create groups"
  ON groups
  FOR INSERT
  WITH CHECK (true);

-- 4. Vérifier que la fonction rpc_create_group existe et a les bonnes permissions
DO $$
BEGIN
  -- Vérifier que la fonction existe
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'rpc_create_group'
  ) THEN
    RAISE EXCEPTION 'La fonction rpc_create_group n''existe pas. Exécutez d''abord fix_rpc_create_group_ambiguous_club_id.sql';
  END IF;
END $$;

-- 5. S'assurer que la fonction a les permissions d'exécution
GRANT EXECUTE ON FUNCTION rpc_create_group(TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_create_group(TEXT, TEXT, TEXT, UUID, TEXT) TO anon;

-- 6. Vérifier que la fonction utilise SECURITY DEFINER
DO $$
DECLARE
  v_security_type TEXT;
BEGIN
  SELECT prosecdef::TEXT INTO v_security_type
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
  AND p.proname = 'rpc_create_group'
  AND p.pronargs = 5; -- 5 paramètres
  
  IF v_security_type != 't' THEN
    RAISE WARNING 'La fonction rpc_create_group n''utilise pas SECURITY DEFINER. Cela peut causer des problèmes de permissions.';
  END IF;
END $$;

-- 7. Commentaires pour documentation
COMMENT ON POLICY "RPC functions can create groups" ON groups IS 
  'Permet aux fonctions RPC (SECURITY DEFINER) de créer des groupes. Les permissions réelles sont gérées dans les fonctions RPC.';






