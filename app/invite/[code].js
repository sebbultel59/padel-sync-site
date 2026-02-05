import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useActiveGroup } from "../../lib/activeGroup";
import {
    acceptInviteCode,
    clearPendingInvite,
    setInviteJoinedBanner,
    storePendingInvite,
} from "../../lib/invite";
import { supabase } from "../../lib/supabase";

export default function InviteScreen() {
  const { code } = useLocalSearchParams();
  const inviteCode = Array.isArray(code) ? code[0] : code;
  const router = useRouter();
  const { setActiveGroup } = useActiveGroup();
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("Traitement de l'invitation...");

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!inviteCode) {
        if (!mounted) return;
        setStatus("error");
        setMessage("Code d'invitation manquant.");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        await storePendingInvite(inviteCode);
        router.replace("/(auth)/signin");
        return;
      }

      try {
        const groupId = await acceptInviteCode(inviteCode);
        if (!groupId) throw new Error("Impossible de rejoindre ce groupe.");

        const { data: group } = await supabase
          .from("groups")
          .select("id, name, avatar_url, visibility, join_policy, club_id")
          .eq("id", groupId)
          .maybeSingle();

        if (group?.id) {
          await AsyncStorage.setItem("active_group_id", String(group.id));
          setActiveGroup(group);
          await setInviteJoinedBanner({ groupName: group.name });
        }

        await clearPendingInvite();
        router.replace("/(tabs)/matches");
      } catch (e) {
        if (!mounted) return;
        setStatus("error");
        setMessage(e?.message || "Invitation invalide ou expirée.");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [inviteCode, router, setActiveGroup]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20 }}>
      {status === "loading" ? (
        <>
          <ActivityIndicator size="large" color="#e0ff00" />
          <Text style={{ marginTop: 12, color: "#ffffff", fontWeight: "700" }}>{message}</Text>
        </>
      ) : (
        <>
          <Text style={{ color: "#ffffff", fontWeight: "700", textAlign: "center" }}>
            {message}
          </Text>
          <Pressable
            onPress={() => router.replace("/join")}
            style={{
              marginTop: 16,
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 999,
              backgroundColor: "#e0ff00",
            }}
          >
            <Text style={{ color: "#001831", fontWeight: "800" }}>Entrer un code</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
