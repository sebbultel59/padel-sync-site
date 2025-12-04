/**
 * Calculateur de rating Elo simplifié pour Padel Sync
 * 
 * Système adapté pour une échelle 0-100 avec formule :
 * rating_new = rating_old + K * (result - expected)
 * 
 * où:
 * - result = 1 pour victoire, 0 pour défaite
 * - expected = probabilité de victoire basée sur les ratings moyens des équipes
 * - K = facteur de volatilité (8-16 recommandé)
 */

// ============================================================================
// Types
// ============================================================================

export type PlayerRating = {
  userId: string;
  rating: number;
};

export type MatchSide = {
  players: PlayerRating[];
};

export type MatchResultInput = {
  team1: MatchSide;
  team2: MatchSide;
  winnerTeam: 1 | 2;
  matchType?: MatchType; // Optionnel, défaut 'ranked'
};

export type RatingUpdate = {
  userId: string;
  ratingBefore: number;
  ratingAfter: number;
  delta: number;
  win: boolean;
};

// ============================================================================
// Constantes
// ============================================================================

/**
 * Facteur K pour le calcul Elo
 * - K élevé = changements plus rapides (plus volatil)
 * - K faible = changements plus lents (plus stable)
 * 
 * Pour une échelle 0-100, K entre 8 et 16 est raisonnable
 * 
 * Note: Le K peut être ajusté selon le type de match (tournament = plus important)
 */
const K_FACTOR_BASE = 12;

/**
 * Facteur K par type de match
 */
const K_FACTORS = {
  ranked: K_FACTOR_BASE,
  tournament: K_FACTOR_BASE * 1.2, // +20% pour les tournois
  friendly: 0, // Pas de changement pour les matchs amicaux
} as const;

export type MatchType = 'ranked' | 'tournament' | 'friendly';

/**
 * Diviseur pour le calcul de la probabilité attendue
 * Plus petit = différences de rating plus impactantes
 * Pour une échelle 0-100, 25-30 est approprié (au lieu de 400 pour l'échelle classique)
 */
const RATING_DIVISOR = 25;

/**
 * Bornes du rating
 */
const MIN_RATING = 0;
const MAX_RATING = 100;

/**
 * XP gagné par match
 */
const XP_WIN = 10;
const XP_LOSS = 4;

// ============================================================================
// Fonctions utilitaires
// ============================================================================

/**
 * Calcule le rating moyen d'une équipe
 */
function calculateTeamAverageRating(team: MatchSide): number {
  if (team.players.length === 0) {
    return 50; // Rating par défaut si pas de joueurs
  }
  
  const sum = team.players.reduce((acc, player) => acc + player.rating, 0);
  return sum / team.players.length;
}

/**
 * Calcule la probabilité attendue de victoire pour team1
 * Utilise la formule Elo standard adaptée pour échelle 0-100
 * 
 * @param team1Rating Rating moyen de l'équipe 1
 * @param team2Rating Rating moyen de l'équipe 2
 * @returns Probabilité de victoire de l'équipe 1 (entre 0 et 1)
 */
function calculateExpectedWinProbability(
  team1Rating: number,
  team2Rating: number
): number {
  const ratingDiff = team2Rating - team1Rating;
  const exponent = ratingDiff / RATING_DIVISOR;
  const expected = 1 / (1 + Math.pow(10, exponent));
  
  return expected;
}

/**
 * Applique les bornes au rating (0-100)
 */
function clampRating(rating: number): number {
  return Math.max(MIN_RATING, Math.min(MAX_RATING, rating));
}

/**
 * Calcule le nouveau rating pour un joueur
 * 
 * @param currentRating Rating actuel du joueur
 * @param teamAverageRating Rating moyen de son équipe
 * @param opponentAverageRating Rating moyen de l'équipe adverse
 * @param won true si son équipe a gagné
 * @param matchType Type de match (pour ajuster le K)
 * @returns Nouveau rating (borné entre 0 et 100)
 */
function calculateNewRating(
  currentRating: number,
  teamAverageRating: number,
  opponentAverageRating: number,
  won: boolean,
  matchType: MatchType = 'ranked'
): number {
  // Récupérer le K approprié selon le type de match
  const kFactor = K_FACTORS[matchType];
  
  // Si match amical, pas de changement de rating
  if (kFactor === 0) {
    return currentRating;
  }
  
  // Calculer la probabilité attendue de victoire pour l'équipe du joueur
  const expected = calculateExpectedWinProbability(
    teamAverageRating,
    opponentAverageRating
  );
  
  // Résultat réel (1 pour victoire, 0 pour défaite)
  const result = won ? 1 : 0;
  
  // Calculer le changement de rating
  const delta = kFactor * (result - expected);
  
  // Appliquer le changement
  const newRating = currentRating + delta;
  
  // Appliquer les bornes
  return clampRating(newRating);
}

// ============================================================================
// Fonction principale
// ============================================================================

/**
 * Calcule les mises à jour de rating pour tous les joueurs d'un match
 * 
 * @param input Résultat du match avec les équipes et le gagnant
 * @returns Tableau des mises à jour de rating pour chaque joueur
 */
