// Task #135 (dashboard pack 06, section 3): "Your mutual funds at a glance" and "Your ETFs at a glance", beside "Your shares at a glance". The fund figures are the
// MF portfolio page's own (its holdings, FundPulse scores, overlap, stocks underneath and risk answers, all cached and shared with that page). Task #195: the ETF
// panel is a one-line strip with an empty ring until ETFs are added. Descriptive only; information only.
import { useMemo } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet, type ApiError } from "../../lib/api";
import { useUI } from "../../lib/ui";
import { useMfPortfolio, useMfSpread } from "../../lib/mfPortfolio";
import { useEtfPortfolio } from "../../lib/etfPortfolio";
import { shortFund, type MfRisk } from "../../lib/mfPack";
import { fundBandLine, mfGlance } from "../../lib/dashInvest";
import { MINUS, nf } from "../../lib/format";
import { dayMonth } from "../../lib/dashboard";
import { Tip } from "../sectors/pack/Common";
import { Card, Rows } from "./parts";
import { DashCards } from "./DashCards";
import { ScoreRing } from "../ScoreRing";

const signed = (v: number | null | undefined, d = 1) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? MINUS : ""}${nf(Math.abs(v), d)}%`);

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
    text: `${shortFund(g.weakest.name)} has the lowest FundPulse of your funds (${g.weakest.score}${g.weakest.label ? `, ${g.weakest.label}` : ""})${g.weakest.parts.length ? `; its weakest parts are ${g.weakest.parts.join(" and ")}` : ""}.` }] : [];
  return (
    <Card id="mfglance" className="dsh-pg dsh-fg" title={<>Your mutual funds at a glance<Tip text="The same figures as the MF portfolio page: FundPulse (Gold), how much your funds overlap, the stocks underneath and how much they swing." label="About “Your mutual funds at a glance”" /></>}
      sub={`${n} ${n === 1 ? "fund" : "funds"}${d.dataDate ? ` · NAVs of ${dayMonth(d.dataDate)}` : ""}`}>
      {g.locked ? <p className="dsh-note">FinLit FundPulse of each fund is part of Gold. <Link to="/plans">See plans</Link>.</p> : (
        <div className="dsh-pg-top">
          <div className="dsh-pg-ringw" role="img" aria-label={`Average FundPulse ${g.avg ?? "not available"} out of 100${g.avgLabel ? `, ${g.avgLabel}` : ""}; one arc per fund`}>
            <ScoreRing parts={d.holdings.map((h) => ({ key: String(h.id ?? h.code), value: h.score.final }))} score={g.avg} word={g.avgLabel} /></div>
          <div>
            <p className="dsh-lh first">FundPulse{g.avgLabel ? ` · ${g.avgLabel}` : ""}</p>
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

/** Task #195: "Your ETFs at a glance" as a one-line strip with an empty ring ("— NONE YET") until ETFs are added. ETFs have no score of their own yet, so with ETFs
 *  in the ETF portfolio the strip says how many there are and opens that page. */
export function EtfsGlance() {
  const { has } = useUI();
  const q = useEtfPortfolio(has("silver"));
  const n = q.data?.count ?? 0;
  return (
    <section className="dsh-card dsh-strip dsh-strip1" aria-labelledby="dsh-etfglance">
      <ScoreRing parts={[]} score={null} size={56} />
      <h2 id="dsh-etfglance" className="t">Your ETFs at a glance</h2>
      <p className="m">{n > 0 ? `${n} ${n === 1 ? "ETF" : "ETFs"} in your ETF portfolio. ETFs have no score of their own yet; what they track, their yearly cost and their price against NAV are on the ETF portfolio page.`
        : "No ETFs added yet. Add them to see what they track, their yearly cost and their price against NAV."}</p>
      <Link className="dsh-btn" to={n > 0 || has("silver") ? "/etf-portfolio" : "/etfs"}>{n > 0 ? "Open the ETF portfolio →" : has("silver") ? "Add ETFs →" : "See ETFs →"}</Link>
    </section>
  );
}
