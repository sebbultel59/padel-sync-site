// hooks/usePlayerRating.ts
// Hook pour récupérer le rating, level et xp d'un joueur

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ratingToLevelAndXp } from '../lib/rating';

interface PlayerRating {
  rating: number;
  level: number;
  xp: number;
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
}

interface UsePlayerRatingResult {
  rating: number | null;
  level: number | null;
  xp: number | null;
  matches_played: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function usePlayerRating(userId: string | null | undefined): UsePlayerRatingResult {
  const [rating, setRating] = useState<number | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [xp, setXp] = useState<number | null>(null);
  const [matches_played, setMatchesPlayed] = useState<number | null>(null);
  const [wins, setWins] = useState<number | null>(null);
  const [losses, setLosses] = useState<number | null>(null);
  const [draws, setDraws] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchRating = async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('player_ratings')
        .select('rating, matches_played, wins, losses, draws')
        .eq('player_id', userId)
        .maybeSingle();

      if (fetchError) {
        throw fetchError;
      }

      if (data) {
        const ratingValue = Number(data.rating) || 0;
        const { level: calculatedLevel, xp: calculatedXp } = ratingToLevelAndXp(ratingValue);

        setRating(ratingValue);
        setLevel(calculatedLevel);
        setXp(calculatedXp);
        setMatchesPlayed(data.matches_played || 0);
        setWins(data.wins || 0);
        setLosses(data.losses || 0);
        setDraws(data.draws || 0);
      } else {
        // Pas de rating existant, initialiser avec des valeurs par défaut
        setRating(50.0); // Rating initial par défaut
        setLevel(4); // Niveau 4 par défaut (milieu de l'échelle)
        setXp(50.0); // XP au milieu du niveau
        setMatchesPlayed(0);
        setWins(0);
        setLosses(0);
        setDraws(0);
      }
    } catch (err) {
      console.error('[usePlayerRating] Error fetching rating:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      setRating(null);
      setLevel(null);
      setXp(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRating();
  }, [userId]);

  return {
    rating,
    level,
    xp,
    matches_played,
    wins,
    losses,
    draws,
    isLoading,
    error,
    refetch: fetchRating,
  };
}


