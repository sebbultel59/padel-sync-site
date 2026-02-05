import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

export const PENDING_INVITE_CODE_KEY = "pending_invite_code";
export const INVITE_JOINED_BANNER_KEY = "invite_joined_banner";

export async function storePendingInvite(code) {
  if (!code) return;
  await AsyncStorage.setItem(PENDING_INVITE_CODE_KEY, String(code).trim());
}

export async function getPendingInviteCode() {
  return AsyncStorage.getItem(PENDING_INVITE_CODE_KEY);
}

export async function clearPendingInvite() {
  await AsyncStorage.removeItem(PENDING_INVITE_CODE_KEY);
}

export async function acceptInviteCode(code) {
  const { data, error } = await supabase.rpc("accept_invite", {
    p_code: String(code || "").trim(),
  });
  if (error) throw error;
  return data;
}

export async function setInviteJoinedBanner(payload) {
  if (!payload) return;
  await AsyncStorage.setItem(
    INVITE_JOINED_BANNER_KEY,
    JSON.stringify({ ...payload, ts: Date.now() })
  );
}

export async function popInviteJoinedBanner() {
  try {
    const raw = await AsyncStorage.getItem(INVITE_JOINED_BANNER_KEY);
    if (!raw) return null;
    await AsyncStorage.removeItem(INVITE_JOINED_BANNER_KEY);
    return JSON.parse(raw);
  } catch {
    await AsyncStorage.removeItem(INVITE_JOINED_BANNER_KEY);
    return null;
  }
}
