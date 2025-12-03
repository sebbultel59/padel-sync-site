// app/(auth)/reset-password.js
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from "../../lib/supabase";

const BRAND = "#1a4b97";

export default function ResetPasswordScreen() {
  const { access_token } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const [tokenValid, setTokenValid] = useState(false);

  // Vérifier le token au chargement
  useEffect(() => {
    if (access_token) {
      // Essayer de définir la session avec le token
      supabase.auth.setSession({
        access_token: Array.isArray(access_token) ? access_token[0] : access_token,
        refresh_token: '', // Pas nécessaire pour la réinitialisation
      }).then(({ data, error }) => {
        if (error) {
          Alert.alert(
            "Lien invalide",
            "Ce lien de réinitialisation n'est plus valide ou a expiré. Veuillez demander un nouveau lien.",
            [
              {
                text: "OK",
                onPress: () => router.replace("/signin"),
              }
            ]
          );
        } else {
          setTokenValid(true);
        }
      });
    } else {
      Alert.alert(
        "Lien invalide",
        "Aucun token de réinitialisation trouvé. Veuillez demander un nouveau lien.",
        [
          {
            text: "OK",
            onPress: () => router.replace("/signin"),
          }
        ]
      );
    }
  }, [access_token]);

  const canSubmit = password.length >= 6 && password === passwordConfirm && passwordConfirm.length >= 6;

  const onSubmit = useCallback(async () => {
    if (!canSubmit) return;
    if (passwordMismatch) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      Alert.alert(
        "Mot de passe modifié",
        "Votre mot de passe a été modifié avec succès. Vous pouvez maintenant vous connecter.",
        [
          {
            text: "OK",
            onPress: () => router.replace("/signin"),
          }
        ]
      );
    } catch (e) {
      Alert.alert("Erreur", e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [password, passwordConfirm, passwordMismatch, canSubmit]);

  if (!tokenValid) {
    return (
      <View style={{ flex: 1, backgroundColor: "#001831", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={BRAND} />
        <Text style={{ color: "#fff", marginTop: 16 }}>Vérification du lien...</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Réinitialiser le mot de passe" }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: "#001831" }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={[
            { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20, paddingHorizontal: 20 },
            { minHeight: "100%" }
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ flex: 1, justifyContent: "center", maxWidth: 400, width: "100%", alignSelf: "center" }}>
            <View style={{ marginBottom: 40, alignItems: "center" }}>
              <Ionicons name="lock-closed" size={64} color={BRAND} />
              <Text style={{ color: "#fff", fontSize: 24, fontWeight: "bold", marginTop: 16, textAlign: "center" }}>
                Nouveau mot de passe
              </Text>
              <Text style={{ color: "#9ca3af", fontSize: 14, marginTop: 8, textAlign: "center" }}>
                Entrez votre nouveau mot de passe
              </Text>
            </View>

            <Text style={s.label}>Nouveau mot de passe</Text>
            <TextInput
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (passwordConfirm && text !== passwordConfirm) {
                  setPasswordMismatch(true);
                } else {
                  setPasswordMismatch(false);
                }
              }}
              secureTextEntry
              placeholder="••••••••"
              style={[
                s.input,
                passwordMismatch && passwordConfirm.length > 0 && { borderColor: "#dc2626" }
              ]}
              returnKeyType="next"
              autoFocus
            />

            <Text style={[s.label, { marginTop: 10 }]}>Confirmer le mot de passe</Text>
            <TextInput
              value={passwordConfirm}
              onChangeText={(text) => {
                setPasswordConfirm(text);
                if (password && text !== password) {
                  setPasswordMismatch(true);
                } else {
                  setPasswordMismatch(false);
                }
              }}
              secureTextEntry
              placeholder="••••••••"
              style={[
                s.input,
                passwordMismatch && { borderColor: "#dc2626" }
              ]}
              returnKeyType="done"
              onSubmitEditing={onSubmit}
            />
            
            {passwordMismatch && passwordConfirm.length > 0 && (
              <Text style={{ color: "#dc2626", fontSize: 12, marginTop: 4 }}>
                Les mots de passe ne correspondent pas
              </Text>
            )}

            {password.length > 0 && password.length < 6 && (
              <Text style={{ color: "#dc2626", fontSize: 12, marginTop: 4 }}>
                Le mot de passe doit contenir au moins 6 caractères
              </Text>
            )}

            <Pressable
              onPress={onSubmit}
              disabled={!canSubmit || loading}
              style={[s.btn, (!canSubmit || loading) && { backgroundColor: "#9ca3af" }]}
            >
              {loading ? <ActivityIndicator color="#fff" /> : (
                <Text style={s.btnTxt}>Modifier le mot de passe</Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => router.replace("/signin")}
              style={{ marginTop: 16, alignSelf: "center" }}
            >
              <Text style={{ color: BRAND, fontSize: 14, fontWeight: "600" }}>
                Retour à la connexion
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const s = StyleSheet.create({
  label: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#1f2937",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    padding: 12,
    color: "#fff",
    fontSize: 16,
  },
  btn: {
    backgroundColor: BRAND,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 24,
  },
  btnTxt: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});







