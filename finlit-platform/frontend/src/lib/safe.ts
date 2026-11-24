/** Only follow `next` links that stay on this site (blocks open redirects such as //evil.example). */
export function safeNext(raw: string | null, fallback = "/dashboard"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\r\n]/.test(raw)) return fallback;
  return raw;
}

/** An absolute external URL safe to put in an href or navigate to: http(s) only. Returns the normalised URL, or null for a javascript:/data:/
 *  vbscript: scheme, a relative or malformed value, or nothing. Use for any link that comes from feed/exchange/notification data, never trusted. */
export function safeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}
