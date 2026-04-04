import { haversineKm } from './geography';

/** Valeurs autorisées pour le filtre distance (UI). */
export const RADIUS_OPTIONS_KM = [10, 25, 50];

/**
 * Rayon affiché / log par défaut.
 * @param { { radius_km?: number | null } | null | undefined } filters
 * @returns {number}
 */
export function getEffectiveRadius(filters) {
  return filters?.radius_km ?? 25;
}

/**
 * Plafond distance pour filtrer (null = illimité, pas de filtre par distance).
 * @param { { radius_km?: number | null } | null | undefined } filters
 * @returns {number | null}
 */
export function getRadiusFilterCapKm(filters) {
  const v = filters?.radius_km;
  if (v === null) return null;
  return v ?? 25;
}

/** Migre d’anciennes valeurs (slider / search_radius_km) vers 10 | 25 | 50 | null. */
export function normalizeStoredRadiusKm(raw) {
  if (raw === null || raw === 'null') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 25;
  if (n <= 0) return null;
  if (n <= 15) return 10;
  if (n <= 37) return 25;
  if (n <= 75) return 50;
  return 50;
}

export function getDistanceKm(lat1, lng1, lat2, lng2) {
  if (
    lat1 == null ||
    lng1 == null ||
    lat2 == null ||
    lng2 == null ||
    !Number.isFinite(Number(lat1)) ||
    !Number.isFinite(Number(lng1)) ||
    !Number.isFinite(Number(lat2)) ||
    !Number.isFinite(Number(lng2))
  ) {
    return Infinity;
  }
  return haversineKm(
    { lat: Number(lat1), lng: Number(lng1) },
    { lat: Number(lat2), lng: Number(lng2) }
  );
}

/**
 * @param {{ lat?: number, lng?: number } | null} user
 * @param {{ lat?: number, lng?: number } | null} club
 * @param {number | null | undefined} radius null / non fini → pas de filtre (toujours true si coords valides)
 */
export function isWithinRadius(user, club, radius) {
  if (radius == null || !Number.isFinite(radius) || radius <= 0) return true;
  if (!user || !club) return false;
  const distance = getDistanceKm(user.lat, user.lng, club.lat, club.lng);
  if (!Number.isFinite(distance)) return false;
  return distance <= radius;
}

/**
 * Tous les clubs avec distance ; filtre par rayon si `radiusKm` fini ; tri par distance croissante.
 * @param {{ lat: number, lng: number } | null} refPoint
 * @param {Array<{ lat?: number, lng?: number, name?: string }>} clubs
 * @param {number | null | undefined} radiusKm null = pas de filtre distance
 */
export function filterAndSortClubsByRadius(refPoint, clubs, radiusKm) {
  const list = Array.isArray(clubs) ? clubs : [];
  if (!refPoint || refPoint.lat == null || refPoint.lng == null) {
    return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));
  }
  const enriched = list.map((c) => ({
    ...c,
    distanceKm:
      c.lat != null && c.lng != null
        ? getDistanceKm(refPoint.lat, refPoint.lng, c.lat, c.lng)
        : Infinity,
  }));
  let out = enriched;
  if (radiusKm != null && Number.isFinite(radiusKm) && radiusKm > 0) {
    out = out.filter((c) => Number.isFinite(c.distanceKm) && c.distanceKm <= radiusKm);
  }
  return [...out].sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
}

export function logMatchFilterResults(payload) {
  const r = payload?.radius;
  console.log({
    radius: r === null ? null : typeof r === 'number' ? r : 25,
    results_count: payload?.results_count ?? 0,
    ...payload,
  });
}

/**
 * Log produit : rayon effectif pour l’affichage (défaut 25 si non défini).
 */
export function logClubRadiusFilter(payload) {
  const filters = payload?.filters;
  console.log({
    players_count: payload?.players_count ?? 0,
    clubs_found: payload?.clubs_found ?? 0,
    radius: getEffectiveRadius(filters),
  });
}
