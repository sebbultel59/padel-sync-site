import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from '@react-native-community/datetimepicker';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  Text,
  TextInput,
  View
} from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import clickIcon from '../../../assets/icons/click.png';
import racketIcon from '../../../assets/icons/racket.png';
import { useActiveGroup } from "../../../lib/activeGroup";
import { supabase } from "../../../lib/supabase";
import { press } from "../../../lib/uiSafe";

const COLORS = {
  primary: '#156bc9',   // bleu charte
  accent:  '#ff751f',   // orange charte
  ink:     '#111827',
  gray:    '#e5e7eb',
  grayBg:  '#aaaaaa',
};

const TINTS = {
  primaryBg: '#eaf4ff',
  accentBg:  '#fff3e9',
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

function colorForLevel(level) {
  const n = parseInt(level, 10);
  switch (n) {
    case 1: return "#a3e635";
    case 2: return "#86efac";
    case 3: return "#60a5fa";
    case 4: return "#22d3ee";
    case 5: return "#fbbf24";
    case 6: return "#f59e0b";
    case 7: return "#fb7185";
    case 8: return "#a78bfa";
    default: return "#d1d5db";
  }
}

export default function MatchesScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { activeGroup, setActiveGroup } = useActiveGroup();
  const groupId = activeGroup?.id ?? null;

  // États principaux
  const [meId, setMeId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('proposes');
  const [mode, setMode] = useState('long');
  const [rsvpMode, setRsvpMode] = useState('long');
  const [confirmedMode, setConfirmedMode] = useState('long');
  const [weekOffset, setWeekOffset] = useState(0);
  const [ready, setReady] = useState([]);
  const [hot, setHot] = useState([]);
  const [longReady, setLongReady] = useState([]);
  const [hourReady, setHourReady] = useState([]);
  const [matchesPending, setMatchesPending] = useState([]);
  const [matchesConfirmed, setMatchesConfirmed] = useState([]);
  const [rsvpsByMatch, setRsvpsByMatch] = useState({});
  const [profilesById, setProfilesById] = useState({});
  const [allGroupMemberIds, setAllGroupMemberIds] = useState([]);
  
  // Group selector states
  const [myGroups, setMyGroups] = useState([]);
  const [groupSelectorOpen, setGroupSelectorOpen] = useState(false);

  // Flash Match states
  const [flashMembers, setFlashMembers] = useState([]);
  const [flashLoading, setFlashLoading] = useState(false);
  const [flashSelected, setFlashSelected] = useState([]);
  const [flashPickerOpen, setFlashPickerOpen] = useState(false);
  const [flashQuery, setFlashQuery] = useState('');
  const [flashWhenOpen, setFlashWhenOpen] = useState(false);
  const [flashDateModalOpen, setFlashDateModalOpen] = useState(false);
  const [flashDatePickerOpen, setFlashDatePickerOpen] = useState(false);
  const [flashTimePickerOpen, setFlashTimePickerOpen] = useState(false);
  const [flashInlineDateOpen, setFlashInlineDateOpen] = useState(false);
  const [flashInlineTimeOpen, setFlashInlineTimeOpen] = useState(false);
  const [flashDatePickerModalOpen, setFlashDatePickerModalOpen] = useState(false);
  const [flashTimePickerModalOpen, setFlashTimePickerModalOpen] = useState(false);
  const [tempDate, setTempDate] = useState(() => new Date());
  const [tempTime, setTempTime] = useState(() => ({ hours: 20, minutes: 0 }));
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
      
      // Log les créneaux valides
      filtered.slice(0, 5).forEach(it => {
        console.log('[longReadyWeek] ✅ Créneau valide:', it.time_slot_id, 'starts_at:', it.starts_at, 'joueurs:', it.ready_user_ids?.length || 0);
      });
      console.log('[longReadyWeek] Créneaux après filtrage:', filtered.length, 'sur', longReady?.length || 0);
      return filtered;
    },
    [longReady, currentWs, currentWe]
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
      
      // Log les créneaux valides
      filtered.forEach(it => {
        console.log('[hourReadyWeek] ✅ Créneau valide:', it.time_slot_id, 'starts_at:', it.starts_at, 'joueurs:', it.ready_user_ids?.length || 0);
      });
      console.log('[hourReadyWeek] Créneaux après filtrage:', filtered.length, 'sur', hourReady?.length || 0);
      return filtered;
    },
  [hourReady, currentWs, currentWe]
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
      const filtered = (matchesConfirmed || []).filter(isNotPast);
      console.log('[Matches] ConfirmedWeek:', filtered.length, 'matches');
      if (filtered.length > 0) {
        console.log('[Matches] First confirmedWeek match:', filtered[0].id, 'time_slots exists:', !!filtered[0].time_slots, 'time_slots data:', filtered[0].time_slots);
      }
      return filtered;
    },
    [matchesConfirmed]
  );
  
const pendingHourWeek = React.useMemo(
  () => pendingWeek.filter(m =>
    durationMinutes(m?.time_slots?.starts_at, m?.time_slots?.ends_at) <= 60
  ),
  [pendingWeek]
);
  
const pendingLongWeek = React.useMemo(
  () => pendingWeek.filter(m =>
    durationMinutes(m?.time_slots?.starts_at, m?.time_slots?.ends_at) > 60
  ),
  [pendingWeek]
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
  return sections;
}, [longReadyWeek]);

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
function normalizeRsvp(s) {
  const t = String(s || '').trim().toLowerCase();
  if (t === 'accepté' || t === 'accepted') return 'accepted';
  if (t === 'peut-être' || t === 'peut etre' || t === 'maybe') return 'maybe';
  if (t === 'non' || t === 'no' || t === 'refusé' || t === 'declined') return 'no';
  return t;
}

function computeAvailableUsersForInterval(startsAt, endsAt, availabilityData) {
  if (!availabilityData || availabilityData.length === 0) {
    return [];
  }
  
  // Filtrer les disponibilités qui chevauchent avec l'intervalle demandé
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  
  const availableUserIds = availabilityData
    .filter(avail => {
      const availStart = new Date(avail.start);
      const availEnd = new Date(avail.end);
      
      // Vérifier si les intervalles se chevauchent
      // Chevauchement : availStart < end AND availEnd > start
      const overlaps = availStart < end && availEnd > start;
      
      return overlaps;
    })
    .map(avail => avail.user_id)
    .filter((value, index, self) => self.indexOf(value) === index); // Déduplication
  
  return availableUserIds;
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
    
    return computeAvailableUsersForInterval(startsAt, endsAt, availabilityData);
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
  backgroundColor: '#ffffff',
  padding: 16,
  borderRadius: 12,
  marginBottom: 12,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 4,
  elevation: 3,
};

// Composants utilitaires simples
const MetaLine = ({ m }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
    <Text style={{ color: '#6b7280', fontSize: 14 }}>
      Créé le {new Date(m.created_at).toLocaleDateString('fr-FR')}
    </Text>
    </View>
  );

const Divider = ({ m = 8 }) => (
  <View style={{ height: 1, backgroundColor: '#e5e7eb', marginVertical: m }} />
);

const Badge = ({ tone = 'blue', text }) => (
  <View
    style={{
      backgroundColor: tone === 'amber' ? '#f59e0b' : '#3b82f6',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      alignSelf: 'flex-start',
    }}
  >
    <Text style={{ color: 'white', fontWeight: '700', fontSize: 12 }}>
      {text}
    </Text>
  </View>
);

