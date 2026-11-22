// Task #271 (company report pack of 20 Nov 2026, change 20): Discover on the company report.
//   20a ThemeChips  the header card, under the classification row: the main theme first ("Main theme", Discover's count of companies with it as main theme),
//                   then the other themes its presentation mentions; each opens the theme in Discover with this company found. Under them the stage, the
//                   presentation's date and "What it says ↓" (scrolls to 20b). A company Discover has not placed says so, with a link to Discover.
//   20b BuildCard   01 Company overview, after the description and the four stats: the main theme in one sentence, the words it uses, one passage about the
//                   business from the presentation, the theme's four figures as on its Discover card, the other themes, what to check, two links.
// Data: GET /api/discovery/company (404 = not placed), the Discover board and the same prices the Discover page joins (discovery/model.ts), so every figure
// here is the one the theme page shows. Describes what the company's own presentation says; never a pick. Styles: styles/dth.css (class prefix dth-).
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useHoverOpen } from "../lib/hoverOpen";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "../lib/api";
import { useUniverse } from "../lib/screener";
import { useUIMaybe } from "../lib/ui";
import { BASE, fmtDate, joinRows, pct, short, stat, themePath, useBoard, type BoardTheme, type DRow } from "../discovery/model";
import { buttonClass } from "../components/ui";
import "../styles/dth.css";

export type DiscoverPassage = { t: string; kind?: string; about?: boolean };
export type DiscoverCompany = { symbol: string; theme: string; words: string[]; passages: DiscoverPassage[]; document: { title?: string; date?: string | null; pages?: number | null; link?: string | null } | null };

/** The stage words, what each means and its dot colour (pack: "Each has its own colour dot"). */
export const STAGE: Record<string, [string, string]> = {
  Operating: ["its own sentences describe it as running today", "#2e7d5b"],
  "Under execution": ["its own sentences describe it as being built now", "#2f5a9e"],
  Planned: ["planned, not started", "#b07a12"],
  "MoU / pilot": ["an MoU or a pilot", "#b07a12"],
  "Not stated": ["its sentences give no stage", "#6b7280"],
};
const TIP = "Discover reads each company’s newest investor presentation and places it in the theme it talks about most: its main theme. The other themes it mentions are shown after it. Stage is the most advanced its own sentences show: operating, under execution, planned, MoU or pilot. Each theme opens in Discover with this company found.";

/** A passage that is not about the business: a signature block, a director's biography, or a results headline (pack, Discover fix 2). When Discover marks
 *  its passages (`about`), that mark wins. */
const NOT_BUSINESS = /Yours (sincerely|faithfully)|Company Secretary|Compliance Officer|\bM\.?\s?No\.?\s?[A-Z]?\d|\((Managing Director|Joint Managing Director|Whole[- ]?time Director|Executive Director|Director|Chairman|Chairperson|CEO|CFO)[^)]*\)|\b(He|She) (founded|joined|has been|holds|is a)\b|\bQ[1-4]\s?FY\s?\d{2}\b|\bYoY\b/i;
export function businessPassage(ps: DiscoverPassage[] | undefined): DiscoverPassage | null {
  const all = ps ?? [];
  if (all.some((p) => typeof p.about === "boolean")) return all.find((p) => p.about) ?? null;
  return all.find((p) => p.t && !NOT_BUSINESS.test(p.t)) ?? null;
}
/** "Tech Mahindra’s", "Apollo Micro Systems’" */
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
export const possessive = (n: string) => (/s$/i.test(n) ? `${n}’` : `${n}’s`);
/** Discover's theme page with this company found: /discover/themes/ai-and-genai?q=Tech+Mahindra */
export const themeLink = (theme: string, company: string) => `${themePath(theme)}?q=${encodeURIComponent(company).replace(/%20/g, "+")}`;

