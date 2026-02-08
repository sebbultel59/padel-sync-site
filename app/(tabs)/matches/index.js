import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Animated,
  DeviceEventEmitter,
  FlatList,
  Image,
  InteractionManager,
  Linking,
  Modal, Platform, Pressable,
  ScrollView,
  SectionList,
  Share,
  StyleSheet,
  Text,
  TextInput, UIManager, useWindowDimensions,
  Vibration,
  View
} from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import clickIcon from '../../../assets/icons/click.png';
import racketIcon from '../../../assets/icons/racket.png';
import { Step, useCopilot } from '../../../components/AppCopilot';
import { OnboardingModal } from '../../../components/OnboardingModal';
import { useActiveGroup } from "../../../lib/activeGroup";
import { filterAndSortPlayers, haversineKm, levelCompatibility } from "../../../lib/geography";
import { popInviteJoinedBanner } from "../../../lib/invite";
import { supabase } from "../../../lib/supabase";
import { formatPlayerName, press } from "../../../lib/uiSafe";
let NativeSlider = null;
try {
  NativeSlider = require("@react-native-community/slider").default;
} catch {}
const hasNativeSlider = Platform.OS !== "web" && !!UIManager.getViewManagerConfig?.("RNCSlider");
const GEO_PREFS_KEY = (groupId) => `geo_filter_prefs:${groupId}`;

const THEME = {
  bg: '#061A2B',
  card: 'rgba(10, 32, 56, 0.6)',
  cardAlt: 'rgba(10, 32, 56, 0.45)',
  cardBorder: 'rgba(255, 255, 255, 0.08)',
  text: '#EAF0FF',
  muted: '#8FA3BF',
  accent: '#E5FF00',
  accentSoft: 'rgba(229, 255, 0, 0.16)',
  ink: '#0B1526',
};

const COLORS = {
  primary: '#1B3B6F',
  accent: THEME.accent,
  ink: THEME.ink,
  gray: '#2B3E57',
  grayBg: '#12263F',
};

const TINTS = {
  primaryBg: '#0E2238',
  accentBg: 'rgba(229, 255, 0, 0.12)',
};

// Helper pour pluralisation
const matchWord = (n) => (n <= 1 ? 'match' : 'matchs');
const possibleWord = (n) => (n <= 1 ? 'possible' : 'possibles');
const valideWord = (n) => (n <= 1 ? 'validé' : 'validés');

// Helper pour la durée en minutes
function durationMinutes(startIso, endIso) {
  try {
    const s = new Date(startIso).getTime();
    const e = new Date(endIso).getTime();
    return Math.round((e - s) / 60000);
  } catch {
    return 0;
  }
}

// Week helpers
function startOfWeek(d) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day);
  return date;
}

function endOfWeek(d) {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function weekBoundsFromOffset(offset) {
  const today = new Date();
  const base = addDays(today, offset * 7);
  return { ws: startOfWeek(base), we: endOfWeek(base) };
}

function isInWeekRange(sIso, eIso, ws, we) {
  if (!sIso || !eIso) return false;
  const s = new Date(sIso);
  const e = new Date(eIso);
  return (s <= we) && (e >= ws);
}

function formatWeekRangeLabel(ws, we) {
  const makeLabel = (d, withYear = false) => {
    let s = d.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
    });
    s = s.replace(/^([a-zA-Zéû]{3})\.(\s)/, (_, w, sp) => w.charAt(0).toUpperCase() + w.slice(1) + sp);
    s = s.replace(/^([a-zA-Zéû]{3})(\s)/, (_, w, sp) => w.charAt(0).toUpperCase() + w.slice(1) + sp);
    return s;
  };
  const d1 = makeLabel(ws, false);
  const d2 = makeLabel(we, true);
  return `${d1} – ${d2}`;
}

function formatRange(sIso, eIso) {
  if (!sIso || !eIso) return '';
  const s = new Date(sIso);
  const e = new Date(eIso);
  const WD = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const MO = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  const wd = WD[s.getDay()] || '';
  const dd = String(s.getDate()).padStart(2, '0');
  const mo = MO[s.getMonth()] || '';
  const timeOpts = { hour: '2-digit', minute: '2-digit' };
  const sh = s.toLocaleTimeString('fr-FR', timeOpts);
  const eh = e.toLocaleTimeString('fr-FR', timeOpts);
  return `${wd} ${dd} ${mo} - ${sh} à ${eh}`;
}

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

const colorForLevel = (level) => {
  const n = Number(level);
  return LEVELS.find((x) => x.v === n)?.color ?? "#d1d5db";
};

export default function MatchesScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { start } = useCopilot();
  const startRef = useRef(null);
  const [freezeVersion, setFreezeVersion] = useState(0);
  const isFetchingRef = useRef(false);
  const pendingFetchRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const hasDataRef = useRef(false);
  const availabilityRefreshTimerRef = useRef(null);
  const rsvpRefreshTimerRef = useRef(null);
  const isCreatingMatchRef = useRef(false);
  const isConfirmingRsvpRef = useRef(false);
  const weekLoadingUntilRef = useRef(0);
  const weekLoadingTimerRef = useRef(null);
  const freezeDisplayUntilRef = useRef(0);

  const freezeDisplay = useCallback((ms = 700) => {
    freezeDisplayUntilRef.current = Date.now() + ms;
    setFreezeVersion((v) => v + 1);
    setTimeout(() => setFreezeVersion((v) => v + 1), ms);
  }, []);
  
  // Stocker start dans une ref
  if (start) {
    startRef.current = start;
  }
  
  // Calculer l'espacement dynamique entre header et boutons selon la taille d'écran (Android uniquement)
  const dynamicHeaderSpacing = Platform.OS === 'android' 
    ? (height < 700 ? -24 : height < 900 ? -20 : height < 1100 ? -16 : -12)
    : -12;
  
  // Debug: vérifier les valeurs sur Android
  useEffect(() => {
    if (Platform.OS === 'android') {
      console.log('[Matches Android] Height:', height, 'Spacing:', dynamicHeaderSpacing);
    }
  }, [height, dynamicHeaderSpacing]);

  // 🔔 Écouter l'événement pour démarrer le tutoriel
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('padelsync:startTour', () => {
      if (startRef.current && typeof startRef.current === 'function') {
        setTimeout(() => {
          startRef.current();
        }, 300);
      }
    });
    return () => sub?.remove?.();
  }, []);
  
  // Fonction pour ouvrir le profil d'un joueur
  const openProfile = useCallback((profile) => {
    if (profile?.id) {
      router.push(`/profiles/${profile.id}`);
    }
  }, [router]);

  // Fonction pour ouvrir le profil depuis la modale d'invitation
  const openProfileFromModal = useCallback(async (profile) => {
    if (profile?.id) {
      console.log('[HotMatch] Ouverture modale profil pour:', profile.id, profile.display_name);
      // Charger les données complètes du profil depuis la base de données
      let createdMatchId = null;
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, email, display_name, name, avatar_url, niveau, main, cote, club, rayon_km, phone')
          .eq('id', profile.id)
          .maybeSingle();
        
        if (error) {
          console.error('[HotMatch] Erreur chargement profil:', error);
          Alert.alert('Erreur', 'Impossible de charger le profil');
          return;
        }
        
        if (data) {
          setSelectedHotMatchProfile(data);
          // Fermer la modale d'invitation et ouvrir la modale de profil
          setInviteHotMatchModalVisible(false);
          setTimeout(() => {
            setHotMatchProfileModalVisible(true);
          }, 100);
        }
      } catch (e) {
        console.error('[HotMatch] Erreur:', e);
        Alert.alert('Erreur', 'Impossible de charger le profil');
      }
    }
  }, []);

  // Fonction pour ouvrir le profil depuis la modale flash match
  const openProfileFromFlashModal = useCallback(async (profile) => {
    if (profile?.id) {
      console.log('[FlashMatch] Ouverture modale profil pour:', profile.id, profile.name || profile.display_name);
      // Charger les données complètes du profil depuis la base de données
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, email, display_name, name, avatar_url, niveau, main, cote, club, rayon_km, phone')
          .eq('id', profile.id)
          .maybeSingle();
        
        if (error) {
          console.error('[FlashMatch] Erreur chargement profil:', error);
          Alert.alert('Erreur', 'Impossible de charger le profil');
          return;
        }
        
        if (data) {
          setSelectedFlashProfile(data);
          // Fermer la modale flash match et ouvrir la modale de profil
          setFlashPickerOpen(false);
          setTimeout(() => {
            setFlashProfileModalVisible(true);
          }, 100);
        }
      } catch (e) {
        console.error('[FlashMatch] Erreur:', e);
        Alert.alert('Erreur', 'Impossible de charger le profil');
      }
    }
  }, []);

  // Fonction pour réinitialiser les filtres flash match
  const resetFlashFilters = useCallback(() => {
    setFlashQuery('');
    setFlashLevelFilter([]);
    setFlashLevelFilterVisible(false);
    setFlashGeoLocationType(null);
    setFlashGeoRefPoint(null);
    setFlashGeoCityQuery('');
    setFlashGeoCitySuggestions([]);
    setFlashGeoRadiusKm(null);
    setFlashGeoFilterVisible(false);
    setFlashAvailabilityFilter(false);
    setFlashAvailableMemberIds(new Set());
  }, []);

  const MATCH_CREATED_UNDO_SECONDS = 10;
  const MATCH_CREATE_CONFIRM_SECONDS = 10;
  const clearMatchCreatedUndoState = useCallback(() => {
    if (matchCreatedUndoIntervalRef.current) {
      clearInterval(matchCreatedUndoIntervalRef.current);
      matchCreatedUndoIntervalRef.current = null;
    }
    matchCreatedUndoOnExpireRef.current = null;
    matchCreatedUndoOnConfirmRef.current = null;
    matchCreatedUndoVisibleRef.current = false;
  }, []);

  const closeConfirm = useCallback((reason = 'close') => {
    console.log('[MatchesConfirm] close', { reason, pendingPlayers: pendingCreateRef.current?.selectedUserIds || [] });
    confirmFiredRef.current = false;
    pendingCreateRef.current = null;
    setPendingCreate(null);
  }, []);

  const changeZone = useCallback(async (zone, options = {}) => {
    if (!zone?.is_active || !meId) return;
    if (String(zone.id) === String(myZoneId)) return;
    const { skipConfirm = false } = options || {};
    const applyZone = async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ zone_id: zone.id, comfort_radius_km: zone.default_radius_km })
        .eq("id", meId);
      if (error) {
        Alert.alert("Erreur", error.message);
        return;
      }
      setMyZoneId(zone.id);
      setComfortRadiusKm(zone.default_radius_km);
      persistGeoPrefs(activeGroup?.id, { zone_id: zone.id, comfort_radius_km: zone.default_radius_km });
      Alert.alert("Zone mise à jour", "Sélectionne maintenant tes clubs acceptés.");
      router.replace("/clubs/select");
    };
    if (skipConfirm) {
      applyZone();
      return;
    }
    Alert.alert(
      "Changer de zone",
      "Changer de zone ne met pas à jour tes clubs. Continuer ?",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Continuer", onPress: applyZone }
      ]
    );
  }, [meId, myZoneId, activeGroup?.id, persistGeoPrefs]);

  const openConfirm = useCallback(async ({ startsAt, endsAt, selectedUserIds, commonClubIds }) => {
    const snapshot = {
      startsAt,
      endsAt,
      selectedUserIds: Array.isArray(selectedUserIds) ? [...selectedUserIds] : [],
      commonClubIds: Array.isArray(commonClubIds) ? [...commonClubIds] : [],
    };
    console.log('OPEN_MODAL_2', snapshot);
    pendingCreateRef.current = snapshot;
    setPendingCreate(snapshot);
    confirmFiredRef.current = false;
    setConfirmClubId(null);
    setConfirmClubSearch('');
    setConfirmCommonClubs([]);
    setConfirmCreatorId(meId || null);
    try {
      setConfirmClubsLoading(true);
      console.log('[HotMatch] openConfirm fetch clubs by ids', snapshot.commonClubIds);
      const { data, error } = await supabase
        .from('clubs')
        .select('id,name')
        .in('id', snapshot.commonClubIds || []);
      console.log('[HotMatch] openConfirm fetch result', {
        count: data?.length ?? 0,
        error: error?.message ?? null,
        sample: data?.[0] ?? null,
      });
      setConfirmCommonClubs(data ?? []);
    } catch (e) {
      console.log('[HotMatch] openConfirm fetch exception', e?.message ?? String(e));
      setConfirmCommonClubs([]);
    } finally {
      setConfirmClubsLoading(false);
    }
  }, [meId]);

  const handleConfirmCreate = useCallback((source = 'confirm') => {
    if (confirmFiredRef.current) return;
    confirmFiredRef.current = true;
    const payload = pendingCreateRef.current;
    console.log('[MatchesConfirm] create', { source, pendingPlayers: payload?.selectedUserIds || [] });
    closeConfirm(source);
    if (payload?.startsAt && payload?.endsAt) {
      onCreateIntervalMatch(payload.startsAt, payload.endsAt, payload.selectedUserIds, 'confirmed', {
        skipPostCreateModal: true,
        selectedClubId: confirmClubId,
      });
    }
  }, [closeConfirm, onCreateIntervalMatch, confirmClubId]);

  const confirmPlayerIds = useMemo(() => {
    if (!pendingCreate?.selectedUserIds) return [];
    const base = [...(pendingCreate.selectedUserIds || [])];
    const creator = confirmCreatorId || meId || null;
    if (creator) base.push(creator);
    return Array.from(new Set(base.filter(Boolean).map(String)));
  }, [pendingCreate, confirmCreatorId, meId]);

  const isConfirmOpen = !!pendingCreate;

  useEffect(() => {
    const ids = pendingCreate?.commonClubIds ?? [];

    console.log('[HotMatch] effect fired', { isConfirmOpen, idsLen: ids.length, ids });

    if (!isConfirmOpen) return;

    if (ids.length === 0) {
      setConfirmCommonClubs([]);
      setConfirmClubsLoading(false);
      setConfirmClubId(null);
      return;
    }

    let mounted = true;
    (async () => {
      try {
        setConfirmClubsLoading(true);
        console.log('[HotMatch] fetch clubs by ids', ids);

        const { data, error } = await supabase
          .from('clubs')
          .select('id,name')
          .in('id', ids);

        console.log('[HotMatch] fetch result', {
          count: data?.length ?? 0,
          error: error?.message ?? null,
          sample: data?.[0] ?? null,
        });

        if (mounted) {
          setConfirmCommonClubs(data ?? []);
          if ((data || []).length === 1) {
            setConfirmClubId(data[0].id);
          } else {
            setConfirmClubId(null);
          }
        }
      } catch (e) {
        console.log('[HotMatch] fetch exception', e?.message ?? String(e));
        if (mounted) {
          setConfirmCommonClubs([]);
          setConfirmClubId(null);
        }
      } finally {
        if (mounted) setConfirmClubsLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [isConfirmOpen, pendingCreate?.commonClubIds?.join(',')]);

  const filteredConfirmClubs = useMemo(() => {
    const searchValue = (confirmClubSearch || '').trim();
    if (!searchValue) return confirmCommonClubs;
    const q = searchValue.toLowerCase();
    return (confirmCommonClubs || []).filter((c) => (c?.name || '').toLowerCase().includes(q));
  }, [confirmCommonClubs, confirmClubSearch]);



  const notifyMatchCreated = useCallback(async (matchId, playerIds = []) => {
    const ids = Array.from(new Set((playerIds || []).map(String).filter(Boolean)));
    if (!matchId || ids.length === 0 || !groupId) return;
    const key = `match_confirmed:${matchId}`;
    if (notifiedMatchesRef.current.has(key)) return;
    notifiedMatchesRef.current.add(key);
    try {
      const { error } = await supabase.rpc('create_notification_job', {
        p_kind: 'match_confirmed',
        p_match_id: matchId,
        p_group_id: groupId,
        p_recipients: ids,
        p_payload: { allow_after_countdown: true },
      });
      if (error) throw error;
    } catch (e) {
      console.warn('[notifyMatchCreated] failed:', e?.message || e);
    }
  }, [groupId]);

  const notifyGroupMatchCreated = useCallback(async (matchId, excludeUserIds = []) => {
    if (!matchId || !groupId) return;
    const key = `group_match_created:${matchId}`;
    if (notifiedMatchesRef.current.has(key)) return;
    notifiedMatchesRef.current.add(key);
    try {
      const { data: members, error } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId);
      if (error) throw error;
      const exclude = new Set((excludeUserIds || []).map(String));
      const recipients = Array.from(
        new Set((members || []).map((m) => String(m.user_id)).filter((id) => id && !exclude.has(id)))
      );
      if (recipients.length === 0) return;
      const { error: rpcError } = await supabase.rpc('create_notification_job', {
        p_kind: 'group_match_created',
        p_match_id: matchId,
        p_group_id: groupId,
        p_recipients: recipients,
        p_payload: { allow_after_countdown: true },
      });
      if (rpcError) throw rpcError;
    } catch (e) {
      console.warn('[notifyGroupMatchCreated] failed:', e?.message || e);
    }
  }, [groupId]);

  const showMatchCreatedUndo = useCallback((matchId, { seconds = MATCH_CREATED_UNDO_SECONDS, onExpire, onConfirm } = {}) => {
    if (!matchId) return;
    console.log('OPEN_MODAL_2', { matchId, seconds });
    clearMatchCreatedUndoState();
    matchCreatedUndoVisibleRef.current = true;
    matchCreatedUndoOnExpireRef.current = onExpire || null;
    matchCreatedUndoOnConfirmRef.current = onConfirm || onExpire || null;
    const duration = Math.max(1, Number(seconds) || MATCH_CREATED_UNDO_SECONDS);
    const endAt = Date.now() + duration * 1000;
    setMatchCreatedUndoEndsAt(endAt);
    setMatchCreatedUndoMatchId(matchId);
    setMatchCreatedUndoVisible(true);
    // L'expiration est gérée dans le composant de modal
  }, [clearMatchCreatedUndoState]);

  const handleMatchCreatedUndoConfirm = useCallback(() => {
    const fn = matchCreatedUndoOnConfirmRef.current;
    setMatchCreatedUndoVisible(false);
    clearMatchCreatedUndoState();
    if (fn) fn();
  }, [clearMatchCreatedUndoState]);

  const handleMatchCreatedUndoCancel = useCallback(() => {
    const fn = matchCreatedUndoOnExpireRef.current;
    setMatchCreatedUndoVisible(false);
    clearMatchCreatedUndoState();
    if (fn) fn();
  }, [clearMatchCreatedUndoState]);

  const handleMatchCreatedUndoTimeout = useCallback(() => {
    const fn = matchCreatedUndoOnExpireRef.current;
    setMatchCreatedUndoVisible(false);
    clearMatchCreatedUndoState();
    if (fn) fn();
  }, [clearMatchCreatedUndoState]);

  useEffect(() => {
    return () => {
      clearMatchCreatedUndoState();
    };
  }, [clearMatchCreatedUndoState]);


  useEffect(() => {
    matchCreatedUndoVisibleRef.current = matchCreatedUndoVisible;
    if (matchCreatedUndoVisible && !popupSnapshotActiveRef.current) {
      popupSnapshotActiveRef.current = true;
      proposesTabSnapshotRef.current = proposesTab;
      setPopupSnapshotLongSections(displayLongSectionsStable);
      setPopupSnapshotHourReady(displayHourReadyStable);
      const nextCount =
        (displayHourReadyStable || []).filter((it) => new Date(it.ends_at) > new Date()).length +
        (displayLongSectionsStable || []).reduce((sum, section) => {
          return (
            sum +
            (section.data || []).filter((it) => new Date(it.ends_at) > new Date()).length
          );
        }, 0);
      setPopupSnapshotProposedCount(nextCount);
    }
    if (!matchCreatedUndoVisible && popupSnapshotActiveRef.current) {
      popupSnapshotActiveRef.current = false;
      proposesTabSnapshotRef.current = null;
      setPopupSnapshotLongSections(null);
      setPopupSnapshotHourReady(null);
      setPopupSnapshotProposedCount(null);
    }
    if (!matchCreatedUndoVisible && pendingFetchRef.current) {
      pendingFetchRef.current = false;
      fetchData(true);
    }
  }, [matchCreatedUndoVisible, proposesTab, fetchData, displayLongSectionsStable, displayHourReadyStable]);

  const tabBarHeight = useBottomTabBarHeight();
  const safeBottomInset = Math.max(insets.bottom || 0, 0);
  const BUTTON_BAR_HEIGHT = 12;
  const WEEK_BAR_HEIGHT = 22;
  const FILTER_BAR_HEIGHT = 28;
  const STACK_SPACING = 4;
  const BUTTON_BAR_GAP = -2;
  const [buttonBarMeasuredHeight, setButtonBarMeasuredHeight] = useState(BUTTON_BAR_HEIGHT);
  const [weekBarMeasuredHeight, setWeekBarMeasuredHeight] = useState(WEEK_BAR_HEIGHT);
  const [filterBarMeasuredHeight, setFilterBarMeasuredHeight] = useState(FILTER_BAR_HEIGHT);
  const updateMeasuredHeight = useCallback(
    (setter, min = 0) => (event) => {
      const nextHeight = Math.max(event?.nativeEvent?.layout?.height || 0, min);
      setter((prev) => (Math.abs(prev - nextHeight) > 1 ? nextHeight : prev));
    },
    []
  );

  const buttonBarBottom = Math.max((tabBarHeight || 0) + BUTTON_BAR_GAP, safeBottomInset) - 5;
  const weekNavigatorBottom = buttonBarBottom + buttonBarMeasuredHeight + STACK_SPACING - 16;
  const filterButtonsBottom = weekNavigatorBottom + weekBarMeasuredHeight + STACK_SPACING - 8;
  const filterConfigBottom = filterButtonsBottom + filterBarMeasuredHeight + STACK_SPACING;
  const { activeGroup, setActiveGroup } = useActiveGroup();
  const groupId = activeGroup?.id ?? null;
  const [inviteBanner, setInviteBanner] = useState(null);
  const [acceptedClubsByUser, setAcceptedClubsByUser] = useState({});
  const [myAcceptedClubs, setMyAcceptedClubs] = useState(new Set());
  const [myZoneId, setMyZoneId] = useState(null);

  // États principaux
  const [meId, setMeId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingWeek, setLoadingWeek] = useState(false); // Chargement spécifique pour le changement de semaine
  const [tab, setTab] = useState(() => {
    // Initialiser le tab depuis les paramètres d'URL si présent
    const urlTab = params?.tab;
    return (urlTab === 'valides' ? 'valides' : 'proposes');
  });
  React.useEffect(() => {
    if (tab === 'rsvp') {
      setTab('proposes');
    }
  }, [tab]);
  const [mode, setMode] = useState('long');
  const [rsvpMode, setRsvpMode] = useState('long');
  const [confirmedMode, setConfirmedMode] = useState('long');
  const [weekOffset, setWeekOffset] = useState(0);
  const [matchTabsHeight, setMatchTabsHeight] = useState(0);
  const [ready, setReady] = useState([]);
  const [readyAll, setReadyAll] = useState([]); // Tous les créneaux (y compris 3 joueurs) avant filtrage
  const [hot, setHot] = useState([]);
  const [longReady, setLongReady] = useState([]);
  const [hourReady, setHourReady] = useState([]);
  const [matchesPending, setMatchesPending] = useState([]);
  const [matchesConfirmed, setMatchesConfirmed] = useState([]);
  const [rsvpsByMatch, setRsvpsByMatch] = useState({});
  const [profilesById, setProfilesById] = useState({});
  const [allGroupMemberIds, setAllGroupMemberIds] = useState([]);
  const [dataVersion, setDataVersion] = useState(0); // Version pour forcer le re-render des listes
  const [historyMatches, setHistoryMatches] = useState([]); // 5 derniers matchs validés avec résultats
  // États pour les données affichées (mis à jour explicitement)
  const [displayLongSections, setDisplayLongSections] = useState([]);
  const [displayHourReady, setDisplayHourReady] = useState([]);
  const [displayLongSectionsStable, setDisplayLongSectionsStable] = useState([]);
  const [displayHourReadyStable, setDisplayHourReadyStable] = useState([]);
  const [displaySyncTick, setDisplaySyncTick] = useState(0);
  const [proposedTabCountStable, setProposedTabCountStable] = useState(0);
  const [popupSnapshotLongSections, setPopupSnapshotLongSections] = useState(null);
  const [popupSnapshotHourReady, setPopupSnapshotHourReady] = useState(null);
  const [popupSnapshotProposedCount, setPopupSnapshotProposedCount] = useState(null);
  const popupSnapshotActiveRef = useRef(false);
  const proposesTabSnapshotRef = useRef(null);
  const displayUpdateTimerRef = useRef(null);
  // État pour la popup "choisis un groupe"
  const [noGroupModalVisible, setNoGroupModalVisible] = useState(false);
  // Bandeau réseau
  const [networkNotice, setNetworkNotice] = useState(null);
  const retryRef = React.useRef(0);
  const previousGroupIdRef = React.useRef(null); // Pour détecter les changements de groupe vs semaine
  const previousWeekOffsetRef = React.useRef(0); // Pour détecter les changements de semaine
  const [matchCreatedUndoVisible, setMatchCreatedUndoVisible] = useState(false);
  const [pendingCreate, setPendingCreate] = useState(null);
  const [matchCreatedUndoEndsAt, setMatchCreatedUndoEndsAt] = useState(0);
  const [matchCreatedUndoMatchId, setMatchCreatedUndoMatchId] = useState(null);
  const matchCreatedUndoIntervalRef = useRef(null);
  const matchCreatedUndoOnExpireRef = useRef(null);
  const matchCreatedUndoOnConfirmRef = useRef(null);
  const matchCreatedUndoVisibleRef = useRef(false);
  const pendingCreateRef = useRef(null);
  const confirmFiredRef = useRef(false);
  const handleConfirmCreateRef = useRef(null);
  const [confirmCommonClubs, setConfirmCommonClubs] = useState([]);
  const [confirmClubId, setConfirmClubId] = useState(null);
  const [confirmClubSearch, setConfirmClubSearch] = useState('');
  const [confirmClubsLoading, setConfirmClubsLoading] = useState(false);
  const [confirmCreatorId, setConfirmCreatorId] = useState(null);
  const notifiedMatchesRef = useRef(new Set());
  
  // Group selector states
  const [myGroups, setMyGroups] = useState([]);
  const [groupSelectorOpen, setGroupSelectorOpen] = useState(false);

  // Flash Match states
  const [flashMembers, setFlashMembers] = useState([]);
  const [flashLoading, setFlashLoading] = useState(false);
  const [flashSelected, setFlashSelected] = useState([]);
  const [flashPickerOpen, setFlashPickerOpen] = useState(false);
  const [flashQuery, setFlashQuery] = useState('');
  const [flashLevelFilter, setFlashLevelFilter] = useState([]); // Liste de niveaux individuels sélectionnés [1, 2, 3, etc.]
  const [flashLevelFilterVisible, setFlashLevelFilterVisible] = useState(false); // Visibilité de la zone de configuration des niveaux
  const [flashGeoLocationType, setFlashGeoLocationType] = useState(null); // null | 'current' | 'home' | 'work' | 'city'
  const [flashGeoRefPoint, setFlashGeoRefPoint] = useState(null); // { lat, lng, address }
  const [flashGeoCityQuery, setFlashGeoCityQuery] = useState('');
  const [flashGeoCitySuggestions, setFlashGeoCitySuggestions] = useState([]);
  const [flashGeoRadiusKm, setFlashGeoRadiusKm] = useState(null); // null | 10 | 20 | 30 | 40 | 50
  const [flashGeoFilterVisible, setFlashGeoFilterVisible] = useState(false); // Visibilité de la zone de configuration géographique
  const [flashAvailabilityFilter, setFlashAvailabilityFilter] = useState(false); // Filtre par disponibilité
  const [flashAvailableMemberIds, setFlashAvailableMemberIds] = useState(new Set()); // IDs des membres disponibles sur le créneau
  // Modale de profil depuis la liste flash match
  const [flashProfileModalVisible, setFlashProfileModalVisible] = useState(false);
  const [selectedFlashProfile, setSelectedFlashProfile] = useState(null);
  const [flashWhenOpen, setFlashWhenOpen] = useState(false);
  const [flashDateModalOpen, setFlashDateModalOpen] = useState(false);
  const [flashDatePickerModalOpen, setFlashDatePickerModalOpen] = useState(false);
  const [tempDate, setTempDate] = useState(() => new Date());
  const [tempTime, setTempTime] = useState(() => ({ hours: 20, minutes: 0, seconds: 0 }));
  const [flashStart, setFlashStart] = useState(() => {
    const now = new Date();
    const ms = 30 * 60 * 1000;
    const t = new Date(Math.ceil(now.getTime() / ms) * ms);
    t.setMinutes(t.getMinutes() + 30);
    return t;
  });
  const [flashEnd, setFlashEnd] = useState(() => {
    const s = new Date();
    const ms = 30 * 60 * 1000;
    const t = new Date(Math.ceil(s.getTime() / ms) * ms);
    t.setMinutes(t.getMinutes() + 90);
    return t;
  });
  const [flashDurationMin, setFlashDurationMin] = useState(90);

  // Geo Match states
  const [geoModalOpen, setGeoModalOpen] = useState(false);
  const [locationType, setLocationType] = useState('current'); // 'current' | 'home' | 'work' | 'city'
  const [refPoint, setRefPoint] = useState(null); // { lat, lng, address }
  const [cityQuery, setCityQuery] = useState('');
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [radiusKm, setRadiusKm] = useState(20);
  const [zonesList, setZonesList] = useState([]);
  const [comfortRadiusKm, setComfortRadiusKm] = useState(null);
  const [geoZonePickerOpen, setGeoZonePickerOpen] = useState(false);
  const [geoClubsModalOpen, setGeoClubsModalOpen] = useState(false);
  const [geoClubsLoading, setGeoClubsLoading] = useState(false);
  const [geoClubsList, setGeoClubsList] = useState([]);
  const [geoClubsSelected, setGeoClubsSelected] = useState(new Set());
  const [restoringGeoPrefs, setRestoringGeoPrefs] = useState(false);
  const currentZone = React.useMemo(
    () => (zonesList || []).find((z) => String(z.id) === String(myZoneId)),
    [zonesList, myZoneId]
  );
  const [levelRange, setLevelRange] = useState(['1/2']); // Array of selected ranges: ['1/2', '3/4', etc.]
  const [geoStart, setGeoStart] = useState(() => {
    const now = new Date();
    const ms = 30 * 60 * 1000;
    const t = new Date(Math.ceil(now.getTime() / ms) * ms);
    t.setMinutes(t.getMinutes() + 30);
    return t;
  });
  const [geoEnd, setGeoEnd] = useState(() => {
    const s = new Date();
    const ms = 30 * 60 * 1000;
    const t = new Date(Math.ceil(s.getTime() / ms) * ms);
    t.setMinutes(t.getMinutes() + 90);
    return t;
  });
  const [geoDurationMin, setGeoDurationMin] = useState(90);
  const [geoDatePickerModalOpen, setGeoDatePickerModalOpen] = useState(false);
  const [geoTempDate, setGeoTempDate] = useState(() => new Date());
  const [geoTempTime, setGeoTempTime] = useState(() => ({ hours: 20, minutes: 0, seconds: 0 }));
  const [clubs, setClubs] = useState([]);
  const [clubsLoading, setClubsLoading] = useState(false);
  const [selectedClub, setSelectedClub] = useState(null);
  const [geoCreating, setGeoCreating] = useState(false);
  const [myProfile, setMyProfile] = useState(null);
  const [locationPermission, setLocationPermission] = useState(null);
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [availablePlayersLoading, setAvailablePlayersLoading] = useState(false);
  const [clubFallbackModalOpen, setClubFallbackModalOpen] = useState(false);
  const [clubFallbackLoading, setClubFallbackLoading] = useState(false);
  const [clubFallbackSearchQuery, setClubFallbackSearchQuery] = useState('');
  const [clubFallbacks, setClubFallbacks] = useState([]);
  
  // Filtre par niveau ciblé
  const [filterLevels, setFilterLevels] = useState([]); // Liste de niveaux individuels sélectionnés
  const [filterConfigVisible, setFilterConfigVisible] = useState(false); // Visibilité de la zone de configuration
  
  // Le filtre est actif si au moins un niveau est sélectionné
  const filterByLevel = Array.isArray(filterLevels) && filterLevels.length > 0;
  
  // Filtre géographique
  const [filterGeoVisible, setFilterGeoVisible] = useState(false); // Visibilité de la zone de configuration géographique
  const [filterGeoLocationType, setFilterGeoLocationType] = useState(null); // null | 'current' | 'home' | 'work' | 'city'
  const [filterGeoRefPoint, setFilterGeoRefPoint] = useState(null); // { lat, lng, address }
  const [filterGeoCityQuery, setFilterGeoCityQuery] = useState('');
  const [filterGeoCitySuggestions, setFilterGeoCitySuggestions] = useState([]);
  const [filterGeoRadiusKm, setFilterGeoRadiusKm] = useState(null); // null | 10 | 20 | 30 | 40 | 50
  
  // Modale des matchs en feu
  const [hotMatchesModalVisible, setHotMatchesModalVisible] = useState(false);
  
  // Modale d'invitation de membres pour les matchs en feu
  const [inviteHotMatchModalVisible, setInviteHotMatchModalVisible] = useState(false);
  const [hotMatchMembers, setHotMatchMembers] = useState([]);
  const [loadingHotMatchMembers, setLoadingHotMatchMembers] = useState(false);
  const [selectedHotMatch, setSelectedHotMatch] = useState(null);
  const [hotMatchSearchQuery, setHotMatchSearchQuery] = useState('');
  const [hotMatchLevelFilter, setHotMatchLevelFilter] = useState([]); // Liste de niveaux individuels sélectionnés [1, 2, 3, etc.]
  const [hotMatchLevelFilterVisible, setHotMatchLevelFilterVisible] = useState(false); // Visibilité de la zone de configuration des niveaux
  const [hotMatchGeoLocationType, setHotMatchGeoLocationType] = useState(null); // null | 'current' | 'home' | 'work' | 'city'
  const [hotMatchGeoRefPoint, setHotMatchGeoRefPoint] = useState(null); // { lat, lng, address }
  const [hotMatchGeoCityQuery, setHotMatchGeoCityQuery] = useState('');
  const [hotMatchGeoCitySuggestions, setHotMatchGeoCitySuggestions] = useState([]);
  const [hotMatchGeoRadiusKm, setHotMatchGeoRadiusKm] = useState(null); // null | 10 | 20 | 30 | 40 | 50
  const [hotMatchGeoFilterVisible, setHotMatchGeoFilterVisible] = useState(false); // Visibilité de la zone de configuration géographique
  // Modale de profil depuis la liste d'invitation
  const [hotMatchProfileModalVisible, setHotMatchProfileModalVisible] = useState(false);
  const [selectedHotMatchProfile, setSelectedHotMatchProfile] = useState(null);
  // Modale de contacts du joueur
  const [playerContactsModalVisible, setPlayerContactsModalVisible] = useState(false);
  const [selectedPlayerForContacts, setSelectedPlayerForContacts] = useState(null);
  
  // Le filtre géographique est actif si un point de référence est défini
  const filterByGeo = filterGeoRefPoint && filterGeoRefPoint.lat != null && filterGeoRefPoint.lng != null;
  
  // Réinitialiser le rayon à null quand aucune position n'est sélectionnée
  useEffect(() => {
    if (!filterGeoLocationType) {
      setFilterGeoRadiusKm(null);
    }
  }, [filterGeoLocationType]);
  
  // Réinitialiser les filtres quand le groupe change
  useEffect(() => {
    if (groupId) {
      setFilterLevels([]);
      setFilterConfigVisible(false);
      setFilterGeoVisible(false);
      setFilterGeoLocationType(null);
      setFilterGeoRefPoint(null);
      setFilterGeoCityQuery('');
      setFilterGeoCitySuggestions([]);
      setFilterGeoRadiusKm(null);
    }
  }, [groupId]);
  
  const [selectedGeoPlayers, setSelectedGeoPlayers] = useState([]); // Joueurs sélectionnés pour le match géographique

// Bornes de la semaine visible
const { ws: currentWs, we: currentWe } = React.useMemo(
  () => {
    const bounds = weekBoundsFromOffset(weekOffset);
    console.log('[Matches] Week bounds:', 'offset:', weekOffset, 'from:', bounds.ws.toISOString().split('T')[0], 'to:', bounds.we.toISOString().split('T')[0]);
    return bounds;
  },
  [weekOffset]
);

  // Calcul du padding bottom
  const bottomPad = React.useMemo(() => Math.max(140, insets.bottom + 140), [insets.bottom]);

// Listes filtrées sur la semaine visible et non périmées
const longReadyWeek = React.useMemo(
    () => {
      console.log('========================================');
      console.log('[longReadyWeek] 🔍 DÉBUT FILTRAGE');
      console.log('[longReadyWeek] longReady total:', longReady?.length);
      console.log('[longReadyWeek] currentWs:', currentWs, '(semaine début)');
      console.log('[longReadyWeek] currentWe:', currentWe, '(semaine fin)');
      
      if (!longReady || longReady.length === 0) {
        console.log('[longReadyWeek] ⚠️ longReady est vide');
        return [];
      }
      
      // Log des 5 premiers créneaux pour debug
      console.log('[longReadyWeek] Exemples de créneaux (5 premiers):');
      longReady.slice(0, 5).forEach(it => {
        console.log('  - time_slot_id:', it.time_slot_id);
        console.log('    starts_at:', it.starts_at);
        console.log('    ends_at:', it.ends_at);
      });
      
      // Limiter aux créneaux FUTURS uniquement ET à la semaine visible
      const now = new Date();
      const filtered = (longReady || []).filter(it => {
        if (!it.starts_at || !it.ends_at) return false;
        const endTime = new Date(it.ends_at);
        return endTime > now && isInWeekRange(it.starts_at, it.ends_at, currentWs, currentWe);
      });
      
      // Trier par ordre chronologique (starts_at croissant)
      const sorted = filtered.sort((a, b) => {
        const aStart = new Date(a.starts_at || 0).getTime();
        const bStart = new Date(b.starts_at || 0).getTime();
        return aStart - bStart;
      });
      
      // Filtrer pour ne garder que les créneaux où l'utilisateur authentifié est disponible
      const sortedWithMe = meId ? sorted.filter(slot => {
        const readyUserIds = slot.ready_user_ids || [];
        const isUserAvailable = readyUserIds.some(uid => String(uid) === String(meId));
        if (!isUserAvailable) {
          console.log('[longReadyWeek] ⚠️ Créneau exclu (utilisateur non disponible):', slot.time_slot_id, slot.starts_at);
        }
        return isUserAvailable;
      }) : sorted;
      
      // Filtrer par niveau ciblé si activé
      let finalFiltered = sortedWithMe;
      if (filterByLevel) {
        const allowedLevels = new Set(
          (filterLevels || [])
            .map((lvl) => Number(lvl))
            .filter((n) => Number.isFinite(n))
        );
        if (allowedLevels.size > 0) {
          finalFiltered = sortedWithMe.filter(slot => {
            // Filtrer les joueurs pour ne garder que ceux avec les niveaux autorisés
            const userIds = slot.ready_user_ids || [];
            
            // Vérifier d'abord que l'utilisateur authentifié est disponible sur ce créneau
            const isUserAvailable = meId && userIds.some(uid => String(uid) === String(meId));
            if (!isUserAvailable) return false;
            
            const filteredUserIds = userIds.filter(uid => {
              const profile = profilesById[String(uid)];
              if (!profile?.niveau) return false;
              const playerLevel = Number(profile.niveau);
              if (!Number.isFinite(playerLevel)) return false;
              // Vérifier si le niveau du joueur est dans les niveaux autorisés
              return allowedLevels.has(playerLevel);
            });
            
            // Le créneau doit avoir au moins 4 joueurs au total
            // meId compte toujours comme participant (même s'il n'a pas le niveau autorisé)
            // Donc on a besoin de 3 autres joueurs avec le niveau autorisé (3 + meId = 4 au total)
            // Compter le nombre de joueurs autres que meId dans filteredUserIds
            const otherPlayersCount = filteredUserIds.filter(uid => String(uid) !== String(meId)).length;
            return otherPlayersCount >= 3;
          }).map(slot => {
            // Filtrer ready_user_ids pour ne garder que les joueurs autorisés
            const userIds = slot.ready_user_ids || [];
            const filteredUserIds = userIds.filter(uid => {
              const profile = profilesById[String(uid)];
              if (!profile?.niveau) return false;
              const playerLevel = Number(profile.niveau);
              if (!Number.isFinite(playerLevel)) return false;
              return allowedLevels.has(playerLevel);
            });
            
            return {
              ...slot,
              ready_user_ids: filteredUserIds,
            };
          });
          console.log('[longReadyWeek] Après filtrage par niveau:', finalFiltered.length, 'sur', sortedWithMe.length, 'niveaux autorisés:', Array.from(allowedLevels).sort());
        }
      }
      
      // Filtrer par distance géographique si activé
      if (filterByGeo && filterGeoRefPoint && filterGeoRefPoint.lat != null && filterGeoRefPoint.lng != null && filterGeoRadiusKm != null) {
        finalFiltered = finalFiltered.filter(slot => {
          const userIds = slot.ready_user_ids || [];
          
          // Vérifier d'abord que l'utilisateur authentifié est disponible sur ce créneau
          const isUserAvailable = meId && userIds.some(uid => String(uid) === String(meId));
          if (!isUserAvailable) return false;
          
          // Filtrer les joueurs qui sont dans le rayon sélectionné
          const filteredUserIds = userIds.filter(uid => {
            const profile = profilesById[String(uid)];
            if (!profile) return false;
            
            // Utiliser domicile, puis travail, comme position du joueur
            let playerLat = null;
            let playerLng = null;
            if (profile.address_home?.lat && profile.address_home?.lng) {
              playerLat = profile.address_home.lat;
              playerLng = profile.address_home.lng;
            } else if (profile.address_work?.lat && profile.address_work?.lng) {
              playerLat = profile.address_work.lat;
              playerLng = profile.address_work.lng;
            }
            
            if (!playerLat || !playerLng) return false; // Pas de position = exclu
            
            // Calculer la distance
            const distanceKm = haversineKm(filterGeoRefPoint, { lat: playerLat, lng: playerLng });
            return distanceKm <= filterGeoRadiusKm;
          });
          
          // Le créneau doit avoir au moins 4 joueurs au total dans le rayon
          // filteredUserIds inclut l'utilisateur s'il est dans le rayon, donc on a besoin de 4 joueurs au total
          return filteredUserIds.length >= 4;
        }).map(slot => {
          // Filtrer ready_user_ids pour ne garder que les joueurs dans le rayon
          const userIds = slot.ready_user_ids || [];
          const filteredUserIds = userIds.filter(uid => {
            const profile = profilesById[String(uid)];
            if (!profile) return false;
            
            let playerLat = null;
            let playerLng = null;
            if (profile.address_home?.lat && profile.address_home?.lng) {
              playerLat = profile.address_home.lat;
              playerLng = profile.address_home.lng;
            } else if (profile.address_work?.lat && profile.address_work?.lng) {
              playerLat = profile.address_work.lat;
              playerLng = profile.address_work.lng;
            }
            
            if (!playerLat || !playerLng) return false;
            
            const distanceKm = haversineKm(filterGeoRefPoint, { lat: playerLat, lng: playerLng });
            return distanceKm <= filterGeoRadiusKm;
          });
          
          return {
            ...slot,
            ready_user_ids: filteredUserIds,
          };
        });
        console.log('[longReadyWeek] Après filtrage géographique:', finalFiltered.length, 'sur', (sorted || []).length);
      }

      // Filtrer par zone + clubs acceptés
      finalFiltered = finalFiltered
        .map((slot) => filterReadyByZoneAndClubs(slot, profilesById, myZoneId, acceptedClubsByUser, myAcceptedClubs, meId))
        .filter(Boolean);
      
      // Log les créneaux valides
      finalFiltered.slice(0, 5).forEach(it => {
        console.log('[longReadyWeek] ✅ Créneau valide:', it.time_slot_id, 'starts_at:', it.starts_at, 'joueurs:', it.ready_user_ids?.length || 0);
      });
      console.log('[longReadyWeek] Créneaux après filtrage et tri:', finalFiltered.length, 'sur', longReady?.length || 0);
      return finalFiltered;
    },
    [longReady, currentWs, currentWe, filterByLevel, filterLevels, profilesById, filterByGeo, filterGeoRefPoint, filterGeoRadiusKm, dataVersion, meId, myZoneId, acceptedClubsByUser, myAcceptedClubs]
  );
  
const hourReadyWeek = React.useMemo(
    () => {
      console.log('========================================');
      console.log('[hourReadyWeek] 🔍 DÉBUT FILTRAGE');
      console.log('[hourReadyWeek] hourReady total:', hourReady?.length);
      console.log('[hourReadyWeek] currentWs:', currentWs, '(semaine début)');
      console.log('[hourReadyWeek] currentWe:', currentWe, '(semaine fin)');
      
      if (!hourReady || hourReady.length === 0) {
        console.log('[hourReadyWeek] ⚠️ hourReady est vide');
        return [];
      }
      
      // Log des créneaux pour debug
      console.log('[hourReadyWeek] Exemples de créneaux:');
      hourReady.slice(0, 3).forEach(it => {
        console.log('  - time_slot_id:', it.time_slot_id);
        console.log('    starts_at:', it.starts_at);
        console.log('    ends_at:', it.ends_at);
      });
      
      // Limiter aux créneaux FUTURS uniquement ET à la semaine visible
      const now = new Date();
      const filtered = (hourReady || []).filter(it => {
        if (!it.starts_at || !it.ends_at) return false;
        const endTime = new Date(it.ends_at);
        return endTime > now && isInWeekRange(it.starts_at, it.ends_at, currentWs, currentWe);
      });
      
      // Trier par ordre chronologique (starts_at croissant)
      const sorted = filtered.sort((a, b) => {
        const aStart = new Date(a.starts_at || 0).getTime();
        const bStart = new Date(b.starts_at || 0).getTime();
        return aStart - bStart;
      });
      
      // Filtrer pour ne garder que les créneaux où l'utilisateur authentifié est disponible
      const sortedWithMe = meId ? sorted.filter(slot => {
        const readyUserIds = slot.ready_user_ids || [];
        const isUserAvailable = readyUserIds.some(uid => String(uid) === String(meId));
        if (!isUserAvailable) {
          console.log('[hourReadyWeek] ⚠️ Créneau exclu (utilisateur non disponible):', slot.time_slot_id, slot.starts_at);
        }
        return isUserAvailable;
      }) : sorted;
      
      // Filtrer par niveau ciblé si activé
      let finalFiltered = sortedWithMe;
      if (filterByLevel) {
        const allowedLevels = new Set(
          (filterLevels || [])
            .map((lvl) => Number(lvl))
            .filter((n) => Number.isFinite(n))
        );
        if (allowedLevels.size > 0) {
          finalFiltered = sortedWithMe.filter(slot => {
            // Filtrer les joueurs pour ne garder que ceux avec les niveaux autorisés
            const userIds = slot.ready_user_ids || [];
            
            // Vérifier d'abord que l'utilisateur authentifié est disponible sur ce créneau
            const isUserAvailable = meId && userIds.some(uid => String(uid) === String(meId));
            if (!isUserAvailable) return false;
            
            const filteredUserIds = userIds.filter(uid => {
              const profile = profilesById[String(uid)];
              if (!profile?.niveau) return false;
              const playerLevel = Number(profile.niveau);
              if (!Number.isFinite(playerLevel)) return false;
              // Vérifier si le niveau du joueur est dans les niveaux autorisés
              return allowedLevels.has(playerLevel);
            });
            
            // Le créneau doit avoir au moins 4 joueurs au total
            // meId compte toujours comme participant (même s'il n'a pas le niveau autorisé)
            // Donc on a besoin de 3 autres joueurs avec le niveau autorisé (3 + meId = 4 au total)
            // Compter le nombre de joueurs autres que meId dans filteredUserIds
            const otherPlayersCount = filteredUserIds.filter(uid => String(uid) !== String(meId)).length;
            return otherPlayersCount >= 3;
          }).map(slot => {
            // Filtrer ready_user_ids pour ne garder que les joueurs autorisés
            const userIds = slot.ready_user_ids || [];
            const filteredUserIds = userIds.filter(uid => {
              const profile = profilesById[String(uid)];
              if (!profile?.niveau) return false;
              const playerLevel = Number(profile.niveau);
              if (!Number.isFinite(playerLevel)) return false;
              return allowedLevels.has(playerLevel);
            });
            
            return {
              ...slot,
              ready_user_ids: filteredUserIds,
            };
          });
          console.log('[hourReadyWeek] Après filtrage par niveau:', finalFiltered.length, 'sur', sortedWithMe.length, 'niveaux autorisés:', Array.from(allowedLevels).sort());
        }
      }
      
      // Filtrer par distance géographique si activé
      if (filterByGeo && filterGeoRefPoint && filterGeoRefPoint.lat != null && filterGeoRefPoint.lng != null && filterGeoRadiusKm != null) {
        finalFiltered = finalFiltered.filter(slot => {
          const userIds = slot.ready_user_ids || [];
          
          // Vérifier d'abord que l'utilisateur authentifié est disponible sur ce créneau
          const isUserAvailable = meId && userIds.some(uid => String(uid) === String(meId));
          if (!isUserAvailable) return false;
          
          // Filtrer les joueurs qui sont dans le rayon sélectionné
          const filteredUserIds = userIds.filter(uid => {
            const profile = profilesById[String(uid)];
            if (!profile) return false;
            
            // Utiliser domicile, puis travail, comme position du joueur
            let playerLat = null;
            let playerLng = null;
            if (profile.address_home?.lat && profile.address_home?.lng) {
              playerLat = profile.address_home.lat;
              playerLng = profile.address_home.lng;
            } else if (profile.address_work?.lat && profile.address_work?.lng) {
              playerLat = profile.address_work.lat;
              playerLng = profile.address_work.lng;
            }
            
            if (!playerLat || !playerLng) return false; // Pas de position = exclu
            
            // Calculer la distance
            const distanceKm = haversineKm(filterGeoRefPoint, { lat: playerLat, lng: playerLng });
            return distanceKm <= filterGeoRadiusKm;
          });
          
          // Le créneau doit avoir au moins 4 joueurs au total dans le rayon
          // filteredUserIds inclut l'utilisateur s'il est dans le rayon, donc on a besoin de 4 joueurs au total
          return filteredUserIds.length >= 4;
        }).map(slot => {
          // Filtrer ready_user_ids pour ne garder que les joueurs dans le rayon
          const userIds = slot.ready_user_ids || [];
          const filteredUserIds = userIds.filter(uid => {
            const profile = profilesById[String(uid)];
            if (!profile) return false;
            
            let playerLat = null;
            let playerLng = null;
            if (profile.address_home?.lat && profile.address_home?.lng) {
              playerLat = profile.address_home.lat;
              playerLng = profile.address_home.lng;
            } else if (profile.address_work?.lat && profile.address_work?.lng) {
              playerLat = profile.address_work.lat;
              playerLng = profile.address_work.lng;
            }
            
            if (!playerLat || !playerLng) return false;
            
            const distanceKm = haversineKm(filterGeoRefPoint, { lat: playerLat, lng: playerLng });
            return distanceKm <= filterGeoRadiusKm;
          });
          
          return {
            ...slot,
            ready_user_ids: filteredUserIds,
          };
        });
        console.log('[hourReadyWeek] Après filtrage géographique:', finalFiltered.length, 'sur', (sorted || []).length);
      }

      // Filtrer par zone + clubs acceptés
      finalFiltered = finalFiltered
        .map((slot) => filterReadyByZoneAndClubs(slot, profilesById, myZoneId, acceptedClubsByUser, myAcceptedClubs, meId))
        .filter(Boolean);
      
      // Log les créneaux valides
      finalFiltered.forEach(it => {
        console.log('[hourReadyWeek] ✅ Créneau valide:', it.time_slot_id, 'starts_at:', it.starts_at, 'joueurs:', it.ready_user_ids?.length || 0);
      });
      console.log('[hourReadyWeek] Créneaux après filtrage et tri:', finalFiltered.length, 'sur', hourReady?.length || 0);
      // Forcer une nouvelle référence pour garantir que React détecte le changement
      return finalFiltered.map(item => ({ ...item }));
    },
  [hourReady, currentWs, currentWe, filterByLevel, filterLevels, profilesById, filterByGeo, filterGeoRefPoint, filterGeoRadiusKm, dataVersion, meId, myZoneId, acceptedClubsByUser, myAcceptedClubs]
);
  
// Fonction helper pour vérifier si un match n'est pas périmé
const isNotPast = (m) => {
  if (!m?.time_slots?.ends_at) {
    console.log('[isNotPast] Match sans time_slots (conserver):', m.id);
    return true; // Conserver les matches sans time_slots
  }
  const endTime = new Date(m.time_slots.ends_at);
  const isNotPast = endTime > new Date();
  if (!isNotPast) {
    console.log('[isNotPast] Match périmé (exclure):', m.id, 'ends_at:', m.time_slots.ends_at);
  }
  return isNotPast;
};

const pendingWeek = React.useMemo(
    () => (matchesPending || []).filter(isNotPast),
    [matchesPending]
  );
  
const confirmedWeek = React.useMemo(
    () => {
      const filtered = (matchesConfirmed || []).filter(m => {
        // Filtrer les matches passés
        if (!isNotPast(m)) return false;
        
        // Ne garder que les matches où l'utilisateur est un joueur accepté
        if (!meId) return false;
        const rsvps = rsvpsByMatch[m.id] || [];
        const accepted = rsvps.filter(r => (String(r.status || '').toLowerCase() === 'accepted'));
        const isUserInAccepted = accepted.some(r => String(r.user_id) === String(meId));
        
        if (!isUserInAccepted) {
          console.log('[Matches] ConfirmedWeek: Match exclu car utilisateur non accepté:', m.id, 'meId:', meId, 'accepted:', accepted.map(r => r.user_id));
        }
        
        return isUserInAccepted;
      });
      console.log('[Matches] ConfirmedWeek:', filtered.length, 'matches');
      if (filtered.length > 0) {
        console.log('[Matches] First confirmedWeek match:', filtered[0].id, 'time_slots exists:', !!filtered[0].time_slots, 'time_slots data:', filtered[0].time_slots);
      }
      return filtered;
    },
    [matchesConfirmed, meId, rsvpsByMatch]
  );
  
const pendingHourWeek = React.useMemo(
  () => {
    if (!meId) return [];
    return pendingWeek.filter(m => {
      // Vérifier la durée (1h max)
      if (durationMinutes(m?.time_slots?.starts_at, m?.time_slots?.ends_at) > 60) return false;
      
      // Filtrer par semaine
      if (m?.time_slots?.starts_at && m?.time_slots?.ends_at) {
        const inRange = isInWeekRange(m.time_slots.starts_at, m.time_slots.ends_at, currentWs, currentWe);
        if (!inRange) {
          console.log('[pendingHourWeek] Match exclu par isInWeekRange:', m.id, 'starts_at:', m?.time_slots?.starts_at, 'ends_at:', m?.time_slots?.ends_at, 'week:', currentWs.toISOString().split('T')[0], 'to', currentWe.toISOString().split('T')[0]);
          return false;
        }
      }
      
      // Ne montrer que les matchs où le joueur a un RSVP (accepted ou maybe)
      const rsvps = rsvpsByMatch[m.id] || [];
      const mine = rsvps.find((r) => String(r.user_id) === String(meId));
      return mine && (mine.status === 'accepted' || mine.status === 'maybe');
    });
  },
  [pendingWeek, rsvpsByMatch, meId, currentWs, currentWe]
);
  
const pendingLongWeek = React.useMemo(
  () => {
    if (!meId) return [];
    return pendingWeek.filter(m => {
      // Vérifier la durée (1h30 min)
      if (durationMinutes(m?.time_slots?.starts_at, m?.time_slots?.ends_at) <= 60) return false;
      
      // Filtrer par semaine
      if (m?.time_slots?.starts_at && m?.time_slots?.ends_at) {
        const inRange = isInWeekRange(m.time_slots.starts_at, m.time_slots.ends_at, currentWs, currentWe);
        if (!inRange) {
          console.log('[pendingLongWeek] Match exclu par isInWeekRange:', m.id, 'starts_at:', m?.time_slots?.starts_at, 'ends_at:', m?.time_slots?.ends_at, 'week:', currentWs.toISOString().split('T')[0], 'to', currentWe.toISOString().split('T')[0]);
          return false;
        }
      }
      
      // Ne montrer que les matchs où le joueur a un RSVP (accepted ou maybe)
      const rsvps = rsvpsByMatch[m.id] || [];
      const mine = rsvps.find((r) => String(r.user_id) === String(meId));
      return mine && (mine.status === 'accepted' || mine.status === 'maybe');
    });
  },
  [pendingWeek, rsvpsByMatch, meId, currentWs, currentWe]
);

const confirmedHourWeek = React.useMemo(
  () => confirmedWeek.filter(m =>
    durationMinutes(m?.time_slots?.starts_at, m?.time_slots?.ends_at) <= 60
  ),
  [confirmedWeek]
);
  
const confirmedLongWeek = React.useMemo(
  () => confirmedWeek.filter(m =>
    durationMinutes(m?.time_slots?.starts_at, m?.time_slots?.ends_at) > 60
  ),
  [confirmedWeek]
);

// Calculer les matchs en feu : 3 joueurs disponibles dont l'utilisateur authentifié
// Utilise la même logique que longReadyWeek/hourReadyWeek mais avec condition stricte à 3 joueurs
// Et en tenant compte des joueurs déjà engagés (comme adjusted)
const hotMatches = React.useMemo(
  () => {
    if (!meId || !groupId) return [];
    
    // Utiliser readyAll qui contient tous les créneaux (y compris ceux avec 3 joueurs)
    // après enlèvement des joueurs déjà engagés mais avant le filtrage à 4 joueurs
    const allSlots = [...(readyAll || [])];
    
    // Si readyAll est vide, retourner une liste vide
    if (allSlots.length === 0) {
      return [];
    }
    
    // Appliquer les mêmes filtres que longReadyWeek/hourReadyWeek
    const now = new Date();
    const filtered = allSlots.filter(it => {
      if (!it.starts_at || !it.ends_at) return false;
      const endTime = new Date(it.ends_at);
      return endTime > now && isInWeekRange(it.starts_at, it.ends_at, currentWs, currentWe);
    });
    
    // Trier par ordre chronologique
    const sorted = filtered.sort((a, b) => {
      const aStart = new Date(a.starts_at || 0).getTime();
      const bStart = new Date(b.starts_at || 0).getTime();
      return aStart - bStart;
    });
    
    // readyAll contient déjà les créneaux après enlèvement des joueurs engagés
    // On peut utiliser directement sorted
    let adjusted = sorted;
    
    // Appliquer le filtre par niveau si activé (même logique que longReadyWeek)
    let finalFiltered = adjusted;
    if (filterByLevel) {
      const allowedLevels = new Set(
        (filterLevels || [])
          .map((lvl) => Number(lvl))
          .filter((n) => Number.isFinite(n))
      );
      if (allowedLevels.size > 0) {
        finalFiltered = adjusted.filter(slot => {
          const userIds = slot.ready_user_ids || [];
          
          // Vérifier d'abord que l'utilisateur authentifié est disponible sur ce créneau
          const isUserAvailable = meId && userIds.some(uid => String(uid) === String(meId));
          if (!isUserAvailable) return false;
          
          const filteredUserIds = userIds.filter(uid => {
            const profile = profilesById[String(uid)];
            if (!profile?.niveau) return false;
            const playerLevel = Number(profile.niveau);
            if (!Number.isFinite(playerLevel)) return false;
            return allowedLevels.has(playerLevel);
          });
          // Le créneau doit avoir 3 joueurs disponibles ET l'utilisateur doit être disponible
          return filteredUserIds.length === 3;
        }).map(slot => {
          const userIds = slot.ready_user_ids || [];
          const filteredUserIds = userIds.filter(uid => {
            const profile = profilesById[String(uid)];
            if (!profile?.niveau) return false;
            const playerLevel = Number(profile.niveau);
            if (!Number.isFinite(playerLevel)) return false;
            return allowedLevels.has(playerLevel);
          });
          return {
            ...slot,
            ready_user_ids: filteredUserIds,
          };
        });
      }
    }
    
    // Appliquer le filtre géographique si activé (même logique que longReadyWeek)
    if (filterByGeo && filterGeoRefPoint && filterGeoRefPoint.lat != null && filterGeoRefPoint.lng != null && filterGeoRadiusKm != null) {
      finalFiltered = finalFiltered.filter(slot => {
        const userIds = slot.ready_user_ids || [];
        
        // Vérifier d'abord que l'utilisateur authentifié est disponible sur ce créneau
        const isUserAvailable = meId && userIds.some(uid => String(uid) === String(meId));
        if (!isUserAvailable) return false;
        
        const filteredUserIds = userIds.filter(uid => {
          const profile = profilesById[String(uid)];
          if (!profile) return false;
          
          let playerLat = null;
          let playerLng = null;
          if (profile.address_home?.lat && profile.address_home?.lng) {
            playerLat = profile.address_home.lat;
            playerLng = profile.address_home.lng;
          } else if (profile.address_work?.lat && profile.address_work?.lng) {
            playerLat = profile.address_work.lat;
            playerLng = profile.address_work.lng;
          }
          
          if (!playerLat || !playerLng) return false;
          
          const distanceKm = haversineKm(filterGeoRefPoint, { lat: playerLat, lng: playerLng });
          return distanceKm <= filterGeoRadiusKm;
        });
        
        // Le créneau doit avoir 3 joueurs disponibles ET l'utilisateur doit être disponible
        return filteredUserIds.length === 3;
      }).map(slot => {
        const userIds = slot.ready_user_ids || [];
        const filteredUserIds = userIds.filter(uid => {
          const profile = profilesById[String(uid)];
          if (!profile) return false;
          
          let playerLat = null;
          let playerLng = null;
          if (profile.address_home?.lat && profile.address_home?.lng) {
            playerLat = profile.address_home.lat;
            playerLng = profile.address_home.lng;
          } else if (profile.address_work?.lat && profile.address_work?.lng) {
            playerLat = profile.address_work.lat;
            playerLng = profile.address_work.lng;
          }
          
          if (!playerLat || !playerLng) return false;
          
          const distanceKm = haversineKm(filterGeoRefPoint, { lat: playerLat, lng: playerLng });
          return distanceKm <= filterGeoRadiusKm;
        });
        return {
          ...slot,
          ready_user_ids: filteredUserIds,
        };
      });
    }
    
    // Filtrer les créneaux avec exactement 3 joueurs disponibles ET où l'utilisateur est disponible
    // Si aucun filtre n'est activé, utiliser directement adjusted
    if (!filterByLevel && !filterByGeo) {
      finalFiltered = adjusted.filter(slot => {
        const readyUserIds = slot.ready_user_ids || [];
        // Vérifier que l'utilisateur authentifié est disponible sur ce créneau
        const isUserAvailable = meId && readyUserIds.some(uid => String(uid) === String(meId));
        // Le créneau doit avoir 3 joueurs disponibles ET l'utilisateur doit être disponible
        return readyUserIds.length === 3 && isUserAvailable;
      });
    }
    
    // Exclure les créneaux où l'utilisateur a déjà un RSVP (match accepté ou en attente)
    // Mais INCLURE les matchs existants avec 3 joueurs acceptés où l'utilisateur n'a pas encore de RSVP
    if (meId) {
      finalFiltered = finalFiltered.filter(slot => {
        // Vérifier si l'utilisateur a un RSVP pour un match sur ce créneau
        const slotStart = slot.starts_at;
        const slotEnd = slot.ends_at;
        
        // Parcourir tous les matchs pour trouver ceux sur ce créneau
        const allMatches = [...(matchesPending || []), ...(matchesConfirmed || [])];
        const matchOnThisSlot = allMatches.find(m => {
          const matchStart = m?.time_slots?.starts_at;
          const matchEnd = m?.time_slots?.ends_at;
          return matchStart === slotStart && matchEnd === slotEnd;
        });
        
        if (matchOnThisSlot) {
          // Si un match existe déjà sur ce créneau, vérifier si l'utilisateur a un RSVP
          const rsvps = rsvpsByMatch[matchOnThisSlot.id] || [];
          const myRsvp = rsvps.find(r => String(r.user_id) === String(meId));
          if (myRsvp && (myRsvp.status === 'accepted' || myRsvp.status === 'maybe')) {
            // L'utilisateur a déjà un RSVP sur ce créneau, exclure ce match en feu
            return false;
          }
          // Si un match existe déjà mais l'utilisateur n'a pas de RSVP,
          // on l'exclut de finalFiltered car on l'ajoutera plus tard dans la liste des matchs existants
          return false;
        }
        
        return true;
      });
      
      // Ajouter les matchs existants avec exactement 3 joueurs acceptés où l'utilisateur n'a pas de RSVP
      const allMatches = [...(matchesPending || []), ...(matchesConfirmed || [])];
      const existingHotMatches = allMatches.filter(m => {
        // Vérifier que le match est dans la semaine courante
        if (!m?.time_slots?.starts_at || !m?.time_slots?.ends_at) return false;
        const matchStart = new Date(m.time_slots.starts_at);
        const matchEnd = new Date(m.time_slots.ends_at);
        if (matchEnd <= now || !isInWeekRange(m.time_slots.starts_at, m.time_slots.ends_at, currentWs, currentWe)) {
          return false;
        }
        
        // Vérifier les RSVPs de l'utilisateur
        const rsvps = rsvpsByMatch[m.id] || [];
        const myRsvp = rsvps.find(r => String(r.user_id) === String(meId));
        
        // Exclure si l'utilisateur a déjà un RSVP (accepté, refusé, ou en attente)
        if (myRsvp) {
          return false;
        }
        
        // Vérifier le nombre de joueurs acceptés (doit être exactement 3)
        const acceptedRsvps = rsvps.filter(r => r.status === 'accepted');
        if (acceptedRsvps.length !== 3) {
          return false;
        }
        
        // Appliquer les filtres de niveau si activés
        if (filterByLevel) {
          const allowedLevels = new Set(
            (filterLevels || [])
              .map((lvl) => Number(lvl))
              .filter((n) => Number.isFinite(n))
          );
          if (allowedLevels.size > 0) {
            const acceptedUserIds = acceptedRsvps.map(r => r.user_id);
            const allMatchLevel = acceptedUserIds.every(uid => {
              const profile = profilesById[String(uid)];
              if (!profile?.niveau) return false;
              const playerLevel = Number(profile.niveau);
              if (!Number.isFinite(playerLevel)) return false;
              return allowedLevels.has(playerLevel);
            });
            if (!allMatchLevel) return false;
          }
        }
        
        // Appliquer les filtres géographiques si activés
        if (filterByGeo && filterGeoRefPoint && filterGeoRefPoint.lat != null && filterGeoRefPoint.lng != null && filterGeoRadiusKm != null) {
          const acceptedUserIds = acceptedRsvps.map(r => r.user_id);
          const allInRange = acceptedUserIds.every(uid => {
            const profile = profilesById[String(uid)];
            if (!profile) return false;
            
            let playerLat = null;
            let playerLng = null;
            if (profile.address_home?.lat && profile.address_home?.lng) {
              playerLat = profile.address_home.lat;
              playerLng = profile.address_home.lng;
            } else if (profile.address_work?.lat && profile.address_work?.lng) {
              playerLat = profile.address_work.lat;
              playerLng = profile.address_work.lng;
            }
            
            if (!playerLat || !playerLng) return false;
            
            const distanceKm = haversineKm(filterGeoRefPoint, { lat: playerLat, lng: playerLng });
            return distanceKm <= filterGeoRadiusKm;
          });
          if (!allInRange) return false;
        }
        
        return true;
      });
      
      // Convertir les matchs existants en format slot pour les ajouter à finalFiltered
      existingHotMatches.forEach(m => {
        const acceptedRsvps = (rsvpsByMatch[m.id] || []).filter(r => r.status === 'accepted');
        const acceptedUserIds = acceptedRsvps.map(r => r.user_id);
        
        finalFiltered.push({
          time_slot_id: m.time_slot_id,
          starts_at: m.time_slots?.starts_at,
          ends_at: m.time_slots?.ends_at,
          ready_user_ids: acceptedUserIds,
          is_existing_match: true,
          match_id: m.id,
        });
      });
    }
    
    console.log('[hotMatches] 🔥 Matchs en feu trouvés:', finalFiltered.length);
    if (finalFiltered.length > 0) {
      console.log('[hotMatches] Exemples:', finalFiltered.slice(0, 3).map(s => ({
        id: s.time_slot_id,
        starts_at: s.starts_at,
        joueurs: s.ready_user_ids?.length || 0
      })));
    }
    
    // Dédupliquer les créneaux basés sur starts_at et ends_at (même créneau peut avoir plusieurs time_slot_id)
    const uniqueSlots = [];
    const seenSlots = new Set();
    
    for (const slot of finalFiltered) {
      const slotKey = `${slot.starts_at}_${slot.ends_at}`;
      if (!seenSlots.has(slotKey)) {
        seenSlots.add(slotKey);
        uniqueSlots.push(slot);
      }
    }
    
    // Convertir les créneaux en format "match" pour l'affichage
    return uniqueSlots.map(slot => ({
      id: slot.match_id || slot.time_slot_id || `hot-${slot.starts_at}`,
      time_slot_id: slot.time_slot_id,
      match_id: slot.match_id, // Pour les matchs existants
      is_existing_match: slot.is_existing_match || false,
      time_slots: {
        starts_at: slot.starts_at,
        ends_at: slot.ends_at,
      },
      available_user_ids: slot.ready_user_ids || [],
      me_id: meId,
    }));
  },
  [readyAll, meId, groupId, currentWs, currentWe, filterByLevel, filterLevels, profilesById, filterByGeo, filterGeoRefPoint, filterGeoRadiusKm, rsvpsByMatch, matchesPending, matchesConfirmed]
);

  const confirmedHour = React.useMemo(
    () => {
      const filtered = confirmedWeek.filter(m => {
        const duration = durationMinutes(m?.time_slots?.starts_at, m?.time_slots?.ends_at);
        const isHour = duration <= 60;
        if (!isHour) {
          console.log('[Matches] Match filtered out from Hour (duration > 60):', m.id, 'duration:', duration, 'starts_at:', m?.time_slots?.starts_at, 'ends_at:', m?.time_slots?.ends_at);
        }
        return isHour;
      });
      console.log('[Matches] ConfirmedHour matches:', filtered.length);
      return filtered;
    },
    [confirmedWeek]
  );
  
  const confirmedLong = React.useMemo(
    () => {
      const filtered = confirmedWeek.filter(m => {
        const duration = durationMinutes(m?.time_slots?.starts_at, m?.time_slots?.ends_at);
        // Si pas de time_slots ou durée invalide, inclure dans Long par défaut
        if (!m?.time_slots?.starts_at || !m?.time_slots?.ends_at || isNaN(duration)) {
          console.log('[Matches] Match sans time_slots valides (inclus dans Long):', m.id);
          return true;
        }
        const isLong = duration > 60;
        if (!isLong && m?.time_slots?.starts_at) {
          console.log('[Matches] Match filtered out from Long (duration <= 60):', m.id, 'duration:', duration);
        }
        return isLong;
      });
      console.log('[Matches] ConfirmedLong matches:', filtered.length);
      return filtered;
    },
    [confirmedWeek]
  );

// Sections jour → créneaux 1h30 (filtrées semaine)
const longSectionsWeek = React.useMemo(() => {
  const byDay = new Map();
  for (const it of longReadyWeek) {
    const d = new Date(it.starts_at);
    const dayKey = d.toLocaleDateString('fr-FR', { weekday: "long", year: "numeric", month: "2-digit", day: "2-digit" });
    // Garder tous les champs de l'objet original
    const row = { 
      key: it.time_slot_id + "-long", 
      ...it, // Copier tous les champs de l'objet original
    };
    const arr = byDay.get(dayKey) || [];
    arr.push(row);
    byDay.set(dayKey, arr);
  }
  const sections = Array.from(byDay.entries()).map(([title, data]) => ({ title, data: data.sort((a,b)=> new Date(a.starts_at)-new Date(b.starts_at)) }));
  sections.sort((A, B) => {
    const a0 = A.data[0]?.starts_at || A.title;
    const b0 = B.data[0]?.starts_at || B.title;
    return new Date(a0) - new Date(b0);
  });
  console.log('[longSectionsWeek] Sections créées:', sections.length);
  // Forcer une nouvelle référence pour garantir que React détecte le changement
  return sections.map(section => ({
    ...section,
    data: [...section.data].map(item => ({ ...item }))
  }));
}, [longReadyWeek, dataVersion]);

// Helper functions

// --- Conflicts: prevent creating overlapping matches for already reserved players (accepted/maybe) ---
async function findConflictingUsers({ groupId, startsAt, endsAt, userIds = [] }) {
  const ids = Array.from(new Set((userIds || []).map(String))).filter(Boolean);
  if (!groupId || !startsAt || !endsAt || ids.length === 0) return new Set();

  const overlaps = (aStart, aEnd, bStart, bEnd) => {
    if (!aStart || !aEnd || !bStart || !bEnd) return false;
    const as = new Date(aStart).getTime();
    const ae = new Date(aEnd).getTime();
    const bs = new Date(bStart).getTime();
    const be = new Date(bEnd).getTime();
    return as < be && ae > bs;
  };

  // 1) Load pending/confirmed matches for the group with their time slots
  const { data: matches, error: mErr } = await supabase
    .from('matches')
    .select('id, status, time_slot_id, time_slots(*)')
    .eq('group_id', groupId);
  if (mErr || !Array.isArray(matches) || matches.length === 0) return new Set();

  const relevant = matches.filter(m => {
    const st = String(m.status || '').toLowerCase();
    const ms = m?.time_slots?.starts_at || null;
    const me = m?.time_slots?.ends_at || null;
    return (st === 'pending' || st === 'confirmed') && overlaps(startsAt, endsAt, ms, me);
  });
  if (relevant.length === 0) return new Set();

  // 2) Load RSVPs for these matches
  const matchIds = relevant.map(m => m.id);
  const { data: rsvps } = await supabase
    .from('match_rsvps')
    .select('match_id, user_id, status')
    .in('match_id', matchIds);

  const blocked = new Set();
  (rsvps || []).forEach(r => {
    const st = String(r.status || '').toLowerCase();
    if (st === 'accepted' || st === 'maybe') {
      const uid = String(r.user_id);
      if (ids.includes(uid)) blocked.add(uid);
    }
  });
  return blocked;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 16,
    backgroundColor: THEME.bg,
    overflow: 'visible',
  },
  networkNotice: {
    backgroundColor: 'rgba(229, 255, 0, 0.14)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(229, 255, 0, 0.22)',
  },
  networkNoticeText: {
    color: THEME.accent,
    fontWeight: '800',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerTitle: {
    color: THEME.text,
    fontSize: 24,
    fontWeight: '900',
  },
  headerActions: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    backgroundColor: THEME.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 8,
    marginBottom: 12,
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroStat: {
    flex: 1,
    alignItems: 'center',
  },
  heroNumber: {
    color: THEME.accent,
    fontSize: 28,
    fontWeight: '900',
  },
  heroLabel: {
    color: THEME.text,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  heroDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 12,
  },
  segmentWrap: {
    marginBottom: 12,
  },
  segmentWrapFloating: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    zIndex: 20,
    elevation: 12,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 999,
    padding: 0,
    gap: 8,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 68,
    paddingVertical: 0,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  segmentBtnActive: {
    backgroundColor: THEME.accent,
    borderColor: THEME.accent,
  },
  segmentBtnActiveProposes: {
    backgroundColor: '#ff8c00',
    borderColor: '#ff8c00',
  },
  segmentBtnCompact: {
    height: 42,
  },
  segmentText: {
    color: THEME.muted,
    fontSize: 22,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: THEME.ink,
    fontWeight: '900',
  },
  segmentContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: '100%',
  },
  segmentCountWrap: {
    height: 64,
    justifyContent: 'center',
    paddingTop: 2,
  },
  segmentCount: {
    fontSize: 60,
    fontWeight: '900',
    color: THEME.muted,
    lineHeight: 64,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  segmentCountActive: {
    color: '#001833',
    fontSize: 60,
    lineHeight: 64,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  segmentLabelStack: {
    flexDirection: 'column',
    justifyContent: 'center',
    paddingVertical: 0,
  },
  segmentLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.muted,
    lineHeight: 14,
  },
  segmentLabelLarge: {
    fontSize: 14,
    lineHeight: 16,
  },
  segmentLabelActive: {
    color: '#001833',
  },
  segmentLabelStrong: {
    fontSize: 14,
    fontWeight: '900',
  },
  matchCard: {
    backgroundColor: THEME.card,
    padding: 16,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    overflow: 'visible',
  },
  matchCardGlow: {
    marginBottom: 14,
    borderRadius: 28,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  matchCardReserved: {
    borderColor: 'rgba(229,255,0,0.9)',
    borderWidth: 1,
  },
  matchCardGlowReserved: {
    borderWidth: 1,
    borderColor: 'rgba(229,255,0,0.9)',
    backgroundColor: 'rgba(229,255,0,0.22)',
  },
  matchDate: {
    fontWeight: '800',
    color: THEME.text,
    fontSize: 16,
    marginBottom: 10,
  },
  matchDateCentered: {
    textAlign: 'center',
  },
  ctaButton: {
    backgroundColor: THEME.accent,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  ctaPrimary: {
    backgroundColor: THEME.accent,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  ctaPrimaryText: {
    color: THEME.ink,
    fontWeight: '900',
    fontSize: 15,
  },
  ctaSecondary: {
    backgroundColor: '#480c3d',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  ctaSecondaryText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  ctaButtonDisabled: {
    backgroundColor: 'rgba(229,255,0,0.25)',
  },
  ctaButtonPressed: {
    opacity: 0.92,
  },
  ctaText: {
    color: THEME.ink,
    fontWeight: '900',
    fontSize: 15,
  },
  ctaTextDisabled: {
    color: THEME.ink,
    opacity: 0.8,
  },
  ctaSubText: {
    color: THEME.ink,
    fontSize: 11,
    fontWeight: '700',
    opacity: 0.7,
    marginTop: 2,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
    overflow: 'visible',
    flexWrap: 'wrap',
    rowGap: 8,
  },
  avatarItem: {
    marginRight: 10,
    paddingBottom: 6,
  },
  avatarPlus: {
    color: THEME.text,
    fontSize: 22,
    fontWeight: '900',
    marginRight: 10,
    marginTop: 6,
  },
  avatarOverflow: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginBottom: 6,
  },
  avatarOverflowText: {
    color: THEME.text,
    fontWeight: '800',
    fontSize: 14,
  },
  emptyStateWrap: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 24,
  },
  emptyStateCard: {
    backgroundColor: 'rgba(14, 34, 56, 0.75)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  emptyStateTitle: {
    color: THEME.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyStateText: {
    color: THEME.muted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyStateButtons: {
    width: '100%',
    marginTop: 16,
    gap: 10,
  },
  emptyStatePrimary: {
    backgroundColor: THEME.accent,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStatePrimaryText: {
    color: THEME.ink,
    fontWeight: '900',
    fontSize: 15,
  },
  emptyStateSecondary: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  emptyStateSecondaryText: {
    color: THEME.text,
    fontWeight: '800',
    fontSize: 14,
  },
  emptyStateButtonPressed: {
    opacity: 0.9,
  },
  emptyStateTip: {
    color: THEME.muted,
    fontSize: 12,
    marginTop: 12,
    textAlign: 'center',
  },
  partnerSlotsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    columnGap: 10,
    rowGap: 12,
    paddingTop: 10,
    paddingBottom: 8,
  },
  partnerSlot: {
    flex: 1,
    minWidth: 72,
    alignItems: 'center',
  },
  partnerSlotCircleEmpty: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#6d6aff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(109,106,255,0.08)',
  },
  partnerSlotLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  partnerSlotName: {
    color: THEME.text,
    fontWeight: '700',
    fontSize: 12,
    maxWidth: 78,
  },
  partnerSlotLevelBadge: {
    backgroundColor: '#f59e0b',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  partnerSlotLevelText: {
    color: '#111827',
    fontWeight: '900',
    fontSize: 11,
  },
  partnerSlotEmptyText: {
    color: '#6d6aff',
    fontWeight: '700',
    fontSize: 12,
    marginTop: 6,
  },
  partnerPickerRow: {
    marginTop: 6,
  },
  partnerPickerLabel: {
    color: THEME.muted,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  filtersBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: 'transparent',
    zIndex: 1000,
    elevation: 8,
  },
  fabWrap: {
    position: 'absolute',
    right: 13,
    width: 48,
    height: 48,
    borderRadius: 24,
    zIndex: 1000,
  },
  fabButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: THEME.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 10,
  },
});
function normalizeRsvp(s) {
  const t = String(s || '').trim().toLowerCase();
  if (t === 'accepté' || t === 'accepted') return 'accepted';
  if (t === 'peut-être' || t === 'peut etre' || t === 'maybe') return 'maybe';
  if (t === 'non' || t === 'no' || t === 'refusé' || t === 'declined') return 'no';
  return t;
}

function computeAvailableUsersForInterval(startsAt, endsAt, availabilityData) {
  if (!availabilityData || availabilityData.length === 0) return [];
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (!(start instanceof Date) || isNaN(start) || !(end instanceof Date) || isNaN(end) || end <= start) return [];

  // Découper l'intervalle en pas de 30 min et intersecter les joueurs dispos sur chaque tick
  const stepMs = 30 * 60 * 1000;
  const slots = [];
  for (let cur = new Date(start.getTime()); cur.getTime() < end.getTime(); cur = new Date(cur.getTime() + stepMs)) {
    const slotStart = cur;
    const slotEnd = new Date(cur.getTime() + stepMs);
    slots.push([slotStart, slotEnd]);
  }

  let intersection = null; // Set<string>
  for (const [slotStart, slotEnd] of slots) {
    const coveringUsers = new Set(
      availabilityData
        .filter(av => {
          const aStart = new Date(av.start);
          const aEnd = new Date(av.end);
          // La dispo doit COUVRIR entièrement le tick de 30 min
          return aStart.getTime() <= slotStart.getTime() && aEnd.getTime() >= slotEnd.getTime();
        })
        .map(av => String(av.user_id))
    );
    if (intersection == null) {
      intersection = coveringUsers;
    } else {
      // Intersect
      intersection = new Set([...intersection].filter(id => coveringUsers.has(id)));
    }
    if ((intersection?.size || 0) === 0) break; // early exit
  }
  return intersection ? [...intersection] : [];
}

function pickClubGroup(userIds, acceptedMap, myAccepted) {
  if (!Array.isArray(userIds) || userIds.length < 4) return null;
  if (!myAccepted || myAccepted.size === 0) return null;
  const counts = new Map();
  for (const uidRaw of userIds) {
    const uid = String(uidRaw);
    const clubs = acceptedMap[uid];
    if (!Array.isArray(clubs)) return null; // données clubs pas encore chargées
    for (const clubId of clubs) {
      if (!myAccepted.has(clubId)) continue;
      if (!counts.has(clubId)) counts.set(clubId, new Set());
      counts.get(clubId).add(uid);
    }
  }
  let best = null;
  for (const [clubId, set] of counts.entries()) {
    if (set.size < 4) continue;
    if (!best || set.size > best.userIds.length) {
      best = { clubId, userIds: Array.from(set) };
    }
  }
  return best;
}

function getCommonAcceptedClubs(userIds, acceptedMap) {
  if (!Array.isArray(userIds) || userIds.length === 0) return [];
  let common = null;
  for (const uidRaw of userIds) {
    const uid = String(uidRaw);
    const clubs = new Set(acceptedMap[uid] || []);
    if (common === null) {
      common = clubs;
    } else {
      common = new Set([...common].filter((c) => clubs.has(c)));
    }
    if (common.size === 0) return [];
  }
  return Array.from(common || []);
}

function filterReadyByZoneAndClubs(slot, profilesById, myZoneId, acceptedMap, myAccepted, meId) {
  if (!slot) return null;
  if (!myZoneId || !meId) return null;
  const userIds = slot.ready_user_ids || [];
  const filtered = userIds.filter((uid) => {
    const profile = profilesById[String(uid)];
    return profile?.zone_id && String(profile.zone_id) === String(myZoneId);
  });
  const hasMe = meId ? filtered.some((id) => String(id) === String(meId)) : true;
  if (!hasMe) return null;
  const clubGroup = pickClubGroup(filtered, acceptedMap, myAccepted);
  if (!clubGroup || !Array.isArray(clubGroup.userIds) || clubGroup.userIds.length < 4) return null;
  const commonClubIds = getCommonAcceptedClubs(clubGroup.userIds, acceptedMap);
  return {
    ...slot,
    ready_user_ids: clubGroup.userIds,
    common_club_id: clubGroup.clubId,
    common_club_ids: commonClubIds,
  };
}

async function computeAvailableUserIdsForInterval(groupId, startsAt, endsAt) {
  try {
    console.log('[computeAvailableUserIdsForInterval] Querying availability for:', { groupId, startsAt, endsAt });
    
    // Charger toutes les disponibilités effectives du groupe (via get_availability_effective pour modèle hybride)
    const { data: availabilityDataRaw, error } = await supabase.rpc("get_availability_effective", {
      p_group: groupId,
      p_user: null, // tous les utilisateurs
      p_low: startsAt,
      p_high: endsAt,
    });
    
    if (error) {
      console.error('[computeAvailableUserIdsForInterval] Query error:', error);
      return [];
    }
    
    // Filtrer uniquement les 'available'
    const availabilityData = (availabilityDataRaw || []).filter(a => a.status === 'available');
    
    if (!availabilityData || availabilityData.length === 0) {
      console.log('[computeAvailableUserIdsForInterval] No availability data found');
    return [];
    }
    
    console.log('[computeAvailableUserIdsForInterval] Total availability records:', availabilityData.length);
    
    const availableUserIds = computeAvailableUsersForInterval(startsAt, endsAt, availabilityData);
    
    // Exclure les joueurs qui ont déjà un RSVP "maybe" ou "accepted" sur un match pending pour ce créneau
    try {
      const startDate = new Date(startsAt);
      const endDate = new Date(endsAt);
      
      // Récupérer tous les matches pending pour ce groupe qui chevauchent avec ce créneau
      const { data: pendingMatches } = await supabase
        .from('matches')
        .select('id, time_slot_id, status')
        .eq('group_id', groupId)
        .eq('status', 'pending');
      
      if (pendingMatches && pendingMatches.length > 0) {
        // Récupérer les time_slots de ces matches
        const timeSlotIds = pendingMatches.map(m => m.time_slot_id).filter(Boolean);
        if (timeSlotIds.length > 0) {
          const { data: timeSlots } = await supabase
            .from('time_slots')
            .select('id, starts_at, ends_at')
            .in('id', timeSlotIds);
          
          // Identifier les matches qui chevauchent avec ce créneau
          const overlappingMatchIds = new Set();
          (timeSlots || []).forEach(ts => {
            const tsStart = new Date(ts.starts_at);
            const tsEnd = new Date(ts.ends_at);
            // Chevauchement : tsStart < endDate ET tsEnd > startDate
            if (tsStart < endDate && tsEnd > startDate) {
              const match = pendingMatches.find(m => m.time_slot_id === ts.id);
              if (match) overlappingMatchIds.add(match.id);
            }
          });
          
          // Récupérer les RSVPs de ces matches qui chevauchent
          if (overlappingMatchIds.size > 0) {
            const { data: rsvps } = await supabase
              .from('match_rsvps')
              .select('user_id, status, match_id')
              .in('match_id', Array.from(overlappingMatchIds))
              .in('status', ['accepted', 'maybe']);
            
            // Créer un Set des user_ids qui ont déjà un RSVP pending sur ce créneau
            const bookedUserIds = new Set((rsvps || []).map(r => String(r.user_id)));
            
            if (bookedUserIds.size > 0) {
              console.log('[computeAvailableUserIdsForInterval] Excluant', bookedUserIds.size, 'joueurs avec RSVP pending sur créneau qui chevauche');
              // Exclure ces joueurs de la liste disponible
              return availableUserIds.filter(id => !bookedUserIds.has(String(id)));
            }
          }
        }
      }
    } catch (rsvpError) {
      console.warn('[computeAvailableUserIdsForInterval] Erreur lors du filtrage RSVP:', rsvpError);
      // En cas d'erreur, retourner quand même la liste des joueurs disponibles
    }
    
    return availableUserIds;
  } catch (e) {
    console.error('[computeAvailableUserIdsForInterval] Exception:', e);
    return [];
  }
}

async function seedMaybeRsvps({ matchId, groupId, startsAt, endsAt, excludeUserId }) {
  // Seed 'maybe' RSVPs for available players
  try {
    const availableIds = await computeAvailableUserIdsForInterval(groupId, startsAt, endsAt);
    const toSeed = availableIds.filter(id => id !== excludeUserId);
    
    if (toSeed.length > 0) {
      const rows = toSeed.map(uid => ({
        match_id: matchId,
        user_id: uid,
        status: 'maybe',
      }));
      
      await supabase.from('match_rsvps').upsert(rows, { onConflict: 'match_id,user_id' });
    }
  } catch (e) {
    console.warn('[seedMaybeRsvps] failed:', e);
  }
}

const cardStyle = {
  backgroundColor: THEME.card,
  padding: 14,
  borderRadius: 20,
  marginBottom: 14,
  borderWidth: 1,
  borderColor: THEME.cardBorder,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.25,
  shadowRadius: 16,
  elevation: 8,
};

// Composants utilitaires simples
const MetaLine = ({ m }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
    <Text style={{ color: THEME.muted, fontSize: 13 }}>
      Créé le {new Date(m.created_at).toLocaleDateString('fr-FR')}
    </Text>
  </View>
);

const Divider = ({ m = 8 }) => (
  <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: m }} />
);

const Badge = ({ tone = 'blue', text }) => (
  <View
    style={{
      backgroundColor: tone === 'amber' ? 'rgba(229,255,0,0.18)' : 'rgba(255,255,255,0.12)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.08)',
    }}
  >
    <Text style={{ color: THEME.text, fontWeight: '700', fontSize: 12 }}>
      {text}
    </Text>
  </View>
);

const MatchCreatedUndoModal = React.memo(
  ({ visible, durationSeconds = 10, onConfirm, onCancel, onTimeout }) => {
    const [secondsLeft, setSecondsLeft] = React.useState(durationSeconds);
    const firedRef = React.useRef(false);
    const onTimeoutRef = React.useRef(onTimeout);

    // Garder la référence à jour
    React.useEffect(() => {
      onTimeoutRef.current = onTimeout;
    }, [onTimeout]);

    // Gérer le timeout quand secondsLeft atteint 0
    React.useEffect(() => {
      if (secondsLeft === 0 && !firedRef.current && visible) {
        firedRef.current = true;
        // Utiliser setTimeout pour différer l'appel et éviter la mise à jour pendant le rendu
        setTimeout(() => {
          onTimeoutRef.current && onTimeoutRef.current();
        }, 0);
      }
    }, [secondsLeft, visible]);

    React.useEffect(() => {
      if (!visible) return;
      console.log('[MatchesConfirmModal] open');
      firedRef.current = false;
      setSecondsLeft(durationSeconds);
      const id = setInterval(() => {
        setSecondsLeft((prev) => {
          const next = Math.max(0, prev - 1);
          console.log('[MatchesConfirmModal] tick', next);
          return next;
        });
      }, 1000);
      return () => {
        console.log('[MatchesConfirmModal] close');
        clearInterval(id);
      };
    }, [visible, durationSeconds]);

    if (!visible) return null;

    return (
      <Modal transparent animationType="fade" visible={visible} onRequestClose={onCancel}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <View style={{ width: '90%', maxWidth: 420, backgroundColor: '#ffffff', borderRadius: 16, padding: 20 }}>
            <Text style={{ fontWeight: '900', fontSize: 18, color: '#0b2240', marginBottom: 8 }}>
              Match créé 🎾
            </Text>
            <Text style={{ color: '#6b7280', marginBottom: 16 }}>
              😊 Un conseil : avec une piste réservée avant de confirmer, ton match est assuré !
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={onConfirm}
                style={{
                  width: '50%',
                  backgroundColor: '#10b981',
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="checkmark-circle-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 14 }}>
                  Confirmer
                </Text>
              </Pressable>
              <Pressable
                onPress={onCancel}
                style={{
                  width: '50%',
                  backgroundColor: '#b91c1c',
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="close-circle-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 14 }}>
                  Annuler ({secondsLeft}s)
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );
  }
);

const useEnterAnim = (enabled = true) => {
  const enter = React.useRef(new Animated.Value(enabled ? 0 : 1)).current;
  React.useEffect(() => {
    if (!enabled) {
      enter.setValue(1);
      return;
    }
    Animated.timing(enter, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    }).start();
  }, [enter, enabled]);
  const opacity = enter;
  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  return { style: { opacity, transform: [{ translateY }] } };
};

const Avatar = ({ uri, size = 56, rsvpStatus, fallback, phone, onPress, selected, onLongPress }) => {
  // Extraire les initiales (2 lettres)
  let initials = 'U';
  if (fallback) {
    const parts = fallback.trim().split(/\s+/);
    if (parts.length >= 2) {
      initials = (parts[0][0] || 'U') + (parts[1][0] || 'U');
    } else if (parts[0]) {
      initials = parts[0].substring(0, 2).toUpperCase();
    }
  }
  
  const borderColor = rsvpStatus === 'accepted' ? '#10b981' : rsvpStatus === 'no' ? '#ef4444' : rsvpStatus === undefined ? 'transparent' : '#f59e0b';
  const [imageError, setImageError] = React.useState(false);
  
  const isDisabled = !onPress && !onLongPress;
  // Pas de transparence pour les joueurs confirmés (accepted)
  const shouldBeTransparent = isDisabled && !selected && rsvpStatus !== 'accepted';
  
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={450}
      disabled={isDisabled}
      style={{
    width: size,
    height: size,
    borderRadius: size / 2,
        backgroundColor: '#d1d5db',
        borderWidth: selected ? 4 : (rsvpStatus === undefined ? 0 : 2),
        borderColor: selected ? '#e0ff00' : borderColor,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
        opacity: shouldBeTransparent ? 0.5 : 1, // Pas de transparence pour les confirmés
      }}
    >
      {uri && !imageError ? (
    <Image
      source={{ uri }}
          style={{ width: '100%', height: '100%', resizeMode: 'cover' }}
          onError={() => setImageError(true)}
    />
  ) : (
        <Text style={{ 
          fontSize: size < 40 ? size / 2.5 : size / 3, 
          fontWeight: '900', 
          color: '#374151',
          textAlign: 'center',
        }}>
          {initials}
    </Text>
      )}
    </Pressable>
  );
};

const EmptyMatchesState = ({ onAddAvailability, onInvitePlayers, showMissingClubs }) => {
  return (
    <View style={styles.emptyStateWrap}>
      <View style={styles.emptyStateCard}>
        <Text style={styles.emptyStateTitle}>Pas encore de matchs possibles</Text>
        <Text style={styles.emptyStateText}>
          Les matchs se créent à partir des disponibilités des joueurs. Ajoute les tiennes pour lancer la dynamique.
        </Text>
        {showMissingClubs ? (
          <Text style={[styles.emptyStateText, { marginTop: 6, fontWeight: '700', color: '#e0ff00' }]}>
            Sélectionne au moins 1 club accepté pour recevoir des propositions.
          </Text>
        ) : null}
        <View style={styles.emptyStateButtons}>
          <Pressable
            onPress={onAddAvailability}
            accessibilityRole="button"
            accessibilityLabel="Ajouter mes disponibilités"
            style={({ pressed }) => [
              styles.emptyStatePrimary,
              pressed ? styles.emptyStateButtonPressed : null,
            ]}
          >
            <Text style={styles.emptyStatePrimaryText}>Ajouter mes disponibilités</Text>
          </Pressable>
          <Pressable
            onPress={onInvitePlayers}
            accessibilityRole="button"
            accessibilityLabel="Inviter des joueurs"
            style={({ pressed }) => [
              styles.emptyStateSecondary,
              pressed ? styles.emptyStateButtonPressed : null,
            ]}
          >
            <Text style={styles.emptyStateSecondaryText}>Inviter des joueurs</Text>
          </Pressable>
        </View>
        <Text style={styles.emptyStateTip}>Astuce : invite 3 amis → tu multiplies les chances de match.</Text>
      </View>
    </View>
  );
};

  // Compteurs pour les onglets (filtrer par semaine aussi)
  const isDisplayFrozen = Date.now() < freezeDisplayUntilRef.current || isCreatingMatchRef.current || matchCreatedUndoVisibleRef.current;
  const frozenHourReady = isDisplayFrozen ? displayHourReadyStable : displayHourReady;
  const frozenLongSections = isDisplayFrozen ? displayLongSectionsStable : displayLongSections;
  const renderHourReady =
    matchCreatedUndoVisible && Array.isArray(popupSnapshotHourReady)
      ? popupSnapshotHourReady
      : frozenHourReady;
  const renderLongSections =
    matchCreatedUndoVisible && Array.isArray(popupSnapshotLongSections)
      ? popupSnapshotLongSections
      : frozenLongSections;
  const listKeySeed = matchCreatedUndoVisible ? 'popup' : String(dataVersion);
  const longListExtraData = React.useMemo(() => ({ profilesById, dataVersion }), [profilesById, dataVersion]);
  const hourListExtraData = React.useMemo(() => ({ profilesById, dataVersion }), [profilesById, dataVersion]);

  const proposedTabCount = React.useMemo(() => 
    (frozenHourReady || []).filter(it => {
      const endTime = new Date(it.ends_at);
      return endTime > new Date();
    }).length + (frozenLongSections || []).reduce((sum, section) => {
      return sum + (section.data || []).filter(it => {
      const endTime = new Date(it.ends_at);
      return endTime > new Date();
      }).length;
    }, 0)
  , [frozenHourReady, frozenLongSections, freezeVersion]);
  const proposedTabCountDisplay =
    matchCreatedUndoVisible && typeof popupSnapshotProposedCount === 'number'
      ? popupSnapshotProposedCount
      : proposedTabCountStable;
  
  // Matchs à confirmer pour moi : ceux où mon RSVP est "maybe" (je n'ai pas encore confirmé)
  const rsvpTabCount = React.useMemo(() => {
    if (!meId) return 0;
    return (pendingWeek || []).filter(m => {
      // Filtrer par semaine
      if (m?.time_slots?.starts_at && m?.time_slots?.ends_at) {
        const inRange = isInWeekRange(m.time_slots.starts_at, m.time_slots.ends_at, currentWs, currentWe);
        if (!inRange) return false;
      }
      
      // Ne garder que les matchs où mon RSVP est "maybe"
      const rsvps = rsvpsByMatch[m.id] || [];
      const mine = rsvps.find((r) => String(r.user_id) === String(meId));
      return mine && String(mine.status).toLowerCase() === 'maybe';
    }).length;
  }, [pendingWeek, rsvpsByMatch, meId, currentWs, currentWe]);
  
  // Matchs "en attente" pour moi : j'ai déjà confirmé (status "accepted")
  const pendingCount = React.useMemo(() => {
    if (!meId) return 0;
    return (pendingWeek || []).filter(m => {
      // Filtrer par semaine
      if (m?.time_slots?.starts_at && m?.time_slots?.ends_at) {
        const inRange = isInWeekRange(m.time_slots.starts_at, m.time_slots.ends_at, currentWs, currentWe);
        if (!inRange) return false;
      }
      
      // Ne garder que les matchs où mon RSVP est "accepted"
      const rsvps = rsvpsByMatch[m.id] || [];
      const mine = rsvps.find((r) => String(r.user_id) === String(meId));
      return mine && String(mine.status).toLowerCase() === 'accepted';
    }).length;
  }, [pendingWeek, rsvpsByMatch, meId, currentWs, currentWe]);
  
  // Animation de clignotement pour le tab "match à confirmer"
  const rsvpBlinkAnim = useRef(new Animated.Value(1)).current;
  const fabScale = useRef(new Animated.Value(1)).current;
  
  useEffect(() => {
    // Clignoter seulement si le tab n'est pas sélectionné et qu'il y a des matchs à confirmer
    if (tab !== 'rsvp' && rsvpTabCount > 0) {
      const blinkAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(rsvpBlinkAnim, {
            toValue: 0.3,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(rsvpBlinkAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      blinkAnimation.start();
      return () => blinkAnimation.stop();
    } else {
      rsvpBlinkAnim.setValue(1);
    }
  }, [tab, rsvpTabCount, rsvpBlinkAnim]);
  
  const confirmedTabCount = React.useMemo(() => {
    const filtered = (confirmedWeek || []).filter(m => {
      // Si pas de time_slots, inclure dans le compteur (sera affiché dans les listes)
      if (!m?.time_slots?.starts_at || !m?.time_slots?.ends_at) {
        console.log('[ConfirmedTabCount] Match sans time_slots (inclus):', m.id);
        return true;
      }
      const inRange = isInWeekRange(m.time_slots.starts_at, m.time_slots.ends_at, currentWs, currentWe);
      if (!inRange) {
        console.log('[ConfirmedTabCount] Match hors semaine:', m.id, 'starts_at:', m.time_slots.starts_at, 'ends_at:', m.time_slots.ends_at);
      }
      return inRange;
    });
    console.log('[Matches] ConfirmedTabCount (with week filter):', filtered.length, 'matches');
    return filtered.length;
  }, [confirmedWeek, currentWs, currentWe]);
  
  // Compteur des matchs validés sans réservation de terrain
  const confirmedWithoutReservationCount = React.useMemo(() => {
    const filtered = (confirmedWeek || []).filter(m => {
      // Si pas de time_slots, inclure dans le compteur (sera affiché dans les listes)
      if (!m?.time_slots?.starts_at || !m?.time_slots?.ends_at) {
        return true;
      }
      const inRange = isInWeekRange(m.time_slots.starts_at, m.time_slots.ends_at, currentWs, currentWe);
      if (!inRange) return false;
      // Ne compter que ceux sans réservation de terrain
      return !m?.is_court_reserved;
    });
    return filtered.length;
  }, [confirmedWeek, currentWs, currentWe]);
  
  // Version pour forcer le re-render quand RSVPs changent
  const rsvpsVersion = React.useMemo(() => {
    return Object.values(rsvpsByMatch || {}).reduce(
      (n, v) => n + (Array.isArray(v) ? v.length : 0),
      0
    );
  }, [rsvpsByMatch]);

  // Fonction pour charger les données (avec option pour ne pas masquer l'UI)
  const fetchData = useCallback(async (skipLoadingState = false) => {
    if (!groupId) return;
    if (matchCreatedUndoVisibleRef.current) {
      pendingFetchRef.current = true;
      return;
    }
    if ((isCreatingMatchRef.current || isConfirmingRsvpRef.current) && hasDataRef.current && skipLoadingState) {
      return;
    }
    const now = Date.now();
    if (isFetchingRef.current) {
      pendingFetchRef.current = true;
      return;
    }
    if (now - lastFetchAtRef.current < 400) {
      pendingFetchRef.current = true;
      return;
    }
    isFetchingRef.current = true;
    lastFetchAtRef.current = now;
    if (!skipLoadingState && !hasDataRef.current) {
      setLoading(true);
    } else if (skipLoadingState) {
      if (hasDataRef.current) {
        // Ne pas afficher l'overlay si on a déjà des données
    } else {
      const nowWeek = Date.now();
      if (!loadingWeek) {
      setLoadingWeek(true);
      }
      weekLoadingUntilRef.current = Math.max(weekLoadingUntilRef.current, nowWeek + 600);
      }
    }
    try {
      setNetworkNotice(null);
      console.log('[Matches] fetchData called for group:', groupId, 'skipLoadingState:', skipLoadingState);
      // Compute week bounds for limiting virtual slot generation to the visible week
      const { ws: wsBound, we: weBound } = weekBoundsFromOffset(weekOffset);
      const weekStartMs = new Date(wsBound).setHours(0,0,0,0);
      const weekEndMs = new Date(weBound).setHours(23,59,59,999);
      const nowMs = Date.now();
      
      // Charger les créneaux disponibles (time_slots) pour ce groupe
      // Charger d'abord les time_slots et construire la map
      // Charger les créneaux disponibles (time_slots) pour ce groupe
      const { data: timeSlotsData } = await supabase
        .from('time_slots')
        .select('*')
        .eq('group_id', groupId)
        .order('starts_at');

      // Map for quick lookup of time_slots by id
      const timeSlotById = new Map((timeSlotsData || []).map(ts => [ts.id, ts]));

      // Charger les matches AVANT pour savoir lesquels time_slots ont déjà un match bloquant (pending/confirmed futur)
      const { data: matchesDataPreload } = await supabase
        .from('matches')
        .select('id, time_slot_id, status')
        .eq('group_id', groupId);

      // Créer un Set des time_slot_id qui ont déjà un match PENDING/CONFIRMED **à venir**
      const timeSlotsWithMatch = new Set(
        (matchesDataPreload || [])
          .filter((m) => {
            const st = String(m.status || '').toLowerCase();
            if (st !== 'confirmed') return false;
            const ts = m.time_slot_id ? timeSlotById.get(m.time_slot_id) : null;
            if (!ts || !ts.ends_at) return false;
            return new Date(ts.ends_at).getTime() > nowMs; // on ne bloque que les matches futurs
          })
          .map((m) => m.time_slot_id)
          .filter(Boolean)
      );
      console.log('[Matches] Time_slots avec match bloquant (futur):', timeSlotsWithMatch.size);

      // Déclarer ready EN VRAI en dehors du if pour être accessible partout
      let ready = [];

      if (timeSlotsData) {
        // Filtrer les time_slots qui n'ont pas encore de match BLOQUANT et qui sont dans la semaine visible et le futur
        const availableTimeSlots = (timeSlotsData || [])
          .filter((ts) => !timeSlotsWithMatch.has(ts.id))
          .filter((ts) => {
            const endMs = ts?.ends_at ? new Date(ts.ends_at).getTime() : 0;
            return endMs > nowMs && isInWeekRange(ts.starts_at, ts.ends_at, wsBound, weBound);
          });
        console.log('[Matches] Time_slots disponibles:', availableTimeSlots.length, 'sur', timeSlotsData.length);
        
        // Charger UNE FOIS toutes les disponibilités du groupe pour éviter trop de requêtes
        // Utiliser get_availability_effective pour le modèle hybride (comme dans la page semaine)
        let availabilityData = [];
        let availabilityError = null;
        try {
          const { data: availabilityDataRaw, error: rpcErr } = await supabase.rpc("get_availability_effective", {
            p_group: groupId,
            p_user: null, // tous les utilisateurs
            p_low: wsBound?.toISOString?.() || wsBound,
            p_high: weBound?.toISOString?.() || weBound,
          });
          availabilityError = rpcErr || null;
          if (!rpcErr && availabilityDataRaw) {
            // Filtrer uniquement les disponibilités avec status 'available'
            availabilityData = availabilityDataRaw.filter(a => String(a.status || 'available').toLowerCase() === 'available');
          }
        } catch (e) {
          availabilityError = e;
        }
        // Fallback (réseau ou RPC indisponible): lecture directe
        if (availabilityError) {
          console.warn('[Matches] RPC indisponible, fallback table availability:', availabilityError?.message || availabilityError);
          const { data: avFallback, error: avFallbackErr } = await supabase
          .from('availability')
            .select('user_id, start, end, status')
          .eq('group_id', groupId)
            .eq('status', 'available')
            .gte('start', wsBound?.toISOString?.() || wsBound)
            .lt('start', weBound?.toISOString?.() || weBound);
          if (!avFallbackErr && avFallback) availabilityData = avFallback;
          availabilityError = avFallbackErr || null;
        }
        
        console.log('[Matches] Disponibilités chargées:', availabilityData?.length || 0, 'erreur:', availabilityError);
        if (availabilityData && availabilityData.length > 0) {
          console.log('[Matches] Exemple de disponibilité:', availabilityData[0]);
        }
        
        // D'abord, traiter les time_slots existants
        for (const ts of availableTimeSlots) {
          let availUserIds = computeAvailableUsersForInterval(ts.starts_at, ts.ends_at, availabilityData);
          // Conserver tous les joueurs disponibles (y compris l'utilisateur) pour le calcul des matchs en feu
          const allAvailUserIds = availUserIds || [];
          // Exclure moi-même de la liste sélectionnable pour les matchs normaux
          const availUserIdsWithoutMe = allAvailUserIds.filter(uid => String(uid) !== String(meId));
          const availCount = availUserIdsWithoutMe ? availUserIdsWithoutMe.length : 0;
          
          if (availCount >= 4) {
            console.log('[Matches] ✅ Créneau avec 4+ joueurs:', ts.id, 'starts_at:', ts.starts_at, 'joueurs:', availCount);
          }
          
          // Afficher tous les créneaux, même avec moins de 4 joueurs
          // Stocker tous les joueurs disponibles (y compris l'utilisateur) pour les matchs en feu
          ready.push({
            time_slot_id: ts.id,
            starts_at: ts.starts_at,
            ends_at: ts.ends_at,
            ready_user_ids: allAvailUserIds, // Inclure tous les joueurs disponibles (y compris l'utilisateur)
            ready_user_ids_without_me: availUserIdsWithoutMe, // Pour l'affichage normal
            hot_user_ids: [],
          });
        }
        
        // Créer des créneaux virtuels à partir des disponibilités
        if (availabilityData && availabilityData.length > 0) {
          console.log('[Matches] 🎯 Création de créneaux virtuels à partir des disponibilités');

          // Collecter tous les slots possibles **toutes les 30 min** sur la semaine visible
          const allSlots = new Set();
          for (const avail of availabilityData) {
            let aStart = new Date(avail.start);
            const aEnd = new Date(avail.end);

            // Limiter à la semaine visible et au futur
            const windowStartMs = Math.max(nowMs, weekStartMs, aStart.getTime());
            const windowEndMs = Math.min(weekEndMs, aEnd.getTime());
            if (windowEndMs <= windowStartMs) continue;

            // Arrondir le curseur au prochain multiple de 30 min
            const stepMs = 30 * 60 * 1000;
            let cursor = new Date(Math.ceil(windowStartMs / stepMs) * stepMs);
            while (cursor.getTime() < windowEndMs) {
              allSlots.add(cursor.toISOString());
              cursor = new Date(cursor.getTime() + stepMs);
            }
          }

          console.log('[Matches] 🎯 Nombre de slots (ticks 30min) dans la semaine:', allSlots.size);

          // Pour chaque tick de départ, créer des créneaux si 4+ joueurs disponibles
          for (const slotStartISO of allSlots) {
            const slotStart = new Date(slotStartISO);
            const slotEnd60 = new Date(slotStart.getTime() + 60 * 60 * 1000);
            const slotEnd90 = new Date(slotStart.getTime() + 90 * 60 * 1000);

            // Joueurs qui COUVRENT l'intervalle entier (intersection sur ticks 30 min)
            // Conserver tous les joueurs disponibles (y compris l'utilisateur) pour le calcul des matchs en feu
            const allPlayers60 = computeAvailableUsersForInterval(slotStart.toISOString(), slotEnd60.toISOString(), availabilityData);
            const allPlayers90 = computeAvailableUsersForInterval(slotStart.toISOString(), slotEnd90.toISOString(), availabilityData);
            // Exclure l'utilisateur pour l'affichage normal (4+ joueurs)
            const uniquePlayers60 = (allPlayers60 || []).filter(uid => String(uid) !== String(meId));
            const uniquePlayers90 = (allPlayers90 || []).filter(uid => String(uid) !== String(meId));

            // Vérifier si ce créneau virtuel chevauche avec un time_slot existant qui a un match bloquant
            // On permet la création de créneaux virtuels même s'il existe un time_slot, car plusieurs matchs peuvent coexister sur le même créneau horaire
            // On vérifie seulement s'il y a un match confirmed (bloquant) sur un time_slot qui chevauche
            const overlapsWithBlockingMatch = (startsAt, endsAt) => {
              // Vérifier d'abord si un time_slot chevauche
              const overlappingSlots = (timeSlotsData || []).filter(ts => {
                const tsStart = new Date(ts.starts_at);
                const tsEnd = new Date(ts.ends_at);
                return tsStart < endsAt && tsEnd > startsAt;
              });
              
              if (overlappingSlots.length === 0) return false;
              
              // Vérifier si un de ces time_slots a un match confirmed (bloquant)
              const overlappingSlotIds = new Set(overlappingSlots.map(ts => ts.id));
              return (matchesDataPreload || []).some(m => {
                const st = String(m.status || '').toLowerCase();
                return st === 'confirmed' && overlappingSlotIds.has(m.time_slot_id);
              });
            };

            // Afficher les créneaux avec 4+ joueurs disponibles OU 3 joueurs (pour les matchs en feu)
            if (uniquePlayers60.length >= 3) {
              const slotStartISO = slotStart.toISOString();
              const slotEnd60ISO = slotEnd60.toISOString();
              
              // Ne bloquer que si un match confirmed chevauche, sinon permettre la création du créneau virtuel
              if (!overlapsWithBlockingMatch(slotStart, slotEnd60)) {
                ready.push({
                  time_slot_id: `virtual-60-${slotStart.getTime()}`,
                  starts_at: slotStartISO,
                  ends_at: slotEnd60ISO,
                  ready_user_ids: allPlayers60 || [], // Inclure tous les joueurs disponibles (y compris l'utilisateur)
                  ready_user_ids_without_me: uniquePlayers60, // Pour l'affichage normal
                  hot_user_ids: [],
                });
                console.log('[Matches] ✅ Créneau virtuel 1h:', slotStartISO, 'avec', uniquePlayers60.length, 'joueurs');
              } else {
                console.log('[Matches] ⚠️ Créneau virtuel 1h ignoré (chevauche avec match confirmed bloquant):', slotStartISO);
              }
            }

            // Afficher les créneaux avec 4+ joueurs disponibles OU 3 joueurs (pour les matchs en feu)
            if (uniquePlayers90.length >= 3) {
              const slotStartISO = slotStart.toISOString();
              const slotEnd90ISO = slotEnd90.toISOString();
              
              // Ne bloquer que si un match confirmed chevauche, sinon permettre la création du créneau virtuel
              if (!overlapsWithBlockingMatch(slotStart, slotEnd90)) {
                ready.push({
                  time_slot_id: `virtual-90-${slotStart.getTime()}`,
                  starts_at: slotStartISO,
                  ends_at: slotEnd90ISO,
                  ready_user_ids: allPlayers90 || [], // Inclure tous les joueurs disponibles (y compris l'utilisateur)
                  ready_user_ids_without_me: uniquePlayers90, // Pour l'affichage normal
                  hot_user_ids: [],
                });
                console.log('[Matches] ✅ Créneau virtuel 1h30:', slotStartISO, 'avec', uniquePlayers90.length, 'joueurs');
              } else {
                console.log('[Matches] ⚠️ Créneau virtuel 1h30 ignoré (chevauche avec match confirmed bloquant):', slotStartISO);
              }
            }
          }
        }
      } // Fin du if (timeSlotsData)
      
      // Définir ready pour stocker temporairement
      let tempReady = ready;
      
      console.log('[Matches] Créneaux avant post-processing:', tempReady.length);

      // Charger les matches
      const { data: matchesData, error: matchesError } = await supabase
        .from('matches')
        .select('*, time_slots(*)')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });
      
      if (matchesError) {
        console.error('[Matches] Error loading matches:', matchesError);
      }
      
      if (matchesData && matchesData.length > 0) {
        console.log('[Matches] Total matches loaded:', matchesData.length);
        console.log('[Matches] First match sample:', JSON.stringify(matchesData[0], null, 2));
        
        // Vérifier tous les matches confirmés
        const confirmed = matchesData.filter(m => m.status === 'confirmed');
        console.log('[Matches] Confirmed matches:', confirmed.length);
        confirmed.forEach((m, idx) => {
          console.log(`[Matches] Confirmed ${idx + 1}: id=${m.id}, time_slot_id=${m.time_slot_id}, time_slots=`, m.time_slots);
        });
      }

      if (matchesData) {
        // Log les champs de tous les matches confirmés
        const confirmed2 = matchesData.filter(m => m.status === 'confirmed');
        console.log('[Matches] 🔍 DEBUG Confirmed matches, affichage de TOUS les champs:');
        confirmed2.forEach((m, idx) => {
          console.log(`[Matches] Confirmed ${idx + 1} - TOUS LES CHAMPS:`, Object.keys(m));
          console.log(`[Matches] Confirmed ${idx + 1} - OBJET COMPLET:`, m);
        });
      }

      if (matchesData) {
        const pending = matchesData.filter(m => m.status === 'open' || m.status === 'pending');
        const confirmed = matchesData.filter(m => m.status === 'confirmed');
        console.log('[Matches] Pending matches:', pending.length, 'Confirmed matches:', confirmed.length);
        
        // Debug: vérifier si des matches ont 4 RSVPs acceptés
        pending.forEach(m => {
          const rsvps = rsvpsByMatch[m.id] || [];
          const accepted = rsvps.filter(r => String(r.status || '').toLowerCase() === 'accepted');
          console.log('[Matches] Pending match:', m.id, 'status:', m.status, 'RSVPs acceptés:', accepted.length);
        });
        
        // Log tous les matches confirmés avec leurs dates
        confirmed.forEach((m, idx) => {
          const hasTimeSlots = !!(m.time_slots?.starts_at && m.time_slots?.ends_at);
          const endDate = m.time_slots?.ends_at;
          const isPast = endDate ? new Date(endDate) < new Date() : true;
          console.log(`[Matches] Confirmed ${idx}: ${m.id}, hasTimeSlots: ${hasTimeSlots}, ends_at: ${endDate}, isPast: ${isPast}, time_slot_id: ${m.time_slot_id}`);
        });
        
        // Log tous les champs d'un match pour debug
        if (confirmed.length > 0) {
          console.log('[Matches] Sample confirmed match fields:', Object.keys(confirmed[0]));
          console.log('[Matches] Sample confirmed match:', JSON.stringify(confirmed[0], null, 2));
        }
        
        setMatchesPending(pending);
        setMatchesConfirmed(confirmed);
      }

      // Charger les RSVPs via une RPC (bypass RLS) pour récupérer tous les joueurs
      let rsvpsData = [];
      if (matchesData && matchesData.length > 0) {
        const matchIds = matchesData.map(m => m.id).filter(Boolean);
        if (matchIds.length > 0) {
          const { data: rsvps, error: rsvpsError } = await supabase.rpc(
            'get_match_rsvps_for_matches',
            { p_match_ids: matchIds }
          );

          if (rsvpsError) {
            console.error('[Matches] Error loading RSVPs via RPC:', rsvpsError);
            // Fallback: direct select (peut être filtré par RLS)
            const { data: rsvpsFallback, error: fallbackError } = await supabase
          .from('match_rsvps')
            .select('*')
          .in('match_id', matchIds);
            if (fallbackError) {
              console.error('[Matches] Error loading RSVPs fallback:', fallbackError);
            } else if (rsvpsFallback) {
              rsvpsData = rsvpsFallback;
            }
          } else if (rsvps) {
            rsvpsData = rsvps;
          }
        }
      }

      // Déclarer grouped EN VRAI en dehors du if pour être accessible partout
      const grouped = {};

      if (rsvpsData.length > 0) {
        console.log('[Matches] Loaded', rsvpsData.length, 'RSVPs');
        if (rsvpsData[0]) console.log('[Matches] Sample RSVP:', rsvpsData[0]);
        for (const rsvp of rsvpsData) {
          if (!grouped[rsvp.match_id]) grouped[rsvp.match_id] = [];
          grouped[rsvp.match_id].push(rsvp);
        }
        console.log('[Matches] RSVPs grouped by', Object.keys(grouped).length, 'matches');
        setRsvpsByMatch(grouped);
        // Filter relevant matches: only pending/confirmed, valid interval, not finished
        const nowTs = Date.now();
        const relevantMatches = (matchesData || []).filter(m => {
          const st = String(m.status || '').toLowerCase();
          const ms = m?.time_slots?.starts_at || null;
          const me = m?.time_slots?.ends_at || null;
          // consider only pending/confirmed, with valid interval, and not finished
          return (st === 'pending' || st === 'confirmed')
            && !!ms && !!me
            && new Date(me).getTime() > nowTs;
        });
      }

      // Charger les profils - Tous les membres du groupe
      const { data: membersData, error: membersError } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId);

      console.log('[Matches] Group members:', membersData?.length || 0);

      if (membersData && membersData.length > 0) {
        const memberIds = membersData.map(m => m.user_id).filter(Boolean);
        console.log('[Matches] Member IDs:', memberIds);
        setAllGroupMemberIds(memberIds);

        if (memberIds.length > 0) {
          const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
            .select('*')
            .in('id', memberIds);

          if (profilesError) {
            console.error('[Matches] Error loading profiles:', profilesError);
          }

          if (profilesData && profilesData.length > 0) {
            const profilesMap = {};
            profilesData.forEach(p => {
              const key = String(p.id);
              profilesMap[key] = p;
              console.log('[Matches] Profile loaded:', key, p.display_name || p.name || p.email || 'sans nom');
            });
              if (meId && profilesMap[String(meId)]) {
                setMyZoneId(profilesMap[String(meId)]?.zone_id || null);
              }
            
            // S'assurer que le profil du joueur authentifié est toujours inclus
            if (meId && !profilesMap[String(meId)]) {
              console.log('[Matches] Chargement profil joueur authentifié manquant:', meId);
              try {
                const { data: myProfileData, error: myProfileError } = await supabase
                  .from('profiles')
                  .select('*')
                  .eq('id', meId)
                  .maybeSingle();
                if (!myProfileError && myProfileData) {
                  profilesMap[String(meId)] = myProfileData;
                  console.log('[Matches] Profil joueur authentifié chargé:', meId, myProfileData.display_name || myProfileData.name || myProfileData.email || 'sans nom');
                }
              } catch (e) {
                console.warn('[Matches] Erreur chargement profil joueur authentifié:', e);
              }
            }
            
            console.log('[Matches] Loaded', Object.keys(profilesMap).length, 'profiles into map');
            setProfilesById(profilesMap);

            try {
              const { data: clubsData, error: clubsError } = await supabase
                .from("user_clubs")
                .select("user_id, club_id, is_preferred")
                .in("user_id", memberIds)
                .eq("is_accepted", true);
              if (clubsError) throw clubsError;
              const map = {};
              (clubsData || []).forEach((row) => {
                const uid = String(row.user_id);
                if (!map[uid]) map[uid] = [];
                map[uid].push(String(row.club_id));
              });
              setAcceptedClubsByUser(map);
              const mine = map[String(meId)] || [];
              setMyAcceptedClubs(new Set(mine));
            } catch (e) {
              console.warn('[Matches] user_clubs load error:', e?.message || e);
            }
      } else {
            console.warn('[Matches] No profiles loaded for members');
          }
        }
      } else {
        console.warn('[Matches] No members found for group');
      }

      // --- Post-process propositions: remove players already booked on overlapping pending/confirmed matches ---
      // IMPORTANT: On le fait ici car on a maintenant matchesData et grouped chargés
      try {
        const overlaps = (aStart, aEnd, bStart, bEnd) => {
          if (!aStart || !aEnd || !bStart || !bEnd) return false;
          const as = new Date(aStart).getTime();
          const ae = new Date(aEnd).getTime();
          const bs = new Date(bStart).getTime();
          const be = new Date(bEnd).getTime();
          return as < be && ae > bs; // strict overlap
        };

        const reservedUsersForMatch = (mid) => {
          const arr = grouped[mid] || [];
          return new Set(
            arr
              .filter(r => {
                const st = String(r.status || '').toLowerCase();
                return st === 'accepted' || st === 'maybe'; // traiter aussi les "maybe" comme réservés
              })
              .map(r => String(r.user_id))
          );
        };

        // Helper pour vérifier si deux dates sont le même jour
        const isSameDay = (date1, date2) => {
          if (!date1 || !date2) return false;
          const d1 = new Date(date1);
          const d2 = new Date(date2);
          return d1.getFullYear() === d2.getFullYear() &&
                 d1.getMonth() === d2.getMonth() &&
                 d1.getDate() === d2.getDate();
        };
        
        // Collect booked users per overlapping interval from pending/confirmed matches
        // IMPORTANT: Exclure les joueurs avec RSVP "maybe" ou "accepted" sur des matches pending qui chevauchent
        const bookedUsersForInterval = (startsAt, endsAt) => {
          const booked = new Set();
          (matchesData || []).forEach(m => {
            const st = String(m.status || '').toLowerCase();
            // Pour les matches pending, exclure les joueurs avec RSVP "maybe" ou "accepted" seulement si le créneau proposé est entièrement contenu dans le match pending
            // (cela évite d'exclure tous les joueurs d'un créneau de 1h qui chevauche partiellement avec un match pending de 1h30)
            if (st === 'pending') {
              const ms = m?.time_slots?.starts_at || null;
              const me = m?.time_slots?.ends_at || null;
              if (!ms || !me) return;
              const now = new Date();
              if (new Date(me) <= now) return; // ignorer les matches passés
              
              // Vérifier si le créneau proposé est entièrement contenu dans le match pending
              // Le créneau proposé est contenu si son début est >= début du match ET sa fin est <= fin du match
              const propStart = new Date(startsAt).getTime();
              const propEnd = new Date(endsAt).getTime();
              const matchStart = new Date(ms).getTime();
              const matchEnd = new Date(me).getTime();
              
              // Le créneau proposé est entièrement contenu dans le match pending
              const isContained = propStart >= matchStart && propEnd <= matchEnd;
              
              // OU si les créneaux se chevauchent complètement (même début ou même fin)
              const hasSameStart = propStart === matchStart;
              const hasSameEnd = propEnd === matchEnd;
              
              if (isContained || hasSameStart || hasSameEnd) {
                // Ajouter tous les joueurs avec RSVP "maybe" ou "accepted" sur ce match pending
                reservedUsersForMatch(m.id).forEach(uid => booked.add(uid));
                console.log('[Matches] Joueur "maybe/accepted" trouvé sur match pending qui contient le créneau:', ms);
              }
            } else if (st === 'confirmed') {
              // Pour les matches confirmed, garder la logique actuelle (même jour + chevauchement)
            const ms = m?.time_slots?.starts_at || null;
            const me = m?.time_slots?.ends_at || null;
            if (!ms || !me) return;
            const now = new Date();
            if (new Date(me) <= now) return; // ignorer les matches passés
            
            // Vérifier d'abord si c'est le même jour
            if (!isSameDay(startsAt, ms)) {
              return; // Skip si pas le même jour
            }
            
            // Puis vérifier si les horaires se chevauchent (même jour)
            if (!overlaps(startsAt, endsAt, ms, me)) return;
            
            reservedUsersForMatch(m.id).forEach(uid => booked.add(uid));
              console.log('[Matches] Joueur "maybe/accepted" trouvé sur match confirmed qui chevauche (même jour):', ms);
            }
          });
          return booked;
        };

        // Create a deep-adjusted list, removing booked users from ready_user_ids
        let adjusted = tempReady.map(slot => {
          const booked = bookedUsersForInterval(slot.starts_at, slot.ends_at);
          // If none of the booked users are part of this proposition, leave it untouched
          const hasConcerned = (slot.ready_user_ids || []).some(uid => booked.has(String(uid)));
          if (!hasConcerned) {
            return slot; // no change for non-concerned slots
          }
          const nextIds = (slot.ready_user_ids || []).map(String).filter(uid => !booked.has(uid));
          return { ...slot, ready_user_ids: nextIds };
        });

        // Stocker adjusted AVANT le filtrage à 4 joueurs pour les matchs en feu
        setReadyAll(adjusted);

        // Keep only slots with >=4 remaining players
        adjusted = adjusted.filter(slot => Array.isArray(slot.ready_user_ids) && slot.ready_user_ids.length >= 4);

        console.log('[Matches] Après filtrage par conflits (joueurs déjà engagés):', adjusted.length, 'créneaux');

        // Final split by duration
        const longReadyFiltered = adjusted.filter(s => durationMinutes(s.starts_at, s.ends_at) > 60);
        const hourReadyFiltered = adjusted.filter(s => durationMinutes(s.starts_at, s.ends_at) <= 60);

        setReady(adjusted);
        setLongReady(longReadyFiltered);
        setHourReady(hourReadyFiltered);
        if (!matchCreatedUndoVisibleRef.current) {
          setDataVersion(prev => prev + 1); // Incrémenter pour forcer le re-render
        }
        
        // Sur mobile, recalculer et mettre à jour immédiatement les états display
        if (Platform.OS !== 'web') {
          // Recalculer les valeurs filtrées (même logique que dans les useMemo)
          const now = new Date();
          const longFiltered = longReadyFiltered.filter(it => {
            if (!it.starts_at || !it.ends_at) return false;
            const endTime = new Date(it.ends_at);
            return endTime > now && isInWeekRange(it.starts_at, it.ends_at, currentWs, currentWe);
          }).sort((a, b) => new Date(a.starts_at || 0).getTime() - new Date(b.starts_at || 0).getTime());
          
          const hourFiltered = hourReadyFiltered.filter(it => {
            if (!it.starts_at || !it.ends_at) return false;
            const endTime = new Date(it.ends_at);
            return endTime > now && isInWeekRange(it.starts_at, it.ends_at, currentWs, currentWe);
          }).sort((a, b) => new Date(a.starts_at || 0).getTime() - new Date(b.starts_at || 0).getTime());
          
          // Créer les sections pour longReady
          const byDay = new Map();
          for (const it of longFiltered) {
            const d = new Date(it.starts_at);
            const dayKey = d.toLocaleDateString('fr-FR', { weekday: "long", year: "numeric", month: "2-digit", day: "2-digit" });
            const row = { 
              key: it.time_slot_id + "-long", 
              ...it,
            };
            const arr = byDay.get(dayKey) || [];
            arr.push(row);
            byDay.set(dayKey, arr);
          }
          const sections = Array.from(byDay.entries()).map(([title, data]) => ({ 
            title, 
            data: data.sort((a,b)=> new Date(a.starts_at)-new Date(b.starts_at)) 
          }));
          sections.sort((A, B) => {
            const a0 = A.data[0]?.starts_at || A.title;
            const b0 = B.data[0]?.starts_at || B.title;
            return new Date(a0) - new Date(b0);
          });
          
          // Mettre à jour immédiatement les états display
          InteractionManager.runAfterInteractions(() => {
            if (isFetchingRef.current) {
              return;
            }
            if (Date.now() < freezeDisplayUntilRef.current || isCreatingMatchRef.current || matchCreatedUndoVisibleRef.current) {
              return;
            }
            console.log('[Matches] fetchData: Mise à jour directe des états display pour mobile, sections:', sections.length, 'hour:', hourFiltered.length);
            setDisplayLongSections(sections.map(section => ({
              ...section,
              data: section.data.map(item => ({ ...item }))
            })));
            setDisplayHourReady(hourFiltered.map(item => ({ ...item })));
          });
        }
      } catch (e) {
        console.warn('[Matches] Post-process propositions failed, falling back to raw ready list:', e?.message || e);
        const longReadyFiltered = (tempReady || []).filter(s => durationMinutes(s.starts_at, s.ends_at) > 60);
        const hourReadyFiltered = (tempReady || []).filter(s => durationMinutes(s.starts_at, s.ends_at) <= 60);
        setReady(tempReady || []);
        setLongReady(longReadyFiltered);
        setHourReady(hourReadyFiltered);
        if (!matchCreatedUndoVisibleRef.current) {
          setDataVersion(prev => prev + 1); // Incrémenter pour forcer le re-render
        }
        
        // Sur mobile, recalculer et mettre à jour immédiatement les états display
        if (Platform.OS !== 'web') {
          const now = new Date();
          const longFiltered = longReadyFiltered.filter(it => {
            if (!it.starts_at || !it.ends_at) return false;
            const endTime = new Date(it.ends_at);
            return endTime > now && isInWeekRange(it.starts_at, it.ends_at, currentWs, currentWe);
          }).sort((a, b) => new Date(a.starts_at || 0).getTime() - new Date(b.starts_at || 0).getTime());
          
          const hourFiltered = hourReadyFiltered.filter(it => {
            if (!it.starts_at || !it.ends_at) return false;
            const endTime = new Date(it.ends_at);
            return endTime > now && isInWeekRange(it.starts_at, it.ends_at, currentWs, currentWe);
          }).sort((a, b) => new Date(a.starts_at || 0).getTime() - new Date(b.starts_at || 0).getTime());
          
          const byDay = new Map();
          for (const it of longFiltered) {
            const d = new Date(it.starts_at);
            const dayKey = d.toLocaleDateString('fr-FR', { weekday: "long", year: "numeric", month: "2-digit", day: "2-digit" });
            const row = { 
              key: it.time_slot_id + "-long", 
              ...it,
            };
            const arr = byDay.get(dayKey) || [];
            arr.push(row);
            byDay.set(dayKey, arr);
          }
          const sections = Array.from(byDay.entries()).map(([title, data]) => ({ 
            title, 
            data: data.sort((a,b)=> new Date(a.starts_at)-new Date(b.starts_at)) 
          }));
          sections.sort((A, B) => {
            const a0 = A.data[0]?.starts_at || A.title;
            const b0 = B.data[0]?.starts_at || B.title;
            return new Date(a0) - new Date(b0);
          });
          
          InteractionManager.runAfterInteractions(() => {
            if (isFetchingRef.current) {
              return;
            }
            if (Date.now() < freezeDisplayUntilRef.current || isCreatingMatchRef.current || matchCreatedUndoVisibleRef.current) {
              return;
            }
            console.log('[Matches] fetchData: Mise à jour directe des états display pour mobile (fallback), sections:', sections.length, 'hour:', hourFiltered.length);
            setDisplayLongSections(sections.map(section => ({
              ...section,
              data: section.data.map(item => ({ ...item }))
            })));
            setDisplayHourReady(hourFiltered.map(item => ({ ...item })));
          });
        }
      }
      
      hasDataRef.current = Boolean(
        (matchesData && matchesData.length) ||
        (ready && ready.length)
      );
      console.log('[Matches] fetchData completed');
    } catch (e) {
      console.error('[Matches] fetchData error:', e);
      const msg = (e?.message || String(e) || '').toLowerCase();
      const isNetwork = msg.includes('network') || msg.includes('fetch') || msg.includes('gateway');
      if (isNetwork) {
        setNetworkNotice('Hors ligne — tentative de reconnexion…');
        if (retryRef.current < 2) {
          const delay = 1500 * (retryRef.current + 1);
          retryRef.current += 1;
          setTimeout(() => { fetchData(); }, delay);
        }
      }
    } finally {
      if (!skipLoadingState) {
        setLoading(false);
      } else {
        if (hasDataRef.current) {
          // Pas d'overlay à gérer si on a déjà des données
        } else {
          if (weekLoadingTimerRef.current) {
            clearTimeout(weekLoadingTimerRef.current);
          }
          const waitMs = Math.max(0, weekLoadingUntilRef.current - Date.now());
          weekLoadingTimerRef.current = setTimeout(() => {
        setLoadingWeek(false);
          }, waitMs);
        }
      }
      isFetchingRef.current = false;
      if (!matchCreatedUndoVisibleRef.current) {
        setDisplaySyncTick((v) => v + 1);
      }
      if (pendingFetchRef.current) {
        pendingFetchRef.current = false;
        setTimeout(() => fetchData(true), 50);
      }
    }
  }, [groupId, weekOffset]);

  // Charger les données au montage ou quand le groupe change
  useEffect(() => {
    console.log('[Matches] useEffect called, groupId:', groupId, 'weekOffset:', weekOffset);
    if (groupId) {
      // Détecter si c'est un changement de groupe ou juste de semaine
      const isGroupChange = previousGroupIdRef.current !== groupId;
      const isWeekChange = !isGroupChange && previousGroupIdRef.current === groupId && previousWeekOffsetRef.current !== weekOffset;
      
      // Mettre à jour les références
      previousGroupIdRef.current = groupId;
      previousWeekOffsetRef.current = weekOffset;
      
      // Si c'est juste un changement de semaine, utiliser loadingWeek au lieu de loading
      fetchData(isWeekChange); // Passer true si c'est juste un changement de semaine
    } else {
      setLoading(false);
      previousGroupIdRef.current = null;
      previousWeekOffsetRef.current = 0;
    }
  }, [groupId, weekOffset, fetchData]); // ✅ relance aussi quand la semaine visible change

  // Mettre à jour explicitement les données affichées quand les données calculées changent
  // Utiliser useLayoutEffect pour une mise à jour synchrone avant le rendu
  useLayoutEffect(() => {
    if (Date.now() < freezeDisplayUntilRef.current || matchCreatedUndoVisibleRef.current) {
      return;
    }
    if (isFetchingRef.current) {
      return;
    }
    console.log('[Matches] useLayoutEffect: Mise à jour des données affichées, dataVersion:', dataVersion, 'longSectionsWeek:', longSectionsWeek.length, 'hourReadyWeek:', hourReadyWeek.length);
    // Créer de nouvelles copies profondes pour forcer React à détecter le changement
    const newLongSections = longSectionsWeek.map(section => ({
      ...section,
      data: section.data.map(item => ({ ...item }))
    }));
    const newHourReady = hourReadyWeek.map(item => ({ ...item }));
    console.log('[Matches] useLayoutEffect: Mise à jour effective des états display, newLongSections:', newLongSections.length, 'newHourReady:', newHourReady.length);
    
    if (displayUpdateTimerRef.current) {
      clearTimeout(displayUpdateTimerRef.current);
    }
    displayUpdateTimerRef.current = setTimeout(() => {
      if (matchCreatedUndoVisibleRef.current) {
        return;
      }
      setDisplayLongSections(newLongSections);
      setDisplayHourReady(newHourReady);
      setDisplayLongSectionsStable(newLongSections);
      setDisplayHourReadyStable(newHourReady);
      const nextCount =
        (newHourReady || []).filter((it) => new Date(it.ends_at) > new Date()).length +
        (newLongSections || []).reduce((sum, section) => {
          return (
            sum +
            (section.data || []).filter((it) => new Date(it.ends_at) > new Date()).length
          );
        }, 0);
      setProposedTabCountStable(nextCount);
    }, 250);
  }, [longSectionsWeek, hourReadyWeek, dataVersion, displaySyncTick]);

  // Mettre à jour le tab si le paramètre d'URL change
  useEffect(() => {
    const urlTab = params?.tab;
    if (urlTab === 'valides' || urlTab === 'proposes') {
      setTab(urlTab);
    }
  }, [params?.tab]);

  // Charger l'historique des 5 derniers matchs validés
  const loadHistoryMatches = useCallback(async () => {
    if (!groupId || !meId) {
      setHistoryMatches([]);
      return;
    }

    try {
      // APPROCHE EN 2 ÉTAPES : Plus fiable que la jointure
      // 1. D'abord, vérifier TOUS les RSVPs de l'utilisateur pour voir quels statuts existent
      const { data: allUserRsvps, error: debugRsvpsError } = await supabase
        .from('match_rsvps')
        .select('match_id, status')
        .eq('user_id', meId);
      
      if (debugRsvpsError) {
        console.error('[History] Erreur lors du chargement de tous les RSVPs:', debugRsvpsError);
      } else {
        console.log('[History] Tous les RSVPs de l\'utilisateur:', allUserRsvps?.length || 0);
        if (allUserRsvps && allUserRsvps.length > 0) {
          const statusCounts = {};
          allUserRsvps.forEach(r => {
            statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
          });
          console.log('[History] Répartition des statuts RSVP:', statusCounts);
        }
      }
      
      // 2. Charger les RSVPs de l'utilisateur avec status 'accepted', 'yes', ou 'maybe'
      // (peut-être que certains matches utilisent 'maybe' pour les matches confirmés)
      const { data: userRsvps, error: rsvpsError } = await supabase
        .from('match_rsvps')
        .select('match_id, status')
        .eq('user_id', meId)
        .in('status', ['accepted', 'yes', 'maybe']);

      if (rsvpsError) {
        console.error('[History] Error loading user RSVPs:', rsvpsError);
        throw rsvpsError;
      }

      if (!userRsvps || userRsvps.length === 0) {
        console.log('[History] Aucun RSVP accepted/yes/maybe trouvé pour l\'utilisateur:', meId);
        console.log('[History] Vérification: meId =', meId, 'groupId =', groupId);
        setHistoryMatches([]);
        return;
      }

      console.log('[History] RSVPs trouvés:', userRsvps.length, userRsvps);
      const userMatchIds = userRsvps.map(r => r.match_id);
      console.log('[History] Match IDs où l\'utilisateur a un RSVP accepted/yes:', userMatchIds.length, userMatchIds);

      // 2. Charger TOUS les matches correspondants (sans limite) puis prendre les 5 derniers
      // Pas de limite de date - on charge tout puis on trie et on prend les 5 derniers
      const { data: allMatchesData, error: matchesError } = await supabase
        .from('matches')
        .select(`
          id,
          status,
          created_at,
          group_id,
          time_slot_id,
          time_slots (
            id,
            starts_at,
            ends_at
          )
        `)
        .in('id', userMatchIds)
        .eq('group_id', groupId)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: false });
      
      console.log('[History] Requête matches exécutée:', {
        userMatchIdsCount: userMatchIds.length,
        groupId,
        allMatchesFound: allMatchesData?.length || 0
      });
      
      // Prendre les 5 derniers matches
      const matchesData = (allMatchesData || []).slice(0, 5);

      if (matchesError) {
        console.error('[History] Error loading matches:', matchesError);
        throw matchesError;
      }

      if (!matchesData || matchesData.length === 0) {
        console.log('[History] Aucun match trouvé pour les IDs:', userMatchIds);
        console.log('[History] Vérification: groupId =', groupId, 'status = confirmed');
        // Vérifier si les matches existent mais ne correspondent pas aux filtres
        if (userMatchIds.length > 0) {
          const { data: debugMatches } = await supabase
            .from('matches')
            .select('id, group_id, status')
            .in('id', userMatchIds.slice(0, 5));
          console.log('[History] Debug - matches trouvés sans filtres:', debugMatches);
        }
        setHistoryMatches([]);
        return;
      }

      const finalMatches = matchesData;
      const finalMatchIds = finalMatches.map(m => m.id);
      
      console.log('[History] Matches trouvés:', finalMatches.length);
      console.log('[History] meId utilisé:', meId);
      console.log('[History] Match IDs finaux:', finalMatchIds);
      
      // Vérification de sécurité : s'assurer que l'utilisateur a bien un RSVP accepted pour chaque match
      for (const match of finalMatches) {
        const hasRsvp = userRsvps.some(r => String(r.match_id) === String(match.id));
        if (!hasRsvp) {
          console.error('[History] ERREUR: Match', match.id, 'n\'a pas de RSVP accepted pour l\'utilisateur!');
        }
      }
      
      // Charger les résultats de ces matchs
      const { data: resultsData, error: resultsError } = await supabase
        .from('match_results')
        .select(`
          match_id,
          team1_score,
          team2_score,
          winner_team,
          team1_player1_id,
          team1_player2_id,
          team2_player1_id,
          team2_player2_id,
          score_text,
          recorded_at
        `)
        .in('match_id', finalMatchIds);

      if (resultsError) {
        console.warn('[History] Error loading results:', resultsError);
      }

      // Charger TOUS les RSVPs des matches sélectionnés (pour l'affichage de tous les joueurs)
      const { data: allRsvpsData, error: allRsvpsError } = await supabase
        .from('match_rsvps')
        .select('match_id, user_id, status')
        .in('match_id', finalMatchIds);

      if (allRsvpsError) {
        console.warn('[History] Error loading all RSVPs:', allRsvpsError);
      }

      // Créer une map des résultats par match_id
      const resultsByMatchId = new Map();
      (resultsData || []).forEach(result => {
        resultsByMatchId.set(result.match_id, result);
      });

      // Créer une map des RSVPs par match_id pour tous les matches sélectionnés
      const finalRsvpsByMatchId = new Map();
      (allRsvpsData || []).forEach(rsvp => {
        if (!finalRsvpsByMatchId.has(rsvp.match_id)) {
          finalRsvpsByMatchId.set(rsvp.match_id, []);
        }
        finalRsvpsByMatchId.get(rsvp.match_id).push(rsvp);
      });

      // Mettre à jour rsvpsByMatch pour inclure les RSVPs de l'historique
      setRsvpsByMatch(prev => {
        const next = { ...prev };
        finalRsvpsByMatchId.forEach((rsvps, matchId) => {
          next[matchId] = rsvps;
        });
        return next;
      });

      // Combiner les matchs avec leurs résultats
      // Pas besoin de vérifier à nouveau car on a déjà filtré via la requête RSVP
      const matchesWithResults = finalMatches.map(match => ({
        ...match,
        result: resultsByMatchId.get(match.id) || null,
      }));

      console.log('[History] Matches finaux chargés pour l\'utilisateur:', matchesWithResults.length);
      console.log('[History] IDs des matches finaux:', matchesWithResults.map(m => m.id));
      setHistoryMatches(matchesWithResults);
    } catch (e) {
      console.error('[History] Error loading history matches:', e);
      setHistoryMatches([]);
    }
  }, [groupId, meId]);

  // Charger l'historique quand le groupe change ou quand on passe sur l'onglet valides
  useEffect(() => {
    if (tab === 'valides' && groupId) {
      loadHistoryMatches();
    }
  }, [tab, groupId, loadHistoryMatches]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMeId(data?.user?.id ?? null);
    })();
  }, [groupId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!meId || myZoneId) return;
      const { data: p } = await supabase.from("profiles").select("zone_id").eq("id", meId).maybeSingle();
      if (mounted) setMyZoneId(p?.zone_id || null);
    })();
    return () => {
      mounted = false;
    };
  }, [meId, myZoneId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!meId) return;
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("zone_id, comfort_radius_km")
          .eq("id", meId)
          .maybeSingle();
        if (mounted) {
          if (profile?.zone_id && !myZoneId) setMyZoneId(profile.zone_id);
          if (profile?.comfort_radius_km != null) setComfortRadiusKm(profile.comfort_radius_km);
        }
        if (!zonesList.length) {
          const { data: z } = await supabase.from("zones").select("*").order("region").order("name");
          if (mounted) setZonesList(z || []);
        }
      } catch (e) {
        console.warn("[Matches] zones load error:", e?.message || e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [meId, myZoneId, zonesList.length]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!geoClubsModalOpen || !meId || !myZoneId) return;
      try {
        setGeoClubsLoading(true);
        const [{ data: clubsData }, { data: userClubs }] = await Promise.all([
          supabase
            .from("clubs")
            .select("id, name, zone_id, is_active")
            .eq("zone_id", myZoneId)
            .eq("is_active", true)
            .order("name"),
          supabase
            .from("user_clubs")
            .select("club_id")
            .eq("user_id", meId)
            .eq("is_accepted", true)
        ]);
        const selected = new Set((userClubs || []).map((r) => String(r.club_id)));
        if (mounted) {
          setGeoClubsList(clubsData || []);
          setGeoClubsSelected(selected);
        }
      } catch (e) {
        Alert.alert("Erreur", "Impossible de charger les clubs.");
      } finally {
        if (mounted) setGeoClubsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [geoClubsModalOpen, meId, myZoneId]);

  const persistGeoPrefs = useCallback(async (groupId, patch) => {
    if (!groupId) return;
    try {
      const key = GEO_PREFS_KEY(groupId);
      const prevRaw = await AsyncStorage.getItem(key);
      const prev = prevRaw ? JSON.parse(prevRaw) : {};
      const next = { ...prev, ...patch, updated_at: Date.now() };
      await AsyncStorage.setItem(key, JSON.stringify(next));
    } catch {}
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!meId || !activeGroup?.id || activeGroup?.club_id) return;
      setRestoringGeoPrefs(true);
      try {
        const raw = await AsyncStorage.getItem(GEO_PREFS_KEY(activeGroup.id));
        if (!raw) return;
        const prefs = JSON.parse(raw);
        if (prefs?.zone_id) {
          await supabase.from("profiles").update({ zone_id: prefs.zone_id }).eq("id", meId);
          if (mounted) setMyZoneId(prefs.zone_id);
        }
        if (prefs?.comfort_radius_km != null) {
          await supabase.from("profiles").update({ comfort_radius_km: prefs.comfort_radius_km }).eq("id", meId);
          if (mounted) setComfortRadiusKm(prefs.comfort_radius_km);
        }
        if (Array.isArray(prefs?.club_ids)) {
          await supabase.from("user_clubs").delete().eq("user_id", meId);
          if (prefs.club_ids.length) {
            const payload = prefs.club_ids.map((clubId) => ({
              user_id: meId,
              club_id: clubId,
              is_accepted: true,
              is_preferred: false
            }));
            await supabase.from("user_clubs").upsert(payload, { onConflict: "user_id,club_id" });
            if (mounted) setMyAcceptedClubs(new Set(prefs.club_ids.map(String)));
          } else if (mounted) {
            setMyAcceptedClubs(new Set());
          }
        }
      } catch (e) {
        console.warn("[Matches] restore geo prefs failed:", e?.message || e);
      } finally {
        if (mounted) setRestoringGeoPrefs(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [activeGroup?.id, activeGroup?.club_id, meId]);

  // Si le groupe actif est lié à un club, forcer clubs acceptés + zone
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!meId || !activeGroup?.id || !activeGroup?.club_id) return;
      const syncKey = `${activeGroup.id}:${activeGroup.club_id}`;
      try {
        const prev = await AsyncStorage.getItem("last_group_club_sync");
        if (prev === syncKey) return;

        const { data: club } = await supabase
          .from("clubs")
          .select("id, zone_id")
          .eq("id", activeGroup.club_id)
          .maybeSingle();

        await supabase
          .from("user_clubs")
          .delete()
          .eq("user_id", meId);

        await supabase
          .from("user_clubs")
          .upsert(
            [{
              user_id: meId,
              club_id: activeGroup.club_id,
              is_accepted: true,
              is_preferred: true
            }],
            { onConflict: "user_id,club_id" }
          );

        if (club?.zone_id) {
          await supabase
            .from("profiles")
            .update({ zone_id: club.zone_id })
            .eq("id", meId);
          if (mounted) setMyZoneId(club.zone_id);
        }

        if (mounted) setMyAcceptedClubs(new Set([String(activeGroup.club_id)]));
        await AsyncStorage.setItem("last_group_club_sync", syncKey);
      } catch (e) {
        console.warn("[Matches] auto sync group club failed:", e?.message || e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [activeGroup?.id, activeGroup?.club_id, meId]);

  // Afficher le bandeau "Groupe rejoint" une seule fois
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      let timer;
      (async () => {
        const banner = await popInviteJoinedBanner();
        if (mounted && banner) {
          setInviteBanner(banner);
          timer = setTimeout(() => setInviteBanner(null), 5000);
        }
      })();
      return () => {
        mounted = false;
        if (timer) clearTimeout(timer);
      };
    }, [])
  );

  // Vérifier si un groupe est sélectionné au focus
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      (async () => {
        let zoneIdFromProfile = myZoneId;
        if (mounted && meId) {
          try {
            const { data: p } = await supabase
              .from("profiles")
              .select("zone_id")
              .eq("id", meId)
              .maybeSingle();
            if (mounted && p?.zone_id) {
              zoneIdFromProfile = p.zone_id;
              setMyZoneId(p.zone_id);
            }
          } catch {}
        }
        if (mounted && meId && !zoneIdFromProfile) {
          Alert.alert("Zone requise", "Choisis d'abord ta zone de jeu.");
          router.replace("/zone");
          return;
        }
        if (mounted && !activeGroup?.id) {
          // Pas de groupe sélectionné, afficher popup
          setNoGroupModalVisible(true);
        }
      })();
      return () => { mounted = false; };
    }, [activeGroup?.id, meId, myZoneId])
  );

  // Rafraîchir les clubs acceptés au retour sur l'écran
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      (async () => {
        if (!meId) return;
        try {
          const { data } = await supabase
            .from("user_clubs")
            .select("club_id")
            .eq("user_id", meId)
            .eq("is_accepted", true);
          if (mounted) {
            const ids = (data || []).map((r) => String(r.club_id));
            setMyAcceptedClubs(new Set(ids));
          }
        } catch {}
      })();
      return () => {
        mounted = false;
      };
    }, [meId])
  );

  // Charger les groupes de l'utilisateur
  const loadMyGroups = useCallback(async () => {
    try {
      const { data: u } = await supabase.auth.getUser();
      const me = u?.user?.id;
      if (!me) return;

      const { data: myMemberships, error: eMemb } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", me);
      if (eMemb) throw eMemb;
      const myIds = [...new Set((myMemberships ?? []).map((r) => r.group_id))];

      let myGroupsList = [];
      if (myIds.length) {
        const { data, error } = await supabase
          .from("groups")
          .select("id, name, avatar_url, club_id")
          .in("id", myIds)
          .order("created_at", { ascending: false });
        if (error) throw error;
        myGroupsList = data ?? [];
      }

      setMyGroups(myGroupsList);
    } catch (e) {
      console.warn('[Matches] loadMyGroups error:', e?.message ?? String(e));
    }
  }, []);

  useEffect(() => {
    if (meId) loadMyGroups();
  }, [meId, loadMyGroups]);

  const getInviteCodeForShare = useCallback(async () => {
    if (!activeGroup?.id) return null;
    try {
      const { data, error } = await supabase.rpc('get_or_create_group_invite_code', {
        p_group_id: activeGroup.id,
      });
      if (error) throw error;
      return data || null;
    } catch (e) {
      console.warn('[EmptyMatches] invite code error:', e?.message || String(e));
      return null;
    }
  }, [activeGroup?.id]);

  const onAddAvailability = useCallback(() => {
    router.push('/(tabs)/semaine');
  }, [router]);

  const onInvitePlayers = useCallback(async () => {
    if (!activeGroup?.id) {
      Alert.alert('Groupe requis', 'Sélectionne un groupe pour inviter des joueurs.');
      return;
    }
    try {
      const inviteCode = await getInviteCodeForShare();
      const codeLine = inviteCode || 'CODE_INDISPONIBLE';
      const inviteLink = inviteCode ? `https://syncpadel.app/invite/${inviteCode}` : null;
      const groupLabel = activeGroup?.name ? ` (${activeGroup.name})` : '';
      const message =
        `Rejoins notre groupe Padel Sync${groupLabel} 🎾\n` +
        `👉 ${inviteLink || 'Lien indisponible'}\n` +
        `(ou avec le code : ${codeLine})`;

      await Share.share({ message });
    } catch (e) {
      console.error('[EmptyMatches] share error:', e);
      Alert.alert('Partage impossible', e?.message || String(e));
    }
  }, [activeGroup?.id, activeGroup?.name, getInviteCodeForShare]);

  // Activer un groupe
  const onSelectGroup = useCallback(async (g) => {
    try {
      if (!g?.id) return;
      setActiveGroup(g);
      setGroupSelectorOpen(false);
      try {
        await AsyncStorage.setItem("active_group_id", String(g.id));
      } catch (err) {
        console.warn("[Matches] AsyncStorage.setItem failed:", err?.message || err);
      }
    } catch (e) {
      console.error("[Matches] onSelectGroup error:", e);
      Alert.alert("Erreur", e?.message ?? String(e));
    }
  }, [setActiveGroup]);

  // Realtime: mise à jour fine sur INSERT/UPDATE/DELETE de matches (sans full refetch)
  useEffect(() => {
    if (!groupId) return;
    const ch = supabase
      .channel(`matches:${groupId}`)
      .on(
        "postgres_changes",
        { event: '*', schema: 'public', table: 'matches', filter: `group_id=eq.${groupId}` },
        (payload) => {
          const ev = String(payload?.eventType || '').toUpperCase();
          const rowNew = payload?.new || null;
          const rowOld = payload?.old || null;
          const row = rowNew || rowOld;
          console.log('[Realtime MATCH]', ev, row);
          if (!row) return;
          const matchId = String(rowNew?.id ?? rowOld?.id ?? '');
          if (!matchId) return;
          const status = String(rowNew?.status ?? rowOld?.status ?? '').toLowerCase();
          const time_slot_id = rowNew?.time_slot_id ?? rowOld?.time_slot_id ?? null;

          const removeFrom = (setter, id) => setter((prev = []) => prev.filter((x) => String(x.id) !== String(id)));
          const upsertInto = (setter, m) => setter((prev = []) => {
            const map = new Map(prev.map((x) => [String(x.id), x]));
            map.set(String(m.id), m);
            const arr = Array.from(map.values());
            arr.sort((a, b) => new Date(a?.time_slots?.starts_at || 0) - new Date(b?.time_slots?.starts_at || 0));
            return arr;
          });

          const ensureTimeSlot = async (m) => {
            if (m?.time_slots?.starts_at && m?.time_slots?.ends_at) return m;
            if (!time_slot_id) return m;
            const { data: ts } = await supabase
              .from('time_slots')
              .select('id, starts_at, ends_at')
              .eq('id', time_slot_id)
              .maybeSingle();
            if (ts) m.time_slots = { id: ts.id, starts_at: ts.starts_at, ends_at: ts.ends_at };
            return m;
          };

          (async () => {
            if (Date.now() < freezeDisplayUntilRef.current || matchCreatedUndoVisibleRef.current || isCreatingMatchRef.current || isConfirmingRsvpRef.current) {
              return;
            }
            if (ev === 'DELETE') {
              removeFrom(setMatchesPending, matchId);
              removeFrom(setMatchesConfirmed, matchId);
              return;
            }

            let m = {
              id: matchId,
              group_id: groupId,
              status,
              time_slot_id,
              is_court_reserved: Boolean(rowNew?.is_court_reserved ?? rowOld?.is_court_reserved ?? false),
              court_reserved_at: rowNew?.court_reserved_at ?? rowOld?.court_reserved_at ?? null,
              court_reserved_by: rowNew?.court_reserved_by ?? rowOld?.court_reserved_by ?? null,
              time_slots: rowNew?.time_slots || rowOld?.time_slots || {},
            };
            m = await ensureTimeSlot(m);

            if (status === 'confirmed') {
              removeFrom(setMatchesPending, matchId);
              upsertInto(setMatchesConfirmed, m);
            } else if (status === 'open' || status === 'pending') {
              removeFrom(setMatchesConfirmed, matchId);
              upsertInto(setMatchesPending, m);
            } else {
              // autres statuts: retirer des deux listes
              removeFrom(setMatchesPending, matchId);
              removeFrom(setMatchesConfirmed, matchId);
            }
          })();
        }
      )
      .subscribe((status) => {
        console.log('[Realtime MATCH] channel status =', status);
      });

    return () => {
      supabase.removeChannel(ch);
    };
  }, [groupId]);

  // Realtime: fine-grained RSVP updates (optimistic, no full refetch)
  useEffect(() => {
    if (!groupId) return;
    const ch = supabase
      .channel(`match_rsvps:${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_rsvps" },
        (payload) => {
          try {
            const ev = String(payload?.eventType || '').toUpperCase();
            const rowNew = payload?.new || null;
            const rowOld = payload?.old || null;
            const matchId = String((rowNew?.match_id ?? rowOld?.match_id) || '');
            const userId  = String((rowNew?.user_id  ?? rowOld?.user_id)  || '');

            if (!matchId || !userId) return;

            // Debug log for RSVP event
            console.log('[Realtime RSVP]', ev, { matchId, userId, new: rowNew, old: rowOld });

            if (Date.now() < freezeDisplayUntilRef.current || matchCreatedUndoVisibleRef.current || isConfirmingRsvpRef.current) {
              return;
            }
            setRsvpsByMatch((prev) => {
              const next = { ...prev };
              const arr = Array.isArray(next[matchId]) ? [...next[matchId]] : [];

              if (ev === 'INSERT' || ev === 'UPDATE') {
                const i = arr.findIndex((r) => String(r.user_id) === userId);
                const item = {
                  user_id: userId,
                  status: String(rowNew?.status || '').toLowerCase(),
                  created_at: rowNew?.created_at || arr[i]?.created_at || null,
                };
                if (i >= 0) arr[i] = { ...arr[i], ...item };
                else arr.push(item);
                next[matchId] = arr;
                if (rsvpRefreshTimerRef.current) {
                  clearTimeout(rsvpRefreshTimerRef.current);
                }
                rsvpRefreshTimerRef.current = setTimeout(() => {
                  rsvpRefreshTimerRef.current = null;
                  fetchData(true);
                }, 800); // ✅ debounce pour éviter les scintillements
                return next;
              }

              if (ev === 'DELETE') {
                const i = arr.findIndex((r) => String(r.user_id) === userId);
                if (i >= 0) {
                  arr.splice(i, 1);
                  next[matchId] = arr;
                }
                if (rsvpRefreshTimerRef.current) {
                  clearTimeout(rsvpRefreshTimerRef.current);
                }
                rsvpRefreshTimerRef.current = setTimeout(() => {
                  rsvpRefreshTimerRef.current = null;
                  fetchData(true);
                }, 800); // ✅ debounce pour éviter les scintillements
                return next;
              }

              return prev;
            });
          } catch (e) {
            // Fallback: if anything goes wrong, do a light refresh
            fetchData();
          }
        }
      )
      .subscribe((status) => {
        console.log('[Realtime RSVP] channel status =', status);
      });

    return () => {
      supabase.removeChannel(ch);
      if (rsvpRefreshTimerRef.current) {
        clearTimeout(rsvpRefreshTimerRef.current);
        rsvpRefreshTimerRef.current = null;
      }
    };
  }, [groupId, fetchData]);

  // Listener pour les changements de disponibilité depuis la page semaine
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('AVAILABILITY_CHANGED', (data) => {
      console.log('[Matches] AVAILABILITY_CHANGED event received:', data);
      if (data?.groupId && String(data.groupId) === String(groupId)) {
        console.log('[Matches] ✅ Availability changed for current group, reloading fetchData...');
        if (isCreatingMatchRef.current) {
          return;
        }
        // Débounce pour éviter les rafales de rechargement
        if (availabilityRefreshTimerRef.current) {
          clearTimeout(availabilityRefreshTimerRef.current);
        }
        availabilityRefreshTimerRef.current = setTimeout(() => {
          fetchData(true);
        }, 300);
      } else {
        console.log('[Matches] ⏭️ Availability changed for different group, skipping');
      }
    });

    return () => {
      subscription.remove();
      if (availabilityRefreshTimerRef.current) {
        clearTimeout(availabilityRefreshTimerRef.current);
        availabilityRefreshTimerRef.current = null;
      }
    };
  }, [groupId, fetchData]);

  // --- Flash Match helpers ---
  async function loadGroupMembersForFlash(targetGroupId = null) {
    const idToUse = targetGroupId || groupId;
    
    if (!idToUse) {
      console.warn('[FlashMatch] loadGroupMembersForFlash: groupId is null or undefined');
      return [];
    }
    
    console.log('[FlashMatch] loadGroupMembersForFlash: groupId =', idToUse);
    
    try {
      // Essai 1 : récupérer les membres avec jointure profiles si relation existante
      let { data, error } = await supabase
        .from('group_members')
        .select('user_id, profiles!inner(id, display_name, name, niveau)')
        .eq('group_id', idToUse);

      console.log('[FlashMatch] Essai 1 - jointure profiles:', { dataLength: data?.length, error: error?.message });

      // Si la jointure échoue (data vide ou erreur), fallback manuel
      if (error || !Array.isArray(data) || data.length === 0) {
        console.warn('[FlashMatch] fallback: pas de jointure profiles détectée, erreur:', error?.message);
        
        // Fallback : récupérer d'abord les user_id
        const { data: gm, error: gmError } = await supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', idToUse);

        console.log('[FlashMatch] Fallback - group_members:', { gmLength: gm?.length, error: gmError?.message });

        if (gmError) {
          console.error('[FlashMatch] Erreur récupération group_members:', gmError);
          return [];
        }

        const ids = gm?.map(r => r.user_id).filter(Boolean) || [];
        console.log('[FlashMatch] IDs récupérés:', ids.length);

        if (ids.length === 0) {
          console.warn('[FlashMatch] Aucun user_id trouvé dans group_members pour le groupe', idToUse);
          return [];
        }

        // Récupérer les profils
        const { data: profs, error: profsError } = await supabase
          .from('profiles')
          .select('id, display_name, name, niveau')
          .in('id', ids);

        console.log('[FlashMatch] Fallback - profiles:', { profsLength: profs?.length, error: profsError?.message });

        if (profsError) {
          console.error('[FlashMatch] Erreur récupération profiles:', profsError);
          return [];
        }

        if (!profs || profs.length === 0) {
          console.warn('[FlashMatch] Aucun profil trouvé pour les IDs:', ids);
          return [];
        }

        data = profs.map(p => ({
          user_id: p.id,
          profiles: { id: p.id, display_name: p.display_name, name: p.name, niveau: p.niveau },
        }));
      }

      // Normalisation
      const members = data
        .map(r => ({
          id: r?.profiles?.id || r?.user_id,
          name: formatPlayerName(r?.profiles?.display_name || r?.profiles?.name || 'Joueur inconnu'),
          niveau: r?.profiles?.niveau || null,
        }))
        .filter(x => !!x.id);

      console.log(`[FlashMatch] ${members.length} membres chargés pour le groupe ${idToUse}`);
      return members;
    } catch (e) {
      console.error('[FlashMatch] load members failed:', e?.message || e, e);
      return [];
    }
  }

  function showMemberPickerIOS(candidates, already = []) {
    return new Promise((resolve) => {
      const remaining = candidates.filter(c => !already.includes(String(c.id)));
      const options = [...remaining.map(m => m.name), 'Annuler'];
      ActionSheetIOS.showActionSheetWithOptions(
        { title: 'Choisis un joueur (encore ' + (3 - already.length) + ')', options, cancelButtonIndex: options.length - 1 },
        (idx) => {
          if (idx === options.length - 1) return resolve(null);
          const picked = remaining[idx];
          resolve(picked?.id || null);
        }
      );
    });
  }

  async function openFlashMatchDateModal() {
    try {
      // (Ré)initialiser les dates par défaut
      const now = new Date();
      const msRound = 30 * 60 * 1000;
      const rounded = new Date(Math.ceil(now.getTime() / msRound) * msRound);
      const defaultStart = new Date(rounded.getTime() + 30 * 60 * 1000);
      const defaultEnd = new Date(defaultStart.getTime() + 90 * 60 * 1000);
      setFlashStart(defaultStart);
      setFlashEnd(defaultEnd);
      setFlashDurationMin(90);
      setFlashDateModalOpen(true);
    } catch (e) {
      Alert.alert('Erreur', e?.message || String(e));
    }
  }

  async function openFlashMatchPlayersModal() {
    try {
      setFlashLoading(true);

      console.log('[FlashMatch] openFlashMatchPlayersModal - groupId:', groupId, 'activeGroup:', activeGroup, 'myGroups.length:', myGroups.length);

      // Si groupId n'est pas défini, essayer de récupérer depuis activeGroup ou myGroups
      let currentGroupId = groupId;
      if (!currentGroupId) {
        // Essayer de récupérer depuis activeGroup
        if (activeGroup?.id) {
          currentGroupId = activeGroup.id;
          console.log('[FlashMatch] Utilisation activeGroup.id:', currentGroupId);
        } else if (myGroups.length > 0) {
          // Utiliser le premier groupe de myGroups comme fallback
          currentGroupId = myGroups[0]?.id;
          console.log('[FlashMatch] Utilisation premier groupe de myGroups:', currentGroupId);
        } else {
          // Essayer de récupérer depuis AsyncStorage
          try {
            const savedId = await AsyncStorage.getItem("active_group_id");
            if (savedId) {
              currentGroupId = savedId;
              console.log('[FlashMatch] Utilisation groupe depuis AsyncStorage:', currentGroupId);
            }
          } catch (e) {
            console.warn('[FlashMatch] Erreur récupération AsyncStorage:', e);
          }
        }
      }

      if (!currentGroupId) {
        console.error('[FlashMatch] Aucun groupId trouvé');
        Alert.alert('Erreur', 'Aucun groupe sélectionné. Veuillez sélectionner un groupe d\'abord.');
        setFlashLoading(false);
        return;
      }

      // Utiliser currentGroupId pour charger les membres
      console.log('[FlashMatch] Utilisation groupId:', currentGroupId, 'pour charger les membres');

      // Assure-toi d'avoir mon UID même si meId n'est pas encore peuplé
      let uid = meId;
      if (!uid) {
        try {
          const { data: u } = await supabase.auth.getUser();
          uid = u?.user?.id ?? null;
        } catch {}
      }

      // Charger TOUS les membres du groupe, peu importe leur disponibilité
      const allMembers = await loadGroupMembersForFlash(currentGroupId);
      
      console.log('[FlashMatch] Tous les membres du groupe:', allMembers.length);
      
      if (allMembers.length === 0) {
        setFlashMembers([]);
        setFlashSelected([]);
        setFlashQuery("");
        // Réinitialiser tous les filtres
        setFlashLevelFilter([]);
        setFlashLevelFilterVisible(false);
        setFlashGeoRefPoint(null);
        setFlashGeoRadiusKm(null);
        setFlashGeoLocationType(null);
        setFlashGeoCityQuery("");
        setFlashGeoCitySuggestions([]);
        setFlashGeoFilterVisible(false);
        setFlashPickerOpen(true);
        Alert.alert('Aucun membre', 'Aucun membre dans ce groupe.');
        return;
      }

      // Charger les profils complets avec adresses pour le filtre géographique
      const memberIds = allMembers.map(m => m.id).filter(Boolean);
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, display_name, name, niveau, email, avatar_url, address_home, address_work, zone_id')
        .in('id', memberIds);

      if (profileError) {
        console.error('[FlashMatch] Erreur chargement profils:', profileError);
        throw profileError;
      }

      // Clubs acceptés des membres
      const { data: memberClubs, error: clubsErr } = await supabase
        .from("user_clubs")
        .select("user_id, club_id, is_accepted")
        .in("user_id", memberIds)
        .eq("is_accepted", true);
      if (clubsErr) {
        console.warn("[FlashMatch] Erreur chargement clubs membres:", clubsErr);
      }
      const acceptedMap = {};
      (memberClubs || []).forEach((row) => {
        const id = String(row.user_id);
        if (!acceptedMap[id]) acceptedMap[id] = [];
        acceptedMap[id].push(String(row.club_id));
      });

      if (myAcceptedClubs?.size === 0) {
        Alert.alert("Clubs requis", "Sélectionne au moins un club accepté pour inviter des joueurs.");
      }

      // Exclure l'utilisateur, filtrer zone + clubs acceptés
      let ms = (profiles || [])
        .filter(p => (!uid || String(p.id) !== String(uid)))
        .filter(p => !myZoneId || String(p.zone_id) === String(myZoneId))
        .filter(p => {
          if (!myAcceptedClubs || myAcceptedClubs.size === 0) return false;
          const clubs = acceptedMap[String(p.id)] || [];
          return clubs.some((cid) => myAcceptedClubs.has(String(cid)));
        })
        .map(p => ({
          id: p.id,
          name: formatPlayerName(p.display_name || p.name || 'Joueur inconnu'),
          niveau: p.niveau || null,
          email: p.email || null,
          avatar_url: p.avatar_url || null,
          address_home: p.address_home || null,
          address_work: p.address_work || null,
        }));

      console.log('[FlashMatch] Membres après exclusion de l\'utilisateur:', ms.length);

      setFlashMembers(ms);
      setFlashSelected([]);
      setFlashQuery("");
      // Réinitialiser tous les filtres
      setFlashLevelFilter([]);
      setFlashLevelFilterVisible(false);
      setFlashGeoRefPoint(null);
      setFlashGeoRadiusKm(null);
      setFlashGeoLocationType(null);
      setFlashGeoCityQuery("");
      setFlashGeoCitySuggestions([]);
      setFlashGeoFilterVisible(false);
      setFlashPickerOpen(true);
    } catch (e) {
      console.error('[FlashMatch] Erreur ouverture modal joueurs:', e);
      Alert.alert('Erreur', e?.message || String(e));
    } finally {
      setFlashLoading(false);
    }
  }

  async function createFlashMatch(selectedUserIds) {
    // Par défaut: match dans 1h (démarre dans 15 min)
    const starts = new Date(Date.now() + 15 * 60 * 1000);
    const ends = new Date(starts.getTime() + 60 * 60 * 1000);
    const sIso = starts.toISOString();
    const eIso = ends.toISOString();

    // Crée un match sur l'intervalle en ignorant la dispo, et tag les 3 joueurs en RSVP pending
    await onCreateIntervalMatch(sIso, eIso, selectedUserIds);

    try {
      // Envoie des notifs via une table tampon (si elle existe)
      await supabase.from('notification_jobs').insert(
        selectedUserIds.map((uid) => ({
          kind: 'match_flash',
          recipients: [uid],
          payload: { title: 'Match Éclair ⚡️', message: "Un match rapide t'a été proposé !" },
          created_at: new Date().toISOString(),
        }))
      );
    } catch (e) {
      console.warn('[FlashMatch] notification insert failed:', e?.message || e);
    }

    Alert.alert('Match Éclair', 'Match créé et invitations envoyées.');
  }

  const onCreateIntervalMatch = useCallback(
    async (starts_at_iso, ends_at_iso, selectedUserIds = [], matchStatus = 'confirmed', options = {}) => {
      const { skipPostCreateModal = false, selectedClubId = null } = options || {};
      if (!groupId) return;
      // Preflight: prevent overlapping creation with same players
      try {
        if (Array.isArray(selectedUserIds) && selectedUserIds.length) {
          const conflicts = await findConflictingUsers({
            groupId,
            startsAt: starts_at_iso,
            endsAt: ends_at_iso,
            userIds: selectedUserIds,
          });
          if (conflicts.size > 0) {
            // Auto-resolve: remove conflicting users from selection instead of blocking
            const conflictIds = new Set(Array.from(conflicts).map(String));
            const filteredUserIds = (selectedUserIds || [])
              .map(String)
              .filter((id) => !conflictIds.has(id));

            if (filteredUserIds.length < 4) {
              const txt = `Conflit: ${conflicts.size} joueur(s) déjà réservé(s) sur un créneau qui chevauche.\nIl ne reste pas 4 joueurs disponibles pour cet intervalle.`;
              if (Platform.OS === 'web') window.alert(txt); else Alert.alert('Conflit', txt);
              return;
            }

            // Use the filtered list for the rest of the creation flow
            selectedUserIds = filteredUserIds;
          }
        }
      } catch {}
      try {
        // 1) Primary path: RPC returns the created match id (uuid) directly
        let newMatchId = null;
        let rpcErr = null;
        try {
          const playerIds = Array.from(
            new Set((selectedUserIds || []).concat(meId).filter(Boolean).map(String))
          );
          const commonClubs = getCommonAcceptedClubs(playerIds, acceptedClubsByUser);
          if (commonClubs.length === 0) {
            Alert.alert("Aucun club commun sélectionné", "Sélectionne des joueurs avec au moins un club commun accepté.");
            return;
          }
          if (selectedClubId && !commonClubs.some((cid) => String(cid) === String(selectedClubId))) {
            Alert.alert("Club invalide", "Le club choisi n'est pas commun aux 4 joueurs.");
            return;
          }
          const { data, error } = await supabase.rpc('create_match_from_interval_safe', {
            p_group: groupId,
            p_starts_at: starts_at_iso,
            p_ends_at: ends_at_iso,
            p_user_ids: playerIds,
            p_club_id: selectedClubId || null,
          });
          console.log('[onCreateIntervalMatch] RPC result:', data, 'error:', error);
          // Ignorer les erreurs RLS sur availability car on va créer les RSVPs manuellement
          if (error && !error.message?.includes('row-level security policy for table "availability"')) {
            rpcErr = error;
          } else if (error && error.message?.includes('row-level security policy for table "availability"')) {
            console.warn('[onCreateIntervalMatch] Erreur RLS availability ignorée (non critique):', error.message);
            // Si on a quand même un match_id, continuer
            if (data) {
              newMatchId = data;
            }
          } else {
            newMatchId = data;
          }
        } catch (e) {
          // Ignorer les erreurs RLS sur availability
          if (e?.message?.includes('row-level security policy for table "availability"')) {
            console.warn('[onCreateIntervalMatch] Erreur RLS availability ignorée (non critique):', e.message);
          } else {
            rpcErr = e;
          }
        }

        // 1.b) Fallback for unique-constraint on time_slots (same group + same start)
        const isUniqueViolation = !!rpcErr && (
          rpcErr?.code === '23505' ||
          String(rpcErr?.message || rpcErr?.details || rpcErr?.hint || rpcErr).includes('duplicate key value') ||
          String(rpcErr?.message || rpcErr).includes('uniq_time_slots')
        );
        if (isUniqueViolation) {
          // Reuse the existing time_slot that starts at (or very close to) the same time for this group
          const starts = new Date(starts_at_iso);
          const FUZZ_MS = 5 * 60 * 1000; // ±5 minutes tolerance for existing start
          const lo = new Date(starts.getTime() - FUZZ_MS).toISOString();
          const hi = new Date(starts.getTime() + FUZZ_MS).toISOString();

          // Try exact match first
          let { data: slot, error: eSlot } = await supabase
            .from('time_slots')
            .select('id, starts_at, ends_at')
            .eq('group_id', groupId)
            .eq('starts_at', starts_at_iso)
            .maybeSingle();

          // If not found, try a fuzzy window ±5 minutes
          if (!slot) {
            const { data: slots2 } = await supabase
              .from('time_slots')
              .select('id, starts_at, ends_at')
              .eq('group_id', groupId)
              .gte('starts_at', lo)
              .lte('starts_at', hi)
              .limit(1);
            slot = Array.isArray(slots2) && slots2.length ? slots2[0] : null;
          }

          if (slot?.id) {
            // Vérifier si un match existe déjà pour ce slot
            const { data: exist } = await supabase
              .from('matches')
              .select('id')
              .eq('group_id', groupId)
              .eq('time_slot_id', slot.id)
              .limit(1);
            
            // Si un match existe déjà, créer un nouveau time_slot pour permettre la création d'un nouveau match distinct
            if (Array.isArray(exist) && exist.length) {
              console.log('[onCreateIntervalMatch] Match existant trouvé pour ce slot. Création d\'un nouveau time_slot pour un nouveau match distinct.');
              
              // Créer un nouveau time_slot pour ce nouveau match (même horaire mais slot distinct)
              const { data: newSlot, error: eNewSlot } = await supabase
                .from('time_slots')
                .insert({
                  group_id: groupId,
                  starts_at: starts_at_iso,
                  ends_at: ends_at_iso,
                })
                .select('id, starts_at, ends_at')
                .single();
              
              if (eNewSlot) {
                console.error('[onCreateIntervalMatch] Erreur création nouveau time_slot:', eNewSlot);
                throw eNewSlot;
              }
              
              // Créer le match avec le nouveau slot
              const { data: ins, error: eIns } = await supabase
                .from('matches')
                .insert({ group_id: groupId, time_slot_id: newSlot.id, status: matchStatus })
                .select('id, status')
                .single();
              
              if (eIns) throw eIns;
              newMatchId = ins?.id || null;
              console.log('[onCreateIntervalMatch] Nouveau match créé avec nouveau time_slot:', newMatchId, 'status:', ins?.status);
              
              // Utiliser les horaires du nouveau slot
              if (newSlot?.starts_at && newSlot?.ends_at) {
                starts_at_iso = newSlot.starts_at;
                ends_at_iso = newSlot.ends_at || ends_at_iso;
              }
            } else {
              // Pas de match existant, réutiliser le slot existant
              const { data: ins, error: eIns } = await supabase
                .from('matches')
                .insert({ group_id: groupId, time_slot_id: slot.id, status: matchStatus })
                .select('id, status')
                .single();
              if (eIns) throw eIns;
              newMatchId = ins?.id || null;
              console.log('[onCreateIntervalMatch] Match créé:', newMatchId, 'status:', ins?.status);
              // Ensure ends_at we propagate below is coherent with the slot row
              if (slot?.starts_at && slot?.ends_at) {
                starts_at_iso = slot.starts_at;
                ends_at_iso = slot.ends_at || ends_at_iso;
              }
            }
          } else {
            // If we cannot resolve the existing slot, rethrow the original error
            throw rpcErr;
          }
        } else if (rpcErr) {
          // Different error → rethrow
          throw rpcErr;
        }

        if (!newMatchId) {
          // Nothing created (likely <4 players). Give a clean message and exit.
          if (Platform.OS === 'web') {
            window.alert('Action impossible\nAucun match créé pour cet intervalle.');
          } else {
            Alert.alert('Action impossible', 'Aucun match créé pour cet intervalle.');
          }
          return;
        }
        
        // Vérifier et mettre à jour le statut si nécessaire pour qu'il soit matchStatus
        try {
          const { data: matchCheck } = await supabase
            .from('matches')
            .select('id, status')
            .eq('id', newMatchId)
            .maybeSingle();
          console.log('[onCreateIntervalMatch] Match status after RPC:', matchCheck?.status);
          
          if (matchCheck && matchCheck.status !== matchStatus) {
            console.log('[onCreateIntervalMatch] Updating status from', matchCheck.status, 'to', matchStatus);
            await supabase
              .from('matches')
              .update({ status: matchStatus })
              .eq('id', newMatchId);
          }
        } catch (e) {
          console.warn('[onCreateIntervalMatch] Error checking/updating match status:', e);
        }

        // 2) Nettoyer TOUS les RSVPs créés par la RPC et ne garder QUE le créateur + les joueurs sélectionnés
        let uid = meId;
        if (!uid) {
          const { data: u } = await supabase.auth.getUser();
          uid = u?.user?.id ?? null;
        }

        if (newMatchId) {
          const notifyIds = Array.from(new Set([...(selectedUserIds || []), uid].filter(Boolean)));
          if (skipPostCreateModal) {
            notifyMatchCreated(newMatchId, notifyIds);
            notifyGroupMatchCreated(newMatchId, notifyIds);
          } else {
            showMatchCreatedUndo(newMatchId, {
              onExpire: () => {
                notifyMatchCreated(newMatchId, notifyIds);
                notifyGroupMatchCreated(newMatchId, notifyIds);
              },
              onConfirm: () => {
                notifyMatchCreated(newMatchId, notifyIds);
                notifyGroupMatchCreated(newMatchId, notifyIds);
              },
            });
          }
        }
        
        if (newMatchId && uid) {
          try {
            // Préparer la liste des joueurs autorisés : créateur + sélectionnés uniquement
            const allowedUserIds = new Set();
            allowedUserIds.add(String(uid)); // Créateur toujours inclus
            
            // Ajouter les joueurs explicitement sélectionnés
            if (Array.isArray(selectedUserIds) && selectedUserIds.length > 0) {
              selectedUserIds.forEach(id => allowedUserIds.add(String(id)));
            }
            
            // ATTENTION: La RPC peut avoir ajouté des joueurs automatiquement
            // On doit supprimer TOUS les RSVPs sauf ceux autorisés
            const { data: allRsvps } = await supabase
              .from('match_rsvps')
              .select('user_id')
              .eq('match_id', newMatchId);
            
            // Identifier tous les RSVPs à supprimer (ceux qui ne sont pas dans allowedUserIds)
            const toDelete = (allRsvps || [])
              .map(r => String(r.user_id))
              .filter(id => !allowedUserIds.has(id));
            
            // SUPPRIMER tous les RSVPs non autorisés en une seule fois
            if (toDelete.length > 0) {
              await supabase
                .from('match_rsvps')
                .delete()
                .eq('match_id', newMatchId)
                .in('user_id', toDelete);
            }
            
            // Maintenant, créer/mettre à jour les RSVPs uniquement pour les joueurs autorisés
            
            // 1. Créateur en "accepted"
            await supabase
              .from('match_rsvps')
              .upsert(
                { match_id: newMatchId, user_id: uid, status: 'accepted' },
                { onConflict: 'match_id,user_id' }
              );
            
            // 2. Joueurs sélectionnés avec le bon statut selon le type de match
            // Si matchStatus est 'confirmed', mettre les joueurs en 'accepted' au lieu de 'maybe'
            const rsvpStatusForSelected = matchStatus === 'confirmed' ? 'accepted' : 'maybe';
            const selectedForRsvp = Array.isArray(selectedUserIds) && selectedUserIds.length > 0
              ? (selectedUserIds || [])
                  .map(String)
                  .filter(id => id && id !== String(uid))
              : [];
            
            if (selectedForRsvp.length > 0) {
              console.log('[onCreateIntervalMatch] Création RSVPs avec statut:', rsvpStatusForSelected, 'pour', selectedForRsvp.length, 'joueurs:', selectedForRsvp);
              
              // Préparer les RSVPs au format JSONB pour la fonction RPC
              const rsvpsArray = selectedForRsvp.map(userId => ({
                user_id: userId,
                status: rsvpStatusForSelected
              }));
              
              // Utiliser la fonction RPC pour créer les RSVPs en contournant RLS
              try {
                const { error: rpcError } = await supabase.rpc('create_match_rsvps_batch', {
                  p_match_id: newMatchId,
                  p_rsvps: rsvpsArray
                });
                
                if (rpcError) {
                  console.error('[onCreateIntervalMatch] Erreur RPC create_match_rsvps_batch:', rpcError);
                  // Fallback: essayer de créer les RSVPs un par un
                  console.log('[onCreateIntervalMatch] Fallback: création RSVPs un par un...');
                  for (const userId of selectedForRsvp) {
                    try {
                      const { error: insertError } = await supabase
                        .from('match_rsvps')
                        .upsert(
                          { match_id: newMatchId, user_id: userId, status: rsvpStatusForSelected },
                          { onConflict: 'match_id,user_id' }
                        );
                      if (insertError) {
                        console.warn('[onCreateIntervalMatch] Erreur création RSVP pour user', userId, ':', insertError.message);
                      }
                    } catch (e) {
                      console.warn('[onCreateIntervalMatch] Exception création RSVP pour user', userId, ':', e);
                    }
                  }
                } else {
                  console.log('[onCreateIntervalMatch] RSVPs créés avec succès via RPC pour', selectedForRsvp.length, 'joueurs');
                }
              } catch (e) {
                console.error('[onCreateIntervalMatch] Exception lors de l\'appel RPC:', e);
                // Fallback: essayer de créer les RSVPs un par un
                for (const userId of selectedForRsvp) {
                  try {
                    await supabase
                      .from('match_rsvps')
                      .upsert(
                        { match_id: newMatchId, user_id: userId, status: rsvpStatusForSelected },
                        { onConflict: 'match_id,user_id' }
                      );
                  } catch (err) {
                    console.warn('[onCreateIntervalMatch] Erreur fallback pour user', userId, ':', err);
                  }
                }
              }
            }
            
            // Vérifier les RSVPs créés
            const { data: verifyRsvps } = await supabase
              .from('match_rsvps')
              .select('user_id, status')
              .eq('match_id', newMatchId);
            console.log('[onCreateIntervalMatch] RSVPs vérifiés après création:', verifyRsvps?.length || 0, 'joueurs:', verifyRsvps);
            
            // Mettre à jour l'état local avec la liste exacte
            setRsvpsByMatch((prev) => {
              const next = { ...prev };
              const finalRsvps = [
                { user_id: String(uid), status: 'accepted' },
                ...selectedForRsvp.map(id => ({ user_id: id, status: rsvpStatusForSelected }))
              ];
              next[newMatchId] = finalRsvps;
              return next;
            });
            
            console.log('[onCreateIntervalMatch] RSVPs nettoyés. Créateur +', selectedForRsvp.length, 'joueurs sélectionnés uniquement. Statut:', rsvpStatusForSelected);
          } catch (e) {
            console.error('[Matches] cleanup RSVPs failed:', e?.message || e);
          }
        }


        // 4) Verify the match was created with correct status
        if (newMatchId) {
          const { data: checkMatch } = await supabase
            .from('matches')
            .select('id, status')
            .eq('id', newMatchId)
            .maybeSingle();
          console.log('[onCreateIntervalMatch] Match créé check:', checkMatch);
        }
        
        // 5) Refresh lists and notify UX
        await fetchData(true);
        
        // 6) Nettoyage final APRÈS fetchData avec délai pour garantir que seuls les joueurs sélectionnés sont présents
        // (au cas où fetchData, la RPC ou des triggers SQL auraient ré-ajouté des joueurs)
        if (newMatchId && uid) {
          try {
            // Attendre un peu pour laisser le temps aux triggers/processus en arrière-plan de terminer
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Préparer la liste exacte des joueurs autorisés
            const allowedIds = new Set();
            allowedIds.add(String(uid)); // Créateur toujours inclus
            
            // Ajouter les joueurs explicitement sélectionnés
            if (Array.isArray(selectedUserIds) && selectedUserIds.length > 0) {
              selectedUserIds.forEach(id => allowedIds.add(String(id)));
            }
            
            // Récupérer TOUS les RSVPs actuels après fetchData
            const { data: finalRsvps } = await supabase
              .from('match_rsvps')
              .select('user_id, status')
              .eq('match_id', newMatchId);
            
            console.log('[onCreateIntervalMatch] RSVPs après fetchData:', finalRsvps?.length || 0, 'joueurs');
            
            // Identifier tous les RSVPs à supprimer (ceux qui ne sont pas autorisés)
            const finalToDelete = (finalRsvps || [])
              .map(r => String(r.user_id))
              .filter(id => !allowedIds.has(id));
            
            if (finalToDelete.length > 0) {
              console.log('[onCreateIntervalMatch] Nettoyage final: suppression de', finalToDelete.length, 'joueurs non sélectionnés:', finalToDelete);
              
              // SUPPRIMER tous les RSVPs non autorisés
              await supabase
                .from('match_rsvps')
                .delete()
                .eq('match_id', newMatchId)
                .in('user_id', finalToDelete);
              
              // S'assurer que les RSVPs autorisés ont le bon statut
              // 1. Créateur en "accepted"
              await supabase
                .from('match_rsvps')
                .upsert(
                  { match_id: newMatchId, user_id: uid, status: 'accepted' },
                  { onConflict: 'match_id,user_id' }
                );
              
              // 2. Joueurs sélectionnés avec le bon statut selon le type de match
              const finalRsvpStatusForSelected = matchStatus === 'confirmed' ? 'accepted' : 'maybe';
              const selectedForMaybe = Array.isArray(selectedUserIds) && selectedUserIds.length > 0
                ? (selectedUserIds || [])
                    .map(String)
                    .filter(id => id && id !== String(uid))
                : [];
              
              if (selectedForMaybe.length > 0) {
                // Utiliser la fonction RPC pour créer les RSVPs en contournant RLS
                const rsvpsArray = selectedForMaybe.map(userId => ({
                  user_id: userId,
                  status: finalRsvpStatusForSelected
                }));
                
                const { error: rpcError } = await supabase.rpc('create_match_rsvps_batch', {
                  p_match_id: newMatchId,
                  p_rsvps: rsvpsArray
                });
                
                if (rpcError) {
                  console.warn('[onCreateIntervalMatch] Erreur RPC lors du nettoyage final:', rpcError);
                  // Fallback: essayer avec upsert direct
                  const maybeRows = selectedForMaybe.map(userId => ({
                    match_id: newMatchId,
                    user_id: userId,
                    status: finalRsvpStatusForSelected
                  }));
                  await supabase
                    .from('match_rsvps')
                    .upsert(maybeRows, { onConflict: 'match_id,user_id' });
                }
              }
              
              // Recharger les RSVPs après nettoyage
              const { data: cleanedRsvps } = await supabase
                .from('match_rsvps')
                .select('user_id, status')
                .eq('match_id', newMatchId);
              
              console.log('[onCreateIntervalMatch] RSVPs après nettoyage final:', cleanedRsvps?.length || 0, 'joueurs');
              
              // Mettre à jour l'état local avec les RSVPs nettoyés
              if (cleanedRsvps) {
                setRsvpsByMatch((prev) => {
                  const next = { ...prev };
                  next[newMatchId] = cleanedRsvps.map(r => ({
                    user_id: r.user_id,
                    status: r.status
                  }));
                  return next;
                });
                
                // Recharger les données après nettoyage pour mettre à jour l'affichage
                await fetchData();
              }
            } else {
              console.log('[onCreateIntervalMatch] Aucun nettoyage nécessaire, tous les joueurs sont autorisés');
              
              // Même si aucun RSVP n'est à supprimer, s'assurer que les statuts sont corrects selon matchStatus
              const finalRsvpStatusForSelected = matchStatus === 'confirmed' ? 'accepted' : 'maybe';
              const selectedForRsvp = Array.isArray(selectedUserIds) && selectedUserIds.length > 0
                ? (selectedUserIds || [])
                    .map(String)
                    .filter(id => id && id !== String(uid))
                : [];
              
              // Vérifier les RSVPs actuels et mettre à jour si nécessaire
              const currentRsvps = (finalRsvps || []).map(r => String(r.user_id));
              const expectedRsvps = new Set([String(uid), ...selectedForRsvp]);
              
              // S'assurer que tous les RSVPs attendus existent avec le bon statut
              // 1. Créateur toujours en "accepted"
              await supabase
                .from('match_rsvps')
                .upsert(
                  { match_id: newMatchId, user_id: uid, status: 'accepted' },
                  { onConflict: 'match_id,user_id' }
                );
              
              // 2. Joueurs sélectionnés avec le bon statut
              if (selectedForRsvp.length > 0) {
                // Utiliser la fonction RPC pour créer les RSVPs en contournant RLS
                const rsvpsArray = selectedForRsvp.map(userId => ({
                  user_id: userId,
                  status: finalRsvpStatusForSelected
                }));
                
                const { error: rpcError } = await supabase.rpc('create_match_rsvps_batch', {
                  p_match_id: newMatchId,
                  p_rsvps: rsvpsArray
                });
                
                if (rpcError) {
                  console.warn('[onCreateIntervalMatch] Erreur RPC lors de la mise à jour des statuts:', rpcError);
                  // Fallback: essayer avec upsert direct
                  const rsvpRows = selectedForRsvp.map(userId => ({
                    match_id: newMatchId,
                    user_id: userId,
                    status: finalRsvpStatusForSelected
                  }));
                  await supabase
                    .from('match_rsvps')
                    .upsert(rsvpRows, { onConflict: 'match_id,user_id' });
                }
                
                console.log('[onCreateIntervalMatch] RSVPs mis à jour avec statut:', finalRsvpStatusForSelected, 'pour', selectedForRsvp.length, 'joueurs');
              }
            }
          } catch (e) {
            console.error('[Matches] final cleanup after fetchData failed:', e?.message || e);
          }
        }
        
      } catch (e) {
        if (Platform.OS === 'web') {
          window.alert('Erreur\n' + (e.message ?? String(e)));
        } else {
          Alert.alert('Erreur', e.message ?? String(e));
        }
      }
    },
    [groupId, fetchData, showMatchCreatedUndo, meId, acceptedClubsByUser]
  );

  // Handler pour valider date/heure/durée et passer à la sélection des joueurs
  const onValidateFlashDate = React.useCallback(async () => {
    setFlashDateModalOpen(false);
    await openFlashMatchPlayersModal();
  }, []);

  // Handler pour créer le match éclair après sélection des joueurs
  const onCreateFlashMatch = React.useCallback(async (requiresConfirmation = true) => {
    if (flashSelected.length !== 3) {
      Alert.alert('Match éclair', 'Sélectionne exactement 3 joueurs.');
      return;
    }

    // Récupérer l'utilisateur authentifié
    let uid = meId;
    if (!uid) {
      try {
        const { data: u } = await supabase.auth.getUser();
        uid = u?.user?.id ?? null;
      } catch {}
    }

    if (!uid) {
      Alert.alert('Erreur', 'Utilisateur non authentifié.');
      return;
    }

    // Calculer la date de fin en fonction de la durée sélectionnée
    const startIso = flashStart.toISOString();
    const endDate = new Date(flashStart);
    endDate.setMinutes(endDate.getMinutes() + flashDurationMin);
    const endIso = endDate.toISOString();

    // Créer le match avec les joueurs sélectionnés + l'utilisateur authentifié
    const allPlayers = [...flashSelected, uid];
    
    // Déterminer le statut du match selon le choix
    const matchStatus = requiresConfirmation ? 'pending' : 'confirmed';
    
    try {
      await onCreateIntervalMatch(startIso, endIso, allPlayers, matchStatus);
      
      // Envoyer des notifications aux joueurs sélectionnés
      try {
        await supabase.from('notification_jobs').insert(
          flashSelected.map((uid) => ({
            kind: 'match_flash',
            recipients: [uid],
            payload: { 
              title: 'Match Éclair ⚡️', 
              message: requiresConfirmation 
                ? "Un match rapide t'a été proposé !" 
                : "Un match rapide a été créé avec toi !"
            },
            created_at: new Date().toISOString(),
          }))
        );
      } catch (e) {
        console.warn('[FlashMatch] notification insert failed:', e?.message || e);
      }

      setFlashPickerOpen(false);
      setFlashSelected([]);
      
      if (Platform.OS === "web") {
        window.alert(`Match Éclair créé 🎾${requiresConfirmation ? ' (en attente de confirmation)' : ' (confirmé)'}`);
      } else {
        Alert.alert(
          "Match Éclair créé 🎾", 
          requiresConfirmation 
            ? "Le match a été créé et attend confirmation." 
            : "Le match a été créé et confirmé."
        );
      }
    } catch (e) {
      if (Platform.OS === "web") {
        window.alert("Impossible de créer le match éclair\n" + (e.message ?? String(e)));
      } else {
        Alert.alert("Erreur", e.message ?? String(e));
      }
    }
  }, [flashSelected, flashStart, flashDurationMin, meId, onCreateIntervalMatch]);

  // --- Geo Match helpers ---
  // Charger le profil utilisateur avec address_home/work
  useEffect(() => {
    (async () => {
      if (!meId) return;
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, address_home, address_work, niveau')
          .eq('id', meId)
          .maybeSingle();
        if (error) throw error;
        setMyProfile(data);
      } catch (e) {
        console.warn('[GeoMatch] load profile error:', e?.message ?? String(e));
      }
    })();
  }, [meId]);

  // Demander permission GPS au démarrage de l'app
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        setLocationPermission(status);
      } catch (e) {
        console.warn('[GeoMatch] location permission error:', e);
        setLocationPermission('denied');
      }
    })();
  }, []);

  // Autocomplétion ville via Nominatim
  const searchCity = useCallback(async (query) => {
    if (!query || query.length < 3) {
      setCitySuggestions([]);
      return;
    }
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=fr&accept-language=fr`;
      const res = await fetch(url);
      const data = await res.json();
      const suggestions = (data || []).map(item => ({
        name: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
      }));
      setCitySuggestions(suggestions);
    } catch (e) {
      console.warn('[GeoMatch] city search error:', e);
      setCitySuggestions([]);
    }
  }, []);
  
  // Autocomplétion ville pour le filtre géographique
  const searchFilterGeoCity = useCallback(async (query) => {
    if (!query || query.length < 3) {
      setFilterGeoCitySuggestions([]);
      return;
    }
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=fr&accept-language=fr`;
      const res = await fetch(url);
      const data = await res.json();
      const suggestions = (data || []).map(item => ({
        name: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
      }));
      setFilterGeoCitySuggestions(suggestions);
    } catch (e) {
      console.warn('[FilterGeo] city search error:', e);
      setFilterGeoCitySuggestions([]);
    }
  }, []);
  
  // Calculer le point de référence géographique pour le filtre
  const computeFilterGeoRefPoint = useCallback(async () => {
    let point = null;
    if (filterGeoLocationType === 'current') {
      if (locationPermission !== 'granted') {
        Alert.alert('Permission requise', 'Veuillez autoriser l\'accès à la localisation.');
        setFilterGeoLocationType(null);
        return null;
      }
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        point = { lat: loc.coords.latitude, lng: loc.coords.longitude, address: 'Position actuelle' };
      } catch (e) {
        Alert.alert('Erreur', 'Impossible d\'obtenir votre position. Utilisez une ville.');
        setFilterGeoLocationType(null);
        return null;
      }
    } else if (filterGeoLocationType === 'home') {
      if (!myProfile?.address_home || !myProfile.address_home.lat || !myProfile.address_home.lng) {
        Alert.alert('Erreur', 'Veuillez renseigner votre adresse de domicile dans votre profil.');
        setFilterGeoLocationType(null);
        return null;
      }
      const addr = myProfile.address_home;
      point = { lat: addr.lat, lng: addr.lng, address: addr.address || 'Domicile' };
    } else if (filterGeoLocationType === 'work') {
      if (!myProfile?.address_work || !myProfile.address_work.lat || !myProfile.address_work.lng) {
        Alert.alert('Erreur', 'Veuillez renseigner votre adresse de travail dans votre profil.');
        setFilterGeoLocationType(null);
        return null;
      }
      const addr = myProfile.address_work;
      point = { lat: addr.lat, lng: addr.lng, address: addr.address || 'Travail' };
    }
    
    return point;
  }, [filterGeoLocationType, locationPermission, myProfile]);
  
  // Charger le point de référence géographique du filtre quand le type change
  useEffect(() => {
    if (!filterGeoVisible) return; // Ne pas charger si le filtre n'est pas visible
    
    (async () => {
      // Pour 'city', le point sera défini quand l'utilisateur sélectionne une ville
      if (filterGeoLocationType === 'city') {
        // Ne rien faire, attendre la sélection de ville
        return;
      }
      
      // Pour les autres types (current, home, work), charger automatiquement
      const point = await computeFilterGeoRefPoint();
      if (point) {
        setFilterGeoRefPoint(point);
      } else {
        setFilterGeoRefPoint(null);
      }
    })();
  }, [filterGeoLocationType, filterGeoVisible, computeFilterGeoRefPoint]);

  // Calculer le point de référence géographique pour la modale d'invitation
  const computeHotMatchGeoRefPoint = useCallback(async () => {
    let point = null;
    if (hotMatchGeoLocationType === 'current') {
      if (locationPermission !== 'granted') {
        Alert.alert('Permission requise', 'Veuillez autoriser l\'accès à la localisation.');
        setHotMatchGeoLocationType(null);
        return null;
      }
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        point = { lat: loc.coords.latitude, lng: loc.coords.longitude, address: 'Position actuelle' };
      } catch (e) {
        Alert.alert('Erreur', 'Impossible d\'obtenir votre position. Utilisez une ville.');
        setHotMatchGeoLocationType(null);
        return null;
      }
    } else if (hotMatchGeoLocationType === 'home') {
      if (!myProfile?.address_home || !myProfile.address_home.lat || !myProfile.address_home.lng) {
        Alert.alert('Erreur', 'Veuillez renseigner votre adresse de domicile dans votre profil.');
        setHotMatchGeoLocationType(null);
        return null;
      }
      const addr = myProfile.address_home;
      point = { lat: addr.lat, lng: addr.lng, address: addr.address || 'Domicile' };
    } else if (hotMatchGeoLocationType === 'work') {
      if (!myProfile?.address_work || !myProfile.address_work.lat || !myProfile.address_work.lng) {
        Alert.alert('Erreur', 'Veuillez renseigner votre adresse de travail dans votre profil.');
        setHotMatchGeoLocationType(null);
        return null;
      }
      const addr = myProfile.address_work;
      point = { lat: addr.lat, lng: addr.lng, address: addr.address || 'Travail' };
    }
    
    return point;
  }, [hotMatchGeoLocationType, locationPermission, myProfile]);

  // Charger le point de référence géographique pour la modale d'invitation quand le type change
  useEffect(() => {
    if (!inviteHotMatchModalVisible) return; // Ne pas charger si la modale n'est pas visible
    
    (async () => {
      // Pour 'city', le point sera défini quand l'utilisateur sélectionne une ville
      if (hotMatchGeoLocationType === 'city') {
        // Ne rien faire, attendre la sélection de ville
        return;
      }
      
      // Pour les autres types (current, home, work), charger automatiquement
      const point = await computeHotMatchGeoRefPoint();
      if (point) {
        setHotMatchGeoRefPoint(point);
      } else {
        setHotMatchGeoRefPoint(null);
      }
    })();
  }, [hotMatchGeoLocationType, inviteHotMatchModalVisible, computeHotMatchGeoRefPoint]);

  // Autocomplétion ville pour le filtre géographique de la modale d'invitation
  const searchHotMatchGeoCity = useCallback(async (query) => {
    if (!query || query.length < 3) {
      setHotMatchGeoCitySuggestions([]);
      return;
    }
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=fr&accept-language=fr`;
      const res = await fetch(url);
      const data = await res.json();
      const suggestions = (data || []).map(item => ({
        name: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
      }));
      setHotMatchGeoCitySuggestions(suggestions);
    } catch (e) {
      console.warn('[HotMatchGeo] city search error:', e);
      setHotMatchGeoCitySuggestions([]);
    }
  }, []);

  // Réinitialiser le rayon quand le type de localisation change
  useEffect(() => {
    if (!hotMatchGeoLocationType) {
      setHotMatchGeoRadiusKm(null);
    }
  }, [hotMatchGeoLocationType]);



  // Calculer le point de référence géographique pour le modal match éclair
  const computeFlashGeoRefPoint = useCallback(async () => {
    let point = null;
    if (flashGeoLocationType === 'current') {
      if (locationPermission !== 'granted') {
        Alert.alert('Permission requise', 'Veuillez autoriser l\'accès à la localisation.');
        setFlashGeoLocationType(null);
        return null;
      }
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        point = { lat: loc.coords.latitude, lng: loc.coords.longitude, address: 'Position actuelle' };
      } catch (e) {
        Alert.alert('Erreur', 'Impossible d\'obtenir votre position. Utilisez une ville.');
        setFlashGeoLocationType(null);
        return null;
      }
    } else if (flashGeoLocationType === 'home') {
      if (!myProfile?.address_home || !myProfile.address_home.lat || !myProfile.address_home.lng) {
        Alert.alert('Erreur', 'Veuillez renseigner votre adresse de domicile dans votre profil.');
        setFlashGeoLocationType(null);
        return null;
      }
      const addr = myProfile.address_home;
      point = { lat: addr.lat, lng: addr.lng, address: addr.address || 'Domicile' };
    } else if (flashGeoLocationType === 'work') {
      if (!myProfile?.address_work || !myProfile.address_work.lat || !myProfile.address_work.lng) {
        Alert.alert('Erreur', 'Veuillez renseigner votre adresse de travail dans votre profil.');
        setFlashGeoLocationType(null);
        return null;
      }
      const addr = myProfile.address_work;
      point = { lat: addr.lat, lng: addr.lng, address: addr.address || 'Travail' };
    }
    
    return point;
  }, [flashGeoLocationType, locationPermission, myProfile]);

  // Charger le point de référence géographique pour le modal match éclair quand le type change
  useEffect(() => {
    if (!flashPickerOpen) return; // Ne pas charger si la modale n'est pas visible
    
    (async () => {
      // Pour 'city', le point sera défini quand l'utilisateur sélectionne une ville
      if (flashGeoLocationType === 'city') {
        // Ne rien faire, attendre la sélection de ville
        return;
      }
      
      // Pour les autres types (current, home, work), charger automatiquement
      const point = await computeFlashGeoRefPoint();
      if (point) {
        setFlashGeoRefPoint(point);
      } else {
        setFlashGeoRefPoint(null);
      }
    })();
  }, [flashGeoLocationType, flashPickerOpen, computeFlashGeoRefPoint]);

  // Calculer les disponibilités des membres pour le match éclair
  useEffect(() => {
    if (!flashPickerOpen || !groupId || !flashStart || !flashEnd) {
      setFlashAvailableMemberIds(new Set());
      return;
    }

    (async () => {
      try {
        // Récupérer les disponibilités effectives pour tous les membres du groupe sur ce créneau
        const { data: availabilityData, error } = await supabase.rpc('get_availability_effective', {
          p_group: groupId,
          p_user: null, // null pour tous les utilisateurs
          p_low: flashStart.toISOString(),
          p_high: flashEnd.toISOString(),
        });

        if (error) {
          console.warn('[FlashMatch] Erreur calcul disponibilités:', error);
          setFlashAvailableMemberIds(new Set());
          return;
        }

        const availableIds = new Set();
        (availabilityData || []).forEach((av) => {
          if (av.status === 'available') {
            availableIds.add(String(av.user_id));
          }
        });

        console.log('[FlashMatch] Membres disponibles sur le créneau:', availableIds.size);
        setFlashAvailableMemberIds(availableIds);
      } catch (e) {
        console.warn('[FlashMatch] Erreur calcul disponibilités:', e);
        setFlashAvailableMemberIds(new Set());
      }
    })();
  }, [flashPickerOpen, groupId, flashStart, flashEnd]);

  // Autocomplétion ville pour le filtre géographique du modal match éclair
  const searchFlashGeoCity = useCallback(async (query) => {
    if (!query || query.length < 3) {
      setFlashGeoCitySuggestions([]);
      return;
    }
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=fr&accept-language=fr`;
      const res = await fetch(url);
      const data = await res.json();
      const suggestions = (data || []).map(item => ({
        name: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
      }));
      setFlashGeoCitySuggestions(suggestions);
    } catch (e) {
      console.warn('[FlashGeo] city search error:', e);
      setFlashGeoCitySuggestions([]);
    }
  }, []);

  // Réinitialiser le rayon quand le type de localisation change pour flash
  useEffect(() => {
    if (!flashGeoLocationType) {
      setFlashGeoRadiusKm(null);
    }
  }, [flashGeoLocationType]);

  // Mémoriser préférences
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem('geo_match_prefs');
        if (saved) {
          const prefs = JSON.parse(saved);
          if (prefs.locationType) setLocationType(prefs.locationType);
          if (prefs.radiusKm) setRadiusKm(prefs.radiusKm);
        }
      } catch (e) {
        console.warn('[GeoMatch] load prefs error:', e);
      }
    })();
  }, []);

  // Sauvegarder préférences
  const saveGeoPrefs = useCallback(async () => {
    try {
      await AsyncStorage.setItem('geo_match_prefs', JSON.stringify({
        locationType,
        radiusKm,
      }));
    } catch (e) {
      console.warn('[GeoMatch] save prefs error:', e);
    }
  }, [locationType, radiusKm]);

  // Charger les joueurs disponibles dans le groupe et la zone
  const loadAvailablePlayers = useCallback(async () => {
    if (!geoStart || !geoEnd || !refPoint || !refPoint.lat || !refPoint.lng || !groupId) {
      setAvailablePlayers([]);
      return;
    }
    
    setAvailablePlayersLoading(true);
    try {
      // 1. Récupérer les IDs des joueurs disponibles sur le créneau
      const startIso = geoStart.toISOString();
      const endIso = geoEnd.toISOString();
      const availableIds = await computeAvailableUserIdsForInterval(groupId, startIso, endIso);
      
      if (availableIds.length === 0) {
        setAvailablePlayers([]);
        return;
      }
      
      // 2. Charger les profils de ces joueurs (avec adresses pour la distance)
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, email, niveau, address_home, address_work')
        .in('id', availableIds);
      
      if (error) throw error;
      
      // 3. Enrichir les profils avec leur position (domicile ou travail de préférence)
      const playersWithLocation = (profiles || []).map(p => {
        // Priorité : domicile > travail > point de référence (par défaut)
        let lat = null;
        let lng = null;
        if (p.address_home?.lat && p.address_home?.lng) {
          lat = p.address_home.lat;
          lng = p.address_home.lng;
        } else if (p.address_work?.lat && p.address_work?.lng) {
          lat = p.address_work.lat;
          lng = p.address_work.lng;
        }
        
        return {
          ...p,
          lat,
          lng,
        };
      });
      
      // 4. Exclure l'utilisateur actuel de la liste
      let uid = meId;
      if (!uid) {
        try {
          const { data: u } = await supabase.auth.getUser();
          uid = u?.user?.id ?? null;
        } catch {}
      }
      const playersWithoutMe = (playersWithLocation || []).filter(p => !uid || String(p.id) !== String(uid));
      
      // 5. Filtrer par distance et trier
      const myLevel = myProfile?.niveau || null;
      const filtered = filterAndSortPlayers(
        playersWithoutMe,
        refPoint,
        myLevel,
        radiusKm,
        'distance' // On trie toujours par distance pour les joueurs disponibles
      );
      
      setAvailablePlayers(filtered);
    } catch (e) {
      console.warn('[GeoMatch] loadAvailablePlayers error:', e?.message ?? String(e));
      setAvailablePlayers([]);
    } finally {
      setAvailablePlayersLoading(false);
    }
  }, [geoStart, geoEnd, refPoint, groupId, myProfile, radiusKm, meId]);
  
  // Mettre à jour geoEnd automatiquement quand geoStart ou geoDurationMin change
  useEffect(() => {
    if (geoStart && geoDurationMin) {
      const newEnd = new Date(geoStart);
      newEnd.setMinutes(newEnd.getMinutes() + geoDurationMin);
      setGeoEnd(newEnd);
    }
  }, [geoStart, geoDurationMin]);

  // Charger automatiquement les joueurs disponibles quand le créneau est défini
  useEffect(() => {
    if (geoStart && geoEnd && refPoint && refPoint.lat && refPoint.lng && groupId) {
      loadAvailablePlayers();
    } else {
      setAvailablePlayers([]);
    }
  }, [geoStart, geoEnd, refPoint, groupId, loadAvailablePlayers]);

  // Rechercher clubs par rayon
  const searchClubs = useCallback(async () => {
    if (!refPoint || !refPoint.lat || !refPoint.lng) {
      Alert.alert('Erreur', 'Veuillez sélectionner un lieu de référence.');
      return;
    }
    setClubsLoading(true);
    try {
      const { data, error } = await supabase
        .from('clubs')
        .select('*')
        .not('lat', 'is', null)
        .not('lng', 'is', null);
      
      if (error) throw error;
      
      // Simplifier : tri uniquement par distance (plus besoin du tri par niveau)
      const filtered = (data || [])
        .map(c => ({
          ...c,
          distanceKm: haversineKm(refPoint, { lat: c.lat, lng: c.lng }),
        }))
        .filter(c => c.distanceKm <= radiusKm)
        .sort((a, b) => a.distanceKm - b.distanceKm);
      
      setClubs(filtered.slice(0, 10)); // Limiter à 10 avec pagination
    } catch (e) {
      Alert.alert('Erreur', e?.message ?? String(e));
      setClubs([]);
    } finally {
      setClubsLoading(false);
    }
  }, [refPoint, radiusKm]);

  // Calculer le point de référence selon locationType
  const computeRefPoint = useCallback(async () => {
    let point = null;
    if (locationType === 'current') {
      if (locationPermission !== 'granted') {
        Alert.alert('Permission requise', 'Veuillez autoriser l\'accès à la localisation.');
        setLocationType('city');
        return null;
      }
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        point = { lat: loc.coords.latitude, lng: loc.coords.longitude, address: 'Position actuelle' };
      } catch (e) {
        Alert.alert('Erreur', 'Impossible d\'obtenir votre position. Utilisez une ville.');
        setLocationType('city');
        return null;
      }
    } else if (locationType === 'home' && myProfile?.address_home) {
      const addr = myProfile.address_home;
      if (addr.lat && addr.lng) {
        point = { lat: addr.lat, lng: addr.lng, address: addr.address || 'Domicile' };
      }
    } else if (locationType === 'work' && myProfile?.address_work) {
      const addr = myProfile.address_work;
      if (addr.lat && addr.lng) {
        point = { lat: addr.lat, lng: addr.lng, address: addr.address || 'Travail' };
      }
    }
    
    if (!point && locationType !== 'city') {
      Alert.alert('Erreur', 'Veuillez renseigner cette adresse dans votre profil.');
      return null;
    }
    
    return point;
  }, [locationType, locationPermission, myProfile]);

  // Ouvrir modal géographique
  const openGeoModal = useCallback(async () => {
    if (!groupId) {
      Alert.alert('Erreur', 'Veuillez sélectionner un groupe.');
      return;
    }
    
    const point = await computeRefPoint();
    if (point || locationType === 'city') {
      setRefPoint(point);
      setGeoModalOpen(true);
      saveGeoPrefs();
    }
  }, [groupId, locationType, computeRefPoint, saveGeoPrefs]);

  // Créer match géographique
  const onCreateGeoMatch = useCallback(async () => {
    if (!selectedClub || !refPoint) {
      Alert.alert('Erreur', 'Veuillez sélectionner un club.');
      return;
    }
    if (!groupId) {
      Alert.alert('Erreur', 'Veuillez sélectionner un groupe.');
      return;
    }
    
    // Vérifier qu'il y a exactement 3 joueurs sélectionnés (pour avoir 4 avec l'utilisateur)
    if (selectedGeoPlayers.length !== 3) {
      Alert.alert('Erreur', 'Veuillez sélectionner exactement 3 joueurs pour créer un match (4 joueurs au total avec vous).');
      return;
    }
    
    setGeoCreating(true);
    try {
      // Vérifier disponibilités sur le créneau
      const startIso = geoStart.toISOString();
      const endIso = geoEnd.toISOString();
      
      // Vérifier que les joueurs sélectionnés sont bien disponibles
      const { data: availabilityData } = await supabase
        .rpc('get_availability_effective', {
          p_group: groupId,
          p_user: null,
          p_low: startIso,
          p_high: endIso,
        });
      
      const available = (availabilityData || []).filter(a => a.status === 'available');
      const availableIds = new Set(available.map(a => String(a.user_id)));
      
      // Vérifier que tous les joueurs sélectionnés sont disponibles
      const unavailableSelected = selectedGeoPlayers.filter(id => !availableIds.has(id));
      if (unavailableSelected.length > 0) {
        Alert.alert('Erreur', `Certains joueurs sélectionnés ne sont plus disponibles sur ce créneau.`);
        setGeoCreating(false);
        return;
      }
      
      // Créer le match avec les joueurs sélectionnés + l'utilisateur actuel
      const allPlayerIds = [...selectedGeoPlayers, String(meId)];
      
      await onCreateIntervalMatch(startIso, endIso, allPlayerIds);
      
      // Associer le club au match créé
      // On récupère le dernier match créé pour ce groupe et ce créneau
      const { data: latestTimeSlot } = await supabase
        .from('time_slots')
        .select('id')
        .eq('group_id', groupId)
        .eq('starts_at', startIso)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (latestTimeSlot?.id) {
        const { data: latestMatch } = await supabase
          .from('matches')
          .select('id')
          .eq('group_id', groupId)
          .eq('time_slot_id', latestTimeSlot.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (latestMatch?.id) {
          await supabase
        .from('matches')
            .update({ club_id: selectedClub.id })
            .eq('id', latestMatch.id);
        }
      }
      
      // Notifications
      try {
        await supabase.from('notification_jobs').insert(
          selectedGeoPlayers.map(userId => ({
            kind: 'match_geo',
            recipients: [userId],
            payload: {
              title: 'Nouveau match géographique 🗺️',
              message: `Un match a été créé près de ${selectedClub.name}`,
            },
            created_at: new Date().toISOString(),
          }))
        );
      } catch (e) {
        console.warn('[GeoMatch] notification error:', e);
      }
      
      Alert.alert('Succès', 'Match géographique créé !');
      setGeoModalOpen(false);
      setSelectedClub(null);
      setSelectedGeoPlayers([]);
      fetchData();
    } catch (e) {
      Alert.alert('Erreur', e?.message ?? String(e));
    } finally {
      setGeoCreating(false);
    }
  }, [selectedClub, refPoint, groupId, geoStart, geoEnd, meId, selectedGeoPlayers, onCreateIntervalMatch, fetchData]);

// Accepter en masse des joueurs sélectionnés sur un match donné
async function acceptPlayers(matchId, userIds = []) {
  const ids = Array.from(new Set((userIds || []).map(String)));
  if (!matchId || ids.length === 0) return;

  // Tentative via RPC SECURITY DEFINER (respect RLS) — met le statut en "accepted"
  try {
    await Promise.all(
      ids.map((uid) =>
        supabase.rpc('update_match_rsvp_status', {
          p_match_id: matchId,
          p_user_id: uid,
          p_status: 'accepted',
          p_skip_notification: true,
        })
      )
    );
    return;
  } catch (e) {
    console.warn('[acceptPlayers] RPC failed, fallback to upsert:', e?.message || e);
  }

  // Fallback: upsert direct
  const rows = ids.map((uid) => ({ match_id: matchId, user_id: uid, status: 'accepted' }));
  const { error } = await supabase
    .from('match_rsvps')
    .upsert(rows, { onConflict: 'match_id,user_id' });
  if (error) console.warn('[acceptPlayers] upsert error:', error.message || error);
}

// Enregistrer des joueurs sélectionnés en 'maybe' (attente/remplaçants)
async function setPlayersMaybe(matchId, userIds = [], excludeUserId) {
  const ids = Array.from(new Set((userIds || []).map(String)))
    .filter((id) => id && id !== String(excludeUserId));
  if (!matchId || ids.length === 0) return;
  const rows = ids.map((uid) => ({ match_id: matchId, user_id: uid, status: 'maybe' }));
  const { error } = await supabase
    .from('match_rsvps')
    .upsert(rows, { onConflict: 'match_id,user_id' });
  if (error) console.warn('[setPlayersMaybe] upsert error:', error.message || error);
}

// Forcer tous les RSVP "accepted" (hors créateur) à repasser en "maybe"
async function demoteNonCreatorAcceptedToMaybe(matchId, creatorUserId) {
  if (!matchId) return;
  const creatorIdStr = creatorUserId ? String(creatorUserId) : null;
  try {
    const { data: rows, error } = await supabase
      .from('match_rsvps')
      .select('user_id, status')
      .eq('match_id', matchId);
    if (error) throw error;

    const toDemote = (rows || [])
      .filter((r) => String(r.user_id) !== creatorIdStr && String(r.status || '').toLowerCase() === 'accepted')
      .map((r) => String(r.user_id));

    if (!toDemote.length) return;

    const payload = toDemote.map((uid) => ({ match_id: matchId, user_id: uid, status: 'maybe' }));
    const { error: eUp } = await supabase
      .from('match_rsvps')
      .upsert(payload, { onConflict: 'match_id,user_id' });
    if (eUp) throw eUp;

    // Optimisme UI : mettre à jour localement
    setRsvpsByMatch((prev) => {
      const next = { ...prev };
      const arr = Array.isArray(next[matchId]) ? [...next[matchId]] : [];
      for (const uid of toDemote) {
        const i = arr.findIndex((r) => String(r.user_id) === String(uid));
        if (i >= 0) arr[i] = { ...arr[i], status: 'maybe' };
        else arr.push({ user_id: uid, status: 'maybe' });
      }
      next[matchId] = arr;
      return next;
    });
  } catch (e) {
    console.warn('[demoteNonCreatorAcceptedToMaybe] failed:', e?.message || e);
  }
}

  const onCreateMatch = useCallback(
    async (time_slot_id, selectedUserIds = [], options = {}) => {
      const { skipPostCreateModal = false } = options || {};
      if (!groupId) return;
      // Preflight: prevent overlapping creation with same players
      try {
        // Resolve the time range of the selected time_slot
        const { data: slotRow } = await supabase
          .from('time_slots')
          .select('starts_at, ends_at')
          .eq('id', time_slot_id)
          .maybeSingle();
        if (slotRow?.starts_at && slotRow?.ends_at && Array.isArray(selectedUserIds) && selectedUserIds.length) {
          const conflicts = await findConflictingUsers({
            groupId,
            startsAt: slotRow.starts_at,
            endsAt: slotRow.ends_at,
            userIds: selectedUserIds,
          });
          if (conflicts.size > 0) {
            // Auto-resolve: remove conflicting users from selection instead of blocking
            const conflictIds = new Set(Array.from(conflicts).map(String));
            const filteredUserIds = (selectedUserIds || [])
              .map(String)
              .filter((id) => !conflictIds.has(id));

            if (filteredUserIds.length < 4) {
              const txt = `Conflit: ${conflicts.size} joueur(s) déjà réservé(s) sur un créneau qui chevauche.\nIl ne reste pas 4 joueurs disponibles pour ce créneau.`;
              if (Platform.OS === 'web') window.alert(txt); else Alert.alert('Conflit', txt);
              return;
            }

            // Use the filtered list for the rest of the creation flow
            selectedUserIds = filteredUserIds;
          }
        }
      } catch {}
      try {
        const playerIds = Array.from(
          new Set((selectedUserIds || []).concat(meId).filter(Boolean).map(String))
        );
        const commonClubs = getCommonAcceptedClubs(playerIds, acceptedClubsByUser);
        if (commonClubs.length === 0) {
          Alert.alert("Aucun club commun sélectionné", "Sélectionne des joueurs avec au moins un club commun accepté.");
          return;
        }
        const { error } = await supabase.rpc("create_match_with_players", {
          p_group: groupId,
          p_time_slot: time_slot_id,
          p_user_ids: playerIds,
        });
        if (error) {
          throw error;
        }
        // Auto-confirm: inscrire automatiquement tous les joueurs sélectionnés en 'accepted'
        try {
          // récupérer l'ID du match fraîchement créé (par group_id + time_slot_id)
          const { data: createdMatch } = await supabase
            .from('matches')
            .select('id')
            .eq('group_id', groupId)
            .eq('time_slot_id', time_slot_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          // récupérer mon UID
          let uid = meId;
          if (!uid) {
            const { data: u } = await supabase.auth.getUser();
            uid = u?.user?.id ?? null;
          }

          if (createdMatch?.id) {
            createdMatchId = createdMatch.id;
            const notifyIds = Array.from(new Set([...(selectedUserIds || []), uid].filter(Boolean)));
            if (skipPostCreateModal) {
              notifyMatchCreated(createdMatchId, notifyIds);
              notifyGroupMatchCreated(createdMatchId, notifyIds);
            } else {
              showMatchCreatedUndo(createdMatchId, {
                onExpire: () => {
                  notifyMatchCreated(createdMatchId, notifyIds);
                  notifyGroupMatchCreated(createdMatchId, notifyIds);
                },
                onConfirm: () => {
                  notifyMatchCreated(createdMatchId, notifyIds);
                  notifyGroupMatchCreated(createdMatchId, notifyIds);
                },
              });
            }
            // Confirmer le match côté backend
            await supabase.from('matches').update({ status: 'confirmed' }).eq('id', createdMatch.id);
            // Accepter tous les joueurs sélectionnés
            const toAccept = (selectedUserIds || []).map(String).filter(Boolean);
            await acceptPlayers(createdMatch.id, toAccept);
            // Optimisme UI: marquer tout le monde en 'accepted'
            setRsvpsByMatch((prev) => {
              const next = { ...prev };
              const arr = Array.isArray(next[createdMatch.id]) ? [...next[createdMatch.id]] : [];
              const acceptedSet = new Set(toAccept);
              const updated = arr.map((r) =>
                acceptedSet.has(String(r.user_id)) ? { ...r, status: 'accepted' } : r
              );
              for (const id of toAccept) {
                if (!updated.find((r) => String(r.user_id) === String(id))) {
                  updated.push({ user_id: id, status: 'accepted' });
                }
              }
              next[createdMatch.id] = updated;
                return next;
              });
          }

        } catch (autoErr) {
          // on ne bloque pas la création si l'auto-RSVP échoue
          console.warn('[Matches] auto-RSVP failed:', autoErr?.message || autoErr);
        }
        isCreatingMatchRef.current = true;
        freezeDisplay(2200);
        await fetchData();
        setTimeout(() => { isCreatingMatchRef.current = false; }, 2500);
      } catch (e) {
        if (Platform.OS === "web") {
          window.alert("Impossible de créer le match\n" + (e.message ?? String(e)));
        } else {
          Alert.alert("Impossible de créer le match", e.message ?? String(e));
        }
      }
    },
    [groupId, fetchData, showMatchCreatedUndo]
  );

  const onRsvpAccept = useCallback(async (match_id) => {
    try {
      isConfirmingRsvpRef.current = true;
      freezeDisplay(1200);
      setTimeout(() => { isConfirmingRsvpRef.current = false; }, 1600);
      // Resolve my user id reliably (avoid accessing .getUser() without await)
      let uid = meId;
      if (!uid) {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        uid = data?.user?.id ?? null;
      }
      if (!uid) throw new Error('Utilisateur non connecté');

      // Upsert RSVP as accepted (normalized)
      const { error: eUp } = await supabase
        .from('match_rsvps')
        .upsert(
          { match_id, user_id: uid, status: normalizeRsvp('accepted') },
          { onConflict: 'match_id,user_id' }
        );
      if (eUp) throw eUp;

      // Optimistic UI update: mark me as accepted locally (normalized)
      setRsvpsByMatch((prev) => {
        const next = { ...prev };
        const arr = Array.isArray(next[match_id]) ? [...next[match_id]] : [];
        const i = arr.findIndex((r) => r.user_id === uid);
        if (i >= 0) {
          arr[i] = { ...arr[i], status: normalizeRsvp('accepted') };
        } else {
          arr.push({ user_id: uid, status: normalizeRsvp('accepted') });
        }
        next[match_id] = arr;
        return next;
      });

      await fetchData(true);
      if (Platform.OS === 'web') {
        window.alert('Participation confirmée ✅');
      } else {
        Alert.alert('MATCH', 'Participation confirmée ✅');
      }
    } catch (e) {
      if (Platform.OS === 'web') {
        window.alert('Impossible de confirmer\n' + (e.message ?? String(e)));
      } else {
        Alert.alert('Impossible de confirmer', e.message ?? String(e));
      }
    }
  }, [meId, fetchData]);

  const onRsvpCancel = useCallback(async (match_id) => {
    try {
      // Resolve my user id correctly
      let uid = meId;
      if (!uid) {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        uid = data?.user?.id ?? null;
      }
      if (!uid) throw new Error('Utilisateur non connecté');

      // Set my RSVP to 'maybe' instead of deleting (more robust with RLS + simpler UI toggle)
      const { error: eUp } = await supabase
        .from('match_rsvps')
        .upsert(
          { match_id, user_id: uid, status: normalizeRsvp('maybe') },
          { onConflict: 'match_id,user_id' }
        );
      if (eUp) throw eUp;

      // Optimistic UI update: mark me as 'maybe' locally so the badge/button toggles immediately
      setRsvpsByMatch((prev) => {
        const next = { ...prev };
        const arr = Array.isArray(next[match_id]) ? [...next[match_id]] : [];
        const i = arr.findIndex((r) => String(r.user_id) === String(uid));
        if (i >= 0) {
          arr[i] = { ...arr[i], status: normalizeRsvp('maybe') };
        } else {
          arr.push({ user_id: uid, status: normalizeRsvp('maybe') });
        }
        next[match_id] = arr;
        return next;
      });

      await fetchData();
      if (Platform.OS === 'web') {
        window.alert('Participation annulée');
      } else {
        Alert.alert('RSVP', 'Participation annulée');
      }
    } catch (e) {
      if (Platform.OS === 'web') {
        window.alert('Impossible d\'annuler\n' + (e.message ?? String(e)));
      } else {
        Alert.alert('Impossible d\'annuler', e.message ?? String(e));
      }
    }
  }, [meId, fetchData]);

  const onRsvpDecline = useCallback(async (match_id) => {
    try {
      // Resolve my user id correctly
      let uid = meId;
      if (!uid) {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        uid = data?.user?.id ?? null;
      }
      if (!uid) throw new Error('Utilisateur non connecté');

      // Use RPC function to update RSVP status and create notifications with proper permissions
      const { error: rpcError } = await supabase.rpc('update_match_rsvp_status', {
        p_match_id: match_id,
        p_user_id: uid,
        p_status: normalizeRsvp('no')
      });

      // If RPC function doesn't exist or fails, fallback to direct update
      if (rpcError) {
        // Check if function doesn't exist (error code 42883)
        if (rpcError.code === '42883' || rpcError.message?.includes('does not exist')) {
          // Function doesn't exist yet, use direct update (notification will fail but RSVP will work)
          const { error: eUp } = await supabase
            .from('match_rsvps')
            .upsert(
              { match_id, user_id: uid, status: normalizeRsvp('no') },
              { onConflict: 'match_id,user_id' }
            );
          if (eUp) {
            // If the error is about notification_outbox, it's a known issue with triggers
            // We can still consider the RSVP update successful if it's just a notification error
            const errorMsg = eUp.message || String(eUp);
            if (errorMsg.includes('notification_outbox') || errorMsg.includes('row-level security')) {
              console.warn('[onRsvpDecline] RSVP updated but notification failed:', errorMsg);
              // Continue as if successful - the RSVP was updated
            } else {
              throw eUp;
            }
          }
        } else {
          // Other error from RPC function
          throw rpcError;
        }
      }

      // Optimistic UI update
      setRsvpsByMatch((prev) => {
        const next = { ...prev };
        const arr = Array.isArray(next[match_id]) ? [...next[match_id]] : [];
        const i = arr.findIndex((r) => String(r.user_id) === String(uid));
        if (i >= 0) {
          arr[i] = { ...arr[i], status: normalizeRsvp('no') };
        } else {
          arr.push({ user_id: uid, status: normalizeRsvp('no') });
        }
        next[match_id] = arr;
        return next;
      });

      // Notifier le créateur du match si disponible
      try {
        const { data: matchInfo } = await supabase
          .from('matches')
          .select('group_id, created_by, time_slots(starts_at, ends_at)')
          .eq('id', match_id)
          .maybeSingle();
        const creatorId = matchInfo?.created_by;
        if (creatorId && String(creatorId) !== String(uid)) {
          const actorProfile = profilesById?.[String(uid)];
          const actorName =
            actorProfile?.display_name ||
            actorProfile?.name ||
            actorProfile?.email ||
            'Un joueur';
          await supabase.from('notification_jobs').insert({
            kind: 'rsvp_declined',
            recipients: [creatorId],
            group_id: matchInfo?.group_id,
            match_id,
            actor_id: uid,
            payload: {
              actor_name: actorName,
              starts_at: matchInfo?.time_slots?.starts_at ?? null,
              ends_at: matchInfo?.time_slots?.ends_at ?? null,
            },
          });
        }
      } catch (notifyErr) {
        console.warn('[onRsvpDecline] notification creator failed:', notifyErr?.message || notifyErr);
      }

      await fetchData();
      if (Platform.OS === 'web') {
        window.alert('Participation refusée');
      } else {
        Alert.alert('RSVP', 'Participation refusée');
      }
    } catch (e) {
      if (Platform.OS === 'web') {
        window.alert('Impossible de refuser\n' + (e.message ?? String(e)));
      } else {
        Alert.alert('Impossible de refuser', e.message ?? String(e));
      }
    }
  }, [meId, fetchData]);

  const confirmRsvpDecline = useCallback((match_id) => {
    const message = "Si vous confirmez, le match sera annulé.";
    if (Platform.OS === 'web') {
      const ok = window.confirm(message);
      if (ok) onRsvpDecline(match_id);
      return;
    }
    Alert.alert(
      'Confirmation',
      message,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Confirmer', style: 'destructive', onPress: () => onRsvpDecline(match_id) },
      ]
    );
  }, [onRsvpDecline]);

  const setCourtReservedLocal = React.useCallback((matchId, nextVal, when = null, who = null) => {    const apply = (arr) => arr.map((x) =>
      String(x.id) === String(matchId)
      ? { ...x, is_court_reserved: !!nextVal, court_reserved_at: when, court_reserved_by: who }
        : x
    );
    setMatchesConfirmed((prev = []) => apply(prev));
    setMatchesPending((prev = []) => apply(prev));
  }, []);
  
  const toggleCourtReservation = React.useCallback(async (matchId, currentVal) => {
    try {
      // 1) Resolve the user id FIRST (before any usage)
      let userId = meId;
      if (!userId) {
        const { data: u } = await supabase.auth.getUser();
        userId = u?.user?.id ?? null;
      }

      // 2) Compute next state and timestamp
      const nextVal = !currentVal;
      const when = nextVal ? new Date().toISOString() : null;

      // 3) Optimistic UI update (can safely reference userId now)
      setCourtReservedLocal(matchId, nextVal, when, nextVal ? userId : null);
      // 4) Persist to DB
      const { error } = await supabase
        .from('matches')
        .update({
          is_court_reserved: nextVal,
          court_reserved_at: when,
          court_reserved_by: nextVal ? userId : null,
        })
        .eq('id', matchId);
      if (error) throw error;
    } catch (e) {
      // Rollback on error
      setCourtReservedLocal(
        matchId,
        currentVal,
        currentVal ? new Date().toISOString() : null,
        null
      );
      if (Platform.OS === 'web') {
        window.alert(
          "Impossible de mettre à jour la réservation de terrain\n" +
            (e?.message ?? String(e))
        );
      } else {
        Alert.alert('Erreur', e?.message ?? String(e));
      }
    }
  }, [setCourtReservedLocal, meId]);

  // --- Annulation d'un match → retour en "propositions"
  const onCancelMatch = useCallback(async (match_id) => {
    if (!match_id) return;
    try {
      // 1) Essayer la RPC d'abord (méthode recommandée avec vérifications de sécurité)
      const { error: eRpc } = await supabase.rpc('cancel_match', { p_match: match_id });
      if (eRpc) {
        // Si la RPC échoue, essayer le fallback
        console.warn('[onCancelMatch] RPC failed, trying fallback:', eRpc.message || eRpc);
        
        // 2) Fallback: supprimer RSVPs puis le match
        const { error: eR } = await supabase.from('match_rsvps').delete().eq('match_id', match_id);
        if (eR) {
          console.error('[onCancelMatch] delete RSVPs error:', eR.message || eR);
          throw new Error('Impossible de supprimer les RSVPs: ' + (eR.message || String(eR)));
        }

        const { error: eM } = await supabase.from('matches').delete().eq('id', match_id);
        if (eM) {
          console.error('[onCancelMatch] delete match error:', eM.message || eM);
          throw new Error('Impossible de supprimer le match: ' + (eM.message || String(eM)));
        }
      }

      // Recharger les données après suppression réussie
      freezeDisplay(1800);
      await fetchData();
      if (Platform.OS === 'web') window.alert('Match annulé — le créneau revient dans les propositions.');
      else Alert.alert('Match annulé', 'Le créneau revient dans les propositions.');
    } catch (e) {
      console.error('[onCancelMatch] Error:', e);
      if (Platform.OS === 'web') window.alert('Impossible d\'annuler le match\n' + (e.message ?? String(e)));
      else Alert.alert('Erreur', e.message ?? String(e));
    }
  }, [fetchData]);

  const onAdminAccept = useCallback(async (match_id, user_id) => {
    try {
      // try RPC first (secure path with RLS)
      const { error: eRpc } = await supabase.rpc('admin_accept_player', {
        p_match: match_id,
        p_user: user_id,
      });
      if (eRpc) {
        // fallback: direct upsert (works only if RLS permits)
        const { error: eUp } = await supabase
          .from('match_rsvps')
          .upsert(
            { match_id, user_id, status: normalizeRsvp('accepted') },
            { onConflict: 'match_id,user_id' }
          );
        if (eUp) throw eUp;
      }

      // Optimistic UI update
      setRsvpsByMatch((prev) => {
        const next = { ...prev };
        const arr = Array.isArray(next[match_id]) ? [...next[match_id]] : [];
        const i = arr.findIndex((r) => String(r.user_id) === String(user_id));
        if (i >= 0) {
          arr[i] = { ...arr[i], status: normalizeRsvp('accepted') };
        } else {
          arr.push({ user_id, status: normalizeRsvp('accepted') });
        }
        next[match_id] = arr;
        return next;
      });

      await fetchData();
      if (Platform.OS === 'web') {
        window.alert('Joueur ajouté au match');
      } else {
        Alert.alert('RSVP', 'Joueur ajouté au match');
      }
    } catch (e) {
      if (Platform.OS === 'web') {
        window.alert('Impossible d\'ajouter le joueur\n' + (e.message ?? String(e)));
      } else {
        Alert.alert('Erreur', e.message ?? String(e));
      }
    }
  }, [fetchData]);

  // Open player profile (tap) – falls back to showing name if route not available
  const openPlayerProfile = React.useCallback((uid, displayName) => {
    try {
      // Lazy import to avoid requiring router if not used elsewhere
      const { useRouter } = require('expo-router');
      const RouterConsumer = () => null;
    } catch {}
  }, []);

  const onContactClub = useCallback(async () => {
    if (!groupId) return;
    try {
      const { data } = await supabase.from("groups").select("phone").eq("id", groupId).maybeSingle();
      const phone = data?.phone;
      if (phone) {
        await Linking.openURL(`tel:${phone}`);
      } else {
        setClubFallbackModalOpen(true);
      }
    } catch (e) {
      if (Platform.OS === "web") {
        window.alert("Erreur\n" + (e.message ?? String(e)));
      } else {
        Alert.alert("Erreur", e.message ?? String(e));
      }
    }
  }, [groupId]);

  const loadClubFallbacks = useCallback(async () => {
    setClubFallbackLoading(true);
    try {
      let ref = refPoint;
      if (!ref || !ref.lat || !ref.lng) {
        if (locationPermission === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          ref = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        } else {
          ref = { lat: 48.8566, lng: 2.3522 };
        }
      }

      const pageSize = 1000;
      let from = 0;
      let to = pageSize - 1;
      let allClubs = [];
      /* eslint-disable no-constant-condition */
      while (true) {
        const { data: page, error } = await supabase
          .from('clubs')
          .select('*')
          .order('id', { ascending: true })
          .range(from, to);
        if (error) throw error;
        const batch = Array.isArray(page) ? page : [];
        allClubs = allClubs.concat(batch);
        if (batch.length < pageSize) break;
        from += pageSize;
        to += pageSize;
      }

      const withDistance = (allClubs || [])
        .map((club) => {
          const hasCoords = club?.lat != null && club?.lng != null;
          return {
            ...club,
            distanceKm: hasCoords ? haversineKm(ref, { lat: club.lat, lng: club.lng }) : Infinity,
            phoneNumber: club.phone || null,
          };
        })
        .sort((a, b) => (a.distanceKm || Infinity) - (b.distanceKm || Infinity));

      setClubFallbacks(withDistance);
    } catch (e) {
      if (Platform.OS === "web") {
        window.alert("Erreur\n" + (e?.message ?? String(e)));
      } else {
        Alert.alert("Erreur", `Impossible de charger la liste des clubs: ${e?.message || String(e)}`);
      }
      setClubFallbacks([]);
    } finally {
      setClubFallbackLoading(false);
    }
  }, [refPoint, locationPermission]);

  useEffect(() => {
    if (clubFallbackModalOpen) {
      setClubFallbackSearchQuery('');
      loadClubFallbacks();
    }
  }, [clubFallbackModalOpen, loadClubFallbacks]);

  const visibleClubFallbacks = useMemo(() => {
    const base = clubFallbacks || [];
    const q = (clubFallbackSearchQuery || '').trim().toLowerCase();
    let filtered = base;
    if (q) {
      filtered = filtered.filter((c) => {
        const name = (c.name || '').toLowerCase();
        const address = (c.address || '').toLowerCase();
        const phone = (c.phoneNumber || '').toLowerCase();
        return name.includes(q) || address.includes(q) || phone.includes(q);
      });
    }
    return filtered
      .slice()
      .sort((a, b) => (a.distanceKm || Infinity) - (b.distanceKm || Infinity));
  }, [clubFallbacks, clubFallbackSearchQuery]);


  const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const WD = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const MO = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    const wd = WD[d.getDay()] || '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mo = MO[d.getMonth()] || '';
    const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `${wd} ${dd} ${mo} • ${time}`;
  };

  const formatRange = (sIso, eIso) => {
    if (!sIso || !eIso) return '';
    const s = new Date(sIso);
    const e = new Date(eIso);

    const WD = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const MO = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

    const wd = WD[s.getDay()] || '';
    const dd = String(s.getDate()).padStart(2, '0');
    const mo = MO[s.getMonth()] || '';

    const timeOpts = { hour: '2-digit', minute: '2-digit' };
    const sh = s.toLocaleTimeString('fr-FR', timeOpts);
    const eh = e.toLocaleTimeString('fr-FR', timeOpts);

    // "Mer 09 Oct - 18:30 à 20:00"
    return `${wd} ${dd} ${mo} - ${sh} à ${eh}`;
  };

  // --- Helper: always look up profiles by stringified id ---
  const profileOf = (map, uid) => (map && (map[String(uid)] || map[uid])) || null;

  // Affiche un avatar avec pastille de niveau si dispo
  const LevelAvatar = ({ profile = {}, size = 56, rsvpStatus, selected, onPress, onLongPressProfile }) => {
    const uri = profile?.avatar_url || null;
    const fallback = formatPlayerName(profile?.display_name || profile?.email || 'Joueur');
    const phone = profile?.phone || null;
    const level = profile?.niveau ?? profile?.level ?? null; // supporte `niveau` ou `level`
    const sidePref = String(profile?.cote || '').toLowerCase();
    const hasLeft = sidePref.includes('gauche') || sidePref.includes('left');
    const hasRight = sidePref.includes('droite') || sidePref.includes('right');
    const hasBoth =
      sidePref.includes('both') ||
      sidePref.includes('deux') ||
      sidePref.includes('ambid') ||
      sidePref.includes('2') ||
      (hasLeft && hasRight);
    const sideDir = hasBoth ? 'both' : hasLeft ? 'left' : hasRight ? 'right' : null;
  
    const handleLongPress = () => {
      if (profile?.id && onLongPressProfile) {
        onLongPressProfile(profile);
      }
    };
  
    return (
      <View style={{ position: 'relative', width: size, height: size }}>
        <Avatar
          uri={uri}
          size={size}
          rsvpStatus={rsvpStatus}
          fallback={fallback}
          phone={phone}
          onPress={onPress}
          onLongPress={handleLongPress}
          selected={selected}
        />
        {level != null && level !== '' && (
          <View
            style={{
              position: 'absolute',
              right: -4,
              bottom: -4,
              width: Math.max(22, Math.round(size * 0.38)),
              height: Math.max(22, Math.round(size * 0.38)),
              borderRadius: Math.max(11, Math.round(size * 0.19)),
              backgroundColor: colorForLevel(level), // fond = couleur du niveau
              borderWidth: 1,
              borderColor: '#ffffff',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                color: '#000000', // texte noir
                fontWeight: '900',
                fontSize: Math.max(10, Math.round(size * 0.34 * 0.6)),
              }}
            >
              {String(level)}
            </Text>
          </View>
        )}
        {sideDir && (
          <View
            style={{
              position: 'absolute',
              left: -3,
              bottom: -3,
              width: Math.max(17, Math.round(size * 0.30)),
              height: Math.max(17, Math.round(size * 0.30)),
              borderRadius: Math.max(9, Math.round(size * 0.15)),
              backgroundColor: '#6d6aff',
              borderWidth: 1,
              borderColor: '#ffffff',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons
              name={
                sideDir === 'both'
                  ? 'swap-horizontal'
                  : sideDir === 'left'
                    ? 'arrow-back'
                    : 'arrow-forward'
              }
              size={Math.max(9, Math.round(size * 0.19))}
              color="#ffffff"
            />
          </View>
        )}
      </View>
    );
  };

  const SlotRow = ({ item, type }) => {
    const userIds = type === "ready" ? item.ready_user_ids || [] : item.hot_user_ids || [];
    const [selectedIds, setSelectedIds] = React.useState([]);
    const toggleSelect = (uid) => {
      setSelectedIds((prev) => {
        const id = String(uid);
        if (prev.includes(id)) return prev.filter((x) => x !== id);
        // Limite stricte à 3 joueurs (4 au total avec le créateur)
        if (prev.length >= 3) return prev;
        return [...prev, id];
      });
    };
    // Création uniquement avec exactement 3 joueurs (4 au total avec le créateur)
    const canCreate = type === 'ready' && selectedIds.length === 3;
    const selectedPlayerIds = canCreate
      ? Array.from(new Set((selectedIds || []).concat(meId).filter(Boolean).map(String)))
      : [];
    const clubsMapReady = canCreate
      ? selectedPlayerIds.every((id) => Array.isArray(acceptedClubsByUser[String(id)]))
      : false;
    const commonClubCount = canCreate
      ? getCommonAcceptedClubs(selectedPlayerIds, acceptedClubsByUser).length
      : null;
    
    // Séparer le joueur authentifié des autres joueurs
    const otherUserIds = userIds.filter(uid => String(uid) !== String(meId));
    const myProfile = meId ? profileOf(profilesById, meId) : null;
    const isMeAvailable = meId && userIds.some(uid => String(uid) === String(meId));
    
    return (
      <View style={[cardStyle, { minHeight: 120 }]}>
        <Text style={{ fontWeight: "800", color: "#111827", fontSize: 16, marginBottom: 6 }}>
          {formatRange(item.starts_at, item.ends_at)}
        </Text>
        <Divider m={8} />
        <View style={{ marginBottom: 8 }}>
          <Badge tone='amber' text={`${type === 'ready' ? '🎾' : '🔥'} ${userIds.length} joueurs`} />
        </View>
        {type === "ready" && (
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            <Pressable
              disabled={!canCreate}
              accessibilityState={{ disabled: !canCreate }}
              onPress={canCreate ? press("Créer un match", () => openConfirm({ startsAt: item.starts_at, endsAt: item.ends_at, selectedUserIds: selectedIds, commonClubIds: item.common_club_ids })) : undefined}
              accessibilityRole="button"
              accessibilityLabel="Créer un match pour ce créneau"
              style={({ pressed }) => [
                { backgroundColor: canCreate ? '#15803d' : THEME.accent, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
                Platform.OS === "web" ? { cursor: canCreate ? 'pointer' : 'not-allowed', opacity: canCreate ? 1 : 0.85 } : null,
                pressed && canCreate ? { opacity: 0.8 } : null,
              ]}
            >
              {!canCreate ? (
                <Image source={clickIcon} style={{ width: 28, height: 28, marginRight: 8, tintColor: 'white' }} />
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {canCreate && (
                  <Image source={racketIcon} style={{ width: 24, height: 24, marginRight: 8, tintColor: 'white' }} />
                )}
                <Text style={{ color: "white", fontWeight: "800", fontSize: 16 }}>
                  {canCreate ? "Créer un match (4 joueurs)" : `Sélectionner ${3 - selectedIds.length} joueur${3 - selectedIds.length > 1 ? 's' : ''} (${selectedIds.length}/3)`}
                </Text>
              </View>
            </Pressable>
        </View>
        )}
        {type === "ready" && (
          <View style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 12, color: '#111827', fontWeight: '700' }}>
              Club : <Text style={{ color: '#6b7280', fontWeight: '700' }}>À choisir</Text>
            </Text>
            <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
              {canCreate
                ? (!clubsMapReady
                    ? 'Clubs en cours de chargement...'
                    : (commonClubCount > 0
                        ? `${commonClubCount} club${commonClubCount > 1 ? 's' : ''} commun${commonClubCount > 1 ? 's' : ''} possible${commonClubCount > 1 ? 's' : ''}`
                        : 'Aucun club commun'))
                : 'Sélectionne 3 joueurs pour voir les clubs communs'}
            </Text>
          </View>
        )}
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 0, flexWrap: "wrap", alignItems: 'center' }}>
          {/* Afficher l'avatar du joueur authentifié en premier s'il est disponible */}
          {isMeAvailable && myProfile && (
            <>
              <View style={{ position: 'relative' }}>
                <LevelAvatar
                  key={`me-${meId}`}
                  profile={myProfile}
                  onPress={undefined} // Non sélectionnable
                  onLongPressProfile={openProfile}
                  selected={false}
                  size={48}
                />
                {/* Badge pour indiquer que c'est le créateur */}
                <View style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  backgroundColor: '#10b981',
                  borderRadius: 10,
                  width: 20,
                  height: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 2,
                  borderColor: '#ffffff',
                }}>
                  <Text style={{ color: '#ffffff', fontSize: 10, fontWeight: '900' }}>✓</Text>
                </View>
              </View>
              {/* Symbole + entre mon avatar et les autres */}
              {otherUserIds.length > 0 && (
                <Text style={{ fontSize: 24, fontWeight: '900', color: '#111827', marginHorizontal: 4 }}>+</Text>
              )}
            </>
          )}
          {/* Afficher les autres joueurs */}
          {otherUserIds.map((uid) => {
            const p = profileOf(profilesById, uid);
            const isSelected = selectedIds.includes(String(uid));
            const canSelect = selectedIds.length < 3 || isSelected; // Limite à 3 joueurs max
            return (
              <LevelAvatar
                key={String(uid)}
                profile={p}
                onPress={canSelect ? () => toggleSelect(uid) : undefined}
                onLongPressProfile={openProfile}
                selected={isSelected}
                size={48}
              />
            );
          })}
        </View>
      </View>
    );
  };

// --- 1h30 ---
const LongSlotRow = ({ item }) => {
  console.log('[LongSlotRow] Rendered for item:', item.time_slot_id, 'starts_at:', item.starts_at);
  // Utiliser tous les joueurs disponibles pour ce créneau
  const allUserIds = item.ready_user_ids || [];
  const otherUserIds = allUserIds.filter(uid => String(uid) !== String(meId));
  const myProfile = meId ? profileOf(profilesById, meId) : null;
  const isMeAvailable = meId && allUserIds.some(uid => String(uid) === String(meId));
  const maxAvatars = 8;
  const [showAllPlayers, setShowAllPlayers] = React.useState(false);
  const limitedOtherIds = otherUserIds.slice(0, maxAvatars);
  const displayedOtherIds = showAllPlayers ? otherUserIds : limitedOtherIds;
  const extraCount = Math.max(0, otherUserIds.length - limitedOtherIds.length);

  // Selection state and helpers
  const [selectedIds, setSelectedIds] = React.useState([]);
  const toggleSelect = (uid) => {
    setSelectedIds((prev) => {
      const id = String(uid);
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      // Limite stricte à 3 joueurs (4 au total avec le créateur)
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };
  // Création uniquement avec exactement 3 joueurs (4 au total avec le créateur)
  const canCreate = selectedIds.length === 3;
  const remainingToSelect = Math.max(0, 3 - selectedIds.length);
  const selectLabel = `Sélectionner ${remainingToSelect} joueur${remainingToSelect > 1 ? 's' : ''}`;

  const enter = useEnterAnim(!matchCreatedUndoVisible);
  const ctaScale = useRef(new Animated.Value(1)).current;
  const slotEntries = [];
  if (isMeAvailable && myProfile) {
    slotEntries.push({ key: `me-${meId}`, id: meId, profile: myProfile, isMe: true });
  }
  selectedIds.forEach((id) => {
    const p = profileOf(profilesById, id) || { id, display_name: 'Joueur' };
    slotEntries.push({ key: `sel-${id}`, id, profile: p, isMe: false });
  });
  const emptySlots = Math.max(0, 4 - slotEntries.length);

  return (
    <Animated.View style={[styles.matchCardGlow, enter.style]}>
      <View style={styles.matchCard}>
        <Text style={styles.matchDate}>{formatRange(item.starts_at, item.ends_at)}</Text>

        {canCreate ? (
          <View style={styles.ctaRow}>
            <Animated.View style={{ transform: [{ scale: ctaScale }], flex: 1 }}>
              <Pressable
                onPress={press("Créer un match", () => openConfirm({ startsAt: item.starts_at, endsAt: item.ends_at, selectedUserIds: selectedIds, commonClubIds: item.common_club_ids }))}
                onPressIn={() => Animated.spring(ctaScale, { toValue: 0.98, useNativeDriver: true }).start()}
                onPressOut={() => Animated.spring(ctaScale, { toValue: 1, useNativeDriver: true }).start()}
                accessibilityRole="button"
                accessibilityLabel="Créer un match pour ce créneau 1h30"
                style={({ pressed }) => [
                  styles.ctaPrimary,
                  pressed ? styles.ctaButtonPressed : null,
                ]}
              >
                <Text style={styles.ctaPrimaryText}>Créer un match</Text>
              </Pressable>
            </Animated.View>
            <Pressable
              onPress={onContactClub}
              accessibilityRole="button"
              accessibilityLabel="Appeler un club"
              style={({ pressed }) => [
                styles.ctaSecondary,
                pressed ? { opacity: 0.9 } : null,
              ]}
            >
              <Ionicons name="call" size={18} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.ctaSecondaryText}>Appeler un club</Text>
            </Pressable>
          </View>
        ) : (
          <Animated.View style={{ transform: [{ scale: ctaScale }] }}>
            <Pressable
              disabled={!canCreate}
              accessibilityState={{ disabled: !canCreate }}
              onPress={canCreate ? press("Créer un match", () => openConfirm({ startsAt: item.starts_at, endsAt: item.ends_at, selectedUserIds: selectedIds, commonClubIds: item.common_club_ids })) : undefined}
              onPressIn={() => Animated.spring(ctaScale, { toValue: 0.98, useNativeDriver: true }).start()}
              onPressOut={() => Animated.spring(ctaScale, { toValue: 1, useNativeDriver: true }).start()}
              accessibilityRole="button"
              accessibilityLabel={`${selectLabel} pour ce créneau 1h30`}
              style={({ pressed }) => [
                styles.ctaButton,
                !canCreate && styles.ctaButtonDisabled,
                pressed ? styles.ctaButtonPressed : null,
              ]}
            >
              <Text style={[styles.ctaText, !canCreate && styles.ctaTextDisabled]}>
                {selectLabel}
              </Text>
            </Pressable>
          </Animated.View>
        )}

        <View style={styles.partnerSlotsRow}>
          {slotEntries.map((slot) => (
            <View key={slot.key} style={styles.partnerSlot}>
              <LevelAvatar
                profile={slot.profile}
                onPress={!slot.isMe ? () => toggleSelect(slot.id) : undefined}
                onLongPressProfile={openProfile}
                selected={!slot.isMe && selectedIds.includes(String(slot.id))}
                size={64}
              />
            </View>
          ))}
          {Array.from({ length: emptySlots }).map((_, idx) => (
            <View key={`empty-${idx}`} style={styles.partnerSlot}>
              <View style={styles.partnerSlotCircleEmpty}>
                <Ionicons name="add" size={26} color="#6d6aff" />
              </View>
            </View>
          ))}
        </View>
        <View style={styles.partnerPickerRow}>
          <Text style={styles.partnerPickerLabel}>Choisir ses partenaires</Text>
          <View style={styles.avatarRow}>
            {displayedOtherIds.map((uid) => {
              const p = profileOf(profilesById, uid);
              console.log('[LongSlotRow] User:', uid, 'profile exists:', !!p?.id);
              return (
                <View key={String(uid)} style={styles.avatarItem}>
                  <LevelAvatar
                    profile={p}
                    onPress={() => toggleSelect(uid)}
                    onLongPressProfile={openProfile}
                    selected={selectedIds.includes(String(uid))}
                    size={48}
                  />
                </View>
              );
            })}
            {extraCount > 0 && !showAllPlayers ? (
              <Pressable
                onPress={() => setShowAllPlayers(true)}
                accessibilityRole="button"
                accessibilityLabel={`Afficher ${extraCount} joueurs supplémentaires`}
                style={styles.avatarOverflow}
              >
                <Text style={styles.avatarOverflowText}>+{extraCount}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Animated.View>
  );
};

// --- 1h ---
const HourSlotRow = ({ item }) => {
  // Utiliser tous les joueurs disponibles pour ce créneau
  const allUserIds = item.ready_user_ids || [];
  const otherUserIds = allUserIds.filter(uid => String(uid) !== String(meId));
  const myProfile = meId ? profileOf(profilesById, meId) : null;
  const isMeAvailable = meId && allUserIds.some(uid => String(uid) === String(meId));
  const maxAvatars = 8;
  const [showAllPlayers, setShowAllPlayers] = React.useState(false);
  const limitedOtherIds = otherUserIds.slice(0, maxAvatars);
  const displayedOtherIds = showAllPlayers ? otherUserIds : limitedOtherIds;
  const extraCount = Math.max(0, otherUserIds.length - limitedOtherIds.length);

  // Selection state and helpers
  const [selectedIds, setSelectedIds] = React.useState([]);
  const toggleSelect = (uid) => {
    setSelectedIds((prev) => {
      const id = String(uid);
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      // Limite stricte à 3 joueurs (4 au total avec le créateur)
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };
  // Création uniquement avec exactement 3 joueurs (4 au total avec le créateur)
  const canCreate = selectedIds.length === 3;
  const remainingToSelect = Math.max(0, 3 - selectedIds.length);
  const selectLabel = `Sélectionner ${remainingToSelect} joueur${remainingToSelect > 1 ? 's' : ''}`;

  const enter = useEnterAnim(!matchCreatedUndoVisible);
  const ctaScale = useRef(new Animated.Value(1)).current;
  const slotEntries = [];
  if (isMeAvailable && myProfile) {
    slotEntries.push({ key: `me-${meId}`, id: meId, profile: myProfile, isMe: true });
  }
  selectedIds.forEach((id) => {
    const p = profileOf(profilesById, id) || { id, display_name: 'Joueur' };
    slotEntries.push({ key: `sel-${id}`, id, profile: p, isMe: false });
  });
  const emptySlots = Math.max(0, 4 - slotEntries.length);

  return (
    <Animated.View style={[styles.matchCardGlow, enter.style]}>
      <View style={styles.matchCard}>
        <Text style={styles.matchDate}>{formatRange(item.starts_at, item.ends_at)}</Text>

        {canCreate ? (
          <View style={styles.ctaRow}>
            <Animated.View style={{ transform: [{ scale: ctaScale }], flex: 1 }}>
              <Pressable
                onPress={press("Créer un match", () => openConfirm({ startsAt: item.starts_at, endsAt: item.ends_at, selectedUserIds: selectedIds, commonClubIds: item.common_club_ids }))}
                onPressIn={() => Animated.spring(ctaScale, { toValue: 0.98, useNativeDriver: true }).start()}
                onPressOut={() => Animated.spring(ctaScale, { toValue: 1, useNativeDriver: true }).start()}
                accessibilityRole="button"
                accessibilityLabel="Créer un match pour ce créneau 1h"
                style={({ pressed }) => [
                  styles.ctaPrimary,
                  pressed ? styles.ctaButtonPressed : null,
                ]}
              >
                <Text style={styles.ctaPrimaryText}>Créer un match</Text>
              </Pressable>
            </Animated.View>
            <Pressable
              onPress={onContactClub}
              accessibilityRole="button"
              accessibilityLabel="Appeler un club"
              style={({ pressed }) => [
                styles.ctaSecondary,
                pressed ? { opacity: 0.9 } : null,
              ]}
            >
              <Ionicons name="call" size={18} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.ctaSecondaryText}>Appeler un club</Text>
            </Pressable>
          </View>
        ) : (
          <Animated.View style={{ transform: [{ scale: ctaScale }] }}>
            <Pressable
              disabled={!canCreate}
              accessibilityState={{ disabled: !canCreate }}
              onPress={canCreate ? press("Créer un match", () => openConfirm({ startsAt: item.starts_at, endsAt: item.ends_at, selectedUserIds: selectedIds, commonClubIds: item.common_club_ids })) : undefined}
              onPressIn={() => Animated.spring(ctaScale, { toValue: 0.98, useNativeDriver: true }).start()}
              onPressOut={() => Animated.spring(ctaScale, { toValue: 1, useNativeDriver: true }).start()}
              accessibilityRole="button"
              accessibilityLabel={`${selectLabel} pour ce créneau 1h`}
              style={({ pressed }) => [
                styles.ctaButton,
                !canCreate && styles.ctaButtonDisabled,
                pressed ? styles.ctaButtonPressed : null,
              ]}
            >
              <Text style={[styles.ctaText, !canCreate && styles.ctaTextDisabled]}>
                {selectLabel}
              </Text>
            </Pressable>
          </Animated.View>
        )}

        <View style={styles.partnerSlotsRow}>
          {slotEntries.map((slot) => (
            <View key={slot.key} style={styles.partnerSlot}>
              <LevelAvatar
                profile={slot.profile}
                onPress={!slot.isMe ? () => toggleSelect(slot.id) : undefined}
                onLongPressProfile={openProfile}
                selected={!slot.isMe && selectedIds.includes(String(slot.id))}
                size={64}
              />
            </View>
          ))}
          {Array.from({ length: emptySlots }).map((_, idx) => (
            <View key={`empty-${idx}`} style={styles.partnerSlot}>
              <View style={styles.partnerSlotCircleEmpty}>
                <Ionicons name="add" size={26} color="#6d6aff" />
              </View>
            </View>
          ))}
        </View>
        <View style={styles.partnerPickerRow}>
          <Text style={styles.partnerPickerLabel}>Choisir ses partenaires</Text>
          <View style={styles.avatarRow}>
            {displayedOtherIds.map((uid) => {
              const p = profileOf(profilesById, uid);
              console.log('[HourSlotRow] User:', uid, 'profile exists:', !!p?.id);
              return (
                <View key={String(uid)} style={styles.avatarItem}>
                  <LevelAvatar
                    profile={p}
                    onPress={() => toggleSelect(uid)}
                    onLongPressProfile={openProfile}
                    selected={selectedIds.includes(String(uid))}
                    size={48}
                  />
                </View>
              );
            })}
            {extraCount > 0 && !showAllPlayers ? (
              <Pressable
                onPress={() => setShowAllPlayers(true)}
                accessibilityRole="button"
                accessibilityLabel={`Afficher ${extraCount} joueurs supplémentaires`}
                style={styles.avatarOverflow}
              >
                <Text style={styles.avatarOverflowText}>+{extraCount}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Animated.View>
  );
};

  // Small card renderers for RSVP and confirmed lists
  const MatchCard = ({ m }) => {
    const slot = m.time_slots || {};
    const rsvps = rsvpsByMatch[m.id] || [];
    // --- Begin: inserted availIds/extraProfiles state and effect for confirmed card
    const [availIds, setAvailIds] = React.useState([]);
    const [extraProfiles, setExtraProfiles] = React.useState({});

    React.useEffect(() => {
      (async () => {
        const s = m?.time_slots?.starts_at;
        const e = m?.time_slots?.ends_at;
        if (!s || !e) return setAvailIds([]);
        const ids = await computeAvailableUserIdsForInterval(groupId, s, e);
        setAvailIds(Array.isArray(ids) ? ids : []);
        const missing = (Array.isArray(ids) ? ids : []).filter((id) => !profilesById[id]);
        if (missing.length) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url, email, niveau, phone')
            .in('id', missing);
          const map = Object.fromEntries((profs || []).map((p) => [p.id, p]));
          setExtraProfiles(map);
        } else {
          setExtraProfiles({});
        }
      })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [m?.id, m?.time_slots?.starts_at, m?.time_slots?.ends_at, groupId, rsvpsByMatch]);
    // --- End: inserted availIds/extraProfiles state and effect
    return (
      <View style={styles.matchCardGlow}>
        <View style={styles.matchCard}>
          <Text style={styles.matchDate}>{formatRange(slot.starts_at, slot.ends_at)}</Text>
        <MetaLine m={m} />
        <Divider m={8} />
        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontWeight: '800', color: THEME.text }}>
            {`✅ ${(rsvps || []).filter(r => (r.status || '').toLowerCase() === 'accepted').length}/4 confirmés`}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {rsvps.map((r) => {
            const p = profilesById[r.user_id];
            return (
              <LevelAvatar
                key={r.user_id}
                profile={p}
                rsvpStatus={r.status}
                onLongPressProfile={openProfile}
                size={56}
              />
            );
          })}
        </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
          </View>
        </View>
      </View>
    );
  };

  const MatchCardConfirmed = ({ m }) => {
    // Récupérer le groupe actif pour accéder au club_id
    const { activeGroup } = useActiveGroup();
    const router = useRouter();
    
    // time_slots peut être un array ou un objet
    const initialSlot = Array.isArray(m?.time_slots) ? (m.time_slots[0] || null) : (m?.time_slots || null);
    const [loadedSlot, setLoadedSlot] = React.useState(initialSlot);
    const slot = loadedSlot || {};
    
    // États pour le modal de sélection de clubs
    const [clubModalOpen, setClubModalOpen] = React.useState(false);
    const [clubsWithDistance, setClubsWithDistance] = React.useState([]);
    const [clubSearchQuery, setClubSearchQuery] = React.useState('');
    const [clubRadiusKm, setClubRadiusKm] = React.useState(50); // Rayon par défaut: 50km
    const [loadingClubs, setLoadingClubs] = React.useState(false);
    const [userLocation, setUserLocation] = React.useState(null);
    
    // État pour le club du match (pour le bouton d'appel)
    // Utiliser une référence pour mémoriser le club et éviter les changements
    const matchClubRef = React.useRef(null);
    const clubIdRef = React.useRef(null);
    const [matchClub, setMatchClub] = React.useState(null);
    const [loadingClub, setLoadingClub] = React.useState(true);
    
    // État pour vérifier si un résultat existe déjà et stocker les détails
    const [matchResult, setMatchResult] = React.useState(null);
    const [loadingResult, setLoadingResult] = React.useState(true);
    
    // États pour le modal de remplacement
    const [replacementModalOpen, setReplacementModalOpen] = React.useState(false);
    const [replacementTargetUserId, setReplacementTargetUserId] = React.useState(null);
    const [replacementTargetUserName, setReplacementTargetUserName] = React.useState(null);
    const [replacementMembers, setReplacementMembers] = React.useState([]);
    const [replacementLoading, setReplacementLoading] = React.useState(false);
    const [replacementQuery, setReplacementQuery] = React.useState('');
    const [replacementLevelFilter, setReplacementLevelFilter] = React.useState([]);
    const [replacementLevelFilterVisible, setReplacementLevelFilterVisible] = React.useState(false);
    const [replacementGeoLocationType, setReplacementGeoLocationType] = React.useState(null);
    const [replacementGeoRefPoint, setReplacementGeoRefPoint] = React.useState(null);
    const [replacementGeoCityQuery, setReplacementGeoCityQuery] = React.useState('');
    const [replacementGeoCitySuggestions, setReplacementGeoCitySuggestions] = React.useState([]);
    const [replacementGeoRadiusKm, setReplacementGeoRadiusKm] = React.useState(null);
    const [replacementGeoFilterVisible, setReplacementGeoFilterVisible] = React.useState(false);
    
    // États pour la popup de confirmation
    const [replacementConfirmVisible, setReplacementConfirmVisible] = React.useState(false);
    const [pendingReplacement, setPendingReplacement] = React.useState(null);
    
    // Charger le time_slot si manquant
    React.useEffect(() => {
      console.log('[MatchCardConfirmed] Render for match:', m?.id, 'slot_id:', m?.time_slot_id);
      console.log('[MatchCardConfirmed] Initial slot:', loadedSlot ? 'loaded' : 'NULL', 'm.time_slots:', m?.time_slots);
      
      if (!loadedSlot && m?.time_slot_id) {
        console.log('[MatchCardConfirmed] ⚡️ CHARGEMENT DU TIME_SLOT:', m.time_slot_id);
        (async () => {
          const { data: timeSlotData, error } = await supabase
            .from('time_slots')
            .select('*')
            .eq('id', m.time_slot_id)
            .maybeSingle();
          console.log('[MatchCardConfirmed] ⚡️ Resultat:', timeSlotData, 'error:', error);
          if (timeSlotData) {
            console.log('[MatchCardConfirmed] ✅ Time_slot chargé:', timeSlotData.id, 'starts_at:', timeSlotData.starts_at, 'ends_at:', timeSlotData.ends_at);
            setLoadedSlot(timeSlotData);
          } else {
            console.error('[MatchCardConfirmed] ❌ Time_slot non trouvé pour:', m.time_slot_id);
          }
        })();
      } else if (!m?.time_slot_id) {
        console.error('[MatchCardConfirmed] ❌ Pas de time_slot_id pour le match:', m?.id);
      }
    }, [m?.time_slot_id, loadedSlot, m?.time_slots]);
    
    // Charger les informations du club support du groupe pour le bouton d'appel
    React.useEffect(() => {
      let cancelled = false;
      
      // Utiliser le club_id du groupe actif (club support) si disponible
      const clubId = activeGroup?.club_id;
      
      // Si le club_id n'a pas changé et qu'on a déjà le club, ne pas recharger
      if (clubIdRef.current === clubId && matchClubRef.current) {
        // S'assurer que le state correspond à la référence
        if (!matchClub || matchClub.id !== matchClubRef.current.id) {
          setMatchClub(matchClubRef.current);
        }
        if (loadingClub) {
          setLoadingClub(false);
        }
        return;
      }
      
      clubIdRef.current = clubId;
      
      if (!clubId) {
        if (!cancelled) {
          matchClubRef.current = null;
          setMatchClub(null);
          setLoadingClub(false);
        }
        return;
      }
      
      setLoadingClub(true);
      (async () => {
        const { data: clubData, error } = await supabase
          .from('clubs')
          .select('id, name, call_button_enabled, call_button_label, call_phone')
          .eq('id', clubId)
          .maybeSingle();
        
        if (cancelled) return;
        
        if (error) {
          console.warn('[MatchCardConfirmed] Erreur chargement club:', error);
          if (!cancelled) {
            matchClubRef.current = null;
            setMatchClub(null);
            setLoadingClub(false);
          }
        } else if (clubData && clubData.call_button_enabled && clubData.call_phone) {
          // Toujours mettre à jour la référence et le state
          matchClubRef.current = clubData;
          if (!cancelled) {
            setMatchClub(clubData);
            setLoadingClub(false);
          }
        } else {
          if (!cancelled) {
            matchClubRef.current = null;
            setMatchClub(null);
            setLoadingClub(false);
          }
        }
      })();
      
      return () => {
        cancelled = true;
      };
    }, [activeGroup?.club_id]);
    
    // Vérifier si un résultat existe déjà pour ce match et récupérer les détails
    React.useEffect(() => {
      if (!m?.id) return;
      
      (async () => {
        try {
          setLoadingResult(true);
          const { data: result, error } = await supabase
            .from('match_results')
            .select(`
              id,
              team1_score,
              team2_score,
              winner_team,
              team1_player1_id,
              team1_player2_id,
              team2_player1_id,
              team2_player2_id,
              score_text,
              recorded_at
            `)
            .eq('match_id', m.id)
            .maybeSingle();
          
          if (error) {
            console.warn('[MatchCardConfirmed] Error checking match result:', error);
            setMatchResult(null);
          } else {
            setMatchResult(result);
          }
        } catch (e) {
          console.error('[MatchCardConfirmed] Exception checking match result:', e);
          setMatchResult(null);
        } finally {
          setLoadingResult(false);
        }
      })();
    }, [m?.id]);
    
    const rsvps = rsvpsByMatch[m.id] || [];
    const accepted = rsvps.filter(r => (String(r.status || '').toLowerCase() === 'accepted'));
    const declined = rsvps.filter(r => (String(r.status || '').toLowerCase() === 'no'));
    const acceptedCount = accepted.length;
    const creatorUserId = m?.created_by || null;
    const isCreator = creatorUserId && meId ? String(creatorUserId) === String(meId) : false;
    
    // Mémoriser le texte du bouton "Appeler" pour éviter les changements de formatage
    // Utiliser uniquement la référence pour éviter les changements
    const callButtonTextRef = React.useRef(null);
    const callButtonText = React.useMemo(() => {
      // Utiliser la référence plutôt que le state
      const club = matchClubRef.current;
      if (!club) {
        callButtonTextRef.current = null;
        return null;
      }
      
      // Créer une clé unique basée sur les propriétés du club
      const clubKey = `${club.id}-${club.call_button_label || ''}-${club.name || ''}`;
      
      // Si le texte n'a pas changé, retourner la valeur mémorisée
      if (callButtonTextRef.current && callButtonTextRef.current.key === clubKey) {
        return callButtonTextRef.current.value;
      }
      
      const label = club.call_button_label;
      const name = club.name;
      let result;
      
      if (label) {
        // Normaliser le texte pour éviter les variations - garder le formatage original exact
        result = label.includes('\n')
          ? label
          : label.replace(/\s+/, '\n');
      } else {
        // Format standardisé : "Appeler" avec première lettre en majuscule
        const clubName = name || 'le club';
        result = `Appeler\n${clubName}`;
      }
      
      // Mémoriser le résultat
      callButtonTextRef.current = { key: clubKey, value: result };
      return result;
    }, [matchClubRef.current?.id, matchClubRef.current?.call_button_label, matchClubRef.current?.name]);
    // Vérifier si l'utilisateur actuel est dans les joueurs confirmés
    // Vérifier aussi avec différentes variantes de comparaison pour être sûr
    const isUserInAccepted = React.useMemo(() => {
      if (!meId || !accepted.length) return false;
      const meIdStr = String(meId);
      const found = accepted.some(r => {
        const rUserId = String(r.user_id || r.userId || '');
        return rUserId === meIdStr;
      });
      console.log('[MatchCardConfirmed] isUserInAccepted check:', {
        matchId: m?.id,
        meId: meIdStr,
        acceptedUserIds: accepted.map(r => String(r.user_id || r.userId || '')),
        found,
        acceptedCount: accepted.length,
        rsvpsCount: rsvps.length
      });
      return found;
    }, [meId, accepted, m?.id]);
    const reserverName =
      profilesById?.[String(m?.court_reserved_by)]?.display_name ||
      profilesById?.[String(m?.court_reserved_by)]?.name ||
      null;

    const [reserved, setReserved] = React.useState(!!m?.is_court_reserved);
    const [savingReserved, setSavingReserved] = React.useState(false);

    // Charger la position de l'utilisateur pour calculer les distances
    React.useEffect(() => {
      (async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({});
            setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
          }
        } catch (e) {
          console.warn('[MatchCardConfirmed] Erreur position:', e);
        }
      })();
    }, []);

    // Charger les clubs quand le modal s'ouvre
    const loadClubs = React.useCallback(async () => {
      setLoadingClubs(true);
      try {
        // Pagination: Supabase retourne max ~1000 lignes par requête → charger par pages
        const pageSize = 1000;
        let from = 0;
        let to = pageSize - 1;
        let allClubs = [];
        /* eslint-disable no-constant-condition */
        while (true) {
          const { data: page, error } = await supabase
            .from('clubs')
            .select('*')
            .not('lat', 'is', null)
            .not('lng', 'is', null)
            .order('id', { ascending: true })
            .range(from, to);
          if (error) {
            console.error('[MatchCardConfirmed] Erreur Supabase (page):', error);
            throw error;
          }
          const batch = Array.isArray(page) ? page : [];
          allClubs = allClubs.concat(batch);
          if (batch.length < pageSize) break; // dernière page atteinte
          from += pageSize;
          to += pageSize;
        }
        
        // Calculer la distance pour chaque club si on a la position de l'utilisateur
        const refPoint = userLocation || { lat: 48.8566, lng: 2.3522 }; // Fallback Paris si pas de position
        const clubsWithDist = (allClubs || []).map(club => ({
          ...club,
          distanceKm: haversineKm(refPoint, { lat: club.lat, lng: club.lng }),
          phoneNumber: club.phone || null
        })).sort((a, b) => a.distanceKm - b.distanceKm);
        
        console.log('[MatchCardConfirmed] Clubs chargés:', clubsWithDist.length, 'Position ref:', refPoint);
        const herculeClub = clubsWithDist.find(c => c.name && c.name.toLowerCase().includes('hercule'));
        console.log('[MatchCardConfirmed] Hercule & Hops trouvé:', herculeClub ? {
          name: herculeClub.name,
          phone: herculeClub.phoneNumber,
          distance: herculeClub.distanceKm,
          id: herculeClub.id
        } : 'NON TROUVÉ');
        console.log('[MatchCardConfirmed] Tous les clubs avec "hercule" dans le nom:', clubsWithDist.filter(c => c.name && c.name.toLowerCase().includes('hercule')).map(c => ({ name: c.name, phone: c.phoneNumber })));
        
        setClubsWithDistance(clubsWithDist);
      } catch (e) {
        console.error('[MatchCardConfirmed] Erreur chargement clubs:', e);
        Alert.alert('Erreur', `Impossible de charger la liste des clubs: ${e?.message || String(e)}`);
        setClubsWithDistance([]);
      } finally {
        setLoadingClubs(false);
      }
    }, [userLocation]);
    
    React.useEffect(() => {
      if (clubModalOpen) {
        setClubSearchQuery(''); // Réinitialiser la recherche à l'ouverture
        loadClubs();
      }
    }, [clubModalOpen, loadClubs]);

    const visibleClubs = React.useMemo(() => {
      const base = clubsWithDistance || [];
      const q = (clubSearchQuery || '').trim().toLowerCase();
      
      // 1. Filtrer par rayon kilométrique
      let filtered = base.filter((c) => {
        const distance = c.distanceKm || Infinity;
        return distance <= clubRadiusKm;
      });
      
      // 2. Filtrer par recherche textuelle si une recherche est active
      if (q) {
        filtered = filtered.filter((c) => {
          const name = (c.name || '').toLowerCase().replace(/&/g, 'et').replace(/\s+/g, ' ');
          const address = (c.address || '').toLowerCase();
          const searchTerm = q.replace(/&/g, 'et').replace(/\s+/g, ' ');
          return name.includes(searchTerm) || address.includes(q);
        });
      }
      
      // 3. Trier : par nom si recherche active, sinon par distance
      if (q) {
        filtered.sort((a, b) => {
          const nameA = (a.name || '').toLowerCase();
          const nameB = (b.name || '').toLowerCase();
          return nameA.localeCompare(nameB, 'fr');
        });
      } else {
        // Déjà trié par distance dans loadClubs, mais on peut retrier si nécessaire
        filtered.sort((a, b) => (a.distanceKm || Infinity) - (b.distanceKm || Infinity));
      }
      
      console.log('[MatchCardConfirmed] Recherche:', q || '(aucune)', 'Rayon:', clubRadiusKm, 'km', 'Total clubs:', base.length, 'Résultats:', filtered.length);
      
      return filtered;
    }, [clubsWithDistance, clubSearchQuery, clubRadiusKm]);

    const toggleReserved = React.useCallback(async () => {
      if (savingReserved) return;
      try {
        setSavingReserved(true);
        const next = !reserved;
        setReserved(next); // UI optimiste
        const { error } = await supabase
          .from('matches')
          .update({ is_court_reserved: next })
          .eq('id', m.id);
        if (error) {
          setReserved(!next); // rollback
          if (Platform.OS === 'web') {
            if (typeof window !== 'undefined' && window.alert) window.alert("Échec de mise à jour 'terrain réservé'.");
          } else {
            Alert.alert('Erreur', "Échec de mise à jour 'terrain réservé'.");
          }
        }
      } finally {
        setSavingReserved(false);
      }
    }, [reserved, savingReserved, m?.id]);

    // Fonction pour charger les membres du groupe pour le remplacement
    const loadReplacementMembers = React.useCallback(async () => {
      if (!groupId) {
        Alert.alert('Erreur', 'Aucun groupe sélectionné.');
        return;
      }
      
      // Récupérer le créneau du match
      const matchStart = slot?.starts_at;
      const matchEnd = slot?.ends_at;
      
      if (!matchStart || !matchEnd) {
        Alert.alert('Erreur', 'Impossible de récupérer le créneau du match.');
        return;
      }
      
      setReplacementLoading(true);
      try {
        // Charger les membres du groupe (similaire à loadGroupMembersForFlash)
        const members = await loadGroupMembersForFlash(groupId);
        
        // Exclure les joueurs déjà dans le match (4 confirmés)
        const acceptedUserIds = new Set(accepted.map(r => String(r.user_id)));
        // Exclure l'utilisateur actuel
        const filteredMembers = members.filter(member => {
          const memberId = String(member.id);
          return !acceptedUserIds.has(memberId) && memberId !== String(meId);
        });
        
        // Vérifier la disponibilité de chaque membre sur le créneau du match
        const availableMembers = [];
        for (const member of filteredMembers) {
          try {
            // Utiliser get_availability_effective pour vérifier la disponibilité sur le créneau
            const { data: availabilityData, error: availError } = await supabase.rpc('get_availability_effective', {
              p_group: groupId,
              p_user: member.id,
              p_low: new Date(matchStart).toISOString(),
              p_high: new Date(matchEnd).toISOString(),
            });
            
            if (!availError && availabilityData && Array.isArray(availabilityData)) {
              // Vérifier si le membre a une disponibilité 'available' qui chevauche le créneau du match
              const isAvailable = availabilityData.some(av => {
                const avStart = new Date(av.start);
                const avEnd = new Date(av.end);
                const matchStartDate = new Date(matchStart);
                const matchEndDate = new Date(matchEnd);
                
                // Vérifier que le statut est 'available'
                if (String(av.status || '').toLowerCase() !== 'available') {
                  return false;
                }
                
                // Vérifier que la disponibilité chevauche le créneau du match
                // La disponibilité doit commencer avant ou au moment où le match se termine
                // et se terminer après ou au moment où le match commence
                return avStart <= matchEndDate && avEnd >= matchStartDate;
              });
              
              if (isAvailable) {
                availableMembers.push(member);
              }
            }
          } catch (e) {
            console.warn(`[Replacement] Erreur vérification disponibilité pour ${member.id}:`, e);
            // En cas d'erreur, ne pas inclure le membre pour être sûr
          }
        }
        
        // Charger les profils complets avec adresses pour le filtre géo
        const memberIds = availableMembers.map(m => m.id);
        if (memberIds.length > 0) {
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('id, display_name, name, niveau, phone, address_home, address_work, avatar_url')
            .in('id', memberIds);
          
          if (!profilesError && profilesData) {
            const enrichedMembers = availableMembers.map(member => {
              const profile = profilesData.find(p => String(p.id) === String(member.id));
              return {
                ...member,
                display_name: profile?.display_name || member.name,
                phone: profile?.phone,
                address_home: profile?.address_home,
                address_work: profile?.address_work,
                avatar_url: profile?.avatar_url,
              };
            });
            setReplacementMembers(enrichedMembers);
          } else {
            setReplacementMembers(availableMembers);
          }
        } else {
          setReplacementMembers([]);
        }
      } catch (e) {
        console.error('[Replacement] Erreur chargement membres:', e);
        Alert.alert('Erreur', `Impossible de charger les membres: ${e?.message || String(e)}`);
        setReplacementMembers([]);
      } finally {
        setReplacementLoading(false);
      }
    }, [groupId, accepted, meId, slot?.starts_at, slot?.ends_at]);

    // Fonction pour rechercher une ville (géolocalisation)
    const searchReplacementGeoCity = React.useCallback(async (query) => {
      if (!query || query.length < 3) {
        setReplacementGeoCitySuggestions([]);
        return;
      }
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=fr&accept-language=fr`;
        const res = await fetch(url);
        const data = await res.json();
        const suggestions = (data || []).map(item => ({
          name: item.display_name,
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
        }));
        setReplacementGeoCitySuggestions(suggestions);
      } catch (e) {
        console.warn('[ReplacementGeo] city search error:', e);
        setReplacementGeoCitySuggestions([]);
      }
    }, []);

    // Gérer le changement de type de localisation géographique
    React.useEffect(() => {
      if (replacementGeoLocationType === 'current' && userLocation) {
        setReplacementGeoRefPoint({ lat: userLocation.lat, lng: userLocation.lng, address: 'Position actuelle' });
      } else if (replacementGeoLocationType === 'home') {
        // Récupérer l'adresse du domicile de l'utilisateur
        const myProfile = profilesById?.[String(meId)];
        if (myProfile?.address_home?.lat && myProfile?.address_home?.lng) {
          setReplacementGeoRefPoint({
            lat: myProfile.address_home.lat,
            lng: myProfile.address_home.lng,
            address: myProfile.address_home.address || 'Domicile'
          });
        }
      } else if (replacementGeoLocationType === 'work') {
        // Récupérer l'adresse du travail de l'utilisateur
        const myProfile = profilesById?.[String(meId)];
        if (myProfile?.address_work?.lat && myProfile?.address_work?.lng) {
          setReplacementGeoRefPoint({
            lat: myProfile.address_work.lat,
            lng: myProfile.address_work.lng,
            address: myProfile.address_work.address || 'Travail'
          });
        }
      } else if (replacementGeoLocationType !== 'city') {
        setReplacementGeoRefPoint(null);
        setReplacementGeoRadiusKm(null);
      }
    }, [replacementGeoLocationType, userLocation, meId, profilesById]);

    // Fonction pour remplacer un joueur
    const onReplacePlayer = React.useCallback(async (matchId, currentUserId, newUserId, newUserName) => {
      try {
        // Utiliser la fonction RPC pour remplacer le joueur (contourne les problèmes RLS)
        const { error: rpcError } = await supabase.rpc('replace_match_player', {
          p_match_id: matchId,
          p_current_user_id: currentUserId,
          p_new_user_id: newUserId,
        });

        if (rpcError) {
          throw rpcError;
        }

        // Mettre à jour l'UI optimiste
        setRsvpsByMatch((prev) => {
          const next = { ...prev };
          const arr = Array.isArray(next[matchId]) ? [...next[matchId]] : [];
          // Supprimer l'ancien RSVP
          const filtered = arr.filter(r => String(r.user_id) !== String(currentUserId));
          // Ajouter le nouveau RSVP
          filtered.push({ user_id: newUserId, status: 'accepted' });
          next[matchId] = filtered;
          return next;
        });

        // Rafraîchir les données
        DeviceEventEmitter.emit('AVAILABILITY_CHANGED', { groupId, userId: currentUserId });
        
        // Fermer les modals
        setReplacementModalOpen(false);
        setReplacementConfirmVisible(false);
        setPendingReplacement(null);
        setReplacementTargetUserId(null);
        setReplacementTargetUserName(null);
        
        // Message de succès
        Alert.alert('Succès', `${newUserName || 'Le remplaçant'} a été ajouté au match.`);
      } catch (e) {
        console.error('[Replacement] Erreur:', e);
        Alert.alert('Erreur', `Impossible de remplacer le joueur: ${e?.message || String(e)}`);
      }
    }, [groupId]);

    // Calculer les membres filtrés pour le remplacement
    const filteredReplacementMembers = React.useMemo(() => {
      const base = replacementMembers || [];
      const q = (replacementQuery || '').trim().toLowerCase();
      
      let filtered = base.filter(member => {
        // Filtre par recherche textuelle
        if (q) {
          const name = (member.display_name || member.name || '').toLowerCase();
          const email = (member.email || '').toLowerCase();
          const niveau = String(member.niveau || '').toLowerCase();
          if (!name.includes(q) && !email.includes(q) && !niveau.includes(q)) {
            return false;
          }
        }
        
        // Filtre par niveau
        if (replacementLevelFilter.length > 0) {
          const memberLevel = Number(member.niveau);
          if (!Number.isFinite(memberLevel)) return false;
          
          const isInRange = replacementLevelFilter.some(range => {
            const parts = String(range).split('/').map(s => Number(s.trim())).filter(n => Number.isFinite(n));
            if (parts.length !== 2) return false;
            const [min, max] = parts.sort((a, b) => a - b);
            return memberLevel >= min && memberLevel <= max;
          });
          
          if (!isInRange) return false;
        }
        
        // Filtre géographique
        if (replacementGeoRefPoint && replacementGeoRefPoint.lat != null && replacementGeoRefPoint.lng != null && replacementGeoRadiusKm != null) {
          let playerLat = null;
          let playerLng = null;
          if (member.address_home?.lat && member.address_home?.lng) {
            playerLat = member.address_home.lat;
            playerLng = member.address_home.lng;
          } else if (member.address_work?.lat && member.address_work?.lng) {
            playerLat = member.address_work.lat;
            playerLng = member.address_work.lng;
          }
          
          if (!playerLat || !playerLng) return false;
          
          const distanceKm = haversineKm(replacementGeoRefPoint, { lat: playerLat, lng: playerLng });
          if (distanceKm > replacementGeoRadiusKm) return false;
        }
        
        return true;
      });
      
      return filtered;
    }, [replacementMembers, replacementQuery, replacementLevelFilter, replacementGeoRefPoint, replacementGeoRadiusKm]);

    // Récupérer la date du créneau
    const slotDate = (slot.starts_at && slot.ends_at) ? formatRange(slot.starts_at, slot.ends_at) : '';
    console.log('[MatchCardConfirmed] slotDate:', slotDate, 'slot.starts_at:', slot.starts_at, 'slot.ends_at:', slot.ends_at, 'm:', m.id, 'm.time_slot_id:', m?.time_slot_id);
    const matchDate = m.created_at ? new Date(m.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : null;

    return (
      <View style={[styles.matchCardGlow, reserved && styles.matchCardGlowReserved]}>
        <View style={[styles.matchCard, reserved && styles.matchCardReserved]}>
          {slotDate ? (
            <Text style={[styles.matchDate, styles.matchDateCentered]}>
              {slotDate}
            </Text>
          ) : matchDate ? (
            <Text style={[styles.matchDate, styles.matchDateCentered]}>
              Match du {matchDate}
            </Text>
          ) : (
            <Text style={[styles.matchDateCentered, { fontWeight: '800', color: THEME.muted, fontSize: 14, marginBottom: 6, fontStyle: 'italic' }]}>
              Date non définie
            </Text>
          )}

        {/* Avatars confirmés */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
          {accepted.map((r) => {
            const p = profilesById[String(r.user_id)];
            console.log('[MatchCardConfirmed] Accepted user:', r.user_id, 'profile exists:', !!p?.id);
            return (
              <LevelAvatar
                key={`acc-${r.user_id}`}
                profile={p}
                rsvpStatus="accepted"
                onLongPressProfile={openProfile}
                size={56}
              />
            );
          })}
        </View>

        {/* Boutons contacter et réserver */}
        <View
          style={{
            marginTop: 4,
            marginBottom: 4,
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'stretch',
            gap: 8,
          }}
        >
          {/* Bouton appeler le club (si configuré) ou contacter un club */}
          {(() => {
            // Utiliser UNIQUEMENT la référence pour éviter les changements
            const club = matchClubRef.current;
            
            // Calculer le texte directement depuis la référence
            // Texte par défaut sur 2 lignes : "APPELER" puis "un club"
            let buttonText = 'APPELER\nun club';
            let phoneNumber = null;
            
            if (club && club.call_phone) {
              phoneNumber = club.call_phone;
              const label = club.call_button_label;
              const name = club.name;
              if (label) {
                buttonText = label.includes('\n') ? label : label.replace(/\s+/, '\n');
              } else {
                buttonText = `APPELER\n${name || 'le club'}`;
              }
            }
            
            // Toujours afficher le même bouton (violet) avec le texte personnalisé
            return (
              <Pressable
                onPress={() => {
                  if (phoneNumber) {
                    const phoneUrl = `tel:${phoneNumber}`;
                    Linking.openURL(phoneUrl).catch(() => {
                      Alert.alert('Erreur', 'Impossible d\'ouvrir l\'application téléphone');
                    });
                  } else {
                    setClubModalOpen(true);
                  }
                }}
                style={{
                  width: '50%',
                  backgroundColor: 'rgba(72, 12, 61, 0.45)', // violine plus liquid
                  paddingVertical: 0,
                  paddingHorizontal: 10,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.18)',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 56,
                  minHeight: 56,
                  maxHeight: 56,
                  shadowColor: '#480c3d',
                  shadowOpacity: 0.28,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 5,
                }}
              >
                <Ionicons name="call" size={22} color="#ffffff" style={{ marginRight: 8, width: 22, height: 22 }} />
                <Text
                  style={{
                    color: '#ffffff',
                    fontWeight: '900',
                    fontSize: 14,
                    textAlign: 'center',
                    lineHeight: 16,
                    textTransform: 'none', // Forcer aucun changement de casse
                  }}
                  numberOfLines={2}
                  allowFontScaling={false}
                >
                  {buttonText}
                </Text>
              </Pressable>
            );
          })()}

          {/* Bouton réserver / réservé */}
          <Pressable
            onPress={() => toggleCourtReservation(m.id, !!m.is_court_reserved)}
            style={{
              width: '50%',
              backgroundColor: m?.is_court_reserved ? 'rgba(16, 185, 129, 0.45)' : 'rgba(239, 68, 68, 0.45)',
              paddingVertical: 0,
              paddingHorizontal: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.18)',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              height: 56,
              minHeight: 56,
              maxHeight: 56,
              shadowColor: m?.is_court_reserved ? '#10b981' : '#ef4444',
              shadowOpacity: 0.28,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 2 },
              elevation: 5,
            }}
          >
            <View style={{ width: 40, height: 40, marginRight: 12, alignItems: 'center', justifyContent: 'center' }}>
              {m?.is_court_reserved && m.court_reserved_by && profilesById?.[String(m.court_reserved_by)]?.avatar_url ? (
                <Image
                  source={{ uri: profilesById[String(m.court_reserved_by)].avatar_url }}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    borderWidth: 0,
                    borderColor: '#fff',
                    resizeMode: 'cover',
                  }}
                />
              ) : (
                <Image
                  source={require('../../../assets/icons/calendrier.png')}
                  style={{
                    width: 28,
                    height: 28,
                    shadowColor: '#fff',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.8,
                    shadowRadius: 3,
                    resizeMode: 'contain',
                    tintColor: 'white',
                  }}
                />
              )}
            </View>

            <Text
              style={{
                color: '#ffffff',
                fontWeight: '900',
                fontSize: 14,
                textAlign: 'center',
                lineHeight: 16,
              }}
              numberOfLines={2}
            >
              {m?.is_court_reserved ? 'PISTE\nRÉSERVÉE' : 'PISTE NON\nRÉSERVÉE'}
            </Text>
          </Pressable>
        </View>

        {/* Ligne 1 : remplacer + désister */}
        {isUserInAccepted && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, justifyContent: 'center' }}>
            <Pressable
              onPress={() => {
                const meProfile = profilesById?.[String(meId)];
                setReplacementTargetUserId(meId);
                setReplacementTargetUserName(meProfile?.display_name || meProfile?.name || meProfile?.email || 'Moi');
                setReplacementModalOpen(true);
                loadReplacementMembers();
              }}
              style={{
                width: '50%',
                backgroundColor: 'rgba(255, 140, 0, 0.45)',
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.18)',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#ff8c00',
                shadowOpacity: 0.28,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 2 },
                elevation: 5,
              }}
            >
              <Ionicons name="sync" size={20} color="#ffffff" style={{ marginRight: 8 }} />
              <Text
                style={{
                  color: '#ffffff',
                  fontWeight: '900',
                  fontSize: 14,
                  textAlign: 'center',
                }}
              >
                Remplacement
              </Text>
            </Pressable>
            <Pressable
              onPress={() => confirmRsvpDecline(m.id)}
              style={{
                width: '50%',
                backgroundColor: 'rgba(185, 28, 28, 0.45)',
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.18)',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#b91c1c',
                shadowOpacity: 0.28,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 2 },
                elevation: 5,
              }}
            >
              <Ionicons name="exit-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
              <Text
                style={{
                  color: '#ffffff',
                  fontWeight: '800',
                  fontSize: 14,
                  textAlign: 'center',
                }}
              >
                Me désister
              </Text>
            </Pressable>
          </View>
        )}

        {/* Ligne 2 : discuter + supprimer */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, justifyContent: 'center' }}>
        {isUserInAccepted && (
          <Pressable
            onPress={() => {
              router.push(`/matches/${m.id}/chat`);
            }}
            style={{
                width: '50%',
              backgroundColor: 'rgba(124, 58, 237, 0.45)',
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.18)',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#7c3aed',
              shadowOpacity: 0.28,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 2 },
              elevation: 5,
            }}
          >
            <Ionicons name="chatbubble-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
            <Text
              style={{
                color: '#ffffff',
                fontWeight: '800',
                fontSize: 14,
                textAlign: 'center',
              }}
            >
                Discuter
            </Text>
          </Pressable>
        )}
          <Pressable
            onPress={() => {
              Alert.alert(
                'Supprimer le match',
                'Êtes-vous sûr de vouloir supprimer ce match ? Cette action est irréversible.',
                [
                  {
                    text: 'Annuler',
                    style: 'cancel',
                  },
                  {
                    text: 'Supprimer',
                    style: 'destructive',
                    onPress: () => onCancelMatch(m.id),
                  },
                ]
              );
            }}
            style={{
              width: '50%',
              backgroundColor: 'rgba(153, 27, 27, 0.45)',
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.18)',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#991b1b',
              shadowOpacity: 0.28,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 2 },
              elevation: 5,
            }}
          >
            <Ionicons name="trash-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
            <Text
              style={{
                color: '#ffffff',
                fontWeight: '800',
                fontSize: 14,
                textAlign: 'center',
              }}
            >
              Supprimer
            </Text>
          </Pressable>
        </View>

        {/* Actions créateur en cas de désistement */}
        {isCreator && declined.length > 0 && (
          <View
            style={{
              marginTop: 8,
              padding: 12,
              borderRadius: 8,
              backgroundColor: '#fff7ed',
              borderWidth: 1,
              borderColor: '#fed7aa',
            }}
          >
            <Text style={{ fontWeight: '800', color: '#9a3412', marginBottom: 8 }}>
              Un joueur s'est désisté. Vous pouvez le remplacer ou annuler le match.
            </Text>
            <View style={{ gap: 8 }}>
              {declined.map((r) => {
                const p = profilesById?.[String(r.user_id)] || {};
                const name = p.display_name || p.name || p.email || 'Joueur';
                return (
                  <Pressable
                    key={`replace-${r.user_id}`}
                    onPress={() => {
                      setReplacementTargetUserId(r.user_id);
                      setReplacementTargetUserName(name);
                      setReplacementModalOpen(true);
                      loadReplacementMembers();
                    }}
                    style={{
                      backgroundColor: '#2fc249',
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 8,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="person-add" size={18} color="#ffffff" style={{ marginRight: 8 }} />
                    <Text style={{ color: '#ffffff', fontWeight: '800' }}>
                      Remplacer {name}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => {
                  if (Platform.OS === 'web') {
                    const ok = window.confirm('Voulez-vous vraiment annuler ce match ?');
                    if (ok) onCancelMatch(m.id);
                  } else {
                    Alert.alert('Voulez-vous vraiment annuler ce match ?', '', [
                      { text: 'Annuler', style: 'cancel' },
                      {
                        text: "Confirmer l'annulation",
                        style: 'destructive',
                        onPress: () => onCancelMatch(m.id),
                      },
                    ]);
                  }
                }}
                style={{
                  backgroundColor: '#b91c1c',
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="close-circle-outline" size={18} color="#ffffff" style={{ marginRight: 8 }} />
                <Text style={{ color: '#ffffff', fontWeight: '800' }}>Annuler le match</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Bouton "Enregistrer le résultat" - visible uniquement si l'utilisateur est dans les 4 confirmés, qu'aucun résultat n'existe et que l'horaire du match a commencé */}
        {!loadingResult && isUserInAccepted && acceptedCount === 4 && !matchResult && slot?.starts_at && new Date(slot.starts_at) <= new Date() && (
          <Pressable
            onPress={() => {
              router.push({
                pathname: '/matches/record-result',
                params: { matchId: m.id },
              });
            }}
            style={{
              marginTop: 8,
              backgroundColor: '#1a4b97',
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 8,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="trophy-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
            <Text
              style={{
                color: '#ffffff',
                fontWeight: '800',
                fontSize: 14,
                textAlign: 'center',
              }}
            >
              Enregistrer le résultat
            </Text>
          </Pressable>
        )}
        
        {/* Afficher le score si le résultat est déjà enregistré */}
        {!loadingResult && matchResult && (
          <View
            style={{
              marginTop: 8,
              backgroundColor: THEME.cardAlt,
              paddingVertical: 12,
              paddingHorizontal: 12,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: THEME.cardBorder,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Ionicons name="trophy" size={18} color={THEME.accent} style={{ marginRight: 6 }} />
              <Text
                style={{
                  color: THEME.text,
                  fontWeight: '700',
                  fontSize: 14,
                }}
              >
                Résultat
              </Text>
            </View>
            
            {/* Affichage du score au format demandé */}
            {(() => {
              // Parser le score_text pour extraire les sets
              const parseSets = (scoreText) => {
                if (!scoreText) return [];
                const sets = scoreText.split(',').map(s => s.trim());
                return sets.map(set => {
                  const [a, b] = set.split('-').map(s => parseInt(s.trim(), 10));
                  return { team1: isNaN(a) ? 0 : a, team2: isNaN(b) ? 0 : b };
                });
              };
              
              const sets = parseSets(matchResult.score_text);
              // S'assurer qu'on a 3 sets (remplir avec 0-0 si nécessaire)
              while (sets.length < 3) {
                sets.push({ team1: 0, team2: 0 });
              }
              
              const team1Player1 = formatPlayerName(profilesById?.[String(matchResult.team1_player1_id)]?.display_name || 'Joueur 1');
              const team1Player2 = formatPlayerName(profilesById?.[String(matchResult.team1_player2_id)]?.display_name || 'Joueur 2');
              const team2Player1 = formatPlayerName(profilesById?.[String(matchResult.team2_player1_id)]?.display_name || 'Joueur 1');
              const team2Player2 = formatPlayerName(profilesById?.[String(matchResult.team2_player2_id)]?.display_name || 'Joueur 2');
              
              const team1Color = matchResult.winner_team === 'team1' ? '#10b981' : '#991b1b';
              const team2Color = matchResult.winner_team === 'team2' ? '#10b981' : '#991b1b';
              
              return (
                <View>
                  {/* Ligne 1 : Équipe 1 - Joueurs + Scores */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Text
                      style={{
                        color: team1Color,
                        fontWeight: matchResult.winner_team === 'team1' ? '600' : '400',
                        fontSize: 14,
                        flex: 1,
                      }}
                    >
                      {team1Player1} / {team1Player2}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                      {sets.map((set, index) => (
                        <Text
                          key={index}
                          style={{
                            color: (set.team1 === 6 || set.team1 === 7) && set.team1 > set.team2 ? '#10b981' : '#374151',
                            fontWeight: (set.team1 === 6 || set.team1 === 7) && set.team1 > set.team2 ? '700' : '600',
                            fontSize: 16,
                            minWidth: 20,
                            textAlign: 'right',
                          }}
                        >
                          {set.team1}
                        </Text>
                      ))}
                    </View>
                  </View>
                  
                  {/* Ligne 2 : Équipe 2 - Joueurs + Scores */}
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text
                      style={{
                        color: team2Color,
                        fontWeight: matchResult.winner_team === 'team2' ? '600' : '400',
                        fontSize: 14,
                        flex: 1,
                      }}
                    >
                      {team2Player1} / {team2Player2}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                      {sets.map((set, index) => (
                        <Text
                          key={index}
                          style={{
                            color: (set.team2 === 6 || set.team2 === 7) && set.team2 > set.team1 ? '#10b981' : '#374151',
                            fontWeight: (set.team2 === 6 || set.team2 === 7) && set.team2 > set.team1 ? '700' : '600',
                            fontSize: 16,
                            minWidth: 20,
                            textAlign: 'right',
                          }}
                        >
                          {set.team2}
                        </Text>
                      ))}
                    </View>
                  </View>
                </View>
              );
            })()}
          </View>
        )}

        {/* Modal de sélection de clubs */}
        <Modal visible={clubModalOpen} transparent animationType="fade" onRequestClose={() => setClubModalOpen(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <View style={{ width: '90%', maxWidth: 500, backgroundColor: '#ffffff', borderRadius: 16, padding: 20, maxHeight: '80%' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text style={{ fontWeight: '900', fontSize: 18, color: '#0b2240' }}>Appeler un club</Text>
                <Pressable onPress={() => setClubModalOpen(false)} style={{ padding: 8 }}>
                  <Ionicons name="close" size={24} color="#111827" />
                </Pressable>
              </View>
              
              {loadingClubs ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#156bc9" />
                  <Text style={{ marginTop: 12, color: '#6b7280' }}>Chargement des clubs...</Text>
                </View>
              ) : (
                <>
                  <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                    <TextInput
                      placeholder="Rechercher un club (nom ou adresse)"
                      placeholderTextColor="#9ca3af"
                      value={clubSearchQuery}
                      onChangeText={setClubSearchQuery}
                      style={{
                        backgroundColor: '#ffffff',
                        borderWidth: 1,
                        borderColor: '#e5e7eb',
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        color: '#111827',
                        marginBottom: 12
                      }}
                      returnKeyType="search"
                    />
                    
                    {/* Sélecteur de rayon */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 11, color: '#6b7280', fontWeight: '600' }}>Rayon</Text>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {[10, 25, 50].map((radius) => (
                          <Pressable
                            key={radius}
                            onPress={() => setClubRadiusKm(radius)}
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderRadius: 6,
                              backgroundColor: clubRadiusKm === radius ? '#156bc9' : '#f3f4f6',
                              borderWidth: 1,
                              borderColor: clubRadiusKm === radius ? '#156bc9' : '#e5e7eb'
                            }}
                          >
                            <Text style={{
                              fontSize: 11,
                              fontWeight: '700',
                              color: clubRadiusKm === radius ? '#ffffff' : '#6b7280'
                            }}>
                              {radius}km
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  </View>
                  {visibleClubs.length === 0 ? (
                    <View style={{ padding: 20 }}>
                      <Text style={{ color: '#6b7280', textAlign: 'center', marginBottom: 8 }}>
                        {clubSearchQuery ? 'Aucun club ne correspond à votre recherche.' : clubsWithDistance.length === 0 ? 'Aucun club chargé.' : 'Aucun club affiché.'}
                      </Text>
                      {clubSearchQuery && clubsWithDistance.length > 0 && (
                        <Text style={{ color: '#9ca3af', textAlign: 'center', fontSize: 11 }}>
                          Total: {clubsWithDistance.length} club(s) chargé(s)
                        </Text>
                      )}
                    </View>
                  ) : (
                    <ScrollView style={{ maxHeight: 400 }}>
                      {visibleClubs.map((club) => {
                    const hasPhone = !!club.phoneNumber;
                    return (
                      <Pressable
                        key={club.id}
                        onPress={() => {
                          if (hasPhone) {
                            Linking.openURL(`tel:${club.phoneNumber}`);
                            setClubModalOpen(false);
                          } else {
                            Alert.alert('Information', `Le club "${club.name}" n'a pas de numéro de téléphone renseigné.`);
                          }
                        }}
                        disabled={!hasPhone}
                        style={({ pressed }) => ({
                          paddingVertical: 12,
                          paddingHorizontal: 12,
                          borderRadius: 10,
                          backgroundColor: pressed && hasPhone ? '#f3f4f6' : '#ffffff',
                          borderWidth: 1,
                          borderColor: hasPhone ? '#e5e7eb' : '#f3f4f6',
                          marginBottom: 8,
                          opacity: hasPhone ? 1 : 0.6,
                        })}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontWeight: '800', color: '#111827', fontSize: 15, marginBottom: 4 }}>
                              {club.name}
                            </Text>
                            {club.address && (
                              <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                                {club.address}
                              </Text>
                            )}
                            {club.distanceKm !== Infinity && (
                              <Text style={{ fontSize: 12, color: '#156bc9', fontWeight: '700' }}>
                                📍 {club.distanceKm.toFixed(1)} km
                              </Text>
                            )}
                          </View>
                          {hasPhone ? (
                            <Ionicons name="call" size={24} color="#15803d" />
                          ) : (
                            <Text style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>Pas de téléphone</Text>
                          )}
                        </View>
                      </Pressable>
                    );
                      })}
                    </ScrollView>
                  )}
                </>
              )}
            </View>
          </View>
        </Modal>

        {/* Modal de sélection de remplaçant */}
        <Modal
          visible={replacementModalOpen}
          animationType="slide"
          transparent={true}
          onRequestClose={() => {
            setReplacementModalOpen(false);
            setReplacementTargetUserId(null);
            setReplacementTargetUserName(null);
            setReplacementQuery('');
            setReplacementLevelFilter([]);
            setReplacementLevelFilterVisible(false);
            setReplacementGeoLocationType(null);
            setReplacementGeoRefPoint(null);
            setReplacementGeoCityQuery('');
            setReplacementGeoCitySuggestions([]);
            setReplacementGeoRadiusKm(null);
            setReplacementGeoFilterVisible(false);
          }}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: 24, width: '90%', maxWidth: 400, maxHeight: '80%' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#0b2240' }}>Choisir un remplaçant</Text>
                <Pressable
                  onPress={() => {
                    setReplacementModalOpen(false);
                    setReplacementTargetUserId(null);
                    setReplacementTargetUserName(null);
                    setReplacementQuery('');
                    setReplacementLevelFilter([]);
                    setReplacementLevelFilterVisible(false);
                    setReplacementGeoLocationType(null);
                    setReplacementGeoRefPoint(null);
                    setReplacementGeoCityQuery('');
                    setReplacementGeoCitySuggestions([]);
                    setReplacementGeoRadiusKm(null);
                    setReplacementGeoFilterVisible(false);
                  }}
                  style={{ padding: 8 }}
                >
                  <Ionicons name="close" size={24} color="#111827" />
                </Pressable>
              </View>

              {replacementLoading ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#156bc9" />
                  <Text style={{ marginTop: 12, color: '#6b7280' }}>Chargement des membres...</Text>
                </View>
              ) : (
                <>
                  {replacementMembers.length === 0 ? (
                    <View style={{ padding: 20 }}>
                      <Text style={{ color: '#6b7280', textAlign: 'center' }}>
                        Aucun membre disponible pour le remplacement.
                      </Text>
                    </View>
                  ) : filteredReplacementMembers.length === 0 ? (
                    <>
                      <TextInput
                        placeholder="Rechercher un joueur (nom, email, niveau)..."
                        placeholderTextColor="#9ca3af"
                        value={replacementQuery}
                        onChangeText={setReplacementQuery}
                        style={{
                          backgroundColor: '#f9fafb',
                          borderWidth: 1,
                          borderColor: '#e5e7eb',
                          borderRadius: 10,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          color: '#111827',
                          marginBottom: 12,
                          fontSize: 14,
                        }}
                        returnKeyType="search"
                        autoCapitalize="none"
                      />
                      
                      {/* Boutons de filtres */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 12 }}>
                        <Pressable
                          onPress={() => {
                            if (!replacementLevelFilterVisible) {
                              setReplacementGeoFilterVisible(false);
                            }
                            setReplacementLevelFilterVisible(!replacementLevelFilterVisible);
                          }}
                          style={{
                            padding: 10,
                            backgroundColor: 'transparent',
                          }}
                        >
                          <Image 
                            source={racketIcon}
                            style={{
                              width: 20,
                              height: 20,
                              tintColor: replacementLevelFilter.length > 0 ? '#ff751d' : '#374151',
                              shadowColor: '#000',
                              shadowOffset: { width: 0, height: 2 },
                              shadowOpacity: 0.3,
                              shadowRadius: 3,
                              elevation: 4,
                            }}
                            resizeMode="contain"
                          />
                        </Pressable>
                        
                        <Text style={{ 
                          color: '#111827', 
                          fontWeight: '700', 
                          fontSize: 14 
                        }}>
                          Filtres
                        </Text>
                        
                        <Pressable
                          onPress={() => {
                            if (!replacementGeoFilterVisible) {
                              setReplacementLevelFilterVisible(false);
                            }
                            setReplacementGeoFilterVisible(!replacementGeoFilterVisible);
                          }}
                          style={{
                            padding: 10,
                            backgroundColor: 'transparent',
                          }}
                        >
                          <Ionicons 
                            name="location" 
                            size={20} 
                            color={(replacementGeoRefPoint && replacementGeoRadiusKm) ? '#ff751d' : '#374151'}
                            style={{
                              shadowColor: '#000',
                              shadowOffset: { width: 0, height: 2 },
                              shadowOpacity: 0.3,
                              shadowRadius: 3,
                              elevation: 4,
                            }}
                          />
                        </Pressable>
                      </View>
                      
                      <View style={{ padding: 20 }}>
                        <Text style={{ color: '#6b7280', textAlign: 'center', marginBottom: 8 }}>
                          Aucun membre trouvé
                          {replacementQuery.trim() && ` pour "${replacementQuery}"`}
                          {replacementLevelFilter.length > 0 && ` avec les niveaux ${replacementLevelFilter.join(', ')}`}
                          {replacementGeoRefPoint && replacementGeoRadiusKm && ` dans un rayon de ${replacementGeoRadiusKm} km autour de ${replacementGeoRefPoint.address || 'la position sélectionnée'}`}
                        </Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <TextInput
                        placeholder="Rechercher un joueur (nom, email, niveau)..."
                        placeholderTextColor="#9ca3af"
                        value={replacementQuery}
                        onChangeText={setReplacementQuery}
                        style={{
                          backgroundColor: '#f9fafb',
                          borderWidth: 1,
                          borderColor: '#e5e7eb',
                          borderRadius: 10,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          color: '#111827',
                          marginBottom: 12,
                          fontSize: 14,
                        }}
                        returnKeyType="search"
                        autoCapitalize="none"
                      />
                      
                      {/* Boutons de filtres */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 12 }}>
                        <Pressable
                          onPress={() => {
                            if (!replacementLevelFilterVisible) {
                              setReplacementGeoFilterVisible(false);
                            }
                            setReplacementLevelFilterVisible(!replacementLevelFilterVisible);
                          }}
                          style={{
                            padding: 10,
                            backgroundColor: 'transparent',
                          }}
                        >
                          <Image 
                            source={racketIcon}
                            style={{
                              width: 20,
                              height: 20,
                              tintColor: replacementLevelFilter.length > 0 ? '#ff751d' : '#374151',
                              shadowColor: '#000',
                              shadowOffset: { width: 0, height: 2 },
                              shadowOpacity: 0.3,
                              shadowRadius: 3,
                              elevation: 4,
                            }}
                            resizeMode="contain"
                          />
                        </Pressable>
                        
                        <Text style={{ 
                          color: '#111827', 
                          fontWeight: '700', 
                          fontSize: 14 
                        }}>
                          Filtres {filteredReplacementMembers.length > 0 && `(${filteredReplacementMembers.length})`}
                        </Text>
                        
                        <Pressable
                          onPress={() => {
                            if (!replacementGeoFilterVisible) {
                              setReplacementLevelFilterVisible(false);
                            }
                            setReplacementGeoFilterVisible(!replacementGeoFilterVisible);
                          }}
                          style={{
                            padding: 10,
                            backgroundColor: 'transparent',
                          }}
                        >
                          <Ionicons 
                            name="location" 
                            size={20} 
                            color={(replacementGeoRefPoint && replacementGeoRadiusKm) ? '#ff751d' : '#374151'}
                            style={{
                              shadowColor: '#000',
                              shadowOffset: { width: 0, height: 2 },
                              shadowOpacity: 0.3,
                              shadowRadius: 3,
                              elevation: 4,
                            }}
                          />
                        </Pressable>
                      </View>
                      
                      {/* Zone de configuration du filtre par niveau */}
                      {replacementLevelFilterVisible && (
                        <View style={{ 
                          backgroundColor: '#f3f4f6', 
                          borderRadius: 12, 
                          padding: 12,
                          borderWidth: 1,
                          borderColor: replacementLevelFilter.length > 0 ? '#15803d' : '#d1d5db',
                          marginBottom: 12,
                        }}>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 12 }}>
                            Sélectionnez les niveaux à afficher
                          </Text>
                          
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {['1/2', '3/4', '5/6', '7/8'].map((range) => {
                              const isSelected = replacementLevelFilter.includes(range);
                              return (
                                <Pressable
                                  key={range}
                                  onPress={() => {
                                    setReplacementLevelFilter((prev) => {
                                      if (prev.includes(range)) {
                                        return prev.filter(r => r !== range);
                                      } else {
                                        return [...prev, range];
                                      }
                                    });
                                  }}
                                  style={{
                                    paddingVertical: 8,
                                    paddingHorizontal: 12,
                                    borderRadius: 8,
                                    backgroundColor: isSelected ? colorForLevel(parseInt(range.split('/')[0])) : '#ffffff',
                                    borderWidth: 1,
                                    borderColor: isSelected ? colorForLevel(parseInt(range.split('/')[0])) : '#d1d5db',
                                  }}
                                >
                                  <Text style={{ 
                                    fontSize: 13, 
                                    fontWeight: isSelected ? '800' : '700', 
                                    color: isSelected ? '#000000' : '#111827' 
                                  }}>
                                    {range}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                          
                          {replacementLevelFilter.length > 0 && (
                            <Text style={{ fontSize: 12, fontWeight: '500', color: '#15803d', marginTop: 8 }}>
                              ✓ Filtre actif : {replacementLevelFilter.length} plage{replacementLevelFilter.length > 1 ? 's' : ''} sélectionnée{replacementLevelFilter.length > 1 ? 's' : ''}
                            </Text>
                          )}
                        </View>
                      )}
                      
                      {/* Zone de configuration du filtre géographique */}
                      {replacementGeoFilterVisible && (
                        <View style={{ 
                          backgroundColor: '#f3f4f6', 
                          borderRadius: 12, 
                          padding: 12,
                          borderWidth: 1,
                          borderColor: (replacementGeoRefPoint && replacementGeoRadiusKm) ? '#15803d' : '#d1d5db',
                          marginBottom: 12,
                        }}>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 12 }}>
                            Filtrer par distance
                          </Text>
                          
                          {/* Sélection du type de position */}
                          <View style={{ marginBottom: 12 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 8 }}>
                              Position de référence
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                              {[
                                { key: 'current', label: '📍 Position actuelle' },
                                { key: 'home', label: '🏠 Domicile' },
                                { key: 'work', label: '💼 Travail' },
                                { key: 'city', label: '🏙️ Ville' },
                              ].map(({ key, label }) => {
                                const isSelected = replacementGeoLocationType === key;
                                return (
                                  <Pressable
                                    key={key}
                                    onPress={() => {
                                      if (isSelected) {
                                        setReplacementGeoRefPoint(null);
                                        setReplacementGeoCityQuery('');
                                        setReplacementGeoCitySuggestions([]);
                                        setReplacementGeoLocationType(null);
                                        setReplacementGeoRadiusKm(null);
                                      } else {
                                        setReplacementGeoLocationType(key);
                                        if (key === 'city') {
                                          setReplacementGeoRefPoint(null);
                                          setReplacementGeoCityQuery('');
                                        }
                                      }
                                    }}
                                    style={{
                                      paddingVertical: 8,
                                      paddingHorizontal: 12,
                                      borderRadius: 8,
                                      backgroundColor: (isSelected && replacementGeoRefPoint) ? '#15803d' : '#ffffff',
                                      borderWidth: 1,
                                      borderColor: (isSelected && replacementGeoRefPoint) ? '#15803d' : '#d1d5db',
                                    }}
                                  >
                                    <Text style={{ 
                                      fontSize: 13, 
                                      fontWeight: (isSelected && replacementGeoRefPoint) ? '800' : '700', 
                                      color: (isSelected && replacementGeoRefPoint) ? '#ffffff' : '#111827' 
                                    }}>
                                      {label}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>
                          
                          {/* Recherche de ville si type = 'city' */}
                          {replacementGeoLocationType === 'city' && (
                            <View style={{ marginBottom: 12 }}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 8 }}>
                                Rechercher une ville
                              </Text>
                              <TextInput
                                placeholder="Tapez le nom d'une ville..."
                                value={replacementGeoCityQuery}
                                onChangeText={(text) => {
                                  setReplacementGeoCityQuery(text);
                                  searchReplacementGeoCity(text);
                                }}
                                style={{
                                  backgroundColor: '#ffffff',
                                  borderRadius: 8,
                                  padding: 12,
                                  borderWidth: 1,
                                  borderColor: '#d1d5db',
                                  fontSize: 14,
                                }}
                              />
                              {replacementGeoCitySuggestions.length > 0 && (
                                <View style={{ marginTop: 8, backgroundColor: '#ffffff', borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', maxHeight: 150 }}>
                                  <ScrollView>
                                    {replacementGeoCitySuggestions.map((suggestion, idx) => (
                                      <Pressable
                                        key={idx}
                                        onPress={() => {
                                          setReplacementGeoRefPoint({ lat: suggestion.lat, lng: suggestion.lng, address: suggestion.name });
                                          setReplacementGeoCityQuery(suggestion.name);
                                          setReplacementGeoCitySuggestions([]);
                                        }}
                                        style={{
                                          padding: 12,
                                          borderBottomWidth: idx < replacementGeoCitySuggestions.length - 1 ? 1 : 0,
                                          borderBottomColor: '#e5e7eb',
                                        }}
                                      >
                                        <Text style={{ fontSize: 14, color: '#111827' }}>{suggestion.name}</Text>
                                      </Pressable>
                                    ))}
                                  </ScrollView>
                                </View>
                              )}
                            </View>
                          )}
                          
                          {/* Sélection du rayon */}
                          <View style={{ marginBottom: 12 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 8 }}>
                              Rayon : {replacementGeoRadiusKm ? `${replacementGeoRadiusKm} km` : 'non sélectionné'}
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 6 }}>
                              {[10, 20, 30, 40, 50].map((km) => {
                                const isSelected = replacementGeoRadiusKm === km;
                                return (
                                  <Pressable
                                    key={km}
                                    onPress={() => {
                                      if (isSelected) {
                                        setReplacementGeoRadiusKm(null);
                                      } else {
                                        setReplacementGeoRadiusKm(km);
                                      }
                                    }}
                                    style={{
                                      flex: 1,
                                      paddingVertical: 6,
                                      paddingHorizontal: 8,
                                      borderRadius: 8,
                                      backgroundColor: isSelected ? '#15803d' : '#ffffff',
                                      borderWidth: 1,
                                      borderColor: isSelected ? '#15803d' : '#d1d5db',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                  >
                                    <Text style={{ 
                                      fontSize: 12, 
                                      fontWeight: isSelected ? '800' : '700', 
                                      color: isSelected ? '#ffffff' : '#111827' 
                                    }}>
                                      {km} km
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>
                          
                          {(replacementGeoRefPoint && replacementGeoRadiusKm) && (
                            <Text style={{ fontSize: 12, fontWeight: '500', color: '#15803d', marginTop: 8 }}>
                              ✓ Filtre actif : {replacementGeoRadiusKm} km autour de {replacementGeoRefPoint.address || 'la position sélectionnée'}
                            </Text>
                          )}
                        </View>
                      )}

                      {/* Liste des membres */}
                      <ScrollView style={{ maxHeight: 300, marginBottom: 16 }}>
                        {filteredReplacementMembers.map((member) => {
                          // Calculer la distance si filtre géo actif
                          let distanceKm = null;
                          if (replacementGeoRefPoint && replacementGeoRadiusKm) {
                            let playerLat = null;
                            let playerLng = null;
                            if (member.address_home?.lat && member.address_home?.lng) {
                              playerLat = member.address_home.lat;
                              playerLng = member.address_home.lng;
                            } else if (member.address_work?.lat && member.address_work?.lng) {
                              playerLat = member.address_work.lat;
                              playerLng = member.address_work.lng;
                            }
                            if (playerLat && playerLng) {
                              distanceKm = haversineKm(replacementGeoRefPoint, { lat: playerLat, lng: playerLng });
                            }
                          }
                          
                          return (
                            <View
                              key={String(member.id)}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                padding: 10,
                                backgroundColor: '#f9fafb',
                                borderRadius: 8,
                                marginBottom: 6,
                                borderWidth: 1,
                                borderColor: '#e5e7eb',
                              }}
                            >
                              <Avatar
                                uri={member.avatar_url}
                                size={40}
                                fallback={member.display_name || member.name}
                              />
                              <View style={{ flex: 1, marginLeft: 10 }}>
                                <Text style={{ fontWeight: '700', color: '#111827', fontSize: 13, marginBottom: 2 }}>
                                  {formatPlayerName(member.display_name || member.name)}
                                </Text>
                                {member.niveau != null && (
                                  <Text style={{ fontSize: 11, color: '#6b7280', marginBottom: 1 }}>
                                    Niveau {member.niveau}
                                  </Text>
                                )}
                                {distanceKm != null && (
                                  <Text style={{ fontSize: 11, color: '#156bc9', fontWeight: '600' }}>
                                    📍 {distanceKm.toFixed(1)} km
                                  </Text>
                                )}
                              </View>
                              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                                <Pressable
                                  onPress={() => {
                                    if (member.phone) {
                                      Linking.openURL(`tel:${member.phone}`);
                                    } else {
                                      Alert.alert('Information', 'Ce membre n\'a pas de numéro de téléphone renseigné.');
                                    }
                                  }}
                                  style={{
                                    padding: 6,
                                    borderRadius: 6,
                                    backgroundColor: member.phone ? '#15803d' : '#d1d5db',
                                  }}
                                  disabled={!member.phone}
                                >
                                  <Ionicons name="call" size={18} color={member.phone ? "#ffffff" : "#9ca3af"} />
                                </Pressable>
                                <Pressable
                                  onPress={() => {
                                    // Fermer la modale de liste des membres
                                    setReplacementModalOpen(false);
                                    // Réinitialiser les filtres
                                    setReplacementQuery('');
                                    setReplacementLevelFilter([]);
                                    setReplacementLevelFilterVisible(false);
                                    setReplacementGeoLocationType(null);
                                    setReplacementGeoRefPoint(null);
                                    setReplacementGeoCityQuery('');
                                    setReplacementGeoCitySuggestions([]);
                                    setReplacementGeoRadiusKm(null);
                                    setReplacementGeoFilterVisible(false);
                                    // Ouvrir la popup de confirmation
                                    setPendingReplacement({
                                      matchId: m.id,
                                      currentUserId: replacementTargetUserId || meId,
                                      currentUserName: replacementTargetUserName || 'le joueur',
                                      newUserId: member.id,
                                      newUserName: member.display_name || member.name,
                                    });
                                    // Petit délai pour que la modale se ferme avant d'ouvrir la popup
                                    setTimeout(() => {
                                      setReplacementConfirmVisible(true);
                                    }, 300);
                                  }}
                                  style={{
                                    padding: 6,
                                    borderRadius: 6,
                                    backgroundColor: '#2fc249',
                                  }}
                                >
                                  <Ionicons name="person-add" size={18} color="#ffffff" />
                                </Pressable>
                              </View>
                            </View>
                          );
                        })}
                      </ScrollView>
                    </>
                  )}
                </>
              )}
            </View>
          </View>
        </Modal>

        {/* Popup de confirmation de remplacement */}
          <Modal
          visible={replacementConfirmVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => {
            setReplacementConfirmVisible(false);
            setPendingReplacement(null);
            setReplacementTargetUserId(null);
            setReplacementTargetUserName(null);
          }}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <View style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: 24, width: '90%', maxWidth: 400 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: '#0b2240', marginBottom: 16, textAlign: 'center' }}>
                Confirmer le remplacement
              </Text>
              
              <Text style={{ 
                fontSize: 14, 
                color: '#dc2626', 
                fontWeight: '700', 
                marginBottom: 12,
                textAlign: 'center',
                lineHeight: 20,
              }}>
                Attention, {pendingReplacement?.currentUserName || 'le joueur'} va être remplacé sur ce match. Assure-toi de la disponibilité du remplaçant avant de poursuivre.
              </Text>
              
              {pendingReplacement?.newUserName && (
                <Text style={{ 
                  fontSize: 14, 
                  color: '#111827', 
                  marginBottom: 20,
                  textAlign: 'center',
                  fontWeight: '600',
                }}>
                  Remplaçant : {pendingReplacement.newUserName}
                </Text>
              )}
              
              <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'center' }}>
                <Pressable
                  onPress={() => {
                    setReplacementConfirmVisible(false);
                    setPendingReplacement(null);
                    setReplacementTargetUserId(null);
                    setReplacementTargetUserName(null);
                  }}
                  style={{
                    flex: 0.33,
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                    backgroundColor: '#6b7280',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 14, textAlign: 'center' }}>
                    Annuler
                  </Text>
                </Pressable>
                
                <Pressable
                  onPress={() => {
                    if (pendingReplacement) {
                      onReplacePlayer(
                        pendingReplacement.matchId,
                        pendingReplacement.currentUserId,
                        pendingReplacement.newUserId,
                        pendingReplacement.newUserName
                      );
                    }
                  }}
                  style={{
                    flex: 0.66,
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                    backgroundColor: '#15803d',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 12, textAlign: 'center' }}>
                    Confirmer mon remplacement
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
          </Modal>
        </View>
      </View>
    );
  };

  // Composant pour afficher le nom d'un joueur en attente avec clignotement
  const PendingPlayerName = ({ player }) => {
    const blinkAnim = useRef(new Animated.Value(1)).current;
    
    useEffect(() => {
      const blinkAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(blinkAnim, {
            toValue: 0.3,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(blinkAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      blinkAnimation.start();
      return () => blinkAnimation.stop();
    }, [blinkAnim]);
    
    const displayName = player?.display_name || player?.email || player?.name || 'Joueur';
    
    return (
      <Animated.Text 
        style={{ 
          fontSize: 11, 
          fontWeight: '700', 
          color: '#ef4444',
          opacity: blinkAnim,
          textAlign: 'center',
          maxWidth: 60,
        }}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {displayName}
      </Animated.Text>
    );
  };

  // Composant pour l'icône rappel vibrante
  const ReminderIcon = ({ phone, matchDate, onPress }) => {
    const vibrateAnim = useRef(new Animated.Value(1)).current;
    
    useEffect(() => {
      const vibrateAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(vibrateAnim, {
            toValue: 0.95,
            duration: 100,
            useNativeDriver: true,
          }),
          Animated.timing(vibrateAnim, {
            toValue: 1.05,
            duration: 100,
            useNativeDriver: true,
          }),
          Animated.timing(vibrateAnim, {
            toValue: 1,
            duration: 100,
            useNativeDriver: true,
          }),
        ])
      );
      vibrateAnimation.start();
      return () => vibrateAnimation.stop();
    }, [vibrateAnim]);

    if (!phone) return null;

    return (
      <Pressable
        onPress={onPress}
        style={{ 
          position: 'absolute', 
          top: 0, 
          right: 0, 
          zIndex: 1000, 
          elevation: 10,
          width: 28,
          height: 28,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Animated.View
          style={{
            transform: [{ scale: vibrateAnim }],
            backgroundColor: '#f59e0b',
            borderRadius: 14,
            width: 28,
            height: 28,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: '#ffffff',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.5,
            shadowRadius: 3,
          }}
        >
          <Ionicons name="notifications" size={16} color="#ffffff" />
        </Animated.View>
      </Pressable>
    );
  };

  const MatchCardPending = ({ m, rsvps: rsvpsProp }) => {
    const slot = m.time_slots || {};
    const rsvps = Array.isArray(rsvpsProp) ? rsvpsProp : (rsvpsByMatch[m.id] || []);
    // Split RSVP buckets
    const accepted = rsvps.filter(r => (r.status || '').toString().toLowerCase() === 'accepted');
    const maybes   = rsvps.filter(r => (r.status || '').toString().toLowerCase() === 'maybe');
    const declined = rsvps.filter(r => (r.status || '').toString().toLowerCase() === 'no');
    const acceptedCount = accepted.length;
    const pendingBorder =
      acceptedCount >= 4 ? 'rgba(16,185,129,0.4)' :
      acceptedCount === 3 ? 'rgba(229,255,0,0.35)' :
      acceptedCount === 2 ? 'rgba(245,158,11,0.25)' :
      acceptedCount === 1 ? 'rgba(239,68,68,0.25)' :
      THEME.cardBorder;

    // Me + status
    const mine = rsvps.find((r) => String(r.user_id) === String(meId));
    const isAccepted = ((mine?.status || '').toString().trim().toLowerCase() === 'accepted');
    const isMaybe = ((mine?.status || '').toString().trim().toLowerCase() === 'maybe');
    // Plus de confirmation manuelle: un match passe directement confirmé
    const canConfirm = false;

    // Creator heuristic: first accepted, else earliest RSVP row
    const creatorUserId = m?.created_by || (() => {
      if (!Array.isArray(rsvps) || rsvps.length === 0) return null;
      const src = accepted.length ? accepted : rsvps;
      const sorted = [...src].sort((a,b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
      return sorted[0]?.user_id || null;
    })();
    const isCreator = creatorUserId && meId ? String(creatorUserId) === String(meId) : false;

    // --- Begin: inserted availIds/extraProfiles state and effect
    const [availIds, setAvailIds] = React.useState([]);
    const [extraProfiles, setExtraProfiles] = React.useState({});

    React.useEffect(() => {
      (async () => {
        const s = m?.time_slots?.starts_at;
        const e = m?.time_slots?.ends_at;
        if (!s || !e) return setAvailIds([]);

        const ids = await computeAvailableUserIdsForInterval(groupId, s, e);
        // Exclure ceux qui sont déjà acceptés ou ont refusé
        const acceptedSet = new Set(accepted.map((r) => String(r.user_id)));
        const declinedSet = new Set(declined.map((r) => String(r.user_id)));
        const filtered = ids.filter((id) => !acceptedSet.has(String(id)) && !declinedSet.has(String(id)));
        setAvailIds(filtered);

        // Charger les profils manquants localement (dans ce composant)
        const missing = filtered.filter((id) => !profilesById[id]);
        if (missing.length) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url, email, niveau, phone')
            .in('id', missing);
          const map = Object.fromEntries((profs || []).map((p) => [p.id, p]));
          setExtraProfiles(map);
        } else {
          setExtraProfiles({});
        }
        
        // Charger aussi les profils des joueurs en attente (maybe/no) pour avoir leur téléphone
        const pendingUserIds = [...maybes, ...declined].map(r => String(r.user_id));
        const missingPending = pendingUserIds.filter((id) => !profilesById[id] && !extraProfiles[id]);
        if (missingPending.length) {
          const { data: profsPending } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url, email, niveau, phone')
            .in('id', missingPending);
          const mapPending = Object.fromEntries((profsPending || []).map((p) => [p.id, p]));
          setExtraProfiles(prev => ({ ...prev, ...mapPending }));
        }
      })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [m?.id, m?.time_slots?.starts_at, m?.time_slots?.ends_at, groupId, rsvpsByMatch]);
    // --- End: inserted availIds/extraProfiles state and effect

    return (
      <View style={styles.matchCardGlow}>
        <View style={[styles.matchCard, { borderColor: pendingBorder }]}>
        {/* Ligne 1 — Date + heure + icône confirmations */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 4,
          }}
        >
          <Text style={styles.matchDate}>
            {formatRange(slot.starts_at, slot.ends_at)}
          </Text>

          {/* Icône à droite selon le nombre de confirmés (rien si 0) */}
          {acceptedCount > 0 ? (
            (() => {
              const src =
                acceptedCount === 1
                  ? require('../../../assets/icons/1confirme.png')
                  : acceptedCount === 2
                  ? require('../../../assets/icons/2confirme.png')
                  : acceptedCount === 3
                  ? require('../../../assets/icons/3confirme.png')
                  : require('../../../assets/icons/4confirme.png');
              return (
                <Image
                  source={src}
                  style={{ width: 75, height: 28, resizeMode: 'contain', marginLeft: 8 }}
                />
              );
            })()
          ) : null}
        </View>
        {/* Ligne 2 — Avatars des joueurs qui ont confirmé (bordure verte) */}
        {accepted.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {accepted.map((r) => {
              const userIdStr = String(r.user_id);
              const p = profilesById[userIdStr] || extraProfiles[userIdStr] || {};
              console.log('[MatchCardPending] Accepted user:', userIdStr, 'profile exists:', !!p?.id, 'name:', p?.display_name || p?.name);
            return (
              <LevelAvatar
                  key={`acc-${userIdStr}`}
                profile={p}
                rsvpStatus="accepted"
                onLongPressProfile={openProfile}
                size={56}
              />
            );
          })}
        </View>
        ) : (
          <Text style={{ color: THEME.muted, marginBottom: 12 }}>Aucun joueur confirmé pour le moment</Text>
        )}

        {/* Ligne 4 — En attente / Remplaçants : une SEULE ligne d'avatars (orange), non cliquables */}
        <View style={{ marginTop: 2, marginBottom: 4, overflow: 'visible' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 0 }}>
            <Text style={{ fontWeight: '800', color: THEME.text }}>En attente / Remplaçants</Text>
          </View>

          {(() => {
            // Build the pending list. NE PAS utiliser availIds car cela inclut tous les joueurs disponibles.
            // Utiliser UNIQUEMENT les RSVPs avec statut "maybe" et "no" explicitement créés pour ce match.
            const maybeFromRsvps = maybes.map((r) => ({ user_id: String(r.user_id), status: 'maybe' }));
            const declinedList = declined.map((r) => ({ user_id: String(r.user_id), status: 'no' }));
            const combined = [...maybeFromRsvps, ...declinedList];

            if (!combined.length) {
              return <Text style={{ color: THEME.muted }}>Aucun joueur en attente.</Text>;
            }

            return (
              <View style={{ overflow: 'visible', minHeight: 70 }}>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={{ overflow: 'visible' }}
                  contentContainerStyle={{ 
                    gap: 8, 
                    paddingRight: 4, 
                    paddingVertical: 12,
                    paddingTop: 12,
                    alignItems: 'center',
                  }}
                >
                  {combined.map((r) => {
                    const uid = String(r.user_id);
                    const p = profilesById[uid] || extraProfiles[uid] || {};
                    const isPending = r.status === 'maybe';
                    console.log('[MatchCardPending] Pending user:', uid, 'profile exists:', !!p?.id, 'name:', p?.display_name || p?.name, 'phone:', !!p?.phone);
                    
                    // Obtenir la date du match
                    const matchDate = slot?.starts_at && slot?.ends_at 
                      ? formatRange(slot.starts_at, slot.ends_at)
                      : 'ce match';
                    
                    return (
                      <View key={`pend-${uid}`} style={{ alignItems: 'center', gap: 4, position: 'relative', paddingTop: 4, paddingHorizontal: 4, minWidth: 56, minHeight: 56 }}>
                        <LevelAvatar
                          profile={p}
                          rsvpStatus={r.status}
                          onLongPressProfile={openProfile}
                          size={48} // Garder à 48px comme avant
                        />
                        {p?.phone && (
                          <ReminderIcon
                            phone={p.phone}
                            matchDate={matchDate}
                            onPress={() => {
                              const message = `PADEL Sync - Réponds au match du ${matchDate}. Des joueurs t'attendent`;
                              const smsUrl = `sms:${p.phone}?body=${encodeURIComponent(message)}`;
                              Linking.openURL(smsUrl).catch(() => {
                                Alert.alert('Erreur', 'Impossible d\'ouvrir l\'application SMS');
                              });
                            }}
                          />
                        )}
                        {isPending && (
                          <PendingPlayerName player={p} />
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            );
          })()}
        </View>

        {/* Wrap Ligne 4 and Ligne 5 in a single Fragment */}
        <>
        {/* Ligne 5 — Boutons d'action */}
        {(isAccepted || isMaybe) ? (
          <View style={{ gap: 8, marginBottom: 12 }}>
            {/* Ligne actions: vertical column of full-width buttons */}
            <View style={{ gap: 8 }}>
              {/* Me désister (rouge clair) */}
              <Pressable
                onPress={press('Me désister', () => confirmRsvpDecline(m.id))}
                accessibilityRole="button"
                accessibilityLabel="Me désister du match"
                style={({ pressed }) => [
                  {
                    flex: 1,
                    alignSelf: 'stretch',
                    backgroundColor: 'rgba(254, 202, 202, 0.45)',
                    borderColor: 'rgba(239, 68, 68, 0.45)',
                    borderWidth: 1,
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 999,
                    shadowColor: '#ef4444',
                    shadowOpacity: 0.28,
                    shadowRadius: 16,
                    shadowOffset: { width: 0, height: 2 },
                    elevation: 5,
                  },
                  Platform.OS === 'web' ? { cursor: 'pointer' } : null,
                  pressed ? { opacity: 0.9 } : null,
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Ionicons name="exit-outline" size={22} color="#7f1d1d" />
                  <Text style={{ color: '#7f1d1d', fontWeight: '800' }}>
                    Me désister
                  </Text>
                </View>
              </Pressable>

              {/* Annuler le match (créateur uniquement) — rouge vif */}
              {isCreator && (
                <Pressable
                  onPress={() => {
                    if (Platform.OS === 'web') {
                      const ok = window.confirm('Voulez-vous vraiment annuler ce match ?');
                      if (ok) onCancelMatch(m.id);
                    } else {
                      Alert.alert('Voulez-vous vraiment annuler ce match ?', '', [
                        { text: 'Annuler', style: 'cancel' },
                        {
                          text: "Confirmer l'annulation",
                          style: 'destructive',
                          onPress: () => onCancelMatch(m.id),
                        },
                      ]);
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Annuler le match"
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      alignSelf: 'stretch',
                    backgroundColor: 'rgba(185, 28, 28, 0.45)',
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 999,
                    shadowColor: '#b91c1c',
                    shadowOpacity: 0.28,
                    shadowRadius: 16,
                    shadowOffset: { width: 0, height: 2 },
                    elevation: 5,
                    },
                    Platform.OS === 'web' ? { cursor: 'pointer' } : null,
                    pressed ? { opacity: 0.9 } : null,
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Ionicons name="close-circle-outline" size={22} color="white" />
                    <Text style={{ color: 'white', fontWeight: '800' }}>Annuler le match</Text>
                  </View>
                </Pressable>
              )}
            </View>
          </View>
        ) : null}
        </>
        </View>
      </View>
    );
  };

  const proposesTab = React.useMemo(
    () => (
      <>
        {/* Indicateur de chargement pour le changement de semaine */}
        {loadingWeek && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(6, 26, 43, 0.72)',
              zIndex: 9999,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 12,
            }}
          >
            <ActivityIndicator size="large" color={THEME.accent} />
            <Text style={{ color: THEME.accent, marginTop: 12, fontWeight: '700' }}>
              Chargement de la semaine...
            </Text>
          </View>
        )}
        {/* Sélecteur 1h / 1h30 */}
        <View style={styles.segmentWrap}>
          <View style={styles.segment}>
            <Pressable
              onPress={() => setMode('hour')}
              style={[
                styles.segmentBtn,
                styles.segmentBtnCompact,
                mode === 'hour' && styles.segmentBtnActiveProposes,
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  mode === 'hour' && styles.segmentTextActive,
                ]}
              >
                {`1h (${(renderHourReady || []).length || 0})`}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('long')}
              style={[
                styles.segmentBtn,
                styles.segmentBtnCompact,
                mode === 'long' && styles.segmentBtnActiveProposes,
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  mode === 'long' && styles.segmentTextActive,
                ]}
              >
                {`1h30 (${(renderLongSections || []).reduce((sum, s) => sum + (s.data?.length || 0), 0) || 0})`}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Sélecteur de groupe + Lien page club (sous 1h / 1h30) */}
        <View style={{ paddingHorizontal: 16, marginTop: 4, marginBottom: 8 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'stretch',
              justifyContent: 'center',
              gap: 0,
              flexWrap: 'nowrap',
            }}
          >
            <Pressable
              onPress={() => setGroupSelectorOpen(true)}
              style={{
                flex: activeGroup?.club_id ? 0.5 : 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 4,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.22)',
                backgroundColor: 'rgba(255,255,255,0.16)',
                shadowColor: '#000000',
                shadowOpacity: 0.25,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: 3,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
              }}
            >
              <Ionicons name="people" size={18} color="#e0ff00" style={{ marginRight: 4 }} />
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{
                  fontWeight: '700',
                  color: THEME.accent,
                  fontSize: 14,
                  textAlign: 'center',
                  textAlignVertical: 'center',
                  includeFontPadding: false,
                  maxWidth: 260,
                  textShadowColor: 'rgba(0,0,0,0.6)',
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 2,
                }}
              >
                {(() => {
                  const label = activeGroup?.name || 'Sélectionner un groupe';
                  const maxLen = activeGroup?.club_id ? 15 : 28;
                  return label.length > maxLen ? `${label.slice(0, maxLen)}…` : label;
                })()}
              </Text>
              <Ionicons name="chevron-down" size={18} color={THEME.accent} style={{ marginLeft: 4 }} />
            </Pressable>

            {activeGroup?.club_id ? (
              <Pressable
                onPress={() => router.push(`/clubs/${activeGroup.club_id}`)}
                style={{
                  flex: 0.5,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 0,
                  paddingHorizontal: 4,
                  borderRadius: 10,
                  borderWidth: 0,
                  backgroundColor: 'transparent',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                }}
              >
                <Ionicons
                  name="home"
                  size={16}
                  color="#cfe9ff"
                  style={{
                    marginRight: 4,
                    textShadowColor: 'rgba(207, 233, 255, 0.75)',
                    textShadowOffset: { width: 0, height: 0 },
                    textShadowRadius: 6,
                  }}
                />
                <Text
                  style={{
                    fontWeight: '700',
                    color: '#cfe9ff',
                    fontSize: 16,
                    textAlign: 'center',
                    textShadowColor: 'rgba(207, 233, 255, 0.75)',
                    textShadowOffset: { width: 0, height: 0 },
                    textShadowRadius: 6,
                  }}
                >
                  Page club
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {(!loadingWeek &&
          (renderLongSections || []).length === 0 &&
          (renderHourReady || []).length === 0) ? (
          <EmptyMatchesState
            onAddAvailability={onAddAvailability}
            onInvitePlayers={onInvitePlayers}
            showMissingClubs={!myAcceptedClubs || myAcceptedClubs.size === 0}
          />
        ) : mode === 'long' ? (
          <>
            {(renderLongSections || []).length === 0 ? (
              <Text style={{ color: THEME.muted, marginBottom: 6 }}>Aucun créneau 1h30 prêt.</Text>
            ) : (
              <SectionList
                key={`long-list-${listKeySeed}-${(renderLongSections || []).length}-${(renderLongSections || []).map((s) => s.data?.length || 0).join(',')}`}
                sections={renderLongSections}
                keyExtractor={(item) => item.key}
                renderSectionHeader={({ section }) => (
                  <View style={{ paddingHorizontal: 0, paddingVertical: 0, height: 0 }}>
                    <Text style={{ fontWeight: '900', color: '#111827', display: 'none' }}>{section.title}</Text>
                  </View>
                )}
                ItemSeparatorComponent={() => null}
                SectionSeparatorComponent={() => <View style={{ height: 0 }} />}
                renderItem={({ item }) => <LongSlotRow item={item} />}
                contentContainerStyle={{ paddingBottom: bottomPad + 100 }}
                scrollIndicatorInsets={{ bottom: (bottomPad + 100) / 2 }}
                ListFooterComponent={() => <View style={{ height: bottomPad + 100 }} />}
                extraData={longListExtraData}
                removeClippedSubviews={false}
              />
            )}
          </>
        ) : (
          <>
            {(renderHourReady || []).length === 0 ? (
              <Text style={{ color: THEME.muted, marginBottom: 6 }}>Aucun créneau 1h prêt.</Text>
            ) : (
              <FlatList
                key={`hour-list-${listKeySeed}-${(renderHourReady || []).length}-${(renderHourReady || []).map((x) => x.time_slot_id).slice(0, 3).join(',')}`}
                data={renderHourReady}
                keyExtractor={(x) => x.time_slot_id + '-hour'}
                renderItem={({ item }) => <HourSlotRow item={item} />}
                contentContainerStyle={{ paddingBottom: bottomPad + 100 }}
                scrollIndicatorInsets={{ bottom: (bottomPad + 100) / 2 }}
                ListFooterComponent={() => <View style={{ height: bottomPad + 100 }} />}
                extraData={hourListExtraData}
                removeClippedSubviews={false}
              />
            )}
          </>
        )}
      </>
    ),
    [
      mode,
      loadingWeek,
      renderLongSections,
      renderHourReady,
      bottomPad,
      listKeySeed,
      longListExtraData,
      hourListExtraData,
      onAddAvailability,
      onInvitePlayers,
    ]
  );

  if (!groupId) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>Choisis un groupe</Text>
      </View>
    );
  }
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {networkNotice && (
        <View style={styles.networkNotice}>
          <Text style={styles.networkNoticeText}>{networkNotice}</Text>
        </View>
      )}

      {inviteBanner?.groupName ? (
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 6,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 10,
            backgroundColor: THEME.accent,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text style={{ color: THEME.ink, fontWeight: '800' }}>
            Groupe rejoint : {inviteBanner.groupName}
          </Text>
          <Pressable onPress={() => setInviteBanner(null)} hitSlop={8}>
            <Ionicons name="close" size={18} color={THEME.ink} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.header}>
        <View />
      </View>

      <View
        style={styles.segmentWrapFloating}
        onLayout={(event) => {
          const h = Math.max(0, event?.nativeEvent?.layout?.height || 0);
          setMatchTabsHeight((prev) => (Math.abs(prev - h) > 1 ? h : prev));
        }}
      >
        <View style={styles.segment}>
          <Pressable
            onPress={() => setTab('proposes')}
            style={[
              styles.segmentBtn,
              tab === 'proposes' && styles.segmentBtnActiveProposes,
            ]}
          >
            <View style={styles.segmentContent}>
              <View style={styles.segmentCountWrap}>
                <Text
                  style={[
                    styles.segmentCount,
                    tab === 'proposes' && styles.segmentCountActive,
                  ]}
                >
                  {proposedTabCountDisplay}
                </Text>
              </View>
              <View style={styles.segmentLabelStack}>
                <Text
                  style={[
                    styles.segmentLabel,
                    tab === 'proposes' && styles.segmentLabelActive,
                  ]}
                >
                  <Text style={styles.segmentLabelStrong}>MATCHS</Text>
                </Text>
                <Text
                  style={[
                    styles.segmentLabel,
                    tab === 'proposes' && styles.segmentLabelActive,
                  ]}
                >
                  possibles
                </Text>
              </View>
            </View>
          </Pressable>
          <Pressable
            onPress={() => setTab('valides')}
            style={[
              styles.segmentBtn,
              tab === 'valides' && styles.segmentBtnActive,
            ]}
          >
            <View style={styles.segmentContent}>
              <View style={styles.segmentCountWrap}>
                <Text
                  style={[
                    styles.segmentCount,
                    tab === 'valides' && styles.segmentCountActive,
                  ]}
                >
                  {confirmedTabCount}
                </Text>
              </View>
              <View style={styles.segmentLabelStack}>
                <Text
                  style={[
                    styles.segmentLabel,
                    tab === 'valides' && styles.segmentLabelActive,
                  ]}
                >
                  <Text style={styles.segmentLabelStrong}>MATCHS</Text>
                </Text>
                <Text
                  style={[
                    styles.segmentLabel,
                    styles.segmentLabelLarge,
                    tab === 'valides' && styles.segmentLabelActive,
                  ]}
                >
                  validés
                </Text>
              </View>
            </View>
          </Pressable>
        </View>
      </View>
      <View style={{ height: matchTabsHeight + 1 }} />

      
      {/* Filtre par niveau ciblé - affiché seulement pour les matchs possibles */}
      {tab === 'proposes' && (
        <>
          {/* Icônes filtres pour afficher/masquer les configurations - Positionnées en bas, au-dessus du sélecteur de semaine */}
          <View
            onLayout={updateMeasuredHeight(setFilterBarMeasuredHeight, FILTER_BAR_HEIGHT)}
            style={[styles.filtersBar, { bottom: filterButtonsBottom }]}
          >
            <Pressable
              onPress={() => {
                if (!filterConfigVisible) {
                  // Si on ouvre ce filtre, fermer l'autre
                  setFilterGeoVisible(false);
                }
                setFilterConfigVisible(!filterConfigVisible);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 3,
                paddingHorizontal: 8,
                borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.16)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.22)',
                shadowColor: '#000000',
                shadowOpacity: 0.25,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: 3,
                gap: 8,
              }}
            >
              <Image 
                source={racketIcon}
                style={{
                  width: 20,
                  height: 20,
                  tintColor: filterByLevel ? THEME.accent : THEME.muted,
                }}
                resizeMode="contain"
              />
              <Text style={{ 
                color: (filterByLevel || filterConfigVisible) ? THEME.accent : THEME.muted, 
                fontWeight: '700', 
                fontSize: 12,
                textShadowColor: 'rgba(0,0,0,0.6)',
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 2,
              }}>
                {filterByLevel ? `Filtre actif (${filterLevels.length})` : 'Filtre niveau'}
              </Text>
            </Pressable>
            
            {/* Icône flammes pour les matchs en feu - centrée entre les filtres */}
            <Pressable
              onPress={() => setHotMatchesModalVisible(true)}
              disabled={hotMatches.length === 0}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 3,
                paddingHorizontal: 6,
                borderRadius: 999,
                backgroundColor: hotMatches.length > 0 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)',
                borderWidth: 1,
                borderColor: hotMatches.length > 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.12)',
                shadowColor: hotMatches.length > 0 ? '#000000' : 'transparent',
                shadowOpacity: hotMatches.length > 0 ? 0.25 : 0,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: hotMatches.length > 0 ? 3 : 0,
                gap: 6,
                flexShrink: 0,
                opacity: hotMatches.length > 0 ? 1 : 0.6,
              }}
            >
              <Text style={{ fontSize: 18 }}>🔥</Text>
              <Text
                style={{ 
                  color: hotMatches.length > 0 ? '#fd9c68' : THEME.muted, 
                  fontWeight: '700', 
                  fontSize: 12,
                  flexShrink: 0,
                  textShadowColor: hotMatches.length > 0 ? 'rgba(0,0,0,0.6)' : 'transparent',
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 2,
                }}
              >
                {hotMatches.length}
              </Text>
            </Pressable>
            
            {!activeGroup?.club_id ? (
              <Pressable
                onPress={() => {
                  if (!filterGeoVisible) {
                    // Si on ouvre ce filtre, fermer l'autre
                    setFilterConfigVisible(false);
                  }
                  setFilterGeoVisible(!filterGeoVisible);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 3,
                  paddingHorizontal: 8,
                  borderRadius: 999,
                  backgroundColor: 'rgba(255,255,255,0.16)',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.22)',
                  shadowColor: '#000000',
                  shadowOpacity: 0.25,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 3,
                  gap: 8,
                }}
              >
                <Text style={{ 
                  color: (filterByGeo || filterGeoVisible) ? THEME.accent : THEME.muted, 
                  fontWeight: '700', 
                  fontSize: 12,
                  textShadowColor: 'rgba(0,0,0,0.6)',
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 2,
                }}>
                  {filterByGeo && filterGeoRadiusKm ? `Filtre géo (${filterGeoRadiusKm}km)` : 'Filtre géographique'}
                </Text>
                <Ionicons 
                  name="location" 
                  size={20} 
                  color={filterByGeo ? THEME.accent : THEME.muted}
                />
              </Pressable>
            ) : null}
          </View>
          
          {/* Zone de configuration du filtre (masquée par défaut) - Positionnée au-dessus de la ligne de filtres */}
          {filterConfigVisible && (
            <View style={{ 
              position: 'absolute',
              bottom: filterConfigBottom,
              left: 16,
              right: 16,
              backgroundColor: THEME.card, 
              borderRadius: 12, 
              padding: 12,
              borderWidth: 2,
              borderColor: THEME.accent,
              zIndex: 1002,
              elevation: 11,
              maxHeight: 300,
            }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: THEME.text, marginBottom: 12 }}>
                Sélectionnez les niveaux à afficher
              </Text>
              
              {/* Sélection des niveaux */}
              <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 6 }}>
                {LEVELS.map((lv) => {
                  const isSelected = Array.isArray(filterLevels) && filterLevels.includes(lv.v);
                  return (
                    <Pressable
                      key={lv.v}
                      onPress={() => {
                        setFilterLevels((prev) => {
                          const prevArray = Array.isArray(prev) ? prev : [];
                          if (prevArray.includes(lv.v)) {
                            return prevArray.filter((n) => n !== lv.v);
                          }
                          return [...prevArray, lv.v];
                        });
                      }}
                      style={{
                        paddingVertical: 4.5,
                        paddingHorizontal: 11,
                        borderRadius: 999,
                        backgroundColor: isSelected ? lv.color : 'rgba(255,255,255,0.06)',
                        borderWidth: isSelected ? 2 : 1,
                        borderColor: isSelected ? lv.color : THEME.cardBorder,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ 
                        fontSize: 13, 
                        fontWeight: isSelected ? '900' : '800', 
                        color: THEME.text 
                      }}>
                        {lv.v}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              
              {filterByLevel && (
                <Text style={{ fontSize: 12, fontWeight: '500', color: THEME.accent, marginTop: 8 }}>
                  ✓ Filtre actif : niveaux ciblés {filterLevels.slice().sort((a, b) => a - b).join(', ')}
                </Text>
              )}
            </View>
          )}
          
          {/* Zone de configuration du filtre géographique (masquée par défaut) - Positionnée au-dessus de la ligne de filtres */}
          {filterGeoVisible && (
            <View style={{ 
              position: 'absolute',
              bottom: filterConfigBottom,
              left: 16,
              right: 16,
              backgroundColor: 'rgba(10, 32, 56, 0.95)', 
              borderRadius: 12, 
              padding: 12,
              borderWidth: 2,
              borderColor: THEME.accent,
              zIndex: 1002,
              elevation: 11,
              maxHeight: 400,
            }}>
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: THEME.accent, marginBottom: 8 }}>
                  Zone active
                </Text>
                <Pressable
                  onPress={() => setGeoZonePickerOpen(true)}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    borderWidth: 1,
                    borderColor: THEME.cardBorder,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: THEME.text, flexShrink: 1 }} numberOfLines={1}>
                    {currentZone?.name || 'Sélectionner une zone'}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={THEME.muted} />
                </Pressable>
                <Text style={{ fontSize: 11, color: THEME.muted, marginTop: 6 }}>
                  Changer de zone ne met pas à jour tes clubs acceptés.
                </Text>
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: THEME.accent, marginBottom: 8 }}>
                  Rayon en km (non bloquant)
                </Text>
                <Text style={{ fontSize: 12, color: THEME.muted, marginBottom: 6 }}>
                  {Math.round(comfortRadiusKm ?? currentZone?.default_radius_km ?? 30)} km
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 6 }}>
                  {[10, 20, 30, 40, 50, 60].map((km) => {
                    const isSelected = Math.round(comfortRadiusKm ?? currentZone?.default_radius_km ?? 30) === km;
                    return (
                      <Pressable
                        key={km}
                        onPress={async () => {
                          setComfortRadiusKm(km);
                          if (!meId) return;
                          const { error } = await supabase
                            .from("profiles")
                            .update({ comfort_radius_km: km })
                            .eq("id", meId);
                          if (error) Alert.alert("Erreur", error.message);
                          persistGeoPrefs(activeGroup?.id, { comfort_radius_km: km });
                        }}
                        style={{
                          flex: 1,
                          paddingVertical: 6,
                          paddingHorizontal: 8,
                          borderRadius: 8,
                          backgroundColor: isSelected ? THEME.accent : 'rgba(255,255,255,0.06)',
                          borderWidth: 1,
                          borderColor: isSelected ? THEME.accent : THEME.cardBorder,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ 
                          fontSize: 12, 
                          fontWeight: isSelected ? '800' : '700', 
                          color: isSelected ? THEME.ink : THEME.text 
                        }}>
                          {km}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <Pressable
                onPress={() => setGeoClubsModalOpen(true)}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  borderWidth: 1,
                  borderColor: THEME.cardBorder,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: (() => {
                      let count = 0;
                      if (geoClubsModalOpen && geoClubsSelected?.size != null) {
                        count = geoClubsSelected.size;
                      } else if (geoClubsList?.length) {
                        const ids = new Set(geoClubsList.map((c) => String(c.id)));
                        count = Array.from(myAcceptedClubs || []).filter((id) => ids.has(String(id))).length;
                      } else {
                        count = myAcceptedClubs?.size || 0;
                      }
                      return count > 0 ? THEME.text : '#f59e0b';
                    })(),
                  }}
                >
                  {(() => {
                    let count = 0;
                    if (geoClubsModalOpen && geoClubsSelected?.size != null) {
                      count = geoClubsSelected.size;
                    } else if (geoClubsList?.length) {
                      const ids = new Set(geoClubsList.map((c) => String(c.id)));
                      count = Array.from(myAcceptedClubs || []).filter((id) => ids.has(String(id))).length;
                    } else {
                      count = myAcceptedClubs?.size || 0;
                    }
                    return count > 0
                      ? `${count} clubs acceptés`
                      : 'Sélectionner les clubs acceptés';
                  })()}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={THEME.muted} />
              </Pressable>

            </View>
          )}

          <Modal visible={geoZonePickerOpen} transparent animationType="fade" onRequestClose={() => setGeoZonePickerOpen(false)}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', padding: 24, justifyContent: 'center' }}>
              <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} onPress={() => setGeoZonePickerOpen(false)} />
              <View style={{ backgroundColor: THEME.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: THEME.cardBorder }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: THEME.accent, marginBottom: 10 }}>Ma zone active</Text>
                <View style={{ marginBottom: 12 }}>
                  {(() => {
                    const active = (zonesList || []).find((z) => String(z.id) === String(myZoneId));
                    if (!active) return null;
                    return (
                      <View
                        style={{
                          paddingVertical: 10,
                          paddingHorizontal: 12,
                          borderRadius: 8,
                          backgroundColor: THEME.accentSoft,
                          borderWidth: 1,
                          borderColor: THEME.accent,
                          marginBottom: 8,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <Text style={{ color: THEME.accent, fontWeight: '800' }}>{active.name}</Text>
                      </View>
                    );
                  })()}
                </View>

                <Text style={{ fontSize: 15, fontWeight: '800', color: THEME.accent, marginBottom: 10 }}>Changer de zone</Text>
                <ScrollView style={{ maxHeight: 320 }}>
                  {(() => {
                    const orderedActiveNames = [
                      "NORD – Lille et alentours",
                      "NORD – Dunkerque · Calais · Boulogne · Audomarois",
                      "GIRONDE – Bordeaux et métropole"
                    ];
                    const active = (zonesList || []).filter((z) => z.is_active);
                    const inactive = (zonesList || []).filter((z) => !z.is_active);
                    active.sort((a, b) => {
                      const ia = orderedActiveNames.indexOf(a.name);
                      const ib = orderedActiveNames.indexOf(b.name);
                      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
                      return (a.name || "").localeCompare(b.name || "");
                    });
                    inactive.sort((a, b) => {
                      const ra = a.region || "";
                      const rb = b.region || "";
                      if (ra !== rb) return ra.localeCompare(rb);
                      return (a.name || "").localeCompare(b.name || "");
                    });
                    return (
                      <>
                        {active.map((z) => {
                          if (String(z.id) === String(myZoneId)) return null;
                          const isSelected = false;
                          return (
                            <Pressable
                              key={z.id}
                              onPress={() => {
                                Alert.alert(
                                  "Changer de zone",
                                  "Changer de zone modifie les joueurs et matchs visibles.",
                                  [
                                    { text: "Annuler", style: "cancel" },
                                    { text: "Continuer", onPress: () => changeZone(z, { skipConfirm: true }) }
                                  ]
                                );
                                setGeoZonePickerOpen(false);
                              }}
                              style={{
                                paddingVertical: 10,
                                paddingHorizontal: 12,
                                borderRadius: 8,
                                marginBottom: 8,
                                backgroundColor: isSelected ? THEME.accentSoft : 'rgba(255,255,255,0.06)',
                                borderWidth: 1,
                                borderColor: isSelected ? THEME.accent : THEME.cardBorder,
                              }}
                            >
                              <Text style={{ color: isSelected ? THEME.accent : THEME.text, fontWeight: '700' }}>{z.name}</Text>
                            </Pressable>
                          );
                        })}
                        {inactive.map((z) => (
                          <Pressable
                            key={z.id}
                            onPress={() => Alert.alert(
                              "Zone pas encore active",
                              "Cette zone n’est pas encore disponible.",
                              [
                                { text: "OK" },
                                {
                                  text: "Être alerté",
                                  onPress: async () => {
                                    try {
                                      const { data: u } = await supabase.auth.getUser();
                                      const uid = u?.user?.id;
                                      if (uid) {
                                        await supabase.from("zone_interest").upsert({ user_id: uid, zone_id: z.id });
                                      }
                                      const key = "zone_interest";
                                      const raw = await AsyncStorage.getItem(key);
                                      const prev = raw ? JSON.parse(raw) : [];
                                      const next = Array.isArray(prev) ? [...prev] : [];
                                      if (!next.find((zz) => String(zz?.id) === String(z.id))) {
                                        next.push({ id: z.id, name: z.name, region: z.region, at: Date.now() });
                                      }
                                      await AsyncStorage.setItem(key, JSON.stringify(next));
                                    } catch {}
                                  }
                                }
                              ]
                            )}
                            style={{
                              paddingVertical: 10,
                              paddingHorizontal: 12,
                              borderRadius: 8,
                              marginBottom: 8,
                              backgroundColor: 'rgba(255,255,255,0.04)',
                              borderWidth: 1,
                              borderColor: THEME.cardBorder,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between'
                            }}
                          >
                            <Text style={{ color: THEME.text, fontWeight: '700', flexShrink: 1 }}>{z.name}</Text>
                            <Text style={{ color: '#fbbf24', fontWeight: '700' }}>Bientôt</Text>
                          </Pressable>
                        ))}
                      </>
                    );
                  })()}
                </ScrollView>
                <Pressable
                  onPress={() => setGeoZonePickerOpen(false)}
                  style={{ marginTop: 10, paddingVertical: 10, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center' }}
                >
                  <Text style={{ color: THEME.text, fontWeight: '800' }}>Annuler</Text>
                </Pressable>
              </View>
            </View>
          </Modal>

          <Modal visible={geoClubsModalOpen} transparent animationType="fade" onRequestClose={() => setGeoClubsModalOpen(false)}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', padding: 24, justifyContent: 'center' }}>
              <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} onPress={() => setGeoClubsModalOpen(false)} />
              <View style={{ backgroundColor: THEME.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: THEME.cardBorder }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: THEME.text, marginBottom: 10 }}>Clubs acceptés</Text>
                {geoClubsLoading ? (
                  <ActivityIndicator size="small" color={THEME.accent} />
                ) : (
                  <ScrollView style={{ maxHeight: 360 }}>
                    {(geoClubsList || []).map((club) => {
                      const isSelected = geoClubsSelected.has(String(club.id));
                      return (
                        <Pressable
                          key={club.id}
                          onPress={() => {
                            setGeoClubsSelected((prev) => {
                              const next = new Set(prev);
                              const key = String(club.id);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            });
                          }}
                          style={{
                            paddingVertical: 10,
                            paddingHorizontal: 12,
                            borderRadius: 8,
                            marginBottom: 8,
                            backgroundColor: isSelected ? THEME.accentSoft : 'rgba(255,255,255,0.06)',
                            borderWidth: 1,
                            borderColor: isSelected ? THEME.accent : THEME.cardBorder,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                          }}
                        >
                          <Text style={{ color: THEME.text, fontWeight: '700', flexShrink: 1 }}>{club.name}</Text>
                          {isSelected ? <Ionicons name="checkmark" size={18} color={THEME.accent} /> : null}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
                <Pressable
                  onPress={async () => {
                    if (!meId) return;
                    const selected = Array.from(geoClubsSelected);
                    const inZoneIds = new Set((geoClubsList || []).map((c) => String(c.id)));
                    const toDelete = Array.from(inZoneIds).filter((id) => !geoClubsSelected.has(id));
                    if (toDelete.length) {
                      await supabase.from("user_clubs").delete().eq("user_id", meId).in("club_id", toDelete);
                    }
                    if (selected.length) {
                      const payload = selected.map((clubId) => ({
                        user_id: meId,
                        club_id: clubId,
                        is_accepted: true,
                        is_preferred: false
                      }));
                      await supabase.from("user_clubs").upsert(payload, { onConflict: "user_id,club_id" });
                    }
                    setMyAcceptedClubs(new Set(selected));
                    persistGeoPrefs(activeGroup?.id, { club_ids: selected });
                    setGeoClubsModalOpen(false);
                  }}
                  style={{ marginTop: 8, paddingVertical: 10, borderRadius: 999, backgroundColor: THEME.accent, alignItems: 'center' }}
                >
                  <Text style={{ color: THEME.ink, fontWeight: '900' }}>Enregistrer</Text>
                </Pressable>
              </View>
            </View>
          </Modal>
        </>
      )}
      

  {tab === 'proposes' &&
    (matchCreatedUndoVisible && proposesTabSnapshotRef.current
      ? proposesTabSnapshotRef.current
      : proposesTab)}

      {tab === 'rsvp' && null}

      {tab === 'valides' && (
        <>
          {/* Sélecteur 1h / 1h30 pour Validés */}
          <View style={styles.segmentWrap}>
            <View style={styles.segment}>
              <Pressable
                onPress={() => setConfirmedMode('hour')}
                style={[
                  styles.segmentBtn,
                  styles.segmentBtnCompact,
                  confirmedMode === 'hour' && styles.segmentBtnActive,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    confirmedMode === 'hour' && styles.segmentTextActive,
                  ]}
                >
                  {`1h (${confirmedHourWeek?.length || 0})`}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setConfirmedMode('long')}
                style={[
                  styles.segmentBtn,
                  styles.segmentBtnCompact,
                  confirmedMode === 'long' && styles.segmentBtnActive,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    confirmedMode === 'long' && styles.segmentTextActive,
                  ]}
                >
                  {`1h30 (${confirmedLongWeek?.length || 0})`}
                </Text>
              </Pressable>
            </View>
          </View>

          {confirmedMode === 'long' ? (
            confirmedLong.length === 0 ? (
              <Text style={{ color: THEME.muted }}>Aucun match 1h30 confirmé.</Text>
            ) : (
              <FlatList
          data={confirmedLong.filter(m => {
            // Si pas de time_slots, inclure par défaut
            if (!m?.time_slots?.starts_at || !m?.time_slots?.ends_at) {
              console.log('[Validés Long] Match sans time_slots (inclus):', m.id);
              return true;
            }
            const inRange = isInWeekRange(m.time_slots.starts_at, m.time_slots.ends_at, currentWs, currentWe);
            if (!inRange) {
              console.log('[Validés Long] Match exclu par isInWeekRange:', m.id, 'starts_at:', m?.time_slots?.starts_at, 'ends_at:', m?.time_slots?.ends_at);
            }
            return inRange;
          })}
                keyExtractor={(m) => m.id + '-confirmed-long'}
                renderItem={({ item: m }) => (
                  <MatchCardConfirmed m={m} />
                )}
                contentContainerStyle={{ paddingBottom: bottomPad + 100 }}
                scrollIndicatorInsets={{ bottom: (bottomPad + 100) / 2 }}
          ListFooterComponent={() => (
            <>
              {/* Ligne de séparation */}
              {historyMatches.length > 0 && (
                <View style={{ height: 1, backgroundColor: '#e0ff00', marginVertical: 20, marginHorizontal: 16 }} />
              )}

              {/* Historique des 5 derniers matchs */}
              {historyMatches.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ color: '#e0ff00', fontWeight: '800', fontSize: 18, marginBottom: 12, paddingHorizontal: 4 }}>
                    MES 5 DERNIERS MATCHS
                  </Text>
                  {historyMatches
                    .filter((match) => {
                      // Vérification de sécurité : ne pas afficher les matches où l'utilisateur n'a pas de RSVP accepted
                      const matchRsvps = rsvpsByMatch[match.id] || [];
                      const hasUserAccepted = matchRsvps.some(r => 
                        String(r.user_id) === String(meId) && 
                        String(r.status || '').toLowerCase() === 'accepted'
                      );
                      if (!hasUserAccepted) {
                        console.warn('[History] Match exclu de l\'affichage (pas de RSVP accepted):', match.id);
                        return false;
                      }
                      return true;
                    })
                    .map((match) => {
                const slot = match.time_slots || {};
                const matchDate = slot.starts_at ? new Date(slot.starts_at) : (match.created_at ? new Date(match.created_at) : null);
                
                // Formater la date/heure au format "Mar 23 Déc - 21:00 à 22:30"
                const formatHistoryDate = (startDate, endDate) => {
                  if (!startDate || !endDate) return 'Date inconnue';
                  const start = new Date(startDate);
                  const end = new Date(endDate);
                  const WD = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
                  const MO = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
                  const wd = WD[start.getDay()] || '';
                  const dd = String(start.getDate()).padStart(2, '0');
                  const mo = MO[start.getMonth()] || '';
                  const startTime = start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                  const endTime = end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                  return `${wd} ${dd} ${mo} - ${startTime} à ${endTime}`;
                };
                
                const dateTimeStr = slot.starts_at && slot.ends_at 
                  ? formatHistoryDate(slot.starts_at, slot.ends_at)
                  : (matchDate ? matchDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : 'Date inconnue');
                
                // Récupérer les joueurs du match
                const matchRsvps = rsvpsByMatch[match.id] || [];
                const acceptedPlayers = matchRsvps.filter(r => String(r.status || '').toLowerCase() === 'accepted');
                
                return (
                  <View
                    key={match.id}
                    style={{
                      backgroundColor: '#1e3a5f',
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 8,
                      borderWidth: 1,
                      borderColor: '#2d4a6f',
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 14, marginBottom: 8 }}>
                          {dateTimeStr}
                        </Text>
                        {acceptedPlayers.length > 0 && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            {(() => {
                              // Si le match a un résultat, organiser les joueurs par équipe (gagnante d'abord)
                              if (match.result) {
                                const team1Players = [
                                  match.result.team1_player1_id,
                                  match.result.team1_player2_id
                                ].filter(Boolean);
                                const team2Players = [
                                  match.result.team2_player1_id,
                                  match.result.team2_player2_id
                                ].filter(Boolean);
                                
                                // Calculer le nombre de sets gagnés par chaque équipe
                                const parseSets = (scoreText) => {
                                  if (!scoreText) return [];
                                  const sets = scoreText.split(',').map(s => s.trim());
                                  return sets.map(set => {
                                    const [a, b] = set.split('-').map(s => parseInt(s.trim(), 10));
                                    return { team1: isNaN(a) ? 0 : a, team2: isNaN(b) ? 0 : b };
                                  });
                                };
                                
                                const sets = parseSets(match.result.score_text);
                                let team1SetsWon = 0;
                                let team2SetsWon = 0;
                                
                                sets.forEach(set => {
                                  // Un set est gagné si le score est 6 ou 7 et supérieur à l'adversaire
                                  if ((set.team1 === 6 || set.team1 === 7) && set.team1 > set.team2) {
                                    team1SetsWon++;
                                  } else if ((set.team2 === 6 || set.team2 === 7) && set.team2 > set.team1) {
                                    team2SetsWon++;
                                  }
                                });
                                
                                // Déterminer l'équipe gagnante basée sur le nombre de sets gagnés
                                const actualWinnerTeam = team1SetsWon > team2SetsWon ? 'team1' : (team2SetsWon > team1SetsWon ? 'team2' : null);
                                
                                // Équipe gagnante en premier (basée sur les sets gagnés, pas sur winner_team)
                                const winningTeamPlayers = actualWinnerTeam === 'team1' ? team1Players : team2Players;
                                const losingTeamPlayers = actualWinnerTeam === 'team1' ? team2Players : team1Players;
                                
                                return (
                                  <>
                                    {/* Joueurs de l'équipe gagnante avec bordure verte */}
                                    {winningTeamPlayers.map((playerId) => {
                                      const p = profilesById[String(playerId)];
                                      if (!p) return null;
                                      return (
                                        <View key={playerId} style={{ borderWidth: 2, borderColor: '#10b981', borderRadius: 24, padding: 2 }}>
                                          <LevelAvatar
                                            profile={p}
                                            size={40}
                                            rsvpStatus={undefined}
                                            onLongPressProfile={openProfile}
                                          />
                                        </View>
                                      );
                                    })}
                                    {/* Icône éclair entre les équipes */}
                                    <Ionicons name="flash" size={20} color="#10b981" style={{ marginHorizontal: 4 }} />
                                    {/* Joueurs de l'équipe perdante avec bordure rouge */}
                                    {losingTeamPlayers.map((playerId) => {
                                      const p = profilesById[String(playerId)];
                                      if (!p) return null;
                                      return (
                                        <View key={playerId} style={{ borderWidth: 2, borderColor: '#ef4444', borderRadius: 24, padding: 2 }}>
                                          <LevelAvatar
                                            profile={p}
                                            size={40}
                                            rsvpStatus={undefined}
                                            onLongPressProfile={openProfile}
                                          />
                                        </View>
                                      );
                                    })}
                                  </>
                                );
                              } else {
                                // Pas de résultat, afficher tous les joueurs sans bordure spéciale
                                return acceptedPlayers.slice(0, 4).map((r) => {
                                  const p = profilesById[String(r.user_id)];
                                  if (!p) return null;
                                  return (
                                    <LevelAvatar
                                      key={r.user_id}
                                      profile={p}
                                      size={40}
                                      onLongPressProfile={openProfile}
                                    />
                                  );
                                });
                              }
                            })()}
                          </View>
                        )}
                      </View>
                    </View>
                    
                    {match.result ? (
                      // Afficher le score
                      <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#2d4a6f' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                          <Ionicons name="trophy" size={16} color="#e0ff00" style={{ marginRight: 6 }} />
                          <Text style={{ color: '#e0ff00', fontWeight: '700', fontSize: 12 }}>
                            Résultat enregistré
                          </Text>
                        </View>
                        {(() => {
                          const parseSets = (scoreText) => {
                            if (!scoreText) return [];
                            const sets = scoreText.split(',').map(s => s.trim());
                            return sets.map(set => {
                              const [a, b] = set.split('-').map(s => parseInt(s.trim(), 10));
                              return { team1: isNaN(a) ? 0 : a, team2: isNaN(b) ? 0 : b };
                            });
                          };
                          
                          const sets = parseSets(match.result.score_text);
                          while (sets.length < 3) {
                            sets.push({ team1: 0, team2: 0 });
                          }
                          
                          // Calculer le nombre de sets gagnés par chaque équipe
                          let team1SetsWon = 0;
                          let team2SetsWon = 0;
                          
                          sets.forEach(set => {
                            // Un set est gagné si le score est 6 ou 7 et supérieur à l'adversaire
                            if ((set.team1 === 6 || set.team1 === 7) && set.team1 > set.team2) {
                              team1SetsWon++;
                            } else if ((set.team2 === 6 || set.team2 === 7) && set.team2 > set.team1) {
                              team2SetsWon++;
                            }
                          });
                          
                          // Déterminer l'équipe gagnante basée sur le nombre de sets gagnés
                          const actualWinnerTeam = team1SetsWon > team2SetsWon ? 'team1' : (team2SetsWon > team1SetsWon ? 'team2' : null);
                          
                          const team1Player1 = profilesById?.[String(match.result.team1_player1_id)]?.display_name || 'Joueur 1';
                          const team1Player2 = profilesById?.[String(match.result.team1_player2_id)]?.display_name || 'Joueur 2';
                          const team2Player1 = profilesById?.[String(match.result.team2_player1_id)]?.display_name || 'Joueur 1';
                          const team2Player2 = profilesById?.[String(match.result.team2_player2_id)]?.display_name || 'Joueur 2';
                          
                          // Couleurs basées sur le nombre de sets gagnés, pas sur winner_team
                          const team1Color = actualWinnerTeam === 'team1' ? '#10b981' : '#ef4444';
                          const team2Color = actualWinnerTeam === 'team2' ? '#10b981' : '#ef4444';
                          
                          return (
                            <View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                <Text style={{ color: team1Color, fontWeight: '400', fontSize: 12, flex: 1 }}>
                                  {team1Player1} / {team1Player2}
                                </Text>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                  {sets.map((set, index) => (
                                    <Text key={index} style={{ color: (set.team1 === 6 || set.team1 === 7) && set.team1 > set.team2 ? '#10b981' : '#ffffff', fontWeight: (set.team1 === 6 || set.team1 === 7) && set.team1 > set.team2 ? '700' : '600', fontSize: 14, minWidth: 16, textAlign: 'right' }}>
                                      {set.team1}
                                    </Text>
                                  ))}
                                </View>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={{ color: team2Color, fontWeight: '400', fontSize: 12, flex: 1 }}>
                                  {team2Player1} / {team2Player2}
                                </Text>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                  {sets.map((set, index) => (
                                    <Text key={index} style={{ color: (set.team2 === 6 || set.team2 === 7) && set.team2 > set.team1 ? '#10b981' : '#ffffff', fontWeight: (set.team2 === 6 || set.team2 === 7) && set.team2 > set.team1 ? '700' : '600', fontSize: 14, minWidth: 16, textAlign: 'right' }}>
                                      {set.team2}
                                    </Text>
                                  ))}
                                </View>
                              </View>
                            </View>
                          );
                        })()}
                        {/* Bouton pour modifier le résultat */}
                        <Pressable
                          onPress={() => {
                            router.push({
                              pathname: '/matches/record-result',
                              params: { matchId: match.id },
                            });
                          }}
                          style={{
                            marginTop: 12,
                            backgroundColor: '#9ca3af',
                            paddingVertical: 8,
                            paddingHorizontal: 12,
                            borderRadius: 8,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Ionicons name="create-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                          <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 12 }}>
                            Modifier le résultat
                          </Text>
                        </Pressable>
                      </View>
                    ) : (
                      // Bouton pour enregistrer le score
                      <Pressable
                        onPress={() => {
                          router.push({
                            pathname: '/matches/record-result',
                            params: { matchId: match.id },
                          });
                        }}
                        style={{
                          marginTop: 8,
                          backgroundColor: '#1a4b97',
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 8,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons name="trophy-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                        <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 12 }}>
                          Enregistrer le score
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
                </View>
              )}
              <View style={{ height: bottomPad + 100 }} />
            </>
          )}
        />
            )
          ) : (
            confirmedHour.length === 0 ? (
              <Text style={{ color: THEME.muted }}>Aucun match 1h confirmé.</Text>
            ) : (
              <FlatList
          data={confirmedHour.filter(m => {
            // Si pas de time_slots, inclure par défaut
            if (!m?.time_slots?.starts_at || !m?.time_slots?.ends_at) {
              console.log('[Validés Hour] Match sans time_slots (inclus):', m.id);
              return true;
            }
            return isInWeekRange(m.time_slots.starts_at, m.time_slots.ends_at, currentWs, currentWe);
          })}
                keyExtractor={(m) => m.id + '-confirmed-hour'}
                renderItem={({ item: m }) => (
                  <MatchCardConfirmed m={m} />
                )}
                contentContainerStyle={{ paddingBottom: bottomPad + 100 }}
                scrollIndicatorInsets={{ bottom: (bottomPad + 100) / 2 }}
                ListFooterComponent={() => (
                  <>
                    {/* Ligne de séparation */}
                    {historyMatches.length > 0 && (
                      <View style={{ height: 1, backgroundColor: '#e0ff00', marginVertical: 20, marginHorizontal: 16 }} />
                    )}

                    {/* Historique des 5 derniers matchs */}
                    {historyMatches.length > 0 && (
                      <View style={{ marginBottom: 16 }}>
                        <Text style={{ color: '#e0ff00', fontWeight: '800', fontSize: 18, marginBottom: 12, paddingHorizontal: 4 }}>
                          MES 5 DERNIERS MATCHS
                        </Text>
                        {historyMatches
                          .filter((match) => {
                            // Vérification de sécurité : ne pas afficher les matches où l'utilisateur n'a pas de RSVP accepted
                            const matchRsvps = rsvpsByMatch[match.id] || [];
                            const hasUserAccepted = matchRsvps.some(r => 
                              String(r.user_id) === String(meId) && 
                              String(r.status || '').toLowerCase() === 'accepted'
                            );
                            if (!hasUserAccepted) {
                              console.warn('[History] Match exclu de l\'affichage (pas de RSVP accepted):', match.id);
                              return false;
                            }
                            return true;
                          })
                          .map((match) => {
                          const slot = match.time_slots || {};
                          const matchDate = slot.starts_at ? new Date(slot.starts_at) : (match.created_at ? new Date(match.created_at) : null);
                          
                          // Formater la date/heure au format "Mar 23 Déc - 21:00 à 22:30"
                          const formatHistoryDate = (startDate, endDate) => {
                            if (!startDate || !endDate) return 'Date inconnue';
                            const start = new Date(startDate);
                            const end = new Date(endDate);
                            const WD = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
                            const MO = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
                            const wd = WD[start.getDay()] || '';
                            const dd = String(start.getDate()).padStart(2, '0');
                            const mo = MO[start.getMonth()] || '';
                            const startTime = start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                            const endTime = end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                            return `${wd} ${dd} ${mo} - ${startTime} à ${endTime}`;
                          };
                          
                          const dateTimeStr = slot.starts_at && slot.ends_at 
                            ? formatHistoryDate(slot.starts_at, slot.ends_at)
                            : (matchDate ? matchDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : 'Date inconnue');
                          
                          // Récupérer les joueurs du match
                          const matchRsvps = rsvpsByMatch[match.id] || [];
                          const acceptedPlayers = matchRsvps.filter(r => String(r.status || '').toLowerCase() === 'accepted');
                          
                          return (
                            <View
                              key={match.id}
                              style={{
                                backgroundColor: '#1e3a5f',
                                borderRadius: 12,
                                padding: 12,
                                marginBottom: 8,
                                borderWidth: 1,
                                borderColor: '#2d4a6f',
                              }}
                            >
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 14, marginBottom: 8 }}>
                                    {dateTimeStr}
                                  </Text>
                                  {acceptedPlayers.length > 0 && (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                      {(() => {
                                        // Si le match a un résultat, organiser les joueurs par équipe (gagnante d'abord)
                                        if (match.result) {
                                          const team1Players = [
                                            match.result.team1_player1_id,
                                            match.result.team1_player2_id
                                          ].filter(Boolean);
                                          const team2Players = [
                                            match.result.team2_player1_id,
                                            match.result.team2_player2_id
                                          ].filter(Boolean);
                                          
                                          // Calculer le nombre de sets gagnés par chaque équipe
                                          const parseSets = (scoreText) => {
                                            if (!scoreText) return [];
                                            const sets = scoreText.split(',').map(s => s.trim());
                                            return sets.map(set => {
                                              const [a, b] = set.split('-').map(s => parseInt(s.trim(), 10));
                                              return { team1: isNaN(a) ? 0 : a, team2: isNaN(b) ? 0 : b };
                                            });
                                          };
                                          
                                          const sets = parseSets(match.result.score_text);
                                          let team1SetsWon = 0;
                                          let team2SetsWon = 0;
                                          
                                          sets.forEach(set => {
                                            // Un set est gagné si le score est 6 ou 7 et supérieur à l'adversaire
                                            if ((set.team1 === 6 || set.team1 === 7) && set.team1 > set.team2) {
                                              team1SetsWon++;
                                            } else if ((set.team2 === 6 || set.team2 === 7) && set.team2 > set.team1) {
                                              team2SetsWon++;
                                            }
                                          });
                                          
                                          // Déterminer l'équipe gagnante basée sur le nombre de sets gagnés
                                          const actualWinnerTeam = team1SetsWon > team2SetsWon ? 'team1' : (team2SetsWon > team1SetsWon ? 'team2' : null);
                                          
                                          // Équipe gagnante en premier (basée sur les sets gagnés, pas sur winner_team)
                                          const winningTeamPlayers = actualWinnerTeam === 'team1' ? team1Players : team2Players;
                                          const losingTeamPlayers = actualWinnerTeam === 'team1' ? team2Players : team1Players;
                                          
                                          return (
                                            <>
                                              {/* Joueurs de l'équipe gagnante avec bordure verte */}
                                              {winningTeamPlayers.map((playerId) => {
                                                const p = profilesById[String(playerId)];
                                                if (!p) return null;
                                                return (
                                                  <View key={playerId} style={{ borderWidth: 2, borderColor: '#10b981', borderRadius: 24, padding: 2 }}>
                                                    <LevelAvatar
                                                      profile={p}
                                                      size={40}
                                                      rsvpStatus={undefined}
                                                      onLongPressProfile={openProfile}
                                                    />
                                                  </View>
                                                );
                                              })}
                                              {/* Icône éclair entre les équipes */}
                                              <Ionicons name="flash" size={20} color="#10b981" style={{ marginHorizontal: 4 }} />
                                              {/* Joueurs de l'équipe perdante avec bordure rouge */}
                                              {losingTeamPlayers.map((playerId) => {
                                                const p = profilesById[String(playerId)];
                                                if (!p) return null;
                                                return (
                                                  <View key={playerId} style={{ borderWidth: 2, borderColor: '#ef4444', borderRadius: 24, padding: 2 }}>
                                                    <LevelAvatar
                                                      profile={p}
                                                      size={40}
                                                      rsvpStatus={undefined}
                                                      onLongPressProfile={openProfile}
                                                    />
                                                  </View>
                                                );
                                              })}
                                            </>
                                          );
                                        } else {
                                          // Pas de résultat, afficher tous les joueurs sans bordure spéciale
                                          return acceptedPlayers.slice(0, 4).map((r) => {
                                            const p = profilesById[String(r.user_id)];
                                            if (!p) return null;
                                            return (
                                              <LevelAvatar
                                                key={r.user_id}
                                                profile={p}
                                                size={40}
                                                onLongPressProfile={openProfile}
                                              />
                                            );
                                          });
                                        }
                                      })()}
                                    </View>
                                  )}
                                </View>
                              </View>
                              
                              {match.result ? (
                                // Afficher le score
                                <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#2d4a6f' }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                    <Ionicons name="trophy" size={16} color="#e0ff00" style={{ marginRight: 6 }} />
                                    <Text style={{ color: '#e0ff00', fontWeight: '700', fontSize: 12 }}>
                                      Résultat enregistré
                                    </Text>
                                  </View>
                                  {(() => {
                                    const parseSets = (scoreText) => {
                                      if (!scoreText) return [];
                                      const sets = scoreText.split(',').map(s => s.trim());
                                      return sets.map(set => {
                                        const [a, b] = set.split('-').map(s => parseInt(s.trim(), 10));
                                        return { team1: isNaN(a) ? 0 : a, team2: isNaN(b) ? 0 : b };
                                      });
                                    };
                                    
                                    const sets = parseSets(match.result.score_text);
                                    while (sets.length < 3) {
                                      sets.push({ team1: 0, team2: 0 });
                                    }
                                    
                                    // Calculer le nombre de sets gagnés par chaque équipe
                                    let team1SetsWon = 0;
                                    let team2SetsWon = 0;
                                    
                                    sets.forEach(set => {
                                      // Un set est gagné si le score est 6 ou 7 et supérieur à l'adversaire
                                      if ((set.team1 === 6 || set.team1 === 7) && set.team1 > set.team2) {
                                        team1SetsWon++;
                                      } else if ((set.team2 === 6 || set.team2 === 7) && set.team2 > set.team1) {
                                        team2SetsWon++;
                                      }
                                    });
                                    
                                    // Déterminer l'équipe gagnante basée sur le nombre de sets gagnés
                                    const actualWinnerTeam = team1SetsWon > team2SetsWon ? 'team1' : (team2SetsWon > team1SetsWon ? 'team2' : null);
                                    
                                    const team1Player1 = profilesById?.[String(match.result.team1_player1_id)]?.display_name || 'Joueur 1';
                                    const team1Player2 = profilesById?.[String(match.result.team1_player2_id)]?.display_name || 'Joueur 2';
                                    const team2Player1 = profilesById?.[String(match.result.team2_player1_id)]?.display_name || 'Joueur 1';
                                    const team2Player2 = profilesById?.[String(match.result.team2_player2_id)]?.display_name || 'Joueur 2';
                                    
                                    // Couleurs basées sur le nombre de sets gagnés, pas sur winner_team
                                    const team1Color = actualWinnerTeam === 'team1' ? '#10b981' : '#ef4444';
                                    const team2Color = actualWinnerTeam === 'team2' ? '#10b981' : '#ef4444';
                                    
                                    return (
                                      <View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                          <Text style={{ color: team1Color, fontWeight: '400', fontSize: 12, flex: 1 }}>
                                            {team1Player1} / {team1Player2}
                                          </Text>
                                          <View style={{ flexDirection: 'row', gap: 8 }}>
                                            {sets.map((set, index) => (
                                              <Text key={index} style={{ color: (set.team1 === 6 || set.team1 === 7) && set.team1 > set.team2 ? '#10b981' : '#ffffff', fontWeight: (set.team1 === 6 || set.team1 === 7) && set.team1 > set.team2 ? '700' : '600', fontSize: 14, minWidth: 16, textAlign: 'right' }}>
                                              {set.team1}
                                            </Text>
                                            ))}
                                          </View>
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                          <Text style={{ color: team2Color, fontWeight: '400', fontSize: 12, flex: 1 }}>
                                            {team2Player1} / {team2Player2}
                                          </Text>
                                          <View style={{ flexDirection: 'row', gap: 8 }}>
                                            {sets.map((set, index) => (
                                              <Text key={index} style={{ color: (set.team2 === 6 || set.team2 === 7) && set.team2 > set.team1 ? '#10b981' : '#ffffff', fontWeight: (set.team2 === 6 || set.team2 === 7) && set.team2 > set.team1 ? '700' : '600', fontSize: 14, minWidth: 16, textAlign: 'right' }}>
                                                {set.team2}
                                              </Text>
                                            ))}
                                          </View>
                                        </View>
                                      </View>
                                    );
                                  })()}
                                  {/* Bouton pour modifier le résultat */}
                                  <Pressable
                                    onPress={() => {
                                      router.push({
                                        pathname: '/matches/record-result',
                                        params: { matchId: match.id },
                                      });
                                    }}
                                    style={{
                                      marginTop: 12,
                                      backgroundColor: '#9ca3af',
                                      paddingVertical: 8,
                                      paddingHorizontal: 12,
                                      borderRadius: 8,
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                  >
                                    <Ionicons name="create-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                                    <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 12 }}>
                                      Modifier le résultat
                                    </Text>
                                  </Pressable>
                                </View>
                              ) : (
                                // Bouton pour enregistrer le score
                                <Pressable
                                  onPress={() => {
                                    router.push({
                                      pathname: '/matches/record-result',
                                      params: { matchId: match.id },
                                    });
                                  }}
                                  style={{
                                    marginTop: 8,
                                    backgroundColor: '#1a4b97',
                                    paddingVertical: 8,
                                    paddingHorizontal: 12,
                                    borderRadius: 8,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <Ionicons name="trophy-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                                  <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 12 }}>
                                    Enregistrer le score
                                  </Text>
                                </Pressable>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    )}
                    <View style={{ height: bottomPad + 100 }} />
                  </>
                )}
              />
            )
          )}
                </>
      )}

      {/* Icône flottante pour créer un match géographique (à gauche) - MASQUÉE */}
      {false && (
      <Pressable
        onPress={openGeoModal}
        style={{
          position: 'absolute',
          bottom: (tabBarHeight || 0) + 20,
          left: 20,
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: COLORS.primary,
          alignItems: 'center',
          justifyContent: 'center',
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 4,
          zIndex: 1000,
        }}
      >
        <Ionicons name="location" size={32} color="#ffffff" />
      </Pressable>
      )}

      {/* 5 — Match éclair - Bouton flottant toujours visible sur tous les onglets */}
      <Step order={4} name="flash" text="Pressé ? Propose un match maintenant en 3 clics.">
        <View style={{ position: 'absolute', bottom: (tabBarHeight || 0) + 140, right: 13, width: 48, height: 48 }} />
      </Step>
      {/* Bouton flottant match éclair - toujours visible sur tous les onglets */}
      <Animated.View
        style={[
          styles.fabWrap,
          { bottom: (tabBarHeight || 0) + 140 },
          { transform: [{ scale: fabScale }] },
        ]}
      >
        <Pressable
          onPressIn={() => Animated.spring(fabScale, { toValue: 0.96, useNativeDriver: true }).start()}
          onPressOut={() => Animated.spring(fabScale, { toValue: 1, useNativeDriver: true }).start()}
          onPress={() => {
            Vibration.vibrate(10);
            openFlashMatchDateModal();
          }}
          style={styles.fabButton}
        >
          <Ionicons name="flash" size={22} color={THEME.ink} />
        </Pressable>
      </Animated.View>

      {/* Modale de choix date/heure/durée */}
      <Modal
        visible={flashDateModalOpen && !flashDatePickerModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setFlashDateModalOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(6, 26, 43, 0.85)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ 
            backgroundColor: THEME.card, 
            borderRadius: 32, 
            padding: 28, 
            width: '90%', 
            maxWidth: 400,
            borderWidth: 1,
            borderColor: THEME.cardBorder,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 20 },
            shadowOpacity: 0.4,
            shadowRadius: 30,
            elevation: 20,
          }}>
            <Pressable
              onPress={() => setFlashDateModalOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              style={{ 
                position: 'absolute', 
                top: 16, 
                right: 16, 
                padding: 8,
                borderRadius: 20,
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
              }}
            >
              <Ionicons name="close" size={22} color={THEME.text} />
            </Pressable>
            <View style={{ alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
              <Ionicons name="flash" size={32} color={THEME.accent} style={{ marginBottom: 8 }} />
              <Text style={{ fontSize: 26, fontWeight: '900', color: THEME.accent, textAlign: 'center' }}>
                Créer un match éclair
              </Text>
            </View>

            {/* Sélection de la date et heure (comme match géographique) */}
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: THEME.text, marginBottom: 12 }}>
                Date et heure
              </Text>
              <Pressable
                onPress={() => {
                  console.log('[FlashMatch] Opening date/time picker');
                  const now = new Date(flashStart);
                  setTempDate(now);
                  setTempTime({ hours: now.getHours(), minutes: now.getMinutes(), seconds: now.getSeconds() });
                  setFlashDateModalOpen(false); // Fermer temporairement le modal parent
                  setTimeout(() => {
                  setFlashDatePickerModalOpen(true);
                  }, 300);
                }}
                style={{
                  backgroundColor: flashStart ? THEME.accent : THEME.cardAlt,
                  borderRadius: 24,
                  padding: 18,
                  borderWidth: 1,
                  borderColor: flashStart ? THEME.accent : THEME.cardBorder,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  shadowColor: flashStart ? THEME.accent : 'transparent',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: flashStart ? 0.3 : 0,
                  shadowRadius: 8,
                  elevation: flashStart ? 8 : 0,
                }}
              >
                <View style={{ flex: 1 }}>
                  {flashStart ? (
                    <>
                      <Text style={{ fontSize: 16, color: THEME.ink, fontWeight: '800' }}>
                        {(() => {
                          const d = flashStart;
                          const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
                          const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
                          const dayName = days[d.getDay()];
                          const day = d.getDate();
                          const month = months[d.getMonth()];
                          const dayFormatted = day === 1 ? '1er' : String(day);
                          return `${dayName} ${dayFormatted} ${month}`;
                        })()}
                      </Text>
                      <Text style={{ fontSize: 16, color: THEME.ink, fontWeight: '800', marginTop: 4 }}>
                        {(() => {
                          const d = flashStart;
                          const startHours = String(d.getHours()).padStart(2, '0');
                          const startMinutes = String(d.getMinutes()).padStart(2, '0');
                          return `${startHours}:${startMinutes}`;
                        })()}
                      </Text>
                    </>
                  ) : (
                    <Text style={{ fontSize: 16, color: THEME.text, fontWeight: '500' }}>
                      Sélectionner une date et une heure
                    </Text>
                  )}
                </View>
              <Pressable
                onPress={() => {
                    console.log('[FlashMatch] Calendar icon pressed');
                    const now = new Date(flashStart);
                    setTempDate(now);
                    setTempTime({ hours: now.getHours(), minutes: now.getMinutes(), seconds: now.getSeconds() });
                    setFlashDateModalOpen(false); // Fermer temporairement le modal parent
                    setTimeout(() => {
                      setFlashDatePickerModalOpen(true);
                    }, 300);
                  }}
                  hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                style={{
                  padding: 12,
                    borderRadius: 20,
                    minWidth: 40,
                    minHeight: 40,
                  alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: flashStart ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    borderColor: flashStart ? 'rgba(0,0,0,0.1)' : THEME.cardBorder,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                  }}
                >
                  <Ionicons name="calendar-outline" size={22} color={flashStart ? THEME.ink : THEME.accent} />
                      </Pressable>
              </Pressable>
            </View>

            {/* Toggles pour la durée */}
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: THEME.text, marginBottom: 12 }}>
                Durée
              </Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Pressable
                  onPress={() => {
                    setFlashDurationMin(60);
                    const newEnd = new Date(flashStart);
                    newEnd.setMinutes(newEnd.getMinutes() + 60);
                    setFlashEnd(newEnd);
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: flashDurationMin === 60 ? THEME.accent : THEME.cardAlt,
                    borderRadius: 20,
                    padding: 18,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: flashDurationMin === 60 ? THEME.accent : THEME.cardBorder,
                  }}
                >
                  <Text style={{ fontSize: 18, fontWeight: '800', color: flashDurationMin === 60 ? THEME.ink : THEME.text }}>
                    1h
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setFlashDurationMin(90);
                    const newEnd = new Date(flashStart);
                    newEnd.setMinutes(newEnd.getMinutes() + 90);
                    setFlashEnd(newEnd);
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: flashDurationMin === 90 ? THEME.accent : THEME.cardAlt,
                    borderRadius: 20,
                    padding: 18,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: flashDurationMin === 90 ? THEME.accent : THEME.cardBorder,
                  }}
                >
                  <Text style={{ fontSize: 18, fontWeight: '800', color: flashDurationMin === 90 ? THEME.ink : THEME.text }}>
                    1h30
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Heure de fin estimée */}
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: THEME.text, marginBottom: 8 }}>
                Heure de fin estimée
              </Text>
              <View style={{
                backgroundColor: THEME.cardAlt,
                borderRadius: 20,
                padding: 16,
                borderWidth: 1,
                borderColor: THEME.cardBorder,
              }}>
                <Text style={{
                  fontSize: 18,
                  color: THEME.accent,
                  fontWeight: '800',
                  textAlign: 'center',
                }}>
                  {(() => {
                    try {
                      const end = new Date(flashStart.getTime() + (flashDurationMin || 0) * 60000);
                      return end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                    } catch {
                      return '';
                    }
                  })()}
                </Text>
              </View>
            </View>

            {/* Boutons */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={() => setFlashDateModalOpen(false)}
                style={{
                  flex: 1,
                  backgroundColor: THEME.cardAlt,
                  borderRadius: 24,
                  padding: 16,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: THEME.cardBorder,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '700', color: THEME.text }}>
                  Annuler
                </Text>
              </Pressable>
              <Pressable
                onPress={onValidateFlashDate}
                style={{
                  flex: 1,
                  backgroundColor: THEME.accent,
                  borderRadius: 24,
                  padding: 16,
                  alignItems: 'center',
                  shadowColor: THEME.accent,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 8,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '700', color: THEME.ink }}>
                  Valider
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modale de sélection date/heure (comme match géographique) */}
      <Modal
        visible={flashDatePickerModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setFlashDatePickerModalOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(6, 26, 43, 0.85)', justifyContent: 'flex-end' }}>
          <View style={{ 
            backgroundColor: THEME.card, 
            borderTopLeftRadius: 32, 
            borderTopRightRadius: 32, 
            padding: 24, 
            maxHeight: '80%',
            borderWidth: 1,
            borderColor: THEME.cardBorder,
            borderBottomWidth: 0,
          }}>
            <Text style={{ fontSize: 22, fontWeight: '900', color: THEME.accent, marginBottom: 24, textAlign: 'center' }}>
              Sélectionner la date et l'heure
            </Text>
            
            {/* Menu déroulant des dates */}
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, color: THEME.muted, marginBottom: 12, textAlign: 'center', fontWeight: '700' }}>Date</Text>
              <ScrollView style={{ height: 200, width: '100%' }} showsVerticalScrollIndicator={false}>
                {(() => {
                  const dates = [];
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  for (let i = 0; i < 60; i++) { // 60 jours à partir d'aujourd'hui
                    const date = new Date(today);
                    date.setDate(today.getDate() + i);
                    dates.push(date);
                  }
                  
                  const formatDate = (d) => {
                    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
                    const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
                    const dayName = days[d.getDay()];
                    const day = d.getDate();
                    const month = months[d.getMonth()];
                    const year = d.getFullYear();
                    const dayFormatted = day === 1 ? '1er' : String(day);
                    return `${dayName} ${dayFormatted} ${month} ${year}`;
                  };
                  
                  return dates.map((date, idx) => {
                    const dateStr = date.toDateString();
                    const tempStr = tempDate.toDateString();
                    const isSelected = dateStr === tempStr;
                    return (
                      <Pressable
                        key={idx}
                        onPress={() => {
                          setTempDate(new Date(date));
                        }}
                        style={{
                          paddingVertical: 14,
                          paddingHorizontal: 18,
                          backgroundColor: isSelected ? THEME.accent : 'rgba(21, 107, 201, 0.25)',
                          borderRadius: 20,
                          marginVertical: 4,
                          borderWidth: 1,
                          borderColor: isSelected ? THEME.accent : 'rgba(21, 107, 201, 0.4)',
                        }}
                      >
                        <Text style={{ fontSize: 16, fontWeight: isSelected ? '800' : '500', color: isSelected ? THEME.ink : THEME.text }}>
                          {formatDate(date)}
                        </Text>
                      </Pressable>
                    );
                  });
                })()}
                </ScrollView>
              </View>

            {/* Menu déroulant des heures (tranches de 15 min) */}
            <View style={{ marginTop: 24, marginBottom: 24 }}>
              <Text style={{ fontSize: 14, color: THEME.muted, marginBottom: 12, textAlign: 'center', fontWeight: '700' }}>Heure</Text>
              <ScrollView style={{ height: 200, width: '100%' }} showsVerticalScrollIndicator={false}>
                {(() => {
                  const timeSlots = [];
                  // Démarre à 08:00 jusqu'à 00:00 (23:45)
                  for (let hour = 8; hour < 24; hour++) {
                    for (let minute = 0; minute < 60; minute += 15) {
                      timeSlots.push({ hour, minute });
                    }
                  }
                  // Ajouter 00:00 à la fin
                  timeSlots.push({ hour: 0, minute: 0 });
                  
                  const formatTime = (h, m) => {
                    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                  };
                  
                  return timeSlots.map((slot, idx) => {
                    const isSelected = tempTime.hours === slot.hour && tempTime.minutes === slot.minute;
                    return (
                      <Pressable
                        key={idx}
                        onPress={() => {
                          setTempTime({ hours: slot.hour, minutes: slot.minute, seconds: 0 });
                        }}
                        style={{
                          paddingVertical: 14,
                          paddingHorizontal: 18,
                          backgroundColor: isSelected ? THEME.accent : 'rgba(21, 107, 201, 0.25)',
                          borderRadius: 20,
                          marginVertical: 4,
                          borderWidth: 1,
                          borderColor: isSelected ? THEME.accent : 'rgba(21, 107, 201, 0.4)',
                        }}
                      >
                        <Text style={{ fontSize: 16, fontWeight: isSelected ? '800' : '500', color: isSelected ? THEME.ink : THEME.text }}>
                          {formatTime(slot.hour, slot.minute)}
                        </Text>
                      </Pressable>
                    );
                  });
                })()}
                </ScrollView>
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={() => {
                  setFlashDatePickerModalOpen(false);
                  setTimeout(() => {
                    setFlashDateModalOpen(true);
                  }, 300);
                }}
                style={{ 
                  flex: 1, 
                  backgroundColor: THEME.cardAlt, 
                  borderRadius: 24, 
                  padding: 16, 
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: THEME.cardBorder,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '700', color: THEME.text }}>Annuler</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const newDate = new Date(tempDate);
                  newDate.setHours(tempTime.hours);
                  newDate.setMinutes(tempTime.minutes);
                  newDate.setSeconds(tempTime.seconds || 0);
                  setFlashStart(newDate);
                  setFlashDatePickerModalOpen(false);
                  // Rouvrir le modal flash match après validation
                  setTimeout(() => {
                    setFlashDateModalOpen(true);
                  }, 300);
                }}
                style={{ 
                  flex: 1, 
                  backgroundColor: THEME.accent, 
                  borderRadius: 24, 
                  padding: 16, 
                  alignItems: 'center',
                  shadowColor: THEME.accent,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 8,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '700', color: THEME.ink }}>Valider</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Annuler pour le picker - rouvre le modal flash */}
      {flashDatePickerModalOpen && (
              <Pressable
                onPress={() => {
            setFlashDatePickerModalOpen(false);
            setTimeout(() => {
              setFlashDateModalOpen(true);
            }, 300);
          }}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, top: 0, backgroundColor: 'transparent' }}
        />
      )}


      {/* Modale de sélection des joueurs */}
      <Modal
        visible={flashPickerOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setFlashPickerOpen(false);
          resetFlashFilters();
        }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(6, 12, 20, 0.55)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: 'rgba(11, 34, 64, 0.92)', borderRadius: 26, padding: 16, width: '90%', maxWidth: 400, maxHeight: '90%', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', shadowColor: '#0b2240', shadowOpacity: 0.22, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: '#e0ff00', letterSpacing: 0.2 }}>Sélectionner 3 joueurs</Text>
            <Pressable
                onPress={() => {
                  setFlashPickerOpen(false);
                  resetFlashFilters();
                }}
                style={{ padding: 8 }}
              >
                <Ionicons name="close" size={24} color="#ffffff" />
            </Pressable>
            </View>

            {flashLoading ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
              <ActivityIndicator size="large" color={COLORS.accent} />
                <Text style={{ marginTop: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '700' }}>Chargement des membres...</Text>
              </View>
            ) : (
              <>
                {/* Filtrer les membres en fonction de la recherche, du niveau et de la géolocalisation */}
                {(() => {
                  const filteredMembers = flashMembers.filter(member => {
                    // Filtre par recherche textuelle
                    if (flashQuery.trim()) {
                      const query = flashQuery.toLowerCase().trim();
                      const name = (member.name || '').toLowerCase();
                      const email = (member.email || '').toLowerCase();
                      const niveau = String(member.niveau || '').toLowerCase();
                      if (!name.includes(query) && !email.includes(query) && !niveau.includes(query)) {
                        return false;
                      }
                    }
                    
                    // Filtre par niveau
                    if (flashLevelFilter.length > 0) {
                      const memberLevel = Number(member.niveau);
                      if (!Number.isFinite(memberLevel)) return false;
                      
                      if (!flashLevelFilter.includes(memberLevel)) return false;
                    }
                    
                    // Filtre par disponibilité
                    if (flashAvailabilityFilter) {
                      const memberId = String(member.id);
                      if (!flashAvailableMemberIds.has(memberId)) {
                        return false;
                      }
                    }
                    
                    // Filtre géographique
                    if (flashGeoRefPoint && flashGeoRefPoint.lat != null && flashGeoRefPoint.lng != null && flashGeoRadiusKm != null) {
                      // Utiliser domicile, puis travail, comme position du joueur
                      let playerLat = null;
                      let playerLng = null;
                      if (member.address_home?.lat && member.address_home?.lng) {
                        playerLat = member.address_home.lat;
                        playerLng = member.address_home.lng;
                      } else if (member.address_work?.lat && member.address_work?.lng) {
                        playerLat = member.address_work.lat;
                        playerLng = member.address_work.lng;
                      }
                      
                      if (!playerLat || !playerLng) return false; // Pas de position = exclu
                      
                      // Calculer la distance
                      const distanceKm = haversineKm(flashGeoRefPoint, { lat: playerLat, lng: playerLng });
                      if (distanceKm > flashGeoRadiusKm) return false;
                    }
                    
                    return true;
                  });
                  
                  if (flashMembers.length === 0) {
                    return (
                      <View style={{ padding: 20 }}>
                        <Text style={{ color: 'rgba(255,255,255,0.75)', textAlign: 'center', fontWeight: '600' }}>
                          Aucun membre dans ce groupe.
                        </Text>
                      </View>
                    );
                  }
                  
                  if (filteredMembers.length === 0) {
                    return (
                      <>
                        <TextInput
                          placeholder="Rechercher un joueur (nom, email, niveau)..."
                          placeholderTextColor="#9ca3af"
                  value={flashQuery}
                  onChangeText={setFlashQuery}
                  style={{
                            backgroundColor: 'rgba(255,255,255,0.75)',
                            borderWidth: 1,
                            borderColor: 'rgba(15,23,42,0.12)',
                            borderRadius: 999,
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            color: '#111827',
                            marginBottom: 12,
                            fontSize: 14,
                            shadowColor: '#0b2240',
                            shadowOpacity: 0.08,
                            shadowRadius: 10,
                            shadowOffset: { width: 0, height: 3 },
                            elevation: 2,
                          }}
                          returnKeyType="search"
                          autoCapitalize="none"
                        />
                        
                        {/* Boutons de filtres */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 12, marginBottom: 12 }}>
                          <Text style={{ 
                            color: '#ffffff', 
                            fontWeight: '800', 
                            fontSize: 14 
                          }}>
                            Filtres {filteredMembers.length > 0 && `(${filteredMembers.length})`}
                          </Text>
                          
                          <Pressable
                            onPress={() => {
                              if (!flashLevelFilterVisible) {
                                setFlashGeoFilterVisible(false);
                              }
                              setFlashLevelFilterVisible(!flashLevelFilterVisible);
                            }}
                            style={{
                              padding: 10,
                              backgroundColor: flashLevelFilter.length > 0 ? 'rgba(255, 117, 29, 0.2)' : 'rgba(255,255,255,0.6)',
                              borderRadius: 999,
                              borderWidth: 1,
                              borderColor: 'rgba(255,255,255,0.65)',
                              shadowColor: '#0b2240',
                              shadowOpacity: 0.12,
                              shadowRadius: 8,
                              shadowOffset: { width: 0, height: 2 },
                              elevation: 3,
                            }}
                          >
                            <Image 
                              source={racketIcon}
                              style={{
                                width: 20,
                                height: 20,
                                tintColor: flashLevelFilter.length > 0 ? '#ff751d' : '#374151',
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.3,
                                shadowRadius: 3,
                                elevation: 4,
                              }}
                              resizeMode="contain"
                            />
                          </Pressable>
                          
                          <Pressable
                            onPress={() => {
                              setFlashAvailabilityFilter(!flashAvailabilityFilter);
                            }}
                            style={{
                              padding: 10,
                              backgroundColor: flashAvailabilityFilter ? 'rgba(255, 117, 29, 0.2)' : 'rgba(255,255,255,0.6)',
                              borderRadius: 999,
                              borderWidth: 1,
                              borderColor: 'rgba(255,255,255,0.65)',
                              shadowColor: '#0b2240',
                              shadowOpacity: 0.12,
                              shadowRadius: 8,
                              shadowOffset: { width: 0, height: 2 },
                              elevation: 3,
                            }}
                          >
                            <Ionicons 
                              name="calendar" 
                              size={20} 
                              color={flashAvailabilityFilter ? '#ff751d' : '#374151'}
                              style={{
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.3,
                                shadowRadius: 3,
                                elevation: 4,
                              }}
                            />
                          </Pressable>
                          
                          <Pressable
                            onPress={() => {
                              if (!flashGeoFilterVisible) {
                                setFlashLevelFilterVisible(false);
                              }
                              setFlashGeoFilterVisible(!flashGeoFilterVisible);
                            }}
                            style={{
                              padding: 10,
                              backgroundColor: (flashGeoRefPoint && flashGeoRadiusKm) ? 'rgba(255, 117, 29, 0.2)' : 'rgba(255,255,255,0.6)',
                              borderRadius: 999,
                              borderWidth: 1,
                              borderColor: 'rgba(255,255,255,0.65)',
                              shadowColor: '#0b2240',
                              shadowOpacity: 0.12,
                              shadowRadius: 8,
                              shadowOffset: { width: 0, height: 2 },
                              elevation: 3,
                            }}
                          >
                            <Ionicons 
                              name="location" 
                              size={20} 
                              color={(flashGeoRefPoint && flashGeoRadiusKm) ? '#ff751d' : '#374151'}
                              style={{
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.3,
                                shadowRadius: 3,
                                elevation: 4,
                              }}
                            />
                          </Pressable>
                        </View>
                        
                        {/* Message filtre disponibilité */}
                        {flashAvailabilityFilter && (
                          <Text style={{ fontSize: 12, fontWeight: '800', color: '#e0ff00', marginBottom: 8, textAlign: 'center' }}>
                            ✓ Uniquement les joueurs dispos
                          </Text>
                        )}
                        
                        {/* Zone de configuration du filtre par niveau (masquée par défaut) */}
                        {flashLevelFilterVisible && (
                          <View style={{ 
                            backgroundColor: 'rgba(255,255,255,0.7)',
                            borderRadius: 16, 
                            padding: 12,
                            borderWidth: 1,
                            borderColor: flashLevelFilter.length > 0 ? 'rgba(21, 128, 61, 0.7)' : 'rgba(15,23,42,0.12)',
                            marginBottom: 12,
                            shadowColor: '#0b2240',
                            shadowOpacity: 0.08,
                            shadowRadius: 10,
                            shadowOffset: { width: 0, height: 3 },
                            elevation: 2,
                          }}>
                            <Text style={{ fontSize: 14, fontWeight: '900', color: '#ffffff', marginBottom: 12 }}>
                              Sélectionnez les niveaux à afficher
                            </Text>
                            
                            <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 3.5 }}>
                              {LEVELS.map((lv) => {
                                const isSelected = Array.isArray(flashLevelFilter) && flashLevelFilter.includes(lv.v);
                                return (
                                  <Pressable
                                    key={lv.v}
                                    onPress={() => {
                                      setFlashLevelFilter((prev) => {
                                        const prevArray = Array.isArray(prev) ? prev : [];
                                        if (prevArray.includes(lv.v)) {
                                          return prevArray.filter((n) => n !== lv.v);
                                        }
                                        return [...prevArray, lv.v];
                                      });
                                    }}
                                    style={{
                                      paddingVertical: 3.3,
                                      paddingHorizontal: 8.8,
                                      borderRadius: 999,
                                      backgroundColor: isSelected ? lv.color : 'rgba(255,255,255,0.85)',
                                      borderWidth: isSelected ? 2 : 1,
                                      borderColor: isSelected ? lv.color : 'rgba(15,23,42,0.12)',
                                      shadowColor: '#0b2240',
                                      shadowOpacity: 0.1,
                                      shadowRadius: 6,
                                      shadowOffset: { width: 0, height: 2 },
                                      elevation: 2,
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                  >
                                    <Text style={{ 
                                      fontSize: 12, 
                                      fontWeight: isSelected ? '900' : '800', 
                                      color: '#111827' 
                                    }}>
                                      {lv.v}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                            
                            {flashLevelFilter.length > 0 && (
                              <Text style={{ fontSize: 12, fontWeight: '700', color: '#e0ff00', marginTop: 8 }}>
                                ✓ Filtre actif : {flashLevelFilter.length} niveau{flashLevelFilter.length > 1 ? 'x' : ''} sélectionné{flashLevelFilter.length > 1 ? 's' : ''}
                              </Text>
                            )}
                          </View>
                        )}
                        
                        {/* Zone de configuration du filtre géographique (masquée par défaut) */}
                        {flashGeoFilterVisible && (
                          <View style={{ 
                            backgroundColor: 'rgba(255,255,255,0.7)', 
                            borderRadius: 16, 
                            padding: 12,
                            borderWidth: 1,
                            borderColor: (flashGeoRefPoint && flashGeoRadiusKm) ? 'rgba(21, 128, 61, 0.7)' : 'rgba(15,23,42,0.12)',
                            marginBottom: 12,
                            shadowColor: '#0b2240',
                            shadowOpacity: 0.08,
                            shadowRadius: 10,
                            shadowOffset: { width: 0, height: 3 },
                            elevation: 2,
                          }}>
                            <Text style={{ fontSize: 14, fontWeight: '900', color: '#ffffff', marginBottom: 12 }}>
                              Filtrer par distance
                            </Text>
                            
                            {/* Sélection du type de position */}
                            <View style={{ marginBottom: 12 }}>
                              <Text style={{ fontSize: 13, fontWeight: '800', color: '#ffffff', marginBottom: 8 }}>
                                Position de référence
                              </Text>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                {[
                                  { key: 'current', label: '📍 Position actuelle' },
                                  { key: 'home', label: '🏠 Domicile' },
                                  { key: 'work', label: '💼 Travail' },
                                  { key: 'city', label: '🏙️ Ville' },
                                ].map(({ key, label }) => {
                                  const isSelected = flashGeoLocationType === key;
                                  return (
                                    <Pressable
                                      key={key}
                                      onPress={() => {
                                        if (isSelected) {
                                          setFlashGeoRefPoint(null);
                                          setFlashGeoCityQuery('');
                                          setFlashGeoCitySuggestions([]);
                                          setFlashGeoLocationType(null);
                                          setFlashGeoRadiusKm(null);
                                        } else {
                                          setFlashGeoLocationType(key);
                                          if (key === 'city') {
                                            setFlashGeoRefPoint(null);
                                            setFlashGeoCityQuery('');
                                          }
                                        }
                                      }}
                                      style={{
                                        paddingVertical: 8,
                                        paddingHorizontal: 12,
                                        borderRadius: 999,
                                        backgroundColor: (isSelected && flashGeoRefPoint) ? 'rgba(21, 128, 61, 0.9)' : 'rgba(255,255,255,0.85)',
                                        borderWidth: 1,
                                        borderColor: (isSelected && flashGeoRefPoint) ? 'rgba(21, 128, 61, 0.9)' : 'rgba(15,23,42,0.12)',
                                        shadowColor: '#0b2240',
                                        shadowOpacity: 0.1,
                                        shadowRadius: 6,
                                        shadowOffset: { width: 0, height: 2 },
                                        elevation: 2,
                                      }}
                                    >
                                      <Text style={{ 
                                        fontSize: 13, 
                                        fontWeight: (isSelected && flashGeoRefPoint) ? '800' : '700', 
                                        color: (isSelected && flashGeoRefPoint) ? '#ffffff' : '#111827' 
                                      }}>
                                        {label}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            </View>
                            
                            {/* Recherche de ville si type = 'city' */}
                            {flashGeoLocationType === 'city' && (
                              <View style={{ marginBottom: 12 }}>
                                <Text style={{ fontSize: 13, fontWeight: '800', color: '#ffffff', marginBottom: 8 }}>
                                  Rechercher une ville
                                </Text>
                                <TextInput
                                  placeholder="Tapez le nom d'une ville..."
                                  value={flashGeoCityQuery}
                                  onChangeText={(text) => {
                                    setFlashGeoCityQuery(text);
                                    searchFlashGeoCity(text);
                                  }}
                                  style={{
                                    backgroundColor: 'rgba(255,255,255,0.85)',
                                    borderRadius: 999,
                                    padding: 12,
                                    borderWidth: 1,
                                    borderColor: 'rgba(15,23,42,0.12)',
                                    fontSize: 14,
                                    shadowColor: '#0b2240',
                                    shadowOpacity: 0.08,
                                    shadowRadius: 10,
                                    shadowOffset: { width: 0, height: 3 },
                                    elevation: 2,
                                  }}
                                />
                                {flashGeoCitySuggestions.length > 0 && (
                                  <View style={{ marginTop: 8, backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(15,23,42,0.12)', maxHeight: 150, shadowColor: '#0b2240', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 }}>
                                    <ScrollView>
                                      {flashGeoCitySuggestions.map((suggestion, idx) => (
                                        <Pressable
                                          key={idx}
                                          onPress={() => {
                                            setFlashGeoRefPoint({ lat: suggestion.lat, lng: suggestion.lng, address: suggestion.name });
                                            setFlashGeoCityQuery(suggestion.name);
                                            setFlashGeoCitySuggestions([]);
                                          }}
                                          style={{
                                            padding: 12,
                                            borderBottomWidth: idx < flashGeoCitySuggestions.length - 1 ? 1 : 0,
                                            borderBottomColor: '#e5e7eb',
                                          }}
                                        >
                                          <Text style={{ fontSize: 14, color: '#111827' }}>{suggestion.name}</Text>
                                        </Pressable>
                                      ))}
                                    </ScrollView>
                                  </View>
                                )}
                              </View>
                            )}
                            
                            {/* Sélection du rayon */}
                            <View style={{ marginBottom: 12 }}>
                              <Text style={{ fontSize: 13, fontWeight: '800', color: '#ffffff', marginBottom: 8 }}>
                                Rayon : {flashGeoRadiusKm ? `${flashGeoRadiusKm} km` : 'non sélectionné'}
                              </Text>
                              <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 6 }}>
                                {[10, 20, 30, 40, 50].map((km) => {
                                  const isSelected = flashGeoRadiusKm === km;
                                  return (
                                    <Pressable
                                      key={km}
                                      onPress={() => {
                                        if (isSelected) {
                                          setFlashGeoRadiusKm(null);
                                        } else {
                                          setFlashGeoRadiusKm(km);
                                        }
                                      }}
                                      style={{
                                        flex: 1,
                                        paddingVertical: 6,
                                        paddingHorizontal: 8,
                                        borderRadius: 999,
                                        backgroundColor: isSelected ? 'rgba(21, 128, 61, 0.9)' : 'rgba(255,255,255,0.85)',
                                        borderWidth: 1,
                                        borderColor: isSelected ? 'rgba(21, 128, 61, 0.9)' : 'rgba(15,23,42,0.12)',
                                        shadowColor: '#0b2240',
                                        shadowOpacity: 0.08,
                                        shadowRadius: 8,
                                        shadowOffset: { width: 0, height: 2 },
                                        elevation: 2,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                    >
                                      <Text style={{ 
                                        fontSize: 12, 
                                        fontWeight: isSelected ? '800' : '700', 
                                        color: isSelected ? '#ffffff' : '#111827' 
                                      }}>
                                        {km} km
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            </View>
                            
                            {(flashGeoRefPoint && flashGeoRadiusKm) && (
                              <Text style={{ fontSize: 12, fontWeight: '700', color: '#e0ff00', marginTop: 8 }}>
                                ✓ Filtre actif : {flashGeoRadiusKm} km autour de {flashGeoRefPoint.address || 'la position sélectionnée'}
                              </Text>
                            )}
                          </View>
                        )}
                        
                        <View style={{ padding: 20 }}>
                        <Text style={{ color: 'rgba(255,255,255,0.75)', textAlign: 'center', fontWeight: '600' }}>
                            Aucun membre trouvé
                            {flashQuery.trim() && ` pour "${flashQuery}"`}
                            {flashLevelFilter.length > 0 && ` avec les niveaux ${flashLevelFilter.sort((a, b) => a - b).join(', ')}`}
                            {flashGeoRefPoint && flashGeoRadiusKm && ` dans un rayon de ${flashGeoRadiusKm} km autour de ${flashGeoRefPoint.address || 'la position sélectionnée'}`}
                          </Text>
                        </View>
                      </>
                    );
                  }
                  
                  return (
                    <>
                      <TextInput
                        placeholder="Rechercher un joueur (nom, email, niveau)..."
                        placeholderTextColor="#9ca3af"
                        value={flashQuery}
                        onChangeText={setFlashQuery}
                        style={{
                          backgroundColor: 'rgba(255,255,255,0.75)',
                          borderWidth: 1,
                          borderColor: 'rgba(15,23,42,0.12)',
                          borderRadius: 999,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          color: '#111827',
                          marginBottom: 12,
                          fontSize: 14,
                          shadowColor: '#0b2240',
                          shadowOpacity: 0.08,
                          shadowRadius: 10,
                          shadowOffset: { width: 0, height: 3 },
                          elevation: 2,
                        }}
                        returnKeyType="search"
                        autoCapitalize="none"
                      />
                      
                      {/* Boutons de filtres */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 12, marginBottom: 12 }}>
                      <Text style={{ 
                          color: '#ffffff', 
                          fontWeight: '800', 
                          fontSize: 14 
                        }}>
                          Filtres {filteredMembers.length > 0 && `(${filteredMembers.length})`}
                        </Text>
                        
                        <Pressable
                          onPress={() => {
                            if (!flashLevelFilterVisible) {
                              setFlashGeoFilterVisible(false);
                            }
                            setFlashLevelFilterVisible(!flashLevelFilterVisible);
                          }}
                          style={{
                            padding: 10,
                            backgroundColor: flashLevelFilter.length > 0 ? 'rgba(255, 117, 29, 0.2)' : 'rgba(255,255,255,0.6)',
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: 'rgba(255,255,255,0.65)',
                            shadowColor: '#0b2240',
                            shadowOpacity: 0.12,
                            shadowRadius: 8,
                            shadowOffset: { width: 0, height: 2 },
                            elevation: 3,
                          }}
                        >
                          <Image 
                            source={racketIcon}
                            style={{
                              width: 20,
                              height: 20,
                              tintColor: flashLevelFilter.length > 0 ? '#ff751d' : '#374151',
                              shadowColor: '#000',
                              shadowOffset: { width: 0, height: 2 },
                              shadowOpacity: 0.3,
                              shadowRadius: 3,
                              elevation: 4,
                            }}
                            resizeMode="contain"
                          />
                        </Pressable>
                        
                        <Pressable
                          onPress={() => {
                            setFlashAvailabilityFilter(!flashAvailabilityFilter);
                          }}
                          style={{
                            padding: 10,
                            backgroundColor: flashAvailabilityFilter ? 'rgba(255, 117, 29, 0.2)' : 'rgba(255,255,255,0.6)',
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: 'rgba(255,255,255,0.65)',
                            shadowColor: '#0b2240',
                            shadowOpacity: 0.12,
                            shadowRadius: 8,
                            shadowOffset: { width: 0, height: 2 },
                            elevation: 3,
                          }}
                        >
                          <Ionicons 
                            name="calendar" 
                            size={20} 
                            color={flashAvailabilityFilter ? '#ff751d' : '#374151'}
                            style={{
                              shadowColor: '#000',
                              shadowOffset: { width: 0, height: 2 },
                              shadowOpacity: 0.3,
                              shadowRadius: 3,
                              elevation: 4,
                            }}
                          />
                        </Pressable>
                        
                        <Pressable
                          onPress={() => {
                            if (!flashGeoFilterVisible) {
                              setFlashLevelFilterVisible(false);
                            }
                            setFlashGeoFilterVisible(!flashGeoFilterVisible);
                          }}
                          style={{
                            padding: 10,
                            backgroundColor: (flashGeoRefPoint && flashGeoRadiusKm) ? 'rgba(255, 117, 29, 0.2)' : 'rgba(255,255,255,0.6)',
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: 'rgba(255,255,255,0.65)',
                            shadowColor: '#0b2240',
                            shadowOpacity: 0.12,
                            shadowRadius: 8,
                            shadowOffset: { width: 0, height: 2 },
                            elevation: 3,
                          }}
                        >
                          <Ionicons 
                            name="location" 
                            size={20} 
                            color={(flashGeoRefPoint && flashGeoRadiusKm) ? '#ff751d' : '#374151'}
                            style={{
                              shadowColor: '#000',
                              shadowOffset: { width: 0, height: 2 },
                              shadowOpacity: 0.3,
                              shadowRadius: 3,
                              elevation: 4,
                            }}
                          />
                        </Pressable>
                      </View>
                      
                      {/* Message filtre disponibilité */}
                      {flashAvailabilityFilter && (
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#e0ff00', marginBottom: 8, textAlign: 'center' }}>
                          ✓ Uniquement les joueurs dispos
                        </Text>
                      )}
                      
                      {/* Zone de configuration du filtre par niveau (masquée par défaut) */}
                      {flashLevelFilterVisible && (
                        <View style={{ 
                          backgroundColor: 'rgba(255,255,255,0.7)',
                          borderRadius: 16, 
                          padding: 12,
                          borderWidth: 1,
                          borderColor: flashLevelFilter.length > 0 ? 'rgba(21, 128, 61, 0.7)' : 'rgba(15,23,42,0.12)',
                          marginBottom: 12,
                          shadowColor: '#0b2240',
                          shadowOpacity: 0.08,
                          shadowRadius: 10,
                          shadowOffset: { width: 0, height: 3 },
                          elevation: 2,
                        }}>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 12 }}>
                            Sélectionnez les niveaux à afficher
                          </Text>
                          
                          <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 3.5 }}>
                            {LEVELS.map((lv) => {
                              const isSelected = Array.isArray(flashLevelFilter) && flashLevelFilter.includes(lv.v);
                              return (
                              <Pressable
                                  key={lv.v}
                                  onPress={() => {
                                    setFlashLevelFilter((prev) => {
                                      const prevArray = Array.isArray(prev) ? prev : [];
                                      if (prevArray.includes(lv.v)) {
                                        return prevArray.filter((n) => n !== lv.v);
                                      }
                                      return [...prevArray, lv.v];
                                    });
                                  }}
                                  style={{
                                  paddingVertical: 3.3,
                                  paddingHorizontal: 8.8,
                                  borderRadius: 999,
                                  backgroundColor: isSelected ? lv.color : 'rgba(255,255,255,0.85)',
                                  borderWidth: isSelected ? 2 : 1,
                                  borderColor: isSelected ? lv.color : 'rgba(15,23,42,0.12)',
                                  shadowColor: '#0b2240',
                                  shadowOpacity: 0.1,
                                  shadowRadius: 6,
                                  shadowOffset: { width: 0, height: 2 },
                                  elevation: 2,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <Text style={{ 
                                    fontSize: 12, 
                                    fontWeight: isSelected ? '900' : '800', 
                                    color: '#111827' 
                                  }}>
                                    {lv.v}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                          
                          {flashLevelFilter.length > 0 && (
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#e0ff00', marginTop: 8 }}>
                              ✓ Filtre actif : {flashLevelFilter.length} niveau{flashLevelFilter.length > 1 ? 'x' : ''} sélectionné{flashLevelFilter.length > 1 ? 's' : ''}
                            </Text>
                          )}
                        </View>
                      )}
                      
                      {/* Zone de configuration du filtre géographique (masquée par défaut) */}
                      {flashGeoFilterVisible && (
                        <View style={{ 
                          backgroundColor: 'rgba(255,255,255,0.7)', 
                          borderRadius: 16, 
                          padding: 12,
                          borderWidth: 1,
                          borderColor: (flashGeoRefPoint && flashGeoRadiusKm) ? 'rgba(21, 128, 61, 0.7)' : 'rgba(15,23,42,0.12)',
                          marginBottom: 12,
                          shadowColor: '#0b2240',
                          shadowOpacity: 0.08,
                          shadowRadius: 10,
                          shadowOffset: { width: 0, height: 3 },
                          elevation: 2,
                        }}>
                          <Text style={{ fontSize: 14, fontWeight: '900', color: '#ffffff', marginBottom: 12 }}>
                            Filtrer par distance
                          </Text>
                          
                          {/* Sélection du type de position */}
                          <View style={{ marginBottom: 12 }}>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: '#ffffff', marginBottom: 8 }}>
                              Position de référence
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                              {[
                                { key: 'current', label: '📍 Position actuelle' },
                                { key: 'home', label: '🏠 Domicile' },
                                { key: 'work', label: '💼 Travail' },
                                { key: 'city', label: '🏙️ Ville' },
                              ].map(({ key, label }) => {
                                const isSelected = flashGeoLocationType === key;
                                return (
                                <Pressable
                                    key={key}
                                    onPress={() => {
                                      if (isSelected) {
                                        setFlashGeoRefPoint(null);
                                        setFlashGeoCityQuery('');
                                        setFlashGeoCitySuggestions([]);
                                        setFlashGeoLocationType(null);
                                        setFlashGeoRadiusKm(null);
                                      } else {
                                        setFlashGeoLocationType(key);
                                        if (key === 'city') {
                                          setFlashGeoRefPoint(null);
                                          setFlashGeoCityQuery('');
                                        }
                                      }
                                    }}
                                    style={{
                                      paddingVertical: 8,
                                      paddingHorizontal: 12,
                                    borderRadius: 999,
                                    backgroundColor: (isSelected && flashGeoRefPoint) ? 'rgba(21, 128, 61, 0.9)' : 'rgba(255,255,255,0.85)',
                                    borderWidth: 1,
                                    borderColor: (isSelected && flashGeoRefPoint) ? 'rgba(21, 128, 61, 0.9)' : 'rgba(15,23,42,0.12)',
                                    shadowColor: '#0b2240',
                                    shadowOpacity: 0.1,
                                    shadowRadius: 6,
                                    shadowOffset: { width: 0, height: 2 },
                                    elevation: 2,
                                    }}
                                  >
                                    <Text style={{ 
                                      fontSize: 13, 
                                      fontWeight: (isSelected && flashGeoRefPoint) ? '800' : '700', 
                                      color: (isSelected && flashGeoRefPoint) ? '#ffffff' : '#111827' 
                                    }}>
                                      {label}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>
                          
                          {/* Recherche de ville si type = 'city' */}
                          {flashGeoLocationType === 'city' && (
                            <View style={{ marginBottom: 12 }}>
                              <Text style={{ fontSize: 13, fontWeight: '800', color: '#ffffff', marginBottom: 8 }}>
                                Rechercher une ville
                              </Text>
                              <TextInput
                                placeholder="Tapez le nom d'une ville..."
                                value={flashGeoCityQuery}
                                onChangeText={(text) => {
                                  setFlashGeoCityQuery(text);
                                  searchFlashGeoCity(text);
                                }}
                                style={{
                                  backgroundColor: 'rgba(255,255,255,0.85)',
                                  borderRadius: 999,
                                  padding: 12,
                                  borderWidth: 1,
                                  borderColor: 'rgba(15,23,42,0.12)',
                                  fontSize: 14,
                                  shadowColor: '#0b2240',
                                  shadowOpacity: 0.08,
                                  shadowRadius: 10,
                                  shadowOffset: { width: 0, height: 3 },
                                  elevation: 2,
                                }}
                              />
                              {flashGeoCitySuggestions.length > 0 && (
                                <View style={{ marginTop: 8, backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(15,23,42,0.12)', maxHeight: 150, shadowColor: '#0b2240', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 }}>
                                  <ScrollView>
                                    {flashGeoCitySuggestions.map((suggestion, idx) => (
                                      <Pressable
                                        key={idx}
                                        onPress={() => {
                                          setFlashGeoRefPoint({ lat: suggestion.lat, lng: suggestion.lng, address: suggestion.name });
                                          setFlashGeoCityQuery(suggestion.name);
                                          setFlashGeoCitySuggestions([]);
                                        }}
                                        style={{
                                          padding: 12,
                                          borderBottomWidth: idx < flashGeoCitySuggestions.length - 1 ? 1 : 0,
                                          borderBottomColor: '#e5e7eb',
                                        }}
                                      >
                                        <Text style={{ fontSize: 14, color: '#111827' }}>{suggestion.name}</Text>
                                      </Pressable>
                                    ))}
                                  </ScrollView>
                                </View>
                              )}
                            </View>
                          )}
                          
                          {/* Sélection du rayon */}
                          <View style={{ marginBottom: 12 }}>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: '#ffffff', marginBottom: 8 }}>
                              Rayon : {flashGeoRadiusKm ? `${flashGeoRadiusKm} km` : 'non sélectionné'}
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 6 }}>
                              {[10, 20, 30, 40, 50].map((km) => {
                                const isSelected = flashGeoRadiusKm === km;
                                return (
                                  <Pressable
                                    key={km}
                                    onPress={() => {
                                      if (isSelected) {
                                        setFlashGeoRadiusKm(null);
                                      } else {
                                        setFlashGeoRadiusKm(km);
                                      }
                                    }}
                                    style={{
                                      flex: 1,
                                      paddingVertical: 6,
                                      paddingHorizontal: 8,
                                      borderRadius: 999,
                                      backgroundColor: isSelected ? 'rgba(21, 128, 61, 0.9)' : 'rgba(255,255,255,0.85)',
                                      borderWidth: 1,
                                      borderColor: isSelected ? 'rgba(21, 128, 61, 0.9)' : 'rgba(15,23,42,0.12)',
                                      shadowColor: '#0b2240',
                                      shadowOpacity: 0.08,
                                      shadowRadius: 8,
                                      shadowOffset: { width: 0, height: 2 },
                                      elevation: 2,
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                  >
                                    <Text style={{ 
                                      fontSize: 12, 
                                      fontWeight: isSelected ? '800' : '700', 
                                      color: isSelected ? '#ffffff' : '#111827' 
                                    }}>
                                      {km} km
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>
                          
                          {(flashGeoRefPoint && flashGeoRadiusKm) && (
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#e0ff00', marginTop: 8 }}>
                              ✓ Filtre actif : {flashGeoRadiusKm} km autour de {flashGeoRefPoint.address || 'la position sélectionnée'}
                            </Text>
                          )}
                        </View>
                      )}

                {/* Avatars sélectionnés (bandeau) */}
                {flashSelected.length > 0 && (
                        <View style={{ marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 8, paddingVertical: 6, shadowColor: '#0b2240', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 4 }}>
                            {filteredMembers
                        .filter(m => flashSelected.includes(String(m.id)))
                        .map((member) => (
                          <Pressable
                            key={String(member.id)}
                            onPress={() => setFlashSelected(prev => prev.filter(id => id !== String(member.id)))}
                            accessibilityRole="button"
                            accessibilityLabel={`Retirer ${member.name} de la sélection`}
                            style={{ marginRight: 12 }}
                          >
                            <View style={{ position: 'relative' }}>
                              <View
                                style={{
                                  width: 56,
                                  height: 56,
                                  borderRadius: 28,
                                  backgroundColor: '#9ca3af',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderWidth: 3,
                                  borderColor: '#22c55e', // anneau vert
                                }}
                              >
                                <Text style={{ color: '#001831', fontWeight: '900', fontSize: 18 }}>
                                  {(() => {
                                    const name = (member.name || 'Joueur').split('@')[0].trim();
                                    const parts = name.split(/\s+/).filter(Boolean);
                                    if (parts.length >= 2) {
                                      return ((parts[0][0] || 'J') + (parts[1][0] || 'U')).toUpperCase();
                                    }
                                    return name.substring(0, 2).toUpperCase();
                                  })()}
                                </Text>
                              </View>
                              {member.niveau != null && member.niveau !== '' && (
                                <View
                                  style={{
                                    position: 'absolute',
                                    right: -2,
                                    bottom: -2,
                                    width: 22,
                                    height: 22,
                                    borderRadius: 11,
                                    backgroundColor: colorForLevel(member.niveau),
                                    borderWidth: 0.5,
                                    borderColor: '#ffffff',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <Text style={{ color: '#000000', fontWeight: '900', fontSize: 11 }}>
                                    {String(member.niveau)}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </Pressable>
                        ))}
                    </ScrollView>
                  </View>
                )}

                {/* Liste des joueurs */}
                <ScrollView style={{ maxHeight: 320, marginBottom: 16, backgroundColor: THEME.cardAlt, borderRadius: 24, padding: 8, borderWidth: 1, borderColor: THEME.cardBorder }}>
                        {filteredMembers.map((member) => {
                      const isSelected = flashSelected.includes(String(member.id));
                      return (
                        <Pressable
                          key={String(member.id)}
                          onLongPress={() => {
                            console.log('[FlashMatch] Appui long sur membre:', member.id, member.name || member.display_name);
                            openProfileFromFlashModal(member);
                          }}
                          delayLongPress={400}
                          onPress={() => {
                            if (isSelected) {
                              setFlashSelected(flashSelected.filter(id => id !== String(member.id)));
                            } else {
                              if (flashSelected.length < 3) {
                                setFlashSelected([...flashSelected, String(member.id)]);
                              } else {
                                Alert.alert('Maximum atteint', 'Tu ne peux sélectionner que 3 joueurs.');
                              }
                            }
                          }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            padding: 12,
                            backgroundColor: isSelected ? THEME.accent : THEME.cardAlt,
                            borderRadius: 20,
                            marginBottom: 8,
                            borderWidth: 1,
                            borderColor: isSelected ? THEME.accent : THEME.cardBorder,
                            shadowColor: isSelected ? THEME.accent : 'transparent',
                            shadowOpacity: isSelected ? 0.25 : 0,
                            shadowRadius: 8,
                            shadowOffset: { width: 0, height: 4 },
                            elevation: isSelected ? 8 : 0,
                          }}
                        >
                          <View style={{ position: 'relative', marginRight: 12 }}>
                            <View style={{
                              width: 48,
                              height: 48,
                              borderRadius: 24,
                              backgroundColor: '#9ca3af',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                              <Text style={{ color: '#001831', fontWeight: '900', fontSize: 16 }}>
                                {(() => {
                                  const name = (member.name || 'Joueur').split('@')[0].trim();
                                  const parts = name.split(/\s+/).filter(Boolean);
                                  if (parts.length >= 2) {
                                    return ((parts[0][0] || 'J') + (parts[1][0] || 'U')).toUpperCase();
                                  }
                                  return name.substring(0, 2).toUpperCase();
                                })()}
                              </Text>
                            </View>
                            {member.niveau != null && member.niveau !== '' && (
                              <View
                                style={{
                                  position: 'absolute',
                                  right: -4,
                                  bottom: -4,
                                  width: 20,
                                  height: 20,
                                  borderRadius: 10,
                                  backgroundColor: colorForLevel(member.niveau),
                                  borderWidth: 0.5,
                                  borderColor: '#ffffff',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Text
                                  style={{
                                    color: '#000000',
                                    fontWeight: '900',
                                    fontSize: 10,
                                  }}
                                >
                                  {String(member.niveau)}
                                </Text>
                              </View>
                            )}
                          </View>
                          <Text style={{ fontSize: 16, fontWeight: isSelected ? '800' : '600', color: isSelected ? THEME.ink : THEME.text, flex: 1 }}>
                            {(member.name || 'Joueur inconnu').split('@')[0]}
                          </Text>
                          {isSelected && (
                            <Image source={racketIcon} style={{ width: 22, height: 22, tintColor: THEME.ink }} />
                          )}
                        </Pressable>
                      );
                      })}
                  </ScrollView>
                    </>
                  );
                })()}

                {/* Compteur de sélection */}
                <Text style={{ fontSize: 14, color: '#e0ff00', marginBottom: 16, textAlign: 'center', fontWeight: '900', letterSpacing: 0.2 }}>
                  {flashSelected.length}/3 joueurs sélectionnés
                </Text>

                {/* Boutons */}
                <View style={{ flexDirection: 'column', gap: 12 }}>
                  {/* Bouton sans confirmation */}
                  <Pressable
                    onPress={() => onCreateFlashMatch(false)}
                    disabled={flashSelected.length !== 3}
                    style={{
                      backgroundColor: flashSelected.length === 3 ? THEME.accent : THEME.cardAlt,
                      borderRadius: 24,
                      borderWidth: 1,
                      borderColor: flashSelected.length === 3 ? THEME.accent : THEME.cardBorder,
                      padding: 16,
                      alignItems: 'center',
                      shadowColor: flashSelected.length === 3 ? THEME.accent : 'transparent',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: flashSelected.length === 3 ? 0.3 : 0,
                      shadowRadius: 8,
                      elevation: flashSelected.length === 3 ? 8 : 0,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Ionicons name="flash" size={18} color={flashSelected.length === 3 ? THEME.ink : THEME.text} style={{ marginRight: 6 }} />
                      <Text style={{ fontSize: 16, fontWeight: '800', color: flashSelected.length === 3 ? THEME.ink : THEME.text }}>
                        Créer un match
                      </Text>
                    </View>
                  </Pressable>
                  
                  <Pressable
                    onPress={() => {
                      // Retour à l'écran de choix date/heure sans perdre la sélection
                      setFlashPickerOpen(false);
                      setFlashDateModalOpen(true);
                    }}
                    style={{
                      backgroundColor: THEME.cardAlt,
                      borderRadius: 24,
                      borderWidth: 1,
                      borderColor: THEME.cardBorder,
                      padding: 16,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '700', color: THEME.text }}>
                      Retour
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Modale de profil depuis la liste flash match */}
      <Modal 
        visible={flashProfileModalVisible} 
        transparent={true} 
        animationType="slide"
        onRequestClose={() => {
          setFlashProfileModalVisible(false);
          // Rouvrir la modale flash match après fermeture du profil
          setTimeout(() => {
            setFlashPickerOpen(true);
          }, 100);
        }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 16, padding: 20, width: '90%', maxWidth: 400, maxHeight: '80%' }}>
            {selectedFlashProfile && (
              <>
                {/* Bouton retour */}
                <Pressable 
                  onPress={() => {
                    setFlashProfileModalVisible(false);
                    // Rouvrir la modale flash match après fermeture du profil
                    setTimeout(() => {
                      setFlashPickerOpen(true);
                    }, 100);
                  }} 
                  style={{ marginBottom: 16, paddingVertical: 8, paddingHorizontal: 12, alignSelf: 'flex-start', borderRadius: 8, backgroundColor: '#f3f4f6' }}
                >
                  <Text style={{ color: '#1a4b97', fontWeight: '700' }}>← Retour</Text>
                </Pressable>

                {/* Avatar + Nom */}
                <View style={{ alignItems: 'center', gap: 8, marginBottom: 20 }}>
                  {selectedFlashProfile.avatar_url ? (
                    <Image 
                      source={{ uri: selectedFlashProfile.avatar_url }} 
                      style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#f3f4f6' }}
                    />
                  ) : (
                    <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#eaf2ff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#1a4b97' }}>
                      <Text style={{ fontSize: 32, fontWeight: '800', color: '#1a4b97' }}>
                        {(selectedFlashProfile.display_name || selectedFlashProfile.name || selectedFlashProfile.email || 'J').substring(0, 2).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={{ fontSize: 20, fontWeight: '800', color: '#1a4b97', textAlign: 'center' }}>
                    {selectedFlashProfile.display_name || selectedFlashProfile.name || selectedFlashProfile.email || 'Joueur'}
                  </Text>
                  <Pressable onPress={() => Linking.openURL(`mailto:${selectedFlashProfile.email}`)}>
                    <Text style={{ fontSize: 13, color: '#3b82f6', textAlign: 'center', textDecorationLine: 'underline' }}>
                      {selectedFlashProfile.email}
                    </Text>
                  </Pressable>
                </View>
                
                {/* Résumé visuel */}
                <ScrollView showsVerticalScrollIndicator={true}>
                  <View style={{ backgroundColor: 'white', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, gap: 12 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827' }}>Résumé</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
                      {selectedFlashProfile.niveau && (
                        <View style={{ width: '47%', borderWidth: 1, borderColor: '#eef2f7', borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, backgroundColor: '#fafafa' }}>
                          <Text style={{ fontSize: 28 }}>🔥</Text>
                          <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a4b97' }}>{selectedFlashProfile.niveau}</Text>
                          <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Niveau</Text>
                        </View>
                      )}
                      {selectedFlashProfile.main && (
                        <View style={{ width: '47%', borderWidth: 1, borderColor: '#eef2f7', borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, backgroundColor: '#fafafa' }}>
                          <Text style={{ fontSize: 28 }}>🖐️</Text>
                          <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a4b97' }}>{selectedFlashProfile.main}</Text>
                          <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Main</Text>
                        </View>
                      )}
                      {selectedFlashProfile.cote && (
                        <View style={{ width: '47%', borderWidth: 1, borderColor: '#eef2f7', borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, backgroundColor: '#fafafa' }}>
                          <Text style={{ fontSize: 28 }}>🎯</Text>
                          <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a4b97' }}>{selectedFlashProfile.cote}</Text>
                          <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Côté</Text>
                        </View>
                      )}
                      {selectedFlashProfile.club && (
                        <View style={{ width: '47%', borderWidth: 1, borderColor: '#eef2f7', borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, backgroundColor: '#fafafa' }}>
                          <Text style={{ fontSize: 28 }}>🏟️</Text>
                          <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a4b97' }}>{selectedFlashProfile.club}</Text>
                          <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Club</Text>
                        </View>
                      )}
                      {selectedFlashProfile.rayon_km != null && (
                        <View style={{ width: '47%', borderWidth: 1, borderColor: '#eef2f7', borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, backgroundColor: '#fafafa' }}>
                          <Text style={{ fontSize: 28 }}>📍</Text>
                          <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a4b97' }}>
                            {selectedFlashProfile.rayon_km === 99 ? '+30 km' : `${selectedFlashProfile.rayon_km} km`}
                          </Text>
                          <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Rayon</Text>
                        </View>
                      )}
                      {selectedFlashProfile.phone && (
                        <Pressable 
                          onPress={() => Linking.openURL(`tel:${selectedFlashProfile.phone}`)}
                          style={{ width: '47%', borderWidth: 1, borderColor: '#eef2f7', borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, backgroundColor: '#fafafa' }}
                        >
                          <Text style={{ fontSize: 28 }}>📞</Text>
                          <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a4b97' }}>{selectedFlashProfile.phone}</Text>
                          <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Téléphone</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal de sélection de groupe */}
      <Modal
        visible={groupSelectorOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setGroupSelectorOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <View style={{ width: '90%', maxWidth: 400, backgroundColor: '#ffffff', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#e5e7eb', maxHeight: '70%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontWeight: '900', fontSize: 18, color: '#0b2240' }}>Sélectionner un groupe</Text>
              <Pressable
                onPress={() => setGroupSelectorOpen(false)}
                style={{ padding: 8 }}
              >
                <Ionicons name="close" size={24} color="#111827" />
              </Pressable>
            </View>

            {myGroups.length === 0 ? (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <Text style={{ color: '#6b7280', fontSize: 14, textAlign: 'center', marginBottom: 12 }}>
                  Aucun groupe disponible
                </Text>
                <Pressable
                  onPress={() => {
                    setGroupSelectorOpen(false);
                    router.push('/(tabs)/groupes');
                  }}
                  style={{
                    backgroundColor: COLORS.primary,
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 14 }}>
                    Aller aux groupes
                  </Text>
                </Pressable>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 400 }}>
                {myGroups.map((group) => (
                  <Pressable
                    key={group.id}
                    onPress={() => onSelectGroup(group)}
                    style={({ pressed }) => [
                      {
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: 12,
                        borderRadius: 8,
                        marginBottom: 8,
                        backgroundColor: activeGroup?.id === group.id ? COLORS.primary : '#f9fafb',
                        borderWidth: activeGroup?.id === group.id ? 2 : 1,
                        borderColor: activeGroup?.id === group.id ? COLORS.primary : '#e5e7eb',
                      },
                      Platform.OS === 'web' ? { cursor: 'pointer' } : null,
                      pressed ? { opacity: 0.8 } : null,
                    ]}
                  >
                    {group.avatar_url ? (
                      <Image
                        source={{ uri: group.avatar_url }}
                        style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12 }}
                      />
                    ) : (
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          backgroundColor: COLORS.primary,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 12,
                        }}
                      >
                        <Text style={{ color: '#ffffff', fontWeight: '900', fontSize: 16 }}>
                          {group.name?.substring(0, 2).toUpperCase() || 'GP'}
                        </Text>
                      </View>
                    )}
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 16,
                        fontWeight: activeGroup?.id === group.id ? '800' : '600',
                        color: activeGroup?.id === group.id ? '#ffffff' : '#111827',
                      }}
                    >
                      {group.name}
                    </Text>
                    {activeGroup?.id === group.id && (
                      <Ionicons name="checkmark-circle" size={24} color="#ffffff" />
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal Match Géographique */}
      <Modal
        visible={geoModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setGeoModalOpen(false);
          setSelectedClub(null);
          setClubs([]);
        }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <View style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: 24, width: '90%', maxWidth: 500, maxHeight: '90%' }}>
            <Pressable
              onPress={() => {
                setGeoModalOpen(false);
                setSelectedClub(null);
                setClubs([]);
              }}
              style={{ position: 'absolute', top: 10, right: 10, padding: 6, zIndex: 10 }}
            >
              <Ionicons name="close" size={24} color="#111827" />
            </Pressable>
            
            <Text style={{ fontSize: 24, fontWeight: '900', color: '#111827', marginBottom: 20 }}>
              Match géographique 🗺️
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: '80%' }}>
              {/* 1. Sélection lieu de référence */}
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 8 }}>
                  Lieu de référence
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {['current', 'home', 'work', 'city'].map((type) => {
                    const labels = { current: '📍 Position actuelle', home: '🏠 Domicile', work: '💼 Travail', city: '🏙️ Ville' };
                    const isSelected = locationType === type;
                    return (
                      <Pressable
                        key={type}
                        onPress={() => {
                          setLocationType(type);
                          if (type === 'city') {
                            setRefPoint(null);
                            setCityQuery('');
                          }
                          // Pour current/home/work, le point sera calculé quand on ouvrira le modal ou qu'on cherchera les clubs
                        }}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 8,
                          backgroundColor: isSelected ? COLORS.primary : '#f3f4f6',
                          borderWidth: 1,
                          borderColor: isSelected ? COLORS.primary : '#d1d5db',
                        }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: isSelected ? '700' : '400', color: isSelected ? '#ffffff' : '#111827' }}>
                          {labels[type]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {locationType === 'city' && (
                  <View style={{ marginTop: 12 }}>
                    <TextInput
                      value={cityQuery}
                      onChangeText={(text) => {
                        setCityQuery(text);
                        searchCity(text);
                      }}
                      placeholder="Rechercher une ville..."
                      style={{
                        backgroundColor: '#f3f4f6',
                        borderRadius: 8,
                        padding: 12,
                        borderWidth: 1,
                        borderColor: '#d1d5db',
                        marginBottom: 8,
                      }}
                    />
                    {citySuggestions.length > 0 && (
                      <ScrollView style={{ maxHeight: 150 }}>
                        {citySuggestions.map((sug, idx) => (
                          <Pressable
                            key={idx}
                            onPress={() => {
                              setRefPoint({ lat: sug.lat, lng: sug.lng, address: sug.name });
                              setCityQuery(sug.name);
                              setCitySuggestions([]);
                            }}
                            style={{
                              padding: 12,
                              borderBottomWidth: 1,
                              borderBottomColor: '#e5e7eb',
                            }}
                          >
                            <Text style={{ fontSize: 14, color: '#111827' }}>{sug.name}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                )}
                {refPoint && (
                  <Text style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
                    {refPoint.address || `${refPoint.lat.toFixed(4)}, ${refPoint.lng.toFixed(4)}`}
                  </Text>
                )}
              </View>

              {/* 2. Rayon */}
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 8 }}>
                  Rayon de recherche
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {[10, 20, 30, 50, 100].map((km) => (
                    <Pressable
                      key={km}
                      onPress={() => setRadiusKm(km)}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        backgroundColor: radiusKm === km ? COLORS.accent : '#f3f4f6',
                        borderWidth: 1,
                        borderColor: radiusKm === km ? COLORS.accent : '#d1d5db',
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: radiusKm === km ? '700' : '400', color: radiusKm === km ? '#ffffff' : '#111827' }}>
                        {km} km
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* 3. Niveaux (multi-sélection) */}
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 8 }}>
                  Niveaux cibles {levelRange.length > 0 && `(${levelRange.length})`}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {['1/2', '3/4', '5/6', '7/8'].map((range) => {
                    const isSelected = Array.isArray(levelRange) && levelRange.includes(range);
                    return (
                      <Pressable
                        key={range}
                        onPress={() => {
                          setLevelRange((prev) => {
                            const prevArray = Array.isArray(prev) ? prev : [prev];
                            if (prevArray.includes(range)) {
                              // Désélectionner (mais garder au moins un niveau)
                              if (prevArray.length > 1) {
                                return prevArray.filter(r => r !== range);
                              }
                              return prevArray; // Garder au moins un niveau
                            } else {
                              // Sélectionner
                              return [...prevArray, range];
                            }
                          });
                        }}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 8,
                          backgroundColor: isSelected ? COLORS.accent : '#f3f4f6',
                          borderWidth: 1,
                          borderColor: isSelected ? COLORS.accent : '#d1d5db',
                        }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: isSelected ? '700' : '400', color: isSelected ? '#ffffff' : '#111827' }}>
                          {range}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* 4. Date/Heure/Durée */}
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12 }}>
                  Créneau horaire
                </Text>
                
                {/* Durée */}
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                  <Pressable
                    onPress={() => {
                      setGeoDurationMin(60);
                      if (geoStart) {
                        const newEnd = new Date(geoStart);
                        newEnd.setMinutes(newEnd.getMinutes() + 60);
                        setGeoEnd(newEnd);
                      }
                    }}
                    style={{
                      flex: 1,
                      backgroundColor: geoDurationMin === 60 ? COLORS.accent : '#e5e7eb',
                      borderRadius: 8,
                      padding: 16,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 18, fontWeight: '800', color: geoDurationMin === 60 ? '#ffffff' : '#111827' }}>
                      1h
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setGeoDurationMin(90);
                      if (geoStart) {
                        const newEnd = new Date(geoStart);
                        newEnd.setMinutes(newEnd.getMinutes() + 90);
                        setGeoEnd(newEnd);
                      }
                    }}
                    style={{
                      flex: 1,
                      backgroundColor: geoDurationMin === 90 ? COLORS.accent : '#e5e7eb',
                      borderRadius: 8,
                      padding: 16,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 18, fontWeight: '800', color: geoDurationMin === 90 ? '#ffffff' : '#111827' }}>
                      1h30
                    </Text>
                  </Pressable>
                </View>
                
                {/* Date/Heure combiné */}
                <Pressable
                  onPress={() => {
                    console.log('[GeoMatch] Opening date/time picker');
                    const now = new Date();
                    setGeoTempDate(now);
                    setGeoTempTime({ hours: now.getHours(), minutes: now.getMinutes(), seconds: now.getSeconds() });
                    setGeoModalOpen(false); // Fermer temporairement le modal parent
                    setTimeout(() => {
                      setGeoDatePickerModalOpen(true);
                    }, 300);
                  }}
                  style={{
                    backgroundColor: geoStart ? '#ff6b00' : '#f9fafb',
                    borderRadius: 8,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: geoStart ? '#ff6b00' : '#e5e7eb',
                    marginBottom: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flex: 1 }}>
                    {geoStart ? (
                      <>
                        <Text style={{ fontSize: 16, color: '#ffffff', fontWeight: '800' }}>
                          {(() => {
                            const d = geoStart;
                            const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
                            const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
                            const dayName = days[d.getDay()];
                            const day = d.getDate();
                            const month = months[d.getMonth()];
                            const dayFormatted = day === 1 ? '1er' : String(day);
                            return `${dayName} ${dayFormatted} ${month}`;
                          })()}
                        </Text>
                        <Text style={{ fontSize: 16, color: '#ffffff', fontWeight: '800', marginTop: 4 }}>
                          {(() => {
                            const d = geoStart;
                            const startHours = String(d.getHours()).padStart(2, '0');
                            const startMinutes = String(d.getMinutes()).padStart(2, '0');
                            
                            // Calculer l'heure de fin estimée
                            const endDate = new Date(d);
                            endDate.setMinutes(endDate.getMinutes() + geoDurationMin);
                            const endHours = String(endDate.getHours()).padStart(2, '0');
                            const endMinutes = String(endDate.getMinutes()).padStart(2, '0');
                            
                            return `de ${startHours}:${startMinutes} à ${endHours}:${endMinutes}`;
                          })()}
                        </Text>
                      </>
                    ) : (
                      <Text style={{ fontSize: 16, color: '#111827', fontWeight: '400' }}>
                        Sélectionner une date et une heure
                      </Text>
                    )}
                  </View>
                  <Pressable
                    onPress={() => {
                      console.log('[GeoMatch] Calendar icon pressed');
                      const now = new Date();
                      setGeoTempDate(now);
                      setGeoTempTime({ hours: now.getHours(), minutes: now.getMinutes(), seconds: now.getSeconds() });
                      setGeoModalOpen(false); // Fermer temporairement le modal parent
                      setTimeout(() => {
                        setGeoDatePickerModalOpen(true);
                      }, 300);
                    }}
                    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                    style={{
                      padding: 10,
                      borderRadius: 4,
                      minWidth: 36,
                      minHeight: 36,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(0,0,0,0.05)',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                    }}
                  >
                    <Ionicons name="calendar-outline" size={20} color={geoStart ? "#ffffff" : "#6b7280"} />
                  </Pressable>
                </Pressable>
              </View>

              {/* 5. Joueurs disponibles */}
              {geoStart && geoEnd && refPoint && (
                <View style={{ marginBottom: 20 }}>
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 8 }}>
                      Joueurs disponibles ({availablePlayers.length})
                    </Text>
                    {(() => {
                      // Calculer le score de niveau global
                      const myLevel = myProfile?.niveau;
                      if (!myLevel || availablePlayers.length === 0) return null;
                      
                      // Niveaux de tous les joueurs (moi + les autres)
                      const allLevels = [
                        myLevel,
                        ...availablePlayers.map(p => p.niveau).filter(l => l != null && l !== '')
                      ].filter(l => Number.isFinite(Number(l))).map(l => Number(l));
                      
                      if (allLevels.length < 2) return null;
                      
                      // Calculer la compatibilité moyenne entre toutes les paires de joueurs
                      let totalCompatibility = 0;
                      let pairCount = 0;
                      
                      for (let i = 0; i < allLevels.length; i++) {
                        for (let j = i + 1; j < allLevels.length; j++) {
                          const compat = levelCompatibility(allLevels[i], allLevels[j]);
                          totalCompatibility += compat;
                          pairCount++;
                        }
                      }
                      
                      const globalScore = pairCount > 0 ? Math.round(totalCompatibility / pairCount) : 0;
                      
                      return (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 12, color: '#6b7280' }}>
                            Score global:
                          </Text>
                          <View
                            style={{
                              backgroundColor: globalScore >= 80 ? '#10b981' : globalScore >= 40 ? '#f59e0b' : '#ef4444',
                              paddingVertical: 4,
                              paddingHorizontal: 8,
                              borderRadius: 6,
                            }}
                          >
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#ffffff' }}>
                              {globalScore}%
                            </Text>
                          </View>
                        </View>
                      );
                    })()}
                  </View>
                  
                  {availablePlayersLoading ? (
                    <View style={{ alignItems: 'center', padding: 20 }}>
                      <ActivityIndicator color={COLORS.primary} />
                      <Text style={{ marginTop: 8, fontSize: 14, color: '#6b7280' }}>
                        Chargement des joueurs...
                      </Text>
                    </View>
                  ) : availablePlayers.length === 0 ? (
                    <View style={{ padding: 16, backgroundColor: '#f9fafb', borderRadius: 8, marginBottom: 12 }}>
                      <Text style={{ fontSize: 14, color: '#6b7280', textAlign: 'center' }}>
                        Aucun joueur disponible dans cette zone et sur ce créneau
                      </Text>
                    </View>
                  ) : (
                    <ScrollView style={{ maxHeight: 250, marginBottom: 12 }}>
                      {availablePlayers.map((player) => {
                        const distance = player.distanceKm != null && player.distanceKm !== Infinity 
                          ? `${Math.round(player.distanceKm * 10) / 10} km` 
                          : 'Distance inconnue';
                        
                        const isSelected = selectedGeoPlayers.includes(String(player.id));
                        const canSelect = selectedGeoPlayers.length < 3 || isSelected; // Limite à 3 joueurs max
                        
                        const togglePlayer = () => {
                          setSelectedGeoPlayers(prev => {
                            const playerId = String(player.id);
                            if (prev.includes(playerId)) {
                              // Désélectionner
                              return prev.filter(id => id !== playerId);
                            } else {
                              // Empêcher la sélection si on a déjà 3 joueurs
                              if (prev.length >= 3) {
                                return prev;
                              }
                              return [...prev, playerId];
                            }
                          });
                        };
                        
                        return (
                          <Pressable
                            key={player.id}
                            onPress={togglePlayer}
                            disabled={!canSelect && !isSelected} // Désactiver si on ne peut pas sélectionner
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              padding: 12,
                              backgroundColor: isSelected ? COLORS.primary : '#f9fafb',
                              borderRadius: 8,
                              marginBottom: 8,
                              borderWidth: isSelected ? 2 : 1,
                              borderColor: isSelected ? COLORS.primary : '#e5e7eb',
                              opacity: (!canSelect && !isSelected) ? 0.5 : 1, // Rendre grisé si désactivé
                            }}
                          >
                            <View style={{ position: 'relative', marginRight: 12 }}>
                              <View
                                style={{
                                  width: 48,
                                  height: 48,
                                  borderRadius: 24,
                                  backgroundColor: '#9ca3af',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Text style={{ color: '#001831', fontWeight: '900', fontSize: 16 }}>
                                  {(() => {
                                    const name = formatPlayerName(player.display_name || player.email || 'Joueur').trim();
                                    const parts = name.split(/\s+/).filter(Boolean);
                                    if (parts.length >= 2) {
                                      return ((parts[0][0] || 'J') + (parts[1][0] || 'U')).toUpperCase();
                                    }
                                    return name.substring(0, 2).toUpperCase();
                                  })()}
                                </Text>
                              </View>
                              {player.niveau != null && player.niveau !== '' && (
                                <View
                                  style={{
                                    position: 'absolute',
                                    right: -4,
                                    bottom: -4,
                                    width: 20,
                                    height: 20,
                                    borderRadius: 10,
                                    backgroundColor: colorForLevel(player.niveau),
                                    borderWidth: 2,
                                    borderColor: '#ffffff',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <Text style={{ color: '#000000', fontWeight: '900', fontSize: 10 }}>
                                    {String(player.niveau)}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 14, fontWeight: '600', color: isSelected ? '#ffffff' : '#111827', marginBottom: 2 }}>
                                {player.display_name || player.email || 'Joueur inconnu'}
                              </Text>
                              <Text style={{ fontSize: 12, color: isSelected ? '#ffffff' : '#6b7280' }}>
                                📍 {distance}
                              </Text>
                            </View>
                            {isSelected && (
                              <View style={{ marginLeft: 8 }}>
                                <Ionicons name="checkmark-circle" size={24} color="#ffffff" />
                          </View>
                            )}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  )}
                </View>
              )}

              {/* 6. Recherche clubs */}
              {refPoint && (
                <View style={{ marginBottom: 20 }}>
                  <Pressable
                    onPress={searchClubs}
                    disabled={clubsLoading}
                    style={{
                      backgroundColor: clubsLoading ? '#d1d5db' : COLORS.primary,
                      borderRadius: 8,
                      padding: 16,
                      alignItems: 'center',
                      marginBottom: 16,
                    }}
                  >
                    {clubsLoading ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={{ fontSize: 16, fontWeight: '700', color: '#ffffff' }}>
                        Rechercher les clubs
                      </Text>
                    )}
                  </Pressable>

                  {clubs.length > 0 && (
                    <View style={{ marginBottom: 12 }}>
                        <ScrollView style={{ maxHeight: 300, marginBottom: 16 }}>
                          {clubs.map((club) => {
                            const isSelected = selectedClub?.id === club.id;
                            return (
                              <Pressable
                                key={club.id}
                                onPress={() => setSelectedClub(club)}
                                style={{
                                  padding: 12,
                                  borderRadius: 8,
                                  backgroundColor: isSelected ? COLORS.primary : '#f9fafb',
                                  borderWidth: isSelected ? 2 : 1,
                                  borderColor: isSelected ? COLORS.primary : '#e5e7eb',
                                  marginBottom: 8,
                                }}
                              >
                                <Text style={{ fontSize: 16, fontWeight: isSelected ? '800' : '600', color: isSelected ? '#ffffff' : '#111827', marginBottom: 4 }}>
                                  {club.name}
                                </Text>
                                {club.address && (
                                  <Text style={{ fontSize: 12, color: isSelected ? '#ffffff' : '#6b7280', marginBottom: 4 }}>
                                    {club.address}
                                  </Text>
                                )}
                                <Text style={{ fontSize: 12, color: isSelected ? '#ffffff' : '#6b7280' }}>
                                  📍 {Math.round(club.distanceKm * 10) / 10} km
                                </Text>
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                    </View>
                  )}
                </View>
              )}

              {/* Boutons */}
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Pressable
                  onPress={() => {
                    setGeoModalOpen(false);
                    setSelectedClub(null);
                    setSelectedGeoPlayers([]);
                    setClubs([]);
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: '#b91c1c',
                    borderRadius: 8,
                    padding: 14,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#ffffff' }}>
                    Annuler
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onCreateGeoMatch}
                  disabled={!selectedClub || geoCreating || selectedGeoPlayers.length !== 3}
                  style={{
                    flex: 1,
                    backgroundColor: (!selectedClub || geoCreating || selectedGeoPlayers.length !== 3) ? '#d1d5db' : COLORS.accent,
                    borderRadius: 8,
                    padding: 14,
                    alignItems: 'center',
                  }}
                >
                  {geoCreating ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#ffffff' }}>
                      {selectedGeoPlayers.length === 3 
                        ? 'Créer le match (4 joueurs)' 
                        : `Sélectionner ${3 - selectedGeoPlayers.length} joueur${3 - selectedGeoPlayers.length > 1 ? 's' : ''} (${selectedGeoPlayers.length}/3)`}
                    </Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modales pickers date/heure géo (comme Flash Match) */}
      <Modal
        visible={geoDatePickerModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setGeoDatePickerModalOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: '#111827', marginBottom: 20, textAlign: 'center' }}>
              Sélectionner la date et l'heure
            </Text>
            
            {/* Menu déroulant des dates */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 10, textAlign: 'center' }}>Date</Text>
              <ScrollView style={{ height: 200, width: '100%' }} showsVerticalScrollIndicator={false}>
                {(() => {
                  const dates = [];
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  for (let i = 0; i < 60; i++) { // 60 jours à partir d'aujourd'hui
                    const date = new Date(today);
                    date.setDate(today.getDate() + i);
                    dates.push(date);
                  }
                  
                  const formatDate = (d) => {
                    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
                    const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
                    const dayName = days[d.getDay()];
                    const day = d.getDate();
                    const month = months[d.getMonth()];
                    const year = d.getFullYear();
                    const dayFormatted = day === 1 ? '1er' : String(day);
                    return `${dayName} ${dayFormatted} ${month} ${year}`;
                  };
                  
                  return dates.map((date, idx) => {
                    const dateStr = date.toDateString();
                    const tempStr = geoTempDate.toDateString();
                    const isSelected = dateStr === tempStr;
                    return (
                      <Pressable
                        key={idx}
                        onPress={() => {
                          setGeoTempDate(new Date(date));
                        }}
                        style={{
                          paddingVertical: 12,
                          paddingHorizontal: 16,
                          backgroundColor: isSelected ? COLORS.accent : 'transparent',
                          borderRadius: 8,
                          marginVertical: 2,
                        }}
                      >
                        <Text style={{ fontSize: 16, fontWeight: isSelected ? '800' : '400', color: isSelected ? '#ffffff' : '#111827' }}>
                          {formatDate(date)}
                        </Text>
                      </Pressable>
                    );
                  });
                })()}
              </ScrollView>
            </View>
            
            {/* Menu déroulant des heures (tranches de 15 min) */}
            <View style={{ marginTop: 20, marginBottom: 20 }}>
              <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 10, textAlign: 'center' }}>Heure</Text>
              <ScrollView style={{ height: 200, width: '100%' }} showsVerticalScrollIndicator={false}>
                {(() => {
                  const timeSlots = [];
                  // Démarre à 08:00 jusqu'à 00:00 (23:45)
                  for (let hour = 8; hour < 24; hour++) {
                    for (let minute = 0; minute < 60; minute += 15) {
                      timeSlots.push({ hour, minute });
                    }
                  }
                  // Ajouter 00:00 à la fin
                  timeSlots.push({ hour: 0, minute: 0 });
                  
                  const formatTime = (h, m) => {
                    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                  };
                  
                  return timeSlots.map((slot, idx) => {
                    const isSelected = geoTempTime.hours === slot.hour && geoTempTime.minutes === slot.minute;
                    return (
                      <Pressable
                        key={idx}
                        onPress={() => {
                          setGeoTempTime({ hours: slot.hour, minutes: slot.minute, seconds: 0 });
                        }}
                        style={{
                          paddingVertical: 12,
                          paddingHorizontal: 16,
                          backgroundColor: isSelected ? COLORS.accent : 'transparent',
                          borderRadius: 8,
                          marginVertical: 2,
                        }}
                      >
                        <Text style={{ fontSize: 16, fontWeight: isSelected ? '800' : '400', color: isSelected ? '#ffffff' : '#111827' }}>
                          {formatTime(slot.hour, slot.minute)}
                        </Text>
                      </Pressable>
                    );
                  });
                })()}
              </ScrollView>
            </View>
            
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={() => {
                  setGeoDatePickerModalOpen(false);
                  setTimeout(() => {
                    setGeoModalOpen(true);
                  }, 300);
                }}
                style={{ flex: 1, backgroundColor: '#b91c1c', borderRadius: 8, padding: 14, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#ffffff' }}>Annuler</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const newDate = new Date(geoTempDate);
                  newDate.setHours(geoTempTime.hours);
                  newDate.setMinutes(geoTempTime.minutes);
                  newDate.setSeconds(geoTempTime.seconds || 0);
                  setGeoStart(newDate);
                  setGeoDatePickerModalOpen(false);
                  // Rouvrir le modal géographique après validation
                  setTimeout(() => {
                    setGeoModalOpen(true);
                  }, 300);
                }}
                style={{ flex: 1, backgroundColor: COLORS.accent, borderRadius: 8, padding: 14, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#ffffff' }}>Valider</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Annuler pour le picker - rouvre le modal géo */}
      {geoDatePickerModalOpen && (
        <Pressable
          onPress={() => {
            setGeoDatePickerModalOpen(false);
            setTimeout(() => {
              setGeoModalOpen(true);
            }, 300);
          }}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, top: 0, backgroundColor: 'transparent' }}
        />
      )}

      {/* Modale des matchs en feu */}
      <Modal visible={hotMatchesModalVisible} transparent animationType="fade" onRequestClose={() => setHotMatchesModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(6, 26, 43, 0.85)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <View style={{ width: '95%', maxWidth: 600, backgroundColor: THEME.card, borderRadius: 32, padding: 24, maxHeight: '90%', borderWidth: 1, borderColor: THEME.cardBorder, shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.4, shadowRadius: 30, elevation: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 24 }}>🔥</Text>
                <Text style={{ fontWeight: '900', fontSize: 18, color: THEME.accent }}>Matchs en feu</Text>
              </View>
              <Pressable onPress={() => setHotMatchesModalVisible(false)} style={{ padding: 8, borderRadius: 20, backgroundColor: 'rgba(255, 255, 255, 0.1)' }}>
                <Ionicons name="close" size={24} color={THEME.text} />
              </Pressable>
            </View>
            
            {hotMatches.length === 0 ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ color: THEME.text, textAlign: 'center', fontSize: 16 }}>
                  Aucun match en feu pour le moment.
                </Text>
                <Text style={{ color: THEME.muted, textAlign: 'center', fontSize: 14, marginTop: 8 }}>
                  Les matchs en feu sont ceux où il ne manque plus qu'un joueur (3 joueurs disponibles).
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ paddingBottom: 8 }}>
                {hotMatches.map((m) => {
                  const availableUserIds = m.available_user_ids || [];
                  // Ne pas ajouter automatiquement l'utilisateur à la liste
                  const allAvailableIds = [...new Set(availableUserIds)];
                  const slot = m.time_slots || {};
                  
                  // Vérifier si l'utilisateur est disponible sur ce créneau
                  const userIsAvailable = availableUserIds.some(id => String(id) === String(meId));
                  
                  return (
                    <View
                      key={m.id}
                      style={{
                        backgroundColor: THEME.cardAlt,
                        borderRadius: 20,
                        padding: 16,
                        marginBottom: 12,
                        borderWidth: 1,
                        borderColor: THEME.cardBorder,
                      }}
                    >
                      <Text style={{ fontWeight: '800', fontSize: 16, color: THEME.text, marginBottom: 8 }}>
                        {slot.starts_at && slot.ends_at 
                          ? formatRange(slot.starts_at, slot.ends_at)
                          : 'Date à définir'
                        }
                      </Text>
                      
                      <View style={{ marginTop: 8 }}>
                        <Text style={{ fontWeight: '700', fontSize: 14, color: THEME.muted, marginBottom: 8 }}>
                          {allAvailableIds.length}/4 joueurs disponibles
                        </Text>
                        
                        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                          {allAvailableIds.map((userId) => {
                            const profile = profilesById[String(userId)] || {};
                            const isMe = String(userId) === String(meId);
                            return (
                              <Pressable
                                key={userId}
                                onLongPress={() => {
                                  if (profile?.id) {
                                    openProfile(profile);
                                  }
                                }}
                                delayLongPress={400}
                                style={{
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  backgroundColor: isMe ? 'rgba(255,255,255,0.12)' : THEME.card,
                                  padding: 0,
                                  borderRadius: 28,
                                  borderWidth: 1,
                                  borderColor: isMe ? THEME.accent : THEME.cardBorder,
                                  position: 'relative',
                                }}
                              >
                                {profile.avatar_url ? (
                                  <Image
                                    source={{ uri: profile.avatar_url }}
                                    style={{ width: 48, height: 48, borderRadius: 24 }}
                                  />
                                ) : (
                                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: THEME.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
                                    <Text style={{ color: THEME.accent, fontWeight: '700', fontSize: 18 }}>
                                      {formatPlayerName(profile.display_name || profile.email || 'J').substring(0, 1).toUpperCase()}
                                    </Text>
                                  </View>
                                )}
                                {profile.niveau != null && profile.niveau !== '' && (
                                  <View
                                    style={{
                                      position: 'absolute',
                                      right: -2,
                                      bottom: -2,
                                      width: 20,
                                      height: 20,
                                      borderRadius: 10,
                                      backgroundColor: colorForLevel(profile.niveau),
                                      borderWidth: 0.5,
                                      borderColor: '#ffffff',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                  >
                                    <Text style={{ color: '#000000', fontWeight: '900', fontSize: 10 }}>
                                      {String(profile.niveau)}
                                    </Text>
                                  </View>
                                )}
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                      
                      <Text style={{ fontSize: 12, color: THEME.accent, fontWeight: '700', marginTop: 8 }}>
                        🔥 Il ne manque plus qu'un joueur !
                      </Text>
                      
                      {/* Bouton conditionnel selon la disponibilité */}
                      {userIsAvailable ? (
                        /* Bouton Inviter un joueur du groupe si l'utilisateur est disponible */
                        <Pressable
                          disabled={!groupId}
                          onPress={async () => {
                            console.log('[HotMatch] Bouton Inviter un joueur cliqué, groupId:', groupId);
                            if (!groupId) {
                              Alert.alert('Erreur', 'Aucun groupe sélectionné');
                              return;
                            }
                            console.log('[HotMatch] Ouverture de la modale d\'invitation');
                            // Fermer la modale des matchs en feu avant d'ouvrir la modale d'invitation
                            setHotMatchesModalVisible(false);
                            setSelectedHotMatch(m);
                            setLoadingHotMatchMembers(true);
                            setHotMatchMembers([]); // Réinitialiser la liste avant le chargement
                            setHotMatchSearchQuery(''); // Réinitialiser la recherche
                            setHotMatchLevelFilter([]); // Réinitialiser le filtre de niveau
                            setHotMatchLevelFilterVisible(false); // Masquer la zone de configuration
                            setHotMatchGeoLocationType(null); // Réinitialiser le filtre géographique
                            setHotMatchGeoRefPoint(null);
                            setHotMatchGeoCityQuery('');
                            setHotMatchGeoCitySuggestions([]);
                            setHotMatchGeoRadiusKm(null);
                            setHotMatchGeoFilterVisible(false); // Masquer la zone de configuration
                            // Attendre un court délai pour que la modale se ferme avant d'ouvrir la nouvelle
                            setTimeout(() => {
                            setInviteHotMatchModalVisible(true);
                            }, 200);
                            try {
                              // Charger les membres du groupe
                              console.log('[HotMatch] Chargement des membres du groupe:', groupId);
                              const { data: members, error } = await supabase
                                .from('group_members')
                                .select('user_id, role')
                                .eq('group_id', groupId);
                              if (error) {
                                console.error('[HotMatch] Erreur requête group_members:', error);
                                throw error;
                              }

                              console.log('[HotMatch] Résultat group_members:', members);
                              const userIds = [...new Set((members || []).map((gm) => gm.user_id))];
                              console.log('[HotMatch] Membres trouvés:', userIds.length, 'ids:', userIds);
                              if (userIds.length) {
                                const { data: profs, error: profError } = await supabase
                                  .from('profiles')
                                  .select('id, display_name, avatar_url, email, niveau, phone, expo_push_token, address_home, address_work')
                                  .in('id', userIds);
                                if (profError) {
                                  console.error('[HotMatch] Erreur requête profiles:', profError);
                                  throw profError;
                                }
                                
                                // Afficher tous les membres du groupe, qu'ils soient disponibles ou non
                                console.log('[HotMatch] Profils chargés:', profs?.length || 0, 'profils:', profs);
                                setHotMatchMembers(profs || []);
                              } else {
                                console.log('[HotMatch] Aucun membre trouvé dans group_members');
                                setHotMatchMembers([]);
                              }
                            } catch (e) {
                              console.error('[HotMatch] Erreur chargement membres:', e);
                              Alert.alert('Erreur', `Impossible de charger les membres: ${e?.message || String(e)}`);
                              setHotMatchMembers([]);
                            } finally {
                              setLoadingHotMatchMembers(false);
                              // Note: hotMatchMembers.length peut être obsolète ici car setState est asynchrone
                              // Le log sera dans le render de la modale
                            }
                          }}
                          style={({ pressed }) => [
                            {
                              backgroundColor: groupId ? THEME.accent : THEME.cardAlt,
                              padding: 14,
                              borderRadius: 20,
                              borderWidth: 1,
                              borderColor: groupId ? THEME.accent : THEME.cardBorder,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginTop: 12,
                              gap: 6,
                              shadowColor: groupId ? THEME.accent : 'transparent',
                              shadowOffset: { width: 0, height: 4 },
                              shadowOpacity: groupId ? 0.3 : 0,
                              shadowRadius: 8,
                              elevation: groupId ? 8 : 0,
                              opacity: groupId ? (pressed ? 0.85 : 1) : 0.7,
                            },
                            Platform.OS === 'web' && { cursor: groupId ? 'pointer' : 'not-allowed' }
                          ]}
                        >
                          <Text style={{ fontSize: 16 }}>👋</Text>
                          <Text style={{ color: groupId ? THEME.ink : THEME.text, fontWeight: '800', fontSize: 14 }}>
                            Inviter un joueur du groupe
                          </Text>
                        </Pressable>
                      ) : (
                        /* Bouton Me rendre dispo si l'utilisateur n'est pas disponible */
                        <Pressable
                          onPress={async () => {
                            if (!slot.starts_at || !slot.ends_at) {
                              Alert.alert('Erreur', 'Créneau invalide');
                              return;
                            }
                            try {
                              // Vérifier les conflits de créneaux avant de créer la disponibilité
                              const conflicts = await findConflictingUsers({
                                groupId,
                                startsAt: slot.starts_at,
                                endsAt: slot.ends_at,
                                userIds: [meId]
                              });
                              
                              if (conflicts.size > 0 && conflicts.has(String(meId))) {
                                Alert.alert(
                                  'Créneau indisponible',
                                  'Vous avez déjà un match confirmé ou en attente qui chevauche ce créneau.'
                                );
                                return;
                              }
                              
                              // Si c'est un match existant, créer directement un RSVP 'accepted' pour l'utilisateur
                              if (m.match_id && m.is_existing_match) {
                                console.log('[HotMatch] Match existant trouvé, création RSVP pour l\'utilisateur:', m.match_id);
                                const { error: rsvpError } = await supabase
                                  .from('match_rsvps')
                                  .upsert(
                                    { match_id: m.match_id, user_id: meId, status: 'accepted' },
                                    { onConflict: 'match_id,user_id' }
                                  );
                                
                                if (rsvpError) {
                                  console.error('[HotMatch] Erreur création RSVP pour match existant:', rsvpError);
                                  throw rsvpError;
                                }
                                
                                Alert.alert('Succès', 'Vous avez été ajouté au match !');
                                setHotMatchesModalVisible(false);
                                // Rafraîchir les données
                                fetchData();
                                return;
                              }
                              
                              // Créer une disponibilité pour l'utilisateur sur ce créneau (seulement pour les créneaux virtuels)
                              const { error: availabilityError } = await supabase
                                .from('availability')
                                .upsert({
                                  group_id: groupId,
                                  user_id: meId,
                                  start: slot.starts_at,
                                  end: slot.ends_at,
                                  status: 'available',
                                }, { 
                                  onConflict: 'group_id,user_id,start,end',
                                  ignoreDuplicates: false 
                                });
                              
                              if (availabilityError) {
                                console.error('[HotMatch] Erreur création disponibilité:', availabilityError);
                                throw availabilityError;
                              }
                              
                              // Récupérer les autres joueurs disponibles sur ce créneau (pour les ajouter au match)
                              // Utiliser m.available_user_ids directement car allAvailableIds n'est pas accessible dans ce scope
                              const availableUserIdsForMatch = m.available_user_ids || [];
                              const otherAvailableUserIds = availableUserIdsForMatch.filter(id => String(id) !== String(meId));
                              console.log('[HotMatch] Joueurs disponibles sur le créneau:', availableUserIdsForMatch);
                              console.log('[HotMatch] Autres joueurs à ajouter (hors moi):', otherAvailableUserIds);
                              
                              // Récupérer ou créer le time_slot
                              let timeSlotId = m.time_slot_id;
                              
                              if (!timeSlotId || timeSlotId.startsWith('virtual-')) {
                                // Vérifier si un time_slot existe déjà pour ce créneau (la contrainte unique est sur group_id + starts_at)
                                const { data: existingTimeSlot } = await supabase
                                  .from('time_slots')
                                  .select('id')
                                  .eq('group_id', groupId)
                                  .eq('starts_at', slot.starts_at)
                                  .maybeSingle();
                                
                                if (existingTimeSlot?.id) {
                                  timeSlotId = existingTimeSlot.id;
                                  console.log('[HotMatch] Time_slot existant trouvé:', timeSlotId);
                                } else {
                                  // Créer un time_slot pour ce créneau
                                  const { data: newTimeSlot, error: timeSlotError } = await supabase
                                    .from('time_slots')
                                    .insert({
                                      group_id: groupId,
                                      starts_at: slot.starts_at,
                                      ends_at: slot.ends_at,
                                    })
                                    .select('id')
                                    .single();
                                  
                                  if (timeSlotError) {
                                    // Si erreur de duplication (clé unique dupliquée), récupérer le time_slot existant
                                    if (timeSlotError.code === '23505' || 
                                        String(timeSlotError.message || '').includes('duplicate key') || 
                                        String(timeSlotError.message || '').includes('unique constraint') ||
                                        String(timeSlotError.message || '').includes('uniq_time_slots')) {
                                      console.log('[HotMatch] Time_slot déjà existant (erreur de duplication), récupération...');
                                      const { data: existingTS, error: fetchError } = await supabase
                                        .from('time_slots')
                                        .select('id')
                                        .eq('group_id', groupId)
                                        .eq('starts_at', slot.starts_at)
                                        .maybeSingle();
                                      
                                      if (fetchError) {
                                        console.error('[HotMatch] Erreur récupération time_slot existant:', fetchError);
                                        throw fetchError;
                                      }
                                      
                                      if (existingTS?.id) {
                                        timeSlotId = existingTS.id;
                                        console.log('[HotMatch] Time_slot existant récupéré:', timeSlotId);
                                      } else {
                                        // Si on ne trouve pas le time_slot, c'est une vraie erreur
                                        console.error('[HotMatch] Erreur création time_slot (duplication mais pas trouvé):', timeSlotError);
                                        throw timeSlotError;
                                      }
                                    } else {
                                      console.error('[HotMatch] Erreur création time_slot:', timeSlotError);
                                      throw timeSlotError;
                                    }
                                  } else {
                                    timeSlotId = newTimeSlot?.id;
                                    console.log('[HotMatch] Time_slot créé:', timeSlotId);
                                  }
                                }
                              }
                              
                              // Créer le match si le time_slot existe
                              if (timeSlotId && !timeSlotId.startsWith('virtual-')) {
                                // Vérifier si un match existe déjà pour ce créneau
                                const { data: existingMatch } = await supabase
                                  .from('matches')
                                  .select('id')
                                  .eq('group_id', groupId)
                                  .eq('time_slot_id', timeSlotId)
                                  .maybeSingle();
                                
                                if (!existingMatch) {
                                  // Créer le match directement (sans utiliser create_match_from_slot qui a un problème)
                                  const { data: newMatch, error: matchError } = await supabase
                                    .from('matches')
                                    .insert({
                                      group_id: groupId,
                                      time_slot_id: timeSlotId,
                                      status: 'confirmed',
                                      created_by: meId,
                                    })
                                    .select('id')
                                    .single();
                                  
                                  if (matchError) {
                                    console.error('[HotMatch] Erreur création match:', matchError);
                                    throw matchError;
                                  }
                                  
                                  // Créer les RSVPs confirmés pour tous les joueurs disponibles
                                  if (newMatch?.id) {
                                    const toAccept = (availableUserIdsForMatch || []).map(String).filter(Boolean);
                                    await acceptPlayers(newMatch.id, toAccept);
                                  }
                                }
                              }
                              
                              Alert.alert('Disponibilité créée', 'Vous êtes maintenant disponible sur ce créneau et un match a été créé.');
                              // Recharger les données
                              fetchData();
                              // Fermer la modale
                              setHotMatchesModalVisible(false);
                            } catch (e) {
                              console.error('[HotMatch] Erreur:', e);
                              Alert.alert('Erreur', `Impossible de créer la disponibilité: ${e?.message || String(e)}`);
                            }
                          }}
                          style={{
                            backgroundColor: THEME.accent,
                            padding: 14,
                            borderRadius: 20,
                            borderWidth: 1,
                            borderColor: THEME.accent,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginTop: 12,
                            gap: 6,
                            shadowColor: THEME.accent,
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.3,
                            shadowRadius: 8,
                            elevation: 8,
                          }}
                        >
                          <Text style={{ fontSize: 16 }}>✅</Text>
                          <Text style={{ color: THEME.ink, fontWeight: '800', fontSize: 14 }}>
                            Me rendre dispo
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Modale d'invitation de membres pour les matchs en feu */}
      <Modal visible={inviteHotMatchModalVisible} transparent animationType="fade" onRequestClose={() => setInviteHotMatchModalVisible(false)}>
        {(() => {
          console.log('[HotMatch] Modale rendue, visible:', inviteHotMatchModalVisible, 'loading:', loadingHotMatchMembers, 'membres:', hotMatchMembers.length);
          return null;
        })()}
        <View style={{ flex: 1, backgroundColor: 'rgba(6, 26, 43, 0.85)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <View style={{ width: '90%', maxWidth: 500, backgroundColor: THEME.card, borderRadius: 32, padding: 24, maxHeight: '80%', borderWidth: 1, borderColor: THEME.cardBorder, elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.4, shadowRadius: 30 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontWeight: '900', fontSize: 18, color: THEME.accent }}>Inviter un joueur</Text>
              <Pressable onPress={() => {
                console.log('[HotMatch] Fermeture modale');
                setInviteHotMatchModalVisible(false);
                setHotMatchSearchQuery(''); // Réinitialiser la recherche
                setHotMatchLevelFilter([]); // Réinitialiser le filtre de niveau
                setHotMatchLevelFilterVisible(false); // Masquer la zone de configuration
                setHotMatchGeoLocationType(null); // Réinitialiser le filtre géographique
                setHotMatchGeoRefPoint(null);
                setHotMatchGeoCityQuery('');
                setHotMatchGeoCitySuggestions([]);
                setHotMatchGeoRadiusKm(null);
                setHotMatchGeoFilterVisible(false); // Masquer la zone de configuration
              }} style={{ padding: 8, borderRadius: 20, backgroundColor: 'rgba(255, 255, 255, 0.1)' }}>
                <Ionicons name="close" size={24} color={THEME.text} />
              </Pressable>
            </View>
            
            {(() => {
              console.log('[HotMatch] Rendu modale - loading:', loadingHotMatchMembers, 'count:', hotMatchMembers.length);
              if (loadingHotMatchMembers) {
                return (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={THEME.accent} />
                <Text style={{ marginTop: 12, color: THEME.text, fontWeight: '700' }}>Chargement des membres...</Text>
              </View>
                );
              }
              
              // Récupérer les joueurs déjà dans le match (RSVPs acceptés)
              const matchId = selectedHotMatch?.match_id || selectedHotMatch?.id;
              const matchRsvps = matchId ? (rsvpsByMatch[matchId] || []) : [];
              const playersInMatch = new Set(
                matchRsvps
                  .filter(r => r.status === 'accepted')
                  .map(r => String(r.user_id))
              );
              
              // Filtrer les membres en fonction de la recherche et du niveau
              const filteredMembers = hotMatchMembers.filter(member => {
                const memberId = String(member.id);
                
                // Exclure l'utilisateur actuel
                if (meId && memberId === String(meId)) {
                  return false;
                }
                
                // Exclure les joueurs déjà dans le match (avec RSVP accepté)
                if (playersInMatch.has(memberId)) {
                  return false;
                }
                
                // Filtre par recherche textuelle
                if (hotMatchSearchQuery.trim()) {
                  const query = hotMatchSearchQuery.toLowerCase().trim();
                  const name = (member.display_name || '').toLowerCase();
                  const email = (member.email || '').toLowerCase();
                  const niveau = String(member.niveau || '').toLowerCase();
                  if (!name.includes(query) && !email.includes(query) && !niveau.includes(query)) {
                    return false;
                  }
                }
                
                // Filtre par niveau
                if (hotMatchLevelFilter.length > 0) {
                  const memberLevel = Number(member.niveau);
                  if (!Number.isFinite(memberLevel)) return false;
                  
                  if (!hotMatchLevelFilter.includes(memberLevel)) return false;
                }
                
                // Filtre géographique
                if (hotMatchGeoRefPoint && hotMatchGeoRefPoint.lat != null && hotMatchGeoRefPoint.lng != null && hotMatchGeoRadiusKm != null) {
                  // Utiliser domicile, puis travail, comme position du joueur
                  let playerLat = null;
                  let playerLng = null;
                  if (member.address_home?.lat && member.address_home?.lng) {
                    playerLat = member.address_home.lat;
                    playerLng = member.address_home.lng;
                  } else if (member.address_work?.lat && member.address_work?.lng) {
                    playerLat = member.address_work.lat;
                    playerLng = member.address_work.lng;
                  }
                  
                  if (!playerLat || !playerLng) return false; // Pas de position = exclu
                  
                  // Calculer la distance
                  const distanceKm = haversineKm(hotMatchGeoRefPoint, { lat: playerLat, lng: playerLng });
                  if (distanceKm > hotMatchGeoRadiusKm) return false;
                }
                
                return true;
              });
              
              if (hotMatchMembers.length === 0) {
                return (
              <View style={{ padding: 20 }}>
                <Text style={{ color: THEME.text, textAlign: 'center' }}>
                      Aucun membre dans ce groupe.
                    </Text>
                    <Text style={{ color: THEME.muted, textAlign: 'center', fontSize: 12, marginTop: 8 }}>
                      (loading: {loadingHotMatchMembers ? 'true' : 'false'}, count: {hotMatchMembers.length})
                </Text>
              </View>
                );
              }
              
              if (filteredMembers.length === 0) {
                return (
                  <>
                    <TextInput
                      placeholder="Rechercher un joueur (nom, email, niveau)..."
                      placeholderTextColor="rgba(255,255,255,0.5)"
                      value={hotMatchSearchQuery}
                      onChangeText={setHotMatchSearchQuery}
                      style={{
                        backgroundColor: THEME.cardAlt,
                        borderWidth: 1,
                        borderColor: THEME.cardBorder,
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        color: THEME.text,
                        marginBottom: 12,
                        fontSize: 14,
                      }}
                      returnKeyType="search"
                      autoCapitalize="none"
                    />
                    
                    {/* Boutons de filtres */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 12 }}>
                  <Pressable
                    onPress={() => {
                          if (!hotMatchLevelFilterVisible) {
                            setHotMatchGeoFilterVisible(false);
                          }
                          setHotMatchLevelFilterVisible(!hotMatchLevelFilterVisible);
                        }}
                      style={{
                        padding: 10,
                        backgroundColor: hotMatchLevelFilter.length > 0 ? 'rgba(255, 117, 29, 0.2)' : 'rgba(255,255,255,0.75)',
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.7)',
                        shadowColor: '#0b2240',
                        shadowOpacity: 0.12,
                        shadowRadius: 8,
                        shadowOffset: { width: 0, height: 2 },
                        elevation: 3,
                      }}
                      >
                        <Image 
                          source={racketIcon}
                          style={{
                            width: 20,
                            height: 20,
                          tintColor: hotMatchLevelFilter.length > 0 ? '#ff751d' : '#374151',
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.3,
                            shadowRadius: 3,
                            elevation: 4,
                          }}
                          resizeMode="contain"
                        />
                      </Pressable>
                      
                      <Text style={{ 
                        color: '#374151', 
                        fontWeight: '800', 
                        fontSize: 14 
                      }}>
                        Filtres
                      </Text>
                      
                      <Pressable
                        onPress={() => {
                          if (!hotMatchGeoFilterVisible) {
                            setHotMatchLevelFilterVisible(false);
                          }
                          setHotMatchGeoFilterVisible(!hotMatchGeoFilterVisible);
                        }}
                      style={{
                        padding: 10,
                        backgroundColor: (hotMatchGeoRefPoint && hotMatchGeoRadiusKm) ? 'rgba(255, 117, 29, 0.2)' : 'rgba(255,255,255,0.75)',
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.7)',
                        shadowColor: '#0b2240',
                        shadowOpacity: 0.12,
                        shadowRadius: 8,
                        shadowOffset: { width: 0, height: 2 },
                        elevation: 3,
                      }}
                      >
                        <Ionicons 
                          name="location" 
                          size={20} 
                        color={(hotMatchGeoRefPoint && hotMatchGeoRadiusKm) ? '#ff751d' : '#374151'}
                          style={{
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.3,
                            shadowRadius: 3,
                            elevation: 4,
                          }}
                        />
                      </Pressable>
                    </View>
                    
                    {/* Zone de configuration du filtre par niveau (masquée par défaut) */}
                    {hotMatchLevelFilterVisible && (
                      <View style={{ 
                        backgroundColor: THEME.cardAlt, 
                        borderRadius: 16, 
                        padding: 12,
                        borderWidth: 1,
                        borderColor: hotMatchLevelFilter.length > 0 ? THEME.accent : THEME.cardBorder,
                        marginBottom: 12,
                      }}>
                        <Text style={{ fontSize: 14, fontWeight: '900', color: THEME.text, marginBottom: 12 }}>
                          Sélectionnez les niveaux à afficher
                        </Text>
                        
                        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 3.5 }}>
                          {LEVELS.map((lv) => {
                            const isSelected = Array.isArray(hotMatchLevelFilter) && hotMatchLevelFilter.includes(lv.v);
                            return (
                              <Pressable
                                key={lv.v}
                                onPress={() => {
                                  setHotMatchLevelFilter((prev) => {
                                    const prevArray = Array.isArray(prev) ? prev : [];
                                    if (prevArray.includes(lv.v)) {
                                      return prevArray.filter((n) => n !== lv.v);
                                    }
                                    return [...prevArray, lv.v];
                                  });
                                }}
                                style={{
                                  paddingVertical: 3.3,
                                  paddingHorizontal: 8.8,
                                  borderRadius: 999,
                                  backgroundColor: isSelected ? lv.color : 'rgba(255,255,255,0.85)',
                                  borderWidth: isSelected ? 2 : 1,
                                  borderColor: isSelected ? lv.color : THEME.cardBorder,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Text style={{ 
                                  fontSize: 12, 
                                  fontWeight: isSelected ? '900' : '800', 
                                  color: THEME.ink 
                                }}>
                                  {lv.v}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        
                        {hotMatchLevelFilter.length > 0 && (
                          <Text style={{ fontSize: 12, fontWeight: '700', color: THEME.accent, marginTop: 8 }}>
                            ✓ Filtre actif : {hotMatchLevelFilter.length} niveau{hotMatchLevelFilter.length > 1 ? 'x' : ''} sélectionné{hotMatchLevelFilter.length > 1 ? 's' : ''}
                          </Text>
                        )}
                      </View>
                    )}
                    
                    {/* Zone de configuration du filtre géographique (masquée par défaut) */}
                    {hotMatchGeoFilterVisible && (
                      <View style={{ 
                        backgroundColor: THEME.cardAlt, 
                        borderRadius: 16, 
                        padding: 12,
                        borderWidth: 1,
                        borderColor: (hotMatchGeoRefPoint && hotMatchGeoRadiusKm) ? THEME.accent : THEME.cardBorder,
                        marginBottom: 12,
                      }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: THEME.text, marginBottom: 12 }}>
                          Filtrer par distance
                        </Text>
                        
                        {/* Sélection du type de position */}
                        <View style={{ marginBottom: 12 }}>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: THEME.text, marginBottom: 8 }}>
                            Position de référence
                          </Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {[
                              { key: 'current', label: '📍 Position actuelle' },
                              { key: 'home', label: '🏠 Domicile' },
                              { key: 'work', label: '💼 Travail' },
                              { key: 'city', label: '🏙️ Ville' },
                            ].map(({ key, label }) => {
                              const isSelected = hotMatchGeoLocationType === key;
                              return (
                                <Pressable
                                  key={key}
                                  onPress={() => {
                                    if (isSelected) {
                                      setHotMatchGeoRefPoint(null);
                                      setHotMatchGeoCityQuery('');
                                      setHotMatchGeoCitySuggestions([]);
                                      setHotMatchGeoLocationType(null);
                                      setHotMatchGeoRadiusKm(null);
                                    } else {
                                      setHotMatchGeoLocationType(key);
                                      if (key === 'city') {
                                        setHotMatchGeoRefPoint(null);
                                        setHotMatchGeoCityQuery('');
                                      }
                                    }
                                  }}
                                  style={{
                                    paddingVertical: 8,
                                    paddingHorizontal: 12,
                                    borderRadius: 8,
                                    backgroundColor: (isSelected && hotMatchGeoRefPoint) ? '#15803d' : '#ffffff',
                                    borderWidth: 1,
                                    borderColor: (isSelected && hotMatchGeoRefPoint) ? '#15803d' : '#d1d5db',
                                  }}
                                >
                                  <Text style={{ 
                                    fontSize: 13, 
                                    fontWeight: (isSelected && hotMatchGeoRefPoint) ? '800' : '700', 
                                    color: (isSelected && hotMatchGeoRefPoint) ? '#ffffff' : '#111827' 
                                  }}>
                                    {label}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                        
                        {/* Recherche de ville si type = 'city' */}
                        {hotMatchGeoLocationType === 'city' && (
                          <View style={{ marginBottom: 12 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 8 }}>
                              Rechercher une ville
                            </Text>
                            <TextInput
                              placeholder="Tapez le nom d'une ville..."
                              value={hotMatchGeoCityQuery}
                              onChangeText={(text) => {
                                setHotMatchGeoCityQuery(text);
                                searchHotMatchGeoCity(text);
                              }}
                              style={{
                                backgroundColor: '#ffffff',
                                borderRadius: 8,
                                padding: 12,
                                borderWidth: 1,
                                borderColor: '#d1d5db',
                                fontSize: 14,
                              }}
                            />
                            {hotMatchGeoCitySuggestions.length > 0 && (
                              <View style={{ marginTop: 8, backgroundColor: '#ffffff', borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', maxHeight: 150 }}>
                                <ScrollView>
                                  {hotMatchGeoCitySuggestions.map((suggestion, idx) => (
                                    <Pressable
                                      key={idx}
                                      onPress={() => {
                                        setHotMatchGeoRefPoint({ lat: suggestion.lat, lng: suggestion.lng, address: suggestion.name });
                                        setHotMatchGeoCityQuery(suggestion.name);
                                        setHotMatchGeoCitySuggestions([]);
                                      }}
                                      style={{
                                        padding: 12,
                                        borderBottomWidth: idx < hotMatchGeoCitySuggestions.length - 1 ? 1 : 0,
                                        borderBottomColor: '#e5e7eb',
                                      }}
                                    >
                                      <Text style={{ fontSize: 14, color: '#111827' }}>{suggestion.name}</Text>
                                    </Pressable>
                                  ))}
                                </ScrollView>
                              </View>
                            )}
                          </View>
                        )}
                        
                        {/* Sélection du rayon */}
                        <View style={{ marginBottom: 12 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 8 }}>
                            Rayon : {hotMatchGeoRadiusKm ? `${hotMatchGeoRadiusKm} km` : 'non sélectionné'}
                          </Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 6 }}>
                            {[10, 20, 30, 40, 50].map((km) => {
                              const isSelected = hotMatchGeoRadiusKm === km;
                              return (
                                <Pressable
                                  key={km}
                                  onPress={() => {
                                    if (isSelected) {
                                      setHotMatchGeoRadiusKm(null);
                                    } else {
                                      setHotMatchGeoRadiusKm(km);
                                    }
                                  }}
                                  style={{
                                    flex: 1,
                                    paddingVertical: 6,
                                    paddingHorizontal: 8,
                                    borderRadius: 8,
                                    backgroundColor: isSelected ? '#15803d' : '#ffffff',
                                    borderWidth: 1,
                                    borderColor: isSelected ? '#15803d' : '#d1d5db',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <Text style={{ 
                                    fontSize: 12, 
                                    fontWeight: isSelected ? '800' : '700', 
                                    color: isSelected ? '#ffffff' : '#111827' 
                                  }}>
                                    {km} km
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                        
                        {(hotMatchGeoRefPoint && hotMatchGeoRadiusKm) && (
                          <Text style={{ fontSize: 12, fontWeight: '500', color: '#15803d', marginTop: 8 }}>
                            ✓ Filtre actif : {hotMatchGeoRadiusKm} km autour de {hotMatchGeoRefPoint.address || 'la position sélectionnée'}
                          </Text>
                        )}
                      </View>
                    )}
                    
                    <View style={{ padding: 20 }}>
                      <Text style={{ color: '#6b7280', textAlign: 'center' }}>
                        Aucun membre trouvé
                        {hotMatchSearchQuery.trim() && ` pour "${hotMatchSearchQuery}"`}
                        {hotMatchLevelFilter.length > 0 && ` avec les niveaux ${hotMatchLevelFilter.sort((a, b) => a - b).join(', ')}`}
                        {hotMatchGeoRefPoint && hotMatchGeoRadiusKm && ` dans un rayon de ${hotMatchGeoRadiusKm} km autour de ${hotMatchGeoRefPoint.address || 'la position sélectionnée'}`}
                      </Text>
                    </View>
                  </>
                );
              }
              
              return (
                <>
                  <TextInput
                    placeholder="Rechercher un joueur (nom, email, niveau)..."
                    placeholderTextColor="#9ca3af"
                    value={hotMatchSearchQuery}
                    onChangeText={setHotMatchSearchQuery}
                    style={{
                      backgroundColor: '#f9fafb',
                      borderWidth: 1,
                      borderColor: '#e5e7eb',
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      color: '#111827',
                      marginBottom: 12,
                      fontSize: 14,
                    }}
                    returnKeyType="search"
                    autoCapitalize="none"
                  />
                  
                  {/* Boutons de filtres */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 12 }}>
                    <Pressable
                      onPress={() => {
                        if (!hotMatchLevelFilterVisible) {
                          setHotMatchGeoFilterVisible(false);
                        }
                        setHotMatchLevelFilterVisible(!hotMatchLevelFilterVisible);
                      }}
                        style={{
                          padding: 10,
                          backgroundColor: hotMatchLevelFilter.length > 0 ? 'rgba(255, 117, 29, 0.2)' : 'rgba(255,255,255,0.75)',
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: 'rgba(255,255,255,0.7)',
                          shadowColor: '#0b2240',
                          shadowOpacity: 0.12,
                          shadowRadius: 8,
                          shadowOffset: { width: 0, height: 2 },
                          elevation: 3,
                        }}
                    >
                      <Image 
                        source={racketIcon}
                        style={{
                          width: 20,
                          height: 20,
                          tintColor: hotMatchLevelFilter.length > 0 ? '#ff751d' : '#374151',
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.3,
                          shadowRadius: 3,
                          elevation: 4,
                        }}
                        resizeMode="contain"
                      />
                    </Pressable>
                    
                    <Text style={{ 
                      color: '#374151', 
                      fontWeight: '700', 
                      fontSize: 14 
                    }}>
                      Filtres
                    </Text>
                    
                    <Pressable
                      onPress={() => {
                        if (!hotMatchGeoFilterVisible) {
                          setHotMatchLevelFilterVisible(false);
                        }
                        setHotMatchGeoFilterVisible(!hotMatchGeoFilterVisible);
                      }}
                      style={{
                        padding: 10,
                        backgroundColor: (hotMatchGeoRefPoint && hotMatchGeoRadiusKm) ? 'rgba(255, 117, 29, 0.2)' : 'rgba(255,255,255,0.75)',
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.7)',
                        shadowColor: '#0b2240',
                        shadowOpacity: 0.12,
                        shadowRadius: 8,
                        shadowOffset: { width: 0, height: 2 },
                        elevation: 3,
                      }}
                    >
                      <Ionicons 
                        name="location" 
                        size={20} 
                        color={(hotMatchGeoRefPoint && hotMatchGeoRadiusKm) ? '#ff751d' : '#374151'}
                        style={{
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.3,
                          shadowRadius: 3,
                          elevation: 4,
                        }}
                      />
                    </Pressable>
                  </View>
                  
                  {/* Zone de configuration du filtre par niveau (masquée par défaut) */}
                  {hotMatchLevelFilterVisible && (
                    <View style={{ 
                      backgroundColor: '#f3f4f6', 
                      borderRadius: 12, 
                      padding: 12,
                      borderWidth: 1,
                      borderColor: hotMatchLevelFilter.length > 0 ? '#15803d' : '#d1d5db',
                      marginBottom: 12,
                    }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 12 }}>
                        Sélectionnez les niveaux à afficher
                      </Text>
                      
                      <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 3.5 }}>
                        {LEVELS.map((lv) => {
                          const isSelected = Array.isArray(hotMatchLevelFilter) && hotMatchLevelFilter.includes(lv.v);
                          return (
                            <Pressable
                              key={lv.v}
                              onPress={() => {
                                setHotMatchLevelFilter((prev) => {
                                  const prevArray = Array.isArray(prev) ? prev : [];
                                  if (prevArray.includes(lv.v)) {
                                    return prevArray.filter((n) => n !== lv.v);
                                  }
                                  return [...prevArray, lv.v];
                                });
                              }}
                              style={{
                                paddingVertical: 3.3,
                                paddingHorizontal: 8.8,
                                borderRadius: 999,
                                backgroundColor: isSelected ? lv.color : '#ffffff',
                                borderWidth: isSelected ? 2 : 1,
                                borderColor: isSelected ? lv.color : '#d1d5db',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Text style={{ 
                                fontSize: 12, 
                                fontWeight: isSelected ? '900' : '800', 
                                color: '#111827' 
                              }}>
                                {lv.v}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      
                      {hotMatchLevelFilter.length > 0 && (
                        <Text style={{ fontSize: 12, fontWeight: '500', color: '#15803d', marginTop: 8 }}>
                          ✓ Filtre actif : {hotMatchLevelFilter.length} niveau{hotMatchLevelFilter.length > 1 ? 'x' : ''} sélectionné{hotMatchLevelFilter.length > 1 ? 's' : ''}
                        </Text>
                      )}
                    </View>
                  )}
                  
                  {/* Zone de configuration du filtre géographique (masquée par défaut) */}
                  {hotMatchGeoFilterVisible && (
                    <View style={{ 
                      backgroundColor: '#f3f4f6', 
                      borderRadius: 12, 
                      padding: 12,
                      borderWidth: 1,
                      borderColor: (hotMatchGeoRefPoint && hotMatchGeoRadiusKm) ? '#15803d' : '#d1d5db',
                      marginBottom: 12,
                    }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 12 }}>
                        Filtrer par distance
                      </Text>
                      
                      {/* Sélection du type de position */}
                      <View style={{ marginBottom: 12 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 8 }}>
                          Position de référence
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {[
                            { key: 'current', label: '📍 Position actuelle' },
                            { key: 'home', label: '🏠 Domicile' },
                            { key: 'work', label: '💼 Travail' },
                            { key: 'city', label: '🏙️ Ville' },
                          ].map(({ key, label }) => {
                            const isSelected = hotMatchGeoLocationType === key;
                            return (
                              <Pressable
                                key={key}
                                onPress={() => {
                                  if (isSelected) {
                                    setHotMatchGeoRefPoint(null);
                                    setHotMatchGeoCityQuery('');
                                    setHotMatchGeoCitySuggestions([]);
                                    setHotMatchGeoLocationType(null);
                                    setHotMatchGeoRadiusKm(null);
                                  } else {
                                    setHotMatchGeoLocationType(key);
                                    if (key === 'city') {
                                      setHotMatchGeoRefPoint(null);
                                      setHotMatchGeoCityQuery('');
                                    }
                                  }
                                }}
                                style={{
                                  paddingVertical: 8,
                                  paddingHorizontal: 12,
                                  borderRadius: 999,
                                  backgroundColor: (isSelected && hotMatchGeoRefPoint) ? THEME.accent : THEME.card,
                                  borderWidth: 1,
                                  borderColor: (isSelected && hotMatchGeoRefPoint) ? THEME.accent : THEME.cardBorder,
                                }}
                              >
                                <Text style={{ 
                                  fontSize: 13, 
                                  fontWeight: (isSelected && hotMatchGeoRefPoint) ? '800' : '700', 
                                  color: (isSelected && hotMatchGeoRefPoint) ? THEME.ink : THEME.text 
                                }}>
                                  {label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                      
                      {/* Recherche de ville si type = 'city' */}
                      {hotMatchGeoLocationType === 'city' && (
                        <View style={{ marginBottom: 12 }}>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: THEME.text, marginBottom: 8 }}>
                            Rechercher une ville
                          </Text>
                          <TextInput
                            placeholder="Tapez le nom d'une ville..."
                            value={hotMatchGeoCityQuery}
                            onChangeText={(text) => {
                              setHotMatchGeoCityQuery(text);
                              searchHotMatchGeoCity(text);
                            }}
                            style={{
                              backgroundColor: THEME.card,
                              borderRadius: 999,
                              padding: 12,
                              borderWidth: 1,
                              borderColor: THEME.cardBorder,
                              fontSize: 14,
                              color: THEME.text,
                            }}
                          />
                          {hotMatchGeoCitySuggestions.length > 0 && (
                              <View style={{ marginTop: 8, backgroundColor: THEME.card, borderRadius: 16, borderWidth: 1, borderColor: THEME.cardBorder, maxHeight: 150 }}>
                              <ScrollView>
                                {hotMatchGeoCitySuggestions.map((suggestion, idx) => (
                                  <Pressable
                                    key={idx}
                                    onPress={() => {
                                      setHotMatchGeoRefPoint({ lat: suggestion.lat, lng: suggestion.lng, address: suggestion.name });
                                      setHotMatchGeoCityQuery(suggestion.name);
                                      setHotMatchGeoCitySuggestions([]);
                                    }}
                                    style={{
                                      padding: 12,
                                      borderBottomWidth: idx < hotMatchGeoCitySuggestions.length - 1 ? 1 : 0,
                                      borderBottomColor: '#e5e7eb',
                                    }}
                                      >
                                        <Text style={{ fontSize: 14, color: THEME.text }}>{suggestion.name}</Text>
                                  </Pressable>
                                ))}
                              </ScrollView>
                            </View>
                          )}
                        </View>
                      )}
                      
                      {/* Sélection du rayon */}
                      <View style={{ marginBottom: 12 }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: THEME.text, marginBottom: 8 }}>
                          Rayon : {hotMatchGeoRadiusKm ? `${hotMatchGeoRadiusKm} km` : 'non sélectionné'}
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 6 }}>
                          {[10, 20, 30, 40, 50].map((km) => {
                            const isSelected = hotMatchGeoRadiusKm === km;
                            return (
                              <Pressable
                                key={km}
                                onPress={() => {
                                  if (isSelected) {
                                    setHotMatchGeoRadiusKm(null);
                                  } else {
                                    setHotMatchGeoRadiusKm(km);
                                  }
                                }}
                                style={{
                                  flex: 1,
                                  paddingVertical: 6,
                                  paddingHorizontal: 8,
                                  borderRadius: 999,
                                  backgroundColor: isSelected ? THEME.accent : THEME.card,
                                  borderWidth: 1,
                                  borderColor: isSelected ? THEME.accent : THEME.cardBorder,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Text style={{ 
                                  fontSize: 12, 
                                  fontWeight: isSelected ? '800' : '700', 
                                  color: isSelected ? THEME.ink : THEME.text 
                                }}>
                                  {km} km
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                      
                    {(hotMatchGeoRefPoint && hotMatchGeoRadiusKm) && (
                      <Text style={{ fontSize: 12, fontWeight: '700', color: THEME.accent, marginTop: 8 }}>
                          ✓ Filtre actif : {hotMatchGeoRadiusKm} km autour de {hotMatchGeoRefPoint.address || 'la position sélectionnée'}
                        </Text>
                      )}
                    </View>
                  )}
                  
                  <Text style={{ color: THEME.muted, fontSize: 12, marginBottom: 8, fontWeight: '700' }}>
                    {filteredMembers.length} membre{filteredMembers.length > 1 ? 's' : ''} trouvé{filteredMembers.length > 1 ? 's' : ''}
                    {(hotMatchSearchQuery.trim() || hotMatchLevelFilter.length > 0 || (hotMatchGeoRefPoint && hotMatchGeoRadiusKm)) && filteredMembers.length !== hotMatchMembers.length && ` sur ${hotMatchMembers.length}`}
                  </Text>
                  <ScrollView style={{ maxHeight: 400, minHeight: 200, backgroundColor: THEME.cardAlt, borderRadius: 24, padding: 8, borderWidth: 1, borderColor: THEME.cardBorder }} showsVerticalScrollIndicator={true}>
                    {filteredMembers.map((member) => (
                  <Pressable
                    key={member.id}
                    onLongPress={() => {
                      console.log('[HotMatch] Appui long sur membre (Pressable parent):', member.id, member.display_name);
                      openProfileFromModal(member);
                    }}
                    delayLongPress={400}
                    onPress={async () => {
                      console.log('[HotMatch] Membre cliqué:', member.id, member.display_name);
                      if (!selectedHotMatch || !groupId) {
                        Alert.alert('Erreur', 'Informations du match manquantes');
                        return;
                      }
                      
                      const slot = selectedHotMatch.time_slots || {};
                      if (!slot.starts_at || !slot.ends_at) {
                        Alert.alert('Erreur', 'Créneau invalide');
                        return;
                      }
                      
                      try {
                        // Créer une disponibilité pour le joueur sélectionné sur ce créneau
                        // Utiliser la fonction RPC pour contourner les restrictions RLS
                        console.log('[HotMatch] Création disponibilité pour:', member.id, 'sur créneau:', slot.starts_at, '-', slot.ends_at);
                        const { error: availabilityError } = await supabase.rpc('set_availability_for_member', {
                          p_target_user: member.id,
                          p_group: groupId,
                          p_start: slot.starts_at,
                          p_end: slot.ends_at,
                          p_status: 'available',
                        });
                        
                        if (availabilityError) {
                          console.error('[HotMatch] Erreur création disponibilité:', availabilityError);
                          throw availabilityError;
                        }
                        
                        // Envoyer une notification au joueur
                        try {
                          await supabase.from('notification_jobs').insert({
                            kind: 'group_slot_hot_3',
                            recipients: [member.id],
                            group_id: groupId,
                            payload: {
                              title: 'Invitation à un match 🔥',
                              message: `${profilesById[String(meId)]?.display_name || 'Un joueur'} vous invite à un match le ${formatRange(slot.starts_at, slot.ends_at)}`,
                            },
                            created_at: new Date().toISOString(),
                          });
                          console.log('[HotMatch] Notification envoyée à:', member.id);
                        } catch (notifError) {
                          console.warn('[HotMatch] Erreur envoi notification:', notifError);
                          // Ne pas faire échouer l'opération si la notification échoue
                        }
                        
                        // Vérifier si on atteint 4 joueurs et créer un match si nécessaire
                        const availableUserIds = selectedHotMatch.available_user_ids || [];
                        const newAvailableUserIds = [...new Set([...availableUserIds, member.id])];
                        
                        if (newAvailableUserIds.length >= 4) {
                          console.log('[HotMatch] 4 joueurs disponibles, création du match...');
                          // Récupérer ou créer le time_slot
                          let timeSlotId = selectedHotMatch.time_slot_id;
                          
                          if (!timeSlotId || timeSlotId.startsWith('virtual-')) {
                            const { data: existingTimeSlot } = await supabase
                              .from('time_slots')
                              .select('id')
                              .eq('group_id', groupId)
                              .eq('starts_at', slot.starts_at)
                              .maybeSingle();
                            
                            if (existingTimeSlot?.id) {
                              timeSlotId = existingTimeSlot.id;
                            } else {
                              const { data: newTimeSlot, error: timeSlotError } = await supabase
                                .from('time_slots')
                                .insert({
                                  group_id: groupId,
                                  starts_at: slot.starts_at,
                                  ends_at: slot.ends_at,
                                })
                                .select('id')
                                .single();
                              
                              if (timeSlotError) {
                                if (timeSlotError.code === '23505' || 
                                    String(timeSlotError.message || '').includes('duplicate key') || 
                                    String(timeSlotError.message || '').includes('unique constraint') ||
                                    String(timeSlotError.message || '').includes('uniq_time_slots')) {
                                  const { data: existingTS } = await supabase
                                    .from('time_slots')
                                    .select('id')
                                    .eq('group_id', groupId)
                                    .eq('starts_at', slot.starts_at)
                                    .maybeSingle();
                                  if (existingTS?.id) {
                                    timeSlotId = existingTS.id;
                                  }
                                } else {
                                  throw timeSlotError;
                                }
                              } else {
                                timeSlotId = newTimeSlot?.id;
                              }
                            }
                          }
                          
                          // Créer le match si le time_slot existe
                          if (timeSlotId && !timeSlotId.startsWith('virtual-')) {
                            const { data: existingMatch } = await supabase
                              .from('matches')
                              .select('id')
                              .eq('group_id', groupId)
                              .eq('time_slot_id', timeSlotId)
                              .maybeSingle();
                            
                            if (!existingMatch) {
                              const { data: newMatch, error: matchError } = await supabase
                                .from('matches')
                                .insert({
                                  group_id: groupId,
                                  time_slot_id: timeSlotId,
                                  status: 'confirmed',
                                  created_by: meId,
                                })
                                .select('id')
                                .single();
                              
                              if (matchError) {
                                console.error('[HotMatch] Erreur création match:', matchError);
                              } else if (newMatch?.id) {
                                // Créer les RSVPs confirmés pour tous les joueurs disponibles
                                const toAccept = (newAvailableUserIds || []).map(String).filter(Boolean);
                                await acceptPlayers(newMatch.id, toAccept);
                                console.log('[HotMatch] Match créé et confirmé avec', toAccept.length, 'joueurs');
                              }
                            }
                          }
                        }
                        
                        Alert.alert('Invitation envoyée', `${member.display_name || member.email} a été invité au match.`);
                        // Fermer la modale et recharger les données
                        setInviteHotMatchModalVisible(false);
                        fetchData();
                      } catch (e) {
                        console.error('[HotMatch] Erreur:', e);
                        Alert.alert('Erreur', `Impossible d'inviter le joueur: ${e?.message || String(e)}`);
                      }
                    }}
                    style={({ pressed }) => ({
                      padding: 12,
                      borderRadius: 20,
                      backgroundColor: pressed ? 'rgba(255,255,255,0.12)' : THEME.cardAlt,
                      borderWidth: 1,
                      borderColor: THEME.cardBorder,
                      marginBottom: 8,
                      flexDirection: 'row',
                      alignItems: 'center',
                      shadowColor: '#000',
                      shadowOpacity: 0.15,
                      shadowRadius: 8,
                      shadowOffset: { width: 0, height: 4 },
                      elevation: 3,
                    })}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <View style={{ marginRight: 12 }}>
                      <LevelAvatar
                        profile={member}
                        size={48}
                        onPress={() => openProfileFromModal(member)}
                        onLongPressProfile={openProfileFromModal}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '800', color: THEME.text, fontSize: 16, marginBottom: 4 }}>
                        {member.display_name || member.email || 'Joueur'}
                      </Text>
                    </View>
                    <Ionicons name="person-add" size={24} color={THEME.accent} />
                  </Pressable>
                ))}
              </ScrollView>
              </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Modale de profil depuis la liste d'invitation */}
      <Modal 
        visible={hotMatchProfileModalVisible} 
        transparent={true} 
        animationType="slide"
        onRequestClose={() => {
          setHotMatchProfileModalVisible(false);
          // Rouvrir la modale d'invitation après fermeture du profil
          setTimeout(() => {
            setInviteHotMatchModalVisible(true);
          }, 100);
        }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 16, padding: 20, width: '90%', maxWidth: 400, maxHeight: '80%' }}>
            {selectedHotMatchProfile && (
              <>
                {/* Bouton retour */}
                <Pressable 
                  onPress={() => {
                    setHotMatchProfileModalVisible(false);
                    // Rouvrir la modale d'invitation après fermeture du profil
                    setTimeout(() => {
                      setInviteHotMatchModalVisible(true);
                    }, 100);
                  }} 
                  style={{ marginBottom: 16, paddingVertical: 8, paddingHorizontal: 12, alignSelf: 'flex-start', borderRadius: 8, backgroundColor: '#f3f4f6' }}
                >
                  <Text style={{ color: '#1a4b97', fontWeight: '700' }}>← Retour</Text>
                </Pressable>

                {/* Avatar + Nom */}
                <View style={{ alignItems: 'center', gap: 8, marginBottom: 20 }}>
                  {selectedHotMatchProfile.avatar_url ? (
                    <Image 
                      source={{ uri: selectedHotMatchProfile.avatar_url }} 
                      style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#f3f4f6' }}
                    />
                  ) : (
                    <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#eaf2ff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#1a4b97' }}>
                      <Text style={{ fontSize: 32, fontWeight: '800', color: '#1a4b97' }}>
                        {(selectedHotMatchProfile.display_name || selectedHotMatchProfile.name || selectedHotMatchProfile.email || 'J').substring(0, 2).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={{ fontSize: 20, fontWeight: '800', color: '#1a4b97', textAlign: 'center' }}>
                    {selectedHotMatchProfile.display_name || selectedHotMatchProfile.name || selectedHotMatchProfile.email || 'Joueur'}
                  </Text>
                  <Pressable onPress={() => Linking.openURL(`mailto:${selectedHotMatchProfile.email}`)}>
                    <Text style={{ fontSize: 13, color: '#3b82f6', textAlign: 'center', textDecorationLine: 'underline' }}>
                      {selectedHotMatchProfile.email}
                    </Text>
                  </Pressable>
                </View>
                
                {/* Résumé visuel */}
                <ScrollView showsVerticalScrollIndicator={true}>
                  <View style={{ backgroundColor: 'white', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, gap: 12 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827' }}>Résumé</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
                      {selectedHotMatchProfile.niveau && (
                        <View style={{ width: '47%', borderWidth: 1, borderColor: '#eef2f7', borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, backgroundColor: '#fafafa' }}>
                          <Text style={{ fontSize: 28 }}>🔥</Text>
                          <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a4b97' }}>{selectedHotMatchProfile.niveau}</Text>
                          <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Niveau</Text>
                        </View>
                      )}
                      {selectedHotMatchProfile.main && (
                        <View style={{ width: '47%', borderWidth: 1, borderColor: '#eef2f7', borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, backgroundColor: '#fafafa' }}>
                          <Text style={{ fontSize: 28 }}>🖐️</Text>
                          <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a4b97' }}>{selectedHotMatchProfile.main}</Text>
                          <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Main</Text>
                        </View>
                      )}
                      {selectedHotMatchProfile.cote && (
                        <View style={{ width: '47%', borderWidth: 1, borderColor: '#eef2f7', borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, backgroundColor: '#fafafa' }}>
                          <Text style={{ fontSize: 28 }}>🎯</Text>
                          <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a4b97' }}>{selectedHotMatchProfile.cote}</Text>
                          <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Côté</Text>
                        </View>
                      )}
                      {selectedHotMatchProfile.club && (
                        <View style={{ width: '47%', borderWidth: 1, borderColor: '#eef2f7', borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, backgroundColor: '#fafafa' }}>
                          <Text style={{ fontSize: 28 }}>🏟️</Text>
                          <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a4b97' }}>{selectedHotMatchProfile.club}</Text>
                          <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Club</Text>
                        </View>
                      )}
                      {selectedHotMatchProfile.rayon_km != null && (
                        <View style={{ width: '47%', borderWidth: 1, borderColor: '#eef2f7', borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, backgroundColor: '#fafafa' }}>
                          <Text style={{ fontSize: 28 }}>📍</Text>
                          <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a4b97' }}>
                            {selectedHotMatchProfile.rayon_km === 99 ? '+30 km' : `${selectedHotMatchProfile.rayon_km} km`}
                          </Text>
                          <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Rayon</Text>
                        </View>
                      )}
                      {selectedHotMatchProfile.phone && (
                        <Pressable 
                          onPress={() => Linking.openURL(`tel:${selectedHotMatchProfile.phone}`)}
                          style={{ width: '47%', borderWidth: 1, borderColor: '#eef2f7', borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, backgroundColor: '#fafafa' }}
                        >
                          <Text style={{ fontSize: 28 }}>📞</Text>
                          <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a4b97' }}>{selectedHotMatchProfile.phone}</Text>
                          <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Téléphone</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Bottom sheet confirmation création match */}
      {(() => {
        const ids = pendingCreate?.commonClubIds ?? [];
        console.log('[HotMatch] render pendingCreate:', !!pendingCreate, 'ids:', ids.length, 'clubs:', confirmCommonClubs.length);
        return null;
      })()}
      <Modal transparent animationType="slide" visible={!!pendingCreate} onRequestClose={() => closeConfirm('cancel')}>
        {(() => {
          const ids = pendingCreate?.commonClubIds ?? [];
          console.log('[HotMatch] render visible:', !!pendingCreate, 'ids:', ids.length, 'clubs:', confirmCommonClubs.length);
          return null;
        })()}
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: THEME.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={{ color: THEME.text, fontSize: 16, fontWeight: '800' }}>Confirmer le match</Text>
              <Pressable onPress={() => closeConfirm('cancel')} style={{ padding: 6 }}>
                <Ionicons name="close" size={22} color={THEME.text} />
              </Pressable>
            </View>

            {/* Récap */}
            <View style={{ backgroundColor: THEME.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: THEME.cardBorder }}>
              <Text style={{ color: THEME.muted, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>Récap</Text>
              <Text style={{ color: THEME.text, fontSize: 14, fontWeight: '800' }}>
                {pendingCreate?.startsAt && pendingCreate?.endsAt ? formatRange(pendingCreate.startsAt, pendingCreate.endsAt) : 'Créneau'}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {(confirmPlayerIds || []).map((uid) => {
                  const p = profilesById[String(uid)];
                  const label = p?.display_name || p?.name || p?.email || 'Joueur';
                  return (
                    <View key={uid} style={{ paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' }}>
                      <Text style={{ color: THEME.text, fontSize: 11, fontWeight: '700' }}>{label}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <Divider m={12} />

            {/* Clubs communs */}
            <Text style={{ color: THEME.text, fontSize: 14, fontWeight: '800', marginBottom: 4 }}>Choisis le club</Text>
            <Text style={{ color: THEME.muted, fontSize: 12, marginBottom: 10 }}>Clubs acceptés par les 4 joueurs</Text>

            {confirmClubsLoading ? (
              <View style={{ paddingVertical: 20, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={THEME.accent} />
              </View>
            ) : (pendingCreate?.commonClubIds ?? []).length === 0 ? (
              <View style={{ backgroundColor: THEME.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: THEME.cardBorder }}>
                <Text style={{ color: THEME.text, fontWeight: '800', marginBottom: 6 }}>
                  Aucun club en commun entre les 4 joueurs.
                </Text>
                <Text style={{ color: THEME.muted, fontSize: 12, marginBottom: 12 }}>
                  Chaque joueur doit avoir accepté le club dans ses préférences.
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => closeConfirm('change-player')}
                    style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', paddingVertical: 10, borderRadius: 10, alignItems: 'center' }}
                  >
                    <Text style={{ color: THEME.text, fontWeight: '700', fontSize: 12 }}>Changer un joueur</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                {!confirmClubsLoading && (confirmCommonClubs || []).length === 0 ? (
                  <View style={{ backgroundColor: THEME.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: THEME.cardBorder, marginBottom: 10 }}>
                    <Text style={{ color: THEME.text, fontWeight: '800', marginBottom: 6 }}>
                      Aucun club trouvé pour ces IDs.
                    </Text>
                    <Text style={{ color: THEME.muted, fontSize: 12 }}>
                      Vérifie la requête Supabase, la table 'clubs' ou les règles RLS.
                    </Text>
                  </View>
                ) : null}
                {(confirmCommonClubs || []).length >= 5 ? (
                  <View style={{ marginBottom: 10 }}>
                    <TextInput
                      value={confirmClubSearch}
                      onChangeText={setConfirmClubSearch}
                      placeholder="Rechercher un club"
                      placeholderTextColor={THEME.muted}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 10,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: THEME.cardBorder,
                        backgroundColor: 'rgba(255,255,255,0.06)',
                        color: THEME.text,
                      }}
                    />
                  </View>
                ) : null}

                {(confirmCommonClubs || []).length === 1 && confirmCommonClubs[0] ? (
                  <Text style={{ color: THEME.muted, fontSize: 12, marginBottom: 8 }}>
                    Club commun trouvé : <Text style={{ color: THEME.text, fontWeight: '800' }}>{confirmCommonClubs[0].name}</Text>
                  </Text>
                ) : null}

                {/* Boutons toggles (sélection unique) */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  {(filteredConfirmClubs || []).map((club) => {
                    const active = String(confirmClubId) === String(club.id);
                    return (
                      <Pressable
                        key={`toggle-${club.id}`}
                        onPress={() => setConfirmClubId(club.id)}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: active ? THEME.accent : THEME.cardBorder,
                          backgroundColor: active ? THEME.accent : THEME.card,
                        }}
                      >
                        <Text style={{ color: active ? THEME.ink : THEME.text, fontWeight: '800', fontSize: 12 }}>
                          {club.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <ScrollView style={{ maxHeight: 220 }}>
                  {(filteredConfirmClubs || []).map((club) => {
                    const active = String(confirmClubId) === String(club.id);
                    return (
                      <Pressable
                        key={club.id}
                        onPress={() => setConfirmClubId(club.id)}
                        style={{
                          paddingVertical: 10,
                          paddingHorizontal: 12,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: active ? THEME.accent : THEME.cardBorder,
                          backgroundColor: active ? THEME.accentSoft : THEME.card,
                          marginBottom: 8,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: THEME.text, fontWeight: '800', fontSize: 13 }} numberOfLines={1}>
                            {club.name}
                          </Text>
                          <Text style={{ color: THEME.muted, fontSize: 11, marginTop: 2 }}>✅ accepté par 4/4</Text>
                        </View>
                        <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={18} color={active ? THEME.accent : THEME.muted} />
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            )}

            <Pressable
              onPress={() => handleConfirmCreate('confirm')}
              disabled={!confirmClubId || (pendingCreate?.commonClubIds ?? []).length === 0}
              style={{
                marginTop: 12,
                backgroundColor: confirmClubId ? THEME.accent : 'rgba(255,255,255,0.12)',
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: confirmClubId ? THEME.ink : THEME.muted, fontWeight: '800', fontSize: 14 }}>
                Confirmer le match
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Popup "Match créé" avec annulation */}
      <MatchCreatedUndoModal
        visible={matchCreatedUndoVisible}
        durationSeconds={MATCH_CREATED_UNDO_SECONDS}
        onConfirm={handleMatchCreatedUndoConfirm}
        onCancel={handleMatchCreatedUndoCancel}
        onTimeout={handleMatchCreatedUndoTimeout}
      />

      {/* Modale de contacts du joueur */}
      <Modal visible={playerContactsModalVisible} transparent animationType="fade" onRequestClose={() => setPlayerContactsModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <View style={{ width: '90%', maxWidth: 500, backgroundColor: '#ffffff', borderRadius: 16, padding: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontWeight: '900', fontSize: 18, color: '#0b2240' }}>Contacts</Text>
              <Pressable onPress={() => setPlayerContactsModalVisible(false)} style={{ padding: 8 }}>
                <Ionicons name="close" size={24} color="#111827" />
              </Pressable>
            </View>
            
            {selectedPlayerForContacts ? (
              <>
                {/* Avatar et nom */}
                <View style={{ alignItems: 'center', marginBottom: 24 }}>
                  {selectedPlayerForContacts.avatar_url ? (
                    <Image
                      source={{ uri: selectedPlayerForContacts.avatar_url }}
                      style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 12 }}
                    />
                  ) : (
                    <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#eaf2ff', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                      <Text style={{ color: '#156bc9', fontWeight: '800', fontSize: 32 }}>
                        {(selectedPlayerForContacts.display_name || selectedPlayerForContacts.email || 'J').substring(0, 2).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={{ fontWeight: '800', color: '#111827', fontSize: 18, marginBottom: 4 }}>
                    {selectedPlayerForContacts.display_name || selectedPlayerForContacts.email || 'Joueur'}
                  </Text>
                  {selectedPlayerForContacts.niveau && (
                    <Text style={{ fontSize: 14, color: '#6b7280' }}>
                      Niveau {selectedPlayerForContacts.niveau}
                    </Text>
                  )}
                </View>

                {/* Boutons de contact */}
                <View style={{ gap: 12 }}>
                  {selectedPlayerForContacts.phone ? (
                    <Pressable
                      onPress={() => {
                        const telUrl = `tel:${selectedPlayerForContacts.phone}`;
                        Linking.openURL(telUrl).catch(() => {
                          Alert.alert('Erreur', 'Impossible d\'ouvrir l\'application téléphone');
                        });
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 14,
                        paddingHorizontal: 16,
                        backgroundColor: '#f3f4f6',
                        borderRadius: 10,
                        gap: 12,
                      }}
                    >
                      <Ionicons name="call" size={24} color="#15803d" />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '700', color: '#111827', fontSize: 16 }}>Téléphone</Text>
                        <Text style={{ color: '#6b7280', fontSize: 14 }}>{selectedPlayerForContacts.phone}</Text>
                      </View>
                    </Pressable>
                  ) : null}

                  {selectedPlayerForContacts.email ? (
                    <Pressable
                      onPress={() => {
                        const mailUrl = `mailto:${selectedPlayerForContacts.email}`;
                        Linking.openURL(mailUrl).catch(() => {
                          Alert.alert('Erreur', 'Impossible d\'ouvrir l\'application email');
                        });
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 14,
                        paddingHorizontal: 16,
                        backgroundColor: '#f3f4f6',
                        borderRadius: 10,
                        gap: 12,
                      }}
                    >
                      <Ionicons name="mail" size={24} color="#156bc9" />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '700', color: '#111827', fontSize: 16 }}>Email</Text>
                        <Text style={{ color: '#6b7280', fontSize: 14 }}>{selectedPlayerForContacts.email}</Text>
                      </View>
                    </Pressable>
                  ) : null}

                  {selectedPlayerForContacts.phone ? (
                    <Pressable
                      onPress={() => {
                        const smsUrl = `sms:${selectedPlayerForContacts.phone}`;
                        Linking.openURL(smsUrl).catch(() => {
                          Alert.alert('Erreur', 'Impossible d\'ouvrir l\'application SMS');
                        });
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 14,
                        paddingHorizontal: 16,
                        backgroundColor: '#f3f4f6',
                        borderRadius: 10,
                        gap: 12,
                      }}
                    >
                      <Ionicons name="chatbubble" size={24} color="#7c3aed" />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '700', color: '#111827', fontSize: 16 }}>SMS</Text>
                        <Text style={{ color: '#6b7280', fontSize: 14 }}>{selectedPlayerForContacts.phone}</Text>
                      </View>
                    </Pressable>
                  ) : null}

                  {!selectedPlayerForContacts.phone && !selectedPlayerForContacts.email && (
                    <View style={{ padding: 16, backgroundColor: '#fef3c7', borderRadius: 10 }}>
                      <Text style={{ color: '#92400e', fontSize: 14, textAlign: 'center' }}>
                        Aucun contact disponible pour ce joueur
                      </Text>
                    </View>
                  )}
                </View>
              </>
            ) : (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ color: '#6b7280', textAlign: 'center' }}>
                  Aucun joueur sélectionné
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal de clubs (fallback si aucun téléphone de groupe) */}
      <Modal
        visible={clubFallbackModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setClubFallbackModalOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <View style={{ width: '90%', maxWidth: 520, backgroundColor: '#ffffff', borderRadius: 16, padding: 20, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontWeight: '900', fontSize: 18, color: '#0b2240' }}>Appeler un club</Text>
              <Pressable onPress={() => setClubFallbackModalOpen(false)} style={{ padding: 8 }}>
                <Ionicons name="close" size={24} color="#111827" />
              </Pressable>
            </View>

            {clubFallbackLoading ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#156bc9" />
                <Text style={{ marginTop: 12, color: '#6b7280' }}>Chargement des clubs...</Text>
              </View>
            ) : (
              <>
                <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                  <TextInput
                    placeholder="Rechercher un club (nom, adresse, téléphone)"
                    placeholderTextColor="#9ca3af"
                    value={clubFallbackSearchQuery}
                    onChangeText={setClubFallbackSearchQuery}
                    style={{
                      backgroundColor: '#ffffff',
                      borderWidth: 1,
                      borderColor: '#e5e7eb',
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      color: '#111827',
                      marginBottom: 8
                    }}
                    returnKeyType="search"
                  />
                </View>

                {visibleClubFallbacks.length === 0 ? (
                  <View style={{ padding: 20 }}>
                    <Text style={{ color: '#6b7280', textAlign: 'center', marginBottom: 8 }}>
                      {clubFallbackSearchQuery ? 'Aucun club ne correspond à votre recherche.' : clubFallbacks.length === 0 ? 'Aucun club chargé.' : 'Aucun club affiché.'}
                    </Text>
                    {clubFallbackSearchQuery && clubFallbacks.length > 0 && (
                      <Text style={{ color: '#9ca3af', textAlign: 'center', fontSize: 11 }}>
                        Total: {clubFallbacks.length} club(s) chargé(s)
                      </Text>
                    )}
                  </View>
                ) : (
                  <ScrollView style={{ maxHeight: 420 }}>
                    {visibleClubFallbacks.map((club) => {
                      const hasPhone = !!club.phoneNumber;
                      return (
                        <Pressable
                          key={club.id}
                          onPress={() => {
                            if (hasPhone) {
                              Linking.openURL(`tel:${club.phoneNumber}`);
                              setClubFallbackModalOpen(false);
                            } else {
                              Alert.alert('Information', `Le club "${club.name}" n'a pas de numéro de téléphone renseigné.`);
                            }
                          }}
                          disabled={!hasPhone}
                          style={({ pressed }) => ({
                            paddingVertical: 12,
                            paddingHorizontal: 12,
                            borderRadius: 10,
                            backgroundColor: pressed && hasPhone ? '#f3f4f6' : '#ffffff',
                            borderWidth: 1,
                            borderColor: hasPhone ? '#e5e7eb' : '#f3f4f6',
                            marginBottom: 8,
                            opacity: hasPhone ? 1 : 0.6,
                          })}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View style={{ flex: 1, paddingRight: 8 }}>
                              <Text style={{ fontWeight: '800', color: '#111827', fontSize: 15, marginBottom: 4 }}>
                                {club.name}
                              </Text>
                              {club.address && (
                                <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                                  {club.address}
                                </Text>
                              )}
                              <Text style={{ fontSize: 12, color: hasPhone ? '#111827' : '#9ca3af', fontWeight: hasPhone ? '700' : '400' }}>
                                {hasPhone ? club.phoneNumber : 'Pas de téléphone'}
                              </Text>
                              {club.distanceKm !== Infinity && typeof club.distanceKm === 'number' && (
                                <Text style={{ fontSize: 12, color: '#156bc9', fontWeight: '700', marginTop: 2 }}>
                                  📍 {club.distanceKm.toFixed(1)} km
                                </Text>
                              )}
                            </View>
                            {hasPhone ? (
                              <Ionicons name="call" size={22} color="#15803d" />
                            ) : (
                              <Ionicons name="call-outline" size={22} color="#9ca3af" />
                            )}
                          </View>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Week navigator - Positionné en bas */}
      <View
        onLayout={updateMeasuredHeight(setWeekBarMeasuredHeight, WEEK_BAR_HEIGHT)}
        style={{
          position: 'absolute',
          bottom: weekNavigatorBottom,
          left: 0,
          right: 0,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          paddingVertical: 0,
          paddingHorizontal: 6,
          backgroundColor: 'transparent',
          zIndex: 999,
          elevation: 9,
          marginBottom: 0,
        }}
      >
        <Pressable
          onPress={() => setWeekOffset((x) => x - 1)}
          accessibilityRole="button"
          accessibilityLabel="Semaine précédente"
          hitSlop={10}
          style={{ padding: 8, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="caret-back" size={32} color={COLORS.primary} />
        </Pressable>

        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 4,
            borderRadius: 999,
            width: 280,
            alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.16)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.22)',
            shadowColor: '#000000',
            shadowOpacity: 0.25,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
            elevation: 3,
          }}
        >
          <Text style={{ 
            fontWeight: '800', 
            fontSize: 15, 
            color: THEME.text,
            textShadowColor: 'rgba(0,0,0,0.6)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 2,
          }}>
            {formatWeekRangeLabel(currentWs, currentWe)}
          </Text>
        </View>

        <Pressable
          onPress={() => setWeekOffset((x) => x + 1)}
          accessibilityRole="button"
          accessibilityLabel="Semaine suivante"
          hitSlop={10}
          style={{ padding: 8, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="caret-forward" size={32} color={COLORS.primary} />
        </Pressable>
      </View>


      {/* Popup pas de groupe sélectionné */}
      <OnboardingModal
        visible={noGroupModalVisible}
        message="choisis un groupe"
        onClose={() => {
          setNoGroupModalVisible(false);
          // Rediriger vers groupes après fermeture
          router.replace("/(tabs)/groupes");
        }}
      />
    </View>
  );
}