/**
 * Tampon synchrone pour ouvrir la modale « créer un match » depuis l’activité « Trouver ».
 * Les query params ne sont pas toujours propagés jusqu’à `matches/index` avec Expo Router + tabs.
 */
export const PENDING_FIND_GAME_ASYNC_KEY = 'padelsync:pendingFindGameConfirm';

let pendingSearchId = null;

export function setPendingFindGameConfirmSearchId(id) {
  pendingSearchId = id != null && String(id).length > 0 ? String(id) : null;
}

export function peekPendingFindGameConfirmSearchId() {
  return pendingSearchId;
}

export function takePendingFindGameConfirmSearchId() {
  const v = pendingSearchId;
  pendingSearchId = null;
  return v;
}
