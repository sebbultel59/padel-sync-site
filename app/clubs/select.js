import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, UIManager, View } from "react-native";
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

export default function ClubSelectScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [clubs, setClubs] = useState([]);
  const [zone, setZone] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [preferredId, setPreferredId] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [radiusKm, setRadiusKm] = useState(30);
  const goBackOr = (fallback) => {
    if (router?.canGoBack?.()) router.back();
    else router.replace(fallback);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        const userId = u?.user?.id;
        if (!userId) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("zone_id, comfort_radius_km")
          .eq("id", userId)
          .maybeSingle();
        if (!profile?.zone_id) {
          router.replace("/zone");
          return;
        }

        const [{ data: zoneData }, { data: clubsData }, { data: userClubs }] = await Promise.all([
          supabase.from("zones").select("*").eq("id", profile.zone_id).maybeSingle(),
          supabase
            .from("clubs")
            .select("id, name, lat, lng, zone_id, is_active")
            .eq("zone_id", profile.zone_id)
            .eq("is_active", true)
            .order("name"),
          supabase
            .from("user_clubs")
            .select("club_id, is_preferred")
            .eq("user_id", userId)
            .eq("is_accepted", true)
        ]);

        const selected = new Set((userClubs || []).map((r) => String(r.club_id)));
        const pref = (userClubs || []).find((r) => r.is_preferred)?.club_id || null;

        if (mounted) {
          setZone(zoneData || null);
          setClubs(clubsData || []);
          setSelectedIds(selected);
          setPreferredId(pref ? String(pref) : null);
          setRadiusKm(profile?.comfort_radius_km || zoneData?.default_radius_km || 30);
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
    if (!zone?.lat_center || !zone?.lng_center) return clubs;
    if (showAll) return clubs;
    return (clubs || []).filter((c) => {
      if (c.lat == null || c.lng == null) return false;
      const dist = haversineKm(
        { lat: zone.lat_center, lng: zone.lng_center },
        { lat: c.lat, lng: c.lng }
      );
      return dist <= radiusKm;
    });
  }, [clubs, radiusKm, showAll, zone]);

  const toggleClub = (clubId) => {
    const next = new Set(selectedIds);
    const key = String(clubId);
    if (next.has(key)) {
      next.delete(key);
      if (preferredId === key) setPreferredId(null);
    } else {
      next.add(key);
    }
    setSelectedIds(next);
  };

  const onSave = async () => {
    const { data: u } = await supabase.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) return;

    const selected = Array.from(selectedIds);
    const inZoneIds = new Set((clubs || []).map((c) => String(c.id)));

    const toDelete = (selected.length === 0 && inZoneIds.size > 0)
      ? Array.from(inZoneIds)
      : Array.from(inZoneIds).filter((id) => !selectedIds.has(id));

    if (toDelete.length) {
      await supabase
        .from("user_clubs")
        .delete()
        .eq("user_id", userId)
        .in("club_id", toDelete);
    }

    if (selected.length) {
      const payload = selected.map((clubId) => ({
        user_id: userId,
        club_id: clubId,
        is_accepted: true,
        is_preferred: preferredId === String(clubId)
      }));
      await supabase.from("user_clubs").upsert(payload, { onConflict: "user_id,club_id" });
    }

    await supabase.from("profiles").update({ comfort_radius_km: Math.round(radiusKm) }).eq("id", userId);
    Alert.alert("Enregistré", "Tes clubs acceptés ont été mis à jour.");
    goBackOr("/(tabs)/matches");
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#001831" }}>
        <ActivityIndicator size="large" color="#e0ff00" />
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#001831" }} contentContainerStyle={{ padding: 16, paddingTop: 46, paddingBottom: insets.bottom + 24 }}>
      <Pressable
        onPress={() => router.replace("/zone")}
        style={{ alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.08)", marginBottom: 8 }}
      >
        <Text style={{ color: "#cfe9ff", fontWeight: "800" }}>← Retour</Text>
      </Pressable>
      <Text style={{ color: "#e0ff00", fontSize: 20, fontWeight: "900", marginBottom: 6 }}>
        Zone choisie
      </Text>
      <Text style={{ color: "#cfe9ff", marginBottom: 12, fontWeight: "700" }}>
        {zone?.name || "—"}
      </Text>
      <Text style={{ color: "#e0ff00", fontSize: 20, fontWeight: "900", marginBottom: 6 }}>
        Choisis les Clubs où tu acceptes de jouer
      </Text>
      <Text style={{ color: "#cfe9ff", marginBottom: 16 }}>
        Les matchs ne seront proposés que dans les clubs que tu sélectionnes.
      </Text>

      <View style={{ marginBottom: 12 }}>
        <Text style={{ color: "#9bb6d6", fontWeight: "700", marginBottom: 6 }}>
          Rayon en km : {Math.round(radiusKm)} km
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
          marginBottom: 16
        }}
      >
        <Text
          style={{
            color: showAll ? "#e0ff00" : "#ffffff",
            fontWeight: "700"
          }}
        >
          Afficher tous les clubs de la zone
        </Text>
      </Pressable>

      {(filteredClubs || []).map((club) => {
        const isSelected = selectedIds.has(String(club.id));
        const isPreferred = preferredId === String(club.id);
        return (
          <Pressable
            key={club.id}
            onPress={() => toggleClub(club.id)}
            style={{
              padding: 14,
              borderRadius: 12,
              marginBottom: 8,
              backgroundColor: isSelected ? "rgba(224,255,0,0.14)" : "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: isSelected ? "#e0ff00" : "rgba(255,255,255,0.08)"
            }}
          >
            <Text style={{ color: "#ffffff", fontWeight: "700" }}>{club.name}</Text>
            {isSelected ? (
              <Pressable
                onPress={() => setPreferredId(isPreferred ? null : String(club.id))}
                style={{ marginTop: 6 }}
              >
                <Text style={{ color: isPreferred ? "#e0ff00" : "#9bb6d6" }}>
                  {isPreferred ? "⭐ Club préféré" : "Définir comme préféré"}
                </Text>
              </Pressable>
            ) : null}
          </Pressable>
        );
      })}

      <Pressable
        onPress={onSave}
        style={{ marginTop: 12, padding: 14, borderRadius: 999, backgroundColor: "#e0ff00", alignItems: "center" }}
      >
        <Text style={{ color: "#001831", fontWeight: "900" }}>Enregistrer</Text>
      </Pressable>
    </ScrollView>
  );
}
