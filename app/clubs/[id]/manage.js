// app/clubs/[id]/manage.js
// Écran de gestion de club pour les club_managers
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsClubManager, useUserRole } from "../../../lib/roles";
import { supabase } from "../../../lib/supabase";

const BRAND = "#1a4b97";

export default function ClubManageScreen() {
  const params = useLocalSearchParams();
  const clubId = params?.id;
  const { role, clubId: userClubId, loading: roleLoading } = useUserRole();
  
  // Rediriger vers le dashboard si club_manager
  useEffect(() => {
    if (roleLoading) return;
    if (role === 'club_manager' && userClubId && String(userClubId) === String(clubId)) {
      router.replace(`/clubs/${clubId}/dashboard`);
    }
  }, [role, userClubId, clubId, roleLoading]);

  // Si pas club_manager, afficher un message ou rediriger
  if (!roleLoading && role !== 'club_manager') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Accès refusé</Text>
      </View>
    );
  }

  return null; // Pendant la redirection
}

// Ancien code conservé pour référence mais non utilisé
function _OldClubManageScreen() {
  const params = useLocalSearchParams();
  const clubId = params?.id;
  const insets = useSafeAreaInsets();
  const { role, clubId: userClubId, loading: roleLoading } = useUserRole();
  const isClubManager = useIsClubManager(clubId);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [club, setClub] = useState(null);
  const [groups, setGroups] = useState([]);
  const [posts, setPosts] = useState([]);
  const [matches, setMatches] = useState([]);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [sendingNotification, setSendingNotification] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photos, setPhotos] = useState([]); // Tableau d'URLs de photos
  
  // États pour l'édition
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [callButtonEnabled, setCallButtonEnabled] = useState(true);
  const [callButtonLabel, setCallButtonLabel] = useState("");
  const [callPhone, setCallPhone] = useState("");
  const [address, setAddress] = useState("");
  const [socialLinks, setSocialLinks] = useState({
    facebook: "",
    instagram: "",
    website: ""
  });

  // Vérifier les permissions (attendre que le rôle soit chargé)
  useEffect(() => {
    // Ne rien faire pendant le chargement du rôle
    if (roleLoading) return;
    
    if (!clubId) {
      Alert.alert("Erreur", "ID du club manquant");
      router.back();
      return;
    }

    // Normaliser les IDs pour la comparaison (enlever les espaces, convertir en string)
    const normalizedClubId = String(clubId).trim();
    const normalizedUserClubId = userClubId ? String(userClubId).trim() : null;

    console.log('[ClubManage] Vérification permissions:', {
      role,
      clubId: normalizedClubId,
      userClubId: normalizedUserClubId,
      match: normalizedUserClubId === normalizedClubId
    });

    if (role !== 'club_manager') {
      Alert.alert("Accès refusé", "Vous devez être club_manager pour gérer un club");
      router.back();
      return;
    }

    if (!normalizedUserClubId) {
      Alert.alert("Accès refusé", "Aucun club assigné à votre compte");
      router.back();
      return;
    }

    if (normalizedUserClubId !== normalizedClubId) {
      Alert.alert("Accès refusé", `Vous n'êtes pas autorisé à gérer ce club. Votre club: ${normalizedUserClubId.substring(0, 8)}..., Club demandé: ${normalizedClubId.substring(0, 8)}...`);
      router.back();
      return;
    }
  }, [clubId, role, userClubId, roleLoading]);

  // Charger les données du club
  const loadClub = useCallback(async () => {
    if (!clubId) return;

    try {
      setLoading(true);
      
      // Charger le club
      const { data: clubData, error: clubError } = await supabase
        .from('clubs')
        .select('*')
        .eq('id', clubId)
        .single();

      if (clubError) throw clubError;
      if (!clubData) {
        Alert.alert("Erreur", "Club non trouvé");
        router.back();
        return;
      }

      setClub(clubData);
      setName(clubData.name || "");
      setDescription(clubData.description || "");
      setLogoUrl(clubData.logo_url || "");
      setCallButtonEnabled(clubData.call_button_enabled ?? true);
      setCallButtonLabel(clubData.call_button_label || "");
      setCallPhone(clubData.call_phone || "");
      setAddress(clubData.address || "");
      // Charger les photos (tableau JSON ou null)
      const photosData = clubData.photos || [];
      setPhotos(Array.isArray(photosData) ? photosData : []);
      
      const links = clubData.social_links || {};
      setSocialLinks({
        facebook: links.facebook || "",
        instagram: links.instagram || "",
        website: links.website || ""
      });

      // Charger les groupes du club
      const { data: groupsData, error: groupsError } = await supabase
        .from('groups')
        .select('id, name, created_at')
        .eq('club_id', clubId)
        .order('created_at', { ascending: false });

      if (groupsError) {
        console.warn('Erreur chargement groupes:', groupsError);
        setGroups([]);
      } else {
        // Charger le nombre de membres pour chaque groupe
        const groupsWithCount = await Promise.all(
          (groupsData || []).map(async (group) => {
            const { count, error: countError } = await supabase
              .from('group_members')
              .select('*', { count: 'exact', head: true })
              .eq('group_id', group.id);
            
            return {
              ...group,
              member_count: countError ? 0 : (count || 0)
            };
          })
        );
        setGroups(groupsWithCount);
      }

      // Charger les posts du club
      // Note: image_url sera ajouté après l'exécution de ensure_club_posts_image_url.sql
      const { data: postsData, error: postsError } = await supabase
        .from('club_posts')
        .select('id, title, content, created_at')
        .eq('club_id', clubId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (postsError) {
        console.warn('Erreur chargement posts:', postsError);
        setPosts([]);
      } else {
      setPosts(postsData || []);
      }

      // Charger les matchs de tous les groupes du club
      // Note: On charge d'abord les groupes, puis les matchs
      // Pour éviter les problèmes, on charge les matchs après avoir défini groups
      const groupIdsForMatches = (groupsData || []).map(g => g.id);
      if (groupIdsForMatches.length > 0) {
        const { data: matchesData, error: matchesError } = await supabase
          .from('matches')
          .select(`
            id, 
            time_slots(*), 
            status, 
            created_at, 
            group_id,
            groups!inner(name)
          `)
          .in('group_id', groupIdsForMatches)
          .order('created_at', { ascending: false })
          .limit(20);

        if (matchesError) {
          console.warn('Erreur chargement matchs:', matchesError);
          setMatches([]);
        } else {
          setMatches(matchesData || []);
        }
      } else {
        setMatches([]);
      }

    } catch (e) {
      console.error('Erreur chargement club:', e);
      Alert.alert("Erreur", e?.message || "Impossible de charger les données du club");
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    loadClub();
  }, [loadClub]);

  // Sauvegarder les modifications
  const handleSave = useCallback(async () => {
    if (!clubId) return;

    try {
      setSaving(true);

      const updateData = {
        name: name.trim(),
        description: description.trim() || null,
        logo_url: logoUrl.trim() || null,
        call_button_enabled: callButtonEnabled,
        call_button_label: callButtonLabel.trim() || null,
        call_phone: callPhone.trim() || null,
        address: address.trim() || null,
        photos: photos.length > 0 ? photos : null,
        social_links: {
          facebook: socialLinks.facebook.trim() || null,
          instagram: socialLinks.instagram.trim() || null,
          website: socialLinks.website.trim() || null
        }
      };

      const { error } = await supabase
        .from('clubs')
        .update(updateData)
        .eq('id', clubId);

      if (error) throw error;

      Alert.alert("Succès", "Les modifications ont été enregistrées");
      loadClub();
    } catch (e) {
      console.error('Erreur sauvegarde:', e);
      Alert.alert("Erreur", e?.message || "Impossible de sauvegarder les modifications");
    } finally {
      setSaving(false);
    }
  }, [clubId, name, description, logoUrl, callButtonEnabled, callButtonLabel, callPhone, address, photos, socialLinks, loadClub]);

  // Envoyer une notification aux membres des groupes du club
  const handleSendNotification = useCallback(async () => {
    if (!clubId || !notificationMessage.trim()) {
      Alert.alert("Erreur", "Veuillez saisir un message");
      return;
    }

    try {
      setSendingNotification(true);

      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      if (!userId) throw new Error("Utilisateur non authentifié");

      // Créer la notification
      const { error } = await supabase
        .from('club_notifications')
        .insert({
          club_id: clubId,
          message: notificationMessage.trim(),
          created_by: userId
        });

      if (error) throw error;

      Alert.alert("Succès", "La notification a été envoyée aux membres des groupes du club");
      setNotificationMessage("");
      setShowNotificationsModal(false);
    } catch (e) {
      console.error('Erreur envoi notification:', e);
      Alert.alert("Erreur", e?.message || "Impossible d'envoyer la notification");
    } finally {
      setSendingNotification(false);
    }
  }, [clubId, notificationMessage]);

  // Sélectionner et uploader le logo du club
  const pickAndUploadLogo = useCallback(async () => {
    if (!clubId) return;

    try {
      setUploadingLogo(true);

      // Demander les permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission requise", "Autorise l'accès aux photos pour choisir un logo.");
        return;
      }

      // Déterminer le paramètre mediaTypes selon la version d'expo-image-picker
      const pickerMediaTypes = ImagePicker?.MediaType?.IMAGES
        ? { mediaTypes: [ImagePicker.MediaType.IMAGES] }
        : { mediaTypes: ImagePicker?.MediaTypeOptions?.Images };

      // Ouvrir le sélecteur d'images
      const result = await ImagePicker.launchImageLibraryAsync({
        ...pickerMediaTypes,
        allowsEditing: true,
        aspect: [1, 1], // Ratio carré pour le logo
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]?.uri) {
        setUploadingLogo(false);
        return;
      }

      const uri = result.assets[0].uri;
      
      // Convertir l'image en ArrayBuffer
      // Utiliser fetch().arrayBuffer() directement (compatible React Native)
      const arrayBuffer = await (await fetch(uri)).arrayBuffer();

      // Générer un nom de fichier unique
      const timestamp = Date.now();
      const path = `${clubId}/logo-${timestamp}.jpg`;
      // Déterminer le contentType selon l'extension du fichier
      const fileExtension = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const contentTypeMap = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'webp': 'image/webp',
        'gif': 'image/gif'
      };
      const contentType = contentTypeMap[fileExtension] || "image/jpeg";

      // Uploader vers Supabase Storage
      // Créer le bucket "club-logos" s'il n'existe pas (à faire manuellement dans Supabase Dashboard)
      const { error: uploadError } = await supabase.storage
        .from("club-logos")
        .upload(path, arrayBuffer, { contentType, upsert: true });

      if (uploadError) {
        // Si le bucket n'existe pas, essayer avec "avatars" comme fallback
        if (uploadError.message?.includes('not found') || uploadError.message?.includes('Bucket') || uploadError.message?.includes('bucket')) {
          console.warn('[Logo] Bucket club-logos non trouvé, tentative avec avatars...');
          
          // Essayer avec le bucket avatars comme fallback
          const fallbackPath = `${clubId}/club-logo-${timestamp}.jpg`;
          const { error: fallbackError } = await supabase.storage
            .from("avatars")
            .upload(fallbackPath, arrayBuffer, { contentType, upsert: true });
          
          if (fallbackError) {
            Alert.alert(
              "Bucket manquant",
              "Le bucket 'club-logos' n'existe pas dans Supabase Storage.\n\n" +
              "Options:\n" +
              "1. Créer le bucket 'club-logos' dans Supabase Dashboard → Storage\n" +
              "2. Ou exécuter: node scripts/create-club-logos-bucket.js\n\n" +
              "Le bucket doit être public pour que les logos soient accessibles."
            );
            return;
          }
          
          // Obtenir l'URL publique depuis le bucket fallback
          const { data: fallbackUrlData } = supabase.storage.from("avatars").getPublicUrl(fallbackPath);
          const fallbackPublicUrl = fallbackUrlData?.publicUrl;
          
          if (!fallbackPublicUrl) {
            throw new Error("Impossible d'obtenir l'URL publique du logo.");
          }
          
          // Mettre à jour avec l'URL du fallback
          const { error: updateError } = await supabase
            .from('clubs')
            .update({ logo_url: fallbackPublicUrl })
            .eq('id', clubId);

          if (updateError) throw updateError;
          setLogoUrl(`${fallbackPublicUrl}?t=${timestamp}`);
          Alert.alert("Succès", "Le logo a été mis à jour (utilisé le bucket avatars comme fallback).");
          return;
        }
        throw uploadError;
      }

      // Obtenir l'URL publique
      const { data: publicUrlData } = supabase.storage.from("club-logos").getPublicUrl(path);
      const publicUrl = publicUrlData?.publicUrl;

      if (!publicUrl) {
        throw new Error("Impossible d'obtenir l'URL publique du logo.");
      }

      // Mettre à jour le logo_url dans la table clubs
      const { error: updateError } = await supabase
        .from('clubs')
        .update({ logo_url: publicUrl })
        .eq('id', clubId);

      if (updateError) throw updateError;

      // Mettre à jour l'état local
      setLogoUrl(`${publicUrl}?t=${timestamp}`);
      
      Alert.alert("Succès", "Le logo a été mis à jour avec succès.");
    } catch (e) {
      console.error('Erreur upload logo:', e);
      Alert.alert("Erreur", e?.message || "Impossible d'uploader le logo.");
    } finally {
      setUploadingLogo(false);
    }
  }, [clubId]);

  // Ajouter une photo
  const pickAndUploadPhoto = useCallback(async () => {
    if (!clubId) return;
    
    // Limiter à 5 photos maximum
    if (photos.length >= 5) {
      Alert.alert("Limite atteinte", "Vous pouvez ajouter au maximum 5 photos.");
      return;
    }

    try {
      setUploadingPhotos(true);

      // Demander les permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission requise", "Autorise l'accès aux photos pour ajouter une photo.");
        return;
      }

      // Déterminer le paramètre mediaTypes selon la version d'expo-image-picker
      const pickerMediaTypes = ImagePicker?.MediaType?.IMAGES
        ? { mediaTypes: [ImagePicker.MediaType.IMAGES] }
        : { mediaTypes: ImagePicker?.MediaTypeOptions?.Images };

      // Ouvrir le sélecteur d'images
      const result = await ImagePicker.launchImageLibraryAsync({
        ...pickerMediaTypes,
        allowsEditing: true,
        aspect: [16, 9], // Ratio paysage pour les photos de club
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]?.uri) {
        setUploadingPhotos(false);
        return;
      }

      const uri = result.assets[0].uri;
      
      // Convertir l'image en ArrayBuffer
      const arrayBuffer = await (await fetch(uri)).arrayBuffer();

      // Générer un nom de fichier unique
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(7);
      const path = `${clubId}/photo-${timestamp}-${randomId}.jpg`;
      
      // Déterminer le contentType
      const fileExtension = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const contentTypeMap = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'webp': 'image/webp',
        'gif': 'image/gif'
      };
      const contentType = contentTypeMap[fileExtension] || "image/jpeg";

      // Uploader vers Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("club-logos")
        .upload(path, arrayBuffer, { contentType, upsert: false });

      if (uploadError) {
        // Essayer avec avatars comme fallback
        if (uploadError.message?.includes('not found') || uploadError.message?.includes('Bucket') || uploadError.message?.includes('bucket')) {
          console.warn('[Photo] Bucket club-logos non trouvé, tentative avec avatars...');
          
          const fallbackPath = `${clubId}/club-photo-${timestamp}-${randomId}.jpg`;
          const { error: fallbackError } = await supabase.storage
            .from("avatars")
            .upload(fallbackPath, arrayBuffer, { contentType, upsert: false });
          
          if (fallbackError) {
            throw fallbackError;
          }
          
          const { data: fallbackUrlData } = supabase.storage.from("avatars").getPublicUrl(fallbackPath);
          const fallbackPublicUrl = fallbackUrlData?.publicUrl;
          
          if (!fallbackPublicUrl) {
            throw new Error("Impossible d'obtenir l'URL publique de la photo.");
          }
          
          // Ajouter la photo à la liste
          setPhotos([...photos, fallbackPublicUrl]);
          Alert.alert("Succès", "La photo a été ajoutée (utilisé le bucket avatars comme fallback).");
          return;
        }
        throw uploadError;
      }

      // Obtenir l'URL publique
      const { data: publicUrlData } = supabase.storage.from("club-logos").getPublicUrl(path);
      const publicUrl = publicUrlData?.publicUrl;

      if (!publicUrl) {
        throw new Error("Impossible d'obtenir l'URL publique de la photo.");
      }

      // Ajouter la photo à la liste
      setPhotos([...photos, publicUrl]);
      Alert.alert("Succès", "La photo a été ajoutée.");
    } catch (e) {
      console.error('Erreur upload photo:', e);
      Alert.alert("Erreur", e?.message || "Impossible d'uploader la photo.");
    } finally {
      setUploadingPhotos(false);
    }
  }, [clubId, photos]);

  // Supprimer une photo
  const removePhoto = useCallback((index) => {
    Alert.alert(
      "Supprimer la photo",
      "Voulez-vous supprimer cette photo ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: () => {
            const newPhotos = photos.filter((_, i) => i !== index);
            setPhotos(newPhotos);
          }
        }
      ]
    );
  }, [photos]);

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </Pressable>
          <Text style={styles.headerTitle}>Gestion du club</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={BRAND} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </Pressable>
        <Text style={styles.headerTitle}>Gestion du club</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Informations générales */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations générales</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nom du club *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Nom du club"
              placeholderTextColor="#999"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Description du club"
              placeholderTextColor="#999"
              multiline
              numberOfLines={4}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Logo du club</Text>
            
            {/* Aperçu du logo */}
            {logoUrl ? (
              <View style={styles.logoContainer}>
                <Image source={{ uri: logoUrl }} style={styles.logoPreview} />
                <TouchableOpacity
                  style={styles.removeLogoButton}
                  onPress={() => {
                    Alert.alert(
                      "Supprimer le logo",
                      "Voulez-vous supprimer le logo actuel ?",
                      [
                        { text: "Annuler", style: "cancel" },
                        {
                          text: "Supprimer",
                          style: "destructive",
                          onPress: async () => {
                            try {
                              const { error } = await supabase
                                .from('clubs')
                                .update({ logo_url: null })
                                .eq('id', clubId);
                              if (error) throw error;
                              setLogoUrl("");
                              Alert.alert("Succès", "Le logo a été supprimé.");
                            } catch (e) {
                              Alert.alert("Erreur", e?.message || "Impossible de supprimer le logo.");
                            }
                          }
                        }
                      ]
                    );
                  }}
                >
                  <Ionicons name="close-circle" size={24} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Boutons pour choisir une image */}
            <View style={styles.logoButtons}>
              <TouchableOpacity
                style={[styles.logoButton, uploadingLogo && styles.logoButtonDisabled]}
                onPress={pickAndUploadLogo}
                disabled={uploadingLogo}
              >
                {uploadingLogo ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="image-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.logoButtonText}>
                      {logoUrl ? "Changer le logo" : "Choisir un logo"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Option pour entrer une URL manuellement */}
              <TouchableOpacity
                style={styles.logoButtonSecondary}
                onPress={() => {
                  Alert.prompt(
                    "URL du logo",
                    "Entrez l'URL du logo (optionnel)",
                    [
                      { text: "Annuler", style: "cancel" },
                      {
                        text: "Valider",
                        onPress: (url) => {
                          if (url && url.trim()) {
                            setLogoUrl(url.trim());
                          }
                        }
                      }
                    ],
                    "plain-text",
                    logoUrl || ""
                  );
                }}
              >
                <Ionicons name="link-outline" size={20} color={BRAND} style={{ marginRight: 8 }} />
                <Text style={styles.logoButtonTextSecondary}>URL manuelle</Text>
              </TouchableOpacity>
            </View>

            {/* Champ texte pour l'URL (optionnel, caché par défaut) */}
            {logoUrl && !logoUrl.startsWith('http') ? (
            <TextInput
              style={styles.input}
              value={logoUrl}
              onChangeText={setLogoUrl}
              placeholder="https://..."
              placeholderTextColor="#999"
              autoCapitalize="none"
                editable={true}
            />
            ) : null}
          </View>
        </View>

        {/* Photos du club */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Photos du club</Text>
          <Text style={[styles.label, { marginBottom: 12, fontSize: 12, color: "#6b7280" }]}>
            Ajoutez jusqu'à 5 photos de votre club ({photos.length}/5)
          </Text>
          
          {/* Grille de photos */}
          <View style={styles.photosGrid}>
            {photos.map((photoUrl, index) => (
              <View key={index} style={styles.photoContainer}>
                <Image source={{ uri: photoUrl }} style={styles.photoPreview} />
                <TouchableOpacity
                  style={styles.removePhotoButton}
                  onPress={() => removePhoto(index)}
                >
                  <Ionicons name="close-circle" size={24} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ))}
            
            {/* Bouton pour ajouter une photo */}
            {photos.length < 5 && (
              <TouchableOpacity
                style={[styles.addPhotoButton, uploadingPhotos && styles.addPhotoButtonDisabled]}
                onPress={pickAndUploadPhoto}
                disabled={uploadingPhotos}
              >
                {uploadingPhotos ? (
                  <ActivityIndicator color={BRAND} size="small" />
                ) : (
                  <>
                    <Ionicons name="add" size={32} color={BRAND} />
                    <Text style={styles.addPhotoText}>Ajouter</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Bouton d'appel */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bouton d'appel</Text>
          
          <View style={styles.inputGroup}>
            <View style={styles.switchRow}>
              <Text style={styles.label}>Activer le bouton d'appel</Text>
              <TouchableOpacity
                style={[styles.switch, callButtonEnabled && styles.switchActive]}
                onPress={() => setCallButtonEnabled(!callButtonEnabled)}
              >
                <View style={[styles.switchThumb, callButtonEnabled && styles.switchThumbActive]} />
              </TouchableOpacity>
            </View>
          </View>

          {callButtonEnabled && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Label du bouton</Text>
                <TextInput
                  style={styles.input}
                  value={callButtonLabel}
                  onChangeText={setCallButtonLabel}
                  placeholder={`Ex: Appeler ${name || 'le club'}`}
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Numéro de téléphone</Text>
                <TextInput
                  style={styles.input}
                  value={callPhone}
                  onChangeText={setCallPhone}
                  placeholder="+33321000000"
                  placeholderTextColor="#999"
                  keyboardType="phone-pad"
                />
              </View>
            </>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Adresse du club</Text>
            <TextInput
              style={[styles.input, styles.textAreaSmall]}
              value={address}
              onChangeText={setAddress}
              placeholder="Ex: 12 rue du Padel, 59000 Lille"
              placeholderTextColor="#999"
              multiline
              numberOfLines={2}
              textAlignVertical="top"
              autoCapitalize="words"
            />
          </View>
        </View>

        {/* Liens sociaux */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Liens sociaux</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Facebook</Text>
            <TextInput
              style={styles.input}
              value={socialLinks.facebook}
              onChangeText={(text) => setSocialLinks({ ...socialLinks, facebook: text })}
              placeholder="https://facebook.com/..."
              placeholderTextColor="#999"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Instagram</Text>
            <TextInput
              style={styles.input}
              value={socialLinks.instagram}
              onChangeText={(text) => setSocialLinks({ ...socialLinks, instagram: text })}
              placeholder="https://instagram.com/..."
              placeholderTextColor="#999"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Site web</Text>
            <TextInput
              style={styles.input}
              value={socialLinks.website}
              onChangeText={(text) => setSocialLinks({ ...socialLinks, website: text })}
              placeholder="https://..."
              placeholderTextColor="#999"
              autoCapitalize="none"
            />
          </View>
        </View>

        {/* Statistiques */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Statistiques</Text>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{groups.length}</Text>
              <Text style={styles.statLabel}>Groupes</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{matches.length}</Text>
              <Text style={styles.statLabel}>Matchs</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{posts.length}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </View>
          </View>
        </View>

        {/* Matchs du club */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Matchs récents</Text>
          {matches.length === 0 ? (
            <Text style={styles.emptyText}>Aucun match dans les groupes de ce club</Text>
          ) : (
            matches.slice(0, 5).map((match) => {
              const timeSlot = match.time_slots;
              const startDate = timeSlot?.starts_at ? new Date(timeSlot.starts_at) : null;
              const groupName = match.groups?.name || 'Groupe inconnu';
              
              return (
                <View key={match.id} style={styles.matchCard}>
                  <View style={styles.matchHeader}>
                    <Text style={styles.matchGroupName}>{groupName}</Text>
                    <Text style={styles.matchStatus}>{match.status || 'pending'}</Text>
                  </View>
                  {startDate && (
                    <Text style={styles.matchDate}>
                      {startDate.toLocaleDateString('fr-FR', { 
                        weekday: 'short', 
                        day: 'numeric', 
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </Text>
                  )}
                </View>
              );
            })
          )}
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <TouchableOpacity
            style={styles.notificationButton}
            onPress={() => setShowNotificationsModal(true)}
          >
            <Ionicons name="notifications" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.notificationButtonText}>Envoyer une notification</Text>
          </TouchableOpacity>
        </View>

        {/* Bouton de sauvegarde */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving || !name.trim()}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Enregistrer les modifications</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Modal pour envoyer une notification */}
      <Modal
        visible={showNotificationsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowNotificationsModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.modalScroll}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Envoyer une notification</Text>
                <Pressable onPress={() => setShowNotificationsModal(false)}>
                  <Ionicons name="close" size={24} color="#000" />
                </Pressable>
              </View>

              <Text style={styles.modalLabel}>
                La notification sera envoyée à tous les membres des groupes de ce club
              </Text>

              <TextInput
                style={[styles.input, styles.textArea]}
                value={notificationMessage}
                onChangeText={setNotificationMessage}
                placeholder="Saisissez votre message..."
                placeholderTextColor="#999"
                multiline
                numberOfLines={6}
              />

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={() => {
                    setShowNotificationsModal(false);
                    setNotificationMessage("");
                  }}
                >
                  <Text style={styles.modalButtonTextCancel}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSend, sendingNotification && styles.modalButtonDisabled]}
                  onPress={handleSendNotification}
                  disabled={sendingNotification || !notificationMessage.trim()}
                >
                  {sendingNotification ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalButtonTextSend}>Envoyer</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#000",
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 8,
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
  textAreaSmall: {
    minHeight: 70,
    textAlignVertical: "top",
  },
  logoContainer: {
    position: "relative",
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  logoPreview: {
    width: 120,
    height: 120,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  removeLogoButton: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 2,
  },
  logoButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  logoButton: {
    flex: 1,
    backgroundColor: BRAND,
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  logoButtonDisabled: {
    opacity: 0.6,
  },
  logoButtonSecondary: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: BRAND,
  },
  logoButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  logoButtonTextSecondary: {
    color: BRAND,
    fontSize: 14,
    fontWeight: "600",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  switch: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#d1d5db",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  switchActive: {
    backgroundColor: BRAND,
  },
  switchThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#fff",
    alignSelf: "flex-start",
  },
  switchThumbActive: {
    alignSelf: "flex-end",
  },
  statsRow: {
    flexDirection: "row",
    gap: 16,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    color: BRAND,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: "#6b7280",
  },
  saveButton: {
    backgroundColor: "#22c55e", // Vert
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 14,
    fontStyle: "italic",
    textAlign: "center",
    padding: 16,
  },
  matchCard: {
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  matchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  matchGroupName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000",
    flex: 1,
  },
  matchStatus: {
    fontSize: 12,
    color: "#6b7280",
    textTransform: "capitalize",
  },
  matchDate: {
    fontSize: 12,
    color: "#6b7280",
  },
  notificationButton: {
    backgroundColor: "#f97316", // Orange
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  notificationButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalScroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    width: "90%",
    maxWidth: "90%",
    maxHeight: "80%",
    marginHorizontal: "5%",
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
  modalLabel: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  modalButton: {
    flex: 1,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalButtonCancel: {
    backgroundColor: "#e5e7eb",
  },
  modalButtonSend: {
    backgroundColor: "#f97316", // Orange
  },
  modalButtonDisabled: {
    opacity: 0.6,
  },
  modalButtonTextCancel: {
    color: "#374151",
    fontSize: 16,
    fontWeight: "600",
  },
  modalButtonTextSend: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  photosGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  photoContainer: {
    position: "relative",
    width: "47%",
    aspectRatio: 16 / 9,
    marginBottom: 12,
  },
  photoPreview: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  removePhotoButton: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 2,
  },
  addPhotoButton: {
    width: "47%",
    aspectRatio: 16 / 9,
    borderWidth: 2,
    borderColor: BRAND,
    borderStyle: "dashed",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(26,75,151,0.05)",
  },
  addPhotoButtonDisabled: {
    opacity: 0.6,
  },
  addPhotoText: {
    marginTop: 4,
    color: BRAND,
    fontWeight: "600",
    fontSize: 12,
  },
});

