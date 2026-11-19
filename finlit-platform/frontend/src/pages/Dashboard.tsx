// The dashboard: a greeting row (date, market state, followed stocks, Setup chip, Customise), then the sticky sections bar and the blocks in five numbered steps (task #195,
// dashboard pack of 15 Nov 2026): 1 Your money, 2 Your watchlist, 3 The market, 4 Results and news, 5 Tools, on every screen size. Every block can be moved inside its step,
// switched off or resized in Customise; a switched-off block leaves its step, and a step with no blocks is not shown. Descriptive only, information only.
import { useEffect, useMemo, useState } from "react";
import { StepHeading, StepsBar, type Step } from "../components/StepsBar";
import { Navigate, useSearchParams } from "react-router";
import { useAuth } from "../lib/auth";
import { RANK, useUI } from "../lib/ui";
import { WIDGETS, prefs, stepGroups, usePrefs } from "../lib/prefs";
import { useUniverse, type Row } from "../lib/screener";
import { useWatchlist, watch } from "../lib/watchlist";
import { useMyCompanies } from "../lib/mycompanies";
import { usePortfolio } from "../lib/portfolio";
import { aggOf } from "../lib/ledger";
import { useIndices } from "../lib/indices";
import { DEMO } from "../lib/demo";
import { useDocTitle } from "../lib/title";
import { firstName, greetingWord, istHour, longDay } from "../lib/dashboard";
import { marketWhen } from "../lib/dashPack";
import { Card } from "../components/dashboard/parts";
import { MyStocks, Signals, type Followed } from "../components/dashboard/MyStocks";
import { MarketToday } from "../components/dashboard/MarketToday";
import { Snapshot, Sectors } from "../components/dashboard/Snapshot";
import { MarketRead } from "../components/dashboard/MarketRead";
import { Flows } from "../components/dashboard/Flows";
import { PortfolioGlance } from "../components/dashboard/Portfolio";
import { EtfsGlance, FundsGlance } from "../components/dashboard/FundsGlance";
import { Stress } from "../components/dashboard/Stress";
import { IndexHeatmap } from "../components/dashboard/Heatmap";
import { AlertsScreens, Filings, Ipos, Learn, ResultsToday } from "../components/dashboard/NewsBlocks";
import { Buckets, CommoditiesW, DcfW, Locked, Movers, Results, SecondLook } from "../components/dashboard/Legacy";
import { SetupChip, useSetup } from "../components/dashboard/Setup";
import { Customise } from "../components/dashboard/Customise";
import { DashCardsProvider } from "../components/dashboard/DashCards";
import { ShowingBar } from "../components/dashboard/ShowingBar";
import { useDashPick, type PickKind } from "../lib/dashPick";
import { PageFaqs } from "../components/PageFaqs";
import "../styles/sectors-pack.css";
import "../styles/dashboard.css";

/** Task #248: the Step 1 blocks that read the member's portfolios; the Showing bar sits above them when any is on. */
const PICKED = new Set(["mystocks", "say", "portfolio", "mfglance", "etfglance"]);

