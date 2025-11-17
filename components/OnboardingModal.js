// components/OnboardingModal.js
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * Composant Modal réutilisable pour les popups d'onboarding
 * @param {boolean} visible - Contrôle la visibilité de la modal
 * @param {string} message - Message à afficher
 * @param {function} onClose - Fonction appelée lors de la fermeture
 */
export function OnboardingModal({ visible, message, onClose }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Bienvenue !</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#111827" />
            </Pressable>
          </View>
          <View style={styles.content}>
            <Text style={styles.message}>{message}</Text>
          </View>
          <View style={styles.footer}>
            <Pressable onPress={onClose} style={styles.button}>
              <Text style={styles.buttonText}>Compris</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  container: {
    width: '90%',
    maxWidth: 500,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontWeight: '900',
    fontSize: 18,
    color: '#0b2240',
  },
  closeButton: {
    padding: 8,
  },
  content: {
    marginBottom: 20,
  },
  message: {
    fontSize: 16,
    color: '#374151',
    lineHeight: 24,
  },
  footer: {
    alignItems: 'flex-end',
  },
  button: {
    backgroundColor: '#1a4b97',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