const Avatar = ({ uri, size = 56, rsvpStatus, fallback, phone, onPress, selected }) => {
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
  
  const borderColor = rsvpStatus === 'accepted' ? '#10b981' : rsvpStatus === 'no' ? '#ef4444' : '#f59e0b';
  const [imageError, setImageError] = React.useState(false);
  
  return (
    <Pressable
      onPress={onPress}
      style={{
    width: size,
    height: size,
    borderRadius: size / 2,
        backgroundColor: '#d1d5db',
        borderWidth: 2,
        borderColor: selected ? '#15803d' : borderColor,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
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

  // Compteurs pour les onglets (filtrer par semaine aussi)
  const proposedTabCount = React.useMemo(() => 
    (hourReadyWeek || []).filter(it => {
      const endTime = new Date(it.ends_at);
      return endTime > new Date();
    }).length + (longReadyWeek || []).filter(it => {
      const endTime = new Date(it.ends_at);
      return endTime > new Date();
    }).length
  , [hourReadyWeek, longReadyWeek]);
  
  const rsvpTabCount = React.useMemo(() => 
    (pendingWeek || []).filter(m => m?.time_slots?.starts_at && m?.time_slots?.ends_at && isInWeekRange(m.time_slots.starts_at, m.time_slots.ends_at, currentWs, currentWe)).length
  , [pendingWeek, currentWs, currentWe]);
  
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
  
  // Version pour forcer le re-render quand RSVPs changent
  const rsvpsVersion = React.useMemo(() => {
    return Object.values(rsvpsByMatch || {}).reduce(
      (n, v) => n + (Array.isArray(v) ? v.length : 0),
      0
    );
  }, [rsvpsByMatch]);

  // Fonction pour charger les données
  const fetchData = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      console.log('[Matches] fetchData called for group:', groupId);
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
        const { data: availabilityData, error: availabilityError } = await supabase
          .from('availability')
          .select('user_id, start, end')
          .eq('group_id', groupId)
          .eq('status', 'available');
        
        console.log('[Matches] Disponibilités chargées:', availabilityData?.length || 0, 'erreur:', availabilityError);
        if (availabilityData && availabilityData.length > 0) {
          console.log('[Matches] Exemple de disponibilité:', availabilityData[0]);
        }
        
        // D'abord, traiter les time_slots existants
        for (const ts of availableTimeSlots) {
          const availUserIds = computeAvailableUsersForInterval(ts.starts_at, ts.ends_at, availabilityData);
          const availCount = availUserIds ? availUserIds.length : 0;
          
          if (availCount >= 4) {
            console.log('[Matches] ✅ Créneau avec 4+ joueurs:', ts.id, 'starts_at:', ts.starts_at, 'joueurs:', availCount);
          }
          
          // Afficher tous les créneaux, même avec moins de 4 joueurs
          ready.push({
            time_slot_id: ts.id,
            starts_at: ts.starts_at,
            ends_at: ts.ends_at,
            ready_user_ids: availUserIds || [],
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

            // Compter les joueurs qui CHEVAUCHENT avec ce créneau (union, pas intersection)
            const players60 = availabilityData
              .filter(a => {
                const aStart = new Date(a.start);
                const aEnd = new Date(a.end);
                // Chevauchement simple
                return aStart < slotEnd60 && aEnd > slotStart;
              })
              .map(a => a.user_id);

            const players90 = availabilityData
              .filter(a => {
                const aStart = new Date(a.start);
                const aEnd = new Date(a.end);
                // Chevauchement simple
                return aStart < slotEnd90 && aEnd > slotStart;
              })
              .map(a => a.user_id);

            const uniquePlayers60 = [...new Set(players60)];
            const uniquePlayers90 = [...new Set(players90)];

            // Vérifier si ce créneau virtuel chevauche avec un time_slot existant
            const overlapsWithExistingSlot = (startsAt, endsAt) => {
              return (timeSlotsData || []).some(ts => {
                const tsStart = new Date(ts.starts_at);
                const tsEnd = new Date(ts.ends_at);
                return tsStart < endsAt && tsEnd > startsAt;
              });
            };

            // Afficher les créneaux avec 4+ joueurs disponibles
            if (uniquePlayers60.length >= 4) {
              const slotStartISO = slotStart.toISOString();
              const slotEnd60ISO = slotEnd60.toISOString();
              
              if (!overlapsWithExistingSlot(slotStart, slotEnd60)) {
                ready.push({
                  time_slot_id: `virtual-60-${slotStart.getTime()}`,
                  starts_at: slotStartISO,
                  ends_at: slotEnd60ISO,
                  ready_user_ids: uniquePlayers60,
                  hot_user_ids: [],
                });
                console.log('[Matches] ✅ Créneau virtuel 1h:', slotStartISO, 'avec', uniquePlayers60.length, 'joueurs');
              } else {
                console.log('[Matches] ⚠️ Créneau virtuel 1h ignoré (chevauche avec time_slot existant):', slotStartISO);
              }
            }

            // Afficher les créneaux avec 4+ joueurs disponibles
            if (uniquePlayers90.length >= 4) {
              const slotStartISO = slotStart.toISOString();
              const slotEnd90ISO = slotEnd90.toISOString();
              
              if (!overlapsWithExistingSlot(slotStart, slotEnd90)) {
                ready.push({
                  time_slot_id: `virtual-90-${slotStart.getTime()}`,
                  starts_at: slotStartISO,
                  ends_at: slotEnd90ISO,
                  ready_user_ids: uniquePlayers90,
                  hot_user_ids: [],
                });
                console.log('[Matches] ✅ Créneau virtuel 1h30:', slotStartISO, 'avec', uniquePlayers90.length, 'joueurs');
              } else {
                console.log('[Matches] ⚠️ Créneau virtuel 1h30 ignoré (chevauche avec time_slot existant):', slotStartISO);
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

      // Charger les RSVPs via les matchs du groupe
      let rsvpsData = [];
      if (matchesData && matchesData.length > 0) {
        const matchIds = matchesData.map(m => m.id).filter(Boolean);
        if (matchIds.length > 0) {
          const { data: rsvps, error: rsvpsError } = await supabase
          .from('match_rsvps')
            .select('*')
          .in('match_id', matchIds);

          if (rsvpsError) {
            console.error('[Matches] Error loading RSVPs:', rsvpsError);
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
            console.log('[Matches] Loaded', profilesData.length, 'profiles into map');
            setProfilesById(profilesMap);
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
        // IMPORTANT: Uniquement si même jour ET horaires qui chevauchent
        const bookedUsersForInterval = (startsAt, endsAt) => {
          const booked = new Set();
          (matchesData || []).forEach(m => {
            const st = String(m.status || '').toLowerCase();
            if (st !== 'pending' && st !== 'confirmed') return;
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
            console.log('[Matches] Joueur "maybe/accepted" trouvé sur créneau qui chevauche (même jour):', ms);
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

        // Keep only slots with >=4 remaining players
        adjusted = adjusted.filter(slot => Array.isArray(slot.ready_user_ids) && slot.ready_user_ids.length >= 4);

        console.log('[Matches] Après filtrage par conflits (joueurs déjà engagés):', adjusted.length, 'créneaux');

        // Final split by duration
        const longReadyFiltered = adjusted.filter(s => durationMinutes(s.starts_at, s.ends_at) > 60);
        const hourReadyFiltered = adjusted.filter(s => durationMinutes(s.starts_at, s.ends_at) <= 60);

        setReady(adjusted);
        setLongReady(longReadyFiltered);
        setHourReady(hourReadyFiltered);
      } catch (e) {
        console.warn('[Matches] Post-process propositions failed, falling back to raw ready list:', e?.message || e);
        const longReadyFiltered = (tempReady || []).filter(s => durationMinutes(s.starts_at, s.ends_at) > 60);
        const hourReadyFiltered = (tempReady || []).filter(s => durationMinutes(s.starts_at, s.ends_at) <= 60);
        setReady(tempReady || []);
        setLongReady(longReadyFiltered);
        setHourReady(hourReadyFiltered);
      }
      
      console.log('[Matches] fetchData completed');
    } catch (e) {
      console.error('[Matches] fetchData error:', e);
    } finally {
      setLoading(false);
    }
  }, [groupId, weekOffset]);

  // Charger les données au montage ou quand le groupe change
  useEffect(() => {
    console.log('[Matches] useEffect called, groupId:', groupId, 'weekOffset:', weekOffset);
    if (groupId) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [groupId, weekOffset]); // ✅ relance aussi quand la semaine visible change

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMeId(data?.user?.id ?? null);
    })();
  }, [groupId]);

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
          .select("id, name, avatar_url")
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
                fetchData(); // ✅ ici : relance recalcul des créneaux possibles
                return next;
              }

              if (ev === 'DELETE') {
                const i = arr.findIndex((r) => String(r.user_id) === userId);
                if (i >= 0) {
                  arr.splice(i, 1);
                  next[matchId] = arr;
                }
                fetchData(); // ✅ ici aussi
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
    };
  }, [groupId, fetchData]);

  // --- Flash Match helpers ---
  async function loadGroupMembersForFlash() {
    if (!groupId) return [];
    try {
      // Essai 1 : récupérer les membres avec jointure profiles si relation existante
      let { data, error } = await supabase
        .from('group_members')
        .select('user_id, profiles!inner(id, display_name, name, niveau)')
        .eq('group_id', groupId);

      // Si la jointure échoue (data vide ou erreur), fallback manuel
      if (error || !Array.isArray(data) || data.length === 0) {
        console.warn('[FlashMatch] fallback: pas de jointure profiles détectée');
        const { data: gm } = await supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', groupId);

        const ids = gm?.map(r => r.user_id).filter(Boolean) || [];

        if (ids.length === 0) return [];

        const { data: profs } = await supabase
          .from('profiles')
          .select('id, display_name, name, niveau')
          .in('id', ids);

        data = profs.map(p => ({
          user_id: p.id,
          profiles: { id: p.id, display_name: p.display_name, name: p.name, niveau: p.niveau },
        }));
      }

      // Normalisation
      const members = data
        .map(r => ({
          id: r?.profiles?.id || r?.user_id,
          name: r?.profiles?.display_name || r?.profiles?.name || 'Joueur inconnu',
          niveau: r?.profiles?.niveau || null,
        }))
        .filter(x => !!x.id);

      console.log(`[FlashMatch] ${members.length} membres chargés pour le groupe ${groupId}`);
      return members;
    } catch (e) {
      console.warn('[FlashMatch] load members failed:', e?.message || e);
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
      const members = await loadGroupMembersForFlash();

      // Assure-toi d'avoir mon UID même si meId n'est pas encore peuplé
      let uid = meId;
      if (!uid) {
        try {
          const { data: u } = await supabase.auth.getUser();
          uid = u?.user?.id ?? null;
        } catch {}
      }

      // Exclure l'utilisateur authentifié de la liste proposée
      let ms = (members || []).filter(m => !uid || String(m.id) !== String(uid));

      // Exclure les joueurs déjà pris (pending/confirmed) sur un match qui chevauche l'intervalle choisi
      try {
        const startsIso = flashStart instanceof Date ? flashStart.toISOString() : new Date().toISOString();
        const endDate = new Date(flashStart);
        endDate.setMinutes(endDate.getMinutes() + (flashDurationMin || 90));
        const endsIso = endDate.toISOString();
        const blocked = await findConflictingUsers({
          groupId,
          startsAt: startsIso,
          endsAt: endsIso,
          userIds: ms.map(m => m.id),
        });
        if (blocked && blocked.size) {
          ms = ms.filter(m => !blocked.has(String(m.id)));
        }
      } catch (e) {
        console.warn('[FlashMatch] conflict filter failed:', e?.message || e);
      }

      setFlashMembers(ms);
      setFlashSelected([]);
      setFlashQuery("");
      setFlashPickerOpen(true);
    } catch (e) {
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

  // Handler pour valider date/heure/durée et passer à la sélection des joueurs
  const onValidateFlashDate = React.useCallback(async () => {
    setFlashDateModalOpen(false);
    await openFlashMatchPlayersModal();
  }, []);

  // Handler pour créer le match éclair après sélection des joueurs
  const onCreateFlashMatch = React.useCallback(async () => {
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
    
    try {
      await onCreateIntervalMatch(startIso, endIso, allPlayers);
      
      // Envoyer des notifications aux joueurs sélectionnés
      try {
        await supabase.from('notification_jobs').insert(
          flashSelected.map((uid) => ({
            kind: 'match_flash',
            recipients: [uid],
            payload: { title: 'Match Éclair ⚡️', message: "Un match rapide t'a été proposé !" },
            created_at: new Date().toISOString(),
          }))
        );
      } catch (e) {
        console.warn('[FlashMatch] notification insert failed:', e?.message || e);
      }

      setFlashPickerOpen(false);
      setFlashSelected([]);
      
      if (Platform.OS === "web") {
        window.alert("Match Éclair créé 🎾");
      } else {
        Alert.alert("Match Éclair créé 🎾", "Le match a été créé avec succès.");
      }
    } catch (e) {
      if (Platform.OS === "web") {
        window.alert("Impossible de créer le match éclair\n" + (e.message ?? String(e)));
      } else {
        Alert.alert("Erreur", e.message ?? String(e));
      }
    }
  }, [flashSelected, flashStart, flashDurationMin, meId, onCreateIntervalMatch]);

// Accepter en masse des joueurs sélectionnés sur un match donné
async function acceptPlayers(matchId, userIds = []) {
  const ids = Array.from(new Set((userIds || []).map(String)));
  if (!matchId || ids.length === 0) return;

  // Tentative via RPC (respect RLS)
  try {
    await Promise.all(
      ids.map((uid) =>
        supabase.rpc('admin_accept_player', { p_match: matchId, p_user: uid })
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
    async (time_slot_id, selectedUserIds = []) => {
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
        const { error } = await supabase.rpc("create_match_from_slot", {
          p_group: groupId,
          p_time_slot: time_slot_id,
        });
        if (error) throw error;
        // Auto-RSVP: inscrire automatiquement le créateur comme 'accepted'
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

          if (createdMatch?.id && uid) {
            await supabase
              .from('match_rsvps')
              .upsert(
                { match_id: createdMatch.id, user_id: uid, status: 'accepted' },
                { onConflict: 'match_id,user_id' }
              );
            // mettre à jour l'UI localement (optimiste)
            setRsvpsByMatch((prev) => {
              const next = { ...prev };
              const arr = Array.isArray(next[createdMatch.id]) ? [...next[createdMatch.id]] : [];
              const i = arr.findIndex((r) => r.user_id === uid);
              if (i >= 0) arr[i] = { ...arr[i], status: 'accepted' };
              else arr.push({ user_id: uid, status: 'accepted' });
              next[createdMatch.id] = arr;
              return next;
            });
          }

          // Mettre les joueurs sélectionnés en attente (remplaçants)
          try {
            const toMaybe = (selectedUserIds || [])
              .map(String)
              .filter((id) => id && id !== String(uid));
            if (createdMatch?.id && toMaybe.length) {
              await setPlayersMaybe(createdMatch.id, toMaybe, uid);
              // Optimisme UI: marquer en 'maybe' localement
              setRsvpsByMatch((prev) => {
                const next = { ...prev };
                const arr = Array.isArray(next[createdMatch.id]) ? [...next[createdMatch.id]] : [];
                for (const id of toMaybe) {
                  const i = arr.findIndex((r) => String(r.user_id) === String(id));
                  if (i >= 0) arr[i] = { ...arr[i], status: 'maybe' };
                  else arr.push({ user_id: id, status: 'maybe' });
                }
                next[createdMatch.id] = arr;
                return next;
              });
            }
          } catch (e) {
            console.warn('[Matches] set selected users to maybe (slot) failed:', e?.message || e);
          }

          // Sécurité : si le backend a pré-accepté d'autres joueurs, on les remet en attente
          try {
            if (createdMatch?.id && uid) {
              await demoteNonCreatorAcceptedToMaybe(createdMatch.id, uid);
            }
          } catch {}

        } catch (autoErr) {
          // on ne bloque pas la création si l'auto-RSVP échoue
          console.warn('[Matches] auto-RSVP failed:', autoErr?.message || autoErr);
        }
        await fetchData();
        if (Platform.OS === "web") {
          window.alert("Match créé 🎾\nLe créneau a été transformé en match.");
        } else {
          Alert.alert("Match créé 🎾", "Le créneau a été transformé en match.");
        }
      } catch (e) {
        if (Platform.OS === "web") {
          window.alert("Impossible de créer le match\n" + (e.message ?? String(e)));
        } else {
          Alert.alert("Impossible de créer le match", e.message ?? String(e));
        }
      }
    },
    [groupId, fetchData]
  );

  const onCreateIntervalMatch = useCallback(
    async (starts_at_iso, ends_at_iso, selectedUserIds = []) => {
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
          const { data, error } = await supabase.rpc('create_match_from_interval_safe', {
            p_group: groupId,
            p_starts_at: starts_at_iso,
            p_ends_at: ends_at_iso,
          });
          console.log('[onCreateIntervalMatch] RPC result:', data, 'error:', error);
          if (error) rpcErr = error; else newMatchId = data;
        } catch (e) {
          rpcErr = e;
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
            // If a match already exists for that slot, just exit with a friendly message
            const { data: exist } = await supabase
              .from('matches')
              .select('id')
              .eq('group_id', groupId)
              .eq('time_slot_id', slot.id)
              .limit(1);
            if (Array.isArray(exist) && exist.length) {
              if (Platform.OS === 'web') window.alert('Ce créneau possède déjà un match associé.');
              else Alert.alert('Info', 'Ce créneau possède déjà un match associé.');
              await fetchData();
              return;
            }

            // Create the match by reusing the existing slot
            const { data: ins, error: eIns } = await supabase
              .from('matches')
              .insert({ group_id: groupId, time_slot_id: slot.id, status: 'pending' })
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
        
        // Vérifier et mettre à jour le statut si nécessaire pour qu'il soit 'pending'
        try {
          const { data: matchCheck } = await supabase
            .from('matches')
            .select('id, status')
            .eq('id', newMatchId)
            .maybeSingle();
          console.log('[onCreateIntervalMatch] Match status after RPC:', matchCheck?.status);
          
          if (matchCheck && matchCheck.status !== 'pending') {
            console.log('[onCreateIntervalMatch] Updating status from', matchCheck.status, 'to pending');
            await supabase
              .from('matches')
              .update({ status: 'pending' })
              .eq('id', newMatchId);
          }
        } catch (e) {
          console.warn('[onCreateIntervalMatch] Error checking/updating match status:', e);
        }

        // 2) Auto-RSVP: mark current user as 'accepted'
        let uid = meId;
        if (!uid) {
          const { data: u } = await supabase.auth.getUser();
          uid = u?.user?.id ?? null;
        }
        if (uid) {
          await supabase
            .from('match_rsvps')
            .upsert(
              { match_id: newMatchId, user_id: uid, status: 'accepted' },
              { onConflict: 'match_id,user_id' }
            );
          // Optimistic local state update
          setRsvpsByMatch((prev) => {
            const next = { ...prev };
            const arr = Array.isArray(next[newMatchId]) ? [...next[newMatchId]] : [];
            const i = arr.findIndex((r) => String(r.user_id) === String(uid));
            if (i >= 0) arr[i] = { ...arr[i], status: 'accepted' };
            else arr.push({ user_id: uid, status: 'accepted' });
            next[newMatchId] = arr;
            return next;
          });
        }

        // Mettre les joueurs sélectionnés en attente (remplaçants)
        try {
          const toMaybe = (selectedUserIds || [])
            .map(String)
            .filter((id) => id && id !== String(uid));
          if (newMatchId && toMaybe.length) {
            await setPlayersMaybe(newMatchId, toMaybe, uid);
            setRsvpsByMatch((prev) => {
              const next = { ...prev };
              const arr = Array.isArray(next[newMatchId]) ? [...next[newMatchId]] : [];
              for (const id of toMaybe) {
                const i = arr.findIndex((r) => String(r.user_id) === String(id));
                if (i >= 0) arr[i] = { ...arr[i], status: 'maybe' };
                else arr.push({ user_id: id, status: 'maybe' });
              }
              next[newMatchId] = arr;
              return next;
            });
          }
        } catch (e) {
          console.warn('[Matches] set selected users to maybe (interval) failed:', e?.message || e);
        }

        // Sécurité : si le backend a pré-accepté d'autres joueurs, on les remet en attente
        try {
          if (newMatchId && uid) {
            await demoteNonCreatorAcceptedToMaybe(newMatchId, uid);
          }
        } catch {}


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
        await fetchData();
        
        if (Platform.OS === 'web') {
          window.alert('Match créé 🎾\nLe créneau a été transformé en match.');
        } else {
          Alert.alert('Match créé 🎾', 'Le créneau a été transformé en match.');
        }
      } catch (e) {
        if (Platform.OS === 'web') {
          window.alert('Erreur\n' + (e.message ?? String(e)));
        } else {
          Alert.alert('Erreur', e.message ?? String(e));
        }
      }
    },
    [groupId, fetchData]
  );

  const onRsvpAccept = useCallback(async (match_id) => {
    try {
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

      await fetchData();
      if (Platform.OS === 'web') {
        window.alert('Participation confirmée ✅');
      } else {
        Alert.alert('RSVP', 'Participation confirmée ✅');
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

      // Set my RSVP to 'no'
      const { error: eUp } = await supabase
        .from('match_rsvps')
        .upsert(
          { match_id, user_id: uid, status: normalizeRsvp('no') },
          { onConflict: 'match_id,user_id' }
        );
      if (eUp) throw eUp;

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
      // 1) Essayer une RPC si disponible côté DB
      try {
        const { error: eRpc } = await supabase.rpc('cancel_match', { p_match: match_id });
        if (!eRpc) {
          await fetchData();
          if (Platform.OS === 'web') window.alert('Match annulé — le créneau revient dans les propositions.');
          else Alert.alert('Match annulé', 'Le créneau revient dans les propositions.');
          return;
        }
      } catch {}

      // 2) Fallback: supprimer RSVPs puis le match
      const { error: eR } = await supabase.from('match_rsvps').delete().eq('match_id', match_id);
      if (eR) console.warn('[onCancelMatch] delete RSVPs error:', eR.message || eR);

      const { error: eM } = await supabase.from('matches').delete().eq('id', match_id);
      if (eM) throw eM;

      await fetchData();
      if (Platform.OS === 'web') window.alert('Match annulé — le créneau revient dans les propositions.');
      else Alert.alert('Match annulé', 'Le créneau revient dans les propositions.');
    } catch (e) {
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

  const onContactClub = useCallback(async () => {
  // Open player profile (tap) – falls back to showing name if route not available
  const openPlayerProfile = React.useCallback((uid, displayName) => {
    try {
      // Lazy import to avoid requiring router if not used elsewhere
      const { useRouter } = require('expo-router');
      const RouterConsumer = () => null;
    } catch {}
  }, []);
    if (!groupId) return;
    try {
      const { data } = await supabase.from("groups").select("phone").eq("id", groupId).maybeSingle();
      const phone = data?.phone;
      if (phone) {
        await Linking.openURL(`tel:${phone}`);
      } else {
        if (Platform.OS === "web") {
          window.alert("Pas de téléphone\nAucun numéro de club renseigné pour ce groupe.");
        } else {
          Alert.alert("Pas de téléphone", "Aucun numéro de club renseigné pour ce groupe.");
        }
      }
    } catch (e) {
      if (Platform.OS === "web") {
        window.alert("Erreur\n" + (e.message ?? String(e)));
      } else {
        Alert.alert("Erreur", e.message ?? String(e));
      }
    }
  }, [groupId]);

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
  const LevelAvatar = ({ profile = {}, size = 56, rsvpStatus, selected, onPress }) => {
    const uri = profile?.avatar_url || null;
    const fallback = profile?.display_name || profile?.email || 'Joueur';
    const phone = profile?.phone || null;
    const level = profile?.niveau ?? profile?.level ?? null; // supporte `niveau` ou `level`
  
    return (
      <View style={{ position: 'relative', width: size, height: size }}>
        <Avatar
          uri={uri}
          size={size}
          rsvpStatus={rsvpStatus}
          fallback={fallback}
          phone={phone}
          onPress={onPress}
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
        // Limite stricte à 4 joueurs
        if (prev.length >= 4) return prev;
        return [...prev, id];
      });
    };
    // Création uniquement avec exactement 4 joueurs
    const canCreate = type === 'ready' && selectedIds.length === 4;
    return (
      <View style={[cardStyle, { minHeight: 120 }]}>
        <Text style={{ fontWeight: "800", color: "#111827", fontSize: 16, marginBottom: 6 }}>
          {formatRange(item.starts_at, item.ends_at)}
        </Text>
        <Divider m={8} />
        <View style={{ marginBottom: 8 }}>
          <Badge tone='amber' text={`${type === 'ready' ? '🎾' : '🔥'} ${userIds.length} joueurs`} />
        </View>
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          {userIds.map((uid) => {
            const p = profileOf(profilesById, uid);
            return (
              <LevelAvatar
                key={String(uid)}
                profile={p}
                onPress={() => toggleSelect(uid)}
                selected={selectedIds.includes(String(uid))}
                size={56}
              />
            );
          })}
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {type === "ready" ? (
            <Pressable
              disabled={!canCreate}
              accessibilityState={{ disabled: !canCreate }}
              onPress={canCreate ? press("Créer un match", () => onCreateIntervalMatch(item.starts_at, item.ends_at, selectedIds)) : undefined}
              accessibilityRole="button"
              accessibilityLabel="Créer un match pour ce créneau"
              style={({ pressed }) => [
                { backgroundColor: canCreate ? '#15803d' : '#ff751f', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
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
                  {canCreate ? "Créer un match" : "Sélectionne 4 joueurs"}
                </Text>
              </View>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

// --- 1h30 ---
const LongSlotRow = ({ item }) => {
  console.log('[LongSlotRow] Rendered for item:', item.time_slot_id, 'starts_at:', item.starts_at);
  // Utiliser tous les joueurs disponibles pour ce créneau (pas seulement les membres du groupe)
  const userIds = item.ready_user_ids || [];

  // Selection state and helpers
  const [selectedIds, setSelectedIds] = React.useState([]);
  const toggleSelect = (uid) => {
    setSelectedIds((prev) => {
      const id = String(uid);
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      // Limite stricte à 4 joueurs
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  };
  // Création uniquement avec exactement 4 joueurs
  const canCreate = selectedIds.length === 4;

  return (
    <View style={[cardStyle, { minHeight: 120 }]}>
      <Text style={{ fontWeight: "800", color: "#111827", fontSize: 18, marginBottom: 6 }}>
        {formatRange(item.starts_at, item.ends_at)}
      </Text>

      <View style={{ flexDirection: "row", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        {userIds.map((uid) => {
          const p = profilesById[String(uid)] || {};
          console.log('[LongSlotRow] User:', uid, 'profile exists:', !!p?.id);
          return (
            <LevelAvatar
              key={String(uid)}
              profile={p}
              onPress={() => toggleSelect(uid)}
              selected={selectedIds.includes(String(uid))}
              size={56}
            />
          );
        })}
      </View>

      <Divider m={8} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          disabled={!canCreate}
          accessibilityState={{ disabled: !canCreate }}
          onPress={canCreate ? press("Créer un match", () => onCreateIntervalMatch(item.starts_at, item.ends_at, selectedIds)) : undefined}
          accessibilityRole="button"
          accessibilityLabel="Créer un match pour ce créneau 1h30"
          style={({ pressed }) => [
            { backgroundColor: canCreate ? '#15803d' : '#ff751f', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
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
              {canCreate ? "Créer un match" : `Sélectionne ${4 - selectedIds.length} joueur${4 - selectedIds.length > 1 ? 's' : ''} (${selectedIds.length}/${4})`}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
};

// --- 1h ---
const HourSlotRow = ({ item }) => {
  // Utiliser tous les joueurs disponibles pour ce créneau (pas seulement les membres du groupe)
  const userIds = item.ready_user_ids || [];

  // Selection state and helpers
  const [selectedIds, setSelectedIds] = React.useState([]);
  const toggleSelect = (uid) => {
    setSelectedIds((prev) => {
      const id = String(uid);
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      // Limite stricte à 4 joueurs
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  };
  // Création uniquement avec exactement 4 joueurs
  const canCreate = selectedIds.length === 4;

  return (
    <View style={[cardStyle, { minHeight: 120 }]}>
      <Text style={{ fontWeight: "800", color: "#111827", fontSize: 18, marginBottom: 6 }}>
        {formatRange(item.starts_at, item.ends_at)}
      </Text>

      <View style={{ flexDirection: "row", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        {userIds.map((uid) => {
          const p = profilesById[String(uid)] || {};
          console.log('[HourSlotRow] User:', uid, 'profile exists:', !!p?.id);
          return (
            <LevelAvatar
              key={String(uid)}
              profile={p}
              onPress={() => toggleSelect(uid)}
              selected={selectedIds.includes(String(uid))}
              size={56}
            />
          );
        })}
      </View>

      <Divider m={8} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          disabled={!canCreate}
          accessibilityState={{ disabled: !canCreate }}
          onPress={canCreate ? press("Créer un match", () => onCreateIntervalMatch(item.starts_at, item.ends_at, selectedIds)) : undefined}
          accessibilityRole="button"
          accessibilityLabel="Créer un match pour ce créneau 1h"
          style={({ pressed }) => [
            { backgroundColor: canCreate ? '#15803d' : '#ff751f', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
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
              {canCreate ? "Créer un match" : `Sélectionne ${3 - selectedIds.length} joueur${3 - selectedIds.length > 1 ? 's' : ''} (${selectedIds.length}/${3} minimum)`}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
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
      <View style={cardStyle}>
        <Text style={{ fontWeight: '800', color: '#111827', fontSize: 16, marginBottom: 6 }}>{formatRange(slot.starts_at, slot.ends_at)}</Text>
        <MetaLine m={m} />
        <Divider m={8} />
        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontWeight: '800', color: '#111827' }}>
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
                size={56}
              />
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
        </View>
      </View>
    );
  };

  const MatchCardConfirmed = ({ m }) => {
    // time_slots peut être un array ou un objet
    const initialSlot = Array.isArray(m?.time_slots) ? (m.time_slots[0] || null) : (m?.time_slots || null);
    const [loadedSlot, setLoadedSlot] = React.useState(initialSlot);
    const slot = loadedSlot || {};
    
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
    
    const rsvps = rsvpsByMatch[m.id] || [];
    const accepted = rsvps.filter(r => (String(r.status || '').toLowerCase() === 'accepted'));
    const acceptedCount = accepted.length;
    const reserverName =
      profilesById?.[String(m?.court_reserved_by)]?.display_name ||
      profilesById?.[String(m?.court_reserved_by)]?.name ||
      null;

    const [reserved, setReserved] = React.useState(!!m?.is_court_reserved);
    const [savingReserved, setSavingReserved] = React.useState(false);

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

    // Récupérer la date du créneau
    const slotDate = (slot.starts_at && slot.ends_at) ? formatRange(slot.starts_at, slot.ends_at) : '';
    console.log('[MatchCardConfirmed] slotDate:', slotDate, 'slot.starts_at:', slot.starts_at, 'slot.ends_at:', slot.ends_at, 'm:', m.id, 'm.time_slot_id:', m?.time_slot_id);
    const matchDate = m.created_at ? new Date(m.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : null;

    return (
      <View style={[cardStyle, { backgroundColor: reserved ? '#dcfce7' : '#fee2e2', borderColor: '#063383' }]}>
        {slotDate ? (
          <Text style={{ fontWeight: '800', color: '#111827', fontSize: 16, marginBottom: 6 }}>
            {slotDate}
        </Text>
        ) : matchDate ? (
          <Text style={{ fontWeight: '800', color: '#111827', fontSize: 16, marginBottom: 6 }}>
            Match du {matchDate}
          </Text>
        ) : (
          <Text style={{ fontWeight: '800', color: '#6b7280', fontSize: 14, marginBottom: 6, fontStyle: 'italic' }}>
            Date non définie
          </Text>
        )}

        {/* Avatars confirmés */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {accepted.map((r) => {
            const p = profilesById[String(r.user_id)];
            console.log('[MatchCardConfirmed] Accepted user:', r.user_id, 'profile exists:', !!p?.id);
            return (
              <LevelAvatar
                key={`acc-${r.user_id}`}
                profile={p}
                rsvpStatus="accepted"
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
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {/* Bouton contacter un club */}
          <Pressable
            onPress={() => Linking.openURL('tel:0376451967')}
            style={{
              flex: 1,
              backgroundColor: '#480c3d', // violine
              paddingVertical: 2,
              paddingHorizontal: 0,
              borderRadius: 8,
              alignSelf: 'center',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
              }}
            >
              <Image
                source={require('../../../assets/icons/hercule.png')}
                style={{
                  width: 55,
                  height: 55,
                  resizeMode: 'contain',
                  tintColor: 'white',
                  marginRight:0,
                  marginLeft: -12,
                  shadowColor: '#fff',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.8,
                  shadowRadius: 3,          // espace entre icône et texte
                }}
              />
              <Text
                style={{
                  color: '#ea5b0c',
                  fontWeight: '900',
                  fontSize: 14,
                  textAlign: 'center',
                  textAlignVertical: 'center', // Android
                  includeFontPadding: false,
                  marginTop: 4,   // Android: supprime le padding haut/bas de la police
                  lineHeight: 14,
                }}
              >
                APPELER{'\n'}HERCULE
              </Text>
            </View>
          </Pressable>

          {/* Bouton réserver / réservé */}
          <Pressable
            onPress={() => toggleCourtReservation(m.id, !!m.is_court_reserved)}
            style={{
              flex: 1,
              backgroundColor: m?.is_court_reserved ? '#10b981' : '#ef4444',
              padding: 10,
              borderRadius: 8,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {m?.is_court_reserved && m.court_reserved_by && profilesById?.[String(m.court_reserved_by)]?.avatar_url ? (
              <Image
                source={{ uri: profilesById[String(m.court_reserved_by)].avatar_url }}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 20,
                  marginRight: 16,
                  borderWidth: 0,
                  borderColor: '#fff',
                  resizeMode: 'cover',
                }}
              />
            ) : (
              <Image
                source={require('../../../assets/icons/calendrier.png')}
                style={{
                  width: 36,
                  height: 36,
                  marginRight: 16,
                  shadowColor: '#fff',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.8,
                  shadowRadius: 3,
                  resizeMode: 'contain',
                  tintColor: 'white',
                }}
              />
            )}

            <Text
              style={{
                color: '#ffffff',
                fontWeight: '900',
                fontSize: 12,
                textAlign: 'center',
              }}
            >
              {m?.is_court_reserved ? 'PISTE\nRÉSERVÉE' : 'PISTE NON\nRÉSERVÉE'}
            </Text>
          </Pressable>
        </View>
      </View>
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
    const pendingBg =
      acceptedCount >= 4 ? '#dcfce7' :        // 4 confirmés → vert clair
      acceptedCount === 3 ? '#fef9c3' :       // 3 → jaune clair
      acceptedCount === 2 ? '#ffedd5' :       // 2 → orange clair
      acceptedCount === 1 ? '#fee2e2' :       // 1 → rouge clair
      '#ffffff';                              // 0 → blanc

    // Me + status
    const mine = rsvps.find((r) => String(r.user_id) === String(meId));
    const isAccepted = ((mine?.status || '').toString().trim().toLowerCase() === 'accepted');

    // Creator heuristic: first accepted, else earliest RSVP row
    const creatorUserId = (() => {
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
      })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [m?.id, m?.time_slots?.starts_at, m?.time_slots?.ends_at, groupId, rsvpsByMatch]);
    // --- End: inserted availIds/extraProfiles state and effect

    return (
      <View style={[cardStyle, { backgroundColor: pendingBg, borderColor: '#063383' }]}>
        {/* Ligne 1 — Date + heure + icône confirmations */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 4,
          }}
        >
          <Text style={{ fontWeight: '800', color: '#111827', fontSize: 16 }}>
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
                size={56}
              />
            );
          })}
        </View>
        ) : (
          <Text style={{ color: '#9ca3af', marginBottom: 12 }}>Aucun joueur confirmé pour le moment</Text>
        )}

        {/* Ligne 4 — En attente / Remplaçants : une SEULE ligne d'avatars (orange), non cliquables */}
        <View style={{ marginTop: 2, marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontWeight: '800', color: '#111827' }}>En attente / Remplaçants</Text>
          </View>

          {(() => {
            // Build the pending list. If we computed availIds, use them as MAYBE candidates (one line),
            // then always append the declined users (red border) so they are visible too.
            const maybeFromAvail = (Array.isArray(availIds) && availIds.length)
              ? availIds.map((id) => ({ user_id: String(id), status: 'maybe' }))
              : maybes.map((r) => ({ user_id: String(r.user_id), status: 'maybe' }));

            const declinedList = declined.map((r) => ({ user_id: String(r.user_id), status: 'no' }));
            const combined = [...maybeFromAvail, ...declinedList];

            if (!combined.length) {
              return <Text style={{ color: '#6b7280' }}>Aucun joueur en attente.</Text>;
            }

            return (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 4, }}>
                {combined.map((r) => {
                  const uid = String(r.user_id);
                  const p = profilesById[uid] || {};
                  console.log('[MatchCardPending] Pending user:', uid, 'profile exists:', !!p?.id, 'name:', p?.display_name || p?.name);
                  return (
                    <LevelAvatar
                      key={`pend-${uid}`}
                      profile={p}
                      rsvpStatus={r.status}
                      size={48}
                    />
                  );
                })}
              </ScrollView>
            );
          })()}
        </View>

        {/* Wrap Ligne 4 and Ligne 5 in a single Fragment */}
        <>
        {/* Ligne 5 — Boutons d'action */}
        {!isAccepted ? (
          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: 12,
            }}
          >
            <Pressable
              onPress={press('Confirmer ma participation', () => onRsvpAccept(m.id))}
              accessibilityRole="button"
              accessibilityLabel="Confirmer ma participation à ce match"
              style={({ pressed }) => [
                {
                  backgroundColor: '#1a4b97',
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 8,
                },
                Platform.OS === 'web' ? { cursor: 'pointer' } : null,
                pressed ? { opacity: 0.8 } : null,
              ]}
            >
              <Text style={{ color: 'white', fontWeight: '800' }}>
                Confirmer ma participation
              </Text>
            </Pressable>

            <Pressable
              onPress={press('Refuser', () => onRsvpDecline(m.id))}
              accessibilityRole="button"
              accessibilityLabel="Refuser ce match"
              style={({ pressed }) => [
                {
                  backgroundColor: '#b91c1c',
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 8,
                },
                Platform.OS === 'web' ? { cursor: 'pointer' } : null,
                pressed ? { opacity: 0.85 } : null,
              ]}
            >
              <Text style={{ color: 'white', fontWeight: '800' }}>Refuser</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 8, marginBottom: 12 }}>
            {/* Ligne actions: vertical column of full-width buttons */}
            <View style={{ gap: 8 }}>
              {/* Annuler ma participation (rouge clair) */}
              <Pressable
                onPress={press('Annuler ma participation', () => onRsvpCancel(m.id))}
                accessibilityRole="button"
                accessibilityLabel="Annuler ma participation"
                style={({ pressed }) => [
                  {
                    flex: 1,
                    alignSelf: 'stretch',
                    backgroundColor: '#fecaca',
                    borderColor: '#ef4444',
                    borderWidth: 1,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 8,
                  },
                  Platform.OS === 'web' ? { cursor: 'pointer' } : null,
                  pressed ? { opacity: 0.9 } : null,
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Ionicons name="exit-outline" size={22} color="#7f1d1d" />
                  <Text style={{ color: '#7f1d1d', fontWeight: '800' }}>
                    Annuler ma participation
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
                      backgroundColor: '#b91c1c',
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderRadius: 8,
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
        )}
        </>
      </View>
    );
  };

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
    <View style={{ flex: 1, padding: 16, backgroundColor: '#001831' }}>
      {/* Week navigator */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          marginBottom: 5,  // réduit l'espace sous la ligne
          marginTop: -10,    // réduit l'espace au-dessus (entre le header et cette ligne)
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

        <Text style={{ fontWeight: '900', fontSize: 16, color: '#ffffff' }}>
          {formatWeekRangeLabel(currentWs, currentWe)}
        </Text>

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

      {/* Sélecteur de groupe (sous la navigation) */}
      <Pressable
        onPress={() => setGroupSelectorOpen(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 4,
          marginBottom: 6,
          paddingVertical: 4,
          paddingHorizontal: 8,
          borderRadius: 8,
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
        }}
      >
        <Ionicons name="people" size={18} color="#e0ff00" style={{ marginRight: 6 }} />
        <Text style={{ fontWeight: '800', color: '#e0ff00', fontSize: 13 }}>
          {activeGroup?.name || 'Sélectionner un groupe'}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#e0ff00" style={{ marginLeft: 4 }} />
      </Pressable>
      
{/* Sélecteur en 3 boutons (zone fond bleu) + sous-ligne 1h30/1h quand "proposés" */}
<View style={{ backgroundColor: '#001831', borderRadius: 12, padding: 10, marginBottom: 0 }}>
  <View style={{ flexDirection: 'row', gap: 8 }}>
{/* Matchs possibles */}
  <Pressable
    onPress={() => {
      console.log('[Matches] Button pressed: proposes');
      console.log('[Matches] longReady:', longReady?.length, 'hourReady:', hourReady?.length);
      console.log('[Matches] longReadyWeek:', longReadyWeek?.length, 'hourReadyWeek:', hourReadyWeek?.length);
      setTab('proposes');
    }}
    accessibilityRole="button"
    accessibilityLabel="Voir les matchs possibles"
    style={({ pressed }) => [
      {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: tab === 'proposes' ? '#FF751F' : '#ffffff',
        borderWidth: (tab === 'proposes' || pressed) ? 2 : 0,
        borderColor: (tab === 'proposes' || pressed) ? '#ffffff' : 'transparent',
      },
      Platform.OS === 'web' ? { cursor: 'pointer' } : null,
      pressed ? { opacity: 0.92 } : null,
    ]}
  >
    {({ pressed }) => (
      <>
        <Text style={{ fontSize: 22 }}>{'🤝'}</Text>
        <View style={{ marginTop: 4, alignItems: 'center' }}>
          <Text
            style={{
              fontWeight: '900',
              color: tab === 'proposes' ? '#ffffff' : '#001831',
              textAlign: 'center',
            }}
          >
            {`${proposedTabCount} ${matchWord(proposedTabCount)} ${possibleWord(proposedTabCount)}`}
          </Text>
        </View>
      </>
    )}
  </Pressable>

    {/* Matchs à confirmer */}
    <Pressable
      onPress={() => setTab('rsvp')}
      accessibilityRole="button"
      accessibilityLabel="Voir les matchs à confirmer"
      style={({ pressed }) => [
        {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 10,
          borderRadius: 12,
          backgroundColor: tab === 'rsvp' ? '#FF751F' : '#ffffff',          
          borderWidth: (tab === 'rsvp' || pressed) ? 2 : 0,
          borderColor: (tab === 'rsvp' || pressed) ? '#ffffff' : 'transparent',
        },
        Platform.OS === 'web' ? { cursor: 'pointer' } : null,
      ]}
    >
      <Text style={{ fontSize: 22 }}>{'⏳'}</Text>
      <View style={{ marginTop: 4, alignItems: 'center' }}>
        <Text style={{ fontWeight: '900', color: tab === 'rsvp' ? '#ffffff' : '#001831', textAlign: 'center' }}>
          {`${rsvpTabCount} ${matchWord(rsvpTabCount)} à confirmer`}
        </Text>
      </View>
    </Pressable>

    {/* Matchs validés */}
    <Pressable
      onPress={() => setTab('valides')}
      accessibilityRole="button"
      accessibilityLabel="Voir les matchs validés"
      style={({ pressed }) => [
        {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 10,
          borderRadius: 12,
          backgroundColor: tab === 'valides' ? '#FF751F' : '#ffffff',
          borderWidth: (tab === 'valides' || pressed) ? 2 : 0,
          borderColor: (tab === 'valides' || pressed) ? '#ffffff' : 'transparent',
        },
        Platform.OS === 'web' ? { cursor: 'pointer' } : null,
        pressed ? { opacity: 0.92 } : null,
      ]}
    >
      <Text style={{ fontSize: 22 }}>{'🎾'}</Text>
      <View style={{ marginTop: 4, alignItems: 'center' }}>
        <Text style={{ fontWeight: '900', color: tab === 'valides' ? '#ffffff' : '#001831', textAlign: 'center' }}>
          {`${confirmedTabCount} ${matchWord(confirmedTabCount)}`}
        </Text>
        <Text style={{ fontWeight: '900', color: tab === 'valides' ? '#ffffff' : '#001831', textAlign: 'center' }}>
          {valideWord(confirmedTabCount)}
        </Text>
      </View>
    </Pressable>
  </View>
  </View>

  {tab === 'proposes' && (
  <>
    {console.log('[Matches] Rendering proposes tab, longReadyWeek:', longReadyWeek?.length, 'hourReadyWeek:', hourReadyWeek?.length)}
    {/* Sélecteur 1h / 1h30 */}
    <View style={{ marginBottom: 12, marginTop: -10, backgroundColor: '#001831', borderRadius: 12, padding: 10 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
      <Pressable
        onPress={() => setMode('long')}
          style={{
            flex: 1,
            backgroundColor: mode === 'long' ? '#FF751F' : '#aaaaaa',
            paddingVertical: 12,
            paddingHorizontal: 12,
            borderRadius: 8,
            alignItems: 'center',
            borderWidth: mode === 'long' ? 2 : 0,
            borderColor: mode === 'long' ? '#ffffff' : 'transparent',
          }}
        >
          <Text style={{ color: mode === 'long' ? '#ffffff' : '#001831', fontWeight: '800' }}>
            {longReadyWeek?.length || 0} Créneaux 1h30
          </Text>
      </Pressable>
      <Pressable
        onPress={() => setMode('hour')}
          style={{
            flex: 1,
            backgroundColor: mode === 'hour' ? '#FF751F' : '#aaaaaa',
            paddingVertical: 12,
            paddingHorizontal: 12,
            borderRadius: 8,
            alignItems: 'center',
            borderWidth: mode === 'hour' ? 2 : 0,
            borderColor: mode === 'hour' ? '#ffffff' : 'transparent',
          }}
        >
          <Text style={{ color: mode === 'hour' ? '#ffffff' : '#001831', fontWeight: '800' }}>
            {hourReadyWeek?.length || 0} Créneaux 1h
          </Text>
      </Pressable>
    </View>
    </View>

            {mode === 'long' ? (
              <>
                {longSectionsWeek.length === 0 ? (
                  <Text style={{ color: '#6b7280', marginBottom: 6 }}>Aucun créneau 1h30 prêt.</Text>
                ) : (
                  <SectionList
                    sections={longSectionsWeek}
                    keyExtractor={(item) => item.key}
                    renderSectionHeader={({ section }) => (
                      <View style={{ paddingHorizontal: 0, paddingVertical: 0, height: 0 }}>
                        <Text style={{ fontWeight: '900', color: '#111827', display: 'none' }}>{section.title}</Text>
                      </View>
                    )}
                    ItemSeparatorComponent={() => null}
                    SectionSeparatorComponent={() => <View style={{ height: 0 }} />}
                    renderItem={({ item }) => <LongSlotRow item={item} />}
                    contentContainerStyle={{ paddingBottom: bottomPad }}
                    scrollIndicatorInsets={{ bottom: bottomPad / 2 }}
                    ListFooterComponent={() => <View style={{ height: bottomPad }} />}
                    extraData={{ profilesById }}
                  />
                )}
              </>
            ) : (
              <>
                {hourReadyWeek.length === 0 ? (
                  <Text style={{ color: '#6b7280', marginBottom: 6 }}>Aucun créneau 1h prêt.</Text>
                ) : (
                  <FlatList
                    data={hourReadyWeek}
                    keyExtractor={(x) => x.time_slot_id + '-hour'}
                    renderItem={({ item }) => <HourSlotRow item={item} />}
                    contentContainerStyle={{
                      padding: 16,
              paddingBottom: Math.max(120, insets.bottom + 100),
                    }}
                    scrollIndicatorInsets={{ bottom: insets.bottom + 60 }}
                  />
                )}
              </>
            )}
          </>
        )}

      {tab === 'rsvp' && (
        <>
          {/* Sélecteur 1h / 1h30 pour RSVP */}
          <View style={{ marginBottom: 12, marginTop: -10, backgroundColor: '#001831', borderRadius: 12, padding: 10 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => setRsvpMode('long')}
                style={{
                  flex: 1,
                  backgroundColor: rsvpMode === 'long' ? '#FF751F' : '#aaaaaa',
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  alignItems: 'center',
                  borderWidth: rsvpMode === 'long' ? 2 : 0,
                  borderColor: rsvpMode === 'long' ? '#ffffff' : 'transparent',
                }}
              >
                <Text style={{ color: rsvpMode === 'long' ? '#ffffff' : '#001831', fontWeight: '800' }}>
                  {pendingLongWeek?.length || 0} Matchs 1h30
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setRsvpMode('hour')}
                style={{
                  flex: 1,
                  backgroundColor: rsvpMode === 'hour' ? '#FF751F' : '#aaaaaa',
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  alignItems: 'center',
                  borderWidth: rsvpMode === 'hour' ? 2 : 0,
                  borderColor: rsvpMode === 'hour' ? '#ffffff' : 'transparent',
                }}
              >
                <Text style={{ color: rsvpMode === 'hour' ? '#ffffff' : '#001831', fontWeight: '800' }}>
                  {pendingHourWeek?.length || 0} Matchs 1h
                </Text>
              </Pressable>
            </View>
          </View>

          {rsvpMode === 'hour' ? (
            (pendingHourWeek?.length || 0) === 0 ? (
              <Text style={{ color: '#6b7280' }}>Aucun match 1h en attente.</Text>
            ) : (
                <FlatList
                  data={pendingHourWeek.filter(m =>
                    isInWeekRange(m?.time_slots?.starts_at, m?.time_slots?.ends_at, currentWs, currentWe)
                  )}
          keyExtractor={(m) => `${m.id}-pHour-${(rsvpsByMatch[m.id] || []).length}`}
                  renderItem={({ item }) => (
            <MatchCardPending m={item} rsvps={rsvpsByMatch[item.id] || []} />
                  )}
          extraData={rsvpsVersion}
                  contentContainerStyle={{ paddingBottom: bottomPad }}
                  scrollIndicatorInsets={{ bottom: bottomPad / 2 }}
                  ListFooterComponent={() => <View style={{ height: bottomPad }} />}
                />
              )
            ) : (
              (pendingLongWeek?.length || 0) === 0 ? (
                <Text style={{ color: '#6b7280' }}>Aucun match 1h30 en attente.</Text>
              ) : (
                <FlatList
                  data={pendingLongWeek.filter(m =>
                    isInWeekRange(m?.time_slots?.starts_at, m?.time_slots?.ends_at, currentWs, currentWe)
                  )}
          keyExtractor={(m) => `${m.id}-pLong-${(rsvpsByMatch[m.id] || []).length}`}
                  renderItem={({ item }) => (
            <MatchCardPending m={item} rsvps={rsvpsByMatch[item.id] || []} />
                  )}
          extraData={rsvpsVersion}
                  contentContainerStyle={{ paddingBottom: bottomPad }}
                  scrollIndicatorInsets={{ bottom: bottomPad / 2 }}
          ListFooterComponent={() => <View style={{ height: bottomPad }} />}
        />
              )
            )}
        </>
      )}

      {tab === 'valides' && (
        <>
          {/* Sélecteur 1h / 1h30 pour Validés */}
          <View style={{ marginBottom: 12, marginTop: -10, backgroundColor: '#001831', borderRadius: 12, padding: 10 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => setConfirmedMode('long')}
                style={{
                  flex: 1,
                  backgroundColor: confirmedMode === 'long' ? '#FF751F' : '#aaaaaa',
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  alignItems: 'center',
                  borderWidth: confirmedMode === 'long' ? 2 : 0,
                  borderColor: confirmedMode === 'long' ? '#ffffff' : 'transparent',
                }}
              >
                <Text style={{ color: confirmedMode === 'long' ? '#ffffff' : '#001831', fontWeight: '800' }}>
                  {confirmedLong?.length || 0} Matchs 1h30
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setConfirmedMode('hour')}
                style={{
                  flex: 1,
                  backgroundColor: confirmedMode === 'hour' ? '#FF751F' : '#aaaaaa',
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  alignItems: 'center',
                  borderWidth: confirmedMode === 'hour' ? 2 : 0,
                  borderColor: confirmedMode === 'hour' ? '#ffffff' : 'transparent',
                }}
              >
                <Text style={{ color: confirmedMode === 'hour' ? '#ffffff' : '#001831', fontWeight: '800' }}>
                  {confirmedHour?.length || 0} Matchs 1h
                </Text>
              </Pressable>
            </View>
          </View>

          {confirmedMode === 'long' ? (
            confirmedLong.length === 0 ? (
              <Text style={{ color: '#6b7280' }}>Aucun match 1h30 confirmé.</Text>
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
                contentContainerStyle={{ paddingBottom: bottomPad }}
                scrollIndicatorInsets={{ bottom: bottomPad / 2 }}
          ListFooterComponent={() => <View style={{ height: bottomPad }} />}
        />
            )
          ) : (
            confirmedHour.length === 0 ? (
              <Text style={{ color: '#6b7280' }}>Aucun match 1h confirmé.</Text>
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
                contentContainerStyle={{ paddingBottom: bottomPad }}
                scrollIndicatorInsets={{ bottom: bottomPad / 2 }}
                ListFooterComponent={() => <View style={{ height: bottomPad }} />}
              />
            )
          )}
                </>
      )}

      {/* Icône flottante pour créer un match éclair */}
      <Pressable
        onPress={() => openFlashMatchDateModal()}
        style={{
          position: 'absolute',
          bottom: (tabBarHeight || 0) + 20,
          right: 20,
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: '#e0ff00',
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
        <Ionicons name="flash" size={32} color="#000000" />
      </Pressable>

      {/* Modale de choix date/heure/durée */}
      <Modal
        visible={flashDateModalOpen && !flashDatePickerModalOpen && !flashTimePickerModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setFlashDateModalOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: 24, width: '90%', maxWidth: 400 }}>
            <Pressable
              onPress={() => setFlashDateModalOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              style={{ position: 'absolute', top: 10, right: 10, padding: 6 }}
            >
              <Ionicons name="close" size={22} color="#111827" />
            </Pressable>
            <Text style={{ fontSize: 24, fontWeight: '900', color: '#111827', marginBottom: 20 }}>
              Créer un match éclair ⚡️
            </Text>

            {/* Sélection de la date */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 8 }}>
                Date
              </Text>
              <Pressable
                onPress={() => {
                  console.log('[FlashMatch] Opening date picker modal');
                  setTempDate(new Date(flashStart));
                  setFlashDatePickerModalOpen(true);
                  console.log('[FlashMatch] flashDatePickerModalOpen set to:', true);
                }}
                style={{
                  backgroundColor: '#f3f4f6',
                  borderRadius: 8,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: '#d1d5db',
                }}
              >
                <Text style={{ fontSize: 16, color: '#111827' }}>
                  {flashStart.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
              </Pressable>
              {flashInlineDateOpen && (
                <View style={{ 
                  marginTop: 10, 
                  backgroundColor: '#f9fafb', 
                  borderRadius: 8, 
                  padding: 10,
                  alignItems: 'center',
                  minHeight: Platform.OS === 'web' ? 0 : 180,
                }}>
                  {Platform.OS === 'web' ? (
                    <View style={{ width: '100%' }}>
                      {Platform.OS === 'web' && typeof document !== 'undefined' && (
                        <input
                          type="date"
                          value={flashStart.toISOString().split('T')[0]}
                          min={new Date().toISOString().split('T')[0]}
                          onChange={(e) => {
                            if (e.target.value) {
                              const newDate = new Date(e.target.value);
                              newDate.setHours(flashStart.getHours());
                              newDate.setMinutes(flashStart.getMinutes());
                              setFlashStart(newDate);
                              setFlashInlineDateOpen(false);
                            }
                          }}
                          style={{
                            width: '100%',
                            padding: 12,
                            borderRadius: 8,
                            border: '1px solid #d1d5db',
                            fontSize: 16,
                          }}
                        />
                      )}
                    </View>
                  ) : Platform.OS === 'ios' ? (
                    <>
                      <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 10 }}>
                        Fais défiler pour sélectionner
                      </Text>
                      <DateTimePicker
                        value={flashStart}
                        mode="date"
                        display="spinner"
                        minimumDate={new Date()}
                        onChange={(event, selectedDate) => {
                          if (selectedDate) {
                            const newDate = new Date(selectedDate);
                            newDate.setHours(flashStart.getHours());
                            newDate.setMinutes(flashStart.getMinutes());
                            setFlashStart(newDate);
                          }
                        }}
                        style={{ 
                          height: 200,
                          width: '100%',
                        }}
                      />
                      <Pressable
                        onPress={() => setFlashInlineDateOpen(false)}
                        style={{
                          marginTop: 10,
                          backgroundColor: COLORS.accent,
                          paddingHorizontal: 24,
                          paddingVertical: 8,
                          borderRadius: 8,
                        }}
                      >
                        <Text style={{ color: '#ffffff', fontWeight: '700' }}>Valider</Text>
                      </Pressable>
                    </>
                  ) : (
                    <DateTimePicker
                      value={flashStart}
                      mode="date"
                      display="default"
                      minimumDate={new Date()}
                      onChange={(event, selectedDate) => {
                        setFlashInlineDateOpen(false);
                        if (event?.type === 'set' && selectedDate) {
                          const newDate = new Date(selectedDate);
                          newDate.setHours(flashStart.getHours());
                          newDate.setMinutes(flashStart.getMinutes());
                          setFlashStart(newDate);
                        }
                      }}
                    />
                  )}
                </View>
              )}
            </View>

            {/* Sélection de l'heure */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 8 }}>
                Heure de début
              </Text>
              <Pressable
                onPress={() => {
                  setTempTime({ 
                    hours: flashStart.getHours(), 
                    minutes: flashStart.getMinutes() 
                  });
                  setFlashTimePickerModalOpen(true);
                }}
                style={{
                  backgroundColor: '#f3f4f6',
                  borderRadius: 8,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: '#d1d5db',
                }}
              >
                <Text style={{ fontSize: 16, color: '#111827' }}>
                  {flashStart.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </Pressable>
              {flashInlineTimeOpen && (
                <View style={{ 
                  marginTop: 10, 
                  backgroundColor: '#f9fafb', 
                  borderRadius: 8, 
                  padding: 10,
                  alignItems: 'center',
                  minHeight: Platform.OS === 'web' ? 0 : 180,
                }}>
                  {Platform.OS === 'web' ? (
                    <View style={{ width: '100%' }}>
                      {Platform.OS === 'web' && typeof document !== 'undefined' && (
                        <input
                          type="time"
                          value={flashStart.toTimeString().slice(0, 5)}
                          onChange={(e) => {
                            if (e.target.value) {
                              const [hours, minutes] = e.target.value.split(':');
                              const newTime = new Date(flashStart);
                              newTime.setHours(parseInt(hours, 10));
                              newTime.setMinutes(parseInt(minutes, 10));
                              setFlashStart(newTime);
                              setFlashInlineTimeOpen(false);
                            }
                          }}
                          style={{
                            width: '100%',
                            padding: 12,
                            borderRadius: 8,
                            border: '1px solid #d1d5db',
                            fontSize: 16,
                          }}
                        />
                      )}
                    </View>
                  ) : Platform.OS === 'ios' ? (
                    <>
                      <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 10 }}>
                        Fais défiler pour sélectionner
                      </Text>
                      <DateTimePicker
                        value={flashStart}
                        mode="time"
                        display="spinner"
                        onChange={(event, selectedTime) => {
                          if (selectedTime) {
                            const newTime = new Date(flashStart);
                            newTime.setHours(selectedTime.getHours());
                            newTime.setMinutes(selectedTime.getMinutes());
                            setFlashStart(newTime);
                          }
                        }}
                        style={{ 
                          height: 200,
                          width: '100%',
                        }}
                      />
                      <Pressable
                        onPress={() => setFlashInlineTimeOpen(false)}
                        style={{
                          marginTop: 10,
                          backgroundColor: COLORS.accent,
                          paddingHorizontal: 24,
                          paddingVertical: 8,
                          borderRadius: 8,
                        }}
                      >
                        <Text style={{ color: '#ffffff', fontWeight: '700' }}>Valider</Text>
                      </Pressable>
                    </>
                  ) : (
                    <DateTimePicker
                      value={flashStart}
                      mode="time"
                      display="default"
                      onChange={(event, selectedTime) => {
                        setFlashInlineTimeOpen(false);
                        if (event?.type === 'set' && selectedTime) {
                          const newTime = new Date(flashStart);
                          newTime.setHours(selectedTime.getHours());
                          newTime.setMinutes(selectedTime.getMinutes());
                          setFlashStart(newTime);
                        }
                      }}
                    />
                  )}
                </View>
              )}
            </View>

            {/* Toggles pour la durée */}
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 8 }}>
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
                    backgroundColor: flashDurationMin === 60 ? COLORS.accent : '#e5e7eb',
                    borderRadius: 8,
                    padding: 16,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 18, fontWeight: '800', color: flashDurationMin === 60 ? '#ffffff' : '#111827' }}>
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
                    backgroundColor: flashDurationMin === 90 ? COLORS.accent : '#e5e7eb',
                    borderRadius: 8,
                    padding: 16,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 18, fontWeight: '800', color: flashDurationMin === 90 ? '#ffffff' : '#111827' }}>
                    1h30
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Heure de fin estimée */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 6 }}>
                Heure de fin estimée
              </Text>
              <Text style={{
                backgroundColor: '#f3f4f6',
                borderRadius: 8,
                padding: 12,
                borderWidth: 1,
                borderColor: '#d1d5db',
                fontSize: 16,
                color: '#111827',
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

            {/* Boutons */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={() => setFlashDateModalOpen(false)}
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
                onPress={onValidateFlashDate}
                style={{
                  flex: 1,
                  backgroundColor: COLORS.accent,
                  borderRadius: 8,
                  padding: 14,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#ffffff' }}>
                  Valider
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modale de sélection de date */}
      <Modal
        visible={flashDatePickerModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setFlashDatePickerModalOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}>
          <View style={{ 
            backgroundColor: '#ffffff', 
            borderTopLeftRadius: 20, 
            borderTopRightRadius: 20, 
            padding: 20,
            maxHeight: '80%',
          }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: '#111827', marginBottom: 20, textAlign: 'center' }}>
              Sélectionner la date
            </Text>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 30 }}>
              {/* Jour */}
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 10 }}>Jour</Text>
                <ScrollView 
                  style={{ height: 200, width: '100%' }}
                  showsVerticalScrollIndicator={false}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                    const isSelected = tempDate.getDate() === day;
                    return (
                      <Pressable
                        key={day}
                        onPress={() => {
                          const newDate = new Date(tempDate);
                          newDate.setDate(day);
                          setTempDate(newDate);
                        }}
                        style={{
                          paddingVertical: 12,
                          paddingHorizontal: 16,
                          backgroundColor: isSelected ? COLORS.accent : 'transparent',
                          borderRadius: 8,
                          marginVertical: 2,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ 
                          fontSize: 18, 
                          fontWeight: isSelected ? '800' : '400',
                          color: isSelected ? '#ffffff' : '#111827',
                        }}>
                          {day}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Mois */}
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 10 }}>Mois</Text>
                <ScrollView 
                  style={{ height: 200, width: '100%' }}
                  showsVerticalScrollIndicator={false}
                >
                  {['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'].map((month, index) => {
                    const isSelected = tempDate.getMonth() === index;
                    return (
                      <Pressable
                        key={index}
                        onPress={() => {
                          const newDate = new Date(tempDate);
                          newDate.setMonth(index);
                          setTempDate(newDate);
                        }}
                        style={{
                          paddingVertical: 12,
                          paddingHorizontal: 8,
                          backgroundColor: isSelected ? COLORS.accent : 'transparent',
                          borderRadius: 8,
                          marginVertical: 2,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ 
                          fontSize: 16, 
                          fontWeight: isSelected ? '800' : '400',
                          color: isSelected ? '#ffffff' : '#111827',
                          textAlign: 'center',
                        }}>
                          {month.substring(0, 3)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Année */}
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 10 }}>Année</Text>
                <ScrollView 
                  style={{ height: 200, width: '100%' }}
                  showsVerticalScrollIndicator={false}
                >
                  {Array.from({ length: 3 }, (_, i) => new Date().getFullYear() + i).map((year) => {
                    const isSelected = tempDate.getFullYear() === year;
                    return (
                      <Pressable
                        key={year}
                        onPress={() => {
                          const newDate = new Date(tempDate);
                          newDate.setFullYear(year);
                          setTempDate(newDate);
                        }}
                        style={{
                          paddingVertical: 12,
                          paddingHorizontal: 16,
                          backgroundColor: isSelected ? COLORS.accent : 'transparent',
                          borderRadius: 8,
                          marginVertical: 2,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ 
                          fontSize: 18, 
                          fontWeight: isSelected ? '800' : '400',
                          color: isSelected ? '#ffffff' : '#111827',
                        }}>
                          {year}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={() => setFlashDatePickerModalOpen(false)}
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
                onPress={() => {
                  const newDate = new Date(tempDate);
                  newDate.setHours(flashStart.getHours());
                  newDate.setMinutes(flashStart.getMinutes());
                  setFlashStart(newDate);
                  setFlashDatePickerModalOpen(false);
                }}
                style={{
                  flex: 1,
                  backgroundColor: COLORS.accent,
                  borderRadius: 8,
                  padding: 14,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#ffffff' }}>
                  Valider
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modale de sélection d'heure */}
      <Modal
        visible={flashTimePickerModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setFlashTimePickerModalOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}>
          <View style={{ 
            backgroundColor: '#ffffff', 
            borderTopLeftRadius: 20, 
            borderTopRightRadius: 20, 
            padding: 20,
            maxHeight: '80%',
          }}>
            <Pressable
              onPress={() => setFlashTimePickerModalOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              style={{ position: 'absolute', top: 10, right: 10, padding: 6 }}
            >
              <Ionicons name="close" size={22} color="#111827" />
            </Pressable>
            <Text style={{ fontSize: 20, fontWeight: '900', color: '#111827', marginBottom: 20, textAlign: 'center' }}>
              Sélectionner l'heure
            </Text>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 30 }}>
              {/* Heures */}
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 10 }}>Heure de début</Text>
                <ScrollView 
                  style={{ height: 200, width: '100%' }}
                  showsVerticalScrollIndicator={false}
                >
                  {Array.from({ length: 24 }, (_, i) => i).map((hour) => {
                    const isSelected = tempTime.hours === hour;
                    return (
                      <Pressable
                        key={hour}
                        onPress={() => setTempTime({ ...tempTime, hours: hour })}
                        style={{
                          paddingVertical: 12,
                          paddingHorizontal: 16,
                          backgroundColor: isSelected ? COLORS.accent : 'transparent',
                          borderRadius: 8,
                          marginVertical: 2,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ 
                          fontSize: 18, 
                          fontWeight: isSelected ? '800' : '400',
                          color: isSelected ? '#ffffff' : '#111827',
                        }}>
                          {String(hour).padStart(2, '0')}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Minutes */}
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 10 }}>Minute</Text>
                <ScrollView 
                  style={{ height: 200, width: '100%' }}
                  showsVerticalScrollIndicator={false}
                >
                  {[0, 30].map((minute) => {
                    const isSelected = tempTime.minutes === minute;
                    return (
                      <Pressable
                        key={minute}
                        onPress={() => setTempTime({ ...tempTime, minutes: minute })}
                        style={{
                          paddingVertical: 12,
                          paddingHorizontal: 16,
                          backgroundColor: isSelected ? COLORS.accent : 'transparent',
                          borderRadius: 8,
                          marginVertical: 2,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ 
                          fontSize: 18, 
                          fontWeight: isSelected ? '800' : '400',
                          color: isSelected ? '#ffffff' : '#111827',
                        }}>
                          {String(minute).padStart(2, '0')}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={() => setFlashTimePickerModalOpen(false)}
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
                onPress={() => {
                  const newTime = new Date(flashStart);
                  newTime.setHours(tempTime.hours);
                  newTime.setMinutes(tempTime.minutes);
                  setFlashStart(newTime);
                  setFlashTimePickerModalOpen(false);
                }}
                style={{
                  flex: 1,
                  backgroundColor: COLORS.accent,
                  borderRadius: 8,
                  padding: 14,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#ffffff' }}>
                  Valider
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modale de sélection des joueurs */}
      <Modal
        visible={flashPickerOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setFlashPickerOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: 24, width: '90%', maxWidth: 400, maxHeight: '80%' }}>
            <Pressable
              onPress={() => setFlashPickerOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              style={{ position: 'absolute', top: 10, right: 10, padding: 6 }}
            >
              <Ionicons name="close" size={22} color="#111827" />
            </Pressable>
            <Text style={{ fontSize: 24, fontWeight: '900', color: '#111827', marginBottom: 20 }}>
              Sélectionner 3 joueurs
            </Text>

            {flashLoading ? (
              <ActivityIndicator size="large" color={COLORS.accent} />
            ) : (
              <>
                {/* Barre de recherche */}
                <TextInput
                  value={flashQuery}
                  onChangeText={setFlashQuery}
                  placeholder="Rechercher un joueur..."
                  style={{
                    backgroundColor: '#f3f4f6',
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 16,
                    borderWidth: 1,
                    borderColor: '#d1d5db',
                  }}
                />

                {/* Avatars sélectionnés (bandeau) */}
                {flashSelected.length > 0 && (
                  <View style={{ marginBottom: 16 }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 4 }}>
                      {flashMembers
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
                                    const name = (member.name || 'Joueur').trim();
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
                                    borderWidth: 2,
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
                {flashMembers.filter(m => (!flashQuery || (m.name || '').toLowerCase().includes(flashQuery.toLowerCase()))).length === 0 ? (
                  <Text style={{ color: '#6b7280', textAlign: 'center', marginBottom: 16 }}>
                    Pas de joueurs disponibles sur ce créneau
                  </Text>
                ) : (
                  <ScrollView style={{ maxHeight: 300, marginBottom: 16 }}>
                    {flashMembers
                      .filter(m => (
                        !flashQuery || (m.name || '').toLowerCase().includes(flashQuery.toLowerCase())
                      ))
                      .map((member) => {
                      const isSelected = flashSelected.includes(String(member.id));
                      return (
                        <Pressable
                          key={String(member.id)}
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
                            backgroundColor: isSelected ? '#e0ff00' : '#f9fafb',
                            borderRadius: 8,
                            marginBottom: 8,
                            borderWidth: isSelected ? 2 : 1,
                            borderColor: isSelected ? '#e0ff00' : '#e5e7eb',
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
                                  const name = (member.name || 'Joueur').trim();
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
                                  borderWidth: 2,
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
                          <Text style={{ fontSize: 14, fontWeight: isSelected ? '800' : '400', color: isSelected ? '#001831' : '#111827', flex: 1 }}>
                            {member.name || 'Joueur inconnu'}
                          </Text>
                          {isSelected && (
                            <Image source={racketIcon} style={{ width: 22, height: 22, tintColor: '#001831' }} />
                          )}
                        </Pressable>
                      );
                      })}
                  </ScrollView>
                )}

                {/* Compteur de sélection */}
                <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 16, textAlign: 'center' }}>
                  {flashSelected.length}/3 joueurs sélectionnés
                </Text>

                {/* Boutons */}
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Pressable
                    onPress={() => {
                      // Retour à l'écran de choix date/heure sans perdre la sélection
                      setFlashPickerOpen(false);
                      setFlashDateModalOpen(true);
                    }}
                    style={{
                      flex: 0.4,
                      backgroundColor: '#e5e7eb',
                      borderRadius: 8,
                      padding: 14,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>
                      Retour
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={onCreateFlashMatch}
                    disabled={flashSelected.length !== 3}
                    style={{
                      flex: 0.6,
                      backgroundColor: flashSelected.length === 3 ? COLORS.accent : '#d1d5db',
                      borderRadius: 8,
                      padding: 14,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#ffffff' }}>
                      Créer un match
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* DateTimePickers - rendus au niveau racine après fermeture de la modale principale */}
      {Platform.OS !== 'web' && !flashDateModalOpen && flashDatePickerOpen && (
        <DateTimePicker
          value={flashStart}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={new Date()}
          onChange={(event, selectedDate) => {
            console.log('[FlashMatch] Date picker onChange', event.type, selectedDate);
            setFlashDatePickerOpen(false);
            if (event.type === 'set' && selectedDate) {
              const newDate = new Date(selectedDate);
              newDate.setHours(flashStart.getHours());
              newDate.setMinutes(flashStart.getMinutes());
              setFlashStart(newDate);
            }
            // Rouvrir la modale principale après sélection
            setTimeout(() => {
              setFlashDateModalOpen(true);
            }, 100);
          }}
        />
      )}

      {Platform.OS !== 'web' && !flashDateModalOpen && flashTimePickerOpen && (
        <DateTimePicker
          value={flashStart}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, selectedTime) => {
            console.log('[FlashMatch] Time picker onChange', event.type, selectedTime);
            setFlashTimePickerOpen(false);
            if (event.type === 'set' && selectedTime) {
              const newTime = new Date(flashStart);
              newTime.setHours(selectedTime.getHours());
              newTime.setMinutes(selectedTime.getMinutes());
              setFlashStart(newTime);
            }
            // Rouvrir la modale principale après sélection
            setTimeout(() => {
              setFlashDateModalOpen(true);
            }, 100);
          }}
        />
      )}

      {/* Modal iOS pour les pickers (spinner) */}
      {Platform.OS === 'ios' && !flashDateModalOpen && (flashDatePickerOpen || flashTimePickerOpen) && (
        <Modal
          visible={true}
          transparent={true}
          animationType="slide"
          onRequestClose={() => {
            setFlashDatePickerOpen(false);
            setFlashTimePickerOpen(false);
            setFlashDateModalOpen(true);
          }}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Pressable
                  onPress={() => {
                    setFlashDatePickerOpen(false);
                    setFlashTimePickerOpen(false);
                    setFlashDateModalOpen(true);
                  }}
                >
                  <Text style={{ fontSize: 16, color: '#666' }}>Annuler</Text>
                </Pressable>
                <Text style={{ fontSize: 18, fontWeight: '700' }}>
                  {flashDatePickerOpen ? 'Sélectionner une date' : 'Sélectionner une heure'}
                </Text>
                <Pressable
                  onPress={() => {
                    setFlashDatePickerOpen(false);
                    setFlashTimePickerOpen(false);
                    setFlashDateModalOpen(true);
                  }}
                >
                  <Text style={{ fontSize: 16, color: COLORS.accent, fontWeight: '700' }}>Valider</Text>
                </Pressable>
              </View>
              {flashDatePickerOpen && (
                <DateTimePicker
                  value={flashStart}
                  mode="date"
                  display="spinner"
                  minimumDate={new Date()}
                  onChange={(event, selectedDate) => {
                    if (selectedDate) {
                      const newDate = new Date(selectedDate);
                      newDate.setHours(flashStart.getHours());
                      newDate.setMinutes(flashStart.getMinutes());
                      setFlashStart(newDate);
                    }
                  }}
                  style={{ height: 200 }}
                />
              )}
              {flashTimePickerOpen && (
                <DateTimePicker
                  value={flashStart}
                  mode="time"
                  display="spinner"
                  onChange={(event, selectedTime) => {
                    if (selectedTime) {
                      const newTime = new Date(flashStart);
                      newTime.setHours(selectedTime.getHours());
                      newTime.setMinutes(selectedTime.getMinutes());
                      setFlashStart(newTime);
                    }
                  }}
                  style={{ height: 200 }}
                />
              )}
            </View>
          </View>
        </Modal>
      )}

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
    </View>
  );
}