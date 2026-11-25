// Task #272 (Watchlists and Alerts, 20 Nov pack): "What changed at these companies". One shared block for every list page: the Watchlists page mounts it
// under the list (before "Price and business disagree"); the equity portfolio (task #274) and the other portfolio pages mount the same component with
// their own companies, list switcher and page key. Data and rules: lib/whatChanged.ts. Styles: styles/what-changed.css (wc-). Describes, never advises.
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Icon } from "../../lib/icons";
import {
  DISCOVER_CHANGES, KINDS, KIND, chipFor, dayMonth, discoverLink, footnote, headline, newCount, orderWinNotice, rowsOf, tileCounts, useChanges, useLastVisit, type ChangeRow,
} from "../../lib/whatChanged";
import { AlertMeForm } from "./AlertMe";
import { SentimentChip } from "../SentimentChip";
import "../../styles/what-changed.css";

const FIRST = 6;
const NEW_TAB = { target: "_blank", rel: "noopener noreferrer" } as const;

/** The block's data for a page: the rows, the last visit, what is new. Pages call it too (for the chip and the order-win notice): one request either way. */
export function useWhatChanged(symbols: string[], page: string) {
  const q = useChanges(symbols);
  const lastVisit = useLastVisit(page);
  const rows = useMemo(() => rowsOf(q.data, lastVisit), [q.data, lastVisit]);
  return { q, rows, lastVisit, newN: newCount(rows), chip: (s: string) => chipFor(rows, s), notice: orderWinNotice(rows) };
}

export type ListTab = { id: string; label: string; count: number };

/** A small chip under a company with a filing since the last visit (an order win first); it opens the same Discover link. Rows keep their height. */
export function FilingChip({ row }: { row: ChangeRow | null }) {
  if (!row) return null;
  return <Link className={"wc-chip " + (KIND[row.k]?.tone ?? "")} to={discoverLink(row.k, row.n)} title={row.t ?? undefined}>{KIND[row.k]?.row ?? "Filing"} · {dayMonth(row.d)}</Link>;
}

/** The green notice over the list for an order win since the last visit, with Details in Discover and ×. Closing it hides that filing for good. */
export function OrderWinNotice({ row, page }: { row: ChangeRow | null; page: string }) {
  const key = row ? `finlit-wc-ow-${page}-${row.s}-${row.d}` : "";
  const [gone, setGone] = useState(() => { try { return !!key && localStorage.getItem(key) === "1"; } catch { return false; } });
  if (!row || gone) return null;
  const close = () => { try { localStorage.setItem(key, "1"); } catch { /* private window: closes for this visit */ } setGone(true); };
  return (
    <div className="wc-ow" role="status">
      <span className="wc-owd" aria-hidden="true" />
      <p><b>New order win · {row.n}</b>{row.t ? <> · {row.t}</> : null} <span>({dayMonth(row.d)})</span></p>
      <Link to={discoverLink(row.k, row.n)}>Details in Discover ↗</Link>
      <button type="button" onClick={close} aria-label="Close this notice">×</button>
    </div>
  );
}

