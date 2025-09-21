// app/(tabs)/matches/[id].js
import { Stack, router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Linking,
    Platform,
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
const isUuid = (v) =>
  typeof v === "string" &&
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(v);

function Avatar({ url, fallback, size = 40 }) {
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
      <Text style={{ color: BRAND, fontWeight: "800" }}>{letter}</Text>
    </View>
  );
}

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" });
const fmtTime = (iso) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export default function MatchDetail() {
  const { id } = useLocalSearchParams();
  const matchId = Array.isArray(id) ? id[0] : id;
  const { activeGroupId } = useActiveGroup();

  const [me, setMe] = useState(null); // { id, email }
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [match, setMatch] = useState(null); // { id, status, group_id, time_slot_id, starts_at, ends_at }
  const [group, setGroup] = useState(null); // { id, name }
  const [rsvps, setRsvps] = useState([]); // [{user_id, status}]
  const [profiles, setProfiles] = useState([]); // [{id, display_name, email, avatar_url}]
  const [myStatus, setMyStatus] = useState(null); // "yes" | "maybe" | "no" | null

  // Charger session
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      const uid = data?.user?.id ?? null;
      const email = data?.user?.email ?? null;
      setMe(uid ? { id: uid, email } : null);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const invalidId = !isUuid(matchId);

  const fetchAll = useCallback(async () => {
    if (invalidId) return;
    setLoading(true);
    try {
      // 1) match
      const { data: m, error: eM } = await supabase
        .from("matches")
        .select("id, group_id, status, time_slot_id")
        .eq("id", matchId)
        .maybeSingle();
      if (eM) throw eM;
      if (!m) {
        Alert.alert("Introuvable", "Ce match n’existe pas (ou n’est plus disponible).");
        router.back();
        return;
      }

      // 2) slot
      let starts_at = null,
        ends_at = null;
      if (m.time_slot_id) {
        const { data: ts, error: eS } = await supabase
          .from("time_slots")
          .select("starts_at, ends_at")
          .eq("id", m.time_slot_id)
          .maybeSingle();
        if (eS) throw eS;
        if (ts) {
          starts_at = ts.starts_at;
          ends_at = ts.ends_at;
        }
      }

      // 3) groupe
      let g = null;
      if (m.group_id) {
        const { data: gr, error: eG } = await supabase.from("groups").select("id, name").eq("id", m.group_id).maybeSingle();
        if (eG) throw eG;
        g = gr ?? null;
      }

      // 4) RSVPs
      const { data: rs, error: eR } = await supabase.from("match_rsvps").select("user_id, status").eq("match_id", matchId);
      if (eR) throw eR;

      // 5) Profils des joueurs concernés
      const ids = [...new Set((rs ?? []).map((r) => r.user_id))];
      let profs = [];
      if (ids.length) {
        const { data: pr, error: eP } = await supabase
          .from("profiles")
          .select("id, display_name, name, email, avatar_url")
          .in("id", ids);
        if (eP) throw eP;
        profs = (pr ?? []).map((p) => ({
          id: p.id,
          display_name: p.display_name || p.name || null,
          email: p.email ?? "",
          avatar_url: p.avatar_url ?? null,
        }));
      }

      setMatch({ ...m, starts_at, ends_at });
      setGroup(g);
      setRsvps(rs ?? []);
      setProfiles(profs);

      // 6) mon statut
      const mine = (rs ?? []).find((r) => r.user_id === me?.id);
      setMyStatus(mine?.status ?? null);
    } catch (e) {
      Alert.alert("Erreur", e?.message ?? String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [matchId, invalidId, me?.id]);

  useEffect(() => {
    if (me?.id && isUuid(matchId)) fetchAll();
  }, [me?.id, matchId, fetchAll]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAll();
  }, [fetchAll]);

  // RSVP
  const setRsvp = useCallback(
    async (status) => {
      if (!me?.id || !isUuid(matchId)) return;
      try {
        const { error } = await supabase
          .from("match_rsvps")
          .upsert({ match_id: matchId, user_id: me.id, status }, { onConflict: "match_id,user_id" });
        if (error) throw error;
        setMyStatus(status);

        // refraîchir léger en local
        setRsvps((prev) => {
          const rest = prev.filter((r) => r.user_id !== me.id);
          return [...rest, { user_id: me.id, status }];
        });
      } catch (e) {
        Alert.alert("Erreur RSVP", e?.message ?? String(e));
      }
    },
    [matchId, me?.id]
  );

  // Ouvrir app Cartes/Maps sur “padel” proche
  const openNearbyPadel = useCallback(async () => {
    try {
      const query = "padel";
      // iOS: Apple Plans ; Android: schéma geo ; fallback Google Maps web
      const url = Platform.select({
        ios: `http://maps.apple.com/?q=${encodeURIComponent(query)}`,
        android: `geo:0,0?q=${encodeURIComponent(query)}`,
        default: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
      });
      const supported = await Linking.canOpenURL(url);
      await Linking.openURL(supported ? url : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`);
    } catch (e) {
      Alert.alert("Erreur", e?.message ?? String(e));
    }
  }, []);

  const nbYes = useMemo(() => (rsvps ?? []).filter((r) => r.status === "yes").length, [rsvps]);

  if (invalidId) {
    return (
      <View style={styles.center}>
        <Text style={{ color: "#b91c1c", fontWeight: "700" }}>Identifiant de match invalide</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: group?.name ? `Match — ${group.name}` : "Match",
          headerBackTitle: "Retour",
        }}
      />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : !match ? (
        <View style={styles.center}>
          <Text>Match introuvable.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          {/* Carte horaire */}
          <View style={styles.card}>
            <Text style={styles.h1}>{fmtDate(match.starts_at)}</Text>
            <Text style={styles.h2}>
              {fmtTime(match.starts_at)} – {fmtTime(match.ends_at)}
            </Text>
            <Text style={[styles.badge, { borderColor: match.status === "confirmed" ? "#16a34a" : "#6b7280" }]}>
              {match.status === "confirmed" ? "Confirmé" : match.status}
            </Text>
            <Text style={{ marginTop: 6, color: "#6b7280" }}>Groupe : {group?.name ?? "—"}</Text>
            <Text style={{ color: "#6b7280" }}>Confirmations : {nbYes}/4</Text>
          </View>

          {/* Actions RSVP (+ bouton Terrains proches si confirmé) */}
          <View style={[styles.card, { alignItems: "center" }]}>
            <Text style={styles.h3}>Ta réponse</Text>
            <View style={styles.rsvpRow}>
              <Pressable
                onPress={() => setRsvp("yes")}
                style={[styles.rsvpBtn, myStatus === "yes" && { backgroundColor: BRAND, borderColor: BRAND }]}
              >
                <Text style={[styles.rsvpTxt, myStatus === "yes" && { color: "white" }]}>J’y vais</Text>
              </Pressable>
              <Pressable
                onPress={() => setRsvp("maybe")}
                style={[styles.rsvpBtnOutline, myStatus === "maybe" && { borderColor: BRAND, backgroundColor: "#eaf2ff" }]}
              >
                <Text style={[styles.rsvpTxt, { color: BRAND }]}>Peut-être</Text>
              </Pressable>
              <Pressable
                onPress={() => setRsvp("no")}
                style={[styles.rsvpBtnLight, myStatus === "no" && { borderColor: "#111827", backgroundColor: "#f3f4f6" }]}
              >
                <Text style={[styles.rsvpTxt, { color: "#111827" }]}>Non</Text>
              </Pressable>
            </View>

            {match.status === "confirmed" ? (
              <Pressable onPress={openNearbyPadel} style={styles.mapBtn}>
                <Text style={styles.mapBtnTxt}>🎯 Terrains proches</Text>
              </Pressable>
            ) : null}
          </View>

          {/* Liste joueurs & statuts */}
          <View style={styles.card}>
            <Text style={styles.h3}>Joueurs</Text>
            {rsvps.length === 0 ? (
              <Text style={{ color: "#6b7280" }}>Aucun RSVP pour le moment.</Text>
            ) : (
              rsvps
                .sort((a, b) => {
                  // oui en premier, puis maybe, puis no
                  const rank = { yes: 0, maybe: 1, no: 2 };
                  return (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
                })
                .map((r) => {
                  const p = profiles.find((x) => x.id === r.user_id);
                  const label = p?.display_name || p?.email || r.user_id.slice(0, 8);
                  return (
                    <View key={r.user_id} style={styles.playerRow}>
                      <Avatar url={p?.avatar_url} fallback={label} />
                      <View style={{ marginLeft: 10, flex: 1 }}>
                        <Text style={{ fontWeight: "700", color: "#111827" }}>{label}</Text>
                        <Text style={{ color: "#6b7280", fontSize: 12 }}>
                          {r.status === "yes" ? "J’y vais" : r.status === "maybe" ? "Peut-être" : r.status === "no" ? "Non" : r.status}
                        </Text>
                      </View>
                    </View>
                  );
                })
            )}
          </View>
        </ScrollView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  card: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
  },

  h1: { fontSize: 20, fontWeight: "800", color: BRAND, textTransform: "capitalize" },
  h2: { fontSize: 16, fontWeight: "700", color: "#111827", marginTop: 4 },
  h3: { fontSize: 16, fontWeight: "800", color: BRAND, marginBottom: 8 },

  badge: {
    marginTop: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    color: "#111827",
  },

  rsvpRow: { flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 6 },
  rsvpBtn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: BRAND, borderWidth: 1, borderColor: BRAND },
  rsvpBtnOutline: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: "white", borderWidth: 1, borderColor: BRAND },
  rsvpBtnLight: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: "white", borderWidth: 1, borderColor: "#e5e7eb" },
  rsvpTxt: { fontWeight: "800", color: "white" },

  // Bouton Terrains proches (affiché seulement si match confirmé)
  mapBtn: {
    marginTop: 10,
    alignSelf: "stretch",
    backgroundColor: "#111827",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  mapBtnTxt: { color: "white", fontWeight: "800" },

  playerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
});