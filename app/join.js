// app/join.js
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Button, Text, TextInput, View } from "react-native";
import { supabase } from "../lib/supabase";

export default function Join() {
  const { code } = useLocalSearchParams(); // lit /join?code=ABC123 ou /invite/ABC123 si on route vers /join
  const [inviteCode, setInviteCode] = useState(code ?? "");
  const router = useRouter();

  useEffect(() => {
    if (code) setInviteCode(code);
  }, [code]);

  async function acceptInvite() {
    if (!inviteCode) return Alert.alert("Code requis", "Entre un code d’invitation.");
    const { data, error } = await supabase.rpc("accept_invite", { p_code: inviteCode });
    if (error) return Alert.alert("Erreur", error.message);
    Alert.alert("Rejoint ✅", "Bienvenue dans le groupe !");
    router.replace("/(tabs)/groupes");
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