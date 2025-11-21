-- Migration: Mettre à jour la fonction RPC pour permettre la modification des localisations
-- Date: 2025-11-21
-- Ajoute les paramètres club_id et city à rpc_update_group

DROP FUNCTION IF EXISTS rpc_update_group(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS rpc_update_group(UUID, TEXT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS rpc_update_group(UUID, TEXT, TEXT, TEXT, UUID, TEXT);

CREATE OR REPLACE FUNCTION rpc_update_group(
  p_group_id UUID,
  p_name TEXT,
  p_visibility TEXT,
  p_join_policy TEXT,
  p_club_id UUID DEFAULT NULL,
  p_city TEXT DEFAULT NULL
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
  v_club_id UUID;
  v_city TEXT;
BEGIN
  -- Récupérer l'ID de l'utilisateur actuel
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;
  
  -- Normaliser les valeurs
  v_normalized_visibility := LOWER(TRIM(p_visibility));
  v_normalized_join_policy := LOWER(TRIM(p_join_policy));
  
  -- Traiter les paramètres de localisation
  IF p_club_id IS NOT NULL AND p_club_id::TEXT = '' THEN
    v_club_id := NULL;
  ELSE
    v_club_id := p_club_id;
  END IF;
  
  IF p_city IS NOT NULL AND TRIM(p_city) = '' THEN
    v_city := NULL;
  ELSE
    v_city := CASE WHEN p_city IS NOT NULL THEN TRIM(p_city) ELSE NULL END;
  END IF;
  
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
    -- Pour les groupes publics, la ville est obligatoire
    IF v_city IS NULL OR TRIM(v_city) = '' THEN
      RAISE EXCEPTION 'La ville est obligatoire pour les groupes publics';
    END IF;
  ELSE
    RAISE EXCEPTION 'visibility invalide. Valeurs autorisées: private, public';
  END IF;
  
  -- Vérifier que le club existe si club_id est fourni
  IF v_club_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM clubs WHERE clubs.id = v_club_id) THEN
      RAISE EXCEPTION 'Club non trouvé: %', v_club_id;
    END IF;
  END IF;
  
  -- Mettre à jour le groupe
  UPDATE groups
  SET 
    name = p_name,
    visibility = v_normalized_visibility,
    join_policy = v_normalized_join_policy,
    club_id = v_club_id,
    city = v_city
  WHERE id = p_group_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Erreur lors de la mise à jour du groupe';
  END IF;
  
  RETURN p_group_id;
END;
$$;

-- Donner les permissions d'exécution aux utilisateurs authentifiés
GRANT EXECUTE ON FUNCTION rpc_update_group(UUID, TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;

-- Commentaire pour documentation
COMMENT ON FUNCTION rpc_update_group IS 
  'Met à jour un groupe (nom, visibility, join_policy, club_id, city). Vérifie les permissions admin et normalise les valeurs. Pour les groupes publics, la ville est obligatoire.';

