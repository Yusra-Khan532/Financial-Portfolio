// Trading Lab > Order Flow > Trading journal (docs/TRADING-LAB.md "Trading journal"): a Lab member's own trades, by hand or from a CSV, and the
// numbers from the closed ones: net P&L, win rate, profit factor, expectancy, average win and loss, deepest drawdown, best and worst day, runs,
// P&L by setup, the cumulative P&L curve with its drawdown and a daily P&L calendar. Private to the member (backend finlit/lab/journal.py).
// Each closed trade carries a reflection (docs/TRADING-LAB.md "Journal reflection"): what happened, Nifty 50 over the same period and whether a
// level noted in the setup or notes was reached; shown under the trade's row (expander), in its hover card and in the "Reflections" list.
import { Fragment, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiGet, apiSend } from "../../lib/api";
import { CSV_SAMPLE, calendar, fromInput, latestReflections, money, nowIst, toInput, type JStats, type JTrade, type Journal, type TradeIn } from "../../lib/journal";
import { useTip } from "./FlowTips";
import { ChartZoom } from "../ChartZoom";

const KEY = ["lab-journal"];
const PAGE = 25;          // trades listed at first; the numbers above always use every trade
const getJournal = () => apiGet<Journal>("/api/lab/journal");
const dmy = (iso: string) => new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const tone = (v: number | null | undefined) => (v == null || v === 0 ? "" : v > 0 ? "gain" : "loss");
const errText = (e: unknown) => (e instanceof ApiError ? e.body.detail || e.message : "Could not save. Try again.");

function Tiles({ s }: { s: JStats }) {
  const tiles: [string, string, string, string?][] = [
    ["Net P&L", money(s.net), tone(s.net), `${s.closed} closed · ${s.open} open · fees ${money(s.fees, false)}`],
    ["Win rate", s.winRate == null ? "—" : `${s.winRate}%`, "", `${s.wins} won · ${s.losses} lost`],
    ["Profit factor", s.profitFactor == null ? "—" : s.profitFactor.toFixed(2), "", "gross won ÷ gross lost"],
    ["Expectancy", money(s.expectancy), tone(s.expectancy), "net P&L per closed trade"],
    ["Average win", money(s.avgWin), "gain", s.largestWin != null ? `largest ${money(s.largestWin)}` : ""],
    ["Average loss", money(s.avgLoss), "loss", s.largestLoss != null ? `largest ${money(s.largestLoss)}` : ""],
    ["Deepest drawdown", money(s.maxDrawdown), tone(s.maxDrawdown), "from the running peak of cumulative P&L"],
    ["Best day", s.bestDay ? money(s.bestDay.net) : "—", "gain", s.bestDay ? dmy(s.bestDay.day) : ""],
    ["Worst day", s.worstDay ? money(s.worstDay.net) : "—", "loss", s.worstDay ? dmy(s.worstDay.day) : ""],
    ["Runs", s.currentRun ? `${s.currentRun.count} ${s.currentRun.kind === "win" ? "won" : "lost"} in a row` : "—", s.currentRun?.kind === "win" ? "gain" : s.currentRun ? "loss" : "",
      `longest: ${s.longestWinRun} won, ${s.longestLossRun} lost`],
  ];
  return <dl className="jr-tiles">{tiles.map(([k, v, c, sub]) => <div key={k}><dt>{k}</dt><dd className={c}>{v}</dd>{sub && <small>{sub}</small>}</div>)}</dl>;
}

