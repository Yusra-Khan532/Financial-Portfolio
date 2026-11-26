// Trading Lab > Order Flow > Market mood (docs/GLOBAL-MARKETS.md, step 2): the tone of what was published. India: every news item and
// exchange filing on the site, scored by FinLit's financial-news language model (task #365), by day, by sector, and the most positive and most
// negative items. World: Google News headlines for eight topics that move Indian markets, scored by the same model (backend lab/mood.py).
// It describes the tone of the news; it never says where the market will go.
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "../../lib/api";
import { useTip } from "./FlowTips";
import { ChartZoom } from "../ChartZoom";

export type Tally = { pos: number; neg: number; neu: number; total: number; index: number | null };
export type MoodItem = { id?: number; title: string; kind?: string; company?: string | null; symbol?: string | null; source?: string | null; link?: string | null;
  day?: string; at?: string; score: number; band: "positive" | "neutral" | "negative" };
export type Mood = {
  india: { days: (Tally & { day: string })[]; latest: (Tally & { day: string }) | null; week: Tally; sectors: (Tally & { sector: string })[];
    mostPositive: MoodItem[]; mostNegative: MoodItem[] };
  world: { at: string; overall: Tally; topics: (Tally & { key: string; name: string; items: MoodItem[] })[] } | null;
  asOf: string; notes: string[];
};

const getMood = () => apiGet<Mood>("/api/lab/mood");
const sgn = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}`);
const sc = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`;
const tone = (v: number | null) => (v == null || v === 0 ? "" : v > 0 ? "gain" : "loss");
const dmy = (iso: string) => new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
/** "+12 (54 positive, 31 negative of 210)" */
export const tallyText = (t: Tally) => `${sgn(t.index)} (${t.pos} positive, ${t.neg} negative of ${t.total})`;
export function moodLine(m: Mood): string {
  const parts = [m.india.week.total ? `India's news this week ${tallyText(m.india.week)}` : null, m.world ? `world headlines today ${tallyText(m.world.overall)}` : null];
  return parts.filter(Boolean).join(" · ");
}

function TallyPop({ name, t, sub }: { name: string; t: Tally; sub?: string }) {
  return (
    <>
      <header className="oflow-pop-h"><div><b>{name}</b>{sub && <small>{sub}</small>}</div><div className="r"><small>mood</small><b className={tone(t.index)}>{sgn(t.index)}</b></div></header>
      <div className="mood-split" aria-hidden="true"><i className="p" style={{ flex: t.pos }} /><i className="n0" style={{ flex: t.neu }} /><i className="n" style={{ flex: t.neg }} /></div>
      <dl className="oflow-pop-t"><div><dt>Positive</dt><dd className="gain">{t.pos}</dd></div><div><dt>Negative</dt><dd className="loss">{t.neg}</dd></div>
        <div><dt>Neutral</dt><dd>{t.neu}</dd></div><div><dt>All items</dt><dd>{t.total}</dd></div></dl>
    </>
  );
}

/** A half dial from −100 (all negative) to +100 (all positive). */
export function Dial({ label, t }: { label: string; t: Tally }) {
  const tip = useTip();
  const v = t.index ?? 0, a = Math.PI * (1 - (v + 100) / 200);
  const R = 80, cx = 100, cy = 96, x = cx + R * Math.cos(a), y = cy - R * Math.sin(a);
  return (
    <figure className="mood-dial" onPointerMove={(e) => tip.show(e, <TallyPop name={label} t={t} />)} onPointerLeave={() => tip.hide()}>
      <svg viewBox="0 0 200 116" role="img" aria-label={`${label}: mood ${sgn(t.index)} on a scale from −100 to +100`}>
        <path className="trk n" d={`M${cx - R},${cy} A${R},${R} 0 0 1 ${cx},${cy - R}`} /><path className="trk p" d={`M${cx},${cy - R} A${R},${R} 0 0 1 ${cx + R},${cy}`} />
        <line className="needle" x1={cx} y1={cy} x2={x} y2={y} /><circle className="hub" cx={cx} cy={cy} r={6} />
        <text className="v" x={cx} y={cy - 26} textAnchor="middle">{sgn(t.index)}</text>
        <text className="ax" x={cx - R} y={cy + 16} textAnchor="middle">−100</text><text className="ax" x={cx + R} y={cy + 16} textAnchor="middle">+100</text>
      </svg>
      <figcaption>{label}<small>{t.total} items</small></figcaption>
    </figure>
  );
}

