// app/join.js
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Button, Clipboard, Linking, Text, TextInput, View } from "react-native";
import { supabase } from "../lib/supabase";

export default function Join() {
  const params = useLocalSearchParams();
  const code = Array.isArray(params?.code) ? params?.code?.[0] : params?.code;
  const group_id = Array.isArray(params?.group_id) ? params?.group_id?.[0] : params?.group_id;
  const [inviteCode, setInviteCode] = useState(code ?? "");
  const [joining, setJoining] = useState(false);
  const joiningRef = useRef(false);
  const autoJoinDoneRef = useRef(false);
  const router = useRouter();

  const handleJoinByGroupId = useCallback(async (groupId) => {
    if (joiningRef.current) return;
    joiningRef.current = true;
    setJoining(true);
    try {
      // Essayer d'abord avec join_group_by_id (nouvelle fonction qui gère tous les cas)
      const { data: rpcData, error: rpcError } = await supabase.rpc('join_group_by_id', {
        p_group_id: groupId
      });
      
      if (!rpcError) {
        Alert.alert("Rejoint ✅", "Bienvenue dans le groupe !");
        router.replace("/(tabs)/matches");
        return;
      }
      
      // Fallback: Essayer avec join_public_group pour les groupes publics
      const { data: publicData, error: publicError } = await supabase.rpc('join_public_group', {
        p_group_id: groupId
      });
      
      if (!publicError) {
        Alert.alert("Rejoint ✅", "Bienvenue dans le groupe !");
        router.replace("/(tabs)/matches");
        return;
      }
      
      // Si tout échoue, afficher un message d'erreur clair
      console.error('[Join] Erreurs:', { rpcError: rpcError?.message, publicError: publicError?.message });
      Alert.alert("Impossible de rejoindre", rpcError?.message || publicError?.message || "Ce groupe nécessite une invitation valide.");
    } catch (e) {
      console.error('[Join] Erreur lors de la tentative de rejoindre:', e);
      Alert.alert("Erreur", e?.message || "Impossible de rejoindre le groupe. Veuillez contacter un administrateur.");
    } finally {
      joiningRef.current = false;
      setJoining(false);
    }
  }, [router]);

  const acceptInvite = useCallback(async (codeToUse?: string) => {
    if (joiningRef.current) return;
    let codeToProcess = codeToUse || inviteCode;
    if (!codeToProcess) return Alert.alert("Code requis", "Entre un code d'invitation.");
    joiningRef.current = true;
    setJoining(true);

    // Support du lien web https://syncpadel.app/invite/{CODE}
    const webInviteMatch = String(codeToProcess).match(/syncpadel\.app\/invite\/([A-Z0-9]+)/i);
    if (webInviteMatch?.[1]) {
      codeToProcess = webInviteMatch[1];
    }
    
    // Vérifier si c'est un deep link ou une URL
    if (codeToProcess.includes('syncpadel://join?group_id=') || codeToProcess.includes('group_id=')) {
      try {
        let groupId;
        if (codeToProcess.startsWith('syncpadel://join?group_id=')) {
          const match = codeToProcess.match(/group_id=([^&]+)/);
          if (match && match[1]) {
            groupId = match[1];
          }
        } else if (codeToProcess.includes('group_id=')) {
          const url = new URL(codeToProcess);
          groupId = url.searchParams.get('group_id');
        }
        if (groupId) {
          joiningRef.current = false;
          setJoining(false);
          await handleJoinByGroupId(groupId);
          return;
        }
      } catch (e) {
        console.error('[Join] Erreur parsing URL/deep link:', e);
      }
    }
    
    try {
      // Sinon, traiter comme un code d'invitation
      const { data, error } = await supabase.rpc("accept_invite", { p_code: codeToProcess.trim() });
      if (error) {
        Alert.alert("Erreur", error.message);
        return;
      }
      Alert.alert("Rejoint ✅", "Bienvenue dans le groupe !");
      router.replace("/(tabs)/matches");
    } catch (e) {
      console.error('[Join] Erreur accept_invite:', e);
      Alert.alert("Erreur", e?.message || "Impossible de rejoindre le groupe.");
    } finally {
      joiningRef.current = false;
      setJoining(false);
    }
  }, [inviteCode, handleJoinByGroupId, router]);

  useEffect(() => {
    const codeVal = Array.isArray(code) ? code?.[0] : code;
    const groupIdVal = Array.isArray(group_id) ? group_id?.[0] : group_id;
    if (autoJoinDoneRef.current) return;
    if (codeVal) {
      autoJoinDoneRef.current = true;
      setInviteCode(codeVal);
      console.log('[Join] Code reçu via deep link:', codeVal);
      acceptInvite(codeVal);
    } else if (groupIdVal) {
      autoJoinDoneRef.current = true;
      console.log('[Join] Group ID reçu:', groupIdVal);
      handleJoinByGroupId(groupIdVal);
    }
  }, [code, group_id, handleJoinByGroupId, acceptInvite]);

  // Écouter les deep links quand on est déjà sur cette page (params vides au rejoin)
  useEffect(() => {
    const handleUrl = (event) => {
      const url = event?.url;
      if (!url) return;
      try {
        // syncpadel://invite/ABC123 (lien classique d'invitation)
        const inviteMatch = url.match(/invite\/([A-Za-z0-9]+)/i);
        if (inviteMatch?.[1]) {
          const c = inviteMatch[1];
          setInviteCode(c);
          acceptInvite(c);
          return;
        }
        // syncpadel://join?code=... ou ?group_id=...
        if (!url.includes('group_id=') && !url.includes('code=')) return;
        const norm = url.replace(/^syncpadel:\/\//, 'https://placeholder/');
        const u = new URL(norm);
        const gid = u.searchParams.get('group_id');
        const c = u.searchParams.get('code');
        if (gid) {
          handleJoinByGroupId(gid);
        } else if (c) {
          setInviteCode(c);
          acceptInvite(c);
        }
      } catch (_) {}
    };
    const sub = Linking.addEventListener('url', handleUrl);
    return () => sub.remove();
  }, [handleJoinByGroupId, acceptInvite]);

  const handlePasteDeepLink = useCallback(async () => {
    try {
      const text = await Clipboard.getString();
      if (!text) return;
      const trimmed = String(text).trim();
      // Lien web invite https://syncpadel.app/invite/ABC123
      const webInvite = trimmed.match(/syncpadel\.app\/invite\/([A-Za-z0-9]+)/i) || trimmed.match(/\/invite\/([A-Za-z0-9]+)/i);
      if (webInvite?.[1]) {
        setInviteCode(webInvite[1]);
        await acceptInvite(webInvite[1]);
        return;
      }
      // Vérifier si c'est un deep link syncpadel://
      if (trimmed.startsWith('syncpadel://join?group_id=')) {
        try {
          // Extraire le group_id depuis le deep link
          const match = text.match(/group_id=([^&]+)/);
          if (match && match[1]) {
            const groupId = match[1];
            handleJoinByGroupId(groupId);
            return;
          }
        } catch (e) {
          console.error('[Join] Erreur parsing deep link:', e);
        }
      }
      
      // Vérifier si c'est un lien web avec group_id
      if (text.includes('group_id=')) {
        try {
          const url = new URL(text);
          const groupId = url.searchParams.get('group_id');
          if (groupId) {
            handleJoinByGroupId(groupId);
            return;
          }
        } catch (e) {
          console.error('[Join] Erreur parsing URL:', e);
        }
      }
      
      // Sinon, utiliser comme code d'invitation
      setInviteCode(text.trim());
    } catch (e) {
      console.error('[Join] Erreur lors du collage:', e);
      Alert.alert("Erreur", "Impossible de lire le presse-papiers");
    }
  }, [handleJoinByGroupId]);

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: "600" }}>Rejoindre un groupe</Text>
      <Text style={{ fontSize: 14, color: "#666", marginBottom: 8 }}>
        Entre un code d'invitation ou colle un lien d'invitation
      </Text>
      <TextInput
        placeholder="Code d'invitation ou lien syncpadel://join?group_id=..."
        value={inviteCode}
        onChangeText={setInviteCode}
        autoCapitalize="none"
        style={{ borderWidth: 1, borderRadius: 8, padding: 12 }}
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button title="Coller et utiliser" onPress={handlePasteDeepLink} disabled={joining} />
        </View>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {joining ? <ActivityIndicator size="small" /> : null}
          <Button title="Rejoindre" onPress={acceptInvite} disabled={joining} />
        </View>
      </View>
    </View>
  );
}