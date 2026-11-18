// The MF portfolio's three tabs (task #183 part 2, pack 02): Your funds, Mix & overlap, Risk analytics. The tabs' content is in MfFunds, MfMix and MfRisk.
// Describes; never advice. Information only, not investment advice.

export type MfView = "funds" | "mix" | "risk";
export function MfTabs({ view, onView }: { view: MfView; onView: (v: MfView) => void }) {
  const tabs: [MfView, string, string][] = [["funds", "Your funds", "Health, returns, costs and risk of each fund"], ["mix", "Mix & overlap", "What they hold, how alike they are, company sizes"], ["risk", "Risk analytics", "Each fund against its own benchmark, and the list together"]];
  return <div className="mfp-tabs" role="tablist" aria-label="MF portfolio views">{tabs.map(([k, t, s]) => <button key={k} type="button" role="tab" id={`mfp-tab-${k}`} aria-selected={view === k} aria-controls="mfp-panel" onClick={() => onView(k)}><b>{t}</b><small>{s}</small></button>)}</div>;
}

/** "AVERAGE" -> "Average": the stored labels are in capitals; the pack writes them in normal case. */
export const wordCase = (w: string | null | undefined) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : "");
