// app/(tabs)/profil.js
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { OnboardingModal } from "../../components/OnboardingModal";
import { useAuth } from "../../context/auth";
import { hasAvailabilityForGroup } from "../../lib/availabilityCheck";
import { isProfileComplete } from "../../lib/profileCheck";
import { useIsSuperAdmin, useUserRole } from "../../lib/roles";
import { supabase } from "../../lib/supabase";
import { computeInitials, press } from "../../lib/uiSafe";
import { usePlayerBadges, PlayerBadge } from "../../hooks/usePlayerBadges";
import { usePlayerRating } from "../../hooks/usePlayerRating";

// Détecter si on est en Expo Go (où Worklets peut avoir des problèmes de version)
const isExpoGo = Constants.executionEnvironment === 'storeClient';

// Imports conditionnels pour éviter les erreurs Worklets en Expo Go
let Gesture, GestureDetector, GestureHandlerRootView;
let Animated, useAnimatedStyle, useSharedValue, withTiming;

try {
  const gestureHandler = require('react-native-gesture-handler');
  Gesture = gestureHandler.Gesture;
  GestureDetector = gestureHandler.GestureDetector;
  GestureHandlerRootView = gestureHandler.GestureHandlerRootView;
  
  const reanimated = require('react-native-reanimated');
  Animated = reanimated.default;
  useAnimatedStyle = reanimated.useAnimatedStyle;
  useSharedValue = reanimated.useSharedValue;
  withTiming = reanimated.withTiming;
} catch (e) {
  console.warn('[Profil] Erreur lors du chargement des modules de gestes:', e);
  // Fallback: créer des composants vides
  GestureDetector = ({ children, gesture }) => children;
  GestureHandlerRootView = ({ children, style }) => <View style={style}>{children}</View>;
  Animated = { View: View };
  useAnimatedStyle = () => ({});
  useSharedValue = (val) => ({ value: val });
  withTiming = (val) => val;
  Gesture = { Pinch: () => ({ onUpdate: () => {}, onEnd: () => {} }), Pan: () => ({ onUpdate: () => {}, onEnd: () => {} }), Simultaneous: (...args) => null };
}

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
  
  // Rôles
  const isSuperAdmin = useIsSuperAdmin();
  const { role, clubId } = useUserRole();

  const [me, setMe] = useState(null); // { id, email }
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(null);

  // champs profil
  const [niveau, setNiveau] = useState(null); // 1..8
  const [main, setMain] = useState(null);     // "droite" | "gauche"
  const [cote, setCote] = useState(null);     // "droite" | "gauche" | "les_deux"
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

  // classement (facultatif)
  const [classement, setClassement] = useState("");
  const [niveauInfoModalVisible, setNiveauInfoModalVisible] = useState(false);
  const [mainPickerVisible, setMainPickerVisible] = useState(false);
  const [cotePickerVisible, setCotePickerVisible] = useState(false);
  const [clubPickerVisible, setClubPickerVisible] = useState(false);
  const [clubsList, setClubsList] = useState([]);
  const [loadingClubs, setLoadingClubs] = useState(false);
  
  // États pour les popups d'onboarding
  const [incompleteProfileModalVisible, setIncompleteProfileModalVisible] = useState(false);
  
  // Refs pour la recherche d'adresse (debouncing et annulation)
  const debounceTimerHome = useRef(null);
  const debounceTimerWork = useRef(null);
  const abortControllerHome = useRef(null);
  const abortControllerWork = useRef(null);
  
  // Cache pour les suggestions d'adresse (Map<query, {suggestions, timestamp}>)
  const addressCache = useRef(new Map());
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  const CACHE_MAX_SIZE = 50;
  
  // Zoom et pan pour l'image des niveaux (désactivé en Expo Go à cause des problèmes Worklets)
  const gesturesEnabled = !isExpoGo && Gesture && typeof Gesture.Pinch === 'function' && typeof Gesture.Pan === 'function' && Animated;
  
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  
  const pinchGesture = gesturesEnabled && Gesture.Pinch ? (() => {
    try {
      const gesture = Gesture.Pinch();
      if (!gesture || typeof gesture.onUpdate !== 'function' || typeof gesture.onEnd !== 'function') {
        console.warn('[Profil] Gesture.Pinch() a retourné un objet invalide');
        return null;
      }
      return gesture
        .onUpdate((event) => {
          scale.value = Math.max(1, Math.min(savedScale.value * event.scale, 4));
        })
        .onEnd(() => {
          savedScale.value = scale.value;
          if (scale.value < 1) {
            scale.value = withTiming(1);
            savedScale.value = 1;
            translateX.value = withTiming(0);
            translateY.value = withTiming(0);
            savedTranslateX.value = 0;
            savedTranslateY.value = 0;
          }
        });
    } catch (e) {
      console.warn('[Profil] Erreur lors de la création du gesture Pinch:', e);
      return null;
    }
  })() : null;

  const panGesture = gesturesEnabled && Gesture.Pan ? (() => {
    try {
      const gesture = Gesture.Pan();
      if (!gesture || typeof gesture.onUpdate !== 'function' || typeof gesture.onEnd !== 'function') {
        console.warn('[Profil] Gesture.Pan() a retourné un objet invalide');
        return null;
      }
      return gesture
        .onUpdate((event) => {
          if (scale.value > 1) {
            translateX.value = savedTranslateX.value + event.translationX;
            translateY.value = savedTranslateY.value + event.translationY;
          }
        })
        .onEnd(() => {
          savedTranslateX.value = translateX.value;
          savedTranslateY.value = translateY.value;
        });
    } catch (e) {
      console.warn('[Profil] Erreur lors de la création du gesture Pan:', e);
      return null;
    }
  })() : null;

  const composedGesture = gesturesEnabled && pinchGesture && panGesture && typeof Gesture.Simultaneous === 'function'
    ? (() => {
        try {
          return Gesture.Simultaneous(pinchGesture, panGesture);
        } catch (e) {
          console.warn('[Profil] Erreur lors de la création du gesture composé:', e);
          return null;
        }
      })()
    : null;
  
  const animatedStyle = gesturesEnabled ? useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    };
  }) : {};

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
      console.error('[Profil] Erreur chargement clubs:', {
        message: e?.message,
        code: e?.code,
        details: e?.details,
        hint: e?.hint,
        stack: e?.stack,
      });
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
          .select("display_name, name, avatar_url, niveau, main, cote, club, rayon_km, phone, address_home, address_work, classement")
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
          classement: p?.classement ?? "",
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
          setClassement(init.classement);
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

  // Afficher la popup si le profil est incomplet (une seule fois par session)
  const [hasShownIncompleteModal, setHasShownIncompleteModal] = useState(false);
  
  // Nettoyer les timers et requêtes lors du démontage
  useEffect(() => {
    return () => {
      // Annuler les timers de debouncing
      if (debounceTimerHome.current) {
        clearTimeout(debounceTimerHome.current);
      }
      if (debounceTimerWork.current) {
        clearTimeout(debounceTimerWork.current);
      }
      // Annuler les requêtes en cours
      if (abortControllerHome.current) {
        abortControllerHome.current.abort();
      }
      if (abortControllerWork.current) {
        abortControllerWork.current.abort();
      }
    };
  }, []);
  
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      (async () => {
        if (!me?.id || loading || hasShownIncompleteModal) return;
        
        try {
          const complete = await isProfileComplete(me.id);
          if (mounted && !complete && !hasShownIncompleteModal) {
            // Afficher la popup si le profil est incomplet
            setIncompleteProfileModalVisible(true);
            setHasShownIncompleteModal(true);
          }
        } catch (e) {
          console.warn('[Profil] Error checking profile completeness:', e);
        }
      })();
      return () => { mounted = false; };
    }, [me?.id, loading, hasShownIncompleteModal])
  );

  // Recherche d'adresse avec l'API adresse.data.gouv.fr
  const searchAddressAdresseDataGouv = useCallback(async (query, signal) => {
    try {
      const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`;
      const res = await fetch(url, {
        signal,
        headers: {
          'Accept': 'application/json'
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data || !data.features) return [];
      
      return data.features.map(feature => {
        const props = feature.properties;
        const coords = feature.geometry.coordinates; // [lng, lat]
        // Formater l'adresse : "Numéro rue, Code postal Ville"
        const formattedAddress = props.label || `${props.name || ''}, ${props.postcode || ''} ${props.city || ''}`.trim();
        return {
          name: formattedAddress,
          lat: coords[1],
          lng: coords[0],
          address: formattedAddress,
        };
      });
    } catch (e) {
      if (e.name === 'AbortError') {
        throw e; // Re-lancer pour que le gestionnaire sache que c'est une annulation
      }
      console.warn('[Profile] adresse.data.gouv.fr error:', e);
      return null; // Retourner null pour indiquer l'échec
    }
  }, []);

  // Recherche d'adresse avec Nominatim (fallback)
  const searchAddressNominatim = useCallback(async (query, signal) => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=fr&accept-language=fr`;
      const res = await fetch(url, {
        signal,
        headers: {
          'User-Agent': 'PadelSync-Profile/1.0'
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return (data || []).map(item => ({
        name: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        address: item.display_name,
      }));
    } catch (e) {
      if (e.name === 'AbortError') {
        throw e;
      }
      console.warn('[Profile] Nominatim error:', e);
      return [];
    }
  }, []);

  // Recherche d'adresse avec autocomplétion (debouncing, cache, API principale + fallback)
  const searchAddress = useCallback(async (query, setSuggestions, isHome = true) => {
    const trimmedQuery = (query || '').trim();
    
    // Réinitialiser les suggestions si la requête est trop courte
    if (trimmedQuery.length < 3) {
      setSuggestions([]);
      return;
    }

    // Vérifier le cache
    const cacheKey = trimmedQuery.toLowerCase();
    const cached = addressCache.current.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      setSuggestions(cached.suggestions);
      return;
    }

    // Annuler la requête précédente si elle existe
    const abortController = isHome ? abortControllerHome : abortControllerWork;
    if (abortController.current) {
      abortController.current.abort();
    }
    abortController.current = new AbortController();
    const signal = abortController.current.signal;

    try {
      // Essayer d'abord avec adresse.data.gouv.fr
      let suggestions = await searchAddressAdresseDataGouv(trimmedQuery, signal);
      
      // Si échec ou résultat vide, fallback sur Nominatim
      if (!suggestions || suggestions.length === 0) {
        suggestions = await searchAddressNominatim(trimmedQuery, signal);
      }

      // Mettre en cache si on a des résultats
      if (suggestions && suggestions.length > 0) {
        // Nettoyer le cache si trop grand
        if (addressCache.current.size >= CACHE_MAX_SIZE) {
          const firstKey = addressCache.current.keys().next().value;
          addressCache.current.delete(firstKey);
        }
        addressCache.current.set(cacheKey, {
          suggestions,
          timestamp: Date.now()
        });
        setSuggestions(suggestions);
      } else {
        setSuggestions([]);
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        // Requête annulée, ne rien faire
        return;
      }
      console.warn('[Profile] address search error:', e);
      setSuggestions([]);
    }
  }, [searchAddressAdresseDataGouv, searchAddressNominatim]);

  // Géocoder une adresse complète (utilise adresse.data.gouv.fr en priorité, puis Nominatim)
  const geocodeAddress = useCallback(async (address) => {
    if (!address || !address.trim()) return null;
    const trimmedAddress = address.trim();
    
    try {
      // Essayer d'abord avec adresse.data.gouv.fr
      const urlAdresse = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(trimmedAddress)}&limit=1`;
      const resAdresse = await fetch(urlAdresse, {
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (resAdresse.ok) {
        const dataAdresse = await resAdresse.json();
        if (dataAdresse && dataAdresse.features && dataAdresse.features.length > 0) {
          const feature = dataAdresse.features[0];
          const coords = feature.geometry.coordinates; // [lng, lat]
          const lat = coords[1];
          const lng = coords[0];
          const props = feature.properties;
          const formattedAddress = props.label || trimmedAddress;
          
          // Vérifier que c'est bien en France (tolérant pour DOM-TOM)
          if (lat >= 38 && lat <= 54 && lng >= -10 && lng <= 15) {
            return {
              address: formattedAddress,
              lat,
              lng,
            };
          }
        }
      }
      
      // Fallback sur Nominatim
      const urlNominatim = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmedAddress)}&limit=1&countrycodes=fr&accept-language=fr`;
      const resNominatim = await fetch(urlNominatim, {
        headers: {
          'User-Agent': 'PadelSync-Profile/1.0'
        }
      });
      const dataNominatim = await resNominatim.json();
      if (dataNominatim && dataNominatim.length > 0) {
        const result = dataNominatim[0];
        const lat = parseFloat(result.lat);
        const lng = parseFloat(result.lon);
        // Vérifier que c'est bien en France (tolérant pour DOM-TOM)
        if (lat >= 38 && lat <= 54 && lng >= -10 && lng <= 15) {
          return {
            address: trimmedAddress,
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
      classement,
    };
    try {
      return JSON.stringify(cur) !== JSON.stringify(initialSnap);
    } catch {
      return true;
    }
  }, [initialSnap, displayName, avatarUrl, niveau, main, cote, club, rayonKm, phone, addressHome, addressWork, classement]);

  // Sauvegarde du profil (fonction principale)
  const onSave = useCallback(async () => {
    if (!me?.id) return false;
    const name = (displayName || "").trim();
    if (!name) { Alert.alert("Champ obligatoire", "Merci de renseigner un nom public."); return false; }
    
    // Vérifier que tous les champs sont remplis
    if (!niveau) { Alert.alert("Champ obligatoire", "Merci de sélectionner votre niveau."); return false; }
    if (!main) { Alert.alert("Champ obligatoire", "Merci de sélectionner votre main (droite ou gauche)."); return false; }
    if (!cote) { Alert.alert("Champ obligatoire", "Merci de sélectionner votre côté (droite, gauche ou les deux)."); return false; }
    // Club favori est facultatif
    const clubTrimmed = (club || "").trim() || null;
    // Téléphone est facultatif
    const phoneTrimmed = (phone || "").trim() || null;
    if (!addressHome || !addressHome.address) { Alert.alert("Champ obligatoire", "Merci de renseigner votre adresse de domicile."); return false; }
    // Adresse travail est facultative
    if (rayonKm === null || rayonKm === undefined) { Alert.alert("Champ obligatoire", "Merci de sélectionner votre rayon de jeu possible."); return false; }

    try {
      setSaving(true);
      const patch = {
        display_name: name,
        niveau: niveau,
        main: main,
        cote: cote,
        club: clubTrimmed,
        rayon_km: rayonKm,
        phone: phoneTrimmed,
        address_home: addressHome,
        address_work: addressWork,
        classement: (classement || "").trim() || null,
      };
      const { error } = await supabase.from("profiles").update(patch).eq("id", me.id);
      if (error) throw error;

      // Resynchroniser le snapshot initial (pour que isDirty repasse à false)
      const newSnap = {
        displayName: name,
        avatarUrl,
        niveau: niveau,
        main: main,
        cote: cote,
        club: clubTrimmed,
        rayonKm: rayonKm,
        phone: phoneTrimmed,
        addressHome: addressHome,
        addressWork: addressWork,
        classement: (classement || "").trim(),
      };
      setInitialSnap(newSnap);

      Alert.alert("Enregistré", "Profil mis à jour.");
      
      // Après sauvegarde, vérifier groupe et dispos puis rediriger
      try {
        const savedGroupId = await AsyncStorage.getItem("active_group_id");
        
        if (savedGroupId) {
          // Groupe existe, vérifier les disponibilités
          const hasAvail = await hasAvailabilityForGroup(me.id, savedGroupId);
          if (hasAvail) {
            router.replace("/(tabs)/matches");
          } else {
            router.replace("/(tabs)/semaine");
          }
        } else {
          // Pas de groupe, rediriger vers groupes
          router.replace("/(tabs)/groupes");
        }
      } catch (e) {
        console.warn('[Profil] Error checking group/availability after save:', e);
        // En cas d'erreur, rediriger vers l'index qui fera la vérification
        router.replace("/");
      }
      
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
      const pickerMediaTypes = ImagePicker?.MediaType?.IMAGES
        ? { mediaTypes: [ImagePicker.MediaType.IMAGES] }
        : { mediaTypes: ImagePicker?.MediaTypeOptions?.Images };

      const res = await ImagePicker.launchImageLibraryAsync({
        ...pickerMediaTypes,
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

  // Badges et rating
  const { featuredRare, featuredRecent, unlockedCount, totalAvailable, isLoading: badgesLoading, error: badgesError } = usePlayerBadges(me?.id);
  const { level, xp, isLoading: ratingLoading } = usePlayerRating(me?.id);

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
        <View style={{ marginTop: 8 }}>
          {/* Ligne 1 : Pseudo à 100% */}
          <View style={[s.tile, s.tileFull]}>
            <View style={s.tileHeader}>
              <Text style={s.tileIcon}>👤</Text>
              <Text style={s.tileTitle}>Pseudo <Text style={{ color: '#dc2626' }}>*</Text></Text>
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

          {/* Ligne 2 : Adresses */}
          <View style={[s.card, { gap: 12, marginTop: 0, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 8 }]}>
            <Text style={[s.label, { color: '#001833' }]}>📍 Adresses</Text>
            <Text style={{ fontSize: 14, fontWeight: '400', color: '#001833', marginTop: 2 }}>(pour trouver des matchs à proximité)</Text>
            
            {/* Domicile */}
            <View style={{ marginTop: 8 }}>
              <Text style={[s.label, { fontSize: 16, marginBottom: 6, color: '#001833' }]}>🏠 Domicile <Text style={{ color: '#dc2626' }}>*</Text></Text>
              <TextInput
                value={addressHomeInput}
                onChangeText={(text) => {
                  setAddressHomeInput(text);
                  
                  // Annuler le timer précédent
                  if (debounceTimerHome.current) {
                    clearTimeout(debounceTimerHome.current);
                  }
                  
                  // Réinitialiser les suggestions immédiatement si la requête est trop courte
                  if (text.trim().length < 3) {
                    setAddressHomeSuggestions([]);
                    return;
                  }
                  
                  // Debouncing : attendre 400ms après la dernière frappe
                  debounceTimerHome.current = setTimeout(() => {
                    searchAddress(text, setAddressHomeSuggestions, true);
                  }, 400);
                }}
                placeholder="Ex: 123 Rue de la Paix, 75001 Paris"
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
                        <Text style={{ fontSize: 14, color: '#111827', fontWeight: '500' }}>{sug.name}</Text>
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
                <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
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
              <Text style={[s.label, { fontSize: 16, marginBottom: 6, color: '#001833' }]}>💼 Travail</Text>
              <TextInput
                value={addressWorkInput}
                onChangeText={(text) => {
                  setAddressWorkInput(text);
                  
                  // Annuler le timer précédent
                  if (debounceTimerWork.current) {
                    clearTimeout(debounceTimerWork.current);
                  }
                  
                  // Réinitialiser les suggestions immédiatement si la requête est trop courte
                  if (text.trim().length < 3) {
                    setAddressWorkSuggestions([]);
                    return;
                  }
                  
                  // Debouncing : attendre 400ms après la dernière frappe
                  debounceTimerWork.current = setTimeout(() => {
                    searchAddress(text, setAddressWorkSuggestions, false);
                  }, 400);
                }}
                placeholder="Ex: 456 Avenue des Champs, 69001 Lyon"
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
                        <Text style={{ fontSize: 14, color: '#111827', fontWeight: '500' }}>{sug.name}</Text>
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
                <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
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

          {/* Ligne 3 : Niveau à 100% */}
          <View style={[s.tile, s.tileFull]}>
            <View style={s.tileHeader}>
              <Text style={s.tileIcon}>🔥</Text>
              <Text style={s.tileTitle}>Niveau <Text style={{ color: '#dc2626' }}>*</Text></Text>
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

          {/* Section Badges */}
          <View style={[s.tile, s.tileFull]}>
            <View style={s.tileHeader}>
              <Text style={s.tileIcon}>🏅</Text>
              <Text style={s.tileTitle}>
                {badgesLoading ? 'Chargement...' : `Trophées : ${unlockedCount}/${totalAvailable}`}
              </Text>
              {!badgesLoading && me?.id && (
                <Pressable
                  onPress={() => router.push(`/profiles/${me.id}/trophies`)}
                  style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 }}
                >
                  <Text style={{ fontSize: 12, color: BRAND, fontWeight: '600' }}>Voir tous</Text>
                  <Ionicons name="chevron-forward" size={14} color={BRAND} />
                </Pressable>
              )}
            </View>
            
            {badgesLoading ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={BRAND} />
              </View>
            ) : badgesError ? (
              <Text style={{ fontSize: 12, color: '#ef4444', textAlign: 'center', marginTop: 8 }}>
                Erreur : {badgesError}
              </Text>
            ) : (
              <>
                {/* Badges rares */}
                {featuredRare.length > 0 && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>Rares</Text>
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                      {featuredRare.slice(0, 3).map((badge) => (
                        <BadgeIcon key={badge.id} badge={badge} size={40} />
                      ))}
                    </View>
                  </View>
                )}

                {/* Badges récents */}
                {featuredRecent.length > 0 && (
                  <View style={{ marginTop: featuredRare.length > 0 ? 12 : 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>Récents</Text>
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                      {featuredRecent.slice(0, 3).map((badge) => (
                        <BadgeIcon key={badge.id} badge={badge} size={40} />
                      ))}
                    </View>
                  </View>
                )}

                {unlockedCount === 0 && totalAvailable > 0 && (
                  <Text style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 8, fontStyle: 'italic' }}>
                    Aucun badge débloqué pour le moment
                  </Text>
                )}
                {totalAvailable === 0 && (
                  <Text style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 8, fontStyle: 'italic' }}>
                    Aucun badge disponible
                  </Text>
                )}
              </>
            )}
          </View>

          {/* Ligne 4 : Main et Côté */}
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View style={[s.tile, s.tileHalf]}>
              <View style={s.tileHeader}>
                <Text style={s.tileIcon}>🖐️</Text>
                <Text style={s.tileTitle}>Main <Text style={{ color: '#dc2626' }}>*</Text></Text>
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
                <Text style={s.tileTitle}>Côté <Text style={{ color: '#dc2626' }}>*</Text></Text>
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

          {/* Ligne 4 : Club favori à 100% */}
          <View style={[s.tile, s.tileFull]}>
            <View style={s.tileHeader}>
              <Text style={s.tileIcon}>🏟️</Text>
              <Text style={s.tileTitle}>Club favori</Text>
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
                {club || "Sélectionner un club favori"}
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

        {/* Ligne 8 : Rayon à 100% */}
        <View style={[s.tile, s.tileFull]}>
          <View style={s.tileHeader}>
            <Text style={s.tileIcon}>🚗</Text>
            <Text style={s.tileTitle}>Rayon de jeu possible <Text style={{ color: '#dc2626' }}>*</Text></Text>
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
                    active && { backgroundColor: "#dcff13", borderColor: BRAND },
                    Platform.OS === "web" && { cursor: "pointer" }
                  ]}
                >
                  <Text style={[s.pillTxt, { color: active ? '#111827' : '#9ca3af', fontWeight: active ? "800" : "600" }]}>{r.label}</Text>
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

        {/* Affichage du rôle actuel */}
        {(isSuperAdmin || role) && (
          <View style={[s.card, { marginBottom: 12 }]}>
            <Text style={[s.sectionTitle, { marginBottom: 8 }]}>Rôle actuel</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 12,
                backgroundColor: role === 'super_admin' ? '#fce7f3' :
                                 role === 'admin' ? '#dbeafe' :
                                 role === 'club_manager' ? '#fef3c7' : '#e5e7eb'
              }}>
                <Text style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: '#374151'
                }}>
                  {role === 'super_admin' ? '👑 Super Admin' :
                   role === 'admin' ? '🔧 Admin' :
                   role === 'club_manager' ? '🏢 Club Manager' :
                   '👤 Joueur'}
                </Text>
              </View>
              {clubId && (
                <Text style={{ fontSize: 12, color: '#6b7280' }}>
                  Club ID: {clubId.substring(0, 8)}...
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Bouton gestion de club (club_manager uniquement) */}
        {role === 'club_manager' && clubId && (
          <Pressable
            onPress={() => router.push(`/clubs/${clubId}/manage`)}
            style={[
              s.btn,
              {
                backgroundColor: "#fbbf24",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
              },
              Platform.OS === "web" && { cursor: "pointer" }
            ]}
          >
            <Ionicons name="business-outline" size={24} color="#001831" style={{ marginRight: 8 }} />
            <Text style={[s.btnTxt, { color: '#001831' }]}>Gérer mon club</Text>
          </Pressable>
        )}

        {/* Bouton gestion des rôles (super_admin uniquement) */}
        {isSuperAdmin && (
          <Pressable
            onPress={() => router.push('/admin/roles')}
            style={[
              s.btn,
              {
                backgroundColor: "#7c3aed",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
              },
              Platform.OS === "web" && { cursor: "pointer" }
            ]}
          >
            <Ionicons name="shield-checkmark-outline" size={24} color="#fff" style={{ marginRight: 8 }} />
            <Text style={s.btnTxt}>Gestion des rôles</Text>
          </Pressable>
        )}

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
            // Réinitialiser le zoom et la position quand on ferme
            scale.value = 1;
            savedScale.value = 1;
            translateX.value = 0;
            translateY.value = 0;
            savedTranslateX.value = 0;
            savedTranslateY.value = 0;
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
                      // Réinitialiser le zoom et la position quand on ferme
                      if (gesturesEnabled) {
                        scale.value = 1;
                        savedScale.value = 1;
                        translateX.value = 0;
                        translateY.value = 0;
                        savedTranslateX.value = 0;
                        savedTranslateY.value = 0;
                      }
                    }} 
                    style={{ padding: 8 }}
                  >
                    <Ionicons name="close" size={24} color="#111827" />
                  </Pressable>
                </View>
                <View style={{ maxHeight: '80%', overflow: 'hidden', borderRadius: 8 }}>
                  {gesturesEnabled && composedGesture ? (
                    <GestureDetector gesture={composedGesture}>
                      <Animated.View style={[{ overflow: 'visible' }, animatedStyle]}>
                        <Image
                          source={require('../../assets/images/niveaux_padel_2025.jpg')}
                          style={{ width: '100%', height: undefined, aspectRatio: 1, resizeMode: 'contain' }}
                        />
                      </Animated.View>
                    </GestureDetector>
                  ) : (
                    <ScrollView 
                      maximumZoomScale={4} 
                      minimumZoomScale={1} 
                      showsHorizontalScrollIndicator={false}
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={{ alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Image
                        source={require('../../assets/images/niveaux_padel_2025.jpg')}
                        style={{ width: '100%', height: undefined, aspectRatio: 1, resizeMode: 'contain' }}
                      />
                    </ScrollView>
                  )}
                </View>
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

        {/* Modal Liste de choix pour Club favori */}
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
                  Sélectionner un club favori
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

        {/* Popup profil incomplet */}
        <OnboardingModal
          visible={incompleteProfileModalVisible}
          message="complète ton profil pour commencer à utiliser l'app"
          onClose={() => setIncompleteProfileModalVisible(false)}
        />

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

function BadgeIcon({ badge, size = 40 }) {
  const getBadgeIcon = (category) => {
    switch (category) {
      case 'volume': return 'trophy';
      case 'performance': return 'flame';
      case 'social': return 'people';
      case 'club': return 'business';
      case 'bar': return 'wine';
      default: return 'star';
    }
  };

  const getBadgeColor = (category) => {
    switch (category) {
      case 'volume': return '#fbbf24';
      case 'performance': return '#ef4444';
      case 'social': return '#3b82f6';
      case 'club': return '#8b5cf6';
      case 'bar': return '#ec4899';
      default: return '#6b7280';
    }
  };

  const iconName = getBadgeIcon(badge.category);
  const iconColor = badge.unlocked ? getBadgeColor(badge.category) : '#d1d5db';
  const opacity = badge.unlocked ? 1 : 0.4;

  return (
    <View style={{ 
      width: size, 
      height: size, 
      borderRadius: size / 2, 
      backgroundColor: '#f3f4f6', 
      alignItems: 'center', 
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: '#e5e7eb',
      position: 'relative',
      opacity
    }}>
      <Ionicons name={iconName} size={size * 0.6} color={iconColor} />
      {badge.unlocked && badge.rarityScore && badge.rarityScore > 50 && (
        <View style={{
          position: 'absolute',
          top: -4,
          right: -4,
          backgroundColor: '#fff',
          borderRadius: 8,
          padding: 2,
          borderWidth: 1,
          borderColor: '#fbbf24',
        }}>
          <Ionicons name="sparkles" size={10} color="#fbbf24" />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  container: { padding: 16, gap: 12, backgroundColor: "#001831" },

  title: { fontSize: 24, fontWeight: "800", color: BRAND, marginBottom: 6 },

  avatarCard: {
    backgroundColor: "transparent",
    borderWidth: 0, borderColor: "transparent",
    borderRadius: 12, padding: 12, alignItems: "center",
    marginBottom: 8,
  },
  avatarWrap: { alignItems: "center", justifyContent: "center" },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: "#f3f4f6", borderWidth: 5, borderColor: "gold" },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 36, fontWeight: "800", color: BRAND },

  avatarBtns: { marginTop: 10, flexDirection: "row", gap: 10 },

  card: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "gold", borderRadius: 12, padding: 12 },

  sectionTitle: { fontSize: 16, fontWeight: "800", color: "#001833" },

  label: { fontSize: 18, color: "#001833", fontWeight: "800" },
  value: { fontSize: 16, color: "#001831", marginTop: 4 },

  // Tiles
  tile: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    minWidth: 0,
    width: '100%',
    marginBottom: 8,
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
    flexWrap: 'wrap',
    width: '100%',
    minWidth: 0,
  },
  tileIcon: {
    fontSize: 22,
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    flexShrink: 0,
  },
  tileTitle: {
    fontSize: 16,
    color: "#001833",
    fontWeight: "700",
    textTransform: 'uppercase',
    flexShrink: 1,
    flexWrap: 'wrap',
    flex: 1,
    minWidth: 0,
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
  btnTxt: { color: "white", fontWeight: "900", fontSize: 16 },
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
  pillTxt: { fontWeight: "800", color: "#374151", fontSize: 12, textAlign: 'center' },
});