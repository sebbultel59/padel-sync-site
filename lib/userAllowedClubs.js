/**
 * Filtre clubs : rayon (liste fournie) − refus explicites (user_clubs.is_refused).
 */

const DEBUG =
  typeof __DEV__ !== "undefined" && __DEV__;

/**
 * @param {Iterable<string | number>} clubIdsInRadius
 * @param {Iterable<string | number>} refusedClubIds
 * @returns {string[]}
 */
export function allowedClubIdsAfterRefusals(clubIdsInRadius, refusedClubIds) {
  const refused = new Set(
    [...(refusedClubIds || [])].map((id) => String(id))
  );
  return [...(clubIdsInRadius || [])]
    .map((id) => String(id))
    .filter((id) => !refused.has(id));
}

/**
 * @param {object} opts
 * @param {string} [opts.tag]
 * @param {unknown[]} [opts.clubsInRadius]
 * @param {unknown[]} [opts.refusedIds]
 * @param {unknown[]} [opts.allowedIds]
 */
export function logClubsRefusalFilter(opts) {
  if (!DEBUG) return;
  const tag = opts?.tag || "ClubsFilter";
  // eslint-disable-next-line no-console
  console.log(`[${tag}]`, {
    clubsDansLeRayon: (opts?.clubsInRadius || []).length,
    clubsRefuses: [...(opts?.refusedIds || [])],
    clubsAutorisesFinaux: (opts?.allowedIds || []).length,
  });
}
