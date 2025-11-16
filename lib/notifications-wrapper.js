// lib/notifications-wrapper.js
// Wrapper pour charger expo-notifications de manière conditionnelle
import { Platform } from "react-native";
import Constants from "expo-constants";

// Détecter si on est en Expo Go (où les notifications push Android ne fonctionnent pas)
const isExpoGo = Constants.executionEnvironment === 'storeClient';
const notificationsSupported = !isExpoGo || Platform.OS !== 'android';

let NotificationsModule = null;
let NotificationsLoaded = false;

// Charger le module de manière dynamique seulement si supporté
async function loadNotificationsModule() {
  if (NotificationsLoaded) {
    return NotificationsModule;
  }
  
  if (!notificationsSupported) {
    NotificationsLoaded = true;
    return null;
  }
  
  try {
    NotificationsModule = await import('expo-notifications');
    NotificationsLoaded = true;
    return NotificationsModule;
  } catch (e) {
    console.warn('[Notifications] Erreur lors du chargement du module:', e);
    NotificationsLoaded = true;
    return null;
  }
}

// Fonction helper pour utiliser le module de manière sûre
export async function withNotifications(callback) {
  if (!notificationsSupported) {
    return null;
  }
  
  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    return null;
  }
  
  try {
    return await callback(Notifications);
  } catch (e) {
    console.warn('[Notifications] Erreur lors de l\'utilisation du module:', e);
    return null;
  }
}

// Export des constantes utiles
export const isNotificationsSupported = notificationsSupported;
export const isExpoGoEnvironment = isExpoGo;

