-- Clubs : filtre par refus (blacklist) au lieu d’une liste d’acceptation obligatoire.
-- is_refused = true → club exclu ; pas de ligne → autorisé (dans le rayon côté app / zone côté SQL).

ALTER TABLE user_clubs
  ADD COLUMN IF NOT EXISTS is_refused boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN user_clubs.is_refused IS 'Si true, le joueur exclut ce club des propositions (hors logique préféré).';

CREATE INDEX IF NOT EXISTS idx_user_clubs_user_refused
  ON user_clubs(user_id)
  WHERE is_refused = true;

-- Utilisateurs sans aucun club « accepté » (ancien modèle) : repartir sans lignes (tout le rayon autorisé par défaut).
DELETE FROM user_clubs uc
WHERE uc.user_id IN (
  SELECT p.id
  FROM profiles p
  WHERE NOT EXISTS (
    SELECT 1 FROM user_clubs x WHERE x.user_id = p.id AND x.is_accepted IS TRUE
  )
);

-- Ancienne whitelist → refus explicites pour les autres clubs actifs de la même zone.
INSERT INTO user_clubs (user_id, club_id, is_accepted, is_preferred, is_refused)
SELECT p.id, c.id, false, false, true
FROM profiles p
JOIN clubs c ON c.zone_id = p.zone_id AND COALESCE(c.is_active, true)
WHERE p.zone_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM user_clubs uc0 WHERE uc0.user_id = p.id AND uc0.is_accepted IS TRUE
  )
  AND NOT EXISTS (
    SELECT 1 FROM user_clubs uc1 WHERE uc1.user_id = p.id AND uc1.club_id = c.id AND uc1.is_accepted IS TRUE
  )
ON CONFLICT (user_id, club_id) DO UPDATE SET
  is_refused = true,
  is_accepted = false,
  is_preferred = user_clubs.is_preferred;

-- Les clubs précédemment acceptés ne sont pas refusés (dont le préféré).
UPDATE user_clubs SET is_refused = false WHERE is_accepted IS TRUE;

