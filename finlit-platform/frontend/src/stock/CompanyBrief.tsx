// COMPANY BRIEF on every company page: what the company does, how the group is held, each business with its latest figures, where the money comes from, recent
// developments and what is missing, every line cited to the company's own filings. Shows the PUBLISHED brief only; with none it says why. Describes, never advises.
import { useState } from "react";
import { dateIN } from "../lib/format";
import { COMPLIANCE, PART_NAMES, citeUrl, citedPages, shares, shortName, useCompanyBrief, type Brief, type BriefReply, type Cite, type Doc, type MixSide } from "../lib/companyBrief";
import "../styles/company-brief.css";

type Chips = Record<string, string>;
const day = (s?: string | null) => (s ? dateIN(s) : "");

/** One citation chip: the document's short label and the PDF page; it opens the filing at that page. */
export function CiteChips({ cites, docs, chips, max = 2 }: { cites?: Cite[]; docs: Record<string, Doc>; chips: Chips; max?: number }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const seen = new Set<string>();
  const list = (cites ?? []).filter((c) => { const k = `${c.doc}:${c.page ?? ""}`; if (seen.has(k)) return false; seen.add(k); return true; });
  if (!list.length) return null;
  const shown = all ? list : list.slice(0, max);   // task #312 (developer file 20, change 6 item 7): two tags, then "+N"
  return (
    <span className="cb-cites">
      {shown.map((c) => {
        const d = docs[c.doc], href = citeUrl(d, c.page), key = `${c.doc}:${c.page ?? ""}`;
        const label = `${chips[c.doc] || c.doc}${c.page ? " p." + c.page : ""}`;
        const title = `${d?.title ?? "Filing"}${d?.date ? " (" + day(d.date) + ")" : ""}${c.page ? ", page " + c.page : ""}`;
        return href
          ? <span className="cb-cite-w" key={key}>
              <a className="cb-cite" href={href} target="_blank" rel="noopener noreferrer" title={title} aria-label={`Open ${title}`}>[{label}]</a>
              <button type="button" className="cb-copy" aria-label={`Copy the link to ${title}`} title="Copy link" onClick={() => { navigator.clipboard?.writeText(href).then(() => { setCopied(key); setTimeout(() => setCopied(null), 1500); }).catch(() => undefined); }}>{copied === key ? "Copied" : "Copy"}</button>
            </span>
          : <span className="cb-cite off" key={key} title={`${title}: the address is not on file`}>[{label}]</span>;
      })}
      {list.length > shown.length && <button type="button" className="cbr-more" aria-label={`Show ${list.length - shown.length} more sources`} onClick={() => setAll(true)}>+{list.length - shown.length}</button>}
    </span>
  );
}

type TabKey = "company" | "businesses" | "plans" | "recent" | "sources";
const TABS: [TabKey, string][] = [["company", "The company"], ["businesses", "Businesses"], ["plans", "Plans & catalysts"], ["recent", "Recent"], ["sources", "Sources & checks"]];

/** Where the money comes from: one strip per measure (the whole cut into its parts, in the same order and shade for every measure), then one table
 *  naming each part with both figures (pack change 6, item 8a: "a business that earns more than it sells shows at once"). */
function MixStrips({ mix, docs, chips }: { mix: NonNullable<Brief["mix"]>; docs: Record<string, Doc>; chips: Chips }) {
  const sides = ([["Sales", mix.revenue], ["EBITDA", mix.ebitda]] as const).filter(([, sd]) => shares(sd).length);
  if (!sides.length) return null;
  const order: string[] = [];
  for (const [, sd] of sides) for (const r of shares(sd)) if (!order.includes(r.name)) order.push(r.name);
  const pct = (sd: MixSide | undefined, n: string) => shares(sd).find((r) => r.name === n)?.pct;
  return (
    <section aria-label="Where the money comes from" className="cb-sec">
      <h3>Where the money comes from{mix.period ? <span className="cb-faint"> · {mix.period}</span> : null}</h3>
      {sides.map(([label, sd]) => (
        <div className="cbr-strip" key={label}>
          <span className="cbr-sl">{label}</span>
          <span className="cbr-sb" role="img" aria-label={`${label}: ${order.map((n) => `${n} ${(pct(sd, n) ?? 0).toFixed(1)}%`).join(", ")}`}>
            {order.map((n, i) => { const v = pct(sd, n) ?? 0; return v > 0 ? <i key={n} className={`cbr-c${(i % 7) + 1}`} style={{ width: `${v}%` }} title={`${n}: ${v.toFixed(1)}%`} /> : null; })}
          </span>
        </div>))}
      <div className="cb-tw"><table className="cb-table cbr-mixt">
        <thead><tr><th scope="col">Business</th>{sides.map(([l]) => <th key={l} scope="col" className="num">Share of {l === "EBITDA" ? l : l.toLowerCase()}</th>)}</tr></thead>
        <tbody>{order.map((n, i) => <tr key={n}><th scope="row"><i className={`cbr-dot cbr-c${(i % 7) + 1}`} aria-hidden="true" />{n}</th>{sides.map(([l, sd]) => { const v = pct(sd, n); return <td key={l} className="num">{v == null ? "–" : `${v.toFixed(1)}%`}</td>; })}</tr>)}</tbody>
      </table></div>
      <p className="cb-faint cb-note">{[mix.revenue?.basis, mix.ebitda?.basis].filter(Boolean).join(" ")} <CiteChips cites={[...(mix.revenue?.cites ?? []), ...(mix.ebitda?.cites ?? [])]} docs={docs} chips={chips} /></p>
    </section>);
}

