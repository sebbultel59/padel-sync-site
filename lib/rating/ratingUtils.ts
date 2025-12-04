/**
 * Utilitaires pour le système de rating
 */

/**
 * Convertit un rating (0-100) en niveau (1-8) et XP (0-100)
 * 
 * @param rating Rating du joueur (0-100)
 * @returns Objet avec level (1-8) et xp (0-100)
 */
export function ratingToLevelAndXp(rating: number): { level: number; xp: number } {
  const clampedRating = Math.max(0, Math.min(100, rating));

  const LEVELS = [
    { level: 1, min: 0, max: 12.4 },
    { level: 2, min: 12.5, max: 24.9 },
    { level: 3, min: 25.0, max: 37.4 },
    { level: 4, min: 37.5, max: 49.9 },
    { level: 5, min: 50.0, max: 62.4 },
    { level: 6, min: 62.5, max: 74.9 },
    { level: 7, min: 75.0, max: 87.4 },
    { level: 8, min: 87.5, max: 100 },
  ];

  for (const levelData of LEVELS) {
    if (clampedRating >= levelData.min && clampedRating <= levelData.max) {
      const range = levelData.max - levelData.min;
      const progress = clampedRating - levelData.min;
      const xp = range > 0 ? (progress / range) * 100 : 0;
      return {
        level: levelData.level,
        xp: Math.round(xp * 100) / 100,
      };
    }
  }

  if (clampedRating >= 100) {
    return { level: 8, xp: 100 };
  }

  return { level: 1, xp: 0 };
}

