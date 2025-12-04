-- Migration: Système de leaderboards pour Padel Sync
-- Date: 2025-12-04
-- Ajoute le champ opt-out et les fonctions pour les leaderboards (club, groupe, zone)

-- 1. Ajouter le champ hide_from_public_leaderboards dans profiles
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS hide_from_public_leaderboards BOOLEAN NOT NULL DEFAULT false;

-- Index pour améliorer les performances des requêtes
CREATE INDEX IF NOT EXISTS idx_profiles_hide_from_public_leaderboards 
  ON profiles(hide_from_public_leaderboards) 
  WHERE hide_from_public_leaderboards = false;

-- Commentaire pour documentation
COMMENT ON COLUMN profiles.hide_from_public_leaderboards IS 
  'Si true, l''utilisateur est masqué des leaderboards publics (zone/global) mais reste visible dans ses clubs et groupes';

-- 2. Fonction pour compter les matchs d'un joueur dans un club
-- (basé sur les matchs joués dans les groupes du club)
CREATE OR REPLACE FUNCTION count_matches_in_club(p_user_id UUID, p_club_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT mr.match_id) INTO v_count
  FROM match_results mr
  INNER JOIN matches m ON m.id = mr.match_id
  INNER JOIN groups g ON g.id = m.group_id
  WHERE g.club_id = p_club_id
    AND (
      mr.team1_player1_id = p_user_id OR
      mr.team1_player2_id = p_user_id OR
      mr.team2_player1_id = p_user_id OR
      mr.team2_player2_id = p_user_id
    )
    AND mr.status = 'completed'
    AND mr.winner_team IS NOT NULL;
  
  RETURN COALESCE(v_count, 0);
END;
$$;

-- 3. Fonction pour compter les matchs d'un joueur dans un groupe
CREATE OR REPLACE FUNCTION count_matches_in_group(p_user_id UUID, p_group_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT mr.match_id) INTO v_count
  FROM match_results mr
  INNER JOIN matches m ON m.id = mr.match_id
  WHERE m.group_id = p_group_id
    AND (
      mr.team1_player1_id = p_user_id OR
      mr.team1_player2_id = p_user_id OR
      mr.team2_player1_id = p_user_id OR
      mr.team2_player2_id = p_user_id
    )
    AND mr.status = 'completed'
    AND mr.winner_team IS NOT NULL;
  
  RETURN COALESCE(v_count, 0);
END;
$$;

