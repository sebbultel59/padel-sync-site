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

  const circleSize = currentSize.iconSize * 3.5;

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      {/* Cercle rouge clignotant */}
      <Animated.View
        style={[
          styles.circle,
          {
            width: circleSize,
            height: circleSize,
            borderRadius: circleSize / 2,
          },
          glowStyle,
        ]}
      />

      {/* Flamme emoji et chiffre superposés */}
      <View style={[styles.overlay, { width: circleSize, height: circleSize }]}>
        <Text style={[styles.emoji, { fontSize: currentSize.iconSize * 1.5 }]}>
          🔥
        </Text>
        <Text style={[styles.streakNumber, { fontSize: currentSize.fontSize }]}>
          {winStreak}
        </Text>
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
  circle: {
    position: 'absolute',
    backgroundColor: '#ef4444',
    opacity: 0.8,
  },
  overlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  emoji: {
    marginTop: -8,
    textAlign: 'center',
  },
  streakNumber: {
    marginTop: 2,
    fontWeight: '900',
    color: '#ffffff',
    textShadowColor: '#000000',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    textAlign: 'center',
  },
});

