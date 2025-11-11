// app/_layout.js
import { Slot } from 'expo-router';
import React from 'react';
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
  return (
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
  );
}