export function Dashboard() {
  useDocTitle("Dashboard", "Your FinLit dashboard: your stocks today, the market, results and filings, arranged your way.");
  const { user, ready, seesAll } = useAuth();
  const { plan, has } = useUI();
  const p = usePrefs();
  const wl = useWatchlist();
  const mine = useMyCompanies();
  const pf = usePortfolio();
  const uni = useUniverse();
  const idx = useIndices();
  const [params, setParams] = useSearchParams();
  const [edit, setEdit] = useState(params.get("edit") === "1");
  const rows: Row[] = uni.data?.rows ?? [];
  const bySym = useMemo(() => new Map(rows.map((r) => [r.symbol, r])), [rows]);
  const followed = useMemo<Followed[]>(() => {
    const out: Followed[] = [], seen = new Set<string>();
    for (const c of mine.companies.filter((c) => c.followed)) if (!seen.has(c.symbol)) { seen.add(c.symbol); out.push({ symbol: c.symbol, name: c.name ?? bySym.get(c.symbol)?.name ?? null }); }
    for (const s of [...wl.lists.flatMap((l) => l.symbols), ...pf.holdings.map((h) => h.symbol)]) if (!seen.has(s)) { seen.add(s); out.push({ symbol: s, name: bySym.get(s)?.name ?? null }); }
    return out;
  }, [mine.companies, wl, pf.holdings, bySym]);
  // task #248: Step 1 reads only the portfolios picked in its Showing bar; Steps 2 to 5 keep reading everything followed and held
  const pick = useDashPick(has("silver"));
  const followedPick = useMemo<Followed[]>(() => {
    if (pick.choice.equity === "all") return followed;
    const keep = new Set([...mine.companies.filter((c) => c.followed).map((c) => c.symbol), ...wl.lists.flatMap((l) => l.symbols), ...pick.holdings.map((h) => h.symbol)]);
    return followed.filter((f) => keep.has(f.symbol));
  }, [followed, pick.choice.equity, pick.holdings, mine.companies, wl]);
  const heldPick = useMemo(() => new Set(pick.holdings.map((h) => h.symbol.toUpperCase())), [pick.holdings]);
  // task #235: what is left of each share, first in, first out within each portfolio, added across the picked ones (a name only, or a share sold in full, has none)
  const qtyPick = useMemo(() => { const m = new Map<string, number>(); for (const s of heldPick) { const q = aggOf(pick.holdings, s, "all")?.qty; if (q) m.set(s, q); } return m; }, [pick.holdings, heldPick]);
  const watchSet = useMemo(() => new Set(wl.lists.flatMap((l) => l.symbols)), [wl]);
  const items = followed.map((f) => bySym.get(f.symbol)).filter((r): r is Row => !!r);
  const caps = useMemo(() => new Map(rows.map((r) => [r.symbol, r.market_cap])), [rows]);
  const oneYear = useMemo(() => new Map(rows.map((r) => [r.symbol, r.return_1y ?? null])), [rows]);   // task #135: the 1 year column
  const names = useMemo(() => new Map(rows.map((r) => [r.symbol, r.name])), [rows]);
  const symbols = useMemo(() => followed.map((f) => f.symbol), [followed]);
  const setup = useSetup(followed.length, p.palette, plan);
  // In the demo there is no server: the first nine largest companies stand in for a watchlist.
  useEffect(() => { if (DEMO && !wl.seeded && rows.length) watch.seed([...rows].sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0)).slice(0, 9).map((r) => r.symbol)); }, [rows, wl.seeded]);
  if (!ready) return <div className="wrap state" role="status"><div className="skeleton" style={{ height: 14, width: 200, margin: "40px auto" }} /></div>;
  if (!user) return <Navigate to="/login?next=%2Fdashboard" replace />;

  const all = seesAll;

  const meta = Object.fromEntries(WIDGETS.map((w) => [w.id, w]));
  const loadingFollowed = !followed.length && mine.isLoading;
  const loadingRows = uni.isLoading;
  // An administrator seeing every plan's features gets every block (founder, 14 Nov 2026), except "Gold & silver today": its prices come through Dhan,
  // whose terms do not allow showing them on the site, so it stays off until a licensed source is connected.
  const shown = p.dashboard.filter((w) => w.on || (all && w.id !== "commodities"));
  const groups = stepGroups(shown);
  const steps: Step[] = groups.map((g) => ({ id: `dsh-s-${g.step.id}`, n: g.step.n, title: g.step.title, line: g.step.line, sections: g.blocks.map((b) => ({ id: `dsh-b-${b.id}`, label: meta[b.id].nav ?? meta[b.id].label })) }));
  const body = (id: string) => {
    const w = meta[id];
    if (RANK[plan] < RANK[w.min]) return <Card id={id} title={w.label}><Locked tier={w.min} label={w.label} /></Card>;
    const legacy = (el: React.ReactNode) => <Card id={id} title={w.label}>{el}</Card>;
    switch (id) {
      case "mystocks": return <MyStocks followed={followedPick} loading={loadingFollowed} watch={watchSet} held={heldPick} caps={caps} oneYear={oneYear} qty={qtyPick}
        mfPf={pick.param.mf} etfPf={pick.param.etf} heldIn={pick.heldIn} showing={pick.showing} eqPicked={pick.choice.equity === "all" ? null : pick.param.equity} />;
      case "say": return <Signals followed={followedPick} caps={caps} />;
      case "market": return <MarketToday />;
      case "snapshot": return <Snapshot rows={rows} loading={loadingRows} />;
      case "sectors": return <Sectors rows={rows} loading={loadingRows} />;
      case "marketread": return <MarketRead rows={rows} loading={loadingRows} />;
      case "flows": return <Flows />;
      case "portfolio": return <PortfolioGlance held={[...heldPick]} rows={rows} loading={loadingRows} />;
      case "mfglance": return <FundsGlance pf={pick.param.mf} />;
      case "etfglance": return <EtfsGlance pf={pick.param.etf} />;
      case "stress": return <Stress followed={followed} loading={loadingFollowed} />;
      case "heatmap": return <IndexHeatmap rows={rows} loading={loadingRows} asOf={uni.data?.asOf} />;
      case "resultstoday": return <ResultsToday symbols={symbols} />;
      case "filings": return <Filings symbols={symbols} />;
      case "ipos": return <Ipos />;
      case "alerts": return <AlertsScreens />;
      case "learn": return <Learn />;
      case "results": return legacy(<Results symbols={symbols.length ? symbols : ["RELIANCE"]} names={names} />);
      case "movers": return legacy(<Movers items={items} />);
      case "second": return legacy(<SecondLook items={items} meta={wl.meta} />);
      case "buckets": return legacy(<Buckets items={items} />);
      case "dcf": return <DcfW />;
      case "commodities": return legacy(<CommoditiesW />);
      default: return null;
    }
  };
  const kinds: PickKind[] = has("silver") ? ["equity", "mf", "etf"] : ["equity"];   // the MF and ETF portfolios are Silver and up
  const name = firstName(user.name, user.email);
  const state = idx.data ? marketWhen(new Date(), idx.data.marketOpen, idx.data.asOf ?? null) : [];   // pack 04: "Market opens at 9:15 · Figures from Friday's close"
  const sub = [longDay(), ...state, followed.length ? `You follow ${followed.length} stock${followed.length === 1 ? "" : "s"}` : loadingFollowed ? null : "You follow no stocks yet"].filter(Boolean).join(" · ");
  return (
    <DashCardsProvider userId={user.id}>
    <div className="wrap dsh">
      <header className="dsh-head">
        <div><div className="dsh-kicker">Dashboard</div><h1>{greetingWord(istHour())}{name ? `, ${name}` : ""}</h1><p className="dsh-meta">{sub}</p></div>
        <div className="dsh-actions"><SetupChip steps={setup.steps} n={setup.n} />
          <button type="button" className="dsh-btn" aria-pressed={edit} onClick={() => { setEdit(!edit); if (params.has("edit")) setParams({}, { replace: true }); }}>{edit ? "Done" : "Customise"}</button></div>
      </header>
      {edit && <Customise layout={p.dashboard} plan={plan} onChange={(dashboard) => prefs.set({ dashboard })} onReset={() => prefs.set({ dashboard: [] })} onDone={() => setEdit(false)} />}
      <StepsBar steps={steps} label="Dashboard sections" />
      <div className="dsh-grid" id="dsh-grid">
        {groups.map((g) => [
          <StepHeading key={"step-" + g.step.id} id={`dsh-s-${g.step.id}`} n={g.step.n} title={g.step.title} line={g.step.line} />,
          ...(g.blocks.some((b) => PICKED.has(b.id)) ? [<div key="dsh-show" className="dsh-cell full" data-block="show"><ShowingBar pick={pick} kinds={kinds} /></div>] : []),
          ...g.blocks.map((w) => <div key={w.id} id={`dsh-b-${w.id}`} className={"dsh-cell " + w.size} data-block={w.id}>{body(w.id)}</div>),
        ])}
        {!shown.length && <Card id="empty" title="Nothing to show here"><p className="dsh-note">Every block is switched off. <button type="button" className="dsh-link" onClick={() => setEdit(true)}>Open Customise</button> to turn some on.</p></Card>}
      </div>
      <PageFaqs inline />
      <p className="dsh-fine">Describes prices, flows and company health from filings and prices; not a recommendation. Information only, not investment advice.</p>
    </div>
    </DashCardsProvider>
  );
}
