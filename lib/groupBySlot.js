// lib/groupBySlot.js
import dayjs from "dayjs";

/**
 * Regroupe les disponibilités par créneau (clé = start ISO)
 * @param {Array<{user_id: string, start: string, end: string}>} slots
 * @returns {Map<string, string[]>} Map(startIso -> [userIds])
 */
export function groupBySlot(slots) {
  const map = new Map();
  (slots || []).forEach((s) => {
    const k = dayjs(s.start).toISOString();
    const arr = map.get(k) || [];
    arr.push(s.user_id);
    map.set(k, arr);
  });
  return map;
}