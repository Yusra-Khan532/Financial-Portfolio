// The category chooser of /funds: the fund-type tabs and the sub-category tick boxes with "Select All", and (task #344) the six frequently visited
// categories as one row of names with an (i) that shows what each is. State lives in the address.
import { useEffect, useRef, useState } from "react";
import { Icon } from "../lib/icons";
import { useUI } from "../lib/ui";
import { useCategoryScores } from "../lib/mfScore";
import { cardScoreView, type CardScoreView } from "../lib/mfScoreDash";
import { bandInk } from "../lib/scoreBands";
import { toggleAll, toggleCat, type ListQuery, type SubCat } from "../lib/mf";
import { CARDS, ELSS_FOOTNOTE, TABS, type Card, type TabKey } from "../lib/mfCategories";

/** Mutual Fund Score strip of a card (task #130): the median of the category's scored Direct-plan funds, the bar of its three bands named in words
 *  ("Healthy or strong 3% · Average 66% · Weak or poor 31%", never by colour), and a button that opens the list below on that category, by Mutual Fund Score. */
function ScoreStrip({ v, card, onScore }: { v: CardScoreView; card: Card; onScore: (c: Card) => void }) {
  if (v.kind === "locked") return <div className="mf-qscore"><span className="mf-qs-lock"><Icon name="lock" /><span>Mutual Fund Score: part of the Gold plan</span></span></div>;
  if (v.kind === "loading") return <div className="mf-qscore" aria-busy="true"><span className="skeleton" style={{ height: 40 }} /></div>;
  if (v.kind === "unavailable") return <div className="mf-qscore"><span>Mutual Fund Score is not available right now.</span></div>;
  if (v.kind === "notRun") return <div className="mf-qscore"><span><b>Mutual Fund Score:</b> Not scored yet</span></div>;
  if (v.kind === "none") return <div className="mf-qscore"><span><b>Mutual Fund Score:</b> no Direct-plan fund of this category is scored yet</span><button type="button" className="mf-qs-go" onClick={() => onScore(card)}>See the funds →</button></div>;
  const { green, orange, red } = v.shares;
  return (
    <div className="mf-qscore" role="group" aria-label={v.label}>
      <div className="mf-qs-h"><b className="mf-qs-n" style={{ color: bandInk(v.band) }}>{v.median}</b><span className="mf-qs-t">median Mutual Fund Score</span></div>
      <div className="mf-qdist" aria-hidden="true">{green > 0 && <i className="g" style={{ flex: green }} />}{orange > 0 && <i className="o" style={{ flex: orange }} />}{red > 0 && <i className="r" style={{ flex: red }} />}</div>
      <div className="mf-qdist-l" aria-hidden="true"><span className="g">Healthy or strong {green}%</span><span className="o">Average {orange}%</span><span className="r">Weak or poor {red}%</span></div>
      <button type="button" className="mf-qs-go" onClick={() => onScore(card)}>See these {v.n.toLocaleString("en-IN")} funds by Mutual Fund Score →</button>
    </div>
  );
}

function SelectAll({ all, some, n, picked, onChange }: { all: boolean; some: boolean; n: number; picked: number; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = some && !all; }, [some, all]);
  return <div className="mf-allrow"><label className="mf-check mf-all"><input ref={ref} type="checkbox" checked={all} onChange={onChange} /> <span>Select All ({n})</span></label>
    <span className="mf-alln" aria-live="polite">{picked} of {n} selected</span></div>;
}

/** Task #340: the category is the one shown on its own; pressing it again clears the choice. */
export const cardOn = (q: ListQuery, c: Card) => q.tab === c.tab && q.cats?.length === 1 && q.cats[0] === c.key;

/** Task #344 (23 Nov 2026, the team: "remove this section from mutual funds and add it to [the category box] as frequently visited funds and just
 *  name those and give a i button to show what are those funds"): the six cards of "Six categories most people start with" became one row of names
 *  at the top of the category box. A name works as its card did (shows that category on its own; pressed again, every category of its tab: task #340).
 *  The (i) opens what the cards said: each category's two lines, its Mutual Fund Score strip with "See these N funds by Mutual Fund Score" (Gold),
 *  and the ELSS tax footnote. Nothing the cards had is lost. */
