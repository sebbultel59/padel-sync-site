-- Migration: Mise à jour des fonctions RPC pour utiliser le nouveau système de rôles
-- Date: 2025-11-23
-- Met à jour rpc_create_group, rpc_update_group, approve_join_request, reject_join_request, cancel_match

-- Supprimer les versions existantes de rpc_create_group pour éviter les conflits
DROP FUNCTION IF EXISTS rpc_create_group(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS rpc_create_group(TEXT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS rpc_create_group(TEXT, TEXT, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS rpc_create_group(TEXT, TEXT, TEXT, TEXT);

-- 1. Mettre à jour rpc_create_group pour permettre aux club_managers de créer des groupes avec club_id
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
  v_user_role TEXT;
  v_user_club_id UUID;
  v_group_id UUID;
  v_normalized_visibility TEXT;
  v_normalized_join_policy TEXT;
  v_final_club_id UUID;
BEGIN
  -- Récupérer l'ID de l'utilisateur actuel
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;
  
  -- Récupérer le rôle et club_id de l'utilisateur
  SELECT role, club_id INTO v_user_role, v_user_club_id
  FROM profiles
  WHERE id = v_user_id;
  
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
    
    -- Vérifier les permissions pour créer des groupes publics
    IF v_normalized_join_policy = 'open' THEN
      -- Public ouvert : uniquement super_admin
      IF v_user_role != 'super_admin' THEN
        RAISE EXCEPTION 'Seuls les super admins peuvent créer un groupe public ouvert';
      END IF;
    ELSIF v_normalized_join_policy = 'request' THEN
      -- Public sur demande : super_admin, admin ou club_manager
      IF v_user_role NOT IN ('super_admin', 'admin', 'club_manager') THEN
        RAISE EXCEPTION 'Seuls les admins, super admins et club managers peuvent créer un groupe public sur demande';
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'visibility invalide. Valeurs autorisées: private, public';
  END IF;
  
  -- Gérer le club_id
  IF p_club_id IS NOT NULL THEN
    -- Vérifier que le club existe
    IF NOT EXISTS (SELECT 1 FROM clubs WHERE clubs.id = p_club_id) THEN
      RAISE EXCEPTION 'Club non trouvé';
    END IF;
    
    -- Vérifier les permissions pour associer un club
    IF v_user_role = 'club_manager' THEN
      -- Un club_manager ne peut créer un groupe que pour son propre club
      IF v_user_club_id != p_club_id THEN
        RAISE EXCEPTION 'Vous ne pouvez créer un groupe que pour votre propre club';
      END IF;
      v_final_club_id := p_club_id;
    ELSIF v_user_role = 'super_admin' THEN
      -- Super admin peut associer n'importe quel club
      v_final_club_id := p_club_id;
    ELSE
      -- Les autres rôles ne peuvent pas associer de club
      RAISE EXCEPTION 'Vous n''avez pas les droits pour créer un groupe associé à un club';
    END IF;
  ELSE
    v_final_club_id := NULL;
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
    v_final_club_id,
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

-- 2. Mettre à jour rpc_update_group pour utiliser can_manage_group
-- Supprimer toutes les versions existantes pour éviter les conflits
DROP FUNCTION IF EXISTS rpc_update_group(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS rpc_update_group(UUID, TEXT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS rpc_update_group(UUID, TEXT, TEXT, TEXT, UUID, TEXT);

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
  
  -- Vérifier que l'utilisateur peut gérer le groupe (utilise can_manage_group)
  IF NOT can_manage_group(p_group_id, v_user_id) THEN
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

-- 3. Mettre à jour approve_join_request pour utiliser can_manage_group
CREATE OR REPLACE FUNCTION approve_join_request(p_request_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request RECORD;
  v_group_id UUID;
  v_user_id UUID;
BEGIN
  -- Récupérer l'ID de l'utilisateur actuel
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;
  
  -- Récupérer la demande
  SELECT id, group_id, user_id, status
  INTO v_request
  FROM group_join_requests
  WHERE id = p_request_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande non trouvée';
  END IF;
  
  -- Vérifier que la demande est en attente
  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'Cette demande a déjà été traitée';
  END IF;
  
  -- Vérifier que l'utilisateur peut gérer le groupe (utilise can_manage_group)
  IF NOT can_manage_group(v_request.group_id, v_user_id) THEN
    RAISE EXCEPTION 'Vous n''êtes pas autorisé à approuver les demandes pour ce groupe';
  END IF;
  
  v_group_id := v_request.group_id;
  
  -- Ajouter l'utilisateur au groupe
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (v_group_id, v_request.user_id, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;
  
  -- Marquer la demande comme approuvée
  UPDATE group_join_requests
  SET status = 'approved',
      reviewed_at = NOW(),
      reviewed_by = v_user_id
  WHERE id = p_request_id;
  
  RETURN v_group_id;
END;
$$;

-- 4. Mettre à jour reject_join_request pour utiliser can_manage_group
CREATE OR REPLACE FUNCTION reject_join_request(p_request_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request RECORD;
  v_group_id UUID;
  v_user_id UUID;
BEGIN
  -- Récupérer l'ID de l'utilisateur actuel
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;
  
  -- Récupérer la demande
  SELECT id, group_id, status
  INTO v_request
  FROM group_join_requests
  WHERE id = p_request_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande non trouvée';
  END IF;
  
  -- Vérifier que la demande est en attente
  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'Cette demande a déjà été traitée';
  END IF;
  
  -- Vérifier que l'utilisateur peut gérer le groupe (utilise can_manage_group)
  IF NOT can_manage_group(v_request.group_id, v_user_id) THEN
    RAISE EXCEPTION 'Vous n''êtes pas autorisé à rejeter les demandes pour ce groupe';
  END IF;
  
  v_group_id := v_request.group_id;
  
  -- Marquer la demande comme rejetée
  UPDATE group_join_requests
  SET status = 'rejected',
      reviewed_at = NOW(),
      reviewed_by = v_user_id
  WHERE id = p_request_id;
  
  RETURN v_group_id;
END;
$$;

-- 5. Mettre à jour cancel_match pour utiliser can_manage_group
CREATE OR REPLACE FUNCTION cancel_match(p_match UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_match_created_by UUID;
  v_group_id UUID;
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
  
  -- Vérifier que l'utilisateur est le créateur du match OU peut gérer le groupe
  IF v_match_created_by = v_user_id THEN
    -- L'utilisateur est le créateur, autorisé
    NULL;
  ELSIF v_group_id IS NOT NULL THEN
    -- Vérifier si l'utilisateur peut gérer le groupe (utilise can_manage_group)
    IF NOT can_manage_group(v_group_id, v_user_id) THEN
      RAISE EXCEPTION 'Vous n''avez pas les droits pour annuler ce match';
    END IF;
  ELSE
    RAISE EXCEPTION 'Vous n''avez pas les droits pour annuler ce match';
  END IF;
  
  -- Supprimer les RSVPs du match
  DELETE FROM match_rsvps WHERE match_id = p_match;
  
  -- Supprimer le match
  DELETE FROM matches WHERE id = p_match;
END;
$$;

-- Commentaires pour documentation
COMMENT ON FUNCTION rpc_create_group IS 
  'Crée un groupe avec nom, visibility, join_policy, et optionnellement un club_id ou une city. Utilise le nouveau système de rôles. Les club_managers peuvent créer des groupes pour leur club.';
COMMENT ON FUNCTION rpc_update_group IS 
  'Met à jour un groupe (nom, visibility, join_policy). Utilise can_manage_group pour vérifier les permissions.';
COMMENT ON FUNCTION approve_join_request IS 
  'Approuve une demande de rejoindre un groupe. Utilise can_manage_group pour vérifier les permissions.';
COMMENT ON FUNCTION reject_join_request IS 
  'Rejette une demande de rejoindre un groupe. Utilise can_manage_group pour vérifier les permissions.';
COMMENT ON FUNCTION cancel_match IS 
  'Annule un match. Le créateur ou un gestionnaire du groupe peut annuler. Utilise can_manage_group pour vérifier les permissions.';

