-- Migration: best-effort migrate profile clubs to user_clubs
-- Date: 2026-02-07

-- 1) Direct club_id
INSERT INTO user_clubs (user_id, club_id, is_accepted, is_preferred)
SELECT p.id, p.club_id, true, true
FROM profiles p
WHERE p.club_id IS NOT NULL
ON CONFLICT (user_id, club_id)
DO UPDATE SET is_accepted = true, is_preferred = EXCLUDED.is_preferred;

-- 2) Club name (profiles.club)
WITH matched AS (
  SELECT DISTINCT ON (p.id)
    p.id AS user_id,
    c.id AS club_id
  FROM profiles p
  JOIN clubs c ON c.name ILIKE p.club
  WHERE p.club_id IS NULL
    AND p.club IS NOT NULL
    AND p.club <> ''
  ORDER BY p.id, length(c.name)
)
INSERT INTO user_clubs (user_id, club_id, is_accepted, is_preferred)
SELECT m.user_id, m.club_id, true, true
FROM matched m
ON CONFLICT (user_id, club_id)
DO UPDATE SET is_accepted = true;

-- 3) Home club name (profiles.home_club)
WITH matched AS (
  SELECT DISTINCT ON (p.id)
    p.id AS user_id,
    c.id AS club_id
  FROM profiles p
  JOIN clubs c ON c.name ILIKE p.home_club
  WHERE p.club_id IS NULL
    AND p.home_club IS NOT NULL
    AND p.home_club <> ''
  ORDER BY p.id, length(c.name)
)
INSERT INTO user_clubs (user_id, club_id, is_accepted, is_preferred)
SELECT m.user_id, m.club_id, true, false
FROM matched m
ON CONFLICT (user_id, club_id)
DO UPDATE SET is_accepted = true;

-- 4) comfort radius from legacy
UPDATE profiles
SET comfort_radius_km = COALESCE(comfort_radius_km, rayon_km)
WHERE comfort_radius_km IS NULL AND rayon_km IS NOT NULL;
