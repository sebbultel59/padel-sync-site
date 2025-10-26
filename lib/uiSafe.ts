// lib/uiSafe.ts
// Safe UI helpers shared across the app. Keep this file free of top-level side effects.

/** Guarded onPress wrapper: logs errors with a label to avoid silent failures */
export function press<T extends (...args: any[]) => any>(label: string, handler?: T) {
  return (...args: Parameters<T>) => {
    try {
      // Useful trace in dev
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log(`[press:${label}]`);
      }
      return handler?.(...args);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[press:${label}]`, e);
    }
  };
}

/** Compute 2-letter initials from a name string */
export function computeInitials(name?: string): string {
  const log = (from: string, to: string) => {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log(`[Initials][compute] ${JSON.stringify(from)} -> ${to}`);
    }
  };
  if (!name) {
    log(String(name), "?");
    return "?";
  }
  const n = String(name).trim();
  if (!n) {
    log(name, "?");
    return "?";
  }
  const parts = n.split(/\s+/).filter(Boolean);
  let out: string;
  if (parts.length === 1) {
    out = parts[0].slice(0, 2).toUpperCase(); // "Alex" -> "AL"
  } else {
    out = (parts[0][0] + parts[1][0]).toUpperCase(); // "Jean Pierre" -> "JP"
  }
  log(n, out);
  return out;
}

/** Best-effort display name extraction from various shapes */
export function bestDisplayName(input: any): string | null {
  try {
    if (!input) return null;
    const emailPrefix =
      typeof input?.email === "string" && input.email.includes("@")
        ? String(input.email).split("@")[0]
        : null;

    const name =
      input.name ??
      input.display_name ??
      input.full_name ??
      input.fullName ??
      input.nickname ??
      input.username ??
      emailPrefix;

    if (typeof name === "string" && name.trim()) return name.trim();
    return null;
  } catch {
    return null;
  }
}

/** Debug helper: logs which display string is used, then returns 2-letter initials */
export function debugInitials(label: string, input: any, fallbackId?: string): string {
  const display =
    bestDisplayName(input) ||
    fallbackId ||
    (input && typeof input === "object" ? input.user_id : null) ||
    "?";
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[Initials][${label}]`, { display, input });
  }
  return computeInitials(display);
}