/** Thirty days: positive items above the line, negative below, the mood index as a line. */
export function DaysChart({ days }: { days: (Tally & { day: string })[] }) {
  const tip = useTip();
  if (days.length < 2) return <p className="muted">The chart appears after two days of scored items.</p>;
  const W = 1000, H = 240, L = 40, R = 12, T = 12, B = 26, mid = T + (H - T - B) / 2;
  const max = Math.max(1, ...days.map((d) => Math.max(d.pos, d.neg)));
  const bw = (W - L - R) / days.length, half = (H - T - B) / 2;
  const iy = (v: number) => mid - (v / 100) * half;
  const line = days.map((d, i) => `${i ? "L" : "M"}${(L + i * bw + bw / 2).toFixed(1)},${iy(d.index ?? 0).toFixed(1)}`).join("");
  return (
    <svg className="mood-days" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`News tone by day, ${dmy(days[0].day)} to ${dmy(days[days.length - 1].day)}`} onPointerLeave={() => tip.hide()}>
      <line className="zero" x1={L} x2={W - R} y1={mid} y2={mid} />
      <text className="ax" x={L - 6} y={T + 10} textAnchor="end">+</text><text className="ax" x={L - 6} y={H - B} textAnchor="end">−</text>
      {days.map((d, i) => (
        <g key={d.day} className="mood-day" onPointerMove={(e) => tip.show(e, <TallyPop name={dmy(d.day)} t={d} sub="news and filings that day" />)}>
          <rect className="hit" x={L + i * bw} width={bw} y={T} height={H - T - B} />
          <rect className="p" x={L + i * bw + bw * 0.15} width={bw * 0.7} y={mid - (d.pos / max) * half} height={(d.pos / max) * half} rx={2} />
          <rect className="n" x={L + i * bw + bw * 0.15} width={bw * 0.7} y={mid} height={(d.neg / max) * half} rx={2} />
        </g>
      ))}
      <path className="idx" d={line} />
      <text className="ax" x={L} y={H - 6}>{dmy(days[0].day)}</text><text className="ax" x={W - R} y={H - 6} textAnchor="end">{dmy(days[days.length - 1].day)}</text>
    </svg>
  );
}

function ItemList({ items, label }: { items: MoodItem[]; label: string }) {
  const tip = useTip();
  if (!items.length) return <p className="muted">None in the last few days.</p>;
  return (
    <ol className="mood-items" aria-label={label}>{items.map((i, k) => (
      <li key={(i.link ?? i.title) + k} onPointerMove={(e) => tip.show(e, <><header className="oflow-pop-h"><div><b>{i.company || i.source || "News"}</b><small>{i.day ? dmy(i.day) : i.at ? `${dmy(i.at)} ${i.at.slice(11, 16)} UTC` : ""}{i.source ? ` · ${i.source}` : ""}</small></div>
          <div className="r"><small>score</small><b className={i.band === "positive" ? "gain" : i.band === "negative" ? "loss" : ""}>{sc(i.score)}</b></div></header>
          <p className="mood-pop-t">{i.title}</p><p className="muted mood-pop-note">The score is the model's reading of the headline's wording, from −1 to +1.</p></>)} onPointerLeave={() => tip.hide()}>
        <span className={`mood-chip ${i.band}`}>{sc(i.score)}</span>
        <span className="t">{i.link ? <a href={i.link} target="_blank" rel="noopener noreferrer">{i.title}</a> : i.title}</span>
        <small className="muted">{[i.company, i.source].filter(Boolean).join(" · ")}</small>
      </li>))}</ol>
  );
}

