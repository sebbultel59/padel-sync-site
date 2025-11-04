// app/(tabs)/groupes.js
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  Image,
  KeyboardAvoidingView,
  Linking,
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
  View,
} from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActiveGroup } from "../../lib/activeGroup";
import { supabase } from "../../lib/supabase";
import { computeInitials, press } from "../../lib/uiSafe";

// --- Super admin helper (UI guard) ---

function useIsSuperAdmin() {
  const [isSuperAdmin, setIsSuperAdmin] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (!uid) return setIsSuperAdmin(false);

        // Vérifie l'existence d'une ligne dans super_admins pour l'utilisateur courant
        const { data: saRow, error: saErr } = await supabase
          .from('super_admins')
          .select('user_id')
          .eq('user_id', uid)
          .maybeSingle();
        if (saErr) console.warn('[useIsSuperAdmin] super_admins check failed:', saErr.message);
        const flag = !!saRow?.user_id;
        setIsSuperAdmin(flag);
      } catch (e) {
        console.warn('[useIsSuperAdmin] fallback to false:', e?.message || e);
        setIsSuperAdmin(false);
      }
    })();
  }, []);

  return isSuperAdmin;
}

// --- Admin helper (UI guard) ---

function useIsGlobalAdmin() {
  const [isGlobalAdmin, setIsGlobalAdmin] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (!uid) return setIsGlobalAdmin(false);

        // Vérifie l'existence d'une ligne dans admins pour l'utilisateur courant
        const { data: adminRow, error: adminErr } = await supabase
          .from('admins')
          .select('user_id')
          .eq('user_id', uid)
          .maybeSingle();
        if (adminErr) console.warn('[useIsGlobalAdmin] admins check failed:', adminErr.message);
        const flag = !!adminRow?.user_id;
        setIsGlobalAdmin(flag);
      } catch (e) {
        console.warn('[useIsGlobalAdmin] fallback to false:', e?.message || e);
        setIsGlobalAdmin(false);
      }
    })();
  }, []);

  return isGlobalAdmin;
}
// --- end helpers ---

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
const WEB_BASE_URL = "https://syncpadel.app"; // Domaine web pour les liens dans les emails

// Niveau → couleur (cohérent avec LEVELS global)
const LEVEL_COLORS = {
  1: '#a3e635', // Débutant
  2: '#86efac', // Perfectionnement
  3: '#0e7aff', // Élémentaire
  4: '#0d97ac', // Intermédiaire
  5: '#ff9d00', // Confirmé
  6: '#f06300', // Avancé
  7: '#fb7185', // Expert
  8: '#a78bfa', // Elite
};
const colorForLevel = (n) => LEVEL_COLORS[n] || '#9ca3af';


// Helper: base64 -> ArrayBuffer (sans atob, compatible Hermes)
function base64ToArrayBuffer(base64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let bytes = [];
  let i = 0;
  while (i < base64.length) {
    const c1 = chars.indexOf(base64.charAt(i++));
    const c2 = chars.indexOf(base64.charAt(i++));
    const c3 = chars.indexOf(base64.charAt(i++));
    const c4 = chars.indexOf(base64.charAt(i++));
    const b1 = (c1 << 2) | (c2 >> 4);
    const b2 = ((c2 & 15) << 4) | (c3 >> 2);
    const b3 = ((c3 & 3) << 6) | c4;
    bytes.push(b1 & 0xff);
    if (c3 !== 64) bytes.push(b2 & 0xff);
    if (c4 !== 64) bytes.push(b3 & 0xff);
  }
  return new Uint8Array(bytes).buffer;
}


