// Trading Lab > Order Flow > Signals desk (docs/TRADING-LAB.md "Signals switch", build order item 8). The TradingAgents flow on FinLit's own data
// (backend finlit/lab/signals.py): four analyst notes, a two-round bull and bear debate, a research manager's Buy-to-Sell rating with its reasons,
// a trader's plan whose numbers FinLit works out from the stored levels, and a cautious / balanced / aggressive trade-size debate. Shown ONLY to
// members whose Lab grant has the signals switch (OrderFlow.tsx checks /api/lab/access; the server checks signals_ctx). It always carries the label
// "Signals on · internal test" and the note that it is an internal test, not investment advice (SEBI research-analyst rules for public calls).
import { useEffect, useMemo, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, useSearchIndex } from "../../lib/api";
import { rankCompanies } from "../../lib/companySearch";
import { codeText, subOf, titleOf } from "../../lib/companyLabel";
import { Icon } from "../../lib/icons";
import { caseDay, caseTime, factGroups, type CaseFact, type CaseSentence } from "../../lib/labCase";
import {
  DESK_HOW, RATINGS, SIGNALS_LABEL, SIGNALS_NOTE, STEP_NAMES, STEP_STATUS, capsLine, deskLimitLine, getSignals, mergeSteps, ratingTone, rupees, runSignals,
  type DeskPlan, type DeskPrice, type DeskSize, type DeskStep, type LabSignals, type StepId,
} from "../../lib/labSignals";
import { ChartZoom } from "../ChartZoom";
import { useTip } from "./FlowTips";

const QUICK = ["RELIANCE", "HDFCBANK", "TCS", "INFY", "ITC", "LT"];
const SHOW_SOURCES = 15;

function FactPop({ f }: { f: CaseFact }) {
  return (
    <>
      <header className="oflow-pop-h"><div><b>Source [{f.n}]</b><small>{f.groupLabel}</small></div></header>
      <p className="lcase-pop-fact">{f.text}</p>
      <p className="muted lcase-pop-src">{f.source}</p>
    </>
  );
}

/** A sentence's source numbers: each a link to its row in Sources, with the fact in a hover card (pointer) or on focus (keyboard). */
function Refs({ ns, by, onOpen }: { ns: number[]; by: Map<number, CaseFact>; onOpen: (n: number) => void }) {
  const tip = useTip();
  const focusShow = (e: FocusEvent<HTMLAnchorElement>, body: ReactNode) => {
    const r = e.currentTarget.getBoundingClientRect();
    tip.show({ clientX: r.right, clientY: r.top + r.height / 2, pointerType: "mouse" }, body);
  };
  return (
    <span className="lcase-refs">{ns.map((n) => {
      const f = by.get(n);
      if (!f) return null;
      return (
        <a key={n} href={`#sdesk-src-${n}`} className="lcase-ref" aria-label={`Source ${n}: ${f.text}`}
          onPointerMove={(e) => tip.show(e, <FactPop f={f} />)} onPointerLeave={() => tip.hide()}
          onFocus={(e) => focusShow(e, <FactPop f={f} />)} onBlur={() => tip.hide()} onClick={() => onOpen(n)}>[{n}]</a>
      );
    })}</span>
  );
}

function Sents({ list, by, onOpen }: { list: CaseSentence[]; by: Map<number, CaseFact>; onOpen: (n: number) => void }) {
  if (!list.length) return <p className="muted">Nothing was written here.</p>;
  return (
    <ul className="lcase-sents">{list.map((x, i) => (
      <li key={i}>{x.text}{x.sources.length > 0 && <> <Refs ns={x.sources} by={by} onOpen={onOpen} /></>}</li>))}</ul>
  );
}

/** The five steps and where the run is. */
function Progress({ steps }: { steps: DeskStep[] }) {
  return (
    <ol className="sdesk-steps" aria-label="The desk's steps">{steps.map((s, i) => (
      <li key={s.id} className={`sdesk-step ${s.status}`} aria-current={s.status === "running" ? "step" : undefined}>
        <span className="sdesk-step-n" aria-hidden="true">{s.status === "done" ? <Icon name="check" /> : i + 1}</span>
        <span className="sdesk-step-t"><b>{STEP_NAMES[s.id]}</b><small>{STEP_STATUS[s.status]}{s.id === "debate" && s.rounds?.length && s.status === "running" ? ` · round ${s.rounds.length} done` : ""}</small></span>
      </li>))}</ol>
  );
}

