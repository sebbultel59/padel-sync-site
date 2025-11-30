-- Migration: Fonction RPC pour promouvoir un membre en admin de groupe
-- Date: 2025-11-23
-- Permet aux club_managers de promouvoir un membre en admin de groupe

CREATE OR REPLACE FUNCTION rpc_promote_group_admin(
  p_group_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_user_id UUID;
  v_current_user_role TEXT;
  v_current_user_club_id UUID;
  v_group_club_id UUID;
  v_is_member BOOLEAN;
BEGIN
  -- Récupérer l'ID de l'utilisateur actuel
  v_current_user_id := auth.uid();
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;
  
  -- Récupérer le rôle et club_id de l'utilisateur actuel
  SELECT p.role, p.club_id INTO v_current_user_role, v_current_user_club_id
  FROM profiles p
  WHERE p.id = v_current_user_id;
  
  -- Vérifier que le groupe existe et récupérer son club_id
  SELECT g.club_id INTO v_group_club_id
  FROM groups g
  WHERE g.id = p_group_id;
  
  IF v_group_club_id IS NULL THEN
    RAISE EXCEPTION 'Groupe non trouvé';
  END IF;
  
  -- Vérifier les permissions
  -- Un club_manager peut promouvoir uniquement dans les groupes de son club
  -- Un super_admin peut promouvoir dans tous les groupes
  IF v_current_user_role = 'club_manager' THEN
    IF v_current_user_club_id IS NULL OR v_current_user_club_id != v_group_club_id THEN
      RAISE EXCEPTION 'Vous ne pouvez promouvoir des admins que dans les groupes de votre club';
    END IF;
  ELSIF v_current_user_role != 'super_admin' THEN
    RAISE EXCEPTION 'Seuls les club_managers et super_admins peuvent promouvoir des admins de groupe';
  END IF;
  
  -- Vérifier que l'utilisateur à promouvoir est membre du groupe
  SELECT EXISTS(
    SELECT 1 FROM group_members gm
    WHERE gm.group_id = p_group_id
    AND gm.user_id = p_user_id
  ) INTO v_is_member;
  
  IF NOT v_is_member THEN
    RAISE EXCEPTION 'L''utilisateur n''est pas membre de ce groupe';
  END IF;
  
  -- Promouvoir l'utilisateur en admin (pas owner, car owner est réservé au créateur)
  UPDATE group_members
  SET role = 'admin'
  WHERE group_id = p_group_id
  AND user_id = p_user_id
  AND role = 'member'; -- On ne peut promouvoir que les membres, pas les admins existants
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'L''utilisateur est déjà admin ou owner de ce groupe';
  END IF;
  
  RETURN true;
END;
$$;

-- Donner les permissions d'exécution
GRANT EXECUTE ON FUNCTION rpc_promote_group_admin(UUID, UUID) TO authenticated;

-- Commentaire pour documentation
COMMENT ON FUNCTION rpc_promote_group_admin(UUID, UUID) IS 
  'Promouvoit un membre en admin de groupe. Les club_managers peuvent promouvoir dans les groupes de leur club. Les super_admins peuvent promouvoir dans tous les groupes.';






