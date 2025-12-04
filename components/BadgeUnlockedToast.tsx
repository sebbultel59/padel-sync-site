// components/BadgeUnlockedToast.tsx
// Toast animé pour afficher un badge débloqué

import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withSequence,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

const BRAND = '#1a4b97';

interface BadgeUnlockedToastProps {
  badgeLabel: string;
  visible: boolean;
  onDismiss: () => void;
  delay?: number; // Délai avant affichage (pour file d'attente)
}

export default function BadgeUnlockedToast({
  badgeLabel,
  visible,
  onDismiss,
  delay = 0,
}: BadgeUnlockedToastProps) {
  const translateY = useSharedValue(-200);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.8);
  const badgeScale = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      // Délai avant affichage (pour file d'attente)
      const timer = setTimeout(() => {
        // Vibration légère
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Animation slide-in depuis le haut
        translateY.value = withSpring(0, {
          damping: 15,
          stiffness: 150,
        });
        opacity.value = withTiming(1, { duration: 300 });
        scale.value = withSpring(1, {
          damping: 12,
          stiffness: 200,
        });

        // Animation du badge (bounce-in)
        badgeScale.value = withSequence(
          withSpring(1.3, { damping: 8, stiffness: 200 }),
          withSpring(1, { damping: 10, stiffness: 150 })
        );

        // Auto-dismiss après 3 secondes
        setTimeout(() => {
          dismiss();
        }, 3000);
      }, delay);

      return () => clearTimeout(timer);
    } else {
      dismiss();
    }
  }, [visible]);

  const dismiss = () => {
    translateY.value = withTiming(-200, { duration: 300 });
    opacity.value = withTiming(0, { duration: 300 });
    scale.value = withTiming(0.8, { duration: 300 });
    badgeScale.value = withTiming(0, { duration: 300 });

    setTimeout(() => {
      onDismiss();
    }, 300);
  };

  const containerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
  }));

  // Particules/étoiles simulées (explosion)
  const particleStyle = (index: number) =>
    useAnimatedStyle(() => {
      const angle = (index * 360) / 8;
      const distance = interpolate(
        badgeScale.value,
        [0, 1],
        [0, 40],
        Extrapolate.CLAMP
      );
      const x = Math.cos((angle * Math.PI) / 180) * distance;
      const y = Math.sin((angle * Math.PI) / 180) * distance;

      return {
        transform: [{ translateX: x }, { translateY: y }],
        opacity: interpolate(
          badgeScale.value,
          [0, 0.5, 1],
          [0, 1, 0],
          Extrapolate.CLAMP
        ),
      };
    });

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      {/* Particules d'explosion */}
      <View style={styles.particlesContainer}>
        {[...Array(8)].map((_, i) => (
          <Animated.View
            key={i}
            style={[
              styles.particle,
              {
                backgroundColor:
                  ['#fbbf24', '#ef4444', '#3b82f6', '#22c55e'][i % 4],
              },
              particleStyle(i),
            ]}
          />
        ))}
      </View>

      {/* Contenu du toast */}
      <View style={styles.content}>
        <Animated.View style={[styles.badgeIcon, badgeStyle]}>
          <Ionicons name="trophy" size={32} color="#fbbf24" />
        </Animated.View>

        <View style={styles.textContainer}>
          <Text style={styles.title}>🎉 Badge débloqué !</Text>
          <Text style={styles.label} numberOfLines={2}>
            {badgeLabel}
          </Text>
        </View>

        <Pressable onPress={dismiss} style={styles.closeButton}>
          <Ionicons name="close" size={20} color="#6b7280" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    zIndex: 1000,
  },
  particlesContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  particle: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  content: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 2,
    borderColor: '#fbbf24',
  },
  badgeIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  label: {
    fontSize: 14,
    color: '#6b7280',
  },
  closeButton: {
    padding: 4,
  },
});

