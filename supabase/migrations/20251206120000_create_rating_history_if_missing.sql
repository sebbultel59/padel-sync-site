-- Migration: Créer rating_history si elle n'existe pas
-- Date: 2025-12-06
-- Cette migration s'assure que la table rating_history existe

-- Table rating_history (historique des changements de rating)
CREATE TABLE IF NOT EXISTS rating_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating_before NUMERIC(10, 2) NOT NULL CHECK (rating_before >= 0),
  rating_after NUMERIC(10, 2) NOT NULL CHECK (rating_after >= 0),
  delta NUMERIC(10, 2) NOT NULL,
  match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour rating_history
CREATE INDEX IF NOT EXISTS idx_rating_history_user_id ON rating_history(user_id);
CREATE INDEX IF NOT EXISTS idx_rating_history_match_id ON rating_history(match_id) WHERE match_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rating_history_created_at ON rating_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rating_history_user_created ON rating_history(user_id, created_at DESC);

-- Commentaires pour documentation
COMMENT ON TABLE rating_history IS 'Historique des changements de rating pour chaque joueur';
COMMENT ON COLUMN rating_history.rating_before IS 'Rating avant le match';
COMMENT ON COLUMN rating_history.rating_after IS 'Rating après le match';
COMMENT ON COLUMN rating_history.delta IS 'Changement de rating (positif pour victoire, négatif pour défaite)';
COMMENT ON COLUMN rating_history.match_id IS 'ID du match qui a causé ce changement (nullable pour ajustements manuels)';

-- RLS (Row Level Security) pour rating_history
ALTER TABLE rating_history ENABLE ROW LEVEL SECURITY;

-- Tout le monde peut voir l'historique (pour le leaderboard)
DROP POLICY IF EXISTS "Anyone can view rating history" ON rating_history;
CREATE POLICY "Anyone can view rating history"
  ON rating_history
  FOR SELECT
  USING (true);

-- Seuls les admins peuvent modifier l'historique
DROP POLICY IF EXISTS "Admins can manage rating history" ON rating_history;
CREATE POLICY "Admins can manage rating history"
  ON rating_history
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- Permettre l'insertion via SERVICE_ROLE (pour les Edge Functions)
-- Note: SERVICE_ROLE_KEY bypass RLS par défaut, mais on s'assure qu'il n'y a pas de conflit
-- Cette politique permet aussi l'insertion depuis les Edge Functions
DROP POLICY IF EXISTS "Service role can insert rating history" ON rating_history;
CREATE POLICY "Service role can insert rating history"
  ON rating_history
  FOR INSERT
  WITH CHECK (true); -- SERVICE_ROLE_KEY bypass RLS, mais cette politique permet aussi l'insertion depuis l'app si nécessaire

