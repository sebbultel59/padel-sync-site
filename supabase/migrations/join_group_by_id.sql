-- Migration: Fonction pour rejoindre un groupe directement par group_id
-- Utile pour les invitations par lien avec group_id

CREATE OR REPLACE FUNCTION join_group_by_id(p_group_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_join_policy TEXT;
  v_visibility TEXT;
BEGIN
  -- Récupérer l'ID de l'utilisateur actuel
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;
  
  -- Vérifier que le groupe existe
  SELECT visibility, join_policy INTO v_visibility, v_join_policy
  FROM groups
  WHERE id = p_group_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Groupe non trouvé';
  END IF;
  
  -- Vérifier que l'utilisateur n'est pas déjà membre
  IF EXISTS (SELECT 1 FROM group_members WHERE group_id = p_group_id AND user_id = v_user_id) THEN
    -- Déjà membre, retourner le group_id sans erreur
    RETURN p_group_id;
  END IF;
  
  -- Pour les groupes publics avec join_policy = 'open', permettre l'ajout
  IF v_visibility = 'public' AND v_join_policy = 'open' THEN
    INSERT INTO group_members (group_id, user_id, role)
    VALUES (p_group_id, v_user_id, 'member')
    ON CONFLICT (group_id, user_id) DO NOTHING;
    RETURN p_group_id;
  END IF;
  
  -- Pour les groupes privés avec join_policy = 'invite', permettre l'ajout
  -- car le lien a été partagé par un admin/membre du groupe
  IF v_visibility = 'private' AND v_join_policy = 'invite' THEN
    INSERT INTO group_members (group_id, user_id, role)
    VALUES (p_group_id, v_user_id, 'member')
    ON CONFLICT (group_id, user_id) DO NOTHING;
    RETURN p_group_id;
  END IF;
  
  -- Pour les autres cas (public/request, etc.), ne pas permettre
  RAISE EXCEPTION 'Ce groupe nécessite une invitation valide';
END;
$$;
