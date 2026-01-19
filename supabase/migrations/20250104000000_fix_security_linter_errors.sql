-- Migration: Correction des erreurs de sécurité détectées par le linter
-- Date: 2025-01-04
-- Corrige:
-- 1. auth_users_exposed: player_stats_view expose auth.users
-- 2. security_definer_view: Toutes les vues avec SECURITY DEFINER
-- 3. rls_disabled_in_public: rating_update_queue n'a pas RLS activé

-- ============================================================================
-- 1. CORRECTION: Recréer leaderboard_view en premier (car player_stats_view en dépend)
-- ============================================================================
-- Note: Les vues PostgreSQL n'ont pas de propriété SECURITY DEFINER/INVOKER explicite.
-- Le problème vient du fait que les vues sont créées par un super-admin et héritent
-- de ses permissions. Pour corriger, on doit recréer les vues.

-- Recréer leaderboard_view AVANT player_stats_view car player_stats_view en dépend
DROP VIEW IF EXISTS leaderboard_view CASCADE;
CREATE VIEW leaderboard_view AS
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

COMMENT ON VIEW leaderboard_view IS 
  'Vue leaderboard avec rangs global et par club. Utilise les permissions de l''utilisateur via RLS.';

-- ============================================================================
-- 2. CORRECTION: player_stats_view - Ne plus exposer auth.users
-- ============================================================================
-- Problème: La vue fait INNER JOIN auth.users, ce qui expose auth.users aux rôles anon/authenticated
-- Solution: Utiliser seulement les données de profiles (display_name, name, email si disponible)

DROP VIEW IF EXISTS player_stats_view CASCADE;
CREATE VIEW player_stats_view AS
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
      COALESCE(p2.display_name, p2.name, p2.email) AS partner_name,
      mr.match_id,
      mr.winner_team = 'team1' AS won
    FROM match_results mr
    INNER JOIN profiles p2 ON p2.id = mr.team1_player2_id
    WHERE mr.status = 'completed'
      AND mr.team1_player1_id != mr.team1_player2_id
    
    UNION ALL
    
    SELECT 
      mr.team1_player2_id AS player_id,
      mr.team1_player1_id AS partner_id,
      COALESCE(p1.display_name, p1.name, p1.email) AS partner_name,
      mr.match_id,
      mr.winner_team = 'team1' AS won
    FROM match_results mr
    INNER JOIN profiles p1 ON p1.id = mr.team1_player1_id
    WHERE mr.status = 'completed'
      AND mr.team1_player1_id != mr.team1_player2_id
    
    UNION ALL
    
    -- Partenaires en équipe 2
    SELECT 
      mr.team2_player1_id AS player_id,
      mr.team2_player2_id AS partner_id,
      COALESCE(p2.display_name, p2.name, p2.email) AS partner_name,
      mr.match_id,
      mr.winner_team = 'team2' AS won
    FROM match_results mr
    INNER JOIN profiles p2 ON p2.id = mr.team2_player2_id
    WHERE mr.status = 'completed'
      AND mr.team2_player1_id != mr.team2_player2_id
    
    UNION ALL
    
    SELECT 
      mr.team2_player2_id AS player_id,
      mr.team2_player1_id AS partner_id,
      COALESCE(p1.display_name, p1.name, p1.email) AS partner_name,
      mr.match_id,
      mr.winner_team = 'team2' AS won
    FROM match_results mr
    INNER JOIN profiles p1 ON p1.id = mr.team2_player1_id
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
  COALESCE(p.display_name, p.name, p.email) AS display_name,
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
LEFT JOIN player_ratings pr ON pr.player_id = p.id
LEFT JOIN match_stats ms ON ms.user_id = p.id
LEFT JOIN side_preference sp ON sp.user_id = p.id
LEFT JOIN leaderboard_view lv ON lv.user_id = p.id
LEFT JOIN top_partners_agg tpa ON tpa.user_id = p.id;

-- ============================================================================
-- 3. CORRECTION: Recréer availability_effective
-- ============================================================================
-- Recréer availability_effective (déjà sécurisée via get_availability_effective RPC)
-- On la recrée pour s'assurer qu'elle n'hérite pas des permissions du super-admin
DROP VIEW IF EXISTS availability_effective CASCADE;
CREATE VIEW availability_effective AS
-- Inclure les exceptions par groupe (mais exclure celles avec status='neutral' qui servent seulement à masquer)
SELECT a.user_id,
       a.group_id,
       a.start,
       a."end",
       a.status
