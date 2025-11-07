// app/(tabs)/profil.js
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GestureHandlerRootView, PinchGestureHandler, State } from 'react-native-gesture-handler';
import Animated, { useAnimatedGestureHandler, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
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
  View,
} from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from "../../context/auth";
import { supabase } from "../../lib/supabase";
import { computeInitials, press } from "../../lib/uiSafe";

const BRAND = "#1a4b97";
const AVATAR = 150;

const LEVELS = [
  { v: 1, label: "Débutant", color: "#a3e635" },
  { v: 2, label: "Perfectionnement", color: "#86efac" },
  { v: 3, label: "Élémentaire", color: "#0e7aff" },
  { v: 4, label: "Intermédiaire", color: "#0d97ac" },
  { v: 5, label: "Confirmé", color: "#ff9d00" },
  { v: 6, label: "Avancé", color: "#f06300" },
  { v: 7, label: "Expert", color: "#fb7185" },
  { v: 8, label: "Elite", color: "#a78bfa" },
];
const colorForLevel = (n) => (LEVELS.find(x => x.v === Number(n))?.color) || '#9ca3af';
const levelMeta = (n) => LEVELS.find((x) => x.v === n) ?? null;

const RAYONS = [
  { v: 5, label: "5 km" },
  { v: 10, label: "10 km" },
  { v: 20, label: "20 km" },
  { v: 30, label: "30 km" },
  { v: 99, label: "+30 km" },
];

