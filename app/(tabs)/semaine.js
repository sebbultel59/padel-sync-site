// app/(tabs)/semaine.js
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import dayjs from "dayjs";
import "dayjs/locale/fr";
import isoWeek from "dayjs/plugin/isoWeek";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Image, Modal, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActiveGroup } from "../../lib/activeGroup";
import { supabase } from "../../lib/supabase";
import { press } from "../../lib/uiSafe";


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
  function scheduleRefresh(ms = 200) {
    try { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); } catch {}
    refreshTimerRef.current = setTimeout(() => { try { fetchData(); } catch {} }, ms);
  }
  React.useEffect(() => () => { try { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); } catch {} }, []);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
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
  const isPortrait = height > width;
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

  const { activeGroup } = useActiveGroup();
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

  const params = useLocalSearchParams();

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
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, groupId]);

  async function fetchData() {
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
        const { data: avData, error: eAv } = await supabase
          .rpc("get_availability_effective", {
            p_group: groupId,
            p_user: null, // tous les utilisateurs
            p_low: start,
            p_high: end,
          });
        if (eAv) throw eAv;
        av = avData ?? [];
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

      const tsJson = JSON.stringify(ts ?? []);
      const avJson = JSON.stringify(av ?? []);
      const mJson  = JSON.stringify(mData ?? []);

      if (lastDataRef.current.ts !== tsJson) {
        lastDataRef.current.ts = tsJson;
        setTimeSlots(ts ?? []);
      }
      if (lastDataRef.current.av !== avJson) {
        lastDataRef.current.av = avJson;
        setSlots(av ?? []);
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
  }

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

  const keySlot = (d, hour, minute) =>
    dayjs(d).hour(hour).minute(minute).second(0).millisecond(0).toISOString();

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
    
    const byStart = new Map(); // startIso -> Map(user_id -> 'available' | 'neutral')
    
    // Parcourir les slots triés : on garde la première (la plus récente) pour chaque user/start
    // Afficher TOUS les joueurs disponibles du groupe (pas seulement les membres)
    for (const s of sortedSlots) {
      if (s.group_id === groupId) {
        const k = dayjs(s.start).toISOString();
        let usersMap = byStart.get(k);
        if (!usersMap) {
          usersMap = new Map();
          byStart.set(k, usersMap);
        }
        // Si l'user n'existe pas encore pour ce créneau, on l'ajoute
        // Comme on trie par date décroissante, on garde la version la plus récente
        if (!usersMap.has(s.user_id)) {
          const isAvail = String(s.status || 'available').toLowerCase() === 'available';
          usersMap.set(s.user_id, isAvail ? 'available' : 'neutral');
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

  // Statut de MA dispo par start
  const myStatusByStart = useMemo(() => {
    const m = new Map();
    if (!meId) return m;
    (slots || [])
      .filter((s) => s.user_id === meId && s.group_id === groupId)
      .forEach((s) => {
        const k = dayjs(s.start).toISOString();
        m.set(k, s.status || "available");
      });
    return m;
  }, [slots, meId, groupId]);

  // Cycle 3 états (conservé si besoin ailleurs) : neutral -> available -> absent -> neutral
  function nextStatus3(current) {
    if (current === "available") return "absent";
    if (current === "absent") return "neutral";
    return "available";
  }

  // Toggle dispo (optimistic UI)
  async function toggleMyAvailability(startIso) {
    try {
      const gid = groupId ?? (await AsyncStorage.getItem("active_group_id"));
      const endIso = dayjs(startIso).add(SLOT_MIN, "minute").toISOString();
      const { data: { user } } = await supabase.auth.getUser();

      if (!gid) {
        return safeAlert(
          "Choisis un groupe",
          "Active un groupe dans l’onglet Groupes avant d’enregistrer des dispos."
        );
      }
      if (!user) return safeAlert("Connexion requise");

      const mine = (slots || []).find(
        (s) =>
          s.user_id === user.id &&
          s.group_id === gid &&
          dayjs(s.start).toISOString() === startIso
      );

      if (!mine) {
        const optimistic = {
          user_id: user.id,
          group_id: gid,
          start: startIso,
          end: endIso,
          status: "available",
        };
        setSlots((prev) => [...prev, optimistic]);
        try { Haptics.selectionAsync(); } catch {}

        if (applyToAllGroups) {
          const { error } = await supabase.rpc("set_availability_global", {
            p_user: user.id,
            p_start: startIso,
            p_end: endIso,
            p_status: "available",
          });
          if (error) { await fetchData(); throw error; }
        } else {
          const { error } = await supabase.rpc("set_availability_group", {
            p_user: user.id,
            p_group: gid,
            p_start: startIso,
            p_end: endIso,
            p_status: "available",
          });
          if (error) { await fetchData(); throw error; }
        }
      } else if (mine.status === 'available') {
        // passe à neutre → suppression
        setSlots((prev) => prev.filter((s) => !(s.user_id === mine.user_id && s.group_id === gid && dayjs(s.start).toISOString() === startIso)));
        try { Haptics.selectionAsync(); } catch {}
        
        if (applyToAllGroups) {
          // Supprimer de global (via RPC ou delete direct)
          const { error } = await supabase
            .from('availability_global')
            .delete()
            .eq('user_id', user.id)
            .eq('start', startIso)
            .eq('end', endIso);
          if (error) { await fetchData(); throw error; }
        } else {
          const { error } = await supabase
            .from('availability')
            .delete()
            .eq('user_id', user.id)
            .eq('group_id', gid)
            .eq('start', startIso)
            .eq('end', endIso);
          if (error) { await fetchData(); throw error; }
        }
      } else {
        // quel que soit l'état (absent/neutre), force à available
        setSlots((prev) => prev.map((s) => (
          s.user_id === mine.user_id && s.group_id === gid && dayjs(s.start).toISOString() === startIso
            ? { ...s, status: 'available' }
            : s
        )));
        try { Haptics.selectionAsync(); } catch {}
        
        if (applyToAllGroups) {
          const { error } = await supabase.rpc("set_availability_global", {
            p_user: user.id,
            p_start: startIso,
            p_end: endIso,
            p_status: "available",
          });
          if (error) { await fetchData(); throw error; }
        } else {
          const { error } = await supabase.rpc("set_availability_group", {
            p_user: user.id,
            p_group: gid,
            p_start: startIso,
            p_end: endIso,
            p_status: "available",
          });
          if (error) { await fetchData(); throw error; }
        }
      }

      scheduleRefresh(200);
    } catch (e) {
      safeAlert("Erreur", e?.message ?? String(e));
    }
  }

  // Fixe explicitement ma dispo sur un créneau (available|absent|neutral)
  async function setMyAvailability(startIso, status) {
    try {
      const gid = groupId ?? (await AsyncStorage.getItem("active_group_id"));
      const endIso = dayjs(startIso).add(SLOT_MIN, "minute").toISOString();
      const { data: { user } } = await supabase.auth.getUser();
      if (!gid) return;
      if (!user) return;

      const mine = (slots || []).find(
        (s) => s.user_id === user.id && s.group_id === gid && dayjs(s.start).toISOString() === startIso
      );

      if (!mine && status !== 'neutral') {
        const optimistic = { user_id: user.id, group_id: gid, start: startIso, end: endIso, status };
        setSlots((prev) => [...prev, optimistic]);
        try { Haptics.selectionAsync(); } catch {}
        
        if (applyToAllGroups) {
          const { error } = await supabase.rpc("set_availability_global", {
            p_user: user.id,
            p_start: startIso,
            p_end: endIso,
            p_status: status,
          });
          if (error) { await fetchData(); throw error; }
        } else {
          const { error } = await supabase.rpc("set_availability_group", {
            p_user: user.id,
            p_group: gid,
            p_start: startIso,
            p_end: endIso,
            p_status: status,
          });
          if (error) { await fetchData(); throw error; }
        }
      } else if (mine && mine.status !== status) {
        if (status === 'neutral') {
          setSlots((prev) => prev.filter((s) => !(s.user_id === mine.user_id && s.group_id === gid && dayjs(s.start).toISOString() === startIso)));
          try { Haptics.selectionAsync(); } catch {}
          
          if (applyToAllGroups) {
            const { error } = await supabase
              .from('availability_global')
              .delete()
              .eq('user_id', user.id)
              .eq('start', startIso)
              .eq('end', endIso);
            if (error) { await fetchData(); throw error; }
          } else {
            const { error } = await supabase
              .from('availability')
              .delete()
              .eq('user_id', user.id)
              .eq('group_id', gid)
              .eq('start', startIso)
              .eq('end', endIso);
            if (error) { await fetchData(); throw error; }
          }
          return;
        }
        setSlots((prev) => prev.map((s) => (
          s.user_id === mine.user_id && s.group_id === gid && dayjs(s.start).toISOString() === startIso
            ? { ...s, status }
            : s
        )));
        try { Haptics.selectionAsync(); } catch {}
        
        if (applyToAllGroups) {
          const { error } = await supabase.rpc("set_availability_global", {
            p_user: user.id,
            p_start: startIso,
            p_end: endIso,
            p_status: status,
          });
          if (error) { await fetchData(); throw error; }
        } else {
          const { error } = await supabase.rpc("set_availability_group", {
            p_user: user.id,
            p_group: gid,
            p_start: startIso,
            p_end: endIso,
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

      // 1) Optimistic UI : ajoute/maj tous les créneaux localement
      setSlots((prev) => {
        const map = new Map(prev.map((s) => [dayjs(s.start).toISOString() + '|' + s.user_id, s]));
        for (const startIso of startIsos) {
          const endIso = dayjs(startIso).add(SLOT_MIN, 'minute').toISOString();
          const key = startIso + '|' + user.id;
          const existing = map.get(key);
          if (!existing) {
            map.set(key, { user_id: user.id, group_id: gid, start: startIso, end: endIso, status });
          } else if (existing.status !== status) {
            map.set(key, { ...existing, status });
          }
        }
        return Array.from(map.values());
      });

      try { Haptics.selectionAsync(); } catch {}

      // 2) Persistance : upsert en une seule requête (selon toggle)
      if (applyToAllGroups) {
        const rows = startIsos.map((startIso) => ({
          user_id: user.id,
          start: startIso,
          end: dayjs(startIso).add(SLOT_MIN, 'minute').toISOString(),
          status,
        }));
        const { error } = await supabase
          .from('availability_global')
          .upsert(rows, { onConflict: 'user_id,start,end' });
        if (error) throw error;
      } else {
        const rows = startIsos.map((startIso) => ({
          user_id: user.id,
          group_id: gid,
          start: startIso,
          end: dayjs(startIso).add(SLOT_MIN, 'minute').toISOString(),
          status,
        }));
        const { error } = await supabase
          .from('availability')
          .upsert(rows, { onConflict: 'user_id,group_id,start,end' });
        if (error) throw error;
      }

      // Optionnel : resync silencieux
      scheduleRefresh(200);
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

      // Optimistic: enlever localement toutes mes lignes correspondantes
      setSlots((prev) => prev.filter((s) => {
        const key = dayjs(s.start).toISOString();
        return !(s.user_id === user.id && s.group_id === gid && startIsos.includes(key));
      }));
      try { Haptics.selectionAsync(); } catch {}

      // Delete en une requête par lot (selon toggle)
      if (applyToAllGroups) {
        const { error } = await supabase
          .from('availability_global')
          .delete()
          .eq('user_id', user.id)
          .in('start', startIsos);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('availability')
          .delete()
          .eq('user_id', user.id)
          .eq('group_id', gid)
          .in('start', startIsos);
        if (error) throw error;
      }

      scheduleRefresh(200);
    } catch (e) {
      console.warn('[setMyNeutralBulk] error:', e);
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
                const people = mapDispos.get(startIso) || [];
                const availableCount = uniqueAvailableCount(people);
                const match = mapMatches.get(startIso);

                const myStatus = myStatusByStart.get(startIso);
                let cellBg = '#f7f9fd';
                let cellBorder = '#1f2937';
                let textColor = '#0b2240';

                // Mapping uniforme selon le nombre de dispos
                if (availableCount <= 0) {
                  cellBg = '#fee2e2';
                  cellBorder = '#fecaca';
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
                    onPress={press(`toggle-${startIso}`, () => toggleMyAvailability(startIso))}
                    onLongPress={() => {
                      // Ensure startIso is defined (already is above)
                      if (rangeStartIdx == null) {
                        // Décide l'intention de plage d'après le statut du premier créneau
                        const my = myStatusByStart.get(startIso);
                        const intent = my === 'available' ? 'neutral' : 'available';
                        setRangeIntent(intent);
                        setRangeStartIdx(idx);
                        setRangeHoverIdx(idx);
                        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
                      } else {
                        const a = Math.min(rangeStartIdx, idx);
                        const b = Math.max(rangeStartIdx, idx);
                        const batch = [];
                        for (let i = a; i <= b; i++) {
                          const { hour: h, minute: m } = hoursOfDay[i];
                          batch.push(keySlot(day, h, m));
                        }
                        if (onPaintRangeWithStatus) onPaintRangeWithStatus(batch, rangeIntent);
                        onRangeCompleted && onRangeCompleted({ startIdx: a, endIdx: b, dayIndex, intent: rangeIntent });
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
        {/* Ligne 1 : navigation semaine + libellé */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: isPortrait ? 16 : 8,
            width: '100%'
          }}
        >
          <Pressable
            onPress={() => setWeekStart((w) => w.subtract(1, 'week'))}
            accessibilityRole="button"
            accessibilityLabel="Semaine précédente"
            hitSlop={10}
            style={{ padding: isPortrait ? 8 : 4, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="caret-back" size={isPortrait ? 32 : 24} color="#156BC9" />
          </Pressable>

          <Text style={{ fontWeight: '900', color: '#ffffff', fontSize: isPortrait ? 16 : 14 }}>
            {formatWeekRangeLabel(weekStart.toDate(), weekStart.add(6, 'day').toDate())}
          </Text>

          <Pressable
            onPress={() => setWeekStart((w) => w.add(1, 'week'))}
            accessibilityRole="button"
            accessibilityLabel="Semaine suivante"
            hitSlop={10}
            style={{ padding: isPortrait ? 8 : 4, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="caret-forward" size={isPortrait ? 32 : 24} color="#156BC9" />
          </Pressable>
        </View>

        {/* Ligne: nom du groupe sélectionné + toggle global (sous la navigation) */}
        {activeGroup?.name ? (
          <View
            style={{
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              paddingLeft: Math.max(12, insets.left + 8),
              paddingRight: Math.max(12, insets.right + 8),
              marginTop: isPortrait ? 4 : 2,
              marginBottom: isPortrait ? 6 : 4,
              width: '100%',
              gap: isPortrait ? 8 : 6,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="people" size={18} color="#e0ff00" style={{ marginRight: 6 }} />
              <Text style={{ fontWeight: '800', color: '#e0ff00', fontSize: 13 }}>
                {activeGroup.name}
              </Text>
            </View>
            
            {/* Toggle "Appliquer à tous les groupes" */}
            <Pressable
              onPress={() => setApplyToAllGroups((prev) => !prev)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: 999,
                backgroundColor: applyToAllGroups ? '#156BC9' : '#374151',
                borderWidth: 1,
                borderColor: applyToAllGroups ? '#0ea5e9' : '#6b7280',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
              }}
            >
              <Ionicons
                name={applyToAllGroups ? 'checkmark-circle' : 'close-circle'}
                size={16}
                color="#ffffff"
                style={{ marginRight: 6 }}
              />
              <Text style={{ fontWeight: '700', color: '#ffffff', fontSize: 12 }}>
                {applyToAllGroups ? '✓ Tous mes groupes' : '⚠️ Groupe uniquement'}
              </Text>
            </Pressable>
          </View>
        ) : null}

      </View>

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
            <Text style={{ fontWeight: '800', color: '#ffffff', fontSize: 11, lineHeight: 14 }}>
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
    contentContainerStyle={{ paddingBottom: Math.max(16, insets.bottom + 120) }}
    scrollIndicatorInsets={{ bottom: Math.max(8, insets.bottom + 60) }}
    showsVerticalScrollIndicator
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
          const people = mapDispos.get(startIso) || [];
          const availableCount = uniqueAvailableCount(people);
          const match = mapMatches.get(startIso);
          const myStatus = myStatusByStart.get(startIso);

          let cellBg = '#f7f9fd';
          let cellBorder = '#1f2937';
          let textColor = '#0b2240';

          // Mapping uniforme selon le nombre de dispos
          if (availableCount <= 0) {
            cellBg = '#fee2e2';
            cellBorder = '#fecaca';
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

          // Surbrillance de la plage en cours (prévisualisation)
          if (rangeStart && rangeStart.dayIndex === di) {
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

          return (
            <Pressable
              key={startIso}
              delayLongPress={250}
              onPressIn={() => { if (rangeStart && rangeStart.dayIndex === di && idx !== rangeHover) setRangeHover(idx); }}
              onHoverIn={() => { if (Platform.OS === 'web' && rangeStart && rangeStart.dayIndex === di && idx !== rangeHover) setRangeHover(idx); }}
              onMouseEnter={() => { if (Platform.OS === 'web' && rangeStart && rangeStart.dayIndex === di && idx !== rangeHover) setRangeHover(idx); }}
              onPress={press(`toggle-${startIso}`, () => toggleMyAvailability(startIso))}
              onLongPress={() => {
                if (!rangeStart) {
                  // Démarre une plage sur ce jour : intention d'après mon statut initial
                  const my = myStatusByStart.get(startIso);
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
              style={{
                width: 43,
                marginLeft: i === 0 ? -8 : 0,
                height: SLOT_HEIGHT,
                paddingHorizontal: 8,
                borderBottomWidth: 1,
                borderColor: cellBorder,
                justifyContent: 'center',
                backgroundColor: cellBg,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                borderRadius: 6,
                overflow: 'hidden',
              }}
            >
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text
                  style={{
                    fontSize: 12,
                    lineHeight: 14,
                    fontWeight: '900',
                    color: availableCount >= 4 ? '#0b2240' : '#0b2240',
                    textAlign: 'center',
                  }}
                >
                  {availableCount}
                </Text>
              </View>
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
    </View>
  );
}