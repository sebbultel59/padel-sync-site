-- Migration: Création du système de rating de joueurs pour le padel
-- Date: 2025-12-02
-- Tables: player_ratings, match_results, match_rating_effects
-- Types enum: match_type_enum, match_status_enum, team_enum, result_type_enum

-- 1. Création des types enum

-- Type de match
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'match_type_enum') THEN
    CREATE TYPE match_type_enum AS ENUM ('friendly', 'tournament', 'league', 'training');
  END IF;
END $$;

-- Statut du match (pour les résultats)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'match_status_enum') THEN
    CREATE TYPE match_status_enum AS ENUM ('pending', 'confirmed', 'completed', 'cancelled');
  END IF;
END $$;

-- Équipe (team1 ou team2)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'team_enum') THEN
    CREATE TYPE team_enum AS ENUM ('team1', 'team2');
  END IF;
END $$;

-- Type de résultat
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'result_type_enum') THEN
    CREATE TYPE result_type_enum AS ENUM ('win', 'loss', 'draw');
  END IF;
END $$;

-- 2. Table player_ratings (rating actuel de chaque joueur)
CREATE TABLE IF NOT EXISTS player_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating DECIMAL(10, 2) NOT NULL DEFAULT 1000.00 CHECK (rating >= 0),
  matches_played INTEGER DEFAULT 0 CHECK (matches_played >= 0),
  wins INTEGER DEFAULT 0 CHECK (wins >= 0),
  losses INTEGER DEFAULT 0 CHECK (losses >= 0),
  draws INTEGER DEFAULT 0 CHECK (draws >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id)
);

-- 3. Table match_results (résultats des matchs)
CREATE TABLE IF NOT EXISTS match_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  match_type match_type_enum NOT NULL DEFAULT 'friendly',
  status match_status_enum NOT NULL DEFAULT 'pending',
  -- Équipe 1
  team1_player1_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  team1_player2_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  team1_score INTEGER DEFAULT 0 CHECK (team1_score >= 0),
  -- Équipe 2
  team2_player1_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  team2_player2_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  team2_score INTEGER DEFAULT 0 CHECK (team2_score >= 0),
  -- Résultat
  winner_team team_enum,
  -- Métadonnées
  recorded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(match_id)
);

