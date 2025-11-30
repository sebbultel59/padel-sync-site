// app/clubs/[id]/dashboard.js
// Dashboard Club Manager - Statistiques et vue d'ensemble
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../../lib/supabase";

const BRAND = "#1a4b87";

export default function ClubDashboardScreen() {
  const params = useLocalSearchParams();
  const clubId = params?.id;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    groupsCount: 0,
    uniqueMembersCount: 0,
    matchesThisWeek: 0,
    matchesThisMonth: 0,
    popularTimeSlots: [],
  });

  const loadStats = useCallback(async () => {
    if (!clubId) return;

    try {
      setLoading(true);

      // Nombre de groupes
      const { count: groupsCount } = await supabase
        .from("groups")
        .select("*", { count: "exact", head: true })
        .eq("club_id", clubId);

      // Membres uniques (tous les membres de tous les groupes du club)
      const { data: groupsData } = await supabase
        .from("groups")
        .select("id")
        .eq("club_id", clubId);

      const groupIds = (groupsData || []).map((g) => g.id);
      let uniqueMembersCount = 0;
      if (groupIds.length > 0) {
        const { data: membersData } = await supabase
          .from("group_members")
          .select("user_id")
          .in("group_id", groupIds);

        const uniqueMemberIds = new Set(
          (membersData || []).map((m) => m.user_id)
        );
        uniqueMembersCount = uniqueMemberIds.size;
      }

      // Matchs cette semaine et ce mois
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const { data: matchesData } = await supabase
        .from("matches")
        .select("id, time_slots!inner(starts_at)")
        .in("group_id", groupIds.length > 0 ? groupIds : ["00000000-0000-0000-0000-000000000000"]);

      let matchesThisWeek = 0;
      let matchesThisMonth = 0;
      const timeSlotCounts = {};

      (matchesData || []).forEach((match) => {
        const startsAt = match.time_slots?.starts_at;
        if (startsAt) {
          const matchDate = new Date(startsAt);
          const hour = matchDate.getHours();

          // Compter par créneau horaire
          const timeSlot = `${hour}h-${hour + 1}h`;
          timeSlotCounts[timeSlot] = (timeSlotCounts[timeSlot] || 0) + 1;

          // Matchs cette semaine
          if (matchDate >= startOfWeek) {
            matchesThisWeek++;
          }

          // Matchs ce mois
          if (matchDate >= startOfMonth) {
            matchesThisMonth++;
          }
        }
      });

      // Créneaux les plus utilisés (top 3)
      const popularTimeSlots = Object.entries(timeSlotCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([slot, count]) => ({ slot, count }));

      setStats({
        groupsCount: groupsCount || 0,
        uniqueMembersCount,
        matchesThisWeek,
        matchesThisMonth,
        popularTimeSlots,
      });
    } catch (e) {
      console.error("[Dashboard] Erreur:", e);
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={BRAND} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Statistiques principales */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Ionicons name="people" size={32} color={BRAND} />
            <Text style={styles.statValue}>{stats.groupsCount}</Text>
            <Text style={styles.statLabel}>Groupes</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons name="person" size={32} color={BRAND} />
            <Text style={styles.statValue}>{stats.uniqueMembersCount}</Text>
            <Text style={styles.statLabel}>Membres uniques</Text>
          </View>
        </View>

        {/* Matchs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Matchs</Text>
          <View style={styles.matchStatsRow}>
            <View style={styles.matchStatBox}>
              <Text style={styles.matchStatValue}>{stats.matchesThisWeek}</Text>
              <Text style={styles.matchStatLabel}>Cette semaine</Text>
            </View>
            <View style={styles.matchStatBox}>
              <Text style={styles.matchStatValue}>{stats.matchesThisMonth}</Text>
              <Text style={styles.matchStatLabel}>Ce mois</Text>
            </View>
          </View>
        </View>

        {/* Créneaux les plus utilisés */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Créneaux les plus utilisés</Text>
          {stats.popularTimeSlots.length === 0 ? (
            <Text style={styles.emptyText}>Aucun créneau enregistré</Text>
          ) : (
            <View style={styles.timeSlotsList}>
              {stats.popularTimeSlots.map((item, index) => (
                <View key={index} style={styles.timeSlotItem}>
                  <Text style={styles.timeSlotLabel}>{item.slot}</Text>
                  <Text style={styles.timeSlotCount}>{item.count} matchs</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7fb",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  statsGrid: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  statValue: {
    fontSize: 32,
    fontWeight: "700",
    color: BRAND,
    marginTop: 8,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
    marginBottom: 12,
  },
  matchStatsRow: {
    flexDirection: "row",
    gap: 12,
  },
  matchStatBox: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  matchStatValue: {
    fontSize: 24,
    fontWeight: "700",
    color: BRAND,
    marginBottom: 4,
  },
  matchStatLabel: {
    fontSize: 12,
    color: "#6b7280",
  },
  timeSlotsList: {
    gap: 8,
  },
  timeSlotItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
  },
  timeSlotLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#000",
  },
  timeSlotCount: {
    fontSize: 14,
    color: "#6b7280",
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 14,
    fontStyle: "italic",
    textAlign: "center",
    padding: 16,
  },
});

