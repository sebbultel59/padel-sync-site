// components/PlayerRankSummary.tsx
// Composant pour afficher uniquement les positions d'un joueur dans différents classements

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useActiveGroup } from '../lib/activeGroup';
import { useUserRole } from '../lib/roles';
import { supabase } from '../lib/supabase';

const BRAND = '#1a4b97';

interface PlayerRankSummaryProps {
  playerId: string;
  clubId?: string | null;
  groupId?: string | null;
  city?: string | null;
  showGlobal?: boolean;
  showClub?: boolean;
  showGroup?: boolean;
}

interface RankInfo {
  rank: number;
  total: number;
  scope: 'global' | 'club' | 'group';
  label: string;
}

export default function PlayerRankSummary({
  playerId,
  clubId,
  groupId,
  city,
  showGlobal = true,
  showClub = true,
  showGroup = true,
}: PlayerRankSummaryProps) {
  const { clubId: userClubId } = useUserRole();
  const { activeGroup } = useActiveGroup();
  
  const [globalRank, setGlobalRank] = useState<RankInfo | null>(null);
  const [clubRank, setClubRank] = useState<RankInfo | null>(null);
  const [groupRank, setGroupRank] = useState<RankInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Utiliser les props si fournies, sinon les hooks
  const effectiveClubId = clubId || userClubId;
  const effectiveGroupId = groupId || activeGroup?.id;
  const effectiveCity = city;

  useEffect(() => {
    const fetchRanks = async () => {
      setLoading(true);
      try {
        // Récupérer les classements en parallèle
        const promises: Promise<void>[] = [];

        // Classement global
        if (showGlobal && effectiveCity) {
          promises.push(
            (async () => {
              try {
                const { data, error } = await supabase.rpc('zone_leaderboard', {
                  p_city: effectiveCity,
                });
                if (!error && data) {
                  const playerEntry = data.find((e: any) => e.user_id === playerId);
                  if (playerEntry) {
                    setGlobalRank({
                      rank: Number(playerEntry.rank),
                      total: data.length,
                      scope: 'global',
                      label: 'Global',
                    });
                  }
                }
              } catch (err) {
                console.error('[PlayerRankSummary] Error fetching global rank:', err);
              }
            })()
          );
        }

        // Classement club
        if (showClub && effectiveClubId) {
          promises.push(
            (async () => {
              try {
                const { data, error } = await supabase.rpc('club_leaderboard', {
                  p_club_id: effectiveClubId,
                });
                if (!error && data) {
                  const playerEntry = data.find((e: any) => e.user_id === playerId);
                  if (playerEntry) {
                    setClubRank({
                      rank: Number(playerEntry.rank),
                      total: data.length,
                      scope: 'club',
                      label: 'Club',
                    });
                  }
                }
              } catch (err) {
                console.error('[PlayerRankSummary] Error fetching club rank:', err);
              }
            })()
          );
        }

        // Classement groupe
        if (showGroup && effectiveGroupId) {
          promises.push(
            (async () => {
              try {
                const { data, error } = await supabase.rpc('group_leaderboard', {
                  p_group_id: effectiveGroupId,
                });
                if (!error && data) {
                  const playerEntry = data.find((e: any) => e.user_id === playerId);
                  if (playerEntry) {
                    setGroupRank({
                      rank: Number(playerEntry.rank),
                      total: data.length,
                      scope: 'group',
                      label: 'Groupe',
                    });
                  }
                }
              } catch (err) {
                console.error('[PlayerRankSummary] Error fetching group rank:', err);
              }
            })()
          );
        }

        await Promise.all(promises);
      } catch (error) {
        console.error('[PlayerRankSummary] Error fetching ranks:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRanks();
  }, [playerId, effectiveClubId, effectiveGroupId, effectiveCity, showGlobal, showClub, showGroup]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={BRAND} />
      </View>
    );
  }

  const ranks: RankInfo[] = [];
  if (globalRank) ranks.push(globalRank);
  if (clubRank) ranks.push(clubRank);
  if (groupRank) ranks.push(groupRank);

  if (ranks.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.noDataText}>Aucun classement disponible</Text>
      </View>
    );
  }

  const getRankIcon = (rank: number): string => {
    if (rank === 1) return '🏆';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return '';
  };

  const handlePress = (scope: 'global' | 'club' | 'group') => {
    const params: any = { initialScope: scope };
    if (scope === 'club' && effectiveClubId) params.clubId = effectiveClubId;
    if (scope === 'group' && effectiveGroupId) params.groupId = effectiveGroupId;
    router.push({ pathname: '/leaderboard', params });
  };

  return (
    <View style={styles.container}>
      {ranks.map((rankInfo) => {
        const rankIcon = getRankIcon(rankInfo.rank);
        return (
          <Pressable
            key={rankInfo.scope}
            onPress={() => handlePress(rankInfo.scope)}
            style={({ pressed }) => [
              styles.rankCard,
              pressed && styles.rankCardPressed,
            ]}
          >
            <View style={styles.rankContent}>
              <View style={styles.rankLeft}>
                <Ionicons
                  name={rankInfo.scope === 'global' ? 'globe' : rankInfo.scope === 'club' ? 'business' : 'people'}
                  size={20}
                  color={BRAND}
                />
                <Text style={styles.rankLabel}>{rankInfo.label}</Text>
              </View>
              <View style={styles.rankRight}>
                {rankIcon ? (
                  <Text style={styles.rankIcon}>{rankIcon}</Text>
                ) : (
                  <Text style={styles.rankNumber}>#{rankInfo.rank}</Text>
                )}
                <Text style={styles.rankTotal}>sur {rankInfo.total}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  noDataText: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    padding: 16,
  },
  rankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    gap: 12,
  },
  rankCardPressed: {
    opacity: 0.7,
  },
  rankContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rankLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rankLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  rankRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rankIcon: {
    fontSize: 20,
  },
  rankNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: BRAND,
  },
  rankTotal: {
    fontSize: 12,
    color: '#6b7280',
  },
});

