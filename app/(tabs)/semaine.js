// app/(tabs)/semaine.js
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import dayjs from "dayjs";
import "dayjs/locale/fr";
import isoWeek from "dayjs/plugin/isoWeek";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, DeviceEventEmitter, Image, Modal, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { OnboardingModal } from "../../components/OnboardingModal";
import { useActiveGroup } from "../../lib/activeGroup";
import { hasAvailabilityForGroup } from "../../lib/availabilityCheck";
import { FLAG_KEYS, getOnboardingFlag, setOnboardingFlag } from "../../lib/onboardingFlags";
import { useIsSuperAdmin, useCanManageGroup } from "../../lib/roles";
import { supabase } from "../../lib/supabase";
import { press } from "../../lib/uiSafe";
import ballIcon from '../../assets/icons/tennis_ball_yellow.png';


// Fallback alert helper (web/mobile)
function safeAlert(title = 'Info', message = '') {
  try {
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (typeof window !== 'undefined' && window.alert) {
        window.alert(`${title}\n\n${message}`);
      } else {
        console.log('[ALERT]', title, message);
      }
    } else {
      Alert.alert(title, message);
    }
  } catch (e) {
    console.log('[ALERT]', title, message);
  }
}

// --- Normalisation des statuts RSVP (client → enum rsvp_status) ---
// Enum en base : { yes, maybe, no, accepted }
export function normalizeRsvpStatus(status) {
  const s = String(status || "").toLowerCase().trim();
  if (["ok", "oui", "dispo", "present", "présent", "going", "available"].includes(s)) return "yes";
  if (s === "accepted" || s === "accepté") return "accepted";
  if (["no", "non", "absent"].includes(s)) return "no";
  return "maybe";
}

dayjs.extend(isoWeek);
dayjs.locale("fr");

// Format: "Lun 13 oct. – Dim 19 oct. 2025"
function formatWeekRangeLabel(ws, we) {
  const makeLabel = (d, withYear = false) => {
    let s = d.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
    });
    // Remove trailing dot after the weekday (ex: "lun." -> "lun"), keep month dot; capitalize weekday
    s = s.replace(/^([a-zA-Zéû]{3})\.(\s)/, (_, w, sp) => w.charAt(0).toUpperCase() + w.slice(1) + sp);
    // If no dot after weekday, still capitalize the first letter
    s = s.replace(/^([a-zA-Zéû]{3})(\s)/, (_, w, sp) => w.charAt(0).toUpperCase() + w.slice(1) + sp);
    return s;
  };
  const d1 = makeLabel(ws, false);
  const d2 = makeLabel(we, true);
  return `${d1} – ${d2}`;
}

const BRAND = "#156BC9";
const BG_PAGE = "#2b5abc"; // fond global (non utilisé ici)
const ORANGE = "#FF751F";  // accent charte
const START_HOUR = 8;
const END_HOUR = 23;
const SLOT_MIN = 30;            // créneaux de 30 min
const SLOT_HEIGHT = 32;         // hauteur visuelle d’un créneau réduite
const FONT_HOUR = 13;           // taille du texte dans les cellules
const FIRST_COL_FONT_PORTRAIT = 12; // taille heures (colonne de gauche) en portrait
const FIRST_COL_FONT_LANDSCAPE = 11; // taille heures (colonne de gauche) en paysage
const SLOTS_PER_DAY = (END_HOUR - START_HOUR) * (60 / SLOT_MIN) + 1; // +1 pour inclure 23:00

