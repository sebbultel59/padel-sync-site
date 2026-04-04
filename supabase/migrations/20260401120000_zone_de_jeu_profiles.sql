-- Zone de jeu : référence géo stable + rayon + override GPS (profil)
-- + fonctions resolve_user_geo_point / get_user_geo_settings

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS geo_ref_type text,
  ADD COLUMN IF NOT EXISTS geo_ref_lat double precision,
  ADD COLUMN IF NOT EXISTS geo_ref_lng double precision,
  ADD COLUMN IF NOT EXISTS geo_ref_label text,
  ADD COLUMN IF NOT EXISTS geo_radius_km integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS geo_use_live_location boolean NOT NULL DEFAULT false;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_geo_ref_type_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_geo_ref_type_check
  CHECK (geo_ref_type IS NULL OR geo_ref_type IN ('city', 'club', 'custom', 'gps'));

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_geo_radius_km_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_geo_radius_km_check
  CHECK (geo_radius_km >= 5 AND geo_radius_km <= 120);

COMMENT ON COLUMN profiles.geo_ref_type IS 'city | club | custom | gps — origine de la position de référence';
COMMENT ON COLUMN profiles.geo_ref_lat IS 'Latitude de référence (hors override GPS)';
COMMENT ON COLUMN profiles.geo_ref_lng IS 'Longitude de référence (hors override GPS)';
COMMENT ON COLUMN profiles.geo_ref_label IS 'Libellé affiché (ex. ville, nom du club)';
COMMENT ON COLUMN profiles.geo_radius_km IS 'Distance max pour suggestions / filtres (km)';
COMMENT ON COLUMN profiles.geo_use_live_location IS 'Si true, le client utilise la position GPS quand disponible';

-- Backfill : club préféré d’abord, puis centre de zone
UPDATE profiles p
SET
  geo_ref_lat = c.lat,
  geo_ref_lng = c.lng,
  geo_ref_label = c.name,
  geo_ref_type = 'club'
FROM user_clubs uc
JOIN clubs c ON c.id = uc.club_id
WHERE uc.user_id = p.id
  AND uc.is_accepted = true
  AND uc.is_preferred = true
  AND c.lat IS NOT NULL
  AND c.lng IS NOT NULL
  AND p.geo_ref_lat IS NULL;

UPDATE profiles p
SET
  geo_ref_lat = z.lat_center,
  geo_ref_lng = z.lng_center,
  geo_ref_label = z.name,
  geo_ref_type = 'city'
FROM zones z
WHERE p.zone_id = z.id
  AND z.lat_center IS NOT NULL
  AND z.lng_center IS NOT NULL
  AND p.geo_ref_lat IS NULL;

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
  v_club_lat double precision;
  v_club_lng double precision;
  z_lat double precision;
  z_lng double precision;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::double precision, NULL::double precision, 'none'::text;
    RETURN;
  END IF;

  IF COALESCE(v_profile.geo_use_live_location, false)
     AND p_live_lat IS NOT NULL
     AND p_live_lng IS NOT NULL THEN
    RETURN QUERY SELECT p_live_lat, p_live_lng, 'live'::text;
    RETURN;
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

CREATE OR REPLACE FUNCTION public.get_user_geo_settings(
  p_user_id uuid,
  p_live_lat double precision DEFAULT NULL,
  p_live_lng double precision DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lat double precision;
  v_lng double precision;
  v_source text;
  v_radius integer;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT r.lat, r.lng, r.source
  INTO v_lat, v_lng, v_source
  FROM resolve_user_geo_point(p_user_id, p_live_lat, p_live_lng) AS r(lat, lng, source);

  SELECT geo_radius_km INTO v_radius FROM profiles WHERE id = p_user_id;
  IF v_radius IS NULL THEN
    v_radius := 30;
  END IF;

  RETURN jsonb_build_object(
    'lat', v_lat,
    'lng', v_lng,
    'source', v_source,
    'radius_km', v_radius
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_user_geo_point(uuid, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_geo_settings(uuid, double precision, double precision) TO authenticated;
