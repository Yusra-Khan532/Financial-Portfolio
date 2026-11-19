// Task #220 (FinLit Prism report handover, 18 Nov 2026): the parts the Prism report shares with the company report, as this page needs them.
//   PzHead        numbered section heading: number, thin rule, title, one-line description (README 1.1)
//   PzProp        the proprietary note with a lock (README 1.4)
//   TopDisclaimer the disclaimer as a drop-down box under the company line, closed on load (README 2.1)
//   PrismSecNav   the sticky sections bar: Score · 01 … 05 · Questions, the mini chip once the score card has scrolled away, the selected item kept in
//                 view by scrolling the bar itself (never scrollIntoView), jumps that land just under the bar (README 1.2)
// Styles: styles/prism220.css.
import { useEffect, useRef, useState } from "react";
import { DropChev } from "../../DropChev";
import { Icon } from "../../../lib/icons";
import { PRISM_NAME, score1, type PrismReport } from "../../../lib/prism";
import { LabelChip } from "./Hero";
import "../../../styles/prism220.css";
import { coTitle, shortLabel } from "../../../lib/companyLabel";

/** The disclaimer, the same at the top and in the footer; its last sentence is the proprietary one (README 1.4). */
export const PRISM_DISCLAIMER = "This report describes the company's financial health from its filings and market prices, with estimates where information is missing. The FinLit Prism score is calculated from many parameters, and not all of them are shown in this report. It is not an investment recommendation or a prediction of future returns. The FinLit Prism model, its parameters and how it combines them are proprietary to FinLit Ventures.";

/** The five sections and the colour of each number (README 1.1). */
export const PZ_SECTIONS = [
  { id: "factors", no: "01", nav: "Every factor", color: "var(--p-growth)" },
  { id: "pzr-technical", no: "02", nav: "Technical view", color: "#2a78d6" },
  { id: "history", no: "03", nav: "Financial history", color: "var(--gain)" },
  { id: "valuation", no: "04", nav: "Valuation", color: "var(--p-quality)" },
  { id: "notes", no: "05", nav: "Notes", color: "var(--muted)" },
] as const;

export function PzHead({ no, title, desc, id }: { no: string; title: string; desc?: React.ReactNode; id: string }) {
  const color = PZ_SECTIONS.find((s) => s.no === no)?.color ?? "var(--gold)";
  return (
    <header className="pzh" style={{ "--sc": color } as React.CSSProperties}>
      <span className="pzh-n" aria-hidden="true">{no}</span><span className="pzh-rule" aria-hidden="true" />
      <div className="pzh-t"><h3 id={id}>{title}</h3>{desc ? <p>{desc}</p> : null}</div>
    </header>
  );
}

export function PzProp({ lead, children }: { lead: string; children: React.ReactNode }) {
  return <p className="pz-prop" role="note"><span className="pz-prop-ic" aria-hidden="true"><Icon name="lock" /></span><span><b>{lead}</b> {children}</span></p>;
}

export function TopDisclaimer() {
  return (
    <details className="pz-tdisc xdd">
      <summary className="xdd-s">
        <span className="pz-tdisc-ic" aria-hidden="true"><Icon name="shield" /></span>
        <span className="pz-tdisc-t"><b>Disclaimer</b><span>Information only, not investment advice. Please read before using this report.</span></span>
        <DropChev />
      </summary>
      <div className="pz-tdisc-b"><p>{PRISM_DISCLAIMER}</p></div>
    </details>
  );
}

const ITEMS = [{ id: "prism", no: "", nav: "Score" }, ...PZ_SECTIONS, { id: "faq", no: "", nav: "Questions" }];
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Where the bar's bottom edge sits (the site header's height plus the bar), for jumps and for the frozen tab bars below it. */
function barBottom(bar: HTMLElement | null): number {
  if (!bar) return 0;
  return bar.getBoundingClientRect().bottom;
}

