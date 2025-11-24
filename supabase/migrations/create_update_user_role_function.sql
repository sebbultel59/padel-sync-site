-- Migration: Fonction RPC pour mettre à jour le rôle d'un utilisateur
-- Date: 2025-11-23
-- Permet aux super_admins de mettre à jour les rôles des utilisateurs

CREATE OR REPLACE FUNCTION rpc_update_user_role(
  p_user_id UUID,
  p_role TEXT,
  p_club_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_user_id UUID;
  v_current_user_role TEXT;
BEGIN
  -- Récupérer l'ID de l'utilisateur actuel
  v_current_user_id := auth.uid();
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;
  
  -- Vérifier que l'utilisateur actuel est super_admin
  SELECT role INTO v_current_user_role
  FROM profiles
  WHERE id = v_current_user_id;
  
  IF v_current_user_role != 'super_admin' THEN
    RAISE EXCEPTION 'Seuls les super admins peuvent modifier les rôles';
  END IF;
  
  -- Valider le rôle
  IF p_role NOT IN ('player', 'admin', 'club_manager', 'super_admin') THEN
    RAISE EXCEPTION 'Rôle invalide. Valeurs autorisées: player, admin, club_manager, super_admin';
  END IF;
  
  -- Valider que club_id est fourni si le rôle est club_manager
  IF p_role = 'club_manager' AND p_club_id IS NULL THEN
    -- Permettre club_id NULL pour club_manager (optionnel)
    -- Mais on peut aussi lever une exception si nécessaire
    -- RAISE EXCEPTION 'club_id est requis pour le rôle club_manager';
  END IF;
  
  -- Si le rôle n'est pas club_manager, mettre club_id à NULL
  IF p_role != 'club_manager' THEN
    UPDATE profiles
    SET 
      role = p_role,
      club_id = NULL
    WHERE id = p_user_id;
  ELSE
    -- Si c'est un club_manager, mettre à jour le rôle et le club_id
    UPDATE profiles
    SET 
      role = p_role,
      club_id = p_club_id
    WHERE id = p_user_id;
  END IF;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur non trouvé';
  END IF;
  
  RETURN true;
END;
$$;

COMMENT ON FUNCTION rpc_update_user_role(UUID, TEXT, UUID) IS 'Permet aux super_admins de mettre à jour le rôle et le club_id d''un utilisateur';

