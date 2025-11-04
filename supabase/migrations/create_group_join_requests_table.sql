-- Migration: Création de la table group_join_requests
-- Date: 2025-01-09
-- Permet de gérer les demandes de rejoindre des groupes publics "sur demande"

CREATE TABLE IF NOT EXISTS group_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE(group_id, user_id)
);

-- Index pour rechercher rapidement par groupe et statut
CREATE INDEX IF NOT EXISTS idx_group_join_requests_group_id ON group_join_requests(group_id);
CREATE INDEX IF NOT EXISTS idx_group_join_requests_user_id ON group_join_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_group_join_requests_status ON group_join_requests(status) WHERE status = 'pending';

-- Commentaires pour documentation
COMMENT ON TABLE group_join_requests IS 'Demandes de rejoindre des groupes publics "sur demande"';
COMMENT ON COLUMN group_join_requests.group_id IS 'Groupe pour lequel la demande est faite';
COMMENT ON COLUMN group_join_requests.user_id IS 'Utilisateur qui fait la demande';
COMMENT ON COLUMN group_join_requests.status IS 'Statut de la demande: pending, approved, rejected';
COMMENT ON COLUMN group_join_requests.requested_at IS 'Date de la demande';
COMMENT ON COLUMN group_join_requests.reviewed_at IS 'Date de la validation/rejet';
COMMENT ON COLUMN group_join_requests.reviewed_by IS 'Admin qui a validé/rejeté la demande';

-- RLS (Row Level Security)
ALTER TABLE group_join_requests ENABLE ROW LEVEL SECURITY;

-- Supprimer les politiques existantes si elles existent
DROP POLICY IF EXISTS "Users can view their own requests" ON group_join_requests;
DROP POLICY IF EXISTS "Admins can view requests for their groups" ON group_join_requests;
DROP POLICY IF EXISTS "Users can create join requests" ON group_join_requests;
DROP POLICY IF EXISTS "Admins can approve or reject requests" ON group_join_requests;

-- Politique : Les utilisateurs peuvent voir leurs propres demandes
CREATE POLICY "Users can view their own requests"
  ON group_join_requests
  FOR SELECT
  USING (user_id = auth.uid());

-- Politique : Les admins peuvent voir les demandes pour leurs groupes
CREATE POLICY "Admins can view requests for their groups"
  ON group_join_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_join_requests.group_id
      AND gm.user_id = auth.uid()
      AND gm.role IN ('admin', 'owner')
    )
  );

-- Politique : Les utilisateurs peuvent créer des demandes de rejoindre
CREATE POLICY "Users can create join requests"
  ON group_join_requests
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = group_join_requests.group_id
      AND user_id = auth.uid()
    )
  );

-- Politique : Les admins peuvent approuver ou rejeter les demandes
CREATE POLICY "Admins can approve or reject requests"
  ON group_join_requests
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_join_requests.group_id
      AND gm.user_id = auth.uid()
      AND gm.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    reviewed_by = auth.uid()
    AND reviewed_at IS NOT NULL
  );

-- Fonction RPC pour créer une demande de rejoindre
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

