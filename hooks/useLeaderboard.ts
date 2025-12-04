// hooks/useLeaderboard.ts
// Hook pour récupérer les leaderboards depuis leaderboard_view

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type LeaderboardScope = 'global' | 'club' | 'group';

export interface UseLeaderboardParams {
  scope: LeaderboardScope;
  clubId?: string;
  groupId?: string;
  limit?: number;
}

export interface LeaderboardPlayer {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  clubId?: string | null;
  rating: number;
  xp: number;
  rankGlobal: number;
  rankClub?: number | null;
  isCurrentUser: boolean;
}

export interface UseLeaderboardResult {
  players: LeaderboardPlayer[];
  isLoading: boolean;
  isError: boolean;
  error?: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook pour récupérer un leaderboard selon le scope (global, club, group)
 * 
 * @param params Paramètres du leaderboard (scope, clubId, groupId, limit)
 * @param currentUserId ID de l'utilisateur courant (pour marquer isCurrentUser)
 * @returns Résultat avec players, isLoading, isError, refetch
 */
export function useLeaderboard(
  params: UseLeaderboardParams,
  currentUserId?: string | null
): UseLeaderboardResult {
  const { scope, clubId, groupId, limit } = params;
  const [players, setPlayers] = useState<LeaderboardPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchLeaderboard = async () => {
    try {
      setIsLoading(true);
      setIsError(false);
      setError(null);

      let data: any[] = [];

      if (scope === 'club') {
        // Scope CLUB : utiliser le RPC club_leaderboard (comme pour les groupes)
        // Cette fonction prend en compte les membres des groupes du club, pas seulement profiles.club_id
        if (!clubId) {
          setPlayers([]);
          setIsLoading(false);
          return;
        }

        const { data: clubData, error: fetchError } = await supabase.rpc('club_leaderboard', {
          p_club_id: clubId,
        });

        if (fetchError) {
          throw fetchError;
        }

        // Mapper les données du RPC vers le format attendu
        data = (clubData || []).map((entry: any) => ({
          user_id: entry.user_id,
          display_name: entry.pseudo || 'Joueur',
          avatar_url: null, // Le RPC ne retourne pas avatar_url, on peut l'ajouter plus tard
          club_id: clubId, // On utilise le clubId passé en paramètre
          rating: entry.rating,
          level: entry.level,
          xp: entry.xp,
          rank_global: null, // Le RPC ne retourne que le rank du club
          rank_club: entry.rank,
        }));

        // Appliquer la limite après le mapping
        if (limit && limit > 0) {
          data = data.slice(0, limit);
        }
      } else if (scope === 'group') {
        // Scope GROUP : utiliser le RPC group_leaderboard existant
        if (!groupId) {
          setPlayers([]);
          setIsLoading(false);
          return;
        }

        const { data: groupData, error: fetchError } = await supabase.rpc('group_leaderboard', {
          p_group_id: groupId,
        });

        if (fetchError) {
          throw fetchError;
        }

        // Mapper les données du RPC vers le format attendu
        data = (groupData || []).map((entry: any) => ({
          user_id: entry.user_id,
          display_name: entry.pseudo || 'Joueur',
          avatar_url: null, // Le RPC ne retourne pas avatar_url, on peut l'ajouter plus tard
          club_id: null,
          rating: entry.rating,
          level: entry.level,
          xp: entry.xp,
          rank_global: entry.rank,
          rank_club: null,
        }));
      } else {
        // Scope GLOBAL : utiliser leaderboard_view sans filtre
        let query = supabase
          .from('leaderboard_view')
          .select('*')
          .order('rating', { ascending: false });

        if (limit && limit > 0) {
          query = query.limit(limit);
        }

        const { data: globalData, error: fetchError } = await query;

        if (fetchError) {
          throw fetchError;
        }

        data = globalData || [];
      }

      // Mapper les données vers LeaderboardPlayer
      const mappedPlayers: LeaderboardPlayer[] = data.map((entry: any) => ({
        userId: entry.user_id,
        displayName: entry.display_name || entry.pseudo || 'Joueur',
        avatarUrl: entry.avatar_url || null,
        clubId: entry.club_id || null,
        rating: Number(entry.rating) || 0,
        xp: Number(entry.xp) || 0,
        rankGlobal: Number(entry.rank_global || entry.rank) || 0,
        rankClub: entry.rank_club ? Number(entry.rank_club) : null,
        isCurrentUser: currentUserId ? entry.user_id === currentUserId : false,
      }));

      setPlayers(mappedPlayers);
    } catch (err) {
      console.error('[useLeaderboard] Error fetching leaderboard:', err);
      setIsError(true);
      setError(err instanceof Error ? err : new Error(String(err)));
      setPlayers([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, [scope, clubId, groupId, limit, currentUserId]);

  return {
    players,
    isLoading,
    isError,
    error,
    refetch: fetchLeaderboard,
  };
}
