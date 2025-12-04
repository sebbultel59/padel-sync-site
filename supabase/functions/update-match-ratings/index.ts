// supabase/functions/update-match-ratings/index.ts
// Edge Function pour mettre à jour les ratings après qu'un match soit complété
// Peut être appelée explicitement depuis l'app ou via un trigger

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Types
interface RequestBody {
  match_id: string;
}

// Fonction pour calculer le rating moyen d'une équipe
function averageRating(ratings: number[]): number {
  if (ratings.length === 0) return 0;
  return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
}

// Fonction computeRatingDelta (adaptée pour Deno)
function computeRatingDelta(
  rTeam: number,
  rOpp: number,
  won: boolean,
  matchType: 'ranked' | 'tournament' | 'friendly'
): number {
  // Friendly → delta = 0
  if (matchType === 'friendly') {
    return 0;
  }

  // Calculer le score attendu (formule Elo adaptée)
  const ratingDiff = rOpp - rTeam;
  const scale = 25;
  const expected = 1 / (1 + Math.pow(10, ratingDiff / scale));
  const expectedClamped = Math.max(0, Math.min(1, expected));

  // Score réel : 1 pour victoire, 0 pour défaite
  const actual = won ? 1 : 0;

  // Delta de base : K * (score réel - score attendu)
  const K_BASE = 12;
  let delta = K_BASE * (actual - expectedClamped);

  // Bonus pour les matchs tournament (×1.2)
  if (matchType === 'tournament') {
    delta *= 1.2;
  }

  return Math.round(delta * 100) / 100;
}

