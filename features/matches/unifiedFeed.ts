/**
 * Feed unifié MATCHES : normalisation, tri centralisé, filtre par onglet.
 * Les données brutes viennent de l’écran ; brancher ici toute logique backend future.
 */

export type UnifiedMatchItemType = 'possible' | 'complete' | 'validated';

export type UnifiedMatchItem = {
  id: string;
  type: UnifiedMatchItemType;
  startsAt: string;
  endsAt?: string;
  clubId?: string;
  clubName?: string;
  playersCount?: number;
  maxPlayers?: number;
  levelLabel?: string;
  /** Toujours « long » (1h30) — l’ancienne branche 1h a été retirée. */
  possibleKind?: 'long';
  /** Nombre de joueurs déjà dispo (hors joueur authentifié). Utilisé pour « 🔥 En feu ». */
  otherPlayersCount?: number;
  /** Historique (5 derniers) vs semaine courante */
  isHistory?: boolean;
  sourceData?: unknown;
};

/** Plus petit = plus haut. Ordre « Tous » : complete → validated → possible. */
export function getMatchPriority(item: UnifiedMatchItem): number {
  if (item.type === 'complete') return 1;
  if (item.type === 'validated') return 2;
  if (item.type === 'possible') return 3;
  return 4;
}

export function sortUnifiedFeed(items: UnifiedMatchItem[]): UnifiedMatchItem[] {
  return [...items].sort((a, b) => {
    const pa = getMatchPriority(a);
    const pb = getMatchPriority(b);
    if (pa !== pb) return pa - pb;
    const ta = new Date(a.startsAt || 0).getTime();
    const tb = new Date(b.startsAt || 0).getTime();
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
    return String(a.id).localeCompare(String(b.id));
  });
}

export type BuildUnifiedFeedInput = {
  longSections: Array<{ title: string; data: unknown[] }>;
  findGameRequests: unknown[];
  validatedWeek: unknown[];
  historyMatches?: unknown[];
};

function asRecord(x: unknown): Record<string, unknown> {
  return x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
}

export function buildUnifiedFeed(input: BuildUnifiedFeedInput): UnifiedMatchItem[] {
  const items: UnifiedMatchItem[] = [];
  const { longSections, findGameRequests, validatedWeek, historyMatches } = input;

  for (const section of longSections || []) {
    for (const row of section.data || []) {
      const r = asRecord(row);
      const key = String(r.key ?? r.time_slot_id ?? '');
      const otherPlayersCount =
        (Array.isArray(r.ready_user_ids_without_me) ? r.ready_user_ids_without_me.length : null) ??
        (Array.isArray(r.ready_user_ids) ? Math.max(0, r.ready_user_ids.length - 1) : null) ??
        undefined;
      items.push({
        id: `possible-long-${key}`,
        type: 'possible',
        possibleKind: 'long',
        startsAt: String(r.starts_at || ''),
        endsAt: r.ends_at != null ? String(r.ends_at) : undefined,
        otherPlayersCount,
        sourceData: row,
      });
    }
  }

  (findGameRequests || []).forEach((rq) => {
    const r = asRecord(rq);
    const pid = r.player_ids;
    const pc = Array.isArray(pid) ? pid.length : 0;
    items.push({
      id: `complete-${String(r.id)}`,
      type: 'complete',
      startsAt: String(r.starts_at || ''),
      endsAt: r.ends_at != null ? String(r.ends_at) : undefined,
      clubName: r.club_name != null ? String(r.club_name) : undefined,
      clubId: r.club_id != null ? String(r.club_id) : undefined,
      playersCount: pc,
      maxPlayers: 4,
      sourceData: rq,
    });
  });

  (validatedWeek || []).forEach((m) => {
    const match = asRecord(m);
    const ts = asRecord(match.time_slots);
    items.push({
      id: `validated-${String(match.id)}`,
      type: 'validated',
      startsAt: ts.starts_at != null ? String(ts.starts_at) : String(match.created_at || ''),
      endsAt: ts.ends_at != null ? String(ts.ends_at) : undefined,
      isHistory: false,
      sourceData: m,
    });
  });

  (historyMatches || []).forEach((m) => {
    const match = asRecord(m);
    const ts = asRecord(match.time_slots);
    items.push({
      id: `history-${String(match.id)}`,
      type: 'validated',
      startsAt: ts.starts_at != null ? String(ts.starts_at) : String(match.created_at || ''),
      endsAt: ts.ends_at != null ? String(ts.ends_at) : undefined,
      isHistory: true,
      sourceData: m,
    });
  });

  return sortUnifiedFeed(items);
}

export type ContentFilterTab = 'all' | 'possible' | 'complete' | 'validated';

export function filterUnifiedFeedByTab(
  feed: UnifiedMatchItem[],
  contentFilter: ContentFilterTab
): UnifiedMatchItem[] {
  if (contentFilter === 'all') return feed;
  if (contentFilter === 'possible') return feed.filter((i) => i.type === 'possible');
  if (contentFilter === 'complete') return feed.filter((i) => i.type === 'complete');
  if (contentFilter === 'validated') {
    return feed.filter((i) => i.type === 'validated' && !i.isHistory);
  }
  return feed;
}
