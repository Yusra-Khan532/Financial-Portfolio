import { useCallback, useEffect, useState } from "react";
// The start of the DCF calculator page: what a DCF is, five steps to use it, what comes out. Plain words; it describes a calculation and never advises.
const STEPS: [string, string][] = [
  ["Choose a company", "Search a listed company to fill its free cash flow, net debt, shares, price and market cap (Gold)."],
  ["Set the key assumptions", "Review or edit the starting free cash flow, growth for years 1 to 5 and 6 to 10, terminal growth, the discount rate and net debt."],
  ["Read the result", "See the intrinsic value per share, how today's price compares with it, and a plain-words summary."],
  ["Explore scenarios", "Use the Bear, Base and Bull cases and the sensitivity grid (discount rate against terminal growth) to see how much the answer moves."],
  ["Review the working", "Open the year-by-year cash flow table and the step-by-step calculation: enterprise value, equity value, value per share."],
];
const GET = ["Intrinsic value per share", "Price against estimated value", "Bear, Base and Bull cases", "Sensitivity grid", "Year-wise cash flow and terminal value", "Full calculation and assumptions"];

// Task #302: closed at the start (the calculator comes first; the header's "Learn more" opens it), and remembered open or closed per member.
// Task #412: the methodology card below the calculator is a drop-down too, remembered the same way under its own key.
const KEY = "finlit.dcf.intro";
const keyOf = (key: string, member: string | null) => `${key}.${member ?? "guest"}`;
const read = (key: string, member: string | null) => { try { return localStorage.getItem(keyOf(key, member)) === "open"; } catch { return false; } };
const save = (key: string, member: string | null, open: boolean) => { try { localStorage.setItem(keyOf(key, member), open ? "open" : "closed"); } catch { /* private mode */ } };

/** A card that opens and closes: open or closed as this member left it (closed the first time). */
export function useOpenPref(key: string, member: string | null) {
  const [open, setOpen] = useState(() => read(key, member));
  useEffect(() => { setOpen(read(key, member)); }, [key, member]);
  const set = useCallback((v: boolean) => { setOpen(v); save(key, member, v); }, [key, member]);
  return { open, set };
}

/** Open or closed, as this member left it (closed the first time). */
export const useIntroOpen = (member: string | null) => useOpenPref(KEY, member);

export function DcfIntro({ open: given, onOpenChange }: { open?: boolean; onOpenChange?: (open: boolean) => void } = {}) {
  const own = useIntroOpen(null);
  const open = given ?? own.open, set = onOpenChange ?? own.set;
  return (
    <details className="card dcf-intro" open={open} onToggle={(e) => { const v = (e.currentTarget as HTMLDetailsElement).open; if (v !== open) set(v); }}>
      <summary><h2>How this calculator works</h2><button type="button" className="dcf-hide" aria-expanded={open} onClick={(e) => { e.preventDefault(); set(!open); }}>{open ? "Hide" : "Show"}</button></summary>
      <div className="dcf-intro-grid">
        <div>
          <h3>What is a DCF?</h3>
          <p>A discounted cash flow (DCF) calculator estimates what a business is worth today from the cash it is expected to generate. It projects the company's free cash flow (FCF) year by year, then discounts those cash flows back to today at the return you require, called the discount rate.</p>
          <p>The result is an estimate that depends entirely on the assumptions you set. A different growth rate or discount rate gives a different answer, which is why the sensitivity grid and the three scenarios are here.</p>
        </div>
        <div>
          <h3>How to use it</h3>
          <ol className="dcf-steps">{STEPS.map(([t, d]) => <li key={t}><b>{t}</b><span>{d}</span></li>)}</ol>
        </div>
      </div>
      <h3 className="dcf-get-h">What you get</h3>
      <ul className="dcf-get">{GET.map((g) => <li key={g}>{g}</li>)}</ul>
      <p className="dcf-intro-note">Describes the company's financial health from its filings and prices; not a recommendation. Information only, not investment advice.</p>
    </details>
  );
}
