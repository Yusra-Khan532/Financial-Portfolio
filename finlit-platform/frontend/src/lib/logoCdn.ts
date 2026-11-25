// Company logos from Logo.dev (owner's decision, 25 Nov 2026): a company whose own website gave no usable icon (big sites block automated
// visitors; many small ones publish none) is drawn from img.logo.dev by its exchange ticker: NSE symbol + ".NS", or BSE code + ".BO".
// Our own fetched logo always comes first. Logo.dev's terms: images load straight from their CDN (never copied or proxied), and a commercial
// site on the free plan shows a visible "Logos provided by Logo.dev" link (LogoCredit in the footer). The key is PUBLISHABLE (pk_...), made for
// web pages; the server sends it only when LOGO_DEV_PUBLISHABLE_KEY is set, so with no key every missing logo stays the initials tile.

export const LOGO_CDN_HOST = "img.logo.dev";

/** The Logo.dev URL of a listed company's logo, or null without a key. One size (128px PNG, transparent) for every place, so each company is one
 *  cached image; `fallback=404` makes an unknown company fail, so the initials tile shows instead of Logo.dev's own monogram. */
export function cdnLogo(symbol: string, key: string | null | undefined): string | null {
  if (!key || !/^pk_[A-Za-z0-9_-]{4,77}$/.test(key) || !symbol) return null;
  const sym = symbol.trim().toUpperCase();
  const ticker = /^\d{6}$/.test(sym) ? `${sym}.BO` : `${sym}.NS`;
  return `https://${LOGO_CDN_HOST}/ticker/${encodeURIComponent(ticker)}?token=${encodeURIComponent(key)}&size=128&format=png&fallback=404`;
}

/** Our own sharp logo when there is one, else Logo.dev's. `backup` is our own small logo (a favicon the server set aside because it would look
 *  blurry): it rides on the Logo.dev URL as "#alt=" (a fragment is never sent to Logo.dev), and the Logo component switches to it if Logo.dev has
 *  no image for this company, so a company never falls from a small logo to the initials tile. */
export function logoFor(symbol: string, own: string | null | undefined, key: string | null | undefined, backup?: string | null): string | null {
  if (own) return own;
  const cdn = cdnLogo(symbol, key);
  if (!cdn) return backup || null;
  return backup ? `${cdn}#alt=${encodeURIComponent(backup)}` : cdn;
}

/** The backup carried on a Logo.dev URL, if any. */
export function altOf(src: string): string | null {
  const i = src.indexOf("#alt=");
  return isCdnLogo(src) && i > 0 ? decodeURIComponent(src.slice(i + 5)) : null;
}

export const isCdnLogo = (src: string) => src.startsWith(`https://${LOGO_CDN_HOST}/`);
