// app/profiles/_layout.js
import { Stack } from "expo-router";

export default function ProfilesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: "Profil",
      }}
    />
  );
}