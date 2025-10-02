// app/(tabs)/matches/index.js
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Linking, Platform, Pressable, SectionList, Text, View } from "react-native";
import { useActiveGroup } from "../../../lib/activeGroup";
import { supabase } from "../../../lib/supabase";
// Utility for consistent logging/debug and web-friendly button behavior
function press(label, handler) {
  return (...args) => {
    // Optionally log/track here, e.g. console.log("Press:", label);
    return handler(...args);
  };
}

const POSITIVE_STATUSES = ["yes","available","ok","accepted","true","1","dispo","oui","present","ready","green","y","✅","👍"]; // élargi
const isConfirmedStatus = (status) => {
  const s = (status || "").toString().trim().toLowerCase();
  return s === "accepted"; // seule valeur considérée comme confirmée
};

/**
 * Seed default RSVP='maybe' for players who are available on the full interval.
 * - Avoids overwriting existing rows (accepted/no/maybe)
 * - Excludes the creator (already set to accepted)
 */
async function seedMaybeRsvps({ matchId, groupId, startsAt, endsAt, excludeUserId }) {
  if (!matchId || !startsAt || !endsAt) return;

  // 1) Existing RSVPs to avoid overwriting/inserting duplicates
  let existingMap = new Map();
  try {
    const { data: existing } = await supabase
      .from('match_rsvps')
      .select('user_id, status')
      .eq('match_id', matchId);
    existingMap = new Map((existing || []).map(r => [String(r.user_id), String(r.status || '')]));
  } catch {}

  // 2) Find available users who fully cover the interval
  const { data: avs, error: eAv } = await supabase
    .from('availability')
    .select('user_id, status, group_id, start, end')
    .lte('start', startsAt)           // availability.start <= interval start
    .gte('end', endsAt)               // availability.end   >= interval end
    .or(`group_id.is.null,group_id.eq.${groupId}`); // global or group-specific
  if (eAv) {
    console.warn('[seedMaybeRsvps] availability fetch error:', eAv?.message || eAv);
    return;
  }

  const positives = new Set(POSITIVE_STATUSES.map(s => String(s).toLowerCase()));
  const candidates = [];
  for (const a of avs || []) {
    const s = String(a.status || '').toLowerCase().trim();
    if (!positives.has(s)) continue;
    const uid = String(a.user_id);
    if (!uid) continue;
    if (excludeUserId && String(excludeUserId) === uid) continue; // skip creator
    if (existingMap.has(uid)) continue; // already has an RSVP row
    candidates.push(uid);
  }

  // 3) Insert as 'maybe' (limit to a reasonable number)
  const toInsert = Array.from(new Set(candidates)).slice(0, 16).map(uid => ({
    match_id: matchId,
    user_id: uid,
    status: 'maybe',
  }));

  if (toInsert.length) {
    const { error: eIns } = await supabase.from('match_rsvps').insert(toInsert);
    if (eIns) {
      console.warn('[seedMaybeRsvps] insert error:', eIns?.message || eIns);
    }
  }
}
const WINDOW_DAYS_PAST = 7;   // inclure la semaine passée
const WINDOW_DAYS_FUTURE = 21; // et 3 semaines à venir

const SLOT_MINUTES = 30; // taille d'un créneau en minutes pour le fallback

// Helper: duration in minutes between two ISO datetimes
function durationMinutes(startIso, endIso) {
  try {
    const s = new Date(startIso).getTime();
    const e = new Date(endIso).getTime();
    return Math.round((e - s) / 60000);
  } catch {
    return 0;
  }
}

