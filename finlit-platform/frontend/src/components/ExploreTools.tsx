import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { Icon } from "../lib/icons";
import { OPEN_AI } from "./Assistant";
import { BUCKETS, type BucketId, type PlatformCard } from "../lib/platformTools";
import "../styles/explore-tools.css";

const pad = (n: number) => String(n).padStart(2, "0");
const TOTAL = BUCKETS.reduce((n, b) => n + b.cards.length, 0);
/** Fired by the hero button, so "Explore the platform" opens the groups even when the address already ends in #platform. */
export const OPEN_EXPLORE = "finlit:open-explore";
const BADGE_LABEL = { FREE: "Free", SILVER: "Silver", GOLD: "Gold" } as const;

function Card({ c }: { c: PlatformCard }) {
  const bot = c.id === "finlit-bot";          // the assistant opens its panel; every other card opens a page
  const open = `Open ${c.title}`;
  return (
    <li className="xt-card" data-tool={c.id}>
      <div className="xt-shot"><img src={`${import.meta.env.BASE_URL}landing/tools/${c.image}.webp`} width={1200} height={750} loading="lazy" decoding="async" alt="" /></div>
      <div className="xt-body">
        <div className="xt-top"><h4>{c.title}</h4><span className={`xt-badge xt-${c.badge.toLowerCase()}`}>{BADGE_LABEL[c.badge]}<span className="sr-only"> plan</span></span></div>
        <p className="xt-what">{c.what}</p>
        <ul className="xt-pts">{c.points.map((p) => <li key={p}><Icon name="check" />{p}</li>)}</ul>
        {bot ? <button type="button" className="xt-open" onClick={() => dispatchEvent(new Event(OPEN_AI))} aria-haspopup="dialog">{open} <Icon name="arrow" /></button>
          : <Link className="xt-open" to={c.link}>{open} <Icon name="arrow" /></Link>}
      </div>
    </li>
  );
}

/** "Explore the platform": a heading, the six group chips and one button. The button opens the groups inline (closed to begin with); inside, six tabs each show their
 *  tool cards. Every card is in the page whether or not it is open, so a reader without script still finds them (the panel is only hidden with CSS). */
export function ExploreTools() {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<BucketId>(BUCKETS[0].id);
  const panel = useId(), tabs = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    const on = () => setOpen(true), hash = () => { if (location.hash === "#platform") setOpen(true); };
    hash(); addEventListener(OPEN_EXPLORE, on); addEventListener("hashchange", hash);
    return () => { removeEventListener(OPEN_EXPLORE, on); removeEventListener("hashchange", hash); };
  }, []);
  const show = (id: BucketId) => { setSel(id); setOpen(true); };
  const move = (e: React.KeyboardEvent, i: number) => {
    const to = e.key === "ArrowRight" ? (i + 1) % BUCKETS.length : e.key === "ArrowLeft" ? (i + BUCKETS.length - 1) % BUCKETS.length : e.key === "Home" ? 0 : e.key === "End" ? BUCKETS.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault(); setSel(BUCKETS[to].id); tabs.current[BUCKETS[to].id]?.focus();
  };
  return (
    <section className="sec hh-sec xt" id="platform" aria-labelledby="xt-title"><div className="wrap">
      <div className="xt-head">
        <div className="hh-kicker">The platform</div>
        <h2 id="xt-title">Everything you need. Nothing you don't.</h2>
        <p>{TOTAL} tools in six groups, from finding a stock to valuing it, tracking it and following its sector.</p>
        <div className="xt-chips" aria-label="The six groups">
          {BUCKETS.map((b) => <button key={b.id} type="button" className="xt-chip" onClick={() => show(b.id)}>{b.name}<span aria-hidden="true"> · {b.cards.length}</span><span className="sr-only"> ({b.cards.length} tools)</span></button>)}
        </div>
        <button type="button" className="btn primary lg xt-go" aria-expanded={open} aria-controls={panel} onClick={() => setOpen((o) => !o)}>{open ? "Hide the platform tools" : "Explore the platform"} <Icon name="arrow" /></button>
      </div>
      <div id={panel} className="xt-panel" hidden={!open}>
        <div className="xt-tabs" role="tablist" aria-label="Tool groups">
          {BUCKETS.map((b, i) => (
            <button key={b.id} ref={(el) => { tabs.current[b.id] = el; }} type="button" role="tab" id={`xt-tab-${b.id}`} aria-selected={sel === b.id} aria-controls={`xt-pane-${b.id}`} tabIndex={sel === b.id ? 0 : -1}
              className="xt-tab" onClick={() => setSel(b.id)} onKeyDown={(e) => move(e, i)}><span>{b.name}</span><em>{pad(b.cards.length)}</em></button>
          ))}
        </div>
        {BUCKETS.map((b) => (
          <div key={b.id} role="tabpanel" id={`xt-pane-${b.id}`} aria-labelledby={`xt-tab-${b.id}`} hidden={sel !== b.id} className="xt-pane">
            <div className="xt-ghead"><div><h3>{b.name}</h3><p>{b.line}</p></div><span>{b.cards.length} tools</span></div>
            <ul className="xt-grid">{b.cards.map((c) => <Card key={c.id} c={c} />)}</ul>
          </div>
        ))}
        <p className="xt-fine">Tools are for information and education only. They are never investment advice.</p>
      </div>
    </div></section>
  );
}
