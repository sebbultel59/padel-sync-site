// lib/onboardingFlags.js
import AsyncStorage from '@react-native-async-storage/async-storage';

const FLAG_KEYS = {
  PROFILE_SAVED: 'onboarding_profile_saved',
  GROUPS_VISITED: 'onboarding_groups_visited',
  GROUP_ACTIVATED: 'onboarding_group_activated',
  GROUP_JOINED: 'onboarding_group_joined',
  DISPOS_VISITED: 'onboarding_dispos_visited',
};

/**
 * Récupère un flag d'onboarding depuis AsyncStorage
 * @param {string} key - Clé du flag (utiliser FLAG_KEYS)
 * @returns {Promise<boolean>} true si le flag est défini, false sinon
 */
export async function getOnboardingFlag(key) {
  try {
    const value = await AsyncStorage.getItem(key);
    return value === 'true';
  } catch (e) {
    console.warn('[onboardingFlags] Error getting flag:', key, e);
    return false;
  }
}

/**
 * Définit un flag d'onboarding dans AsyncStorage
 * @param {string} key - Clé du flag (utiliser FLAG_KEYS)
 * @param {boolean} value - Valeur à définir
 * @returns {Promise<void>}
 */
export async function setOnboardingFlag(key, value) {
  try {
    if (value) {
      await AsyncStorage.setItem(key, 'true');
    } else {
      await AsyncStorage.removeItem(key);
    }
  } catch (e) {
    console.warn('[onboardingFlags] Error setting flag:', key, e);
  }
}

/**
 * Réinitialise tous les flags d'onboarding (utile pour les tests)
 * @returns {Promise<void>}
 */
export async function resetOnboardingFlags() {
  try {
    await Promise.all(
      Object.values(FLAG_KEYS).map(key => AsyncStorage.removeItem(key))
    );
  } catch (e) {
    console.warn('[onboardingFlags] Error resetting flags:', e);
  }
}

export { FLAG_KEYS };

