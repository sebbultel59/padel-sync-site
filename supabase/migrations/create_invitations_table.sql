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

-- Politique : Les utilisateurs peuvent voir les invitations pour leurs groupes
CREATE POLICY "Users can view invitations for their groups"
  ON invitations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = invitations.group_id
      AND gm.user_id = auth.uid()
    )
  );

-- Politique : Les utilisateurs peuvent créer des invitations pour leurs groupes
CREATE POLICY "Users can create invitations for their groups"
  ON invitations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = invitations.group_id
      AND gm.user_id = auth.uid()
      AND gm.role IN ('admin', 'owner')
    )
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

