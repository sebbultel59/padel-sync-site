// app/clubs/[id]/index.js
// Vue publique de la page club (joueurs & visiteurs)
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AgendaClub from "../../../components/AgendaClub";
import { useUserRole } from "../../../lib/roles";
import { supabase } from "../../../lib/supabase";

const BRAND = "#1a4b97";

export default function ClubPublicScreen() {
  const { id: clubId, returnTo } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { role, clubId: userClubId, loading: roleLoading } = useUserRole();
  
  // Fonction pour gérer le retour vers la page d'origine
  const handleBack = useCallback(() => {
    if (returnTo === 'groupes') {
      router.replace('/(tabs)/groupes');
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/groupes');
    }
  }, [returnTo]);

  console.log("[ClubPublic] Render - clubId:", clubId, "roleLoading:", roleLoading, "role:", role);

  const [loading, setLoading] = useState(true);
  const [club, setClub] = useState(null);
  const [groups, setGroups] = useState([]);
  const [posts, setPosts] = useState([]);

  const loadClub = useCallback(async () => {
    if (!clubId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      console.log("[ClubPublic] Début chargement club:", clubId);

      const { data: clubData, error } = await supabase
        .from("clubs")
        .select("*")
        .eq("id", clubId)
        .single();

      if (error) {
        console.error("[ClubPublic] Erreur chargement club:", error);
        throw error;
      }
      
      if (!clubData) {
        console.warn("[ClubPublic] Club non trouvé:", clubId);
        setClub(null);
        setLoading(false);
        return;
      }

      console.log("[ClubPublic] Club chargé:", clubData.name);
      setClub(clubData);

      // Charger les groupes en parallèle (non bloquant)
      supabase
        .from("groups")
        .select("id, name, visibility, join_policy")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false })
        .limit(6)
        .then(({ data: groupsData }) => {
          setGroups(groupsData || []);
        })
        .catch((e) => {
          console.warn("[ClubPublic] Erreur chargement groupes:", e);
          setGroups([]);
        });

      // Charger les posts en parallèle (non bloquant)
      supabase
        .from("club_posts")
        .select("id, title, content, created_at, image_url")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false })
        .limit(5)
        .then(({ data: postsData }) => {
          setPosts(postsData || []);
        })
        .catch((e) => {
          console.warn("[ClubPublic] Erreur chargement posts:", e);
          setPosts([]);
        });
    } catch (e) {
      console.error("[ClubPublic] Erreur fatale:", e);
      setClub(null);
    } finally {
      console.log("[ClubPublic] Fin chargement, setLoading(false)");
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    loadClub();
  }, [loadClub]);

  // Timeout de sécurité pour éviter le chargement infini
  useEffect(() => {
    if (loading && !roleLoading) {
      const timeout = setTimeout(() => {
        console.warn("[ClubPublic] Timeout de chargement, arrêt du loading");
        setLoading(false);
      }, 10000); // 10 secondes max
      return () => clearTimeout(timeout);
    }
  }, [loading, roleLoading]);

  const handleCall = useCallback(() => {
    if (!club?.call_button_enabled || !club?.call_phone) return;
    const tel = club.call_phone.replace(/\s+/g, "");
    Linking.openURL(`tel:${tel}`).catch(() => {});
  }, [club]);

  const handleOpenLink = useCallback((rawUrl) => {
    if (!rawUrl) return;
    let url = rawUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }
    Linking.openURL(url).catch(() => {});
  }, []);

  const handleOpenAddress = useCallback(async () => {
    if (!club?.address) return;
    
    const encodedAddress = encodeURIComponent(club.address);
    
    // Vérifier quelles applications sont disponibles
    const apps = [];
    
    // Google Maps
    const googleMapsUrl = `https://maps.google.com/?q=${encodedAddress}`;
    const canOpenGoogleMaps = await Linking.canOpenURL(googleMapsUrl).catch(() => false);
    if (canOpenGoogleMaps) {
      apps.push({ name: "Google Maps", url: googleMapsUrl });
    }
    
    // Apple Maps (iOS uniquement)
    if (Platform.OS === "ios") {
      const appleMapsUrl = `http://maps.apple.com/?q=${encodedAddress}`;
      const canOpenAppleMaps = await Linking.canOpenURL(appleMapsUrl).catch(() => false);
      if (canOpenAppleMaps) {
        apps.push({ name: "Apple Maps", url: appleMapsUrl });
      }
    }
    
    // Waze
    const wazeUrl = `waze://?q=${encodedAddress}`;
    const canOpenWaze = await Linking.canOpenURL(wazeUrl).catch(() => false);
    if (canOpenWaze) {
      apps.push({ name: "Waze", url: wazeUrl });
    }
    
    // URL générique (geo:) qui laisse le système choisir
    const geoUrl = `geo:0,0?q=${encodedAddress}`;
    const canOpenGeo = await Linking.canOpenURL(geoUrl).catch(() => false);
    if (canOpenGeo) {
      apps.push({ name: "Navigation (par défaut)", url: geoUrl });
    }
    
    // Toujours proposer une recherche web en dernier recours
    apps.push({ 
      name: "Recherche web", 
      url: `https://www.google.com/maps/search/?api=1&query=${encodedAddress}` 
    });
    
    if (apps.length === 0) {
      // Fallback si aucune app n'est détectée
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`).catch(() => {});
      return;
    }
    
    if (apps.length === 1) {
      // Une seule option, ouvrir directement
      Linking.openURL(apps[0].url).catch(() => {});
      return;
    }
    
    // Plusieurs options, proposer un choix
    if (Platform.OS === "ios") {
      // Utiliser ActionSheet sur iOS
      const { ActionSheetIOS } = require("react-native");
      const options = [...apps.map(a => a.name), "Annuler"];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
        },
        (buttonIndex) => {
          if (buttonIndex < apps.length) {
            Linking.openURL(apps[buttonIndex].url).catch(() => {});
          }
        }
      );
    } else {
      // Utiliser Alert sur Android
      const buttons = [
        ...apps.map((app, index) => ({
          text: app.name,
          onPress: () => Linking.openURL(app.url).catch(() => {}),
        })),
        { text: "Annuler", style: "cancel" },
      ];
      Alert.alert("Choisir une application", "Ouvrir l'adresse avec :", buttons);
    }
  }, [club]);

  const socialLinks = useMemo(() => {
    const links = club?.social_links || {};
    return {
      facebook: links.facebook || null,
      instagram: links.instagram || null,
      website: links.website || null,
    };
  }, [club]);

  const hasSocialLinks = Boolean(
    socialLinks.facebook || socialLinks.instagram || socialLinks.website
  );

  // Formater les horaires d'ouverture
  const formatOpeningHours = useCallback((openingHours) => {
    if (!openingHours || typeof openingHours !== 'object') return null;
    
    const days = [
      { key: 'monday', label: 'Lundi' },
      { key: 'tuesday', label: 'Mardi' },
      { key: 'wednesday', label: 'Mercredi' },
      { key: 'thursday', label: 'Jeudi' },
      { key: 'friday', label: 'Vendredi' },
      { key: 'saturday', label: 'Samedi' },
      { key: 'sunday', label: 'Dimanche' },
    ];

    return days.map(({ key, label }) => {
      const dayHours = openingHours[key];
      if (!dayHours) return null;
      
      if (dayHours.closed) {
        return { day: label, hours: 'Fermé' };
      }
      
      const open = dayHours.open || '';
      const close = dayHours.close || '';
      
      if (open && close) {
        return { day: label, hours: `${open} - ${close}` };
      }
      
      return null;
    }).filter(Boolean);
  }, []);

  const openingHoursList = useMemo(() => {
    return club?.opening_hours ? formatOpeningHours(club.opening_hours) : null;
  }, [club?.opening_hours, formatOpeningHours]);

  const hasOpeningHours = Boolean(openingHoursList && openingHoursList.length > 0);

  const isMyClub = Boolean(
    role === "club_manager" && userClubId && clubId && String(userClubId) === String(clubId)
  );

  // Rediriger vers le dashboard si club_manager
  useEffect(() => {
    if (roleLoading) return; // Attendre que le rôle soit chargé
    if (isMyClub && role && userClubId) {
      router.replace(`/clubs/${clubId}/dashboard`);
      return;
    }
  }, [isMyClub, clubId, role, userClubId, roleLoading]);

  // Si club_manager, ne pas afficher cette page (redirection en cours)
  if (roleLoading) {
    console.log("[ClubPublic] Affichage spinner - roleLoading");
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </Pressable>
          <Text style={styles.headerTitle}>Club</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={BRAND} />
        </View>
      </View>
    );
  }

  if (isMyClub && role && userClubId) {
    console.log("[ClubPublic] Affichage spinner - isMyClub (redirection)");
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </Pressable>
          <Text style={styles.headerTitle}>Club</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={BRAND} />
        </View>
      </View>
    );
  }

  if (!clubId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </Pressable>
          <Text style={styles.headerTitle}>Club</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <Text>ID du club manquant.</Text>
        </View>
      </View>
    );
  }

  if (loading && !roleLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </Pressable>
          <Text style={styles.headerTitle}>Club</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={BRAND} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0 }}>
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Pressable
              onPress={handleBack}
              style={styles.cardBackButton}
            >
              <Ionicons name="arrow-back" size={24} color="#001831" />
            </Pressable>
            {club.logo_url ? (
              <Image source={{ uri: club.logo_url }} style={styles.logo} />
            ) : (
              <View style={[styles.logo, styles.logoFallback]}>
                <Text style={{ color: BRAND, fontWeight: "800", fontSize: 28 }}>
                  {club.name?.slice(0, 2)?.toUpperCase() || "CL"}
                </Text>
              </View>
            )}
            <View style={styles.cardHeaderSpacer} />
          </View>
          <Text style={styles.clubName}>{club.name}</Text>
          {club.description && (
            <Text style={styles.description}>{club.description}</Text>
          )}
          {club.address && (
            <Pressable onPress={handleOpenAddress} style={styles.addressContainer}>
              <Ionicons name="location" size={20} color={BRAND} />
              <Text style={styles.address}>{club.address}</Text>
            </Pressable>
          )}
          {club.city && !club.address && (
            <Text style={styles.meta}>📍 {club.city}</Text>
          )}
        </View>

        {club.call_button_enabled && club.call_phone && (
          <Pressable style={styles.callButton} onPress={handleCall}>
            <Ionicons name="call" size={18} color="#fff" />
            <Text style={styles.callText}>
              {club.call_button_label || `Appeler ${club.name}`}
            </Text>
          </Pressable>
        )}

        {hasOpeningHours && (
          <>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#e0ff00", marginBottom: 8, marginTop: 16 }}>Horaires du club</Text>
            <View style={[styles.card, { paddingVertical: 12 }]}>
              {openingHoursList.map((item, index) => (
                <View key={index} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: index < openingHoursList.length - 1 ? 1 : 0, borderBottomColor: "#e5e7eb" }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>{item.day}</Text>
                  <Text style={{ fontSize: 14, color: "#6b7280" }}>{item.hours}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {hasSocialLinks && (
          <>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#e0ff00", marginBottom: 8, marginTop: 16 }}>Liens sociaux</Text>
            <View style={[styles.card, { paddingVertical: 12 }]}>
              <View style={styles.socialRow}>
              {socialLinks.facebook ? (
                <Pressable
                  style={[styles.socialButton, { backgroundColor: "rgba(24,119,242,0.12)" }]}
                  onPress={() => handleOpenLink(socialLinks.facebook)}
                >
                  <Ionicons name="logo-facebook" size={18} color="#1877f2" />
                  <Text style={styles.socialText}>Facebook</Text>
                </Pressable>
              ) : null}
              {socialLinks.instagram ? (
                <Pressable
                  style={[styles.socialButton, { backgroundColor: "rgba(225,48,108,0.12)" }]}
                  onPress={() => handleOpenLink(socialLinks.instagram)}
                >
                  <Ionicons name="logo-instagram" size={18} color="#e1306c" />
                  <Text style={styles.socialText}>Instagram</Text>
                </Pressable>
              ) : null}
              {socialLinks.website ? (
                <Pressable
                  style={[styles.socialButton, { backgroundColor: "rgba(17,138,178,0.12)" }]}
                  onPress={() => handleOpenLink(socialLinks.website)}
                >
                  <Ionicons name="globe-outline" size={18} color="#118ab2" />
                  <Text style={styles.socialText}>Site web</Text>
                </Pressable>
              ) : null}
              </View>
            </View>
          </>
        )}

        {/* Événements à venir - mode sans calendrier */}
        {club && clubId && (
          <AgendaClub
            clubId={clubId}
            isManager={false}
            showCalendar={false}
          />
        )}

        {!!groups.length && (
          <View style={styles.section}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#e0ff00", marginBottom: 12 }}>Groupes du club</Text>
            {groups.map((g) => (
              <View key={g.id} style={styles.rowCard}>
                <View>
                  <Text style={{ fontWeight: "700", color: "#111827" }}>{g.name}</Text>
                  <Text style={{ color: "#6b7280" }}>
                    {g.visibility === "public" ? "Public" : "Privé"} ·{" "}
                    {g.join_policy === "open" ? "Ouvert" : "Sur demande"}
                  </Text>
                </View>
                <Pressable
                  style={styles.joinButton}
                  onPress={() => router.push("/(tabs)/groupes")}
                >
                  <Text style={{ color: "#fff", fontWeight: "700" }}>Voir</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {club.photos && Array.isArray(club.photos) && club.photos.length > 0 && (
          <View style={styles.section}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#e0ff00", marginBottom: 12 }}>Photos du club</Text>
            <View style={styles.photosGrid}>
              {club.photos.map((photoUrl, index) => (
                <Pressable
                  key={index}
                  style={styles.photoItem}
                  onPress={() => {
                    // Optionnel: ouvrir en plein écran
                  }}
                >
                  <Image source={{ uri: photoUrl }} style={styles.photoImage} />
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {!!posts.length && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Actualités</Text>
            {posts.map((post) => (
              <View key={post.id} style={styles.postCard}>
                <Text style={{ fontWeight: "700", fontSize: 16 }}>{post.title}</Text>
                {post.image_url && (
                  <Image source={{ uri: post.image_url }} style={styles.postImage} />
                )}
                {post.content ? (
                  <Text style={{ color: "#4b5563", marginTop: 6 }}>{post.content}</Text>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#001831",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  cardBackButton: {
    padding: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,24,49,0.08)",
  },
  cardHeaderSpacer: {
    width: 40,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 24,
    marginBottom: 8,
  },
  logoFallback: {
    backgroundColor: "rgba(26,75,151,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  clubName: {
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    color: "#111827",
  },
  description: {
    marginTop: 8,
    color: "#4b5563",
    textAlign: "center",
  },
  meta: {
    marginTop: 8,
    textAlign: "center",
    color: "#6b7280",
  },
  addressContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "rgba(26,75,151,0.08)",
    alignSelf: "center",
    maxWidth: "90%",
  },
  address: {
    color: BRAND,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    flex: 1,
  },
  callButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#ff8d02",
    marginBottom: 16,
  },
  callText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 12,
    color: "#111827",
  },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#fff",
    marginBottom: 10,
  },
  joinButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: BRAND,
  },
  postCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  postImage: {
    width: "100%",
    height: 160,
    marginTop: 8,
    borderRadius: 12,
  },
  socialRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  socialButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  socialText: {
    fontWeight: "700",
    color: "#0f172a",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  photosGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  photoItem: {
    width: "48%",
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#f3f4f6",
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
});

