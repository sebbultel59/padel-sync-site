import { supabase } from './supabase';

// Intersecte les users dont la disponibilité couvre TOUT l'intervalle,
// en découpant en ticks de 30 minutes.
function computeAvailableUsersForInterval(startsAt, endsAt, availabilityData) {
  if (!availabilityData || availabilityData.length === 0) return [];
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (!(start instanceof Date) || isNaN(start) || !(end instanceof Date) || isNaN(end) || end <= start) {
    return [];
  }

  const stepMs = 30 * 60 * 1000;
  const intersection = { current: null };

  for (let cur = new Date(start.getTime()); cur.getTime() < end.getTime(); cur = new Date(cur.getTime() + stepMs)) {
    const slotStart = cur;
    const slotEnd = new Date(cur.getTime() + stepMs);

    const coveringUsers = new Set(
      availabilityData
        .filter((av) => {
          const aStart = new Date(av.start);
          const aEnd = new Date(av.end);
          // La dispo doit couvrir le tick entièrement.
          return aStart.getTime() <= slotStart.getTime() && aEnd.getTime() >= slotEnd.getTime();
        })
        .map((av) => String(av.user_id))
    );

    if (intersection.current == null) {
      intersection.current = coveringUsers;
    } else {
      intersection.current = new Set([...intersection.current].filter((id) => coveringUsers.has(id)));
    }

    if ((intersection.current?.size || 0) === 0) break;
  }

  return intersection.current ? [...intersection.current] : [];
}

async function computeAvailableUserIdsForInterval(groupId, startsAtIso, endsAtIso) {
  try {
    // Charger toutes les disponibilités effectives du groupe sur la fenêtre.
    const { data: availabilityDataRaw, error } = await supabase.rpc('get_availability_effective', {
      p_group: groupId,
      p_user: null,
      p_low: startsAtIso,
      p_high: endsAtIso,
    });

    if (error) {
      console.warn('[OpportunityNotif] computeAvailableUserIdsForInterval rpc error:', error);
      return [];
    }

    const availabilityData = (availabilityDataRaw || []).filter(
      (a) => String(a.status || '').toLowerCase() === 'available'
    );

    const availableUserIds = computeAvailableUsersForInterval(startsAtIso, endsAtIso, availabilityData);

    // Exclure les joueurs qui ont déjà un RSVP accepté / maybe sur un match pending qui chevauche.
    // (Anti-spam UX: on évite de proposer des users déjà "pris" sur un créneau qui se recoupe.)
    try {
      const startDate = new Date(startsAtIso);
      const endDate = new Date(endsAtIso);

      const { data: pendingMatches } = await supabase
        .from('matches')
        .select('id, time_slot_id, status')
        .eq('group_id', groupId)
        .eq('status', 'pending');

      if (pendingMatches && pendingMatches.length > 0) {
        const timeSlotIds = pendingMatches.map((m) => m.time_slot_id).filter(Boolean);
        if (timeSlotIds.length > 0) {
          const { data: timeSlots } = await supabase
            .from('time_slots')
            .select('id, starts_at, ends_at')
            .in('id', timeSlotIds);

          const overlappingMatchIds = new Set();
          (timeSlots || []).forEach((ts) => {
            const tsStart = new Date(ts.starts_at);
            const tsEnd = new Date(ts.ends_at);
            // Chevauchement : tsStart < endDate ET tsEnd > startDate
            if (tsStart < endDate && tsEnd > startDate) {
              const match = pendingMatches.find((m) => m.time_slot_id === ts.id);
              if (match) overlappingMatchIds.add(match.id);
            }
          });

          if (overlappingMatchIds.size > 0) {
            const { data: rsvps } = await supabase
              .from('match_rsvps')
              .select('user_id, status, match_id')
              .in('match_id', Array.from(overlappingMatchIds))
              .in('status', ['accepted', 'maybe']);

            const bookedUserIds = new Set((rsvps || []).map((r) => String(r.user_id)));
            return availableUserIds.filter((id) => !bookedUserIds.has(String(id)));
          }
        }
      }
    } catch (rsvpError) {
      console.warn('[OpportunityNotif] RSVP overlap filter failed:', rsvpError);
      // En cas d'erreur, retourner quand même les users "disponibles".
    }

    return availableUserIds;
  } catch (e) {
    console.warn('[OpportunityNotif] computeAvailableUserIdsForInterval exception:', e);
    return [];
  }
}

