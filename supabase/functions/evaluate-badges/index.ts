// supabase/functions/evaluate-badges/index.ts
// Edge Function pour évaluer et débloquer les badges automatiques après un match

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface BadgeUnlocked {
  user_id: string;
  badge_code: string;
  badge_id: string;
  badge_label: string;
}

interface EvaluateBadgesResponse {
  match_id: string;
  badges_unlocked: BadgeUnlocked[];
  players_evaluated: string[];
}

/**
 * Récupère le nombre total de matchs joués par un joueur (tous types confondus)
 */
async function getTotalMatchesCount(
  supabase: any,
  playerId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("match_results")
    .select("*", { count: "exact", head: true })
    .or(
      `team1_player1_id.eq.${playerId},team1_player2_id.eq.${playerId},team2_player1_id.eq.${playerId},team2_player2_id.eq.${playerId}`
    )
    .eq("status", "completed");

  if (error) {
    console.error(`[evaluate_badges] Error counting matches for player ${playerId}:`, error);
    return 0;
  }

  return count || 0;
}

/**
 * Récupère le nombre de matchs classés (league) joués par un joueur
 */
async function getRankedMatchesCount(
  supabase: any,
  playerId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("match_results")
    .select("*", { count: "exact", head: true })
    .or(
      `team1_player1_id.eq.${playerId},team1_player2_id.eq.${playerId},team2_player1_id.eq.${playerId},team2_player2_id.eq.${playerId}`
    )
    .eq("status", "completed")
    .eq("match_type", "league");

  if (error) {
    console.error(`[evaluate_badges] Error counting ranked matches for player ${playerId}:`, error);
    return 0;
  }

  return count || 0;
}

/**
 * Récupère le nombre de matchs tournoi joués par un joueur
 */
async function getTournamentMatchesCount(
  supabase: any,
  playerId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("match_results")
    .select("*", { count: "exact", head: true })
    .or(
      `team1_player1_id.eq.${playerId},team1_player2_id.eq.${playerId},team2_player1_id.eq.${playerId},team2_player2_id.eq.${playerId}`
    )
    .eq("status", "completed")
    .eq("match_type", "tournament");

  if (error) {
    console.error(`[evaluate_badges] Error counting tournament matches for player ${playerId}:`, error);
    return 0;
  }

  return count || 0;
}

/**
 * Calcule la série de victoires consécutives actuelle d'un joueur
 * Retourne le nombre de victoires consécutives (en remontant depuis le match le plus récent)
 */
async function getCurrentWinStreak(
  supabase: any,
  playerId: string
): Promise<number> {
  // Récupérer tous les matchs du joueur, triés par date décroissante
  const { data: matches, error } = await supabase
    .from("match_results")
    .select("id, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, winner_team, recorded_at")
    .or(
      `team1_player1_id.eq.${playerId},team1_player2_id.eq.${playerId},team2_player1_id.eq.${playerId},team2_player2_id.eq.${playerId}`
    )
    .eq("status", "completed")
    .not("winner_team", "is", null)
    .order("recorded_at", { ascending: false });

  if (error || !matches || matches.length === 0) {
    return 0;
  }

  let streak = 0;
  for (const match of matches) {
    // Déterminer si le joueur était dans l'équipe gagnante
    const isWinner =
      (match.winner_team === "team1" &&
        (match.team1_player1_id === playerId || match.team1_player2_id === playerId)) ||
      (match.winner_team === "team2" &&
        (match.team2_player1_id === playerId || match.team2_player2_id === playerId));

    if (isWinner) {
      streak++;
    } else {
      // Dès qu'on trouve une défaite, on arrête
      break;
    }
  }

  return streak;
}

/**
 * Récupère le nombre de partenaires différents avec qui un joueur a joué
 */
