import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  LayoutAnimation,
  Linking,
  Modal,
  Platform,
  Pressable,
  Text,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haversineKm } from '../../../lib/geography';
import { MATCH_SHEET_THEME as T } from '../../../lib/matchSheetTheme';
import { supabase } from '../../../lib/supabase';
import {
  getEligibleUsersForMatchNotification,
  enqueueMatchOpportunityNotifications,
} from '../../../lib/matchOpportunityNotifications';

import { rpcCreateGroupMatchSearch } from '../api/groupActivityApi';
import { ProposeMatchCombinedSheet, type ClubRowLite } from './proposeMatchFlowSheets';
import {
  WIZARD_STEP_COPY,
  WizardStepClub,
  WizardStepDateTime,
  WizardStepPlacesPlayers,
  WizardStepSummary,
} from './findGameWizardSteps';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type ClubRow = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  zone_id: string | null;
  phone: string | null;
};

type ClubSection = {
  key: string;
  title: string;
  clubs: ClubRow[];
  /** Affiché si la liste est vide (ex. seul le préféré compte comme accepté) */
  emptyHint?: string;
};

type MemberRow = { id: string; label: string };

export type PrefillPossibleClubRow = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  zone_id?: string | null;
  phone?: string | null;
};

type Props = {
  visible: boolean;
  groupId: string;
  onClose: () => void;
  onPublished: () => void | Promise<void>;
  prefill?: {
    prefillDate?: string | null;
    prefillStartAt?: string | null;
    prefillEndAt?: string | null;
    prefillGroupId?: string | null;
    prefillClubId?: string | null;
    prefillClubName?: string | null;
    prefillOpenSpots?: number | null;
    prefillPlayerIds?: string[] | null;
    prefillGoToClub?: boolean | null;
    /**
     * Liste alignée sur les « clubs possibles » de l’écran Matchs (carte Presque prêts).
     * Si défini (y compris `[]`), le wizard n’affiche que ces clubs — pas de second chargement global.
     */
    prefillPossibleClubs?: PrefillPossibleClubRow[] | null;
  } | null;
};

const PLACES_OPTIONS = [1, 2, 3] as const;

