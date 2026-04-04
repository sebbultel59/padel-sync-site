-- Source géographique active unique : address | club | live (aligné produit « point de départ »)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS geo_active_source text;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_geo_active_source_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_geo_active_source_check
  CHECK (geo_active_source IS NULL OR geo_active_source IN ('address', 'club', 'live'));

COMMENT ON COLUMN profiles.geo_active_source IS 'Point de départ pour les calculs : address | club | live';

UPDATE profiles
SET geo_active_source = CASE
  WHEN COALESCE(geo_use_live_location, false) THEN 'live'
  WHEN geo_ref_type = 'club' THEN 'club'
  WHEN geo_ref_type IN ('custom', 'city') THEN 'address'
  ELSE 'club'
END
WHERE geo_active_source IS NULL;

UPDATE profiles SET geo_active_source = 'club' WHERE geo_active_source IS NULL;

ALTER TABLE profiles ALTER COLUMN geo_active_source SET DEFAULT 'club';
ALTER TABLE profiles ALTER COLUMN geo_active_source SET NOT NULL;

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
      AND uc.is_accepted = true
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
    AND uc.is_accepted = true
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
