-- Migration: Créer leaderboard_view si elle n'existe pas
-- Date: 2025-12-06
-- Cette migration s'assure que la vue leaderboard_view existe

-- ============================================================================
-- 1. Ajouter les colonnes manquantes à player_ratings si elles n'existent pas
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

-- ============================================================================
-- 2. Synchroniser club_id depuis profiles vers player_ratings
-- ============================================================================

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
-- 3. Vue leaderboard_view avec rangs global et par club
-- ============================================================================

CREATE OR REPLACE VIEW leaderboard_view AS
SELECT 
  pr.player_id AS user_id,
  COALESCE(p.display_name, p.name, p.email) AS display_name,
  p.avatar_url,
  COALESCE(pr.club_id, p.club_id) AS club_id, -- Utiliser pr.club_id si disponible, sinon p.club_id
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
    WHEN COALESCE(pr.club_id, p.club_id) IS NOT NULL THEN
      RANK() OVER (PARTITION BY COALESCE(pr.club_id, p.club_id) ORDER BY pr.rating DESC)
    ELSE NULL
  END AS rank_club,
  pr.updated_at
FROM player_ratings pr
INNER JOIN profiles p ON p.id = pr.player_id
WHERE pr.rating IS NOT NULL;

-- Commentaire pour documentation
COMMENT ON VIEW leaderboard_view IS 'Vue leaderboard avec rangs global et par club, incluant les infos de profil';

-- Note: Les vues héritent des permissions des tables sous-jacentes
-- La vue est lisible par tous via les politiques RLS de player_ratings et profiles