-- 4. Fonction leaderboard CLUB
-- Retourne les joueurs membres des groupes du club, triés par rating
CREATE OR REPLACE FUNCTION club_leaderboard(p_club_id UUID)
RETURNS TABLE (
  rank BIGINT,
  user_id UUID,
  pseudo TEXT,
  rating DECIMAL(10, 2),
  level INTEGER,
  xp DECIMAL(5, 2),
  matches_count_in_club INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH club_members AS (
    -- Récupérer tous les membres des groupes du club
    SELECT DISTINCT gm.user_id
    FROM group_members gm
    INNER JOIN groups g ON g.id = gm.group_id
    WHERE g.club_id = p_club_id
  ),
  ranked_players AS (
    SELECT
      pr.player_id AS user_id,
      COALESCE(p.display_name, p.name, p.email) AS pseudo,
      pr.rating,
      -- Calculer level et xp à partir du rating
      CASE
        WHEN pr.rating >= 0 AND pr.rating < 12.5 THEN 1
        WHEN pr.rating >= 12.5 AND pr.rating < 25.0 THEN 2
        WHEN pr.rating >= 25.0 AND pr.rating < 37.5 THEN 3
        WHEN pr.rating >= 37.5 AND pr.rating < 50.0 THEN 4
        WHEN pr.rating >= 50.0 AND pr.rating < 62.5 THEN 5
        WHEN pr.rating >= 62.5 AND pr.rating < 75.0 THEN 6
        WHEN pr.rating >= 75.0 AND pr.rating < 87.5 THEN 7
        WHEN pr.rating >= 87.5 THEN 8
        ELSE 1
      END AS level,
      -- Calculer xp (progression dans le niveau, 0-100)
      CASE
        WHEN pr.rating >= 0 AND pr.rating < 12.5 THEN (pr.rating / 12.5) * 100
        WHEN pr.rating >= 12.5 AND pr.rating < 25.0 THEN ((pr.rating - 12.5) / 12.5) * 100
        WHEN pr.rating >= 25.0 AND pr.rating < 37.5 THEN ((pr.rating - 25.0) / 12.5) * 100
        WHEN pr.rating >= 37.5 AND pr.rating < 50.0 THEN ((pr.rating - 37.5) / 12.5) * 100
        WHEN pr.rating >= 50.0 AND pr.rating < 62.5 THEN ((pr.rating - 50.0) / 12.5) * 100
        WHEN pr.rating >= 62.5 AND pr.rating < 75.0 THEN ((pr.rating - 62.5) / 12.5) * 100
        WHEN pr.rating >= 75.0 AND pr.rating < 87.5 THEN ((pr.rating - 75.0) / 12.5) * 100
        WHEN pr.rating >= 87.5 THEN ((pr.rating - 87.5) / 12.5) * 100
        ELSE 0
      END AS xp,
      count_matches_in_club(pr.player_id, p_club_id) AS matches_count_in_club
    FROM club_members cm
    INNER JOIN player_ratings pr ON pr.player_id = cm.user_id
    INNER JOIN profiles p ON p.id = pr.player_id
    WHERE pr.rating IS NOT NULL
  )
  SELECT
    DENSE_RANK() OVER (ORDER BY rp.rating DESC) AS rank,
    rp.user_id,
    rp.pseudo,
    rp.rating,
    rp.level,
    ROUND(rp.xp, 2) AS xp,
    rp.matches_count_in_club
  FROM ranked_players rp
  ORDER BY rp.rating DESC;
END;
$$;

-- 5. Fonction leaderboard GROUPE
CREATE OR REPLACE FUNCTION group_leaderboard(p_group_id UUID)
RETURNS TABLE (
  rank BIGINT,
  user_id UUID,
  pseudo TEXT,
  rating DECIMAL(10, 2),
  level INTEGER,
  xp DECIMAL(5, 2),
  matches_count_in_group INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH group_members_list AS (
    SELECT DISTINCT gm.user_id
    FROM group_members gm
    WHERE gm.group_id = p_group_id
  ),
  ranked_players AS (
    SELECT
      pr.player_id AS user_id,
      COALESCE(p.display_name, p.name, p.email) AS pseudo,
      pr.rating,
      -- Calculer level et xp à partir du rating
      CASE
        WHEN pr.rating >= 0 AND pr.rating < 12.5 THEN 1
        WHEN pr.rating >= 12.5 AND pr.rating < 25.0 THEN 2
        WHEN pr.rating >= 25.0 AND pr.rating < 37.5 THEN 3
        WHEN pr.rating >= 37.5 AND pr.rating < 50.0 THEN 4
        WHEN pr.rating >= 50.0 AND pr.rating < 62.5 THEN 5
        WHEN pr.rating >= 62.5 AND pr.rating < 75.0 THEN 6
        WHEN pr.rating >= 75.0 AND pr.rating < 87.5 THEN 7
        WHEN pr.rating >= 87.5 THEN 8
        ELSE 1
      END AS level,
      -- Calculer xp (progression dans le niveau, 0-100)
      CASE
        WHEN pr.rating >= 0 AND pr.rating < 12.5 THEN (pr.rating / 12.5) * 100
        WHEN pr.rating >= 12.5 AND pr.rating < 25.0 THEN ((pr.rating - 12.5) / 12.5) * 100
        WHEN pr.rating >= 25.0 AND pr.rating < 37.5 THEN ((pr.rating - 25.0) / 12.5) * 100
        WHEN pr.rating >= 37.5 AND pr.rating < 50.0 THEN ((pr.rating - 37.5) / 12.5) * 100
        WHEN pr.rating >= 50.0 AND pr.rating < 62.5 THEN ((pr.rating - 50.0) / 12.5) * 100
        WHEN pr.rating >= 62.5 AND pr.rating < 75.0 THEN ((pr.rating - 62.5) / 12.5) * 100
        WHEN pr.rating >= 75.0 AND pr.rating < 87.5 THEN ((pr.rating - 75.0) / 12.5) * 100
        WHEN pr.rating >= 87.5 THEN ((pr.rating - 87.5) / 12.5) * 100
        ELSE 0
      END AS xp,
      count_matches_in_group(pr.player_id, p_group_id) AS matches_count_in_group
    FROM group_members_list gml
    INNER JOIN player_ratings pr ON pr.player_id = gml.user_id
    INNER JOIN profiles p ON p.id = pr.player_id
    WHERE pr.rating IS NOT NULL
  )
  SELECT
    DENSE_RANK() OVER (ORDER BY rp.rating DESC) AS rank,
    rp.user_id,
    rp.pseudo,
    rp.rating,
    rp.level,
    ROUND(rp.xp, 2) AS xp,
    rp.matches_count_in_group
  FROM ranked_players rp
  ORDER BY rp.rating DESC;
END;
$$;

-- 6. Fonction leaderboard ZONE (ville)
-- Utilise la ville de l'utilisateur (depuis address_home ou address_work) ou celle du club principal
CREATE OR REPLACE FUNCTION zone_leaderboard(p_city TEXT)
RETURNS TABLE (
  rank BIGINT,
  user_id UUID,
  pseudo TEXT,
  rating DECIMAL(10, 2),
  level INTEGER,
  xp DECIMAL(5, 2),
  matches_count INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH players_in_city AS (
    SELECT DISTINCT p.id AS user_id
    FROM profiles p
    INNER JOIN player_ratings pr ON pr.player_id = p.id
    WHERE pr.rating IS NOT NULL
      AND p.hide_from_public_leaderboards = false
      AND (
        -- Ville depuis address_home
        (p.address_home->>'city' = p_city) OR
        -- Ville depuis address_work
        (p.address_work->>'city' = p_city) OR
        -- Ville depuis le club principal (si l'utilisateur a un club_id)
        (p.club_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM clubs c 
          WHERE c.id = p.club_id 
          AND c.address ILIKE '%' || p_city || '%'
        ))
      )
  ),
  ranked_players AS (
    SELECT
      pic.user_id,
      COALESCE(p.display_name, p.name, p.email) AS pseudo,
      pr.rating,
      -- Calculer level et xp à partir du rating
      CASE
        WHEN pr.rating >= 0 AND pr.rating < 12.5 THEN 1
        WHEN pr.rating >= 12.5 AND pr.rating < 25.0 THEN 2
        WHEN pr.rating >= 25.0 AND pr.rating < 37.5 THEN 3
        WHEN pr.rating >= 37.5 AND pr.rating < 50.0 THEN 4
        WHEN pr.rating >= 50.0 AND pr.rating < 62.5 THEN 5
        WHEN pr.rating >= 62.5 AND pr.rating < 75.0 THEN 6
        WHEN pr.rating >= 75.0 AND pr.rating < 87.5 THEN 7
        WHEN pr.rating >= 87.5 THEN 8
        ELSE 1
      END AS level,
      -- Calculer xp (progression dans le niveau, 0-100)
      CASE
        WHEN pr.rating >= 0 AND pr.rating < 12.5 THEN (pr.rating / 12.5) * 100
        WHEN pr.rating >= 12.5 AND pr.rating < 25.0 THEN ((pr.rating - 12.5) / 12.5) * 100
        WHEN pr.rating >= 25.0 AND pr.rating < 37.5 THEN ((pr.rating - 25.0) / 12.5) * 100
        WHEN pr.rating >= 37.5 AND pr.rating < 50.0 THEN ((pr.rating - 37.5) / 12.5) * 100
        WHEN pr.rating >= 50.0 AND pr.rating < 62.5 THEN ((pr.rating - 50.0) / 12.5) * 100
        WHEN pr.rating >= 62.5 AND pr.rating < 75.0 THEN ((pr.rating - 62.5) / 12.5) * 100
        WHEN pr.rating >= 75.0 AND pr.rating < 87.5 THEN ((pr.rating - 75.0) / 12.5) * 100
        WHEN pr.rating >= 87.5 THEN ((pr.rating - 87.5) / 12.5) * 100
        ELSE 0
      END AS xp,
      pr.matches_played AS matches_count
    FROM players_in_city pic
    INNER JOIN profiles p ON p.id = pic.user_id
    INNER JOIN player_ratings pr ON pr.player_id = pic.user_id
  )
  SELECT
    DENSE_RANK() OVER (ORDER BY rp.rating DESC) AS rank,
    rp.user_id,
    rp.pseudo,
    rp.rating,
    rp.level,
    ROUND(rp.xp, 2) AS xp,
    rp.matches_count
  FROM ranked_players rp
  ORDER BY rp.rating DESC;
END;
$$;

-- 7. Commentaires pour documentation
COMMENT ON FUNCTION club_leaderboard(UUID) IS 
  'Retourne le leaderboard d''un club (tous les membres des groupes du club), trié par rating DESC';
COMMENT ON FUNCTION group_leaderboard(UUID) IS 
  'Retourne le leaderboard d''un groupe, trié par rating DESC';
COMMENT ON FUNCTION zone_leaderboard(TEXT) IS 
  'Retourne le leaderboard d''une zone (ville), excluant les utilisateurs avec hide_from_public_leaderboards = true';

