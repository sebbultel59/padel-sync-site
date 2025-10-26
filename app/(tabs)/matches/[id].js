import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, Text } from 'react-native';

export default function MatchDetailScreen() {
  const { id, open } = useLocalSearchParams();
  const router = useRouter();

  // Placeholders — we keep this page simple; actions are now handled from the list
  React.useEffect(() => {
    // No auto-open here anymore; inline buttons handle it in the list
  }, [open]);

  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" style={{ marginBottom: 12 }}>
        <Text style={{ fontWeight: '800' }}>← Retour</Text>
      </Pressable>

      <Text style={{ fontWeight: '900', fontSize: 18, marginBottom: 8 }}>Détail du match</Text>
      <Text style={{ marginBottom: 16, color: '#374151' }}>ID : {String(id || '')}</Text>

      <Text style={{ color: '#6b7280' }}>Infos du match…</Text>
    </ScrollView>
  );
}