function RatingCard({ run, by, onOpen }: { run: LabSignals; by: Map<number, CaseFact>; onOpen: (n: number) => void }) {
  const r = run.rating!;
  return (
    <article className="sdesk-card sdesk-rating" aria-labelledby="sdesk-rating-h">
      <h3 id="sdesk-rating-h">Research manager&apos;s rating</h3>
      <div className={`sdesk-badge ${ratingTone(r.value)}`} role="status" aria-label={`Rating: ${r.value}`}>{r.value}</div>
      <ol className="sdesk-scale" aria-label="The five-step scale">{RATINGS.map((x) => (
        <li key={x} className={ratingTone(x)} aria-current={x === r.value ? "true" : undefined}>{x}</li>))}</ol>
      <h4>Reasons</h4>
      <Sents list={r.reasons} by={by} onOpen={onOpen} />
    </article>
  );
}

function LevelPop({ name, price, basis, last }: { name: string; price: number; basis?: string; last: number }) {
  return (
    <>
      <header className="oflow-pop-h"><div><b>{name}</b>{basis && <small>{basis}</small>}</div><div className="r"><small>level</small><b>{rupees(price)}</b></div></header>
      <p className="muted sdesk-pop-note">{((price - last) / last * 100).toFixed(2)}% from the last close {rupees(last)}.</p>
    </>
  );
}

function DayPop({ p }: { p: DeskPrice }) {
  return (
    <>
      <header className="oflow-pop-h"><div><b>{caseDay(p.d)}</b><small>daily candle</small></div><div className="r"><small>close</small><b>{rupees(p.c)}</b></div></header>
      <dl className="oflow-pop-t"><div><dt>High</dt><dd>{rupees(p.h)}</dd></div><div><dt>Low</dt><dd>{rupees(p.l)}</dd></div></dl>
    </>
  );
}

type Line = { key: string; name: string; short: string; price: number; basis?: string; cls: string };

/** The plan's levels as lines (entry zone, stop, targets; levels to watch when there is no trade), in price order. */
export function planLines(p: DeskPlan): Line[] {
  const out: Line[] = [];
  if (p.side === "none") {
    if (p.watch.resistance != null) out.push({ key: "res", name: "Resistance to watch", short: "Resist.", price: p.watch.resistance, basis: "20-session high", cls: "watch" });
    if (p.watch.support != null) out.push({ key: "sup", name: "Support to watch", short: "Support", price: p.watch.support, basis: "20-session low", cls: "watch" });
    return out;
  }
  p.targets.forEach((t, i) => out.push({ key: `t${i + 1}`, name: `Target ${i + 1}`, short: `T${i + 1}`, price: t.price, basis: `${t.basis} · ${t.rr.toFixed(2)} times the risk`, cls: "target" }));
  if (p.entryHigh != null) out.push({ key: "eh", name: "Entry zone top", short: "Entry", price: p.entryHigh, basis: "the last close or half an ATR above it", cls: "entry" });
  if (p.entryLow != null) out.push({ key: "el", name: "Entry zone bottom", short: "Entry", price: p.entryLow, basis: "half an ATR from the last close", cls: "entry" });
  if (p.stop != null) out.push({ key: "stop", name: "Stop", short: "Stop", price: p.stop, basis: p.stopBasis, cls: "stop" });
  return out.sort((a, b) => b.price - a.price);
}

