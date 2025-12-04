/**
 * Fonction asynchrone pour mettre à jour les ratings des joueurs après un match
 * 
 * Cette fonction :
 * 1. Récupère le match_result depuis la DB
 * 2. Récupère les ratings actuels des joueurs
 * 3. Calcule les nouveaux ratings via computeRatingUpdatesForMatch
 * 4. Met à jour player_ratings
 * 5. Insère dans rating_history
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  computeRatingUpdatesForMatch,
  calculateMatchStatsUpdates,
  type MatchResultInput,
  type RatingUpdate,
  type MatchType,
} from './eloCalculator';
import { ratingToLevelAndXp } from './ratingUtils';

/**
 * Type pour les données de match_results depuis Supabase
 */
type MatchResultRow = {
  id: string;
  match_id: string;
  match_type: 'friendly' | 'tournament' | 'league' | 'training';
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  team1_player1_id: string;
  team1_player2_id: string;
  team2_player1_id: string;
  team2_player2_id: string;
  winner_team: 'team1' | 'team2' | null;
};

/**
 * Type pour les données de player_ratings depuis Supabase
 */
type PlayerRatingRow = {
  player_id: string;
  rating: number;
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
  level?: number;
  xp?: number;
};

/**
 * Met à jour les ratings des joueurs pour un match donné
 * 
 * @param supabase Client Supabase (avec service role key pour les opérations admin)
 * @param matchId ID du match
 * @returns Résultat de la mise à jour avec les détails
 */
