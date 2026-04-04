// app/(auth)/reset-password.js
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearRecoveryPending, isRecoveryPending, setRecoveryPending } from "../../lib/authRecovery";
import { parseSupabaseAuthUrl } from "../../lib/parseSupabaseAuthUrl";
import { supabase } from "../../lib/supabase";

const BRAND = "#1a4b97";
const LOG = (...args) => {
  if (__DEV__) console.log("[ResetPassword]", ...args);
};

function maskSensitiveTokens(urlString) {
  if (!urlString) return '';
  const raw = String(urlString);
  return raw
    .replace(/access_token=[^&\s]+/g, 'access_token=***')
    .replace(/refresh_token=[^&\s]+/g, 'refresh_token=***');
}

// Récupère les tokens depuis les query params (mobile/native) ou depuis le hash (web)
function getRecoveryTokensFromUrl(params) {
  // Mobile/native: Expo Router donne les query params (ex: ?access_token=...&refresh_token=...)
  const fromParams = {
    access_token: params?.access_token,
    refresh_token: params?.refresh_token,
    type: params?.type,
  };

  const readMaybeString = (v) => (Array.isArray(v) ? v[0] : v);

  const accessToken = readMaybeString(fromParams.access_token);
  const refreshToken = readMaybeString(fromParams.refresh_token);
  const type = readMaybeString(fromParams.type);

  if (accessToken && type === 'recovery') {
    return { accessToken, refreshToken: refreshToken || null, type };
  }

  // Web: Supabase met les paramètres dans le hash (#access_token=...&refresh_token=...&type=recovery)
  if (typeof window !== 'undefined' && window.location?.hash) {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = hashParams.get('access_token');
    const refresh = hashParams.get('refresh_token');
    const hashType = hashParams.get('type');
    if (token && hashType === 'recovery') {
      return { accessToken: token, refreshToken: refresh || null, type: hashType };
    }
  }

  return null;
}