export default function ProfilScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [me, setMe] = useState(null); // { id, email }
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(null);

  // champs profil
  const [niveau, setNiveau] = useState(null); // 1..8
  const [main, setMain] = useState(null);     // "droite" | "gauche"
  const [cote, setCote] = useState(null);     // "droite" | "gauche"
  const [club, setClub] = useState("");
  const [rayonKm, setRayonKm] = useState(null); // 5,10,20,30,99
  const [phone, setPhone] = useState("");
  
  // Adresses (domicile/travail)
  const [addressHome, setAddressHome] = useState(null); // { address, lat, lng } | null
  const [addressWork, setAddressWork] = useState(null); // { address, lat, lng } | null
  const [addressHomeInput, setAddressHomeInput] = useState(""); // Input text pour domicile
  const [addressWorkInput, setAddressWorkInput] = useState(""); // Input text pour travail
  const [addressHomeSuggestions, setAddressHomeSuggestions] = useState([]);
  const [addressWorkSuggestions, setAddressWorkSuggestions] = useState([]);
  const [geocodingHome, setGeocodingHome] = useState(false);
  const [geocodingWork, setGeocodingWork] = useState(false);

  // classement (UI uniquement pour l'instant — non persisté tant que la colonne n'existe pas en base)
  const [classement, setClassement] = useState("");
  const [niveauInfoModalVisible, setNiveauInfoModalVisible] = useState(false);
  const [mainPickerVisible, setMainPickerVisible] = useState(false);
  const [cotePickerVisible, setCotePickerVisible] = useState(false);
  const [clubPickerVisible, setClubPickerVisible] = useState(false);
  const [clubsList, setClubsList] = useState([]);
  const [loadingClubs, setLoadingClubs] = useState(false);
  
  // Zoom pour l'image des niveaux
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  
  const pinchHandler = useAnimatedGestureHandler({
    onStart: (_, ctx) => {
      ctx.startScale = savedScale.value;
    },
    onActive: (event, ctx) => {
      scale.value = Math.max(1, Math.min(ctx.startScale * event.scale, 4));
    },
    onEnd: () => {
      savedScale.value = scale.value;
      if (scale.value < 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
      }
    },
  });
  
  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const { signOut: signOutCtx } = useAuth();

  // snapshot initial pour détecter les changements
  const [initialSnap, setInitialSnap] = useState(null);

  const insets = useSafeAreaInsets();

  // Fonction pour calculer la distance entre deux points (formule de Haversine)
  const haversineKm = useCallback((a, b) => {
    if (!a || !b || !a.lat || !a.lng || !b.lat || !b.lng) return Infinity;
    const R = 6371; // Rayon de la Terre en km
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLon = ((b.lng - a.lng) * Math.PI) / 180;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    return Math.round(R * c * 10) / 10; // 0.1 km
  }, []);

  // Charger et trier les clubs
  const loadClubs = useCallback(async () => {
    setLoadingClubs(true);
    try {
      // Charger tous les clubs avec pagination
      const pageSize = 1000;
      let from = 0;
      let to = pageSize - 1;
      let allClubs = [];
      
      while (true) {
        const { data: page, error } = await supabase
          .from('clubs')
          .select('id, name, address, lat, lng')
          .not('lat', 'is', null)
          .not('lng', 'is', null)
          .order('name', { ascending: true })
          .range(from, to);
        
        if (error) throw error;
        
        const batch = Array.isArray(page) ? page : [];
        allClubs = allClubs.concat(batch);
        
        if (batch.length < pageSize) break; // dernière page atteinte
        from += pageSize;
        to += pageSize;
      }

      // Si le joueur a un domicile, trier par distance
      if (addressHome?.lat && addressHome?.lng) {
        const clubsWithDist = allClubs.map(c => ({
          ...c,
          distance: haversineKm(addressHome, { lat: c.lat, lng: c.lng })
        }));
        clubsWithDist.sort((a, b) => a.distance - b.distance);
        setClubsList(clubsWithDist);
      } else {
        // Sinon, trier par ordre alphabétique
        allClubs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setClubsList(allClubs);
      }
    } catch (e) {
      console.error('[Profil] Erreur chargement clubs:', e);
      Alert.alert('Erreur', 'Impossible de charger la liste des clubs');
    } finally {
      setLoadingClubs(false);
    }
  }, [addressHome, haversineKm]);

  // Charger les clubs quand on ouvre le picker
  useEffect(() => {
    if (clubPickerVisible) {
      loadClubs();
    }
  }, [clubPickerVisible, loadClubs]);

  // Charger session + profil
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        const id = u?.user?.id ?? null;
        const email = u?.user?.email ?? "";
        if (!id) { setLoading(false); return; }
        if (mounted) setMe({ id, email });

        const { data: p, error } = await supabase
          .from("profiles")
          .select("display_name, name, avatar_url, niveau, main, cote, club, rayon_km, phone, address_home, address_work")
          .eq("id", id)
          .maybeSingle();
        if (error) throw error;

        const initialName = p?.display_name || p?.name || email;
        const init = {
          displayName: initialName,
          avatarUrl: p?.avatar_url ?? null,
          niveau: Number(p?.niveau) || null,
          main: p?.main ?? null,
          cote: p?.cote ?? null,
          club: p?.club ?? "",
          rayonKm: Number.isFinite(Number(p?.rayon_km)) ? Number(p?.rayon_km) : null,
          phone: p?.phone ?? "",
          addressHome: p?.address_home || null,
          addressWork: p?.address_work || null,
        };

        if (mounted) {
          setDisplayName(init.displayName);
          setAvatarUrl(init.avatarUrl);
          setNiveau(init.niveau);
          setMain(init.main);
          setCote(init.cote);
          setClub(init.club);
          setRayonKm(init.rayonKm);
          setPhone(init.phone);
          setAddressHome(init.addressHome);
          setAddressWork(init.addressWork);
          setAddressHomeInput(init.addressHome?.address || "");
          setAddressWorkInput(init.addressWork?.address || "");
          setInitialSnap(init);
        }
      } catch (e) {
        Alert.alert("Erreur", e?.message ?? String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Recherche d'adresse avec autocomplétion (Nominatim)
  const searchAddress = useCallback(async (query, setSuggestions) => {
    if (!query || query.length < 3) {
      setSuggestions([]);
      return;
    }
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=fr&accept-language=fr`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'PadelSync-Profile/1.0'
        }
      });
      const data = await res.json();
      const suggestions = (data || []).map(item => ({
        name: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        address: item.display_name,
      }));
      setSuggestions(suggestions);
    } catch (e) {
      console.warn('[Profile] address search error:', e);
      setSuggestions([]);
    }
  }, []);

  // Géocoder une adresse complète
  const geocodeAddress = useCallback(async (address) => {
    if (!address || !address.trim()) return null;
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=fr&accept-language=fr`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'PadelSync-Profile/1.0'
        }
      });
      const data = await res.json();
      if (data && data.length > 0) {
        const result = data[0];
        const lat = parseFloat(result.lat);
        const lng = parseFloat(result.lon);
        // Vérifier que c'est bien en France (tolérant pour DOM-TOM)
        if (lat >= 38 && lat <= 54 && lng >= -10 && lng <= 15) {
          return {
            address: address.trim(),
            lat,
            lng,
          };
        }
      }
      return null;
    } catch (e) {
      console.warn('[Profile] geocode error:', e);
      return null;
    }
  }, []);

  // comparaison simple (stringify) du snapshot
  const isDirty = useMemo(() => {
    if (!initialSnap) return false;
    const cur = {
      displayName,
      avatarUrl,
      niveau,
      main,
      cote,
      club,
      rayonKm,
      phone,
      addressHome,
      addressWork,
    };
    try {
      return JSON.stringify(cur) !== JSON.stringify(initialSnap);
    } catch {
      return true;
    }
  }, [initialSnap, displayName, avatarUrl, niveau, main, cote, club, rayonKm, phone, addressHome, addressWork]);

  // Sauvegarde du profil (fonction principale)
  const onSave = useCallback(async () => {
    if (!me?.id) return false;
    const name = (displayName || "").trim();
    if (!name) { Alert.alert("Nom public", "Merci de renseigner un nom public."); return false; }

    try {
      setSaving(true);
      const patch = {
        display_name: name,
        niveau: niveau ?? null,
        main: main ?? null,
        cote: cote ?? null,
        club: (club || "").trim() || null,
        rayon_km: rayonKm ?? null,
        phone: (phone || "").trim() || null,
        address_home: addressHome || null,
        address_work: addressWork || null,
      };
      const { error } = await supabase.from("profiles").update(patch).eq("id", me.id);
      if (error) throw error;

      // Resynchroniser le snapshot initial (pour que isDirty repasse à false)
      const newSnap = {
        displayName: name,
        avatarUrl,
        niveau,
        main,
        cote,
        club: (club || "").trim(),
        rayonKm,
        phone: (phone || "").trim(),
        addressHome,
        addressWork,
      };
      setInitialSnap(newSnap);

      Alert.alert("Enregistré", "Profil mis à jour.");
      return true;
    } catch (e) {
      Alert.alert("Erreur", e?.message ?? String(e));
      return false;
    } finally {
      setSaving(false);
    }
  }, [me?.id, displayName, niveau, main, cote, club, rayonKm, phone, avatarUrl, addressHome, addressWork]);

  // Bouton Enregistrer : vérifie s'il y a des changements avant d'appeler onSave
  const onSavePress = useCallback(async () => {
    if (!isDirty) {
      Alert.alert("Aucune modification", "Tu n'as rien changé à enregistrer.");
      return;
    }
    await onSave();
  }, [isDirty, onSave]);

  // Upload avatar
  const pickAndUpload = useCallback(async () => {
    if (!me?.id) return;
    try {
      setUploading(true);
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission requise", "Autorise l'accès aux photos pour choisir un avatar.");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;

      const uri = res.assets[0].uri;
      const fr = await fetch(uri);
      const blob = await fr.blob();
      const arrayBuffer = blob.arrayBuffer ? await blob.arrayBuffer() : await new Response(blob).arrayBuffer();

      const ts = Date.now();
      const path = `${me.id}/avatar-${ts}.jpg`;
      const contentType = blob.type || "image/jpeg";

      const { error: upErr } = await supabase
        .storage
        .from("avatars")
        .upload(path, arrayBuffer, { contentType, upsert: true });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = pub?.publicUrl ?? null;
      if (!publicUrl) throw new Error("Impossible d'obtenir l'URL publique.");

      const { error: upProfileErr } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", me.id);
      if (upProfileErr) throw upProfileErr;

      setAvatarUrl(`${publicUrl}?t=${Date.now()}`);
      Alert.alert("OK", "Avatar mis à jour !");
    } catch (e) {
      Alert.alert("Erreur upload", e?.message ?? String(e));
    } finally {
      setUploading(false);
    }
  }, [me?.id]);

  const removeAvatar = useCallback(async () => {
    if (!me?.id || !avatarUrl) return;
    try {
      setUploading(true);
      const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", me.id);
      if (error) throw error;
      setAvatarUrl(null);
    } catch (e) {
      Alert.alert("Erreur", e?.message ?? String(e));
    } finally {
      setUploading(false);
    }
  }, [me?.id, avatarUrl]);

  // Helper de déconnexion
  const doSignOut = useCallback(async () => {
    try {
      // Déconnexion côté Supabase (session serveur)
      await supabase.auth.signOut();
    } catch (e) {
      Alert.alert("Erreur", e?.message ?? String(e));
    } finally {
      // Déconnexion côté client (token local) puis navigation vers l'auth
      try { await signOutCtx(); } catch {}
      try { router.replace("/(auth)/signin"); } catch {}
    }
  }, [signOutCtx]);

  // Déconnexion avec garde "modifs non enregistrées" (web-safe)
  const onLogout = useCallback(() => {
    // On web, React Native's Alert with multiple buttons is not reliable.
    if (Platform.OS === "web") {
      if (isDirty) {
        const saveThenLogout = window.confirm(
          "Tu as des modifications non enregistrées.\n\nVoulez-vous enregistrer avant de vous déconnecter ?"
        );
        if (saveThenLogout) {
          (async () => {
            const ok = await onSave();
            if (ok) await doSignOut();
          })();
        } else {
          const confirmLogout = window.confirm(
            "Se déconnecter sans enregistrer les modifications ?"
          );
          if (confirmLogout) {
            (async () => {
              await doSignOut();
            })();
          }
        }
      } else {
        const confirmLogout = window.confirm(
          "Tu vas être déconnecté de Padel Sync.\n\nConfirmer ?"
        );
        if (confirmLogout) {
          (async () => {
            await doSignOut();
          })();
        }
      }
      return;
    }

    // Native (iOS/Android) keeps the richer Alert buttons
    Alert.alert(
      isDirty ? "Déconnexion" : "Se déconnecter",
      isDirty
        ? "Tu as des modifications non enregistrées."
        : "Tu vas être déconnecté de Padel Sync.",
      isDirty
        ? [
            { text: "Annuler", style: "cancel" },
            {
              text: "Se déconnecter",
              style: "destructive",
              onPress: () => doSignOut(),
            },
            {
              text: "Enregistrer & se déconnecter",
              onPress: async () => {
                const ok = await onSave();
                if (ok) await doSignOut();
              },
            },
          ]
        : [
            { text: "Annuler", style: "cancel" },
            { text: "Oui, me déconnecter", style: "destructive", onPress: () => doSignOut() },
          ],
      { cancelable: true }
    );
  }, [isDirty, onSave, doSignOut]);

  // Suppression de compte avec confirmation
  const onDeleteAccount = useCallback(() => {
    // On web, React Native's Alert with multiple buttons is not reliable.
    if (Platform.OS === "web") {
      const confirmDelete = window.confirm(
        "⚠️ ATTENTION : Cette action est irréversible.\n\n" +
        "Toutes vos données seront définitivement supprimées :\n" +
        "- Votre profil\n" +
        "- Vos groupes et membres\n" +
        "- Vos matchs et disponibilités\n" +
        "- Toutes vos autres données\n\n" +
        "Êtes-vous absolument sûr(e) de vouloir supprimer votre compte ?"
      );
      if (confirmDelete) {
        const finalConfirm = window.confirm(
          "Dernière confirmation : Supprimer définitivement votre compte Padel Sync ?"
        );
        if (finalConfirm) {
          (async () => {
            try {
              const { error } = await supabase.rpc('delete_user_account');
              if (error) throw error;
              Alert.alert("Compte supprimé", "Votre compte a été supprimé avec succès.");
              await doSignOut();
            } catch (e) {
              Alert.alert("Erreur", e?.message ?? "Impossible de supprimer le compte. Veuillez réessayer.");
            }
          })();
        }
      }
      return;
    }

    // Native (iOS/Android) - première confirmation
    Alert.alert(
      "Supprimer mon compte",
      "⚠️ ATTENTION : Cette action est irréversible.\n\n" +
      "Toutes vos données seront définitivement supprimées :\n" +
      "- Votre profil\n" +
      "- Vos groupes et membres\n" +
      "- Vos matchs et disponibilités\n" +
      "- Toutes vos autres données\n\n" +
      "Êtes-vous absolument sûr(e) ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Oui, supprimer",
          style: "destructive",
          onPress: () => {
            // Deuxième confirmation
            Alert.alert(
              "Dernière confirmation",
              "Supprimer définitivement votre compte Padel Sync ?\n\nCette action ne peut pas être annulée.",
              [
                { text: "Annuler", style: "cancel" },
                {
                  text: "Oui, supprimer définitivement",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      const { error } = await supabase.rpc('delete_user_account');
                      if (error) throw error;
                      Alert.alert("Compte supprimé", "Votre compte a été supprimé avec succès.", [
                        { text: "OK", onPress: async () => await doSignOut() }
                      ]);
                    } catch (e) {
                      Alert.alert("Erreur", e?.message ?? "Impossible de supprimer le compte. Veuillez réessayer.");
                    }
                  },
                },
              ],
              { cancelable: true }
            );
          },
        },
      ],
      { cancelable: true }
    );
  }, [doSignOut]);

  const levelInfo = useMemo(() => levelMeta(Number(niveau) || 0), [niveau]);
  const initials = computeInitials(displayName || me?.email || "");

  if (loading) return <View style={s.center}><ActivityIndicator /></View>;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.select({ ios: "padding", android: undefined })}>
      <ScrollView
        contentContainerStyle={[s.container, { paddingBottom: Math.max(28, insets.bottom + 140) }]}
        scrollIndicatorInsets={{ bottom: Math.max(8, insets.bottom + 70) }}
        keyboardShouldPersistTaps="handled"
      >

        {/* Avatar */}
        <View style={s.avatarCard}>
          <View style={[s.avatarWrap, { position: 'relative', width: AVATAR, height: AVATAR }]}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={[s.avatar, { borderColor: colorForLevel(niveau) }]} />
            ) : (
              <View style={[s.avatar, s.avatarFallback, { borderColor: colorForLevel(niveau) }]}>
                <Text style={s.avatarInitial}>{initials}</Text>
              </View>
            )}

            {!!niveau && (
              <View
                style={{
                  position: 'absolute',
                  right: -4,
                  bottom: -4,
                  backgroundColor: colorForLevel(niveau), // fond = couleur du niveau
                  borderColor: colorForLevel(niveau),
                  borderWidth: 1,
                  borderRadius: 99,
                  minWidth: 40,
                  height: 40,
                  paddingHorizontal: 6,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                accessibilityLabel={`Niveau ${niveau}`}
              >
                <Text style={{ color: '#000000', fontWeight: '900', fontSize: 20, lineHeight: 24 }}>
                  {String(niveau)}
                </Text>
              </View>
            )}
          </View>
          <View style={s.avatarBtns}>
            <Pressable
              onPress={press("profile-avatar-pick", pickAndUpload)}
              disabled={uploading}
              style={[
                s.btn,
                uploading && { opacity: 0.6 },
                Platform.OS === "web" && { cursor: uploading ? "not-allowed" : "pointer" }
              ]}
            >
              <Text style={s.btnTxt}>{uploading ? "Envoi..." : "Changer l’avatar"}</Text>
            </Pressable>
            {avatarUrl ? (
              <Pressable
                onPress={press("profile-avatar-remove", removeAvatar)}
                disabled={uploading}
                style={[
                  s.btn,
                  s.btnGhost,
                  Platform.OS === "web" && { cursor: uploading ? "not-allowed" : "pointer" }
                ]}
              >
                <Text style={[s.btnTxt, s.btnGhostTxt]}>Supprimer</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Tiles d'informations du profil */}
        <View style={{ gap: 6, marginTop: 8 }}>
          {/* Ligne 1 : Pseudo à 100% */}
          <View style={[s.tile, s.tileFull]}>
            <View style={s.tileHeader}>
              <Text style={s.tileIcon}>👤</Text>
              <Text style={s.tileTitle}>Pseudo</Text>
            </View>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Ex. Seb Padel"
              autoCapitalize="words"
              style={s.tileInput}
              maxLength={60}
            />
          </View>

          {/* Ligne 2 : Niveau à 100% */}
          <View style={[s.tile, s.tileFull]}>
            <View style={s.tileHeader}>
              <Text style={s.tileIcon}>🔥</Text>
              <Text style={s.tileTitle}>Niveau</Text>
              <Pressable
                onPress={() => setNiveauInfoModalVisible(true)}
                style={{ 
                  marginLeft: 6, 
                  padding: 4,
                  backgroundColor: '#e0f2fe',
                  borderRadius: 12,
                  width: 24,
                  height: 24,
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Ionicons name="information-circle" size={16} color="#0284c7" />
              </Pressable>
            </View>
            <View style={s.levelRow}>
              {LEVELS.map((lv) => {
                const active = niveau === lv.v;
                return (
                  <Pressable
                    key={lv.v}
                    onPress={press(`level-${lv.v}`, () => setNiveau(lv.v))}
                    style={[
                      s.pill,
                      {
                        backgroundColor: lv.color,
                        borderColor: active ? '#dcff13' : 'transparent',
                        borderWidth: active ? 4 : 1,
                        transform: active ? [{ scale: 1.06 }] : [],
                      },
                      Platform.OS === 'web' && { cursor: 'pointer' },
                    ]}
                  >
                    <Text style={[s.pillTxt, { color: '#111827', fontWeight: active ? '900' : '800' }]}>{lv.v}</Text>
                  </Pressable>
                );
              })}
            </View>
            {niveau && levelInfo?.label && (
              <Text style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>
                {levelInfo.label}
              </Text>
            )}
          </View>

          {/* Ligne 3 : Classement à 100% */}
          <View style={[s.tile, s.tileFull]}>
            <View style={s.tileHeader}>
              <Text style={s.tileIcon}>🏆</Text>
              <Text style={s.tileTitle}>Classement</Text>
            </View>
            <TextInput
              value={classement}
              onChangeText={setClassement}
              placeholder="Ex. 500"
              keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
              style={s.tileInput}
              maxLength={6}
            />
          </View>

          {/* Ligne 4 : Main et Côté */}
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View style={[s.tile, s.tileHalf]}>
              <View style={s.tileHeader}>
                <Text style={s.tileIcon}>🖐️</Text>
                <Text style={s.tileTitle}>Main</Text>
              </View>
              <Pressable
                onPress={() => setMainPickerVisible(true)}
                style={[
                  s.tileInput,
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 4,
                  },
                  Platform.OS === 'web' && { cursor: 'pointer' }
                ]}
              >
                <Text style={{ fontSize: 14, color: main ? '#111827' : '#9ca3af' }}>
                  {main === "droite" ? "Droite" : main === "gauche" ? "Gauche" : "Sélectionner"}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#6b7280" />
              </Pressable>
            </View>

            <View style={[s.tile, s.tileHalf]}>
              <View style={s.tileHeader}>
                <Text style={s.tileIcon}>🎯</Text>
                <Text style={s.tileTitle}>Côté</Text>
              </View>
              <Pressable
                onPress={() => setCotePickerVisible(true)}
                style={[
                  s.tileInput,
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 4,
                  },
                  Platform.OS === 'web' && { cursor: 'pointer' }
                ]}
              >
                <Text style={{ fontSize: 14, color: cote ? '#111827' : '#9ca3af' }}>
                  {cote === "droite" ? "Droite" : cote === "gauche" ? "Gauche" : cote === "les_deux" ? "Les 2" : "Sélectionner"}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#6b7280" />
              </Pressable>
            </View>
          </View>

          {/* Ligne 4 : Club à 100% */}
          <View style={[s.tile, s.tileFull]}>
            <View style={s.tileHeader}>
              <Text style={s.tileIcon}>🏟️</Text>
              <Text style={s.tileTitle}>Club</Text>
            </View>
            <Pressable
              onPress={() => setClubPickerVisible(true)}
              style={[
                s.tileInput,
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 4,
                },
                Platform.OS === 'web' && { cursor: 'pointer' }
              ]}
            >
              <Text style={{ fontSize: 14, color: club ? '#111827' : '#9ca3af', flex: 1 }}>
                {club || "Sélectionner un club"}
              </Text>
              <Ionicons name="chevron-down" size={18} color="#6b7280" />
            </Pressable>
          </View>

          {/* Ligne 5 : Email à 100% */}
          <View style={[s.tile, s.tileFull]}>
            <View style={s.tileHeader}>
              <Text style={s.tileIcon}>✉️</Text>
              <Text style={s.tileTitle}>Email</Text>
            </View>
            <Text style={[s.tileValue, { color: '#9ca3af' }]}>{me?.email ?? '—'}</Text>
          </View>

          {/* Ligne 6 : Téléphone à 100% */}
          <View style={[s.tile, s.tileFull]}>
            <View style={s.tileHeader}>
              <Text style={s.tileIcon}>📞</Text>
              <Text style={s.tileTitle}>Téléphone</Text>
            </View>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="06 12 34 56 78"
              keyboardType="phone-pad"
              style={s.tileInput}
              maxLength={20}
            />
          </View>
        </View>

        {/* Ligne 7 : Adresses */}
        <View style={[s.card, { gap: 12, marginTop: 0, backgroundColor: 'transparent' }]}>
          <Text style={[s.label, { color: '#dcff13' }]}>📍 Adresses</Text>
          
          {/* Domicile */}
          <View style={{ marginTop: 8 }}>
            <Text style={[s.label, { fontSize: 16, marginBottom: 6, color: '#dcff13' }]}>🏠 Domicile</Text>
            <TextInput
              value={addressHomeInput}
              onChangeText={(text) => {
                setAddressHomeInput(text);
                searchAddress(text, setAddressHomeSuggestions);
              }}
              placeholder="Ex: 123 Rue de la Paix, 75001 Paris, France"
              style={s.input}
              autoCapitalize="words"
            />
            {addressHomeSuggestions.length > 0 && (
              <View style={{ marginTop: 4, backgroundColor: '#f9fafb', borderRadius: 8, maxHeight: 150 }}>
                <ScrollView nestedScrollEnabled>
                  {addressHomeSuggestions.map((sug, idx) => (
                    <Pressable
                      key={idx}
                      onPress={async () => {
                        setAddressHomeInput(sug.address);
                        setAddressHomeSuggestions([]);
                        setGeocodingHome(true);
                        const geocoded = await geocodeAddress(sug.address);
                        setGeocodingHome(false);
                        if (geocoded) {
                          setAddressHome(geocoded);
                        } else {
                          Alert.alert('Erreur', 'Impossible de géocoder cette adresse.');
                        }
                      }}
                      style={{
                        padding: 12,
                        borderBottomWidth: idx < addressHomeSuggestions.length - 1 ? 1 : 0,
                        borderBottomColor: '#e5e7eb',
                      }}
                    >
                      <Text style={{ fontSize: 14, color: '#111827' }}>{sug.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
            {geocodingHome && (
              <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator size="small" color={BRAND} />
                <Text style={{ fontSize: 12, color: '#6b7280' }}>Géocodage en cours...</Text>
              </View>
            )}
            {addressHome && (
              <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f0fdf4', padding: 8, borderRadius: 8 }}>
                <Text style={{ fontSize: 12, color: '#15803d', flex: 1 }}>✓ {addressHome.address}</Text>
                <Pressable
                  onPress={() => {
                    setAddressHome(null);
                    setAddressHomeInput("");
                  }}
                  style={{ padding: 4 }}
                >
                  <Ionicons name="close-circle" size={18} color="#dc2626" />
                </Pressable>
              </View>
            )}
          </View>

          {/* Travail */}
          <View style={{ marginTop: 12 }}>
            <Text style={[s.label, { fontSize: 16, marginBottom: 6, color: '#dcff13' }]}>💼 Travail</Text>
            <TextInput
              value={addressWorkInput}
              onChangeText={(text) => {
                setAddressWorkInput(text);
                searchAddress(text, setAddressWorkSuggestions);
              }}
              placeholder="Ex: 456 Avenue des Champs, 69001 Lyon, France"
              style={s.input}
              autoCapitalize="words"
            />
            {addressWorkSuggestions.length > 0 && (
              <View style={{ marginTop: 4, backgroundColor: '#f9fafb', borderRadius: 8, maxHeight: 150 }}>
                <ScrollView nestedScrollEnabled>
                  {addressWorkSuggestions.map((sug, idx) => (
                    <Pressable
                      key={idx}
                      onPress={async () => {
                        setAddressWorkInput(sug.address);
                        setAddressWorkSuggestions([]);
                        setGeocodingWork(true);
                        const geocoded = await geocodeAddress(sug.address);
                        setGeocodingWork(false);
                        if (geocoded) {
                          setAddressWork(geocoded);
                        } else {
                          Alert.alert('Erreur', 'Impossible de géocoder cette adresse.');
                        }
                      }}
                      style={{
                        padding: 12,
                        borderBottomWidth: idx < addressWorkSuggestions.length - 1 ? 1 : 0,
                        borderBottomColor: '#e5e7eb',
                      }}
                    >
                      <Text style={{ fontSize: 14, color: '#111827' }}>{sug.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
            {geocodingWork && (
              <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator size="small" color={BRAND} />
                <Text style={{ fontSize: 12, color: '#6b7280' }}>Géocodage en cours...</Text>
              </View>
            )}
            {addressWork && (
              <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f0fdf4', padding: 8, borderRadius: 8 }}>
                <Text style={{ fontSize: 12, color: '#15803d', flex: 1 }}>✓ {addressWork.address}</Text>
                <Pressable
                  onPress={() => {
                    setAddressWork(null);
                    setAddressWorkInput("");
                  }}
                  style={{ padding: 4 }}
                >
                  <Ionicons name="close-circle" size={18} color="#dc2626" />
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/* Ligne 8 : Rayon à 100% */}
        <View style={[s.tile, s.tileFull, { marginTop: 0 }]}>
          <View style={s.tileHeader}>
            <Text style={s.tileIcon}>📍</Text>
            <Text style={s.tileTitle}>Rayon de jeu possible</Text>
          </View>
          <View style={s.rayonRow}>
            {RAYONS.map((r) => {
              const active = rayonKm === r.v;
              return (
                <Pressable
                  key={r.v}
                  onPress={press(`rayon-${r.v}`, () => setRayonKm(r.v))}
                  style={[
                    s.pill,
                    active && { backgroundColor: "#eaf2ff", borderColor: BRAND },
                    Platform.OS === "web" && { cursor: "pointer" }
                  ]}
                >
                  <Text style={[s.pillTxt, active && { color: BRAND, fontWeight: "800" }]}>{r.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Enregistrer */}
        <Pressable
          onPress={press("profile-save", onSavePress)}
          disabled={saving || !isDirty}
          style={[
            s.btn,
            { backgroundColor: '#10b981' },
            { marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "center" },
            (saving || !isDirty) && { backgroundColor: "#9ca3af" }, // grisé si inactif
            Platform.OS === "web" && { cursor: saving || !isDirty ? "not-allowed" : "pointer" }
          ]}
        >
          <Ionicons
            name={saving ? "cloud-upload-outline" : "save-outline"}
            size={24}
            color="#fff"
            style={{ marginRight: 8 }}
          />
          <Text style={s.btnTxt}>{saving ? "Enregistrement..." : "Enregistrer"}</Text>
        </Pressable>

        {/* Déconnexion (garde modifs) */}
        <Pressable
          onPress={press("profile-logout", onLogout)}
          style={[
            s.btn,
            {
              backgroundColor: "#dc2626",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
            },
            Platform.OS === "web" && { cursor: "pointer" }
          ]}
        >
          <Ionicons name="log-out-outline" size={24} color="#fff" style={{ marginRight: 8 }} />
          <Text style={s.btnTxt}>Se déconnecter</Text>
        </Pressable>

        {/* Suppression de compte */}
        <Pressable
          onPress={press("profile-delete-account", onDeleteAccount)}
          style={[
            s.btn,
            {
              backgroundColor: "#991b1b",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 12,
            },
            Platform.OS === "web" && { cursor: "pointer" }
          ]}
        >
          <Ionicons name="trash-outline" size={24} color="#fff" style={{ marginRight: 8 }} />
          <Text style={s.btnTxt}>Supprimer mon compte</Text>
        </Pressable>

        {isDirty ? (
            <Text style={{ marginTop: 8, color: "#b45309", fontSize: 11 }}>
              ⚠️ Modifications non enregistrées
            </Text>
          ) : null}

        {/* Modal Info Niveaux */}
        <Modal
          visible={niveauInfoModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setNiveauInfoModalVisible(false);
            // Réinitialiser le zoom quand on ferme
            scale.value = 1;
            savedScale.value = 1;
          }}
        >
          <GestureHandlerRootView style={{ flex: 1 }}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <View style={{ backgroundColor: '#ffffff', borderRadius: 12, padding: 16, width: '100%', maxWidth: 600, maxHeight: '90%' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <Text style={{ fontWeight: '900', fontSize: 18, color: '#0b2240' }}>Niveaux de Padel 2025</Text>
                  <Pressable 
                    onPress={() => {
                      setNiveauInfoModalVisible(false);
                      // Réinitialiser le zoom quand on ferme
                      scale.value = 1;
                      savedScale.value = 1;
                    }} 
                    style={{ padding: 8 }}
                  >
                    <Ionicons name="close" size={24} color="#111827" />
                  </Pressable>
                </View>
                <ScrollView 
                  style={{ maxHeight: '80%' }} 
                  showsVerticalScrollIndicator={true}
                  showsHorizontalScrollIndicator={true}
                  contentContainerStyle={{ alignItems: 'flex-start', justifyContent: 'flex-start' }}
                  bouncesZoom={true}
                  maximumZoomScale={4}
                  minimumZoomScale={1}
                  scrollEventThrottle={16}
                >
                  <PinchGestureHandler onGestureEvent={pinchHandler}>
                    <Animated.View style={[{ overflow: 'hidden', borderRadius: 8 }, animatedStyle]}>
                      <Image
                        source={require('../../assets/images/niveaux_padel_2025.jpg')}
                        style={{ width: '100%', height: undefined, aspectRatio: 1, resizeMode: 'contain' }}
                      />
                    </Animated.View>
                  </PinchGestureHandler>
                </ScrollView>
              </View>
            </View>
          </GestureHandlerRootView>
        </Modal>

        {/* Modal Liste de choix pour Main */}
        <Modal
          visible={mainPickerVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setMainPickerVisible(false)}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
            onPress={() => setMainPickerVisible(false)}
          >
            <View style={{ backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 20 }}>
              <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#111827' }}>Sélectionner la main</Text>
              </View>
              <Pressable
                onPress={() => {
                  setMain("droite");
                  setMainPickerVisible(false);
                }}
                style={({ pressed }) => ({
                  paddingVertical: 16,
                  paddingHorizontal: 20,
                  backgroundColor: pressed ? '#f3f4f6' : main === "droite" ? '#e0f2fe' : '#ffffff',
                  borderBottomWidth: 1,
                  borderBottomColor: '#e5e7eb',
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 16, color: '#111827', fontWeight: main === "droite" ? '700' : '400' }}>
                    Droite
                  </Text>
                  {main === "droite" && <Ionicons name="checkmark" size={20} color="#0284c7" />}
                </View>
              </Pressable>
              <Pressable
                onPress={() => {
                  setMain("gauche");
                  setMainPickerVisible(false);
                }}
                style={({ pressed }) => ({
                  paddingVertical: 16,
                  paddingHorizontal: 20,
                  backgroundColor: pressed ? '#f3f4f6' : main === "gauche" ? '#e0f2fe' : '#ffffff',
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 16, color: '#111827', fontWeight: main === "gauche" ? '700' : '400' }}>
                    Gauche
                  </Text>
                  {main === "gauche" && <Ionicons name="checkmark" size={20} color="#0284c7" />}
                </View>
              </Pressable>
            </View>
          </Pressable>
        </Modal>

        {/* Modal Liste de choix pour Côté */}
        <Modal
          visible={cotePickerVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setCotePickerVisible(false)}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
            onPress={() => setCotePickerVisible(false)}
          >
            <View style={{ backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 20 }}>
              <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#111827' }}>Sélectionner le côté</Text>
              </View>
              <Pressable
                onPress={() => {
                  setCote("droite");
                  setCotePickerVisible(false);
                }}
                style={({ pressed }) => ({
                  paddingVertical: 16,
                  paddingHorizontal: 20,
                  backgroundColor: pressed ? '#f3f4f6' : cote === "droite" ? '#e0f2fe' : '#ffffff',
                  borderBottomWidth: 1,
                  borderBottomColor: '#e5e7eb',
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 16, color: '#111827', fontWeight: cote === "droite" ? '700' : '400' }}>
                    Droite
                  </Text>
                  {cote === "droite" && <Ionicons name="checkmark" size={20} color="#0284c7" />}
                </View>
              </Pressable>
              <Pressable
                onPress={() => {
                  setCote("gauche");
                  setCotePickerVisible(false);
                }}
                style={({ pressed }) => ({
                  paddingVertical: 16,
                  paddingHorizontal: 20,
                  backgroundColor: pressed ? '#f3f4f6' : cote === "gauche" ? '#e0f2fe' : '#ffffff',
                  borderBottomWidth: 1,
                  borderBottomColor: '#e5e7eb',
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 16, color: '#111827', fontWeight: cote === "gauche" ? '700' : '400' }}>
                    Gauche
                  </Text>
                  {cote === "gauche" && <Ionicons name="checkmark" size={20} color="#0284c7" />}
                </View>
              </Pressable>
              <Pressable
                onPress={() => {
                  setCote("les_deux");
                  setCotePickerVisible(false);
                }}
                style={({ pressed }) => ({
                  paddingVertical: 16,
                  paddingHorizontal: 20,
                  backgroundColor: pressed ? '#f3f4f6' : cote === "les_deux" ? '#e0f2fe' : '#ffffff',
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 16, color: '#111827', fontWeight: cote === "les_deux" ? '700' : '400' }}>
                    Les 2
                  </Text>
                  {cote === "les_deux" && <Ionicons name="checkmark" size={20} color="#0284c7" />}
                </View>
              </Pressable>
            </View>
          </Pressable>
        </Modal>

        {/* Modal Liste de choix pour Club */}
        <Modal
          visible={clubPickerVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setClubPickerVisible(false)}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
            onPress={() => setClubPickerVisible(false)}
          >
            <View style={{ backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 20, maxHeight: '80%' }}>
              <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#111827' }}>
                  Sélectionner un club
                </Text>
                {addressHome?.lat && addressHome?.lng && (
                  <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                    Triés par distance du domicile
                  </Text>
                )}
              </View>
              {loadingClubs ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#0284c7" />
                  <Text style={{ marginTop: 12, color: '#6b7280' }}>Chargement des clubs...</Text>
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 500 }}>
                  {clubsList.map((c, idx) => (
                    <Pressable
                      key={c.id || idx}
                      onPress={() => {
                        setClub(c.name);
                        setClubPickerVisible(false);
                      }}
                      style={({ pressed }) => ({
                        paddingVertical: 16,
                        paddingHorizontal: 20,
                        backgroundColor: pressed ? '#f3f4f6' : club === c.name ? '#e0f2fe' : '#ffffff',
                        borderBottomWidth: idx < clubsList.length - 1 ? 1 : 0,
                        borderBottomColor: '#e5e7eb',
                      })}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 16, color: '#111827', fontWeight: club === c.name ? '700' : '400' }}>
                            {c.name}
                          </Text>
                          {c.address && (
                            <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                              {c.address}
                            </Text>
                          )}
                          {c.distance !== undefined && c.distance !== Infinity && (
                            <Text style={{ fontSize: 12, color: '#0284c7', marginTop: 2 }}>
                              {c.distance} km
                            </Text>
                          )}
                        </View>
                        {club === c.name && <Ionicons name="checkmark" size={20} color="#0284c7" />}
                      </View>
                    </Pressable>
                  ))}
                  {clubsList.length === 0 && !loadingClubs && (
                    <View style={{ padding: 40, alignItems: 'center' }}>
                      <Text style={{ color: '#6b7280' }}>Aucun club disponible</Text>
                    </View>
                  )}
                </ScrollView>
              )}
            </View>
          </Pressable>
        </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SegBtn({ label, active, onPress }) {
  return (
    <Pressable
      onPress={press(`seg-${String(label).toLowerCase()}`, onPress)}
      style={[
        s.segmentBtn,
        active && { backgroundColor: "white", borderColor: "#e5e7eb", borderWidth: 1 },
        Platform.OS === "web" && { cursor: "pointer" }
      ]}
    >
      <Text style={[s.segmentTxt, active && { color: "#111827", fontWeight: "800" }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  container: { padding: 16, gap: 12, backgroundColor: "#001831" },

  title: { fontSize: 24, fontWeight: "800", color: BRAND, marginBottom: 6 },

  avatarCard: {
    backgroundColor: "transparent",
    borderWidth: 0, borderColor: "gold",
    borderRadius: 12, padding: 12, alignItems: "center",
  },
  avatarWrap: { alignItems: "center", justifyContent: "center" },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: "#f3f4f6", borderWidth: 5, borderColor: "gold" },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 36, fontWeight: "800", color: BRAND },

  avatarBtns: { marginTop: 10, flexDirection: "row", gap: 10 },

  card: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "gold", borderRadius: 12, padding: 12 },

  sectionTitle: { fontSize: 16, fontWeight: "800", color: "#111827" },

  label: { fontSize: 18, color: "#001831", fontWeight: "800" },
  value: { fontSize: 16, color: "#001831", marginTop: 4 },

  // Tiles
  tile: {
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
    borderRadius: 12,
    padding: 8,
  },
  tileFull: {
    width: '100%',
  },
  tileHalf: {
    flex: 1,
    minWidth: 0,
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  tileIcon: {
    fontSize: 18,
  },
  tileTitle: {
    fontSize: 14,
    color: "#dcff13",
    fontWeight: "700",
  },
  tileInput: {
    marginTop: 2,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#f9fafb",
  },
  tileValue: {
    fontSize: 14,
    color: "#001831",
    marginTop: 2,
  },

  input: {
    marginTop: 6,
    borderWidth: 1, borderColor: "#d1d5db",
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: "#111827", backgroundColor: "#f9fafb",
  },

  // boutons
  btn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, backgroundColor: BRAND, alignItems: "center" },
  btnTxt: { color: "white", fontWeight: "900", fontSize: 12 },
  btnSm: { paddingVertical: 8, paddingHorizontal: 10 },
  btnTxtSm: { fontSize: 16 },
  btnGhost: { backgroundColor: "#f3f4f6" },
  btnGhostTxt: { color: "#111827" },

  // Segmented
  segment: { flexDirection: "row", backgroundColor: "#f3f4f6", borderRadius: 10, padding: 4, gap: 4 },
  segmentBtn: { flex: 1, paddingVertical: 4, alignItems: "center", borderRadius: 8 },
  segmentTxt: { fontWeight: "800", color: "#6b7280", fontSize: 16 },

  // Pills rows
  levelRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  rayonRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  pill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: "#e5e7eb", alignItems: 'center', justifyContent: 'center' },
  pillTxt: { fontWeight: "800", color: "#374151", fontSize: 14, textAlign: 'center' },
});