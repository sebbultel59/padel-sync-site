// app/clubs/[id]/agenda.js
// Onglet Agenda, Événements et Actualités pour le club manager
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AgendaClub from "../../../components/AgendaClub";
import { syncInstagramPosts } from "../../../lib/instagram-sync";
import { supabase } from "../../../lib/supabase";

const BRAND = "#1a4b87";

export default function ClubAgendaScreen() {
  const params = useLocalSearchParams();
  const clubId = params?.id;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState([]);
  const [createPostModalVisible, setCreatePostModalVisible] = useState(false);
  const [creatingPost, setCreatingPost] = useState(false);
  const [newPostTitle, setNewPostTitle] = useState("");
  const [newPostContent, setNewPostContent] = useState("");
  const [newPostImageUrl, setNewPostImageUrl] = useState("");
  const [newPostIsInstagram, setNewPostIsInstagram] = useState(false);
  const [newPostInstagramLink, setNewPostInstagramLink] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);

  // États pour l'édition
  const [editPostModalVisible, setEditPostModalVisible] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [editPostTitle, setEditPostTitle] = useState("");
  const [editPostContent, setEditPostContent] = useState("");
  const [editPostImageUrl, setEditPostImageUrl] = useState("");
  const [updatingPost, setUpdatingPost] = useState(false);
  const [uploadingEditImage, setUploadingEditImage] = useState(false);

  const loadPosts = useCallback(async () => {
    if (!clubId) return;

    try {
      setLoading(true);

      // Charger les posts (tous, peu importe la source)
      const { data: postsData } = await supabase
        .from("club_posts")
        .select("id, title, content, created_at, image_url, source, instagram_permalink")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false })
        .limit(20);

      setPosts(postsData || []);
    } catch (e) {
      console.error("[ClubAgenda] Erreur:", e);
      Alert.alert("Erreur", e?.message || "Impossible de charger les données");
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  // Synchronisation automatique Instagram au chargement
  useEffect(() => {
    if (!clubId) return;

    const syncInstagram = async () => {
      try {
        // Vérifier si Instagram est configuré pour ce club (depuis instagram_tokens)
        const { data: tokenData } = await supabase
          .from("instagram_tokens")
          .select("access_token, instagram_user_id, updated_at")
          .eq("club_id", clubId)
          .single();

        if (!tokenData || !tokenData.access_token || !tokenData.instagram_user_id) {
          return; // Instagram non configuré, ne rien faire
        }

        // Vérifier si une synchronisation est nécessaire (dernière sync il y a plus de 6 heures)
        const lastSync = tokenData.updated_at ? new Date(tokenData.updated_at) : null;
        const now = new Date();
        const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

        // Si pas de sync ou sync il y a plus de 6 heures, synchroniser
        if (!lastSync || lastSync < sixHoursAgo) {
          console.log("[ClubAgenda] Synchronisation automatique Instagram...");
          const result = await syncInstagramPosts(clubId);
          if (result.success && result.newPosts > 0) {
            console.log(`[ClubAgenda] ${result.newPosts} nouveau(x) post(s) Instagram synchronisé(s)`);
            // Recharger les posts pour afficher les nouveaux
            loadPosts();
          }
        }
      } catch (error) {
        console.error("[ClubAgenda] Erreur synchronisation automatique:", error);
        // Ne pas afficher d'alerte pour la sync automatique, juste logger l'erreur
      }
    };

    syncInstagram();
  }, [clubId, loadPosts]);

  // Récupérer l'utilisateur actuel
  const getCurrentUser = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  }, []);

  // Uploader l'image du post
  const uploadPostImage = useCallback(async (uri) => {
    if (!clubId) return;

    try {
      setUploadingImage(true);

      // Créer un nom de fichier unique
      const timestamp = Date.now();
      const filename = `club-posts/${clubId}/${timestamp}.jpg`;

      // Convertir l'URI en ArrayBuffer
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

      setNewPostImageUrl(publicUrl);
    } catch (e) {
      console.error("[ClubAgenda] Erreur upload image:", e);
      Alert.alert("Erreur", "Impossible d'uploader l'image");
    } finally {
      setUploadingImage(false);
    }
  }, [clubId]);

  // Sélectionner une image
  const pickImage = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission requise", "L'accès à la galerie est nécessaire pour ajouter une image");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        // Uploader l'image vers Supabase Storage
        await uploadPostImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error("[ClubAgenda] Erreur sélection image:", error);
      Alert.alert("Erreur", "Impossible de sélectionner l'image");
    }
  }, [uploadPostImage]);

  // Uploader l'image pour l'édition
  const uploadEditPostImage = useCallback(async (uri) => {
    if (!clubId) return;

    try {
      setUploadingEditImage(true);

      const timestamp = Date.now();
      const filename = `club-posts/${clubId}/${timestamp}.jpg`;

      const arrayBuffer = await (await fetch(uri)).arrayBuffer();

      const { data, error } = await supabase.storage
        .from("club-assets")
        .upload(filename, arrayBuffer, {
          contentType: "image/jpeg",
          upsert: false,
        });

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from("club-assets").getPublicUrl(filename);

      setEditPostImageUrl(publicUrl);
    } catch (e) {
      console.error("[ClubAgenda] Erreur upload image édition:", e);
      Alert.alert("Erreur", "Impossible d'uploader l'image");
    } finally {
      setUploadingEditImage(false);
    }
  }, [clubId]);

  // Sélectionner une image pour l'édition
  const pickEditImage = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission requise", "L'accès à la galerie est nécessaire pour ajouter une image");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadEditPostImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error("[ClubAgenda] Erreur sélection image édition:", error);
      Alert.alert("Erreur", "Impossible de sélectionner l'image");
    }
  }, [uploadEditPostImage]);

  // Ouvrir le modal d'édition
  const handleEditPost = useCallback((post) => {
    setEditingPost(post);
    setEditPostTitle(post.title || "");
    setEditPostContent(post.content || "");
    setEditPostImageUrl(post.image_url || "");
    setEditPostModalVisible(true);
  }, []);

  // Modifier un post
  const handleUpdatePost = useCallback(async () => {
    if (!editingPost || !editPostTitle.trim()) {
      Alert.alert("Erreur", "Le titre est obligatoire");
      return;
    }

    // Validation du contenu
    if (!editPostContent.trim()) {
      Alert.alert("Oups !", "Tu as oublié de saisir du contenu");
      return;
    }

    try {
      setUpdatingPost(true);

      const updateData = {
        title: editPostTitle.trim(),
        content: editPostContent.trim(),
        image_url: editPostImageUrl || null,
      };

      const { error } = await supabase
        .from("club_posts")
        .update(updateData)
        .eq("id", editingPost.id);

      if (error) throw error;

      Alert.alert("Succès", "Post modifié avec succès");
      setEditPostModalVisible(false);
      setEditingPost(null);
      setEditPostTitle("");
      setEditPostContent("");
      setEditPostImageUrl("");
      loadPosts();
    } catch (error) {
      console.error("[ClubAgenda] Erreur modification post:", error);
      
      // Messages d'erreur compréhensibles pour l'utilisateur
      let errorMessage = "Impossible de modifier le post";
      
      if (error.message) {
        if (error.message.includes("Tu as oublié de saisir du contenu")) {
          errorMessage = "Tu as oublié de saisir du contenu";
        } else if (error.message.includes("content") && error.message.includes("not-null")) {
          errorMessage = "Tu as oublié de saisir du contenu";
        } else if (error.message.includes("title") && error.message.includes("not-null")) {
          errorMessage = "Le titre est obligatoire";
        } else {
          errorMessage = error.message;
        }
      }
      
      Alert.alert("Erreur", errorMessage);
    } finally {
      setUpdatingPost(false);
    }
  }, [editingPost, editPostTitle, editPostContent, editPostImageUrl, loadPosts]);

  // Supprimer un post
  const handleDeletePost = useCallback((postId, postTitle) => {
    Alert.alert(
      "Supprimer le post",
      `Êtes-vous sûr de vouloir supprimer "${postTitle}" ?\n\nCette action est irréversible.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("club_posts")
                .delete()
                .eq("id", postId);

              if (error) throw error;

              Alert.alert("Succès", "Post supprimé avec succès");
              loadPosts();
            } catch (error) {
              console.error("[ClubAgenda] Erreur suppression post:", error);
              Alert.alert("Erreur", error.message || "Impossible de supprimer le post");
            }
          }
        }
      ]
    );
  }, [loadPosts]);

  // Créer un post
  const handleCreatePost = useCallback(async () => {
    if (!clubId) return;

    // Validation du titre
    if (!newPostTitle.trim()) {
      Alert.alert("Erreur", "Le titre est obligatoire");
      return;
    }

    // Validation du contenu
    if (!newPostContent.trim()) {
      Alert.alert("Oups !", "Tu as oublié de saisir du contenu");
      return;
    }

    try {
      setCreatingPost(true);

      const user = await getCurrentUser();
      if (!user) {
        Alert.alert("Erreur", "Vous devez être connecté");
        return;
      }

      // Préparer les données du post
      const postData = {
        club_id: clubId,
        title: newPostTitle.trim(),
        content: newPostContent.trim(),
        image_url: newPostImageUrl || null,
        source: newPostIsInstagram ? 'instagram' : 'manual',
        created_by: user.id,
      };

      // Si c'est un post Instagram, ajouter le permalink
      if (newPostIsInstagram && newPostInstagramLink.trim()) {
        postData.instagram_permalink = newPostInstagramLink.trim();
      }

      const { error } = await supabase
        .from("club_posts")
        .insert(postData);

      if (error) {
        // Gérer les erreurs de contrainte avec des messages compréhensibles
        if (error.message?.includes('content') && error.message?.includes('not-null')) {
          throw new Error("Tu as oublié de saisir du contenu");
        }
        throw error;
      }

      Alert.alert("Succès", "Post créé avec succès");
      
      // Réinitialiser le formulaire
      setNewPostTitle("");
      setNewPostContent("");
      setNewPostImageUrl("");
      setNewPostIsInstagram(false);
      setNewPostInstagramLink("");
      setCreatePostModalVisible(false);
      
      // Recharger les posts
      loadPosts();
    } catch (error) {
      console.error("[ClubAgenda] Erreur création post:", error);
      
      // Messages d'erreur compréhensibles pour l'utilisateur
      let errorMessage = "Impossible de créer le post";
      
      if (error.message) {
        if (error.message.includes("Tu as oublié de saisir du contenu")) {
          errorMessage = "Tu as oublié de saisir du contenu";
        } else if (error.message.includes("content") && error.message.includes("not-null")) {
          errorMessage = "Tu as oublié de saisir du contenu";
        } else if (error.message.includes("title") && error.message.includes("not-null")) {
          errorMessage = "Le titre est obligatoire";
        } else {
          errorMessage = error.message;
        }
      }
      
      Alert.alert("Erreur", errorMessage);
    } finally {
      setCreatingPost(false);
    }
  }, [clubId, newPostTitle, newPostContent, newPostImageUrl, newPostIsInstagram, newPostInstagramLink, getCurrentUser, loadPosts]);

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
        {/* Agenda du club */}
        <AgendaClub clubId={clubId} isManager={true} />

        {/* Posts (liste) */}
        <View style={styles.sectionTitleContainer}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="star" size={20} color="#e0ff00" />
            <Text style={styles.sectionTitle}>Actualités ({posts.length})</Text>
          </View>
            <TouchableOpacity
              style={styles.addPostButton}
              onPress={() => setCreatePostModalVisible(true)}
            >
            <Ionicons name="add" size={20} color="#000" />
              <Text style={styles.addPostButtonText}>Ajouter</Text>
            </TouchableOpacity>
          </View>
        <View style={styles.section}>
          {posts.length === 0 ? (
            <Text style={styles.emptyText}>Aucun post</Text>
          ) : (
            posts.map((post) => (
              <View key={post.id} style={styles.postCard}>
                <View style={styles.postHeader}>
                  <Text style={styles.postTitle}>{post.title}</Text>
                  {post.source === 'instagram' && (
                    <View style={styles.instagramBadge}>
                      <Ionicons name="logo-instagram" size={14} color="#fff" />
                      <Text style={styles.instagramBadgeText}>Instagram</Text>
                    </View>
                  )}
                </View>
                {post.content && (
                  <Text style={styles.postContent}>{post.content}</Text>
                )}
                {post.image_url && (
                  <Image source={{ uri: post.image_url }} style={styles.postImage} />
                )}
                {post.source === 'instagram' && post.instagram_permalink && (
                  <TouchableOpacity
                    style={styles.instagramLink}
                    onPress={() => Linking.openURL(post.instagram_permalink)}
                  >
                    <Ionicons name="open-outline" size={14} color="#e1306c" />
                    <Text style={styles.instagramLinkText}>Voir sur Instagram</Text>
                  </TouchableOpacity>
                )}
                
                {/* Actions pour le club manager */}
                <View style={styles.postActions}>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => handleEditPost(post)}
                  >
                    <Ionicons name="pencil" size={16} color={BRAND} />
                    <Text style={styles.editButtonText}>Modifier</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDeletePost(post.id, post.title)}
                  >
                    <Ionicons name="trash" size={16} color="#ef4444" />
                    <Text style={styles.deleteButtonText}>Supprimer</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Modal pour créer un post */}
      <Modal
        visible={createPostModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCreatePostModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouveau post</Text>
              <TouchableOpacity
                onPress={() => {
                  setCreatePostModalVisible(false);
                  setNewPostTitle("");
                  setNewPostContent("");
                  setNewPostImageUrl("");
                  setNewPostIsInstagram(false);
                  setNewPostInstagramLink("");
                }}
              >
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={false}>
              <View style={styles.modalInputGroup}>
                <Text style={styles.modalLabel}>Titre *</Text>
                <TextInput
                  style={styles.modalInput}
                  value={newPostTitle}
                  onChangeText={setNewPostTitle}
                  placeholder="Titre du post"
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.modalInputGroup}>
                <Text style={styles.modalLabel}>Contenu *</Text>
                <TextInput
                  style={[styles.modalInput, styles.modalTextArea]}
                  value={newPostContent}
                  onChangeText={setNewPostContent}
                  placeholder="Description du post..."
                  placeholderTextColor="#999"
                  multiline
                  numberOfLines={4}
                />
              </View>

              <View style={styles.modalInputGroup}>
                <Text style={styles.modalLabel}>Image</Text>
                {newPostImageUrl ? (
                  <View style={styles.imagePreviewContainer}>
                    <Image source={{ uri: newPostImageUrl }} style={styles.imagePreview} />
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => setNewPostImageUrl("")}
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
                      <ActivityIndicator size="small" color={BRAND} />
                    ) : (
                      <>
                        <Ionicons name="image-outline" size={24} color={BRAND} />
                        <Text style={styles.imagePickerButtonText}>Choisir une image</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.modalInputGroup}>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setNewPostIsInstagram(!newPostIsInstagram)}
                >
                  <View style={[styles.checkbox, newPostIsInstagram && styles.checkboxChecked]}>
                    {newPostIsInstagram && (
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    )}
                  </View>
                  <View style={styles.checkboxLabelContainer}>
                    <Ionicons name="logo-instagram" size={18} color="#e1306c" />
                    <Text style={styles.checkboxLabel}>Post Instagram</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {newPostIsInstagram && (
                <View style={styles.modalInputGroup}>
                  <Text style={styles.modalLabel}>Lien Instagram (optionnel)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={newPostInstagramLink}
                    onChangeText={setNewPostInstagramLink}
                    placeholder="https://instagram.com/p/..."
                    placeholderTextColor="#999"
                    autoCapitalize="none"
                  />
                </View>
              )}

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={() => {
                    setCreatePostModalVisible(false);
                    setNewPostTitle("");
                    setNewPostContent("");
                    setNewPostImageUrl("");
                    setNewPostIsInstagram(false);
                    setNewPostInstagramLink("");
                  }}
                >
                  <Text style={styles.modalButtonTextCancel}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalButton,
                    newPostTitle.trim() && newPostContent.trim() && !creatingPost
                      ? styles.modalButtonConfirmActive
                      : styles.modalButtonConfirmDisabled
                  ]}
                  onPress={handleCreatePost}
                  disabled={creatingPost || !newPostTitle.trim() || !newPostContent.trim()}
                >
                  {creatingPost ? (
                    <ActivityIndicator color="#000" size="small" />
                  ) : (
                    <Text
                      style={[
                        newPostTitle.trim() && newPostContent.trim()
                          ? styles.modalButtonTextConfirm
                          : styles.modalButtonTextConfirmDisabled
                      ]}
                    >
                      Créer
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal pour modifier un post */}
      <Modal
        visible={editPostModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setEditPostModalVisible(false);
          setEditingPost(null);
          setEditPostTitle("");
          setEditPostContent("");
          setEditPostImageUrl("");
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Modifier le post</Text>
              <TouchableOpacity
                onPress={() => {
                  setEditPostModalVisible(false);
                  setEditingPost(null);
                  setEditPostTitle("");
                  setEditPostContent("");
                  setEditPostImageUrl("");
                }}
              >
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={false}>
              <View style={styles.modalInputGroup}>
                <Text style={styles.modalLabel}>Titre *</Text>
                <TextInput
                  style={styles.modalInput}
                  value={editPostTitle}
                  onChangeText={setEditPostTitle}
                  placeholder="Titre du post"
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.modalInputGroup}>
                <Text style={styles.modalLabel}>Contenu *</Text>
                <TextInput
                  style={[styles.modalInput, styles.modalTextArea]}
                  value={editPostContent}
                  onChangeText={setEditPostContent}
                  placeholder="Description du post..."
                  placeholderTextColor="#999"
                  multiline
                  numberOfLines={4}
                />
              </View>

              <View style={styles.modalInputGroup}>
                <Text style={styles.modalLabel}>Image</Text>
                {editPostImageUrl ? (
                  <View style={styles.imagePreviewContainer}>
                    <Image source={{ uri: editPostImageUrl }} style={styles.imagePreview} />
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => setEditPostImageUrl("")}
                    >
                      <Ionicons name="close-circle" size={24} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.imagePickerButton}
                    onPress={pickEditImage}
                    disabled={uploadingEditImage}
                  >
                    {uploadingEditImage ? (
                      <ActivityIndicator size="small" color={BRAND} />
                    ) : (
                      <>
                        <Ionicons name="image-outline" size={24} color={BRAND} />
                        <Text style={styles.imagePickerButtonText}>Choisir une image</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={() => {
                    setEditPostModalVisible(false);
                    setEditingPost(null);
                    setEditPostTitle("");
                    setEditPostContent("");
                    setEditPostImageUrl("");
                  }}
                >
                  <Text style={styles.modalButtonTextCancel}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalButton,
                    editPostTitle.trim() && editPostContent.trim() && !updatingPost
                      ? styles.modalButtonConfirmActive
                      : styles.modalButtonConfirmDisabled
                  ]}
                  onPress={handleUpdatePost}
                  disabled={updatingPost || !editPostTitle.trim() || !editPostContent.trim()}
                >
                  {updatingPost ? (
                    <ActivityIndicator color="#000" size="small" />
                  ) : (
                    <Text
                      style={[
                        editPostTitle.trim() && editPostContent.trim()
                          ? styles.modalButtonTextConfirm
                          : styles.modalButtonTextConfirmDisabled
                      ]}
                    >
                      Enregistrer
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#001833",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 20,
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    marginTop: 8,
    paddingHorizontal: 16,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#e0ff00",
  },
  emptyText: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    paddingVertical: 20,
  },
  postCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  postTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  instagramBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#e1306c",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  instagramBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
  },
  postContent: {
    fontSize: 14,
    color: "#4b5563",
    marginBottom: 8,
  },
  postImage: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    marginTop: 8,
  },
  instagramLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  instagramLinkText: {
    fontSize: 12,
    color: "#e1306c",
    fontWeight: "500",
  },
  addPostButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#e0ff00",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  addPostButtonText: {
    color: "#000",
    fontSize: 12,
    fontWeight: "600",
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
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#000",
  },
  modalScrollView: {
    maxHeight: 600,
  },
  modalInputGroup: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 8,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#000",
    backgroundColor: "#fff",
  },
  modalTextArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  imagePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 2,
    borderColor: "#d1d5db",
    borderStyle: "dashed",
    borderRadius: 8,
    padding: 20,
    backgroundColor: "#f9fafb",
  },
  imagePickerButtonText: {
    fontSize: 14,
    color: BRAND,
    fontWeight: "500",
  },
  imagePreviewContainer: {
    position: "relative",
    borderRadius: 8,
    overflow: "hidden",
  },
  imagePreview: {
    width: "100%",
    height: 200,
    borderRadius: 8,
  },
  removeImageButton: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 12,
    padding: 4,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: BRAND,
    borderColor: BRAND,
  },
  checkboxLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkboxLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  modalButtonCancel: {
    backgroundColor: "#f3f4f6",
  },
  modalButtonConfirmActive: {
    backgroundColor: "#e0ff00", // Vert clair
  },
  modalButtonConfirmDisabled: {
    backgroundColor: "#9ca3af", // Gris
  },
  modalButtonTextCancel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  modalButtonTextConfirm: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
  },
  modalButtonTextConfirmDisabled: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  postActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  editButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: BRAND,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: BRAND,
  },
  deleteButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#ef4444",
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#ef4444",
  },
});

