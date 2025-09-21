// supabase/functions/push-reminders/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const EXPO_API_URL = "https://exp.host/--/api/v2/push/send";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Fenêtre de détection ±5 minutes autour de J-24h / J-2h
const WINDOW_MIN = 5;

function frRange(startISO?: string | null, endISO?: string | null) {
  if (!startISO) return "Rappel match 🎾";
  const s = new Date(startISO);
  const e = endISO ? new Date(endISO) : null;
  const d = s.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "short" });
  const sh = s.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const eh = e ? e.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "";
  return e ? `${d} ${sh}–${eh}` : `${d} ${sh}`;
}

serve(async (_req) => {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Fenêtres cibles en UTC
    const now = new Date();
    const plus24 = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const plus2 = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const low24 = new Date(plus24.getTime() - WINDOW_MIN * 60 * 1000).toISOString();
    const high24 = new Date(plus24.getTime() + WINDOW_MIN * 60 * 1000).toISOString();
    const low2 = new Date(plus2.getTime() - WINDOW_MIN * 60 * 1000).toISOString();
    const high2 = new Date(plus2.getTime() + WINDOW_MIN * 60 * 1000).toISOString();

    // Helper pour récupérer les slots dans une plage
    async function slotIdsBetween(lowISO: string, highISO: string): Promise<string[]> {
      const { data, error } = await admin
        .from("time_slots")
        .select("id")
        .gte("starts_at", lowISO)
        .lte("starts_at", highISO);
      if (error) {
        console.error("time_slots error", error);
        return [];
      }
      return (data ?? []).map((r: any) => r.id);
    }

    const slot24 = await slotIdsBetween(low24, high24);
    const slot2h = await slotIdsBetween(low2, high2);

    // Matches confirmés à rappeler J-24h / J-2h
    const { data: m24 } = await admin
      .from("matches")
      .select("id, group_id, time_slot_id")
      .eq("status", "confirmed")
      .is("reminder_24_sent_at", null)
      .in("time_slot_id", slot24.length ? slot24 : ["00000000-0000-0000-0000-000000000000"]);

    const { data: m2h } = await admin
      .from("matches")
      .select("id, group_id, time_slot_id")
      .eq("status", "confirmed")
      .is("reminder_2h_sent_at", null)
      .in("time_slot_id", slot2h.length ? slot2h : ["00000000-0000-0000-0000-000000000000"]);

    async function sendForMatches(rows: any[], kind: "24h" | "2h") {
      for (const m of rows ?? []) {
        // Slot
        const { data: slot } = await admin
          .from("time_slots")
          .select("starts_at, ends_at")
          .eq("id", m.time_slot_id)
          .maybeSingle();

        // Nom du groupe (optionnel)
        const { data: grp } = await admin
          .from("groups")
          .select("name")
          .eq("id", m.group_id)
          .maybeSingle();

        // RSVPs yes → destinataires
        const { data: rsvps } = await admin
          .from("match_rsvps")
          .select("user_id")
          .eq("match_id", m.id)
          .eq("status", "yes");

        const userIds = (rsvps ?? []).map((r: any) => r.user_id);
        if (!userIds.length) continue;

        const { data: profs } = await admin
          .from("profiles")
          .select("id, email, expo_push_token")
          .in("id", userIds);

        const tokens = (profs ?? [])
          .map((p: any) => p.expo_push_token as string | null)
          .filter((t: string | null): t is string => !!t && t.startsWith("ExponentPushToken["));
        if (!tokens.length) continue;

        const title = kind === "24h"
          ? (grp?.name ? `Rappel J-1 — ${grp.name}` : "Rappel J-1 — Padel Sync")
          : (grp?.name ? `Rappel 2h — ${grp.name}` : "Rappel 2h — Padel Sync");

        const body = frRange(slot?.starts_at, slot?.ends_at);

        // Envoi via Expo Push API
        const messages = tokens.map((to) => ({
          to, title, body, sound: "default", priority: "high", data: { match_id: m.id, kind }
        }));
        const resp = await fetch(EXPO_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(messages),
        });
        const json = await resp.json().catch(() => ({}));
        console.log(`Expo push (${kind}) result:`, resp.status, json);

        // Marquer l’envoi
        const patch = kind === "24h"
          ? { reminder_24_sent_at: new Date().toISOString() }
          : { reminder_2h_sent_at: new Date().toISOString() };
        await admin.from("matches").update(patch).eq("id", m.id);
      }
    }

    await sendForMatches(m24 ?? [], "24h");
    await sendForMatches(m2h ?? [], "2h");

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("push-reminders error", e);
    return new Response("error", { status: 500 });
  }
});