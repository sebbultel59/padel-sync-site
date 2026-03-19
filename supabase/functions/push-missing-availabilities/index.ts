import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TZ = "Europe/Paris";
const KIND = "availability_missing_all";
const DEDUPE_HOURS = 48;

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

function getZonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  return map;
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const parts = getZonedParts(date, timeZone);
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUTC - date.getTime()) / 60000;
}

function zonedDateToUtcISO(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
) {
  const utc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMin = getTimeZoneOffsetMinutes(new Date(utc), timeZone);
  return new Date(utc - offsetMin * 60000).toISOString();
}

function getNextWeekRange(timeZone: string) {
  const now = new Date();
  const parts = getZonedParts(now, timeZone);
  const weekday = WEEKDAY_INDEX[parts.weekday] || 1;
  const daysToNextMonday = weekday === 1 ? 7 : 8 - weekday;
  const baseUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  const nextMonday = new Date(baseUtc + daysToNextMonday * 86400000);
  const startIso = zonedDateToUtcISO(
    nextMonday.getUTCFullYear(),
    nextMonday.getUTCMonth() + 1,
    nextMonday.getUTCDate(),
    0,
    0,
    0,
    timeZone
  );
  const endUtc = new Date(new Date(startIso).getTime() + 7 * 86400000);
  return { startIso, endIso: endUtc.toISOString() };
}

serve(async () => {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { startIso, endIso } = getNextWeekRange(TZ);
    const lookbackIso = new Date(Date.now() - DEDUPE_HOURS * 3600 * 1000).toISOString();

    // Tous les users membres d’au moins un groupe (+ un group_id associé pour satisfaire notification_jobs_match_or_group_chk)
    const { data: members, error: membersErr } = await admin
      .from("group_members")
      .select("user_id, group_id");
    if (membersErr) throw membersErr;

    const userIds = Array.from(new Set((members ?? []).map((m: any) => m.user_id).filter(Boolean)));
    if (!userIds.length) return new Response("no members", { status: 200 });

    // Choisir un group_id par user (premier rencontré)
    const groupIdByUser = new Map<string, string>();
    for (const row of members ?? []) {
      if (!row?.user_id || !row?.group_id) continue;
      if (!groupIdByUser.has(row.user_id)) groupIdByUser.set(row.user_id, row.group_id);
    }

    // Déduplication: users déjà notifiés récemment
    const { data: recent, error: recentErr } = await admin
      .from("notification_jobs")
      .select("recipients")
      .eq("kind", KIND)
      .gte("created_at", lookbackIso);
    if (recentErr) throw recentErr;

    const recentlyNotified = new Set<string>();
    for (const row of recent ?? []) {
      for (const uid of row.recipients ?? []) recentlyNotified.add(uid);
    }

    // Candidats = pas notifiés dans les 48h
    const candidates = userIds.filter((uid) => !recentlyNotified.has(uid));
    if (!candidates.length) return new Response("no candidates", { status: 200 });

    // Pour limiter les requêtes, on interroge d’abord availability_global
    const { data: glob } = await admin
      .from("availability_global")
      .select("user_id")
      .in("user_id", candidates)
      .gte("start", startIso)
      .lt("start", endIso);

    const hasGlobal = new Set((glob ?? []).map((r: any) => r.user_id));

    // Puis availability par groupe (exceptions)
    const { data: perGroup } = await admin
      .from("availability")
      .select("user_id")
      .in("user_id", candidates)
      .gte("start", startIso)
      .lt("start", endIso);

    const hasPerGroup = new Set((perGroup ?? []).map((r: any) => r.user_id));

    const missingAll = candidates.filter((uid) => !hasGlobal.has(uid) && !hasPerGroup.has(uid));
    if (!missingAll.length) return new Response("ok (none missing)", { status: 200 });

    // Respecter les préférences si présentes
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, notification_preferences")
      .in("id", missingAll);

    const allowed = (profiles ?? []).filter((p: any) => {
      const prefs = p.notification_preferences;
      if (!prefs || typeof prefs !== "object") return true;
      if (!(KIND in prefs)) return true;
      return prefs[KIND] !== false;
    });

    const recipients = allowed.map((p: any) => p.id);
    if (!recipients.length) return new Response("ok (all opted out)", { status: 200 });

    // Un job par user (destinataire unique)
    const rows = recipients
      .map((uid) => ({
      kind: KIND,
      group_id: groupIdByUser.get(uid) ?? null,
      recipients: [uid],
      payload: { message: "Nouvelle semaine : Renseigne tes dispos" },
      created_at: new Date().toISOString(),
      }))
      .filter((r) => !!r.group_id);

    const { error: insErr } = await admin.from("notification_jobs").insert(rows);
    if (insErr) throw insErr;

    return new Response(`ok ${rows.length}`, { status: 200 });
  } catch (e) {
    console.error("push-missing-availabilities error", e);
    return new Response("error", { status: 500 });
  }
});

