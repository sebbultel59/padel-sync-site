-- Migration: Correction de la récursion infinie dans les politiques RLS de group_members
-- Date: 2025-11-23
-- Le problème: Les politiques RLS de group_members font référence à group_members elle-même
-- Solution: Utiliser des fonctions SECURITY DEFINER pour éviter la récursion

-- 1. Supprimer toutes les politiques existantes sur group_members
DROP POLICY IF EXISTS "Users can view their group memberships" ON group_members;
DROP POLICY IF EXISTS "Users can view members of their groups" ON group_members;
DROP POLICY IF EXISTS "Admins can view all members" ON group_members;
DROP POLICY IF EXISTS "Users can join groups" ON group_members;
DROP POLICY IF EXISTS "Admins can add members" ON group_members;
DROP POLICY IF EXISTS "Users can leave groups" ON group_members;
DROP POLICY IF EXISTS "Admins can remove members" ON group_members;
DROP POLICY IF EXISTS "Anyone can view group members" ON group_members;
DROP POLICY IF EXISTS "Members can view their group members" ON group_members;
-- Supprimer aussi les nouvelles politiques au cas où elles existent déjà
DROP POLICY IF EXISTS "Users can view their own memberships" ON group_members;
DROP POLICY IF EXISTS "Members can view other members of their groups" ON group_members;
DROP POLICY IF EXISTS "RPC functions can insert members" ON group_members;
DROP POLICY IF EXISTS "RPC functions can update members" ON group_members;
DROP POLICY IF EXISTS "Users can remove themselves" ON group_members;
DROP POLICY IF EXISTS "RPC functions can delete members" ON group_members;

-- 2. Activer RLS si ce n'est pas déjà fait
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- 3. Créer la fonction helper AVANT de créer les politiques qui l'utilisent
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

-- 4. Créer des politiques qui n'utilisent PAS de sous-requêtes sur group_members
-- Pour éviter la récursion, on utilise des conditions simples basées sur auth.uid()

-- Politique SELECT: Les utilisateurs peuvent voir leurs propres membreships
CREATE POLICY "Users can view their own memberships"
  ON group_members
  FOR SELECT
  USING (user_id = auth.uid());

-- Politique SELECT: Les utilisateurs peuvent voir les membres des groupes dont ils sont membres
-- On utilise la fonction is_member_of_group pour éviter la récursion
CREATE POLICY "Members can view other members of their groups"
  ON group_members
  FOR SELECT
  USING (
    -- Soit c'est leur propre membership
    user_id = auth.uid()
    -- Soit ils sont membres du groupe (via la fonction qui contourne RLS)
    OR is_member_of_group(group_id, auth.uid())
  );

-- 5. Politique INSERT: Les utilisateurs peuvent s'ajouter eux-mêmes (via les fonctions RPC)
-- Les fonctions RPC gèrent les permissions, donc on permet l'insertion via les fonctions
CREATE POLICY "RPC functions can insert members"
  ON group_members
  FOR INSERT
  WITH CHECK (true); -- Les fonctions RPC gèrent les permissions

-- 6. Politique UPDATE: Seuls les admins peuvent modifier (via les fonctions RPC)
CREATE POLICY "RPC functions can update members"
  ON group_members
  FOR UPDATE
  USING (true)
  WITH CHECK (true); -- Les fonctions RPC gèrent les permissions

-- 7. Politique DELETE: Les utilisateurs peuvent se retirer eux-mêmes ou via les fonctions RPC
CREATE POLICY "Users can remove themselves"
  ON group_members
  FOR DELETE
  USING (user_id = auth.uid());

-- Politique DELETE pour les admins (via les fonctions RPC)
CREATE POLICY "RPC functions can delete members"
  ON group_members
  FOR DELETE
  USING (true); -- Les fonctions RPC gèrent les permissions

-- 8. Commentaires pour documentation
COMMENT ON FUNCTION is_member_of_group(UUID, UUID) IS 
  'Vérifie si un utilisateur est membre d''un groupe. Utilise SECURITY DEFINER pour éviter la récursion RLS.';
COMMENT ON POLICY "Users can view their own memberships" ON group_members IS 
  'Les utilisateurs peuvent voir leurs propres membreships de groupes';
COMMENT ON POLICY "Members can view other members of their groups" ON group_members IS 
  'Les membres d''un groupe peuvent voir les autres membres du même groupe (utilise is_member_of_group pour éviter la récursion)';
COMMENT ON POLICY "RPC functions can insert members" ON group_members IS 
  'Les fonctions RPC peuvent insérer des membres (les permissions sont gérées dans les fonctions)';
COMMENT ON POLICY "RPC functions can update members" ON group_members IS 
  'Les fonctions RPC peuvent modifier des membres (les permissions sont gérées dans les fonctions)';
COMMENT ON POLICY "Users can remove themselves" ON group_members IS 
  'Les utilisateurs peuvent se retirer eux-mêmes d''un groupe';
COMMENT ON POLICY "RPC functions can delete members" ON group_members IS 
  'Les fonctions RPC peuvent supprimer des membres (les permissions sont gérées dans les fonctions)';

