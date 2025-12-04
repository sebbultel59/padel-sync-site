-- Migration: Amélioration du système de rating avec level, XP et leaderboard
-- Date: 2025-12-05
-- Ajoute level, xp, club_id à player_ratings, crée rating_history et leaderboard_view

-- ============================================================================
-- 1. Ajout des colonnes manquantes à player_ratings
-- ============================================================================

-- Ajouter level (niveau 1 à 8)
ALTER TABLE player_ratings
  ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 3
  CHECK (level >= 1 AND level <= 8);

-- Ajouter xp (points d'expérience, 0-100 pour la progression dans le niveau)
ALTER TABLE player_ratings
  ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0
  CHECK (xp >= 0 AND xp <= 100);

-- Ajouter club_id (club principal du joueur, récupéré depuis profiles)
ALTER TABLE player_ratings
  ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE SET NULL;

-- Commentaires pour documentation
COMMENT ON COLUMN player_ratings.level IS 'Niveau du joueur (1-8), calculé à partir du rating';
COMMENT ON COLUMN player_ratings.xp IS 'Points d''expérience (0-100), progression dans le niveau actuel';
COMMENT ON COLUMN player_ratings.club_id IS 'Club principal du joueur (copié depuis profiles.club_id)';

-- ============================================================================
-- 2. Index supplémentaires pour les performances
-- ============================================================================

-- Index pour le tri par rating (déjà existant, mais on s'assure qu'il existe)
CREATE INDEX IF NOT EXISTS idx_player_ratings_rating_desc ON player_ratings(rating DESC);

-- Index composite pour le leaderboard par club
CREATE INDEX IF NOT EXISTS idx_player_ratings_club_rating 
  ON player_ratings(club_id, rating DESC) 
  WHERE club_id IS NOT NULL;

-- Index pour level et xp (utile pour les requêtes de progression)
CREATE INDEX IF NOT EXISTS idx_player_ratings_level_xp ON player_ratings(level DESC, xp DESC);

-- ============================================================================
-- 3. Table rating_history (historique des changements de rating)
-- ============================================================================

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

-- ============================================================================
-- 4. Vue leaderboard_view avec rangs global et par club
-- ============================================================================

CREATE OR REPLACE VIEW leaderboard_view AS
SELECT 
  pr.player_id AS user_id,
  COALESCE(p.display_name, p.name, p.email) AS display_name,
  p.avatar_url,
  pr.club_id,
  pr.rating,
  pr.level,
  pr.xp,
  pr.matches_played,
  pr.wins,
  pr.losses,
  pr.draws,
  -- Rang global (tous les joueurs)
  RANK() OVER (ORDER BY pr.rating DESC) AS rank_global,
  -- Rang par club (null si pas de club)
  CASE 
    WHEN pr.club_id IS NOT NULL THEN
      RANK() OVER (PARTITION BY pr.club_id ORDER BY pr.rating DESC)
    ELSE NULL
  END AS rank_club,
  pr.updated_at
FROM player_ratings pr
INNER JOIN profiles p ON p.id = pr.player_id
WHERE pr.rating IS NOT NULL;

-- Commentaire pour documentation
COMMENT ON VIEW leaderboard_view IS 'Vue leaderboard avec rangs global et par club, incluant les infos de profil';

-- ============================================================================
-- 5. Fonction pour synchroniser club_id depuis profiles vers player_ratings
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_player_rating_club_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Si le club_id du profil change, mettre à jour player_ratings
  IF NEW.club_id IS DISTINCT FROM OLD.club_id THEN
    UPDATE player_ratings
    SET club_id = NEW.club_id
    WHERE player_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger pour synchroniser automatiquement club_id
DROP TRIGGER IF EXISTS trigger_sync_player_rating_club_id ON profiles;
CREATE TRIGGER trigger_sync_player_rating_club_id
  AFTER UPDATE OF club_id ON profiles
  FOR EACH ROW
  WHEN (OLD.club_id IS DISTINCT FROM NEW.club_id)
  EXECUTE FUNCTION sync_player_rating_club_id();

-- Fonction pour initialiser club_id pour les ratings existants
CREATE OR REPLACE FUNCTION initialize_player_ratings_club_id()
RETURNS void AS $$
BEGIN
  UPDATE player_ratings pr
  SET club_id = p.club_id
  FROM profiles p
  WHERE pr.player_id = p.id
    AND pr.club_id IS NULL
    AND p.club_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Exécuter la synchronisation initiale
SELECT initialize_player_ratings_club_id();

-- ============================================================================
-- 6. RLS (Row Level Security) pour rating_history
-- ============================================================================

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

-- ============================================================================
-- 7. Mise à jour des politiques RLS pour player_ratings
-- ============================================================================

-- Permettre à chaque utilisateur de lire et mettre à jour UNIQUEMENT sa propre ligne
DROP POLICY IF EXISTS "Users can update own rating" ON player_ratings;
CREATE POLICY "Users can update own rating"
  ON player_ratings
  FOR UPDATE
  USING (player_id = auth.uid())
  WITH CHECK (player_id = auth.uid());

-- Permettre à chaque utilisateur de créer sa propre ligne (si elle n'existe pas)
DROP POLICY IF EXISTS "Users can insert own rating" ON player_ratings;
CREATE POLICY "Users can insert own rating"
  ON player_ratings
  FOR INSERT
  WITH CHECK (player_id = auth.uid());

-- La politique de lecture existe déjà ("Anyone can view player ratings")
-- On la garde telle quelle

-- ============================================================================
-- 8. RLS pour la vue leaderboard_view
-- ============================================================================

-- Les vues héritent des permissions des tables sous-jacentes
-- Mais on peut créer une politique spécifique si nécessaire
-- Pour l'instant, la vue est lisible par tous (via les politiques de player_ratings et profiles)

-- ============================================================================
-- 9. Fonction helper pour calculer level et xp à partir du rating
-- ============================================================================
-- Note: Cette fonction fonctionne avec une échelle de rating 0-100
-- Si votre système utilise une autre échelle (ex: Elo 1000+), 
-- vous devrez adapter les seuils de niveau

CREATE OR REPLACE FUNCTION calculate_level_and_xp(p_rating NUMERIC)
RETURNS TABLE(level INTEGER, xp INTEGER) AS $$
DECLARE
  v_level INTEGER;
  v_xp INTEGER;
  v_rating NUMERIC;
  v_normalized_rating NUMERIC;
BEGIN
  v_rating := COALESCE(p_rating, 0);
  
  -- Normaliser le rating si nécessaire (si le système utilise une échelle > 100)
  -- Exemple: si rating est sur échelle 0-1000, normaliser à 0-100
  -- Ici, on assume que le rating est déjà sur échelle 0-100
  -- Si votre système utilise 0-1000, décommentez la ligne suivante:
  -- v_normalized_rating := (v_rating / 10.0);
  v_normalized_rating := v_rating;
  
  -- Calculer le niveau (1-8) basé sur le rating normalisé (0-100)
  -- Niveau 1: 0-12.5
  -- Niveau 2: 12.5-25
  -- Niveau 3: 25-37.5
  -- Niveau 4: 37.5-50
  -- Niveau 5: 50-62.5
  -- Niveau 6: 62.5-75
  -- Niveau 7: 75-87.5
  -- Niveau 8: 87.5-100
  
  IF v_normalized_rating < 12.5 THEN
    v_level := 1;
    v_xp := LEAST(100, GREATEST(0, ROUND((v_normalized_rating / 12.5) * 100)::INTEGER));
  ELSIF v_normalized_rating < 25 THEN
    v_level := 2;
    v_xp := LEAST(100, GREATEST(0, ROUND(((v_normalized_rating - 12.5) / 12.5) * 100)::INTEGER));
  ELSIF v_normalized_rating < 37.5 THEN
    v_level := 3;
    v_xp := LEAST(100, GREATEST(0, ROUND(((v_normalized_rating - 25) / 12.5) * 100)::INTEGER));
  ELSIF v_normalized_rating < 50 THEN
    v_level := 4;
    v_xp := LEAST(100, GREATEST(0, ROUND(((v_normalized_rating - 37.5) / 12.5) * 100)::INTEGER));
  ELSIF v_normalized_rating < 62.5 THEN
    v_level := 5;
    v_xp := LEAST(100, GREATEST(0, ROUND(((v_normalized_rating - 50) / 12.5) * 100)::INTEGER));
  ELSIF v_normalized_rating < 75 THEN
    v_level := 6;
    v_xp := LEAST(100, GREATEST(0, ROUND(((v_normalized_rating - 62.5) / 12.5) * 100)::INTEGER));
  ELSIF v_normalized_rating < 87.5 THEN
    v_level := 7;
    v_xp := LEAST(100, GREATEST(0, ROUND(((v_normalized_rating - 75) / 12.5) * 100)::INTEGER));
  ELSE
    v_level := 8;
    v_xp := LEAST(100, GREATEST(0, ROUND(((v_normalized_rating - 87.5) / 12.5) * 100)::INTEGER));
  END IF;
  
  RETURN QUERY SELECT v_level, v_xp;
END;
$$ LANGUAGE plpgsql STABLE;

-- Commentaire pour documentation
COMMENT ON FUNCTION calculate_level_and_xp(NUMERIC) IS 
  'Calcule le niveau (1-8) et l''XP (0-100) à partir du rating. Utilisé pour mettre à jour automatiquement level et xp quand le rating change.';

-- ============================================================================
-- 10. Trigger pour mettre à jour automatiquement level et xp quand rating change
-- ============================================================================

CREATE OR REPLACE FUNCTION update_level_and_xp_from_rating()
RETURNS TRIGGER AS $$
DECLARE
  v_level INTEGER;
  v_xp INTEGER;
BEGIN
  -- Calculer level et xp à partir du nouveau rating
  SELECT level, xp INTO v_level, v_xp
  FROM calculate_level_and_xp(NEW.rating);
  
  -- Mettre à jour level et xp
  NEW.level := v_level;
  NEW.xp := v_xp;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour mettre à jour level et xp automatiquement
DROP TRIGGER IF EXISTS trigger_update_level_xp_from_rating ON player_ratings;
CREATE TRIGGER trigger_update_level_xp_from_rating
  BEFORE INSERT OR UPDATE OF rating ON player_ratings
  FOR EACH ROW
  EXECUTE FUNCTION update_level_and_xp_from_rating();

-- ============================================================================
-- 11. Mise à jour initiale des level et xp pour les ratings existants
-- ============================================================================

UPDATE player_ratings
SET 
  level = (SELECT level FROM calculate_level_and_xp(rating)),
  xp = (SELECT xp FROM calculate_level_and_xp(rating))
WHERE level IS NULL OR xp IS NULL;

-- ============================================================================
-- 12. Fonction pour insérer dans rating_history
-- ============================================================================

CREATE OR REPLACE FUNCTION insert_rating_history(
  p_user_id UUID,
  p_rating_before NUMERIC,
  p_rating_after NUMERIC,
  p_match_id UUID DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
  v_history_id BIGINT;
  v_delta NUMERIC;
BEGIN
  v_delta := p_rating_after - p_rating_before;
  
  INSERT INTO rating_history (user_id, rating_before, rating_after, delta, match_id)
  VALUES (p_user_id, p_rating_before, p_rating_after, v_delta, p_match_id)
  RETURNING id INTO v_history_id;
  
  RETURN v_history_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Commentaire pour documentation
COMMENT ON FUNCTION insert_rating_history(UUID, NUMERIC, NUMERIC, UUID) IS 
  'Insère un enregistrement dans rating_history. À appeler après chaque changement de rating.';

