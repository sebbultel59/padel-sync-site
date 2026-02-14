// app/_layout.js
import { router, Slot } from 'expo-router';
import React, { useEffect } from 'react';
import { Linking } from 'react-native';
import 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CopilotProvider } from '../components/AppCopilot';
import { AuthProvider } from '../context/auth';
import { ActiveGroupProvider } from '../lib/activeGroup';

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
  );
}