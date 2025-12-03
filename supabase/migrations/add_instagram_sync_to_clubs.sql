-- Migration: Ajouter la synchronisation Instagram aux clubs
-- Date: 2025-01-XX
-- Permet aux clubs de synchroniser leurs posts Instagram dans les actualités

-- 1. Ajouter les colonnes Instagram dans la table clubs
ALTER TABLE clubs 
  ADD COLUMN IF NOT EXISTS instagram_access_token TEXT,
  ADD COLUMN IF NOT EXISTS instagram_user_id TEXT,
  ADD COLUMN IF NOT EXISTS instagram_last_sync TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS instagram_enabled BOOLEAN DEFAULT false;

-- 2. Ajouter les colonnes Instagram dans la table club_posts
ALTER TABLE club_posts
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS instagram_post_id TEXT,
  ADD COLUMN IF NOT EXISTS instagram_permalink TEXT;

-- 3. Créer des index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_club_posts_source ON club_posts(source) WHERE source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_club_posts_instagram_post_id ON club_posts(instagram_post_id) WHERE instagram_post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clubs_instagram_enabled ON clubs(instagram_enabled) WHERE instagram_enabled = true;

-- 4. Commentaires pour documentation
COMMENT ON COLUMN clubs.instagram_access_token IS 'Token d''accès Instagram/Facebook pour la synchronisation';
COMMENT ON COLUMN clubs.instagram_user_id IS 'ID du compte Instagram Business';
COMMENT ON COLUMN clubs.instagram_last_sync IS 'Date de la dernière synchronisation Instagram';
COMMENT ON COLUMN clubs.instagram_enabled IS 'Active ou désactive la synchronisation Instagram';
COMMENT ON COLUMN club_posts.source IS 'Source du post: ''manual'' ou ''instagram''';
COMMENT ON COLUMN club_posts.instagram_post_id IS 'ID du post Instagram original';
COMMENT ON COLUMN club_posts.instagram_permalink IS 'Lien vers le post Instagram original';




