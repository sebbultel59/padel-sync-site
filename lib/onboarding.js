// lib/onboarding.js

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'onboarding_v1_done';



export async function hasSeenOnboarding() {

  try { return (await AsyncStorage.getItem(KEY)) === '1'; } catch { return true; }

}

export async function setOnboardingSeen() {

  try { await AsyncStorage.setItem(KEY, '1'); } catch {}

}

