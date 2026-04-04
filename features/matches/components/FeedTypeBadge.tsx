import React from 'react';
import { Text, View } from 'react-native';

type FeedKind = 'possible' | 'complete' | 'validated';

const LABELS: Record<FeedKind, string> = {
  possible: '⚡ Possible',
  complete: '➕ Compléter',
  validated: '✅ Validé',
};

const COLORS: Record<FeedKind, { bg: string; text: string }> = {
  possible: { bg: 'rgba(229, 255, 0, 0.16)', text: '#E5FF00' },
  complete: { bg: 'rgba(21, 107, 201, 0.25)', text: '#93C5FD' },
  validated: { bg: 'rgba(16, 185, 129, 0.2)', text: '#6EE7B7' },
};

type Props = {
  kind: FeedKind;
  extra?: string;
};

export function FeedTypeBadge({ kind, extra }: Props) {
  const c = COLORS[kind];
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: c.bg,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
      }}
    >
      <Text style={{ color: c.text, fontWeight: '800', fontSize: 12 }}>
        {LABELS[kind]}
        {extra ? ` · ${extra}` : ''}
      </Text>
    </View>
  );
}
