// app/_layout.js
import { Slot } from 'expo-router';
import React from 'react';
import { CopilotProvider } from '../components/AppCopilot';
import { AuthProvider } from '../context/auth';
import { ActiveGroupProvider } from '../lib/activeGroup';

export default function RootLayout() {
  return (
    <CopilotProvider
      animated
      overlay="svg"
      tooltipStyle={{
        backgroundColor: '#0b2240',
        borderRadius: 12,
        padding: 14,
      }}
      arrowColor="#0b2240"
      stepNumberTextColor="#FF751F"
      labels={{ previous: 'Préc.', next: 'Suivant', skip: 'Passer', finish: 'Terminer' }}
    >
      <AuthProvider>
        <ActiveGroupProvider>
          <Slot />
        </ActiveGroupProvider>
      </AuthProvider>
    </CopilotProvider>
  );
}