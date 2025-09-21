// app/(tabs)/groupes.js
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { useActiveGroup } from "../../lib/activeGroup";
import { supabase } from "../../lib/supabase";

const BRAND = "#1a4b97";
const FALLBACK_WEB_BASE = "https://padelsync.app";

function Avatar({ url, fallback, size = 48, level, onPress }) {
  const letter = (fallback || "?").trim().charAt(0).toUpperCase();
  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <View style={{ width: size, height: size }}>
        {url ? (
          <Image
            source={{ uri: url }}
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: "#eef2f7",
            }}
          />
        ) : (
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
            <Text style={{ color: BRAND, fontWeight: "800", fontSize: 18 }}>
              {letter}
            </Text>
          </View>
        )}
        {level ? (
          <View
            style={{
              position: "absolute",
              bottom: -2,
              right: -2,
              backgroundColor: BRAND,
              borderRadius: 8,
              paddingHorizontal: 4,
              paddingVertical: 1,
              minWidth: 22,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "white", fontSize: 10, fontWeight: "700" }}>
              {level}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function GroupesScreen() {
  const { activeGroup, setActiveGroup } = useActiveGroup();

  const [meId, setMeId] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  const [members, setMembers] = useState([]);
  const [membersModalVisible, setMembersModalVisible] = useState(false);

  const [qrVisible, setQrVisible] = useState(false);
  const [qrUrl, setQrUrl] = useState("");

  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminLoading, setIsAdminLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      setMeId(u?.user?.id ?? null);
    })();
  }, []);

  const loadGroups = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("groups")
        .select("id, name, avatar_url")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setGroups(data ?? []);
    } catch (e) {
      Alert.alert("Erreur", e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  // Charge membres ET calcule isAdmin pour le groupe actif
  const loadMembersAndAdmin = useCallback(
    async (groupId) => {
      setMembers([]);
      setIsAdmin(false);
      setIsAdminLoading(true);

      if (!groupId) { setIsAdminLoading(false); return; }
      try {
        // 1) Roles des membres
        const { data: gms, error: eGM } = await supabase
          .from("group_members")
          .select("user_id, role")
          .eq("group_id", groupId);
        if (eGM) throw eGM;

        const ids = [...new Set((gms ?? []).map((gm) => gm.user_id))];
        let mapped = [];
        if (ids.length) {
          const { data: profs, error: eP } = await supabase
            .from("profiles")
            .select("id, display_name, avatar_url, niveau")
            .in("id", ids);
          if (eP) throw eP;

          const profById = Object.fromEntries((profs ?? []).map((p) => [p.id, p]));
          mapped = (gms ?? []).map((gm) => {
            const p = profById[gm.user_id];
            return {
              id: gm.user_id,
              name: p?.display_name || "Joueur",
              avatar_url: p?.avatar_url ?? null,
              niveau: p?.niveau ?? null,
              is_admin: gm.role === "admin",
            };
          });
        }
        setMembers(mapped);

        // 2) isAdmin (pour l’utilisateur courant)
        if (meId) {
          const { data: meRow, error: eMe } = await supabase
            .from("group_members")
            .select("role")
            .eq("group_id", groupId)
            .eq("user_id", meId)
            .maybeSingle();
          if (eMe) throw eMe;
          setIsAdmin(meRow?.role === "admin");
        } else {
          setIsAdmin(false);
        }
      } catch (e) {
        Alert.alert("Erreur", e?.message ?? String(e));
        setIsAdmin(false);
      } finally {
        setIsAdminLoading(false);
      }
    },
    [meId]
  );

  // Recharger quand groupe actif change
  useEffect(() => {
    loadMembersAndAdmin(activeGroup?.id ?? null);
  }, [activeGroup?.id, loadMembersAndAdmin]);

  const onActivate = useCallback(
    (g) => {
      setActiveGroup(g);
      // l’effet rechargera les membres
    },
    [setActiveGroup]
  );

  const buildInviteDeepLink = useCallback((groupId) => {
    const deep = `padelsync://join?group_id=${groupId}`; // utilise le scheme natif défini dans app.config.js
    const web = `${FALLBACK_WEB_BASE}/join?group_id=${groupId}`; // fallback web
    return { deepLink: deep, webLink: web };
  }, []);

  const onInviteLink = useCallback(async () => {
    if (!activeGroup?.id) return;
    try {
      const { deepLink, webLink } = buildInviteDeepLink(activeGroup.id);
      const message = `Rejoins mon groupe Padel Sync :\n• App : ${deepLink}\n• Web : ${webLink}`;
      await Share.share({ message });
    } catch (e) {
      Alert.alert("Partage impossible", e?.message ?? String(e));
    }
  }, [activeGroup?.id, buildInviteDeepLink]);

  const onInviteQR = useCallback(() => {
    if (!activeGroup?.id) return;
    const { deepLink } = buildInviteDeepLink(activeGroup.id);
    const qr = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(deepLink)}`;
    setQrUrl(qr);
    setQrVisible(true);
  }, [activeGroup?.id, buildInviteDeepLink]);

  const onChangeGroupAvatar = useCallback(async () => {
    if (!activeGroup?.id) return;

    if (!isAdmin) {
      Alert.alert("Action réservée", "Seuls les admins peuvent changer l’avatar du groupe.");
      return;
    }

    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission requise", "Autorise l'accès aux photos pour choisir un avatar.");
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;

      const uri = res.assets[0].uri;
      const fr = await fetch(uri);
      const blob = await fr.blob();
      const arrayBuffer = blob.arrayBuffer ? await blob.arrayBuffer() : await new Response(blob).arrayBuffer();

      const ts = Date.now();
      const path = `${activeGroup.id}/avatar-${ts}.jpg`;
      const contentType = blob.type || "image/jpeg";

      const { error: upErr } = await supabase.storage
        .from("group-avatars")
        .upload(path, arrayBuffer, { contentType, upsert: true });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("group-avatars").getPublicUrl(path);
      const publicUrl = pub?.publicUrl ?? null;
      if (!publicUrl) throw new Error("Impossible d'obtenir l'URL publique.");

      const { error: eUpd } = await supabase
        .from("groups")
        .update({ avatar_url: publicUrl })
        .eq("id", activeGroup.id);
      if (eUpd) throw eUpd;

      await loadGroups();
      const refreshed = (groups ?? []).find((g) => g.id === activeGroup.id);
      if (refreshed) setActiveGroup(refreshed);

      Alert.alert("OK", "Avatar du groupe mis à jour.");
    } catch (e) {
      Alert.alert("Erreur avatar", e?.message ?? String(e));
    }
  }, [activeGroup?.id, isAdmin, groups, loadGroups, setActiveGroup]);

  // Création de groupe (FAB)
  const onCreateGroup = useCallback(() => {
    const doCreate = async (name) => {
      const n = (name || "").trim();
      if (!n) return;
      try {
        const { data, error } = await supabase
          .from("groups")
          .insert({ name: n })
          .select("id, name, avatar_url")
          .single();
        if (error) throw error;

        // se mettre admin dans ce groupe (si RLS le permet via trigger/policy, sinon ignorer)
        try {
          await supabase.from("group_members").insert({ group_id: data.id, user_id: meId, role: "admin" });
        } catch {}

        await loadGroups();
        setActiveGroup(data);
        Alert.alert("Groupe créé", `“${n}” est maintenant actif.`);
      } catch (e) {
        Alert.alert("Erreur création", e?.message ?? String(e));
      }
    };

    if (Platform.OS === "ios" && Alert.prompt) {
      Alert.prompt("Nouveau groupe", "Nom du groupe :", [
        { text: "Annuler", style: "cancel" },
        { text: "Créer", onPress: doCreate },
      ], "plain-text");
    } else {
      // mini prompt Android
      let temp = "";
      const AndroidPrompt = () => (
        <View style={s.androidPromptWrap}>
          <View style={s.androidPromptCard}>
            <Text style={{ fontWeight: "800", marginBottom: 10 }}>Nouveau groupe</Text>
            <TextInput
              placeholder="Nom du groupe"
              onChangeText={(t) => (temp = t)}
              style={s.input}
              autoFocus
            />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              <Pressable onPress={() => setShowPrompt(false)} style={[s.btn, { backgroundColor: "#9ca3af", flex: 1 }]}>
                <Text style={s.btnTxt}>Annuler</Text>
              </Pressable>
              <Pressable onPress={() => { setShowPrompt(false); doCreate(temp); }} style={[s.btn, { backgroundColor: BRAND, flex: 1 }]}>
                <Text style={s.btnTxt}>Créer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      );
      // rendu léger inline : on ouvre une mini modal locale
      setPromptRenderer(() => AndroidPrompt);
      setShowPrompt(true);
    }
  }, [meId, loadGroups, setActiveGroup]);

  // état local pour mini prompt Android
  const [showPrompt, setShowPrompt] = useState(false);
  const [PromptRenderer, setPromptRenderer] = useState(null);

  const { activeRecord, others } = useMemo(() => {
    const a = groups.find((g) => g.id === activeGroup?.id) || null;
    const rest = (groups ?? []).filter((g) => g.id !== activeGroup?.id);
    return { activeRecord: a, others: rest };
  }, [groups, activeGroup?.id]);

  if (loading) return <View style={s.center}><ActivityIndicator /></View>;

  return (
    <View style={{ flex: 1, position: "relative" }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        {activeRecord ? (
          <View style={[s.card, s.activeCard]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Avatar url={activeRecord.avatar_url} fallback={activeRecord.name} size={56} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "800", fontSize: 18, color: "#111827" }}>{activeRecord.name}</Text>
                <Text style={{ color: BRAND, marginTop: 2 }}>Groupe actif</Text>
              </View>
            </View>

            {/* Membres */}
            <View style={{ marginTop: 12 }}>
              {members?.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {members.slice(0, 20).map((m) => (
                    <Avatar
                      key={m.id}
                      url={m.avatar_url}
                      fallback={m.name}
                      level={m.niveau}
                      onPress={() => router.push(`/profiles/${m.id}`)}
                    />
                  ))}
                  {members.length > 20 ? (
                    <View style={{ alignItems: "center", justifyContent: "center", paddingHorizontal: 8 }}>
                      <Text style={{ color: "#6b7280", fontWeight: "700" }}>+{members.length - 20}</Text>
                    </View>
                  ) : null}
                </ScrollView>
              ) : (
                <Text style={{ color: "#6b7280" }}>Aucun membre trouvé.</Text>
              )}
            </View>

            {/* Ligne 1 : Voir membres */}
            <View style={{ flexDirection: "row", marginTop: 12 }}>
              <Pressable
                onPress={() => setMembersModalVisible(true)}
                style={[s.btn, { backgroundColor: "#f3f4f6", flex: 1 }]}
              >
                <Text style={[s.btnTxt, { color: "#111827" }]}>
                  Voir les membres ({members.length})
                </Text>
              </Pressable>
            </View>

            {/* Ligne 2 : Changer avatar (verrou qu’après calcul explicite) */}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <Pressable
                onPress={onChangeGroupAvatar}
                disabled={isAdminLoading ? true : !isAdmin}
                style={[
                  s.btn,
                  { flex: 1, flexDirection: "row", justifyContent: "center", gap: 6 },
                  isAdminLoading ? { backgroundColor: "#cbd5e1" }
                    : isAdmin ? { backgroundColor: BRAND }
                    : { backgroundColor: "#d1d5db" },
                ]}
              >
                {isAdminLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : !isAdmin ? (
                  <Text style={{ color: "white", fontSize: 14 }}>🔒</Text>
                ) : null}
                <Text style={s.btnTxt}>Changer avatar</Text>
              </Pressable>
            </View>

            {/* Ligne 3 : Inviter */}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <Pressable onPress={onInviteLink} style={[s.btn, { backgroundColor: "#ff8c00", flex: 1 }]}>
                <Text style={s.btnTxt}>Inviter (lien)</Text>
              </Pressable>
              <Pressable onPress={onInviteQR} style={[s.btn, { backgroundColor: "#111827", flex: 1 }]}>
                <Text style={s.btnTxt}>QR</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={[s.card, { alignItems: "center" }]}>
            <Text style={{ color: "#6b7280" }}>Aucun groupe actif.</Text>
          </View>
        )}

        {/* Autres groupes */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Mes autres groupes</Text>
        </View>
        {others.length === 0 ? (
          <View style={[s.card, { alignItems: "center" }]}>
            <Text style={{ color: "#6b7280" }}>Tu n’as pas d’autre groupe.</Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {others.map((g) => (
              <View key={g.id} style={s.rowCard}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  <Avatar url={g.avatar_url} fallback={g.name} size={40} />
                  <Text style={{ fontWeight: "700", color: "#111827" }}>{g.name}</Text>
                </View>
                <Pressable onPress={() => onActivate(g)} style={[s.btnTiny, { backgroundColor: BRAND }]}>
                  <Text style={{ color: "white", fontWeight: "800", fontSize: 12 }}>Activer</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* FAB “+” — toujours visible */}
      <Pressable onPress={onCreateGroup} style={s.fab}>
        <Text style={{ color: "white", fontSize: 28, fontWeight: "800", lineHeight: 28 }}>＋</Text>
      </Pressable>

      {/* Modal QR */}
      <Modal visible={qrVisible} transparent animationType="fade" onRequestClose={() => setQrVisible(false)}>
        <View style={s.qrWrap}>
          <View style={s.qrCard}>
            <Text style={{ fontWeight: "800", marginBottom: 12 }}>Scanner pour rejoindre</Text>
            {qrUrl ? (
              <Image source={{ uri: qrUrl }} style={{ width: 240, height: 240, borderRadius: 12 }} />
            ) : (
              <ActivityIndicator />
            )}
            <Pressable onPress={() => setQrVisible(false)} style={[s.btn, { backgroundColor: BRAND, marginTop: 14 }]}>
              <Text style={s.btnTxt}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Mini prompt Android */}
      <Modal visible={showPrompt} transparent animationType="fade" onRequestClose={() => setShowPrompt(false)}>
        {PromptRenderer ? <PromptRenderer /> : null}
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  sectionHeader: { marginTop: 4, marginBottom: 2 },
  sectionTitle: { color: "#111827", fontWeight: "800" },

  card: { backgroundColor: "white", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 12, gap: 8 },
  activeCard: { backgroundColor: "#b0d4fb", borderColor: "#0d3186" }, // fond différencié groupe actif

  rowCard: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  btn: { paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  btnTxt: { color: "white", fontWeight: "800" },
  btnTiny: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },

  // QR modal
  qrWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  qrCard: { width: 300, borderRadius: 12, backgroundColor: "white", padding: 16, alignItems: "center" },

  // FAB "+"
  fab: {
    position: "absolute",
    right: 18,
    bottom: 22,
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    backgroundColor: "#2fc249",
    borderColor: "#6e935b",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },

  // Prompt Android light
  androidPromptWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  androidPromptCard: { width: 300, borderRadius: 12, backgroundColor: "white", padding: 16 },
  input: {
    borderWidth: 1, borderColor: "#d1d5db",
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: "#111827", backgroundColor: "#f9fafb",
  },
});