-- =============================================================================
-- resolve_user_geo_point : préféré = non refusé
-- =============================================================================
CREATE OR REPLACE FUNCTION public.resolve_user_geo_point(
  p_user_id uuid,
  p_live_lat double precision DEFAULT NULL,
  p_live_lng double precision DEFAULT NULL
)
RETURNS TABLE(lat double precision, lng double precision, source text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_active text;
  v_club_lat double precision;
  v_club_lng double precision;
  z_lat double precision;
  z_lng double precision;
  ah_lat double precision;
  ah_lng double precision;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::double precision, NULL::double precision, 'none'::text;
    RETURN;
  END IF;

  v_active := COALESCE(v_profile.geo_active_source, 'club');

  IF v_active = 'live'
     AND COALESCE(v_profile.geo_use_live_location, false)
     AND p_live_lat IS NOT NULL
     AND p_live_lng IS NOT NULL THEN
    RETURN QUERY SELECT p_live_lat, p_live_lng, 'live'::text;
    RETURN;
  END IF;

  IF v_active = 'club' THEN
    SELECT c.lat, c.lng INTO v_club_lat, v_club_lng
    FROM user_clubs uc
    JOIN clubs c ON c.id = uc.club_id
    WHERE uc.user_id = p_user_id
      AND COALESCE(uc.is_refused, false) = false
      AND uc.is_preferred = true
      AND c.lat IS NOT NULL
      AND c.lng IS NOT NULL
    LIMIT 1;
    IF v_club_lat IS NOT NULL AND v_club_lng IS NOT NULL THEN
      RETURN QUERY SELECT v_club_lat, v_club_lng, 'club'::text;
      RETURN;
    END IF;
    IF v_profile.geo_ref_type = 'club'
       AND v_profile.geo_ref_lat IS NOT NULL
       AND v_profile.geo_ref_lng IS NOT NULL THEN
      RETURN QUERY SELECT v_profile.geo_ref_lat, v_profile.geo_ref_lng, 'club'::text;
      RETURN;
    END IF;
  END IF;

  IF v_active = 'address' THEN
    BEGIN
      ah_lat := (v_profile.address_home->>'lat')::double precision;
      ah_lng := (v_profile.address_home->>'lng')::double precision;
    EXCEPTION WHEN OTHERS THEN
      ah_lat := NULL;
      ah_lng := NULL;
    END;
    IF ah_lat IS NOT NULL AND ah_lng IS NOT NULL THEN
      RETURN QUERY SELECT ah_lat, ah_lng, 'profile'::text;
      RETURN;
    END IF;
    IF v_profile.geo_ref_type IN ('custom', 'city')
       AND v_profile.geo_ref_lat IS NOT NULL
       AND v_profile.geo_ref_lng IS NOT NULL THEN
      RETURN QUERY SELECT v_profile.geo_ref_lat, v_profile.geo_ref_lng, 'profile'::text;
      RETURN;
    END IF;
  END IF;

  IF v_profile.geo_ref_lat IS NOT NULL AND v_profile.geo_ref_lng IS NOT NULL THEN
    RETURN QUERY SELECT v_profile.geo_ref_lat, v_profile.geo_ref_lng, 'profile'::text;
    RETURN;
  END IF;

  SELECT c.lat, c.lng INTO v_club_lat, v_club_lng
  FROM user_clubs uc
  JOIN clubs c ON c.id = uc.club_id
  WHERE uc.user_id = p_user_id
    AND COALESCE(uc.is_refused, false) = false
    AND uc.is_preferred = true
    AND c.lat IS NOT NULL
    AND c.lng IS NOT NULL
  LIMIT 1;

  IF v_club_lat IS NOT NULL AND v_club_lng IS NOT NULL THEN
    RETURN QUERY SELECT v_club_lat, v_club_lng, 'club'::text;
    RETURN;
  END IF;

  SELECT z.lat_center, z.lng_center INTO z_lat, z_lng
  FROM zones z
  WHERE z.id = v_profile.zone_id
  LIMIT 1;

  IF z_lat IS NOT NULL AND z_lng IS NOT NULL THEN
    RETURN QUERY SELECT z_lat, z_lng, 'zone'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT NULL::double precision, NULL::double precision, 'none'::text;
END;
$$;
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
      v_common_club := NULL;
    END IF;
  ELSIF v_group_club IS NOT NULL THEN
    IF p_club_id IS NOT NULL AND EXISTS (SELECT 1 FROM clubs WHERE id = p_club_id) THEN
      v_common_club := p_club_id;
    ELSE
      v_common_club := v_group_club;
    END IF;
  ELSE
    WITH zone_clubs AS (
      SELECT c.id AS club_id
      FROM clubs c
      WHERE c.zone_id = v_zone_id
        AND COALESCE(c.is_active, true)
    ),
    allowed_clubs AS (
      SELECT u.uid AS user_id,
             zc.club_id,
             COALESCE(uc.is_preferred, false) AS is_preferred
      FROM unnest(v_ids) AS u(uid)
      CROSS JOIN zone_clubs zc
      LEFT JOIN user_clubs uc ON uc.user_id = u.uid AND uc.club_id = zc.club_id
      WHERE COALESCE(uc.is_refused, false) = false
    ),
    counts AS (
      SELECT club_id,
             COUNT(DISTINCT user_id) AS cnt,
             SUM(CASE WHEN is_preferred THEN 1 ELSE 0 END) AS pref_cnt
      FROM allowed_clubs
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
  'Crée un match sur un intervalle. Zone = créateur. Club = suggestion / meilleur effort, peut être NULL.';
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
    IF p_club_id IS NOT NULL AND EXISTS (SELECT 1 FROM clubs WHERE id = p_club_id) THEN
      v_common_club := p_club_id;
    ELSE
      v_common_club := v_group_club;
    END IF;
  ELSE
    WITH zone_clubs AS (
      SELECT c.id AS club_id
      FROM clubs c
      WHERE c.zone_id = v_zone_id
        AND COALESCE(c.is_active, true)
    ),
    allowed_clubs AS (
      SELECT u.uid AS user_id,
             zc.club_id,
             COALESCE(uc.is_preferred, false) AS is_preferred
      FROM unnest(v_ids) AS u(uid)
      CROSS JOIN zone_clubs zc
      LEFT JOIN user_clubs uc ON uc.user_id = u.uid AND uc.club_id = zc.club_id
      WHERE COALESCE(uc.is_refused, false) = false
    ),
    counts AS (
      SELECT club_id,
             COUNT(DISTINCT user_id) AS cnt,
             SUM(CASE WHEN is_preferred THEN 1 ELSE 0 END) AS pref_cnt
      FROM allowed_clubs
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

GRANT EXECUTE ON FUNCTION create_match_from_interval_safe(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID[], UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION create_match_with_players(UUID, UUID, UUID[], UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION convert_find_game_search_to_match(uuid) TO authenticated;
