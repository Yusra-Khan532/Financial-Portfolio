import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { useOpenPref } from "./DcfIntro";

// Task #425: the DCF page's disclaimer is a drop-down, built like the page's Methodology card (task #412) and the SIP
// calculator's disclaimer (task #424). The closed row still reads as a disclaimer: the "Disclaimer" title and its first
// sentence stay visible; the points open below it. Open or closed is remembered per member under its own key.
// The wording keeps every fact of the old one-paragraph disclaimer (assumptions move the value a lot; a calculation tool
// for education, not investment advice; an estimate from the inputs, not a forecast of the share price) and adds where
// the filled-in figures come from. It describes, never advises.
export const DCF_DISCLAIMER_LEAD = "Information only, not investment advice.";
export const DCF_DISCLAIMER_POINTS: [string, string][] = [
  ["A calculation tool for education.", "It shows how a discounted cash flow (DCF) turns the numbers you enter into a value per share. It is not a recommendation on any company or share."],
  ["The value depends on the assumptions.", "A DCF value is only as good as its assumptions: small changes in growth or discount rate move it a lot. The sensitivity grid and the Bear, Base and Bull cases show how far."],
  ["An estimate, not a forecast.", "The intrinsic value is an estimate from the inputs above, not a forecast of the future share price."],
  ["Check the figures.", "Figures filled in for a company are taken from its reported results and can be revised later; check them against the company's own filings."],
];

export function DcfDisclaimer({ member }: { member: string | null }) {
  const { open, set } = useOpenPref("finlit.dcf.disc", member);
  const box = useRef<HTMLDetailsElement>(null);
  const printing = useRef(false);
  // "Print / PDF" keeps the whole disclaimer on paper, as the old always-visible paragraph was; the member's choice is not changed.
  useEffect(() => {
    const before = () => { if (box.current && !box.current.open) { printing.current = true; box.current.open = true; } };
    const after = () => { if (printing.current && box.current) box.current.open = false; printing.current = false; };
    window.addEventListener("beforeprint", before); window.addEventListener("afterprint", after);
    return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, []);
  return (
    <details ref={box} className="card dcx-dsc" open={open} onToggle={(e) => { const v = (e.currentTarget as HTMLDetailsElement).open; if (!printing.current && v !== open) set(v); }}>
      <summary>
        <h2>Disclaimer</h2>
        <span className="dcx-dsc-l">{DCF_DISCLAIMER_LEAD}</span>
        <span className="dcx-dsc-tg" aria-hidden="true">{open ? "Hide" : "Show"}<span className={"dcx-chev" + (open ? " up" : "")} /></span>
      </summary>
      <ul className="dcx-dsc-b">
        {DCF_DISCLAIMER_POINTS.map(([t, d]) => <li key={t}><b>{t}</b> {d}</li>)}
      </ul>
      <p className="dcx-dsc-f"><Link to="/glossary#discounted-cash-flow-dcf">What is a DCF?</Link></p>
    </details>
  );
}
