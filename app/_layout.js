// app/_layout.js
import { Slot } from 'expo-router';
import React from 'react';
import { AuthProvider } from '../context/auth';
import { ActiveGroupProvider } from '../lib/activeGroup';

export default function RootLayout() {
  return (
    <AuthProvider>
      <ActiveGroupProvider>
        <Slot />
      </ActiveGroupProvider>
    </AuthProvider>
  );
}