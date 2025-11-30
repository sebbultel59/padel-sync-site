// app/clubs/[id]/matchs.js
// Liste des matchs du club avec filtres
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../../lib/supabase";

const BRAND = "#1a4b87";

export default function ClubMatchsScreen() {
  const params = useLocalSearchParams();
  const clubId = params?.id;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState([]);
  const [groups, setGroups] = useState([]);
  const [filters, setFilters] = useState({
    date: "all", // all, week, month
    groupId: null,
    status: "all", // all, pending, confirmed, cancelled
  });

  const loadGroups = useCallback(async () => {
    if (!clubId) return;

    try {
      const { data, error } = await supabase
        .from("groups")
        .select("id, name")
        .eq("club_id", clubId)
        .order("name");

      if (error) throw error;
      setGroups(data || []);
    } catch (e) {
      console.error("[Matchs] Erreur groupes:", e);
    }
  }, [clubId]);

  const loadMatches = useCallback(async () => {
    if (!clubId) return;

    try {
      setLoading(true);

      // Récupérer les IDs des groupes du club
      const { data: groupsData } = await supabase
        .from("groups")
        .select("id")
        .eq("club_id", clubId);

      const groupIds = (groupsData || []).map((g) => g.id);
      if (groupIds.length === 0) {
        setMatches([]);
        setLoading(false);
        return;
      }

      // Construire la requête
      let query = supabase
        .from("matches")
        .select(`
          id,
          status,
          created_at,
          group_id,
          groups!inner(id, name),
          time_slots!inner(id, starts_at, ends_at)
        `)
        .in("group_id", groupIds);

      // Filtre par groupe
      if (filters.groupId) {
        query = query.eq("group_id", filters.groupId);
      }

      // Filtre par statut
      if (filters.status !== "all") {
        query = query.eq("status", filters.status);
      }

      // Filtre par date
      const now = new Date();
      if (filters.date === "week") {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        query = query.gte("time_slots.starts_at", startOfWeek.toISOString());
      } else if (filters.date === "month") {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        query = query.gte("time_slots.starts_at", startOfMonth.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Trier les données côté client par date de début (plus récent en premier)
      const sortedData = (data || []).sort((a, b) => {
        const dateA = a.time_slots?.starts_at ? new Date(a.time_slots.starts_at) : new Date(0);
        const dateB = b.time_slots?.starts_at ? new Date(b.time_slots.starts_at) : new Date(0);
        return dateB - dateA; // Ordre décroissant (plus récent en premier)
      });
      
      setMatches(sortedData.slice(0, 50));
    } catch (e) {
      console.error("[Matchs] Erreur:", e);
    } finally {
      setLoading(false);
    }
  }, [clubId, filters]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  const getStatusColor = (status) => {
    switch (status) {
      case "confirmed":
        return "#22c55e";
      case "pending":
        return "#f59e0b";
      case "cancelled":
        return "#ef4444";
      default:
        return "#6b7280";
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case "confirmed":
        return "Validé";
      case "pending":
        return "En attente";
      case "cancelled":
        return "Annulé";
      default:
        return status;
    }
  };

  return (
    <View style={styles.container}>
      {/* Filtres */}
      <View style={styles.filtersContainer}>
        {/* Filtre date */}
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Période</Text>
          <View style={styles.filterButtons}>
            {[
              { id: "all", label: "Tous" },
              { id: "week", label: "Semaine" },
              { id: "month", label: "Mois" },
            ].map((option) => (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.filterButton,
                  filters.date === option.id && styles.filterButtonActive,
                ]}
                onPress={() => setFilters({ ...filters, date: option.id })}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    filters.date === option.id && styles.filterButtonTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Filtre groupe */}
        {groups.length > 0 && (
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>Groupe</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.filterButtons}>
                <TouchableOpacity
                  style={[
                    styles.filterButton,
                    !filters.groupId && styles.filterButtonActive,
                  ]}
                  onPress={() => setFilters({ ...filters, groupId: null })}
                >
                  <Text
                    style={[
                      styles.filterButtonText,
                      !filters.groupId && styles.filterButtonTextActive,
                    ]}
                  >
                    Tous
                  </Text>
                </TouchableOpacity>
                {groups.map((group) => (
                  <TouchableOpacity
                    key={group.id}
                    style={[
                      styles.filterButton,
                      filters.groupId === group.id && styles.filterButtonActive,
                    ]}
                    onPress={() => setFilters({ ...filters, groupId: group.id })}
                  >
                    <Text
                      style={[
                        styles.filterButtonText,
                        filters.groupId === group.id && styles.filterButtonTextActive,
                      ]}
                    >
                      {group.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Filtre statut */}
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Statut</Text>
          <View style={styles.filterButtons}>
            {[
              { id: "all", label: "Tous" },
              { id: "pending", label: "En attente" },
              { id: "confirmed", label: "Validé" },
              { id: "cancelled", label: "Annulé" },
            ].map((option) => (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.filterButton,
                  filters.status === option.id && styles.filterButtonActive,
                ]}
                onPress={() => setFilters({ ...filters, status: option.id })}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    filters.status === option.id && styles.filterButtonTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Liste des matchs */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={BRAND} />
        </View>
      ) : matches.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={64} color="#d1d5db" />
          <Text style={styles.emptyText}>Aucun match trouvé</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {matches.map((match) => {
            const startsAt = match.time_slots?.starts_at
              ? new Date(match.time_slots.starts_at)
              : null;
            const groupName = match.groups?.name || "Groupe inconnu";

            return (
              <View key={match.id} style={styles.matchCard}>
                <View style={styles.matchHeader}>
                  <View style={styles.matchInfo}>
                    <Text style={styles.matchGroupName}>{groupName}</Text>
                    {startsAt && (
                      <Text style={styles.matchDate}>
                        {startsAt.toLocaleDateString("fr-FR", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </Text>
                    )}
                    {startsAt && (
                      <Text style={styles.matchTime}>
                        {startsAt.toLocaleTimeString("fr-FR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    )}
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: `${getStatusColor(match.status)}20` },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        { color: getStatusColor(match.status) },
                      ]}
                    >
                      {getStatusLabel(match.status)}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7fb",
  },
  filtersContainer: {
    backgroundColor: "#fff",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  filterGroup: {
    marginBottom: 16,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  filterButtons: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "transparent",
  },
  filterButtonActive: {
    backgroundColor: `${BRAND}15`,
    borderColor: BRAND,
  },
  filterButtonText: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
  },
  filterButtonTextActive: {
    color: BRAND,
    fontWeight: "600",
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
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 16,
  },
  matchCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  matchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  matchInfo: {
    flex: 1,
  },
  matchGroupName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
    marginBottom: 4,
  },
  matchDate: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 2,
  },
  matchTime: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
});

