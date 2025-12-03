// app/matches/result-summary.tsx
// Écran de résumé après l'enregistrement d'un résultat de match

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BRAND = '#1a4b97';

interface UnlockedBadge {
  user_id: string;
  badge_code: string;
  badge_id: string;
  badge_label: string;
}

export default function MatchResultSummaryScreen() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  const oldRating = parseFloat(params.old_rating as string) || 0;
  const newRating = parseFloat(params.new_rating as string) || 0;
  const deltaRating = parseFloat(params.delta_rating as string) || 0;
  const level = parseInt(params.level as string, 10) || 1;
  const xp = parseFloat(params.xp as string) || 0;
  const won = params.won === 'true';
  
  // Parser les badges débloqués
  const [unlockedBadges, setUnlockedBadges] = useState<UnlockedBadge[]>([]);
  const [showBadgeNotification, setShowBadgeNotification] = useState(false);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const scaleAnim = React.useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    try {
      const badgesParam = params.unlocked_badges as string;
      if (badgesParam) {
        const parsed = JSON.parse(badgesParam) as UnlockedBadge[];
        setUnlockedBadges(parsed || []);
        if (parsed && parsed.length > 0) {
          // Afficher la notification avec animation
          setShowBadgeNotification(true);
          Animated.parallel([
            Animated.timing(fadeAnim, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }),
            Animated.spring(scaleAnim, {
              toValue: 1,
              tension: 50,
              friction: 7,
              useNativeDriver: true,
            }),
          ]).start();
          
          // Masquer la notification après 5 secondes
          setTimeout(() => {
            Animated.parallel([
              Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
              }),
              Animated.timing(scaleAnim, {
                toValue: 0.8,
                duration: 300,
                useNativeDriver: true,
              }),
            ]).start(() => {
              setShowBadgeNotification(false);
            });
          }, 5000);
        }
      }
    } catch (e) {
      console.error('[MatchResultSummary] Error parsing badges:', e);
    }
  }, [params.unlocked_badges]);

  const handleContinue = () => {
    // Retourner à l'écran des matchs
    router.replace('/(tabs)/matches');
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 20 }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>
            {won ? '🎉 Victoire !' : '😔 Défaite'}
          </Text>
          <Text style={styles.subtitle}>
            {won
              ? 'Félicitations pour votre victoire !'
              : 'Bonne chance pour le prochain match !'}
          </Text>
        </View>

        {/* Changement de rating */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Points de niveau</Text>
          <View style={styles.ratingChangeContainer}>
            <Text
              style={[
                styles.ratingChange,
                deltaRating >= 0 ? styles.ratingChangePositive : styles.ratingChangeNegative,
              ]}
            >
              {deltaRating >= 0 ? '+' : ''}
              {deltaRating.toFixed(2)} points
            </Text>
            <Text style={styles.ratingDetails}>
              {oldRating.toFixed(2)} → {newRating.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Niveau et XP */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Niveau {level}</Text>
          <View style={styles.xpBarContainer}>
            <View style={styles.xpBarBackground}>
              <View style={[styles.xpBarFill, { width: `${xp}%` }]} />
            </View>
          </View>
          {level < 8 ? (
            <Text style={styles.xpText}>
              {xp.toFixed(1)}% vers le niveau {level + 1}
            </Text>
          ) : (
            <Text style={styles.xpText}>Niveau maximum atteint ! 🏆</Text>
          )}
        </View>

        {/* Section Badges - Toujours affichée */}
        <View style={styles.badgesContainer}>
          <Text style={styles.badgesTitle}>🏅 Badges</Text>
          {unlockedBadges.length > 0 ? (
            <>
              <Text style={styles.badgesSubtitle}>Badges débloqués lors de ce match</Text>
              <View style={styles.badgesList}>
                {unlockedBadges.map((badge) => (
                  <View key={badge.badge_id} style={styles.badgeItem}>
                    <View style={styles.badgeIconContainer}>
                      <Ionicons name="trophy" size={32} color="#fbbf24" />
                    </View>
                    <Text style={styles.badgeLabel}>{badge.badge_label}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <View style={styles.noBadgesContainer}>
              <Ionicons name="trophy-outline" size={48} color="#d1d5db" />
              <Text style={styles.noBadgesText}>
                Aucun badge débloqué lors de ce match
              </Text>
              <Text style={styles.noBadgesHint}>
                Continuez à jouer pour débloquer des badges !
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bouton continuer */}
      <Pressable onPress={handleContinue} style={styles.continueButton}>
        <Text style={styles.continueButtonText}>Continuer</Text>
      </Pressable>

      {/* Notification de badge débloqué */}
      {showBadgeNotification && unlockedBadges.length > 0 && (
        <Animated.View
          style={[
            styles.badgeNotification,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <View style={styles.badgeNotificationContent}>
            <View style={styles.badgeNotificationIcon}>
              <Ionicons name="trophy" size={32} color="#fbbf24" />
            </View>
            <View style={styles.badgeNotificationText}>
              <Text style={styles.badgeNotificationTitle}>
                🎉 Badge débloqué !
              </Text>
              <Text style={styles.badgeNotificationSubtitle}>
                {unlockedBadges.length === 1
                  ? unlockedBadges[0].badge_label
                  : `${unlockedBadges.length} badges débloqués`}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                Animated.parallel([
                  Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: true,
                  }),
                  Animated.timing(scaleAnim, {
                    toValue: 0.8,
                    duration: 300,
                    useNativeDriver: true,
                  }),
                ]).start(() => {
                  setShowBadgeNotification(false);
                });
              }}
              style={styles.badgeNotificationClose}
            >
              <Ionicons name="close" size={20} color="#6b7280" />
            </Pressable>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    padding: 20,
    gap: 20,
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: BRAND,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: BRAND,
    textAlign: 'center',
  },
  ratingChangeContainer: {
    alignItems: 'center',
    gap: 8,
  },
  ratingChange: {
    fontSize: 36,
    fontWeight: '800',
  },
  ratingChangePositive: {
    color: '#22c55e',
  },
  ratingChangeNegative: {
    color: '#ef4444',
  },
  ratingDetails: {
    fontSize: 14,
    color: '#6b7280',
  },
  xpBarContainer: {
    width: '100%',
    marginVertical: 8,
  },
  xpBarBackground: {
    width: '100%',
    height: 28,
    backgroundColor: '#e5e7eb',
    borderRadius: 14,
    overflow: 'hidden',
  },
  xpBarFill: {
    height: '100%',
    backgroundColor: BRAND,
    borderRadius: 14,
  },
  xpText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  badgesContainer: {
    marginTop: 8,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  badgesTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  badgesSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  noBadgesContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
    gap: 12,
  },
  noBadgesText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
    textAlign: 'center',
  },
  noBadgesHint: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  badgesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  badgeItem: {
    alignItems: 'center',
    gap: 8,
    minWidth: 100,
  },
  badgeIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fbbf24',
  },
  badgeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    maxWidth: 100,
  },
  badgeNotification: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    zIndex: 1000,
  },
  badgeNotificationContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 2,
    borderColor: '#fbbf24',
  },
  badgeNotificationIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeNotificationText: {
    flex: 1,
    gap: 4,
  },
  badgeNotificationTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  badgeNotificationSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  badgeNotificationClose: {
    padding: 4,
  },
  continueButton: {
    backgroundColor: BRAND,
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});