export function PrismSecNav({ report }: { report: PrismReport }) {
  const ref = useRef<HTMLDivElement>(null), navRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState("prism"), [past, setPast] = useState(false);
  // the bar sits under the site header; html's scroll padding = header + bar + 8 px, so keyboard and hash jumps land under it too
  useEffect(() => {
    const bar = ref.current; if (!bar) return;
    const root = document.documentElement, before = root.style.scrollPaddingTop;
    const place = () => {
      const hd = document.querySelector("header.top") as HTMLElement | null;
      const h = hd && /sticky|fixed/.test(getComputedStyle(hd).position) ? hd.getBoundingClientRect().height : 0;
      bar.style.top = h + "px";
      root.style.setProperty("--pzn-top", `${h + bar.offsetHeight + 8}px`);
      root.style.setProperty("--pzn-stick", `${h + bar.offsetHeight + 6}px`);
      root.style.scrollPaddingTop = `${h + bar.offsetHeight + 8}px`;
    };
    place();
    addEventListener("resize", place);
    return () => { removeEventListener("resize", place); root.style.scrollPaddingTop = before; root.style.removeProperty("--pzn-top"); root.style.removeProperty("--pzn-stick"); };
  }, []);
  // the tracker: the last section whose top has passed the bar is selected; the bar scrolls itself to keep it in view; the mini chip shows once the
  // score card has gone under the bar
  useEffect(() => {
    let raf = 0;
    const track = () => {
      raf = 0;
      const line = barBottom(ref.current) + 24;
      let cur = "prism";
      for (const it of ITEMS) { const el = document.getElementById(it.id); if (el && el.getBoundingClientRect().top <= line) cur = it.id; }
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4 && document.getElementById("faq")) cur = "faq";
      setActive(cur);
      const card = document.getElementById("prism");
      setPast(!!card && card.getBoundingClientRect().bottom < barBottom(ref.current));
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(track); };
    track();
    addEventListener("scroll", on, { passive: true }); addEventListener("resize", on);
    return () => { removeEventListener("scroll", on); removeEventListener("resize", on); if (raf) cancelAnimationFrame(raf); };
  }, []);
  useEffect(() => {
    const nav = navRef.current, a = nav?.querySelector<HTMLAnchorElement>(`a[data-id="${active}"]`);
    if (!nav || !a || nav.scrollWidth <= nav.clientWidth) return;
    const left = a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2;
    nav.scrollTo({ left: Math.max(0, left), behavior: reduced() ? "auto" : "smooth" });
  }, [active]);
  const jump = (id: string) => (e: React.MouseEvent) => {
    const t = document.getElementById(id); if (!t) return;
    e.preventDefault();
    window.scrollTo({ top: t.getBoundingClientRect().top + scrollY - (barBottom(ref.current) + 8), behavior: reduced() ? "auto" : "smooth" });
    history.replaceState(null, "", "#" + id);
  };
  const r = report.rating, rated = r.status !== "NOT RATED" && r.final != null;
  return (
    <div className={"pzn" + (past ? " xcmp" : "")} id="secnav" ref={ref}>
      <div className="pzn-in">
        <a className="pzn-co" href="#prism" onClick={jump("prism")} title="Back to the score card" aria-hidden={!past} tabIndex={past ? 0 : -1}>
          <b title={coTitle(report.company)}>{shortLabel(report.company)}</b><span className="pzn-k">Prism</span>
          {rated ? <><span className="pzn-v">{score1(r.final)}</span><LabelChip label={r.label} /></> : <span className="pzn-k">Not rated</span>}
        </a>
        <nav ref={navRef} aria-label={`${PRISM_NAME} report sections`}>
          {ITEMS.map((it) => (
            <a key={it.id} href={"#" + it.id} data-id={it.id} className={active === it.id ? "active" : undefined} aria-current={active === it.id ? "location" : undefined} onClick={jump(it.id)}>
              {it.no && <span className="sx-n">{it.no}</span>}{it.nav}
            </a>))}
        </nav>
      </div>
    </div>
  );
}
