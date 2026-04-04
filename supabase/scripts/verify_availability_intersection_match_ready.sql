-- =============================================================================
-- Vérification base : intersection « match prêt » (même logique que l’app)
-- Voir : computeAvailableUsersForInterval dans app/(tabs)/matches/index.js
--
-- Dispos = comptage par case 30 min. Matchs prêts = INTERSECTION sur chaque tranche
-- 30 min d’un intervalle [match_start, match_end[ (durée 60 ou 90 min).
--
-- Usage (SQL Editor Supabase) :
--   1. Remplace :group_id, :match_start, :match_end dans les trois blocs (même valeurs).
--   2. Exécute le bloc 1, puis 2, puis 3.
--
-- Timestamptz = stockage en base (souvent UTC). Ex. 19h30–21h00 Paris (UTC+2) :
--   match_start = '2026-03-31 17:30:00+00'
--   match_end   = '2026-03-31 19:00:00+00'   -- 1h30
--
-- Cas fréquent : players_on_tick = 4 sur chaque ligne mais nb_joueurs_intersection = 0.
-- Ce n’est pas contradictoire : ce sont 4 joueurs *par tranche*, pas forcément *les mêmes 4*.
-- La grille Dispos peut afficher 4 partout alors qu’aucun joueur ne couvre les 3 tranches
-- d’affilée (ensembles A, B, C disjoints ou peu recouverts). Voir la requête 3b.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Plages availability_effective qui chevauchent l’intervalle testé
-- ---------------------------------------------------------------------------
WITH params AS (
  SELECT
    '00000000-0000-0000-0000-000000000000'::uuid AS gid,
    '2026-03-31 17:30:00+00'::timestamptz AS match_start,
    '2026-03-31 19:00:00+00'::timestamptz AS match_end
)
SELECT ae.user_id, ae.start, ae."end", ae.status
FROM availability_effective ae
CROSS JOIN params p
WHERE ae.group_id = p.gid
  AND lower(coalesce(ae.status, '')) = 'available'
  AND ae.start < p.match_end
  AND ae."end" > p.match_start
ORDER BY ae.user_id, ae.start;

-- ---------------------------------------------------------------------------
-- 2) Nombre de joueurs dans l’intersection (toute la durée du match)
-- ---------------------------------------------------------------------------
WITH params AS (
  SELECT
    '00000000-0000-0000-0000-000000000000'::uuid AS gid,
    '2026-03-31 17:30:00+00'::timestamptz AS match_start,
    '2026-03-31 19:00:00+00'::timestamptz AS match_end
),
ticks AS (
  SELECT gs AS tick_start, gs + interval '30 minutes' AS tick_end
  FROM params p,
  LATERAL generate_series(
    p.match_start,
    p.match_end - interval '30 minutes',
    interval '30 minutes'
  ) AS gs
),
avail AS (
  SELECT ae.user_id, ae.start AS a_start, ae."end" AS a_end
  FROM availability_effective ae
  CROSS JOIN params p
  WHERE ae.group_id = p.gid
    AND lower(coalesce(ae.status, '')) = 'available'
    AND ae.start < p.match_end
    AND ae."end" > p.match_start
),
tick_users AS (
  SELECT t.tick_start, a.user_id
  FROM ticks t
  JOIN avail a
    ON a.a_start <= t.tick_start
   AND a.a_end >= t.tick_end
),
intersection AS (
  SELECT tu.user_id
  FROM tick_users tu
  GROUP BY tu.user_id
  HAVING COUNT(DISTINCT tu.tick_start) = (SELECT COUNT(*) FROM ticks)
)
SELECT
  (SELECT COUNT(*) FROM ticks) AS nb_tranches_30min,
  (SELECT COUNT(*) FROM intersection) AS nb_joueurs_intersection,
  (SELECT array_agg(user_id::text ORDER BY user_id) FROM intersection) AS user_ids;

-- ---------------------------------------------------------------------------
-- 3) Détail : combien de joueurs par tranche (si < 4 quelque part, l’intersection ≤ min)
-- ---------------------------------------------------------------------------
WITH params AS (
  SELECT
    '00000000-0000-0000-0000-000000000000'::uuid AS gid,
    '2026-03-31 17:30:00+00'::timestamptz AS match_start,
    '2026-03-31 19:00:00+00'::timestamptz AS match_end
),
ticks AS (
  SELECT gs AS tick_start, gs + interval '30 minutes' AS tick_end
  FROM params p,
  LATERAL generate_series(
    p.match_start,
    p.match_end - interval '30 minutes',
    interval '30 minutes'
  ) AS gs
),
avail AS (
  SELECT ae.user_id, ae.start AS a_start, ae."end" AS a_end
  FROM availability_effective ae
  CROSS JOIN params p
  WHERE ae.group_id = p.gid
    AND lower(coalesce(ae.status, '')) = 'available'
    AND ae.start < p.match_end
    AND ae."end" > p.match_start
),
tick_users AS (
  SELECT t.tick_start, a.user_id
  FROM ticks t
  JOIN avail a
    ON a.a_start <= t.tick_start
   AND a.a_end >= t.tick_end
)
SELECT tick_start, COUNT(DISTINCT user_id) AS players_on_tick
FROM tick_users
GROUP BY tick_start
ORDER BY tick_start;

-- ---------------------------------------------------------------------------
-- 3b) Même CTE : liste des user_id par tranche (compare les 3 lignes — si les tableaux
--     diffèrent, l’intersection sera vide ou < 4)
-- ---------------------------------------------------------------------------
WITH params AS (
  SELECT
    '00000000-0000-0000-0000-000000000000'::uuid AS gid,
    '2026-03-31 17:30:00+00'::timestamptz AS match_start,
    '2026-03-31 19:00:00+00'::timestamptz AS match_end
),
ticks AS (
  SELECT gs AS tick_start, gs + interval '30 minutes' AS tick_end
  FROM params p,
  LATERAL generate_series(
    p.match_start,
    p.match_end - interval '30 minutes',
    interval '30 minutes'
  ) AS gs
),
avail AS (
  SELECT ae.user_id, ae.start AS a_start, ae."end" AS a_end
  FROM availability_effective ae
  CROSS JOIN params p
  WHERE ae.group_id = p.gid
    AND lower(coalesce(ae.status, '')) = 'available'
    AND ae.start < p.match_end
    AND ae."end" > p.match_start
),
tick_users AS (
  SELECT t.tick_start, a.user_id
  FROM ticks t
  JOIN avail a
    ON a.a_start <= t.tick_start
   AND a.a_end >= t.tick_end
)
SELECT
  tick_start,
  array_agg(user_id::text ORDER BY user_id) AS user_ids_on_tick
FROM tick_users
GROUP BY tick_start
ORDER BY tick_start;

-- ---------------------------------------------------------------------------
-- 4) (Option) Même jeu de données que le client : RPC get_availability_effective
--    Fenêtre [p_low, p_high] = typiquement une semaine (UTC).
-- ---------------------------------------------------------------------------
/*
SELECT *
FROM get_availability_effective(
  '00000000-0000-0000-0000-000000000000'::uuid,
  NULL,
  '2026-03-30 00:00:00+00'::timestamptz,
  '2026-04-06 00:00:00+00'::timestamptz
)
WHERE lower(coalesce(status, '')) = 'available'
ORDER BY user_id, start;
*/
