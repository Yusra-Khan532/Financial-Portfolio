// Section 18 "News and filings" (task #222, 19 Nov pack S1): what was the third tab of 17 ("Exchange announcements", the latest 6) grown into its own
// section: every NSE filing in the feed, "In simple words", the latest filing in each group, group chips with counts, the list under month headings
// (8 rows first, then "Show all"), and routine filings hidden until asked for (dashed). Rules and words: lib/filings.ts. Basic, as the tab was.
// The section head is #news; the filings card keeps #announcements so old links still land. Every word describes; nothing advises.
import { useMemo, useRef, useState } from "react";
import type { Events } from "../lib/api";
import { Icon } from "../lib/icons";
import { Plain } from "../components/Plain";
import { ChartHelp } from "../components/ChartHelp";
import { SectionHead } from "./Sections";
import { FilingScores } from "./FilingScores";
import "../styles/news-filings.css";
import { SentimentChip } from "../components/SentimentChip";
import { meanSentiment, useSymbolSentiment } from "../lib/sentiment";
import { GROUP, GROUPS, dayNum, filingsPlain, highlights, monShort, monthHead, sortFilings, type Filing, type GroupKey } from "../lib/filings";

const FIRST = 6;   // task #328 (developer file 27, change 7): six shown first (was eight)
const safe = (link: string | null) => (link && /^https?:\/\//.test(link) ? link : null);
const shortName = (n: string) => n.replace(/\s+(Ltd\.?|Limited)$/i, "").trim();

export function NewsSection({ e, name, symbol }: { e?: Events; name: string; /** task #266: the three filings scored */ symbol?: string }) {
  const [g, setG] = useState<GroupKey | "all">("all");
  const [all, setAll] = useState(false);
  const [routine, setRoutine] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set());   // the filings whose whole text is open
  const card = useRef<HTMLDivElement>(null);
  const sentOf = useSymbolSentiment(symbol);   // task #365: each filing's sentiment score, matched by its link, else its date and title
  const fs = useMemo(() => sortFilings(e?.announcements ?? []), [e]);
  if (!e) return null;
  const live = fs.filter((f) => !f.routine), nRoutine = fs.length - live.length;
  const counts = Object.fromEntries(GROUPS.map((x) => [x.key, live.filter((f) => f.group === x.key).length])) as Record<GroupKey, number>;
  // task #328 (developer file 27, change 7): one line a filing, six first; "Show all" opens the rest (rendered, marked nf-hid) inside a box that scrolls at 560 px
  const listed = (f: Filing) => (f.routine ? routine && (g === "all" || f.group === g) : g !== "all" ? f.group === g : true);
  const later = (f: Filing) => g === "all" && !f.routine && f.i >= FIRST;   // past the first six of the whole list
  const shown = (f: Filing) => listed(f) && (all || !later(f));
  const rowsAll = fs.filter(listed), rows = rowsAll.filter(shown);
  const months = [...new Set(rowsAll.map((f) => f.date.slice(0, 7)))];
  const keyOf = (f: Filing) => f.date + (f.time || "") + f.description.slice(0, 40);
  const flip = (k: string) => setOpen((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const plain = filingsPlain(shortName(name), fs, e.actions);
  const tiles = highlights(fs, e.actions);
  const nInView = rows.length;   // as the pack: the filings on screen now ("8 filings" before Show all, "9" for Shares & fund raising)
  const toggleAll = () => {
    const on = !all; setAll(on);
    if (!on && card.current && card.current.getBoundingClientRect().top < 0) card.current.scrollIntoView({ block: "start" });   // collapsing from below: back to the card
  };
  return (
    <section className="block nf-block" style={{ "--sc": "var(--k1)" } as React.CSSProperties}>
      <SectionHead id="news" no="News and filings" icon="notes" tier="basic" title="What the company has told the exchange" sub="Filings to NSE, newest first. Each one opens the company's own document on the NSE website." color="--k1" />
      {plain && <Plain>{plain}</Plain>}
      {tiles.length > 0 && <>
        <p className="nf-cap label">Latest in each group</p>
        <div className="nf-hl">{tiles.map((h) => {
          const link = safe(h.filing.link), Tag = link ? "a" : "div";
          return <Tag key={h.group + h.filing.date + h.filing.i} className="nf-h" style={{ "--gc": GROUP[h.group].colour } as React.CSSProperties} {...(link ? { href: link, target: "_blank", rel: "noopener noreferrer" } : {})}>
            <span className="nf-hk">{GROUP[h.group].label}</span><b>{h.title}</b><SentimentChip s={sentOf(h.filing)} /><span className="nf-hd">{dayNum(h.filing.date)} {monShort(h.filing.date)} {h.filing.date.slice(0, 4)}{link ? <> · PDF <i aria-hidden="true">↗</i></> : null}</span></Tag>;
        })}</div>
      </>}
      <div className={"card acc nf-card" + (routine ? " rt" : "") + (all ? " all" : "")} id="announcements" ref={card} style={{ "--ac": "var(--k1)" } as React.CSSProperties}>
        <div className="card-h"><h3><span className="ci"><Icon name="notes" /></span>All filings<ChartHelp id="news-filings" label="About these filings" /></h3>
          <span className="s nf-s"><span className="nf-n">{g === "all" && nInView < live.length ? `${nInView} of ${live.length} filings shown` : `${nInView} filing${nInView === 1 ? "" : "s"}`}</span>{nRoutine > 0 && <> · <button type="button" className="nf-rtb" aria-pressed={routine} onClick={() => setRoutine(!routine)}>{routine ? "Hide routine filings" : `Show ${nRoutine} routine filing${nRoutine === 1 ? "" : "s"}`}</button></>}</span></div>
        {live.length > 0 && <div className="fchips nf-f" role="group" aria-label="Show filings by group">
          <button type="button" className={"chip-b" + (g === "all" ? " on" : "")} aria-pressed={g === "all"} onClick={() => setG("all")}>All <span>{live.length}</span><SentimentChip s={meanSentiment(live.map(sentOf))} word={false} avg /></button>
          {GROUPS.filter((x) => counts[x.key] > 0).map((x) => <button key={x.key} type="button" className={"chip-b" + (g === x.key ? " on" : "")} aria-pressed={g === x.key} style={{ "--gc": x.colour } as React.CSSProperties} onClick={() => setG(x.key)}><i aria-hidden="true" />{x.label} <span>{counts[x.key]}</span><SentimentChip s={meanSentiment(live.filter((f) => f.group === x.key).map(sentOf))} word={false} avg /></button>)}
        </div>}
        <div className="nf-list">
          {months.map((m) => { const inMonth = rowsAll.filter((f) => f.date.startsWith(m)), hidMonth = inMonth.every((f) => later(f));
            return <div key={m} className={hidMonth ? "nf-mo nf-hid" : "nf-mo"}><h4 className="nf-m">{monthHead(m)}</h4><ol className="nf-l">{inMonth.map((f) => {
            const link = safe(f.link), Tag = link ? "a" : "div", k = keyOf(f), isOpen = open.has(k);
            return <li key={k} className={"nf-r" + (f.routine ? " nf-rt" : "") + (later(f) ? " nf-hid" : "") + (isOpen ? " open" : "")}>
              <span className="nf-d"><b>{dayNum(f.date)}</b>{monShort(f.date)}{f.time && <small>{f.time}</small>}</span>
              <Tag className="nf-b" style={{ "--gc": GROUP[f.group].colour } as React.CSSProperties} {...(link ? { href: link, target: "_blank", rel: "noopener noreferrer" } : {})}>
                <span className="nf-c" title={GROUP[f.group].label}><span className="nf-cl">{GROUP[f.group].short ?? GROUP[f.group].label}</span></span><span className="nf-t">{f.title}</span><SentimentChip s={sentOf(f)} /><span className="nf-k">NSE category: {f.category}</span>{link && <span className="nf-go" aria-hidden="true">PDF ↗</span>}
              </Tag>
              <button type="button" className="nf-exp" aria-expanded={isOpen} aria-label={isOpen ? "Show one line" : "Show the whole text"} onClick={() => flip(k)}>▾</button></li>;
          })}</ol></div>; })}
          {!fs.length && <p className="muted">No filings in the feed for this company yet.</p>}
        </div>
        {g === "all" && live.length > FIRST && <button type="button" className="nf-all" aria-expanded={all} onClick={toggleAll}>{all ? "Show fewer" : `Show all ${live.length}`}</button>}
        <p className="faint nf-foot">Source: NSE corporate announcements, as filed by the company. FinLit sorts them into groups; the exchange's own category is under each title. Times are IST.</p>
      </div>
      {symbol && <FilingScores symbol={symbol} name={shortName(name)} />}
    </section>
  );
}
