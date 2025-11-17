// app/(auth)/signin.js
import { router, Stack, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from "../../lib/supabase";

const BRAND = "#1a4b97";

export default function SigninScreen() {
  const { group_id, mode } = useLocalSearchParams();
  const gid = Array.isArray(group_id) ? group_id[0] : group_id;
  const initialMode = (Array.isArray(mode) ? mode[0] : mode) === "signup" ? "signup" : "login";
  const insets = useSafeAreaInsets();

  const [authMode, setAuthMode] = useState(initialMode); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Si déjà connecté, repasse par /join pour finir l'invite ou redirige vers l'index
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session) {
        if (gid) router.replace(`/join?group_id=${encodeURIComponent(gid)}`);
        else router.replace("/"); // Rediriger vers l'index qui vérifiera le profil
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

      // Après succès, si lien d'invitation, repasse par /join
      if (gid) {
        router.replace(`/join?group_id=${encodeURIComponent(gid)}`);
      } else {
        // Pour un nouveau compte (signup), rediriger vers l'index qui vérifiera le profil
        // Pour un login, rediriger vers l'index aussi pour vérifier le profil
        router.replace("/");
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
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: "#001831" }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={[
            s.wrap,
            { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 20) }
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Image
            source={require('../../assets/icons/logo-signin.png')}
            style={[
              s.logo,
              Platform.OS === 'web' && { maxHeight: 250 }
            ]}
            resizeMode="contain"
          />
          
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
              returnKeyType="next"
              blurOnSubmit={false}
            />
            <Text style={[s.label, { marginTop: 10 }]}>Mot de passe</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              style={s.input}
              returnKeyType="done"
              onSubmitEditing={onSubmit}
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

          <Image
            source={require('../../assets/images/padel_3click_signin.png')}
            style={s.footerImage}
            resizeMode="contain"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexGrow: 1,
    backgroundColor: "#001831",
    padding: 16,
    gap: 12,
    justifyContent: 'center',
    minHeight: '100%',
  },
  logo: {
    width: '100%',
    height: Platform.OS === 'web' ? 250 : 300,
    alignSelf: 'center',
    marginBottom: Platform.OS === 'web' ? -30 : -40,
    marginTop: 10,
  },
  card: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 16,
    gap: 8,
    maxWidth: Platform.OS === 'web' ? 500 : '100%',
    alignSelf: 'center',
    width: '100%',
  },
  segment: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    padding: 4,
    gap: 4,
    marginTop: 20,
    maxWidth: Platform.OS === 'web' ? 500 : '100%',
    alignSelf: 'center',
    width: '100%',
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 8,
  },
  segmentBtnActive: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  segmentTxt: {
    fontWeight: "700",
    color: "#6b7280",
    fontSize: 14,
  },
  segmentTxtActive: {
    color: "#111827",
  },
  label: {
    fontWeight: "700",
    color: "#6b7280",
    fontSize: 14,
  },
  input: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#f9fafb",
    minHeight: 48,
  },
  btn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: BRAND,
    alignItems: "center",
    minHeight: 48,
    justifyContent: 'center',
  },
  btnTxt: {
    color: "white",
    fontWeight: "800",
    fontSize: 16,
  },
  footerImage: {
    width: '100%',
    height: Platform.OS === 'web' ? 80 : 100,
    alignSelf: 'center',
    marginBottom: Platform.OS === 'web' ? 0 : -10,
    marginTop: 20,
  },
});