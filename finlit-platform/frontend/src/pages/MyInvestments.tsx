// /my-investments: All my investments (task #137, the team's 14 Nov pack "finlit-08-all-my-investments"). One page that reads the member's shares (Equity
// portfolio) and mutual funds (MF portfolio) together and looks through each fund to the companies inside it. No new list: changing a list on its own page
// changes this page. ETFs: the ETF portfolio does not exist yet, so every ETF part says it is coming (founder, 15 Nov 2026); no figure is made up.
// Plans (founder): Silver and Gold; shares read with FinLit IQ on Silver and FinLit Prism on Gold; the funds' FundPulse is Gold only. Describes; never advises.
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Gate } from "../components/Gate";
import { HScroll } from "../components/HScroll";
import { Icon } from "../lib/icons";
import { dateIN, nf } from "../lib/format";
import { usePortfolio } from "../lib/portfolio";
import { useDocTitle } from "../lib/title";
import { useUI } from "../lib/ui";
import { MODEL_NAME, chg, pctOf, rupees, segRows, shareScoreWord, splitText, useAllInvestments, type AllInvestments, type PartCard, type Seg } from "../lib/myInvest";
import "../styles/myinvest.css";

type Tab = "overview" | "look" | "risk";
const TABS: { id: Tab; label: string; sub: string }[] = [
  { id: "overview", label: "Overview", sub: "The parts side by side" }, { id: "look", label: "Look-through", sub: "Every company, counted once" }, { id: "risk", label: "Risk", sub: "How it all swings together" },
];
const TOP = 10;

export function MyInvestmentsPage() {
  useDocTitle("All my investments", "Your shares and mutual funds in one place: what you own underneath, how it is spread, and how risky it is all together. Information only, not investment advice.");
  return (
    <div className="wrap mi">
      <Gate tier="silver" title="See all your investments together" points={["Your shares and mutual funds in one place, valued from your quantities", "Every company you own, counted once, looking through your funds", "How it all swings against the Nifty 500", "FinLit IQ on Silver, FinLit Prism on Gold"]}>
        <Body />
      </Gate>
    </div>
  );
}

