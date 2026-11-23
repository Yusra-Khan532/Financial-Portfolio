// Task #316 (dashboard file 22): the top of the shorter dashboard.
// - TodayStrip: four figures under the heading (your biggest move, your equity's FinLit Prism score, the Nifty 50 with the day's breadth, FII and DII); each jumps to its card.
//   A figure that is not there yet says why. Descriptive only: what moved and by how much, never what to do.
// - SectionFilter: the section bar as a filter (All sections, or one section alone; a Section dropdown on a phone), with "N cards hidden · Show".
// - SectionHead: a section's heading without a number ("Step n:" is gone: they are sections, not steps).
import type { ReactNode } from "react";
import { useQuotesFor } from "../../lib/api";
import { quoteMap } from "../../lib/globalSearch";
import { useIndices } from "../../lib/indices";
import { useFlows, type Streak } from "../../lib/flows";
import { inr } from "../../lib/flowsMath";
import { MINUS, dateIN, nf } from "../../lib/format";
import { dayWord } from "../../lib/dashPack";
import { DASH_SECS } from "../../lib/prefs";
import type { Row } from "../../lib/screener";
import { bandWord } from "../ScoreRing";
import { glance } from "./Portfolio";
import { tone } from "./parts";
import { Dd, useDashUi, useDx } from "./dx";

const pct = (v: number | null | undefined) => (v == null ? MINUS : (v > 0 ? "+" : v < 0 ? MINUS : "") + nf(Math.abs(v), 2) + "%");
const signedCr = (v: number | null | undefined) => (v == null ? MINUS : (v > 0 ? "+" : v < 0 ? MINUS : "") + inr(Math.abs(v)));
const streakWord = (s: Streak | null | undefined) => (!s || s.side === "flat" || !s.days ? null : `${s.days} day${s.days === 1 ? "" : "s"} of ${s.side === "buying" ? "buying" : "selling"}`);
/** Jump to a card without changing the address, so Back still leaves the dashboard. */
const jump = (id: string) => (e: React.MouseEvent) => { const el = document.getElementById(id); if (!el) return; e.preventDefault(); el.scrollIntoView({ behavior: "smooth", block: "start" }); el.querySelector<HTMLElement>("h2")?.focus?.(); };

function Tile({ to, k, v, small }: { to: string; k: string; v: ReactNode; small: ReactNode }) {
  return <a className="dx-td" href={`#${to}`} onClick={jump(to)}><span>{k}</span><b>{v}</b><small>{small}</small></a>;
}

