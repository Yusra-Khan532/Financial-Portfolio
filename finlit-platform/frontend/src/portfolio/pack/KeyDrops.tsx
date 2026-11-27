// Task #235 (the 18 Nov portfolios pack, B15 v5): a drop-down on the Against peers, Price trend and Valuation cards of Key figures (Portfolio view). Each
// opens a panel inside its card listing the shares behind the figure, grouped the way the figure counts them; a chip jumps to the share's row in Your
// shares and highlights it. Built from the same readings as the table (Vs its peers, Long term, Short term, Val., Prism), so it follows the portfolio.
import type { ReactNode } from "react";
import type { Share } from "../../lib/equityPack";
import { trendBand } from "../../lib/prismTechnical";
import { scoreBand } from "../../lib/scoreBands";
import { coLabel, shortLabel } from "../../lib/companyLabel";

const MINUS = "−";
const sg = (n: number | null) => (n == null ? "—" : `${n > 0 ? "+" : n < 0 ? MINUS : ""}${Math.abs(Math.round(n))}`);
const place = (s: Share) => (s.peer ? s.peer.rank / Math.max(1, s.peer.of) : 1);

/** Scrolls to a share's row in Your shares (under the header and the sticky bar) and highlights it for about 2 seconds. */
export function goToRow(sym: string) {
  const tr = document.querySelector<HTMLElement>(`#pf-shares tr[data-sym="${sym.replace(/["\\]/g, "\\$&")}"]`);
  if (!tr) return;
  const hd = document.querySelector("header.top")?.getBoundingClientRect().height ?? 0, bar = document.querySelector(".eqt-bar")?.getBoundingClientRect().height ?? 0;
  scrollTo({ top: Math.max(0, tr.getBoundingClientRect().top + scrollY - hd - bar - 40), behavior: "smooth" });
  tr.classList.remove("x-flash"); void tr.offsetWidth; tr.classList.add("x-flash"); setTimeout(() => tr.classList.remove("x-flash"), 2200);
}

const Chip = ({ s, extra, tone }: { s: Share; extra?: string; tone?: "up" | "dn" }) => (
  <button type="button" className={"x-kd-c" + (tone ? " " + tone : "")} title={`Go to ${shortLabel(s, 60)}${coLabel(s).code ? ` (${coLabel(s).code})` : ""} in Your shares`} onClick={() => goToRow(s.symbol)}><b>{shortLabel(s)}</b>{extra && <small>{extra}</small>}</button>
);
const Group = ({ k, n, note, children }: { k: string; n: number; note?: string; children: ReactNode }) => (n ? <div className="x-kd-g"><p className="x-kd-k">{k} <span>{n}</span></p>{note && <p className="x-kd-n">{note}</p>}<div className="x-kd-cs">{children}</div></div> : null);

function Peers({ shares }: { shares: Share[] }) {
  const by = (l: string) => shares.filter((s) => s.peer?.label === l);
  const L = by("leader").sort((a, b) => place(a) - place(b)), N = by("in_line").sort((a, b) => place(a) - place(b)), G = by("laggard").sort((a, b) => place(b) - place(a)), X = shares.filter((s) => !s.peer);
  const r = (s: Share) => (s.peer ? `${s.peer.rank} of ${s.peer.of}${s.peer.raw && s.peer.raw !== s.peer.label ? ` · may ${s.peer.raw === "leader" ? "lead" : s.peer.raw === "in_line" ? "be in line" : "lag"} next week` : ""}` : "");
  return <>
    <Group k="Lead" n={L.length}>{L.map((s) => <Chip key={s.symbol} s={s} extra={r(s)} tone="up" />)}</Group>
    <Group k="In line" n={N.length}>{N.map((s) => <Chip key={s.symbol} s={s} extra={r(s)} />)}</Group>
    <Group k="Lag" n={G.length}>{G.map((s) => <Chip key={s.symbol} s={s} extra={r(s)} tone="dn" />)}</Group>
    <Group k="Not compared" n={X.length} note="They trade too thinly to rank fairly, or are not ranked yet.">{X.map((s) => <Chip key={s.symbol} s={s} />)}</Group>
  </>;
}

function Trend({ shares }: { shares: Share[] }) {
  const up = shares.filter((s) => trendBand(s.lt) === "positive"), dn = shares.filter((s) => trendBand(s.lt) === "negative"), sw = shares.filter((s) => trendBand(s.lt) === "neutral"), na = shares.filter((s) => s.lt == null);
  const tn = (v: number | null) => (v == null ? "" : v > 0 ? "x-up" : v < 0 ? "x-dn" : "");
  const row = (s: Share) => { const behind = s.st != null && s.lt != null && s.st < s.lt, b = trendBand(s.lt); return (
    <tr key={s.symbol}><td><Chip s={s} tone={b === "positive" ? "up" : b === "negative" ? "dn" : undefined} /></td>
      <td className="r"><b className={tn(s.lt)}>{sg(s.lt)}</b><small>{s.ltWord ?? ""}</small></td>
      <td className="r"><b className={tn(s.st)}>{sg(s.st)}</b><small>{s.stWord ?? ""}{behind && <>{s.stWord ? " · " : ""}<i>behind</i></>}</small></td></tr>); };
  const sec = (k: string, l: Share[]) => (l.length ? <tbody key={k}><tr className="x-kd-th"><th colSpan={3} scope="colgroup">{k} <span>{l.length}</span></th></tr>{[...l].sort((a, b) => (b.lt ?? -999) - (a.lt ?? -999)).map(row)}</tbody> : null);
  return <>
    <table className="x-kd-t"><thead><tr><th scope="col">Share</th><th scope="col" className="r">Long term</th><th scope="col" className="r">Short term</th></tr></thead>
      {sec("Long-term uptrend", up)}{sec("Sideways", sw)}{sec("Long-term downtrend", dn)}{sec("Not rated yet", na)}</table>
    <p className="x-kd-n">“Behind”: the short-term score is lower than the long-term score.</p>
  </>;
}

function Valuation({ shares }: { shares: Share[] }) {
  const by = (b: string) => shares.filter((s) => scoreBand(s.valuation) === b).sort((a, c) => (a.prism ?? 999) - (c.prism ?? 999));
  const W = by("lo"), F = by("mid"), S = by("hi"), X = shares.filter((s) => s.valuation == null);
  const p = (s: Share) => (s.prism == null ? undefined : `Prism ${Math.round(s.prism)}`);
  return <>
    <Group k="Weak" n={W.length} note="You pay above-typical prices.">{W.map((s) => <Chip key={s.symbol} s={s} extra={p(s)} tone="dn" />)}</Group>
    <Group k="Fair" n={F.length} note="Prices close to typical.">{F.map((s) => <Chip key={s.symbol} s={s} extra={p(s)} />)}</Group>
    <Group k="Strong" n={S.length} note="You pay below-typical prices.">{S.map((s) => <Chip key={s.symbol} s={s} extra={p(s)} tone="up" />)}</Group>
    <Group k="Not scored" n={X.length}>{X.map((s) => <Chip key={s.symbol} s={s} />)}</Group>
  </>;
}

/** The panel for a Key figures card, by its title; null for cards without one. */
export function keyDrop(k: string, shares: Share[]): ReactNode | null {
  if (!shares.length) return null;
  if (k === "Against peers") return <Peers shares={shares} />;
  if (k === "Price trend") return <Trend shares={shares} />;
  if (k === "Valuation") return <Valuation shares={shares} />;
  return null;
}
