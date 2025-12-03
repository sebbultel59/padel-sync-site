// supabase/functions/record-match-result/index.ts
// Edge Function pour enregistrer un résultat de match et mettre à jour les ratings

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Types
type MatchType = 'ranked' | 'friendly' | 'tournament';
type ResultType = 'normal' | 'wo' | 'retire' | 'interrupted';
type WinnerTeam = 'A' | 'B';

interface RequestBody {
  match_id: string;
  score_text: string;
  winner_team: WinnerTeam;
  result_type: ResultType;
  match_type?: MatchType; // Optionnel, sera déterminé depuis match_results ou défaut 'ranked'
  team_a_player1_id?: string; // Optionnel, sera récupéré depuis match_rsvps
  team_a_player2_id?: string;
  team_b_player1_id?: string;
  team_b_player2_id?: string;
}

interface PlayerRating {
  player_id: string;
  rating: number;
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
}

// Fonction pour parser le score depuis score_text (ex: "6-4, 6-3" ou "6-4")
function parseScore(scoreText: string): { teamA: number; teamB: number } {
  // Format simple : on compte les sets gagnés
  // Ex: "6-4, 6-3" → teamA = 2, teamB = 0
  // Ex: "6-4, 3-6, 6-2" → teamA = 2, teamB = 1
  const sets = scoreText.split(',').map(s => s.trim());
  let teamA = 0;
  let teamB = 0;

  for (const set of sets) {
    const [a, b] = set.split('-').map(s => parseInt(s.trim(), 10));
    if (!isNaN(a) && !isNaN(b)) {
      if (a > b) teamA++;
      else if (b > a) teamB++;
    }
  }

  return { teamA, teamB };
}

// Fonction pour calculer le rating moyen d'une équipe
function averageRating(ratings: number[]): number {
  if (ratings.length === 0) return 0;
  return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
}