function Body() {
  const { has } = useUI();
  const { holdings } = usePortfolio();
  const q = useAllInvestments(holdings, has("silver"));
  const d = q.data;
  const [tab, setTab] = useState<Tab>("overview");
  const go = (t: Tab) => { setTab(t); window.setTimeout(() => document.getElementById("mi-tabs")?.scrollIntoView({ block: "start", behavior: "smooth" }), 0); };
  const nShares = d?.parts.shares.count ?? new Set(holdings.map((h) => h.symbol)).size, nFunds = d?.parts.funds.count;
  return (
    <>
      <header className="card mi-head">
        <div className="mi-hl">
          <p className="mi-tags"><span className="mi-tag new">New page</span><span className="mi-tag">{d?.plan === "gold" ? "Gold · FinLit Prism" : "Silver · FinLit IQ"}</span></p>
          <h1>All my investments</h1>
          <p className="mi-lede">Your shares and mutual funds in one place: what you own underneath, how it is spread, and how risky it is all together. ETFs join once the ETF portfolio is here.</p>
          <p className="mi-links"><Link to="/holdings">Equity portfolio <Icon name="arrow" /></Link><Link to="/mf-portfolio">MF portfolio <Icon name="arrow" /></Link><span className="mi-soon" title={d?.parts.etfs.why}>ETF portfolio · coming</span></p>
        </div>
        <div className="mi-hr">
          <div className="mi-acts">
            <Pop label="Add quantities" primary items={[["Shares: on the Equity portfolio", "/holdings"], ["Mutual funds: on the MF portfolio", "/mf-portfolio"]]} />
            <Pop label="Import a broker file" items={[["Shares: import on the Equity portfolio", "/holdings"], ["Mutual funds: import a CAS or statement on the MF portfolio", "/mf-portfolio"]]} />
          </div>
          <p className="mi-count">{nf(nShares, 0)} share{nShares === 1 ? "" : "s"} · {nFunds == null ? "…" : nf(nFunds, 0)} mutual fund{nFunds === 1 ? "" : "s"} · ETFs coming · nothing is sent to a broker</p>
        </div>
      </header>

      {q.isLoading && <div className="skeleton mi-skel" aria-busy="true" />}
      {q.isError && <div className="state" role="alert"><h2>Could not read your investments</h2><p>{q.error?.message || "Please try again in a moment."} <button className="btn" onClick={() => q.refetch()}>Try again</button></p></div>}
      {d && d.parts.shares.count + d.parts.funds.count === 0 && (
        <section className="card mi-empty"><h2>Nothing to read yet</h2><p>Add shares on the <Link to="/holdings">Equity portfolio</Link> or funds on the <Link to="/mf-portfolio">MF portfolio</Link>. This page reads both lists; it keeps no list of its own.</p></section>)}
      {d && d.parts.shares.count + d.parts.funds.count > 0 && <>
        <Money d={d} />
        <Tiles d={d} go={go} />
        <div className="mi-tabs" id="mi-tabs" role="tablist" aria-label="All my investments">
          {TABS.map((t) => <button key={t.id} type="button" role="tab" id={`mi-t-${t.id}`} aria-selected={tab === t.id} aria-controls={`mi-p-${t.id}`} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}><b>{t.label}</b><small>{t.sub}</small></button>)}
        </div>
        <div role="tabpanel" id={`mi-p-${tab}`} aria-labelledby={`mi-t-${tab}`}>
          {tab === "overview" && <Overview d={d} />}
          {tab === "look" && <LookThrough d={d} />}
          {tab === "risk" && <RiskTab d={d} />}
        </div>
        {(d.unknown.length > 0 || d.noHoldings.length > 0) && <p className="faint mi-note">
          {d.unknown.length > 0 && <>Not read: {d.unknown.join(", ")} (not a company FinLit lists). </>}
          {d.noHoldings.length > 0 && <>No monthly portfolio file yet for {d.noHoldings.join(", ")}: counted in the money, not in the look-through.</>}</p>}
      </>}
      <Faq />
      <p className="faint mi-fine">{d?.disclaimer ?? "Information only, not investment advice."} Silver shows your shares with FinLit IQ, Gold with FinLit Prism and adds the funds' FundPulse. Nothing is sent to a broker.</p>
    </>
  );
}

function Pop({ label, items, primary }: { label: string; items: [string, string][]; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="mi-pop" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <button type="button" className={"btn" + (primary ? " primary" : "")} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}>{label}</button>
      {open && <span className="mi-popl" role="group" aria-label={label}>{items.map(([t, to]) => <Link key={t} to={to}>{t} <Icon name="arrow" /></Link>)}<small>It is written into that list; this page reads it from there.</small></span>}
    </span>
  );
}