/** Everything both parts read. `company` is null when Discover has not placed the company (404), undefined while loading. */
export function useDiscoverFor(symbol: string) {
  const co = useQuery({
    queryKey: ["discovery", "company", symbol], staleTime: 10 * 60_000, retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 1,
    queryFn: async () => { try { return await apiGet<DiscoverCompany>(`/api/discovery/company?symbol=${encodeURIComponent(symbol)}`); } catch (e) { if (e instanceof ApiError && e.status === 404) return null; throw e; } },
  });
  const b = useBoard(), u = useUniverse();
  const settled = !b.isLoading && !u.isLoading;      // draw once the board and the prices are in (or failed), never a half row that fills in later
  return useMemo(() => {
    const board = b.data, rows: DRow[] = board ? joinRows(board, u.data?.rows, undefined, undefined, undefined) : [];
    const row = rows.find((r) => r.s === symbol) ?? null;
    const byName = new Map((board?.themes ?? []).map((t) => [t.name, t]));
    const main = co.data ? byName.get(row?.th ?? co.data.theme) ?? null : null;
    const others = (row?.sec ?? []).map((n) => byName.get(n)).filter((t): t is BoardTheme => !!t && t.name !== main?.name);
    const themeRows = main ? rows.filter((r) => r.th === main.name) : [];
    return { company: co.data, failed: co.isError, row, main, mainName: main?.label ?? co.data?.theme ?? null, others, stats: themeRows.length ? stat(themeRows) : null, asOf: u.data?.asOf ?? null, ready: settled };
  }, [co.data, co.isError, b.data, u.data, symbol, settled]);
}

function Spark() {
  return <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" /></svg>;
}
const Arrow = () => <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>;
const Stage = ({ st }: { st: string }) => <span className="dth-stg" style={{ "--stg": STAGE[st]?.[1] ?? "#6b7280" } as React.CSSProperties}>{st}</span>;

/** The (i) of 20a: opens a note under it on hover, keyboard focus or a click; a second click, Escape or a click outside closes it and focus goes back to the button. */
function Tip() {
  const [open, setOpen] = useState(false), id = useId(), btn = useRef<HTMLButtonElement>(null), box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    const out = (e: MouseEvent) => { const t = e.target as Node; if (!btn.current?.contains(t) && !box.current?.contains(t)) setOpen(false); };
    document.addEventListener("keydown", key); document.addEventListener("mousedown", out);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("mousedown", out); };
  }, [open]);
  const hover = useHoverOpen(open, () => setOpen(true), () => setOpen(false));   // task #265: hover and keyboard focus open it too
  return <span className="dth-iw"><button ref={btn} type="button" className="dth-i" aria-label="About Discover themes" aria-expanded={open} aria-controls={open ? id : undefined} {...hover.trigger}
    onClick={() => hover.click(() => setOpen(!open))}>i</button>
    {open && <span ref={box} id={id} role="note" className="dth-pop" {...hover.note}>{TIP}</span>}</span>;
}

/** 20a, under the classification row in the header card. `jump` scrolls below the sticky section bar (the report's own). */
export function ThemeChips({ symbol, name, jump }: { symbol: string; name: string; jump?: (id: string) => void }) {
  const d = useDiscoverFor(symbol), co = short(name);
  if (d.company === undefined || d.failed || (d.company && !d.ready)) return null;   // loading, or Discover could not be read: nothing rather than a wrong line
  if (d.company === null) return (
    <nav className="dth dth-none" aria-label="Discover themes"><span className="dth-k"><Spark />Discover themes</span>
      <span className="dth-nil">{co} is not in a Discover theme yet. Discover places a company from the words of its newest investor presentation. <Link to={BASE}>Open Discover ↗</Link></span></nav>);
  // Task #312 (developer file 20, change 1): one line, not a heading, three chips and a stage row (162 px, 311 on a phone): ✦ Discover · the main theme
  // chip (Main theme) · "also" the other themes · the stage · What it says ↓ · (i). The counts move to the tooltips (they stay on the card below).
  const date = d.company.document?.date, mainLabel = d.mainName ?? d.company.theme;
  const many = (n?: number) => (n != null ? `, ${n.toLocaleString("en-IN")} ${n === 1 ? "company" : "companies"} in Discover` : "");
  return (
    <nav className="dth dtx" aria-label={`Discover themes featuring ${co}`}>
      <span className="dtx-k"><Spark />Discover</span>
      <Link className="dtx-main" to={themeLink(d.main?.name ?? d.company.theme, co)} title={`Main theme: ${mainLabel}${many(d.main?.n)}. Opens it in Discover with ${co} found.`}>
        <b>{mainLabel}</b><em className="ui-chip ui-chip--gold">Main theme</em><Arrow /></Link>
      {d.others.length > 0 && <span className="dtx-also">also {d.others.map((t, i) => <span key={t.name}>{i > 0 ? ", " : ""}<Link to={themeLink(t.name, co)} title={`${t.label} in Discover${t.n != null ? ` (${t.n.toLocaleString("en-IN")} ${t.n === 1 ? "company" : "companies"})` : ""}`}>{t.label}</Link></span>)}</span>}
      <span className="dtx-end">
        {d.row?.st && <span title={date ? `Its investor presentation of ${fmtDate(date)} describes it as ${(STAGE[d.row.st]?.[0] ?? d.row.st).replace(/^its own sentences describe it as /, "")}` : STAGE[d.row.st]?.[0]}><Stage st={d.row.st} /></span>}
        <a className="dtx-go" href="#dth-card" onClick={(e) => { e.preventDefault(); if (jump) jump("dth-card"); else document.getElementById("dth-card")?.scrollIntoView({ block: "start" }); }}>What it says ↓</a>
        <Tip />
      </span>
    </nav>);
}

