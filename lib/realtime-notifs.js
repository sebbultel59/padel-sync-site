import { DEFAULT_GROUP_ID } from "../config/env";
import { ensureNotifPermission, notifyLocal } from "./notifications";
import { supabase } from "./supabase";

// Démarre les écoutes ; retourne une fonction stop()
export async function startRealtimeNotifs() {
  await ensureNotifPermission();

  // 1) Match confirmé
  const chMatches = supabase
    .channel("rt-matches")
    .on("postgres_changes",
      { event: "UPDATE", schema: "public", table: "matches", filter: `group_id=eq.${DEFAULT_GROUP_ID}` },
      async (payload) => {
        const row = payload.new;
        if (row?.status === "confirmed") {
          // On peut chercher l’heure du slot si besoin (optimisation : joindre côté app)
          notifyLocal("Match confirmé 🎉", "Un créneau a atteint 4 confirmations.");
        }
      }
    )
    .subscribe();

  // 2) RSVP ajouté (quelqu’un confirme le créneau)
  const chRsvps = supabase
    .channel("rt-rsvps")
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "match_rsvps" },
      async (_payload) => {
        // Optionnel : filtrer par match du groupe via une requête rapide si tu veux
        notifyLocal("Nouvelle confirmation", "Un joueur a confirmé un créneau.");
      }
    )
    .subscribe();

  return () => {
    try { supabase.removeChannel(chMatches); } catch {}
    try { supabase.removeChannel(chRsvps); } catch {}
  };
}