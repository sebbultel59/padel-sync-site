// app/_layout.js
import 'react-native-gesture-handler';
import { Slot } from 'expo-router';
import React, { useEffect } from 'react';
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

export default function RootLayout() {
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