async function getUniquePartnersCount(
  supabase: any,
  playerId: string
): Promise<number> {
  // Récupérer tous les matchs du joueur
  const { data: matches, error } = await supabase
    .from("match_results")
    .select("team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id")
    .or(
      `team1_player1_id.eq.${playerId},team1_player2_id.eq.${playerId},team2_player1_id.eq.${playerId},team2_player2_id.eq.${playerId}`
    )
    .eq("status", "completed");

  if (error || !matches || matches.length === 0) {
    return 0;
  }

  const partners = new Set<string>();
  for (const match of matches) {
    // Si le joueur est dans team1, son partenaire est team1_player2_id (ou team1_player1_id)
    if (match.team1_player1_id === playerId) {
      if (match.team1_player2_id && match.team1_player2_id !== playerId) {
        partners.add(match.team1_player2_id);
      }
    } else if (match.team1_player2_id === playerId) {
      if (match.team1_player1_id && match.team1_player1_id !== playerId) {
        partners.add(match.team1_player1_id);
      }
    }
    // Si le joueur est dans team2, son partenaire est team2_player2_id (ou team2_player1_id)
    else if (match.team2_player1_id === playerId) {
      if (match.team2_player2_id && match.team2_player2_id !== playerId) {
        partners.add(match.team2_player2_id);
      }
    } else if (match.team2_player2_id === playerId) {
      if (match.team2_player1_id && match.team2_player1_id !== playerId) {
        partners.add(match.team2_player1_id);
      }
    }
  }

  return partners.size;
}

/**
 * Vérifie si un joueur est "caméléon" : aucun partenaire n'a représenté plus de 20% des matchs sur les 30 derniers jours
 */
async function isCameleon(
  supabase: any,
  playerId: string
): Promise<boolean> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Récupérer tous les matchs du joueur des 30 derniers jours
  const { data: matches, error } = await supabase
    .from("match_results")
    .select("team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, recorded_at")
    .or(
      `team1_player1_id.eq.${playerId},team1_player2_id.eq.${playerId},team2_player1_id.eq.${playerId},team2_player2_id.eq.${playerId}`
    )
    .eq("status", "completed")
    .gte("recorded_at", thirtyDaysAgo.toISOString());

  if (error || !matches || matches.length === 0) {
    return false;
  }

  // Compter les matchs par partenaire
  const partnerCounts: Record<string, number> = {};
  for (const match of matches) {
    let partnerId: string | null = null;

    if (match.team1_player1_id === playerId) {
      partnerId = match.team1_player2_id;
    } else if (match.team1_player2_id === playerId) {
      partnerId = match.team1_player1_id;
    } else if (match.team2_player1_id === playerId) {
      partnerId = match.team2_player2_id;
    } else if (match.team2_player2_id === playerId) {
      partnerId = match.team2_player1_id;
    }

    if (partnerId && partnerId !== playerId) {
      partnerCounts[partnerId] = (partnerCounts[partnerId] || 0) + 1;
    }
  }

  const totalMatches = matches.length;
  const threshold = totalMatches * 0.2; // 20% du total

  // Vérifier qu'aucun partenaire n'a plus de 20% des matchs
  for (const count of Object.values(partnerCounts)) {
    if (count > threshold) {
      return false;
    }
  }

  return totalMatches >= 5; // Au moins 5 matchs pour être considéré comme caméléon
}

/**
 * Vérifie si un match est un "upset" : victoire contre une équipe avec un rating moyen supérieur d'au moins 15 points
 * @param matchResultId - ID du match_results (pas l'ID du match original)
 */
