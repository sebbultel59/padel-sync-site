// app/_layout.js
import { Stack } from "expo-router";
import React from "react";
import { ActiveGroupProvider } from "../lib/activeGroup";

// Layout racine simple : on laisse les sous-arborescences gérer leurs headers & logique.
// (L'auth + notifications restent dans app/(tabs)/_layout.js comme avant.)
export default function RootLayout() {
  return (
    <ActiveGroupProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </ActiveGroupProvider>
  );
}