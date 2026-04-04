-- Matching produit : plus d’homogénéité de zone obligatoire ni de club commun strict.
-- Zone du match = zone du créateur (info). Club = meilleur effort (intersection complète,
-- puis club le plus représenté parmi les acceptés, puis p_club_id, sinon NULL).

CREATE OR REPLACE FUNCTION create_match_from_interval_safe(
  p_group UUID,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_user_ids UUID[],
  p_club_id UUID DEFAULT NULL,
  p_from_find_game BOOLEAN DEFAULT FALSE
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
  v_player_count INTEGER;
  v_common_club UUID;
  v_group_club UUID;
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

  SELECT zone_id INTO v_zone_id FROM profiles WHERE id = v_user_id LIMIT 1;

  SELECT club_id INTO v_group_club
  FROM groups
  WHERE id = p_group;

  IF COALESCE(p_from_find_game, false) THEN
    IF p_club_id IS NOT NULL THEN
      SELECT c.id INTO v_common_club
      FROM clubs c
      WHERE c.id = p_club_id;
      IF v_common_club IS NULL THEN
        RAISE EXCEPTION 'Club inconnu';
      END IF;
    ELSIF v_group_club IS NOT NULL THEN
      v_common_club := v_group_club;
    ELSE
      RAISE EXCEPTION 'Club requis pour ce match';
    END IF;
  ELSIF v_group_club IS NOT NULL THEN
    IF p_club_id IS NOT NULL AND p_club_id <> v_group_club THEN
      RAISE EXCEPTION 'Club choisi non commun';
    END IF;
    v_common_club := v_group_club;
  ELSE
    WITH accepted AS (
      SELECT uc.user_id, uc.club_id, uc.is_preferred
      FROM user_clubs uc
      JOIN clubs c ON c.id = uc.club_id
      WHERE uc.is_accepted = true
        AND uc.user_id = ANY(v_ids)
    ),
    counts AS (
      SELECT club_id,
             COUNT(DISTINCT user_id) AS cnt,
             SUM(CASE WHEN is_preferred THEN 1 ELSE 0 END) AS pref_cnt
      FROM accepted
      GROUP BY club_id
    )
    SELECT club_id INTO v_common_club
    FROM counts
    WHERE cnt = v_player_count
      AND (p_club_id IS NULL OR club_id = p_club_id)
    ORDER BY pref_cnt DESC, club_id
    LIMIT 1;

    IF v_common_club IS NULL THEN
      SELECT club_id INTO v_common_club
      FROM counts
      ORDER BY cnt DESC, pref_cnt DESC, club_id
      LIMIT 1;
    END IF;

    IF v_common_club IS NULL AND p_club_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM clubs WHERE id = p_club_id) THEN
        v_common_club := p_club_id;
      END IF;
    END IF;
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

COMMENT ON FUNCTION create_match_from_interval_safe(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID[], UUID, BOOLEAN) IS
  'Crée un match sur un intervalle. Zone = créateur. Club = meilleur effort, peut être NULL.';

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
  v_player_count INTEGER;
  v_common_club UUID;
  v_group_club UUID;
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

  SELECT zone_id INTO v_zone_id FROM profiles WHERE id = v_user_id LIMIT 1;

  SELECT club_id INTO v_group_club
  FROM groups
  WHERE id = p_group;

  IF v_group_club IS NOT NULL THEN
    IF p_club_id IS NOT NULL AND p_club_id <> v_group_club THEN
      RAISE EXCEPTION 'Club choisi non commun';
    END IF;
    v_common_club := v_group_club;
  ELSE
    WITH accepted AS (
      SELECT uc.user_id, uc.club_id, uc.is_preferred
      FROM user_clubs uc
      JOIN clubs c ON c.id = uc.club_id
      WHERE uc.is_accepted = true
        AND uc.user_id = ANY(v_ids)
    ),
    counts AS (
      SELECT club_id,
             COUNT(DISTINCT user_id) AS cnt,
             SUM(CASE WHEN is_preferred THEN 1 ELSE 0 END) AS pref_cnt
      FROM accepted
      GROUP BY club_id
    )
    SELECT club_id INTO v_common_club
    FROM counts
    WHERE cnt = v_player_count
      AND (p_club_id IS NULL OR club_id = p_club_id)
    ORDER BY pref_cnt DESC, club_id
    LIMIT 1;

    IF v_common_club IS NULL THEN
      SELECT club_id INTO v_common_club
      FROM counts
      ORDER BY cnt DESC, pref_cnt DESC, club_id
      LIMIT 1;
    END IF;

    IF v_common_club IS NULL AND p_club_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM clubs WHERE id = p_club_id) THEN
        v_common_club := p_club_id;
      END IF;
    END IF;
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

GRANT EXECUTE ON FUNCTION create_match_from_interval_safe(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID[], UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION create_match_with_players(UUID, UUID, UUID[], UUID) TO authenticated;
