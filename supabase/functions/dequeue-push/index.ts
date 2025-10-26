// supabase/functions/dequeue-push/index.ts
// Deno Edge Function — dépile push_outbox et envoie les push Expo

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---- Config env
const SUPABASE_URL = Deno.env.get("SB_URL")!;
const SERVICE_ROLE = Deno.env.get("SB_SERVICE_ROLE")!;
const EXPO_ACCESS_TOKEN = Deno.env.get("EXPO_ACCESS_TOKEN") || ""; // optionnel

// Limites
const MAX_BATCH = 10;      // nb d'events à dépiler par exécution
const EXPO_CHUNK = 90;     // < 100 recommandé

// Clients
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

// ---- utilitaires
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sendExpoPush(messages: any[]) {
  if (!messages.length) return { data: [], errors: [] };

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(EXPO_ACCESS_TOKEN ? { "Authorization": `Bearer ${EXPO_ACCESS_TOKEN}` } : {}),
    },
    body: JSON.stringify(messages),
  });

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = { data: [], errors: [`HTTP ${res.status}`] };
  }
  return json;
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// ---- récup des destinataires selon le “kind”
async function computeRecipients(kind: string, payload: any) {
  // On renvoie: { tokens: string[], players: Array<{id, name}> }
  // Pour match_created: on notifie tous les joueurs qui ont un RSVP sur ce match (accepted|maybe)
  // Pour match_confirmed: on notifie tous les accepted (ou tous les rsvps si tu préfères)
  const matchId = payload?.id || payload?.match_id;
  const groupId = payload?.group_id;

  if (!matchId) return { tokens: [], players: [] };

  // Charge RSVPs + profils
  const { data: rsvps, error: er } = await admin
    .from("match_rsvps")
    .select("user_id, status")
    .eq("match_id", matchId);

  if (er) throw er;

  // Filtrage selon le type
  let userIds: string[] = [];
  if (kind === "match_created") {
    userIds = (rsvps || [])
      .filter((r) => {
        const s = String(r.status || "").toLowerCase();
        return s === "accepted" || s === "maybe" || s === "yes"; // yes au cas où
      })
      .map((r) => r.user_id);
  } else if (kind === "match_confirmed") {
    userIds = (rsvps || [])
      .filter((r) => String(r.status || "").toLowerCase() === "accepted")
      .map((r) => r.user_id);
  } else {
    // fallback: tout le monde ayant RSVP
    userIds = (rsvps || []).map((r) => r.user_id);
  }

  userIds = Array.from(new Set(userIds));
  if (!userIds.length) return { tokens: [], players: [] };

  const { data: profs, error: ep } = await admin
    .from("profiles")
    .select("id, display_name, expo_push_token")
    .in("id", userIds);

  if (ep) throw ep;

  const tokens = (profs || [])
    .map((p) => (p.expo_push_token || "").trim())
    .filter((t) => t.startsWith("ExponentPushToken["));

  return {
    tokens,
    players: profs || [],
  };
}

function buildMessage(kind: string, payload: any) {
  // Personnalise le titre/texte
  if (kind === "match_created") {
    return {
      title: "🎾 Match à confirmer",
      body: "Un match a été créé, confirme ta participation !",
    };
  }
  if (kind === "match_confirmed") {
    return {
      title: "✅ Match confirmé",
      body: "Le match est validé, à tout de suite sur le terrain !",
    };
  }
  return {
    title: "Notification",
    body: "Nouvelle mise à jour dans Padel Sync",
  };
}

async function processOneEvent(ev: any) {
  const { id: outboxId, kind, payload } = ev;

  // 1) calcule les destinataires
  const { tokens } = await computeRecipients(kind, payload);

  if (!tokens.length) {
    // Marque comme traité même si personne à notifier
    await admin.from("push_outbox").update({
      processed_at: new Date().toISOString(),
      attempts: (ev.attempts || 0) + 1,
      last_error: null,
    }).eq("id", outboxId);
    return { ok: true, notified: 0 };
  }

  // 2) construit le message
  const base = buildMessage(kind, payload);

  // 3) envoie par chunks vers Expo
  let totalOk = 0;
  for (const seg of chunk(tokens, EXPO_CHUNK)) {
    const messages = seg.map((to) => ({
      to,
      sound: "default",
      title: base.title,
      body: base.body,
      data: { kind, ...payload },
    }));
    const res = await sendExpoPush(messages);
    const statuses = Array.isArray(res?.data) ? res.data : [];
    totalOk += statuses.filter((x: any) => x?.status === "ok").length;
    // Douceur côté rate-limit
    await sleep(30);
  }

  // 4) marque comme traité
  await admin.from("push_outbox").update({
    processed_at: new Date().toISOString(),
    attempts: (ev.attempts || 0) + 1,
    last_error: null,
  }).eq("id", outboxId);

  return { ok: true, notified: totalOk };
}

// ---- handler HTTP (GET/POST)
Deno.serve(async (req) => {
  try {
    // Dépile un petit lot d’events non traités
    const { data: events, error } = await admin
      .from("push_outbox")
      .select("*")
      .is("processed_at", null)
      .order("created_at", { ascending: true })
      .limit(MAX_BATCH);

    if (error) throw error;

    const results = [];
    for (const ev of events || []) {
      try {
        const r = await processOneEvent(ev);
        results.push({ id: ev.id, ...r });
      } catch (err) {
        // Incrémente attempts + last_error, ne marque pas processed_at
        await admin.from("push_outbox").update({
          attempts: (ev.attempts || 0) + 1,
          last_error: String(err?.message || err),
        }).eq("id", ev.id);
        results.push({ id: ev.id, ok: false, error: String(err?.message || err) });
      }
    }

    return new Response(JSON.stringify({ ok: true, count: results.length, results }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});