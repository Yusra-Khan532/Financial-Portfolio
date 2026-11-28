// Task #407: types for ./golive.js (the landing page's interactive parts, ported from the go-live pack).
export type GoLiveQuote = { price: number | null; changePct: number | null; priceDate: string | null };
export type GoLiveOptions = {
  /** go to a page of the site through the app's router */
  navigate: (to: string) => void;
  /** the site's company list (the header search's index) */
  searchIndex: () => Promise<{ rows: (string | number | null)[][]; sectors?: string[]; sec?: number[]; mc?: number[] }>;
  /** the latest close of one company */
  quote: (symbol: string) => Promise<GoLiveQuote | null>;
  /** task #411: true keeps the plan table at five columns with the combined plan as a separate card under it (/plans); the landing page shows the
   *  combined plan as the table's sixth column */
  combinedCard?: boolean;
  /** task #436: whether plan prices show; leave it out to follow FL_PRICES_LIVE (the landing page), /plans passes true and keeps its prices */
  pricesLive?: boolean;
};
/** Task #436: the one switch for the landing page's plan prices; false shows "Coming soon" until payments open. */
export const FL_PRICES_LIVE: boolean;
/** Starts the landing page's interactive parts on the markup already on the page; returns the function that removes them. */
export function initGoLive(opts: GoLiveOptions): () => void;
