// app/(tabs)/groupes.js
import { FontAwesome, Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  View
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
  // Lecture + setter via contexte
  const { activeGroup, setActiveGroup } = useActiveGroup();

  const [meId, setMeId] = useState(null);
  // \uD83D\uDD04 state structuré : { mine: [], open: [] }
  const [groups, setGroups] = useState({ mine: [], open: [] });
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
      // 1) Mes appartenances
      const { data: u } = await supabase.auth.getUser();
      const me = u?.user?.id;
      const { data: myMemberships, error: eMemb } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", me);
      if (eMemb) throw eMemb;
      const myIds = [...new Set((myMemberships ?? []).map((r) => r.group_id))];

      // 2) Mes groupes (où je suis membre)
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

      // 3) Groupes publics ouverts que je n'ai pas encore rejoints
      const { data: openPublic, error: eOpen } = await supabase
        .from("groups")
        .select("id, name, avatar_url, visibility")
        .eq("visibility", "public")
        .eq("join_policy", "open");
      if (eOpen) throw eOpen;
      const openList = (openPublic ?? []).filter((g) => !myIds.includes(g.id));

      setGroups({ mine: myGroups, open: openList });
    } catch (e) {
      Alert.alert("Erreur", e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

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
    const deep = `padelsync://join?group_id=${groupId}`; // scheme natif
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

  // Rejoindre un groupe public ouvert
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
        Alert.alert("Bienvenue 👍", "Tu as rejoint le groupe !");
      } catch (e) {
        Alert.alert("Impossible de rejoindre", e?.message ?? String(e));
      }
    },
    [loadGroups, setActiveGroup]
  );

  // état local pour mini prompt Android
  const [showPrompt, setShowPrompt] = useState(false);
  const [PromptRenderer, setPromptRenderer] = useState(null);

  // Création de groupe (modal avec choix Public/Privé)
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createVisibility, setCreateVisibility] = useState("private"); // 'public' | 'private'
  const [createJoinPolicy, setCreateJoinPolicy] = useState("invite");   // 'open' | 'invite'

  const onCreateGroup = useCallback(() => {
    // ouvre la modal custom (compatible iOS/Android)
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
      const visibility = createVisibility; // 'public' | 'private'
      const join_policy = createVisibility === 'public' ? createJoinPolicy : 'invite';

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
      setShowCreate(false);
      Alert.alert("Groupe créé", `“${n}” est maintenant actif.`);
    } catch (e) {
      Alert.alert("Erreur création", e?.message ?? String(e));
    }
  }, [createName, createVisibility, createJoinPolicy, loadGroups, setActiveGroup]);

  const { activeRecord, others } = useMemo(() => {
    const a = (groups.mine ?? []).find((g) => g.id === activeGroup?.id) || null;
    const rest = (groups.mine ?? []).filter((g) => g.id !== activeGroup?.id);
    return { activeRecord: a, others: rest };
  }, [groups, activeGroup?.id]);

  if (loading)
    return (
      <View style={s.center}>
        <ActivityIndicator />
      </View>
    );

  return (
    <View style={{ flex: 1, position: "relative" }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        {/* Groupe actif (carte dédiée) */}
        {activeRecord ? (
          <View style={[s.card, s.activeCard]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Avatar url={activeRecord.avatar_url} fallback={activeRecord.name} size={56} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "800", fontSize: 18, color: "#111827" }}>
                  {activeRecord.name}
                </Text>
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
              <Pressable onPress={() => setMembersModalVisible(true)} style={[s.btn, { backgroundColor: "#f3f4f6", flex: 1 }]}>
                <Text style={[s.btnTxt, { color: "#111827" }]}>Voir les membres ({members.length})</Text>
              </Pressable>
            </View>

            {/* Ligne 2 : Changer avatar */}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <Pressable
                onPress={onChangeGroupAvatar}
                disabled={isAdminLoading ? true : !isAdmin}
                style={[
                  s.btn,
                  { flex: 1, flexDirection: "row", justifyContent: "center", gap: 6 },
                  isAdminLoading ? { backgroundColor: "#cbd5e1" } : isAdmin ? { backgroundColor: BRAND } : { backgroundColor: "#d1d5db" },
                ]}
              >
                {isAdminLoading ? <ActivityIndicator color="#fff" /> : !isAdmin ? <Text style={{ color: "white", fontSize: 14 }}>🔒</Text> : null}
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

        {/* 1) Mes groupes */}
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
          <View key={g.id} style={s.rowCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              <Avatar url={g.avatar_url} fallback={g.name} size={40} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontWeight: '700', color: '#111827' }}>{g.name}</Text>
                {g.visibility === 'public' ? (
                  <View style={s.badgePublic}><Text style={s.badgePublicTxt}>Public</Text></View>
                ) : null}
              </View>
            </View>
            {activeGroup?.id === g.id ? (
              <View style={[s.btnTiny, { backgroundColor: "#d1d5db" }]}>
                <Text style={{ color: "#111827", fontWeight: "800", fontSize: 12 }}>Actif</Text>
              </View>
            ) : (
              <Pressable onPress={() => onActivate(g)} style={[s.btnTiny, { backgroundColor: BRAND }]}>
                <Text style={{ color: "white", fontWeight: "800", fontSize: 12 }}>Activer</Text>
              </Pressable>
            )}
          </View>
        ))}
          </View>
        )}

        {/* 2) Groupes publics ouverts */}
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
          <View key={g.id} style={s.rowCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              <Avatar url={g.avatar_url} fallback={g.name} size={40} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontWeight: '700', color: '#111827' }}>{g.name}</Text>
                {g.visibility === 'public' ? (
                  <View style={s.badgePublic}><Text style={s.badgePublicTxt}>Public</Text></View>
                ) : null}
              </View>
            </View>
            <Pressable onPress={() => onJoinPublic(g.id)} style={[s.btnTiny, { backgroundColor: "#111827" }]}>
              <Text style={{ color: "white", fontWeight: "800", fontSize: 12 }}>Rejoindre</Text>
            </Pressable>
          </View>
        ))}
          </View>
        )}
      </ScrollView>

      {/* FAB “+” */}
      <Pressable onPress={onCreateGroup} style={s.fab}>
        <Text style={{ color: "white", fontSize: 28, fontWeight: "800", lineHeight: 28 }}>＋</Text>
      </Pressable>

      {/* Modal création de groupe (Public/Privé) */}
      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView
          style={s.qrWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[s.qrCard, { width: 320, alignSelf: 'center', alignItems: 'stretch' }]}>            
              <Text style={{ fontWeight: '800', marginBottom: 12 }}>Nouveau groupe</Text>
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

              <Text style={{ marginTop: 12, marginBottom: 8, fontWeight: '700', color: '#111827' }}>Type de groupe</Text>
              <View style={{ flexDirection: 'column', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => { setCreateVisibility('private'); setCreateJoinPolicy('invite'); }}
                  style={[s.choice, (createVisibility === 'private') ? s.choiceActive : null]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={16}
                      color={(createVisibility === 'private') ? BRAND : '#374151'}
                    />
                    <Text style={[s.choiceTxt, (createVisibility === 'private') ? s.choiceTxtActive : null]}>Privé</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setCreateVisibility('public'); setCreateJoinPolicy('open'); }}
                  style={[s.choice, (createVisibility === 'public' && createJoinPolicy === 'open') ? s.choiceActive : null]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons
                      name="globe-outline"
                      size={16}
                      color={(createVisibility === 'public' && createJoinPolicy === 'open') ? BRAND : '#374151'}
                    />
                    <Text style={[s.choiceTxt, (createVisibility === 'public' && createJoinPolicy === 'open') ? s.choiceTxtActive : null]}>Public (ouvert)</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setCreateVisibility('public'); setCreateJoinPolicy('invite'); }}
                  style={[s.choice, (createVisibility === 'public' && createJoinPolicy === 'invite') ? s.choiceActive : null]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <FontAwesome
                      name="handshake-o"
                      size={16}
                      color={(createVisibility === 'public' && createJoinPolicy === 'invite') ? BRAND : '#374151'}
                    />
                    <Text style={[s.choiceTxt, (createVisibility === 'public' && createJoinPolicy === 'invite') ? s.choiceTxtActive : null]}>Public (sur demande)</Text>
                  </View>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                <Pressable onPress={() => setShowCreate(false)} style={[s.btn, { backgroundColor: '#9ca3af', flex: 1 }]}>
                  <Text style={s.btnTxt}>Annuler</Text>
                </Pressable>
                <Pressable onPress={doCreateGroup} style={[s.btn, { backgroundColor: BRAND, flex: 1 }]}>
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

      {/* Modal liste des membres */}
      <Modal visible={membersModalVisible} transparent animationType="slide" onRequestClose={() => setMembersModalVisible(false)}>
        <View style={s.qrWrap}>
          <View style={[s.qrCard, { width: 340, alignItems: "stretch" }]}>
            <Text style={{ fontWeight: "800", marginBottom: 12 }}>Membres ({members.length})</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {members.map((m) => (
                <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 }}>
                  <Avatar url={m.avatar_url} fallback={m.name} size={36} level={m.niveau} onPress={() => router.push(`/profiles/${m.id}`)} />
                  <Text style={{ flex: 1, fontWeight: "600" }}>{m.name}</Text>
                  {m.is_admin && <Text style={{ color: BRAND, fontWeight: "800" }}>Admin</Text>}
                </View>
              ))}
            </ScrollView>
            <Pressable onPress={() => setMembersModalVisible(false)} style={[s.btn, { backgroundColor: BRAND, marginTop: 14 }]}>
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
  activeCard: { backgroundColor: "#b0d4fb", borderColor: "#0d3186" },

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

  choice: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#fff",
  },
  choiceActive: {
    borderColor: BRAND,
    backgroundColor: "#eaf2ff",
  },
  choiceTxt: { color: "#374151", fontWeight: "700" },
  choiceTxtActive: { color: BRAND },
  badgePublic: {
    borderWidth: 1,
    borderColor: BRAND,
    backgroundColor: '#eaf2ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgePublicTxt: { color: BRAND, fontWeight: '800', fontSize: 10 },
  // QR & membres modals
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