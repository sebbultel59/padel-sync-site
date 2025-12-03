// lib/rating.ts
// Système de rating et niveaux pour Padel Sync

/**
 * Tranches de rating pour les niveaux 1 à 8
 * Format: [min, max] (inclusif)
 */
export const LEVELS = [
  { level: 1, min: 0, max: 12.4 },      // Niveau 1 : 0-12.4
  { level: 2, min: 12.5, max: 24.9 },   // Niveau 2 : 12.5-24.9
  { level: 3, min: 25.0, max: 37.4 },   // Niveau 3 : 25.0-37.4
  { level: 4, min: 37.5, max: 49.9 },   // Niveau 4 : 37.5-49.9
  { level: 5, min: 50.0, max: 62.4 },   // Niveau 5 : 50.0-62.4
  { level: 6, min: 62.5, max: 74.9 },   // Niveau 6 : 62.5-74.9
  { level: 7, min: 75.0, max: 87.4 },   // Niveau 7 : 75.0-87.4
  { level: 8, min: 87.5, max: 100 },     // Niveau 8 : 87.5-100
] as const;

/**
 * Constante de base pour le calcul du delta de rating (facteur K)
 */
const K_BASE = 2;

/**
 * Clampe un rating entre 0 et 100
 */
function clampRating(rating: number): number {
  return Math.max(0, Math.min(100, rating));
}

/**
 * Convertit un rating en niveau et XP (progression dans le niveau)
 * @param rating - Rating du joueur (0-100)
 * @returns { level: number; xp: number } - Niveau (1-8) et XP (0-100, progression dans le niveau)
 */
export function ratingToLevelAndXp(rating: number): { level: number; xp: number } {
  const clampedRating = clampRating(rating);

  // Trouver le niveau correspondant
  for (const levelData of LEVELS) {
    if (clampedRating >= levelData.min && clampedRating <= levelData.max) {
      // Calculer l'XP (progression de 0 à 100 dans le niveau)
      const range = levelData.max - levelData.min;
      const progress = clampedRating - levelData.min;
      const xp = range > 0 ? (progress / range) * 100 : 0;

      return {
        level: levelData.level,
        xp: Math.round(xp * 100) / 100, // Arrondir à 2 décimales
      };
    }
  }

  // Cas limite : rating exactement à 100 (niveau 8, XP 100)
  if (clampedRating >= 100) {
    return { level: 8, xp: 100 };
  }

  // Par défaut (ne devrait jamais arriver)
  return { level: 1, xp: 0 };
}

/**
 * Retourne le rating initial pour un niveau déclaré
 * Utilise le milieu de la tranche comme rating initial
 * @param level - Niveau déclaré (1-8)
 * @returns Rating initial (0-100)
 */
export function initialRatingFromDeclaredLevel(level: number): number {
  const validLevel = Math.max(1, Math.min(8, Math.round(level)));
  const levelData = LEVELS[validLevel - 1];

  if (!levelData) {
    return 0; // Par défaut niveau 1
  }

  // Retourner le milieu de la tranche
  return (levelData.min + levelData.max) / 2;
}

/**
 * Calcule le score attendu (probabilité de victoire) basé sur les ratings
 * Utilise la formule Elo adaptée pour un rating 0-100
 * @param rPlayer - Rating du joueur/équipe
 * @param rOpponent - Rating de l'adversaire/équipe adverse
 * @returns Score attendu (0-1), où 1 = victoire certaine, 0 = défaite certaine
 */
export function expectedScore(rPlayer: number, rOpponent: number): number {
  const clampedPlayer = clampRating(rPlayer);
  const clampedOpponent = clampRating(rOpponent);

  // Formule Elo adaptée : E = 1 / (1 + 10^((opponent - player) / scale))
  // Pour un rating 0-100, on utilise une échelle adaptée (diviseur de 25 pour avoir une courbe raisonnable)
  const ratingDiff = clampedOpponent - clampedPlayer;
  const scale = 25; // Facteur d'échelle pour la courbe

  const expected = 1 / (1 + Math.pow(10, ratingDiff / scale));
  return Math.max(0, Math.min(1, expected)); // Clamper entre 0 et 1
}

/**
 * Type pour le contexte du match
 */
export type MatchContext = {
  matchType: 'ranked' | 'friendly' | 'tournament';
  resultType: 'normal' | 'wo' | 'retire' | 'interrupted';
};

/**
 * Calcule le delta de rating (changement de rating) après un match
 * @param rTeam - Rating de l'équipe/joueur
 * @param rOpp - Rating de l'équipe/joueur adverse
 * @param won - true si victoire, false si défaite
 * @param ctx - Contexte du match (type de match et type de résultat)
 * @returns Delta de rating (peut être positif ou négatif)
 */
export function computeRatingDelta(
  rTeam: number,
  rOpp: number,
  won: boolean,
  ctx: MatchContext
): number {
  // Friendly et interrupted → delta = 0
  if (ctx.matchType === 'friendly' || ctx.resultType === 'interrupted') {
    return 0;
  }

  // Calculer le score attendu
  const expected = expectedScore(rTeam, rOpp);

  // Score réel : 1 pour victoire, 0 pour défaite
  const actual = won ? 1 : 0;

  // Delta de base : K * (score réel - score attendu)
  let delta = K_BASE * (actual - expected);

  // Bonus pour les matchs tournament (×1.2)
  if (ctx.matchType === 'tournament') {
    delta *= 1.2;
  }

  // Réduction pour les matchs wo ou retire (×0.7)
  if (ctx.resultType === 'wo' || ctx.resultType === 'retire') {
    delta *= 0.7;
  }

  return Math.round(delta * 100) / 100; // Arrondir à 2 décimales
}


