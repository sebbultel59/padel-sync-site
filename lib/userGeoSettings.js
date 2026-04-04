/**
 * Point de départ géographique — une seule source active (profiles.geo_active_source).
 * Valeurs : address | club | live — aligné avec resolve_user_geo_point (SQL).
 */

export const GEO_PLAY_RADIUS_OPTIONS_KM = [10, 20, 30, 40, 50];

/** @typedef {'address' | 'club' | 'live'} GeoActiveSource */

export const GEO_ACTIVE_SOURCE = {
  ADDRESS: 'address',
  CLUB: 'club',
  LIVE: 'live',
};

const DEBUG = typeof __DEV__ !== 'undefined' && __DEV__;

/**
 * @param {number | null | undefined} km
 * @returns {number}
 */
export function normalizeGeoRadiusKm(km) {
  const n = Number(km);
  if (!Number.isFinite(n)) return 30;
  const allowed = GEO_PLAY_RADIUS_OPTIONS_KM;
  return allowed.reduce((best, o) => (Math.abs(o - n) < Math.abs(best - n) ? o : best), 30);
}

/**
 * Rétrocompat profils sans geo_active_source.
 * @param {Record<string, unknown> | null | undefined} profile
 * @returns {GeoActiveSource}
 */
export function inferLegacyGeoActiveSource(profile) {
  if (!profile) return GEO_ACTIVE_SOURCE.CLUB;
  if (profile.geo_active_source === 'address' || profile.geo_active_source === 'club' || profile.geo_active_source === 'live') {
    return profile.geo_active_source;
  }
  if (profile.geo_use_live_location) return GEO_ACTIVE_SOURCE.LIVE;
  if (profile.geo_ref_type === 'club') return GEO_ACTIVE_SOURCE.CLUB;
  if (profile.geo_ref_type === 'custom' || profile.geo_ref_type === 'city') return GEO_ACTIVE_SOURCE.ADDRESS;
  return GEO_ACTIVE_SOURCE.CLUB;
}

/**
 * Patch Supabase pour appliquer une source active (met à jour geo_ref + geo_use_live_location).
 * @param {GeoActiveSource} source
 * @param {{ addressHome?: { lat?: number; lng?: number; address?: string } | null; preferredClubGeo?: { lat: number; lng: number; name?: string } | null; addressLabel?: string }} ctx
 * @returns {Record<string, unknown> | null} null si données insuffisantes pour cette source
 */
export function buildGeoPatchForActiveSource(source, ctx) {
  const { addressHome, preferredClubGeo, addressLabel } = ctx || {};
  const base = { geo_active_source: source };

  if (source === GEO_ACTIVE_SOURCE.LIVE) {
    return {
      ...base,
      geo_use_live_location: true,
    };
  }

  const offLive = {
    ...base,
    geo_use_live_location: false,
  };

  if (source === GEO_ACTIVE_SOURCE.CLUB) {
    if (!preferredClubGeo || preferredClubGeo.lat == null || preferredClubGeo.lng == null) return null;
    return {
      ...offLive,
      geo_ref_type: 'club',
      geo_ref_lat: preferredClubGeo.lat,
      geo_ref_lng: preferredClubGeo.lng,
      geo_ref_label: preferredClubGeo.name || 'Club',
    };
  }

  if (source === GEO_ACTIVE_SOURCE.ADDRESS) {
    if (!addressHome || addressHome.lat == null || addressHome.lng == null) return null;
    return {
      ...offLive,
      geo_ref_type: 'custom',
      geo_ref_lat: addressHome.lat,
      geo_ref_lng: addressHome.lng,
      geo_ref_label: (addressLabel || '').trim() || 'Mon adresse',
    };
  }

  return null;
}

/**
 * @param {{
 *   geo_active_source?: string | null;
 *   geo_use_live_location?: boolean | null;
 *   geo_ref_type?: string | null;
 *   geo_ref_lat?: number | null;
 *   geo_ref_lng?: number | null;
 * } | null} profile
 * @param {{ lat?: number | null; lng?: number | null } | null} zone
 * @param {{ lat?: number | null; lng?: number | null; name?: string | null } | null} preferredClub
 * @param {{ lat?: number | null; lng?: number | null; address?: string | null } | null} addressHome
 * @param {{ lat: number; lng: number } | null} liveCoords
 * @param {'granted' | 'denied' | null | undefined} locationPermission
 * @returns {{ lat: number | null; lng: number | null; source: 'live' | 'profile' | 'club' | 'zone' | 'none'; activeSource: GeoActiveSource }}
 */
