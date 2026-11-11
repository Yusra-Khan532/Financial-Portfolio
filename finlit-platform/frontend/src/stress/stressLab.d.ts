export type StressOpts = {
  view?: "single" | "compare"; peer?: { company: any; scenarios: any[]; history?: any[]; same_quarter: boolean; picked: boolean } | null;
  logoUrl?: (symbol: string) => string; search?: (q: string) => any[]; onCompany?: (symbol: string) => void; onPeer?: (symbol: string) => void; requestPeer?: () => void;
};
export function mountStressLab(root: ShadowRoot, engine: unknown, data: any, opts: StressOpts): { destroy(): void; setView(v: "single" | "compare"): void; state: any };
