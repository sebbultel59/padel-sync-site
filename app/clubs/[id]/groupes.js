// app/clubs/[id]/groupes.js
// Gestion des groupes du club
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../../lib/supabase";

const BRAND = "#1a4b87";

export default function ClubGroupesScreen() {
  const params = useLocalSearchParams();
  const clubId = params?.id;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  const loadGroups = useCallback(async () => {
    if (!clubId) return;

    try {
      setLoading(true);

      const { data: groupsData, error } = await supabase
        .from("groups")
        .select("id, name, created_at, visibility, join_policy")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Charger le nombre de membres pour chaque groupe
      const groupsWithCount = await Promise.all(
        (groupsData || []).map(async (group) => {
          const { count, error: countError } = await supabase
            .from("group_members")
            .select("*", { count: "exact", head: true })
            .eq("group_id", group.id);

          // Charger les admins
          const { data: adminsData } = await supabase
            .from("group_members")
            .select("user_id, profiles!inner(display_name)")
            .eq("group_id", group.id)
            .in("role", ["admin", "owner"]);

          return {
            ...group,
            member_count: countError ? 0 : count || 0,
            admins: (adminsData || []).map((a) => ({
              id: a.user_id,
              name: a.profiles?.display_name || "Inconnu",
            })),
          };
        })
      );

      setGroups(groupsWithCount);
    } catch (e) {
      console.error("[Groupes] Erreur:", e);
      Alert.alert("Erreur", "Impossible de charger les groupes");
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const handleCreateGroup = useCallback(async () => {
    if (!newGroupName.trim()) {
      Alert.alert("Erreur", "Veuillez saisir un nom de groupe");
      return;
    }

    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      if (!userId) throw new Error("Utilisateur non authentifié");

      const { error } = await supabase.rpc("rpc_create_group", {
        p_name: newGroupName.trim(),
        p_club_id: clubId,
        p_visibility: "public",
        p_join_policy: "open",
      });

      if (error) throw error;

      Alert.alert("Succès", "Le groupe a été créé");
      setNewGroupName("");
      setShowCreateModal(false);
      loadGroups();
    } catch (e) {
      console.error("[Groupes] Erreur création:", e);
      Alert.alert("Erreur", e?.message || "Impossible de créer le groupe");
    }
  }, [newGroupName, clubId, loadGroups]);

  const handlePromoteAdmin = useCallback(
    async (groupId, userId) => {
      try {
        const { error } = await supabase.rpc("rpc_promote_group_admin", {
          p_group_id: groupId,
          p_user_id: userId,
        });

        if (error) throw error;

        Alert.alert("Succès", "L'utilisateur a été promu admin");
        loadGroups();
      } catch (e) {
        console.error("[Groupes] Erreur promotion:", e);
        Alert.alert("Erreur", e?.message || "Impossible de promouvoir l'admin");
      }
    },
    [loadGroups]
  );

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
      {/* Bouton créer en haut à droite */}
      <View style={styles.createButtonContainer}>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setShowCreateModal(true)}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.createButtonText}>Créer un groupe</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {groups.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color="#d1d5db" />
            <Text style={styles.emptyText}>Aucun groupe</Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => setShowCreateModal(true)}
            >
              <Text style={styles.emptyButtonText}>Créer un groupe</Text>
            </TouchableOpacity>
          </View>
        ) : (
          groups.map((group) => (
            <View key={group.id} style={styles.groupCard}>
              <View style={styles.groupHeader}>
                <View style={styles.groupInfo}>
                  <Text style={styles.groupName}>{group.name}</Text>
                  <Text style={styles.groupMeta}>
                    {group.member_count} membre{group.member_count > 1 ? "s" : ""} ·{" "}
                    {group.visibility === "public" ? "Public" : "Privé"}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.groupButton}
                  onPress={() => router.push(`/(tabs)/groupes?groupId=${group.id}`)}
                >
                  <Text style={styles.groupButtonText}>Voir</Text>
                </TouchableOpacity>
              </View>

              {/* Admins */}
              {group.admins && group.admins.length > 0 && (
                <View style={styles.adminsSection}>
                  <Text style={styles.adminsLabel}>Admins:</Text>
                  <View style={styles.adminsList}>
                    {group.admins.map((admin) => (
                      <View key={admin.id} style={styles.adminTag}>
                        <Text style={styles.adminName}>{admin.name}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Activité récente (simplifié) */}
              <Text style={styles.activityText}>
                Créé le {new Date(group.created_at).toLocaleDateString("fr-FR")}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* Modal création groupe */}
      {showCreateModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Créer un groupe</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              value={newGroupName}
              onChangeText={setNewGroupName}
              placeholder="Nom du groupe"
              placeholderTextColor="#999"
              autoFocus
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowCreateModal(false);
                  setNewGroupName("");
                }}
              >
                <Text style={styles.modalButtonTextCancel}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCreate]}
                onPress={handleCreateGroup}
              >
                <Text style={styles.modalButtonTextCreate}>Créer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7fb",
  },
  createButtonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    alignItems: "flex-end",
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: BRAND,
    gap: 8,
  },
  createButtonText: {
    color: "#fff",
    fontSize: 14,
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
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 16,
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: BRAND,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  groupCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
    marginBottom: 4,
  },
  groupMeta: {
    fontSize: 14,
    color: "#6b7280",
  },
  groupButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: BRAND,
  },
  groupButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  adminsSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  adminsLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 8,
  },
  adminsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  adminTag: {
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  adminName: {
    fontSize: 12,
    color: "#374151",
    fontWeight: "500",
  },
  activityText: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 8,
  },
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    width: "90%",
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#000",
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  modalButtonCancel: {
    backgroundColor: "#e5e7eb",
  },
  modalButtonCreate: {
    backgroundColor: BRAND,
  },
  modalButtonTextCancel: {
    color: "#374151",
    fontWeight: "600",
  },
  modalButtonTextCreate: {
    color: "#fff",
    fontWeight: "600",
  },
});

