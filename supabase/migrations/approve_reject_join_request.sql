-- Migration: Fonctions pour approuver/rejeter les demandes de rejoindre un groupe
-- Date: 2025-01-09

-- Fonction RPC pour approuver une demande de rejoindre
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
  IF auth.uid() IS NULL THEN
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
  
  -- Vérifier que l'utilisateur est admin du groupe
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = v_request.group_id
    AND user_id = auth.uid()
    AND role IN ('admin', 'owner')
  ) THEN
    RAISE EXCEPTION 'Vous n''êtes pas administrateur de ce groupe';
  END IF;
  
  v_group_id := v_request.group_id;
  v_user_id := v_request.user_id;
  
  -- Ajouter l'utilisateur au groupe
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (v_group_id, v_user_id, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;
  
  -- Marquer la demande comme approuvée
  UPDATE group_join_requests
  SET status = 'approved',
      reviewed_at = NOW(),
      reviewed_by = auth.uid()
  WHERE id = p_request_id;
  
  RETURN v_group_id;
END;
$$;

-- Fonction RPC pour rejeter une demande de rejoindre
CREATE OR REPLACE FUNCTION reject_join_request(p_request_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request RECORD;
  v_group_id UUID;
BEGIN
  -- Récupérer l'ID de l'utilisateur actuel
  IF auth.uid() IS NULL THEN
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
  
  -- Vérifier que l'utilisateur est admin du groupe
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = v_request.group_id
    AND user_id = auth.uid()
    AND role IN ('admin', 'owner')
  ) THEN
    RAISE EXCEPTION 'Vous n''êtes pas administrateur de ce groupe';
  END IF;
  
  v_group_id := v_request.group_id;
  
  -- Marquer la demande comme rejetée
  UPDATE group_join_requests
  SET status = 'rejected',
      reviewed_at = NOW(),
      reviewed_by = auth.uid()
  WHERE id = p_request_id;
  
  RETURN v_group_id;
END;
$$;

