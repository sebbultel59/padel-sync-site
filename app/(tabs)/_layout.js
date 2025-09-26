// app/(tabs)/_layout.js
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="semaine"
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
  );
}