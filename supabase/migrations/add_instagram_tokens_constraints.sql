-- Migration: Ajouter des contraintes à la table instagram_tokens
-- Date: 2025-01-XX
-- Améliore la structure de la table instagram_tokens avec des contraintes et index

-- 1. Ajouter une contrainte unique sur club_id (un seul token par club)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'instagram_tokens_club_id_unique'
  ) THEN
    ALTER TABLE instagram_tokens
      ADD CONSTRAINT instagram_tokens_club_id_unique UNIQUE (club_id);
  END IF;
END $$;

-- 2. Ajouter une foreign key vers clubs.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'instagram_tokens_club_id_fkey'
  ) THEN
    ALTER TABLE instagram_tokens
      ADD CONSTRAINT instagram_tokens_club_id_fkey 
      FOREIGN KEY (club_id) 
      REFERENCES clubs(id) 
      ON DELETE CASCADE;
  END IF;
END $$;

-- 3. Créer un index sur club_id pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_instagram_tokens_club_id ON instagram_tokens(club_id);

-- 4. Créer un trigger pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_instagram_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_instagram_tokens_updated_at ON instagram_tokens;
CREATE TRIGGER trigger_update_instagram_tokens_updated_at
  BEFORE UPDATE ON instagram_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_instagram_tokens_updated_at();

-- 5. Commentaires pour documentation
COMMENT ON TABLE instagram_tokens IS 'Table pour stocker les tokens d''accès Instagram par club';
COMMENT ON COLUMN instagram_tokens.club_id IS 'ID du club (unique, un seul token par club)';
COMMENT ON COLUMN instagram_tokens.access_token IS 'Token d''accès Instagram/Facebook';
COMMENT ON COLUMN instagram_tokens.instagram_user_id IS 'ID du compte Instagram Business';
COMMENT ON COLUMN instagram_tokens.updated_at IS 'Date de dernière mise à jour (mise à jour automatique)';

