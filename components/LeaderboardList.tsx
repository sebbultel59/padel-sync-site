// components/LeaderboardList.tsx
// Composant pour afficher un leaderboard (club, groupe, zone)

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LeaderboardEntry } from '../hooks/useLeaderboard';

const BRAND = '#1a4b97';

const LEVELS = [
  { v: 1, label: 'Débutant', color: '#a3e635' },
  { v: 2, label: 'Perfectionnement', color: '#86efac' },
  { v: 3, label: 'Élémentaire', color: '#60a5fa' },
  { v: 4, label: 'Intermédiaire', color: '#22d3ee' },
  { v: 5, label: 'Confirmé', color: '#fbbf24' },
  { v: 6, label: 'Avancé', color: '#f59e0b' },
  { v: 7, label: 'Expert', color: '#fb7185' },
  { v: 8, label: 'Elite', color: '#a78bfa' },
];

const colorForLevel = (n: number): string => {
  const level = LEVELS.find((x) => x.v === n);
  return level?.color || '#9ca3af';
};

interface LeaderboardListProps {
  entries: LeaderboardEntry[];
  isLoading: boolean;
  error: Error | null;
  currentUserId?: string | null;
  variant?: 'full' | 'compact';
}

export default function LeaderboardList({
  entries,
  isLoading,
  error,
  currentUserId,
  variant = 'full',
}: LeaderboardListProps) {
  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={BRAND} />
        <Text style={styles.loadingText}>Chargement du classement...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle" size={48} color="#ef4444" />
        <Text style={styles.errorText}>Erreur: {error.message}</Text>
      </View>
    );
  }

  if (entries.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="trophy-outline" size={48} color="#9ca3af" />
        <Text style={styles.emptyText}>Aucun joueur dans ce classement</Text>
      </View>
    );
  }

  const getRankIcon = (rank: number): string => {
    if (rank === 1) return '🏆';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return '';
  };

  // Mode compact : affichage simplifié
  if (variant === 'compact') {
    return (
      <View style={styles.compactContainer}>
        {entries.map((entry) => {
          const isCurrentUser = entry.user_id === currentUserId;
          const rankIcon = getRankIcon(entry.rank);
          const levelColor = colorForLevel(entry.level);

          return (
            <Pressable
              key={entry.user_id}
              onPress={() => router.push(`/profiles/${entry.user_id}`)}
              style={({ pressed }) => [
                styles.compactEntry,
                isCurrentUser && styles.compactCurrentUserEntry,
                pressed && styles.entryPressed,
              ]}
            >
              {/* Rang */}
              <View style={styles.compactRankContainer}>
                {rankIcon ? (
                  <Text style={styles.compactRankIcon}>{rankIcon}</Text>
                ) : (
                  <Text style={[styles.compactRankText, isCurrentUser && styles.compactCurrentUserRankText]}>
                    #{entry.rank}
                  </Text>
                )}
              </View>

              {/* Badge niveau compact */}
              <View style={[styles.compactLevelBadge, { borderColor: levelColor }]}>
                <Text style={[styles.compactLevelText, { color: levelColor }]}>{entry.level}</Text>
              </View>

              {/* Infos joueur compact */}
              <View style={styles.compactPlayerInfo}>
                <Text style={[styles.compactPseudo, isCurrentUser && styles.compactCurrentUserPseudo]}>
                  {entry.pseudo}
                </Text>
                <View style={styles.compactStatsRow}>
                  <Ionicons name="star" size={12} color={BRAND} />
                  <Text style={styles.compactStatText}>{entry.rating.toFixed(1)}</Text>
                  {entry.xp > 0 && (
                    <>
                      <Text style={styles.compactStatSeparator}>·</Text>
                      <Text style={styles.compactStatText}>{entry.xp.toFixed(0)}% XP</Text>
                    </>
                  )}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    );
  }

  // Mode full : affichage complet
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {entries.map((entry, index) => {
        const isCurrentUser = entry.user_id === currentUserId;
        const rankIcon = getRankIcon(entry.rank);
        const levelColor = colorForLevel(entry.level);

        return (
          <Pressable
            key={entry.user_id}
            onPress={() => router.push(`/profiles/${entry.user_id}`)}
            style={({ pressed }) => [
              styles.entry,
              isCurrentUser && styles.currentUserEntry,
              pressed && styles.entryPressed,
            ]}
          >
            {/* Rang */}
            <View style={styles.rankContainer}>
              {rankIcon ? (
                <Text style={styles.rankIcon}>{rankIcon}</Text>
              ) : (
                <Text style={[styles.rankText, isCurrentUser && styles.currentUserRankText]}>
                  #{entry.rank}
                </Text>
              )}
            </View>

            {/* Badge niveau */}
            <View style={[styles.levelBadge, { borderColor: levelColor }]}>
              <Text style={[styles.levelText, { color: levelColor }]}>{entry.level}</Text>
            </View>

            {/* Infos joueur */}
            <View style={styles.playerInfo}>
              <Text style={[styles.pseudo, isCurrentUser && styles.currentUserPseudo]}>
                {entry.pseudo}
              </Text>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Ionicons name="star" size={14} color={BRAND} />
                  <Text style={styles.statText}>{entry.rating.toFixed(1)}</Text>
                </View>
                <View style={styles.statItem}>
                  <Ionicons name="trophy" size={14} color="#fbbf24" />
                  <Text style={styles.statText}>{entry.matches_count} matchs</Text>
                </View>
              </View>
            </View>

            {/* Barre XP */}
            <View style={styles.xpContainer}>
              <View style={styles.xpBarBackground}>
                <View
                  style={[
                    styles.xpBarFill,
                    { width: `${entry.xp}%`, backgroundColor: levelColor },
                  ]}
                />
              </View>
              <Text style={styles.xpText}>{entry.xp.toFixed(0)}%</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    minHeight: 200,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#6b7280',
  },
  errorText: {
    marginTop: 16,
    fontSize: 14,
    color: '#ef4444',
    textAlign: 'center',
  },
  emptyText: {
    marginTop: 16,
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  contentContainer: {
    padding: 16,
    gap: 12,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  currentUserEntry: {
    backgroundColor: '#eff6ff',
    borderColor: BRAND,
    borderWidth: 2,
  },
  entryPressed: {
    opacity: 0.7,
  },
  rankContainer: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankIcon: {
    fontSize: 24,
  },
  rankText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#6b7280',
  },
  currentUserRankText: {
    color: BRAND,
  },
  levelBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
  },
  levelText: {
    fontSize: 18,
    fontWeight: '900',
  },
  playerInfo: {
    flex: 1,
    gap: 4,
  },
  pseudo: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  currentUserPseudo: {
    color: BRAND,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  xpContainer: {
    width: 80,
    alignItems: 'center',
    gap: 4,
  },
  xpBarBackground: {
    width: '100%',
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
  },
  xpBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  xpText: {
    fontSize: 10,
    color: '#6b7280',
    fontWeight: '600',
  },
  // Styles pour le mode compact
  compactContainer: {
    gap: 8,
  },
  compactEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 8,
    gap: 8,
  },
  compactCurrentUserEntry: {
    backgroundColor: '#eff6ff',
    borderColor: BRAND,
    borderWidth: 2,
  },
  compactRankContainer: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactRankIcon: {
    fontSize: 20,
  },
  compactRankText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#6b7280',
  },
  compactCurrentUserRankText: {
    color: BRAND,
  },
  compactLevelBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
  },
  compactLevelText: {
    fontSize: 14,
    fontWeight: '900',
  },
  compactPlayerInfo: {
    flex: 1,
    gap: 2,
  },
  compactPseudo: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  compactCurrentUserPseudo: {
    color: BRAND,
  },
  compactStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  compactStatText: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '600',
  },
  compactStatSeparator: {
    fontSize: 11,
    color: '#9ca3af',
    marginHorizontal: 2,
  },
});

