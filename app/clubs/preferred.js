import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, UIManager, View } from "react-native";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

let NativeSlider = null;
try {
  NativeSlider = require("@react-native-community/slider").default;
} catch {}

const hasNativeSlider = Platform.OS !== "web" && !!UIManager.getViewManagerConfig?.("RNCSlider");

const haversineKm = (a, b) => {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sa =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(sa), Math.sqrt(1 - sa));
  return R * c;
};

export default function ClubPreferredScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [clubs, setClubs] = useState([]);
  const [zone, setZone] = useState(null);
  const [selectedPreferredId, setSelectedPreferredId] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [radiusKm, setRadiusKm] = useState(30);
  const [coords, setCoords] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        const userId = u?.user?.id;
        if (!userId) return;

        const { data: profile } = await supabase.from("profiles").select("zone_id").eq("id", userId).maybeSingle();
        if (!profile?.zone_id) {
          router.replace("/zone");
          return;
        }

        const [{ data: zoneData }, { data: clubsData }, { data: userClubs }] = await Promise.all([
          supabase.from("zones").select("*").eq("id", profile.zone_id).maybeSingle(),
          supabase
            .from("clubs")
            .select("id, name, address, lat, lng, zone_id, is_active")
            .eq("zone_id", profile.zone_id)
            .eq("is_active", true)
            .order("name"),
          supabase.from("user_clubs").select("club_id, is_preferred, is_refused").eq("user_id", userId),
        ]);

        const pref =
          (userClubs || []).find((r) => r.is_preferred === true && r.is_refused !== true)?.club_id || null;

        if (mounted) {
          setZone(zoneData || null);
          setClubs(clubsData || []);
          setSelectedPreferredId(pref ? String(pref) : null);
          setRadiusKm(30);
        }
      } catch (e) {
        Alert.alert("Erreur", e?.message ?? "Impossible de charger les clubs.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredClubs = useMemo(() => {
    const origin =
      coords || (zone?.lat_center && zone?.lng_center ? { lat: zone.lat_center, lng: zone.lng_center } : null);

    const withDistance = (list) =>
      (list || []).map((c) => {
        if (!origin || c.lat == null || c.lng == null) {
          return { ...c, distanceKm: null };
        }
        const dist = haversineKm(origin, { lat: c.lat, lng: c.lng });
        return { ...c, distanceKm: dist };
      });

    if (!origin) {
      return withDistance(clubs || []);
    }

    if (showAll) {
      return withDistance(clubs || []);
    }

    const filtered = (clubs || []).filter((c) => {
      if (c.lat == null || c.lng == null) return false;
      const dist = haversineKm(origin, { lat: c.lat, lng: c.lng });
      return dist <= radiusKm;
    });

    return withDistance(filtered);
  }, [clubs, radiusKm, showAll, zone, coords]);

  const sortedClubs = useMemo(() => {
    const list = [...(filteredClubs || [])];
    list.sort((a, b) => {
      const da = a.distanceKm;
      const db = b.distanceKm;
      if (da == null && db == null) return String(a.name || "").localeCompare(String(b.name || ""));
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    });
    return list;
  }, [filteredClubs]);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setCoords(null);
          return;
        }
        const pos = await Location.getCurrentPositionAsync({});
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch (e) {
        console.warn("[ClubPreferred] Erreur GPS:", e?.message || e);
        setCoords(null);
      }
    })();
  }, []);

  const onSave = async () => {
    const { data: u } = await supabase.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) return;

    setSaving(true);
    try {
      const zoneClubIds = new Set((clubs || []).map((c) => String(c.id)));
      const { data: ucRows } = await supabase
        .from("user_clubs")
        .select("club_id, is_preferred, is_refused")
        .eq("user_id", userId);
      const oldPrefRow = (ucRows || []).find((r) => r.is_preferred === true && r.is_refused !== true);
      const oldPrefId = oldPrefRow?.club_id != null ? String(oldPrefRow.club_id) : null;
      const nextId = selectedPreferredId ? String(selectedPreferredId) : null;

      await supabase.from("user_clubs").update({ is_preferred: false }).eq("user_id", userId).eq("is_preferred", true);

      if (nextId) {
        const { error } = await supabase.from("user_clubs").upsert(
          {
            user_id: userId,
            club_id: nextId,
            is_preferred: true,
            is_refused: false,
            is_accepted: true,
          },
          { onConflict: "user_id,club_id" }
        );
        if (error) throw error;
      }

      if (oldPrefId && (!nextId || oldPrefId !== nextId) && zoneClubIds.has(oldPrefId)) {
        await supabase.from("user_clubs").delete().eq("user_id", userId).eq("club_id", oldPrefId);
      }

      Alert.alert("Enregistré", "Ton club préféré a été mis à jour.");
      router.replace("/(tabs)/profil");
    } catch (e) {
      Alert.alert("Erreur", e?.message ?? "Impossible d’enregistrer.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#001831" }}>
        <ActivityIndicator size="large" color="#e0ff00" />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#001831" }}
      contentContainerStyle={{ padding: 16, paddingTop: 46, paddingBottom: insets.bottom + 24 }}
    >
      <Pressable
        onPress={() => router.replace("/(tabs)/profil")}
        style={{
          alignSelf: "flex-start",
          paddingVertical: 6,
          paddingHorizontal: 8,
          borderRadius: 8,
          backgroundColor: "rgba(255,255,255,0.08)",
          marginBottom: 8,
        }}
      >
        <Text style={{ color: "#cfe9ff", fontWeight: "800" }}>← Retour</Text>
      </Pressable>

      <Text style={{ color: "#e0ff00", fontSize: 20, fontWeight: "900", marginBottom: 6 }}>Choisir mon club préféré</Text>
      <Text style={{ color: "#cfe9ff", marginBottom: 16, fontWeight: "600" }}>Choisis ton club de référence</Text>

      <View style={{ marginBottom: 12 }}>
        <Text style={{ color: "#9bb6d6", fontWeight: "700", marginBottom: 6 }}>
          Aperçu rayon (repère carte) : {Math.round(radiusKm)} km
        </Text>
        {hasNativeSlider && NativeSlider ? (
          <NativeSlider
            value={radiusKm}
            onValueChange={setRadiusKm}
            minimumValue={5}
            maximumValue={60}
            step={1}
            minimumTrackTintColor="#e0ff00"
            maximumTrackTintColor="rgba(255,255,255,0.2)"
            thumbTintColor="#e0ff00"
          />
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Pressable
              onPress={() => setRadiusKm((v) => Math.max(5, (v || 0) - 5))}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.12)" }}
            >
              <Text style={{ color: "#ffffff", fontWeight: "700" }}>-</Text>
            </Pressable>
            <Text style={{ color: "#e0ff00", fontWeight: "800" }}>{Math.round(radiusKm)} km</Text>
            <Pressable
              onPress={() => setRadiusKm((v) => Math.min(60, (v || 0) + 5))}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.12)" }}
            >
              <Text style={{ color: "#ffffff", fontWeight: "700" }}>+</Text>
            </Pressable>
          </View>
        )}
      </View>

      <Pressable
        onPress={() => setShowAll((v) => !v)}
        style={{
          padding: 12,
          borderRadius: 10,
          backgroundColor: showAll ? "rgba(224,255,0,0.16)" : "rgba(255,255,255,0.06)",
          borderWidth: 1,
          borderColor: showAll ? "#e0ff00" : "rgba(255,255,255,0.08)",
          marginBottom: 12,
        }}
      >
        <Text style={{ color: showAll ? "#e0ff00" : "#ffffff", fontWeight: "700" }}>Afficher tous les clubs de la zone</Text>
      </Pressable>

      <Pressable
        onPress={() => setSelectedPreferredId(null)}
        style={{
          padding: 14,
          borderRadius: 12,
          marginBottom: 8,
          backgroundColor: selectedPreferredId === null ? "rgba(224,255,0,0.16)" : "rgba(255,255,255,0.06)",
          borderWidth: 1,
          borderColor: selectedPreferredId === null ? "#e0ff00" : "rgba(255,255,255,0.08)",
        }}
      >
        <Text style={{ color: selectedPreferredId === null ? "#e0ff00" : "#9bb6d6", fontWeight: "800" }}>Aucun club préféré</Text>
      </Pressable>

      {(sortedClubs || []).map((club) => {
        const key = String(club.id);
        const selected = selectedPreferredId === key;
        return (
          <Pressable
            key={club.id}
            onPress={() => setSelectedPreferredId(key)}
            style={{
              padding: 14,
              borderRadius: 12,
              marginBottom: 8,
              backgroundColor: selected ? "rgba(224,255,0,0.16)" : "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: selected ? "#e0ff00" : "rgba(255,255,255,0.08)",
            }}
          >
            <Text style={{ color: "#ffffff", fontWeight: "700" }}>{club.name}</Text>
            {club.address ? (
              <Text style={{ color: "#9bb6d6", marginTop: 2, fontSize: 12 }}>
                {(() => {
                  const parts = String(club.address).split(",").map((p) => p.trim()).filter(Boolean);
                  if (parts.length === 0) return "";
                  const cityPart = parts.length === 1 ? parts[0] : parts[parts.length - 2];
                  const tokens = cityPart.split(" ").filter(Boolean);
                  if (tokens.length === 0) return "";
                  const withoutPostal =
                    tokens.length > 1 && /^[0-9]{5}$/.test(tokens[0]) ? tokens.slice(1).join(" ") : cityPart;
                  const dist =
                    typeof club.distanceKm === "number" && isFinite(club.distanceKm) ? `${Math.round(club.distanceKm)} km` : null;
                  return dist ? `${withoutPostal} - ${dist}` : withoutPostal;
                })()}
              </Text>
            ) : null}
          </Pressable>
        );
      })}

      <Pressable
        onPress={onSave}
        disabled={saving}
        style={{
          marginTop: 12,
          padding: 14,
          borderRadius: 999,
          backgroundColor: saving ? "rgba(224,255,0,0.5)" : "#e0ff00",
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#001831", fontWeight: "900" }}>{saving ? "…" : "Enregistrer"}</Text>
      </Pressable>
    </ScrollView>
  );
}