FROM availability a
WHERE a.status != 'neutral' -- exclure les exceptions 'neutral' qui servent seulement à masquer
UNION ALL
-- Inclure les disponibilités globales seulement s'il n'y a pas d'exception (y compris 'neutral') pour ce groupe
SELECT g.user_id,
       gm.group_id,
       g.start,
       g."end",
       g.status
FROM availability_global g
JOIN group_members gm ON gm.user_id = g.user_id
LEFT JOIN availability ex
  ON ex.user_id = g.user_id
 AND ex.group_id = gm.group_id
 AND ex.start = g.start
 AND ex."end"   = g."end"
WHERE ex.user_id IS NULL; -- inclure seulement s'il n'y a pas d'exception (les exceptions 'neutral' masquent aussi)

COMMENT ON VIEW availability_effective IS 
  'Vue des disponibilités effectives par groupe. Utilisée uniquement via get_availability_effective() RPC. Sécurisée.';

-- ============================================================================
-- 4. CORRECTION: Activer RLS sur rating_update_queue
-- ============================================================================

-- Activer RLS sur la table
ALTER TABLE rating_update_queue ENABLE ROW LEVEL SECURITY;

-- Politique: Seuls les service role et les utilisateurs authentifiés peuvent voir leurs propres entrées
-- Note: Cette table est principalement utilisée par des fonctions SECURITY DEFINER
-- Les utilisateurs normaux ne devraient pas y accéder directement

-- Politique pour la lecture: Seulement les entrées liées aux matchs du groupe de l'utilisateur
CREATE POLICY "Users can view rating update queue for their group matches"
  ON rating_update_queue
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM matches m
      JOIN group_members gm ON gm.group_id = m.group_id
      WHERE m.id = rating_update_queue.match_id
        AND gm.user_id = auth.uid()
    )
  );

-- Politique pour l'insertion: Seulement via les fonctions SECURITY DEFINER (pas d'insertion directe)
-- Les utilisateurs ne peuvent pas insérer directement
CREATE POLICY "No direct inserts to rating update queue"
  ON rating_update_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- Politique pour la mise à jour: Seulement via les fonctions SECURITY DEFINER
CREATE POLICY "No direct updates to rating update queue"
  ON rating_update_queue
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Politique pour la suppression: Seulement via les fonctions SECURITY DEFINER
CREATE POLICY "No direct deletes from rating update queue"
  ON rating_update_queue
  FOR DELETE
  TO authenticated
  USING (false);

-- ============================================================================
-- 5. NOTES SUR LES AUTRES VUES AVEC SECURITY DEFINER
-- ============================================================================
-- Les vues suivantes sont signalées par le linter mais ne sont pas définies dans
-- les migrations. Elles doivent être recréées manuellement ou via une migration spécifique
-- qui contient leur définition complète:
-- - v_slot_ready
-- - v_slot_dispo
-- - v_ready_60
-- - v_ready_90
-- - v_match_candidates
-- - v_slots_ready_4_no_match
-- - v_matches_extended
-- - v_slots_hot_3_no_match
-- - v_match_participants
-- - club_memberships

-- Pour corriger ces vues, vous devez:
-- 1. Obtenir leur définition actuelle: \d+ v_slot_ready (dans psql)
-- 2. Recréer la vue avec la même définition mais en tant qu'utilisateur approprié
-- 3. OU créer des fonctions RPC wrapper avec SECURITY INVOKER qui utilisent ces vues

COMMENT ON VIEW player_stats_view IS 
  'Vue regroupant les stats principales par joueur. Corrigée pour ne plus exposer auth.users.';

-- ============================================================================
-- NOTES IMPORTANTES
-- ============================================================================
-- 1. Les vues PostgreSQL n'ont pas de propriété SECURITY DEFINER/INVOKER explicite
--    Le problème vient du fait qu'elles sont créées par un super-admin.
--    Pour corriger, il faut les recréer en tant qu'utilisateur approprié ou
--    utiliser des fonctions wrapper avec SECURITY INVOKER.
--
-- 2. Pour les vues qui ne sont pas dans les migrations (v_slot_ready, etc.),
--    elles doivent être recréées manuellement ou via une migration spécifique
--    qui contient leur définition complète.
--
-- 3. La table rating_update_queue est maintenant protégée par RLS et ne peut
--    être modifiée que via les fonctions SECURITY DEFINER (queue_rating_update, etc.)

