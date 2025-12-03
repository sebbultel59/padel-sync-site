// app/profiles/[id]/trophies.tsx
// Écran affichant tous les trophées/badges d'un joueur

import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePlayerBadges, type PlayerBadge, type BadgeCategory } from "../../../hooks/usePlayerBadges";

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
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={BRAND} />
          </Pressable>
          <Text style={styles.headerTitle}>Mes Trophées</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={BRAND} />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={BRAND} />
          </Pressable>
          <Text style={styles.headerTitle}>Mes Trophées</Text>
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
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={BRAND} />
        </Pressable>
        <Text style={styles.headerTitle}>Mes Trophées</Text>
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

  return (
    <View style={[styles.badgeCard, { opacity }]}>
      <View
        style={[
          styles.badgeIconContainer,
          {
            backgroundColor: badge.unlocked
              ? `${categoryColor}20`
              : "#f3f4f6",
            borderColor: badge.unlocked ? categoryColor : "#d1d5db",
          },
        ]}
      >
        <Ionicons
          name={iconName}
          size={32}
          color={badge.unlocked ? categoryColor : "#9ca3af"}
        />
        {badge.unlocked && badge.rarityScore && badge.rarityScore > 50 && (
          <View style={styles.rareIndicator}>
            <Ionicons name="sparkles" size={10} color="#fbbf24" />
          </View>
        )}
      </View>
      <Text
        style={[
          styles.badgeLabel,
          { color: badge.unlocked ? "#111827" : "#9ca3af" },
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
    backgroundColor: "white",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "white",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: BRAND,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    fontSize: 14,
    color: "#ef4444",
    textAlign: "center",
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  statsCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: BRAND,
    marginBottom: 12,
    textAlign: "center",
  },
  progressBar: {
    width: "100%",
    height: 12,
    backgroundColor: "#e5e7eb",
    borderRadius: 6,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: BRAND,
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
    color: "#111827",
    flex: 1,
  },
  categoryCount: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "600",
  },
  badgesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  badgeCard: {
    width: "47%",
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    gap: 8,
  },
  badgeIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
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
  },
  badgeDescription: {
    fontSize: 11,
    color: "#6b7280",
    textAlign: "center",
  },
  badgeDate: {
    fontSize: 10,
    color: "#9ca3af",
    fontStyle: "italic",
  },
  emptyText: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    fontStyle: "italic",
  },
});