/** Cumulative P&L after each closed trade, with the drawdown from its running peak shaded below. */
export function Curve({ s }: { s: JStats }) {
  const tip = useTip();
  const c = s.curve;
  if (c.length < 2) return <p className="muted">The curve appears after two closed trades.</p>;
  const W = 1000, H = 260, L = 96, R = 12, T = 12, B = 26;
  const vals = [0, ...c.map((p) => p.cum), ...c.map((p) => p.cum - p.dd)];
  const lo = Math.min(...vals), hi = Math.max(...vals), sp = hi - lo || 1;
  const x = (i: number) => L + (i / (c.length - 1)) * (W - L - R), y = (v: number) => T + ((hi - v) / sp) * (H - T - B);
  const line = c.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.cum).toFixed(1)}`).join("");
  const dd = c.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.cum - p.dd).toFixed(1)}`).join("") + c.map((_, i) => `L${x(c.length - 1 - i).toFixed(1)},${y(c[c.length - 1 - i].cum).toFixed(1)}`).join("") + "Z";
  return (
    <svg className="jr-curve" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Cumulative P&L over ${c.length} closed trades, ending at ${money(c[c.length - 1].cum)}; deepest drawdown ${money(s.maxDrawdown)}`}
      onPointerLeave={() => tip.hide()}>
      <line className="zero" x1={L} x2={W - R} y1={y(0)} y2={y(0)} /><text className="ax" x={L - 8} y={y(0) + 4} textAnchor="end">₹0</text>
      <text className="ax" x={L - 8} y={y(hi) + 4} textAnchor="end">{`₹${Math.round(hi).toLocaleString("en-IN")}`}</text>
      {lo < 0 && <text className="ax" x={L - 8} y={y(lo) + 4} textAnchor="end">{`−₹${Math.round(-lo).toLocaleString("en-IN")}`}</text>}
      <path className="dd" d={dd} /><path className={`ln ${c[c.length - 1].cum >= 0 ? "up" : "down"}`} d={line} />
      {c.map((p, i) => (
        <rect key={i} className="hit" x={x(i) - (W - L - R) / c.length / 2} width={(W - L - R) / c.length} y={T} height={H - T - B}
          onPointerMove={(e) => tip.show(e, <><header className="oflow-pop-h"><div><b>After trade {i + 1}</b><small>{dmy(p.at)} {p.at.slice(11, 16)}</small></div>
            <div className="r"><small>cumulative</small><b className={tone(p.cum)}>{money(p.cum)}</b></div></header>
            <dl className="oflow-pop-t"><div><dt>From the peak</dt><dd className={tone(p.dd)}>{money(p.dd)}</dd></div></dl></>)} />
      ))}
      <text className="ax" x={L} y={H - 6}>{dmy(c[0].at)}</text><text className="ax" x={W - R} y={H - 6} textAnchor="end">{dmy(c[c.length - 1].at)}</text>
    </svg>
  );
}

/** One square per day, coloured by that day's P&L (by exit date). */
export function Calendar({ s, today }: { s: JStats; today: string }) {
  const tip = useTip();
  const weeks = calendar(s.days, s.days.length && s.days[s.days.length - 1].day > today ? s.days[s.days.length - 1].day : today);
  const max = Math.max(1, ...s.days.map((d) => Math.abs(d.net)));
  const C = 14, G = 3;
  return (
    <svg className="jr-cal" viewBox={`0 0 ${weeks.length * (C + G) + 30} ${7 * (C + G) + 18}`} role="img" aria-label={`Daily P&L for the last ${weeks.length} weeks: ${s.days.length} days with closed trades`}
      onPointerLeave={() => tip.hide()}>
      {["Mon", "", "Wed", "", "Fri", "", ""].map((d, i) => d && <text key={i} className="ax" x={0} y={18 + i * (C + G) + C - 3}>{d}</text>)}
      {weeks.map((w, wi) => (
        <g key={wi}>
          {(wi === 0 || w[0].month !== weeks[wi - 1][0].month) && <text className="ax" x={30 + wi * (C + G)} y={11}>{w[0].month}</text>}
          {w.map((d, di) => {
            const k = d.net == null ? "none" : d.net > 0 ? "up" : d.net < 0 ? "down" : "flat";
            const a = d.net == null ? 0 : Math.round(25 + (Math.abs(d.net) / max) * 75);
            return <rect key={d.day} className={`jr-day ${k}`} x={30 + wi * (C + G)} y={16 + di * (C + G)} width={C} height={C} rx={3}
              style={d.net != null && d.net !== 0 ? { fillOpacity: a / 100 } : undefined}
              onPointerMove={(e) => tip.show(e, <header className="oflow-pop-h"><div><b>{dmy(d.day)}</b><small>{d.net == null ? "No closed trades" : "Closed trades that day"}</small></div>
                {d.net != null && <div className="r"><small>P&L</small><b className={tone(d.net)}>{money(d.net)}</b></div>}</header>)} />;
          })}
        </g>
      ))}
    </svg>
  );
}

const sideWord = (t: JTrade) => (t.side === "long" ? "Long" : "Short");

/** The hover card of a closed trade: its P&L and its reflection, sentence by sentence. */
function ReflectionPop({ t }: { t: JTrade }) {
  return (
    <>
      <header className="oflow-pop-h"><div><b>{t.symbol}</b><small>{sideWord(t)} · closed {t.exitAt ? `${dmy(t.exitAt)} ${t.exitAt.slice(11, 16)}` : ""}</small></div>
        <div className="r"><small>net P&L</small><b className={tone(t.pnl)}>{money(t.pnl)}</b></div></header>
      <div className="jr-pop-refl"><b>Reflection</b>{t.reflection!.sentences.map((x, i) => <p key={i}>{x}</p>)}</div>
    </>
  );
}

/** The latest closed trades with their reflections, newest exit first. */
export function Reflections({ trades }: { trades: JTrade[] }) {
  const list = latestReflections(trades);
  if (!list.length) return null;
  return (
    <div className="jr-refls">
      <h3>Reflections</h3>
      <p className="muted jr-refls-sub">The latest closed trades, newest first: what happened, Nifty 50 over the same period, and the level you noted.</p>
      <ol aria-label="Reflections on the latest closed trades">{list.map((t) => (
        <li key={t.id}><div className="jr-refls-h"><b>{t.symbol}</b><small className="muted">{sideWord(t)} · closed {dmy(t.exitAt!)} {t.exitAt!.slice(11, 16)}</small>
          <span className={tone(t.pnl)}>{money(t.pnl)}</span></div><p>{t.reflection!.text}</p></li>))}</ol>
    </div>
  );
}

const BLANK = (): TradeIn => ({ symbol: "", side: "long", qty: 1, entryPrice: 0, exitPrice: null, entryAt: fromInput(nowIst()) as string, exitAt: null, fees: 0, setup: null, notes: null });

function TradeForm({ start, onDone }: { start: JTrade | null; onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<TradeIn>(() => (start ? { ...start } : BLANK()));
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (t: TradeIn) => (start ? apiSend("PUT", `/api/lab/journal/${start.id}`, t) : apiSend("POST", "/api/lab/journal", t)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); onDone(); },
    onError: (e) => setErr(errText(e)),
  });
  const set = <K extends keyof TradeIn>(k: K, v: TradeIn[K]) => setF({ ...f, [k]: v });
  const num = (v: string) => (v === "" ? null : Number(v));
  return (
    <form className="jr-form" onSubmit={(e) => { e.preventDefault(); setErr(null);
      if ((f.exitPrice == null) !== (f.exitAt == null)) { setErr("A closed trade needs both its exit price and exit time."); return; }
      save.mutate(f); }} aria-label={start ? "Change the trade" : "Add a trade"}>
      <label>Symbol<input required maxLength={60} value={f.symbol} onChange={(e) => set("symbol", e.target.value)} placeholder="RELIANCE or NIFTY 24300 CE" /></label>
      <label>Side<select value={f.side} onChange={(e) => set("side", e.target.value as TradeIn["side"])}><option value="long">Long</option><option value="short">Short</option></select></label>
      <label>Quantity<input required type="number" min="0" step="any" value={f.qty || ""} onChange={(e) => set("qty", Number(e.target.value))} /></label>
      <label>Entry price<input required type="number" min="0" step="any" value={f.entryPrice || ""} onChange={(e) => set("entryPrice", Number(e.target.value))} /></label>
      <label>Entry time<input required type="datetime-local" value={toInput(f.entryAt)} onChange={(e) => set("entryAt", fromInput(e.target.value) as string)} /></label>
      <label>Exit price<input type="number" min="0" step="any" value={f.exitPrice ?? ""} onChange={(e) => set("exitPrice", num(e.target.value))} placeholder="open" /></label>
      <label>Exit time<input type="datetime-local" value={toInput(f.exitAt)} onChange={(e) => set("exitAt", fromInput(e.target.value))} /></label>
      <label>Fees<input type="number" min="0" step="any" value={f.fees || ""} onChange={(e) => set("fees", Number(e.target.value) || 0)} placeholder="0" /></label>
      <label>Setup<input maxLength={40} value={f.setup ?? ""} onChange={(e) => set("setup", e.target.value || null)} placeholder="your own tag" /></label>
      <label className="wide">Notes<input maxLength={1000} value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} /></label>
      <div className="jr-form-a">
        <button type="submit" className="btn primary" disabled={save.isPending}>{start ? "Save" : "Add trade"}</button>
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
      </div>
      {err && <p className="formerr" role="alert">{err}</p>}
    </form>
  );
}

function Import({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const run = useMutation({
    mutationFn: (csv: string) => apiSend<{ added: number; rejected: { line: number | null; reason: string }[] }>("POST", "/api/lab/journal/import", { csv }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  return (
    <div className="jr-import" aria-label="Import trades from CSV">
      <p className="muted">The first line names the columns: symbol, side (long, short, buy or sell), qty, entry price and entry time are needed; exit price,
        exit time, fees, setup and notes are optional. Times are Indian time.</p>
      <label className="jr-file">Choose a CSV file<input type="file" accept=".csv,text/csv" onChange={async (e) => { const fl = e.target.files?.[0]; if (fl) setText(await fl.text()); }} /></label>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder={CSV_SAMPLE} aria-label="CSV text" />
      <div className="jr-form-a">
        <button type="button" className="btn primary" disabled={!text.trim() || run.isPending} onClick={() => run.mutate(text)}>Import</button>
        <button type="button" className="btn" onClick={onDone}>Close</button>
      </div>
      {run.data && <div role="status"><p><b>{run.data.added}</b> trade{run.data.added === 1 ? "" : "s"} added.</p>
        {run.data.rejected.length > 0 && <ul className="jr-rej">{run.data.rejected.map((r, i) => <li key={i}>{r.line ? `Line ${r.line}: ` : ""}{r.reason}</li>)}</ul>}</div>}
      {run.isError && <p className="formerr" role="alert">{errText(run.error)}</p>}
    </div>
  );
}

export function TradingJournal({ today = new Date().toISOString().slice(0, 10) }: { today?: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY, queryFn: getJournal, retry: false });
  const [mode, setMode] = useState<"none" | "add" | "import" | number>("none");
  const [shown, setShown] = useState(PAGE);
  const [opened, setOpened] = useState<Set<number>>(() => new Set());
  const toggle = (id: number) => setOpened((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const tip = useTip();
  const del = useMutation({ mutationFn: (id: number) => apiSend("DELETE", `/api/lab/journal/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
  const j = q.data;
  const editing = typeof mode === "number" ? j?.trades.find((t) => t.id === mode) ?? null : null;
  return (
    <section className="card oflow-board jr" aria-labelledby="jr-h">
      <div className="oflow-hero-h"><div><h2 id="jr-h">Trading journal</h2>
        {j && <p className="oflow-money-line">{j.stats.closed ? `${money(j.stats.net)} over ${j.stats.closed} closed trade${j.stats.closed === 1 ? "" : "s"}${j.stats.winRate != null ? ` · ${j.stats.winRate}% won` : ""}` : "Your own record of your trades. Only you can see it."}</p>}</div>
        <div className="jr-acts">
          <button type="button" className="oflow-bchip" aria-pressed={mode === "add"} onClick={() => setMode(mode === "add" ? "none" : "add")}>Add a trade</button>
          <button type="button" className="oflow-bchip" aria-pressed={mode === "import"} onClick={() => setMode(mode === "import" ? "none" : "import")}>Import CSV</button>
        </div></div>
      {mode === "add" && <TradeForm start={null} onDone={() => setMode("none")} />}
      {editing && <TradeForm key={editing.id} start={editing} onDone={() => setMode("none")} />}
      {mode === "import" && <Import onDone={() => setMode("none")} />}
      {q.isPending && <div className="skeleton" style={{ height: 360 }} aria-label="Loading your journal" />}
      {q.isError && <div className="formerr" role="alert">{errText(q.error)}</div>}
      {j && <>
        <Tiles s={j.stats} />
        <div className="jr-grid">
          <div className="jr-panel"><h3>Cumulative P&L</h3><ChartZoom label="Cumulative P&L"><Curve s={j.stats} /></ChartZoom>
            <p className="muted opul-legend"><i className="sw jr-sw-ln" /> cumulative P&L after each closed trade · <i className="sw jr-sw-dd" /> drawdown from its peak</p></div>
          <div className="jr-panel"><h3>Daily P&L</h3><ChartZoom label="Daily P&L"><Calendar s={j.stats} today={today} /></ChartZoom>
            {j.stats.setups.length > 0 && <><h3>By setup</h3><ol className="jr-setups" aria-label="P&L by setup">{j.stats.setups.map((s) => (
              <li key={s.setup}><b>{s.setup}</b><span className={tone(s.net)}>{money(s.net)}</span><small className="muted">{s.trades} trade{s.trades === 1 ? "" : "s"} · {Math.round((s.wins / s.trades) * 100)}% won</small></li>))}</ol></>}</div>
        </div>
        <Reflections trades={j.trades} />
        <div className="jr-table-wrap">
          <table className="jr-table" aria-label="Your trades">
            <thead><tr><th>Symbol</th><th>Side</th><th className="n">Qty</th><th className="n">Entry</th><th className="n">Exit</th><th>Opened</th><th>Closed</th><th className="n">Fees</th><th className="n">P&L</th><th>Setup</th><th aria-label="Actions" /></tr></thead>
            <tbody onPointerLeave={() => tip.hide()}>{j.trades.length ? j.trades.slice(0, shown).map((t) => {
              const r = t.exitPrice != null ? t.reflection : null;
              const isOpen = r != null && opened.has(t.id);
              const extra: ReactNode = isOpen ? <tr className="jr-refl-row" id={`jr-refl-${t.id}`}><td colSpan={11}><p className="jr-refl-txt">{r.text}</p></td></tr> : null;
              return <Fragment key={t.id}>
              <tr className={r ? "jr-closed" : undefined} onPointerMove={r ? (e) => tip.show(e, <ReflectionPop t={t} />) : () => tip.hide()}>
                <td><b>{t.symbol}</b>{t.notes && <small className="muted jr-note">{t.notes}</small>}
                  {r && <button type="button" className="jr-refl-btn" aria-expanded={isOpen} aria-controls={`jr-refl-${t.id}`} onClick={() => toggle(t.id)}>Reflection</button>}</td><td>{sideWord(t)}</td>
                <td className="n">{t.qty.toLocaleString("en-IN")}</td><td className="n">{money(t.entryPrice, false)}</td><td className="n">{t.exitPrice == null ? <span className="muted">open</span> : money(t.exitPrice, false)}</td>
                <td>{dmy(t.entryAt)} {t.entryAt.slice(11, 16)}</td><td>{t.exitAt ? `${dmy(t.exitAt)} ${t.exitAt.slice(11, 16)}` : "—"}</td>
                <td className="n">{money(t.fees, false)}</td><td className={`n ${tone(t.pnl)}`}>{money(t.pnl)}</td><td>{t.setup ?? ""}</td>
                <td className="jr-row-a"><button type="button" className="btn sm" onClick={() => setMode(t.id)}>{t.exitPrice == null ? "Close" : "Edit"}</button>
                  <button type="button" className="btn sm" onClick={() => { if (window.confirm(`Remove the ${t.symbol} trade?`)) del.mutate(t.id); }} aria-label={`Remove the ${t.symbol} trade`}>Remove</button></td>
              </tr>{extra}</Fragment>; }) : <tr><td colSpan={11} className="muted">No trades yet. Add one by hand or import a CSV.</td></tr>}</tbody>
          </table>
        </div>
        {j.trades.length > shown && <div className="jr-more"><button type="button" className="btn" onClick={() => setShown(shown + PAGE)}>Show {Math.min(PAGE, j.trades.length - shown)} more</button>
          <small className="muted">{shown} of {j.trades.length} trades shown</small></div>}
      </>}
      <details className="oflow-how"><summary>How it is worked out</summary><p className="muted oflow-method">P&L of a closed trade: (exit − entry) × quantity for a long, (entry − exit) × quantity for a short, less fees. The numbers use closed trades only, in the order they closed. Win rate: trades with P&L above zero out of all closed trades (zero counts as neither). Profit factor: the sum of winning trades divided by the sum of losing trades. Expectancy: net P&L divided by closed trades. Deepest drawdown: the largest fall of cumulative P&L from its running peak. Days are by exit date, Indian time. Reflection of a closed trade: what happened (entry and exit, time held, net P&L after the fees you entered, and the return on the position: net P&L ÷ (entry price × quantity)); Nifty 50 over the same period, from its daily closes (the last close at or before the entry to the first close at or after the exit; for a short, set against the index's move turned around), or a plain note when those closes are not stored or the trade opened and closed on the same day; and, when your setup or notes name a price level after a word such as "expected" or "aim", whether the exit price reached it (prices between entry and exit are not checked). It describes the trade only. Your journal is private: only you can see or change it.</p></details>
    </section>
  );
}
