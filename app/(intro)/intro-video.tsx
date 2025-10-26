import { Redirect } from 'expo-router';
import React from 'react';

export default function IntroVideo() {
  // Neutralise completely: if this route is hit, bounce to /groupes without side effects
  return <Redirect href="/groupes" />;
}