/**
 * Candidates => exclusion participants => compatibilité temps (disponible sur la fenêtre).
 * Plus de filtre bloquant par club (clubId reste utile pour le payload métier si besoin).
 */
export async function getEligibleUsersForMatchNotification({
  groupId,
  startsAtIso,
  endsAtIso,
  clubId,
  candidateUserIds,
  excludedUserIds,
  refusedClubsByUser: _refusedClubsByUser,
}) {
  if (!groupId || !startsAtIso || !endsAtIso) return [];

  const excludedSet = new Set((excludedUserIds || []).map(String));
  const candidates = (candidateUserIds || []).map(String).filter((id) => !excludedSet.has(id));
  if (candidates.length === 0) return [];

  const availableIds = await computeAvailableUserIdsForInterval(groupId, startsAtIso, endsAtIso);
  const availableSet = new Set(availableIds.map(String));
  const timeEligible = candidates.filter((id) => availableSet.has(String(id)));
  console.log({
    radius: 30,
    results_count: timeEligible.length,
    context: 'getEligibleUsersForMatchNotification',
  });
  return timeEligible;
}

async function enqueueSingleJob({
  kind,
  groupId,
  opportunityId,
  userId,
  startsAtIso,
  endsAtIso,
  remainingSlots,
  trigger,
}) {
  try {
    const formatWeekdayAndTimeFr = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      const weekday = d.toLocaleDateString('fr-FR', { weekday: 'long' });
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${weekday} ${hh}h${mm}`;
    };

    const slot = formatWeekdayAndTimeFr(startsAtIso);
    const remaining = Number(remainingSlots ?? 0);
    const plural = remaining > 1 ? 's' : '';

    const title =
      kind === 'match_proposed'
        ? '🔥 Nouvelle partie proposée'
        : kind === 'match_almost_full'
          ? '⚡ Plus qu’une place pour jouer'
          : 'Padel Sync';

    const message =
      kind === 'match_proposed'
        ? slot
          ? `${slot} • ${remaining} place${plural} à compléter`
          : 'Nouvelle partie à compléter disponible'
        : kind === 'match_almost_full'
          ? slot
            ? `Rejoins la partie de ${slot}`
            : 'Plus qu’une place pour jouer'
          : '';

    const dedupeKey = `${kind}:${String(userId)}:${String(opportunityId)}`;
    await supabase.rpc('create_notification_job', {
      p_kind: kind,
      p_match_id: null, // pas de match (c'est une "opportunité" basée sur group_match_search)
      p_group_id: groupId,
      p_recipients: [String(userId)],
      p_payload: {
        dedupe_key: dedupeKey,
        match_id: String(opportunityId),
        search_id: String(opportunityId),
        group_id: String(groupId),
        starts_at: startsAtIso,
        ends_at: endsAtIso,
        remaining_slots: remainingSlots,
        trigger: trigger ?? null,
        title,
        message,
      },
    });
    return true;
  } catch (e) {
    console.warn('[OpportunityNotif] enqueueSingleJob failed:', { kind, userId, opportunityId, err: e?.message || e });
    return false;
  }
}

export async function enqueueMatchOpportunityNotifications({
  kind, // 'match_proposed' | 'match_almost_full'
  groupId,
  opportunityId, // group_match_search.id (UUID) en V1
  recipientUserIds,
  startsAtIso,
  endsAtIso,
  remainingSlots,
  trigger,
}) {
  if (!groupId || !opportunityId) return { created: 0, attempted: 0 };

  const users = (recipientUserIds || []).map(String).filter(Boolean);
  if (!users.length) return { created: 0, attempted: 0 };

  let created = 0;
  for (const uid of users) {
    // Boucle séquentielle volontaire pour garder des logs lisibles et limiter la pression RLS.
    // En V2, on pourra paralléliser / batcher.
    const ok = await enqueueSingleJob({
      kind,
      groupId,
      opportunityId,
      userId: uid,
      startsAtIso,
      endsAtIso,
      remainingSlots,
      trigger,
    });
    if (ok) created += 1;
  }

  return { created, attempted: users.length };
}