-- 4. Table match_rating_effects (historique des changements de rating)
CREATE TABLE IF NOT EXISTS match_rating_effects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_result_id UUID NOT NULL REFERENCES match_results(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team team_enum NOT NULL,
  result_type result_type_enum NOT NULL,
  rating_before DECIMAL(10, 2) NOT NULL CHECK (rating_before >= 0),
  rating_after DECIMAL(10, 2) NOT NULL CHECK (rating_after >= 0),
  rating_change DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Index pour améliorer les performances

-- Index pour player_ratings
CREATE INDEX IF NOT EXISTS idx_player_ratings_player_id ON player_ratings(player_id);
CREATE INDEX IF NOT EXISTS idx_player_ratings_rating ON player_ratings(rating DESC);
CREATE INDEX IF NOT EXISTS idx_player_ratings_updated_at ON player_ratings(updated_at DESC);

-- Index pour match_results
CREATE INDEX IF NOT EXISTS idx_match_results_match_id ON match_results(match_id);
CREATE INDEX IF NOT EXISTS idx_match_results_status ON match_results(status);
CREATE INDEX IF NOT EXISTS idx_match_results_match_type ON match_results(match_type);
CREATE INDEX IF NOT EXISTS idx_match_results_team1_player1 ON match_results(team1_player1_id);
CREATE INDEX IF NOT EXISTS idx_match_results_team1_player2 ON match_results(team1_player2_id);
CREATE INDEX IF NOT EXISTS idx_match_results_team2_player1 ON match_results(team2_player1_id);
CREATE INDEX IF NOT EXISTS idx_match_results_team2_player2 ON match_results(team2_player2_id);
CREATE INDEX IF NOT EXISTS idx_match_results_recorded_at ON match_results(recorded_at DESC);

-- Index pour match_rating_effects
CREATE INDEX IF NOT EXISTS idx_match_rating_effects_match_result_id ON match_rating_effects(match_result_id);
CREATE INDEX IF NOT EXISTS idx_match_rating_effects_player_id ON match_rating_effects(player_id);
CREATE INDEX IF NOT EXISTS idx_match_rating_effects_created_at ON match_rating_effects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_rating_effects_player_created ON match_rating_effects(player_id, created_at DESC);

-- 6. Triggers pour mettre à jour updated_at

-- Trigger pour player_ratings
CREATE OR REPLACE FUNCTION update_player_ratings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_player_ratings_updated_at ON player_ratings;
CREATE TRIGGER trigger_update_player_ratings_updated_at
  BEFORE UPDATE ON player_ratings
  FOR EACH ROW
  EXECUTE FUNCTION update_player_ratings_updated_at();

-- Trigger pour match_results
CREATE OR REPLACE FUNCTION update_match_results_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_match_results_updated_at ON match_results;
CREATE TRIGGER trigger_update_match_results_updated_at
  BEFORE UPDATE ON match_results
  FOR EACH ROW
  EXECUTE FUNCTION update_match_results_updated_at();

-- 7. Fonction pour initialiser le rating d'un joueur s'il n'existe pas
CREATE OR REPLACE FUNCTION ensure_player_rating(player_uuid UUID)
RETURNS UUID AS $$
DECLARE
  rating_id UUID;
BEGIN
  -- Vérifier si le rating existe déjà
  SELECT id INTO rating_id
  FROM player_ratings
  WHERE player_id = player_uuid;
  
  -- Si le rating n'existe pas, le créer
  IF rating_id IS NULL THEN
    INSERT INTO player_ratings (player_id, rating)
    VALUES (player_uuid, 1000.00)
    RETURNING id INTO rating_id;
  END IF;
  
  RETURN rating_id;
END;
$$ LANGUAGE plpgsql;

-- 8. Commentaires pour documentation
COMMENT ON TABLE player_ratings IS 'Ratings actuels des joueurs de padel (système Elo-like)';
COMMENT ON COLUMN player_ratings.rating IS 'Rating actuel du joueur (défaut: 1000.00)';
COMMENT ON COLUMN player_ratings.matches_played IS 'Nombre total de matchs joués';
COMMENT ON COLUMN player_ratings.wins IS 'Nombre de victoires';
COMMENT ON COLUMN player_ratings.losses IS 'Nombre de défaites';
COMMENT ON COLUMN player_ratings.draws IS 'Nombre de matchs nuls';

COMMENT ON TABLE match_results IS 'Résultats des matchs de padel avec scores et équipes';
COMMENT ON COLUMN match_results.match_type IS 'Type de match: friendly, tournament, league, training';
COMMENT ON COLUMN match_results.status IS 'Statut du résultat: pending, confirmed, completed, cancelled';
COMMENT ON COLUMN match_results.winner_team IS 'Équipe gagnante: team1 ou team2 (null si draw ou pending)';

COMMENT ON TABLE match_rating_effects IS 'Historique des changements de rating après chaque match';
COMMENT ON COLUMN match_rating_effects.rating_change IS 'Changement de rating (positif pour victoire, négatif pour défaite)';

COMMENT ON TYPE match_type_enum IS 'Type de match: friendly (amical), tournament (tournoi), league (championnat), training (entraînement)';
COMMENT ON TYPE match_status_enum IS 'Statut du match: pending (en attente), confirmed (confirmé), completed (terminé), cancelled (annulé)';
COMMENT ON TYPE team_enum IS 'Équipe: team1 ou team2';
COMMENT ON TYPE result_type_enum IS 'Type de résultat: win (victoire), loss (défaite), draw (nul)';

-- 9. RLS (Row Level Security)
ALTER TABLE player_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_rating_effects ENABLE ROW LEVEL SECURITY;

-- 10. Politiques RLS pour player_ratings
-- Tout le monde peut voir les ratings
DROP POLICY IF EXISTS "Anyone can view player ratings" ON player_ratings;
CREATE POLICY "Anyone can view player ratings"
  ON player_ratings
  FOR SELECT
  USING (true);

-- Les joueurs peuvent voir leur propre rating
-- Les admins peuvent modifier les ratings
DROP POLICY IF EXISTS "Admins can update player ratings" ON player_ratings;
CREATE POLICY "Admins can update player ratings"
  ON player_ratings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- 11. Politiques RLS pour match_results
-- Tout le monde peut voir les résultats
DROP POLICY IF EXISTS "Anyone can view match results" ON match_results;
CREATE POLICY "Anyone can view match results"
  ON match_results
  FOR SELECT
  USING (true);

-- Les joueurs du match peuvent créer/mettre à jour les résultats
DROP POLICY IF EXISTS "Match players can manage results" ON match_results;
CREATE POLICY "Match players can manage results"
  ON match_results
  FOR ALL
  USING (
    -- Vérifier si l'utilisateur est un des joueurs du match
    team1_player1_id = auth.uid()
    OR team1_player2_id = auth.uid()
    OR team2_player1_id = auth.uid()
    OR team2_player2_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    team1_player1_id = auth.uid()
    OR team1_player2_id = auth.uid()
    OR team2_player1_id = auth.uid()
    OR team2_player2_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- 12. Politiques RLS pour match_rating_effects
-- Tout le monde peut voir l'historique des changements de rating
DROP POLICY IF EXISTS "Anyone can view rating effects" ON match_rating_effects;
CREATE POLICY "Anyone can view rating effects"
  ON match_rating_effects
  FOR SELECT
  USING (true);

-- Seuls les admins peuvent modifier l'historique (généralement géré automatiquement)
DROP POLICY IF EXISTS "Admins can manage rating effects" ON match_rating_effects;
CREATE POLICY "Admins can manage rating effects"
  ON match_rating_effects
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


