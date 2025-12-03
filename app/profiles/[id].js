// app/profiles/[id].js
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePlayerRating } from "../../hooks/usePlayerRating";
import { usePlayerBadges } from "../../hooks/usePlayerBadges";
import { supabase } from "../../lib/supabase";

const BRAND = "#1a4b97";
const AVATAR = 120;

const LEVELS = [
  { v: 1, label: "Débutant", color: "#a3e635" },
  { v: 2, label: "Perfectionnement", color: "#86efac" },
  { v: 3, label: "Élémentaire", color: "#60a5fa" },
  { v: 4, label: "Intermédiaire", color: "#22d3ee" },
  { v: 5, label: "Confirmé", color: "#fbbf24" },
  { v: 6, label: "Avancé", color: "#f59e0b" },
  { v: 7, label: "Expert", color: "#fb7185" },
  { v: 8, label: "Elite", color: "#a78bfa" },
];
const labelToLevel = new Map(LEVELS.map(x => [x.label.toLowerCase(), x.v]));
const levelMeta = (n) => LEVELS.find((x) => x.v === n) ?? null;

export default function ProfileScreen() {
  const { id, fromModal, returnTo, matchId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [p, setP] = useState(null);
  const { level, xp, isLoading: ratingLoading } = usePlayerRating(id);
  const { featuredRare, featuredRecent, unlockedCount, totalAvailable, isLoading: badgesLoading, error: badgesError } = usePlayerBadges(id);


  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!id) throw new Error("Profil introuvable");
        const { data, error } = await supabase
          .from("profiles")
          .select("id, email, display_name, name, avatar_url, niveau, main, cote, club, rayon_km, phone")
          .eq("id", String(id))
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Profil introuvable");
        if (mounted) setP(data);
      } catch (e) {
        Alert.alert("Erreur", e?.message ?? String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  const levelInfo = useMemo(() => {
    const raw = p?.niveau;
    if (!raw) return null;
    const num = Number(raw);
    if (Number.isFinite(num) && num >= 1 && num <= 8) {
      return levelMeta(num);
    }
    const numFromLabel = labelToLevel.get(String(raw).toLowerCase());
    if (numFromLabel) {
      return levelMeta(numFromLabel);
    }
    return { label: String(raw) };
  }, [p?.niveau]);

  if (loading) return <View style={s.center}><ActivityIndicator /></View>;
  if (!p) return <View style={s.center}><Text style={{ color: "#6b7280" }}>Profil introuvable</Text></View>;

  const title = p.display_name || p.name || p.email || "Joueur";
  const initial = (title?.trim?.()[0] ?? "?").toUpperCase();

  return (
    <ScrollView contentContainerStyle={s.container}>
      {/* Bouton retour */}
      <Pressable onPress={() => {
        if (fromModal === 'true' && returnTo === 'matches') {
          // Revenir à la page match avec un paramètre pour rouvrir la modale
          const url = matchId 
            ? `/(tabs)/matches?openInviteModal=true&matchId=${matchId}`
            : '/(tabs)/matches?openInviteModal=true';
          router.replace(url);
        } else if (router.canGoBack()) {
          router.back();
        } else {
          router.replace("/groupes");
        }
      }} style={s.backBtn}>
        <Text style={s.backTxt}>← Retour</Text>
      </Pressable>

      {/* Avatar + Nom */}
      <View style={s.hero}>
        {p.avatar_url ? (
          <Image source={{ uri: p.avatar_url }} style={s.avatar} />
        ) : (
          <View style={[s.avatar, s.avatarFallback]}>
            <Text style={s.initial}>{initial}</Text>
          </View>
        )}
        <Text style={s.title}>{title}</Text>
        <Text style={s.subtitle}>{p.email}</Text>
      </View>

      {/* Niveau et XP */}
      {!ratingLoading && level !== null && xp !== null && (
        <View style={s.levelCard}>
          <Text style={s.levelTitle}>Niveau {level}</Text>
          <View style={s.xpBarContainer}>
            <View style={s.xpBarBackground}>
              <View style={[s.xpBarFill, { width: `${xp}%` }]} />
            </View>
          </View>
          {level < 8 && (
            <Text style={s.xpText}>{xp.toFixed(1)}% vers le niveau {level + 1}</Text>
          )}
          {level === 8 && (
            <Text style={s.xpText}>Niveau maximum atteint ! 🏆</Text>
          )}
        </View>
      )}

      {/* Section Badges */}
      <View style={s.badgesCard}>
        {badgesLoading ? (
          <Text style={s.badgesTitle}>Chargement des trophées...</Text>
        ) : badgesError ? (
          <>
            <Text style={[s.badgesTitle, { color: '#ef4444', marginBottom: 8 }]}>Erreur : {badgesError}</Text>
            <Text style={s.noBadgesText}>ID utilisateur: {id}</Text>
          </>
        ) : (
          <>
            <View style={s.badgesHeader}>
              <Text style={s.badgesTitle}>Trophées : {unlockedCount}/{totalAvailable}</Text>
              <Pressable
                onPress={() => router.push(`/profiles/${id}/trophies`)}
                style={s.viewAllButton}
              >
                <Text style={s.viewAllText}>Voir tous mes trophées</Text>
                <Ionicons name="chevron-forward" size={16} color={BRAND} />
              </Pressable>
            </View>

          {/* Badges rares */}
          {featuredRare.length > 0 && (
            <View style={s.badgesRow}>
              <Text style={s.badgesRowLabel}>Rares</Text>
              <View style={s.badgesList}>
                {featuredRare.slice(0, 3).map((badge) => (
                  <BadgeIcon key={badge.id} badge={badge} size={48} />
                ))}
              </View>
            </View>
          )}

          {/* Badges récents */}
          {featuredRecent.length > 0 && (
            <View style={s.badgesRow}>
              <Text style={s.badgesRowLabel}>Récents</Text>
              <View style={s.badgesList}>
                {featuredRecent.slice(0, 3).map((badge) => (
                  <BadgeIcon key={badge.id} badge={badge} size={48} />
                ))}
              </View>
            </View>
          )}

            {unlockedCount === 0 && totalAvailable > 0 && (
              <Text style={s.noBadgesText}>Aucun badge débloqué pour le moment</Text>
            )}
            {totalAvailable === 0 && (
              <Text style={s.noBadgesText}>Aucun badge disponible</Text>
            )}
          </>
        )}
      </View>

      {/* Résumé visuel */}
      <View style={s.card}>
        <Text style={s.sectionTitle}>Résumé</Text>
        <View style={s.tiles}>
          <Tile emoji="🔥" label="Niveau" value={levelInfo?.v || levelInfo?.label || "—"} hint={levelInfo?.label} />
          <Tile emoji="🖐️" label="Main" value={p.main || "—"} />
          <Tile emoji="🎯" label="Côté" value={p.cote || "—"} />
          <Tile emoji="🏟️" label="Club" value={p.club || "—"} />
          <Tile emoji="📍" label="Rayon" value={formatRayon(p.rayon_km)} />
          <Tile
            emoji="📞"
            label="Téléphone"
            value={p.phone || "—"}
            onPress={p.phone ? () => Linking.openURL(`tel:${p.phone}`) : null}
          />
        </View>
      </View>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function formatRayon(v) {
  if (v == null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (n === 99) return "+30 km";
  return `${n} km`;
}

function Tile({ emoji, label, value, hint, onPress }) {
  const content = (
    <>
      <Text style={s.tileEmoji}>{emoji}</Text>
      <Text style={s.tileValue}>{value}</Text>
      <Text style={s.tileLabel}>{hint ? `${label} · ${hint}` : label}</Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [s.tile, pressed && { opacity: 0.7 }]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={s.tile}>{content}</View>;
}

function BadgeIcon({ badge, size = 40 }) {
  const getBadgeIcon = (category) => {
    switch (category) {
      case 'volume': return 'trophy';
      case 'performance': return 'flame';
      case 'social': return 'people';
      case 'club': return 'business';
      case 'bar': return 'wine';
      default: return 'star';
    }
  };

  const getBadgeColor = (category) => {
    switch (category) {
      case 'volume': return '#fbbf24';
      case 'performance': return '#ef4444';
      case 'social': return '#3b82f6';
      case 'club': return '#8b5cf6';
      case 'bar': return '#ec4899';
      default: return '#6b7280';
    }
  };

  const iconName = getBadgeIcon(badge.category);
  const iconColor = badge.unlocked ? getBadgeColor(badge.category) : '#d1d5db';
  const opacity = badge.unlocked ? 1 : 0.4;

  return (
    <View style={[s.badgeIconContainer, { opacity }]}>
      <Ionicons name={iconName} size={size} color={iconColor} />
      {badge.unlocked && badge.rarityScore && badge.rarityScore > 50 && (
        <View style={s.rareBadge}>
          <Ionicons name="sparkles" size={12} color="#fbbf24" />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 16, gap: 12, backgroundColor: "white" },

  backBtn: {
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: "flex-start",
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  backTxt: { color: BRAND, fontWeight: "700" },

  hero: { alignItems: "center", gap: 8, marginBottom: 12 },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: "#f3f4f6" },
  avatarFallback: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: "#eaf2ff", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: BRAND },
  initial: { fontSize: 48, fontWeight: "800", color: BRAND },
  title: { fontSize: 22, fontWeight: "800", color: BRAND, textAlign: "center" },
  subtitle: { fontSize: 13, color: "#6b7280", textAlign: "center" },

  levelCard: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  levelTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: BRAND,
    textAlign: "center",
  },
  xpBarContainer: {
    width: "100%",
    marginVertical: 8,
  },
  xpBarBackground: {
    width: "100%",
    height: 24,
    backgroundColor: "#e5e7eb",
    borderRadius: 12,
    overflow: "hidden",
  },
  xpBarFill: {
    height: "100%",
    backgroundColor: BRAND,
    borderRadius: 12,
  },
  xpText: {
    fontSize: 13,
    color: "#6b7280",
    textAlign: "center",
  },
  badgesCard: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 16,
  },
  badgesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badgesTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: BRAND,
  },
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: "600",
    color: BRAND,
  },
  badgesRow: {
    gap: 8,
  },
  badgesRowLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  badgesList: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  badgeIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#e5e7eb",
    position: "relative",
  },
  rareBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "white",
    borderRadius: 10,
    padding: 2,
    borderWidth: 1,
    borderColor: "#fbbf24",
  },
  noBadgesText: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
    fontStyle: "italic",
    paddingVertical: 8,
  },
  card: { backgroundColor: "white", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 12, gap: 12 },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: "#111827" },

  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  tile: { width: "47%", borderWidth: 1, borderColor: "#eef2f7", borderRadius: 12, paddingVertical: 14, alignItems: "center", gap: 6, backgroundColor: "#fafafa" },
  tileEmoji: { fontSize: 28 },
  tileValue: { fontSize: 18, fontWeight: "800", color: BRAND },
  tileLabel: { fontSize: 12, color: "#6b7280", textAlign: "center" },
});