export default function Semaine() {
  const scrollRef = React.useRef(null);
  const scrollYRef = React.useRef(0);
  const headerListRef = React.useRef(null);
  const bodyListRef   = React.useRef(null);
  const isSyncingRef  = React.useRef(false);
  const refreshTimerRef = React.useRef(null);
  const lastDataRef = React.useRef({ ts: null, av: null, m: null });
  const fetchDataRef = React.useRef(null);
  const scheduleRefresh = useCallback((ms = 200) => {
    try { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); } catch {}
    refreshTimerRef.current = setTimeout(() => { try { fetchDataRef.current?.(); } catch {} }, ms);
  }, []);
  React.useEffect(() => () => { try { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); } catch {} }, []);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  // ---- ÉTATS ----
  const [weekStart, setWeekStart] = useState(dayjs().startOf("isoWeek"));
  const [timeSlots, setTimeSlots] = useState([]); // time_slots (starts_at/ends_at/group_id)
  const [slots, setSlots] = useState([]);         // availability (avec status)
  const [matches, setMatches] = useState([]);     // matches liés aux time_slots
  const [loading, setLoading] = useState(false);
  const [meId, setMeId] = useState(null);
  const [persistedGroupId, setPersistedGroupId] = useState(null);
  const [groupMembers, setGroupMembers] = useState([]); // membres du groupe actuel
  const [applyToAllGroups, setApplyToAllGroups] = useState(true); // toggle global vs groupe spécifique
  // Utiliser les nouveaux hooks de rôles
  const isSuperAdmin = useIsSuperAdmin();
  const { canManage: isAdmin, loading: isAdminLoading } = useCanManageGroup(groupId);
  // Sélecteur de groupe
  const [groupSelectorOpen, setGroupSelectorOpen] = useState(false);
  const [myGroups, setMyGroups] = useState([]);
  const isPortrait = height > width;
  const disposPromptShownRef = React.useRef(false);

  // États pour les popups d'onboarding
  const [disposVisitedModalVisible, setDisposVisitedModalVisible] = useState(false);
  const [noAvailabilityModalVisible, setNoAvailabilityModalVisible] = useState(false);
  const [noGroupModalVisible, setNoGroupModalVisible] = useState(false);
  const [showDisposPromptModal, setShowDisposPromptModal] = useState(false);
  // ---- (plus de mode peinture global) ----

  // Fenêtre d'application de plage sur d'autres jours
  const [applyModal, setApplyModal] = useState({
    visible: false,
    baseDayIndex: 0,
    startIdx: 0,
    endIdx: 0,
    intent: 'available', // 'available' | 'neutral'
    selected: Array(7).fill(false), // jours cochés (0 = Lundi ... 6 = Dimanche)
  });

  // --- Sélection par appui long (mode tableau) ---
  const [rangeStart, setRangeStart] = useState(null);    // { dayIndex, slotIdx }
  const [rangeHover, setRangeHover] = useState(null);    // slotIdx courant
  const [rangeIntent, setRangeIntent] = useState('available'); // 'available' | 'neutral'

  const { activeGroup, setActiveGroup } = useActiveGroup();
  useEffect(() => {
  // relance ton chargement/rafraîchissement ici (ce que tu fais déjà au mount)
  // Par ex. refetchSemaine();
}, [activeGroup?.id]);
  const groupId = activeGroup?.id ?? persistedGroupId ?? null;

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      setMeId(u?.user?.id ?? null);
    })();
  }, []);

  // Vérifier si un groupe est sélectionné au focus
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      (async () => {
        if (!mounted) return;
        
        // Vérifier si un groupe est sélectionné
        if (!activeGroup?.id) {
          // Pas de groupe sélectionné, afficher popup
          setNoGroupModalVisible(true);
          return;
        }
        
        // Si groupe sélectionné, vérifier si c'est la première visite ET pas de disponibilités renseignées
        if (groupId && meId) {
          try {
            const hasVisited = await getOnboardingFlag(FLAG_KEYS.DISPOS_VISITED);
            if (!hasVisited) {
              await setOnboardingFlag(FLAG_KEYS.DISPOS_VISITED, true);
              
              // Vérifier si des disponibilités existent pour le groupe actif
              const hasAvail = await hasAvailabilityForGroup(meId, groupId);
              
              if (!hasAvail && mounted) {
                // Première visite ET pas de dispos -> afficher popup
                setNoAvailabilityModalVisible(true);
              }
            }
          } catch (e) {
            console.warn('[Semaine] Error checking availability on focus:', e);
          }
        }
      })();
      return () => { mounted = false; };
    }, [activeGroup?.id, groupId, meId])
  );

  // Charger les membres du groupe actuel
  const loadGroupMembers = useCallback(async (groupId) => {
    if (!groupId) {
      setGroupMembers([]);
      return;
    }
    try {
      const { data: gms, error: eGM } = await supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", groupId);
      if (eGM) throw eGM;

      const memberIds = (gms ?? []).map((gm) => gm.user_id);
      setGroupMembers(memberIds);
    } catch (e) {
      console.warn('[Semaine] Erreur chargement membres:', e?.message ?? String(e));
      setGroupMembers([]);
    }
  }, []);

  useEffect(() => {
    loadGroupMembers(groupId);
  }, [groupId, loadGroupMembers]);

  // Les hooks useIsSuperAdmin et useCanManageGroup gèrent automatiquement les vérifications

  const params = useLocalSearchParams();

  // Détecter le paramètre showDisposPrompt pour afficher la popup
  useEffect(() => {
    if (params?.showDisposPrompt === 'true' && !disposPromptShownRef.current) {
      disposPromptShownRef.current = true;
      setShowDisposPromptModal(true);
    }
  }, [params?.showDisposPrompt]);

  // 0) If a groupId is provided via route params, persist it
  useEffect(() => {
    const incoming = params?.groupId || params?.group_id;
    if (incoming) {
      const str = String(incoming);
      setPersistedGroupId(str);
      AsyncStorage.setItem("active_group_id", str).catch(() => {});
    }
  }, [params?.groupId, params?.group_id]);

  // 1) Keep a persisted fallback of the active group id
  useEffect(() => {
    (async () => {
      try {
        if (activeGroup?.id) {
          await AsyncStorage.setItem("active_group_id", String(activeGroup.id));
          setPersistedGroupId(String(activeGroup.id));
        } else {
          const saved = await AsyncStorage.getItem("active_group_id");
          if (saved) setPersistedGroupId(saved);
        }
      } catch {}
    })();
  }, [activeGroup?.id]);

  // Charger la préférence "appliquer à tous les groupes"
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("apply_availability_to_all_groups");
        if (saved !== null) {
          setApplyToAllGroups(saved === 'true');
        }
      } catch {}
    })();
  }, []);

  // Sauvegarder la préférence quand elle change
  useEffect(() => {
    AsyncStorage.setItem("apply_availability_to_all_groups", String(applyToAllGroups)).catch(() => {});
  }, [applyToAllGroups]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => weekStart.add(i, "day")),
    [weekStart]
  );

  const hoursOfDay = useMemo(() => {
    const out = [];
    for (let h = START_HOUR; h < END_HOUR; h++) {
      out.push({ hour: h, minute: 0 });
      out.push({ hour: h, minute: 30 });
    }
    // Inclure le dernier créneau "HH:00" à END_HOUR (ici 23:00)
    out.push({ hour: END_HOUR, minute: 0 });
    return out;
  }, []);

  // Fonction centralisée pour normaliser une date de créneau (enlever secondes et millisecondes)
  const normalizeSlotTime = useCallback((dateIso) => {
    return dayjs(dateIso).second(0).millisecond(0).toISOString();
  }, []);

  const keySlot = (d, hour, minute) =>
    dayjs(d).hour(hour).minute(minute).second(0).millisecond(0).toISOString();

  // Pré-calcul: membres du groupe (Set)
  const memberIdsSet = useMemo(() => new Set((groupMembers || []).map(id => String(id))), [groupMembers]);

  // Pré-calcul: slots filtrés pour le groupe/membres
  const slotsForGroup = useMemo(() => {
    if (!groupId) return [];
    const gidStr = String(groupId);
    const allSlots = slots || [];
    // Filtrer par group_id
    const byGroup = allSlots.filter((s) => {
      const sGroupId = s?.group_id;
      if (!sGroupId) return false;
      return String(sGroupId) === gidStr;
    });
    // Si on a des membres chargés, filtrer par membres
    if (groupMembers && groupMembers.length > 0 && memberIdsSet.size > 0) {
      return byGroup.filter((s) => memberIdsSet.has(String(s.user_id)));
    }
    // Sinon, prendre toutes les disponibilités du groupe
    return byGroup;
  }, [slots, groupId, memberIdsSet, groupMembers]);

  // Pré-calcul optimisé: nombre de joueurs disponibles par créneau (clé = startIso)
  const cellCountByStartIso = useMemo(() => {
    const counts = new Map();
    if (!days?.length || !hoursOfDay?.length) return counts;
    
    // Pré-calculer les dates des slots une seule fois
    const slotDates = new Map();
    for (const day of days) {
      for (const { hour, minute } of hoursOfDay) {
        const startIso = keySlot(day, hour, minute);
        const slotStart = dayjs(startIso);
        const slotEnd = dayjs(startIso).add(30, 'minute');
        if (slotStart.isValid() && slotEnd.isValid()) {
          slotDates.set(startIso, { start: slotStart, end: slotEnd });
        } else {
          counts.set(startIso, 0);
        }
      }
    }
    
    // Pré-parser les disponibilités une seule fois
    const parsedSlots = [];
    for (const s of slotsForGroup) {
      if (!s?.user_id || !s?.start) continue;
      if (String(s.status || 'neutral').toLowerCase() !== 'available') continue;
      const availStart = dayjs(s.start);
      if (!availStart.isValid()) continue;
      const availEnd = s.end ? dayjs(s.end) : availStart.add(30, 'minute');
      if (!availEnd.isValid()) continue;
      const uid = String(s.user_id);
      const time = dayjs(s.created_at || s.updated_at || s.start).valueOf();
      parsedSlots.push({ uid, availStart, availEnd, time });
    }
    
    // Pour chaque slot, compter les disponibilités qui le couvrent
    for (const [startIso, { start: slotStart, end: slotEnd }] of slotDates.entries()) {
      const uniqueByUser = new Map();
      const slotStartMs = slotStart.valueOf();
      const slotEndMs = slotEnd.valueOf();
      for (const { uid, availStart, availEnd: availEndDate, time } of parsedSlots) {
        const availStartMs = availStart.valueOf();
        const availEndMs = availEndDate.valueOf();
        // La disponibilité doit commencer avant ou à l'heure du slot ET finir après ou à l'heure de fin du slot
        if (availStartMs <= slotStartMs && availEndMs >= slotEndMs) {
          const existing = uniqueByUser.get(uid);
          if (!existing || time > existing) {
            uniqueByUser.set(uid, time);
          }
        }
      }
      counts.set(startIso, uniqueByUser.size);
    }
    
    return counts;
  }, [days, hoursOfDay, slotsForGroup, weekStart]);

  // Génère les heures: 08:00, 08:30, ..., 21:30
  function isoRangeForDay(dayObj, startIdx, endIdx) {
    const a = Math.min(startIdx, endIdx);
    const b = Math.max(startIdx, endIdx);
    const list = [];
    for (let i = a; i <= b; i++) {
      const { hour, minute } = hoursOfDay[i];
      list.push(keySlot(dayObj, hour, minute));
    }
    return list;
  }
  // Synchronize horizontal scroll between header and body
  const syncHorizontal = React.useCallback((from, x) => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    try {
      if (from === 'header') {
        bodyListRef.current?.scrollToOffset?.({ offset: x, animated: false });
      } else if (from === 'body') {
        headerListRef.current?.scrollToOffset?.({ offset: x, animated: false });
      }
    } finally {
      setTimeout(() => { isSyncingRef.current = false; }, 0);
    }
  }, []);

  // Fetch semaine
  const fetchData = useCallback(async () => {
    try {
      if (!loading) setLoading(true);
      const start = weekStart.toISOString();
      const end = weekStart.add(7, "day").toISOString();

      // 1) time_slots
      let tsQ = supabase
        .from("time_slots")
        .select("id, starts_at, ends_at, group_id")
        .gte("starts_at", start)
        .lt("starts_at", end);
      tsQ = groupId ? tsQ.eq("group_id", groupId) : tsQ.is("group_id", null);
      const { data: ts, error: eTS } = await tsQ;
      if (eTS) throw eTS;

      // 2) availability (via get_availability_effective pour modèle hybride)
      let av = [];
      if (groupId) {
        console.log('[fetchData] Chargement disponibilités pour groupe:', groupId, 'semaine:', start, '->', end);
        const { data: avData, error: eAv } = await supabase
          .rpc("get_availability_effective", {
            p_group: groupId,
            p_user: null, // tous les utilisateurs
            p_low: start,
            p_high: end,
          });
        if (eAv) throw eAv;
        av = avData ?? [];
        console.log('[fetchData] Disponibilités effectives chargées:', av.length);
        
        // Charger aussi les exceptions 'neutral' de l'utilisateur depuis availability
        // car get_availability_effective les exclut, mais on en a besoin pour l'affichage
        // IMPORTANT: on ne charge que celles qui masquent une disponibilité globale existante
        if (meId) {
          const { data: neutralExceptions, error: eNeutral } = await supabase
            .from("availability")
            .select("*")
            .eq("user_id", meId)
            .eq("group_id", groupId)
            .eq("status", "neutral")
            .gte("start", start)
            .lt("start", end);
          if (!eNeutral && neutralExceptions && neutralExceptions.length > 0) {
            console.log('[fetchData] Exceptions "neutral" trouvées:', neutralExceptions.length);
            // Vérifier pour chaque exception 'neutral' si une disponibilité globale existe
            // On ne garde que celles qui masquent effectivement une globale
            const { data: globalAvailabilities, error: eGlobal } = await supabase
              .from("availability_global")
              .select("start, end")
              .eq("user_id", meId)
              .gte("start", start)
              .lt("start", end);
            
            if (!eGlobal && globalAvailabilities) {
              console.log('[fetchData] Disponibilités globales trouvées:', globalAvailabilities.length);
              const globalStarts = new Set(
                globalAvailabilities.map(g => normalizeSlotTime(g.start))
              );
              // Filtrer pour ne garder que les exceptions 'neutral' qui masquent une globale
              const validNeutralExceptions = neutralExceptions.filter(ne => {
                const normalizedStart = normalizeSlotTime(ne.start);
                return globalStarts.has(normalizedStart);
              });
              console.log('[fetchData] Exceptions "neutral" valides (masquent une globale):', validNeutralExceptions.length);
              if (validNeutralExceptions.length > 0) {
                av = [...av, ...validNeutralExceptions];
              }
            } else {
              console.log('[fetchData] Pas de disponibilités globales trouvées pour cette période');
            }
          }
        }
      } else {
        // Fallback si pas de groupe: lecture directe (ancien mode)
        let avQ = supabase
          .from("availability")
          .select("*")
          .gte("start", start)
          .lt("start", end)
          .is("group_id", null);
        const { data: avData, error: eAv } = await avQ;
        if (eAv) throw eAv;
        av = avData ?? [];
      }

      // 3) matches (via IN sur time_slot_id)
      let mData = [];
      const slotIds = (ts ?? []).map((t) => t.id);
      if (slotIds.length) {
        let mq = supabase
          .from("matches")
          .select("id, status, group_id, time_slot_id")
          .in("time_slot_id", slotIds);
        mq = groupId ? mq.eq("group_id", groupId) : mq.is("group_id", null);
        const { data: m, error: eM } = await mq;
        if (eM) throw eM;
        mData = m ?? [];
      }

      // Normaliser les dates des disponibilités pour garantir la cohérence
      const normalizedAv = (av || []).map((item) => ({
        ...item,
        start: normalizeSlotTime(item.start),
        end: item.end ? normalizeSlotTime(item.end) : normalizeSlotTime(dayjs(item.start).add(SLOT_MIN, 'minute').toISOString()),
      }));

      const tsJson = JSON.stringify(ts ?? []);
      const avJson = JSON.stringify(normalizedAv ?? []);
      const mJson  = JSON.stringify(mData ?? []);

      if (lastDataRef.current.ts !== tsJson) {
        lastDataRef.current.ts = tsJson;
        setTimeSlots(ts ?? []);
      }
      if (lastDataRef.current.av !== avJson) {
        lastDataRef.current.av = avJson;
        setSlots(normalizedAv ?? []);
      }
      if (lastDataRef.current.m !== mJson) {
        lastDataRef.current.m = mJson;
        setMatches(mData ?? []);
      }
    } catch (e) {
      console.warn(e);
      safeAlert("Erreur", e?.message ?? String(e));
    } finally {
      if (loading) setLoading(false);
    }
  }, [weekStart, groupId, loading, normalizeSlotTime, meId]);

  useEffect(() => {
    fetchDataRef.current = fetchData;
    fetchData();
  }, [fetchData]);

  // Charger mes groupes pour le sélecteur
  const loadMyGroups = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setMyGroups([]);
      const { data: gm } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', user.id);
      const ids = (gm || []).map(g => g.group_id).filter(Boolean);
      if (ids.length === 0) return setMyGroups([]);
      const { data: groups } = await supabase
        .from('groups')
        .select('id, name')
        .in('id', ids);
      setMyGroups(groups || []);
    } catch (e) {
      console.warn('[Semaine] loadMyGroups error:', e?.message || e);
      setMyGroups([]);
    }
  }, []);

  // Upsert RSVP pour un match en respectant l'enum rsvp_status
  async function upsertRsvp(matchId, rawStatus) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return safeAlert("Connexion requise");

      const status = normalizeRsvpStatus(rawStatus); // ← mapping ici
      const { error } = await supabase
        .from("match_rsvps")
        .upsert(
          { match_id: matchId, user_id: user.id, status },
          { onConflict: "match_id,user_id" }
        );

      if (error) throw error;
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
      // Optionnel : recharger les données si tu affiches les RSVPs sur cet écran
      // await fetchData();
    } catch (e) {
      safeAlert("Erreur RSVP", e?.message ?? String(e));
    }
  }

  // Compte unique des disponibles pour un tableau people [{user_id, status}]
  function uniqueAvailableCount(peopleArr = []) {
    const seen = new Set();
    let c = 0;
    for (const p of peopleArr) {
      if (!p || !p.user_id) continue;
      if (String(p.status || 'neutral').toLowerCase() === 'available') {
        if (!seen.has(p.user_id)) {
          seen.add(p.user_id);
          c++;
        }
      }
    }
    return c;
  }

  // Map disponibilités: clé = start ISO, valeur = [{ user_id, status }]
  // Filtrer uniquement les membres du groupe actuel ET du même group_id
  // Dédupliquer par user_id (si plusieurs lignes existent pour le même créneau)
  const mapDispos = useMemo(() => {
    // Trier les slots par timestamp décroissant (les plus récents en premier)
    // Cela garantit qu'on prend la dernière entrée pour chaque user
    const sortedSlots = [...(slots || [])].sort((a, b) => {
      const ta = dayjs(a.created_at || a.updated_at || a.start).valueOf();
      const tb = dayjs(b.created_at || b.updated_at || b.start).valueOf();
      return tb - ta; // décroissant
    });
    
    // Créer un Set pour vérifier rapidement si un user est membre du groupe
    const memberIdsSet = new Set((groupMembers || []).map(id => String(id)));
    
    const byStart = new Map(); // startIso -> Map(user_id -> 'available' | 'neutral')
    
    // Parcourir les slots triés : on garde la première (la plus récente) pour chaque user/start
    // Filtrer UNIQUEMENT les membres du groupe pour correspondre au nombre affiché
    for (const s of sortedSlots) {
      if (s.group_id === groupId) {
        const userIdStr = String(s.user_id);
        // Filtrer uniquement les membres du groupe
        if (memberIdsSet.size > 0 && !memberIdsSet.has(userIdStr)) {
          continue; // Ignorer les non-membres
        }
        
        const k = dayjs(s.start).toISOString();
        let usersMap = byStart.get(k);
        if (!usersMap) {
          usersMap = new Map();
          byStart.set(k, usersMap);
        }
        // Si l'user n'existe pas encore pour ce créneau, on l'ajoute
        // Comme on trie par date décroissante, on garde la version la plus récente
        if (!usersMap.has(userIdStr)) {
          const isAvail = String(s.status || 'available').toLowerCase() === 'available';
          usersMap.set(userIdStr, isAvail ? 'available' : 'neutral');
        }
      }
    }
    
    const out = new Map();
    byStart.forEach((usersMap, k) => {
      const arr = [];
      usersMap.forEach((status, user_id) => arr.push({ user_id, status }));
      out.set(k, arr);
    });
    return out;
  }, [slots, groupMembers, groupId]);

  // Index matches par start
  const mapMatches = useMemo(() => {
    const map = new Map();
    const byId = new Map((timeSlots || []).map((t) => [t.id, t]));
    (matches || []).forEach((m) => {
      const ts = byId.get(m.time_slot_id);
      if (ts?.starts_at) map.set(dayjs(ts.starts_at).toISOString(), m);
    });
    return map;
  }, [matches, timeSlots]);

  // Statut de MA dispo par start (clés normalisées pour garantir la cohérence)
  const myStatusByStart = useMemo(() => {
    const m = new Map();
    if (!meId) return m;
    // Dédupliquer en gardant la plus récente pour chaque créneau normalisé
    const seen = new Map();
    const sorted = [...(slots || [])]
      .filter((s) => s.user_id === meId && s.group_id === groupId)
      .sort((a, b) => {
        const ta = dayjs(a.updated_at || a.created_at || a.start).valueOf();
        const tb = dayjs(b.updated_at || b.created_at || b.start).valueOf();
        return tb - ta; // décroissant (plus récent en premier)
      });
    
    for (const s of sorted) {
      const k = normalizeSlotTime(s.start);
      if (!seen.has(k)) {
        seen.set(k, true);
        // Préserver le statut exact, y compris 'neutral', null, undefined
        m.set(k, s.status !== undefined && s.status !== null ? s.status : "available");
      }
    }
    return m;
  }, [slots, meId, groupId, normalizeSlotTime]);

  // Cycle 3 états (conservé si besoin ailleurs) : neutral -> available -> absent -> neutral
  function nextStatus3(current) {
    if (current === "available") return "absent";
    if (current === "absent") return "neutral";
    return "available";
  }

  // Toggle dispo (optimistic UI) - Version refactorisée avec normalisation systématique
  const toggleMyAvailability = useCallback(async (startIso) => {
    try {
      const gid = groupId ?? (await AsyncStorage.getItem("active_group_id"));
      const { data: { user } } = await supabase.auth.getUser();

      if (!gid) {
        return safeAlert(
          "Choisis un groupe",
          "Active un groupe dans l'onglet Groupes avant d'enregistrer des dispos."
        );
      }
      if (!user) return safeAlert("Connexion requise");

      // Normaliser systématiquement les dates pour garantir la cohérence
      const normalizedStart = normalizeSlotTime(startIso);
      const normalizedEnd = normalizeSlotTime(dayjs(normalizedStart).add(SLOT_MIN, "minute").toISOString());
      
      // Variable pour utiliser dans toutes les branches
      const normalizedEndForRpc = normalizedEnd;

      // Chercher toutes les entrées correspondantes avec normalisation
      const allMatching = (slots || []).filter((s) => {
        const sNormalized = normalizeSlotTime(s.start);
        return s.user_id === user.id && 
               s.group_id === gid && 
               sNormalized === normalizedStart;
      });

      // Prendre la plus récente si plusieurs entrées (déduplication)
      const mine = allMatching.length > 0 
        ? allMatching.sort((a, b) => {
            const ta = dayjs(a.updated_at || a.created_at || a.start).valueOf();
            const tb = dayjs(b.updated_at || b.created_at || b.start).valueOf();
            return tb - ta; // décroissant
          })[0]
        : null;

      if (!mine) {
        // Ajouter une nouvelle disponibilité
        const optimistic = {
          user_id: user.id,
          group_id: gid,
          start: normalizedStart,
          end: normalizedEnd,
          status: "available",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        
        // Supprimer d'abord tous les doublons potentiels pour ce créneau normalisé
        setSlots((prev) => {
          const filtered = prev.filter((s) => {
            const sNormalized = normalizeSlotTime(s.start);
            return !(s.user_id === user.id && s.group_id === gid && sNormalized === normalizedStart);
          });
          return [...filtered, optimistic];
        });
        
        try { Haptics.selectionAsync(); } catch {}

        if (applyToAllGroups) {
          const { error } = await supabase.rpc("set_availability_global", {
            p_user: user.id,
            p_start: normalizedStart,
            p_end: normalizedEnd,
            p_status: "available",
          });
          if (error) { await fetchData(); throw error; }
        } else {
          const { error } = await supabase.rpc("set_availability_group", {
            p_user: user.id,
            p_group: gid,
            p_start: normalizedStart,
            p_end: normalizedEnd,
            p_status: "available",
          });
          if (error) { await fetchData(); throw error; }
        }
        
        DeviceEventEmitter.emit('AVAILABILITY_CHANGED', { groupId: gid, userId: user.id });
      } else if (mine.status === 'available') {
        // Supprimer la disponibilité (toggle off) - utiliser les fonctions RPC
        console.log('[toggleMyAvailability] Suppression créneau:', {
          start: normalizedStart,
          end: normalizedEndForRpc,
          applyToAllGroups,
          groupId: gid,
        });
        
        // Vérifier si une disponibilité globale existe (pour logging)
        if (!applyToAllGroups) {
          const { data: globalCheck } = await supabase
            .from("availability_global")
            .select("start, end")
            .eq("user_id", user.id)
            .eq("start", normalizedStart)
            .eq("end", normalizedEndForRpc)
            .single();
          if (globalCheck) {
            console.log('[toggleMyAvailability] Disponibilité globale trouvée, création exception "neutral" pour masquer');
          } else {
            console.log('[toggleMyAvailability] Pas de disponibilité globale, suppression exception');
          }
        }
        
        // Mettre à jour optimiste : ajouter une entrée 'neutral' pour que myStatusByStart la détecte
        setSlots((prev) => {
          const filtered = prev.filter((s) => {
            const sNormalized = normalizeSlotTime(s.start);
            return !(s.user_id === user.id && s.group_id === gid && sNormalized === normalizedStart);
          });
          // Ajouter une entrée 'neutral' pour indiquer que la disponibilité est annulée
          return [...filtered, {
            user_id: user.id,
            group_id: gid,
            start: normalizedStart,
            end: normalizedEndForRpc,
            status: 'neutral',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }];
        });
        
        try { Haptics.selectionAsync(); } catch {}
        
        // Utiliser les fonctions RPC qui gèrent correctement la suppression
        if (applyToAllGroups) {
          console.log('[toggleMyAvailability] Appel set_availability_global avec status=neutral');
          const { error } = await supabase.rpc("set_availability_global", {
            p_user: user.id,
            p_start: normalizedStart,
            p_end: normalizedEndForRpc,
            p_status: 'neutral', // La RPC supprimera maintenant correctement
          });
          if (error) {
            console.error('[toggleMyAvailability] Error deleting via set_availability_global:', error);
            await fetchData(); // Recharger pour restaurer l'état correct
            throw error;
          }
          console.log('[toggleMyAvailability] Disponibilité globale supprimée avec succès');
        } else {
          console.log('[toggleMyAvailability] Appel set_availability_group avec status=neutral');
          const { error } = await supabase.rpc("set_availability_group", {
            p_user: user.id,
            p_group: gid,
            p_start: normalizedStart,
            p_end: normalizedEndForRpc,
            p_status: 'neutral', // La RPC créera une exception 'neutral' si nécessaire
          });
          if (error) {
            console.error('[toggleMyAvailability] Error deleting via set_availability_group:', error);
            await fetchData(); // Recharger pour restaurer l'état correct
            throw error;
          }
          console.log('[toggleMyAvailability] Exception créée/supprimée avec succès');
        }
        
        DeviceEventEmitter.emit('AVAILABILITY_CHANGED', { groupId: gid, userId: user.id });
      } else {
        // Mettre à jour le statut à 'available' (quel que soit l'état actuel)
        setSlots((prev) => {
          return prev.map((s) => {
            const sNormalized = normalizeSlotTime(s.start);
            return s.user_id === user.id && s.group_id === gid && sNormalized === normalizedStart
              ? { ...s, status: 'available', updated_at: new Date().toISOString() }
              : s;
          });
        });
        
        try { Haptics.selectionAsync(); } catch {}
        
        if (applyToAllGroups) {
          const { error } = await supabase.rpc("set_availability_global", {
            p_user: user.id,
            p_start: normalizedStart,
            p_end: normalizedEnd,
            p_status: "available",
          });
          if (error) { await fetchData(); throw error; }
        } else {
          const { error } = await supabase.rpc("set_availability_group", {
            p_user: user.id,
            p_group: gid,
            p_start: normalizedStart,
            p_end: normalizedEnd,
            p_status: "available",
          });
          if (error) { await fetchData(); throw error; }
        }
        
        DeviceEventEmitter.emit('AVAILABILITY_CHANGED', { groupId: gid, userId: user.id });
      }

      // Rafraîchir les données après un court délai pour synchroniser avec le serveur
      scheduleRefresh(500);
    } catch (e) {
      await fetchData();
      safeAlert("Erreur", e?.message ?? String(e));
    }
  }, [groupId, slots, applyToAllGroups, scheduleRefresh, fetchData, normalizeSlotTime]);

  // Fixe explicitement ma dispo sur un créneau (available|absent|neutral) - Version refactorisée
  async function setMyAvailability(startIso, status) {
    try {
      const gid = groupId ?? (await AsyncStorage.getItem("active_group_id"));
      const { data: { user } } = await supabase.auth.getUser();
      if (!gid || !user) return;

      // Normaliser systématiquement les dates
      const normalizedStart = normalizeSlotTime(startIso);
      const normalizedEnd = normalizeSlotTime(dayjs(normalizedStart).add(SLOT_MIN, "minute").toISOString());

      // Chercher toutes les entrées correspondantes avec normalisation
      const allMatching = (slots || []).filter((s) => {
        const sNormalized = normalizeSlotTime(s.start);
        return s.user_id === user.id && s.group_id === gid && sNormalized === normalizedStart;
      });

      // Prendre la plus récente si plusieurs entrées
      const mine = allMatching.length > 0 
        ? allMatching.sort((a, b) => {
            const ta = dayjs(a.updated_at || a.created_at || a.start).valueOf();
            const tb = dayjs(b.updated_at || b.created_at || b.start).valueOf();
            return tb - ta;
          })[0]
        : null;

      if (!mine && status !== 'neutral') {
        const optimistic = { 
          user_id: user.id, 
          group_id: gid, 
          start: normalizedStart, 
          end: normalizedEnd, 
          status 
        };
        
        // Supprimer d'abord tous les doublons potentiels
        setSlots((prev) => {
          const filtered = prev.filter((s) => {
            const sNormalized = normalizeSlotTime(s.start);
            return !(s.user_id === user.id && s.group_id === gid && sNormalized === normalizedStart);
          });
          return [...filtered, optimistic];
        });
        
        try { Haptics.selectionAsync(); } catch {}
        
        if (applyToAllGroups) {
          const { error } = await supabase.rpc("set_availability_global", {
            p_user: user.id,
            p_start: normalizedStart,
            p_end: normalizedEnd,
            p_status: status,
          });
          if (error) { await fetchData(); throw error; }
        } else {
          const { error } = await supabase.rpc("set_availability_group", {
            p_user: user.id,
            p_group: gid,
            p_start: normalizedStart,
            p_end: normalizedEnd,
            p_status: status,
          });
          if (error) { await fetchData(); throw error; }
        }
      } else if (mine && mine.status !== status) {
        if (status === 'neutral') {
          console.log('[setMyAvailability] Suppression créneau:', {
            start: normalizedStart,
            end: normalizedEnd,
            applyToAllGroups,
            groupId: gid,
            currentStatus: mine.status,
          });
          
          // Vérifier si une disponibilité globale existe (pour logging)
          if (!applyToAllGroups) {
            const { data: globalCheck } = await supabase
              .from("availability_global")
              .select("start, end")
              .eq("user_id", user.id)
              .eq("start", normalizedStart)
              .eq("end", normalizedEnd)
              .single();
            if (globalCheck) {
              console.log('[setMyAvailability] Disponibilité globale trouvée, création exception "neutral" pour masquer');
            } else {
              console.log('[setMyAvailability] Pas de disponibilité globale, suppression exception');
            }
          }
          
          // Supprimer - mise à jour optimiste de l'UI d'abord
          setSlots((prev) => {
            return prev.filter((s) => {
              const sNormalized = normalizeSlotTime(s.start);
              return !(s.user_id === user.id && s.group_id === gid && sNormalized === normalizedStart);
            });
          });
          
          try { Haptics.selectionAsync(); } catch {}
          
          // Utiliser les fonctions RPC qui gèrent maintenant correctement la suppression
          // quand status='neutral'
          if (applyToAllGroups) {
            console.log('[setMyAvailability] Appel set_availability_global avec status=neutral');
            const { error } = await supabase.rpc("set_availability_global", {
              p_user: user.id,
              p_start: normalizedStart,
              p_end: normalizedEnd,
              p_status: 'neutral', // La RPC supprimera maintenant correctement
            });
            if (error) {
              console.error('[setMyAvailability] Error deleting via set_availability_global:', error);
              await fetchData(); // Recharger pour restaurer l'état correct
              throw error;
            }
            console.log('[setMyAvailability] Disponibilité globale supprimée avec succès');
          } else {
            console.log('[setMyAvailability] Appel set_availability_group avec status=neutral');
            const { error } = await supabase.rpc("set_availability_group", {
              p_user: user.id,
              p_group: gid,
              p_start: normalizedStart,
              p_end: normalizedEnd,
              p_status: 'neutral', // La RPC supprimera maintenant correctement
            });
            if (error) {
              console.error('[setMyAvailability] Error deleting via set_availability_group:', error);
              await fetchData(); // Recharger pour restaurer l'état correct
              throw error;
            }
            console.log('[setMyAvailability] Exception créée/supprimée avec succès');
          }
          return;
        }
        
        // Mettre à jour le statut
        setSlots((prev) => {
          return prev.map((s) => {
            const sNormalized = normalizeSlotTime(s.start);
            return s.user_id === user.id && s.group_id === gid && sNormalized === normalizedStart
              ? { ...s, status, updated_at: new Date().toISOString() }
              : s;
          });
        });
        
        try { Haptics.selectionAsync(); } catch {}
        
        if (applyToAllGroups) {
          const { error } = await supabase.rpc("set_availability_global", {
            p_user: user.id,
            p_start: normalizedStart,
            p_end: normalizedEnd,
            p_status: status,
          });
          if (error) { await fetchData(); throw error; }
        } else {
          const { error } = await supabase.rpc("set_availability_group", {
            p_user: user.id,
            p_group: gid,
            p_start: normalizedStart,
            p_end: normalizedEnd,
            p_status: status,
          });
          if (error) { await fetchData(); throw error; }
        }
      }
    } catch (e) {
      console.warn(e);
    }
  }

  // Fixe en masse ma dispo sur une liste de créneaux (beaucoup plus rapide)
  async function setMyAvailabilityBulk(startIsos = [], status = 'available') {
    try {
      if (!Array.isArray(startIsos) || startIsos.length === 0) return;
      const gid = groupId ?? (await AsyncStorage.getItem("active_group_id"));
      const { data: { user } } = await supabase.auth.getUser();
      if (!gid || !user) return;

      // 1) Optimistic UI : ajoute/maj tous les créneaux localement (avec normalisation)
      setSlots((prev) => {
        const map = new Map();
        // Indexer les slots existants par clé normalisée (user_id + group_id + start normalisé)
        for (const s of prev) {
          const normalizedStart = normalizeSlotTime(s.start);
          const key = `${s.user_id}|${s.group_id}|${normalizedStart}`;
          // Garder la plus récente si plusieurs entrées pour la même clé
          const existing = map.get(key);
          if (!existing) {
            map.set(key, s);
          } else {
            const existingTime = dayjs(existing.updated_at || existing.created_at || existing.start).valueOf();
            const newTime = dayjs(s.updated_at || s.created_at || s.start).valueOf();
            if (newTime > existingTime) {
              map.set(key, s);
            }
          }
        }
        
        // Normaliser tous les créneaux à traiter
        const normalizedStartIsos = startIsos.map(s => normalizeSlotTime(s));
        
        // Ajouter/mettre à jour les nouveaux slots avec normalisation
        for (const normalizedStart of normalizedStartIsos) {
          const normalizedEnd = normalizeSlotTime(dayjs(normalizedStart).add(SLOT_MIN, 'minute').toISOString());
          const key = `${user.id}|${gid}|${normalizedStart}`;
          const existing = map.get(key);
          if (!existing) {
            map.set(key, { 
              user_id: user.id, 
              group_id: gid, 
              start: normalizedStart, 
              end: normalizedEnd, 
              status,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          } else if (existing.status !== status) {
            map.set(key, { 
              ...existing, 
              status, 
              updated_at: new Date().toISOString() 
            });
          }
        }
        return Array.from(map.values());
      });

      try { Haptics.selectionAsync(); } catch {}

      // 2) Persistance : un seul RPC bulk pour éviter N allers-retours
      const normalizedStartIsos = startIsos.map(s => normalizeSlotTime(s));

      if (applyToAllGroups) {
        const { error } = await supabase.rpc("set_availability_global_bulk", {
          p_user: user.id,
          p_starts: normalizedStartIsos,
          p_status: status,
        });
        if (error) {
          console.error('[setMyAvailabilityBulk] Error via set_availability_global_bulk:', error);
          throw error;
        }
      } else {
        const { error } = await supabase.rpc("set_availability_group_bulk", {
          p_user: user.id,
          p_group: gid,
          p_starts: normalizedStartIsos,
          p_status: status,
        });
        if (error) {
          console.error('[setMyAvailabilityBulk] Error via set_availability_group_bulk:', error);
          throw error;
        }
      }

      // Notifier les autres pages (notamment matches) que la disponibilité a changé
      DeviceEventEmitter.emit('AVAILABILITY_CHANGED', { groupId: gid, userId: user.id });
      
      // Rafraîchir après un délai plus long pour éviter les conflits avec les mises à jour optimistes
      // Le délai plus long permet de s'assurer que toutes les mises à jour sont bien synchronisées
      scheduleRefresh(800);
    } catch (e) {
      console.warn('[bulkAvailability] error:', e);
      safeAlert('Erreur', e?.message ?? String(e));
    }
  }

  // Supprime en masse ma dispo (neutral) pour une liste de créneaux
  async function setMyNeutralBulk(startIsos = []) {
    try {
      if (!Array.isArray(startIsos) || startIsos.length === 0) return;
      const gid = groupId ?? (await AsyncStorage.getItem("active_group_id"));
      const { data: { user } } = await supabase.auth.getUser();
      if (!gid || !user) return;

      console.log('[setMyNeutralBulk] Suppression en masse:', {
        count: startIsos.length,
        applyToAllGroups,
        groupId: gid,
      });

      // Optimistic: enlever localement toutes mes lignes correspondantes (avec normalisation ou brute)
      setSlots((prev) => {
        const normalizedStartIsos = new Set(startIsos.map((s) => normalizeSlotTime(s)));
        const rawStartIsos = new Set(startIsos.map((s) => String(s)));
        return prev.filter((s) => {
          if (s.user_id !== user.id || s.group_id !== gid) return true;
          const sNormalized = normalizeSlotTime(s.start);
          const sRaw = String(s.start);
          return !(normalizedStartIsos.has(sNormalized) || rawStartIsos.has(sRaw));
        });
      });
      try { Haptics.selectionAsync(); } catch {}

      // Supprimer en masse via RPC bulk (bien plus rapide)
      const normalizedStartIsos = startIsos.map(s => normalizeSlotTime(s));
      const rawStartIsos = Array.from(new Set(startIsos.map((s) => String(s))));

      // Meilleure compat: on envoie aussi les starts normalisés + bruts
      const allStartIsos = Array.from(new Set([...rawStartIsos, ...normalizedStartIsos]));

      if (applyToAllGroups) {
        console.log('[setMyNeutralBulk] Appel set_availability_global_bulk:', allStartIsos.length);
        const { error } = await supabase.rpc("set_availability_global_bulk", {
          p_user: user.id,
          p_starts: allStartIsos,
          p_status: 'neutral',
        });
        if (error) {
          console.error('[setMyNeutralBulk] Error via set_availability_global_bulk:', error);
          throw error;
        }
      } else {
        console.log('[setMyNeutralBulk] Appel set_availability_group_bulk:', allStartIsos.length);
        const { error } = await supabase.rpc("set_availability_group_bulk", {
          p_user: user.id,
          p_group: gid,
          p_starts: allStartIsos,
          p_status: 'neutral',
        });
        if (error) {
          console.error('[setMyNeutralBulk] Error via set_availability_group_bulk:', error);
          throw error;
        }
      }
      
      console.log('[setMyNeutralBulk] Suppression en masse terminée avec succès');

      // Notifier les autres pages (notamment matches) que la disponibilité a changé
      DeviceEventEmitter.emit('AVAILABILITY_CHANGED', { groupId: gid, userId: user.id });
      
      // Rafraîchir après un délai plus long pour éviter les conflits avec les mises à jour optimistes
      scheduleRefresh(800);
    } catch (e) {
      console.warn('[setMyNeutralBulk] error:', e);
      safeAlert('Erreur', e?.message ?? String(e));
    }
  }

  // Met tous les créneaux de la semaine en cours en disponible
  async function setAllWeekAvailable() {
    try {
      const allSlots = [];
      for (const day of days) {
        for (const { hour, minute } of hoursOfDay) {
          const startIso = keySlot(day, hour, minute);
          allSlots.push(startIso);
        }
      }
      if (allSlots.length > 0) {
        await setMyAvailabilityBulk(allSlots, 'available');
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
      }
    } catch (e) {
      console.warn('[setAllWeekAvailable] error:', e);
      safeAlert('Erreur', e?.message ?? String(e));
    }
  }

  // Retire tous les créneaux de la semaine en cours de la disponibilité
  async function setAllWeekUnavailable() {
    try {
      const allSlots = [];
      for (const day of days) {
        for (const { hour, minute } of hoursOfDay) {
          const startIso = keySlot(day, hour, minute);
          allSlots.push(startIso);
        }
      }
      // Ajouter les créneaux existants de l'utilisateur (mêmes si non normalisés)
      const wsMs = weekStart.valueOf();
      const weMs = weekStart.add(7, 'day').valueOf();
      const existingStarts = (slots || [])
        .filter((s) => String(s.user_id) === String(meId) && String(s.group_id) === String(groupId))
        .filter((s) => {
          const ms = dayjs(s.start).valueOf();
          return ms >= wsMs && ms < weMs;
        })
        .map((s) => s.start);
      const merged = Array.from(new Set([...allSlots, ...existingStarts]));
      if (allSlots.length > 0) {
        await setMyNeutralBulk(merged);
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
      }
    } catch (e) {
      console.warn('[setAllWeekUnavailable] error:', e);
      safeAlert('Erreur', e?.message ?? String(e));
    }
  }

function DayColumn({ day, dayIndex, onPaintSlot, onPaintRange, onPaintRangeWithStatus, onRangeCompleted, mode = 'body' }) {
    const isToday = day.isSame(dayjs(), "day");
    const [colLayoutY, setColLayoutY] = useState(0);
    const [rangeStartIdx, setRangeStartIdx] = useState(null);
    const [rangeHoverIdx, setRangeHoverIdx] = useState(null); // index courant survolé pour prévisualisation
    const [rangeIntent, setRangeIntent] = useState('available'); // 'available' | 'neutral'

    return (
      <View style={{ width: 104, paddingHorizontal: 1 }}>
        {mode === 'header' ? (
          <View
            style={{
              alignItems: 'center',
              paddingVertical: 5, // ↑ augmente la hauteur
              marginBottom: 0,
              borderRadius: 8,
              backgroundColor: isToday ? ORANGE : '#156BC9',
              borderWidth: 1,
              borderColor: isToday ? '#ffffff' : 'transparent',
            }}
          >
            <Text style={{ fontWeight: '800', color: '#ffffff', fontSize: 14, lineHeight: 16 }}>
              {day.format('dd').toUpperCase()} {day.format('D')}
            </Text>
          </View>
        ) : (
          // --- CORPS SEUL (dans le ScrollView vertical) ---
          <View
            style={{
              backgroundColor: isToday ? '#FFF3E9' : '#E8F0FF',
              borderRadius: 6,
              borderWidth: 1,
              borderColor: isToday ? ORANGE : BRAND,
              overflow: 'hidden',
              height: SLOTS_PER_DAY * SLOT_HEIGHT + (SLOTS_PER_DAY * 1),
              position: 'relative',
            }}
          >
            {hoursOfDay.map(({ hour, minute }, idx) => {
                const startIso = keySlot(day, hour, minute);
                // Calculer la fin du créneau (30 minutes après)
                const endIso = dayjs(startIso).add(30, 'minute').toISOString();
                
                // Vérifier les disponibilités qui couvrent réellement ce créneau de 30 minutes
                const peopleForSlot = (slots || [])
                  .filter(s => {
                    if (s.group_id !== groupId) return false;
                    const userIdStr = String(s.user_id);
                    // Filtrer uniquement les membres du groupe
                    const memberIdsSet = new Set((groupMembers || []).map(id => String(id)));
                    if (memberIdsSet.size > 0 && !memberIdsSet.has(userIdStr)) return false;
                    
                    // Vérifier que la disponibilité couvre le créneau
                    const slotStart = dayjs(startIso);
                    const slotEnd = dayjs(endIso);
                    const availStart = dayjs(s.start);
                    const availEnd = dayjs(s.end || s.start).add(30, 'minute');
                    
                    return availStart <= slotStart && availEnd >= slotEnd && 
                           String(s.status || 'neutral').toLowerCase() === 'available';
                  })
                  .reduce((acc, s) => {
                    const userIdStr = String(s.user_id);
                    if (!acc.has(userIdStr)) {
                      acc.set(userIdStr, s);
                    } else {
                      const existing = acc.get(userIdStr);
                      const existingTime = dayjs(existing.created_at || existing.updated_at || existing.start).valueOf();
                      const newTime = dayjs(s.created_at || s.updated_at || s.start).valueOf();
                      if (newTime > existingTime) {
                        acc.set(userIdStr, s);
                      }
                    }
                    return acc;
                  }, new Map());
                
                const people = Array.from(peopleForSlot.values()).map(s => ({ 
                  user_id: s.user_id, 
                  status: 'available' 
                }));
                const availableCount = people.length;
                const match = mapMatches.get(startIso);

                // Normaliser startIso pour la recherche dans myStatusByStart
                const normalizedStartIsoForLookup = normalizeSlotTime(startIso);
                const myStatus = myStatusByStart.get(normalizedStartIsoForLookup);
                let cellBg = '#f7f9fd';
                let cellBorder = '#1f2937';
                let textColor = '#0b2240';

                // Mapping uniforme selon le nombre de dispos
                // Mais si l'utilisateur a annulé sa disponibilité, forcer le rouge clair
                if (myStatus === 'neutral' || myStatus === null || myStatus === undefined) {
                  // Cellule rouge clair si le joueur a annulé sa disponibilité
                  cellBg = '#fee2e2';
                  cellBorder = '#fee2e2';
                } else if (availableCount <= 0) {
                  cellBg = '#fee2e2';
                  cellBorder = '#fee2e2';
                } else if (availableCount === 1) {
                  cellBg = '#ffedd5';
                  cellBorder = '#fed7aa';
                } else if (availableCount === 2) {
                  cellBg = '#fef9c3';
                  cellBorder = '#fde68a';
                } else if (availableCount === 3) {
                  cellBg = '#d1fae5';
                  cellBorder = '#a7f3d0';
                } else {
                  cellBg = '#2fc249';
                  cellBorder = '#2fc249';
                }

                // Aperçu de début de plage (premier long press) :
                // - intent 'available'  → vert clair
                // - intent 'neutral'    → rouge clair
                if (rangeStartIdx != null && idx === rangeStartIdx && !match) {
                  if (rangeIntent === 'neutral') {
                    // Annuler une dispo (prévisualisation en ROUGE clair)
                    cellBg = '#fee2e2';   // red-100
                    cellBorder = '#ef4444'; // red-500
                    textColor = '#7f1d1d'; // red-900
                  } else {
                    // Créer une dispo (prévisualisation en VERT clair)
                    cellBg = '#d1fae5';   // green-100
                    cellBorder = '#10b981'; // green-500
                    textColor = '#065f46';  // green-900
                  }
                }

                // Prévisualisation de TOUTE la plage entre le premier et le curseur courant
                if (rangeStartIdx != null && rangeHoverIdx != null && !match) {
                  const a = Math.min(rangeStartIdx, rangeHoverIdx);
                  const b = Math.max(rangeStartIdx, rangeHoverIdx);
                  if (idx >= a && idx <= b) {
                    if (rangeIntent === 'neutral') {
                      cellBg = '#fee2e2';
                      cellBorder = '#ef4444';
                      textColor = '#7f1d1d';
                    } else {
                      cellBg = '#d1fae5';
                      cellBorder = '#10b981';
                      textColor = '#065f46';
                    }
                  }
                }

                let badgeBg = '#e5e7eb';
                let badgeColor = '#0f172a';
                if (availableCount <= 0) {
                  badgeBg = '#e5e7eb';
                  badgeColor = '#0f172a';
                } else if (availableCount === 1) {
                  badgeBg = '#ffedd5';
                  badgeColor = '#0f172a';
                } else if (availableCount === 2) {
                  badgeBg = '#fef9c3';
                  badgeColor = '#0f172a';
                } else if (availableCount === 3) {
                  badgeBg = '#d1fae5';
                  badgeColor = '#0f172a';
                } else {
                  badgeBg = '#15803d';
                  badgeColor = '#ffffff';
                }

                const isActiveHour = !!match || myStatus === 'available';
                const timeWeight = isActiveHour ? '800' : '700';

                return (
                  <Pressable
                    key={startIso}
                    delayLongPress={250}
                    onPressIn={() => { if (rangeStartIdx != null && idx !== rangeHoverIdx) setRangeHoverIdx(idx); }}
                    onHoverIn={() => { if (Platform.OS === 'web' && rangeStartIdx != null && idx !== rangeHoverIdx) setRangeHoverIdx(idx); }}
                    onMouseEnter={() => { if (Platform.OS === 'web' && rangeStartIdx != null && idx !== rangeHoverIdx) setRangeHoverIdx(idx); }}
                    onPress={press(`toggle-${startIso}`, () => {
                      // Si une sélection est en cours, ne pas déclencher le toggle
                      if (rangeStartIdx != null) return;
                      toggleMyAvailability(startIso);
                    })}
                    onLongPress={() => {
                      // Ensure startIso is defined (already is above)
                      if (rangeStartIdx == null) {
                        // Décide l'intention de plage d'après le statut du premier créneau
                        const normalizedStartIsoForLookup = normalizeSlotTime(startIso);
                        const my = myStatusByStart.get(normalizedStartIsoForLookup);
                        const intent = my === 'available' ? 'neutral' : 'available';
                        setRangeIntent(intent);
                        setRangeStartIdx(idx);
                        setRangeHoverIdx(idx);
                        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
                      } else {
                        // Termine la plage et applique directement la sélection
                        const a = Math.min(rangeStartIdx, idx);
                        const b = Math.max(rangeStartIdx, idx);
                        const batch = [];
                        for (let i = a; i <= b; i++) {
                          const { hour: h, minute: m } = hoursOfDay[i];
                          batch.push(keySlot(day, h, m));
                        }
                        // Appliquer directement la sélection
                        if (rangeIntent === 'neutral') {
                          setMyNeutralBulk(batch);
                        } else {
                          setMyAvailabilityBulk(batch, 'available');
                        }
                        setRangeStartIdx(null);
                        setRangeHoverIdx(null);
                        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
                      }
                    }}
                    style={{
                      height: SLOT_HEIGHT,
                      paddingHorizontal: 8,
                      borderBottomWidth: 1,
                      borderColor: cellBorder,
                      justifyContent: 'center',
                      backgroundColor: cellBg,
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: FONT_HOUR, color: textColor, fontWeight: timeWeight }}>
                        {String(hour).padStart(2, '0')}:${minute ? '30' : '00'}
                      </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {(() => {
                        const iconSrc =
                          availableCount >= 4
                            ? require('../../assets/icons/tennis_ball_jaune.png')
                            : availableCount === 3
                              ? require('../../assets/icons/tennis_ball_orange.png')
                              : availableCount === 2
                                ? require('../../assets/icons/tennis_ball_red.png')
                                : availableCount === 1
                                  ? require('../../assets/icons/tennis_ball_grey.png')
                                  : require('../../assets/icons/tennis_ball_black.png'); // 0 dispo
                        return (
                          <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                            <Text style={{
                              position: 'absolute',
                              top: 13,
                              left: 0,
                              right: 0,
                              textAlign: 'center',
                              fontSize: 13,
                              fontWeight: '900',
                              color: availableCount >= 4 ? '#000000' : '#ffffff',
                              lineHeight: 14,
                              zIndex: 2,
                              pointerEvents: 'none',
                            }}>
                              {availableCount}
                            </Text>
                            <Image source={iconSrc} style={{ width: 40, height: 40, resizeMode: 'contain', zIndex: 1, opacity: 0.8 }} />
                          </View>
                        );
                      })()}
                    </View>
                    </View>
                  </Pressable>
                );
              })}
          </View>
        )}
      </View>
    );
}

  useEffect(() => {
    try { console.log('[semaine] weekStart', weekStart.toISOString()); } catch {}
  }, [weekStart]);
  // Remet la grille en haut (08:00) à chaque changement de semaine
  useEffect(() => {
    const id = setTimeout(() => {
      try { scrollRef.current?.scrollTo?.({ y: 0, animated: false }); } catch {}
    }, 0);
    return () => clearTimeout(id);
  }, [weekStart]);

  // Et au premier affichage
  useEffect(() => {
    const id = setTimeout(() => {
      try { scrollRef.current?.scrollTo?.({ y: 0, animated: false }); } catch {}
    }, 0);
    return () => clearTimeout(id);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#001831', position: 'relative' }}>
      {/* Header semaine */}
      <View
        style={{
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          paddingTop: isPortrait ? 8 : 4,
          paddingBottom: isPortrait ? 6 : 2,
          paddingLeft: Math.max(12, insets.left + 8),
          paddingRight: Math.max(12, insets.right + 8),
          backgroundColor: 'transparent',
          borderBottomWidth: 0,
        }}
      >
        {/* Boutons "Appliquer à mon groupe actif" et "Appliquer à tous les groupes" */}
        {activeGroup?.name && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingLeft: Math.max(12, insets.left + 8),
              paddingRight: Math.max(12, insets.right + 8),
              marginTop: isPortrait ? 4 : 2,
              marginBottom: isPortrait ? 6 : 4,
              width: '100%',
              gap: 8,
            }}
          >
            {/* Bouton gauche : Appliquer à mon groupe actif */}
            <Pressable
              onPress={() => setApplyToAllGroups(false)}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 8,
                backgroundColor: !applyToAllGroups ? '#e0ff00' : '#e5e7eb',
                borderWidth: 1,
                borderColor: !applyToAllGroups ? '#d4d700' : '#d1d5db',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
              }}
            >
              <Text style={{ 
                fontWeight: '700', 
                color: !applyToAllGroups ? '#0b2240' : '#6b7280', 
                fontSize: 12,
                textAlign: 'center'
              }}>
                Appliquer à mon groupe actif
              </Text>
            </Pressable>
            
            {/* Bouton droite : Appliquer à tous les groupes */}
            <Pressable
              onPress={() => setApplyToAllGroups(true)}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 8,
                backgroundColor: applyToAllGroups ? '#e0ff00' : '#e5e7eb',
                borderWidth: 1,
                borderColor: applyToAllGroups ? '#d4d700' : '#d1d5db',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
              }}
            >
              <Text style={{ 
                fontWeight: '700', 
                color: applyToAllGroups ? '#0b2240' : '#6b7280', 
                fontSize: 12,
                textAlign: 'center'
              }}>
                Appliquer à tous mes groupes
              </Text>
            </Pressable>
          </View>
        )}

        {/* Boutons "Tout dispo" et "Aucune dispo" */}
        {activeGroup?.name && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingLeft: Math.max(12, insets.left + 8),
              paddingRight: Math.max(12, insets.right + 8),
              marginTop: isPortrait ? 4 : 2,
              marginBottom: isPortrait ? 6 : 4,
              width: '100%',
              gap: 8,
            }}
          >
            {/* Bouton gauche : Tout dispo */}
            <Pressable
              onPress={setAllWeekAvailable}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 8,
                backgroundColor: '#2fc249',
                borderWidth: 1,
                borderColor: '#28a745',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
              }}
            >
              <Text style={{ 
                fontWeight: '700', 
                color: '#ffffff', 
                fontSize: 12,
                textAlign: 'center'
              }}>
                Tout dispo
              </Text>
            </Pressable>
            
            {/* Bouton droite : Aucune dispo */}
            <Pressable
              onPress={setAllWeekUnavailable}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 8,
                backgroundColor: '#ef4444',
                borderWidth: 1,
                borderColor: '#dc2626',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
              }}
            >
              <Text style={{ 
                fontWeight: '700', 
                color: '#ffffff', 
                fontSize: 12,
                textAlign: 'center'
              }}>
                Aucune dispo
              </Text>
            </Pressable>
          </View>
        )}

      </View>

      {/* Modal sélection du groupe */}
      <Modal visible={groupSelectorOpen} transparent animationType="fade" onRequestClose={() => setGroupSelectorOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <View style={{ width: '90%', maxWidth: 400, backgroundColor: '#ffffff', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#e5e7eb' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontWeight: '900', fontSize: 18, color: '#0b2240' }}>Choisir un groupe</Text>
              <Pressable onPress={() => setGroupSelectorOpen(false)} style={{ padding: 8 }}>
                <Ionicons name="close" size={22} color="#111827" />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 320 }}>
              {(myGroups || []).map((g) => (
                <Pressable
                  key={g.id}
                  onPress={press(`pick-group-${g.id}`, async () => {
                    try {
                      await AsyncStorage.setItem('active_group_id', String(g.id));
                    } catch {}
                    try { setGroupSelectorOpen(false); } catch {}
                    try { if (activeGroup?.id !== g.id) { setActiveGroup({ id: g.id, name: g.name }); } } catch {}
                    // fallback local si nécessaire
                    setPersistedGroupId(g.id);
                    fetchData();
                  })}
                  style={({ pressed }) => ({ paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, backgroundColor: pressed ? '#f3f4f6' : '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 8 })}
                >
                  <Text style={{ fontWeight: '800', color: '#111827' }}>{g.name || 'Groupe'}</Text>
                </Pressable>
              ))}
              {(myGroups || []).length === 0 && (
                <Text style={{ color: '#6b7280', textAlign: 'center' }}>Aucun groupe</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* TABLEAU JOURS × HEURES (mode tableau pour tous les modes) */}
<View style={{ flex: 1 }}>
  {/* En-tête: case vide (horaire) + 7 jours */}
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: Math.max(12, insets.left + 8),
      paddingRight: Math.max(8, insets.right),
      gap: 1,
      marginTop: 2,
      marginBottom: 2,
    }}
  >
    {/* Cellule vide pour l’entête des heures */}
    <View style={{ width: 56 }} />
    {/* En-têtes de jours */}
    {days.map((day, i) => {
      const isToday = day.isSame(dayjs(), 'day');
      return (
        <View key={day.format('YYYY-MM-DD')} style={{ width: 43, paddingHorizontal: 1, marginLeft: i === 0 ? -2 : 0 }}>
          <View
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 4,
              borderRadius: 8,
              backgroundColor: isToday ? ORANGE : '#082b50',
              borderWidth: 1,
              borderColor: isToday ? ORANGE : '#082b50',
              minHeight: 26,
            }}
          >
            <Text 
              style={[
                { 
                  fontWeight: '800', 
                  color: '#ffffff', 
                  textAlign: 'center'
                },
                Platform.OS === 'android' ? { fontSize: 8, lineHeight: 10 } : { fontSize: 11, lineHeight: 14 }
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit={Platform.OS === 'android'}
              minimumFontScale={Platform.OS === 'android' ? 0.7 : 1}
            >
              {day.format('dd').toUpperCase()} {day.format('D')}
            </Text>
          </View>
        </View>
      );
    })}
  </View>

  {/* Corps: lignes d'heures (gauche) × colonnes de jours (droite) */}
  <ScrollView
    ref={scrollRef}
    style={{ flex: 1 }}
    contentContainerStyle={{ paddingBottom: Math.max(16, insets.bottom + 200) }}
    scrollIndicatorInsets={{ bottom: Math.max(8, insets.bottom + 140) }}
    showsVerticalScrollIndicator
    decelerationRate={Platform.OS === 'ios' ? 'fast' : 0.98}
    onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
    scrollEventThrottle={16}
  >
    {hoursOfDay.map(({ hour, minute }, idx) => (
      <View
        key={`row-${hour}-${minute}`}
        style={{
          flexDirection: 'row',
          alignItems: 'stretch',
          paddingLeft: Math.max(12, insets.left + 8),
          paddingRight: Math.max(8, insets.right),
          gap: 1,
        }}
      >
        {/* Gouttière heures (colonne gauche) */}
        <View
          style={{
            width: 62,
            height: SLOT_HEIGHT,
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
            paddingTop: 2,
          }}
        >
          <Text style={{
            fontSize: isPortrait ? FIRST_COL_FONT_PORTRAIT : FIRST_COL_FONT_LANDSCAPE,
            lineHeight: isPortrait ? FIRST_COL_FONT_PORTRAIT : FIRST_COL_FONT_LANDSCAPE,
            color: '#ffffff',
            fontWeight: '700',
          }}>
            {String(hour).padStart(2, '0')}:{minute ? '30' : '00'}
          </Text>
        </View>

        {/* 7 cellules jour pour le créneau courant */}
        {days.map((day, i) => {
          const di = day.diff(weekStart, 'day');
          const startIso = keySlot(day, hour, minute);
          
          // Vérifier si le créneau est dans le passé
          const slotDateTime = dayjs(startIso);
          const now = dayjs();
          const isPast = slotDateTime.isBefore(now);
          
          // Récupérer le nombre pré-calculé depuis le cache (beaucoup plus rapide)
          const availableCount = cellCountByStartIso.get(startIso) ?? 0;
          const match = mapMatches.get(startIso);
          // Normaliser startIso pour la recherche dans myStatusByStart
          const normalizedStartIsoForLookup = normalizeSlotTime(startIso);
          const myStatus = myStatusByStart.get(normalizedStartIsoForLookup);

          // Couleurs selon la disponibilité du joueur
          let cellBg = '#f7f9fd'; // par défaut
          let cellBorder = '#1f2937';
          let textColor = '#0b2240';
          
          // Couleurs selon la disponibilité du joueur
          // On garde le rouge clair pour "non dispo" même si le créneau est passé
          if (myStatus === 'neutral' || myStatus === null || myStatus === undefined) {
            cellBg = '#fee2e2';
            cellBorder = '#fee2e2';
          } else if (isPast) {
            cellBg = '#f3f4f6'; // gris clair
            cellBorder = '#d1d5db'; // gris
            textColor = '#9ca3af'; // gris foncé
          } else if (myStatus === 'available') {
            cellBg = '#105b23';
            cellBorder = '#105b23';
          }

          // Surbrillance de la plage en cours (prévisualisation) - uniquement si le créneau n'est pas passé
          if (!isPast && rangeStart && rangeStart.dayIndex === di) {
            const a = Math.min(rangeStart.slotIdx, rangeHover ?? rangeStart.slotIdx);
            const b = Math.max(rangeStart.slotIdx, rangeHover ?? rangeStart.slotIdx);
            if (idx >= a && idx <= b && !match) {
              if (rangeIntent === 'neutral') {
                cellBg = '#fee2e2';      // red-100
                cellBorder = '#ef4444';  // red-500
                textColor = '#7f1d1d';   // red-900
              } else {
                cellBg = '#d1fae5';      // green-100
                cellBorder = '#10b981';  // green-500
                textColor = '#065f46';   // green-900
              }
            }
          }

          // Badge colors (plus utilisés maintenant, mais gardés pour compatibilité)
          let badgeBg = '#e5e7eb';
          let badgeColor = '#0f172a';

          return (
            <Pressable
              key={startIso}
              disabled={isPast}
              delayLongPress={250}
              onPressIn={() => {
                if (isPast) return;
                if (rangeStart && rangeStart.dayIndex === di && idx !== rangeHover) setRangeHover(idx);
                try { Haptics.selectionAsync(); } catch {}
              }}
              onHoverIn={() => { if (isPast || (Platform.OS === 'web' && rangeStart && rangeStart.dayIndex === di && idx !== rangeHover)) return; setRangeHover(idx); }}
              onMouseEnter={() => { if (isPast || (Platform.OS === 'web' && rangeStart && rangeStart.dayIndex === di && idx !== rangeHover)) return; setRangeHover(idx); }}
              onPress={press(`toggle-${startIso}`, async () => {
                // Si le créneau est passé, ne rien faire
                if (isPast) return;
                // Si une sélection est en cours, ne pas déclencher le toggle
                if (rangeStart) return;
                try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
                await toggleMyAvailability(startIso);
              })}
              onLongPress={() => {
                // Si le créneau est passé, ne rien faire
                if (isPast) return;
                if (!rangeStart) {
                  // Démarre une plage sur ce jour : intention d'après mon statut initial
                  const normalizedStartIsoForLookup = normalizeSlotTime(startIso);
                  const my = myStatusByStart.get(normalizedStartIsoForLookup);
                  const intent = my === 'available' ? 'neutral' : 'available';
                  setRangeIntent(intent);
                  setRangeStart({ dayIndex: di, slotIdx: idx });
                  setRangeHover(idx);
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
                } else {
                  // Termine la plage (même jour uniquement) puis applique + ouvre le modal de copie
                  const a = Math.min(rangeStart.slotIdx, idx);
                  const b = Math.max(rangeStart.slotIdx, idx);
                  const batch = [];
                  for (let i2 = a; i2 <= b; i2++) {
                    const { hour: h, minute: m } = hoursOfDay[i2];
                    batch.push(keySlot(day, h, m));
                  }
                  if (rangeIntent === 'neutral') {
                    setMyNeutralBulk(batch);
                  } else {
                    setMyAvailabilityBulk(batch, 'available');
                  }
                  const sel = Array(7).fill(false);
                  sel[di] = false; // jour de base non modifiable dans la fenêtre
                  setApplyModal({ visible: true, baseDayIndex: di, startIdx: a, endIdx: b, intent: rangeIntent, selected: sel });
                  setRangeStart(null);
                  setRangeHover(null);
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
                }
              }}
              android_ripple={{ color: isPast ? 'transparent' : '#00000022', borderless: false }}
              style={({ pressed }) => ({
                width: 43,
                marginLeft: i === 0 ? -8 : 0,
                height: SLOT_HEIGHT,
                paddingHorizontal: 8,
                borderBottomWidth: 1,
                borderColor: cellBorder,
                justifyContent: 'center',
                backgroundColor: cellBg,
                ...(Platform.OS === 'web' ? { cursor: isPast ? 'not-allowed' : 'pointer' } : {}),
                borderRadius: 6,
                overflow: 'hidden',
                position: 'relative',
                transform: pressed && !isPast ? [{ scale: 0.985 }] : [{ scale: 1 }],
                opacity: isPast ? 0.5 : (pressed ? 0.92 : 1),
              })}
            >
              {/* Affichage pour les admins : nombre en haut à droite + balle de padel au centre si disponible */}
              {isAdmin ? (
                <>
                  {/* Nombre de joueurs disponibles dans le coin supérieur droit */}
                  {availableCount > 0 && (
                    <View style={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Text
                        style={{
                          fontSize: 11,
                          lineHeight: 13,
                          fontWeight: '900',
                          color: myStatus === 'available' ? '#ffffff' : '#0b2240',
                          textAlign: 'center',
                        }}
                      >
                        {availableCount}
                      </Text>
                    </View>
                  )}
                  {/* Balle de padel au centre si l'admin est disponible */}
                  {myStatus === 'available' && (
                    <View style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: [{ translateX: -12 }, { translateY: -12 }],
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Image
                        source={ballIcon}
                        style={{
                          width: 24,
                          height: 24,
                        }}
                        resizeMode="contain"
                      />
                    </View>
                  )}
                </>
              ) : (
                /* Affichage pour les joueurs : nombre en haut à droite + balle de padel au centre si disponible */
                <>
                  {/* Nombre de joueurs disponibles dans le coin supérieur droit */}
                  {availableCount > 0 && (
                    <View style={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Text
                        style={{
                          fontSize: 9,
                          lineHeight: 11,
                          fontWeight: '900',
                          color: myStatus === 'available' ? '#ffffff' : '#0b2240',
                          textAlign: 'center',
                        }}
                      >
                        {availableCount}
                      </Text>
                    </View>
                  )}
                  {/* Balle de padel au centre si le joueur est disponible */}
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    {myStatus === 'available' ? (
                      <Image
                        source={ballIcon}
                        style={{
                          width: 22,
                          height: 22,
                        }}
                        resizeMode="contain"
                      />
                    ) : null}
                  </View>
                </>
              )}
            </Pressable>
          );
        })}
      </View>
    ))}
  </ScrollView>
</View>

      {/* Modal d'application de la plage sur d'autres jours */}
      <Modal
        visible={applyModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setApplyModal((m) => ({ ...m, visible: false }))}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <View style={{ width: '96%', maxWidth: 420, backgroundColor: '#ffffff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e5e7eb' }}>
            <Text style={{ fontWeight: '900', fontSize: 14, color: '#0b2240', marginBottom: 6 }}>Appliquer cette plage à d'autres jours ?</Text>
            <Text style={{ color: '#374151', marginBottom: 12, fontSize: 12 }}>
              Sélectionne les jours sur lesquels {applyModal.intent === 'neutral' ? "annuler" : "copier"} la même plage horaire.
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {['LU','MA','ME','JE','VE','SA','DI'].map((label, i) => {
                const isBase = i === applyModal.baseDayIndex;
                const active = applyModal.selected[i] === true;
                return (
                  <Pressable
                    key={label}
                    disabled={isBase}
                    onPress={() => setApplyModal((m) => {
                      const next = [...m.selected];
                      next[i] = !next[i];
                      return { ...m, selected: next };
                    })}
                    style={({ pressed }) => [
                      {
                        opacity: isBase ? 0.5 : 1,
                        borderWidth: 2,
                        borderColor: active ? '#156BC9' : '#d1d5db',
                        backgroundColor: active ? '#E8F0FF' : '#fff',
                        paddingVertical: 4,
                        paddingHorizontal: 8,
                        borderRadius: 999,
                      },
                      Platform.OS === 'web' ? { cursor: isBase ? 'not-allowed' : 'pointer' } : null,
                      pressed ? { opacity: 0.9 } : null,
                    ]}
                  >
                    <Text style={{ fontWeight: '800', fontSize: 12, lineHeight: 13, color: active ? '#156BC9' : '#374151' }}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-start', gap: 16, marginBottom: 12 }}>
              <Pressable
                onPress={() => setApplyModal((m) => {
                  const sel = Array(7).fill(false);
                  for (let i = 0; i < 7; i++) if (i !== m.baseDayIndex) sel[i] = true; // tout (hors jour de base, non applicable)
                  return { ...m, selected: sel };
                })}
                style={({ pressed }) => [ { paddingVertical: 8, paddingHorizontal: 10 }, pressed ? { opacity: 0.8 } : null ]}
              >
                <Text style={{ color: '#156BC9', fontWeight: '800', fontSize: 13 }}>Tout</Text>
              </Pressable>

              <Pressable
                onPress={() => setApplyModal((m) => ({ ...m, selected: Array(7).fill(false) }))}
                style={({ pressed }) => [ { paddingVertical: 8, paddingHorizontal: 10 }, pressed ? { opacity: 0.8 } : null ]}
              >
                <Text style={{ color: '#156BC9', fontWeight: '800', fontSize: 13 }}>Aucun</Text>
              </Pressable>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <Pressable
                onPress={() => setApplyModal((m) => ({ ...m, visible: false }))}
                style={({ pressed }) => [ { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db' }, pressed ? { opacity: 0.9 } : null ]}
              >
                <Text style={{ fontWeight: '800', color: '#374151', fontSize: 13 }}>Annuler</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  const picks = applyModal.selected
                    .map((v, i) => (v ? i : null))
                    .filter((v) => v != null);
                  if (picks.length === 0) { setApplyModal((m) => ({ ...m, visible: false })); return; }
                  const batches = [];
                  for (const di of picks) {
                    const dayObj = weekStart.add(di, 'day');
                    const list = isoRangeForDay(dayObj, applyModal.startIdx, applyModal.endIdx);
                    batches.push(...list);
                  }
                  if (applyModal.intent === 'neutral') {
                    await setMyNeutralBulk(batches);
                  } else {
                    await setMyAvailabilityBulk(batches, 'available');
                  }
                  setApplyModal((m) => ({ ...m, visible: false }));
                }}
                style={({ pressed }) => [ { backgroundColor: '#156BC9', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 }, pressed ? { opacity: 0.9 } : null ]}
              >
                <Text style={{ fontWeight: '900', color: 'white', fontSize: 13 }}>Appliquer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Week navigator - Positionné en bas, collé au sélecteur de groupe */}
      <View
        style={{
          position: 'absolute',
          bottom: (tabBarHeight || 0) + 36,
          left: 0,
          right: 0,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          paddingVertical: 8,
          paddingHorizontal: 16,
          backgroundColor: '#001831',
          zIndex: 999,
          elevation: 9,
          marginBottom: 0,
        }}
      >
        <Pressable
          onPress={() => setWeekStart((w) => w.subtract(1, 'week'))}
          accessibilityRole="button"
          accessibilityLabel="Semaine précédente"
          hitSlop={10}
          style={{ padding: 8, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="caret-back" size={32} color="#156BC9" />
        </Pressable>

        <Text style={{ fontWeight: '900', fontSize: 16, color: '#ffffff' }}>
          {formatWeekRangeLabel(weekStart.toDate(), weekStart.add(6, 'day').toDate())}
        </Text>

        <Pressable
          onPress={() => setWeekStart((w) => w.add(1, 'week'))}
          accessibilityRole="button"
          accessibilityLabel="Semaine suivante"
          hitSlop={10}
          style={{ padding: 8, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="caret-forward" size={32} color="#156BC9" />
        </Pressable>
      </View>

      {/* Sélecteur de groupe - Positionné en bas, collé à la tabbar */}
      {activeGroup?.name && (
        <Pressable
          onPress={() => { setGroupSelectorOpen(true); loadMyGroups(); }}
          style={{
            position: 'absolute',
            bottom: (tabBarHeight || 0),
            left: 0,
            right: 0,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 8,
            paddingHorizontal: 16,
            backgroundColor: '#001831',
            zIndex: 998,
            elevation: 8,
            marginTop: 0,
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
          }}
        >
          <Ionicons name="people" size={20} color="#e0ff00" style={{ marginRight: 6 }} />
          <Text style={{ fontWeight: '800', color: '#e0ff00', fontSize: 15 }}>
            {activeGroup.name || 'Sélectionner un groupe'}
          </Text>
          <Ionicons name="chevron-down" size={18} color="#e0ff00" style={{ marginLeft: 4 }} />
        </Pressable>
      )}

      {/* Popup première visite dispos */}
      <OnboardingModal
        visible={disposVisitedModalVisible}
        message="Renseignez vos disponibilités en cliquant sur les créneaux, puis direction la page Matches"
        onClose={() => setDisposVisitedModalVisible(false)}
      />

      {/* Popup pas de dispos renseignées */}
      <OnboardingModal
        visible={noAvailabilityModalVisible}
        message="renseigne tes dispos pour avoir des matchs"
        onClose={() => setNoAvailabilityModalVisible(false)}
      />

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

      {/* Popup "Renseigne tes dispos" depuis la redirection initiale */}
      <OnboardingModal
        visible={showDisposPromptModal}
        message="Renseigne tes dispos"
        onClose={() => {
          setShowDisposPromptModal(false);
        }}
      />
    </View>
  );
}