export async function updateRatingsForMatch(
  supabase: SupabaseClient,
  matchId: string
): Promise<{
  success: boolean;
  error?: string;
  updates?: RatingUpdate[];
  stats?: Array<{
    userId: string;
    matchesPlayed: number;
    wins: number;
    losses: number;
    xpGained: number;
  }>;
}> {
  try {
    // 1. Récupérer le match_result
    const { data: matchResult, error: matchResultError } = await supabase
      .from('match_results')
      .select('*')
      .eq('match_id', matchId)
      .eq('status', 'completed')
      .maybeSingle();

    if (matchResultError) {
      console.error('[updateRatingsForMatch] Error fetching match_result:', matchResultError);
      return {
        success: false,
        error: `Erreur lors de la récupération du résultat du match: ${matchResultError.message}`,
      };
    }

    if (!matchResult) {
      return {
        success: false,
        error: `Aucun résultat de match trouvé pour match_id: ${matchId} (ou le match n'est pas encore complété)`,
      };
    }

    const mr = matchResult as MatchResultRow;

    // Vérifier qu'il y a un gagnant
    if (!mr.winner_team) {
      return {
        success: false,
        error: 'Le match n\'a pas de gagnant (match nul ou non terminé)',
      };
    }

    // 2. Récupérer les ratings actuels des 4 joueurs
    const playerIds = [
      mr.team1_player1_id,
      mr.team1_player2_id,
      mr.team2_player1_id,
      mr.team2_player2_id,
    ];

    const { data: ratings, error: ratingsError } = await supabase
      .from('player_ratings')
      .select('player_id, rating, matches_played, wins, losses, draws, level, xp')
      .in('player_id', playerIds);

    if (ratingsError) {
      console.error('[updateRatingsForMatch] Error fetching ratings:', ratingsError);
      return {
        success: false,
        error: `Erreur lors de la récupération des ratings: ${ratingsError.message}`,
      };
    }

    // Créer un Map pour accéder rapidement aux ratings
    const ratingsMap = new Map<string, PlayerRatingRow>();
    (ratings || []).forEach((r) => {
      ratingsMap.set(r.player_id, r as PlayerRatingRow);
    });

    // Créer les ratings manquants (par défaut rating = 50)
    const missingPlayerIds = playerIds.filter((id) => !ratingsMap.has(id));
    if (missingPlayerIds.length > 0) {
      const defaultRating = 50.0;
      const { level, xp } = ratingToLevelAndXp(defaultRating);

      const newRatings = missingPlayerIds.map((player_id) => ({
        player_id,
        rating: defaultRating,
        matches_played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        level,
        xp,
      }));

      const { error: insertError } = await supabase
        .from('player_ratings')
        .insert(newRatings);

      if (insertError) {
        console.error('[updateRatingsForMatch] Error creating missing ratings:', insertError);
        return {
          success: false,
          error: `Erreur lors de la création des ratings manquants: ${insertError.message}`,
        };
      }

      // Recharger les ratings
      const { data: updatedRatings } = await supabase
        .from('player_ratings')
        .select('player_id, rating, matches_played, wins, losses, draws, level, xp')
        .in('player_id', playerIds);

      if (updatedRatings) {
        updatedRatings.forEach((r) => {
          ratingsMap.set(r.player_id, r as PlayerRatingRow);
        });
      }
    }

    // 3. Construire l'input pour computeRatingUpdatesForMatch
    const matchType: MatchType =
      mr.match_type === 'tournament' ? 'tournament' : mr.match_type === 'friendly' ? 'friendly' : 'ranked';

    const matchResultInput: MatchResultInput = {
      team1: {
        players: [
          {
            userId: mr.team1_player1_id,
            rating: ratingsMap.get(mr.team1_player1_id)?.rating ?? 50,
          },
          {
            userId: mr.team1_player2_id,
            rating: ratingsMap.get(mr.team1_player2_id)?.rating ?? 50,
          },
        ],
      },
      team2: {
        players: [
          {
            userId: mr.team2_player1_id,
            rating: ratingsMap.get(mr.team2_player1_id)?.rating ?? 50,
          },
          {
            userId: mr.team2_player2_id,
            rating: ratingsMap.get(mr.team2_player2_id)?.rating ?? 50,
          },
        ],
      },
      winnerTeam: mr.winner_team === 'team1' ? 1 : 2,
      matchType,
    };

    // 4. Calculer les mises à jour de rating
    const ratingUpdates = computeRatingUpdatesForMatch(matchResultInput);
    const statsUpdates = calculateMatchStatsUpdates(ratingUpdates);

    // 5. Mettre à jour player_ratings pour chaque joueur
    for (const update of ratingUpdates) {
      const currentRating = ratingsMap.get(update.userId);
      if (!currentRating) {
        console.warn(`[updateRatingsForMatch] Rating manquant pour joueur ${update.userId}`);
        continue;
      }

      const stats = statsUpdates.find((s) => s.userId === update.userId);
      if (!stats) {
        console.warn(`[updateRatingsForMatch] Stats manquantes pour joueur ${update.userId}`);
        continue;
      }

      // Calculer level et xp à partir du nouveau rating
      const { level, xp: newXp } = ratingToLevelAndXp(update.ratingAfter);

      // Le level et xp sont calculés directement depuis le nouveau rating
      // (pas besoin d'ajouter le XP gagné car le rating détermine le level/xp)
      // Le XP gagné est juste informatif pour les stats

      const { error: updateError } = await supabase
        .from('player_ratings')
        .update({
          rating: update.ratingAfter,
          matches_played: currentRating.matches_played + stats.matchesPlayed,
          wins: currentRating.wins + stats.wins,
          losses: currentRating.losses + stats.losses,
          level,
          xp: newXp,
          updated_at: new Date().toISOString(),
        })
        .eq('player_id', update.userId);

      if (updateError) {
        console.error(
          `[updateRatingsForMatch] Error updating rating for player ${update.userId}:`,
          updateError
        );
        return {
          success: false,
          error: `Erreur lors de la mise à jour du rating pour ${update.userId}: ${updateError.message}`,
        };
      }
    }

    // 6. Insérer dans rating_history pour chaque joueur
    const historyEntries = ratingUpdates.map((update) => ({
      user_id: update.userId,
      rating_before: update.ratingBefore,
      rating_after: update.ratingAfter,
      delta: update.delta,
      match_id: matchId,
    }));

    const { error: historyError } = await supabase.from('rating_history').insert(historyEntries);

    if (historyError) {
      console.error('[updateRatingsForMatch] Error inserting rating_history:', historyError);
      // Ne pas échouer complètement si l'historique ne peut pas être inséré
      // mais loguer l'erreur
      console.warn('[updateRatingsForMatch] Les ratings ont été mis à jour mais l\'historique n\'a pas pu être enregistré');
    }

    return {
      success: true,
      updates: ratingUpdates,
      stats: statsUpdates,
    };
  } catch (error: any) {
    console.error('[updateRatingsForMatch] Unexpected error:', error);
    return {
      success: false,
      error: `Erreur inattendue: ${error.message || String(error)}`,
    };
  }
}