/** The group: one row per company with a bar for the share held and a line at 50%; six rows, then "Show all N companies" (item 8). */
function GroupRows({ g, name, docs, chips }: { g: NonNullable<Brief["group"]>; name: string; docs: Record<string, Doc>; chips: Chips }) {
  const [all, setAll] = useState(false);
  const rows = all ? g.rows : g.rows.slice(0, 6);
  return (
    <section aria-label="How the group is held" className="cb-sec">
      <h3>How the group is held{g.as_of ? <span className="cb-faint"> · as of {g.as_of}</span> : null}</h3>
      <ul className="cbr-group">{rows.map((r, i) => (
        <li key={i}>
          <div className="cbr-gn"><b>{r.name}</b>{r.what ? <span className="cb-faint cb-block">{r.what}</span> : null}{r.note ? <span className="cb-faint cb-block">{r.note}</span> : null}</div>
          <div className="cbr-gv"><b>{r.stake.toFixed(2)}%</b> <CiteChips cites={r.cites} docs={docs} chips={chips} />
            <span className="cbr-gb" role="img" aria-label={`${name}'s share of ${r.name}: ${r.stake.toFixed(2)} percent`}><i style={{ width: `${Math.min(100, Math.max(0, r.stake))}%` }} /></span></div>
        </li>))}</ul>
      {g.rows.length > 6 && <button type="button" className="cb-btn cbr-all" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${g.rows.length} companies`}</button>}
    </section>);
}

/** Key figures fill the row: up to five in one row; more than five in two even rows (7 -> 4 + 3) (item 8b). */
function Figures({ list, docs, chips }: { list: NonNullable<Brief["key_figures"]>; docs: Record<string, Doc>; chips: Chips }) {
  const cols = list.length > 5 ? Math.ceil(list.length / 2) : list.length;
  return (
    <div className="cb-tiles cbr-tiles" style={{ "--cbr-cols": cols } as React.CSSProperties}>
      {list.map((k, i) => <div className="cb-tile" key={i}><span className="cb-tl">{k.label}</span><b className="cb-tv">{k.value}</b>{k.note ? <span className="cb-tn">{k.note}</span> : null}<CiteChips cites={k.cites} docs={docs} chips={chips} /></div>)}
    </div>);
}

/** Task #312 (developer file 20, change 6): the brief in five tabs (The company, Businesses, Plans & catalysts, Recent, Sources & checks), each with its
 *  count; the first tab opens folded (the first sentence, four key figures and "Show the whole brief"), and once opened it stays open on the report. */
export function BriefBody({ r }: { r: Extract<BriefReply, { state: "published" }> }) {
  const b: Brief = r.brief, docs = b.docs ?? {}, chips = r.chips ?? {};
  const cited = citedPages(b);
  const name = shortName(b.name || r.name || r.symbol);
  const ch = r.changes;
  const mix = b.mix;
  const plans = b.plans ?? [], cats = b.catalysts ?? [];
  const tabs = TABS.filter(([k]) => k !== "plans" || plans.length + cats.length > 0).filter(([k]) => k !== "businesses" || b.segments.length > 0);
  const count: Partial<Record<TabKey, number>> = { businesses: b.segments.length, plans: plans.length + cats.length, recent: b.recent.length };
  const [tab, setTab] = useState<TabKey>("company");
  const [open, setOpen] = useState(false);
  const ids = tabs.map(([k]) => `cbr-tab-${k}`);
  const keys = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex(([k]) => k === tab);
    const j = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (j < 0) return;
    e.preventDefault(); setTab(tabs[j][0]); document.getElementById(ids[j])?.focus();
  };
  const nDocs = Object.keys(docs).length;
  const folded = tab === "company" && !open;
  const figures = b.key_figures ?? [];
  return (
    <div className="cbr" data-open={open ? "" : undefined}>
      <div className="cb-head">
        <div>
          <div className="cb-eyebrow">Company brief</div>
          <h2 id="cb-title">About {b.name || r.name}, from its own filings</h2>
          <p className="cbr-checks">{nDocs} {nDocs === 1 ? "filing" : "filings"} read · <span className="cbr-ok">✓</span> {r.checks.passed} of {r.checks.citations} quotes found on their page</p>
        </div>
        <div className="cb-meta">
          <span className="cb-badge cbr-full">Full brief</span>
          {r.publishMode === "auto"
            ? <span className="cb-faint" title="No person has read this brief. A program confirmed that every quoted number and name is on the filing page it cites.">Checked automatically · written {day(r.asOf)}</span>
            : <span className="cb-faint">Reviewed{r.reviewedAt ? ` ${day(r.reviewedAt)}` : ""} · filings to {day(r.asOf)}</span>}
        </div>
      </div>
      {r.stale && <p className="cb-warn" role="status">No newer filing has been read for over four months, so this brief may be behind. Check the dates on each line.</p>}
      {r.waiting && <p className="cb-note-i" role="status">A newer draft is waiting for review. This is the last reviewed version.</p>}

      <div className="cbr-tabs" role="tablist" aria-label="Company brief" onKeyDown={keys}>
        {tabs.map(([k, l], i) => <button key={k} id={ids[i]} type="button" role="tab" aria-selected={tab === k} aria-controls="cbr-panel" tabIndex={tab === k ? 0 : -1} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
          {l}{count[k] ? <span className="cbr-n">{count[k]}</span> : null}</button>)}
      </div>

      <div className="cbr-panel" id="cbr-panel" role="tabpanel" aria-labelledby={ids[tabs.findIndex(([k]) => k === tab)]}>
        {tab === "company" && <>
          <div className="cb-about cbr-about">{(folded ? b.about.slice(0, 1) : b.about).map((a, i) => <p key={i}>{a.text} <CiteChips cites={a.cites} docs={docs} chips={chips} /></p>)}</div>
          {figures.length > 0 && <section aria-label="Key figures" className="cb-sec"><h3>Key figures</h3><Figures list={folded ? figures.slice(0, 4) : figures} docs={docs} chips={chips} /></section>}
          {folded ? (
            <div className="cbr-foldrow"><button type="button" className="cb-btn cbr-fold" aria-expanded={false} onClick={() => setOpen(true)}>Show the whole brief</button>
              <span className="cb-faint">{[b.about.length > 1 && `${b.about.length - 1} more about the company`, figures.length > 4 && `all ${figures.length} key figures`, (mix?.revenue?.rows?.length || mix?.ebitda?.rows?.length) && "where the money comes from", b.group?.rows?.length && "how the group is held"].filter(Boolean).join(", ")}</span></div>
          ) : <>
            {mix && <MixStrips mix={mix} docs={docs} chips={chips} />}
            {!!b.group?.rows?.length && <GroupRows g={b.group} name={name} docs={docs} chips={chips} />}
            <button type="button" className="cb-btn cbr-fold" aria-expanded={true} onClick={() => setOpen(false)}>Show less</button>
          </>}
        </>}
        {tab === "businesses" && <div className="cb-segs">{b.segments.map((sg, i) => (
          <article className="cb-seg" key={i}><h4>{sg.name}</h4><p className="cb-what">{sg.what} <CiteChips cites={sg.what_cites} docs={docs} chips={chips} /></p>
            {!!sg.points?.length && <ul>{sg.points.map((pt, j) => <li key={j}>{pt.text} <CiteChips cites={pt.cites} docs={docs} chips={chips} /></li>)}</ul>}</article>))}</div>}
        {tab === "plans" && <div className="cbr-plans">
          {plans.length > 0 && <section aria-label="What management says it will do"><h3>What management says it will do</h3><ul className="cbr-rows">{plans.map((pl, i) => (
            <li key={i}><span>{pl.text} <CiteChips cites={pl.cites} docs={docs} chips={chips} /></span>{pl.by_when ? <span className="cb-faint">{pl.by_when}</span> : null}</li>))}</ul></section>}
          {cats.length > 0 && <section aria-label="Catalysts on file"><h3>Catalysts on file</h3><ul className="cbr-rows">{cats.map((c, i) => (
            <li key={i}><span><b>{c.type}</b> {c.text} <CiteChips cites={c.cites} docs={docs} chips={chips} /></span>{c.date ? <time className="cb-faint" dateTime={c.date}>{day(c.date)}</time> : null}</li>))}</ul></section>}
        </div>}
        {tab === "recent" && <>
          <p className="cb-note-i" role="status">{ch && ch.parts.length > 0
            ? `Since ${ch.since ? day(ch.since) : "the last brief"}: ${ch.parts.map((x) => PART_NAMES[x] ?? x).join(", ")} rewritten from newer filings.`
            : ch?.since ? `Since ${day(ch.since)}: nothing that changes the brief.` : "First brief for this company."}</p>
          <ol className="cb-time">{b.recent.map((x, i) => (
            <li key={i}><time dateTime={x.date}>{day(x.date)}</time><div><b>{x.title}</b><p>{x.text} <CiteChips cites={x.cites} docs={docs} chips={chips} /></p></div></li>))}</ol>
          <p className="cb-faint"><a href="#news">All filings ↓</a></p>
        </>}
        {tab === "sources" && <>
          <p className="cb-checks"><b>{r.checks.passed} of {r.checks.citations}</b> quoted citations were found on the page they cite{r.checks.date ? ` (checked ${day(r.checks.date)})` : ""}.{r.checks.unchecked ? ` ${r.checks.unchecked} point to FinLit's own data or to a document that could not be read, and were not checked against a page.` : ""}{r.checks.fixed?.length ? ` ${r.checks.fixed.join(" ")}` : ""}</p>
          {r.checks.method ? <p className="cb-faint">{r.checks.method}</p> : null}
          <ul className="cb-src">{cited.map(({ key, doc, pages }) => { const href = citeUrl(doc); return (
            <li key={key}><span className="cb-sk">{chips[key] || key}</span>
              <span className="cb-st">{href ? <a href={href} target="_blank" rel="noopener noreferrer">{doc.title}</a> : doc.title}<span className="cb-faint"> · {doc.kind}{doc.date ? ` · ${day(doc.date)}` : ""}</span></span>
              {pages.length > 0 && <span className="cb-sp">Pages cited: {pages.map((pg, i) => { const h = citeUrl(doc, pg); return <span key={pg}>{i ? ", " : ""}{h ? <a href={h} target="_blank" rel="noopener noreferrer">{pg}</a> : pg}</span>; })}</span>}</li>); })}</ul>
          <section aria-label="What is not covered" className="cb-sec"><h3>What is not covered</h3>
            {b.gaps?.length ? <ul className="cb-gaps">{b.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul> : <p className="cb-faint">The writer listed nothing as missing.</p>}</section>
        </>}
      </div>

      <p className="cb-disc">{r.disclaimer || b.disclaimer}</p>
      <p className="cb-disc">{r.compliance || COMPLIANCE}</p>
    </div>
  );
}

export function CompanyBriefSection({ symbol }: { symbol: string }) {
  const q = useCompanyBrief(symbol);
  return (
    <section className="block cb" id="company-brief" aria-labelledby="cb-title" aria-busy={q.isLoading}>
      {q.isLoading && <div className="cb-skel" role="status" aria-label="Loading the company brief"><i /><i /><i /><i /></div>}
      {q.isError && (
        <div className="cb-empty" role="status">
          <div className="cb-eyebrow">Company brief</div><h2 id="cb-title">About this company, from its own filings</h2>
          <p>The company brief could not be loaded just now. Try again in a moment.</p>
          <button type="button" className="cb-btn" onClick={() => q.refetch()}>Try again</button>
        </div>
      )}
      {q.data?.state === "empty" && (
        <div className="cb-empty">
          <div className="cb-eyebrow">Company brief</div><h2 id="cb-title">About this company, from its own filings</h2>
          <p>{q.data.reason}</p>
        </div>
      )}
      {q.data?.state === "published" && <BriefBody r={q.data} />}
    </section>
  );
}
