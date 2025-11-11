// padel-sync/lib/notifications.js
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "./supabase";

// Debug: prouve que ce module est chargé
console.log("notifications.js loaded ✅");

// Handler: afficher les notifs même en foreground
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    console.log('[Notifications] Notification reçue:', notification);
    return {
      shouldShowAlert: true,
      shouldPlaySound: true, // Activer le son pour les notifications push
      shouldSetBadge: true,  // Activer le badge pour iOS
    };
  },
});

export function isQuietHours(date = new Date()) {
  const h = date.getHours();
  return h >= 22 || h < 8;
}

export async function ensureNotifPermission() {
  const settings = await Notifications.getPermissionsAsync();
  if (
    settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  )
    return true;
  const req = await Notifications.requestPermissionsAsync();
  return !!req.granted || req.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function notifyLocal(title, body) {
  if (isQuietHours()) return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: null,
  });
}

// ✅ Correction ici
export async function registerPushToken() {
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

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
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
  } catch (e) {
    console.log("PUSH: unexpected error", e);
    return null;
  }
}