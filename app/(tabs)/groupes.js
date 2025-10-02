// app/(tabs)/groupes.js
import { FontAwesome, Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View
} from "react-native";

import { useActiveGroup } from "../../lib/activeGroup";
import { supabase } from "../../lib/supabase";
import { press } from "../../lib/uiSafe";

async function hapticSelect() {
  try {
    const available = await (Haptics.isAvailableAsync?.() ?? Promise.resolve(false));
    if (available) {
      if (Platform.OS === "ios") {
        // Plus perceptible que selectionAsync
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else {
        // Android: expo-haptics route si dispo
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      return;
    }
  } catch {}
  // Fallback vibration court mais perceptible
  try {
    Vibration.vibrate(30);
  } catch {}
}

const BRAND = "#1a4b97";
const FALLBACK_WEB_BASE = "https://syncpadel.app";

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
  const nav = useRouter();

  // --- Auth guard ---
  const [authChecked, setAuthChecked] = useState(false);
  const [meId, setMeId] = useState(null);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      (async () => {
        const { data } = await supabase.auth.getUser();
        const uid = data?.user?.id ?? null;
        if (!uid) {
          nav.replace("/(auth)/signin");
          return;
        }
        if (mounted) {
          setMeId(uid);
          setAuthChecked(true);
        }
      })();
      return () => {
        mounted = false;
      };
    }, [nav])
  );

  // --- Données groupes ---
  const [groups, setGroups] = useState({ mine: [], open: [] });
  const [loading, setLoading] = useState(true);

  const [members, setMembers] = useState([]);
  const [membersModalVisible, setMembersModalVisible] = useState(false);

  const [qrVisible, setQrVisible] = useState(false);
  const [qrUrl, setQrUrl] = useState("");

  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminLoading, setIsAdminLoading] = useState(true);

  const loadGroups = useCallback(async () => {
    try {
      setLoading(true);
      const { data: u } = await supabase.auth.getUser();
      const me = u?.user?.id;
      if (!me) return;

      const { data: myMemberships, error: eMemb } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", me);
      if (eMemb) throw eMemb;
      const myIds = [...new Set((myMemberships ?? []).map((r) => r.group_id))];

      let myGroups = [];
      if (myIds.length) {
        const { data, error } = await supabase
          .from("groups")
          .select("id, name, avatar_url, visibility, join_policy, created_by")
          .in("id", myIds)
          .order("created_at", { ascending: false });
        if (error) throw error;
        myGroups = data ?? [];
      }

      const { data: openPublic, error: eOpen } = await supabase
         .from("groups")
         .select("id, name, avatar_url, visibility, join_policy")
         .ilike("visibility", "public"); // ← gère 'Public', 'PUBLIC', etc.
      if (eOpen) throw eOpen;
        const openList = (openPublic ?? [])
          .map(g => ({
            ...g,
            visibility: String(g.visibility || "").toLowerCase(),
            join_policy: String(g.join_policy || "").toLowerCase(),
          }))
          .filter((g) => !myIds.includes(g.id));
      console.log("[Groupes] openPublic count =", openPublic?.length, openPublic?.slice?.(0,3));

      setGroups({ mine: myGroups, open: openList });
    } catch (e) {
      Alert.alert("Erreur", e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authChecked) loadGroups();
  }, [authChecked, loadGroups]);

  // Membres & droits admin du groupe actif
  const loadMembersAndAdmin = useCallback(
    async (groupId) => {
      setMembers([]);
      setIsAdmin(false);
      setIsAdminLoading(true);

      if (!groupId) {
        setIsAdminLoading(false);
        return;
      }
      try {
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

        if (meId) {
          const { data: meRow, error: eMe } = await supabase
            .from("group_members")
            .select("role")
            .eq("group_id", groupId)
            .eq("user_id", meId)
            .maybeSingle();
          if (eMe) throw eMe;
          setIsAdmin(meRow?.role === "admin");
        }
      } catch (e) {
        Alert.alert("Erreur", e?.message ?? String(e));
      } finally {
        setIsAdminLoading(false);
      }
    },
    [meId]
  );

  useEffect(() => {
    if (authChecked) loadMembersAndAdmin(activeGroup?.id ?? null);
  }, [authChecked, activeGroup?.id, loadMembersAndAdmin]);

  // --- Activer un groupe ---
  const onActivate = useCallback(async (g) => {
    try {
      if (!g?.id) return;

      console.log("[Groupes] onActivate pressed →", g.id, g.name);

      // 1) Met à jour l'état global immédiatement
      setActiveGroup(g);

      // 2) Persiste localement l'ID pour fallback côté Semaine
      try {
        await AsyncStorage.setItem("active_group_id", String(g.id));
      } catch (err) {
        console.warn("[Groupes] AsyncStorage.setItem failed:", err?.message || err);
      }

      // 3) Persiste (best-effort) dans le profil
      try {
        const { data: u } = await supabase.auth.getUser();
        const uid = u?.user?.id;
        if (uid) {
          await supabase
            .from("profiles")
            .update({ active_group_id: g.id })
            .eq("id", uid);
        }
      } catch (err) {
        console.warn("[Groupes] persist active_group_id failed:", err?.message || err);
      }

      // 4) Recharge le contexte membres/admin pour ce groupe
      await loadMembersAndAdmin(g.id);

      // 5) Informe le reste de l'app (si des écrans écoutent cet event)
      try {
        DeviceEventEmitter.emit("ACTIVE_GROUP_CHANGED", { groupId: g.id });
      } catch {}

      // 6) Feedback utilisateur (uniquement haptique / vibrate)
      await hapticSelect();

    } catch (e) {
      console.error("[Groupes] onActivate error:", e);
      Alert.alert("Erreur", e?.message ?? String(e)); // garde uniquement les alertes d'erreur
    }
  }, [setActiveGroup, loadMembersAndAdmin]);

  // --- Invites / QR / Avatar / Rejoindre public ---
  const buildInviteDeepLink = useCallback((groupId) => {
    const deep = `padelsync://join?group_id=${groupId}`;
    const web = `${FALLBACK_WEB_BASE}/join?group_id=${groupId}`;
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
      const arrayBuffer = blob.arrayBuffer
        ? await blob.arrayBuffer()
        : await new Response(blob).arrayBuffer();

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
      const refreshed = (groups.mine ?? []).find((g) => g.id === activeGroup.id);
      if (refreshed) setActiveGroup(refreshed);

      Alert.alert("OK", "Avatar du groupe mis à jour.");
    } catch (e) {
      Alert.alert("Erreur avatar", e?.message ?? String(e));
    }
  }, [activeGroup?.id, isAdmin, groups, loadGroups, setActiveGroup]);

  const onJoinPublic = useCallback(
    async (groupId) => {
      try {
        const { data: u } = await supabase.auth.getUser();
        const me = u?.user?.id;
        const { error } = await supabase
          .from("group_members")
          .insert({ group_id: groupId, user_id: me, role: "member" });
        if (error) throw error;
        await loadGroups();
        const { data: joined } = await supabase
          .from("groups")
          .select("id, name, avatar_url")
          .eq("id", groupId)
          .single();
        setActiveGroup(joined);
        await loadMembersAndAdmin(groupId);
        Alert.alert("Bienvenue 👍", "Tu as rejoint le groupe !");
      } catch (e) {
        Alert.alert("Impossible de rejoindre", e?.message ?? String(e));
      }
    },
    [loadGroups, setActiveGroup, loadMembersAndAdmin]
  );
  const onLeaveGroup = useCallback(() => {
    if (!activeGroup?.id) return;

    const groupId = activeGroup.id;
    const groupName = activeGroup.name || "Ce groupe";

    const doLeave = async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        const me = u?.user?.id;
        if (!me) return;

        const { error } = await supabase
          .from("group_members")
          .delete()
          .eq("group_id", groupId)
          .eq("user_id", me);
        if (error) throw error;

        setActiveGroup(null);
        await AsyncStorage.removeItem("active_group_id");
        await loadGroups();

        Alert.alert("Tu as quitté le groupe", groupName);
      } catch (e) {
        Alert.alert("Impossible de quitter", e?.message ?? String(e));
      }
    };

    Alert.alert(
      "Quitter le groupe",
      `Es-tu sûr(e) de vouloir quitter "${groupName}" ?`,
      [
        {
          text: "Annuler",
          style: "cancel",
        },
        {
          text: "Quitter",
          style: "destructive",
          onPress: doLeave,
        },
      ]
    );
  }, [activeGroup, setActiveGroup, loadGroups]);

  // --- Création de groupe ---
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createVisibility, setCreateVisibility] = useState("private");
  const [createJoinPolicy, setCreateJoinPolicy] = useState("invite");

  const onCreateGroup = useCallback(() => {
    setCreateName("");
    setCreateVisibility("private");
    setCreateJoinPolicy("invite");
    setShowCreate(true);
  }, []);

  const doCreateGroup = useCallback(async () => {
    const n = (createName || "").trim();
    if (!n) return Alert.alert("Nom requis", "Entre un nom de groupe.");
    try {
      const { data: u } = await supabase.auth.getUser();
      const me = u?.user?.id;
      const visibility = createVisibility;
      const join_policy = createVisibility === "public" ? createJoinPolicy : "invite";

      const { data, error } = await supabase
        .from("groups")
        .insert({ name: n, created_by: me, visibility, join_policy })
        .select("id, name, avatar_url")
        .single();
      if (error) throw error;

      try {
        await supabase
          .from("group_members")
          .insert({ group_id: data.id, user_id: me, role: "admin" });
      } catch {}

      await loadGroups();
      setActiveGroup(data);
      await loadMembersAndAdmin(data.id);
      setShowCreate(false);
      Alert.alert("Groupe créé", `“${n}” est maintenant actif.`);
    } catch (e) {
      Alert.alert("Erreur création", e?.message ?? String(e));
    }
  }, [createName, createVisibility, createJoinPolicy, loadGroups, setActiveGroup, loadMembersAndAdmin]);

  const { activeRecord } = useMemo(() => {
    const a = (groups.mine ?? []).find((g) => g.id === activeGroup?.id) || null;
    return { activeRecord: a };
  }, [groups, activeGroup?.id]);

  if (!authChecked || loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, position: "relative" }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14 }}
        keyboardShouldPersistTaps="handled"
        {...(Platform.OS === "web" ? {} : { pointerEvents: "box-none" })}
      >
        {/* Groupe actif */}
        {activeRecord ? (
          <View style={[s.card, s.activeCard]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Avatar url={activeRecord.avatar_url} fallback={activeRecord.name} size={56} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "800", fontSize: 18, color: "#111827" }}>
                  {activeRecord.name}
                </Text>
                <Text style={{ color: BRAND, marginTop: 2 }}>
                  {`Groupe actif · ${members.length} membre${members.length > 1 ? "s" : ""}`}
                </Text>
              </View>
            </View>
            {/* Info-badges row: visibility & join policy */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: BRAND, backgroundColor: "#eaf2ff" }}>
                <Text style={{ color: BRAND, fontWeight: "800", fontSize: 12 }}>
                  {activeRecord.visibility === "public" ? "Public" : "Privé"}
                </Text>
              </View>
              {activeRecord.visibility === "public" ? (
                <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: "#93c5fd", backgroundColor: "#eff6ff" }}>
                  <Text style={{ color: "#1d4ed8", fontWeight: "700", fontSize: 12 }}>
                    {activeRecord.join_policy === "open" ? "Ouvert" : "Sur demande"}
                  </Text>
                </View>
              ) : null}
            </View>
            {/* Invite buttons row */}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <Pressable onPress={press("invite-link", onInviteLink)} style={[s.btn, { backgroundColor: "#ff8c00", flex: 1 }, Platform.OS === "web" && { cursor: "pointer" }]}>
                <Text style={s.btnTxt}>Inviter (lien)</Text>
              </Pressable>
              <Pressable onPress={press("invite-qr", onInviteQR)} style={[s.btn, { backgroundColor: "#111827", flex: 1 }, Platform.OS === "web" && { cursor: "pointer" }]}>
                <Text style={s.btnTxt}>QR</Text>
              </Pressable>
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
                      onPress={press("open-profile", () => router.push(`/profiles/${m.id}`))}
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

            {/* Actions groupe actif */}
            <View style={{ flexDirection: "row", marginTop: 12 }}>
              <Pressable onPress={press("open-members-modal", () => setMembersModalVisible(true))} style={[s.btn, { backgroundColor: "#f3f4f6", flex: 1 }, Platform.OS === "web" && { cursor: "pointer" }]}>
                <Text style={[s.btnTxt, { color: "#111827" }]}>Voir les membres ({members.length})</Text>
              </Pressable>
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <Pressable
                onPress={press("change-group-avatar", onChangeGroupAvatar)}
                disabled={isAdminLoading ? true : !isAdmin}
                style={[
                  s.btn,
                  { flex: 1, flexDirection: "row", justifyContent: "center", gap: 6 },
                  isAdminLoading ? { backgroundColor: "#cbd5e1" } : isAdmin ? { backgroundColor: BRAND } : { backgroundColor: "#d1d5db" },
                  Platform.OS === "web" && { cursor: isAdminLoading || !isAdmin ? "not-allowed" : "pointer" }
                ]}
              >
                {isAdminLoading ? <ActivityIndicator color="#fff" /> : !isAdmin ? <Text style={{ color: "white", fontSize: 14 }}>🔒</Text> : null}
                <Text style={s.btnTxt}>Changer avatar</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <Pressable onPress={press("leave-group", onLeaveGroup)} style={[s.btn, { backgroundColor: "#dc2626", flex: 1 }, Platform.OS === "web" && { cursor: "pointer" }]}>
                <Text style={s.btnTxt}>Quitter le groupe</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={[s.card, { alignItems: "center" }]}>
            <Text style={{ color: "#6b7280" }}>Aucun groupe actif.</Text>
          </View>
        )}

        {/* Mes groupes */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Mes groupes</Text>
        </View>
        {(groups.mine ?? []).length === 0 ? (
          <View style={[s.card, { alignItems: "center" }]}>
            <Text style={{ color: "#6b7280" }}>Tu n’as pas encore de groupe.</Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {(groups.mine ?? []).map((g) => (
              <View key={g.id} style={s.rowCard} pointerEvents="box-none">
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  <Avatar url={g.avatar_url} fallback={g.name} size={40} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <Text style={{ fontWeight: "700", color: "#111827" }}>{g.name}</Text>
                      </View>
                      <View style={{ marginTop: 4, flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                        {g.visibility === "public" ? (
                          <>
                            <View style={s.badgePublic}>
                              <Text style={s.badgePublicTxt}>Public</Text>
                            </View>
                            <View style={[s.badgePublic, { borderColor: "#93c5fd", backgroundColor: "#eff6ff" }]}>
                              <Text style={{ color: "#1d4ed8", fontWeight: "700", fontSize: 10 }}>
                                {g.join_policy === "open" ? "Ouvert" : "Sur demande"}
                              </Text>
                            </View>
                          </>
                        ) : (
                          <View style={s.badgePublic}>
                            <Text style={s.badgePublicTxt}>Privé</Text>
                          </View>
                        )}
                      </View>
                    </View>
                </View>
                {activeGroup?.id === g.id ? (
                  <View style={[s.btnTiny, { backgroundColor: "#d1d5db" }]}>
                    <Text style={{ color: "#111827", fontWeight: "800", fontSize: 12 }}>Actif</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={press("activate-group", () => onActivate(g))}
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Activer le groupe ${g.name}`}
                    style={[s.btnTiny, { backgroundColor: BRAND }, Platform.OS === "web" && { cursor: "pointer" }]}
                  >
                    <Text style={{ color: "white", fontWeight: "800", fontSize: 12 }}>Activer</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Groupes publics */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Groupes publics</Text>
        </View>
        {(groups.open ?? []).length === 0 ? (
          <View style={[s.card, { alignItems: "center" }]}>
            <Text style={{ color: "#6b7280" }}>Aucun groupe public disponible.</Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {(groups.open ?? []).map((g) => (
              <View key={g.id} style={s.rowCard} pointerEvents="box-none">
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  <Avatar url={g.avatar_url} fallback={g.name} size={40} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <Text style={{ fontWeight: "700", color: "#111827" }}>{g.name}</Text>
                    </View>
                    {g.visibility === "public" ? (
                      <View style={{ marginTop: 4, flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                        <View style={s.badgePublic}>
                          <Text style={s.badgePublicTxt}>Public</Text>
                        </View>
                        <View style={[s.badgePublic, { borderColor: "#93c5fd", backgroundColor: "#eff6ff" }]}>
                          <Text style={{ color: "#1d4ed8", fontWeight: "700", fontSize: 10 }}>
                            {g.join_policy === "open" ? "Ouvert" : "Sur demande"}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Pressable onPress={press("join-public", () => onJoinPublic(g.id))} style={[s.btnTiny, { backgroundColor: "#111827" }, Platform.OS === "web" && { cursor: "pointer" }]}>
                  <Text style={{ color: "white", fontWeight: "800", fontSize: 12 }}>Rejoindre</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* FAB “+” */}
      <Pressable onPress={press("fab-create-group", onCreateGroup)} style={[s.fab, Platform.OS === "web" && { cursor: "pointer" }]} >
        <Text style={{ color: "white", fontSize: 28, fontWeight: "800", lineHeight: 28 }}>＋</Text>
      </Pressable>

      {/* Modal création */}
      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView style={s.qrWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 16 }} keyboardShouldPersistTaps="handled">
            <View style={[s.qrCard, { width: 320, alignSelf: "center", alignItems: "stretch" }]}>
              <Text style={{ fontWeight: "800", marginBottom: 12 }}>Nouveau groupe</Text>
              <TextInput
                placeholder="Nom du groupe"
                value={createName}
                onChangeText={setCreateName}
                style={s.input}
                autoFocus
                returnKeyType="done"
                blurOnSubmit
                onSubmitEditing={doCreateGroup}
              />

              <Text style={{ marginTop: 12, marginBottom: 8, fontWeight: "700", color: "#111827" }}>Type de groupe</Text>

              {/* Privé */}
              <TouchableOpacity
                onPress={() => {
                  setCreateVisibility("private");
                  setCreateJoinPolicy("invite");
                }}
                style={[s.choice, createVisibility === "private" ? s.choiceActive : null]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="lock-closed-outline" size={16} color={createVisibility === "private" ? BRAND : "#374151"} />
                  <Text style={[s.choiceTxt, createVisibility === "private" ? s.choiceTxtActive : null]}>Privé</Text>
                </View>
              </TouchableOpacity>

              {/* Public (ouvert) */}
              <TouchableOpacity
                onPress={() => {
                  setCreateVisibility("public");
                  setCreateJoinPolicy("open");
                }}
                style={[s.choice, createVisibility === "public" && createJoinPolicy === "open" ? s.choiceActive : null]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="globe-outline" size={16} color={createVisibility === "public" && createJoinPolicy === "open" ? BRAND : "#374151"} />
                  <Text style={[s.choiceTxt, createVisibility === "public" && createJoinPolicy === "open" ? s.choiceTxtActive : null]}>
                    Public (ouvert)
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Public (sur demande) */}
              <TouchableOpacity
                onPress={() => {
                  setCreateVisibility("public");
                  setCreateJoinPolicy("invite");
                }}
                style={[s.choice, createVisibility === "public" && createJoinPolicy === "invite" ? s.choiceActive : null]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <FontAwesome name="handshake-o" size={16} color={createVisibility === "public" && createJoinPolicy === "invite" ? BRAND : "#374151"} />
                  <Text style={[s.choiceTxt, createVisibility === "public" && createJoinPolicy === "invite" ? s.choiceTxtActive : null]}>
                    Public (sur demande)
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
                <Pressable onPress={press("create-cancel", () => setShowCreate(false))} style={[s.btn, { backgroundColor: "#9ca3af", flex: 1 }, Platform.OS === "web" && { cursor: "pointer" }]} >
                  <Text style={s.btnTxt}>Annuler</Text>
                </Pressable>
                <Pressable onPress={press("create-confirm", doCreateGroup)} style={[s.btn, { backgroundColor: BRAND, flex: 1 }, Platform.OS === "web" && { cursor: "pointer" }]} >
                  <Text style={s.btnTxt}>Créer</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal QR */}
      <Modal visible={qrVisible} transparent animationType="fade" onRequestClose={() => setQrVisible(false)}>
        <View style={s.qrWrap}>
          <View style={s.qrCard}>
            <Text style={{ fontWeight: "800", marginBottom: 12 }}>Scanner pour rejoindre</Text>
            {qrUrl ? <Image source={{ uri: qrUrl }} style={{ width: 240, height: 240, borderRadius: 12 }} /> : <ActivityIndicator />}
            <Pressable onPress={press("close-qr", () => setQrVisible(false))} style={[s.btn, { backgroundColor: BRAND, marginTop: 14 }, Platform.OS === "web" && { cursor: "pointer" }]} >
              <Text style={s.btnTxt}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Modal membres */}
      <Modal visible={membersModalVisible} transparent animationType="slide" onRequestClose={() => setMembersModalVisible(false)}>
        <View style={s.qrWrap}>
          <View style={[s.qrCard, { width: 340, alignItems: "stretch" }]}>
            <Text style={{ fontWeight: "800", marginBottom: 12 }}>Membres ({members.length})</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {members.map((m) => (
                <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 }}>
                  <Avatar url={m.avatar_url} fallback={m.name} size={36} level={m.niveau} onPress={press("open-profile", () => router.push(`/profiles/${m.id}`))} />
                  <Text style={{ flex: 1, fontWeight: "600" }}>{m.name}</Text>
                  {m.is_admin && <Text style={{ color: BRAND, fontWeight: "800" }}>Admin</Text>}
                </View>
              ))}
            </ScrollView>
            <Pressable onPress={press("close-members", () => setMembersModalVisible(false))} style={[s.btn, { backgroundColor: BRAND, marginTop: 14 }, Platform.OS === "web" && { cursor: "pointer" }]} >
              <Text style={s.btnTxt}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  sectionHeader: { marginTop: 4, marginBottom: 2 },
  sectionTitle: { color: "#111827", fontWeight: "800" },
  card: { backgroundColor: "white", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 12, gap: 8 },
  activeCard: { backgroundColor: "#b0d4fb", borderColor: "#0d3186" },
  rowCard: { backgroundColor: "white", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  btn: { paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  btnTxt: { color: "white", fontWeight: "800" },
  btnTiny: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  choice: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#fff" },
  choiceActive: { borderColor: BRAND, backgroundColor: "#eaf2ff" },
  choiceTxt: { color: "#374151", fontWeight: "700" },
  choiceTxtActive: { color: BRAND },
  badgePublic: { borderWidth: 1, borderColor: BRAND, backgroundColor: "#eaf2ff", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  badgePublicTxt: { color: BRAND, fontWeight: "800", fontSize: 10 },
  qrWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  qrCard: { width: 300, borderRadius: 12, backgroundColor: "white", padding: 16, alignItems: "center" },
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
  androidPromptWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  androidPromptCard: { width: 300, borderRadius: 12, backgroundColor: "white", padding: 16 },
  input: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: "#111827", backgroundColor: "#f9fafb" },
});