function Avatar({ url, fallback, size = 48, level = null, onPress, profile, onLongPressProfile, ...rest }) {
  const S = Math.round(size * 1.2);
  const initials = computeInitials(fallback || "?");
  
  const handlePress = () => {
    // Clic court: ne pas ouvrir la modale; respecter onPress si fourni
    if (onPress) {
      onPress();
    }
  };

  const handleLongPress = () => {
    // Clic long: ouvrir la modale de profil si disponible
    if (profile && onLongPressProfile) {
      onLongPressProfile(profile);
    }
  };
  
  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={450}
      disabled={!onPress && !onLongPressProfile}
      style={[
        Platform.OS === "web" && { cursor: (onPress || onLongPressProfile) ? "pointer" : "default" }
      ]}
    >
      <View style={{ width: S, height: S }}>
        {url ? (
          <Image
            source={{ uri: url }}
            style={{
              width: S,
              height: S,
              borderRadius: S / 2,
              backgroundColor: "#eef2f7",
            }}
          />
        ) : (
          <View
            style={{
              width: S,
              height: S,
              borderRadius: S / 2,
              backgroundColor: "#eaf2ff",
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: BRAND,
            }}
          >
            <Text style={{ color: BRAND, fontWeight: "800", fontSize: Math.max(14, Math.round(S * 0.40)) }}>
              {initials}
            </Text>
          </View>
        )}
        {!!level && (
          <View
            style={{
              position: 'absolute',
              right: -2,
              bottom: -2,
              backgroundColor: colorForLevel(level), // background = couleur du niveau
              borderColor: '#ffffff',               // fin liseré blanc pour le contraste
              borderWidth: 1,
              borderRadius: 10,
              minWidth: 18,
              height: 18,
              paddingHorizontal: 4,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            accessibilityLabel={`Niveau ${level}`}
          >
            <Text style={{ color: '#000000', fontWeight: '900', fontSize: 10, lineHeight: 12 }}>
              {String(level)}
            </Text>
          </View>
        )}
          </View>
    </Pressable>
  );
}

export default function GroupesScreen() {
  const { activeGroup, setActiveGroup } = useActiveGroup();
  const nav = useRouter();
  const isSuperAdmin = useIsSuperAdmin();
  const isGlobalAdmin = useIsGlobalAdmin();
  const insets = useSafeAreaInsets();

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
  const [contactProfile, setContactProfile] = useState(null);
  const [contactVisible, setContactVisible] = useState(false);
  const [profileProfile, setProfileProfile] = useState(null);
  const [profileVisible, setProfileVisible] = useState(false);

  const [qrVisible, setQrVisible] = useState(false);
  const [qrUrl, setQrUrl] = useState("");

  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminLoading, setIsAdminLoading] = useState(true);

  const openContactForProfile = useCallback((p) => {
    console.log('[openContactForProfile] Called with profile:', p?.name, p?.phone, p?.email);
    setContactProfile(p || null);
    setContactVisible(true);
  }, []);

  const openProfileForProfile = useCallback((p) => {
    console.log('[openProfileForProfile] Called with profile:', p?.name, p?.email);
    setProfileProfile(p || null);
    setProfileVisible(true);
  }, []);

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
            .select("id, display_name, avatar_url, niveau, phone")
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
              phone: p?.phone ?? null,
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
  const contactMember = useCallback((m) => {
    if (!m?.phone) {
      Alert.alert("Aucun numéro", `${m?.name || "Ce membre"} n'a pas de numéro renseigné.`);
      return;
    }
    const telUrl = `tel:${m.phone}`;
    const smsUrl = `sms:${m.phone}`;

    if (Platform.OS === 'ios' && ActionSheetIOS) {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: m.name || 'Contacter',
          options: ['📞 Appeler', '💬 SMS', 'Annuler'],
          cancelButtonIndex: 2,
          userInterfaceStyle: 'dark',
        },
        (idx) => {
          if (idx === 0) Linking.openURL(telUrl).catch(() => {});
          else if (idx === 1) Linking.openURL(smsUrl).catch(() => {});
        }
      );
    } else {
      Alert.alert(
        m.name || 'Contacter',
        m.phone,
        [
          { text: 'Appeler', onPress: () => Linking.openURL(telUrl).catch(() => {}) },
          { text: 'SMS', onPress: () => Linking.openURL(smsUrl).catch(() => {}) },
          { text: 'Annuler', style: 'cancel' },
        ]
      );
    }
  }, []);

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
    return `padelsync://join?group_id=${groupId}`;
  }, []);

  const onInviteLink = useCallback(async () => {
    if (!activeGroup?.id) return;
    try {
      // Créer ou récupérer un code d'invitation pour le groupe
      let inviteCode;
      const { data: existingInvite, error: fetchError } = await supabase
        .from('invitations')
        .select('code')
        .eq('group_id', activeGroup.id)
        .eq('used', false)
        .limit(1)
        .maybeSingle();
      
      if (existingInvite?.code) {
        inviteCode = existingInvite.code;
      } else {
        // Créer un nouveau code d'invitation
        const { data: newInvite, error: createError } = await supabase
          .from('invitations')
          .insert({
            group_id: activeGroup.id,
            code: Math.random().toString(36).substring(2, 8).toUpperCase(),
            created_by: meId
          })
          .select('code')
          .single();
        
        if (createError) {
          throw createError;
        }
        inviteCode = newInvite.code;
      }
      
      // Liens de téléchargement de l'app
      const iosAppLink = "https://apps.apple.com/app/padel-sync/id6754223924";
      const androidAppLink = "https://play.google.com/store/apps/details?id=com.padelsync.app";
      
      const message = `🎾 Rejoins mon groupe Padel Sync !

Organise tes matchs en 3 clics avec l'app Padel Sync 📱



🔑 CODE DU GROUPE

${inviteCode}



➡️ Une fois l'app installée

1️⃣ Ouvre l'app Padel Sync

2️⃣ Va dans l'onglet "Groupes"

3️⃣ Clique sur "Rejoindre un groupe"

4️⃣ Entre le code ci-dessus



📲 Installe l'app ici

🍎 iOS
${iosAppLink}

🤖 Android
${androidAppLink}



Padel Sync — Ton match en 3 clics 🎾`;
      
      await Share.share({ message });
    } catch (e) {
      console.error('[Invite] Erreur:', e);
      Alert.alert("Partage impossible", e?.message ?? String(e));
    }
  }, [activeGroup?.id, meId]);

  const onInviteQR = useCallback(() => {
    if (!activeGroup?.id) return;
    const deepLink = buildInviteDeepLink(activeGroup.id);
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
      console.log('[Avatar] picker:open');
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        // Ouvre l'éditeur natif de recadrage avec ratio carré
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      console.log('[Avatar] launchImageLibraryAsync:result', { canceled: res?.canceled, assetsLen: res?.assets?.length });
      if (res.canceled || !res.assets?.[0]?.uri) return;

      const asset = res.assets[0];
      const uri = asset.uri;
      console.log('[Avatar] picker:uri', uri);
      // Utiliser directement l’URI recadrée par le picker (carré)
      const finalUri = uri;
      console.log('[Avatar] final uri', finalUri);
      const arrayBuffer = await (await fetch(finalUri)).arrayBuffer();

      const ts = Date.now();
      const path = `${activeGroup.id}/avatar-${ts}.jpg`;
      const contentType = "image/jpeg";

      console.log('[Avatar] upload:start', path);
      const { error: upErr } = await supabase.storage
        .from("group-avatars")
        .upload(path, arrayBuffer, { contentType, upsert: true });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("group-avatars").getPublicUrl(path);
      const publicUrl = pub?.publicUrl ?? null;
      if (!publicUrl) throw new Error("Impossible d'obtenir l'URL publique.");

      console.log('[Avatar] update group row with publicUrl');
      const { error: eUpd } = await supabase
        .from("groups")
        .update({ avatar_url: publicUrl })
        .eq("id", activeGroup.id);
      if (eUpd) throw eUpd;

      console.log('[Avatar] reload groups and set active');
      await loadGroups();
      const refreshed = (groups.mine ?? []).find((g) => g.id === activeGroup.id);
      if (refreshed) setActiveGroup(refreshed);

      Alert.alert("OK", "Avatar du groupe mis à jour.");
    } catch (e) {
      console.log('[Avatar] error', e);
      Alert.alert("Erreur avatar", e?.message ?? String(e));
    }
  }, [activeGroup?.id, isAdmin, groups, loadGroups, setActiveGroup]);

  const onJoinPublic = useCallback(
    async (groupId) => {
      try {
        // Essayer d'abord avec la RPC function si elle existe
        const { data: rpcData, error: rpcError } = await supabase.rpc('join_public_group', {
          p_group_id: groupId
        });
        
        if (rpcError) {
          // Fallback: INSERT direct (peut échouer si RLS bloque)
          const { data: u } = await supabase.auth.getUser();
          const me = u?.user?.id;
          const { error } = await supabase
            .from("group_members")
            .insert({ group_id: groupId, user_id: me, role: "member" });
          if (error) throw error;
        }
        
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

  const onDeleteGroup = useCallback(() => {
    if (!activeGroup?.id) return;

    if (!isAdmin) {
      Alert.alert('Action réservée', "Seuls les admins peuvent supprimer le groupe.");
      return;
    }

    const groupId = activeGroup.id;
    const groupName = activeGroup.name || 'Ce groupe';

    Alert.alert(
      'Supprimer le groupe',
      `Voulez-vous vraiment supprimer "${groupName}" ? Cette action est définitive.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('groups').delete().eq('id', groupId);
              if (error) throw error;
              // Nettoyage local
              setActiveGroup(null);
              try { await AsyncStorage.removeItem('active_group_id'); } catch {}
              await loadGroups();
              Alert.alert('Groupe supprimé', `${groupName} a été supprimé.`);
              try { router.replace('/(tabs)/groupes'); } catch {}
            } catch (e) {
              Alert.alert('Suppression impossible', e?.message || 'Une erreur est survenue.');
            }
          }
        }
      ]
    );
  }, [activeGroup, isAdmin, setActiveGroup, loadGroups]);

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
      if (!me) throw new Error("Utilisateur non authentifié");

      // Sécurise la visibilité et la join policy selon le rôle
      let safeVisibility = createVisibility;
      let join_policy = createJoinPolicy;

      // Super admin : peut créer tous les types
      // Admin : peut créer privé et public sur demande (mais pas public ouvert)
      // Utilisateur : peut créer uniquement privé

      if (createVisibility === "public" && createJoinPolicy === "open") {
        // Public ouvert : uniquement super admin
        if (!isSuperAdmin) {
          Alert.alert('Restriction', 'Seuls les super admins peuvent créer un groupe public ouvert.');
          safeVisibility = "private";
          join_policy = "invite";
        }
      } else if (createVisibility === "public" && createJoinPolicy === "request") {
        // Public sur demande : super admin ou admin
        if (!isSuperAdmin && !isGlobalAdmin) {
          Alert.alert('Restriction', 'Seuls les admins et super admins peuvent créer un groupe public sur demande.');
          safeVisibility = "private";
          join_policy = "invite";
        }
      } else if (createVisibility === "private") {
        // Privé : toujours autorisé
        safeVisibility = "private";
        join_policy = "invite";
      } else {
        // Par défaut : privé
        safeVisibility = "private";
        join_policy = "invite";
      }

      console.log('[Groups][create] me =', me, 'visibility =', safeVisibility, 'join_policy =', join_policy);

      const { data: rpcData, error: rpcErr } = await supabase.rpc('rpc_create_group', {
        p_name: n,
        p_visibility: safeVisibility,
        p_join_policy: join_policy,
      });
      if (rpcErr) throw rpcErr;

      console.log('[Groups][create][rpc] result =', rpcData);
      let created = Array.isArray(rpcData) ? rpcData[0] : rpcData;

      // Fallback: si la RPC ne renvoie pas l’ID (implémentation SQL différente),
      // on va rechercher le dernier groupe créé par l’utilisateur avec ce nom.
      if (!created || !created.id) {
        const { data: fallback, error: fbErr } = await supabase
          .from('groups')
          .select('id, name, avatar_url')
          .eq('name', n)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (fbErr) throw fbErr;
        if (!fallback?.id) {
          throw new Error('Création du groupe : réponse invalide (aucun ID retourné)');
        }
        created = fallback;
      }

      await loadGroups();
      setActiveGroup(created);
      await loadMembersAndAdmin(created.id);
      setShowCreate(false);
      Alert.alert("Groupe créé", `“${n}” est maintenant actif.`);
    } catch (e) {
      Alert.alert("Erreur création", e?.message ?? String(e));
    }
  }, [createName, createVisibility, createJoinPolicy, isSuperAdmin, isGlobalAdmin, loadGroups, setActiveGroup, loadMembersAndAdmin]);

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
    <View style={{ flex: 1, position: "relative", backgroundColor: "#001831" }}>
      {/* Contact Modal */}
      <Modal
        visible={contactVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setContactVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: 'white', borderRadius: 12, padding: 20, width: '90%', maxWidth: 400 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 20, textAlign: 'center' }}>
              Contacter {contactProfile?.display_name || contactProfile?.name || contactProfile?.email || 'ce membre'}
            </Text>
            <View style={{ gap: 12 }}>
              {contactProfile?.phone && (
                <Pressable
                  onPress={() => { Linking.openURL(`tel:${contactProfile.phone}`); setContactVisible(false); }}
                  style={{ backgroundColor: '#15803d', paddingVertical: 12, borderRadius: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                >
                  <Ionicons name="call" size={20} color="white" style={{ marginRight: 8 }} />
                  <Text style={{ color: 'white', fontWeight: '600', fontSize: 16 }}>Appeler</Text>
                </Pressable>
              )}
              {contactProfile?.email && (
                <Pressable
                  onPress={() => { Linking.openURL(`mailto:${contactProfile.email}`); setContactVisible(false); }}
                  style={{ backgroundColor: '#3b82f6', paddingVertical: 12, borderRadius: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                >
                  <Ionicons name="mail" size={20} color="white" style={{ marginRight: 8 }} />
                  <Text style={{ color: 'white', fontWeight: '600', fontSize: 16 }}>Envoyer un email</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => setContactVisible(false)}
                style={{ backgroundColor: '#6b7280', paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}
              >
                <Text style={{ color: 'white', fontWeight: '600', fontSize: 16 }}>Fermer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Profile Modal */}
      <Modal
        visible={profileVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setProfileVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: 'white', borderRadius: 12, padding: 20, width: '90%', maxWidth: 400 }}>
            {/* Avatar + Nom */}
            <View style={{ alignItems: 'center', gap: 8, marginBottom: 20 }}>
              {profileProfile?.avatar_url ? (
                <Image 
                  source={{ uri: profileProfile.avatar_url }} 
                  style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#f3f4f6' }}
                />
              ) : (
                <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#eaf2ff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#1a4b97' }}>
                  <Text style={{ fontSize: 32, fontWeight: '800', color: '#1a4b97' }}>
                    {(profileProfile?.display_name || profileProfile?.name || profileProfile?.email || 'J').substring(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#1a4b97', textAlign: 'center' }}>
                {profileProfile?.display_name || profileProfile?.name || profileProfile?.email || 'Joueur'}
              </Text>
              <Pressable onPress={() => Linking.openURL(`mailto:${profileProfile?.email}`)}>
                <Text style={{ fontSize: 13, color: '#3b82f6', textAlign: 'center', textDecorationLine: 'underline' }}>
                  {profileProfile?.email}
                </Text>
              </Pressable>
            </View>
            
            {/* Résumé visuel */}
            <View style={{ backgroundColor: 'white', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, gap: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827' }}>Résumé</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
                <View style={{ width: '47%', borderWidth: 1, borderColor: '#eef2f7', borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, backgroundColor: '#fafafa' }}>
                  <Text style={{ fontSize: 28 }}>🔥</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a4b97' }}>{profileProfile?.niveau || profileProfile?.level || '—'}</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Niveau</Text>
                </View>
                <View style={{ width: '47%', borderWidth: 1, borderColor: '#eef2f7', borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, backgroundColor: '#fafafa' }}>
                  <Text style={{ fontSize: 28 }}>🖐️</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a4b97' }}>{profileProfile?.main || '—'}</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Main</Text>
                </View>
                <View style={{ width: '47%', borderWidth: 1, borderColor: '#eef2f7', borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, backgroundColor: '#fafafa' }}>
                  <Text style={{ fontSize: 28 }}>🎯</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a4b97' }}>{profileProfile?.cote || '—'}</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Côté</Text>
                </View>
                <View style={{ width: '47%', borderWidth: 1, borderColor: '#eef2f7', borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, backgroundColor: '#fafafa' }}>
                  <Text style={{ fontSize: 28 }}>🏟️</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a4b97' }}>{profileProfile?.club || '—'}</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Club</Text>
                </View>
                <View style={{ width: '47%', borderWidth: 1, borderColor: '#eef2f7', borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, backgroundColor: '#fafafa' }}>
                  <Text style={{ fontSize: 28 }}>📍</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a4b97' }}>{profileProfile?.rayon_km ? `${profileProfile.rayon_km} km` : '—'}</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Rayon</Text>
                </View>
                <Pressable
                  onPress={() => {
                    setProfileVisible(false);
                    setContactProfile(profileProfile);
                    setContactVisible(true);
                  }}
                  style={({ pressed }) => [
                    { width: '47%', borderWidth: 1, borderColor: '#eef2f7', borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, backgroundColor: '#fafafa' },
                    pressed && { opacity: 0.7 }
                  ]}
                >
                  <Text style={{ fontSize: 28 }}>📞</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a4b97' }}>{profileProfile?.phone || '—'}</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Téléphone</Text>
                </Pressable>
              </View>
            </View>
            
            <Pressable
              onPress={() => setProfileVisible(false)}
              style={{ backgroundColor: '#15803d', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 16 }}
            >
              <Text style={{ color: 'white', fontWeight: '600', fontSize: 16 }}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: Math.max(24, insets.bottom + 140) }}
        scrollIndicatorInsets={{ bottom: Math.max(8, insets.bottom + 70) }}
        keyboardShouldPersistTaps="handled"
        {...(Platform.OS === "web" ? {} : { pointerEvents: "box-none" })}
      >
        {/* Groupe actif */}
        {activeRecord ? (
          <View style={[s.card, s.activeCard]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Avatar url={activeRecord.avatar_url} fallback={activeRecord.name} size={56} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "800", fontSize: 18, color: "#001831", textTransform: 'uppercase' }}>
                  {activeRecord.name}
                </Text>
                <Text style={{ color: "#5b89b8", marginTop: 2, fontWeight: "700" }}>
                  {activeRecord.visibility === 'public' ? 'Public' : 'Privé'}
                </Text>
                <Text style={{ color: "#5b89b8", marginTop: 2 }}>
                  {`Groupe actif · ${members.length} membre${members.length > 1 ? "s" : ""}`}
                </Text>
              </View>
            </View>

            {/* Membres */}
            <View style={{ marginTop: 12 }}>
              {members?.length ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingVertical: 8, minHeight: 56 }}
                >
                  {members.slice(0, 20).map((m) => (
                    <Avatar
                      key={m.id}
                      url={m.avatar_url}
                      fallback={m.name}
                      level={m.niveau}
                      size={36}
                      profile={m}
                      onLongPressProfile={openProfileForProfile}
                    />
                  ))}
                  {members.length > 20 ? (
                    <View style={{ alignItems: "center", justifyContent: "center", paddingHorizontal: 8 }}>
                      <Text style={{ color: "#cbd5e1", fontWeight: "700" }}>+{members.length - 20}</Text>
                    </View>
                  ) : null}
                </ScrollView>
              ) : (
                <Text style={{ color: "#cbd5e1" }}>Aucun membre trouvé.</Text>
              )}
            </View>

            {/* Actions groupe actif */}
            <View style={{ flexDirection: "row", marginTop: 12 }}>
              <Pressable onPress={press("open-members-modal", () => setMembersModalVisible(true))} style={[s.btn, { backgroundColor: "#f3f4f6", flex: 1 }, Platform.OS === "web" && { cursor: "pointer" }]}>
                <Text style={[s.btnTxt, { color: "#111827" }]}>Voir les membres ({members.length})</Text>
              </Pressable>
            </View>

            {/* Invite buttons row (moved under "Voir les membres") */}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <Pressable onPress={press("invite-link", onInviteLink)} style={[s.btn, { backgroundColor: "#ff8c00", flex: 1 }, Platform.OS === "web" && { cursor: "pointer" }]}>
                <Text style={s.btnTxt}>Inviter (lien)</Text>
              </Pressable>
              <Pressable onPress={press("invite-qr", onInviteQR)} style={[s.btn, { backgroundColor: "#111827", flex: 1 }, Platform.OS === "web" && { cursor: "pointer" }]}>
                <Text style={s.btnTxt}>QR</Text>
              </Pressable>
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <Pressable
                onPress={press("change-group-avatar", onChangeGroupAvatar)}
                disabled={isAdminLoading ? true : !isAdmin}
                style={[
                  s.btn,
                  { flex: 1, flexDirection: "row", justifyContent: "center", gap: 6, paddingVertical: 8 },
                  isAdminLoading ? { backgroundColor: "#cbd5e1" } : isAdmin ? { backgroundColor: BRAND } : { backgroundColor: "#d1d5db" },
                  Platform.OS === "web" && { cursor: isAdminLoading || !isAdmin ? "not-allowed" : "pointer" }
                ]}
              >
                {isAdminLoading ? <ActivityIndicator color="#fff" /> : !isAdmin ? <Text style={{ color: "white", fontSize: 14 }}>🔒</Text> : null}
                <Text style={s.btnTxt}>Changer avatar</Text>
              </Pressable>

              <Pressable
                onPress={press("leave-group", onLeaveGroup)}
                style={[s.btn, { backgroundColor: "#dc2626", flex: 1, paddingVertical: 8 }, Platform.OS === "web" && { cursor: "pointer" }]}
              >
                <Text style={s.btnTxt}>Quitter le groupe</Text>
              </Pressable>

              {isAdmin && (
                <Pressable
                  onPress={press('delete-group', onDeleteGroup)}
                  style={[s.btn, { backgroundColor: '#991b1b', flex: 1, paddingVertical: 8 }, Platform.OS === 'web' && { cursor: 'pointer' }]}
                  accessibilityRole="button"
                  accessibilityLabel="Supprimer le groupe"
                >
                  <Text style={s.btnTxt}>Supprimer le groupe</Text>
                </Pressable>
              )}
            </View>
          </View>
        ) : (
          <View style={[s.card, { alignItems: "center" }]}>
            <Text style={{ color: "#cbd5e1" }}>Aucun groupe actif.</Text>
          </View>
        )}

        {/* Bouton Rejoindre un groupe */}
        <Pressable 
          onPress={press("join-group", () => nav.push("/join"))} 
          style={[s.btn, { backgroundColor: "#1a4b97", marginTop: 12, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 }, Platform.OS === "web" && { cursor: "pointer" }]}
        >
          <Ionicons name="add-circle-outline" size={20} color="#ffffff" />
          <Text style={[s.btnTxt, { fontSize: 16 }]}>Rejoindre un groupe</Text>
        </Pressable>

        {/* Mes groupes */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Mes groupes</Text>
        </View>
        {(groups.mine ?? []).length === 0 ? (
          <View style={[s.card, { alignItems: "center" }]}>
            <Text style={{ color: "#cbd5e1" }}>Tu n’as pas encore de groupe.</Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {(groups.mine ?? []).map((g) => (
              <Pressable
                key={g.id}
                onPress={press("activate-group", () => onActivate(g))}
                style={[s.rowCard, Platform.OS === 'web' && { cursor: 'pointer' }]}
                accessibilityRole="button"
                accessibilityLabel={`Activer le groupe ${g.name}`}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  <Avatar url={g.avatar_url} fallback={g.name} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "700", color: "#ffffff", textTransform: 'uppercase' }}>{g.name}</Text>
                    <Text style={{ color: "#b0d4fb", marginTop: 2, fontWeight: "700" }}>
                      {g.visibility === 'public'
                        ? `Public · ${g.join_policy === 'open' ? 'Ouvert' : 'Sur demande'}`
                        : 'Privé'}
                    </Text>
                  </View>
                </View>
                {activeGroup?.id === g.id ? (
                  <View style={[s.btnTiny, { backgroundColor: "#d1d5db" }]}>
                    <Text style={{ color: "#111827", fontWeight: "800", fontSize: 12 }}>Actif</Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}

        {/* Groupes publics */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Groupes publics</Text>
        </View>
        {(groups.open ?? []).length === 0 ? (
          <View style={[s.card, { alignItems: "center" }]}>
            <Text style={{ color: "#cbd5e1" }}>Aucun groupe public disponible.</Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {(groups.open ?? []).map((g) => (
              <View key={g.id} style={s.rowCard} pointerEvents="box-none">
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  <Avatar url={g.avatar_url} fallback={g.name} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "700", color: "#ffffff", textTransform: 'uppercase' }}>{g.name}</Text>
                    <Text style={{ color: "#b0d4fb", marginTop: 2, fontWeight: "700" }}>
                      {g.visibility === 'public' ? `Public · ${g.join_policy === 'open' ? 'Ouvert' : 'Sur demande'}` : 'Privé'}
                    </Text>
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

      {/* FAB "+" */}
      <Pressable 
        onPress={press("fab-create-group", onCreateGroup)} 
        style={[
          s.fab, 
          { bottom: Math.max(22, insets.bottom + 80) },
          Platform.OS === "web" && { cursor: "pointer" }
        ]} 
      >
        <Ionicons name="add" size={32} color="#ffffff" />
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

              {/* Privé - toujours disponible */}
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

              {/* Public (ouvert) - uniquement pour super admin */}
              {isSuperAdmin && (
                <TouchableOpacity
                  onPress={() => {
                    setCreateVisibility("public");
                    setCreateJoinPolicy("open");
                  }}
                  style={[s.choice, createVisibility === "public" && createJoinPolicy === "open" ? s.choiceActive : null]}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="earth-outline" size={16} color={createVisibility === "public" && createJoinPolicy === "open" ? BRAND : "#374151"} />
                    <Text style={[s.choiceTxt, createVisibility === "public" && createJoinPolicy === "open" ? s.choiceTxtActive : null]}>Public (ouvert)</Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Public (sur demande) - pour super admin et admin */}
              {(isSuperAdmin || isGlobalAdmin) && (
                <TouchableOpacity
                  onPress={() => {
                    setCreateVisibility("public");
                    setCreateJoinPolicy("request");
                  }}
                  style={[s.choice, createVisibility === "public" && createJoinPolicy === "request" ? s.choiceActive : null]}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="people-outline" size={16} color={createVisibility === "public" && createJoinPolicy === "request" ? BRAND : "#374151"} />
                    <Text style={[s.choiceTxt, createVisibility === "public" && createJoinPolicy === "request" ? s.choiceTxtActive : null]}>Public (sur demande)</Text>
                  </View>
                </TouchableOpacity>
              )}

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
                  <Avatar url={m.avatar_url} fallback={m.name} size={36} level={m.niveau} profile={m} onLongPressProfile={openProfileForProfile} />
                  <Text style={{ flex: 1, fontWeight: "600" }}>{m.name}</Text>
                  {m.is_admin && <Text style={{ color: BRAND, fontWeight: "800", marginRight: 8 }}>Admin</Text>}
                  <Pressable
                    onPress={press('contact-member', () => contactMember(m))}
                    style={[{ padding: 6, borderRadius: 8 }, Platform.OS === 'web' && { cursor: 'pointer' }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Contacter ${m.name}`}
                  >
                    <Ionicons name="call-outline" size={20} color={BRAND} />
                  </Pressable>
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
  sectionTitle: { color: "#ffffff", fontWeight: "800" },
  card: { backgroundColor: "#001831", borderWidth: 0.5, borderColor: "#808080", borderRadius: 12, padding: 12, gap: 8 },
  activeCard: { backgroundColor: "#ffffff", borderColor: "gold" },
  rowCard: { backgroundColor: "#001831", borderWidth: 0.5, borderColor: "#808080", borderRadius: 10, padding: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  btn: { paddingVertical: 10, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  btnTxt: { color: "white", fontWeight: "800", textAlign: "center" },
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