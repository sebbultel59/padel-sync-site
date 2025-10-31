// lib/geography.js

export function haversineKm(a, b) {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return Infinity;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return Math.round(R * c * 10) / 10;
}

export function levelCompatibility(levelA, levelB) {
  const a = Number(levelA);
  const b = Number(levelB);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 40;
  const diff = Math.abs(a - b);
  if (diff === 0) return 100;
  if (diff === 1) return 80;
  return 40;
}

export function filterAndSortClubsByDistance(clubs, point, maxRadiusKm = 100) {
  if (!Array.isArray(clubs) || !point) return [];
  return clubs
    .map(c => ({ ...c, distanceKm: haversineKm(point, { lat: c.lat, lng: c.lng }) }))
    .filter(c => c.distanceKm <= maxRadiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 10);
}

export function filterAndSortPlayers(players, point, myLevel, maxRadiusKm = 100, sortBy = 'distance') {
  if (!Array.isArray(players) || !point) return [];
  const enriched = players
    .map(p => {
      const distanceKm = (p.lat != null && p.lng != null) ? haversineKm(point, { lat: p.lat, lng: p.lng }) : Infinity;
      const levelScore = levelCompatibility(myLevel, p.niveau);
      return { ...p, distanceKm, levelScore };
    })
    .filter(p => p.distanceKm <= maxRadiusKm);
  if (sortBy === 'level') {
    return enriched.sort((a, b) => (b.levelScore - a.levelScore) || (a.distanceKm - b.distanceKm));
  }
  return enriched.sort((a, b) => a.distanceKm - b.distanceKm);
}


