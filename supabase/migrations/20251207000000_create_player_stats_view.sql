-- Migration: Création de la vue player_stats_view
-- Date: 2025-12-07
-- Vue qui regroupe les stats principales par joueur pour l'affichage dans le profil

-- ============================================================================
-- 1. Vue player_stats_view avec toutes les stats demandées
-- ============================================================================

CREATE OR REPLACE VIEW player_stats_view AS
WITH match_stats AS (
  -- Calculer les stats de matchs depuis match_results
  SELECT 
    p.id AS user_id,
    -- Compter les matchs terminés où le joueur a participé
    COUNT(DISTINCT mr.match_id) FILTER (
      WHERE mr.status = 'completed'
    ) AS matches_played,
    -- Compter les victoires (où l'équipe du joueur a gagné)
    COUNT(DISTINCT mr.match_id) FILTER (
      WHERE mr.status = 'completed'
        AND (
          (mr.team1_player1_id = p.id OR mr.team1_player2_id = p.id) AND mr.winner_team = 'team1'
          OR
          (mr.team2_player1_id = p.id OR mr.team2_player2_id = p.id) AND mr.winner_team = 'team2'
        )
    ) AS wins,
    -- Compter les défaites (matchs terminés - victoires - nuls)
    COUNT(DISTINCT mr.match_id) FILTER (
      WHERE mr.status = 'completed'
        AND mr.winner_team IS NOT NULL
        AND NOT (
          (mr.team1_player1_id = p.id OR mr.team1_player2_id = p.id) AND mr.winner_team = 'team1'
          OR
          (mr.team2_player1_id = p.id OR mr.team2_player2_id = p.id) AND mr.winner_team = 'team2'
        )
    ) AS losses,
    -- TODO: sets_won et sets_lost nécessitent le parsing de score_text ou des colonnes dédiées
    -- Pour l'instant, on met NULL avec un commentaire
    NULL::INTEGER AS sets_won,
    NULL::INTEGER AS sets_lost
  FROM profiles p
  LEFT JOIN match_results mr ON (
    mr.team1_player1_id = p.id 
    OR mr.team1_player2_id = p.id
    OR mr.team2_player1_id = p.id
    OR mr.team2_player2_id = p.id
  )
  GROUP BY p.id
),
side_preference AS (
  -- Mapper la colonne cote de profiles vers side_preferred
  SELECT 
    id AS user_id,
    CASE 
      WHEN cote = 'gauche' THEN 'left'
      WHEN cote = 'droite' THEN 'right'
      WHEN cote = 'les_deux' THEN NULL -- ou 'both' selon préférence
      ELSE NULL
    END AS side_preferred
  FROM profiles
),
top_partners_stats AS (
  -- Calculer les stats de partenaires depuis match_results
  -- On utilise UNION pour traiter chaque cas d'équipe séparément
  SELECT 
    player_id AS user_id,
    partner_id,
    partner_name,
    COUNT(DISTINCT match_id) AS matches_with,
    CASE 
      WHEN COUNT(DISTINCT match_id) > 0 THEN
        ROUND((
          COUNT(DISTINCT match_id) FILTER (WHERE won = true)::NUMERIC / 
          NULLIF(COUNT(DISTINCT match_id), 0)
        ) * 100, 2)
      ELSE 0
    END AS win_rate_with
  FROM (
    -- Partenaires en équipe 1
    SELECT 
      mr.team1_player1_id AS player_id,
      mr.team1_player2_id AS partner_id,
      COALESCE(p2.display_name, p2.name, u2.email) AS partner_name,
      mr.match_id,
      mr.winner_team = 'team1' AS won
    FROM match_results mr
    INNER JOIN profiles p2 ON p2.id = mr.team1_player2_id
    LEFT JOIN auth.users u2 ON u2.id = p2.id
    WHERE mr.status = 'completed'
      AND mr.team1_player1_id != mr.team1_player2_id
    
    UNION ALL
    
    SELECT 
      mr.team1_player2_id AS player_id,
      mr.team1_player1_id AS partner_id,
      COALESCE(p1.display_name, p1.name, u1.email) AS partner_name,
      mr.match_id,
      mr.winner_team = 'team1' AS won
    FROM match_results mr
    INNER JOIN profiles p1 ON p1.id = mr.team1_player1_id
    LEFT JOIN auth.users u1 ON u1.id = p1.id
    WHERE mr.status = 'completed'
      AND mr.team1_player1_id != mr.team1_player2_id
    
    UNION ALL
    
    -- Partenaires en équipe 2
    SELECT 
      mr.team2_player1_id AS player_id,
      mr.team2_player2_id AS partner_id,
      COALESCE(p2.display_name, p2.name, u2.email) AS partner_name,
      mr.match_id,
      mr.winner_team = 'team2' AS won
    FROM match_results mr
    INNER JOIN profiles p2 ON p2.id = mr.team2_player2_id
    LEFT JOIN auth.users u2 ON u2.id = p2.id
    WHERE mr.status = 'completed'
      AND mr.team2_player1_id != mr.team2_player2_id
    
    UNION ALL
    
    SELECT 
      mr.team2_player2_id AS player_id,
      mr.team2_player1_id AS partner_id,
      COALESCE(p1.display_name, p1.name, u1.email) AS partner_name,
      mr.match_id,
      mr.winner_team = 'team2' AS won
    FROM match_results mr
    INNER JOIN profiles p1 ON p1.id = mr.team2_player1_id
    LEFT JOIN auth.users u1 ON u1.id = p1.id
    WHERE mr.status = 'completed'
      AND mr.team2_player1_id != mr.team2_player2_id
  ) partner_matches
  GROUP BY player_id, partner_id, partner_name
),
top_partners_agg AS (
  -- Agréger les top 3 partenaires par joueur
  SELECT 
    user_id,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'partner_id', partner_id,
          'partner_name', partner_name,
          'matches_with', matches_with,
          'win_rate_with', win_rate_with
        )
        ORDER BY matches_with DESC, win_rate_with DESC
      ) FILTER (WHERE matches_with > 0),
      '[]'::jsonb
    ) AS top_partners
  FROM (
    SELECT 
      user_id,
      partner_id,
      partner_name,
      matches_with,
      win_rate_with,
      ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY matches_with DESC, win_rate_with DESC) AS rn
    FROM top_partners_stats
  ) ranked
  WHERE rn <= 3  -- Top 3 partenaires
  GROUP BY user_id
)
SELECT 
  p.id AS user_id,
  COALESCE(p.display_name, p.name, u.email) AS display_name,
  p.avatar_url,
  COALESCE(pr.club_id, p.club_id) AS club_id,
  
  -- Stats de matchs
  COALESCE(ms.matches_played, 0) AS matches_played,
  COALESCE(ms.wins, 0) AS wins,
  COALESCE(ms.losses, 0) AS losses,
  -- Win rate en pourcentage (0-100)
  CASE 
    WHEN COALESCE(ms.matches_played, 0) > 0 THEN
      ROUND((COALESCE(ms.wins, 0)::NUMERIC / NULLIF(ms.matches_played, 0)) * 100, 2)
    ELSE 0
  END AS win_rate,
  -- Sets (TODO: à implémenter quand les données seront disponibles)
  ms.sets_won,
  ms.sets_lost,
  
  -- Rating, level, XP depuis player_ratings
  COALESCE(pr.rating, 1000.00) AS rating,
  COALESCE(pr.level, 3) AS level,
  COALESCE(pr.xp, 0) AS xp,
  
  -- Rangs depuis leaderboard_view (si disponible)
  lv.rank_global,
  lv.rank_club,
  
  -- Side preference depuis profiles.cote
  sp.side_preferred,
  
  -- Top partenaires (2-3 principaux partenaires)
  COALESCE(tpa.top_partners, '[]'::jsonb) AS top_partners
