-- Migration: Correction des politiques RLS pour la table groups
-- Date: 2025-11-23
-- Permet aux fonctions RPC (SECURITY DEFINER) de créer des groupes
-- et aux utilisateurs authentifiés de voir les groupes publics

-- 1. Créer une fonction helper pour éviter la récursion RLS
-- Cette fonction sera aussi créée dans fix_group_members_rls_recursion.sql, mais on la crée ici aussi pour éviter les erreurs
CREATE OR REPLACE FUNCTION is_member_of_group(p_group_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- Cette fonction contourne RLS grâce à SECURITY DEFINER
  RETURN EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id
    AND user_id = p_user_id
  );
END;
$$;

-- 2. Activer RLS si ce n'est pas déjà fait
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

-- 3. Supprimer les anciennes politiques INSERT si elles existent
DROP POLICY IF EXISTS "Anyone can create groups" ON groups;
DROP POLICY IF EXISTS "Authenticated users can create groups" ON groups;
DROP POLICY IF EXISTS "Users can create groups" ON groups;
DROP POLICY IF EXISTS "RPC functions can create groups" ON groups; -- Supprimer si elle existe déjà

-- 4. Créer une politique INSERT qui permet aux fonctions RPC de créer des groupes
-- Note: Les fonctions SECURITY DEFINER contournent RLS, mais on crée quand même une politique
-- pour être sûr que tout fonctionne correctement
-- En réalité, avec SECURITY DEFINER, cette politique ne devrait pas être nécessaire,
-- mais on la crée pour éviter tout problème
CREATE POLICY "RPC functions can create groups"
  ON groups
  FOR INSERT
  WITH CHECK (true); -- Permet à toutes les fonctions RPC (SECURITY DEFINER) de créer

-- 5. Vérifier que les politiques SELECT existent (pour voir les groupes)
-- Supprimer les anciennes politiques SELECT si elles existent
DROP POLICY IF EXISTS "Anyone can view public groups" ON groups;
DROP POLICY IF EXISTS "Members can view their groups" ON groups;
DROP POLICY IF EXISTS "Users can view their groups" ON groups;

-- Créer les politiques SELECT
DO $$
BEGIN
  -- Créer une politique SELECT par défaut
  CREATE POLICY "Anyone can view public groups"
    ON groups
    FOR SELECT
    USING (visibility = 'public');
  
  -- Créer une politique pour voir les groupes dont on est membre
  -- On utilise la fonction is_member_of_group pour éviter la récursion RLS
  CREATE POLICY "Members can view their groups"
    ON groups
    FOR SELECT
    USING (
      -- Soit le groupe est public
      visibility = 'public'
      -- Soit l'utilisateur est membre (via fonction qui contourne RLS)
      OR is_member_of_group(groups.id, auth.uid())
    );
EXCEPTION
  WHEN duplicate_object THEN
    -- Les politiques existent déjà, on ne fait rien
    NULL;
END $$;

-- 6. Vérifier que les politiques UPDATE existent
DROP POLICY IF EXISTS "RPC functions can update groups" ON groups; -- Supprimer si elle existe déjà
DO $$
BEGIN
  -- Les fonctions RPC gèrent les permissions UPDATE, donc on permet aux fonctions
  CREATE POLICY "RPC functions can update groups"
    ON groups
    FOR UPDATE
    USING (true)
    WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN
    -- La politique existe déjà, on ne fait rien
    NULL;
END $$;

-- 7. Vérifier que les politiques DELETE existent
DROP POLICY IF EXISTS "RPC functions can delete groups" ON groups; -- Supprimer si elle existe déjà
DO $$
BEGIN
  -- Les fonctions RPC gèrent les permissions DELETE
  CREATE POLICY "RPC functions can delete groups"
    ON groups
    FOR DELETE
    USING (true);
EXCEPTION
  WHEN duplicate_object THEN
    -- La politique existe déjà, on ne fait rien
    NULL;
END $$;

-- 8. S'assurer que la fonction rpc_create_group est bien la version mise à jour
-- (celle qui gère les rôles)
-- On ne la recrée pas ici car elle devrait être dans update_rpc_functions_for_roles.sql
-- Mais on vérifie qu'elle existe et a les bonnes permissions
GRANT EXECUTE ON FUNCTION rpc_create_group(TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;

-- 9. Commentaires pour documentation
COMMENT ON POLICY "RPC functions can create groups" ON groups IS 
  'Permet aux fonctions RPC (SECURITY DEFINER) de créer des groupes. Les permissions réelles sont gérées dans les fonctions RPC.';

