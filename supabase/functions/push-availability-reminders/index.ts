import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TZ = "Europe/Paris";
const REMINDER_KIND = "availability_reminder";
const LOOKBACK_DAYS = 7;

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

function chunk<T>(arr: T[], n = 200) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

serve(async () => {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { startIso, endIso } = getNextWeekRange(TZ);

    const { data: members, error: membersErr } = await admin
      .from("group_members")
      .select("group_id, user_id");
    if (membersErr) throw membersErr;

    const groupToMembers = new Map<string, string[]>();
    for (const row of members ?? []) {
      const list = groupToMembers.get(row.group_id) ?? [];
      list.push(row.user_id);
      groupToMembers.set(row.group_id, list);
    }

    const groupIds = Array.from(groupToMembers.keys());
    if (!groupIds.length) return new Response("no groups", { status: 200 });

    const { data: groups } = await admin
      .from("groups")
      .select("id, name")
      .in("id", groupIds);
    const groupNameById = new Map((groups ?? []).map((g: any) => [g.id, g.name]));

    const lookbackIso = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();

    for (const groupId of groupIds) {
      const membersForGroup = groupToMembers.get(groupId) ?? [];
      if (!membersForGroup.length) continue;

      const { data: avail } = await admin
        .from("availability")
        .select("user_id")
        .eq("group_id", groupId)
        .eq("status", "available")
        .gte("start", startIso)
        .lt("start", endIso);

      const availableSet = new Set((avail ?? []).map((a: any) => a.user_id));
      let missing = membersForGroup.filter((uid) => !availableSet.has(uid));
      if (!missing.length) continue;

      const { data: recent } = await admin
        .from("notification_jobs")
        .select("recipients")
        .eq("kind", REMINDER_KIND)
        .eq("group_id", groupId)
        .gte("created_at", lookbackIso);

      const recentlyNotified = new Set<string>();
      for (const row of recent ?? []) {
        for (const uid of row.recipients ?? []) recentlyNotified.add(uid);
      }
      missing = missing.filter((uid) => !recentlyNotified.has(uid));
      if (!missing.length) continue;

      const { data: profiles } = await admin
        .from("profiles")
        .select("id, notification_preferences")
        .in("id", missing);

      const allowed = (profiles ?? []).filter((p: any) => {
        const prefs = p.notification_preferences;
        if (!prefs || typeof prefs !== "object") return true;
        if (!(REMINDER_KIND in prefs)) return true;
        return prefs[REMINDER_KIND] !== false;
      });

      const recipients = allowed.map((p: any) => p.id);
      if (!recipients.length) continue;

      const payload = {
        week_start: startIso,
        week_end: endIso,
        group_name: groupNameById.get(groupId) ?? null,
      };

      for (const batch of chunk(recipients, 200)) {
        const { error } = await admin.from("notification_jobs").insert({
          kind: REMINDER_KIND,
          group_id: groupId,
          recipients: batch,
          payload,
          created_at: new Date().toISOString(),
        });
        if (error) console.error("insert notification_jobs error", error);
      }
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("push-availability-reminders error", e);
    return new Response("error", { status: 500 });
  }
});
