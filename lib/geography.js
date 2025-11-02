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

// Vérifie si un niveau est dans une plage (ex: "1/2", "3/4", etc.)
export function isLevelInRange(level, rangeStr) {
  if (!rangeStr || !Number.isFinite(level)) return false;
  const parts = String(rangeStr).split('/').map(s => Number(s.trim())).filter(n => Number.isFinite(n));
  if (parts.length !== 2) return false;
  const [min, max] = parts.sort((x, y) => x - y);
  return level >= min && level <= max;
}

// Score de compatibilité entre un niveau et une plage (max si dans la plage, sinon selon écart)
export function levelRangeCompatibility(level, rangeStr) {
  if (isLevelInRange(level, rangeStr)) return 100;
  const parts = String(rangeStr).split('/').map(s => Number(s.trim())).filter(n => Number.isFinite(n));
  if (parts.length !== 2) return 0;
  const [min, max] = parts.sort((x, y) => x - y);
  const mid = (min + max) / 2;
  const diff = Math.abs(level - mid);
  if (diff <= 0.5) return 100; // au centre de la plage
  if (diff <= 1.5) return 80;   // à 1 niveau de la plage
  if (diff <= 2.5) return 40;  // à 2 niveaux de la plage
  return 0;
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

// Filtre et trie les clubs avec compatibilité de niveau (plages)
export function filterAndSortClubsWithLevel(clubs, refPoint, radiusKm, minLevel, maxLevel, myLevel, sortBy = 'distance') {
  if (!refPoint || !clubs) return [];
  const withDist = clubs
    .map(c => {
      const distanceKm = haversineKm(refPoint, { lat: c.lat, lng: c.lng });
      // Score de compatibilité niveau si myLevel fourni
      let levelScore = 0;
      if (myLevel != null && minLevel != null && maxLevel != null) {
        // Vérifier si le niveau cible (plage min-max) est compatible avec mon niveau
        const rangeMid = (minLevel + maxLevel) / 2;
        const diff = Math.abs(myLevel - rangeMid);
        if (diff <= 0.5) levelScore = 100;
        else if (diff <= 1.5) levelScore = 80;
        else if (diff <= 2.5) levelScore = 40;
      }
      return { ...c, distanceKm, levelScore };
    })
    .filter(c => c.distanceKm <= radiusKm);
  
  if (sortBy === 'level') {
    return withDist.sort((a, b) => {
      if (b.levelScore !== a.levelScore) return b.levelScore - a.levelScore;
      return a.distanceKm - b.distanceKm;
    });
  }
  return withDist.sort((a, b) => a.distanceKm - b.distanceKm);
}


