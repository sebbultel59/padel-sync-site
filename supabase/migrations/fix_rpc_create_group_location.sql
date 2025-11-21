-- Migration: Corriger la fonction RPC pour garantir l'enregistrement des localisations
-- Date: 2025-11-21
-- Assure que club_id et city sont bien enregistrés même si NULL

-- Supprimer toutes les versions existantes de la fonction
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
  -- Convertir les chaînes vides en NULL
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
  
  -- Créer le groupe avec les valeurs de localisation
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
    v_club_id,  -- Utiliser la variable traitée
    v_city,     -- Utiliser la variable traitée
    NOW()
  );
  
  -- Ajouter le créateur comme admin du groupe
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (v_group_id, v_user_id, 'owner')
  ON CONFLICT (group_id, user_id) DO NOTHING;
  
  -- Retourner le groupe créé avec toutes les données
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
  'Crée un groupe avec nom, visibility, join_policy, et optionnellement un club_id ou une city. Garantit l''enregistrement des valeurs de localisation même si NULL.';

