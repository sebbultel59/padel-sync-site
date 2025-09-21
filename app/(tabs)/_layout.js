// app/(tabs)/_layout.js
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";

export default function Layout() {
  return (
    <Tabs
      initialRouteName="semaine"
      screenOptions={({ route }) => ({
        headerShown: true,
        tabBarActiveTintColor: "#1a4b97",
        tabBarInactiveTintColor: "gray",
        tabBarIcon: ({ focused, color, size }) => {
          let name = "ellipse";
          let activeColor = "#1a4b97"; // fallback bleu

          if (route.name === "semaine") {
            name = focused ? "calendar" : "calendar-outline";
            activeColor = "#2563eb"; // bleu
          } else if (route.name === "matches") {
            name = focused ? "tennisball" : "tennisball-outline";
            activeColor = "#16a34a"; // vert
          } else if (route.name === "groupes") {
            name = focused ? "people" : "people-outline";
            activeColor = "#f59e0b"; // orange
          } else if (route.name === "profil") {
            name = focused ? "person" : "person-outline";
            activeColor = "#7c3aed"; // violet
          }

          return (
            <Ionicons
              name={name}
              size={size}
              color={focused ? activeColor : color}
            />
          );
        },
      })}
    >
      <Tabs.Screen name="semaine" options={{ title: "Dispos" }} />
      <Tabs.Screen
        name="matches"
        options={{
          headerShown: false,
          title: "Matches",
          tabBarLabel: "Matches",
        }}
      />
      <Tabs.Screen name="groupes" options={{ title: "Groupes" }} />
      <Tabs.Screen name="profil" options={{ title: "Profil" }} />
    </Tabs>
  );
}