-- Migration: Fonction RPC pour remplacer un joueur dans un match
-- Date: 2025-01-XX
-- Permet de remplacer un joueur dans un match en supprimant le RSVP de l'ancien joueur
-- et en créant un nouveau RSVP pour le remplaçant

CREATE OR REPLACE FUNCTION replace_match_player(
  p_match_id UUID,
  p_current_user_id UUID,
  p_new_user_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id UUID;
  v_group_id UUID;
  v_current_user_rsvp_exists BOOLEAN;
  v_new_user_rsvp_exists BOOLEAN;
BEGIN
  -- Récupérer l'ID de l'utilisateur actuel
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;
  
  -- Vérifier que l'utilisateur appelant est bien le joueur à remplacer
  IF v_caller_id != p_current_user_id THEN
    RAISE EXCEPTION 'Vous ne pouvez remplacer que votre propre participation';
  END IF;
  
  -- Récupérer le group_id du match
  SELECT group_id INTO v_group_id
  FROM matches
  WHERE id = p_match_id;
  
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Match non trouvé';
  END IF;
  
  -- Vérifier que le joueur actuel a bien un RSVP accepté sur ce match
  SELECT EXISTS(
    SELECT 1 FROM match_rsvps
    WHERE match_id = p_match_id
      AND user_id = p_current_user_id
      AND status = 'accepted'
  ) INTO v_current_user_rsvp_exists;
  
  IF NOT v_current_user_rsvp_exists THEN
    RAISE EXCEPTION 'Vous n''êtes pas un joueur confirmé sur ce match';
  END IF;
  
  -- Vérifier que le nouveau joueur n'a pas déjà un RSVP sur ce match
  SELECT EXISTS(
    SELECT 1 FROM match_rsvps
    WHERE match_id = p_match_id
      AND user_id = p_new_user_id
  ) INTO v_new_user_rsvp_exists;
  
  IF v_new_user_rsvp_exists THEN
    RAISE EXCEPTION 'Le remplaçant a déjà un RSVP sur ce match';
  END IF;
  
  -- Vérifier que le nouveau joueur est membre du groupe
  IF NOT EXISTS(
    SELECT 1 FROM group_members
    WHERE group_id = v_group_id
      AND user_id = p_new_user_id
  ) THEN
    RAISE EXCEPTION 'Le remplaçant n''est pas membre du groupe';
  END IF;
  
  -- Supprimer le RSVP de l'utilisateur actuel
  DELETE FROM match_rsvps
  WHERE match_id = p_match_id
    AND user_id = p_current_user_id;
  
  -- Créer un nouveau RSVP pour le remplaçant
  INSERT INTO match_rsvps (match_id, user_id, status)
  VALUES (p_match_id, p_new_user_id, 'accepted');
  
  -- Si aucune erreur n'a été levée, la fonction retourne void (succès)
END;
$$;

-- Donner les permissions d'exécution aux utilisateurs authentifiés
GRANT EXECUTE ON FUNCTION replace_match_player(UUID, UUID, UUID) TO authenticated;

