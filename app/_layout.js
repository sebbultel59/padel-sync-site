// app/_layout.js
import { router, Slot } from 'expo-router';
import React, { useEffect } from 'react';
import { Linking } from 'react-native';
import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CopilotProvider } from '../components/AppCopilot';
import { AuthProvider } from '../context/auth';
import { setRecoveryPending } from '../lib/authRecovery';
import { ActiveGroupProvider } from '../lib/activeGroup';
import { buildResetPasswordRouteQuery, parseSupabaseAuthUrl } from '../lib/parseSupabaseAuthUrl';
import { supabase } from '../lib/supabase';

const tooltipStyle = {
  backgroundColor: '#dcff13',
  borderRadius: 12,
  padding: 14,
};

const textStyle = {
  color: '#000000',
  fontSize: 14,
};

const buttonStyle = {
  color: '#000000',
  fontSize: 14,
  fontWeight: '600',
};

function parseJoinUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const normalized = url.replace(/^syncpadel:\/\//, 'https://placeholder/');
    const urlObj = new URL(normalized);
    const groupId = urlObj.searchParams.get('group_id');
    const code = urlObj.searchParams.get('code');
    if (groupId) return { type: 'group_id', value: groupId };
    if (code) return { type: 'code', value: code };
  } catch (_) {}
  return null;
}

export default function RootLayout() {
  // Écouter les deep links "join" pour forcer une navigation avec params frais
  // (résout le bug : rejoin après quitter → params vides, clic Rejoindre sans effet)
  useEffect(() => {
    const handleUrl = (event) => {
      const url = event?.url;
      if (!url || (!url.includes('/join') && !url.includes('group_id='))) return;
      const parsed = parseJoinUrl(url);
      if (!parsed) return;
      const q = parsed.type === 'group_id'
        ? `group_id=${encodeURIComponent(parsed.value)}`
        : `code=${encodeURIComponent(parsed.value)}`;
      router.replace(`/join?${q}`);
    };
    const sub = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });
    return () => sub.remove();
  }, []);

  // Deep links Supabase : recovery (reset password) vs OAuth — priorité recovery pour ne pas traiter comme magic link
  useEffect(() => {
    const handleAuthUrl = async (url) => {
      if (!url || typeof url !== 'string') return;
      // Laisser le handler "join" gérer ces liens (autre useEffect)
      if (url.includes('group_id=') || url.includes('/join')) return;

      const parsed = parseSupabaseAuthUrl(url);
      if (__DEV__) {
        console.log('[RootLayout][authUrl]', url?.slice(0, 160), '→', parsed?.kind);
      }
      if (!parsed) return;

      if (parsed.kind === 'auth_error') {
        if (__DEV__) {
          console.warn('[RootLayout] auth error in URL', parsed.errorCode, parsed.errorDescription);
        }
        return;
      }

      if (parsed.kind === 'recovery') {
        await setRecoveryPending();
        const q = buildResetPasswordRouteQuery(parsed);
        if (q) {
          router.replace(`/reset-password?${q}`);
        } else {
          router.replace('/reset-password');
        }
        return;
      }

      if (parsed.kind === 'oauth_success') {
        const { error } = await supabase.auth.setSession({
          access_token: parsed.accessToken,
          refresh_token: parsed.refreshToken,
        });
        if (error) {
          console.warn('[RootLayout] setSession OAuth', error.message);
          return;
        }
        router.replace('/');
      }
    };

    const sub = Linking.addEventListener('url', (e) => {
      handleAuthUrl(e.url);
    });
    Linking.getInitialURL().then((url) => {
      if (url) handleAuthUrl(url);
    });
    return () => sub.remove();
  }, []);

  // Supabase : événement PASSWORD_RECOVERY → écran reset (session déjà établie par le lien)
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (__DEV__) {
        console.log('[RootLayout][onAuthStateChange]', event, session?.user?.id ?? 'no-user');
      }
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryPending().then(() => {
          router.replace('/reset-password');
        });
      }
    });
    return () => {
      sub?.subscription?.unsubscribe();
    };
  }, []);

  // Enregistrer le token push au démarrage de l'app
  useEffect(() => {
    // Attendre un peu pour que l'auth soit prête
    const timer = setTimeout(async () => {
      try {
        // Import dynamique pour éviter de charger expo-notifications en Expo Go
        const { registerPushToken } = await import('../lib/notifications');
        await registerPushToken();
      } catch (err) {
        console.warn('[RootLayout] Erreur enregistrement token push:', err);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Mécanisme de rechargement automatique désactivé
  // Le Fast Refresh d'Expo Go gère déjà les mises à jour automatiquement
  // Ce code causait des rechargements trop fréquents (toutes les 5 secondes)
  // useEffect(() => {
  //   // Désactivé pour éviter les rechargements intempestifs
  // }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <CopilotProvider
          animated
          overlay="view"
          tooltipStyle={tooltipStyle}
          textStyle={textStyle}
          buttonStyle={buttonStyle}
          arrowColor="#dcff13"
          stepNumberTextColor="#000000"
          labels={{ previous: 'Préc.', next: 'Suivant', skip: 'Passer', finish: 'Terminer' }}
        >
          <AuthProvider>
            <ActiveGroupProvider>
              <Slot />
            </ActiveGroupProvider>
          </AuthProvider>
        </CopilotProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}