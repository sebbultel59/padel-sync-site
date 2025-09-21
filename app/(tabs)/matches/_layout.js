// app/(tabs)/matches/_layout.js
import { Stack } from "expo-router";
import React from "react";

export default function MatchesStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      {/* Liste des matchs (route par défaut de l'onglet) */}
      <Stack.Screen name="index" options={{ title: "Matches" }} />

      {/* Détail d'un match (navigué depuis la liste ou une notification) */}
      <Stack.Screen name="[id]" options={{ title: "Détail du match" }} />
    </Stack>
  );
}