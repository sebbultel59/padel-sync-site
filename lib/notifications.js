// padel-sync/lib/notifications.js
import * as Device from "expo-device";
import { Platform } from "react-native";
import { supabase } from "./supabase";
import { isNotificationsSupported, withNotifications } from "./notifications-wrapper";

// Debug: prouve que ce module est chargé
console.log("notifications.js loaded ✅");

// Handler: afficher les notifs même en foreground (uniquement si supporté)
// Configuration différée pour éviter l'import statique
if (isNotificationsSupported) {
  (async () => {
    await withNotifications(async (Notifications) => {
      try {
        Notifications.setNotificationHandler({
          handleNotification: async (notification) => {
            console.log('[Notifications] Notification reçue:', notification);
            return {
              shouldShowBanner: true,  // Afficher la bannière de notification
              shouldShowList: true,    // Afficher dans la liste des notifications
              shouldPlaySound: true,  // Activer le son pour les notifications push
              shouldSetBadge: true,   // Activer le badge pour iOS
            };
          },
        });
      } catch (e) {
        console.warn('[Notifications] Erreur lors de la configuration du handler:', e);
      }
    });
  })();
}

export function isQuietHours(date = new Date()) {
  const h = date.getHours();
  return h >= 22 || h < 8;
}

export async function ensureNotifPermission() {
  if (!isNotificationsSupported) {
    return false;
  }
  return await withNotifications(async (Notifications) => {
    try {
      const settings = await Notifications.getPermissionsAsync();
      if (
        settings.granted ||
        settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
      )
        return true;
      const req = await Notifications.requestPermissionsAsync();
      return !!req.granted || req.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    } catch (e) {
      console.warn('[Notifications] Erreur lors de la vérification des permissions:', e);
      return false;
    }
  }) || false;
}

export async function notifyLocal(title, body) {
  if (!isNotificationsSupported) return;
  if (isQuietHours()) return;
  await withNotifications(async (Notifications) => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title, body },
        trigger: null,
      });
    } catch (e) {
      console.warn('[Notifications] Erreur lors de l\'envoi de notification locale:', e);
    }
  });
}

// ✅ Correction ici
export async function registerPushToken() {
  if (!isNotificationsSupported) {
    // Log silencieux - cette situation est normale en Expo Go Android
    return null;
  }
  
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.log("PUSH: no user session");
      return null;
    }

    const ok = await ensureNotifPermission();
    if (!ok) {
      console.log("PUSH: permission denied");
      return null;
    }

    if (!Device.isDevice) {
      console.log("PUSH: simulator/no device");
      return null;
    }

    return await withNotifications(async (Notifications) => {
      if (Platform.OS === "android") {
        try {
          await Notifications.setNotificationChannelAsync("default", {
            name: "default",
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        } catch (e) {
          console.warn("PUSH: Erreur configuration canal Android:", e);
          // Continuer même si le canal échoue
        }
      }

      // ⚠️ Fix : projectId EAS en dur pour TestFlight
      const projectId = "527d2473-fc9c-4070-a4d7-dfe710a64830";

      const tokenObj = await Notifications.getExpoPushTokenAsync({ projectId });
      const token = tokenObj?.data ?? null;
      console.log("✅ PUSH: token =", token);

      if (user?.id && token) {
        const { error } = await supabase
          .from("profiles")
          .update({ expo_push_token: token })
          .eq("id", user.id);

        if (error) console.warn("Erreur enregistrement token:", error);
        else console.log("💾 Token enregistré avec succès pour", user.id);
      }

      return token;
    }) || null;
  } catch (e) {
    console.log("PUSH: unexpected error", e);
    return null;
  }
}