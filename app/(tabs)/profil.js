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
import OnFireLabel from "../../components/OnFireLabel";
import { useAuth } from "../../context/auth";
import { usePlayerBadges } from "../../hooks/usePlayerBadges";
import { usePlayerRating } from "../../hooks/usePlayerRating";
import { usePlayerStats } from "../../hooks/usePlayerStats";
import { usePlayerWinStreak } from "../../hooks/usePlayerWinStreak";
import { useActiveGroup } from "../../lib/activeGroup";
import { hasAvailabilityForGroup } from "../../lib/availabilityCheck";
import { isProfileComplete } from "../../lib/profileCheck";
import { useIsSuperAdmin, useUserRole } from "../../lib/roles";
import { supabase } from "../../lib/supabase";
import { computeInitials, press } from "../../lib/uiSafe";
import { getBadgeImage } from "../../lib/badgeImages";
// Imports directs de Reanimated (maintenant que worklets est à jour)
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

// Détecter si on est en Expo Go (où Worklets peut avoir des problèmes de version)
const isExpoGo = Constants.executionEnvironment === 'storeClient';

// Imports conditionnels pour Gesture Handler (pour la compatibilité Expo Go)
let Gesture, GestureDetector, GestureHandlerRootView;

try {
  const gestureHandler = require('react-native-gesture-handler');
  Gesture = gestureHandler.Gesture;
  GestureDetector = gestureHandler.GestureDetector;
  GestureHandlerRootView = gestureHandler.GestureHandlerRootView;
} catch (e) {
  console.warn('[Profil] Erreur lors du chargement des modules de gestes:', e);
  // Fallback: créer des composants vides
  GestureDetector = ({ children, gesture }) => children;
  GestureHandlerRootView = ({ children, style }) => <View style={style}>{children}</View>;
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

  // Ville (pour les classements globaux / zone_leaderboard)
  const [city, setCity] = useState(null);

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
  const scrollViewRef = useRef(null);
  const abortControllerHome = useRef(null);
  const abortControllerWork = useRef(null);
  
  // Cache pour les suggestions d'adresse (Map<query, {suggestions, timestamp}>)
  const addressCache = useRef(new Map());
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  const CACHE_MAX_SIZE = 50;
  
  // Groupe actif (pour les classements de groupe via PlayerRankSummary)
  const { activeGroup } = useActiveGroup();
  
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

  // Déduire la ville depuis address_home / address_work (pour le classement global)
  useEffect(() => {
    let userCity = addressHome?.city || addressWork?.city || null;

    if (!userCity) {
      const homeAddress = addressHome?.address;
      const workAddress = addressWork?.address;
      const addressToParse = homeAddress || workAddress;

      if (addressToParse && typeof addressToParse === 'string') {
        const parts = addressToParse.split(',').map(p => p.trim());
        if (parts.length >= 2) {
          userCity = parts[1]; // Généralement "Code postal Ville" ou "Ville"
        }
      }
    }

    setCity(userCity || null);
  }, [addressHome, addressWork]);

  // Récupérer le club_id depuis le nom du club favori
  useEffect(() => {
    if (!club || !club.trim()) {
      setFavoriteClubId(null);
      return;
    }

    (async () => {
      try {
        const clubNameTrimmed = club.trim();
        console.log('[Profil] Recherche du club favori:', clubNameTrimmed);
        
        // Normaliser le nom pour la recherche (enlever espaces multiples, caractères spéciaux comme &)
        const normalizeName = (name) => {
          return name
            .toLowerCase()
            .replace(/\s+/g, ' ') // Remplacer espaces multiples par un seul
            .replace(/[&]/g, '') // Enlever & pour la comparaison
            .replace(/\s+/g, ' ') // Re-normaliser les espaces après suppression
            .trim();
        };
        
        const normalizedSearch = normalizeName(clubNameTrimmed);
        console.log('[Profil] Nom normalisé pour recherche:', normalizedSearch);
        
        // Essayer d'abord une correspondance exacte
        let { data, error } = await supabase
          .from('clubs')
          .select('id, name')
          .eq('name', clubNameTrimmed)
          .maybeSingle();

        // Si pas trouvé, essayer avec ILIKE (insensible à la casse)
        if (!data && !error) {
          const { data: dataIlike, error: errorIlike } = await supabase
            .from('clubs')
            .select('id, name')
            .ilike('name', clubNameTrimmed)
            .maybeSingle();
          
          if (!errorIlike && dataIlike) {
            data = dataIlike;
            error = null;
          }
        }

        // Si toujours pas trouvé, essayer avec recherche partielle
        if (!data && !error) {
          const { data: dataPartial, error: errorPartial } = await supabase
            .from('clubs')
            .select('id, name')
            .ilike('name', `%${clubNameTrimmed}%`)
            .limit(10); // Prendre plusieurs résultats pour trouver le meilleur match
          
          if (!errorPartial && dataPartial && dataPartial.length > 0) {
            console.log('[Profil] Clubs trouvés avec recherche partielle:', dataPartial.map(c => c.name));
            // Trouver le meilleur match en comparant les noms normalisés
            const bestMatch = dataPartial.find(c => {
              const normalized = normalizeName(c.name);
              return normalized === normalizedSearch;
            }) || dataPartial.find(c => {
              const normalized = normalizeName(c.name);
              // Vérifier si les mots-clés principaux correspondent
              const searchWords = normalizedSearch.split(' ').filter(w => w.length > 2);
              const nameWords = normalized.split(' ').filter(w => w.length > 2);
              return searchWords.every(word => nameWords.some(nw => nw.includes(word) || word.includes(nw)));
            }) || dataPartial[0]; // Prendre le premier si aucun match parfait
            
            if (bestMatch) {
              console.log('[Profil] Meilleur match trouvé:', bestMatch.name, '(normalisé:', normalizeName(bestMatch.name), ')');
              data = bestMatch;
              error = null;
            }
          }
        }

        if (error) {
          console.error('[Profil] Error fetching club_id:', error);
          setFavoriteClubId(null);
          return;
        }

        if (data?.id) {
          console.log('[Profil] ✅ Club favori trouvé:', clubNameTrimmed, '->', data.id, '(nom DB:', data.name, ')');
          setFavoriteClubId(data.id);
        } else {
          console.warn('[Profil] ❌ Club favori non trouvé avec recherche standard:', clubNameTrimmed);
          
          // Recherche spécifique pour "Hercule" (cas spécial)
          const searchTerms = clubNameTrimmed.toLowerCase().split(' ').filter(t => t.length > 2);
          console.log('[Profil] Termes de recherche extraits:', searchTerms);
          
          if (searchTerms.length > 0) {
            // Chercher avec le premier terme significatif (ex: "hercule")
            const mainTerm = searchTerms[0];
            const { data: searchResults, error: searchError } = await supabase
              .from('clubs')
              .select('id, name')
              .ilike('name', `%${mainTerm}%`)
              .limit(20);
            
            if (!searchError && searchResults && searchResults.length > 0) {
              console.log('[Profil] Clubs trouvés avec terme principal:', searchResults.map(c => c.name));
              
              // Trouver le meilleur match en comparant tous les termes
              const bestMatch = searchResults.find(c => {
                const normalized = normalizeName(c.name);
                const allTermsMatch = searchTerms.every(term => 
                  normalized.includes(term) || normalized.split(' ').some(w => w.includes(term))
                );
                return allTermsMatch;
              }) || searchResults.find(c => {
                const normalized = normalizeName(c.name);
                return normalized.includes(mainTerm);
              });
              
              if (bestMatch) {
                console.log('[Profil] ✅ Club favori trouvé avec recherche par terme:', clubNameTrimmed, '->', bestMatch.id, '(nom DB:', bestMatch.name, ')');
                data = bestMatch;
                error = null;
                setFavoriteClubId(bestMatch.id);
                return;
              }
            }
          }
          
          // Dernière tentative : lister tous les clubs contenant "hercule" pour debug
          const { data: herculeClubs } = await supabase
            .from('clubs')
            .select('id, name')
            .ilike('name', '%hercule%')
            .limit(10);
          console.log('[Profil] Clubs contenant "hercule":', herculeClubs?.map(c => c.name));
          
          // Lister quelques clubs pour debug
          const { data: allClubs } = await supabase
            .from('clubs')
            .select('id, name')
            .limit(20);
          console.log('[Profil] Premiers clubs disponibles:', allClubs?.map(c => c.name));
          
          setFavoriteClubId(null);
        }
      } catch (e) {
        console.error('[Profil] Error fetching club_id:', e);
        setFavoriteClubId(null);
      }
    })();
  }, [club]);

  // Charger les classements
  useEffect(() => {
    if (!me?.id) {
      setLoadingRanks(false);
      return;
    }

    const fetchRanks = async () => {
      setLoadingRanks(true);
      try {
        const promises = [];

        // Classement global (via leaderboard_view directement)
        promises.push(
          (async () => {
            try {
              // Essayer d'abord avec zone_leaderboard si on a une ville
              if (city) {
                const { data: zoneData, error: zoneError } = await supabase.rpc('zone_leaderboard', {
                  p_city: city,
                });
                if (!zoneError && zoneData && zoneData.length > 0) {
                  const playerEntry = zoneData.find((e) => e.user_id === me.id);
                  if (playerEntry) {
                    setGlobalRank({
                      rank: Number(playerEntry.rank),
                      total: zoneData.length,
                    });
                    return;
                  }
                }
              }
              
              // Fallback : utiliser leaderboard_view directement (global)
              const { data, error } = await supabase
                .from('leaderboard_view')
                .select('user_id, rank_global')
                .order('rating', { ascending: false });
              
              if (!error && data) {
                const playerEntry = data.find((e) => e.user_id === me.id);
                if (playerEntry && playerEntry.rank_global) {
                  setGlobalRank({
                    rank: Number(playerEntry.rank_global),
                    total: data.length,
                  });
                } else {
                  setGlobalRank(null);
                }
              } else {
                setGlobalRank(null);
              }
            } catch (err) {
              console.error('[Profil] Error fetching global rank:', err);
              setGlobalRank(null);
            }
          })()
        );

        // Classement club favori
        if (favoriteClubId) {
          promises.push(
            (async () => {
              try {
                console.log('[Profil] 🔍 Fetching club leaderboard for club_id:', favoriteClubId, 'user_id:', me.id);
                
                // Vérifier d'abord si le joueur est membre d'un groupe du club
                const { data: groupCheck, error: groupError } = await supabase
                  .from('group_members')
                  .select('group_id, groups!inner(club_id, name)')
                  .eq('user_id', me.id)
                  .eq('groups.club_id', favoriteClubId)
                  .limit(5);
                
                if (groupError) {
                  console.error('[Profil] ❌ Error checking group membership:', groupError);
                  setClubRank(null);
                  return;
                }
                
                if (!groupCheck || groupCheck.length === 0) {
                  console.warn('[Profil] ⚠️ User is not a member of any group in this club (club_id:', favoriteClubId, ')');
                  // Ne pas afficher de classement si le joueur n'est pas membre d'un groupe du club
                  setClubRank(null);
                  return;
                }
                
                console.log('[Profil] ✅ User is member of', groupCheck.length, 'group(s) in this club:', groupCheck.map(g => g.groups?.name || g.group_id));
                
                // Vérifier si le joueur a un rating
                const { data: ratingData, error: ratingError } = await supabase
                  .from('player_ratings')
                  .select('rating, matches_played')
                  .eq('player_id', me.id)
                  .maybeSingle();
                
                if (ratingError) {
                  console.error('[Profil] ❌ Error checking rating:', ratingError);
                  setClubRank(null);
                  return;
                }
                
                if (!ratingData || ratingData.rating === null) {
                  console.warn('[Profil] ⚠️ User has no rating yet (rating:', ratingData?.rating, ', matches:', ratingData?.matches_played, ')');
                  setClubRank(null);
                  return;
                }
                
                console.log('[Profil] ✅ User has rating:', ratingData.rating, '(matches:', ratingData.matches_played, ')');
                
                // Maintenant récupérer le leaderboard
                console.log('[Profil] 📊 Calling club_leaderboard RPC...');
                const { data, error } = await supabase.rpc('club_leaderboard', {
                  p_club_id: favoriteClubId,
                });
                if (error) {
                  console.error('[Profil] ❌ Error calling club_leaderboard:', error);
                  setClubRank(null);
                  return;
                }
                if (data && data.length > 0) {
                  console.log('[Profil] ✅ Club leaderboard data:', data.length, 'players');
                  console.log('[Profil] First 3 players:', data.slice(0, 3).map(p => ({ user_id: p.user_id, pseudo: p.pseudo, rank: p.rank, rating: p.rating })));
                  const playerEntry = data.find((e) => e.user_id === me.id);
                  if (playerEntry) {
                    console.log('[Profil] ✅ Player found in club leaderboard:', { rank: playerEntry.rank, rating: playerEntry.rating, pseudo: playerEntry.pseudo });
                    // Récupérer le nom du club
                    const { data: clubData } = await supabase
                      .from('clubs')
                      .select('name')
                      .eq('id', favoriteClubId)
                      .maybeSingle();

                    setClubRank({
                      rank: Number(playerEntry.rank),
                      total: data.length,
                      clubName: clubData?.name || club || 'Club',
                    });
                    console.log('[Profil] ✅ Club rank set:', { rank: playerEntry.rank, total: data.length });
                  } else {
                    console.warn('[Profil] ⚠️ Player not found in club leaderboard (user_id:', me.id, 'not in', data.length, 'players)');
                    console.log('[Profil] User IDs in leaderboard:', data.slice(0, 5).map(p => p.user_id));
                    setClubRank(null);
                  }
                } else {
                  console.warn('[Profil] ⚠️ Club leaderboard empty (no data returned)');
                  setClubRank(null);
                }
              } catch (err) {
                console.error('[Profil] ❌ Error fetching club rank:', err);
                setClubRank(null);
              }
            })()
          );
        } else {
          console.log('[Profil] ⚠️ No favoriteClubId, skipping club rank');
          setClubRank(null);
        }

        // Classement groupe actif
        if (activeGroup?.id) {
          promises.push(
            (async () => {
              try {
                const { data, error } = await supabase.rpc('group_leaderboard', {
                  p_group_id: activeGroup.id,
                });
                if (!error && data) {
                  const playerEntry = data.find((e) => e.user_id === me.id);
                  if (playerEntry) {
                    setGroupRank({
                      rank: Number(playerEntry.rank),
                      total: data.length,
                      groupName: activeGroup.name || 'Groupe',
                    });
                  } else {
                    setGroupRank(null);
                  }
                } else {
                  setGroupRank(null);
                }
              } catch (err) {
                console.error('[Profil] Error fetching group rank:', err);
                setGroupRank(null);
              }
            })()
          );
        } else {
          setGroupRank(null);
        }

        await Promise.all(promises);
      } catch (error) {
        console.error('[Profil] Error fetching ranks:', error);
      } finally {
        setLoadingRanks(false);
      }
    };

    fetchRanks();
  }, [me?.id, city, favoriteClubId, activeGroup?.id, activeGroup?.name]);

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
  const { winStreak } = usePlayerWinStreak(me?.id);
  const { stats, isLoading: statsLoading, isError: statsError } = usePlayerStats(me?.id);
  
  // Avatar, niveau et classement du partenaire principal
  const [partnerAvatar, setPartnerAvatar] = useState(null);
  const [partnerLevel, setPartnerLevel] = useState(null);
  const [partnerRank, setPartnerRank] = useState(null);
  
  useEffect(() => {
    if (stats?.topPartners && stats.topPartners.length > 0) {
      (async () => {
        try {
          const partnerId = stats.topPartners[0].partnerId;
          
          // Récupérer avatar et niveau depuis profiles
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('avatar_url, niveau')
            .eq('id', partnerId)
            .maybeSingle();
          
          if (!profileError && profileData) {
            setPartnerAvatar(profileData.avatar_url || null);
            setPartnerLevel(profileData.niveau ? Number(profileData.niveau) : null);
          } else {
            setPartnerAvatar(null);
            setPartnerLevel(null);
          }
          
          // Récupérer le classement depuis leaderboard_view
          const { data: rankData, error: rankError } = await supabase
            .from('leaderboard_view')
            .select('rank_global')
            .eq('user_id', partnerId)
            .maybeSingle();
          
          if (!rankError && rankData && rankData.rank_global) {
            setPartnerRank(Number(rankData.rank_global));
          } else {
            setPartnerRank(null);
          }
        } catch (e) {
          console.error('[Profil] Error fetching partner data:', e);
          setPartnerAvatar(null);
          setPartnerLevel(null);
          setPartnerRank(null);
        }
      })();
    } else {
      setPartnerAvatar(null);
      setPartnerLevel(null);
      setPartnerRank(null);
    }
  }, [stats?.topPartners]);

  // États pour les classements
  const [globalRank, setGlobalRank] = useState(null);
  const [clubRank, setClubRank] = useState(null);
  const [groupRank, setGroupRank] = useState(null);
  const [loadingRanks, setLoadingRanks] = useState(true);
  const [favoriteClubId, setFavoriteClubId] = useState(null);

  if (loading) return <View style={s.center}><ActivityIndicator /></View>;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.select({ ios: "padding", android: undefined })}>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={[s.container, { paddingBottom: Math.max(28, insets.bottom + 140) }]}
        scrollIndicatorInsets={{ bottom: Math.max(8, insets.bottom + 70) }}
        keyboardShouldPersistTaps="handled"
      >

        {/* Avatar */}
        <Pressable onPress={() => router.push('/stats')} style={s.avatarCard}>
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
            {winStreak >= 3 && (
              <View style={{ position: 'absolute', top: 20, left: -4, zIndex: 10 }}>
                <OnFireLabel winStreak={winStreak} size="small" />
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
        </Pressable>

        {/* Tiles d'informations du profil */}
        <View style={{ marginTop: 8 }}>
          {statsLoading ? (
            <View style={[s.tile, s.tileFull, { padding: 20, alignItems: 'center', marginTop: 16 }]}>
              <ActivityIndicator size="small" color={BRAND} />
              <Text style={{ fontSize: 14, color: '#E0FF00', marginTop: 8 }}>Chargement des stats...</Text>
            </View>
          ) : statsError || !stats ? (
            <View style={[s.tile, s.tileFull, { padding: 20, alignItems: 'center', marginTop: 16 }]}>
              <Text style={{ fontSize: 14, color: '#9ca3af', textAlign: 'center' }}>
                Statistiques indisponibles pour le moment.
              </Text>
            </View>
          ) : null}

          {/* Ligne 1 : Pseudo à 100% */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
            <Ionicons name="person" size={22} color="#e0ff00" />
            <Text style={[s.tileTitle, { color: '#e0ff00' }]}>Pseudo <Text style={{ color: '#dc2626' }}>*</Text></Text>
          </View>
          <View style={[s.tile, s.tileFull]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#032344', borderRadius: 8, backgroundColor: '#032344', paddingHorizontal: 10, paddingVertical: 6 }}>
              <Ionicons name="create" size={18} color="#ffffff" style={{ marginRight: 8 }} />
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Ex. Seb Padel"
                placeholderTextColor="#9ca3af"
                autoCapitalize="words"
                style={{ flex: 1, fontSize: 14, color: '#ffffff' }}
                maxLength={60}
              />
            </View>
          </View>

          {/* Ligne 2 : Adresses */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8, marginTop: 16 }}>
            <Ionicons name="location" size={22} color="#e0ff00" />
            <Text style={[s.tileTitle, { color: '#e0ff00' }]}>Adresses</Text>
          </View>
          <Text style={{ fontSize: 14, fontWeight: '400', color: '#E0FF00', marginBottom: 8 }}>(pour trouver des matchs à proximité)</Text>
          <View style={[s.card, { gap: 12, marginTop: 0, backgroundColor: '#032344', marginBottom: 8 }]}>
            {/* Domicile */}
            <View style={{ marginTop: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Ionicons name="home" size={18} color="#E0FF00" />
                <Text style={[s.label, { fontSize: 16, color: '#E0FF00' }]}>Domicile <Text style={{ color: '#dc2626' }}>*</Text></Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#032344', borderRadius: 10, backgroundColor: '#032344', paddingHorizontal: 14, paddingVertical: 12 }}>
                <Ionicons name="create" size={18} color="#ffffff" style={{ marginRight: 8 }} />
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
                  placeholderTextColor="#9ca3af"
                  style={[{ flex: 1, fontSize: 16, color: '#ffffff' }, Platform.OS === 'android' && { textAlign: 'left' }]}
                  autoCapitalize="words"
                />
              </View>
              {addressHomeSuggestions.length > 0 && (
                <View style={{ marginTop: 4, backgroundColor: '#032344', borderRadius: 8, maxHeight: 150 }}>
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
                        <Text style={{ fontSize: 14, color: '#E0FF00', fontWeight: '500' }}>{sug.name}</Text>
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Ionicons name="briefcase" size={18} color="#E0FF00" />
                <Text style={[s.label, { fontSize: 16, color: '#E0FF00' }]}>Travail</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#032344', borderRadius: 10, backgroundColor: '#032344', paddingHorizontal: 14, paddingVertical: 12 }}>
                <Ionicons name="create" size={18} color="#ffffff" style={{ marginRight: 8 }} />
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
                  placeholderTextColor="#9ca3af"
                  style={[{ flex: 1, fontSize: 16, color: '#ffffff' }, Platform.OS === 'android' && { textAlign: 'left' }]}
                  autoCapitalize="words"
                />
              </View>
              {addressWorkSuggestions.length > 0 && (
                <View style={{ marginTop: 4, backgroundColor: '#032344', borderRadius: 8, maxHeight: 150 }}>
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
                        <Text style={{ fontSize: 14, color: '#E0FF00', fontWeight: '500' }}>{sug.name}</Text>
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
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8, marginTop: 16 }}>
            <Ionicons name="flame" size={22} color="#e0ff00" />
            <Text style={[s.tileTitle, { color: '#e0ff00' }]}>Niveau <Text style={{ color: '#dc2626' }}>*</Text></Text>
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
          <View style={[s.tile, s.tileFull]}>
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
                    <Text style={[s.pillTxt, { color: '#06305D', fontWeight: active ? '900' : '800' }]}>{lv.v}</Text>
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
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8, marginTop: 16 }}>
            <Ionicons name="trophy" size={22} color="#e0ff00" />
            <Text style={[s.tileTitle, { color: '#e0ff00' }]}>CLASSEMENT FFT</Text>
            </View>
          <View style={[s.tile, s.tileFull, { padding: 16 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start', gap: 8 }}>
              {/* Classement FFT */}
              <View style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
                {classement && classement.trim() ? (
                  <>
                    <Text style={{ fontSize: 32, fontWeight: '900', color: '#E0FF00', marginBottom: 4 }}>
                      {classement}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#9ca3af', textTransform: 'lowercase' }}>
                      Classement FFT
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#6b7280', marginBottom: 4 }}>
                      -
                    </Text>
                    <Text style={{ fontSize: 12, color: '#6b7280' }}>
                      Non renseigné
                    </Text>
                  </>
                )}
              </View>
            </View>
            
            {/* Champ de saisie pour modifier */}
            <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#1f2937' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#032344', borderRadius: 8, backgroundColor: '#032344', paddingHorizontal: 10, paddingVertical: 6 }}>
                <Ionicons name="create" size={18} color="#ffffff" style={{ marginRight: 8 }} />
                <TextInput
                  value={classement}
                  onChangeText={setClassement}
                  placeholder="Ex. 500"
                  placeholderTextColor="#9ca3af"
                  keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                  style={{ flex: 1, fontSize: 14, color: '#ffffff', textAlign: 'center' }}
                  maxLength={6}
                />
              </View>
            </View>
          </View>

          {/* Ligne 4 : Main et Côté */}
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, marginTop: 16 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Ionicons name="hand-left" size={22} color="#e0ff00" />
              <Text style={[s.tileTitle, { color: '#e0ff00' }]}>Main <Text style={{ color: '#dc2626' }}>*</Text></Text>
            </View>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Ionicons name="swap-horizontal" size={22} color="#e0ff00" />
              <Text style={[s.tileTitle, { color: '#e0ff00' }]}>Côté <Text style={{ color: '#dc2626' }}>*</Text></Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View style={[s.tile, s.tileHalf]}>
              <Pressable
                onPress={() => setMainPickerVisible(true)}
                style={[
                  s.tileInput,
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 4,
                    backgroundColor: '#032344',
                    borderColor: '#032344',
                  },
                  Platform.OS === 'web' && { cursor: 'pointer' }
                ]}
              >
                <Text style={{ fontSize: 14, color: '#ffffff' }}>
                  {main === "droite" ? "Droite" : main === "gauche" ? "Gauche" : "Sélectionner"}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#ffffff" />
              </Pressable>
            </View>

            <View style={[s.tile, s.tileHalf]}>
              <Pressable
                onPress={() => setCotePickerVisible(true)}
                style={[
                  s.tileInput,
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 4,
                    backgroundColor: '#032344',
                    borderColor: '#032344',
                  },
                  Platform.OS === 'web' && { cursor: 'pointer' }
                ]}
              >
                <Text style={{ fontSize: 14, color: '#ffffff' }}>
                  {cote === "droite" ? "Droite" : cote === "gauche" ? "Gauche" : cote === "les_deux" ? "Les 2" : "Sélectionner"}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#ffffff" />
              </Pressable>
            </View>
          </View>

          {/* Ligne 4 : Club favori à 100% */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8, marginTop: 16 }}>
            <Ionicons name="business" size={22} color="#e0ff00" />
            <Text style={[s.tileTitle, { color: '#e0ff00' }]}>Club favori</Text>
            </View>
          <View style={[s.tile, s.tileFull]}>
            <Pressable
              onPress={() => setClubPickerVisible(true)}
              style={[
                s.tileInput,
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 4,
                  backgroundColor: '#032344',
                  borderColor: '#032344',
                },
                Platform.OS === 'web' && { cursor: 'pointer' }
              ]}
            >
              <Text style={{ fontSize: 14, color: '#ffffff', flex: 1 }}>
                {club || "Sélectionner un club favori"}
              </Text>
              <Ionicons name="chevron-down" size={18} color="#ffffff" />
            </Pressable>
          </View>

          {/* Ligne 5 : Email à 100% */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8, marginTop: 16 }}>
            <Ionicons name="mail" size={22} color="#e0ff00" />
            <Text style={[s.tileTitle, { color: '#e0ff00' }]}>Email</Text>
            </View>
          <View style={[s.tile, s.tileFull]}>
            <Text style={[s.tileValue, { color: '#9ca3af' }]}>{me?.email ?? '—'}</Text>
          </View>

          {/* Ligne 6 : Téléphone à 100% */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8, marginTop: 16 }}>
            <Ionicons name="call" size={22} color="#e0ff00" />
            <Text style={[s.tileTitle, { color: '#e0ff00' }]}>Téléphone</Text>
            </View>
          <View style={[s.tile, s.tileFull]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#032344', borderRadius: 8, backgroundColor: '#032344', paddingHorizontal: 10, paddingVertical: 6 }}>
              <Ionicons name="create" size={18} color="#ffffff" style={{ marginRight: 8 }} />
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="06 12 34 56 78"
                placeholderTextColor="#9ca3af"
                keyboardType="phone-pad"
                style={{ flex: 1, fontSize: 14, color: '#ffffff' }}
                maxLength={20}
              />
            </View>
          </View>
        </View>

        {/* Ligne 8 : Rayon à 100% */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8, marginTop: 16 }}>
          <Ionicons name="car" size={22} color="#e0ff00" />
          <Text style={[s.tileTitle, { color: '#e0ff00' }]}>Rayon de jeu possible <Text style={{ color: '#dc2626' }}>*</Text></Text>
          </View>
        <View style={[s.tile, s.tileFull]}>
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
                  <Text style={[s.pillTxt, { color: active ? '#06305d' : '#9ca3af', fontWeight: active ? "800" : "600" }]}>{r.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Affichage du rôle actuel */}
        {(isSuperAdmin || role) && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8, marginTop: 16 }}>
              <Text style={[s.tileTitle, { color: '#e0ff00' }]}>Rôle actuel</Text>
            </View>
            <View style={[s.card, { marginBottom: 12, backgroundColor: '#032344' }]}>
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
          </>
        )}

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
            <Ionicons name="business-outline" size={24} color="#E0FF00" style={{ marginRight: 8 }} />
            <Text style={[s.btnTxt, { color: '#E0FF00' }]}>Gérer mon club</Text>
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
            <View style={{ backgroundColor: '#06305d', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 20 }}>
              <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#ffffff' }}>Sélectionner la main</Text>
              </View>
              <Pressable
                onPress={() => {
                  setMain("droite");
                  setMainPickerVisible(false);
                }}
                style={({ pressed }) => ({
                  paddingVertical: 16,
                  paddingHorizontal: 20,
                  backgroundColor: pressed ? '#041f3a' : main === "droite" ? '#041f3a' : '#06305d',
                  borderBottomWidth: 1,
                  borderBottomColor: '#e5e7eb',
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 16, color: '#ffffff', fontWeight: main === "droite" ? '700' : '400' }}>
                    Droite
                  </Text>
                  {main === "droite" && <Ionicons name="checkmark" size={20} color="#ffffff" />}
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
                  backgroundColor: pressed ? '#041f3a' : main === "gauche" ? '#041f3a' : '#06305d',
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 16, color: '#ffffff', fontWeight: main === "gauche" ? '700' : '400' }}>
                    Gauche
                  </Text>
                  {main === "gauche" && <Ionicons name="checkmark" size={20} color="#ffffff" />}
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
            <View style={{ backgroundColor: '#06305d', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 20 }}>
              <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#ffffff' }}>Sélectionner le côté</Text>
              </View>
              <Pressable
                onPress={() => {
                  setCote("droite");
                  setCotePickerVisible(false);
                }}
                style={({ pressed }) => ({
                  paddingVertical: 16,
                  paddingHorizontal: 20,
                  backgroundColor: pressed ? '#041f3a' : cote === "droite" ? '#041f3a' : '#06305d',
                  borderBottomWidth: 1,
                  borderBottomColor: '#e5e7eb',
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 16, color: '#ffffff', fontWeight: cote === "droite" ? '700' : '400' }}>
                    Droite
                  </Text>
                  {cote === "droite" && <Ionicons name="checkmark" size={20} color="#ffffff" />}
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
                  backgroundColor: pressed ? '#041f3a' : cote === "gauche" ? '#041f3a' : '#06305d',
                  borderBottomWidth: 1,
                  borderBottomColor: '#e5e7eb',
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 16, color: '#ffffff', fontWeight: cote === "gauche" ? '700' : '400' }}>
                    Gauche
                  </Text>
                  {cote === "gauche" && <Ionicons name="checkmark" size={20} color="#ffffff" />}
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
                  backgroundColor: pressed ? '#041f3a' : cote === "les_deux" ? '#041f3a' : '#06305d',
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 16, color: '#ffffff', fontWeight: cote === "les_deux" ? '700' : '400' }}>
                    Les 2
                  </Text>
                  {cote === "les_deux" && <Ionicons name="checkmark" size={20} color="#ffffff" />}
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
            <View style={{ backgroundColor: '#06305d', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 20, maxHeight: '80%' }}>
              <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#ffffff' }}>
                  Sélectionner un club favori
                </Text>
                {addressHome?.lat && addressHome?.lng && (
                  <Text style={{ fontSize: 12, color: '#ffffff', marginTop: 4, opacity: 0.9 }}>
                    Triés par distance du domicile
                  </Text>
                )}
              </View>
              {loadingClubs ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#ffffff" />
                  <Text style={{ marginTop: 12, color: '#ffffff' }}>Chargement des clubs...</Text>
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
                        backgroundColor: pressed ? '#041f3a' : club === c.name ? '#041f3a' : '#06305d',
                        borderBottomWidth: idx < clubsList.length - 1 ? 1 : 0,
                        borderBottomColor: '#e5e7eb',
                      })}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 16, color: '#ffffff', fontWeight: club === c.name ? '700' : '400' }}>
                            {c.name}
                          </Text>
                          {c.address && (
                            <Text style={{ fontSize: 12, color: '#ffffff', marginTop: 2, opacity: 0.9 }}>
                              {c.address}
                            </Text>
                          )}
                          {c.distance !== undefined && c.distance !== Infinity && (
                            <Text style={{ fontSize: 12, color: '#ffffff', marginTop: 2, opacity: 0.9 }}>
                              {c.distance} km
                            </Text>
                          )}
                        </View>
                        {club === c.name && <Ionicons name="checkmark" size={20} color="#ffffff" />}
                      </View>
                    </Pressable>
                  ))}
                  {clubsList.length === 0 && !loadingClubs && (
                    <View style={{ padding: 40, alignItems: 'center' }}>
                      <Text style={{ color: '#ffffff' }}>Aucun club disponible</Text>
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
      <Text style={[s.segmentTxt, active && { color: "#E0FF00", fontWeight: "800" }]}>{label}</Text>
    </Pressable>
  );
}

