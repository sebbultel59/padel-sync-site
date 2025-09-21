// app/join.js
import { router, Stack, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { useActiveGroup } from "../lib/activeGroup";
import { supabase } from "../lib/supabase";

export default function JoinScreen() {
  const { group_id } = useLocalSearchParams();
  const gid = Array.isArray(group_id) ? group_id[0] : group_id;
  const { setActiveGroup } = useActiveGroup();

  const [loading, setLoading] = useState(true);

  const goSignin = useCallback((mode = "signup") => {
    // Envoie vers la page d’auth avec les paramètres pour revenir ici
    router.replace(`/(auth)/signin?group_id=${encodeURIComponent(gid)}&mode=${mode}`);
  }, [gid]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!gid) {
        Alert.alert("Lien invalide", "Aucun groupe indiqué.");
        router.replace("/(tabs)/groupes");
        return;
      }

      // Session ?
      const { data: s } = await supabase.auth.getSession();
      const session = s?.session;

      if (!session) {
        // Pas connecté → va à l’auth, mode inscription par défaut
        goSignin("signup");
        return;
      }

      try {
        // Ajout (ou no-op) dans group_members
        const userId = session.user.id;

        const { error: eUp } = await supabase
          .from("group_members")
          .upsert(
            { group_id: gid, user_id: userId, role: "member" },
            { onConflict: "group_id,user_id" }
          );
        if (eUp) throw eUp;

        // Récupère le groupe pour l’activer
        const { data: g, error: eG } = await supabase
          .from("groups")
          .select("id, name, avatar_url")
          .eq("id", gid)
          .maybeSingle();
        if (eG) throw eG;

        if (g) setActiveGroup(g);

        // Va à l’onglet Groupes
        router.replace("/(tabs)/groupes");
      } catch (e) {
        Alert.alert("Erreur", e?.message ?? String(e));
        router.replace("/(tabs)/groupes");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [gid, goSignin, setActiveGroup]);

  return (
    <>
      <Stack.Screen options={{ title: "Rejoindre un groupe" }} />
      <View style={s.center}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8, color: "#6b7280" }}>
          Traitement de l’invitation…
        </Text>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "white" },
});