export function MarketMood() {
  const tip = useTip();
  const q = useQuery({ queryKey: ["lab-mood"], queryFn: getMood, retry: false, refetchInterval: 300_000 });
  const m = q.data;
  const smax = Math.max(1, ...(m?.india.sectors ?? []).map((s) => Math.abs(s.index ?? 0)));
  return (
    <section className="card oflow-board mood" aria-labelledby="mood-h">
      <div className="oflow-hero-h"><div><h2 id="mood-h">Market mood</h2>{m && <p className="oflow-money-line">{moodLine(m)}</p>}</div></div>
      {q.isPending && <div className="skeleton" style={{ height: 420 }} aria-label="Loading market mood" />}
      {q.isError && <div className="formerr" role="alert">{q.error instanceof ApiError && q.error.body.detail ? q.error.body.detail : "Market mood could not be read right now. Try again in a minute."}</div>}
      {m && <>
        <div className="mood-dials">
          {m.india.latest && <Dial label={`India, ${dmy(m.india.latest.day)}`} t={m.india.latest} />}
          {m.india.week.total > 0 && <Dial label="India, last 7 days" t={m.india.week} />}
          {m.world && <Dial label="World headlines, 24 hours" t={m.world.overall} />}
        </div>
        {m.india.days.length > 0 && <div className="mood-panel"><h3>India's news and filings, last 30 days</h3><ChartZoom label="News tone by day"><DaysChart days={m.india.days} /></ChartZoom>
          <p className="muted opul-legend"><i className="sw mood-sw-p" /> positive items · <i className="sw mood-sw-n" /> negative items · <i className="sw mood-sw-i" /> mood index</p></div>}
        {m.india.sectors.length > 0 && <div className="mood-panel"><h3>By sector, last 7 days</h3>
          <ol className="mood-sectors" aria-label="Mood by sector">{m.india.sectors.map((s) => (
            <li key={s.sector} onPointerMove={(e) => tip.show(e, <TallyPop name={s.sector} t={s} sub="company news and filings, last 7 days" />)} onPointerLeave={() => tip.hide()}>
              <b>{s.sector}</b><span className="bar"><i className={tone(s.index)} style={{ width: `${(Math.abs(s.index ?? 0) / smax) * 50}%`, [(s.index ?? 0) >= 0 ? "left" : "right"]: "50%" } as React.CSSProperties} /></span>
              <span className={tone(s.index)}>{sgn(s.index)}</span><small className="muted">{s.total}</small></li>))}</ol></div>}
        <div className="mood-two">
          <div className="mood-panel"><h3 className="gain">Most positive, last 3 days</h3><ItemList items={m.india.mostPositive} label="Most positive items" /></div>
          <div className="mood-panel"><h3 className="loss">Most negative, last 3 days</h3><ItemList items={m.india.mostNegative} label="Most negative items" /></div>
        </div>
        {m.world && <div className="mood-panel"><h3>World headlines by topic, last 24 hours</h3>
          <div className="mood-topics">{m.world.topics.map((t) => (
            <article key={t.key} className="mood-topic" aria-label={t.name}>
              <header onPointerMove={(e) => tip.show(e, <TallyPop name={t.name} t={t} sub="headlines in the last 24 hours" />)} onPointerLeave={() => tip.hide()}>
                <b>{t.name}</b><span className={tone(t.index)}>{sgn(t.index)}</span></header>
              <div className="mood-split" aria-hidden="true"><i className="p" style={{ flex: t.pos }} /><i className="n0" style={{ flex: t.neu }} /><i className="n" style={{ flex: t.neg }} /></div>
              <ItemList items={t.items.slice(0, 4)} label={`${t.name} headlines`} />
            </article>))}</div></div>}
        {m.notes.map((n) => <p key={n} className="muted oflow-note">{n}</p>)}
      </>}
      <details className="oflow-how"><summary>How it is worked out</summary><p className="muted oflow-method">Every item gets a score from −1 to +1 from FinLit's financial-news language model: the chance its wording is positive minus the chance it is negative. +0.1 and above counts as positive, −0.1 and below as negative, the rest as neutral. The mood index is (positive − negative) ÷ all items × 100, from −100 (all negative) to +100 (all positive). India: the site's news and exchange filings, dated by their publication day. World: Google News headlines for eight topics, read every 30 minutes and kept for 48 hours. This describes the tone of what was published, not where prices will go.</p></details>
    </section>
  );
}
