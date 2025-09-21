// app/terrains/index.js
import * as Linking from "expo-linking";
import * as Location from "expo-location";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

const BRAND = "#1a4b97";

// MVP dataset — remplace/alimente depuis ta DB plus tard
const CLUBS = [
  { id: "clb1", name: "Padel Club Paris 15", lat: 48.8387, lng: 2.2982, indoor: true,  url: "https://example.com/reserver/p15" },
  { id: "clb2", name: "Padel Lyon Gerland",   lat: 45.7296, lng: 4.8230, indoor: false, url: "https://example.com/reserver/lyg" },
  { id: "clb3", name: "Padel Bordeaux Nord",  lat: 44.8896, lng: -0.5669, indoor: true, url: "https://example.com/reserver/bdx" },
];

function haversineKm(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return Math.round(R * c * 10) / 10; // 0.1 km
}

export default function TerrainsScreen() {
  const [loading, setLoading] = useState(true);
  const [coords, setCoords] = useState(null);
  const [filterIndoor, setFilterIndoor] = useState(null); // null = tous, true = indoor, false = outdoor

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Géolocalisation", "Permission refusée. Les distances peuvent être inexactes.");
          setCoords(null);
        } else {
          const pos = await Location.getCurrentPositionAsync({});
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
      } catch (e) {
        Alert.alert("Erreur GPS", e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const data = useMemo(() => {
    const base = filterIndoor == null ? CLUBS : CLUBS.filter(c => c.indoor === filterIndoor);
    const withDist = base.map(c => ({ ...c, distanceKm: coords ? haversineKm(coords, c) : null }));
    return withDist.sort((a, b) => {
      const da = a.distanceKm ?? Infinity;
      const db = b.distanceKm ?? Infinity;
      return da - db;
    });
  }, [coords, filterIndoor]);

  if (loading) {
    return <View style={s.center}><ActivityIndicator /></View>;
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Filtres */}
      <View style={s.filters}>
        <Pressable
          onPress={() => setFilterIndoor(null)}
          style={[s.pill, filterIndoor == null && s.pillActive]}
        >
          <Text style={[s.pillTxt, filterIndoor == null && s.pillTxtActive]}>Tous</Text>
        </Pressable>
        <Pressable
          onPress={() => setFilterIndoor(true)}
          style={[s.pill, filterIndoor === true && s.pillActive]}
        >
          <Text style={[s.pillTxt, filterIndoor === true && s.pillTxtActive]}>Indoor</Text>
        </Pressable>
        <Pressable
          onPress={() => setFilterIndoor(false)}
          style={[s.pill, filterIndoor === false && s.pillActive]}
        >
          <Text style={[s.pillTxt, filterIndoor === false && s.pillTxtActive]}>Outdoor</Text>
        </Pressable>
      </View>

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{item.name}</Text>
              <Text style={s.meta}>
                {item.indoor ? "🏠 Indoor" : "🌤️ Outdoor"} · {item.distanceKm != null ? `${item.distanceKm} km` : "distance inconnue"}
              </Text>
            </View>
            <Pressable
              onPress={() => Linking.openURL(item.url)}
              style={[s.btn, { backgroundColor: BRAND }]}
            >
              <Text style={s.btnTxt}>Réserver</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <View style={[s.card, { alignItems: "center" }]}>
            <Text style={{ color: "#6b7280" }}>Aucun club trouvé.</Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  filters: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#f3f4f6",
  },
  pillActive: { backgroundColor: "#eaf2ff", borderWidth: 1, borderColor: BRAND },
  pillTxt: { color: "#111827", fontWeight: "700" },
  pillTxtActive: { color: BRAND },

  card: {
    backgroundColor: "white",
    borderWidth: 1, borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title: { fontSize: 16, fontWeight: "800", color: "#111827" },
  meta: { marginTop: 2, color: "#6b7280", fontSize: 12 },
  btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  btnTxt: { color: "white", fontWeight: "800" },
});