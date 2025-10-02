// supabase/functions/notify-match-created/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.2";

const SB_URL = Deno.env.get("SB_URL");
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY");

const admin =
  SB_URL && SB_SERVICE_ROLE_KEY
    ? createClient(SB_URL, SB_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

type Payload = { match_id?: string; group_id?: string };

const POSITIVE = ["yes","maybe","accepted"];

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  try {
    const auth = req.headers.get("authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return json(401, { ok: false, error: "Missing Authorization header" });
    }

    if (!SB_URL || !SB_SERVICE_ROLE_KEY || !admin) {
      return json(500, { ok: false, error: "Server misconfigured (SB_URL / SB_SERVICE_ROLE_KEY)" });
    }

    const { match_id, group_id } = (await req.json().catch(() => ({}))) as Payload;
    if (!match_id || !group_id) {
      return json(400, { ok: false, error: "Missing match_id or group_id" });
    }

    // 1) Fetch RSVPs (⚠️ rename table/columns here if different in your schema)
    const { data: rsvps, error: rsvpsErr } = await admin
      .from("match_rsvps")
      .select("user_id,status")
      .eq("match_id", match_id);
    if (rsvpsErr) return json(500, { ok: false, step: "select_rsvps", error: rsvpsErr.message });

    const toNotifyUserIds =
      (rsvps ?? [])
        .filter((r) => r.status && POSITIVE.includes(String(r.status).toLowerCase()))
        .map((r) => r.user_id);

    if (toNotifyUserIds.length === 0) {
      return json(200, { ok: true, notified: 0, reason: "no_positive_rsvp" });
    }

    // 2) Get Expo tokens from profiles
    const { data: profiles, error: profErr } = await admin
      .from("profiles")
      .select("id, display_name, expo_push_token")
      .in("id", toNotifyUserIds);
    if (profErr) return json(500, { ok: false, step: "select_profiles", error: profErr.message });

    const tokens = (profiles ?? [])
      .map((p) => p.expo_push_token)
      .filter((t): t is string => !!t && t.startsWith("ExponentPushToken["));

    if (tokens.length === 0) {
      return json(200, { ok: true, notified: 0, reason: "no_tokens" });
    }

    // 3) Send Expo push
    const messages = tokens.map((to) => ({
      to,
      sound: "default",
      title: "Match créé 🎾",
      body: "Confirme ta participation dans Padel Sync.",
      data: { type: "match_created", match_id, group_id },
      priority: "high",
    }));

    const expoResp = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });

    const expoJson = await expoResp.json().catch(() => ({}));
    if (!expoResp.ok) {
      return json(502, { ok: false, step: "expo_push", status: expoResp.status, details: expoJson });
    }

    return json(200, { ok: true, notified: tokens.length, expo: expoJson });
  } catch (e) {
    return json(500, { ok: false, error: String(e) });
  }
});