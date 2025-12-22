-- Migration: Création de la table match_messages
-- Date: 2025-01-XX
-- Permet aux joueurs d'un match validé d'échanger des messages

-- 1. Table match_messages
CREATE TABLE IF NOT EXISTS match_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_match_messages_match_id ON match_messages(match_id);
CREATE INDEX IF NOT EXISTS idx_match_messages_user_id ON match_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_match_messages_created_at ON match_messages(created_at DESC);

-- 3. Trigger pour mettre à jour updated_at
CREATE OR REPLACE FUNCTION update_match_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_match_messages_updated_at ON match_messages;
CREATE TRIGGER trigger_update_match_messages_updated_at
  BEFORE UPDATE ON match_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_match_messages_updated_at();

-- 4. Commentaires pour documentation
COMMENT ON TABLE match_messages IS 'Messages échangés entre les joueurs d''un match validé';
COMMENT ON COLUMN match_messages.match_id IS 'Match auquel ce message appartient';
COMMENT ON COLUMN match_messages.user_id IS 'Utilisateur qui a envoyé le message';
COMMENT ON COLUMN match_messages.message IS 'Contenu du message';

-- 5. RLS (Row Level Security)
ALTER TABLE match_messages ENABLE ROW LEVEL SECURITY;

-- Politique : Les utilisateurs peuvent voir les messages des matchs où ils sont participants (via match_rsvps avec status='accepted')
DROP POLICY IF EXISTS "Users can view messages for their matches" ON match_messages;
CREATE POLICY "Users can view messages for their matches"
  ON match_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM match_rsvps
      WHERE match_rsvps.match_id = match_messages.match_id
        AND match_rsvps.user_id = auth.uid()
        AND match_rsvps.status = 'accepted'
    )
  );

-- Politique : Les utilisateurs peuvent créer des messages uniquement pour les matchs où ils sont participants
DROP POLICY IF EXISTS "Users can create messages for their matches" ON match_messages;
CREATE POLICY "Users can create messages for their matches"
  ON match_messages
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM match_rsvps
      WHERE match_rsvps.match_id = match_messages.match_id
        AND match_rsvps.user_id = auth.uid()
        AND match_rsvps.status = 'accepted'
    )
  );

-- Politique : Les utilisateurs peuvent modifier uniquement leurs propres messages
DROP POLICY IF EXISTS "Users can update their own messages" ON match_messages;
CREATE POLICY "Users can update their own messages"
  ON match_messages
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Politique : Les utilisateurs peuvent supprimer uniquement leurs propres messages
DROP POLICY IF EXISTS "Users can delete their own messages" ON match_messages;
CREATE POLICY "Users can delete their own messages"
  ON match_messages
  FOR DELETE
  USING (user_id = auth.uid());