// Fonction computeRatingDelta (copie de lib/rating.ts adaptée pour Deno)
function computeRatingDelta(
  rTeam: number,
  rOpp: number,
  won: boolean,
  ctx: { matchType: MatchType; resultType: ResultType }
): number {
  // Friendly et interrupted → delta = 0
  if (ctx.matchType === 'friendly' || ctx.resultType === 'interrupted') {
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
  const K_BASE = 2;
  let delta = K_BASE * (actual - expectedClamped);

  // Bonus pour les matchs tournament (×1.2)
  if (ctx.matchType === 'tournament') {
    delta *= 1.2;
  }

  // Réduction pour les matchs wo ou retire (×0.7)
  if (ctx.resultType === 'wo' || ctx.resultType === 'retire') {
    delta *= 0.7;
  }

  return Math.round(delta * 100) / 100;
}

// Fonction ratingToLevelAndXp (copie de lib/rating.ts)
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
    let body: RequestBody;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error('[record_match_result] Error parsing request body:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { match_id, score_text, winner_team, result_type, match_type, team_a_player1_id, team_a_player2_id, team_b_player1_id, team_b_player2_id } = body;

    console.log('[record_match_result] Request body:', {
      match_id,
      score_text,
      winner_team,
      result_type,
      match_type,
      team_a_player1_id,
      team_a_player2_id,
      team_b_player1_id,
      team_b_player2_id,
    });

    if (!match_id || !score_text || !winner_team || !result_type) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields',
          details: {
            match_id: !!match_id,
            score_text: !!score_text,
            winner_team: !!winner_team,
            result_type: !!result_type,
          }
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. Créer le client Supabase avec service role
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 4. Récupérer le match
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('id, status, group_id')
      .eq('id', match_id)
      .maybeSingle();

    if (matchError) {
      console.error('[record_match_result] Error fetching match:', matchError);
      return new Response(JSON.stringify({ error: 'Failed to fetch match' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!match) {
      return new Response(JSON.stringify({ error: 'Match not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Vérifier si le match est déjà terminé
    if (match.status === 'completed') {
      console.log('[record_match_result] Match already completed, checking for existing result');
      const { data: existingResult } = await supabase
        .from('match_results')
        .select('id, recorded_at')
        .eq('match_id', match_id)
        .maybeSingle();
      
      if (existingResult) {
        return new Response(JSON.stringify({ 
          error: 'Match result already recorded',
          details: `This match was already completed. Result recorded at: ${existingResult.recorded_at}`
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    console.log('[record_match_result] Match found:', { id: match.id, status: match.status });

    // 5. Déterminer le match_type
    let finalMatchType: MatchType = match_type || 'ranked';
    
    // Si pas fourni, vérifier dans match_results existant
    if (!match_type) {
      const { data: existingResult } = await supabase
        .from('match_results')
        .select('match_type')
        .eq('match_id', match_id)
        .maybeSingle();
      
      if (existingResult?.match_type) {
        // Convertir match_type_enum vers MatchType
        const dbType = existingResult.match_type as string;
        if (dbType === 'tournament') finalMatchType = 'tournament';
        else if (dbType === 'friendly') finalMatchType = 'friendly';
        else finalMatchType = 'ranked';
      }
    }

    // 6. Récupérer les 4 joueurs du match (via match_rsvps avec status='accepted' ou 'yes')
    const { data: rsvps, error: rsvpsError } = await supabase
      .from('match_rsvps')
      .select('user_id')
      .eq('match_id', match_id)
      .in('status', ['accepted', 'yes'])
      .order('created_at', { ascending: true });

    if (rsvpsError) {
      console.error('[record_match_result] Error fetching RSVPs:', rsvpsError);
      return new Response(JSON.stringify({ error: 'Failed to fetch match players' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!rsvps || rsvps.length !== 4) {
      return new Response(JSON.stringify({ error: 'Match must have exactly 4 players' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Déterminer les équipes
    let teamA: string[] = [];
    let teamB: string[] = [];

    if (team_a_player1_id && team_a_player2_id && team_b_player1_id && team_b_player2_id) {
      // Équipes fournies explicitement
      teamA = [team_a_player1_id, team_a_player2_id];
      teamB = [team_b_player1_id, team_b_player2_id];
      
      // Vérifier que tous les joueurs fournis sont bien dans les RSVPs
      const allProvidedIds = [...teamA, ...teamB];
      const rsvpIds = rsvps.map(r => r.user_id);
      const invalidIds = allProvidedIds.filter(id => !rsvpIds.includes(id));
      
      if (invalidIds.length > 0) {
        console.error('[record_match_result] Invalid player IDs provided:', invalidIds);
        return new Response(
          JSON.stringify({ error: 'Some provided player IDs are not in the match RSVPs', invalid_ids: invalidIds }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      
      // Vérifier qu'il n'y a pas de doublons
      const uniqueIds = new Set(allProvidedIds);
      if (uniqueIds.size !== 4) {
        console.error('[record_match_result] Duplicate player IDs provided');
        return new Response(
          JSON.stringify({ error: 'Duplicate player IDs in teams' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Par défaut : les 2 premiers = équipe A, les 2 derniers = équipe B
      teamA = [rsvps[0].user_id, rsvps[1].user_id];
      teamB = [rsvps[2].user_id, rsvps[3].user_id];
    }
    
    console.log('[record_match_result] Teams determined:', {
      teamA,
      teamB,
      winner_team,
    });

    // 7. Récupérer les ratings des joueurs (ou créer s'ils n'existent pas)
    const allPlayerIds = [...teamA, ...teamB];
    const { data: ratings, error: ratingsError } = await supabase
      .from('player_ratings')
      .select('player_id, rating, matches_played, wins, losses, draws')
      .in('player_id', allPlayerIds);

    if (ratingsError) {
      console.error('[record_match_result] Error fetching ratings:', ratingsError);
      return new Response(JSON.stringify({ error: 'Failed to fetch player ratings' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Créer les ratings manquants
    const existingPlayerIds = new Set((ratings || []).map(r => r.player_id));
    const missingPlayerIds = allPlayerIds.filter(id => !existingPlayerIds.has(id));

    if (missingPlayerIds.length > 0) {
      const newRatings = missingPlayerIds.map(player_id => ({
        player_id,
        rating: 50.0, // Rating initial par défaut (milieu de l'échelle)
        matches_played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
      }));

      const { error: insertError } = await supabase
        .from('player_ratings')
        .insert(newRatings);

      if (insertError) {
        console.error('[record_match_result] Error creating ratings:', insertError);
        return new Response(JSON.stringify({ error: 'Failed to create player ratings' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Recharger les ratings
      const { data: updatedRatings } = await supabase
        .from('player_ratings')
        .select('player_id, rating, matches_played, wins, losses, draws')
        .in('player_id', allPlayerIds);

      if (updatedRatings) {
        ratings.push(...updatedRatings.filter(r => missingPlayerIds.includes(r.player_id)));
      }
    }

    const ratingsMap = new Map<string, PlayerRating>();
    (ratings || []).forEach(r => {
      ratingsMap.set(r.player_id, r);
    });

    // 8. Récupérer les match_rating_effects existants pour ce match et les annuler
    const { data: existingMatchResult } = await supabase
      .from('match_results')
      .select('id')
      .eq('match_id', match_id)
      .maybeSingle();

    let existingEffects: any[] = [];
    if (existingMatchResult?.id) {
      const { data: effects, error: effectsError } = await supabase
        .from('match_rating_effects')
        .select('id, player_id, rating_change, match_result_id')
        .eq('match_result_id', existingMatchResult.id);

      if (effectsError && effectsError.code !== 'PGRST116') {
        console.error('[record_match_result] Error fetching existing effects:', effectsError);
      } else if (effects) {
        existingEffects = effects;
      }
    }

    // Annuler les effets précédents si ils existent
    if (existingEffects && existingEffects.length > 0) {
      for (const effect of existingEffects) {
        const playerRating = ratingsMap.get(effect.player_id);
        if (playerRating) {
          // Soustraire le delta précédent
          const newRating = Math.max(0, Math.min(100, playerRating.rating - effect.rating_change));
          ratingsMap.set(effect.player_id, {
            ...playerRating,
            rating: newRating,
          });
        }
      }

      // Supprimer les effets précédents
      const effectIds = existingEffects.map(e => e.id);
      await supabase
        .from('match_rating_effects')
        .delete()
        .in('id', effectIds);
    }

    // 9. Parser le score
    const { teamA: scoreA, teamB: scoreB } = parseScore(score_text);

    // 10. Calculer les ratings moyens des équipes
    const teamARatings = teamA.map(id => ratingsMap.get(id)?.rating || 50.0);
    const teamBRatings = teamB.map(id => ratingsMap.get(id)?.rating || 50.0);
    const avgRatingA = averageRating(teamARatings);
    const avgRatingB = averageRating(teamBRatings);

    // 11. Déterminer le gagnant
    const teamAWon = winner_team === 'A';
    const isDraw = scoreA === scoreB;

    // 12. Calculer les nouveaux ratings pour chaque joueur
    const ratingUpdates: Array<{
      player_id: string;
      old_rating: number;
      new_rating: number;
      delta: number;
      won: boolean;
      team: 'team1' | 'team2';
    }> = [];

    for (const playerId of teamA) {
      const playerRating = ratingsMap.get(playerId)!;
      const won = isDraw ? false : teamAWon;
      const delta = computeRatingDelta(
        avgRatingA,
        avgRatingB,
        won,
        { matchType: finalMatchType, resultType: result_type }
      );
      const newRating = Math.max(0, Math.min(100, playerRating.rating + delta));
      
      ratingUpdates.push({
        player_id: playerId,
        old_rating: playerRating.rating,
        new_rating: newRating,
        delta,
        won,
        team: 'team1',
      });
    }

    for (const playerId of teamB) {
      const playerRating = ratingsMap.get(playerId)!;
      const won = isDraw ? false : !teamAWon;
      const delta = computeRatingDelta(
        avgRatingB,
        avgRatingA,
        won,
        { matchType: finalMatchType, resultType: result_type }
      );
      const newRating = Math.max(0, Math.min(100, playerRating.rating + delta));
      
      ratingUpdates.push({
        player_id: playerId,
        old_rating: playerRating.rating,
        new_rating: newRating,
        delta,
        won,
        team: 'team2',
      });
    }

    // 13. Mettre à jour les ratings dans la base de données
    for (const update of ratingUpdates) {
      const playerRating = ratingsMap.get(update.player_id)!;
      const { level, xp } = ratingToLevelAndXp(update.new_rating);
      
      const newMatchesPlayed = playerRating.matches_played + 1;
      const newWins = update.won ? playerRating.wins + 1 : playerRating.wins;
      const newLosses = !update.won && !isDraw ? playerRating.losses + 1 : playerRating.losses;
      const newDraws = isDraw ? playerRating.draws + 1 : playerRating.draws;

      const { error: updateError } = await supabase
        .from('player_ratings')
        .update({
          rating: update.new_rating,
          matches_played: newMatchesPlayed,
          wins: newWins,
          losses: newLosses,
          draws: newDraws,
          updated_at: new Date().toISOString(),
        })
        .eq('player_id', update.player_id);

      if (updateError) {
        console.error(`[record_match_result] Error updating rating for player ${update.player_id}:`, updateError);
      }
    }

    // 14. Créer ou mettre à jour match_results
    const matchResultData: any = {
      match_id,
      match_type: finalMatchType === 'ranked' ? 'league' : finalMatchType === 'tournament' ? 'tournament' : 'friendly',
      status: result_type === 'interrupted' ? 'cancelled' : 'completed',
      team1_player1_id: teamA[0],
      team1_player2_id: teamA[1],
      team1_score: scoreA,
      team2_player1_id: teamB[0],
      team2_player2_id: teamB[1],
      team2_score: scoreB,
      winner_team: isDraw ? null : (teamAWon ? 'team1' : 'team2'),
      recorded_by: (await supabase.auth.getUser()).data.user?.id || null,
      recorded_at: new Date().toISOString(),
      score_text: score_text, // Stocker le score_text pour l'affichage détaillé
    };

    const { data: matchResult, error: matchResultError } = await supabase
      .from('match_results')
      .upsert(matchResultData, { onConflict: 'match_id' })
      .select('id')
      .single();

    if (matchResultError) {
      console.error('[record_match_result] Error upserting match_result:', matchResultError);
      return new Response(JSON.stringify({ 
        error: 'Failed to save match result',
        details: matchResultError.message 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!matchResult || !matchResult.id) {
      console.error('[record_match_result] Match result upserted but no ID returned');
      return new Response(JSON.stringify({ error: 'Failed to save match result: no ID returned' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log('[record_match_result] Match result saved successfully:', matchResult.id);

    // 15. Créer les match_rating_effects
    const effectsToInsert = ratingUpdates.map(update => ({
      match_result_id: matchResult.id,
      player_id: update.player_id,
      team: update.team,
      result_type: isDraw ? ('draw' as any) : (update.won ? 'win' : 'loss'),
      rating_before: update.old_rating,
      rating_after: update.new_rating,
      rating_change: update.delta,
    }));

    const { error: effectsInsertError } = await supabase
      .from('match_rating_effects')
      .insert(effectsToInsert);

    if (effectsInsertError) {
      console.error('[record_match_result] Error inserting rating effects:', effectsInsertError);
      // Ne pas retourner d'erreur ici car le résultat est déjà enregistré
      // Mais logger l'erreur pour le débogage
    } else {
      console.log('[record_match_result] Rating effects inserted successfully:', effectsToInsert.length);
    }

    // 16. Mettre à jour le statut du match (utiliser 'completed' si disponible, sinon 'confirmed')
    const { error: matchStatusError } = await supabase
      .from('matches')
      .update({ status: 'completed' })
      .eq('id', match_id);

    if (matchStatusError) {
      console.error('[record_match_result] Error updating match status:', matchStatusError);
      // Ne pas retourner d'erreur ici car le résultat est déjà enregistré
      // Mais logger l'erreur pour le débogage
    } else {
      console.log('[record_match_result] Match status updated to completed');
    }

    // 17. Récupérer l'utilisateur courant pour retourner ses infos
    const { data: { user } } = await supabase.auth.getUser();
    const currentUserId = user?.id;

    let currentPlayerInfo = null;
    if (currentUserId) {
      const currentUpdate = ratingUpdates.find(u => u.player_id === currentUserId);
      if (currentUpdate) {
        const { level, xp } = ratingToLevelAndXp(currentUpdate.new_rating);
        currentPlayerInfo = {
          old_rating: currentUpdate.old_rating,
          new_rating: currentUpdate.new_rating,
          delta_rating: currentUpdate.delta,
          level,
          xp,
        };
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        match_result_id: matchResult.id,
        current_player: currentPlayerInfo,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[record_match_result] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('[record_match_result] Error stack:', errorStack);
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: errorMessage,
        details: errorStack ? errorStack.substring(0, 500) : undefined,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});

