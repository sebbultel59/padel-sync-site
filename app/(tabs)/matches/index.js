// app/(tabs)/matches/index.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useActiveGroup } from "../../../lib/activeGroup";
import { supabase } from "../../../lib/supabase";

const BRAND = "#1a4b97";
const STORAGE_KEY_SORT = "padelsync.sortMode";          // "time" | "hot"
const STORAGE_KEY_SHOWALL = "padelsync.matches.showAll"; // "true" | "false"

const isUuid = (v) =>
  typeof v === "string" &&
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(v);

function formatRangeFR(startISO, endISO) {
  if (!startISO) return "—";
  const s = new Date(startISO);
  const e = endISO ? new Date(endISO) : null;
  const d = s.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "short" });
  const sh = s.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false });
  const eh = e ? e.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
  return `${d} ${sh}${eh ? "–" + eh : ""}`;
}

function Avatar({ url, fallback, size = 28 }) {
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#eef2f7" }}
      />
    );
  }
  const letter = (fallback || "?").trim().charAt(0).toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#eaf2ff",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: BRAND,
      }}
    >
      <Text style={{ color: BRAND, fontWeight: "800", fontSize: 12 }}>{letter}</Text>
    </View>
  );
}

export default function MatchesIndex() {
  const { activeGroup } = useActiveGroup();
  const groupId = activeGroup?.id ?? null;

  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState([]); // matches mappés
  const [savingMap, setSavingMap] = useState({});
  const [showAll, setShowAll] = useState(false); // voir aussi passés/non datés
  const [sortMode, setSortMode] = useState("time"); // "time" | "hot"

  // Préférences (tri + showAll)
  useEffect(() => {
    (async () => {
      try {
        const [vSort, vShow] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_SORT),
          AsyncStorage.getItem(STORAGE_KEY_SHOWALL),
        ]);
        if (vSort === "hot" || vSort === "time") setSortMode(vSort);
        if (vShow === "true" || vShow === "false") setShowAll(vShow === "true");
      } catch {}
    })();
  }, []);
  useEffect(() => {
    (async () => {
      try {
        await AsyncStorage.setItem(STORAGE_KEY_SORT, sortMode);
      } catch {}
    })();
  }, [sortMode]);
  useEffect(() => {
    (async () => {
      try {
        await AsyncStorage.setItem(STORAGE_KEY_SHOWALL, String(showAll));
      } catch {}
    })();
  }, [showAll]);

  // User courant
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (mounted) setUserId(u?.user?.id ?? null);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      if (!userId || !groupId) return;
      setLoading(true);

      // 1) Matches du groupe (open + confirmed)
      const { data: matches, error: eM } = await supabase
        .from("matches")
        .select("id, status, time_slot_id, created_at")
        .eq("group_id", groupId)
        .in("status", ["open", "confirmed"])
        .order("created_at", { ascending: false })
        .limit(200);
      if (eM) throw eM;

      if (!matches?.length) {
        setRows([]);
        return;
      }

      const slotIds = [...new Set(matches.map((m) => m.time_slot_id).filter(Boolean))];

      // 2) Slots
      let slotById = {};
      if (slotIds.length) {
        const { data: slots, error: eS } = await supabase
          .from("time_slots")
          .select("id, starts_at, ends_at")
          .in("id", slotIds);
        if (eS) throw eS;
        slotById = Object.fromEntries((slots ?? []).map((s) => [s.id, s]));
      }

      const matchIds = matches.map((m) => m.id);

      // 3) RSVPs
      const { data: rsvps, error: eR } = await supabase
        .from("match_rsvps")
        .select("match_id, user_id, status")
        .in("match_id", matchIds);
      if (eR) throw eR;

      const rsvpsByMatch = new Map();
      for (const r of rsvps ?? []) {
        if (!rsvpsByMatch.has(r.match_id)) rsvpsByMatch.set(r.match_id, []);
        rsvpsByMatch.get(r.match_id).push(r);
      }

      // 4) DISPO (sur slots des matchs OPEN) — limité au groupId
      const matchBySlot = Object.fromEntries(matches.map((m) => [m.time_slot_id, m.id]));
      const openSlotIds = matches
        .filter((m) => m.status === "open")
        .map((m) => m.time_slot_id)
        .filter(Boolean);

      let dispoByMatch = {}; // mid -> Set(user_id)
      if (openSlotIds.length) {
        const { data: avs, error: eA } = await supabase
          .from("availabilities")
          .select("user_id, time_slot_id, status")
          .eq("group_id", groupId)
          .in("time_slot_id", openSlotIds)
          .eq("status", "dispo");
        if (eA) throw eA;

        for (const a of avs ?? []) {
          const mid = matchBySlot[a.time_slot_id];
          if (!mid) continue;
          if (!dispoByMatch[mid]) dispoByMatch[mid] = new Set();
          dispoByMatch[mid].add(a.user_id);
        }
      }

      // 5) Profils = union (YES ∪ DISPO)
      const yesUserIds = [...new Set((rsvps ?? []).filter((r) => r.status === "yes").map((r) => r.user_id))];
      const dispoUserIds = [...new Set(Object.values(dispoByMatch).flatMap((set) => [...set]))];
      const allUserIds = [...new Set([...yesUserIds, ...dispoUserIds])];

      let profById = {};
      if (allUserIds.length) {
        const { data: profs, error: eP } = await supabase
          .from("profiles")
          .select("id, email, display_name, name, avatar_url")
          .in("id", allUserIds);
        if (eP) throw eP;
        profById = Object.fromEntries((profs ?? []).map((p) => [p.id, p]));
      }

      // 6) Mapping UI (+ dispoCountAll)
      const mapped = (matches ?? []).map((m) => {
        const slot = m.time_slot_id ? slotById[m.time_slot_id] : null;
        const rlist = rsvpsByMatch.get(m.id) ?? [];
        const mine = rlist.find((r) => r.user_id === userId)?.status ?? null;

        const yesSet = new Set(rlist.filter((r) => r.status === "yes").map((r) => r.user_id));
        const dispoSetAll = new Set([...(dispoByMatch[m.id] ?? new Set())]);
        const dispoCountAll = dispoSetAll.size;
        const dispoSetDisplay = new Set([...dispoSetAll].filter((uid) => !yesSet.has(uid)));

        const yesList = [...yesSet].map((uid) => {
          const p = profById[uid];
          const name = p?.display_name || p?.name || p?.email || "Joueur";
          return { id: uid, name, avatar_url: p?.avatar_url ?? null };
        });

        const dispoList = [...dispoSetDisplay].map((uid) => {
          const p = profById[uid];
          const name = p?.display_name || p?.name || p?.email || "Joueur";
          return { id: uid, name, avatar_url: p?.avatar_url ?? null };
        });

        return {
          id: m.id,
          status: m.status,
          starts_at: slot?.starts_at ?? null,
          ends_at: slot?.ends_at ?? null,
          myStatus: mine,
          yesProfiles: yesList,
          dispoProfiles: dispoList,
          dispoCountAll,
        };
      });

      setRows(mapped);
    } catch (e) {
      Alert.alert("Erreur", e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [userId, groupId]);

  useEffect(() => {
    setRows([]); // reset visuel lors du switch de groupe
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  // Séparation à venir vs autres (marge -1h)
  const { upcoming, others } = useMemo(() => {
    const now = Date.now();
    const marginMs = 60 * 60 * 1000;
    const up = [];
    const ot = [];
    for (const r of rows) {
      if (!r.starts_at) {
        ot.push(r);
        continue;
      }
      const startMs = new Date(r.starts_at).getTime();
      if (startMs >= now - marginMs) up.push(r);
      else ot.push(r);
    }
    return { upcoming: up, others: ot };
  }, [rows]);

  // Si pas d’à-venir → bascule auto sur "Voir tout" (et mémorise)
  useEffect(() => {
    if (!loading && upcoming.length === 0 && others.length > 0) {
      setShowAll(true);
    }
  }, [loading, upcoming.length, others.length]);

  // Tri final
  const sortedList = useMemo(() => {
    const base = showAll ? [...others, ...upcoming] : [...upcoming];

    if (sortMode === "hot") {
      return base.sort((a, b) => {
        const aHotScore = a.status === "open" ? 1 : 0;
        const bHotScore = b.status === "open" ? 1 : 0;
        if (aHotScore !== bHotScore) return bHotScore - aHotScore;
        if ((a.dispoCountAll || 0) !== (b.dispoCountAll || 0))
          return (b.dispoCountAll || 0) - (a.dispoCountAll || 0);
        return (a.starts_at || "").localeCompare(b.starts_at || "");
      });
    }

    return base.sort((a, b) => (a.starts_at || "").localeCompare(b.starts_at || ""));
  }, [showAll, sortMode, upcoming, others]);

  const onRsvp = useCallback(
    async (matchId, status) => {
      if (!userId || !isUuid(matchId)) return;
      try {
        setSavingMap((prev) => ({ ...prev, [matchId]: status }));
        setRows((prev) => prev.map((r) => (r.id === matchId ? { ...r, myStatus: status } : r)));

        const { error } = await supabase
          .from("match_rsvps")
          .upsert({ match_id: matchId, user_id: userId, status }, { onConflict: "match_id,user_id" });
        if (error) throw error;

        await load();
      } catch (e) {
        Alert.alert("Erreur RSVP", e?.message ?? String(e));
      } finally {
        setSavingMap((prev) => {
          const c = { ...prev };
          delete c[matchId];
          return c;
        });
      }
    },
    [userId, load]
  );

  if (!groupId) {
    return (
      <View style={s.center}>
        <Text style={{ color: "#6b7280" }}>Sélectionne un groupe pour voir les matchs.</Text>
      </View>
    );
  }

  if (loading) return <View style={s.center}><ActivityIndicator /></View>;

  return (
    <ScrollView
      contentContainerStyle={{ padding: 12, gap: 12 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Barre d’actions : vue + tri */}
      <View style={[s.card, { gap: 10 }]}>
        {/* Toggle vue */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: "#111827", fontWeight: "700" }}>
            {showAll ? "Tous les matchs" : "Matchs à venir"}
          </Text>
          <Pressable onPress={() => setShowAll((v) => !v)} style={[s.btnMini, { backgroundColor: "#f3f4f6" }]}>
            <Text style={{ color: "#111827", fontWeight: "700" }}>
              {showAll ? "Voir à venir" : "Voir tout"}
            </Text>
          </Pressable>
        </View>

        {/* Tri (segmenté) */}
        <View style={s.segment}>
          <Pressable
            onPress={() => setSortMode("time")}
            style={[s.segmentBtn, sortMode === "time" && s.segmentBtnActive]}
          >
            <Text style={[s.segmentTxt, sortMode === "time" && s.segmentTxtActive]}>Par date</Text>
          </Pressable>
          <Pressable
            onPress={() => setSortMode("hot")}
            style={[s.segmentBtn, sortMode === "hot" && s.segmentBtnActive]}
          >
            <Text style={[s.segmentTxt, sortMode === "hot" && s.segmentTxtActive]}>Par 🔥 dispo</Text>
          </Pressable>
        </View>
      </View>

      {sortedList.length === 0 ? (
        <View style={s.card}>
          <Text style={{ color: "#6b7280" }}>Aucun match à afficher.</Text>
        </View>
      ) : (
        sortedList.map((item) => {
          const hot = item.status === "open" && item.dispoCountAll >= 3;
          return (
            <View key={item.id} style={s.card}>
              {/* ENTÊTE → ouvre le détail */}
              <Pressable onPress={() => router.push(`/matches/${item.id}`)} style={s.headerRow}>
                <View style={{ flexShrink: 1, paddingRight: 8 }}>
                  <Text style={s.when}>{formatRangeFR(item.starts_at, item.ends_at)}</Text>
                  {/* Badge dispo (🔥 si >=3, sinon neutre) */}
                  <View style={{ marginTop: 6, flexDirection: "row", gap: 6, alignItems: "center" }}>
                    <Text style={[s.badge, hot ? s.badgeHot : s.badgeNeutral]}>
                      {hot ? `🔥 ${item.dispoCountAll} dispo` : `${item.dispoCountAll ?? 0} dispo`}
                    </Text>
                  </View>
                </View>

                <Text style={[s.badge, item.status === "confirmed" ? s.badgeOk : s.badgeOpen]}>
                  {item.status === "confirmed" ? "Confirmé" : "Ouvert"}
                </Text>
              </Pressable>

              {/* YES avatars */}
              {item.yesProfiles?.length ? (
                <View style={[s.row, { marginTop: 10 }]}>
                  {item.yesProfiles.slice(0, 4).map((p) => (
                    <Avatar key={p.id} url={p.avatar_url} fallback={p.name} />
                  ))}
                  {item.yesProfiles.length > 4 ? (
                    <Text style={{ marginLeft: 6, color: "#6b7280" }}>+{item.yesProfiles.length - 4}</Text>
                  ) : null}
                </View>
              ) : (
                <Text style={{ color: "#9ca3af", marginTop: 8 }}>Aucun joueur confirmé pour l’instant.</Text>
              )}

              {/* DISPO avatars (uniquement quand match OPEN) */}
              {item.status === "open" && item.dispoProfiles?.length ? (
                <View style={[s.row, { marginTop: 8 }]}>
                  {item.dispoProfiles.slice(0, 6).map((p) => (
                    <Avatar key={p.id} url={p.avatar_url} fallback={p.name} />
                  ))}
                  {item.dispoProfiles.length > 6 ? (
                    <Text style={{ marginLeft: 6, color: "#6b7280" }}>+{item.dispoProfiles.length - 6}</Text>
                  ) : null}
                </View>
              ) : null}

              {/* Boutons RSVP */}
              <View style={[s.btnRow, { marginTop: 12 }]}>
                <Pressable
                  onPress={() => onRsvp(item.id, "yes")}
                  style={[s.btn, { backgroundColor: "#0a7a31" }, savingMap[item.id] === "yes" && { opacity: 0.6 }]}
                  disabled={!!savingMap[item.id]}
                >
                  <Text style={s.btnTxt}>Je viens</Text>
                </Pressable>
                <Pressable
                  onPress={() => onRsvp(item.id, "maybe")}
                  style={[s.btn, { backgroundColor: BRAND }, savingMap[item.id] === "maybe" && { opacity: 0.6 }]}
                  disabled={!!savingMap[item.id]}
                >
                  <Text style={s.btnTxt}>Peut-être</Text>
                </Pressable>
                <Pressable
                  onPress={() => onRsvp(item.id, "no")}
                  style={[s.btn, { backgroundColor: "#9ca3af" }, savingMap[item.id] === "no" && { opacity: 0.6 }]}
                  disabled={!!savingMap[item.id]}
                >
                  <Text style={s.btnTxt}>Non</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: "white", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 12 },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  when: { fontWeight: "800", color: BRAND },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "700",
    overflow: "hidden",
  },
  badgeOk: { backgroundColor: "#e8fff0", color: "#0a7a31" },
  badgeOpen: { backgroundColor: "#fff6e6", color: "#935c00" },
  badgeHot: { backgroundColor: "#FFE8D9", color: "#9a3412" }, // 🔥 3+ dispo
  badgeNeutral: { backgroundColor: "#eef2f7", color: "#374151" },

  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  btnRow: { flexDirection: "row", gap: 8 },

  btn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  btnTxt: { color: "white", fontWeight: "800" },

  btnMini: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10 },

  segment: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    padding: 4,
    gap: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentBtn: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 8 },
  segmentBtnActive: { backgroundColor: "white", borderWidth: 1, borderColor: "#e5e7eb" },
  segmentTxt: { fontWeight: "700", color: "#6b7280" },
  segmentTxtActive: { color: "#111827" },
});