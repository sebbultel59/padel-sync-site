import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

export default function ZoneScreen() {
  const insets = useSafeAreaInsets();
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentZoneId, setCurrentZoneId] = useState(null);
  const [inactiveZoneModal, setInactiveZoneModal] = useState(null);
  const [savingInterest, setSavingInterest] = useState(false);
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

        const [{ data: profile }, { data: zonesData, error: zonesError }] = await Promise.all([
          supabase.from("profiles").select("zone_id").eq("id", userId).maybeSingle(),
          supabase.from("zones").select("*").order("region").order("name")
        ]);
        if (zonesError) throw zonesError;

        if (mounted) {
          setZones(zonesData || []);
          setCurrentZoneId(profile?.zone_id || null);
        }
      } catch (e) {
        Alert.alert("Erreur", e?.message ?? "Impossible de charger les zones.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const orderedActiveNames = [
    "NORD – Lille et alentours",
    "NORD – Dunkerque · Calais · Boulogne · Audomarois",
    "GIRONDE – Bordeaux et métropole"
  ];

  const { activeZones, inactiveZones } = useMemo(() => {
    const active = (zones || []).filter((z) => z.is_active);
    const inactive = (zones || []).filter((z) => !z.is_active);
    active.sort((a, b) => {
      const ia = orderedActiveNames.indexOf(a.name);
      const ib = orderedActiveNames.indexOf(b.name);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return (a.name || "").localeCompare(b.name || "");
    });
    inactive.sort((a, b) => {
      const ra = a.region || "";
      const rb = b.region || "";
      if (ra !== rb) return ra.localeCompare(rb);
      return (a.name || "").localeCompare(b.name || "");
    });
    return { activeZones: active, inactiveZones: inactive };
  }, [zones]);

  const onSelectZone = async (zone) => {
    if (!zone?.is_active) {
      setInactiveZoneModal(zone);
      return;
    }
    if (zone.id === currentZoneId) {
      goBackOr("/(tabs)/matches");
      return;
    }
    const doChange = async () => {
      const { data: u } = await supabase.auth.getUser();
      const userId = u?.user?.id;
      if (!userId) return;
      const { error } = await supabase
        .from("profiles")
        .update({ zone_id: zone.id })
        .eq("id", userId);
      if (error) {
        Alert.alert("Erreur", error.message);
        return;
      }
      setCurrentZoneId(zone.id);
      Alert.alert("Zone mise à jour", "Sélectionne maintenant tes clubs acceptés.");
      router.replace("/clubs/select");
    };

    if (currentZoneId) {
      Alert.alert(
        "Changer de zone",
        "Changer de zone ne met pas à jour tes clubs. Veux-tu continuer ?",
        [
          { text: "Annuler", style: "cancel" },
          { text: "Continuer", onPress: doChange }
        ]
      );
      return;
    }
    doChange();
  };

  const saveZoneInterest = async (zone) => {
    if (!zone?.id) return;
    try {
      setSavingInterest(true);
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (uid) {
        await supabase.from("zone_interest").upsert({ user_id: uid, zone_id: zone.id });
      }
      const key = "zone_interest";
      const raw = await AsyncStorage.getItem(key);
      const prev = raw ? JSON.parse(raw) : [];
      const next = Array.isArray(prev) ? [...prev] : [];
      if (!next.find((z) => String(z?.id) === String(zone.id))) {
        next.push({ id: zone.id, name: zone.name, region: zone.region, at: Date.now() });
      }
      await AsyncStorage.setItem(key, JSON.stringify(next));
      Alert.alert("Merci", "On te préviendra quand cette zone sera active.");
    } catch (e) {
      Alert.alert("Erreur", "Impossible d'enregistrer ta demande.");
    } finally {
      setSavingInterest(false);
      setInactiveZoneModal(null);
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
    <ScrollView style={{ flex: 1, backgroundColor: "#001831" }} contentContainerStyle={{ padding: 16, paddingTop: 46, paddingBottom: insets.bottom + 24 }}>
      <Text style={{ color: "#e0ff00", fontSize: 20, fontWeight: "900", marginBottom: 6 }}>
        Choisir ma zone
      </Text>
      <Text style={{ color: "#cfe9ff", marginBottom: 16 }}>
        Ta zone sert à trouver des joueurs. Les matchs ne seront proposés qu’avec des joueurs de la même zone.
      </Text>

      <View style={{ marginBottom: 18 }}>
        <Text style={{ color: "#9bb6d6", fontWeight: "800", marginBottom: 8 }}>Zones actives</Text>
        {activeZones.map((zone) => {
          const isSelected = zone.id === currentZoneId;
          return (
            <Pressable
              key={zone.id}
              onPress={() => onSelectZone(zone)}
              style={{
                padding: 14,
                borderRadius: 12,
                marginBottom: 8,
                backgroundColor: isSelected ? "rgba(224,255,0,0.14)" : "rgba(255,255,255,0.06)",
                borderWidth: 1,
                borderColor: isSelected ? "#e0ff00" : "rgba(255,255,255,0.08)"
              }}
            >
              <Text style={{ color: "#ffffff", fontWeight: "700" }}>{zone.name}</Text>
              <Text style={{ color: "#9bb6d6", marginTop: 4 }}>
                Choisir cette zone
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ marginBottom: 18 }}>
        <Text style={{ color: "#9bb6d6", fontWeight: "800", marginBottom: 8 }}>Bientôt disponible</Text>
        {inactiveZones.map((zone) => (
          <Pressable
            key={zone.id}
            onPress={() => onSelectZone(zone)}
            style={{
              padding: 14,
              borderRadius: 12,
              marginBottom: 8,
              backgroundColor: "rgba(255,255,255,0.04)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)"
            }}
          >
            <Text style={{ color: "#ffffff", fontWeight: "700" }}>{zone.name}</Text>
          </Pressable>
        ))}
      </View>
      <Modal visible={!!inactiveZoneModal} transparent animationType="fade" onRequestClose={() => setInactiveZoneModal(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: "#0b223a", borderRadius: 12, padding: 16, width: "100%" }}>
            <Text style={{ color: "#ffffff", fontWeight: "800", fontSize: 16, marginBottom: 8 }}>Zone pas encore active</Text>
            <Text style={{ color: "#cfe9ff", marginBottom: 12 }}>
              Cette zone n’est pas encore disponible.
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
              <Pressable
                onPress={() => setInactiveZoneModal(null)}
                style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.1)" }}
              >
                <Text style={{ color: "#ffffff", fontWeight: "700" }}>OK</Text>
              </Pressable>
              <Pressable
                onPress={() => saveZoneInterest(inactiveZoneModal)}
                disabled={savingInterest}
                style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: "#e0ff00", opacity: savingInterest ? 0.7 : 1 }}
              >
                <Text style={{ color: "#001831", fontWeight: "800" }}>Être alerté</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
