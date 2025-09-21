// app/(tabs)/semaine.js
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useActiveGroup } from "../../lib/activeGroup";
import { supabase } from "../../lib/supabase";

const BRAND = "#1a4b97";
const BG = "#f7f8fb";
const BORDER = "#e5e7eb";

// Créneaux 9:00 → 21:00 par pas de 90min
const SLOT_MIN = 9 * 60;
const SLOT_MAX = 21 * 60;
const STEP = 90;

// padding horizontal du ScrollView (doit matcher contentContainerStyle.padding)
const GRID_PAD = 10;

// Détection gesture
const DRAG_START_DY = 6; // px: seuil pour considérer que ça “glisse”

const fmt2 = (n) => (n < 10 ? "0" + n : "" + n);
const labelHM = (h, m) => `${fmt2(h)}:${fmt2(m)}`;
const toLocalDayISO = (d) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();

function monday(d0 = new Date()) {
  const d = new Date(d0);
  d.setHours(0, 0, 0, 0);
  const wd = d.getDay(); // 0=dim..6=sam
  const diff = (wd === 0 ? -6 : 1) - wd;
  d.setDate(d.getDate() + diff);
  return d;
}
function addMinutes(date, m) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() + m);
  return d;
}
function frDayShort(d) {
  return d.toLocaleDateString("fr-FR", { weekday: "short" });
}
function frDayLong(d) {
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "short",
  });
}

const localKeyForSlot = (iso) => {
  const d = new Date(iso);
  const dayISO = toLocalDayISO(d);
  const key = `${fmt2(d.getHours())}:${fmt2(d.getMinutes())}`;
  return `${dayISO}|${key}`;
};

function parseHM(label) {
  const [h, m] = String(label).split(":").map((n) => parseInt(n, 10));
  return { h: isFinite(h) ? h : 0, m: isFinite(m) ? m : 0 };
}
function makeLocalDateFromDayISO(dayISO, h, m) {
  const d = new Date(dayISO);
  d.setHours(h, m, 0, 0);
  return d;
}

