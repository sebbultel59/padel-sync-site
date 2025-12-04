// components/Leaderboard.tsx
// Composant wrapper pour afficher un leaderboard selon un scope (global, club, group)

import React from 'react';
import { useLeaderboard, type LeaderboardScope } from '../hooks/useLeaderboard';
import LeaderboardList from './LeaderboardList';

export type { LeaderboardScope };

interface LeaderboardProps {
  scope: LeaderboardScope;
  clubId?: string;
  groupId?: string;
  currentUserId: string;
  highlightCurrentUser?: boolean;
  limit?: number;
  variant?: 'full' | 'compact';
}

export default function Leaderboard({
  scope,
  clubId,
  groupId,
  currentUserId,
  highlightCurrentUser = true,
  limit,
  variant = 'full',
}: LeaderboardProps) {
  // Appeler le hook useLeaderboard avec les paramètres
  const { players, isLoading, isError, error, refetch } = useLeaderboard(
    {
      scope,
      clubId,
      groupId,
      limit,
    },
    highlightCurrentUser ? currentUserId : undefined
  );

  // Convertir LeaderboardPlayer[] vers LeaderboardEntry[] pour LeaderboardList
  // (on garde la compatibilité avec l'ancien format pour ne pas casser LeaderboardList)
  const entries = React.useMemo(() => {
    return players.map((player) => {
      // Déterminer le rang à afficher selon le scope
      const displayRank = scope === 'club' && player.rankClub ? player.rankClub : player.rankGlobal;
      
      // Calculer le level depuis le rating (0-100 → 1-8)
      // Niveau 1: 0-12.5, Niveau 2: 12.5-25, etc.
      let calculatedLevel = 1;
      if (player.rating >= 87.5) calculatedLevel = 8;
      else if (player.rating >= 75) calculatedLevel = 7;
      else if (player.rating >= 62.5) calculatedLevel = 6;
      else if (player.rating >= 50) calculatedLevel = 5;
      else if (player.rating >= 37.5) calculatedLevel = 4;
      else if (player.rating >= 25) calculatedLevel = 3;
      else if (player.rating >= 12.5) calculatedLevel = 2;

      return {
        rank: displayRank,
        user_id: player.userId,
        pseudo: player.displayName,
        rating: player.rating,
        level: calculatedLevel,
        xp: player.xp,
        matches_count: 0, // TODO: Ajouter matches_count dans leaderboard_view si nécessaire
      };
    });
  }, [players, scope]);

  return (
    <LeaderboardList
      entries={entries}
      isLoading={isLoading}
      error={isError ? error : null}
      currentUserId={highlightCurrentUser ? currentUserId : undefined}
      variant={variant}
    />
  );
}

