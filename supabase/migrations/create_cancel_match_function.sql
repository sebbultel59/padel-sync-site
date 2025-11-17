-- Migration: Fonction RPC pour annuler un match
-- Date: 2025-01-XX
-- Permet d'annuler un match en supprimant les RSVPs et le match lui-même

CREATE OR REPLACE FUNCTION cancel_match(p_match UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_match_created_by UUID;
  v_group_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  -- Récupérer l'ID de l'utilisateur actuel
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;
  
  -- Vérifier que le match existe et récupérer les informations nécessaires
  SELECT created_by, group_id
  INTO v_match_created_by, v_group_id
  FROM matches
  WHERE id = p_match;
  
  IF v_match_created_by IS NULL THEN
    RAISE EXCEPTION 'Match non trouvé';
  END IF;
  
  -- Vérifier que l'utilisateur est le créateur du match OU un admin du groupe
  IF v_match_created_by = v_user_id THEN
    -- L'utilisateur est le créateur, autorisé
    NULL;
  ELSIF v_group_id IS NOT NULL THEN
    -- Vérifier si l'utilisateur est admin du groupe
    SELECT EXISTS(
      SELECT 1 FROM group_members 
      WHERE group_id = v_group_id 
      AND user_id = v_user_id 
      AND role IN ('admin', 'owner')
    ) INTO v_is_admin;
    
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Vous n''avez pas les droits pour annuler ce match';
    END IF;
  ELSE
    RAISE EXCEPTION 'Vous n''avez pas les droits pour annuler ce match';
  END IF;
  
  -- Supprimer les RSVPs du match
  DELETE FROM match_rsvps WHERE match_id = p_match;
  
  -- Supprimer le match
  DELETE FROM matches WHERE id = p_match;
  
  -- Si aucune erreur n'a été levée, la fonction retourne void (succès)
END;
$$;

-- Donner les permissions d'exécution aux utilisateurs authentifiés
GRANT EXECUTE ON FUNCTION cancel_match(UUID) TO authenticated;

