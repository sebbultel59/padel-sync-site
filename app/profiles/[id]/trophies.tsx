// app/profiles/[id]/trophies.tsx
// Écran affichant tous les trophées/badges d'un joueur

import { router, useLocalSearchParams, Stack } from "expo-router";
import React from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePlayerBadges, type PlayerBadge, type BadgeCategory } from "../../../hooks/usePlayerBadges";
import { getBadgeImage } from "../../../lib/badgeImages";

const BRAND = "#1a4b97";

const CATEGORY_LABELS: Record<BadgeCategory, string> = {
  volume: "Volume",
  performance: "Performance",
  social: "Social",
  club: "Club",
  bar: "Bar / Convivialité",
  other: "Autres",
};

const CATEGORY_ICONS: Record<BadgeCategory, keyof typeof Ionicons.glyphMap> = {
  volume: "trophy",
  performance: "flame",
  social: "people",
  club: "business",
  bar: "wine",
  other: "star",
};

const CATEGORY_COLORS: Record<BadgeCategory, string> = {
  volume: "#fbbf24",
  performance: "#ef4444",
  social: "#3b82f6",
  club: "#8b5cf6",
  bar: "#ec4899",
  other: "#6b7280",
};

export default function PlayerTrophiesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { allBadges, unlockedCount, totalAvailable, isLoading, error } = usePlayerBadges(id);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.push('/(tabs)/stats')} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#e0ff00" />
          </Pressable>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit>
              MES TROPHEES
            </Text>
          </View>
          <View style={styles.backButton} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#e0ff00" />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.push('/(tabs)/stats')} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#e0ff00" />
          </Pressable>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit>
              MES TROPHEES
            </Text>
          </View>
          <View style={styles.backButton} />
        </View>
        <View style={styles.center}>
          <Text style={styles.errorText}>Erreur : {error}</Text>
        </View>
      </View>
    );
  }

  // Grouper les badges par catégorie
  const badgesByCategory = allBadges.reduce((acc, badge) => {
    const category = badge.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(badge);
    return acc;
  }, {} as Partial<Record<BadgeCategory, PlayerBadge[]>>);

  // Trier chaque catégorie : débloqués d'abord (par rareté puis date), puis non débloqués
  Object.keys(badgesByCategory).forEach((category) => {
    const badges = badgesByCategory[category as BadgeCategory];
    badges.sort((a, b) => {
      // Ordre spécifique pour la catégorie Performance
      if (category === 'performance') {
        const performanceOrder: Record<string, number> = {
          'STREAK_3_WINS': 1,
          'STREAK_5_WINS': 2,
          'STREAK_10_WINS': 3,
          'UPSET_15_RATING': 4,
        };
        const orderA = performanceOrder[a.code] || 999;
        const orderB = performanceOrder[b.code] || 999;
        if (orderA !== orderB) return orderA - orderB;
      }
      
      // Ordre spécifique pour la catégorie Volume
      if (category === 'volume') {
        const volumeOrder: Record<string, number> = {
          'VOLUME_5_MATCHES': 1,
          'VOLUME_20_MATCHES': 2,
          'VOLUME_50_MATCHES': 3,
          'VOLUME_100_MATCHES': 4,
          'TOURNAMENT_5_MATCHES': 5,
          'RANKED_10_MATCHES': 6,
        };
        const orderA = volumeOrder[a.code] || 999;
        const orderB = volumeOrder[b.code] || 999;
        if (orderA !== orderB) return orderA - orderB;
      }
      
      // Ordre spécifique pour la catégorie Social
      if (category === 'social') {
        const socialOrder: Record<string, number> = {
          'SOCIAL_5_PARTNERS': 1,
          'SOCIAL_10_PARTNERS': 2,
          'SOCIAL_20_PARTNERS': 3,
          'CAMELEON': 4,
        };
        const orderA = socialOrder[a.code] || 999;
        const orderB = socialOrder[b.code] || 999;
        if (orderA !== orderB) return orderA - orderB;
      }
      
      // D'abord les débloqués
      if (a.unlocked && !b.unlocked) return -1;
      if (!a.unlocked && b.unlocked) return 1;
      
      // Si tous les deux débloqués, trier par rareté puis date
      if (a.unlocked && b.unlocked) {
        const rarityDiff = (b.rarityScore || 0) - (a.rarityScore || 0);
        if (rarityDiff !== 0) return rarityDiff;
        
        const dateA = a.unlockedAt ? new Date(a.unlockedAt).getTime() : 0;
        const dateB = b.unlockedAt ? new Date(b.unlockedAt).getTime() : 0;
        return dateB - dateA; // Plus récent en premier
      }
      
      // Si tous les deux non débloqués, ordre alphabétique
      return a.label.localeCompare(b.label);
    });
  });

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
        <View style={styles.header}>
          <Pressable onPress={() => router.push('/(tabs)/stats')} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#e0ff00" />
          </Pressable>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit>
              MES TROPHEES
            </Text>
          </View>
          <View style={styles.backButton} />
        </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Statistiques */}
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>
            {unlockedCount} / {totalAvailable} badges débloqués
          </Text>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${(unlockedCount / totalAvailable) * 100}%` },
              ]}
            />
          </View>
        </View>

        {/* Badges par catégorie */}
        {Object.entries(badgesByCategory).map(([category, badges]) => {
          if (!badges || badges.length === 0) return null;
          const categoryKey = category as BadgeCategory;
          return (
            <View key={category} style={styles.categorySection}>
              <View style={styles.categoryHeader}>
                <Ionicons
                  name={CATEGORY_ICONS[categoryKey]}
                  size={24}
                  color={CATEGORY_COLORS[categoryKey]}
                />
                <Text style={styles.categoryTitle}>
                  {CATEGORY_LABELS[categoryKey]}
                </Text>
                <Text style={styles.categoryCount}>
                  ({badges.filter((b) => b.unlocked).length}/{badges.length})
                </Text>
              </View>

              <View style={styles.badgesGrid}>
                {badges.map((badge) => (
                  <BadgeCard key={badge.id} badge={badge} />
                ))}
              </View>
            </View>
          );
        })}

        {allBadges.length === 0 && (
          <View style={styles.center}>
            <Text style={styles.emptyText}>Aucun badge disponible</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function BadgeCard({ badge }: { badge: PlayerBadge }) {
  const categoryColor = CATEGORY_COLORS[badge.category];
  const iconName = CATEGORY_ICONS[badge.category];
  const opacity = badge.unlocked ? 1 : 0.4;
  const badgeImage = getBadgeImage(badge.code, badge.unlocked);

  return (
    <View style={[styles.badgeCard, { opacity }]}>
      <View
        style={[
          styles.badgeIconContainer,
          {
            backgroundColor: 'transparent',
            borderColor: 'transparent',
          },
        ]}
      >
        {badgeImage ? (
          <Image
            source={badgeImage}
            style={{ width: 192, height: 192, resizeMode: 'contain' }}
          />
        ) : (
          <Ionicons
            name={iconName}
            size={192}
            color={badge.unlocked ? categoryColor : "#9ca3af"}
          />
        )}
      </View>
      <Text
        style={[
          styles.badgeLabel,
          { color: badge.unlocked ? "#e0ff00" : "#6b7280" },
        ]}
        numberOfLines={2}
      >
        {badge.label}
      </Text>
      {badge.description && (
        <Text style={styles.badgeDescription} numberOfLines={2}>
          {badge.description}
        </Text>
      )}
      {badge.unlocked && badge.unlockedAt && (
        <Text style={styles.badgeDate}>
          {new Date(badge.unlockedAt).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#001831",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2937",
    backgroundColor: "#001831",
    minHeight: 60,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "900",
    color: "#e0ff00",
    textTransform: "uppercase",
    textAlign: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    fontSize: 14,
    color: "#e0ff00",
    textAlign: "center",
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 16,
  },
  statsCard: {
    backgroundColor: "#032344",
    borderRadius: 12,
    padding: 16,
    borderWidth: 0.5,
    borderColor: "#e0ff00",
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#e0ff00",
    marginBottom: 12,
    textAlign: "center",
  },
  progressBar: {
    width: "100%",
    height: 12,
    backgroundColor: "#1f2937",
    borderRadius: 6,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#e0ff00",
    borderRadius: 6,
  },
  categorySection: {
    gap: 12,
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#e0ff00",
    flex: 1,
  },
  categoryCount: {
    fontSize: 13,
    color: "#e0ff00",
    fontWeight: "600",
  },
  badgesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  badgeCard: {
    width: "47%",
    backgroundColor: "#032344",
    borderWidth: 0.5,
    borderColor: "#e0ff00",
    borderRadius: 12,
    padding: 6,
    paddingTop: 6,
    paddingBottom: 6,
    alignItems: "center",
    gap: 2,
  },
  badgeIconContainer: {
    width: 384,
    height: 200,
    borderRadius: 192,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: 'transparent',
    borderWidth: 0,
    position: "relative",
  },
  rareIndicator: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "white",
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: "#fbbf24",
  },
  badgeLabel: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    color: "#e0ff00",
  },
  badgeDescription: {
    fontSize: 11,
    color: "#9ca3af",
    textAlign: "center",
  },
  badgeDate: {
    fontSize: 10,
    color: "#6b7280",
    fontStyle: "italic",
  },
  emptyText: {
    fontSize: 14,
    color: "#e0ff00",
    textAlign: "center",
    fontStyle: "italic",
  },
});

