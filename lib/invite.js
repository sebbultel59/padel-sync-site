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

const ACCEPT_INVITE_FAIL = new Set(["code_used", "code_expired", "code_max_uses", "code_invalid", "unauthenticated"]);

const FAIL_MESSAGES = {
  code_used: "Ce code a déjà été utilisé.",
  code_expired: "Ce code a expiré.",
  code_max_uses: "Ce code a atteint la limite d'utilisations.",
  code_invalid: "Code invalide.",
  unauthenticated: "Connecte-toi pour rejoindre un groupe.",
};

export async function acceptInviteCode(code) {
  const { data, error } = await supabase.rpc("accept_invite", {
    p_code: String(code || "").trim(),
  });
  if (error) {
    console.error("[invite] accept_invite RPC error:", error);
    throw error;
  }
  const res = data && typeof data === "object" ? data : { group_id: data, status: "joined" };
  const status = res?.status;
  if (ACCEPT_INVITE_FAIL.has(status)) {
    throw new Error(FAIL_MESSAGES[status] || "Impossible de rejoindre le groupe.");
  }
  return res?.group_id ?? data;
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
