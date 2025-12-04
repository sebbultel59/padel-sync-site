// components/OnFireLabel.tsx
// Label animé "On Fire" pour les séries de victoires

import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

interface OnFireLabelProps {
  winStreak: number;
  size?: 'small' | 'medium' | 'large';
}

export default function OnFireLabel({
  winStreak,
  size = 'medium',
}: OnFireLabelProps) {
  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.5);

  useEffect(() => {
    // Animation pulse continue
    scale.value = withRepeat(
      withTiming(1.05, { duration: 1000 }),
      -1,
      true
    );

    // Animation glow
    glowOpacity.value = withRepeat(
      withTiming(1, { duration: 1000 }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      glowOpacity.value,
      [0.5, 1],
      [0.3, 0.7],
      Extrapolate.CLAMP
    ),
  }));

  if (winStreak < 3) return null;

  const sizeStyles = {
    small: { fontSize: 12, padding: 4, iconSize: 14 },
    medium: { fontSize: 14, padding: 6, iconSize: 16 },
    large: { fontSize: 16, padding: 8, iconSize: 18 },
  };

  const currentSize = sizeStyles[size];

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      {/* Glow effect */}
      <Animated.View
        style={[
          styles.glow,
          {
            width: currentSize.iconSize * 3,
            height: currentSize.iconSize * 3,
            borderRadius: (currentSize.iconSize * 3) / 2,
          },
          glowStyle,
        ]}
      />

      {/* Contenu */}
      <View
        style={[
          styles.content,
          {
            paddingHorizontal: currentSize.padding,
            paddingVertical: currentSize.padding / 2,
          },
        ]}
      >
        <Ionicons
          name="flame"
          size={currentSize.iconSize}
          color="#ef4444"
          style={styles.icon}
        />
        <Text
          style={[
            styles.text,
            {
              fontSize: currentSize.fontSize,
            },
          ]}
        >
          On Fire
        </Text>
        {winStreak >= 5 && (
          <Text style={[styles.streak, { fontSize: currentSize.fontSize - 2 }]}>
            {winStreak}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    backgroundColor: '#ef4444',
    opacity: 0.5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
    gap: 4,
    zIndex: 1,
  },
  icon: {
    marginRight: 2,
  },
  text: {
    fontWeight: '800',
    color: '#ef4444',
  },
  streak: {
    fontWeight: '700',
    color: '#dc2626',
    marginLeft: 2,
  },
});

