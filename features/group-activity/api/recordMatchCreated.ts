import dayjs from 'dayjs';
import 'dayjs/locale/fr';

import { supabase } from '../../../lib/supabase';

import { rpcMatchCreated } from './groupActivityApi';

dayjs.locale('fr');

function formatMatchCreatedBody(params: {
  startsAt: string | null;
  clubName: string | null;
}): string {
  const { startsAt, clubName } = params;
  const when = startsAt
    ? dayjs(startsAt).format('dddd D MMMM [à] HH:mm')
    : 'bientôt';
  const where = clubName ? ` à ${clubName}` : '';
  const cap = when.charAt(0).toUpperCase() + when.slice(1);
  return `✅ Match créé ${cap}${where}.`;
}

/**
 * À appeler après création réussie d’un match de groupe (côté app).
 * Idempotent côté SQL sur quelques minutes (même match_id).
 */
export async function recordMatchCreatedActivity(params: {
  groupId: string;
  matchId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { groupId, matchId } = params;
  if (!groupId || !matchId) return { ok: false, error: 'paramètres manquants' };

  try {
    const { data: m, error: e1 } = await supabase
      .from('matches')
      .select('id, group_id, club_id, time_slot_id, time_slots(starts_at)')
      .eq('id', matchId)
      .maybeSingle();

    if (e1 || !m) {
      console.warn('[recordMatchCreatedActivity] match load', e1);
      return { ok: false, error: 'match introuvable' };
    }
    if (String(m.group_id) !== String(groupId)) {
      return { ok: false, error: 'groupe incohérent' };
    }

    let clubName: string | null = null;
    if (m.club_id) {
      const { data: c } = await supabase
        .from('clubs')
        .select('name')
        .eq('id', m.club_id)
        .maybeSingle();
      clubName = c?.name ?? null;
    }

    const rawTs = m.time_slots as { starts_at?: string } | { starts_at?: string }[] | null;
    const ts = Array.isArray(rawTs) ? rawTs[0] : rawTs;
    const body = formatMatchCreatedBody({
      startsAt: ts?.starts_at ?? null,
      clubName,
    });

    const { error } = await rpcMatchCreated({
      groupId,
      matchId,
      body,
      ctaLabel: 'Voir le match',
    });
    if (error) {
      console.warn('[recordMatchCreatedActivity]', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[recordMatchCreatedActivity]', msg);
    return { ok: false, error: msg };
  }
}