/** 20b, in 01 Company overview: what the company's presentation says it is building. Nothing for a company Discover has not placed. */
export function BuildCard({ symbol, name }: { symbol: string; name: string }) {
  const d = useDiscoverFor(symbol), co = short(name), ui = useUIMaybe();
  if (!d.company || d.failed || !d.ready) return null;
  const c = d.company, theme = d.mainName ?? c.theme, doc = c.document, words = c.words ?? [], shown = words.slice(0, 5), rest = words.slice(5);
  const q = businessPassage(c.passages), s = d.stats, st = d.row?.st ?? null, verify = d.main?.verify?.[0];
  const trendOpen = !!ui?.has("gold");     // the long-term trend is part of Gold, as on the Discover theme card (c.prismOpen)
  // Task #312 (developer file 20, change 2): compact (435 px, 862 on a phone): the header with the stage on the right; one sentence with the
  // presentation's date and pages, then its words; the four theme figures in one strip (2 x 2 on narrow screens); what to check; the actions with the
  // figures' date and "Information only" in one fine line. "Its presentation also mentions" goes (it is in the header line); so does the passage.
  void q;
  return (
    <div className="card dth-card dtc" id="dth-card">
      <div className="dtc-h"><span className="dth-ck"><Spark />From Discover</span><h3>What it is building</h3>{st && <span title={STAGE[st]?.[0] ? cap(STAGE[st][0]) : undefined}><Stage st={st} /></span>}</div>
      <p className="dtc-lede"><b>{theme}</b> is the theme {possessive(co)} newest investor presentation talks about most{doc?.date ? <span className="dtc-src"> ({fmtDate(doc.date)}{doc.pages ? `, ${doc.pages} pages` : ""})</span> : null}.
        {shown.length > 0 && <span className="dtc-words"> Its words: {shown.map((w) => <i key={w}>{w}</i>)}{rest.length > 0 && <i className="dth-more" title={rest.join(", ")}>+{rest.length} more</i>}</span>}</p>
      {s && <dl className="dtc-ctx" aria-label={`${theme} on Discover`}>
        <div><dt>Companies in the theme</dt><dd><b>{s.n.toLocaleString("en-IN")}</b><small>{d.main?.also ? `${d.main.also} more mention it` : "no other company mentions it"}</small></dd></div>
        <div><dt>3-month median</dt><dd><b>{pct(s.m3)}</b><small>{co} {d.row?.r3m != null ? pct(d.row.r3m) : "not available"}</small></dd></div>
        <div><dt>1-year median</dt><dd><b>{pct(s.m1y)}</b><small>of the theme</small></dd></div>
        <div><dt>In a long-term uptrend</dt><dd>{trendOpen ? <><b>{s.up}</b><small>of {s.n}</small></> : <b><Link to="/pricing" className="dth-lock" title="The technical views are part of Gold">Gold</Link></b>}</dd></div>
      </dl>}
      <p className="dtc-check"><b>What to check:</b> {verify ? `${verify.replace(/\.?\s*$/, ".")} ` : ""}A theme word alone is not proof of real business.</p>
      <div className="dtc-acts"><Link className={buttonClass("secondary", "md", "dth-btn")} to={themeLink(d.main?.name ?? c.theme, co)}>See the theme in Discover<Arrow /></Link>
        {doc?.link && <a className="dth-link" href={doc.link} target="_blank" rel="noopener noreferrer">Open the presentation ↗</a>}
        <span className="dth-fine">{s ? `Theme figures as on Discover${d.asOf ? `, prices of ${fmtDate(d.asOf)}` : ""} · ` : ""}Information only, not a recommendation.</span></div>
    </div>);
}