async function fallbackComputeFromAvailability(groupId) {
  const now = new Date();
  const past = new Date(now);
  past.setDate(past.getDate() - WINDOW_DAYS_PAST);
  const future = new Date(now);
  future.setDate(future.getDate() + WINDOW_DAYS_FUTURE);

  // 1) Charger TOUTES les dispos utiles (fenêtre élargie)
  const { data: avs, error: eAv } = await supabase
    .from("availability")
    .select("user_id, group_id, start, end, status")
    .gte("end", past.toISOString())
    .lte("start", future.toISOString());
  if (eAv) throw eAv;

  const norm = (v) => (v ?? "").toString().trim().toLowerCase();

  // 2) Construire des bacs de SLOT_MINUTES à partir des dispos (pas de table time_slots requise)
  const slotMs = SLOT_MINUTES * 60 * 1000;
  const bins = new Map(); // key: startMs, value: { users: Set<string>, starts_at: ISO, ends_at: ISO }

  for (const a of avs ?? []) {
    if (!a || !a.start || !a.end) continue;
    // Filtre groupe: accepte null (dispo globale), rejette si explicite autre groupe
    if (a.group_id && a.group_id !== groupId) continue;

    const st = norm(a.status);
    if (!POSITIVE_STATUSES.includes(st)) continue;

    const aStart = new Date(a.start).getTime();
    const aEnd = new Date(a.end).getTime();

    // Normalisation fenêtre d'intérêt
    let t = Math.max(aStart, past.getTime());
    const end = Math.min(aEnd, future.getTime());

    // Aligner le début sur la grille de 30 min
    t = Math.floor(t / slotMs) * slotMs;

    while (t + slotMs <= end) {
      const key = t;
      const entry = bins.get(key) || { users: new Set(), starts_at: new Date(t).toISOString(), ends_at: new Date(t + slotMs).toISOString() };
      entry.users.add(a.user_id);
      bins.set(key, entry);
      t += slotMs;
    }
  }

  // 2bis) Construire des créneaux 1h30 (3 x 30 min) prêt si intersection des 3 bacs >= 4 joueurs
  const longReady = [];
  const keysSorted = Array.from(bins.keys()).sort((a, b) => a - b);
  for (let i = 0; i < keysSorted.length; i++) {
    const k0 = keysSorted[i];
    const k1 = k0 + slotMs;
    const k2 = k1 + slotMs;
    if (!bins.has(k1) || !bins.has(k2)) continue; // besoin de 3 bacs consécutifs
    const s0 = bins.get(k0).users;
    const s1 = bins.get(k1).users;
    const s2 = bins.get(k2).users;
    // intersection des 3 sets
    const inter = new Set(Array.from(s0).filter((u) => s1.has(u) && s2.has(u)));
    if (inter.size >= 4) {
      const users = Array.from(inter);
      longReady.push({
        group_id: groupId,
        time_slot_id: String(k0),
        starts_at: new Date(k0).toISOString(),
        ends_at: new Date(k2 + slotMs).toISOString(), // 3 * 30min
        long_user_ids: users.slice(0, 8),
        long_count: users.length,
      });
    }
  }

  // 2ter) Construire des créneaux 1h (2 x 30 min) prêts si intersection des 2 bacs >= 4 joueurs
  const hourReady = [];
  for (let i = 0; i < keysSorted.length; i++) {
    const k0 = keysSorted[i];
    const k1 = k0 + slotMs;
    if (!bins.has(k1)) continue; // besoin de 2 bacs consécutifs
    const s0 = bins.get(k0).users;
    const s1 = bins.get(k1).users;
    const inter = new Set(Array.from(s0).filter((u) => s1.has(u)));
    if (inter.size >= 4) {
      const users = Array.from(inter);
      hourReady.push({
        group_id: groupId,
        time_slot_id: String(k0),
        starts_at: new Date(k0).toISOString(),
        ends_at: new Date(k1 + slotMs).toISOString(), // 2 * 30min = 1h
        hour_user_ids: users.slice(0, 8),
        hour_count: users.length,
      });
    }
  }

  // 3) Séparer en "ready" (>=4) et "hot" (=3)
  const ready = [];
  const hot = [];
  for (const [key, entry] of bins) {
    const userIds = Array.from(entry.users);
    const rec = {
      group_id: groupId,
      time_slot_id: String(key), // pseudo ID local pour l'UI
      starts_at: entry.starts_at,
      ends_at: entry.ends_at,
    };
    if (userIds.length >= 4) {
      ready.push({ ...rec, ready_user_ids: userIds.slice(0, 8), ready_count: userIds.length });
    } else if (userIds.length === 3) {
      hot.push({ ...rec, hot_user_ids: userIds, hot_count: 3 });
    }
  }

  // Tri par date
  ready.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  hot.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));

  // Diagnostics
  const diag = { slotCount: bins.size, avCount: (avs ?? []).length, positives: [...bins.values()].reduce((n, e) => n + (e.users?.size || 0), 0) };

  return { ready, hot, longReady, hourReady, diag };
}

function rsvpBorderColor(status) {
  const s = (status || "").toString().trim().toLowerCase();
  if (!s) return "#f59e0b"; // orange: pas de réponse/indéterminé
  if (s === "accepted") return "#10b981"; // vert: confirmé
  if (s === "no") return "#ef4444"; // rouge: refuse
  // yes / maybe / autres => orange
  return "#f59e0b";
}

function Avatar({ uri, size = 32, rsvpStatus }) {
  const hasStatus = rsvpStatus !== undefined && rsvpStatus !== null;
  const wrapperStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: uri ? 'transparent' : '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: hasStatus ? 2 : 0,
    borderColor: hasStatus ? rsvpBorderColor(rsvpStatus) : 'transparent',
    position: 'relative',
    overflow: 'hidden',
  };

  return (
    <View style={wrapperStyle}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: "#eef2f7",
          }}
        />
      ) : (
        <Text style={{ color: "#6b7280", fontWeight: "700" }}>?</Text>
      )}
    </View>
  );
}

