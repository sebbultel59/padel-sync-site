// app/_layout.js
import { Slot } from 'expo-router';
import React from 'react';
import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ActiveGroupProvider } from '../lib/activeGroup';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ActiveGroupProvider>
        <Slot />
      </ActiveGroupProvider>
    </GestureHandlerRootView>
  );
}