FROM profiles p
INNER JOIN auth.users u ON u.id = p.id
LEFT JOIN player_ratings pr ON pr.player_id = p.id
LEFT JOIN match_stats ms ON ms.user_id = p.id
LEFT JOIN side_preference sp ON sp.user_id = p.id
LEFT JOIN leaderboard_view lv ON lv.user_id = p.id
LEFT JOIN top_partners_agg tpa ON tpa.user_id = p.id;

-- Commentaire pour documentation
COMMENT ON VIEW player_stats_view IS 
  'Vue regroupant les stats principales par joueur : matchs joués, victoires, défaites, win rate, rating, level, XP, rangs, et préférence de côté';

COMMENT ON COLUMN player_stats_view.matches_played IS 
  'Nombre de matchs terminés (status=completed dans match_results) où le joueur a participé';

COMMENT ON COLUMN player_stats_view.wins IS 
  'Nombre de victoires (matchs terminés où l''équipe du joueur correspond à winner_team)';

COMMENT ON COLUMN player_stats_view.losses IS 
  'Nombre de défaites (matchs terminés - victoires - nuls)';

COMMENT ON COLUMN player_stats_view.win_rate IS 
  'Taux de victoire en pourcentage (0-100), calculé comme wins / matches_played * 100';

COMMENT ON COLUMN player_stats_view.sets_won IS 
  'TODO: Nombre de sets gagnés (nécessite parsing de score_text ou colonnes dédiées)';

COMMENT ON COLUMN player_stats_view.sets_lost IS 
  'TODO: Nombre de sets perdus (nécessite parsing de score_text ou colonnes dédiées)';

COMMENT ON COLUMN player_stats_view.side_preferred IS 
  'Côté préféré du joueur (left, right, ou NULL), mappé depuis profiles.cote';

COMMENT ON COLUMN player_stats_view.top_partners IS 
  'Array JSONB des 2-3 partenaires principaux avec partner_id, partner_name, matches_with, win_rate_with';

-- ============================================================================
-- 2. Index pour améliorer les performances (si nécessaire)
-- ============================================================================

-- Les index existants sur player_ratings, match_results et profiles devraient suffire
-- Mais on peut ajouter un index sur match_results.status si ce n'est pas déjà fait
CREATE INDEX IF NOT EXISTS idx_match_results_status 
  ON match_results(status) 
  WHERE status = 'completed';

-- Index composite pour améliorer les requêtes de stats
CREATE INDEX IF NOT EXISTS idx_match_results_players_status 
  ON match_results(team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, status)
  WHERE status = 'completed';

-- ============================================================================
-- 3. RLS (Row Level Security)
-- ============================================================================

-- Les vues héritent des permissions des tables sous-jacentes
-- On s'assure que les politiques RLS permettent la lecture publique des stats
-- (déjà configuré dans les migrations précédentes pour player_ratings et profiles)

-- Note: La vue est lisible par tous les utilisateurs authentifiés
-- via les politiques RLS existantes sur profiles et player_ratings

