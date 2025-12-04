// hooks/usePlayerStats.ts
// Hook pour récupérer les stats complètes d'un joueur depuis player_stats_view

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface TopPartner {
  partnerId: string;
  partnerName: string;
  matchesWith: number;
  winRateWith: number; // 0-100
}

export interface PlayerStats {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  clubId?: string | null;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  setsWon: number | null;
  setsLost: number | null;
  level: number;
  rating: number;
  xp: number;
  rankGlobal?: number | null;
  rankClub?: number | null;
  sidePreferred?: 'left' | 'right' | null;
  topPartners?: TopPartner[];
}

export interface UsePlayerStatsResult {
  stats: PlayerStats | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<void>;
}

/**
 * Hook pour récupérer les stats complètes d'un joueur depuis player_stats_view
 * 
 * @param userId ID de l'utilisateur (peut être null/undefined)
 * @returns Résultat avec stats, isLoading, isError, refetch
 */
export function usePlayerStats(userId: string | null | undefined): UsePlayerStatsResult {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const fetchStats = async () => {
    if (!userId) {
      setStats(null);
      setIsLoading(false);
      setIsError(false);
      return;
    }

    try {
      setIsLoading(true);
      setIsError(false);

      const { data, error: fetchError } = await supabase
        .from('player_stats_view')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (fetchError) {
        throw fetchError;
      }

      if (data) {
        // Parser top_partners si présent
        let topPartners: TopPartner[] | undefined = undefined;
        if (data.top_partners && Array.isArray(data.top_partners)) {
          try {
            topPartners = data.top_partners.map((partner: any) => ({
              partnerId: String(partner.partner_id || ''),
              partnerName: String(partner.partner_name || ''),
              matchesWith: Number(partner.matches_with || 0),
              winRateWith: Number(partner.win_rate_with || 0),
            }));
          } catch (parseError) {
            console.warn('[usePlayerStats] Error parsing top_partners:', parseError);
            topPartners = undefined;
          }
        }

        // Mapper les colonnes SQL vers le type TypeScript
        const mappedStats: PlayerStats = {
          userId: String(data.user_id || ''),
          displayName: String(data.display_name || ''),
          avatarUrl: data.avatar_url || null,
          clubId: data.club_id || null,
          matchesPlayed: Number(data.matches_played || 0),
          wins: Number(data.wins || 0),
          losses: Number(data.losses || 0),
          winRate: Number(data.win_rate || 0),
          setsWon: data.sets_won !== null && data.sets_won !== undefined ? Number(data.sets_won) : null,
          setsLost: data.sets_lost !== null && data.sets_lost !== undefined ? Number(data.sets_lost) : null,
          level: Number(data.level || 0),
          rating: Number(data.rating || 0),
          xp: Number(data.xp || 0),
          rankGlobal: data.rank_global !== null && data.rank_global !== undefined ? Number(data.rank_global) : null,
          rankClub: data.rank_club !== null && data.rank_club !== undefined ? Number(data.rank_club) : null,
          sidePreferred: data.side_preferred === 'left' ? 'left' : data.side_preferred === 'right' ? 'right' : null,
          topPartners,
        };

        setStats(mappedStats);
      } else {
        // Pas de stats trouvées, retourner null
        setStats(null);
      }
    } catch (err) {
      console.error('[usePlayerStats] Error fetching stats:', err);
      setIsError(true);
      setStats(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [userId]);

  return {
    stats,
    isLoading,
    isError,
    refetch: fetchStats,
  };
}

