// components/ShareableBadgeCard.tsx
// Composant pour afficher une carte de badge partageable

import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { PlayerBadge, BadgeCategory } from "../hooks/usePlayerBadges";

const BRAND = "#1a4b97";

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

interface ShareableBadgeCardProps {
  badge: PlayerBadge;
  playerPseudo: string;
  level: number;
  avatarUrl?: string;
}

export function ShareableBadgeCard({
  badge,
  playerPseudo,
  level,
  avatarUrl,
}: ShareableBadgeCardProps) {
  const categoryColor = CATEGORY_COLORS[badge.category];
  const iconName = CATEGORY_ICONS[badge.category];

  return (
    <View style={styles.container}>
      {/* En-tête avec logo Padel Sync */}
      <View style={styles.header}>
        <Text style={styles.logoText}>PADEL SYNC</Text>
      </View>

      {/* Contenu principal */}
      <View style={styles.content}>
        {/* Badge */}
        <View
          style={[
            styles.badgeContainer,
            {
              backgroundColor: `${categoryColor}20`,
              borderColor: categoryColor,
            },
          ]}
        >
          <Ionicons name={iconName} size={64} color={categoryColor} />
          {badge.rarityScore && badge.rarityScore > 50 && (
            <View style={styles.rareBadge}>
              <Ionicons name="sparkles" size={20} color="#fbbf24" />
            </View>
          )}
        </View>

        {/* Label du badge */}
        <Text style={styles.badgeLabel}>{badge.label}</Text>
        {badge.description && (
          <Text style={styles.badgeDescription}>{badge.description}</Text>
        )}

        {/* Informations joueur */}
        <View style={styles.playerInfo}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>
                {playerPseudo.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.playerDetails}>
            <Text style={styles.playerName}>{playerPseudo}</Text>
            <Text style={styles.playerLevel}>Niveau {level}</Text>
          </View>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Débloqué sur Padel Sync</Text>
        {badge.unlockedAt && (
          <Text style={styles.footerDate}>
            {new Date(badge.unlockedAt).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 400,
    minHeight: 500,
    backgroundColor: "white",
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    backgroundColor: BRAND,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  logoText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#e0ff00",
    letterSpacing: 2,
  },
  content: {
    flex: 1,
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  badgeContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  rareBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "white",
    borderRadius: 16,
    padding: 4,
    borderWidth: 2,
    borderColor: "#fbbf24",
  },
  badgeLabel: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
  },
  badgeDescription: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    maxWidth: 300,
  },
  playerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: BRAND,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#eaf2ff",
    borderWidth: 2,
    borderColor: BRAND,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 24,
    fontWeight: "800",
    color: BRAND,
  },
  playerDetails: {
    alignItems: "flex-start",
  },
  playerName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  playerLevel: {
    fontSize: 14,
    color: BRAND,
    fontWeight: "600",
  },
  footer: {
    backgroundColor: "#f9fafb",
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  footerText: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  footerDate: {
    fontSize: 11,
    color: "#9ca3af",
    marginTop: 4,
  },
});


