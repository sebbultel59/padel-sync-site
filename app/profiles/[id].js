// app/profiles/[id].js
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { supabase } from "../../lib/supabase";

const BRAND = "#1a4b97";
const AVATAR = 120;

const LEVELS = [
  { v: 1, label: "Débutant", color: "#a3e635" },
  { v: 2, label: "Perfectionnement", color: "#86efac" },
  { v: 3, label: "Élémentaire", color: "#60a5fa" },
  { v: 4, label: "Intermédiaire", color: "#22d3ee" },
  { v: 5, label: "Confirmé", color: "#fbbf24" },
  { v: 6, label: "Avancé", color: "#f59e0b" },
  { v: 7, label: "Expert", color: "#fb7185" },
  { v: 8, label: "Elite", color: "#a78bfa" },
];
const labelToLevel = new Map(LEVELS.map(x => [x.label.toLowerCase(), x.v]));
const levelMeta = (n) => LEVELS.find((x) => x.v === n) ?? null;

export default function ProfileScreen() {
  const { id } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [p, setP] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!id) throw new Error("Profil introuvable");
        const { data, error } = await supabase
          .from("profiles")
          .select("id, email, display_name, name, avatar_url, niveau, main, cote, club, rayon_km, phone")
          .eq("id", String(id))
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Profil introuvable");
        if (mounted) setP(data);
      } catch (e) {
        Alert.alert("Erreur", e?.message ?? String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  const levelInfo = useMemo(() => {
    const raw = p?.niveau;
    if (!raw) return null;
    const num = Number(raw);
    if (Number.isFinite(num) && num >= 1 && num <= 8) {
      return levelMeta(num);
    }
    const numFromLabel = labelToLevel.get(String(raw).toLowerCase());
    if (numFromLabel) {
      return levelMeta(numFromLabel);
    }
    return { label: String(raw) };
  }, [p?.niveau]);

  if (loading) return <View style={s.center}><ActivityIndicator /></View>;
  if (!p) return <View style={s.center}><Text style={{ color: "#6b7280" }}>Profil introuvable</Text></View>;

  const title = p.display_name || p.name || p.email || "Joueur";
  const initial = (title?.trim?.()[0] ?? "?").toUpperCase();

  return (
    <ScrollView contentContainerStyle={s.container}>
      {/* Bouton retour */}
      <Pressable onPress={() => router.replace("/groupes")} style={s.backBtn}>
        <Text style={s.backTxt}>← Retour aux groupes</Text>
      </Pressable>

      {/* Avatar + Nom */}
      <View style={s.hero}>
        {p.avatar_url ? (
          <Image source={{ uri: p.avatar_url }} style={s.avatar} />
        ) : (
          <View style={[s.avatar, s.avatarFallback]}>
            <Text style={s.initial}>{initial}</Text>
          </View>
        )}
        <Text style={s.title}>{title}</Text>
        <Text style={s.subtitle}>{p.email}</Text>
      </View>

      {/* Résumé visuel */}
      <View style={s.card}>
        <Text style={s.sectionTitle}>Résumé</Text>
        <View style={s.tiles}>
          <Tile emoji="🔥" label="Niveau" value={levelInfo?.v || levelInfo?.label || "—"} hint={levelInfo?.label} />
          <Tile emoji="🖐️" label="Main" value={p.main || "—"} />
          <Tile emoji="🎯" label="Côté" value={p.cote || "—"} />
          <Tile emoji="🏟️" label="Club" value={p.club || "—"} />
          <Tile emoji="📍" label="Rayon" value={formatRayon(p.rayon_km)} />
          <Tile
            emoji="📞"
            label="Téléphone"
            value={p.phone || "—"}
            onPress={p.phone ? () => Linking.openURL(`tel:${p.phone}`) : null}
          />
        </View>
      </View>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function formatRayon(v) {
  if (v == null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (n === 99) return "+30 km";
  return `${n} km`;
}

function Tile({ emoji, label, value, hint, onPress }) {
  const content = (
    <>
      <Text style={s.tileEmoji}>{emoji}</Text>
      <Text style={s.tileValue}>{value}</Text>
      <Text style={s.tileLabel}>{hint ? `${label} · ${hint}` : label}</Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [s.tile, pressed && { opacity: 0.7 }]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={s.tile}>{content}</View>;
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 16, gap: 12, backgroundColor: "white" },

  backBtn: {
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: "flex-start",
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  backTxt: { color: BRAND, fontWeight: "700" },

  hero: { alignItems: "center", gap: 8, marginBottom: 12 },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: "#f3f4f6" },
  avatarFallback: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: "#eaf2ff", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: BRAND },
  initial: { fontSize: 48, fontWeight: "800", color: BRAND },
  title: { fontSize: 22, fontWeight: "800", color: BRAND, textAlign: "center" },
  subtitle: { fontSize: 13, color: "#6b7280", textAlign: "center" },

  card: { backgroundColor: "white", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 12, gap: 12 },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: "#111827" },

  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  tile: { width: "47%", borderWidth: 1, borderColor: "#eef2f7", borderRadius: 12, paddingVertical: 14, alignItems: "center", gap: 6, backgroundColor: "#fafafa" },
  tileEmoji: { fontSize: 28 },
  tileValue: { fontSize: 18, fontWeight: "800", color: BRAND },
  tileLabel: { fontSize: 12, color: "#6b7280", textAlign: "center" },
});