export default function Semaine() {
  const { activeGroup } = useActiveGroup();
  const groupId = activeGroup?.id ?? null;

  const [weekStart, setWeekStart] = useState(monday());
  const [userId, setUserId] = useState(null);

  const [loading, setLoading] = useState(true);
  const [slots, setSlots] = useState([]); // [{id, starts_at, ends_at}]
  const [statusById, setStatusById] = useState({}); // slot_id -> 'dispo' | 'flex' | 'indispo'

  // --- Drag paint state ---
  const [painting, setPainting] = useState(false);
  const [paintStatus, setPaintStatus] = useState(null); // 'dispo' | 'flex' | 'indispo'
  const paintedRef = useRef(new Set()); // évite de repeindre 100x la même case
  const paintColIndexRef = useRef(null); // colonne verrouillée pendant le drag
  const startRowRef = useRef(null); // ligne de départ
  const lastRowRef = useRef(-1); // dernière ligne peinte

  // press-in tracking (pour démarrer la peinture sans long-press)
  const pressTrackRef = useRef({
    active: false,
    startY: 0,
    colIndex: null,
    rowIndex: null,
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (mounted) setUserId(data?.user?.id ?? null);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const [startISO, endISO] = useMemo(() => {
    const a = new Date(weekStart);
    const b = addMinutes(a, 7 * 24 * 60);
    return [a.toISOString(), b.toISOString()];
  }, [weekStart]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!groupId || !userId) {
        setSlots([]);
        setStatusById({});
        setLoading(false);
        return;
      }
      setLoading(true);

      // 1) Slots semaine
      const { data: ts, error: e1 } = await supabase
        .from("time_slots")
        .select("id, starts_at, ends_at")
        .eq("group_id", groupId)
        .gte("starts_at", startISO)
        .lt("starts_at", endISO)
        .order("starts_at", { ascending: true });
      if (e1) {
        Alert.alert("Erreur slots", e1.message);
        setLoading(false);
        return;
      }

      // 2) Filtre heures (9:00..21:00-STEP)
      const filtered = (ts ?? []).filter((t) => {
        const d = new Date(t.starts_at);
        const mins = d.getHours() * 60 + d.getMinutes();
        return mins >= SLOT_MIN && mins <= SLOT_MAX - STEP;
      });

      // 3) Mes dispos
      const { data: avs, error: e2 } = await supabase
        .from("availabilities")
        .select("time_slot_id, status")
        .eq("group_id", groupId)
        .eq("user_id", userId)
        .in(
          "time_slot_id",
          filtered.map((t) => t.id)
        );
      if (e2) {
        Alert.alert("Erreur dispos", e2.message);
        setLoading(false);
        return;
      }

      const map = {};
      for (const a of avs ?? []) map[a.time_slot_id] = a.status;

      if (mounted) {
        setSlots(filtered);
        setStatusById(map);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [groupId, userId, startISO, endISO]);

  // Index pour retrouver un slot à partir d’un (jourISO|HH:MM)
  const slotByLocalKey = useMemo(() => {
    const map = new Map();
    for (const s of slots ?? []) map.set(localKeyForSlot(s.starts_at), s);
    return map;
  }, [slots]);

  // Crée un time_slot s'il n'existe pas encore pour (jour, heure)
  const ensureSlotFor = useCallback(
    async (dayISO, label) => {
      if (!groupId) return null;
      const { h, m } = parseHM(label);
      const start = makeLocalDateFromDayISO(dayISO, h, m);
      const end = addMinutes(start, STEP);

      const { data, error } = await supabase
        .from("time_slots")
        .insert({
          group_id: groupId,
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
        })
        .select("id, starts_at, ends_at")
        .single();

      if (error) {
        if (String(error.code) === "23505") {
          // Déjà existant -> on le retrouve
          const { data: ex } = await supabase
            .from("time_slots")
            .select("id, starts_at, ends_at")
            .eq("group_id", groupId)
            .eq("starts_at", start.toISOString())
            .maybeSingle();
          return ex ?? null;
        }
        Alert.alert("Erreur slot", error.message);
        return null;
      }

      return data;
    },
    [groupId]
  );

  // Assure que tous les créneaux (9h→21h, pas 90min) existent pour la semaine affichée.
  const dayRefs = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 7; i++) {
      const d = addMinutes(weekStart, i * 24 * 60);
      arr.push({ date: d, dayISO: toLocalDayISO(d) });
    }
    return arr;
  }, [weekStart]);

  const timeRows = useMemo(() => {
    const out = [];
    for (let m = SLOT_MIN; m <= SLOT_MAX - STEP; m += STEP) {
      const h = Math.floor(m / 60);
      const mm = m % 60;
      out.push({ m, label: labelHM(h, mm) });
    }
    return out;
  }, []);

  const ensureAllWeekSlots = useCallback(async () => {
    const existing = Array.isArray(slots) ? [...slots] : [];
    const add = [];

    for (const d of dayRefs) {
      for (const row of timeRows) {
        const key = `${d.dayISO}|${row.label}`;
        let slot = slotByLocalKey.get(key);
        if (!slot) {
          const created = await ensureSlotFor(d.dayISO, row.label);
          if (created) add.push(created);
        }
      }
    }

    if (add.length) {
      setSlots((prev) => {
        const byId = new Set((prev ?? []).map((s) => s.id));
        const toAdd = add.filter((s) => !byId.has(s.id));
        return [...(prev ?? []), ...toAdd];
      });
    }

    return [...existing, ...add];
  }, [slots, dayRefs, timeRows, slotByLocalKey, ensureSlotFor]);

  // Mutations
  const upsertOne = useCallback(
    async (slotId, next) => {
      if (!userId || !groupId) return;
      const { error } = await supabase.from("availabilities").upsert(
        { user_id: userId, group_id: groupId, time_slot_id: slotId, status: next },
        { onConflict: "user_id,group_id,time_slot_id" }
      );
      if (error) Alert.alert("Erreur", error.message);
    },
    [userId, groupId]
  );

  const setOne = useCallback(
    async (slot, next) => {
      if (!slot) return;
      setStatusById((prev) => ({ ...prev, [slot.id]: next }));
      await upsertOne(slot.id, next);
    },
    [upsertOne]
  );

  const toggleOne = useCallback(
    async (slot) => {
      const cur = statusById[slot.id] ?? "indispo";
      const next = cur === "indispo" ? "dispo" : cur === "dispo" ? "flex" : "indispo";
      await setOne(slot, next);
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
    },
    [statusById, setOne]
  );

  const resetOne = useCallback(async (slot) => {
    await setOne(slot, "indispo");
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
  }, [setOne]);

  // ---- Paint helpers ----
  const computeNextFromCurrent = useCallback((cur) => {
    return cur === "indispo" ? "dispo" : cur === "dispo" ? "flex" : "indispo";
  }, []);

  const beginPaint = useCallback(
    async (colIndex, rowIndex) => {
      const d = dayRefs[colIndex];
      const r = timeRows[rowIndex];
      if (!d || !r) return;

      const key = `${d.dayISO}|${r.label}`;
      let slot = slotByLocalKey.get(key) ?? null;
      if (!slot) {
        const created = await ensureSlotFor(d.dayISO, r.label);
        if (!created) return;
        slot = created;
        setSlots((prev) => (prev.find((x) => x.id === created.id) ? prev : [...prev, created]));
      }

      const cur = statusById[slot.id] ?? "indispo";
      const next = computeNextFromCurrent(cur);

      setPaintStatus(next);
      setPainting(true);
      paintColIndexRef.current = colIndex;
      startRowRef.current = rowIndex;
      paintedRef.current = new Set([slot.id]);
      lastRowRef.current = rowIndex;

      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
      await setOne(slot, next);
    },
    [dayRefs, timeRows, slotByLocalKey, statusById, ensureSlotFor, setOne, setSlots, computeNextFromCurrent]
  );

  // Mouvement continu depuis la cellule d’origine (sans lever le doigt)
  const handleMoveFromCell = useCallback(
    (e, colIndex, startRowIndex) => {
      if (!painting || !paintStatus) return;
      // on reste dans la même colonne; calcule combien de lignes on a parcouru
      const dy = e.nativeEvent.locationY; // relatif à la cellule d’origine; peut dépasser sa hauteur
      const deltaRows = Math.round((dy - CELL_H / 2) / (CELL_H + 6));
      let targetRow = startRowIndex + deltaRows;
      if (targetRow < 0) targetRow = 0;
      if (targetRow > timeRows.length - 1) targetRow = timeRows.length - 1;
      if (lastRowRef.current === targetRow) return;

      lastRowRef.current = targetRow;

      const d = dayRefs[colIndex];
      const r = timeRows[targetRow];
      const dayISO = d?.dayISO;
      const label = r?.label;
      if (!dayISO || !label) return;

      (async () => {
        const key = `${dayISO}|${label}`;
        let slot = slotByLocalKey.get(key) ?? null;
        if (!slot) {
          const created = await ensureSlotFor(dayISO, label);
          if (!created) return;
          slot = created;
          setSlots((prev) =>
            prev.find((s) => s.id === created.id) ? prev : [...prev, created]
          );
        }
        if (paintedRef.current.has(slot.id)) return;
        paintedRef.current.add(slot.id);
        await setOne(slot, paintStatus);
        try { Haptics.selectionAsync(); } catch {}
      })();
    },
    [painting, paintStatus, dayRefs, timeRows, slotByLocalKey, ensureSlotFor, setOne, setSlots]
  );

  const endPaint = useCallback(() => {
    if (!painting) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
    setPainting(false);
    setPaintStatus(null);
    paintColIndexRef.current = null;
    startRowRef.current = null;
    paintedRef.current = new Set();
    lastRowRef.current = -1;
    pressTrackRef.current.active = false;
  }, [painting]);

  const colorForStatus = (s) =>
    s === "dispo"
      ? ["#0a7a31", "#0a7a31", "white"] // vert foncé
      : s === "flex"
      ? ["#f59e0b", "#f59e0b", "white"] // orange
      : ["#ef4444", "#ef4444", "white"]; // rouge

  const labelForStatus = (s) =>
    s === "dispo" ? "Dispo" : s === "flex" ? "Flex" : "Indispo";

  if (!groupId)
    return (
      <View style={styles.center}>
        <Text style={{ color: "#6b7280" }}>
          Sélectionne un groupe pour voir les créneaux.
        </Text>
      </View>
    );
  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );

  return (
    <View style={styles.root}>
      {/* Entête semaine */}
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
            setWeekStart(addMinutes(weekStart, -7 * 24 * 60));
          }}
          style={styles.navBtn}
        >
          <Text style={styles.navTxt}>◀</Text>
        </Pressable>
        <Text style={styles.headerTitle}>
          {weekStart.toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "short",
          })}{" "}
          –{" "}
          {addMinutes(weekStart, 6 * 24 * 60).toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </Text>
        <Pressable
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
            setWeekStart(addMinutes(weekStart, 7 * 24 * 60));
          }}
          style={styles.navBtn}
        >
          <Text style={styles.navTxt}>▶</Text>
        </Pressable>
      </View>

      {/* Actions bulk */}
      <View style={styles.bulkRow}>
        <Pressable
          onPress={async () => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
            try {
              const allSlots = await ensureAllWeekSlots();
              setStatusById((prev) => {
                const next = { ...prev };
                for (const s of allSlots ?? []) next[s.id] = "dispo";
                return next;
              });
              const upserts = (allSlots ?? []).map((s) => ({
                user_id: userId,
                group_id: groupId,
                time_slot_id: s.id,
                status: "dispo",
              }));
              if (upserts.length) {
                const { error } = await supabase
                  .from("availabilities")
                  .upsert(upserts, {
                    onConflict: "user_id,group_id,time_slot_id",
                  });
                if (error) throw error;
              }
            } catch (e) {
              Alert.alert("Erreur", e?.message ?? String(e));
            }
          }}
          style={[styles.bulkBtn, { backgroundColor: "#0a7a31" }]}
        >
          <Text style={styles.bulkTxt}>Tout Dispo</Text>
        </Pressable>

        <Pressable
          onPress={async () => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
            try {
              const allSlots = await ensureAllWeekSlots();
              setStatusById((prev) => {
                const next = { ...prev };
                for (const s of allSlots ?? []) next[s.id] = "flex";
                return next;
              });
              const upserts = (allSlots ?? []).map((s) => ({
                user_id: userId,
                group_id: groupId,
                time_slot_id: s.id,
                status: "flex",
              }));
              if (upserts.length) {
                const { error } = await supabase
                  .from("availabilities")
                  .upsert(upserts, {
                    onConflict: "user_id,group_id,time_slot_id",
                  });
                if (error) throw error;
              }
            } catch (e) {
              Alert.alert("Erreur", e?.message ?? String(e));
            }
          }}
          style={[styles.bulkBtn, { backgroundColor: "#f59e0b" }]}
        >
          <Text style={styles.bulkTxt}>Tout Flex</Text>
        </Pressable>

        <Pressable
          onPress={async () => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
            try {
              const allSlots = await ensureAllWeekSlots();
              setStatusById((prev) => {
                const next = { ...prev };
                for (const s of allSlots ?? []) next[s.id] = "indispo";
                return next;
              });
              const upserts = (allSlots ?? []).map((s) => ({
                user_id: userId,
                group_id: groupId,
                time_slot_id: s.id,
                status: "indispo",
              }));
              if (upserts.length) {
                const { error } = await supabase
                  .from("availabilities")
                  .upsert(upserts, {
                    onConflict: "user_id,group_id,time_slot_id",
                  });
                if (error) throw error;
              }
            } catch (e) {
              Alert.alert("Erreur", e?.message ?? String(e));
            }
          }}
          style={[styles.bulkBtn, { backgroundColor: "#9ca3af" }]}
        >
          <Text style={styles.bulkTxt}>Tout Indispo</Text>
        </Pressable>
      </View>

      {/* Grille */}
      <ScrollView
        horizontal
        bounces={false}
        showsHorizontalScrollIndicator
        contentContainerStyle={{ padding: GRID_PAD }}
        scrollEnabled={!painting}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ position: "relative" }}>
          {/* En-têtes colonnes (jours) */}
          <View style={{ flexDirection: "row", marginLeft: 64, marginBottom: 6 }}>
            {dayRefs.map((d) => (
              <View key={d.dayISO} style={[styles.colHeader]}>
                <Text style={styles.colHeaderDay}>{frDayShort(d.date)}</Text>
                <Text style={styles.colHeaderDate}>{frDayLong(d.date)}</Text>
              </View>
            ))}
          </View>

          {/* Lignes horaires + cellules */}
          {timeRows.map((row, rowIndex) => (
            <View key={row.m} style={{ flexDirection: "row", alignItems: "center" }}>
              {/* temps */}
              <View style={styles.timeCol}>
                <Text style={styles.timeLabel}>{row.label}</Text>
              </View>

              {/* 7 colonnes */}
              <View style={{ flexDirection: "row" }}>
                {dayRefs.map((d, colIndex) => {
                  const key = `${d.dayISO}|${row.label}`;
                  const slot = slotByLocalKey.get(key) ?? null;
                  const status = slot ? statusById[slot.id] ?? "indispo" : "indispo";
                  const [bg, br, txt] = colorForStatus(status);

                  // --- Gesture sans lever le doigt ---
                  const onPressIn = (e) => {
                    // mémorise point de départ; on lancera la peinture dès que DY dépasse le seuil
                    pressTrackRef.current = {
                      active: true,
                      startY: e.nativeEvent.locationY,
                      colIndex,
                      rowIndex,
                    };
                  };

                  const maybeStartPaintFromPressIn = async () => {
                    // démarre la peinture sur la cellule d’origine
                    await beginPaint(colIndex, rowIndex);
                  };

                  const onMove = async (e) => {
                    // si déjà en peinture → peindre au fil du mouvement
                    if (painting) {
                      if (paintColIndexRef.current !== colIndex) return;
                      handleMoveFromCell(e, colIndex, startRowRef.current ?? rowIndex);
                      return;
                    }
                    // pas encore en peinture → vérifier si on a assez bougé pour démarrer
                    if (!pressTrackRef.current.active) return;
                    const dy = Math.abs(e.nativeEvent.locationY - pressTrackRef.current.startY);
                    if (dy >= DRAG_START_DY) {
                      // on commence la peinture immédiatement
                      pressTrackRef.current.active = false;
                      await maybeStartPaintFromPressIn();
                    }
                  };

                  const onEnd = async () => {
                    // fin du geste
                    if (painting) {
                      endPaint();
                      return;
                    }
                    // Pas de peinture : c'est un tap court → toggle
                    pressTrackRef.current.active = false;
                    if (!slot) {
                      const created = await ensureSlotFor(d.dayISO, row.label);
                      if (!created) return;
                      await setOne(created, "dispo"); // premier état
                      setSlots((prev) =>
                        prev.find((x) => x.id === created.id) ? prev : [...prev, created]
                      );
                      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
                      return;
                    }
                    await toggleOne(slot);
                    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
                  };

                  return (
                    <Pressable
                      key={key}
                      onPressIn={onPressIn}
                      onTouchMove={onMove}
                      onTouchEnd={onEnd}
                      onTouchCancel={onEnd}
                      style={[styles.cell, { backgroundColor: bg, borderColor: br }]}
                    >
                      <Text style={[styles.cellTxt, { color: txt }]}>
                        {slot ? labelForStatus(status) : "—"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const CELL_W = 110;
const CELL_H = 56;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: BRAND },
  navBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  navTxt: { fontSize: 16, color: "#111827" },

  colHeader: {
    width: CELL_W,
    marginBottom: 6,
    marginRight: 4,
    alignItems: "center",
  },
  colHeaderDay: { fontWeight: "800", color: BRAND, textTransform: "capitalize" },
  colHeaderDate: {
    fontSize: 12,
    color: "#6b7280",
    textTransform: "capitalize",
  },

  timeCol: { width: 64, alignItems: "flex-end", paddingRight: 6 },
  timeLabel: { fontWeight: "700", color: "#374151" },

  cell: {
    width: CELL_W,
    height: CELL_H,
    borderRadius: 10,
    borderWidth: 1.25,
    marginRight: 4,
    marginBottom: 6,
    alignItems: "center",
    justifyContent: "center",
    // subtil relief
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cellTxt: { fontWeight: "800" },

  bulkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: GRID_PAD,
    paddingVertical: 8,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  bulkBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    minWidth: 110,
    alignItems: "center",
  },
  bulkTxt: { color: "white", fontWeight: "800" },
});