export default function MatchesIndexScreen() {
  const { activeGroup } = useActiveGroup();
  const groupId = activeGroup?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState([]); // v_slots_ready_4_no_match
  const [hot, setHot] = useState([]);     // v_slots_hot_3_no_match
  const [longReady, setLongReady] = useState([]); // 1h30 prêts (3 x 30min)
  const [hourReady, setHourReady] = useState([]); // 1h prêts (2 x 30min)
  const [profilesById, setProfilesById] = useState({});
  const [diag, setDiag] = useState(null);
  // Matches programmés + RSVPs + mon UID
  const [myMatches, setMyMatches] = useState([]);
  const [rsvpsByMatch, setRsvpsByMatch] = useState({});
  const [meId, setMeId] = useState(null);
  // Toggle d'affichage
  const [mode, setMode] = useState('long'); // 'long' = 1h30, 'hour' = 1h
  const [tab, setTab] = useState('proposes'); // 'proposes' | 'rsvp' | 'valides'
  const [matchesPending, setMatchesPending] = useState([]);
  const [matchesConfirmed, setMatchesConfirmed] = useState([]);

  // sub-tabs for RSVP & confirmed
  const [rsvpMode, setRsvpMode] = useState('long');        // 'long' | 'hour'
  const [confirmedMode, setConfirmedMode] = useState('long'); // 'long' | 'hour'

  useEffect(() => {
    // Every time the user switches tab, start that tab in 1h30 mode
    if (tab === 'proposes') {
      setMode('long');
    } else if (tab === 'rsvp') {
      setRsvpMode('long');
    } else if (tab === 'valides') {
      setConfirmedMode('long');
    }
  }, [tab]);

  const pendingHour = React.useMemo(
    () => (matchesPending || []).filter(m =>
      durationMinutes(m?.time_slots?.starts_at, m?.time_slots?.ends_at) <= 60
    ),
    [matchesPending]
  );

  const pendingLong = React.useMemo(
    () => (matchesPending || []).filter(m =>
      durationMinutes(m?.time_slots?.starts_at, m?.time_slots?.ends_at) > 60
    ),
    [matchesPending]
  );

  const confirmedHour = React.useMemo(
    () => (matchesConfirmed || []).filter(m =>
      durationMinutes(m?.time_slots?.starts_at, m?.time_slots?.ends_at) <= 60
    ),
    [matchesConfirmed]
  );

  const confirmedLong = React.useMemo(
    () => (matchesConfirmed || []).filter(m =>
      durationMinutes(m?.time_slots?.starts_at, m?.time_slots?.ends_at) > 60
    ),
    [matchesConfirmed]
  );

  // Group 1h30 slots by day with enriched data for better visibility
  const longSections = React.useMemo(() => {
    const byDay = new Map();
    for (const it of longReady) {
      const d = new Date(it.starts_at);
      const dayKey = d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "2-digit", day: "2-digit" });
      const userIds = it.long_user_ids || [];
      const row = {
        key: it.time_slot_id + "-long",
        starts_at: it.starts_at,
        ends_at: it.ends_at,
        userIds,
      };
      const arr = byDay.get(dayKey) || [];
      arr.push(row);
      byDay.set(dayKey, arr);
    }
    const sections = Array.from(byDay.entries()).map(([title, data]) => ({ title, data: data.sort((a,b)=> new Date(a.starts_at)-new Date(b.starts_at)) }));
    // sort sections chronologically by their first item
    sections.sort((A, B) => {
      const a0 = A.data[0]?.starts_at || A.title;
      const b0 = B.data[0]?.starts_at || B.title;
      return new Date(a0) - new Date(b0);
    });
    return sections;
  }, [longReady, profilesById]);

  const fetchData = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      let readyList = [];
      let hotList = [];
      let viewError = null;
      try {
        const [{ data: rdy, error: e1 }, { data: hotData, error: e2 }] = await Promise.all([
          supabase
            .from("v_slots_ready_4_no_match")
            .select("*")
            .eq("group_id", groupId)
            .order("starts_at", { ascending: true }),
          supabase
            .from("v_slots_hot_3_no_match")
            .select("*")
            .eq("group_id", groupId)
            .order("starts_at", { ascending: true }),
        ]);
        if (e1 || e2) viewError = e1 || e2;
        readyList = rdy ?? [];
        hotList = hotData ?? [];
      } catch (err) {
        viewError = err;
      }

      if (viewError || (readyList.length === 0 && hotList.length === 0)) {
        const f = await fallbackComputeFromAvailability(groupId);
        readyList = f.ready;
        hotList = f.hot;
        setLongReady(f.longReady || []);
        setHourReady(f.hourReady || []);
        setDiag(f.diag);
      } else {
        setDiag(null);
        try {
          const f2 = await fallbackComputeFromAvailability(groupId);
          setLongReady(f2.longReady || []);
          setHourReady(f2.hourReady || []);
        } catch {}
      }

      setReady(readyList);
      setHot(hotList);

      // === Matches programmés (à venir) ===
      const nowIso = new Date().toISOString();
      const { data: matches, error: em } = await supabase
        .from("matches")
        .select("id, group_id, time_slot_id, status, time_slots!inner(id, starts_at, ends_at)")
        .eq("group_id", groupId)
        .gte("time_slots.ends_at", nowIso)
        .order("starts_at", { ascending: true, foreignTable: "time_slots" });
      if (em) throw em;
      setMyMatches(matches ?? []);

      // Partition matches by status for tabs
      const byStatus = (matches ?? []).reduce((acc, m) => {
        const s = (m.status || '').toLowerCase();
        if (!acc[s]) acc[s] = [];
        acc[s].push(m);
        return acc;
      }, {});
      // Keep on state for easy rendering
      setMatchesPending(byStatus['pending'] || []);
      setMatchesConfirmed(byStatus['confirmed'] || []);

      // RSVPs pour ces matches
      const matchIds = (matches ?? []).map((m) => m.id);
      let rsvpMap = {};
      if (matchIds.length) {
        const { data: rsvps, error: er } = await supabase
          .from("match_rsvps")
          .select("match_id, user_id, status")
          .in("match_id", matchIds);
        if (er) throw er;
        for (const r of rsvps ?? []) {
          if (!rsvpMap[r.match_id]) rsvpMap[r.match_id] = [];
          rsvpMap[r.match_id].push({ user_id: r.user_id, status: r.status });
        }
      }
      setRsvpsByMatch(rsvpMap);

      // Profils pour avatars (inclure joueurs prêts + joueurs des matches)
      const ids = Array.from(
        new Set([
          ...readyList.flatMap((x) => x.ready_user_ids || []),
          ...hotList.flatMap((x) => x.hot_user_ids || []),
          ...longReady.flatMap((x) => x.long_user_ids || []),
          ...hourReady.flatMap((x) => x.hour_user_ids || []),
          ...(matches ?? []).flatMap((m) => (rsvpMap[m.id] || []).map((r) => r.user_id)),
        ])
      );
      if (ids.length) {
        const { data: profs, error: ep } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", ids);
        if (ep) throw ep;
        setProfilesById(Object.fromEntries((profs ?? []).map((p) => [p.id, p])));
      } else {
        setProfilesById({});
      }
    } catch (e) {
      Alert.alert("Erreur", e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    if (groupId) fetchData();
  }, [groupId, fetchData]);

  // Récupère mon UID (pour RSVP)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMeId(data?.user?.id ?? null);
    })();
  }, [groupId]);

  // Realtime: si un match est créé, ces créneaux disparaissent des listes
  useEffect(() => {
    if (!groupId) return;
    const ch = supabase
      .channel(`matches:${groupId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "matches", filter: `group_id=eq.${groupId}` },
        () => fetchData()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [groupId, fetchData]);

  // Realtime: rafraîchir quand les RSVPs changent
  useEffect(() => {
    if (!groupId) return;
    const ch = supabase
      .channel(`match_rsvps:${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_rsvps" },
        () => fetchData()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [groupId, fetchData]);

  const onCreateMatch = useCallback(
    async (time_slot_id) => {
      if (!groupId) return;
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

          // Seed default 'maybe' for other available players covering the slot
          try {
            if (createdMatch?.id) {
              const { data: slotRow } = await supabase
                .from('time_slots')
                .select('starts_at, ends_at')
                .eq('id', time_slot_id)
                .maybeSingle();
              if (slotRow?.starts_at && slotRow?.ends_at) {
                await seedMaybeRsvps({
                  matchId: createdMatch.id,
                  groupId,
                  startsAt: slotRow.starts_at,
                  endsAt: slotRow.ends_at,
                  excludeUserId: uid,
                });
              }
            }
          } catch (seedErr) {
            console.warn('[Matches] seedMaybeRsvps (slot) failed:', seedErr?.message || seedErr);
          }
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
    async (starts_at_iso, ends_at_iso) => {
      if (!groupId) return;
      try {
        const { data, error } = await supabase.rpc("create_match_from_interval_safe", {
          p_group: groupId,
          p_starts_at: starts_at_iso,
          p_ends_at: ends_at_iso,
        });
        if (error) throw error;

        if (!data?.ok) {
          // message utilisateur propre selon la raison
          if (Platform.OS === "web") {
            if (data?.reason === "not_enough_players") {
              window.alert("Pas assez de joueurs\nIl faut 4 joueurs couvrant toute la plage (trouvés: " + (data?.found ?? 0) + ").");
            } else if (data?.reason === "not_group_member") {
              window.alert("Accès refusé\nTu n'es pas membre de ce groupe.");
            } else if (data?.reason === "invalid_interval") {
              window.alert("Intervalle invalide\nLes horaires fournis ne sont pas valides.");
            } else {
              window.alert("Action impossible\nImpossible de créer le match pour ce créneau.");
            }
          } else {
            if (data?.reason === "not_enough_players") {
              Alert.alert("Pas assez de joueurs", `Il faut 4 joueurs couvrant toute la plage (trouvés: ${data?.found ?? 0}).`);
            } else if (data?.reason === "not_group_member") {
              Alert.alert("Accès refusé", "Tu n'es pas membre de ce groupe.");
            } else if (data?.reason === "invalid_interval") {
              Alert.alert("Intervalle invalide", "Les horaires fournis ne sont pas valides.");
            } else {
              Alert.alert("Action impossible", "Impossible de créer le match pour ce créneau.");
            }
          }
          return;
        }

        // Auto-RSVP pour la variante intervalle (1h ou 1h30)
        try {
          // Tenter de récupérer l'id du match renvoyé par la RPC, sinon déduire via time_slots
          let newMatchId = data?.match_id || null;

          if (!newMatchId) {
            // tenter de retrouver le match par le créneau exact
            const { data: m } = await supabase
              .from('matches')
              .select('id, time_slot_id, group_id, time_slots!inner(id, starts_at, ends_at)')
              .eq('group_id', groupId)
              .eq('time_slots.starts_at', starts_at_iso)
              .eq('time_slots.ends_at', ends_at_iso)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            newMatchId = m?.id ?? null;
          }

          // récupérer mon UID
          let uid = meId;
          if (!uid) {
            const { data: u } = await supabase.auth.getUser();
            uid = u?.user?.id ?? null;
          }

          if (newMatchId && uid) {
            await supabase
              .from('match_rsvps')
              .upsert(
                { match_id: newMatchId, user_id: uid, status: 'accepted' },
                { onConflict: 'match_id,user_id' }
              );
            // mise à jour optimiste
            setRsvpsByMatch((prev) => {
              const next = { ...prev };
              const arr = Array.isArray(next[newMatchId]) ? [...next[newMatchId]] : [];
              const i = arr.findIndex((r) => r.user_id === uid);
              if (i >= 0) arr[i] = { ...arr[i], status: 'accepted' };
              else arr.push({ user_id: uid, status: 'accepted' });
              next[newMatchId] = arr;
              return next;
            });
          }

          // Seed default 'maybe' for other players available on the interval
          try {
            if (newMatchId) {
              await seedMaybeRsvps({
                matchId: newMatchId,
                groupId,
                startsAt: starts_at_iso,
                endsAt: ends_at_iso,
                excludeUserId: uid,
              });
            }
          } catch (seedErr) {
            console.warn('[Matches] seedMaybeRsvps (interval) failed:', seedErr?.message || seedErr);
          }
        } catch (autoErr) {
          console.warn('[Matches] auto-RSVP (interval) failed:', autoErr?.message || autoErr);
        }

        await fetchData();
        if (Platform.OS === "web") {
          window.alert("Match créé 🎾\nLe créneau a été transformé en match.");
        } else {
          Alert.alert("Match créé 🎾", "Le créneau a été transformé en match.");
        }
      } catch (e) {
        if (Platform.OS === "web") {
          window.alert("Erreur\n" + (e.message ?? String(e)));
        } else {
          Alert.alert("Erreur", e.message ?? String(e));
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

      // Upsert RSVP as accepted
      const { error: eUp } = await supabase
        .from('match_rsvps')
        .upsert(
          { match_id, user_id: uid, status: 'accepted' },
          { onConflict: 'match_id,user_id' }
        );
      if (eUp) throw eUp;

      // Optimistic UI update: mark me as accepted locally
      setRsvpsByMatch((prev) => {
        const next = { ...prev };
        const arr = Array.isArray(next[match_id]) ? [...next[match_id]] : [];
        const i = arr.findIndex((r) => r.user_id === uid);
        if (i >= 0) {
          arr[i] = { ...arr[i], status: 'accepted' };
        } else {
          arr.push({ user_id: uid, status: 'accepted' });
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
          { match_id, user_id: uid, status: 'maybe' },
          { onConflict: 'match_id,user_id' }
        );
      if (eUp) throw eUp;

      // Optimistic UI update: mark me as 'maybe' locally so the badge/button toggles immediately
      setRsvpsByMatch((prev) => {
        const next = { ...prev };
        const arr = Array.isArray(next[match_id]) ? [...next[match_id]] : [];
        const i = arr.findIndex((r) => String(r.user_id) === String(uid));
        if (i >= 0) {
          arr[i] = { ...arr[i], status: 'maybe' };
        } else {
          arr.push({ user_id: uid, status: 'maybe' });
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

  const onContactClub = useCallback(async () => {
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
    if (!iso) return "";
    const d = new Date(iso);
    const date = d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" });
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `${date} • ${time}`;
  };

  const formatRange = (sIso, eIso) => {
    if (!sIso || !eIso) return "";
    const s = new Date(sIso);
    const e = new Date(eIso);
    const date = s.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" });
    const sh = s.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const eh = e.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `${date} • ${sh} → ${eh}`;
  };

  const SlotRow = ({ item, type }) => {
    const userIds = type === "ready" ? item.ready_user_ids || [] : item.hot_user_ids || [];
    return (
      <View style={{ backgroundColor: "white", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 12, marginBottom: 10, minHeight: 120 }}>
        <Text style={{ fontWeight: "800", color: "#111827", marginBottom: 6 }}>{formatDate(item.starts_at)}</Text>
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          {userIds.map((uid) => {
            const p = profilesById[uid];
            return <Avatar key={uid} uri={p?.avatar_url} />;
          })}
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {type === "ready" ? (
            <Pressable
              onPress={press("Créer un match", () => onCreateMatch(item.time_slot_id))}
              accessibilityRole="button"
              accessibilityLabel="Créer un match pour ce créneau"
              style={({ pressed }) => [
                { backgroundColor: "#1a4b97", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
                Platform.OS === "web" ? { cursor: "pointer" } : null,
                pressed ? { opacity: 0.8 } : null,
              ]}
            >
              <Text style={{ color: "white", fontWeight: "800" }}>Créer un match</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={press("Contacter un club", onContactClub)}
            accessibilityRole="button"
            accessibilityLabel="Contacter le club pour ce créneau"
            style={({ pressed }) => [
              { backgroundColor: "#111827", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
              Platform.OS === "web" ? { cursor: "pointer" } : null,
              pressed ? { opacity: 0.8 } : null,
            ]}
          >
            <Text style={{ color: "white", fontWeight: "800" }}>Contacter un club</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const LongSlotRow = ({ item }) => {
    const userIds = item.long_user_ids || [];
    return (
      <View style={{ backgroundColor: "white", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 12, marginBottom: 10, minHeight: 120 }}>
        <Text style={{ fontWeight: "800", color: "#111827", marginBottom: 6 }}>{formatDate(item.starts_at)} → {new Date(item.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          {userIds.map((uid) => {
            const p = profilesById[uid];
            return <Avatar key={uid} uri={p?.avatar_url} />;
          })}
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={press("Créer un match", () => onCreateIntervalMatch(item.starts_at, item.ends_at))}
            accessibilityRole="button"
            accessibilityLabel="Créer un match pour ce créneau 1h30"
            style={({ pressed }) => [
              { backgroundColor: "#1a4b97", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
              Platform.OS === "web" ? { cursor: "pointer" } : null,
              pressed ? { opacity: 0.8 } : null,
            ]}
          >
            <Text style={{ color: "white", fontWeight: "800" }}>Créer un match</Text>
          </Pressable>
          <Pressable
            onPress={press("Contacter un club", onContactClub)}
            accessibilityRole="button"
            accessibilityLabel="Contacter le club pour ce créneau 1h30"
            style={({ pressed }) => [
              { backgroundColor: "#111827", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
              Platform.OS === "web" ? { cursor: "pointer" } : null,
              pressed ? { opacity: 0.8 } : null,
            ]}
          >
            <Text style={{ color: "white", fontWeight: "800" }}>Contacter un club</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const HourSlotRow = ({ item }) => {
    const userIds = item.hour_user_ids || [];
    return (
      <View style={{ backgroundColor: "white", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 12, marginBottom: 10, minHeight: 120 }}>
        <Text style={{ fontWeight: "800", color: "#111827", marginBottom: 6 }}>{formatDate(item.starts_at)} → {new Date(item.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          {userIds.map((uid) => {
            const p = profilesById[uid];
            return <Avatar key={uid} uri={p?.avatar_url} />;
          })}
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={press("Créer un match", () => onCreateIntervalMatch(item.starts_at, item.ends_at))}
            accessibilityRole="button"
            accessibilityLabel="Créer un match pour ce créneau 1h"
            style={({ pressed }) => [
              { backgroundColor: "#1a4b97", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
              Platform.OS === "web" ? { cursor: "pointer" } : null,
              pressed ? { opacity: 0.8 } : null,
            ]}
          >
            <Text style={{ color: "white", fontWeight: "800" }}>Créer un match</Text>
          </Pressable>
          <Pressable
            onPress={press("Contacter un club", onContactClub)}
            accessibilityRole="button"
            accessibilityLabel="Contacter le club pour ce créneau 1h"
            style={({ pressed }) => [
              { backgroundColor: "#111827", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
              Platform.OS === "web" ? { cursor: "pointer" } : null,
              pressed ? { opacity: 0.8 } : null,
            ]}
          >
            <Text style={{ color: "white", fontWeight: "800" }}>Contacter un club</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  // Small card renderers for RSVP and confirmed lists
  const MatchCard = ({ m }) => {
    const slot = m.time_slots || {};
    const rsvps = rsvpsByMatch[m.id] || [];
    return (
      <View style={{ backgroundColor: 'white', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, marginBottom: 10 }}>
        <Text style={{ fontWeight: '800', color: '#111827', marginBottom: 6 }}>{formatRange(slot.starts_at, slot.ends_at)}</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {rsvps.map((r) => {
            const p = profilesById[r.user_id];
            return <Avatar key={r.user_id} uri={p?.avatar_url} rsvpStatus={r.status} />;
          })}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={press('Contacter un club', onContactClub)}
            accessibilityRole="button"
            style={({ pressed }) => [
              { backgroundColor: '#111827', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
              Platform.OS === 'web' ? { cursor: 'pointer' } : null,
              pressed ? { opacity: 0.8 } : null,
            ]}
          >
            <Text style={{ color: 'white', fontWeight: '800' }}>Contacter un club</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const MatchCardPending = ({ m }) => {
    const slot = m.time_slots || {};
    const rsvps = rsvpsByMatch[m.id] || [];
    const mine = rsvps.find((r) => r.user_id === meId);
    const isAccepted = ((mine?.status || '').toString().trim().toLowerCase() === 'accepted');

    return (
      <View style={{ backgroundColor: isAccepted ? '#ecfdf5' : 'white', borderWidth: 1, borderColor: isAccepted ? '#10b981' : '#e5e7eb', borderRadius: 10, padding: 12, marginBottom: 10 }}>
        <Text style={{ fontWeight: '800', color: '#111827', marginBottom: 6 }}>{formatRange(slot.starts_at, slot.ends_at)}</Text>

        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {rsvps.map((r) => {
            const p = profilesById[r.user_id];
            return <Avatar key={r.user_id} uri={p?.avatar_url} rsvpStatus={r.status} />;
          })}
        </View>

        {/* Actions */}
        {!isAccepted ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={press('Confirmer ma participation', () => onRsvpAccept(m.id))}
              accessibilityRole="button"
              style={({ pressed }) => [
                { backgroundColor: '#1a4b97', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
                Platform.OS === 'web' ? { cursor: 'pointer' } : null,
                pressed ? { opacity: 0.8 } : null,
              ]}
            >
              <Text style={{ color: 'white', fontWeight: '800' }}>Confirmer ma participation</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Badge + bouton sur la même ligne */}
            <View style={{ backgroundColor: '#d1fae5', borderColor: '#10b981', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 }}>
              <Text style={{ color: '#065f46', fontWeight: '800' }}>Participation confirmée ✅</Text>
            </View>
            <Pressable
              onPress={press('Annuler ma participation', () => onRsvpCancel(m.id))}
              accessibilityRole="button"
              style={({ pressed }) => [
                { backgroundColor: '#dc2626', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
                Platform.OS === 'web' ? { cursor: 'pointer' } : null,
                pressed ? { opacity: 0.8 } : null,
              ]}
            >
              <Text style={{ color: 'white', fontWeight: '800' }}>Annuler ma participation</Text>
            </Pressable>
          </View>
        )}
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
      <View style={{ flex: 1, padding: 16 }}>
        {/* Top tabs */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <Pressable onPress={() => setTab('proposes')} style={[{ flex: 1, borderRadius: 999, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: tab==='proposes'? '#1a4b97':'#d1d5db', backgroundColor: tab==='proposes'? '#eaf2ff':'#fff' }, Platform.OS==='web'? { cursor:'pointer'}:null]}>
            <Text style={{ fontWeight:'800', color: tab==='proposes'? '#1a4b97':'#374151' }}>Matchs proposés</Text>
          </Pressable>
          <Pressable onPress={() => setTab('rsvp')} style={[{ flex: 1, borderRadius: 999, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: tab==='rsvp'? '#1a4b97':'#d1d5db', backgroundColor: tab==='rsvp'? '#eaf2ff':'#fff' }, Platform.OS==='web'? { cursor:'pointer'}:null]}>
            <Text style={{ fontWeight:'800', color: tab==='rsvp'? '#1a4b97':'#374151' }}>Matchs RSVP</Text>
          </Pressable>
          <Pressable onPress={() => setTab('valides')} style={[{ flex: 1, borderRadius: 999, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: tab==='valides'? '#1a4b97':'#d1d5db', backgroundColor: tab==='valides'? '#eaf2ff':'#fff' }, Platform.OS==='web'? { cursor:'pointer'}:null]}>
            <Text style={{ fontWeight:'800', color: tab==='valides'? '#1a4b97':'#374151' }}>Matchs validés</Text>
          </Pressable>
        </View>

        {tab === 'proposes' && (
          <>
            {/* Segmented toggle for 1h30 / 1h (left = 1h30) */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 8 }}>
              <Pressable
                onPress={() => setMode('long')}
                style={{ flex: 1, borderRadius: 999, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: mode === 'long' ? '#1a4b97' : '#d1d5db', backgroundColor: mode === 'long' ? '#eaf2ff' : '#fff' }}
              >
                <Text style={{ fontWeight: '800', color: mode === 'long' ? '#1a4b97' : '#374151' }}>Matchs 1h30</Text>
              </Pressable>
              <Pressable
                onPress={() => setMode('hour')}
                style={{ flex: 1, borderRadius: 999, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: mode === 'hour' ? '#1a4b97' : '#d1d5db', backgroundColor: mode === 'hour' ? '#eaf2ff' : '#fff' }}
              >
                <Text style={{ fontWeight: '800', color: mode === 'hour' ? '#1a4b97' : '#374151' }}>Matchs 1h</Text>
              </Pressable>
            </View>

            {mode === 'long' ? (
              <>
                <Text style={{ fontWeight: '900', fontSize: 16, marginBottom: 8 }}>Matchs 1h30 prêts (4+ sur 3 créneaux)</Text>
                {longSections.length === 0 ? (
                  <Text style={{ color: '#6b7280', marginBottom: 6 }}>Aucun créneau 1h30 prêt.</Text>
                ) : (
                  <SectionList
                    sections={longSections}
                    keyExtractor={(item) => item.key}
                    renderSectionHeader={({ section: { title } }) => (
                      <View style={{ paddingVertical: 6 }}>
                        <Text style={{ color: '#111827', fontWeight: '800' }}>{title}</Text>
                      </View>
                    )}
                    renderItem={({ item }) => <LongSlotRow item={item} />}
                    contentContainerStyle={{ paddingBottom: 16 }}
                  />
                )}
              </>
            ) : (
              <>
                <Text style={{ fontWeight: '900', fontSize: 16, marginBottom: 8 }}>Matchs 1h prêts (4+ sur 2 créneaux)</Text>
                {hourReady.length === 0 ? (
                  <Text style={{ color: '#6b7280', marginBottom: 6 }}>Aucun créneau 1h prêt.</Text>
                ) : (
                  <FlatList
                    data={hourReady}
                    keyExtractor={(x) => x.time_slot_id + '-hour'}
                    renderItem={({ item }) => <HourSlotRow item={item} />}
                    contentContainerStyle={{ paddingBottom: 32 }}
                  />
                )}
              </>
            )}

            {/* Zone 3 joueurs "en feu" */}
            <Text style={{ fontWeight: '900', fontSize: 16, marginTop: 12, marginBottom: 8 }}>Créneaux en feu (3 joueurs)</Text>
            {hot.length === 0 ? (
              <Text style={{ color: '#6b7280' }}>Aucun créneau à 3 joueurs pour l'instant.</Text>
            ) : (
              <FlatList
                data={hot}
                keyExtractor={(x) => x.time_slot_id + '-hot'}
                renderItem={({ item }) => <SlotRow item={item} type="hot" />}
                contentContainerStyle={{ paddingBottom: 24 }}
              />
            )}
          </>
        )}

        {tab === 'rsvp' && (
          <>
            {/* Sub-tabs for 1h30 / 1h under RSVP (left = 1h30) */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <Pressable
                onPress={() => setRsvpMode('long')}
                style={({ pressed }) => [
                  { flex: 1, borderRadius: 999, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: rsvpMode==='long'? '#1a4b97':'#d1d5db', backgroundColor: rsvpMode==='long'? '#eaf2ff':'#fff' },
                  Platform.OS==='web'? { cursor:'pointer'} : null,
                  pressed ? { opacity: 0.9 } : null,
                ]}
              >
                <Text style={{ fontWeight:'800', color: rsvpMode==='long'? '#1a4b97':'#374151' }}>Matchs 1h30</Text>
              </Pressable>
              <Pressable
                onPress={() => setRsvpMode('hour')}
                style={({ pressed }) => [
                  { flex: 1, borderRadius: 999, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: rsvpMode==='hour'? '#1a4b97':'#d1d5db', backgroundColor: rsvpMode==='hour'? '#eaf2ff':'#fff' },
                  Platform.OS==='web'? { cursor:'pointer'} : null,
                  pressed ? { opacity: 0.9 } : null,
                ]}
              >
                <Text style={{ fontWeight:'800', color: rsvpMode==='hour'? '#1a4b97':'#374151' }}>Matchs 1h</Text>
              </Pressable>
            </View>

            {rsvpMode === 'hour' ? (
              pendingHour.length === 0 ? (
                <Text style={{ color: '#6b7280' }}>Aucun match 1h en attente.</Text>
              ) : (
                <FlatList
                  data={pendingHour}
                  keyExtractor={(m) => m.id + '-pHour'}
                  renderItem={({ item }) => <MatchCardPending m={item} />}
                  contentContainerStyle={{ paddingBottom: 24 }}
                />
              )
            ) : (
              pendingLong.length === 0 ? (
                <Text style={{ color: '#6b7280' }}>Aucun match 1h30 en attente.</Text>
              ) : (
                <FlatList
                  data={pendingLong}
                  keyExtractor={(m) => m.id + '-pLong'}
                  renderItem={({ item }) => <MatchCardPending m={item} />}
                  contentContainerStyle={{ paddingBottom: 24 }}
                />
              )
            )}
          </>
        )}

        {tab === 'valides' && (
          <>
            {/* Sub-tabs for 1h30 / 1h under Confirmed (left = 1h30) */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <Pressable
                onPress={() => setConfirmedMode('long')}
                style={({ pressed }) => [
                  { flex: 1, borderRadius: 999, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: confirmedMode==='long'? '#1a4b97':'#d1d5db', backgroundColor: confirmedMode==='long'? '#eaf2ff':'#fff' },
                  Platform.OS==='web'? { cursor:'pointer'} : null,
                  pressed ? { opacity: 0.9 } : null,
                ]}
              >
                <Text style={{ fontWeight:'800', color: confirmedMode==='long'? '#1a4b97':'#374151' }}>Matchs 1h30</Text>
              </Pressable>
              <Pressable
                onPress={() => setConfirmedMode('hour')}
                style={({ pressed }) => [
                  { flex: 1, borderRadius: 999, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: confirmedMode==='hour'? '#1a4b97':'#d1d5db', backgroundColor: confirmedMode==='hour'? '#eaf2ff':'#fff' },
                  Platform.OS==='web'? { cursor:'pointer'} : null,
                  pressed ? { opacity: 0.9 } : null,
                ]}
              >
                <Text style={{ fontWeight:'800', color: confirmedMode==='hour'? '#1a4b97':'#374151' }}>Matchs 1h</Text>
              </Pressable>
            </View>

            {confirmedMode === 'hour' ? (
              confirmedHour.length === 0 ? (
                <Text style={{ color: '#6b7280' }}>Aucun match 1h confirmé.</Text>
              ) : (
                <FlatList
                  data={confirmedHour}
                  keyExtractor={(m) => m.id + '-cHour'}
                  renderItem={({ item }) => <MatchCard m={item} />}
                  contentContainerStyle={{ paddingBottom: 24 }}
                />
              )
            ) : (
              confirmedLong.length === 0 ? (
                <Text style={{ color: '#6b7280' }}>Aucun match 1h30 confirmé.</Text>
              ) : (
                <FlatList
                  data={confirmedLong}
                  keyExtractor={(m) => m.id + '-cLong'}
                  renderItem={({ item }) => <MatchCard m={item} />}
                  contentContainerStyle={{ paddingBottom: 24 }}
                />
              )
            )}
          </>
        )}
      </View>
  );
}