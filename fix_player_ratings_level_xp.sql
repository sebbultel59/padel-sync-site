-- Recalcule level/xp depuis rating (0-100) pour tous les joueurs
-- À exécuter dans Supabase SQL Editor ou psql

WITH normalized AS (
  SELECT
    player_id,
    GREATEST(0, LEAST(100, COALESCE(rating, 0))) AS r
  FROM player_ratings
),
computed AS (
  SELECT
    player_id,
    CASE
      WHEN r BETWEEN 0 AND 12.4 THEN 1
      WHEN r BETWEEN 12.5 AND 24.9 THEN 2
      WHEN r BETWEEN 25.0 AND 37.4 THEN 3
      WHEN r BETWEEN 37.5 AND 49.9 THEN 4
      WHEN r BETWEEN 50.0 AND 62.4 THEN 5
      WHEN r BETWEEN 62.5 AND 74.9 THEN 6
      WHEN r BETWEEN 75.0 AND 87.4 THEN 7
      ELSE 8
    END AS level,
    CASE
      WHEN r BETWEEN 0 AND 12.4 THEN ROUND(((r - 0.0) / (12.4 - 0.0)) * 100.0, 2)
      WHEN r BETWEEN 12.5 AND 24.9 THEN ROUND(((r - 12.5) / (24.9 - 12.5)) * 100.0, 2)
      WHEN r BETWEEN 25.0 AND 37.4 THEN ROUND(((r - 25.0) / (37.4 - 25.0)) * 100.0, 2)
      WHEN r BETWEEN 37.5 AND 49.9 THEN ROUND(((r - 37.5) / (49.9 - 37.5)) * 100.0, 2)
      WHEN r BETWEEN 50.0 AND 62.4 THEN ROUND(((r - 50.0) / (62.4 - 50.0)) * 100.0, 2)
      WHEN r BETWEEN 62.5 AND 74.9 THEN ROUND(((r - 62.5) / (74.9 - 62.5)) * 100.0, 2)
      WHEN r BETWEEN 75.0 AND 87.4 THEN ROUND(((r - 75.0) / (87.4 - 75.0)) * 100.0, 2)
      ELSE ROUND(((r - 87.5) / (100.0 - 87.5)) * 100.0, 2)
    END AS xp
  FROM normalized
)
UPDATE player_ratings pr
SET
  level = c.level,
  xp = c.xp
FROM computed c
WHERE pr.player_id = c.player_id;
