// app/(tabs)/_layout.js
import { Ionicons } from '@expo/vector-icons';
import { router, Tabs } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from "react-native";
import { supabase } from "../../lib/supabase";

function AuthGuard({ children }) {
  const [status, setStatus] = useState("checking"); // "checking" | "authed" | "anon"

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const uid = data?.user?.id;
        if (!mounted) return;
        setStatus(uid ? "authed" : "anon");
        if (!uid) router.replace("/(auth)/signin");
      } catch {
        if (!mounted) return;
        setStatus("anon");
        router.replace("/(auth)/signin");
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session?.user?.id) setStatus("authed");
      else {
        setStatus("anon");
        router.replace("/(auth)/signin");
      }
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  if (status === "checking") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }
  return children;
}

export default function TabsLayout() {
  return (
    
    <AuthGuard>
      <Tabs
      initialRouteName="groupes"
      screenOptions={({ route }) => ({
        headerShown: true,
        tabBarActiveTintColor: '#1a4b97',
        tabBarInactiveTintColor: 'gray',
        tabBarIcon: ({ focused, color, size }) => {
          let name = 'ellipse';
          let activeColor = '#1a4b97';

          if (route.name === 'semaine') {
            name = focused ? 'calendar' : 'calendar-outline';
            activeColor = '#2563eb';
          } else if (route.name === 'matches') {
            name = focused ? 'tennisball' : 'tennisball-outline';
            activeColor = '#16a34a';
          } else if (route.name === 'groupes') {
            name = focused ? 'people' : 'people-outline';
            activeColor = '#f59e0b';
          } else if (route.name === 'profil') {
            name = focused ? 'person' : 'person-outline';
            activeColor = '#7c3aed';
          }

          return <Ionicons name={name} size={size} color={focused ? activeColor : color} />;
        },
      })}
    >
      <Tabs.Screen name="semaine" options={{ title: 'Dispos' }} />
      <Tabs.Screen
        name="matches"
        options={{ title: 'Matches', tabBarLabel: 'Matches', headerShown: false }}
      />
      <Tabs.Screen name="groupes" options={{ title: 'Groupes' }} />
      <Tabs.Screen name="profil" options={{ title: 'Profil' }} />
    </Tabs>
    </AuthGuard>
  );
}