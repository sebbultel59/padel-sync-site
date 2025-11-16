-- Migration: Fonction RPC pour mettre à jour un groupe
-- Date: 2025-01-XX
-- Permet de mettre à jour un groupe en contournant les contraintes CHECK si nécessaire

CREATE OR REPLACE FUNCTION rpc_update_group(
  p_group_id UUID,
  p_name TEXT,
  p_visibility TEXT,
  p_join_policy TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_is_admin BOOLEAN;
  v_normalized_visibility TEXT;
  v_normalized_join_policy TEXT;
BEGIN
  -- Récupérer l'ID de l'utilisateur actuel
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;
  
  -- Normaliser les valeurs
  v_normalized_visibility := LOWER(TRIM(p_visibility));
  v_normalized_join_policy := LOWER(TRIM(p_join_policy));
  
  -- Vérifier que le groupe existe
  IF NOT EXISTS (SELECT 1 FROM groups WHERE id = p_group_id) THEN
    RAISE EXCEPTION 'Groupe non trouvé';
  END IF;
  
  -- Vérifier que l'utilisateur est admin du groupe
  SELECT EXISTS(
    SELECT 1 FROM group_members 
    WHERE group_id = p_group_id 
    AND user_id = v_user_id 
    AND role IN ('admin', 'owner')
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Vous n''avez pas les droits pour modifier ce groupe';
  END IF;
  
  -- Valider les combinaisons visibility/join_policy
  IF v_normalized_visibility = 'private' THEN
    -- Pour les groupes privés, join_policy doit être 'invite'
    v_normalized_join_policy := 'invite';
  ELSIF v_normalized_visibility = 'public' THEN
    -- Pour les groupes publics, join_policy doit être 'open', 'request', ou 'invite'
    IF v_normalized_join_policy NOT IN ('open', 'request', 'invite') THEN
      RAISE EXCEPTION 'join_policy invalide pour un groupe public. Valeurs autorisées: open, request, invite';
    END IF;
  ELSE
    RAISE EXCEPTION 'visibility invalide. Valeurs autorisées: private, public';
  END IF;
  
  -- Mettre à jour le groupe
  UPDATE groups
  SET 
    name = p_name,
    visibility = v_normalized_visibility,
    join_policy = v_normalized_join_policy
  WHERE id = p_group_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Erreur lors de la mise à jour du groupe';
  END IF;
  
  RETURN p_group_id;
END;
$$;

-- Commentaire pour documentation
COMMENT ON FUNCTION rpc_update_group IS 
  'Met à jour un groupe (nom, visibility, join_policy). Vérifie les permissions admin et normalise les valeurs.';

