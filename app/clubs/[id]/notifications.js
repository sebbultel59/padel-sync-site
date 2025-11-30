// app/clubs/[id]/notifications.js
// Envoi de notifications aux membres du club
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
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

export default function ClubNotificationsScreen() {
  const params = useLocalSearchParams();
  const clubId = params?.id;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [sendingNotification, setSendingNotification] = useState(false);
  const [targetType, setTargetType] = useState("all"); // all, group, admins
  const [selectedGroupId, setSelectedGroupId] = useState(null);

  const loadGroups = useCallback(async () => {
    if (!clubId) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("groups")
        .select("id, name")
        .eq("club_id", clubId)
        .order("name");

      if (error) throw error;
      setGroups(data || []);
    } catch (e) {
      console.error("[Notifications] Erreur:", e);
      Alert.alert("Erreur", "Impossible de charger les groupes");
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const handleSendNotification = useCallback(async () => {
    if (!notificationMessage.trim()) {
      Alert.alert("Erreur", "Veuillez saisir un message");
      return;
    }

    if (targetType === "group" && !selectedGroupId) {
      Alert.alert("Erreur", "Veuillez sélectionner un groupe");
      return;
    }

    try {
      setSendingNotification(true);

      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      if (!userId) throw new Error("Utilisateur non authentifié");

      // Pour l'instant, on envoie à tous les membres du club
      // TODO: Implémenter l'envoi par groupe ou aux admins uniquement
      const { error } = await supabase.from("club_notifications").insert({
        club_id: clubId,
        message: notificationMessage.trim(),
        created_by: userId,
      });

      if (error) throw error;

      Alert.alert("Succès", "La notification a été envoyée");
      setNotificationMessage("");
    } catch (e) {
      console.error("[Notifications] Erreur envoi:", e);
      Alert.alert("Erreur", e?.message || "Impossible d'envoyer la notification");
    } finally {
      setSendingNotification(false);
    }
  }, [clubId, notificationMessage, targetType, selectedGroupId]);

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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Envoyer une notification</Text>
          <Text style={styles.sectionDescription}>
            Envoyez une notification push à vos membres
          </Text>

          {/* Type de destinataire */}
          <View style={styles.targetTypeContainer}>
            <Text style={styles.label}>Destinataires</Text>
            <View style={styles.targetTypeButtons}>
              <TouchableOpacity
                style={[
                  styles.targetTypeButton,
                  targetType === "all" && styles.targetTypeButtonActive,
                ]}
                onPress={() => {
                  setTargetType("all");
                  setSelectedGroupId(null);
                }}
              >
                <Ionicons
                  name="people"
                  size={20}
                  color={targetType === "all" ? "#fff" : BRAND}
                />
                <Text
                  style={[
                    styles.targetTypeButtonText,
                    targetType === "all" && styles.targetTypeButtonTextActive,
                  ]}
                >
                  Tous les membres
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.targetTypeButton,
                  targetType === "group" && styles.targetTypeButtonActive,
                ]}
                onPress={() => setTargetType("group")}
              >
                <Ionicons
                  name="people-outline"
                  size={20}
                  color={targetType === "group" ? "#fff" : BRAND}
                />
                <Text
                  style={[
                    styles.targetTypeButtonText,
                    targetType === "group" && styles.targetTypeButtonTextActive,
                  ]}
                >
                  Un groupe
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.targetTypeButton,
                  targetType === "admins" && styles.targetTypeButtonActive,
                ]}
                onPress={() => {
                  setTargetType("admins");
                  setSelectedGroupId(null);
                }}
              >
                <Ionicons
                  name="shield"
                  size={20}
                  color={targetType === "admins" ? "#fff" : BRAND}
                />
                <Text
                  style={[
                    styles.targetTypeButtonText,
                    targetType === "admins" && styles.targetTypeButtonTextActive,
                  ]}
                >
                  Admins uniquement
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Sélection du groupe si nécessaire */}
          {targetType === "group" && groups.length > 0 && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Groupe</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.groupButtons}>
                  {groups.map((group) => (
                    <TouchableOpacity
                      key={group.id}
                      style={[
                        styles.groupButton,
                        selectedGroupId === group.id && styles.groupButtonActive,
                      ]}
                      onPress={() => setSelectedGroupId(group.id)}
                    >
                      <Text
                        style={[
                          styles.groupButtonText,
                          selectedGroupId === group.id && styles.groupButtonTextActive,
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

          {/* Message */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Message *</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notificationMessage}
              onChangeText={setNotificationMessage}
              placeholder="Saisissez votre message..."
              placeholderTextColor="#999"
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>
              {notificationMessage.length} caractères
            </Text>
          </View>

          {/* Bouton d'envoi */}
          <TouchableOpacity
            style={[
              styles.sendButton,
              sendingNotification && styles.sendButtonDisabled,
            ]}
            onPress={handleSendNotification}
            disabled={sendingNotification || !notificationMessage.trim()}
          >
            {sendingNotification ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="send" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.sendButtonText}>Envoyer la notification</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#000",
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 20,
  },
  targetTypeContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 12,
  },
  targetTypeButtons: {
    gap: 12,
  },
  targetTypeButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: BRAND,
    backgroundColor: "#fff",
  },
  targetTypeButtonActive: {
    backgroundColor: BRAND,
    borderColor: BRAND,
  },
  targetTypeButtonText: {
    marginLeft: 12,
    fontSize: 16,
    fontWeight: "500",
    color: BRAND,
  },
  targetTypeButtonTextActive: {
    color: "#fff",
  },
  inputGroup: {
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#000",
    backgroundColor: "#fff",
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: "top",
  },
  charCount: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 4,
    textAlign: "right",
  },
  groupButtons: {
    flexDirection: "row",
    gap: 8,
  },
  groupButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BRAND,
    backgroundColor: "#fff",
  },
  groupButtonActive: {
    backgroundColor: BRAND,
  },
  groupButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: BRAND,
  },
  groupButtonTextActive: {
    color: "#fff",
  },
  sendButton: {
    backgroundColor: "#f97316",
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});

