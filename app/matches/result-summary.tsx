// app/matches/result-summary.tsx
// Écran de résumé après l'enregistrement d'un résultat de match

import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BRAND = '#1a4b97';

export default function MatchResultSummaryScreen() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  const oldRating = parseFloat(params.old_rating as string) || 0;
  const newRating = parseFloat(params.new_rating as string) || 0;
  const deltaRating = parseFloat(params.delta_rating as string) || 0;
  const level = parseInt(params.level as string, 10) || 1;
  const xp = parseFloat(params.xp as string) || 0;
  const won = params.won === 'true';

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

        {/* Zone pour les badges (à ajouter plus tard) */}
        <View style={styles.badgesContainer}>
          <Text style={styles.badgesTitle}>Badges débloqués</Text>
          <View style={styles.badgesPlaceholder}>
            <Text style={styles.badgesPlaceholderText}>
              Les badges seront affichés ici
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Bouton continuer */}
      <Pressable onPress={handleContinue} style={styles.continueButton}>
        <Text style={styles.continueButtonText}>Continuer</Text>
      </Pressable>
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
    marginBottom: 12,
    textAlign: 'center',
  },
  badgesPlaceholder: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
  },
  badgesPlaceholderText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
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


