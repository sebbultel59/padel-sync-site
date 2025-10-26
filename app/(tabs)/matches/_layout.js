// app/(tabs)/matches/_layout.js
import { Stack } from 'expo-router';
import React from 'react';

export default function MatchesStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }} />
  );
}