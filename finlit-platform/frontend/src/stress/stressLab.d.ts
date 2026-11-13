export type StressOpts = {
  view?: "single" | "compare"; peer?: { company: any; scenarios: any[]; history?: any[]; same_quarter: boolean; picked: boolean } | null;
  /** Gold, Compare two asked for and no second company yet: why not, said at the top next to the "Compare with" box. */
  peerStatus?: "loading" | "none" | "preparing" | "notcovered" | "error" | "";
  /** With "notcovered": the server's plain reason (for example that financial companies are not covered). */
  peerReason?: string;
  logoUrl?: (symbol: string) => string; search?: (q: string) => any[]; onCompany?: (symbol: string) => void; onPeer?: (symbol: string) => void; requestPeer?: () => void;
  /** Silver: "See what Gold adds" opens the site's upgrade flow; upgradeUrl is the plain link behind it. */
  onUpgrade?: () => void; upgradeUrl?: string;
};
export function mountStressLab(root: ShadowRoot, engine: unknown, data: any, opts: StressOpts): { destroy(): void; setView(v: "single" | "compare"): void; state: any };
