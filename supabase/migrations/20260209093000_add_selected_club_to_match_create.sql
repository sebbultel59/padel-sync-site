-- Migration: allow selected club for match creation
-- Date: 2026-02-09

DROP FUNCTION IF EXISTS create_match_from_interval_safe(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID[]);
DROP FUNCTION IF EXISTS create_match_with_players(UUID, UUID, UUID[]);

CREATE OR REPLACE FUNCTION create_match_from_interval_safe(
  p_group UUID,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_user_ids UUID[],
  p_club_id UUID DEFAULT NULL
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
    AND (p_club_id IS NULL OR club_id = p_club_id)
  ORDER BY pref_cnt DESC, club_id
  LIMIT 1;

  IF v_common_club IS NULL THEN
    IF p_club_id IS NOT NULL THEN
      RAISE EXCEPTION 'Club choisi non commun';
    END IF;
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

CREATE OR REPLACE FUNCTION create_match_with_players(
  p_group UUID,
  p_time_slot UUID,
  p_user_ids UUID[],
  p_club_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_id UUID;
  v_slot_group_id UUID;
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

  SELECT group_id INTO v_slot_group_id
  FROM time_slots
  WHERE id = p_time_slot;

  IF v_slot_group_id IS NULL THEN
    NULL;
  ELSIF v_slot_group_id <> p_group THEN
    RAISE EXCEPTION 'Le time_slot ne correspond pas au groupe';
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
    AND (p_club_id IS NULL OR club_id = p_club_id)
  ORDER BY pref_cnt DESC, club_id
  LIMIT 1;

  IF v_common_club IS NULL THEN
    IF p_club_id IS NOT NULL THEN
      RAISE EXCEPTION 'Club choisi non commun';
    END IF;
    RAISE EXCEPTION 'Aucun club commun sélectionné';
  END IF;

  SELECT id INTO v_match_id
  FROM matches
  WHERE group_id = p_group
    AND time_slot_id = p_time_slot
  LIMIT 1;

  IF v_match_id IS NULL THEN
    v_match_id := gen_random_uuid();
    INSERT INTO matches (id, group_id, time_slot_id, status, created_by, created_at, club_id, zone_id)
    VALUES (v_match_id, p_group, p_time_slot, 'confirmed', v_user_id, NOW(), v_common_club, v_zone_id);
  ELSE
    UPDATE matches
    SET status = 'confirmed',
        club_id = v_common_club,
        zone_id = v_zone_id
    WHERE id = v_match_id;
  END IF;

  INSERT INTO match_rsvps (match_id, user_id, status)
  SELECT v_match_id, uid, 'accepted'
  FROM unnest(v_ids) AS uid
  ON CONFLICT (match_id, user_id)
  DO UPDATE SET status = 'accepted';

  RETURN v_match_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_match_from_interval_safe(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID[], UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_match_with_players(UUID, UUID, UUID[], UUID) TO authenticated;
