function renderMessage(
    kind: string,
    ctx: { actor_name?: string; starts_at?: string; ends_at?: string; group_name?: string }
  ) {
    switch (kind) {
      // --- joueurs du match
      case "match_pending":   return { title: "Nouveau match à confirmer", body: "Un match est en RSVP. Donne ta réponse !" };
      case "rsvp_accepted":   return { title: "Un joueur a confirmé", body: `${ctx.actor_name ?? "Un joueur"} a confirmé sa participation.` };
      case "rsvp_declined":   return { title: "Un joueur a refusé", body: `${ctx.actor_name ?? "Un joueur"} a refusé le match.` };
      case "rsvp_withdraw":   return { title: "Un joueur s'est retiré", body: `${ctx.actor_name ?? "Un joueur"} s'est retiré du match.` };
      case "match_confirmed": return { title: "Match validé", body: "Les 4 joueurs ont confirmé, c’est validé !" };
      case "match_canceled":  return { title: "Match annulé", body: "Le match a été annulé." };
  
      // --- membres du groupe (NOUVEAU)
      case "group_member_join":     return { title: "Nouveau membre", body: `${ctx.actor_name ?? "Un joueur"} a rejoint le groupe.` };
      case "group_member_leave":    return { title: "Départ d'un membre", body: `${ctx.actor_name ?? "Un joueur"} a quitté le groupe.` };
      case "group_match_created":   return { title: "Nouveau match", body: "Un match a été créé dans ton groupe." };
      case "group_match_validated": return { title: "Match validé", body: "Un match du groupe est désormais validé." };
  
      // --- seuils de dispo (NOUVEAU)
      case "group_slot_hot_3":      return { title: "Ça se chauffe à 3 🔥", body: "Un créneau atteint 3 joueurs disponibles." };
      case "group_slot_ready_4":    return { title: "Match possible ✅", body: "Un créneau atteint 4 joueurs disponibles." };
  
      default: return { title: "Padel Sync", body: "Mise à jour." };
    }
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

async function sendExpoPush(messages: any[]) {
  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    console.error("[expo] push error", await res.text());
  }
}

const chunk = <T,>(arr: T[], n = 99) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

Deno.serve(async () => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, key);

  const { data: jobs } = await supabase
    .from("notification_jobs")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(50);

  if (!jobs?.length) {
    return new Response("no jobs", { status: 200 });
  }

  const userIds = Array.from(
    new Set(jobs.flatMap((j: any) => [j.actor_id, ...(j.recipients || [])].filter(Boolean)))
  );
  const matchIds = Array.from(new Set(jobs.map((j: any) => j.match_id).filter(Boolean)));
  const groupIds = Array.from(new Set(jobs.map((j: any) => j.group_id).filter(Boolean)));

  const [{ data: profiles }, { data: matches }, { data: groups }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, expo_push_token").in("id", userIds),
    supabase.from("matches").select("id, time_slots:time_slot_id (starts_at, ends_at)").in("id", matchIds),
    supabase.from("groups").select("id, name").in("id", groupIds),
  ]);

  const profById = new Map((profiles || []).map((p: any) => [p.id, p]));
  const matchById = new Map((matches || []).map((m: any) => [m.id, m]));
  const groupById = new Map((groups || []).map((g: any) => [g.id, g]));

  const messages: any[] = [];

  for (const job of jobs) {
    console.log('[Dispatch] Job reçu:', {
        kind: job.kind,
        match_id: job.match_id,
        group_id: job.group_id,
        actor_id: job.actor_id,
        recipients: job.recipients,
      });
    const m = matchById.get(job.match_id);
    const g = groupById.get(job.group_id);
    const actor = job.actor_id ? profById.get(job.actor_id) : null;

    const { title, body } = renderMessage(job.kind, {
      actor_name: actor?.display_name,
      starts_at: m?.time_slots?.starts_at,
      ends_at: m?.time_slots?.ends_at,
      group_name: g?.name,
    });

    const recips: string[] = Array.isArray(job.recipients) ? job.recipients : [];
    for (const uid of recips) {
      const p = profById.get(uid);
      if (!p?.expo_push_token?.startsWith("ExponentPushToken")) continue;
      messages.push({
        to: p.expo_push_token,
        sound: "default",
        title,
        body,
        data: { kind: job.kind, match_id: job.match_id, group_id: job.group_id },
      });
    }
  }

  if (messages.length) {
    for (const batch of chunk(messages, 99)) {
      await sendExpoPush(batch);
    }
  }

  await supabase.from("notification_jobs").delete().in("id", jobs.map((j: any) => j.id));

  return new Response(`ok ${messages.length}`, { status: 200 });
});