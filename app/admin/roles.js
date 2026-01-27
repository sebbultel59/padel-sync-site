// app/admin/roles.js
// Interface de gestion des rôles pour les super_admins
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View
} from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsSuperAdmin, useUserRole } from "../../lib/roles";
import { supabase } from "../../lib/supabase";
import { formatPlayerName } from "../../lib/uiSafe";

const BRAND = "#1a4b97";

export default function RolesManagementScreen() {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const isSuperAdmin = useIsSuperAdmin();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRole, setSelectedRole] = useState("all");
  const [editingUser, setEditingUser] = useState(null);
  const [editRole, setEditRole] = useState("player");
  const [editClubId, setEditClubId] = useState(null);
  const [clubSearchQuery, setClubSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);

  // Vérifier les permissions (attendre que le rôle soit chargé)
  const { role, loading: roleLoading } = useUserRole();
  
  useEffect(() => {
    // Ne rien faire pendant le chargement
    if (roleLoading) return;
    
    // Vérifier le rôle directement depuis useUserRole pour plus de fiabilité
    if (role !== 'super_admin') {
      Alert.alert("Accès refusé", "Seuls les super admins peuvent accéder à cette page");
      router.back();
      return;
    }
  }, [role, roleLoading]);

  // Charger les utilisateurs et clubs
  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Charger les utilisateurs
      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select('id, email, display_name, name, role, club_id, clubs(id, name)')
        .order('created_at', { ascending: false })
        .limit(100);

      if (usersError) throw usersError;
      setUsers(usersData || []);

      // Charger les clubs
      const clubsData = [];
      const pageSize = 1000;
      let from = 0;
      let fetched = 0;
      do {
        const { data: page, error: clubsError } = await supabase
          .from('clubs')
          .select('id, name')
          .order('name')
          .range(from, from + pageSize - 1);

        if (clubsError) throw clubsError;
        const pageData = page || [];
        clubsData.push(...pageData);
        fetched = pageData.length;
        from += pageSize;
      } while (fetched === pageSize);

      setClubs(clubsData);

    } catch (e) {
      console.error('Erreur chargement données:', e);
      Alert.alert("Erreur", e?.message || "Impossible de charger les données");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      loadData();
    }
  }, [isSuperAdmin, loadData]);

  // Filtrer les utilisateurs
  const filteredUsers = users.filter(user => {
    const matchesSearch = !searchQuery || 
      (user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
       user.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
       user.name?.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesRole = selectedRole === "all" || user.role === selectedRole;
    
    return matchesSearch && matchesRole;
  });

  const normalizeSearch = (value) =>
    (value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const filteredClubs = clubs.filter((club) => {
    if (!clubSearchQuery.trim()) return true;
    const query = normalizeSearch(clubSearchQuery);
    const name = normalizeSearch(club.name);
    return name.includes(query);
  });

  // Ouvrir le modal d'édition
  const handleEditUser = (user) => {
    setEditingUser(user);
    setEditRole(user.role || "player");
    setEditClubId(user.club_id || null);
    setClubSearchQuery("");
  };

  // Sauvegarder les modifications
  const handleSaveRole = useCallback(async () => {
    if (!editingUser) return;

    try {
      setSaving(true);

      // Utiliser la fonction RPC pour mettre à jour le rôle
      // IMPORTANT: Passer les paramètres dans l'ordre exact de la définition de la fonction
      // Ordre: p_user_id, p_role, p_club_id
      const { data, error } = await supabase.rpc('rpc_update_user_role', {
        p_user_id: editingUser.id,
        p_role: editRole,
        p_club_id: editRole === 'club_manager' ? editClubId : null
      });

      if (error) {
        console.error('Erreur RPC:', error);
        throw error;
      }

      Alert.alert("Succès", "Le rôle a été mis à jour");
      setEditingUser(null);
      // Recharger les données après un court délai pour laisser le temps à la base de données
      setTimeout(() => {
        loadData();
      }, 500);
    } catch (e) {
      console.error('Erreur sauvegarde:', e);
      Alert.alert("Erreur", e?.message || "Impossible de sauvegarder les modifications");
    } finally {
      setSaving(false);
    }
  }, [editingUser, editRole, editClubId, loadData]);

  if (!isSuperAdmin) {
    return null;
  }

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </Pressable>
          <Text style={styles.headerTitle}>Gestion des rôles</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={BRAND} />
        </View>
      </View>
    );
  }

  const roleCounts = {
    all: users.length,
    player: users.filter(u => u.role === 'player').length,
    admin: users.filter(u => u.role === 'admin').length,
    club_manager: users.filter(u => u.role === 'club_manager').length,
    super_admin: users.filter(u => u.role === 'super_admin').length,
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </Pressable>
        <Text style={styles.headerTitle}>Gestion des rôles</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Filtres */}
      <View style={styles.filters}>
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un utilisateur..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#999"
        />
        
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roleFilters}>
          {[
            { key: 'all', label: 'Tous', count: roleCounts.all },
            { key: 'player', label: 'Joueurs', count: roleCounts.player },
            { key: 'admin', label: 'Admins', count: roleCounts.admin },
            { key: 'club_manager', label: 'Club Managers', count: roleCounts.club_manager },
            { key: 'super_admin', label: 'Super Admins', count: roleCounts.super_admin },
          ].map(filter => (
            <TouchableOpacity
              key={filter.key}
              style={[
                styles.roleFilter,
                selectedRole === filter.key && styles.roleFilterActive
              ]}
              onPress={() => setSelectedRole(filter.key)}
            >
              <Text style={[
                styles.roleFilterText,
                selectedRole === filter.key && styles.roleFilterTextActive
              ]}>
                {filter.label} ({filter.count})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Liste des utilisateurs */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {filteredUsers.map(user => (
          <Pressable
            key={user.id}
            style={styles.userCard}
            onPress={() => handleEditUser(user)}
          >
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{formatPlayerName(user.display_name || user.name || user.email)}</Text>
              <Text style={styles.userEmail}>{user.email}</Text>
              {user.clubs && (
                <Text style={styles.userClub}>Club: {user.clubs.name}</Text>
              )}
            </View>
            <View style={styles.userRole}>
              <View style={[styles.roleBadge, styles[`roleBadge${user.role || 'player'}`]]}>
                <Text style={styles.roleBadgeText}>
                  {user.role === 'player' ? 'Joueur' :
                   user.role === 'admin' ? 'Admin' :
                   user.role === 'club_manager' ? 'Club Manager' :
                   user.role === 'super_admin' ? 'Super Admin' : 'Joueur'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </View>
          </Pressable>
        ))}
      </ScrollView>

      {/* Modal d'édition */}
      <Modal
        visible={!!editingUser}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditingUser(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Modifier le rôle</Text>
              <Pressable onPress={() => setEditingUser(null)}>
                <Ionicons name="close" size={24} color="#000" />
              </Pressable>
            </View>

            {editingUser && (
              <>
                <ScrollView 
                  style={[styles.modalScrollView, { maxHeight: screenHeight * 0.6 }]}
                  contentContainerStyle={styles.modalScrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                >
                  <Text style={styles.modalUserInfo}>
                    {editingUser.display_name || editingUser.name || editingUser.email}
                  </Text>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalLabel}>Rôle</Text>
                    {['player', 'admin', 'club_manager', 'super_admin'].map(role => (
                      <TouchableOpacity
                        key={role}
                        style={[
                          styles.roleOption,
                          editRole === role && styles.roleOptionActive
                        ]}
                        onPress={() => {
                          setEditRole(role);
                          if (role !== 'club_manager') {
                            setEditClubId(null);
                          }
                        }}
                      >
                        <Text style={[
                          styles.roleOptionText,
                          editRole === role && styles.roleOptionTextActive
                        ]}>
                          {role === 'player' ? 'Joueur' :
                           role === 'admin' ? 'Admin' :
                           role === 'club_manager' ? 'Club Manager' :
                           'Super Admin'}
                        </Text>
                        {editRole === role && (
                          <Ionicons name="checkmark" size={20} color={BRAND} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>

                  {editRole === 'club_manager' && (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalLabel}>Club</Text>
                      <TextInput
                        style={styles.clubSearchInput}
                        placeholder="Rechercher un club..."
                        value={clubSearchQuery}
                        onChangeText={setClubSearchQuery}
                        placeholderTextColor="#999"
                      />
                      <Text style={styles.clubCountText}>
                        {filteredClubs.length} club{filteredClubs.length > 1 ? 's' : ''} trouvé{filteredClubs.length > 1 ? 's' : ''} sur {clubs.length}
                      </Text>
                      <ScrollView 
                        style={styles.clubPicker} 
                        nestedScrollEnabled={true}
                      >
                        <TouchableOpacity
                          style={[
                            styles.clubOption,
                            !editClubId && styles.clubOptionActive
                          ]}
                          onPress={() => setEditClubId(null)}
                        >
                          <Text style={[
                            styles.clubOptionText,
                            !editClubId && styles.clubOptionTextActive
                          ]}>
                            Aucun club
                          </Text>
                          {!editClubId && (
                            <Ionicons name="checkmark" size={20} color={BRAND} />
                          )}
                        </TouchableOpacity>
                        {filteredClubs.length === 0 && (
                          <View style={styles.clubEmptyState}>
                            <Text style={styles.clubEmptyText}>Aucun club trouvé</Text>
                          </View>
                        )}
                        {filteredClubs.map(club => (
                          <TouchableOpacity
                            key={club.id}
                            style={[
                              styles.clubOption,
                              editClubId === club.id && styles.clubOptionActive
                            ]}
                            onPress={() => setEditClubId(club.id)}
                          >
                            <Text style={[
                              styles.clubOptionText,
                              editClubId === club.id && styles.clubOptionTextActive
                            ]}>
                              {club.name}
                            </Text>
                            {editClubId === club.id && (
                              <Ionicons name="checkmark" size={20} color={BRAND} />
                            )}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </ScrollView>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalCancelButton}
                    onPress={() => setEditingUser(null)}
                  >
                    <Text style={styles.modalCancelText}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalSaveButton, saving && styles.modalSaveButtonDisabled]}
                    onPress={handleSaveRole}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.modalSaveText}>Enregistrer</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  filters: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: "#fff",
  },
  roleFilters: {
    marginTop: 8,
  },
  roleFilter: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    marginRight: 8,
  },
  roleFilterActive: {
    backgroundColor: BRAND,
  },
  roleFilterText: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "500",
  },
  roleFilterTextActive: {
    color: "#fff",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    marginBottom: 12,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 2,
  },
  userClub: {
    fontSize: 12,
    color: "#9ca3af",
  },
  userRole: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  roleBadgeplayer: {
    backgroundColor: "#e5e7eb",
  },
  roleBadgeadmin: {
    backgroundColor: "#dbeafe",
  },
  roleBadgeclub_manager: {
    backgroundColor: "#fef3c7",
  },
  roleBadgesuper_admin: {
    backgroundColor: "#fce7f3",
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
  },
  modalScrollView: {
    // La hauteur sera calculée dynamiquement
  },
  modalScrollContent: {
    padding: 20,
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#000",
  },
  modalUserInfo: {
    fontSize: 16,
    color: "#6b7280",
    marginBottom: 24,
  },
  modalSection: {
    marginBottom: 24,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 12,
  },
  roleOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    marginBottom: 8,
  },
  roleOptionActive: {
    backgroundColor: "#e0e7ff",
    borderWidth: 2,
    borderColor: BRAND,
  },
  roleOptionText: {
    fontSize: 16,
    color: "#374151",
  },
  roleOptionTextActive: {
    color: BRAND,
    fontWeight: "600",
  },
  clubPickerContainer: {
    maxHeight: 200,
  },
  clubPicker: {
    maxHeight: 200,
  },
  clubCountText: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 8,
  },
  clubEmptyState: {
    paddingVertical: 10,
  },
  clubEmptyText: {
    fontSize: 12,
    color: "#6b7280",
    textAlign: "center",
  },
  clubSearchInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: "#fff",
  },
  clubOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    marginBottom: 8,
  },
  clubOptionActive: {
    backgroundColor: "#e0e7ff",
    borderWidth: 2,
    borderColor: BRAND,
  },
  clubOptionText: {
    fontSize: 16,
    color: "#374151",
  },
  clubOptionTextActive: {
    color: BRAND,
    fontWeight: "600",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    padding: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  modalCancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  modalSaveButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    backgroundColor: BRAND,
    alignItems: "center",
  },
  modalSaveButtonDisabled: {
    opacity: 0.6,
  },
  modalSaveText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});