function formatDateFr(d: Date): string {
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function FindGameWizardModal({
  visible,
  groupId,
  onClose,
  onPublished,
  prefill,
}: Props) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(1);
  const [meId, setMeId] = useState<string | null>(null);

  const [dateVal, setDateVal] = useState(() => {
    const t = new Date();
    t.setHours(20, 0, 0, 0);
    return t;
  });
  const [timeVal, setTimeVal] = useState(() => {
    const t = new Date();
    t.setHours(20, 0, 0, 0);
    return t;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [clubs, setClubs] = useState<ClubRow[]>([]);
  const [clubsLoading, setClubsLoading] = useState(false);
  const [clubSearch, setClubSearch] = useState('');
  const [selectedClub, setSelectedClub] = useState<ClubRow | null>(null);
  /** Préféré / refusés / zone joueur — pour sections */
  const [preferredClubIds, setPreferredClubIds] = useState<Set<string>>(new Set());
  const [refusedClubIds, setRefusedClubIds] = useState<Set<string>>(new Set());
  const [myZoneId, setMyZoneId] = useState<string | null>(null);
  /** Position actuelle (GPS) — tri des sections zone + autres */
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [locationReady, setLocationReady] = useState(false);

  const [placesToFill, setPlacesToFill] = useState<(typeof PLACES_OPTIONS)[number]>(2);

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  /** Co-joueurs (hors toi) */
  const [selectedOtherIds, setSelectedOtherIds] = useState<Set<string>>(new Set());

  const [busy, setBusy] = useState(false);

  const maxOthers = useMemo(() => 3 - placesToFill, [placesToFill]);

  /** Préfill depuis carte Presque prêts : même liste que sur la carte, pas le fetch global. */
  const restrictClubsToPossible = useMemo(
    () => prefill?.prefillPossibleClubs != null && Array.isArray(prefill.prefillPossibleClubs),
    [prefill?.prefillPossibleClubs]
  );

  /** Depuis Presque prêts : une seule valeur (places réellement libres), pas le choix 1/2/3. */
  const placesChipOptions = useMemo((): readonly number[] => {
    const raw = prefill?.prefillOpenSpots;
    if (raw != null && Number.isFinite(Number(raw))) {
      const n = Math.max(1, Math.min(3, Number(raw)));
      return [n];
    }
    return [...PLACES_OPTIONS];
  }, [prefill?.prefillOpenSpots]);

  /** « Proposer la partie » (Presque prêts) : résumé direct si le flux le permet, sans étapes places / joueurs. */
  const isProposeMatchShortFlow = useMemo(
    () =>
      Boolean(
        prefill?.prefillGoToClub &&
        prefill?.prefillPossibleClubs != null &&
        Array.isArray(prefill.prefillPossibleClubs)
      ),
    [prefill?.prefillGoToClub, prefill?.prefillPossibleClubs]
  );

  const stepProgressLabel = useMemo(() => {
    if (isProposeMatchShortFlow) return '1/1';
    return `${step}/4`;
  }, [isProposeMatchShortFlow, step]);

  /** Flux « Proposer la partie » : 1er club = préféré si possible, sinon premier. */
  const proposeClubLayout = useMemo(() => {
    if (!isProposeMatchShortFlow || clubs.length === 0) {
      return { recommended: null as ClubRow | null, others: [] as ClubRow[] };
    }
    const preferredFirst = clubs.find((c) => preferredClubIds.has(c.id));
    const recommended = preferredFirst ?? clubs[0];
    const others = clubs.filter((c) => c.id !== recommended.id);
    return { recommended, others };
  }, [isProposeMatchShortFlow, clubs, preferredClubIds]);

  const proposeRecommendedTitle = useMemo(() => {
    if (!proposeClubLayout.recommended) return '';
    if (clubs.length === 1) return 'Club suggéré';
    if (preferredClubIds.has(proposeClubLayout.recommended.id)) return 'Club recommandé';
    return 'Club suggéré';
  }, [proposeClubLayout.recommended, clubs.length, preferredClubIds]);

  const reset = useCallback(() => {
    setStep(1);
    const t = new Date();
    t.setHours(20, 0, 0, 0);
    setDateVal(t);
    setTimeVal(new Date(t));
    setSelectedClub(null);
    setClubSearch('');
    setPreferredClubIds(new Set());
    setAcceptedClubIds(new Set());
    setMyZoneId(null);
    setUserLocation(null);
    setLocationReady(false);
    setPlacesToFill(2);
    setSelectedOtherIds(new Set());
  }, []);

  useEffect(() => {
    if (!visible) return;
    reset();
    if (prefill?.prefillGoToClub) {
      setStep(3);
    }
    if (prefill?.prefillStartAt) {
      const start = new Date(prefill.prefillStartAt);
      if (!Number.isNaN(start.getTime())) {
        setDateVal(start);
        setTimeVal(start);
      }
    } else if (prefill?.prefillDate) {
      const date = new Date(prefill.prefillDate);
      if (!Number.isNaN(date.getTime())) {
        setDateVal(date);
      }
    }
    if (Number.isFinite(prefill?.prefillOpenSpots as number)) {
      const n = Math.max(1, Math.min(3, Number(prefill?.prefillOpenSpots)));
      setPlacesToFill(n as (typeof PLACES_OPTIONS)[number]);
    }
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      setMeId(u?.user?.id ?? null);
    })();
  }, [visible, reset, prefill]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      setUserLocation(null);
      setLocationReady(false);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== 'granted') {
          setLocationReady(true);
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      } catch (e) {
        console.warn('[FindGameWizard] location', e);
      } finally {
        if (!cancelled) setLocationReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || !groupId) return;
    let cancelled = false;
    (async () => {
      setMembersLoading(true);
      try {
        const { data: gms, error: eGM } = await supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', groupId);
        if (eGM) throw eGM;
        const ids = [...new Set((gms ?? []).map((g) => String(g.user_id)))];
        if (!ids.length) {
          if (!cancelled) setMembers([]);
          return;
        }
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, display_name, name')
          .in('id', ids);
        const list: MemberRow[] = (profs ?? []).map((p) => {
          const row = p as { id: string; display_name?: string; name?: string };
          return {
            id: row.id,
            label: row.display_name || row.name || 'Joueur',
          };
        });
        list.sort((a, b) => a.label.localeCompare(b.label, 'fr'));
        if (!cancelled) setMembers(list);
      } catch (e) {
        console.warn('[FindGameWizard] membres', e);
        if (!cancelled) setMembers([]);
      } finally {
        if (!cancelled) setMembersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, groupId]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    const mapRow = (row: {
      id: string;
      name: string;
      lat: number | null;
      lng: number | null;
      zone_id: string | null;
      phone?: string | null;
    }): ClubRow => ({
      id: row.id,
      name: row.name,
      lat: row.lat ?? null,
      lng: row.lng ?? null,
      zone_id: row.zone_id ?? null,
      phone: row.phone ?? null,
    });

    const passed = prefill?.prefillPossibleClubs;
    if (passed != null && Array.isArray(passed)) {
      setClubsLoading(true);
      const mapped = passed.map((r) =>
        mapRow({
          id: String(r.id),
          name: r.name,
          lat: r.lat ?? null,
          lng: r.lng ?? null,
          zone_id: r.zone_id != null ? String(r.zone_id) : null,
          phone: r.phone ?? null,
        })
      );
      if (!cancelled) {
        setClubs(mapped);
        setClubsLoading(false);
      }
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      setClubsLoading(true);
      try {
        const pageSize = 1000;
        let from = 0;
        const all: ClubRow[] = [];
        while (true) {
          const { data: page, error } = await supabase
            .from('clubs')
            .select('id, name, lat, lng, zone_id, phone')
            .not('lat', 'is', null)
            .not('lng', 'is', null)
            .order('name', { ascending: true })
            .range(from, from + pageSize - 1);
          if (error) throw error;
          const batch = (page ?? []).map((row) => {
            const r = row as {
              id: string;
              name: string;
              lat: number | null;
              lng: number | null;
              zone_id: string | null;
              phone?: string | null;
            };
            return mapRow(r);
          });
          all.push(...batch);
          if (batch.length < pageSize) break;
          from += pageSize;
        }
        if (!cancelled) setClubs(all);
      } catch (e) {
        console.warn('[FindGameWizard] clubs', e);
        if (!cancelled) setClubs([]);
      } finally {
        if (!cancelled) setClubsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, prefill?.prefillPossibleClubs]);

  useEffect(() => {
    if (!visible || !meId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('zone_id')
          .eq('id', meId)
          .maybeSingle();
        const zid = prof?.zone_id ? String(prof.zone_id) : null;
        if (cancelled) return;
        setMyZoneId(zid);

        const { data: ucs } = await supabase
          .from('user_clubs')
          .select('club_id, is_preferred, is_refused')
          .eq('user_id', meId);
        const pref = new Set<string>();
        const refu = new Set<string>();
        for (const r of ucs ?? []) {
          const row = r as { club_id: string; is_preferred?: boolean; is_refused?: boolean };
          const cid = String(row.club_id);
          if (row.is_refused === true) refu.add(cid);
          if (row.is_preferred && row.is_refused !== true) pref.add(cid);
        }
        if (cancelled) return;
        setPreferredClubIds(pref);
        setRefusedClubIds(refu);
      } catch (e) {
        console.warn('[FindGameWizard] profil / clubs user', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, meId]);

  /** Clubs préférés / zone (hors refus) sans lat-lng : merge depuis la table clubs. */
  useEffect(() => {
    if (!visible || !meId || restrictClubsToPossible) return;
    const need = new Set<string>(preferredClubIds);
    for (const c of clubs) {
      if (
        myZoneId &&
        c.zone_id &&
        String(c.zone_id) === String(myZoneId) &&
        !refusedClubIds.has(c.id)
      ) {
        need.add(c.id);
      }
    }
    if (!need.size) return;
    const have = new Set(clubs.map((c) => c.id));
    const missing = [...need].filter((id) => !have.has(id));
    if (!missing.length) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('clubs')
          .select('id, name, lat, lng, zone_id, phone')
          .in('id', missing);
        if (error || cancelled || !data?.length) return;
        setClubs((prev) => {
          const m = new Map(prev.map((c) => [c.id, c]));
          for (const row of data) {
            const r = row as {
              id: string;
              name: string;
              lat: number | null;
              lng: number | null;
              zone_id: string | null;
              phone?: string | null;
            };
            if (!m.has(r.id)) {
              m.set(r.id, {
                id: r.id,
                name: r.name,
                lat: r.lat ?? null,
                lng: r.lng ?? null,
                zone_id: r.zone_id ?? null,
                phone: r.phone ?? null,
              });
            }
          }
          return [...m.values()].sort((a, b) =>
            a.name.localeCompare(b.name, 'fr')
          );
        });
      } catch (e) {
        console.warn('[FindGameWizard] clubs user merge', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, meId, clubs, preferredClubIds, refusedClubIds, myZoneId, restrictClubsToPossible]);

  /** Un seul club possible : sélection implicite (toujours un club concret à la publication). */
  useEffect(() => {
    if (!visible || !restrictClubsToPossible) return;
    if (clubs.length !== 1 || selectedClub) return;
    setSelectedClub(clubs[0]);
  }, [visible, restrictClubsToPossible, clubs, selectedClub]);

  /** Si la liste préfillée change, invalider une sélection hors liste. */
  useEffect(() => {
    if (!visible || !restrictClubsToPossible || !selectedClub) return;
    if (!clubs.some((c) => c.id === selectedClub.id)) {
      setSelectedClub(null);
    }
  }, [visible, restrictClubsToPossible, clubs, selectedClub]);

  useEffect(() => {
    if (!visible || !prefill || clubs.length === 0) return;
    if (!prefill.prefillClubId && !prefill.prefillClubName) return;
    if (selectedClub?.id) return;

    let candidate: ClubRow | null = null;
    if (prefill.prefillClubId) {
      candidate =
        clubs.find((c) => String(c.id) === String(prefill.prefillClubId)) ?? null;
    }
    if (!candidate && prefill.prefillClubName) {
      const target = String(prefill.prefillClubName).trim().toLowerCase();
      candidate =
        clubs.find((c) => c.name.trim().toLowerCase() === target) ?? null;
    }
    if (candidate) setSelectedClub(candidate);
  }, [visible, prefill, clubs, selectedClub]);

  useEffect(() => {
    if (!visible || !prefill?.prefillPlayerIds?.length || !meId) return;
    const seed = prefill.prefillPlayerIds
      .map((id) => String(id))
      .filter((id) => id && id !== String(meId));
    const limited = seed.slice(0, Math.max(0, maxOthers));
    setSelectedOtherIds(new Set(limited));
  }, [visible, prefill, meId, maxOthers]);

  useEffect(() => {
    // Ajuster la sélection si maxOthers diminue
    setSelectedOtherIds((prev) => {
      const arr = [...prev];
      if (arr.length <= maxOthers) return prev;
      return new Set(arr.slice(0, maxOthers));
    });
  }, [maxOthers]);

  const clubSections = useMemo((): ClubSection[] => {
    const q = clubSearch.trim().toLowerCase();
    const matches = (c: ClubRow) => !q || c.name.toLowerCase().includes(q);

    if (restrictClubsToPossible) {
      const filtered = clubs.filter(matches);
      filtered.sort((a, b) => {
        if (
          userLocation &&
          a.lat != null &&
          a.lng != null &&
          b.lat != null &&
          b.lng != null
        ) {
          const da = haversineKm(userLocation, { lat: a.lat, lng: a.lng });
          const db = haversineKm(userLocation, { lat: b.lat, lng: b.lng });
          if (da !== db) return da - db;
        }
        return a.name.localeCompare(b.name, 'fr');
      });
      if (filtered.length) {
        return [
          {
            key: 'possible',
            title: 'Clubs possibles pour ce créneau',
            clubs: filtered,
          },
        ];
      }
      return [];
    }

    const byId = new Map(clubs.map((c) => [c.id, c]));
    const refused = refusedClubIds;

    const preferred: ClubRow[] = [];
    const prefSorted = [...preferredClubIds].sort((a, b) => {
      const na = byId.get(a)?.name ?? '';
      const nb = byId.get(b)?.name ?? '';
      return na.localeCompare(nb, 'fr');
    });
    for (const id of prefSorted) {
      const c = byId.get(id);
      if (c && matches(c)) preferred.push(c);
    }

    const used = new Set<string>([...preferred.map((c) => c.id)]);

    const inZone: ClubRow[] = [];
    if (myZoneId) {
      for (const c of clubs) {
        if (refused.has(c.id)) continue;
        if (used.has(c.id)) continue;
        if (c.zone_id && String(c.zone_id) === String(myZoneId) && matches(c)) {
          inZone.push(c);
        }
      }
      inZone.sort((a, b) => {
        if (
          userLocation &&
          a.lat != null &&
          a.lng != null &&
          b.lat != null &&
          b.lng != null
        ) {
          const da = haversineKm(userLocation, { lat: a.lat, lng: a.lng });
          const db = haversineKm(userLocation, { lat: b.lat, lng: b.lng });
          if (da !== db) return da - db;
        }
        return a.name.localeCompare(b.name, 'fr');
      });
      for (const c of inZone) used.add(c.id);
    }

    const others: ClubRow[] = [];
    for (const c of clubs) {
      if (refused.has(c.id)) continue;
      if (used.has(c.id)) continue;
      if (!matches(c)) continue;
      others.push(c);
    }
    others.sort((a, b) => {
      if (
        userLocation &&
        a.lat != null &&
        a.lng != null &&
        b.lat != null &&
        b.lng != null
      ) {
        const da = haversineKm(userLocation, { lat: a.lat, lng: a.lng });
        const db = haversineKm(userLocation, { lat: b.lat, lng: b.lng });
        if (da !== db) return da - db;
      }
      return a.name.localeCompare(b.name, 'fr');
    });

    const out: ClubSection[] = [];
    if (preferred.length) {
      out.push({
        key: 'pref',
        title: preferred.length > 1 ? 'Clubs préférés' : 'Club préféré',
        clubs: preferred,
      });
    }
    if (inZone.length) {
      out.push({ key: 'zone', title: 'Clubs de ta zone', clubs: inZone });
    }
    if (others.length) {
      out.push({
        key: 'other',
        title: restrictClubsToPossible ? 'Clubs possibles' : 'Tous les clubs',
        clubs: others,
      });
    }
    return out;
  }, [
    clubs,
    clubSearch,
    preferredClubIds,
    refusedClubIds,
    myZoneId,
    userLocation,
    restrictClubsToPossible,
  ]);

  const renderClubChip = useCallback(
    (c: ClubRow, sectionKey: string) => {
      const on = selectedClub?.id === c.id;
      const distKm =
        (sectionKey === 'zone' || sectionKey === 'other') &&
        userLocation &&
        c.lat != null &&
        c.lng != null
          ? haversineKm(userLocation, {
              lat: c.lat,
              lng: c.lng,
            })
          : null;
      return (
        <Pressable
          onPress={() => setSelectedClub(c)}
          style={{
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: on ? T.accent : T.cardBorder,
            backgroundColor: on ? T.accentSoft : T.card,
          }}
        >
          <Text
            numberOfLines={2}
            style={{
              fontSize: 14,
              fontWeight: '700',
              color: on ? T.accent : T.text,
            }}
          >
            {c.name}
          </Text>
          {distKm != null && Number.isFinite(distKm) && distKm !== Infinity ? (
            <Text style={{ fontSize: 12, fontWeight: '600', color: T.muted, marginTop: 4 }}>
              {distKm} km
            </Text>
          ) : null}
        </Pressable>
      );
    },
    [selectedClub, userLocation]
  );

  const renderProposeClubPill = useCallback(
    (c: ClubRowLite, opts?: { fullWidth?: boolean }) => {
      const active = selectedClub?.id === c.id;
      const full = opts?.fullWidth ?? false;
      const row = clubs.find((x) => x.id === c.id);
      const phone = row?.phone ?? c.phone ?? null;
      return (
        <Pressable
          key={c.id}
          onPress={() => {
            if (row) setSelectedClub(row);
          }}
          style={{
            width: full ? '100%' : '48%',
            paddingVertical: 12,
            paddingHorizontal: 12,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: active ? T.accent : T.cardBorder,
            backgroundColor: active ? T.accent : T.card,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Text
            style={{
              color: active ? '#0B1526' : T.text,
              fontWeight: '800',
              fontSize: 14,
              flex: 1,
            }}
            numberOfLines={2}
          >
            {c.name}
          </Text>
          {phone ? (
            <Pressable
              onPress={(e) => {
                e?.stopPropagation?.();
                e?.preventDefault?.();
                Linking.openURL(`tel:${phone}`);
              }}
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(255,255,255,0.18)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.25)',
              }}
            >
              <Ionicons name="call" size={12} color={active ? T.ink : T.text} />
            </Pressable>
          ) : null}
        </Pressable>
      );
    },
    [selectedClub, clubs]
  );

  const toggleOther = useCallback(
    (id: string) => {
      if (!meId || id === meId) return;
      setSelectedOtherIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else if (next.size < maxOthers) next.add(id);
        return next;
      });
    },
    [meId, maxOthers]
  );

  const mergeDateTime = useCallback(() => {
    const d = new Date(dateVal);
    d.setHours(timeVal.getHours(), timeVal.getMinutes(), 0, 0);
    return d;
  }, [dateVal, timeVal]);

  const canNext = useMemo(() => {
    if (step === 1) return true;
    if (step === 2) {
      /** Il faut exactement `maxOthers` co-joueurs (toi + autres + places = 4). */
      return selectedOtherIds.size === maxOthers;
    }
    if (step === 3) {
      if (restrictClubsToPossible && clubs.length === 0) return false;
      return !!selectedClub;
    }
    if (step === 4) return !!selectedClub;
    return true;
  }, [step, selectedClub, selectedOtherIds.size, maxOthers, restrictClubsToPossible, clubs.length]);

  const publish = async () => {
    if (!meId || !selectedClub) return;
    if (restrictClubsToPossible && clubs.length === 0) return;
    const starts = mergeDateTime();
    if (starts.getTime() < Date.now() - 60_000) {
      Alert.alert('Date invalide', 'Choisis une date et une heure dans le futur.');
      return;
    }
    const playerIds = [meId, ...[...selectedOtherIds].filter((id) => id !== meId)];
    if (playerIds.length + placesToFill !== 4) {
      Alert.alert(
        'Places',
        `Il faut ${4 - placesToFill} joueur(s) indiqué(s) (toi inclus) pour ${placesToFill} place(s) à compléter.`
      );
      return;
    }
    setBusy(true);
    try {
      const { data: searchId, error } = await rpcCreateGroupMatchSearch({
        groupId,
        startsAtIso: starts.toISOString(),
        clubId: selectedClub.id,
        placesToFill,
        playerIds,
      });
      if (error) {
        Alert.alert('Impossible', error.message);
        return;
      }

      // V1 opportunité de match (match_proposed + éventuellement match_almost_full si remaining=1)
      // Ne pas bloquer l'UI: on fait le ciblage + enqueue en tâche de fond.
      void (async () => {
        try {
          if (!searchId) return;
          const startsAtIso = starts.toISOString();
          const endsAtIso = new Date(starts.getTime() + 90 * 60 * 1000).toISOString();
          const candidateUserIds = members.map((m) => m.id);
          const excludedUserIds = playerIds; // déjà dans la recherche

          const remaining = placesToFill;
          console.log('[OpportunityNotif] match_proposed trigger', {
            searchId,
            groupId,
            startsAtIso,
            remainingSlots: remaining,
          });

          const eligibleUserIds = await getEligibleUsersForMatchNotification({
            groupId,
            startsAtIso,
            endsAtIso,
            clubId: selectedClub.id,
            candidateUserIds,
            excludedUserIds,
          });

          console.log('[OpportunityNotif] match_proposed candidates', {
            groupId,
            candidateCount: candidateUserIds.length,
            excludedCount: excludedUserIds.length,
            eligibleCount: eligibleUserIds.length,
          });

          const enq1 = await enqueueMatchOpportunityNotifications({
            kind: 'match_proposed',
            groupId,
            opportunityId: searchId,
            recipientUserIds: eligibleUserIds,
            startsAtIso,
            endsAtIso,
            remainingSlots: remaining,
            trigger: 'created',
          });
          console.log('[OpportunityNotif] match_proposed enqueue result', enq1);

          // Si la recherche démarre déjà à 1 place restante => notifier aussi "almost full"
          if (remaining === 1 && eligibleUserIds.length > 0) {
            const enq2 = await enqueueMatchOpportunityNotifications({
              kind: 'match_almost_full',
              groupId,
              opportunityId: searchId,
              recipientUserIds: eligibleUserIds,
              startsAtIso,
              endsAtIso,
              remainingSlots: 1,
              trigger: 'created_already_almost_full',
            });
            console.log('[OpportunityNotif] match_almost_full enqueue result', enq2);
          }
        } catch (e) {
          console.warn('[OpportunityNotif] background enqueue failed:', e?.message || e);
        }
      })();

      await Promise.resolve(onPublished());
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const goNext = useCallback(() => {
    if (step >= 4) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setStep((s) => Math.min(4, s + 1));
  }, [step]);

  const goBack = useCallback(() => {
    if (isProposeMatchShortFlow && step === 3) {
      onClose();
      return;
    }
    if (step > 1) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setStep((s) => s - 1);
    } else onClose();
  }, [isProposeMatchShortFlow, step, onClose]);

  const summaryLines = useMemo(() => {
    const starts = mergeDateTime();
    let durationMs = 60 * 60 * 1000;
    if (prefill?.prefillStartAt && prefill?.prefillEndAt) {
      const pStart = new Date(prefill.prefillStartAt).getTime();
      const pEnd = new Date(prefill.prefillEndAt).getTime();
      const d = pEnd - pStart;
      if (Number.isFinite(d) && d > 0) durationMs = d;
    }
    const ends = new Date(starts.getTime() + durationMs);
    const others = [...selectedOtherIds].filter((id) => id !== meId);
    const otherLabels = others
      .map((id) => members.find((m) => m.id === id)?.label)
      .filter((label): label is string => typeof label === 'string' && label.length > 0);
    const sh = pad2(starts.getHours());
    const sm = pad2(starts.getMinutes());
    const eh = pad2(ends.getHours());
    const em = pad2(ends.getMinutes());
    return {
      dateStr: formatDateFr(starts),
      timeStr: `${sh}h${sm}`,
      slotRangeStr: `${sh}h${sm} – ${eh}h${em}`,
      clubName: selectedClub?.name ?? '',
      places: placesToFill,
      otherLabels,
    };
  }, [mergeDateTime, selectedClub, placesToFill, selectedOtherIds, members, meId, prefill?.prefillStartAt, prefill?.prefillEndAt]);

  const windowH = Dimensions.get('window').height;
  /** Hauteur du sheet : quasi plein écran pour voir date/heure + pickers sans couper. */
  const sheetMaxH = Math.round(Math.min(windowH * 0.97, windowH - 4));
  const stepMeta = WIZARD_STEP_COPY[(step - 1) as 0 | 1 | 2 | 3];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {isProposeMatchShortFlow && step === 3 ? (
        <ProposeMatchCombinedSheet
          insets={insets}
          onBack={goBack}
          onClose={onClose}
          onPublish={publish}
          busy={busy}
          clubsLoading={clubsLoading}
          recommended={proposeClubLayout.recommended}
          others={proposeClubLayout.others}
          recommendedTitle={proposeRecommendedTitle}
          clubsLength={clubs.length}
          renderPill={renderProposeClubPill}
          summary={summaryLines}
          canPublish={!!selectedClub && !clubsLoading && clubs.length > 0}
          noClubsAvailable={clubs.length === 0 && !clubsLoading}
        />
      ) : (
        <View style={{ flex: 1, backgroundColor: T.overlay, justifyContent: 'flex-end' }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ width: '100%', flex: 1, justifyContent: 'flex-end' }}
          >
            <View
              style={{
                backgroundColor: T.bg,
                borderTopLeftRadius: 18,
                borderTopRightRadius: 18,
                paddingHorizontal: 16,
                paddingTop: 14,
                paddingBottom: Math.max(16, insets.bottom + 12),
                height: sheetMaxH,
                maxHeight: sheetMaxH,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Pressable onPress={goBack} hitSlop={12} style={{ padding: 4, marginRight: 4 }}>
                  <Ionicons name="chevron-back" size={22} color={T.text} />
                </Pressable>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ color: T.muted, fontSize: 12, fontWeight: '700' }}>
                    Trouver · {stepProgressLabel}
                  </Text>
                </View>
                <Pressable onPress={onClose} hitSlop={12} style={{ padding: 4 }}>
                  <Ionicons name="close" size={22} color={T.text} />
                </Pressable>
              </View>

              <Text style={{ color: T.text, fontSize: 22, fontWeight: '900' }}>{stepMeta?.title}</Text>
              <Text style={{ color: T.muted, fontSize: 13, marginTop: 6, marginBottom: 14, lineHeight: 18 }}>
                {stepMeta?.subtitle}
              </Text>

              <View style={{ flex: 1, minHeight: 0 }}>
                {step === 1 ? (
                  <WizardStepDateTime
                    dateVal={dateVal}
                    timeVal={timeVal}
                    showDatePicker={showDatePicker}
                    showTimePicker={showTimePicker}
                    setShowDatePicker={setShowDatePicker}
                    setShowTimePicker={setShowTimePicker}
                    setDateVal={setDateVal}
                    setTimeVal={setTimeVal}
                  />
                ) : null}
                {step === 2 ? (
                  <WizardStepPlacesPlayers
                    placesChipOptions={placesChipOptions}
                    placesToFill={placesToFill}
                    setPlacesToFill={setPlacesToFill}
                    maxOthers={maxOthers}
                    membersLoading={membersLoading}
                    members={members}
                    meId={meId}
                    selectedOtherIds={selectedOtherIds}
                    toggleOther={toggleOther}
                  />
                ) : null}
                {step === 3 ? (
                  <WizardStepClub
                    clubSearch={clubSearch}
                    setClubSearch={setClubSearch}
                    clubsLoading={clubsLoading}
                    clubSections={clubSections}
                    restrictClubsToPossible={restrictClubsToPossible}
                    clubsLength={clubs.length}
                    locationReady={locationReady}
                    userLocation={userLocation}
                    renderClubChip={renderClubChip}
                    emptyBlocking={
                      restrictClubsToPossible && clubs.length === 0 && !clubsLoading
                        ? {
                            title: 'Aucun club commun disponible',
                            body: 'Ajuste ton rayon ou tes clubs acceptés pour proposer cette partie',
                          }
                        : null
                    }
                  />
                ) : null}
                {step === 4 ? <WizardStepSummary summary={summaryLines} /> : null}
              </View>

              <Pressable
                onPress={() => {
                  if (step === 4) {
                    void publish();
                  } else {
                    goNext();
                  }
                }}
                disabled={step === 4 ? busy || !selectedClub : !canNext}
                style={{
                  marginTop: 8,
                  backgroundColor:
                    (step === 4 ? !busy && !!selectedClub : canNext) ? T.accent : 'rgba(255,255,255,0.12)',
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: 'center',
                  opacity:
                    step === 4
                      ? busy
                        ? 0.7
                        : selectedClub
                          ? 1
                          : 0.45
                      : canNext
                        ? 1
                        : 0.45,
                }}
              >
                {step === 4 && busy ? (
                  <ActivityIndicator color={T.ink} />
                ) : (
                  <Text
                    style={{
                      color:
                        (step === 4 ? !busy && !!selectedClub : canNext) ? T.ink : T.muted,
                      fontWeight: '800',
                      fontSize: 16,
                    }}
                  >
                    {step === 4 ? 'Proposer la partie' : 'Continuer'}
                  </Text>
                )}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}
    </Modal>
  );
}
