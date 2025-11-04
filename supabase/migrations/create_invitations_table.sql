-- Migration: Création de la table invitations
-- Date: 2025-11-04

CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  used BOOLEAN DEFAULT false,
  used_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Index pour rechercher rapidement par code
CREATE INDEX IF NOT EXISTS idx_invitations_code ON invitations(code);
CREATE INDEX IF NOT EXISTS idx_invitations_group_id ON invitations(group_id);
CREATE INDEX IF NOT EXISTS idx_invitations_created_by ON invitations(created_by);
CREATE INDEX IF NOT EXISTS idx_invitations_used ON invitations(used) WHERE used = false;

-- Commentaires pour documentation
COMMENT ON TABLE invitations IS 'Codes d''invitation pour rejoindre des groupes';
COMMENT ON COLUMN invitations.code IS 'Code d''invitation unique (ex: ABC123)';
COMMENT ON COLUMN invitations.group_id IS 'Groupe auquel ce code donne accès';
COMMENT ON COLUMN invitations.created_by IS 'Utilisateur qui a créé le code';
COMMENT ON COLUMN invitations.used IS 'Indique si le code a été utilisé';
COMMENT ON COLUMN invitations.used_by IS 'Utilisateur qui a utilisé le code';
COMMENT ON COLUMN invitations.expires_at IS 'Date d''expiration du code (optionnel)';

-- RLS (Row Level Security)
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Supprimer les politiques existantes si elles existent
DROP POLICY IF EXISTS "Users can view invitations for their groups or unused codes" ON invitations;
DROP POLICY IF EXISTS "Users can view invitations for their groups" ON invitations;
DROP POLICY IF EXISTS "Users can create invitations for their groups" ON invitations;
DROP POLICY IF EXISTS "Users can use unused invitation codes" ON invitations;

-- Politique : Les utilisateurs peuvent voir les invitations pour leurs groupes ou utiliser n'importe quel code non utilisé
CREATE POLICY "Users can view invitations for their groups or unused codes"
  ON invitations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = invitations.group_id
      AND gm.user_id = auth.uid()
    )
    OR used = false  -- Permettre de voir les codes non utilisés pour les utiliser
  );

-- Politique : Les utilisateurs peuvent créer des invitations pour leurs groupes (membres, admins et owners)
CREATE POLICY "Users can create invitations for their groups"
  ON invitations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = invitations.group_id
      AND gm.user_id = auth.uid()
    )
    AND created_by = auth.uid()
  );

-- Politique : Les utilisateurs peuvent utiliser n'importe quel code non utilisé
CREATE POLICY "Users can use unused invitation codes"
  ON invitations
  FOR UPDATE
  USING (used = false)
  WITH CHECK (
    used = true
    AND used_by = auth.uid()
  );

-- Fonction RPC pour accepter une invitation par code
CREATE OR REPLACE FUNCTION accept_invite(p_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_invitation RECORD;
  v_group_id UUID;
BEGIN
  -- Récupérer l'ID de l'utilisateur actuel
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;
  
  -- Chercher l'invitation par code
  SELECT id, group_id, used, expires_at
  INTO v_invitation
  FROM invitations
  WHERE code = UPPER(TRIM(p_code))
  LIMIT 1;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Code d''invitation invalide';
  END IF;
  
  -- Vérifier si le code a déjà été utilisé
  IF v_invitation.used THEN
    RAISE EXCEPTION 'Ce code d''invitation a déjà été utilisé';
  END IF;
  
  -- Vérifier si le code a expiré
  IF v_invitation.expires_at IS NOT NULL AND v_invitation.expires_at < NOW() THEN
    RAISE EXCEPTION 'Ce code d''invitation a expiré';
  END IF;
  
  v_group_id := v_invitation.group_id;
  
  -- Vérifier que l'utilisateur n'est pas déjà membre
  IF EXISTS (SELECT 1 FROM group_members WHERE group_id = v_group_id AND user_id = v_user_id) THEN
    -- Déjà membre, marquer le code comme utilisé et retourner le group_id
    UPDATE invitations
    SET used = true, used_by = v_user_id, used_at = NOW()
    WHERE id = v_invitation.id;
    RETURN v_group_id;
  END IF;
  
  -- Ajouter l'utilisateur au groupe
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (v_group_id, v_user_id, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;
  
  -- Marquer le code comme utilisé
  UPDATE invitations
  SET used = true, used_by = v_user_id, used_at = NOW()
  WHERE id = v_invitation.id;
  
  RETURN v_group_id;
END;
$$;

