-- =============================================================================
-- Vérifie que les joueurs « dispos » sur un créneau (intersection 30 min, comme
-- verify_availability_intersection_match_ready.sql) ont bien un club accepté.
--
-- Groupe + club + fenêtre : modifie le bloc params si besoin.
-- Europe/Paris avril 2026 (CEST, UTC+2) : 19h30–22h30 local.
-- =============================================================================

WITH params AS (
  SELECT
    '115c6f02-51f3-4da8-9fb9-9116f0b96b03'::uuid AS gid,
    'cf119a51-9e37-41cc-8b48-2a4457030782'::uuid AS club_id,
    -- Jeudi 2 avril 2026 19:30 → 22:30 à Paris
    '2026-04-02 19:30:00+02'::timestamptz AS match_start,
    '2026-04-02 22:30:00+02'::timestamptz AS match_end
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
intersection_users AS (
  SELECT tu.user_id
  FROM tick_users tu
  GROUP BY tu.user_id
  HAVING COUNT(DISTINCT tu.tick_start) = (SELECT COUNT(*) FROM ticks)
)
SELECT
  iu.user_id,
  pr.display_name,
  uc.club_id,
  uc.is_accepted,
  CASE
    WHEN uc.user_id IS NULL THEN 'manquant : pas de ligne user_clubs pour ce club'
    WHEN uc.is_accepted IS NOT TRUE THEN 'présent mais is_accepted = false'
    ELSE 'ok'
  END AS statut_club
FROM intersection_users iu
LEFT JOIN profiles pr ON pr.id = iu.user_id
LEFT JOIN user_clubs uc
  ON uc.user_id = iu.user_id
 AND uc.club_id = (SELECT club_id FROM params)
ORDER BY
  CASE statut_club WHEN 'ok' THEN 0 ELSE 1 END,
  pr.display_name NULLS LAST,
  iu.user_id;

-- ---------------------------------------------------------------------------
-- Résumé (même params)
-- ---------------------------------------------------------------------------
WITH params AS (
  SELECT
    '115c6f02-51f3-4da8-9fb9-9116f0b96b03'::uuid AS gid,
    'cf119a51-9e37-41cc-8b48-2a4457030782'::uuid AS club_id,
    '2026-04-02 19:30:00+02'::timestamptz AS match_start,
    '2026-04-02 22:30:00+02'::timestamptz AS match_end
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
intersection_users AS (
  SELECT tu.user_id
  FROM tick_users tu
  GROUP BY tu.user_id
  HAVING COUNT(DISTINCT tu.tick_start) = (SELECT COUNT(*) FROM ticks)
)
SELECT
  (SELECT COUNT(*) FROM ticks) AS nb_tranches_30min,
  (SELECT COUNT(*) FROM intersection_users) AS nb_joueurs_intersection,
  COUNT(*) FILTER (WHERE uc.is_accepted IS TRUE) AS avec_club_accepte,
  COUNT(*) FILTER (WHERE uc.user_id IS NULL OR uc.is_accepted IS NOT TRUE) AS manquant_ou_non_accepte,
  bool_and(COALESCE(uc.is_accepted, false)) AS tous_ont_club_accepte
FROM intersection_users iu
LEFT JOIN user_clubs uc
  ON uc.user_id = iu.user_id
 AND uc.club_id = (SELECT club_id FROM params);
