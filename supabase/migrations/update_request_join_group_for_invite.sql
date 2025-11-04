-- Migration: Mise à jour de la fonction request_join_group pour accepter 'invite'
-- Date: 2025-01-09
-- Cette migration met à jour la fonction pour accepter les groupes public avec join_policy = 'invite'

-- Fonction RPC pour créer une demande de rejoindre (mise à jour)
CREATE OR REPLACE FUNCTION request_join_group(p_group_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_join_policy TEXT;
  v_visibility TEXT;
  v_request_id UUID;
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
    RAISE EXCEPTION 'Vous êtes déjà membre de ce groupe';
  END IF;
  
  -- Vérifier qu'il n'y a pas déjà une demande en attente
  IF EXISTS (SELECT 1 FROM group_join_requests WHERE group_id = p_group_id AND user_id = v_user_id AND status = 'pending') THEN
    RAISE EXCEPTION 'Vous avez déjà une demande en attente pour ce groupe';
  END IF;
  
  -- Vérifier que c'est un groupe public avec join_policy = 'request' ou 'invite'
  IF v_visibility != 'public' OR (v_join_policy != 'request' AND v_join_policy != 'invite') THEN
    RAISE EXCEPTION 'Ce groupe ne nécessite pas de demande';
  END IF;
  
  -- Créer la demande
  INSERT INTO group_join_requests (group_id, user_id, status)
  VALUES (p_group_id, v_user_id, 'pending')
  RETURNING id INTO v_request_id;
  
  RETURN v_request_id;
END;
$$;