function getRecoveryTokensFromDeepLinkUrlString(urlString) {
  if (!urlString) return null;
  const p = parseSupabaseAuthUrl(urlString);
  if (p?.kind === "recovery" && p.accessToken) {
    return {
      accessToken: p.accessToken,
      refreshToken: p.refreshToken || null,
      type: "recovery",
    };
  }
  if (p?.kind === "auth_error" && __DEV__) {
    LOG("auth_error in URL", p.errorCode, p.errorDescription);
  }
  return null;
}

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const tokensFromParams = getRecoveryTokensFromUrl(params);

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const [tokenValid, setTokenValid] = useState(false);

  // Vérifier le token au chargement (query params + hash sur web)
  useEffect(() => {
    let cancelled = false;
    let timeoutId = null;
    let didAttemptValidation = false;
    let sub = null;

    async function init() {
      const resolvedFromAnyUrl = (urlString) => getRecoveryTokensFromDeepLinkUrlString(urlString);

      // 1) Essayer d'abord via query params exposés par Expo Router
      let resolvedTokens = tokensFromParams ?? null;

      // 2) Si web et hash présent, nettoyer l'URL pour éviter de réafficher à refresh
      if (!resolvedTokens?.accessToken && typeof window !== 'undefined' && window.location?.hash) {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const token = hashParams.get('access_token');
        const type = hashParams.get('type');
        if (token && type === 'recovery') {
          resolvedTokens = { accessToken: token, refreshToken: hashParams.get('refresh_token') || null, type };
          const newPath = `/reset-password?access_token=${encodeURIComponent(token)}`;
          if (window.history?.replaceState) window.history.replaceState(null, '', newPath);
        }
      }

      // 3) Sur mobile/native, si Expo Router n'a pas exposé le token en query params,
      // on le récupère depuis la toute première URL deep link.
      let initialUrl = null;
      if (!resolvedTokens?.accessToken) {
        try {
          initialUrl = await Linking.getInitialURL();
          if (initialUrl) resolvedTokens = resolvedFromAnyUrl(initialUrl) ?? null;
        } catch {
          // ignore
        }
      }

      // 4) En Expo Go, l'URL peut arriver juste après le montage.
      // On attend un court instant pour donner une chance à l'événement deep link.
      const validate = async () => {
        if (cancelled) return;
        if (didAttemptValidation) return;
        didAttemptValidation = true;

        // Session déjà créée par le lien (ex. événement PASSWORD_RECOVERY) sans params dans l’URL
        if (!resolvedTokens?.accessToken && (await isRecoveryPending())) {
          const { data: sess } = await supabase.auth.getSession();
          if (sess?.session?.access_token) {
            LOG("recovery: session déjà présente (PASSWORD_RECOVERY / flag)");
            setTokenValid(true);
            return;
          }
        }

        if (!resolvedTokens?.accessToken) {
          const errFromUrl = initialUrl ? parseSupabaseAuthUrl(initialUrl) : null;
          if (errFromUrl?.kind === "auth_error" && (errFromUrl.errorCode === "otp_expired" || errFromUrl.error === "access_denied")) {
            Alert.alert(
              "Lien expiré",
              "Ce lien de réinitialisation est invalide ou a expiré. Veuillez refaire une demande depuis « Mot de passe oublié ».",
              [{ text: "OK", onPress: () => router.replace("/signin") }]
            );
            return;
          }
          if (initialUrl && String(initialUrl).includes("error_code=otp_expired")) {
            Alert.alert(
              "Lien expiré",
              "Ce lien de réinitialisation est invalide ou a expiré. Veuillez refaire une demande depuis « Mot de passe oublié ».",
              [{ text: "OK", onPress: () => router.replace("/signin") }]
            );
            return;
          }

          Alert.alert(
            "Lien invalide",
            `Aucun token de réinitialisation trouvé.\n\nURL reçue: ${maskSensitiveTokens(initialUrl) || "null"}\n\nVeuillez demander un nouveau lien.`,
            [{ text: "OK", onPress: () => router.replace("/signin") }]
          );
          return;
        }

        try {
          const sessionPayload = { access_token: resolvedTokens.accessToken };
          if (resolvedTokens.refreshToken) sessionPayload.refresh_token = resolvedTokens.refreshToken;

          const { error: setSessionError } = await supabase.auth.setSession(sessionPayload);
          if (cancelled) return;

          if (setSessionError) {
            Alert.alert(
              "Lien invalide",
              `Ce lien de réinitialisation n'est plus valide ou a expiré.\n\n${setSessionError?.message ?? ""}`.trim(),
              [{ text: "OK", onPress: () => router.replace("/signin") }]
            );
            return;
          }

          await setRecoveryPending();
          setTokenValid(true);
        } catch (e) {
          if (cancelled) return;
          const msg = e?.message ?? String(e);
          Alert.alert(
            "Lien invalide",
            `Impossible de valider le lien de réinitialisation.\n\n${msg}`,
            [{ text: "OK", onPress: () => router.replace("/signin") }]
          );
        }
      };

      if (resolvedTokens?.accessToken) {
        await validate();
        return;
      }

      // 5) Écouter les deep links qui arrivent juste après l'ouverture (Expo Go/dev)
      sub = Linking.addEventListener('url', async (event) => {
        if (cancelled) return;
        const nextUrl = event?.url;
        if (!nextUrl) return;
        const t = resolvedFromAnyUrl(nextUrl);
        if (!t?.accessToken) return;
        resolvedTokens = t;
        await validate();
      });

      timeoutId = setTimeout(() => {
        void validate();
      }, 2000);
    }

    init();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      // Supprimer le listener deep link s'il existe
      // (pour React Native, `sub.remove()` est fourni par l'EventSubscription)
      try {
        sub?.remove?.();
      } catch {
        // ignore
      }
    };
  }, [params?.access_token, params?.refresh_token, params?.type]);

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

      await clearRecoveryPending();
      await supabase.auth.signOut();

      Alert.alert(
        "Mot de passe modifié",
        "Votre mot de passe a été modifié avec succès. Connectez-vous avec votre nouveau mot de passe.",
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











