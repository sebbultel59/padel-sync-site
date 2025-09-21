// app/(auth)/signin.js
import { router, Stack, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "../../lib/supabase";

const BRAND = "#1a4b97";

export default function SigninScreen() {
  const { group_id, mode } = useLocalSearchParams();
  const gid = Array.isArray(group_id) ? group_id[0] : group_id;
  const initialMode = (Array.isArray(mode) ? mode[0] : mode) === "signup" ? "signup" : "login";

  const [authMode, setAuthMode] = useState(initialMode); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Si déjà connecté, repasse par /join pour finir l’invite
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session) {
        if (gid) router.replace(`/join?group_id=${encodeURIComponent(gid)}`);
        else router.replace("/(tabs)/semaine");
      }
    })();
  }, [gid]);

  const canSubmit = useMemo(() => email.includes("@") && password.length >= 6, [email, password]);

  const onSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setLoading(true);
    try {
      if (authMode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }

      // Après succès, si lien d’invitation, repasse par /join
      if (gid) {
        router.replace(`/join?group_id=${encodeURIComponent(gid)}`);
      } else {
        router.replace("/(tabs)/semaine");
      }
    } catch (e) {
      Alert.alert("Auth", e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [authMode, email, password, gid, canSubmit]);

  return (
    <>
      <Stack.Screen options={{ title: authMode === "signup" ? "Créer un compte" : "Connexion" }} />
      <View style={s.wrap}>
        {/* Toggle */}
        <View style={s.segment}>
          <Pressable
            onPress={() => setAuthMode("login")}
            style={[s.segmentBtn, authMode === "login" && s.segmentBtnActive]}
          >
            <Text style={[s.segmentTxt, authMode === "login" && s.segmentTxtActive]}>Se connecter</Text>
          </Pressable>
          <Pressable
            onPress={() => setAuthMode("signup")}
            style={[s.segmentBtn, authMode === "signup" && s.segmentBtnActive]}
          >
            <Text style={[s.segmentTxt, authMode === "signup" && s.segmentTxtActive]}>Créer un compte</Text>
          </Pressable>
        </View>

        {/* Form */}
        <View style={s.card}>
          {gid ? (
            <Text style={{ marginBottom: 8, color: BRAND, fontWeight: "700" }}>
              Invitation à rejoindre un groupe
            </Text>
          ) : null}

          <Text style={s.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="toi@exemple.com"
            style={s.input}
          />
          <Text style={[s.label, { marginTop: 10 }]}>Mot de passe</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            style={s.input}
          />

          <Pressable
            onPress={onSubmit}
            disabled={!canSubmit || loading}
            style={[s.btn, (!canSubmit || loading) && { backgroundColor: "#9ca3af" }]}
          >
            {loading ? <ActivityIndicator color="#fff" /> : (
              <Text style={s.btnTxt}>{authMode === "signup" ? "Créer mon compte" : "Se connecter"}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "white", padding: 16, gap: 12 },
  card: { backgroundColor: "white", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 12, gap: 8 },

  segment: { flexDirection: "row", backgroundColor: "#f3f4f6", borderRadius: 10, padding: 4, gap: 4 },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 8 },
  segmentBtnActive: { backgroundColor: "white", borderWidth: 1, borderColor: "#e5e7eb" },
  segmentTxt: { fontWeight: "700", color: "#6b7280" },
  segmentTxtActive: { color: "#111827" },

  label: { fontWeight: "700", color: "#6b7280" },
  input: {
    marginTop: 6,
    borderWidth: 1, borderColor: "#d1d5db",
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: "#111827", backgroundColor: "#f9fafb",
  },

  btn: { marginTop: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: BRAND, alignItems: "center" },
  btnTxt: { color: "white", fontWeight: "800" },
});