export function FrequentFunds({ q, onPick, onScore }: { q: ListQuery; onPick: (c: Card) => void; onScore: (c: Card) => void }) {
  const { has } = useUI();
  const canSee = has("gold");
  const sc = useCategoryScores(canSee);
  const [info, setInfo] = useState(false);
  return (
    <div className="mf-freq">
      <div className="mf-freq-row" role="group" aria-labelledby="mf-freq-k">
        <span className="mf-freq-k" id="mf-freq-k">Frequently visited funds</span>
        {CARDS.map((c) => { const on = cardOn(q, c); return (
          <button key={c.key} type="button" className="mf-freq-b" aria-pressed={on} onClick={() => onPick(c)}
            title={on ? `Showing ${c.title} only. Press again to show every category.` : `${c.lines[0]} ${c.lines[1]}`}>{c.title}</button>); })}
        <button type="button" className="mf-freq-i" aria-expanded={info} aria-controls="mf-freq-info" aria-label="What these funds are" title="What these funds are" onClick={() => setInfo((v) => !v)}><Icon name="info" /></button>
      </div>
      {info && (
        <div className="mf-freq-info" id="mf-freq-info" role="region" aria-label="What these funds are">
          <ul>{CARDS.map((c) => (
            <li key={c.key}><b>{c.title}</b><span>{c.lines[0]} {c.lines[1]}{c.note && <sup aria-describedby="mf-elss-note">*</sup>}</span>
              <ScoreStrip v={cardScoreView(c.key, sc.data, { canSee, loading: sc.isLoading, failed: sc.isError })} card={c} onScore={onScore} /></li>))}</ul>
          <p className="faint" id="mf-elss-note">{ELSS_FOOTNOTE}</p>
        </div>)}
    </div>
  );
}