async function isUpset(
  supabase: any,
  matchResultId: string,
  playerId: string,
  won: boolean
): Promise<boolean> {
  if (!won) {
    return false; // Pas un upset si on a perdu
  }

  // Récupérer le match_result avec les ratings des joueurs
  const { data: match, error: matchError } = await supabase
    .from("match_results")
    .select(
      "team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, winner_team"
    )
    .eq("id", matchResultId)
    .single();

  if (matchError || !match) {
    return false;
  }

  // Déterminer dans quelle équipe était le joueur
  const playerTeam =
    match.team1_player1_id === playerId || match.team1_player2_id === playerId
      ? "team1"
      : "team2";
  const opponentTeam = playerTeam === "team1" ? "team2" : "team1";

  // Récupérer les ratings des deux équipes
  const playerTeamIds =
    playerTeam === "team1"
      ? [match.team1_player1_id, match.team1_player2_id]
      : [match.team2_player1_id, match.team2_player2_id];
  const opponentTeamIds =
    opponentTeam === "team1"
      ? [match.team1_player1_id, match.team1_player2_id]
      : [match.team2_player1_id, match.team2_player2_id];

  const { data: playerRatings, error: ratingsError } = await supabase
    .from("player_ratings")
    .select("player_id, rating")
    .in("player_id", [...playerTeamIds, ...opponentTeamIds]);

  if (ratingsError || !playerRatings) {
    return false;
  }

  const ratingsMap = new Map(
    playerRatings.map((r: any) => [r.player_id, Number(r.rating)])
  );

  // Calculer le rating moyen de chaque équipe
  const playerTeamRating =
    ((ratingsMap.get(playerTeamIds[0]) || 0) + (ratingsMap.get(playerTeamIds[1]) || 0)) / 2;
  const opponentTeamRating =
    ((ratingsMap.get(opponentTeamIds[0]) || 0) + (ratingsMap.get(opponentTeamIds[1]) || 0)) / 2;

  // Vérifier si l'équipe adverse avait un rating supérieur d'au moins 15 points
  return opponentTeamRating - playerTeamRating >= 15;
}

/**
 * Évalue les badges pour un joueur après un match
 */
async function evaluatePlayerBadges(
  supabase: any,
  playerId: string,
  matchId: string,
  won: boolean
): Promise<BadgeUnlocked[]> {
  const unlocked: BadgeUnlocked[] = [];

  // Récupérer tous les badges actifs et automatiques
  const { data: badges, error: badgesError } = await supabase
    .from("badge_definitions")
    .select("id, code, label")
    .eq("is_active", true)
    .eq("is_manual", false);

  if (badgesError || !badges) {
    console.error("[evaluate_badges] Error fetching badges:", badgesError);
    return unlocked;
  }

  // Récupérer les badges déjà débloqués par le joueur
  const { data: existingBadges, error: existingError } = await supabase
    .from("user_badges")
    .select("badge_id")
    .eq("user_id", playerId);

  if (existingError) {
    console.error("[evaluate_badges] Error fetching existing badges:", existingError);
    return unlocked;
  }

  const existingBadgeIds = new Set(
    (existingBadges || []).map((b: any) => b.badge_id)
  );

  // Calculer les stats du joueur
  const totalMatches = await getTotalMatchesCount(supabase, playerId);
  const rankedMatches = await getRankedMatchesCount(supabase, playerId);
  const tournamentMatches = await getTournamentMatchesCount(supabase, playerId);
  const winStreak = await getCurrentWinStreak(supabase, playerId);
  const uniquePartners = await getUniquePartnersCount(supabase, playerId);
  const cameleon = await isCameleon(supabase, playerId);
  const upset = await isUpset(supabase, matchId, playerId, won); // matchId est déjà l'ID de match_results ici

  // Vérifier chaque badge
  for (const badge of badges) {
    // Ignorer si déjà débloqué
    if (existingBadgeIds.has(badge.id)) {
      continue;
    }

    let shouldUnlock = false;

    // Badges Volume
    if (badge.code === "VOLUME_5_MATCHES" && totalMatches >= 5) {
      shouldUnlock = true;
    } else if (badge.code === "VOLUME_20_MATCHES" && totalMatches >= 20) {
      shouldUnlock = true;
    } else if (badge.code === "VOLUME_50_MATCHES" && totalMatches >= 50) {
      shouldUnlock = true;
    } else if (badge.code === "VOLUME_100_MATCHES" && totalMatches >= 100) {
      shouldUnlock = true;
    } else if (badge.code === "RANKED_10_MATCHES" && rankedMatches >= 10) {
      shouldUnlock = true;
    } else if (badge.code === "TOURNAMENT_5_MATCHES" && tournamentMatches >= 5) {
      shouldUnlock = true;
    }
    // Badges Performance
    else if (badge.code === "STREAK_3_WINS" && winStreak >= 3) {
      shouldUnlock = true;
    } else if (badge.code === "STREAK_5_WINS" && winStreak >= 5) {
      shouldUnlock = true;
    } else if (badge.code === "STREAK_10_WINS" && winStreak >= 10) {
      shouldUnlock = true;
    } else if (badge.code === "UPSET_15_RATING" && upset) {
      shouldUnlock = true;
    }
    // Badges Social
    else if (badge.code === "SOCIAL_5_PARTNERS" && uniquePartners >= 5) {
      shouldUnlock = true;
    } else if (badge.code === "SOCIAL_10_PARTNERS" && uniquePartners >= 10) {
      shouldUnlock = true;
    } else if (badge.code === "SOCIAL_20_PARTNERS" && uniquePartners >= 20) {
      shouldUnlock = true;
    } else if (badge.code === "CAMELEON" && cameleon) {
      shouldUnlock = true;
    }

    if (shouldUnlock) {
      // Insérer le badge dans user_badges
      const { error: insertError } = await supabase.from("user_badges").insert({
        user_id: playerId,
        badge_id: badge.id,
        source_match_id: matchId,
        unlocked_at: new Date().toISOString(),
      });

      if (insertError) {
        console.error(
          `[evaluate_badges] Error inserting badge ${badge.code} for player ${playerId}:`,
          insertError
        );
      } else {
        unlocked.push({
          user_id: playerId,
          badge_code: badge.code,
          badge_id: badge.id,
          badge_label: badge.label,
        });
      }
    }
  }

  return unlocked;
}

