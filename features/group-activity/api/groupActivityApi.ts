import { supabase } from '../../../lib/supabase';

import type { PlayerSignalWindow } from '../types';

export async function rpcBoostSlot(input: {
  groupId: string;
  timeSlotId: string;
  title: string | null;
  body: string;
  ctaLabel?: string;
}): Promise<{ data: string | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('create_group_activity_boost', {
    p_group_id: input.groupId,
    p_time_slot_id: input.timeSlotId,
    p_title: input.title ?? '',
    p_body: input.body,
    p_cta_label: input.ctaLabel ?? 'Me rendre dispo',
  });
  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as string, error: null };
}

/** Boost Dispos : crée ou réutilise un time_slot sur toute la plage puis publie le boost. */
export async function rpcBoostForRange(input: {
  groupId: string;
  startsAt: string;
  endsAt: string;
  title: string | null;
  body: string;
  ctaLabel?: string;
}): Promise<{ data: string | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('create_group_boost_for_range', {
    p_group_id: input.groupId,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_title: input.title ?? '',
    p_body: input.body,
    p_cta_label: input.ctaLabel ?? 'Me rendre dispo',
  });
  if (!error) return { data: data as string, error: null };

  const rawMessage = error.message || '';
  const missingRangeRpc =
    rawMessage.includes('create_group_boost_for_range') &&
    rawMessage.includes('schema cache');

  if (missingRangeRpc) {
    // Fallback temporaire: utiliser l'ancienne RPC si le time_slot existe deja.
    const { data: slot, error: slotError } = await supabase
      .from('time_slots')
      .select('id')
      .eq('group_id', input.groupId)
      .eq('starts_at', input.startsAt)
      .eq('ends_at', input.endsAt)
      .maybeSingle();

    if (slotError) {
      return {
        data: null,
        error: new Error(
          "Le backend n'est pas a jour pour le boost par plage et la recherche du creneau a echoue."
        ),
      };
    }

    const slotId = (slot as { id?: string } | null)?.id;
    if (!slotId) {
      return {
        data: null,
        error: new Error(
          "Le backend n'est pas a jour: la fonction create_group_boost_for_range est absente. Applique les migrations Supabase puis reessaie."
        ),
      };
    }

    const fallback = await rpcBoostSlot({
      groupId: input.groupId,
      timeSlotId: slotId,
      title: input.title,
      body: input.body,
      ctaLabel: input.ctaLabel,
    });
    return fallback;
  }

  return { data: null, error: new Error(rawMessage) };
}

export async function rpcCancelBoostForStart(input: {
  groupId: string;
  startAt: string;
}): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc('cancel_group_boost_for_start', {
    p_group_id: input.groupId,
    p_start_at: input.startAt,
  });

  if (!error) return { error: null };

  const rawMessage = error.message || '';
  const missingRpc =
    rawMessage.includes('cancel_group_boost_for_start') &&
    rawMessage.includes('schema cache');

  if (missingRpc) {
    return {
      error: new Error(
        "Le backend n'est pas a jour pour annuler un boost. Applique les migrations Supabase puis reessaie."
      ),
    };
  }

  return { error: new Error(rawMessage) };
}

export async function rpcPlayerSignal(input: {
  groupId: string;
  window: PlayerSignalWindow;
  title: string | null;
  body: string;
  ctaLabel?: string;
}): Promise<{ data: string | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('create_group_activity_player_signal', {
    p_group_id: input.groupId,
    p_window: input.window,
    p_title: input.title ?? '',
    p_body: input.body,
    p_cta_label: input.ctaLabel ?? 'Voir les dispos du groupe',
  });
  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as string, error: null };
}

export async function rpcAdminAnnouncement(input: {
  groupId: string;
  body: string;
  ctaType: 'none' | 'open_group_dispos';
  ctaLabel?: string | null;
}): Promise<{ data: string | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('create_group_activity_admin_announcement', {
    p_group_id: input.groupId,
    p_body: input.body,
    p_cta_type: input.ctaType,
    p_cta_label: input.ctaLabel ?? null,
  });
  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as string, error: null };
}

export async function rpcMatchCreated(input: {
  groupId: string;
  matchId: string;
  body: string;
  ctaLabel?: string;
}): Promise<{ data: string | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('create_group_activity_match_created', {
    p_group_id: input.groupId,
    p_match_id: input.matchId,
    p_body: input.body,
    p_cta_label: input.ctaLabel ?? 'Voir le match',
  });
  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as string, error: null };
}

export async function rpcCreateGroupMatchSearch(input: {
  groupId: string;
  startsAtIso: string;
  clubId: string;
  placesToFill: number;
  playerIds: string[];
}): Promise<{ data: string | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('create_group_match_search', {
    p_group_id: input.groupId,
    p_starts_at: input.startsAtIso,
    p_club_id: input.clubId,
    p_places_to_fill: input.placesToFill,
    p_player_ids: input.playerIds,
  });
  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as string, error: null };
}
