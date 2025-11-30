// app/clubs/[id]/create-event.js
// Formulaire de création d'événement pour les club managers
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../../lib/supabase";
import { useUserRole } from "../../../lib/roles";
import CustomDateTimePicker from "../../../components/DateTimePicker";

const BRAND = "#1a4b87";
const ORANGE = "#ff6b35";

// Catégories disponibles
const CATEGORIES = [
  { value: "sport", label: "Sportif", icon: "tennisball", color: "#22c55e" },
  { value: "social", label: "Communautaire", icon: "people", color: "#3b82f6" },
  { value: "kids", label: "École de padel", icon: "happy", color: "#f59e0b" },
  { value: "info", label: "Info", icon: "information-circle", color: "#6b7280" },
];

// Types d'événements par catégorie
const EVENT_TYPES = {
  sport: [
    "Tournoi interne",
    "Tournoi homologué FFT",
    "Stages jeunes / adultes",
    "Soirée matches mix-in / Americano",
    "Défis / Trophées du club",
    "Journée découverte ou portes ouvertes",
    "Compétitions officielles (interclubs)",
  ],
  social: [
    "Soirée du club",
    "BBQ / Apéro-padel",
    "Journée bénévoles",
    "Réunion d'informations",
    "Assemblée générale",
  ],
  kids: [
    "Cours collectifs",
    "Evaluations / passages de niveaux",
    "Journées Animation jeunes",
    "Stages vacances",
  ],
  info: [
    "Fermeture temporaire",
    "Travaux sur les terrains",
    "Installation de nouveaux équipements",
    "Coupure programmée d'un terrain",
    "Nouveaux horaires",
  ],
};