/* ---- "Where your money sits" */
function Money({ d }: { d: AllInvestments }) {
  const s = d.parts.shares, f = d.parts.funds;
  const part = (k: "shares" | "funds", p: PartCard, name: string, unit: string) => (
    <li className={"mi-mp " + k}><b>{name} · {pctOf(p.share, 0)}</b><span>{p.valued && p.value != null ? `${rupees(p.value)} · ` : ""}{nf(p.count, 0)} {unit}{p.count === 1 ? "" : "s"}{p.chg1y != null ? ` · ${chg(p.chg1y)} a year` : ""}</span></li>);
  return (
    <section className="mi-money" aria-labelledby="mi-money-h">
      <div className="mi-mh"><h2 id="mi-money-h">Where your money sits</h2><span>{d.byValue ? "From the quantities you added · latest prices and NAVs" : "Counting each holding the same until quantities are added"}</span></div>
      {d.byValue && d.total != null
        ? <p className="mi-total"><b>{rupees(d.total)}</b>{d.chg1y != null && <span>{chg(d.chg1y)} over the last year</span>}</p>
        : <p className="mi-total none"><b>{nf(s.count, 0)} share{s.count === 1 ? "" : "s"} · {nf(f.count, 0)} fund{f.count === 1 ? "" : "s"}</b><Link to={!s.valued && s.count ? "/holdings" : "/mf-portfolio"}>Add quantities to see your money <Icon name="arrow" /></Link></p>}
      <div className="mi-bar" role="img" aria-label={`Shares ${pctOf(s.share, 0)}, mutual funds ${pctOf(f.share, 0)}, ETFs coming`}>
        {s.share > 0 && <i className="shares" style={{ flexBasis: `${s.share}%` }} />}{f.share > 0 && <i className="funds" style={{ flexBasis: `${f.share}%` }} />}</div>
      <ul className="mi-mparts">
        {part("shares", s, "Shares", "share")}{part("funds", f, "Mutual funds", "fund")}
        <li className="mi-mp etfs"><b>ETFs · coming</b><span>{d.parts.etfs.why}</span></li>
      </ul>
      {!d.byValue && <p className="mi-eq">Until quantities are added for every part, each part counts the same, and so does each holding without a quantity. The figures describe your list, not your money.</p>}
    </section>
  );
}

/* ---- the five tiles */
function Tiles({ d, go }: { d: AllInvestments; go: (t: Tab) => void }) {
  const m = d.mix, top = d.companies[0], s = d.parts.shares, f = d.parts.funds;
  const outside = (m.debt ?? 0) + (m.cash ?? 0);
  const model = s.scoreModel ?? "iq";
  const Tile = ({ k, label, big, text, link, to }: { k: string; label: string; big: ReactNode; text: ReactNode; link: string; to: Tab }) => (
    <div className={"mi-tile " + k}><h3>{label}</h3><p className="mi-big">{big}</p><p className="mi-tt">{text}</p><button type="button" className="mi-tl" onClick={() => go(to)}>{link} <Icon name="arrow" /></button></div>);
  return (
    <div className="mi-tiles">
      <Tile k="blue" label="Asset mix" big={`${pctOf(m.equity ?? 0, 0)} shares`} text={<>{m.other ? `Other (gold and the rest) ${pctOf(m.other, 0)} · ` : ""}debt and cash {pctOf(outside, 0)}{m.unknown ? ` · not known ${pctOf(m.unknown, 0)}` : ""}, counting what sits inside each fund</>} link="See the look-through" to="look" />
      <Tile k="amber" label="Biggest company" big={top ? `${top.name} ${pctOf(top.all)}` : "—"} text={top ? splitText(top) : "No company in your lists yet."} link="See the look-through" to="look" />
      <Tile k="teal" label="Held twice" big={`${nf(d.heldTwice, 0)} compan${d.heldTwice === 1 ? "y" : "ies"}`} text="You own them directly and again through a fund" link="See which" to="look" />
      <Tile k="green" label="Health" big={<>{s.score != null ? nf(s.score, 0) : "—"} · {f.scoreLocked ? <span className="mi-lock" title="The funds' FundPulse comes with Gold"><Icon name="lock" /></span> : f.score != null ? nf(f.score, 0) : "—"}</>}
        text={<>Shares: {MODEL_NAME[model]} {s.score != null ? `${nf(s.score, 0)}, ${shareScoreWord(s.score, model)}` : "not rated yet"}. Funds: {f.scoreLocked ? "FundPulse comes with Gold" : f.score != null ? `FundPulse ${nf(f.score, 0)}, ${f.scoreWord ?? ""}` : "no FundPulse yet"}</>} link="See each part" to="overview" />
      <Tile k="grey" label="Risk level" big={d.risk?.level ?? "—"} text={d.risk?.level ? "than the Nifty 500, shares and funds together" : d.riskWhy ?? "Not worked out yet."} link="See risk" to="risk" />
    </div>
  );
}

