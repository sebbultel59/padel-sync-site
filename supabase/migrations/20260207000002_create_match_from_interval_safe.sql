-- Migration: create_match_from_interval_safe with zone + clubs-first
-- Date: 2026-02-07

CREATE OR REPLACE FUNCTION create_match_from_interval_safe(
  p_group UUID,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_user_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_id UUID;
  v_time_slot_id UUID;
  v_user_id UUID;
  v_ids UUID[];
  v_zone_id UUID;
  v_zone_count INTEGER;
  v_player_count INTEGER;
  v_common_club UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;

  v_ids := ARRAY(
    SELECT DISTINCT unnest(ARRAY_APPEND(COALESCE(p_user_ids, '{}'), v_user_id))
  );
  v_player_count := COALESCE(array_length(v_ids, 1), 0);
  IF v_player_count < 4 THEN
    RAISE EXCEPTION 'Il faut 4 joueurs pour créer un match';
  END IF;

  SELECT COUNT(DISTINCT zone_id), MIN(zone_id)
  INTO v_zone_count, v_zone_id
  FROM profiles
  WHERE id = ANY(v_ids);

  IF v_zone_id IS NULL OR v_zone_count <> 1 THEN
    RAISE EXCEPTION 'Tous les joueurs doivent avoir la même zone';
  END IF;

  WITH accepted AS (
    SELECT uc.user_id, uc.club_id, uc.is_preferred
    FROM user_clubs uc
    JOIN clubs c ON c.id = uc.club_id
    WHERE uc.is_accepted = true
      AND uc.user_id = ANY(v_ids)
      AND c.zone_id = v_zone_id
  ),
  counts AS (
    SELECT club_id,
           COUNT(DISTINCT user_id) AS cnt,
           SUM(CASE WHEN is_preferred THEN 1 ELSE 0 END) AS pref_cnt
    FROM accepted
    GROUP BY club_id
  )
  SELECT club_id
  INTO v_common_club
  FROM counts
  WHERE cnt = v_player_count
  ORDER BY pref_cnt DESC, club_id
  LIMIT 1;

  IF v_common_club IS NULL THEN
    RAISE EXCEPTION 'Aucun club commun sélectionné';
  END IF;

  INSERT INTO time_slots (group_id, starts_at, ends_at)
  VALUES (p_group, p_starts_at, p_ends_at)
  RETURNING id INTO v_time_slot_id;

  v_match_id := gen_random_uuid();
  INSERT INTO matches (id, group_id, time_slot_id, status, created_by, created_at, club_id, zone_id)
  VALUES (v_match_id, p_group, v_time_slot_id, 'pending', v_user_id, NOW(), v_common_club, v_zone_id);

  RETURN v_match_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_match_from_interval_safe(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) TO authenticated;