// Fonction ratingToLevelAndXp
function ratingToLevelAndXp(rating: number): { level: number; xp: number } {
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

serve(async (req) => {
  try {
    // 1. Vérifier la méthode HTTP
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Parser le body
    const body: RequestBody = await req.json();
    const { match_id } = body;

    if (!match_id) {
      return new Response(JSON.stringify({ error: 'match_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Créer le client Supabase avec service role
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 4. Récupérer le match_result
    const { data: matchResult, error: matchResultError } = await supabase
      .from('match_results')
      .select('*')
      .eq('match_id', match_id)
      .eq('status', 'completed')
      .maybeSingle();

    if (matchResultError) {
      console.error('[update-match-ratings] Error fetching match_result:', matchResultError);
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch match result',
          details: matchResultError.message,
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (!matchResult) {
      return new Response(
        JSON.stringify({
          error: 'Match result not found or not completed',
          match_id,
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Vérifier qu'il y a un gagnant
    if (!matchResult.winner_team) {
      return new Response(
        JSON.stringify({
          error: 'Match has no winner (draw or not completed)',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 5. Récupérer les ratings actuels des 4 joueurs
    const playerIds = [
      matchResult.team1_player1_id,
      matchResult.team1_player2_id,
      matchResult.team2_player1_id,
      matchResult.team2_player2_id,
    ];

    const { data: ratings, error: ratingsError } = await supabase
      .from('player_ratings')
      .select('player_id, rating, matches_played, wins, losses, draws')
      .in('player_id', playerIds);

    if (ratingsError) {
      console.error('[update-match-ratings] Error fetching ratings:', ratingsError);
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch player ratings',
          details: ratingsError.message,
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Créer un Map pour accéder rapidement aux ratings
    const ratingsMap = new Map<string, any>();
    (ratings || []).forEach((r) => {
      ratingsMap.set(r.player_id, r);
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
        console.error('[update-match-ratings] Error creating missing ratings:', insertError);
        return new Response(
          JSON.stringify({
            error: 'Failed to create missing ratings',
            details: insertError.message,
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // Recharger les ratings
      const { data: updatedRatings } = await supabase
        .from('player_ratings')
        .select('player_id, rating, matches_played, wins, losses, draws')
        .in('player_id', playerIds);

      if (updatedRatings) {
        updatedRatings.forEach((r) => {
          ratingsMap.set(r.player_id, r);
        });
      }
    }

    // 6. Calculer les ratings moyens des équipes
    const team1Ratings = [
      ratingsMap.get(matchResult.team1_player1_id)?.rating || 50.0,
      ratingsMap.get(matchResult.team1_player2_id)?.rating || 50.0,
    ];
    const team2Ratings = [
      ratingsMap.get(matchResult.team2_player1_id)?.rating || 50.0,
      ratingsMap.get(matchResult.team2_player2_id)?.rating || 50.0,
    ];
    const avgRating1 = averageRating(team1Ratings);
    const avgRating2 = averageRating(team2Ratings);

    // 7. Déterminer le gagnant
    const team1Won = matchResult.winner_team === 'team1';
    const matchType =
      matchResult.match_type === 'tournament'
        ? 'tournament'
        : matchResult.match_type === 'friendly'
        ? 'friendly'
        : 'ranked';

    // 8. Calculer les nouveaux ratings pour chaque joueur
    const ratingUpdates: Array<{
      player_id: string;
      old_rating: number;
      new_rating: number;
      delta: number;
      won: boolean;
    }> = [];

    // Équipe 1
    for (const playerId of [matchResult.team1_player1_id, matchResult.team1_player2_id]) {
      const playerRating = ratingsMap.get(playerId)!;
      const delta = computeRatingDelta(avgRating1, avgRating2, team1Won, matchType);
      const newRating = Math.max(0, Math.min(100, playerRating.rating + delta));

      ratingUpdates.push({
        player_id: playerId,
        old_rating: playerRating.rating,
        new_rating: newRating,
        delta,
        won: team1Won,
      });
    }

    // Équipe 2
    for (const playerId of [matchResult.team2_player1_id, matchResult.team2_player2_id]) {
      const playerRating = ratingsMap.get(playerId)!;
      const delta = computeRatingDelta(avgRating2, avgRating1, !team1Won, matchType);
      const newRating = Math.max(0, Math.min(100, playerRating.rating + delta));

      ratingUpdates.push({
        player_id: playerId,
        old_rating: playerRating.rating,
        new_rating: newRating,
        delta,
        won: !team1Won,
      });
    }

    // 9. Mettre à jour player_ratings pour chaque joueur
    for (const update of ratingUpdates) {
      const playerRating = ratingsMap.get(update.player_id)!;
      const { level, xp } = ratingToLevelAndXp(update.new_rating);

      const newMatchesPlayed = playerRating.matches_played + 1;
      const newWins = update.won ? playerRating.wins + 1 : playerRating.wins;
      const newLosses = !update.won ? playerRating.losses + 1 : playerRating.losses;

      const { error: updateError } = await supabase
        .from('player_ratings')
        .update({
          rating: update.new_rating,
          matches_played: newMatchesPlayed,
          wins: newWins,
          losses: newLosses,
          level,
          xp,
          updated_at: new Date().toISOString(),
        })
        .eq('player_id', update.player_id);

      if (updateError) {
        console.error(
          `[update-match-ratings] Error updating rating for player ${update.player_id}:`,
          updateError
        );
        return new Response(
          JSON.stringify({
            error: `Failed to update rating for player ${update.player_id}`,
            details: updateError.message,
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // 10. Insérer dans rating_history pour chaque joueur
    const historyEntries = ratingUpdates.map((update) => ({
      user_id: update.player_id,
      rating_before: update.old_rating,
      rating_after: update.new_rating,
      delta: update.delta,
      match_id: match_id,
    }));

    const { error: historyError } = await supabase.from('rating_history').insert(historyEntries);

    if (historyError) {
      console.error('[update-match-ratings] Error inserting rating_history:', historyError);
      // Ne pas échouer complètement si l'historique ne peut pas être inséré
      console.warn(
        '[update-match-ratings] Ratings updated but rating_history could not be inserted'
      );
    }

    // 11. Retourner la réponse
    return new Response(
      JSON.stringify({
        success: true,
        match_id,
        updates: ratingUpdates.map((u) => ({
          player_id: u.player_id,
          rating_before: u.old_rating,
          rating_after: u.new_rating,
          delta: u.delta,
          won: u.won,
        })),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('[update-match-ratings] Unexpected error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error.message || String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});

