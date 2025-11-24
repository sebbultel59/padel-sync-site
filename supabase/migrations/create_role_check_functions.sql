-- Migration: Fonctions de vérification de rôles
-- Date: 2025-11-23
-- Fonctions utilitaires pour vérifier les rôles des utilisateurs

-- Note: is_super_admin existe déjà et est utilisée par des politiques RLS
-- On utilise CREATE OR REPLACE avec le nom de paramètre existant (p_user) pour éviter de casser les dépendances

-- 1. Fonction pour vérifier si un utilisateur est super_admin
-- Utilise p_user au lieu de p_user_id pour compatibilité avec les politiques RLS existantes
CREATE OR REPLACE FUNCTION is_super_admin(p_user UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user
    AND role = 'super_admin'
  );
END;
$$;

-- 2. Fonction pour vérifier si un utilisateur est club_manager d'un club spécifique
-- Note: p_club_id doit être fourni, donc on met p_user_id en premier sans défaut, ou on inverse l'ordre
CREATE OR REPLACE FUNCTION is_club_manager(p_club_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id
    AND role = 'club_manager'
    AND club_id = p_club_id
  );
END;
$$;

-- 3. Fonction pour vérifier si un utilisateur est admin d'un groupe
CREATE OR REPLACE FUNCTION is_group_admin(p_group_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id
    AND user_id = p_user_id
    AND role IN ('admin', 'owner')
  );
END;
$$;

-- 4. Fonction pour vérifier si un utilisateur peut gérer un groupe
-- (admin du groupe OU club_manager du club du groupe OU super_admin)
CREATE OR REPLACE FUNCTION can_manage_group(p_group_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_group_club_id UUID;
BEGIN
  -- Super admin peut tout gérer
  IF is_super_admin(p_user_id) THEN
    RETURN true;
  END IF;
  
  -- Vérifier si l'utilisateur est admin du groupe
  IF is_group_admin(p_group_id, p_user_id) THEN
    RETURN true;
  END IF;
  
  -- Récupérer le club_id du groupe
  SELECT club_id INTO v_group_club_id
  FROM groups
  WHERE id = p_group_id;
  
  -- Si le groupe est rattaché à un club, vérifier si l'utilisateur est club_manager de ce club
  IF v_group_club_id IS NOT NULL THEN
    RETURN is_club_manager(v_group_club_id, p_user_id);
  END IF;
  
  RETURN false;
END;
$$;

-- 5. Commentaires pour documentation
COMMENT ON FUNCTION is_super_admin(UUID) IS 'Vérifie si un utilisateur est super_admin (utilise profiles.role au lieu de super_admins table). Signature: is_super_admin(p_user UUID DEFAULT auth.uid())';
COMMENT ON FUNCTION is_club_manager(UUID, UUID) IS 'Vérifie si un utilisateur est club_manager d''un club spécifique. Signature: is_club_manager(p_club_id UUID, p_user_id UUID DEFAULT auth.uid())';
COMMENT ON FUNCTION is_group_admin(UUID, UUID) IS 'Vérifie si un utilisateur est admin (owner ou admin) d''un groupe. Signature: is_group_admin(p_group_id UUID, p_user_id UUID DEFAULT auth.uid())';
COMMENT ON FUNCTION can_manage_group(UUID, UUID) IS 'Vérifie si un utilisateur peut gérer un groupe (admin du groupe, club_manager du club, ou super_admin). Signature: can_manage_group(p_group_id UUID, p_user_id UUID DEFAULT auth.uid())';

