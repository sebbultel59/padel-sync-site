// app/(tabs)/semaine.js
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import dayjs from "dayjs";
import "dayjs/locale/fr";
import isoWeek from "dayjs/plugin/isoWeek";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useActiveGroup } from "../../lib/activeGroup";
import { supabase } from "../../lib/supabase";
import { press, safeAlert } from "../../lib/uiSafe";

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

const BRAND = "#1a4b97";
const BG_PAGE = "#2b5abc"; // fond global
const ORANGE = "#ff8c00";  // accent
const START_HOUR = 8;
const END_HOUR = 22;
const SLOT_MIN = 30;            // créneaux de 30 min
const SLOT_HEIGHT = 40;         // hauteur visuelle d’un créneau
const FONT_HOUR = 14;           // taille du texte dans les cellules

export default function Semaine() {
  // ---- ÉTATS ----
  const [weekStart, setWeekStart] = useState(dayjs().startOf("isoWeek"));
  const [timeSlots, setTimeSlots] = useState([]); // time_slots (starts_at/ends_at/group_id)
  const [slots, setSlots] = useState([]);         // availability (avec status)
  const [matches, setMatches] = useState([]);     // matches liés aux time_slots
  const [loading, setLoading] = useState(false);
  const [meId, setMeId] = useState(null);
  const [persistedGroupId, setPersistedGroupId] = useState(null);

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

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => weekStart.add(i, "day")),
    [weekStart]
  );

  // Génère les heures: 08:00, 08:30, ..., 21:30
  const hoursOfDay = useMemo(() => {
    const out = [];
    for (let h = START_HOUR; h < END_HOUR; h++) {
      out.push({ hour: h, minute: 0 });
      out.push({ hour: h, minute: 30 });
    }
    return out;
  }, []);

  // Fetch semaine
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, groupId]);

  async function fetchData() {
    try {
      setLoading(true);
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

      // 2) availability
      let avQ = supabase
        .from("availability")
        .select("*")
        .gte("start", start)
        .lt("start", end);
      avQ = groupId ? avQ.eq("group_id", groupId) : avQ.is("group_id", null);
      const { data: av, error: eAv } = await avQ;
      if (eAv) throw eAv;

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

      setTimeSlots(ts ?? []);
      setSlots(av ?? []);
      setMatches(mData ?? []);
    } catch (e) {
      console.warn(e);
      safeAlert("Erreur", e?.message ?? String(e));
    } finally {
      setLoading(false);
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
      try { Haptics.selectionAsync(); } catch {}
      // Optionnel : recharger les données si tu affiches les RSVPs sur cet écran
      // await fetchData();
    } catch (e) {
      safeAlert("Erreur RSVP", e?.message ?? String(e));
    }
  }

  const keySlot = (d, hour, minute) =>
    dayjs(d).hour(hour).minute(minute).second(0).millisecond(0).toISOString();

  // Map disponibilités: clé = start ISO, valeur = [{ user_id, status }]
  const mapDispos = useMemo(() => {
    const map = new Map();
    (slots || []).forEach((s) => {
      const k = dayjs(s.start).toISOString();
      const arr = map.get(k) || [];
      arr.push({ user_id: s.user_id, status: s.status || "available" });
      map.set(k, arr);
    });
    return map;
  }, [slots]);

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

  // Cycle: available -> absent -> available
  function nextStatus(current) {
    if (current === "available") return "absent";
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

        const { error } = await supabase.from("availability").insert(optimistic);
        if (error) {
          await fetchData();
          throw error;
        }
      } else {
        const newStatus = nextStatus(mine.status || "available");
        setSlots((prev) =>
          prev.map((s) =>
            s.user_id === mine.user_id &&
            s.group_id === gid &&
            dayjs(s.start).toISOString() === startIso
              ? { ...s, status: newStatus }
              : s
          )
        );
        try { Haptics.selectionAsync(); } catch {}

        const { error } = await supabase
          .from("availability")
          .update({ status: newStatus })
          .eq("user_id", user.id)
          .eq("group_id", gid)
          .eq("start", startIso)
          .eq("end", endIso);
        if (error) {
          await fetchData();
          throw error;
        }
      }

      setTimeout(() => { fetchData(); }, 0);
    } catch (e) {
      safeAlert("Erreur", e?.message ?? String(e));
    }
  }

  function DayColumn({ day }) {
    const isToday = day.isSame(dayjs(), "day");

    return (
      <View style={{ width: 128, paddingHorizontal: 6 }}>
        {/* Titre du jour */}
        <View
          style={{
            alignItems: "center",
            paddingVertical: 6,
            marginBottom: 4,
            borderRadius: 10,
            backgroundColor: isToday ? ORANGE : "#ffa94d",
            borderWidth: isToday ? 2 : 0,
            borderColor: isToday ? "#ffffff" : "transparent",
          }}
        >
          <Text style={{ fontWeight: "800", color: "#0b2240", fontSize: 16 }}>
            {day.format("dd").toUpperCase()} {day.format("D")}
          </Text>
        </View>

        {/* Corps de la colonne */}
        <View
          style={{
            backgroundColor: isToday ? "#fff" : "#f7f9fd",
            borderRadius: 14,
            borderWidth: isToday ? 2 : 0,
            borderColor: isToday ? ORANGE : "transparent",
            overflow: "hidden",
          }}
        >
          {hoursOfDay.map(({ hour, minute }) => {
            const startIso = keySlot(day, hour, minute);
            const people = mapDispos.get(startIso) || [];
            const availableCount = people.filter((p) => p.status === "available").length;
            const match = mapMatches.get(startIso);

            // Couleurs cellule selon MON statut (sauf si match présent)
            const myStatus = myStatusByStart.get(startIso);
            let cellBg = "#f7f9fd";   // default light grey background
            let cellBorder = "#1f2937"; // default grey border
            let textColor = "#0b2240"; // default dark text

            if (match) {
              cellBg = match.status === "confirmed" ? "#ecfdf5" : "#fee2e2";
              cellBorder = match.status === "confirmed" ? "#10b981" : "#fca5a5";
            } else {
              if (myStatus === "absent") {
                cellBg = "#cd0a0e";
                cellBorder = "#cd0a0e";
                textColor = "#d1d5db";
              } else if (myStatus === "available") {
                cellBg = "#2fc249";
                cellBorder = "#2fc249";
                textColor = "#0b2240";
              }
            }

            // Pastille participants (réactivité gérée via optimistic setSlots)
            let badgeBg = "#e5e7eb";
            let badgeColor = "#0f172a";
            if (availableCount === 0) {
              badgeBg = "#e5e7eb";   // grey background for zero count
              badgeColor = "#0f172a"; // dark text
            } else if (availableCount === 1 || availableCount === 2) {
              badgeBg = "#ef4444";   // rouge plus vif
              badgeColor = "#ffffff"; // texte blanc pour contraste
            } else if (availableCount === 3) {
              badgeBg = "#fcd34d";   // orange
              badgeColor = "#78350f"; // orange foncé
            } else if (availableCount >= 4) {
              badgeBg = "#15803d";   // vert foncé
              badgeColor = "#ffffff"; // texte blanc
            }

            return (
              <Pressable
                key={startIso}
                onPress={press(`toggle-${startIso}`, () => toggleMyAvailability(startIso))}
                onLongPress={() => {
                  if (match) {
                    safeAlert(
                      "Match",
                      match.status === "confirmed" ? "Confirmé ✅" : "Proposé ⏳"
                    );
                  } else {
                    const absent = people.filter((p) => p.status === "absent").length;
                    safeAlert(
                      `${String(hour).padStart(2, "0")}h${minute ? "30" : "00"}`,
                      `Dispo: ${availableCount} • Absent: ${absent}`
                    );
                  }
                }}
                style={{
                  height: SLOT_HEIGHT,
                  paddingHorizontal: 10,
                  borderBottomWidth: 1,
                  borderColor: cellBorder,
                  justifyContent: "center",
                  backgroundColor: cellBg,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: FONT_HOUR, color: textColor, fontWeight: "700" }}>
                    {String(hour).padStart(2, "0")}h{minute ? "30" : "00"}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {availableCount > 0 ? (
                      <View
                        style={{
                          width: 28,
                          height: 28,
                          alignItems: "center",
                          justifyContent: "center",
                          position: "relative",
                        }}
                      >
                        <Ionicons name="flame" size={28} color={badgeBg} />
                        <Text
                          style={{
                            position: "absolute",
                            color: "#ffffff",
                            fontSize: 12,
                            fontWeight: "900",
                            lineHeight: 12,
                            textShadowColor: "rgba(0,0,0,0.35)",
                            textShadowOffset: { width: 0, height: 1 },
                            textShadowRadius: 1,
                          }}
                        >
                          {availableCount}
                        </Text>
                      </View>
                    ) : (
                      <View
                        style={{
                          backgroundColor: badgeBg,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 999,
                        }}
                      >
                        <Text style={{ color: badgeColor, fontWeight: "800" }}>{availableCount}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG_PAGE }}>
      {/* Header semaine */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 12,
          backgroundColor: "#fff",
          borderBottomWidth: 1,
          borderColor: "#e5e7eb",
        }}
      >
        <Pressable
          onPress={press("week-prev", () => setWeekStart((w) => w.subtract(1, "week")))}
          style={Platform.OS === "web" && { cursor: "pointer" }}
        >
          <Text style={{ color: BRAND, fontWeight: "700" }}>‹ Semaine</Text>
        </Pressable>
        <Text style={{ fontWeight: "800", color: "#0b2240" }}>
          {weekStart.format("DD MMM")} – {weekStart.add(6, "day").format("DD MMM")}
        </Text>
        <Pressable
          onPress={press("week-today", () => setWeekStart(dayjs().startOf("isoWeek")))}
          style={Platform.OS === "web" && { cursor: "pointer" }}
        >
          <Text style={{ color: ORANGE, fontWeight: "700" }}>Aujourd’hui</Text>
        </Pressable>
      </View>

      {/* Grille scrollable (vertical + horizontal) */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 10 }} showsVerticalScrollIndicator={false}>
        <FlatList
          data={days}
          keyExtractor={(d) => d.format("YYYY-MM-DD")}
          horizontal
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => <DayColumn day={item} />}
          contentContainerStyle={{ paddingHorizontal: 12, gap: 10 }}
        />
      </ScrollView>
    </View>
  );
}