export function resolveUserGeoPoint({
  profile,
  zone,
  preferredClub,
  addressHome,
  liveCoords,
  locationPermission,
}) {
  const active = inferLegacyGeoActiveSource(profile);

  if (
    active === GEO_ACTIVE_SOURCE.LIVE &&
    !!profile?.geo_use_live_location &&
    locationPermission === 'granted' &&
    liveCoords &&
    liveCoords.lat != null &&
    liveCoords.lng != null
  ) {
    return {
      lat: Number(liveCoords.lat),
      lng: Number(liveCoords.lng),
      source: 'live',
      activeSource: active,
    };
  }

  if (active === GEO_ACTIVE_SOURCE.CLUB) {
    if (
      preferredClub &&
      preferredClub.lat != null &&
      preferredClub.lng != null &&
      Number.isFinite(Number(preferredClub.lat)) &&
      Number.isFinite(Number(preferredClub.lng))
    ) {
      return {
        lat: Number(preferredClub.lat),
        lng: Number(preferredClub.lng),
        source: 'club',
        activeSource: active,
      };
    }
    const refLat = profile?.geo_ref_lat;
    const refLng = profile?.geo_ref_lng;
    if (
      profile?.geo_ref_type === 'club' &&
      refLat != null &&
      refLng != null &&
      Number.isFinite(Number(refLat)) &&
      Number.isFinite(Number(refLng))
    ) {
      return {
        lat: Number(refLat),
        lng: Number(refLng),
        source: 'club',
        activeSource: active,
      };
    }
  }

  if (active === GEO_ACTIVE_SOURCE.ADDRESS) {
    const ahLat = addressHome?.lat;
    const ahLng = addressHome?.lng;
    if (
      ahLat != null &&
      ahLng != null &&
      Number.isFinite(Number(ahLat)) &&
      Number.isFinite(Number(ahLng))
    ) {
      return {
        lat: Number(ahLat),
        lng: Number(ahLng),
        source: 'profile',
        activeSource: active,
      };
    }
    const refLat = profile?.geo_ref_lat;
    const refLng = profile?.geo_ref_lng;
    if (
      (profile?.geo_ref_type === 'custom' || profile?.geo_ref_type === 'city') &&
      refLat != null &&
      refLng != null
    ) {
      return {
        lat: Number(refLat),
        lng: Number(refLng),
        source: 'profile',
        activeSource: active,
      };
    }
  }

  const refLat = profile?.geo_ref_lat;
  const refLng = profile?.geo_ref_lng;
  if (refLat != null && refLng != null && Number.isFinite(Number(refLat)) && Number.isFinite(Number(refLng))) {
    return {
      lat: Number(refLat),
      lng: Number(refLng),
      source: 'profile',
      activeSource: active,
    };
  }

  if (
    preferredClub &&
    preferredClub.lat != null &&
    preferredClub.lng != null &&
    Number.isFinite(Number(preferredClub.lat)) &&
    Number.isFinite(Number(preferredClub.lng))
  ) {
    return {
      lat: Number(preferredClub.lat),
      lng: Number(preferredClub.lng),
      source: 'club',
      activeSource: active,
    };
  }

  if (
    zone &&
    zone.lat_center != null &&
    zone.lng_center != null &&
    Number.isFinite(Number(zone.lat_center)) &&
    Number.isFinite(Number(zone.lng_center))
  ) {
    return {
      lat: Number(zone.lat_center),
      lng: Number(zone.lng_center),
      source: 'zone',
      activeSource: active,
    };
  }

  return { lat: null, lng: null, source: 'none', activeSource: active };
}

/**
 * @param {object} params
 * @returns {{ lat: number | null; lng: number | null; source: string; radius_km: number; activeSource: GeoActiveSource }}
 */
export function getUserGeoSettings(params) {
  const { profile, ...rest } = params || {};
  const point = resolveUserGeoPoint({ profile, ...rest });
  const radius_km = normalizeGeoRadiusKm(profile?.geo_radius_km);
  return {
    ...point,
    radius_km,
  };
}

export function logUserGeoDebug(label, payload) {
  if (!DEBUG) return;
  // eslint-disable-next-line no-console
  console.log(`[ZoneDeJeu] ${label}`, {
    source: payload?.source,
    activeSource: payload?.activeSource,
    lat: payload?.lat,
    lng: payload?.lng,
    radius_km: payload?.radius_km,
  });
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ lat?: number; lng?: number } | null} liveCoords
 */
export async function fetchUserGeoSettingsFromServer(supabase, userId, liveCoords = null) {
  const { data, error } = await supabase.rpc('get_user_geo_settings', {
    p_user_id: userId,
    p_live_lat: liveCoords?.lat ?? null,
    p_live_lng: liveCoords?.lng ?? null,
  });
  if (error) throw error;
  return data;
}
