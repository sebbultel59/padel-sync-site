// lib/uiSafe.ts
import * as Haptics from "expo-haptics";
import { Alert, Platform } from "react-native";

/** Web-safe haptic: no-op on web, light impact elsewhere */
export async function safeHaptic() {
  try {
    if (Platform.OS !== "web") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      // Visual cue in dev tools on web
      console.log("Haptic (simulated on web)");
    }
  } catch {}
}

/** Web-safe alert: uses window.alert on web to avoid RN Alert quirks */
export function safeAlert(title: string, msg?: string) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert([title, msg].filter(Boolean).join("\n"));
    } else {
      console.log("Alert:", title, msg);
    }
  } else {
    Alert.alert(title, msg);
  }
}

/** Wrap any onPress to log + surface errors clearly (especially on web) */
export function press(label: string, fn?: () => any) {
  return async () => {
    try {
      console.log(`[UI] ${label} clicked`);
      const res = fn?.();
      if (res instanceof Promise) await res;
    } catch (e) {
      console.error(`[UI] ${label} error:`, e);
      safeAlert("Erreur", (e as any)?.message ?? String(e));
    }
  };
}