/* ---- Overview: the part cards and up to three insights */
function Overview({ d }: { d: AllInvestments }) {
  const s = d.parts.shares, f = d.parts.funds, model = s.scoreModel ?? "iq";
  const Row = ({ k, v, tone }: { k: string; v: ReactNode; tone?: number | null }) => <div className="mi-pr"><span>{k}</span><b className={tone == null ? "" : tone > 0 ? "up" : tone < 0 ? "down" : ""}>{v}</b></div>;
  const head = (cls: string, name: string, p: PartCard) => <div className="mi-pch"><span className={"mi-pt " + cls}>{name}</span><small>{nf(p.count, 0)} · {pctOf(p.share, 0)}</small></div>;
  return (
    <>
      <div className="mi-parts">
        <section className="card mi-pc" aria-label="Shares">
          {head("shares", "Shares", s)}
          <p className="mi-pv">{s.valued && s.value != null ? rupees(s.value) : "Add quantities to see the value"}</p>
          <Row k="Over 1 year" v={chg(s.chg1y)} tone={s.chg1y} />
          <Row k={`${MODEL_NAME[model]}, average`} v={s.score != null ? `${nf(s.score, 0)} · ${shareScoreWord(s.score, model)}` : "not rated yet"} />
          <Row k="Against peers" v={s.peers?.shown ? `${s.peers.lead} lead · ${s.peers.lag} lag` : "not shown yet"} />
          <Row k="Largest" v={s.largest?.name ?? "—"} />
          <Link className="mi-open" to="/holdings">Open the equity portfolio <Icon name="arrow" /></Link>
        </section>
        <section className="card mi-pc" aria-label="Mutual funds">
          {head("funds", "Mutual funds", f)}
          <p className="mi-pv">{f.valued && f.value != null ? rupees(f.value) : "Add units to see the value"}</p>
          <Row k="Over 1 year" v={chg(f.chg1y)} tone={f.chg1y} />
          <Row k="FundPulse, average" v={f.scoreLocked ? <span className="mi-lock"><Icon name="lock" /> Gold</span> : f.score != null ? `${nf(f.score, 0)} · ${f.scoreWord ?? ""}` : "no score yet"} />
          <Row k="Highest overlap" v={f.overlap ? <span title={`${f.overlap.a} and ${f.overlap.b}`}>{pctOf(f.overlap.pct, 0)}</span> : f.count > 1 ? "—" : "needs two funds"} />
          <Row k="Largest" v={f.largest?.name ?? "—"} />
          <Link className="mi-open" to="/mf-portfolio">Open the MF portfolio <Icon name="arrow" /></Link>
        </section>
        <section className="card mi-pc soon" aria-label="ETFs">
          <div className="mi-pch"><span className="mi-pt etfs">ETFs</span><small>coming</small></div>
          <p className="mi-pv">Coming</p>
          <p className="mi-soon-t">{d.parts.etfs.why} Their cost, price against value and an index held twice will show here.</p>
        </section>
      </div>
      {d.insights.length > 0 && <div className="mi-ins">{d.insights.map((i) => (
        <div key={i.id} className={"mi-in " + i.id}><small>{i.id === "sector" ? "Watch out" : i.id === "soften" ? "Good sign" : "Insight"}</small><b>{i.title}</b><p>{i.text}</p></div>))}</div>}
    </>
  );
}

