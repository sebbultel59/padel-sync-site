// supabase/functions/push-confirmed/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const EXPO_API_URL = "https://exp.host/--/api/v2/push/send";

// Vars d'environnement (configurées dans Supabase → Edge Functions → Secrets)
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("EDGE_WEBHOOK_SECRET") ?? ""; // ex: padelsync_webhook_secret_123

const isUuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(v);

function frTimeRange(start?: string | null, end?: string | null): string {
  if (!start) return "Match confirmé 🎾";
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const day = s.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "short" });
  const sh = s.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false });
  const eh = e ? e.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
  return e ? `${day} ${sh}–${eh}` : `${day} ${sh}`;
}

serve(async (req) => {
  try {
    // 0) Sécurité : secret simple côté webhook
    const hdr = req.headers.get("x-webhook-secret") ?? "";
    if (!WEBHOOK_SECRET || hdr !== WEBHOOK_SECRET) {
      console.warn("Unauthorized: bad or missing x-webhook-secret");
      return new Response("Unauthorized", { status: 401 });
    }

    // 1) Payload
    const payload = await req.json().catch(() => ({} as any));
    const match_id = payload?.match_id as string | undefined;

    if (!isUuid(match_id)) {
      console.warn("Bad payload: match_id invalid", payload);
      return new Response("Bad payload", { status: 400 });
    }

    // 2) Supabase admin
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 3) Match minimal
    const { data: m, error: em } = await admin
      .from("matches")
      .select("id, group_id, status, time_slot_id")
      .eq("id", match_id)
      .maybeSingle();

    if (em) {
      console.error("DB error: matches select", em);
      return new Response("DB error", { status: 500 });
    }
    if (!m) {
      console.warn("Match not found:", match_id);
      return new Response("Not found", { status: 404 });
    }
    if (m.status !== "confirmed") {
      console.log("Match not confirmed (skip):", match_id, "status=", m.status);
      return new Response("Not confirmed", { status: 200 });
    }

    // 4) Slot
    let startIso: string | null = null;
    let endIso: string | null = null;
    if (m.time_slot_id) {
      const { data: slot, error: es } = await admin
        .from("time_slots")
        .select("starts_at, ends_at")
        .eq("id", m.time_slot_id)
        .maybeSingle();

      if (es) {
        console.error("DB error: time_slots select", es);
        return new Response("DB error", { status: 500 });
      }
      if (slot) {
        startIso = (slot as any).starts_at ?? null;
        endIso = (slot as any).ends_at ?? null;
      }
    }

    // 5) Groupe (optionnel)
    let groupName: string | undefined = undefined;
    if (m.group_id) {
      const { data: g, error: eg } = await admin
        .from("groups")
        .select("name")
        .eq("id", m.group_id)
        .maybeSingle();

      if (eg) {
        console.error("DB error: groups select", eg);
        return new Response("DB error", { status: 500 });
      }
      if (g) groupName = (g as any).name as string | undefined;
    }

    // 6) Destinataires = RSVPs "yes"
    const { data: rsvps, error: er } = await admin
      .from("match_rsvps")
      .select("user_id")
      .eq("match_id", m.id)
      .eq("status", "yes");

    if (er) {
      console.error("DB error: match_rsvps select", er);
      return new Response("DB error", { status: 500 });
    }

    const userIds = (rsvps ?? []).map((r) => r.user_id);
    if (!userIds.length) {
      console.log("No RSVP yes → No users to notify");
      return new Response("No users", { status: 200 });
    }

    // 7) Profils → tokens
    const { data: profs, error: ep } = await admin
      .from("profiles")
      .select("id, email, expo_push_token")
      .in("id", userIds);

    if (ep) {
      console.error("DB error: profiles select", ep);
      return new Response("DB error", { status: 500 });
    }

    const tokens = (profs ?? [])
      .map((p) => (p as any).expo_push_token as string | null)
      .filter((t): t is string => !!t && t.startsWith("ExponentPushToken["));

    if (!tokens.length) {
      console.log("No Expo tokens → skip");
      return new Response("No tokens", { status: 200 });
    }

    // 8) Titre/Body
    const title = groupName ? `Match confirmé 🎾 — ${groupName}` : "Match confirmé 🎾";
    const body = frTimeRange(startIso, endIso);

    // 9) Envoi Expo Push (batches de 100)
    const batchSize = 100;
    const batches: string[][] = [];
    for (let i = 0; i < tokens.length; i += batchSize) {
      batches.push(tokens.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      const messages = batch.map((to) => ({
        to,
        title,
        body,
        sound: "default",
        priority: "high",
        data: { match_id, kind: "confirmed" }, // <-- IMPORTANT: on met le match_id dans data
      }));

      const resp = await fetch(EXPO_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messages),
      });

      const text = await resp.text();
      // Expo répond JSON, mais on log le texte brut pour éviter un throw si ce n’est pas exactement du JSON
      console.log("Expo push response:", resp.status, text);
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("push-confirmed top-level", e);
    return new Response("error", { status: 500 });
  }
});