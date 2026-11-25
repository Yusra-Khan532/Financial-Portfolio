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

/** Our own logo when there is one, else Logo.dev's. */
export const logoFor = (symbol: string, own: string | null | undefined, key: string | null | undefined): string | null => own || cdnLogo(symbol, key);

export const isCdnLogo = (src: string) => src.startsWith(`https://${LOGO_CDN_HOST}/`);