/** The last sessions' closes with the plan drawn across: the entry zone as a band, the stop and the targets as lines. */
export function PlanChart({ prices, plan, symbol }: { prices: DeskPrice[]; plan: DeskPlan; symbol: string }) {
  const tip = useTip();
  const [hot, setHot] = useState<number | null>(null);
  // drawn at the width it is shown at (one unit a pixel), so the labels stay readable on a phone; narrow: short labels and a lower chart
  const box = useRef<SVGSVGElement>(null);
  const [wide, setWide] = useState(720);
  useEffect(() => {
    const el = box.current?.parentElement;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { const w = Math.round(el.clientWidth); if (w > 0) setWide((o) => (Math.abs(o - w) > 4 ? w : o)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = Math.max(320, Math.min(1100, wide)), narrow = W < 520, H = narrow ? 240 : 300, L = 8, R = narrow ? 92 : 150, T = 12, B = 30;
  const lines = planLines(plan);
  const vals = [...prices.flatMap((p) => [p.c, p.h ?? p.c, p.l ?? p.c]), ...lines.map((l) => l.price)];
  const lo = Math.min(...vals), hi = Math.max(...vals), sp = hi - lo || 1;
  const y = (v: number) => T + ((hi - v) / sp) * (H - T - B);
  const n = prices.length, cw = (W - L - R) / Math.max(1, n), x = (i: number) => L + i * cw + cw / 2;
  const d = prices.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.c).toFixed(1)}`).join("");
  const lab = lines.map((l) => ({ l, y: y(l.price) }));
  for (let i = 1; i < lab.length; i++) if (lab[i].y - lab[i - 1].y < 16) lab[i].y = lab[i - 1].y + 16;
  const last = plan.last;
  return (
    <svg ref={box} className="sdesk-chart" viewBox={`0 0 ${W} ${H}`} role="img" onPointerLeave={() => { setHot(null); tip.hide(); }}
      aria-label={`${symbol}: ${n} daily closes from ${caseDay(prices[0]?.d)} to ${caseDay(prices[n - 1]?.d)}, with ${lines.map((l) => `${l.name} ${rupees(l.price)}`).join(", ")}`}>
      {plan.entryLow != null && plan.entryHigh != null && (
        <rect className="sdesk-zone" x={L} width={W - R - L} y={y(plan.entryHigh)} height={Math.max(2, y(plan.entryLow) - y(plan.entryHigh))}
          onPointerMove={(e) => tip.show(e, <LevelPop name="Entry zone" price={plan.mid ?? plan.entryHigh!} basis={`${rupees(plan.entryLow)} to ${rupees(plan.entryHigh)} · middle shown`} last={last} />)}
          onPointerLeave={() => tip.hide()} />)}
      <path className="sdesk-close" d={d} />
      {prices.map((p, i) => (
        <rect key={p.d} className={`sdesk-hit${hot === i ? " hot" : ""}`} x={L + i * cw} width={cw} y={T} height={H - T - B}
          onPointerMove={(e) => { setHot(i); tip.show(e, <DayPop p={p} />); }} />))}
      {hot != null && prices[hot] && <circle className="sdesk-dot" cx={x(hot)} cy={y(prices[hot].c)} r={4} />}
      {lab.map(({ l, y: ly }) => (
        <g key={l.key} className={`sdesk-lvl ${l.cls}`} onPointerMove={(e) => tip.show(e, <LevelPop name={l.name} price={l.price} basis={l.basis} last={last} />)} onPointerLeave={() => tip.hide()}>
          <line x1={L} x2={W - R} y1={y(l.price)} y2={y(l.price)} /><line className="hit" x1={L} x2={W} y1={y(l.price)} y2={y(l.price)} />
          <text x={W - R + 6} y={ly + 4}>{narrow ? l.short : l.name} {l.price.toLocaleString("en-IN", { maximumFractionDigits: l.price >= 1000 ? 0 : 1 })}</text>
        </g>))}
      {n > 0 && <g className="sdesk-axis"><text x={L} y={H - 6}>{caseDay(prices[0].d)}</text><text x={W - R} y={H - 6} textAnchor="end">{caseDay(prices[n - 1].d)}</text></g>}
    </svg>
  );
}

function PlanCard({ run, by, onOpen }: { run: LabSignals; by: Map<number, CaseFact>; onOpen: (n: number) => void }) {
  const p = run.plan!;
  const side = p.side === "long" ? "Long" : p.side === "short" ? "Short (futures)" : "No new trade";
  return (
    <article className="sdesk-card sdesk-plan" aria-labelledby="sdesk-plan-h">
      <h3 id="sdesk-plan-h">Trader&apos;s plan <small className="muted">{side} · {p.timeFrame}</small></h3>
      {run.prices.length > 1 && <ChartZoom label={`${run.symbol} trader's plan`}><PlanChart prices={run.prices} plan={p} symbol={run.symbol} /></ChartZoom>}
      {p.side !== "none" ? (
        <dl className="sdesk-plan-t">
          <div><dt>Entry zone</dt><dd>{rupees(p.entryLow)} – {rupees(p.entryHigh).replace("₹", "")}</dd></div>
          <div><dt>Stop</dt><dd className="loss">{rupees(p.stop)}</dd></div>
          {p.targets.map((t, i) => <div key={i}><dt>Target {i + 1}</dt><dd className="gain">{rupees(t.price)} <small>{t.rr.toFixed(2)}R</small></dd></div>)}
          <div><dt>Risk a share</dt><dd>{rupees(p.riskPerShare)} <small>{p.riskPct?.toFixed(2)}%</small></dd></div>
        </dl>
      ) : p.note ? <p className="muted sdesk-sub">{p.note}</p> : null}
      <Sents list={p.sentences} by={by} onOpen={onOpen} />
      <p className="muted sdesk-sub">The numbers are worked out by FinLit from the stored levels (ATR {rupees(p.atr)}, 14 sessions); FinLit AI only explains them.</p>
    </article>
  );
}

function SizeCard({ s, by, onOpen }: { s: DeskSize; by: Map<number, CaseFact>; onOpen: (n: number) => void }) {
  return (
    <article className={`sdesk-card sdesk-size ${s.id}`} aria-labelledby={`sdesk-size-${s.id}`}>
      <h3 id={`sdesk-size-${s.id}`}>{s.title}</h3>
      <div className="sdesk-size-n"><b>{s.positionPct.toFixed(2)}%</b><small>of capital in the trade</small></div>
      <div className="sdesk-meter" role="img" aria-label={`${s.title}: ${s.positionPct.toFixed(2)}% of capital, ${s.riskPct.toFixed(2)}% at risk`}>
        <i style={{ width: `${Math.min(100, s.positionPct)}%` }} /></div>
      <p className="sdesk-size-r">{s.riskPct.toFixed(2)}% of capital at risk at the stop{s.capped ? ` · held to ${s.capPct.toFixed(0)}% in one trade` : ""}</p>
      <Sents list={s.sentences} by={by} onOpen={onOpen} />
    </article>
  );
}

function Analysts({ step, by, onOpen }: { step: DeskStep; by: Map<number, CaseFact>; onOpen: (n: number) => void }) {
  return (
    <section className="sdesk-sec" aria-labelledby="sdesk-an-h">
      <h3 id="sdesk-an-h">Analyst notes</h3>
      <div className="sdesk-grid4">{(step.notes ?? []).map((n) => (
        <article key={n.id} className={`sdesk-card sdesk-note${n.written ? "" : " empty"}`} aria-label={n.title}>
          <h4>{n.title}</h4><Sents list={n.sentences} by={by} onOpen={onOpen} />
        </article>))}</div>
    </section>
  );
}

function Debate({ step, by, onOpen }: { step: DeskStep; by: Map<number, CaseFact>; onOpen: (n: number) => void }) {
  return (
    <section className="sdesk-sec" aria-labelledby="sdesk-db-h">
      <h3 id="sdesk-db-h">Bull and bear debate</h3>
      {(step.rounds ?? []).map((r) => (
        <div key={r.round} className="sdesk-round" role="group" aria-label={`Round ${r.round}`}>
          <p className="sdesk-round-h">Round {r.round}</p>
          <div className="sdesk-grid2">
            <article className="sdesk-card sdesk-bull" aria-label={`Bull researcher, round ${r.round}`}><h4><Icon name="growth" /> Bull researcher</h4><Sents list={r.bull} by={by} onOpen={onOpen} /></article>
            <article className="sdesk-card sdesk-bear" aria-label={`Bear researcher, round ${r.round}`}><h4><Icon name="decline" /> Bear researcher</h4><Sents list={r.bear} by={by} onOpen={onOpen} /></article>
          </div>
        </div>))}
    </section>
  );
}

function Sources({ facts, hot, open, setOpen }: { facts: CaseFact[]; hot: number | null; open: boolean; setOpen: (v: boolean) => void }) {
  const shown = open ? facts : facts.slice(0, SHOW_SOURCES);
  return (
    <section className="lcase-srcs sdesk-srcs" aria-labelledby="sdesk-src-h">
      <h3 id="sdesk-src-h">Sources</h3>
      <p className="muted lcase-sub">The numbered sheet the desk worked from: {facts.length} figures, each with the table it is stored in and its date. The plan and size figures are worked out by FinLit.</p>
      {factGroups(shown).map((g) => (
        <div key={g.label} className="lcase-sgroup"><h4>{g.label}</h4>
          <ol className="lcase-slist">{g.facts.map((f) => (
            <li key={f.n} id={`sdesk-src-${f.n}`} className={hot === f.n ? "hot" : undefined}><b className="lcase-n">[{f.n}]</b><span className="lcase-stext">{f.text}<small>{f.source}</small></span></li>))}</ol>
        </div>))}
      {facts.length > SHOW_SOURCES && <button type="button" className="chip lcase-more" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Show fewer" : `Show ${facts.length - SHOW_SOURCES} more`}</button>}
    </section>
  );
}

export function SignalsDesk() {
  const [sym, setSym] = useState("RELIANCE");
  const [find, setFind] = useState("");
  const [open, setOpen] = useState(false);
  const [hot, setHot] = useState<number | null>(null);
  const [live, setLive] = useState<Partial<Record<StepId, DeskStep>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<{ sym: string; text: string; limit?: boolean } | null>(null);
  const stop = useRef<AbortController | null>(null);
  const qc = useQueryClient();
  const idx = useSearchIndex(true);
  const q = useQuery<LabSignals, ApiError>({ queryKey: ["lab-signals", sym], queryFn: () => getSignals(sym), retry: false, staleTime: 60_000 });
  const matches = useMemo(() => (find.trim() ? rankCompanies(idx.data?.rows, find, 8) : []), [find, idx.data]);
  const d = q.data;
  const by = useMemo(() => new Map((d?.sources ?? []).map((f) => [f.n, f])), [d]);
  const pick = (s: string) => { setSym(s); setFind(""); setOpen(false); setLive({}); setErr(null); stop.current?.abort(); setBusy(null); };
  const onOpen = (n: number) => { setHot(n); if (n > SHOW_SOURCES) setOpen(true); };
  const running = busy === sym;
  const ran = d?.outcome === "done" || d?.outcome === "stopped";
  const limitHit = (d?.limit.left ?? 1) <= 0 || (err?.sym === sym && !!err.limit);
  const canRun = !!d && d.outcome !== "done" && d.enabled && d.outcome !== "too_few" && !limitHit && !running;
  const go = async () => {
    const s = sym, ctl = new AbortController();
    stop.current = ctl; setBusy(s); setLive({}); setErr(null);
    try {
      await runSignals(s, (e) => {
        if (e.type === "step") setLive((v) => ({ ...v, [e.step.id]: e.step }));
        else if (e.type === "done") qc.setQueryData(["lab-signals", s], e.run);
        else setErr({ sym: s, text: e.detail || "The desk could not finish just now. Try again in a minute.", limit: e.status === "limit_reached" });
      }, ctl.signal);
    } catch (e) {
      if (!ctl.signal.aborted) setErr({ sym: s, text: (e instanceof ApiError && e.body.detail) || "The desk could not run just now. Try again in a minute.", limit: e instanceof ApiError && e.status === 429 });
    } finally {
      setBusy((b) => (b === s ? null : b)); setLive({});
    }
  };
  const steps = d ? (running ? mergeSteps(d.steps.map((s) => ({ ...s, status: "waiting" as const })), live) : d.steps) : [];
  const step = (id: StepId) => d?.steps.find((s) => s.id === id);
  const state = err?.sym === sym ? err.text : !d ? null : d.message ? d.message : !d.enabled && d.outcome === "none" ? "FinLit AI's written answers are not switched on yet. The numbered figures are listed under Sources." : null;
  return (
    <section className="card oflow-board sdesk" aria-labelledby="sdesk-h">
      <div className="oflow-hero-h sdesk-head"><div><h2 id="sdesk-h">Signals desk <span className="sdesk-label">{SIGNALS_LABEL}</span></h2>
        <p className="muted">Analysts, a bull and bear debate, a research manager&apos;s rating, a trader&apos;s plan and a trade-size debate for one stock, written by FinLit AI from FinLit&apos;s stored figures with a source after every figure.</p></div></div>
      <p className="sdesk-warn" role="note"><Icon name="alert" /> <span><b>{SIGNALS_LABEL}.</b> {SIGNALS_NOTE}</span></p>
      <div className="opul-pick lcase-pick">
        <div className="oflow-bchips" role="group" aria-label="Companies">{QUICK.map((s) => (
          <button key={s} type="button" className="oflow-bchip" aria-pressed={sym === s} onClick={() => pick(s)}>{s}</button>))}</div>
        <div className="opul-find">
          <input type="search" value={find} onChange={(e) => setFind(e.currentTarget.value)} placeholder="Any listed company" aria-label="Find a company" />
          {matches.length > 0 && <ul className="opul-found" aria-label="Matching companies">{matches.map((m) => (
            <li key={m.symbol}><button type="button" onClick={() => pick(m.symbol)}><b>{titleOf(m)}</b> <span className="muted">{subOf(m) ?? codeText(m.symbol)}</span></button></li>))}</ul>}
        </div>
      </div>

      {q.isPending && <div className="skeleton" style={{ height: 220 }} aria-label="Loading the figures" />}
      {q.isError && <div className="formerr" role="alert">{q.error.body.detail || `The figures for ${sym} could not be read right now. Try again in a minute.`}</div>}
      {d && <>
        <div className="lcase-bar">
          <div className="lcase-co"><b>{d.name}</b><small className="muted">{codeText(d.symbol)} · {d.sources.length} figures · {d.inputs.fno ? "F&O stock" : "not in the Order Flow snapshot"} · {d.inputs.news ? "news stored" : "no news stored"}</small></div>
          <div className="lcase-act">
            {d.outcome !== "done" && <button type="button" className="btn primary lcase-go" onClick={go} disabled={!canRun} aria-busy={running}>{running ? "Running the desk…" : "Run the desk"}</button>}
            {d.outcome === "done" && !running && <span className="lcase-done" role="status"><Icon name="check" /> {d.cached ? "Opened from the saved run" : "Run just now"}</span>}
            <small className={`lcase-limit${limitHit ? " warn" : ""}`}>{deskLimitLine(limitHit && err?.limit ? { ...d.limit, left: 0, used: d.limit.limit } : d.limit)}</small>
            <small className="lcase-limit">{capsLine(d.caps, ran)}</small>
          </div>
        </div>
        {(running || ran) && <Progress steps={steps} />}
        {running && <p className="lcase-wait" role="status"><span className="lcase-dot" aria-hidden="true" />The desk is working through five steps from {d.sources.length} figures, checking every step. This takes a few minutes.</p>}
        {state && !running && <p className="lcase-state warn" role="status">{state}</p>}
        {!running && ran && <>
          {(d.rating || d.plan) && <div className="sdesk-top">
            {d.rating && <RatingCard run={d} by={by} onOpen={onOpen} />}
            {d.plan && <PlanCard run={d} by={by} onOpen={onOpen} />}
          </div>}
          {d.sizes.length > 0 && <section className="sdesk-sec" aria-labelledby="sdesk-sz-h"><h3 id="sdesk-sz-h">Trade-size debate <small className="muted">% of capital, risk per trade at the stop</small></h3>
            <div className="sdesk-grid3">{d.sizes.map((s) => <SizeCard key={s.id} s={s} by={by} onOpen={onOpen} />)}</div></section>}
          {step("sizes")?.status === "skipped" && step("sizes")?.note && <p className="muted sdesk-sub">{step("sizes")!.note}</p>}
          {step("analysts")?.notes && <Analysts step={step("analysts")!} by={by} onOpen={onOpen} />}
          {step("debate")?.rounds && step("debate")!.rounds!.length > 0 && <Debate step={step("debate")!} by={by} onOpen={onOpen} />}
          <p className="muted lcase-meta">Run {caseTime(d.generatedAt)} · latest filing {caseDay(d.inputs.filingDate)} · prices to {caseDay(d.inputs.priceDate)} · {d.inputs.candles} · kept until a new filing, new prices or new stored news</p>
        </>}
        <Sources facts={d.sources} hot={hot} open={open} setOpen={setOpen} />
      </>}
      <details className="oflow-how"><summary>How the desk works</summary><p className="muted oflow-method">{DESK_HOW}</p></details>
      <div className="sdesk-disc" role="note" aria-label="Signals desk disclaimer"><b>{SIGNALS_LABEL}</b><p>{d?.disclaimer ?? SIGNALS_NOTE}</p></div>
    </section>
  );
}