/** Equity | Hybrid | Debt | Solution Oriented | Others (and All funds), and under the chosen tab its sub-categories with how many schemes each shows. */
/** Task #427: where the open or closed "Fund type" drop-down is remembered (this browser only). */
export const TYPES_KEY = "finlit-mf-types";
export function CategoryPicker({ q, subs, loading, onTab, onCats, frequent, side = false }: {
  q: ListQuery; subs: SubCat[]; loading: boolean; onTab: (t: TabKey | "all") => void; onCats: (c: string[] | null) => void;
  /** task #344: the frequently visited categories at the top of the box */ frequent?: { onPick: (c: Card) => void; onScore: (c: Card) => void };
  /** task #347: inside the filter panel beside the table: the fund types as sections that open (the open one is the type shown) */ side?: boolean;
}) {
  const tabs: { key: TabKey | "all"; label: string }[] = [...TABS, { key: "all", label: "All funds" }];
  const keys = subs.map((s) => s.key);
  /** Task #362 (Chinmay, 24 Nov 2026): which box of the filter panel is open, apart from which type the list shows. Every box starts closed; opening one
   *  closes the one that was open, and its own header closes it again. The type in use keeps its tick (and "N of M selected") while folded. */
  const [exp, setExp] = useState<string | null>(null);
  /** Task #427 (team, 27 Nov 2026: "give a drop down for this"): the six fund-type boxes sit inside one "Fund type" drop-down, closed at first (the
   *  choice is remembered in this browser). Its header always names the type the list shows, so the panel says what is chosen while it is folded. */
  const [types, setTypes] = useState<boolean>(() => { try { return localStorage.getItem(TYPES_KEY) === "open"; } catch { return false; } });
  const flipTypes = () => setTypes((o) => { try { localStorage.setItem(TYPES_KEY, o ? "closed" : "open"); } catch { /* private mode: not remembered */ } return !o; });
  const on = (k: string) => q.cats === null || q.cats.includes(k);
  const onTabKey = (e: React.KeyboardEvent, i: number) => {   // arrow keys move between the tabs, as a tab list should
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = tabs[(i + d + tabs.length) % tabs.length].key;
    onTab(next);
    requestAnimationFrame(() => document.getElementById(`mf-tab-${next}`)?.focus());
  };
  const picked = q.cats === null ? subs.length : subs.filter((s) => q.cats!.includes(s.key)).length;
  const body = q.tab === "all" ? <p className="muted mf-fine">Every category: search and filter all mutual fund schemes AMFI lists.</p>
    : loading && !subs.length ? <div className="skeleton" style={{ height: 96 }} aria-busy="true" />
      : !subs.length ? <p className="muted mf-fine">No schemes in this group for the plan and option chosen below.</p> : (
        <fieldset>
          <legend className="sr-only">Sub-categories to show</legend>
          <SelectAll all={q.cats === null} some={!!q.cats?.length} n={subs.length} picked={picked} onChange={() => onCats(toggleAll(q.cats))} />
          <div className="mf-subgrid">
            {subs.map((s) => (
              <label key={s.key} className="mf-check" title={s.names.join(" · ")}>
                <input type="checkbox" checked={on(s.key)} onChange={() => onCats(toggleCat(q.cats, s.key, keys))} />
                <span>{s.label}</span><small>{s.count.toLocaleString("en-IN")}</small>
              </label>))}
          </div>
        </fieldset>);
  if (side) return (
    /* Task #347 (23 Nov 2026, the team's picture): in the filter panel the fund types are sections; the open one (its box ticked, all or some of its
       categories as "N of M selected") is the type the list shows, with its categories under it. Opening another switches to it, as the tabs did. */
    <section className="mf-catpick mf-catside" aria-label="Choose categories">
      {frequent && <FrequentFunds q={q} onPick={frequent.onPick} onScore={frequent.onScore} />}
      <div className={"mf-typedd" + (types ? " open" : "")}>
      <span className="label mf-typedd-k" id="mf-typedd-k">Fund type</span>
      <button type="button" className="mf-typedd-h" aria-expanded={types} aria-controls="mf-typedd-b" aria-labelledby="mf-typedd-k mf-typedd-v" onClick={flipTypes}>
        <span id="mf-typedd-v" className="mf-typedd-v">{tabs.find((t) => t.key === q.tab)?.label ?? "All funds"}{q.tab !== "all" && subs.length > 0 && <small> · {picked} of {subs.length} selected</small>}</span>
        <span className="mf-acc-car" aria-hidden="true">{types ? "▴" : "▾"}</span>
      </button>
      {types && <div className="mf-typedd-b" id="mf-typedd-b" role="group" aria-labelledby="mf-typedd-k">
      {tabs.map((t) => { const used = q.tab === t.key, open = used && exp === t.key, all = used && (t.key === "all" || q.cats === null), some = used && !all && picked > 0; return (
        <div key={t.key} className={"mf-acc" + (used ? " on" : "") + (open ? " open" : "")}>
          <button type="button" className="mf-acc-h" id={`mf-acc-${t.key}`} aria-expanded={open} aria-controls={`mf-acc-b-${t.key}`}
            onClick={() => { if (open) { setExp(null); return; } if (!used) onTab(t.key); setExp(t.key); }}>
            <span className={"mf-acc-box" + (all ? " all" : some ? " some" : "")} aria-hidden="true">{all ? "✓" : some ? "–" : ""}</span>
            <span className="mf-acc-t">{t.label}</span>
            {used && t.key !== "all" && subs.length > 0 && <small>{picked} of {subs.length} selected</small>}
            <span className="mf-acc-car" aria-hidden="true">{open ? "▴" : "▾"}</span>
          </button>
          {open && <div className="mf-acc-b" id={`mf-acc-b-${t.key}`} role="region" aria-labelledby={`mf-acc-${t.key}`}>{body}</div>}
        </div>); })}
      </div>}
      </div>
    </section>
  );
  return (
    <section className="card mf-catpick" aria-label="Choose categories">
      {frequent && <FrequentFunds q={q} onPick={frequent.onPick} onScore={frequent.onScore} />}
      <div className="mf-tabs" role="tablist" aria-label="Type of fund">
        {tabs.map((t, i) => (
          <button key={t.key} id={`mf-tab-${t.key}`} type="button" role="tab" aria-selected={q.tab === t.key} aria-controls="mf-subcats" tabIndex={q.tab === t.key ? 0 : -1}
            onClick={() => onTab(t.key)} onKeyDown={(e) => onTabKey(e, i)}>{t.label}</button>))}
      </div>
      <div id="mf-subcats" role="tabpanel" aria-labelledby={`mf-tab-${q.tab}`} className="mf-subcats">
        {body}
      </div>
    </section>
  );
}
