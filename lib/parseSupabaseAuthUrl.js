/**
 * Parse une URL de callback Supabase (deep link ou https) avec fragment # ou query ?.
 * Utilisé pour distinguer recovery (reset password) vs OAuth / magic link.
 */

function normalizeForUrlParse(urlString) {
  if (!urlString || typeof urlString !== 'string') return '';
  const raw = urlString.trim();
  if (raw.startsWith('syncpadel://')) {
    return raw.replace(/^syncpadel:\/\//, 'https://placeholder/');
  }
  return raw;
}

/**
 * Extrait les paramètres depuis query (?a=b) et fragment (#a=b).
 */
function collectParams(url) {
  const out = new Map();
  try {
    url.searchParams.forEach((v, k) => out.set(k, v));
  } catch (_) {}
  const hash = url.hash ? url.hash.replace(/^#/, '') : '';
  if (hash) {
    const hp = new URLSearchParams(hash);
    hp.forEach((v, k) => out.set(k, v));
  }
  return out;
}

/**
 * @param {string} urlString
 * @returns {{
 *   kind: 'recovery' | 'oauth_success' | 'auth_error' | 'none',
 *   accessToken?: string,
 *   refreshToken?: string,
 *   type?: string,
 *   error?: string,
 *   errorCode?: string,
 *   errorDescription?: string,
 * } | null}
 */
export function parseSupabaseAuthUrl(urlString) {
  if (!urlString) return null;
  try {
    const normalized = normalizeForUrlParse(urlString);
    const url = new URL(normalized);

    const params = collectParams(url);
    const type = params.get('type') || null;
    const accessToken = params.get('access_token') || null;
    const refreshToken = params.get('refresh_token') || null;
    const error = params.get('error') || null;
    const errorCode = params.get('error_code') || null;
    const errorDescription = params.get('error_description') || null;

    if (error || errorCode) {
      return {
        kind: 'auth_error',
        error: error || undefined,
        errorCode: errorCode || undefined,
        errorDescription: errorDescription ? decodeURIComponent(errorDescription.replace(/\+/g, ' ')) : undefined,
      };
    }

    if (type === 'recovery' && accessToken) {
      return {
        kind: 'recovery',
        accessToken,
        refreshToken: refreshToken || undefined,
        type: 'recovery',
      };
    }

    // OAuth / magic link : access + refresh sans type recovery
    if (accessToken && refreshToken && type !== 'recovery') {
      return {
        kind: 'oauth_success',
        accessToken,
        refreshToken,
        type: type || undefined,
      };
    }

    return { kind: 'none' };
  } catch (e) {
    if (__DEV__) {
      console.warn('[parseSupabaseAuthUrl] parse error:', e?.message || e, urlString?.slice?.(0, 120));
    }
    return null;
  }
}

/**
 * Construit les query params pour la route Expo /reset-password
 */
export function buildResetPasswordRouteQuery(parsed) {
  if (!parsed || parsed.kind !== 'recovery' || !parsed.accessToken) return null;
  const q = new URLSearchParams();
  q.set('access_token', parsed.accessToken);
  if (parsed.refreshToken) q.set('refresh_token', parsed.refreshToken);
  q.set('type', 'recovery');
  return q.toString();
}