export default function CreateEventScreen() {
  const params = useLocalSearchParams();
  const clubId = params?.id;
  const insets = useSafeAreaInsets();
  const { role, clubId: userClubId } = useUserRole();

  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("sport");
  const [eventType, setEventType] = useState("");
  const [dateStart, setDateStart] = useState(new Date());
  const [dateEnd, setDateEnd] = useState(null);
  const [location, setLocation] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);

  // Vérifier les permissions
  useEffect(() => {
    if (role && clubId) {
      const isManager =
        role === "club_manager" &&
        userClubId &&
        String(userClubId) === String(clubId);
      if (!isManager) {
        Alert.alert("Accès refusé", "Vous devez être club manager pour créer un événement");
        router.back();
      }
    }
  }, [role, clubId, userClubId]);

  // Initialiser avec la date/heure actuelle (déjà fait dans useState)

  // Sélectionner une image
  const pickImage = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission refusée", "L'accès à la galerie est nécessaire");
        return;
      }

      // Déterminer le paramètre mediaTypes selon la version d'expo-image-picker
      const pickerMediaTypes = ImagePicker?.MediaType?.IMAGES
        ? { mediaTypes: [ImagePicker.MediaType.IMAGES] }
        : { mediaTypes: ImagePicker?.MediaTypeOptions?.Images };

      const result = await ImagePicker.launchImageLibraryAsync({
        ...pickerMediaTypes,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadImage(result.assets[0].uri);
      }
    } catch (e) {
      console.error("[CreateEvent] Erreur sélection image:", e);
      Alert.alert("Erreur", "Impossible de sélectionner l'image");
    }
  }, []);

  // Upload de l'image
  const uploadImage = useCallback(async (uri) => {
    if (!clubId) return;

    try {
      setUploadingImage(true);

      // Créer un nom de fichier unique
      const timestamp = Date.now();
      const filename = `club-events/${clubId}/${timestamp}.jpg`;

      // Convertir l'URI en ArrayBuffer (compatible React Native)
      const arrayBuffer = await (await fetch(uri)).arrayBuffer();

      // Upload vers Supabase Storage
      const { data, error } = await supabase.storage
        .from("club-assets")
        .upload(filename, arrayBuffer, {
          contentType: "image/jpeg",
          upsert: false,
        });

      if (error) throw error;

      // Obtenir l'URL publique
      const {
        data: { publicUrl },
      } = supabase.storage.from("club-assets").getPublicUrl(filename);

      setImageUrl(publicUrl);
    } catch (e) {
      console.error("[CreateEvent] Erreur upload:", e);
      Alert.alert("Erreur", "Impossible d'uploader l'image");
    } finally {
      setUploadingImage(false);
    }
  }, [clubId]);

  // Créer l'événement
  const handleCreate = useCallback(async () => {
    if (!clubId) return;

    // Validation
    if (!title.trim()) {
      Alert.alert("Erreur", "Le titre est obligatoire");
      return;
    }
    if (!dateStart) {
      Alert.alert("Erreur", "La date et l'heure de début sont obligatoires");
      return;
    }

    try {
      setLoading(true);

      // Utiliser directement les objets Date
      const startDateTime = dateStart;
      const endDateTime = dateEnd;

      // Récupérer l'utilisateur actuel
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Utilisateur non connecté");

      // Créer l'événement
      const { error } = await supabase.from("club_events").insert({
        club_id: clubId,
        title: title.trim(),
        description: description.trim() || null,
        category: category,
        date_start: startDateTime.toISOString(),
        date_end: endDateTime ? endDateTime.toISOString() : null,
        image_url: imageUrl || null,
        location: location.trim() || null,
        created_by: user.id,
      });

      if (error) throw error;

      Alert.alert("Succès", "Événement créé avec succès", [
        {
          text: "OK",
          onPress: () => router.back(),
        },
      ]);
    } catch (e) {
      console.error("[CreateEvent] Erreur création:", e);
      Alert.alert("Erreur", e?.message || "Impossible de créer l'événement");
    } finally {
      setLoading(false);
    }
  }, [
    clubId,
    title,
    description,
    category,
    dateStart,
    dateEnd,
    location,
    imageUrl,
  ]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={BRAND} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Créer un événement</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom + 100, 200) }
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={true}
      >
        {/* Titre */}
        <View style={styles.section}>
          <Text style={styles.label}>Titre *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Ex: Tournoi Americano"
            placeholderTextColor="#999"
          />
        </View>

        {/* Catégorie */}
        <View style={styles.section}>
          <Text style={styles.label}>Catégorie *</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.value}
                style={[
                  styles.categoryButton,
                  category === cat.value && {
                    backgroundColor: cat.color + "20",
                    borderColor: cat.color,
                  },
                ]}
                onPress={() => {
                  setCategory(cat.value);
                  setEventType(""); // Réinitialiser le type
                }}
              >
                <Ionicons
                  name={cat.icon}
                  size={20}
                  color={category === cat.value ? cat.color : "#6b7280"}
                />
                <Text
                  style={[
                    styles.categoryButtonText,
                    category === cat.value && { color: cat.color, fontWeight: "600" },
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Type d'événement (optionnel, pour aide à la saisie) */}
        {EVENT_TYPES[category] && (
          <View style={styles.section}>
            <Text style={styles.label}>Type d'événement (optionnel)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.eventTypesRow}>
                {EVENT_TYPES[category].map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.eventTypeChip,
                      eventType === type && styles.eventTypeChipActive,
                    ]}
                    onPress={() => {
                      setEventType(type);
                      if (!title.trim()) {
                        setTitle(type);
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.eventTypeChipText,
                        eventType === type && styles.eventTypeChipTextActive,
                      ]}
                    >
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Détails de l'événement..."
            placeholderTextColor="#999"
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Date et heure de début */}
        <View style={styles.section}>
          <Text style={styles.label}>Date et heure de début *</Text>
          <CustomDateTimePicker
            value={dateStart}
            onChange={setDateStart}
            label="Date et heure de début"
            placeholder="Sélectionner la date et l'heure de début"
            minimumDate={new Date()}
            mode="datetime"
          />
        </View>

        {/* Date et heure de fin (optionnel) */}
        <View style={styles.section}>
          <Text style={styles.label}>Date et heure de fin (optionnel)</Text>
          <CustomDateTimePicker
            value={dateEnd}
            onChange={setDateEnd}
            label="Date et heure de fin"
            placeholder="Sélectionner la date et l'heure de fin"
            minimumDate={dateStart || new Date()}
            mode="datetime"
          />
          {dateEnd && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => setDateEnd(null)}
            >
              <Ionicons name="close-circle" size={16} color="#ef4444" />
              <Text style={styles.clearButtonText}>Supprimer la date de fin</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Lieu */}
        <View style={styles.section}>
          <Text style={styles.label}>Lieu (optionnel)</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="Ex: Terrain 1, Salle principale..."
            placeholderTextColor="#999"
          />
        </View>

        {/* Image */}
        <View style={styles.section}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Image (optionnel)</Text>
            <Text style={styles.labelHint}>1080 × 1080 px</Text>
          </View>
          {imageUrl ? (
            <View style={styles.imagePreviewContainer}>
              <Image source={{ uri: imageUrl }} style={styles.imagePreview} />
              <TouchableOpacity
                style={styles.removeImageButton}
                onPress={() => setImageUrl("")}
              >
                <Ionicons name="close-circle" size={24} color="#ef4444" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.imagePickerButton}
              onPress={pickImage}
              disabled={uploadingImage}
            >
              {uploadingImage ? (
                <ActivityIndicator color={BRAND} />
              ) : (
                <>
                  <Ionicons name="image-outline" size={24} color={BRAND} />
                  <Text style={styles.imagePickerText}>Choisir une image</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Bouton créer */}
        <TouchableOpacity
          style={[styles.createButton, loading && styles.createButtonDisabled]}
          onPress={handleCreate}
          disabled={loading || !title.trim()}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.createButtonText}>Publier l'événement</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7fb",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    flexGrow: 1,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  labelHint: {
    fontSize: 12,
    fontWeight: "400",
    color: "#6b7280",
    fontStyle: "italic",
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
    minHeight: 100,
    textAlignVertical: "top",
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
    minWidth: "45%",
  },
  categoryButtonText: {
    fontSize: 14,
    color: "#6b7280",
  },
  eventTypesRow: {
    flexDirection: "row",
    gap: 8,
  },
  eventTypeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  eventTypeChipActive: {
    backgroundColor: BRAND + "20",
    borderColor: BRAND,
  },
  eventTypeChipText: {
    fontSize: 13,
    color: "#6b7280",
  },
  eventTypeChipTextActive: {
    color: BRAND,
    fontWeight: "600",
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    padding: 8,
    alignSelf: "flex-start",
  },
  clearButtonText: {
    fontSize: 13,
    color: "#ef4444",
    fontWeight: "500",
  },
  imagePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#d1d5db",
    borderStyle: "dashed",
    backgroundColor: "#fff",
  },
  imagePickerText: {
    fontSize: 14,
    color: BRAND,
    fontWeight: "600",
  },
  imagePreviewContainer: {
    position: "relative",
  },
  imagePreview: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  removeImageButton: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#fff",
    borderRadius: 20,
  },
  createButton: {
    backgroundColor: BRAND,
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});