export function computeRatingUpdatesForMatch(
  input: MatchResultInput
): RatingUpdate[] {
  const { team1, team2, winnerTeam, matchType = 'ranked' } = input;
  
  // Vérifications de base
  if (team1.players.length === 0 || team2.players.length === 0) {
    throw new Error('Chaque équipe doit avoir au moins un joueur');
  }
  
  // Calculer les ratings moyens des équipes
  const team1Average = calculateTeamAverageRating(team1);
  const team2Average = calculateTeamAverageRating(team2);
  
  // Déterminer quelle équipe a gagné
  const team1Won = winnerTeam === 1;
  const team2Won = winnerTeam === 2;
  
  // Calculer les mises à jour pour tous les joueurs
  const updates: RatingUpdate[] = [];
  
  // Mises à jour pour l'équipe 1
  for (const player of team1.players) {
    const ratingBefore = player.rating;
    const ratingAfter = calculateNewRating(
      ratingBefore,
      team1Average,
      team2Average,
      team1Won,
      matchType
    );
    const delta = ratingAfter - ratingBefore;
    
    updates.push({
      userId: player.userId,
      ratingBefore,
      ratingAfter,
      delta,
      win: team1Won,
    });
  }
  
  // Mises à jour pour l'équipe 2
  for (const player of team2.players) {
    const ratingBefore = player.rating;
    const ratingAfter = calculateNewRating(
      ratingBefore,
      team2Average,
      team1Average,
      team2Won,
      matchType
    );
    const delta = ratingAfter - ratingBefore;
    
    updates.push({
      userId: player.userId,
      ratingBefore,
      ratingAfter,
      delta,
      win: team2Won,
    });
  }
  
  return updates;
}

// ============================================================================
// Fonctions utilitaires pour XP et statistiques
// ============================================================================

/**
 * Calcule le XP gagné pour un match
 * 
 * @param won true si le joueur a gagné
 * @returns XP gagné (10 pour victoire, 4 pour défaite)
 */
export function calculateXpGained(won: boolean): number {
  return won ? XP_WIN : XP_LOSS;
}

/**
 * Type pour les statistiques de match à mettre à jour
 */
export type MatchStatsUpdate = {
  userId: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  xpGained: number;
};

/**
 * Calcule les statistiques de match à mettre à jour pour chaque joueur
 * 
 * @param ratingUpdates Mises à jour de rating (contient déjà l'info win/loss)
 * @returns Tableau des statistiques à mettre à jour
 */
export function calculateMatchStatsUpdates(
  ratingUpdates: RatingUpdate[]
): MatchStatsUpdate[] {
  return ratingUpdates.map((update) => ({
    userId: update.userId,
    matchesPlayed: 1,
    wins: update.win ? 1 : 0,
    losses: update.win ? 0 : 1,
    xpGained: calculateXpGained(update.win),
  }));
}

// ============================================================================
// Fonctions utilitaires pour conversion depuis la structure DB
// ============================================================================

/**
 * Type pour les données de match depuis la base de données
 */
export type MatchResultFromDB = {
  team1_player1_id: string;
  team1_player2_id: string;
  team2_player1_id: string;
  team2_player2_id: string;
  winner_team: 'team1' | 'team2' | null;
};

/**
 * Convertit un résultat de match depuis la structure DB vers MatchResultInput
 * 
 * @param matchResult Résultat depuis la DB
 * @param playerRatings Map des ratings par userId
 * @returns MatchResultInput pour calculateRatingUpdates
 */
export function convertMatchResultFromDB(
  matchResult: MatchResultFromDB,
  playerRatings: Map<string, number>
): MatchResultInput {
  const { team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, winner_team } = matchResult;
  
  if (!winner_team) {
    throw new Error('Le match doit avoir un gagnant pour calculer les ratings');
  }
  
  // Construire les équipes avec leurs ratings
  const team1: MatchSide = {
    players: [
      { userId: team1_player1_id, rating: playerRatings.get(team1_player1_id) ?? 50 },
      { userId: team1_player2_id, rating: playerRatings.get(team1_player2_id) ?? 50 },
    ],
  };
  
  const team2: MatchSide = {
    players: [
      { userId: team2_player1_id, rating: playerRatings.get(team2_player1_id) ?? 50 },
      { userId: team2_player2_id, rating: playerRatings.get(team2_player2_id) ?? 50 },
    ],
  };
  
  return {
    team1,
    team2,
    winnerTeam: winner_team === 'team1' ? 1 : 2,
  };
}

// ============================================================================
// Exemple d'utilisation
// ============================================================================

/**
 * Exemple d'utilisation de la fonction
 * 
 * @example
 * const matchResult: MatchResultInput = {
 *   team1: {
 *     players: [
 *       { userId: 'user1', rating: 50 },
 *       { userId: 'user2', rating: 55 },
 *     ],
 *   },
 *   team2: {
 *     players: [
 *       { userId: 'user3', rating: 60 },
 *       { userId: 'user4', rating: 65 },
 *     ],
 *   },
 *   winnerTeam: 1, // L'équipe 1 a gagné
 * };
 * 
 * const updates = calculateRatingUpdates(matchResult);
 * // updates contient les nouveaux ratings pour chaque joueur
 * 
 * const statsUpdates = calculateMatchStatsUpdates(updates);
 * // statsUpdates contient les stats à ajouter (matches_played, wins, losses, xp)
 */