serve(async (req) => {
  try {
    // 1. Vérifier la méthode HTTP
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Parser le body
    const body = await req.json();
    const { match_id } = body;

    if (!match_id) {
      return new Response(
        JSON.stringify({ error: "match_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Créer le client Supabase avec service role
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 4. Récupérer le match_result et ses joueurs
    // Note: match_id peut être soit l'ID de match_results, soit l'ID du match
    // On essaie d'abord avec match_results.id, puis avec match_id si c'est un UUID de match
    let match: any = null;
    let matchError: any = null;
    
    // Essayer avec match_results.id
    const { data: matchResultById, error: errorById } = await supabase
      .from("match_results")
      .select(
        "id, match_id, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, winner_team"
      )
      .eq("id", match_id)
      .single();
    
    if (!errorById && matchResultById) {
      match = matchResultById;
    } else {
      // Essayer avec match_id (l'ID du match original)
      const { data: matchResultByMatchId, error: errorByMatchId } = await supabase
        .from("match_results")
        .select(
          "id, match_id, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, winner_team"
        )
        .eq("match_id", match_id)
        .single();
      
      if (errorByMatchId || !matchResultByMatchId) {
        matchError = errorByMatchId;
      } else {
        match = matchResultByMatchId;
      }
    }

    if (matchError || !match) {
      return new Response(
        JSON.stringify({ error: "Match not found", details: matchError }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // 5. Récupérer les 4 joueurs
    const players = [
      match.team1_player1_id,
      match.team1_player2_id,
      match.team2_player1_id,
      match.team2_player2_id,
    ].filter((id) => id !== null);

    // 6. Pour chaque joueur, déterminer s'il a gagné et évaluer les badges
    // Utiliser match_results.id comme source_match_id
    const matchResultId = match.id;
    const allUnlocked: BadgeUnlocked[] = [];

    for (const playerId of players) {
      const isWinner =
        (match.winner_team === "team1" &&
          (match.team1_player1_id === playerId || match.team1_player2_id === playerId)) ||
        (match.winner_team === "team2" &&
          (match.team2_player1_id === playerId || match.team2_player2_id === playerId));

      const unlocked = await evaluatePlayerBadges(
        supabase,
        playerId,
        matchResultId, // Utiliser match_results.id comme source_match_id
        isWinner
      );
      allUnlocked.push(...unlocked);
    }

    // 7. Retourner la réponse
    const response: EvaluateBadgesResponse = {
      match_id: match.match_id || match_id, // Retourner l'ID du match original si disponible
      badges_unlocked: allUnlocked,
      players_evaluated: players,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[evaluate_badges] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

