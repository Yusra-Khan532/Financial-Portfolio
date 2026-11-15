// Task #135 (dashboard pack 06, section 3): "Your mutual funds at a glance" and "Your ETFs at a glance", beside "Your shares at a glance". The fund figures are the
// MF portfolio page's own (its holdings, Health Scores, overlap, stocks underneath and risk answers, all cached and shared with that page). Members cannot hold
// ETFs in the ETF portfolio (task #136); the ETF panel reads that page's figures the same way. Descriptive only; information only.
import { useMemo } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet, type ApiError } from "../../lib/api";
import { useUI } from "../../lib/ui";
import { useMfPortfolio, useMfSpread } from "../../lib/mfPortfolio";
import { shortFund, type MfRisk } from "../../lib/mfPack";
import { fundBandLine, mfGlance } from "../../lib/dashInvest";
import { MINUS, nf } from "../../lib/format";
import { dayMonth } from "../../lib/dashboard";
import { Tip } from "../sectors/pack/Common";
import { Card, Rows } from "./parts";
import { DashCards } from "./DashCards";
import { cards as etfCards, tiles as etfTiles, useEtfPortfolio, useEtfRisk } from "../../lib/etfPortfolio";

const signed = (v: number | null | undefined, d = 1) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? MINUS : ""}${nf(Math.abs(v), d)}%`);
const ringBand = (label: string | null) => { const l = (label || "").toLowerCase(); return /strong|healthy/.test(l) ? "g" : /average/.test(l) ? "o" : /weak|poor/.test(l) ? "r" : "n"; };

export function FundsGlance() {
  const { has } = useUI();
  const silver = has("silver");
  const q = useMfPortfolio(silver);
  const n = q.data?.count ?? 0;
  const sp = useMfSpread(silver && n > 0);
  const rk = useQuery<MfRisk, ApiError>({ queryKey: ["mf-portfolio", "risk", n], queryFn: () => apiGet<MfRisk>("/api/me/mf-portfolio/risk"), enabled: silver && n > 0, staleTime: 5 * 60_000, retry: false });
  const d = q.data;
  const g = useMemo(() => d ? mfGlance(d.holdings.map((h) => ({ code: h.code, name: h.name, weight: h.weight, r1y: h.returns.r1y, score: h.score.final, label: h.score.label, locked: h.score.locked, parts: h.score.parts })),
    { value: d.summary.score.value, label: d.summary.score.label, locked: d.summary.score.locked }) : null, [d]);
  const nameOf = (code: number) => shortFund(d?.holdings.find((h) => h.code === code)?.name ?? null) || `Scheme ${code}`;

  if (!silver) return (
    <Card id="mfglance" title="Your mutual funds at a glance">
      <div className="dsh-empty"><b>Track your mutual funds</b><p>The MF portfolio is part of Silver: add your funds to see their health, overlap and the stocks underneath here.</p><Link className="dsh-btn" to="/plans">See plans</Link></div>
    </Card>);
  if (q.isLoading) return <Card id="mfglance" title="Your mutual funds at a glance"><Rows n={3} h={40} /></Card>;
  if (q.isError) return <Card id="mfglance" title="Your mutual funds at a glance"><p className="dsh-note" role="alert">Your mutual funds could not be read just now. <Link to="/mf-portfolio">Open the MF portfolio</Link>.</p></Card>;
  if (!d || !n || !g) return (
    <Card id="mfglance" title="Your mutual funds at a glance">
      <div className="dsh-empty"><b>No mutual funds added yet</b><p>Add your mutual funds to see their health and overlap here.</p><Link className="dsh-btn" to="/mf-portfolio">Add a fund →</Link></div>
    </Card>);

  const top = sp.data?.readings.overlap.top ?? null, stock = sp.data?.topStocks?.[0] ?? null;
  const total = Math.max(1, g.bands.g + g.bands.o + g.bands.r + g.bands.n), w = (k: number) => `${(k / total) * 100}%`;
  const watch = g.weakest ? [{ kind: "watch" as const, title: `${shortFund(g.weakest.name)} scores ${g.weakest.label ?? g.weakest.score}`,
    text: `${shortFund(g.weakest.name)} has the lowest Health Score of your funds (${g.weakest.score}${g.weakest.label ? `, ${g.weakest.label}` : ""})${g.weakest.parts.length ? `; its weakest parts are ${g.weakest.parts.join(" and ")}` : ""}.` }] : [];
  return (
    <Card id="mfglance" className="dsh-pg dsh-fg" title={<>Your mutual funds at a glance<Tip text="The same figures as the MF portfolio page: the Health Score (Gold), how much your funds overlap, the stocks underneath and how much they swing." label="About “Your mutual funds at a glance”" /></>}
      sub={`${n} ${n === 1 ? "fund" : "funds"}${d.dataDate ? ` · NAVs of ${dayMonth(d.dataDate)}` : ""}`}>
      {g.locked ? <p className="dsh-note">The Health Score of each fund is part of Gold. <Link to="/plans">See plans</Link>.</p> : (
        <div className="dsh-pg-top">
          <div className={"dsh-pg-ring " + ringBand(g.avgLabel)} role="img" aria-label={`Average Health Score ${g.avg ?? "not available"} out of 100${g.avgLabel ? `, ${g.avgLabel}` : ""}`} style={{ ["--v" as string]: g.avg ?? 0 }}><b>{g.avg ?? "—"}</b></div>
          <div>
            <p className="dsh-lh first">Health Score{g.avgLabel ? ` · ${g.avgLabel}` : ""}</p>
            <div className="dsh-pg-mix" role="img" aria-label={fundBandLine(g.bands)}>
              {g.bands.g > 0 && <i className="g" style={{ width: w(g.bands.g) }} />}{g.bands.o > 0 && <i className="o" style={{ width: w(g.bands.o) }} />}{g.bands.r > 0 && <i className="r" style={{ width: w(g.bands.r) }} />}{g.bands.n > 0 && <i className="n" style={{ width: w(g.bands.n) }} />}
            </div>
            <p className="dsh-pg-legend" aria-hidden="true">{fundBandLine(g.bands)}</p>
          </div>
        </div>)}
      <dl className="dsh-fg-kv">
        <div><dt>Highest overlap</dt><dd>{sp.isLoading ? <i className="skeleton sk-n" /> : top && top.n > 0 ? `${Math.round(top.pct)}% · ${nameOf(top.a)} and ${nameOf(top.b)}` : <span title={n < 2 ? "Needs two or more funds" : "Needs the share holdings of two or more funds"}>—</span>}</dd></div>
        <div><dt>Biggest stock underneath</dt><dd>{sp.isLoading ? <i className="skeleton sk-n" /> : stock ? `${stock.name} ${nf(stock.w * 100, 1)}%` : <span title="No fund's share holdings are loaded yet">—</span>}</dd></div>
        <div><dt>Swing a year</dt><dd>{rk.isLoading ? <i className="skeleton sk-n" /> : rk.data?.list.swing != null ? `${nf(rk.data.list.swing, 1)}% · Nifty 500 ${rk.data.bench.swing != null ? nf(rk.data.bench.swing, 1) + "%" : "—"}` : <span title={rk.data?.list.why ?? rk.data?.why ?? "Not enough NAV history yet"}>—</span>}</dd></div>
        <div><dt>Over 1 year</dt><dd className={g.r1y == null ? "" : g.r1y > 0 ? "up" : g.r1y < 0 ? "down" : ""}>{g.r1y == null ? <span title="No fund has a year of NAVs yet">—</span> : signed(g.r1y)}</dd></div>
      </dl>
      {watch.length > 0 && <div className="sp dsh-cards dsh-cards-after"><DashCards items={watch} scope="mfglance" /></div>}
      <Link className="dsh-link foot" to="/mf-portfolio">Open the MF portfolio →</Link>
    </Card>
  );
}

/** Your ETFs at a glance (task #135, filled by the ETF portfolio of task #136): what they track with counts, the yearly cost, price against value, how much
 *  they swing against the Nifty 500 and the change over 1 year, one Watch out line, and the way to the ETF portfolio. Empty state with no ETFs. */
export function EtfsGlance() {
  const { has } = useUI();
  const silver = has("silver");
  const q = useEtfPortfolio(silver);
  const n = q.data?.count ?? 0;
  const rk = useEtfRisk(silver && n > 0, n);
  const hs = useMemo(() => (q.data?.holdings ?? []).filter((h) => !h.missing), [q.data]);
  const t = useMemo(() => etfTiles(hs), [hs]);
  if (!silver) return (
    <Card id="etfglance" title="Your ETFs at a glance">
      <div className="dsh-empty"><b>Track your ETFs</b><p>The ETF portfolio is part of Silver: add your ETFs to see what they track, their cost and their price against NAV here.</p><Link className="dsh-btn" to="/plans">See plans</Link></div>
    </Card>);
  if (q.isLoading) return <Card id="etfglance" title="Your ETFs at a glance"><Rows n={3} h={40} /></Card>;
  if (!n) return (
    <Card id="etfglance" title="Your ETFs at a glance">
      <div className="dsh-empty"><b>No ETFs added yet</b><p>Add your ETFs to see what they track, their yearly cost and their price against NAV here.</p><Link className="dsh-btn" to="/etf-portfolio">Add an ETF →</Link></div>
    </Card>);
  const idx = new Map<string, number>();
  for (const h of hs) { const k = h.index?.label ?? "Not told"; idx.set(k, (idx.get(k) ?? 0) + 1); }
  const tw = hs.reduce((a, h) => a + (h.ret1y != null ? h.weight ?? 0 : 0), 0);
  const r1y = tw > 0 ? hs.reduce((a, h) => a + (h.ret1y != null ? (h.ret1y as number) * (h.weight ?? 0) : 0), 0) / tw : null;
  const watch = etfCards(hs, rk.data).filter((c) => c.kind === "watch").slice(0, 1);
  return (
    <Card id="etfglance" className="dsh-pg dsh-fg" title={<>Your ETFs at a glance<Tip text="The same figures as the ETF portfolio page: what your ETFs track, their yearly cost, how close their prices are to NAV and how much they swing." label="About “Your ETFs at a glance”" /></>}
      sub={`${n} ${n === 1 ? "ETF" : "ETFs"}${q.data?.asOf ? ` · prices of ${dayMonth(q.data.asOf)}` : ""}`}>
      <ul className="dsh-eg-chips" aria-label="What they track">{[...idx.entries()].sort((a, b) => b[1] - a[1]).map(([k, c]) => <li key={k}>{k} <b>{c}</b></li>)}</ul>
      <dl className="dsh-fg-kv">
        <div><dt>Yearly cost</dt><dd>{t.cost.avg == null ? <span title="No expense ratio published yet">—</span> : `${t.cost.avg.toFixed(2)}% a year`}</dd></div>
        <div><dt>Price against value</dt><dd>{t.nav.of ? `${t.nav.within} of ${t.nav.of} within 0.2% of NAV` : <span title="No NAV for the day of the last close yet">—</span>}</dd></div>
        <div><dt>Swing a year</dt><dd>{rk.isLoading ? <i className="skeleton sk-n" /> : rk.data?.list.swing != null ? `${nf(rk.data.list.swing, 1)}% · Nifty 500 ${rk.data.bench.swing != null ? nf(rk.data.bench.swing, 1) + "%" : "—"}` : <span title={rk.data?.list.why ?? "Not enough price history yet"}>—</span>}</dd></div>
        <div><dt>Over 1 year</dt><dd className={r1y == null ? "" : r1y > 0 ? "up" : r1y < 0 ? "down" : ""}>{r1y == null ? <span title="No ETF has a year of prices yet">—</span> : signed(r1y)}</dd></div>
      </dl>
      {watch.length > 0 && <div className="sp dsh-cards dsh-cards-after"><DashCards items={watch} scope="etfglance" /></div>}
      <Link className="dsh-link foot" to="/etf-portfolio">Open the ETF portfolio →</Link>
    </Card>
  );
}