/* ---- Look-through */
function LookThrough({ d }: { d: AllInvestments }) {
  const [seg, setSeg] = useState<Seg>("all");
  const [all, setAll] = useState(false);
  const rows = segRows(d.companies, seg), shown = all ? rows : rows.slice(0, TOP);
  const maxS = Math.max(1, ...d.sectors.slice(0, 8).flatMap((s) => [s.mine, s.bench ?? 0]));
  return (
    <>
      <section className="card mi-sec" aria-labelledby="mi-lt-h">
        <div className="mi-sh"><div><h2 id="mi-lt-h">Every company you own, counted once</h2>
          <p className="faint">Direct holdings plus what sits inside your funds{d.holdingsAsOf ? ` (their ${dateIN(d.holdingsAsOf, { day: "numeric", month: "short" })} portfolio files)` : ""}, as a share of everything.</p></div>
          <div className="mi-seg" role="group" aria-label="Which companies">{([["all", "All"], ["twice", "Held twice"], ["through", "Only through funds and ETFs"]] as [Seg, string][]).map(([k, t]) =>
            <button key={k} type="button" aria-pressed={seg === k} onClick={() => { setSeg(k); setAll(false); }}>{t}</button>)}</div></div>
        <HScroll className="mi-tw" label="companies table">
          <table className="mi-t">
            <caption className="sr-only">Every company you own, counted once: held directly, through funds and through ETFs, as a share of everything</caption>
            <thead><tr><th scope="col" className="l">Company</th><th scope="col">Direct</th><th scope="col">Through funds</th><th scope="col">Through ETFs</th><th scope="col">All together</th><th scope="col" className="l">Against peers</th></tr></thead>
            <tbody>{shown.map((c) => (
              <tr key={c.symbol}><th scope="row" className="l"><Link to={`/stocks/${c.symbol}`}>{c.name}</Link><small>{c.sector ?? "No sector on record"}</small></th>
                <td>{c.direct > 0 ? pctOf(c.direct) : "—"}</td><td>{c.funds > 0 ? pctOf(c.funds) : "—"}</td><td title="The ETF portfolio is coming">—</td><td><b>{pctOf(c.all)}</b></td>
                <td className="l">{c.peer ?? (d.peersShown ? "Not ranked" : "—")}</td></tr>))}
              {!shown.length && <tr><td colSpan={6} className="l faint">No company in this view.</td></tr>}</tbody>
          </table>
        </HScroll>
        <p className="faint mi-tn">{rows.length > TOP && !all ? <>Top {TOP} of {nf(rows.length, 0)} companies. <button type="button" className="mi-more" onClick={() => setAll(true)}>Show all {nf(rows.length, 0)}</button> </> : `${nf(rows.length, 0)} compan${rows.length === 1 ? "y" : "ies"}. `}
          Holdings inside funds can have changed since the fund house published its file.{!d.peersShown && " Against peers shows once the peer comparison is switched on for everyone."}</p>
      </section>
      <section className="card mi-sec" aria-labelledby="mi-sc-h">
        <h2 id="mi-sc-h">Sectors, counted through everything</h2>
        <p className="faint">Your share in each sector against the Nifty 500 (its companies by market value).</p>
        <ul className="mi-sectors">{d.sectors.slice(0, 8).map((s) => (
          <li key={s.sector}><span className="mi-sn">{s.sector}</span><span className="mi-sb mine"><i style={{ width: `${(s.mine / maxS) * 100}%` }} /></span><b>{pctOf(s.mine, 0)}</b>
            <span className="mi-sn sub">Nifty 500</span><span className="mi-sb bench"><i style={{ width: `${((s.bench ?? 0) / maxS) * 100}%` }} /></span><b className="sub">{s.bench == null ? "—" : pctOf(s.bench, 0)}</b></li>))}</ul>
      </section>
    </>
  );
}