export function TodayStrip({ symbols, held, rows, prism, loading = false }: { symbols: string[]; held: string[]; rows: Row[]; /** the plan shows FinLit Prism */ prism: boolean;
  /** QA 23 Nov (item 17): the company list (with each share's Prism) is still loading */ loading?: boolean }) {
  const q = useQuotesFor(symbols), qm = quoteMap(q.data);
  const idx = useIndices(), f = useFlows().data;
  const day = dayWord(new Date(), idx.data?.asOf ?? null);
  // 1. the biggest move (up or down) among the stocks you follow and hold, as "Your investments today" shows it
  const moves = symbols.map((s) => ({ s, c: qm.get(s)?.chg ?? null })).filter((m): m is { s: string; c: number } => m.c != null);
  const big = moves.sort((a, b) => Math.abs(b.c) - Math.abs(a.c))[0];
  const name = (s: string) => /^\d+$/.test(s) ? rows.find((r) => r.symbol === s)?.name ?? s : s;
  // 2. the average FinLit Prism score of the shares held, its band, and its lowest part
  const g = held.length ? glance(held, rows) : null;
  const weak = g ? g.parts.filter((p) => p.value != null).sort((a, b) => a.value! - b.value!)[0] : null;
  // 3. the Nifty 50 and how many stocks rose and fell
  const nifty = idx.data?.items.find((r) => r.code === "NIF50");
  const live = rows.filter((r) => r.change_pct != null && (r.price ?? 0) > 0);
  const adv = live.filter((r) => (r.change_pct as number) > 0).length, dec = live.filter((r) => (r.change_pct as number) < 0).length;
  const n = (v: number) => v.toLocaleString("en-IN");
  const against = nifty?.changePct != null && ((nifty.changePct > 0 && dec > adv) || (nifty.changePct < 0 && adv > dec));
  const breadth = live.length ? (dec > adv ? `${against ? "but " : ""}${n(dec)} stocks fell and ${n(adv)} rose` : `${against ? "but " : ""}${n(adv)} stocks rose and ${n(dec)} fell`) : "Breadth loads with the stock list";
  // 4. FII and DII on the latest day with a figure
  const l = f?.latest, fiiRun = streakWord(f?.streaks.fii);
  return (
    <nav className="dx-today" aria-label="Today in four figures">
      <Tile to="dsh-b-mystocks" k={`Your investments, ${day === "Today" ? "today" : day}`}
        v={big ? <>{name(big.s)} <i className={tone(big.c)}>{pct(big.c)}</i></> : MINUS}
        small={big ? `biggest move of your ${symbols.length} ${symbols.length === 1 ? "stock" : "stocks"}` : !symbols.length ? "Follow or add stocks to see this" : q.isLoading ? "Loading prices…" : "No price move held yet"} />
      <Tile to="dsh-b-glance" k="Your equity, FinLit Prism"
        v={!prism ? MINUS : g?.avgPrism != null ? <>{g.avgPrism} · {bandWord(g.avgPrism).word}</> : MINUS}
        small={!held.length ? "Add the shares you hold to see this" : !prism ? "FinLit Prism is part of Gold" : g?.avgPrism == null && loading ? "Loading scores…" : g?.avgPrism == null ? "No Prism score is stored yet for these shares" : weak ? `${weak.label} is the weak spot` : `${g.scored} of ${g.count} shares scored`} />
      <Tile to="dsh-b-market" k="Nifty 50"
        v={nifty?.close != null ? <>{nf(nifty.close)} <i className={tone(nifty.changePct)}>{pct(nifty.changePct)}</i></> : MINUS}
        small={nifty?.close != null ? breadth : idx.isLoading ? "Loading…" : "Not in today's index feed"} />
      <Tile to="dsh-b-flows" k={`FII · DII${l ? `, ${dateIN(l.d).replace(/ \d{4}$/, "")}` : ""}`}
        v={l ? <><i className={tone(l.fii.net)}>{signedCr(l.fii.net)}</i> · <i className={tone(l.dii?.net)}>{l.dii?.net != null ? signedCr(l.dii.net) : MINUS}</i></> : MINUS}
        small={l ? (fiiRun ? `FII: ${fiiRun}` : "₹ crore, net") : "Loads after each trading day"} />
    </nav>
  );
}

export type Sec = (typeof DASH_SECS)[number];
export function SectionFilter({ sections }: { sections: { id: Exclude<Sec, "all">; title: string }[] }) {
  const [ui, setUi] = useDashUi(), dx = useDx();
  const cur: Sec = ui.sec === "all" || sections.some((s) => s.id === ui.sec) ? ui.sec : "all";
  const opts = [{ v: "all" as Sec, label: "All sections" }, ...sections.map((s) => ({ v: s.id as Sec, label: s.title }))];
  const hidden = dx?.hidden.size ?? 0;
  const restore = hidden > 0 && <button type="button" className="dx-restore" onClick={() => dx!.restore()}>{hidden} {hidden === 1 ? "card" : "cards"} hidden · Show</button>;
  return (
    <div className="dx-secbar">
      <div className="dx-sec dx-only-l" role="group" aria-label="Dashboard sections: show one or all">
        {opts.map((o) => <button key={o.v} type="button" aria-pressed={cur === o.v} onClick={() => setUi({ sec: o.v })}>{o.label}</button>)}
        {restore}
      </div>
      <div className="dx-sec-s dx-only-s"><Dd k="Section" value={cur} options={opts} onChange={(v) => setUi({ sec: v })} className="dx-wide" />{restore}</div>
    </div>
  );
}

export function SectionHead({ id, title, line, children }: { id: string; title: string; line?: string; children?: ReactNode }) {
  return <div className="dx-sh" id={id}><div><h2>{title}</h2>{line ? <p>{line}</p> : null}</div>{children}</div>;
}
