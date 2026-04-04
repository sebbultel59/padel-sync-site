import AsyncStorage from '@react-native-async-storage/async-storage';

export const AUTH_RECOVERY_PENDING_KEY = 'padel_auth_recovery_pending';

export async function setRecoveryPending() {
  try {
    await AsyncStorage.setItem(AUTH_RECOVERY_PENDING_KEY, '1');
    if (__DEV__) console.log('[authRecovery] setRecoveryPending');
  } catch (e) {
    console.warn('[authRecovery] setRecoveryPending failed', e?.message);
  }
}

export async function clearRecoveryPending() {
  try {
    await AsyncStorage.removeItem(AUTH_RECOVERY_PENDING_KEY);
    if (__DEV__) console.log('[authRecovery] clearRecoveryPending');
  } catch (e) {
    console.warn('[authRecovery] clearRecoveryPending failed', e?.message);
  }
}

export async function isRecoveryPending() {
  try {
    const v = await AsyncStorage.getItem(AUTH_RECOVERY_PENDING_KEY);
    return v === '1';
  } catch {
    return false;
  }
}