/* ---- Risk */
function RiskTab({ d }: { d: AllInvestments }) {
  const r = d.risk;
  if (!r) return <section className="card mi-sec"><h2>Everything against the Nifty 500</h2><p className="faint">{d.riskWhy ?? "Not worked out yet."}</p></section>;
  const name = { shares: "Shares", funds: "Mutual funds" };
  return (
    <>
      <section className="card mi-sec" aria-labelledby="mi-rk-h">
        <h2 id="mi-rk-h">Everything against the Nifty 500</h2>
        <p className="faint">{d.byValue ? "Weighted by the quantities you added" : "Each part and each holding counted the same until quantities are added"} · weekly prices and NAVs over the last {r.years} years ({r.weeks} weeks). It describes the past; it is not a forecast.</p>
        {r.level && <p className="mi-level">Risk level: {r.level.toLowerCase()} than the Nifty 500.</p>}
        <div className="mi-rks">
          <div><h3>Swing a year</h3><b>{pctOf(r.swing)}</b><small>Nifty 500: {pctOf(r.benchSwing)}</small></div>
          <div><h3>Worst fall</h3><b>{chg(r.worstFall)}</b><small>Nifty 500: {chg(r.benchWorstFall)}</small></div>
          <div><h3>Beta</h3><b>{r.beta == null ? "—" : nf(r.beta, 2)}</b><small>{r.beta == null ? "Not enough weeks" : `moved ${nf(r.beta * 10, 1)}% for a 10% market move`}</small></div>
          <div><h3>Falls taken</h3><b>{r.fallsTaken == null ? "—" : pctOf(r.fallsTaken, 0)}</b><small>of the Nifty 500's down weeks</small></div>
        </div>
      </section>
      {r.parts.length > 0 && (
        <section className="card mi-sec" aria-labelledby="mi-sw-h">
          <h2 id="mi-sw-h">Where the swings come from</h2>
          <p className="faint">Each part's share of the ups and downs of the whole, next to its share of the money.</p>
          <ul className="mi-swings">{r.parts.map((p) => (
            <li key={p.part}><span>{name[p.part]}</span><span className={"mi-sb " + p.part}><i style={{ width: `${Math.max(0, Math.min(100, p.swings ?? 0))}%` }} /></span><b>{p.swings == null ? "—" : pctOf(p.swings, 0)}</b><small>{pctOf(p.money, 0)} of the money</small></li>))}</ul>
          {r.lines.map((l) => <p key={l} className="mi-swl">{l}</p>)}
        </section>)}
    </>
  );
}

/* ---- FAQ: six questions */
const FAQ: [string, ReactNode][] = [
  ["Where do the numbers come from?", <>Your shares come from your <Link to="/holdings">Equity portfolio</Link> and your funds from your <Link to="/mf-portfolio">MF portfolio</Link>; this page keeps no list of its own. Prices are the exchange's closing prices; NAVs, scheme names and fund sizes come from AMFI; what sits inside each fund comes from the fund house's monthly portfolio file. The Nifty 500 is its published index level.</>],
  ["Why do I need quantities?", "Without quantities the page cannot know how much money sits in each holding, so it counts each holding the same, and each part the same, and says so. Add how many shares and units you hold on their own pages and every figure here is weighted by your money."],
  ["How are funds and ETFs looked through?", "Each fund's share of everything is spread over the companies in its latest monthly portfolio file, by each company's share of the fund's net assets. A company's figure here is what you hold directly plus what your funds hold of it. Debt, cash and other holdings stay in the asset mix. ETFs will be looked through the same way once the ETF portfolio is here."],
  ["What does my plan show here?", "Silver shows the whole page with your shares read through FinLit IQ. Gold shows them through FinLit Prism and adds the funds' FundPulse. A free account sees what the page offers."],
  ["Why is a company counted three times?", "It is counted once, as one row: what you hold directly, what your funds hold and, later, what your ETFs hold are added into the All together figure. The columns show where each part comes from."],
  ["Is anything sent to my broker?", "No. Nothing is sent to a broker and nothing is traded. The page only reads the lists you keep on FinLit."],
];
function Faq() {
  return (
    <section className="card mi-faq" aria-labelledby="mi-faq-h">
      <div className="mi-sh"><h2 id="mi-faq-h">Questions about this page</h2><small className="faint">All my investments · {FAQ.length} questions</small></div>
      {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><div className="mi-fa">{a}</div></details>)}
    </section>
  );
}
