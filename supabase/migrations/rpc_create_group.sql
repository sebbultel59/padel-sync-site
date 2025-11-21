-- Migration: Fonction RPC pour créer un groupe
-- Date: 2025-01-XX
-- Permet de créer un groupe avec localisation (club ou ville)

-- Supprimer toutes les versions existantes de la fonction pour éviter les conflits
DROP FUNCTION IF EXISTS rpc_create_group(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS rpc_create_group(TEXT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS rpc_create_group(TEXT, TEXT, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS rpc_create_group(TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION rpc_create_group(
  p_name TEXT,
  p_visibility TEXT,
  p_join_policy TEXT,
  p_club_id UUID DEFAULT NULL,
  p_city TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  visibility TEXT,
  join_policy TEXT,
  club_id UUID,
  city TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_group_id UUID;
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
  
  -- Vérifier que le club existe si club_id est fourni
  IF p_club_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM clubs WHERE clubs.id = p_club_id) THEN
      RAISE EXCEPTION 'Club non trouvé';
    END IF;
  END IF;
  
  -- Créer le groupe
  v_group_id := gen_random_uuid();
  INSERT INTO groups (
    id,
    name,
    visibility,
    join_policy,
    club_id,
    city,
    created_at
  )
  VALUES (
    v_group_id,
    TRIM(p_name),
    v_normalized_visibility,
    v_normalized_join_policy,
    p_club_id,
    CASE WHEN p_city IS NOT NULL THEN TRIM(p_city) ELSE NULL END,
    NOW()
  );
  
  -- Ajouter le créateur comme admin du groupe
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (v_group_id, v_user_id, 'owner')
  ON CONFLICT (group_id, user_id) DO NOTHING;
  
  -- Retourner le groupe créé
  RETURN QUERY
  SELECT 
    g.id AS id,
    g.name AS name,
    g.visibility AS visibility,
    g.join_policy AS join_policy,
    g.club_id AS club_id,
    g.city AS city,
    g.created_at AS created_at
  FROM groups g
  WHERE g.id = v_group_id;
END;
$$;

-- Donner les permissions d'exécution aux utilisateurs authentifiés
GRANT EXECUTE ON FUNCTION rpc_create_group(TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;

-- Commentaire pour documentation
COMMENT ON FUNCTION rpc_create_group IS 
  'Crée un groupe avec nom, visibility, join_policy, et optionnellement un club_id ou une city. Ajoute le créateur comme owner.';

