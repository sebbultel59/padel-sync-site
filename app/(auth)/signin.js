// app/(auth)/signin.js
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from "../../lib/supabase";

// Fermer le navigateur web après l'authentification
WebBrowser.maybeCompleteAuthSession();

const BRAND = "#1a4b97";

// Activer/désactiver les boutons OAuth (masqués pour l'instant, à activer après configuration Supabase)
const ENABLE_OAUTH_BUTTONS = false;

export default function SigninScreen() {
  const { group_id, mode } = useLocalSearchParams();
  const gid = Array.isArray(group_id) ? group_id[0] : group_id;
  const initialMode = (Array.isArray(mode) ? mode[0] : mode) === "signup" ? "signup" : "login";
  const insets = useSafeAreaInsets();

  const [authMode, setAuthMode] = useState(initialMode); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const [oauthLoading, setOauthLoading] = useState({ google: false, facebook: false, apple: false });
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

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

  const canSubmit = useMemo(() => {
    const emailValid = email.includes("@");
    const passwordValid = password.length >= 6;
    if (authMode === "signup") {
      const passwordsMatch = password === passwordConfirm && passwordConfirm.length >= 6;
      return emailValid && passwordValid && passwordsMatch;
    }
    return emailValid && passwordValid;
  }, [email, password, passwordConfirm, authMode]);

  const onSubmit = useCallback(async () => {
    if (!canSubmit) return;
    
    // Vérifier la concordance des mots de passe en mode signup
    if (authMode === "signup") {
      if (password !== passwordConfirm) {
        setPasswordMismatch(true);
        Alert.alert("Erreur", "Les mots de passe ne correspondent pas.");
        return;
      }
      setPasswordMismatch(false);
    }
    
    setLoading(true);
    try {
      if (authMode === "signup") {
        // Vérifier d'abord si l'email existe déjà dans Supabase
        const { data: emailExists, error: checkError } = await supabase.rpc('check_email_exists', {
          email_to_check: email
        });
        
        // Si l'email existe déjà, afficher le message approprié
        if (emailExists === true) {
          Alert.alert(
            "Email déjà utilisé",
            "Cet email est déjà utilisé. Veuillez utiliser la procédure de mot de passe oublié sur l'onglet \"Se connecter\".",
            [
              {
                text: "Aller à Se connecter",
                onPress: () => {
                  setPassword("");
                  setPasswordConfirm("");
                  setPasswordMismatch(false);
                  setAuthMode("login");
                }
              },
              {
                text: "OK",
                style: "cancel"
              }
            ]
          );
          return;
        }
        
        // SignUp avec email de vérification obligatoire
        // Note: L'email de vérification est envoyé automatiquement par Supabase
        // si la configuration est activée dans le dashboard Supabase
        // Utiliser une URL explicite (comme pour password recovery) pour éviter les problèmes de délivrabilité Gmail
        const emailRedirectTo = Platform.OS === 'web' && typeof window !== 'undefined'
          ? `${window.location.origin}/`
          : 'https://syncpadel.app/';  // URL explicite au lieu de undefined pour mobile
        
        const { data, error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            emailRedirectTo,
          }
        });
        
        // Gérer les erreurs spécifiques
        if (error) {
          // Si l'erreur concerne les exigences du mot de passe, traduire en français
          if (error.message?.includes('Password should contain') || error.message?.includes('password') && error.message?.includes('contain')) {
            const specialChars = "!@#$%^&*()_+-=[]{};':\"|<>?,./`~";
            Alert.alert(
              "Mot de passe invalide",
              "Le mot de passe doit contenir obligatoirement :\n\n" +
              "• Une majuscule (A-Z)\n" +
              "• Une minuscule (a-z)\n" +
              "• Un chiffre (0-9)\n" +
              "• Un caractère spécial\n\n" +
              "Caractères spéciaux acceptés :\n" + specialChars.split('').join(' ')
            );
            return;
          }
          
          // Si l'utilisateur existe déjà, indiquer qu'il faut utiliser la procédure de mot de passe oublié
          if (error.message?.includes('already registered') || error.message?.includes('already exists') || error.message?.includes('User already registered')) {
            Alert.alert(
              "Email déjà utilisé",
              "Cet email est déjà utilisé. Veuillez utiliser la procédure de mot de passe oublié sur l'onglet \"Se connecter\".",
              [
                {
                  text: "Aller à Se connecter",
                  onPress: () => {
                    setPassword("");
                    setPasswordConfirm("");
                    setPasswordMismatch(false);
                    setAuthMode("login");
                  }
                },
                {
                  text: "OK",
                  style: "cancel"
                }
              ]
            );
            return;
          }
          throw error;
        }
        
        // Vérifier si l'utilisateur a été créé
        if (!data?.user) {
          throw new Error("Impossible de créer le compte. Veuillez réessayer.");
        }
        
        // Toujours afficher le message d'email de vérification après signup
        // Même si une session est créée, on force la vérification
        Alert.alert(
          "Vérification requise",
          "Un email de vérification a été envoyé à " + email + ". Veuillez cliquer sur le lien dans l'email pour activer votre compte avant de pouvoir vous connecter.\n\nSi vous ne recevez pas l'email, vérifiez votre dossier spam.",
          [
            {
              text: "OK",
              onPress: () => {
                // Déconnecter l'utilisateur s'il a été connecté automatiquement
                supabase.auth.signOut();
                // Réinitialiser les champs
                setEmail("");
                setPassword("");
                setPasswordConfirm("");
                setPasswordMismatch(false);
                // Revenir au mode login
                setAuthMode("login");
              }
            }
          ]
        );
        return;
      } else {
        // Connexion : vérifier que l'email est vérifié
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        
        // Vérifier si l'email est vérifié
        if (signInData?.user && !signInData.user.email_confirmed_at) {
          // Déconnecter l'utilisateur
          await supabase.auth.signOut();
          Alert.alert(
            "Email non vérifié",
            "Votre email n'a pas encore été vérifié. Veuillez vérifier votre boîte mail et cliquer sur le lien de vérification. Si vous n'avez pas reçu l'email, vous pouvez en demander un nouveau.",
            [
              {
                text: "Demander un nouvel email",
                onPress: async () => {
                  try {
                    const emailRedirectToResend = Platform.OS === 'web' && typeof window !== 'undefined'
                      ? `${window.location.origin}/`
                      : 'https://syncpadel.app/';  // URL explicite au lieu de undefined
                    
                    const { error: resendError } = await supabase.auth.resend({
                      type: 'signup',
                      email: email,
                      options: {
                        emailRedirectTo: emailRedirectToResend,
                      }
                    });
                    if (resendError) throw resendError;
                    Alert.alert("Email envoyé", "Un nouvel email de vérification a été envoyé à " + email);
                  } catch (e) {
                    Alert.alert("Erreur", e?.message ?? String(e));
                  }
                }
              },
              {
                text: "OK",
                style: "cancel"
              }
            ]
          );
          return;
        }
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
      // Traduire les erreurs de validation de mot de passe
      const errorMsg = e?.message ?? String(e);
      if (errorMsg.includes('Password should contain') || (errorMsg.includes('password') && errorMsg.includes('contain'))) {
        const specialChars = "!@#$%^&*()_+-=[]{};':\"|<>?,./`~";
        Alert.alert(
          "Mot de passe invalide",
          "Le mot de passe doit contenir obligatoirement :\n\n" +
          "• Une majuscule (A-Z)\n" +
          "• Une minuscule (a-z)\n" +
          "• Un chiffre (0-9)\n" +
          "• Un caractère spécial\n\n" +
          "Caractères spéciaux acceptés :\n" + specialChars.split('').join(' ')
        );
      } else if (errorMsg.toLowerCase().includes('invalid login credentials') || errorMsg.toLowerCase().includes('invalid auth credentials')) {
        Alert.alert(
          "Faute !",
          "Identifiants et/ou mot de passe invalides. Si nécessaire clique sur mot de passe oublié ou crée un compte."
        );
      } else {
        Alert.alert("Auth", errorMsg);
      }
    } finally {
      setLoading(false);
    }
  }, [authMode, email, password, passwordConfirm, gid, canSubmit]);

  // Fonction générique pour l'authentification OAuth
  const signInWithOAuth = useCallback(async (provider) => {
    // Apple Sign In n'est disponible que sur iOS
    if (provider === 'apple' && Platform.OS !== 'ios') {
      Alert.alert("Non disponible", "Apple Sign In n'est disponible que sur iOS.");
      return;
    }

    setOauthLoading(prev => ({ ...prev, [provider]: true }));
    
    try {
      // Construire l'URL de redirection
      const redirectTo = Platform.OS === 'web' && typeof window !== 'undefined'
        ? `${window.location.origin}/`
        : `syncpadel://auth/callback`;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: Platform.OS !== 'web', // Sur mobile, on gère manuellement avec WebBrowser
        },
      });

      if (error) throw error;

      // Sur web, Supabase gère automatiquement la redirection du navigateur
      // La redirection se fait automatiquement, pas besoin de traitement supplémentaire
      if (Platform.OS === 'web') {
        return;
      }

      // Sur mobile, ouvrir le navigateur pour l'authentification
      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectTo
        );

        if (result.type === 'success') {
          // Extraire les paramètres de l'URL de callback
          const urlParts = result.url.split('#');
          if (urlParts.length > 1) {
            const params = new URLSearchParams(urlParts[1]);
            const accessToken = params.get('access_token');
            const refreshToken = params.get('refresh_token');

            if (accessToken && refreshToken) {
              // Échanger les tokens pour une session
              const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });

              if (sessionError) throw sessionError;

              // Rediriger après succès
              if (gid) {
                router.replace(`/join?group_id=${encodeURIComponent(gid)}`);
              } else {
                router.replace("/");
              }
            }
          }
        } else if (result.type === 'cancel') {
          // L'utilisateur a annulé, ne rien faire
          return;
        }
      }
    } catch (e) {
      Alert.alert("Erreur d'authentification", e?.message ?? String(e));
    } finally {
      setOauthLoading(prev => ({ ...prev, [provider]: false }));
    }
  }, [gid]);

  // Fonctions spécifiques pour chaque provider
  const signInWithGoogle = useCallback(() => signInWithOAuth('google'), [signInWithOAuth]);
  const signInWithFacebook = useCallback(() => signInWithOAuth('facebook'), [signInWithOAuth]);
  const signInWithApple = useCallback(() => signInWithOAuth('apple'), [signInWithOAuth]);

  // Fonction pour réinitialiser le mot de passe
  const onForgotPassword = useCallback(async () => {
    if (!email || !email.includes("@")) {
      Alert.alert("Erreur", "Veuillez entrer une adresse email valide.");
      return;
    }

    setLoading(true);
    try {
      // Pour les emails de réinitialisation, utiliser une page web intermédiaire
      // Cette page redirigera vers le deep link avec le token
      // URL de la page : https://syncpadel.app/reset-password (ou votre domaine)
      const redirectTo = Platform.OS === 'web' && typeof window !== 'undefined'
        ? `${window.location.origin}/reset-password`
        : 'https://syncpadel.app/reset-password';

      console.log('[Reset Password] redirectTo:', redirectTo);

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      if (error) {
        const errorMsg = error.message ?? String(error);
        const isRateLimit = errorMsg.includes('rate limit') || errorMsg.includes('rate_limit') || errorMsg.includes('rate limit exceeded');
        
        if (isRateLimit) {
          throw new Error("⏱️ Limite de taux d'email atteinte.\n\n" +
            "🔍 Causes possibles :\n" +
            "• Limite Supabase (plan gratuit : ~3 emails/heure)\n" +
            "• Quota SMTP personnalisé dépassé (Brevo, SendGrid, etc.)\n\n" +
            "💡 Solutions :\n" +
            "1. Vérifiez votre quota Brevo/SMTP dans votre compte fournisseur\n" +
            "2. Vérifiez les logs Supabase > Authentication > Logs\n" +
            "3. Vérifiez votre boîte mail (y compris le dossier spam) - l'email a peut-être déjà été envoyé\n" +
            "4. Attendez 1 heure puis réessayez");
        }
        throw error;
      }

      setResetEmailSent(true);
      Alert.alert(
        "Email envoyé",
        "Un email de réinitialisation de mot de passe a été envoyé à " + email + ". Vérifiez votre boîte mail et suivez les instructions.\n\nNote: Cliquez sur le lien dans l'email pour ouvrir l'application."
      );
    } catch (e) {
      const errorMsg = e?.message ?? String(e);
      // Si c'est déjà un message formaté (avec emojis), l'afficher tel quel
      if (errorMsg.includes('⏱️') || errorMsg.includes('Limite de taux')) {
        Alert.alert("Erreur", errorMsg);
      } else {
        Alert.alert("Erreur", "Impossible d'envoyer l'email de réinitialisation.\n\n" + errorMsg);
      }
    } finally {
      setLoading(false);
    }
  }, [email]);

  // Gérer les deep links OAuth et reset password
  useEffect(() => {
    const handleDeepLink = async (event) => {
      const url = event.url;
      
      // Vérifier si c'est un callback OAuth
      if (url.includes('/auth/callback') || url.includes('syncpadel://auth/callback')) {
        // Extraire les paramètres de l'URL (format: syncpadel://auth/callback#access_token=...&refresh_token=...)
        const urlParts = url.split('#');
        if (urlParts.length > 1) {
          const params = new URLSearchParams(urlParts[1]);
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');

          if (accessToken && refreshToken) {
            try {
              const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });

              if (sessionError) throw sessionError;

              // Rediriger après succès
              if (gid) {
                router.replace(`/join?group_id=${encodeURIComponent(gid)}`);
              } else {
                router.replace("/");
              }
            } catch (e) {
              Alert.alert("Erreur", e?.message ?? String(e));
            }
          }
        }
      }
      
      // Vérifier si c'est un callback Supabase avec un token de réinitialisation
      // Format: https://PROJECT.supabase.co/auth/v1/callback#access_token=...&type=recovery
      if (url.includes('/auth/v1/callback') || url.includes('auth/v1/callback')) {
        const urlParts = url.split('#');
        if (urlParts.length > 1) {
          const params = new URLSearchParams(urlParts[1]);
          const accessToken = params.get('access_token');
          const type = params.get('type');
          
          // Si c'est un token de réinitialisation
          if (accessToken && type === 'recovery') {
            // Rediriger vers la page de réinitialisation avec le token
            router.replace(`/reset-password?access_token=${encodeURIComponent(accessToken)}`);
            return;
          }
        }
      }
      
      // Vérifier si c'est un lien de réinitialisation de mot de passe (deep link)
      if (url.includes('reset-password') || url.includes('reset_password')) {
        // Extraire le token depuis l'URL
        // Format: syncpadel://reset-password#access_token=...&type=recovery
        const urlParts = url.split('#');
        if (urlParts.length > 1) {
          const params = new URLSearchParams(urlParts[1]);
          const accessToken = params.get('access_token');
          const type = params.get('type');
          
          // Si c'est un token de réinitialisation
          if (accessToken && type === 'recovery') {
            // Rediriger vers la page de réinitialisation avec le token
            router.replace(`/reset-password?access_token=${encodeURIComponent(accessToken)}`);
            return;
          }
        }
        
        // Si l'URL contient déjà les paramètres en query string
        try {
          const urlObj = new URL(url.replace('syncpadel://', 'https://'));
          const accessToken = urlObj.searchParams.get('access_token');
          const type = urlObj.searchParams.get('type');
          
          if (accessToken && type === 'recovery') {
            router.replace(`/reset-password?access_token=${encodeURIComponent(accessToken)}`);
            return;
          }
        } catch (e) {
          // Ignorer les erreurs de parsing
        }
      }
    };

    // Écouter les deep links
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Vérifier si l'app a été ouverte via un deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [gid]);

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
              onPress={() => {
                setAuthMode("login");
                setPasswordConfirm("");
                setPasswordMismatch(false);
              }}
              style={[s.segmentBtn, authMode === "login" && s.segmentBtnActive]}
            >
              <Text style={[s.segmentTxt, authMode === "login" && s.segmentTxtActive]}>Se connecter</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setAuthMode("signup");
                setPasswordConfirm("");
                setPasswordMismatch(false);
              }}
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
            
            {authMode === "login" && !forgotPasswordMode && (
              <Pressable
                onPress={() => setForgotPasswordMode(true)}
                style={{ alignSelf: "flex-end", marginTop: 8 }}
              >
                <Text style={{ color: BRAND, fontSize: 12, fontWeight: "600" }}>
                  Mot de passe oublié ?
                </Text>
              </Pressable>
            )}

            {forgotPasswordMode ? (
              <>
                <Text style={{ color: "#6b7280", fontSize: 12, marginTop: 8, marginBottom: 16 }}>
                  Entrez votre adresse email et nous vous enverrons un lien pour réinitialiser votre mot de passe.
                </Text>
                <Pressable
                  onPress={onForgotPassword}
                  disabled={!email.includes("@") || loading}
                  style={[s.btn, (!email.includes("@") || loading) && { backgroundColor: "#9ca3af" }]}
                >
                  {loading ? <ActivityIndicator color="#fff" /> : (
                    <Text style={s.btnTxt}>Envoyer l'email de réinitialisation</Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => {
                    setForgotPasswordMode(false);
                    setResetEmailSent(false);
                  }}
                  style={{ marginTop: 12, alignSelf: "center" }}
                >
                  <Text style={{ color: BRAND, fontSize: 14, fontWeight: "600" }}>
                    Retour à la connexion
                  </Text>
                </Pressable>
                {resetEmailSent && (
                  <Text style={{ color: "#15803d", fontSize: 12, marginTop: 8, textAlign: "center" }}>
                    ✓ Email envoyé ! Vérifiez votre boîte mail.
                  </Text>
                )}
              </>
            ) : (
              <>
            <Text style={[s.label, { marginTop: 10 }]}>Mot de passe</Text>
            <TextInput
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (authMode === "signup" && passwordConfirm && text !== passwordConfirm) {
                  setPasswordMismatch(true);
                } else {
                  setPasswordMismatch(false);
                }
              }}
              secureTextEntry
              placeholder="••••••••"
              style={[
                s.input,
                passwordMismatch && authMode === "signup" && { borderColor: "#dc2626" }
              ]}
              returnKeyType={authMode === "signup" ? "next" : "done"}
              onSubmitEditing={authMode === "signup" ? undefined : onSubmit}
            />
            
            {authMode === "signup" && (
              <>
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
              </>
            )}

            <Pressable
              onPress={onSubmit}
              disabled={!canSubmit || loading}
              style={[s.btn, (!canSubmit || loading) && { backgroundColor: "#9ca3af" }]}
            >
              {loading ? <ActivityIndicator color="#fff" /> : (
                <Text style={s.btnTxt}>{authMode === "signup" ? "Créer mon compte" : "Se connecter"}</Text>
              )}
            </Pressable>
              </>
            )}

            {/* Séparateur OAuth - Masqué pour l'instant, activer avec ENABLE_OAUTH_BUTTONS = true */}
            {ENABLE_OAUTH_BUTTONS && (
              <>
                <View style={s.oauthSeparator}>
                  <View style={s.separatorLine} />
                  <Text style={s.separatorText}>Ou continuer avec</Text>
                  <View style={s.separatorLine} />
                </View>

                {/* Boutons OAuth */}
                <View style={s.oauthButtons}>
                  {/* Google */}
                  <Pressable
                    onPress={signInWithGoogle}
                    disabled={oauthLoading.google || loading}
                    style={[s.oauthButton, s.oauthButtonGoogle, (oauthLoading.google || loading) && { opacity: 0.6 }]}
                  >
                    {oauthLoading.google ? (
                      <ActivityIndicator color="#4285F4" size="small" />
                    ) : (
                      <>
                        <Ionicons name="logo-google" size={20} color="#4285F4" />
                        <Text style={s.oauthButtonText}>Google</Text>
                      </>
                    )}
                  </Pressable>

                  {/* Facebook */}
                  <Pressable
                    onPress={signInWithFacebook}
                    disabled={oauthLoading.facebook || loading}
                    style={[s.oauthButton, s.oauthButtonFacebook, (oauthLoading.facebook || loading) && { opacity: 0.6 }]}
                  >
                    {oauthLoading.facebook ? (
                      <ActivityIndicator color="#1877F2" size="small" />
                    ) : (
                      <>
                        <Ionicons name="logo-facebook" size={20} color="#1877F2" />
                        <Text style={[s.oauthButtonText, { color: "#1877F2" }]}>Facebook</Text>
                      </>
                    )}
                  </Pressable>

                  {/* Apple (iOS uniquement) */}
                  {Platform.OS === 'ios' && (
                    <Pressable
                      onPress={signInWithApple}
                      disabled={oauthLoading.apple || loading}
                      style={[s.oauthButton, s.oauthButtonApple, (oauthLoading.apple || loading) && { opacity: 0.6 }]}
                    >
                      {oauthLoading.apple ? (
                        <ActivityIndicator color="#000000" size="small" />
                      ) : (
                        <>
                          <Ionicons name="logo-apple" size={20} color="#000000" />
                          <Text style={[s.oauthButtonText, { color: "#000000" }]}>Apple</Text>
                        </>
                      )}
                    </Pressable>
                  )}
                </View>
              </>
            )}
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
  oauthSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 16,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  separatorText: {
    marginHorizontal: 12,
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  oauthButtons: {
    gap: 12,
  },
  oauthButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    gap: 8,
    minHeight: 48,
  },
  oauthButtonGoogle: {
    borderColor: '#e5e7eb',
  },
  oauthButtonFacebook: {
    borderColor: '#e5e7eb',
  },
  oauthButtonApple: {
    borderColor: '#000000',
    backgroundColor: '#ffffff',
  },
  oauthButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
});