// app/join.js
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Text, TextInput, View, Clipboard, Platform } from "react-native";
import { supabase } from "../lib/supabase";

export default function Join() {
  const { code, group_id } = useLocalSearchParams(); // lit /join?code=ABC123 ou /join?group_id=...
  const [inviteCode, setInviteCode] = useState(code ?? "");
  const router = useRouter();

  const handleJoinByGroupId = useCallback(async (groupId) => {
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
    }
  }, [router]);

  useEffect(() => {
    if (code) {
      setInviteCode(code);
    } else if (group_id) {
      // Si on a un group_id, on essaie de rejoindre directement le groupe
      console.log('[Join] Group ID reçu:', group_id);
      handleJoinByGroupId(group_id);
    }
  }, [code, group_id, handleJoinByGroupId]);

  async function acceptInvite() {
    if (!inviteCode) return Alert.alert("Code requis", "Entre un code d'invitation.");
    
    // Vérifier si c'est un deep link ou une URL
    if (inviteCode.includes('syncpadel://join?group_id=') || inviteCode.includes('group_id=')) {
      try {
        let groupId;
        if (inviteCode.startsWith('syncpadel://join?group_id=')) {
          const match = inviteCode.match(/group_id=([^&]+)/);
          if (match && match[1]) {
            groupId = match[1];
          }
        } else if (inviteCode.includes('group_id=')) {
          const url = new URL(inviteCode);
          groupId = url.searchParams.get('group_id');
        }
        if (groupId) {
          handleJoinByGroupId(groupId);
          return;
        }
      } catch (e) {
        console.error('[Join] Erreur parsing URL/deep link:', e);
      }
    }
    
    // Sinon, traiter comme un code d'invitation
    const { data, error } = await supabase.rpc("accept_invite", { p_code: inviteCode.trim() });
    if (error) return Alert.alert("Erreur", error.message);
    Alert.alert("Rejoint ✅", "Bienvenue dans le groupe !");
    router.replace("/(tabs)/matches");
  }

  const handlePasteDeepLink = useCallback(async () => {
    try {
      const text = await Clipboard.getString();
      if (!text) return;
      
      // Vérifier si c'est un deep link syncpadel://
      if (text.startsWith('syncpadel://join?group_id=')) {
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
          <Button title="Coller et utiliser" onPress={handlePasteDeepLink} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Rejoindre" onPress={acceptInvite} />
        </View>
      </View>
    </View>
  );
}