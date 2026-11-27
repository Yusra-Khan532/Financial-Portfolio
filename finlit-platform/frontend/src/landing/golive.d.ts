// Task #407: types for ./golive.js (the landing page's interactive parts, ported from the go-live pack).
export type GoLiveQuote = { price: number | null; changePct: number | null; priceDate: string | null };
export type GoLiveOptions = {
  /** go to a page of the site through the app's router */
  navigate: (to: string) => void;
  /** the site's company list (the header search's index) */
  searchIndex: () => Promise<{ rows: (string | number | null)[][]; sectors?: string[]; sec?: number[]; mc?: number[] }>;
  /** the latest close of one company */
  quote: (symbol: string) => Promise<GoLiveQuote | null>;
};
/** Starts the landing page's interactive parts on the markup already on the page; returns the function that removes them. */
export function initGoLive(opts: GoLiveOptions): () => void;
