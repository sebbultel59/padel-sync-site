// app/join.js
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Text, TextInput, View } from "react-native";
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
    const { data, error } = await supabase.rpc("accept_invite", { p_code: inviteCode });
    if (error) return Alert.alert("Erreur", error.message);
    Alert.alert("Rejoint ✅", "Bienvenue dans le groupe !");
    router.replace("/(tabs)/matches");
  }

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: "600" }}>Rejoindre un groupe</Text>
      <TextInput
        placeholder="Code d’invitation"
        value={inviteCode}
        onChangeText={setInviteCode}
        autoCapitalize="characters"
        style={{ borderWidth: 1, borderRadius: 8, padding: 12 }}
      />
      <Button title="Rejoindre" onPress={acceptInvite} />
    </View>
  );
}