export function WhatChanged({ symbols, listName, listRef, page, lists, activeList, onPickList, nameOf, title = "What changed at these companies", sub, lede, foot, countLabel, alertLabel, className = "wp-sec wc", hId = "wc-h", id = "what-changed", newTab = false, plain = false, help, shortName }: {
  /** task #385 (Equity portfolio, developer file 33): tiles count updates ("1 update", "4 updates") with a line on what an update is; rows say "· 10 filings";
   *  the "Not in Discover yet" list starts closed. Other pages keep their block as it was. */ plain?: boolean;
  /** task #385: the i beside the heading (its own text) */ help?: ReactNode; /** task #385: the short company name for a row */ shortName?: (symbol: string, name: string) => string;
  symbols: string[]; listName: string; listRef: string; page: string; lists?: ListTab[]; activeList?: string; onPickList?: (id: string) => void;
  nameOf?: (s: string) => string | undefined; title?: string;
  /** task #276 (the portfolio pages): a line under each company, e.g. "0.36% of your ETFs · SMALL250"; task #277: how it is held ("D F E 2.36% of everything") */
  sub?: (s: string) => ReactNode;
  /** the line under the title, in place of the count headline */ lede?: string; /** what the foot line starts with, before the filings line */ foot?: string;
  /** the label of the count, e.g. "Inside your ETFs" (default: the list's name) */ countLabel?: string; /** the list as the Alert me form names it */ alertLabel?: string;
  className?: string; hId?: string; id?: string;
  /** task #277 (QA of 21 Nov, item 12): the Discover links say ↗, so on All my investments they open in a new tab */ newTab?: boolean;
}) {
  const { q, rows, lastVisit, newN } = useWhatChanged(symbols, page);
  const [kind, setKind] = useState<string | null>(null), [all, setAll] = useState(false), [alertOpen, setAlertOpen] = useState(false);
  const tiles = tileCounts(rows);
  const shown = kind ? rows.filter((r) => r.k === kind) : rows;
  const list = all ? shown : shown.slice(0, FIRST);
  const visit = dayMonth(lastVisit);
  return (
    <section className={className} id={id} aria-labelledby={hId}>
      <h2 id={hId}>{title}{help}</h2>
      <p className="wp-sub">{lede ?? headline(q.data, symbols.length, listName)}</p>
      {alertOpen && <AlertMeForm listRef={listRef} listLabel={alertLabel ?? listName} onClose={() => setAlertOpen(false)} />}
      <div className="wc-bar">
        {lists && lists.length > 1 && onPickList
          ? <div className="wc-lists" role="group" aria-label="Which list">{lists.map((l) => <button key={l.id} type="button" className="wp-pill" aria-label={`What changed at the companies on ${l.label} (${l.count})`} aria-pressed={l.id === activeList} onClick={() => { onPickList(l.id); setKind(null); setAll(false); }}>{l.label} · {l.count}</button>)}</div>
          : <b className="wc-ln">{countLabel ?? listName} · {symbols.length} compan{symbols.length === 1 ? "y" : "ies"}</b>}
        <span className="wc-st">{newN > 0 ? <><i className="wc-nd" aria-hidden="true" /><b>{newN} new</b> since your last visit on {visit}</> : lastVisit ? `Nothing new since your last visit on ${visit}` : "What is new shows from your next visit"}</span>
        <span className="wc-grow" />
        <Link className="wc-dl" to={DISCOVER_CHANGES} {...(newTab ? NEW_TAB : {})}>What changed in Discover ↗</Link>
        <button type="button" className="wc-am-btn" aria-expanded={alertOpen} onClick={() => setAlertOpen((v) => !v)}><Icon name="bell" />Alert me</button>
      </div>
      <div className="wc-tiles" role="group" aria-label="Filter by kind of filing">
        {KINDS.map((k) => (
          <button key={k.k} type="button" className={"wc-tile " + k.tone} aria-pressed={kind === k.k} onClick={() => { setKind(kind === k.k ? null : k.k); setAll(false); }}>
            <span><i className={"wc-dot " + k.tone} aria-hidden="true" />{k.tile}</span><b>{tiles[k.k]}{plain && <small className="wc-unit">{tiles[k.k] === 1 ? "update" : "updates"}</small>}</b>
          </button>))}
      </div>
      {plain && <p className="wc-upn">An update is one kind of news from one company. Some bundle several filings; the row then says how many.</p>}
      {q.isLoading && symbols.length > 0 ? <div className="skeleton" style={{ height: 160 }} aria-busy="true" aria-label="Loading what changed" />
        : q.isError ? <p className="wp-empty">What changed could not be loaded just now. Your list is safe; try again in a minute. <button type="button" className="wc-lnk" onClick={() => q.refetch()}>Try again</button></p>
        : !symbols.length ? <p className="wp-empty">Add companies to this list to see what they filed.</p>
        : !shown.length ? <p className="wp-empty">{kind ? `No company on this list filed ${KIND[kind].tile.toLowerCase()} in the last ${q.data?.days ?? 90} days.` : `None of the companies on this list filed one of these in the last ${q.data?.days ?? 90} days.`}</p>
        : <ul className="wc-rows" aria-label="Filings by company and kind">
            {list.map((r) => (
              <li key={r.s + r.k} className={r.fresh ? "is-new" : r.k === "order" ? "is-ow" : ""}>
                <span className="wc-d">{r.t ? dayMonth(r.d) : "—"}</span>
                {sub ? <span className="wc-cow"><Link className="wc-co" to={`/stocks/${encodeURIComponent(r.s)}`}>{shortName ? shortName(r.s, r.n) : r.n}</Link>{sub(r.s) && <small className="wc-cs">{sub(r.s)}</small>}</span>
                  : <Link className="wc-co" to={`/stocks/${r.s}`}>{shortName ? shortName(r.s, r.n) : r.n}</Link>}
                <span className="wc-k"><i className={"wc-dot " + KIND[r.k].tone} aria-hidden="true" />{KIND[r.k].row}{r.count > 1 && <small>{plain ? ` · ${r.count} filings` : ` × ${r.count}`}</small>}</span>
                <span className="wc-t"><span className="wc-tt">{r.t ?? `${r.count} ${r.count === 1 ? KIND[r.k].one : KIND[r.k].many} in ${q.data?.days ?? 90} days · the subjects are in Discover`}{r.fresh > 0 && <em className="wc-new">New</em>}</span>{r.t && <SentimentChip s={r.snt} />}</span>
                <span className="wc-ln2">
                  {r.t && r.l && <a href={r.l} target="_blank" rel="noopener noreferrer">Filing ↗</a>}
                  <Link to={discoverLink(r.k, r.n)} {...(newTab ? NEW_TAB : {})}>Details in Discover ↗</Link>
                </span>
              </li>))}
          </ul>}
      {shown.length > FIRST && <button type="button" className="wc-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>{all ? "Show fewer ▴" : `Show all ${shown.length} ▾`}</button>}
      {plain && (q.data?.notPlaced ?? []).length > 0 && <details className="wc-np"><summary>Not in Discover yet · {q.data!.notPlaced.length} <span aria-hidden="true">▸</span></summary>
        <p className="wc-note">{q.data!.notPlaced.map((x) => (shortName ? shortName(x.s, nameOf?.(x.s) || x.n) : nameOf?.(x.s) || x.n)).join(", ")}. A company is placed once Discover reads its filings.</p></details>}
      <p className="wc-note">{foot ? `${foot} ` : ""}{plain ? footnote({ ...(q.data ?? { days: 90, events: [], companies: [] }), notPlaced: [] }, () => undefined) : footnote(q.data, nameOf ?? (() => undefined))}</p>
    </section>
  );
}