function BadgeIcon({ badge, size = 120 }) {
  const badgeImage = getBadgeImage(badge.code, badge.unlocked);
  const opacity = badge.unlocked ? 1 : 0.4;

  // Fallback vers icône si pas d'image
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

  return (
    <View style={{ 
      width: size, 
      height: size, 
      borderRadius: size / 2, 
      backgroundColor: 'transparent', 
      alignItems: 'center', 
      justifyContent: 'center',
      borderWidth: 0,
      position: 'relative',
      opacity,
      overflow: 'hidden'
    }}>
      {badgeImage ? (
        <Image 
          source={badgeImage}
          style={{ 
            width: size * 0.9, 
            height: size * 0.9,
            resizeMode: 'contain'
          }}
        />
      ) : (
        <Ionicons name={iconName} size={size * 0.6} color={iconColor} />
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

  card: { backgroundColor: "#032344", borderWidth: 2, borderColor: "#e0ff00", borderRadius: 12, padding: 12 },

  sectionTitle: { fontSize: 16, fontWeight: "800", color: "#E0FF00" },

  label: { fontSize: 18, color: "#E0FF00", fontWeight: "800" },
  value: { fontSize: 16, color: "#E0FF00", marginTop: 4 },

  // Tiles
  tile: {
    backgroundColor: "#032344",
    borderWidth: 2,
    borderColor: "#e0ff00",
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
    color: "#E0FF00",
    fontWeight: "700",
    textTransform: 'uppercase',
    textAlign: 'center',
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
    color: "#E0FF00",
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