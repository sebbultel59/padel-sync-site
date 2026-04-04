import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const TEXT = '#EAF0FF';
const PRIMARY_ORANGE = '#ff8c00';
const FIND_BLUE = '#156BC9';
const INK = '#0B1526';

export type EmptyStateMatchProps = {
  onAddAvailability: () => void;
  onInvitePlayers: () => void;
  /** Ouvre le flux « Trouver » / partie à compléter */
  onFindGame?: () => void;
  /** Masque « Ajouter mes disponibilités » et « Inviter des joueurs » (ex. onglet À compléter) */
  showAvailabilityAndInvite?: boolean;
  showMissingClubs?: boolean;
  title?: string;
  hook?: string;
  variant?: 'full' | 'compact';
};

export function EmptyStateMatch({
  onAddAvailability,
  onInvitePlayers,
  onFindGame,
  showAvailabilityAndInvite = true,
  showMissingClubs = false,
  title = "Aucun match pour l'instant",
  hook = 'Sois le premier à lancer la dynamique',
  variant = 'full',
}: EmptyStateMatchProps) {
  const fade = useRef(new Animated.Value(0)).current;
  const compact = variant === 'compact';

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    }).start();
  }, [fade]);

  return (
    <Animated.View style={[styles.root, compact && styles.rootCompact, { opacity: fade }]}>
      <Text accessible={false} style={[styles.emoji, compact && styles.emojiCompact]}>
        🎾
      </Text>
      <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
      <Text style={[styles.hook, compact && styles.hookCompact]}>{hook}</Text>
      {showMissingClubs ? (
        <Text style={styles.warning}>
          Choisis au moins 1 club accepté pour recevoir des propositions.
        </Text>
      ) : null}
      <View style={[styles.buttons, compact && styles.buttonsCompact]}>
        {showAvailabilityAndInvite ? (
          <Pressable
            onPress={onAddAvailability}
            accessibilityRole="button"
            accessibilityLabel="Ajouter mes disponibilités"
            style={({ pressed }) => [
              styles.btnPrimary,
              pressed && styles.pressed,
              Platform.OS === 'web' && { cursor: 'pointer' as const },
            ]}
          >
            <Text style={styles.btnPrimaryText}>Ajouter mes disponibilités</Text>
          </Pressable>
        ) : null}
        {onFindGame ? (
          <Pressable
            onPress={onFindGame}
            accessibilityRole="button"
            accessibilityLabel="Mettre une partie à compléter"
            style={({ pressed }) => [
              styles.btnFind,
              pressed && styles.pressed,
              Platform.OS === 'web' && { cursor: 'pointer' as const },
            ]}
          >
            <Text style={styles.btnFindText}>Mettre une partie à compléter</Text>
          </Pressable>
        ) : null}
        {showAvailabilityAndInvite ? (
          <Pressable
            onPress={onInvitePlayers}
            accessibilityRole="button"
            accessibilityLabel="Inviter des joueurs"
            style={({ pressed }) => [
              styles.btnSecondary,
              pressed && styles.pressed,
              Platform.OS === 'web' && { cursor: 'pointer' as const },
            ]}
          >
            <Text style={styles.btnSecondaryText}>Inviter des joueurs</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 28,
  },
  rootCompact: {
    paddingVertical: 16,
    maxWidth: 440,
  },
  emoji: {
    fontSize: 40,
    marginBottom: 14,
    lineHeight: 44,
  },
  emojiCompact: {
    fontSize: 32,
    marginBottom: 10,
    lineHeight: 36,
  },
  title: {
    color: TEXT,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  titleCompact: {
    fontSize: 17,
    marginBottom: 8,
  },
  hook: {
    color: TEXT,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  hookCompact: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  warning: {
    color: '#e0ff00',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 8,
    lineHeight: 18,
  },
  buttons: {
    width: '100%',
    marginTop: 22,
    gap: 12,
  },
  buttonsCompact: {
    marginTop: 16,
    gap: 10,
  },
  btnPrimary: {
    width: '100%',
    backgroundColor: PRIMARY_ORANGE,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: {
    color: INK,
    fontWeight: '900',
    fontSize: 16,
  },
  btnFind: {
    width: '100%',
    backgroundColor: FIND_BLUE,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnFindText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 16,
  },
  btnSecondary: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  btnSecondaryText: {
    color: TEXT,
    fontWeight: '800',
    fontSize: 15,
  },
  pressed: {
    opacity: 0.92,
  },
});
