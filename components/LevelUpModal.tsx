// components/LevelUpModal.tsx
// Modal plein écran pour célébrer la montée de niveau

import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withTiming,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

const BRAND = '#1a4b97';

interface LevelUpModalProps {
  visible: boolean;
  oldLevel: number;
  newLevel: number;
  onClose: () => void;
}

export default function LevelUpModal({
  visible,
  oldLevel,
  newLevel,
  onClose,
}: LevelUpModalProps) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const glowScale = useSharedValue(1);
  const levelTextScale = useSharedValue(0);
  const confettiOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      // Vibration forte au démarrage
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      // Animation d'entrée
      scale.value = withSpring(1, {
        damping: 15,
        stiffness: 150,
      });
      opacity.value = withTiming(1, { duration: 300 });

      // Animation du glow (pulse continu)
      glowScale.value = withSequence(
        withTiming(1.2, { duration: 600 }),
        withTiming(1, { duration: 600 })
      );

      // Animation du texte "Niveau X" (zoom-in/zoom-out)
      levelTextScale.value = withSequence(
        withSpring(1.3, { damping: 8, stiffness: 200 }),
        withSpring(1, { damping: 10, stiffness: 150 })
      );

      // Animation des confettis (simulés avec des cercles animés)
      confettiOpacity.value = withTiming(1, { duration: 500 });

      // Vibration supplémentaire après 300ms
      setTimeout(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }, 300);
    } else {
      // Reset des animations
      scale.value = 0;
      opacity.value = 0;
      glowScale.value = 1;
      levelTextScale.value = 0;
      confettiOpacity.value = 0;
    }
  }, [visible]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
    opacity: interpolate(
      glowScale.value,
      [1, 1.2],
      [0.6, 1],
      Extrapolate.CLAMP
    ),
  }));

  const levelTextStyle = useAnimatedStyle(() => ({
    transform: [{ scale: levelTextScale.value }],
  }));

  const confettiStyle = useAnimatedStyle(() => ({
    opacity: confettiOpacity.value,
  }));

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Animated.View style={[styles.container, containerStyle]}>
          {/* Glow effect autour du niveau */}
          <Animated.View style={[styles.glow, glowStyle]} />

          {/* Confettis simulés (cercles colorés animés) */}
          <Animated.View style={[styles.confettiContainer, confettiStyle]}>
            {[...Array(20)].map((_, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.confetti,
                  {
                    left: `${(i * 5) % 100}%`,
                    top: `${(i * 7) % 100}%`,
                    backgroundColor:
                      ['#fbbf24', '#ef4444', '#3b82f6', '#22c55e', '#a78bfa'][
                        i % 5
                      ],
                  },
                ]}
              />
            ))}
          </Animated.View>

          {/* Contenu principal */}
          <View style={styles.content}>
            <Text style={styles.title}>LEVEL UP!</Text>

            <View style={styles.levelContainer}>
              <Text style={styles.levelLabel}>Niveau</Text>
              <Animated.View style={levelTextStyle}>
                <Text style={styles.levelNumber}>{newLevel}</Text>
              </Animated.View>
            </View>

            <View style={styles.levelChange}>
              <Text style={styles.levelChangeText}>
                {oldLevel} → {newLevel}
              </Text>
            </View>

            <View style={styles.iconContainer}>
              <Ionicons name="trophy" size={80} color="#fbbf24" />
            </View>

            <Text style={styles.subtitle}>
              Félicitations ! Vous avez progressé !
            </Text>

            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>Continuer</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  glow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#fbbf24',
    opacity: 0.6,
    top: '50%',
    left: '50%',
    marginLeft: -100,
    marginTop: -100,
  },
  confettiContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    top: 0,
    left: 0,
  },
  confetti: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  content: {
    alignItems: 'center',
    zIndex: 1,
  },
  title: {
    fontSize: 48,
    fontWeight: '900',
    color: BRAND,
    marginBottom: 24,
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  levelContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  levelLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6b7280',
    marginBottom: 8,
  },
  levelNumber: {
    fontSize: 96,
    fontWeight: '900',
    color: '#fbbf24',
    textShadowColor: 'rgba(251, 191, 36, 0.5)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 8,
  },
  levelChange: {
    marginBottom: 24,
  },
  levelChangeText: {
    fontSize: 24,
    fontWeight: '700',
    color: BRAND,
  },
  iconContainer: {
    marginBottom: 24,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 32,
  },
  closeButton: {
    backgroundColor: BRAND,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    minWidth: 200,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
});

