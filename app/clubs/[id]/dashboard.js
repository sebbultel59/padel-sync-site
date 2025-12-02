// app/clubs/[id]/dashboard.js
// Dashboard Club Manager - Statistiques et vue d'ensemble
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  LineChart,
  BarChart,
  PieChart,
} from "react-native-chart-kit";
import { supabase } from "../../../lib/supabase";

const BRAND = "#1a4b87";
const CHART_COLOR = "#e0ff00";
const screenWidth = Dimensions.get("window").width;

// Configuration des graphiques
const chartConfig = {
  backgroundColor: "#ffffff",
  backgroundGradientFrom: "#ffffff",
  backgroundGradientTo: "#ffffff",
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(224, 255, 0, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
  style: {
    borderRadius: 16,
  },
  propsForDots: {
    r: "6",
    strokeWidth: "2",
    stroke: CHART_COLOR,
  },
  propsForBackgroundLines: {
    strokeDasharray: "",
    stroke: "#e0e0e0",
    strokeWidth: 1,
  },
};

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
    // Données pour graphiques
    matchesByWeek: [],
    matchesByTimeSlot: [],
    matchesByGroup: [],
    membersByMonth: [],
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

      // Tous les créneaux horaires pour le graphique en barres
      const allTimeSlots = Object.entries(timeSlotCounts)
        .sort(([a], [b]) => {
          const hourA = parseInt(a.split("h")[0]);
          const hourB = parseInt(b.split("h")[0]);
          return hourA - hourB;
        })
        .map(([slot, count]) => ({ slot, count }));

      // Matchs par semaine sur 8 semaines
      const matchesByWeek = [];
      for (let i = 7; i >= 0; i--) {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - (now.getDay() + i * 7));
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        const weekMatches = (matchesData || []).filter((match) => {
          const startsAt = match.time_slots?.starts_at;
          if (!startsAt) return false;
          const matchDate = new Date(startsAt);
          return matchDate >= weekStart && matchDate <= weekEnd;
        }).length;

        const weekLabel = weekStart.toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
        });
        matchesByWeek.push({ week: weekLabel, count: weekMatches });
      }

      // Matchs par groupe
      const matchesByGroupData = {};
      if (groupIds.length > 0) {
        const { data: matchesWithGroups } = await supabase
          .from("matches")
          .select("id, group_id, groups(id, name)")
          .in("group_id", groupIds);

        (matchesWithGroups || []).forEach((match) => {
          const groupName = match.groups?.name || "Sans groupe";
          matchesByGroupData[groupName] = (matchesByGroupData[groupName] || 0) + 1;
        });
      }

      const matchesByGroup = Object.entries(matchesByGroupData)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      // Membres par mois sur 3 mois
      const membersByMonth = [];
      for (let i = 2; i >= 0; i--) {
        const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
        const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999);

        // Récupérer les membres qui ont rejoint avant la fin du mois
        const { data: membersInMonth } = await supabase
          .from("group_members")
          .select("user_id, created_at")
          .in("group_id", groupIds.length > 0 ? groupIds : ["00000000-0000-0000-0000-000000000000"])
          .lte("created_at", monthEnd.toISOString());

        const uniqueMembersInMonth = new Set(
          (membersInMonth || [])
            .filter((m) => {
              if (!m.created_at) return false;
              const memberDate = new Date(m.created_at);
              return memberDate <= monthEnd;
            })
            .map((m) => m.user_id)
        ).size;

        const monthLabel = monthDate.toLocaleDateString("fr-FR", {
          month: "short",
          year: "numeric",
        });
        membersByMonth.push({ month: monthLabel, count: uniqueMembersInMonth });
      }

      setStats({
        groupsCount: groupsCount || 0,
        uniqueMembersCount,
        matchesThisWeek,
        matchesThisMonth,
        popularTimeSlots,
        matchesByWeek,
        matchesByTimeSlot: allTimeSlots,
        matchesByGroup,
        membersByMonth,
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
          <View style={styles.sectionTitleRow}>
            <Ionicons name="tennisball" size={20} color="#e0ff00" />
            <Text style={styles.sectionTitle}>Matchs</Text>
          </View>
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
          <View style={styles.sectionTitleRow}>
            <Ionicons name="flame" size={20} color="#e0ff00" />
            <Text style={styles.sectionTitle}>Créneaux les plus utilisés</Text>
          </View>
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

        {/* Graphique : Évolution des matchs (8 semaines) */}
        {stats.matchesByWeek && stats.matchesByWeek.length > 0 && stats.matchesByWeek.some((item) => item.count > 0) && (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="trending-up" size={20} color="#e0ff00" />
              <Text style={styles.sectionTitle}>Évolution des matchs</Text>
            </View>
            <View style={styles.chartContainer}>
              <LineChart
                data={{
                  labels: stats.matchesByWeek.map((item) => item.week),
                  datasets: [
                    {
                      data: stats.matchesByWeek.map((item) => item.count),
                      color: (opacity = 1) => CHART_COLOR,
                      strokeWidth: 2,
                    },
                  ],
                }}
                width={screenWidth - 64}
                height={220}
                chartConfig={chartConfig}
                bezier
                style={styles.chart}
                withInnerLines={true}
                withOuterLines={false}
                withVerticalLabels={true}
                withHorizontalLabels={true}
                withDots={true}
                withShadow={false}
              />
            </View>
          </View>
        )}

        {/* Graphique : Répartition par créneau horaire */}
        {stats.matchesByTimeSlot && stats.matchesByTimeSlot.length > 0 && stats.matchesByTimeSlot.some((item) => item.count > 0) && (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="time" size={20} color="#e0ff00" />
              <Text style={styles.sectionTitle}>Matchs par créneau horaire</Text>
            </View>
            <View style={styles.chartContainer}>
              <BarChart
                data={{
                  labels: stats.matchesByTimeSlot.map((item) => item.slot),
                  datasets: [
                    {
                      data: stats.matchesByTimeSlot.map((item) => item.count),
                    },
                  ],
                }}
                width={screenWidth - 64}
                height={220}
                chartConfig={chartConfig}
                style={styles.chart}
                verticalLabelRotation={45}
                showValuesOnTopOfBars={true}
                fromZero={true}
              />
            </View>
          </View>
        )}

        {/* Graphique : Répartition par groupe */}
        {stats.matchesByGroup && stats.matchesByGroup.length > 1 && (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="pie-chart" size={20} color="#e0ff00" />
              <Text style={styles.sectionTitle}>Répartition par groupe</Text>
            </View>
            <View style={styles.chartContainer}>
              <PieChart
                data={stats.matchesByGroup.map((item, index) => ({
                  name: item.name.length > 15 ? item.name.substring(0, 15) + "..." : item.name,
                  count: item.count,
                  color: `hsl(${(index * 360) / stats.matchesByGroup.length}, 70%, 50%)`,
                  legendFontColor: "#000",
                  legendFontSize: 12,
                }))}
                width={screenWidth - 64}
                height={220}
                chartConfig={chartConfig}
                accessor="count"
                backgroundColor="transparent"
                paddingLeft="15"
                style={styles.chart}
                absolute
              />
            </View>
          </View>
        )}

        {/* Graphique : Évolution des membres (3 mois) */}
        {stats.membersByMonth && stats.membersByMonth.length > 0 && stats.membersByMonth.some((item) => item.count > 0) && (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="people-outline" size={20} color="#e0ff00" />
              <Text style={styles.sectionTitle}>Évolution des membres</Text>
            </View>
            <View style={styles.chartContainer}>
              <LineChart
                data={{
                  labels: stats.membersByMonth.map((item) => item.month),
                  datasets: [
                    {
                      data: stats.membersByMonth.map((item) => item.count),
                      color: (opacity = 1) => CHART_COLOR,
                      strokeWidth: 2,
                    },
                  ],
                }}
                width={screenWidth - 64}
                height={220}
                chartConfig={chartConfig}
                bezier
                style={styles.chart}
                withInnerLines={true}
                withOuterLines={false}
                withVerticalLabels={true}
                withHorizontalLabels={true}
                withDots={true}
                withShadow={false}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#001833",
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
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#e0ff00",
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
  chartContainer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
});

