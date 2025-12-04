// hooks/usePlayerWinStreak.ts
// Hook pour récupérer la série de victoires d'un joueur

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface UsePlayerWinStreakResult {
  winStreak: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function usePlayerWinStreak(userId: string | null | undefined): UsePlayerWinStreakResult {
  const [winStreak, setWinStreak] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchWinStreak = async () => {
    if (!userId) {
      setIsLoading(false);
      setWinStreak(0);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Récupérer les matchs récents triés par date décroissante
      const { data: matches, error: fetchError } = await supabase
        .from('match_results')
        .select('winner_team, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, recorded_at')
        .or(`team1_player1_id.eq.${userId},team1_player2_id.eq.${userId},team2_player1_id.eq.${userId},team2_player2_id.eq.${userId}`)
        .eq('status', 'completed')
        .not('winner_team', 'is', null)
        .order('recorded_at', { ascending: false })
        .limit(20);

      if (fetchError) {
        throw fetchError;
      }

      if (!matches || matches.length === 0) {
        setWinStreak(0);
        return;
      }

      // Calculer la série de victoires
      let streak = 0;
      for (const match of matches) {
        const isWinner =
          (match.winner_team === 'team1' &&
            (match.team1_player1_id === userId || match.team1_player2_id === userId)) ||
          (match.winner_team === 'team2' &&
            (match.team2_player1_id === userId || match.team2_player2_id === userId));

        if (isWinner) {
          streak++;
        } else {
          // Dès qu'on trouve une défaite, on arrête
          break;
        }
      }

      setWinStreak(streak);
    } catch (err) {
      console.error('[usePlayerWinStreak] Error fetching win streak:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      setWinStreak(0);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWinStreak();
  }, [userId]);

  return {
    winStreak,
    isLoading,
    error,
    refetch: fetchWinStreak,
  };
}

