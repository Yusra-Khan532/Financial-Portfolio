// FinLit Trading Lab (founder, 25 Nov 2026): research tools for NSE traders, open only to members an administrator names (Console > Trading Lab
// access). Ideas and methods from two MIT-licensed projects, rebuilt on FinLit's own NSE data: market-lab (github.com/heysanjeevv/market-lab) and the
// Day Trader skill (github.com/Jakeschincariol/day-trader-skill), plus ideas from TradingAgents (Apache-2.0). Describe, never advise: no orders, no trade calls; simulations run on plans the member
// types in, and every number says what it is built from. docs/TRADING-LAB.md is the plan and the record of what was kept out and why.
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { Icon } from "../lib/icons";
import { labAccess } from "../lib/lab";
import { useDocTitle } from "../lib/title";
import "../styles/portfolio-disc.css";
import "../styles/tradinglab.css";

export const LAB_TOOLS: { id: string; name: string; icon: string; what: string; from: string; status: string }[] = [
  { id: "timemachine", name: "Time Machine", icon: "refresh", what: "Type a plan for an NSE stock (a start price, a lower and an upper exit level). It replays the rest of the session 10,000 times from the stock's own recent 5-minute candles, and re-runs the same rule on every past day it applied, then shows how often each level was reached first.", from: "Idea from the Day Trader skill", status: "Being built" },
  { id: "backtest", name: "Strategy backtest", icon: "line", what: "23 rule-based swing setups (breakouts, pullbacks, momentum and others) tested on five years of a stock's daily prices: how often each worked, the average result, the worst run and every past signal drawn on the chart.", from: "Rules from market-lab", status: "Planned" },
  { id: "scanner", name: "Setup scanner", icon: "search", what: "Each evening, the NSE stocks whose chart matches a rule (a 20-day high close, a flag, an oversold bounce and others). A list of charts that match a rule, not a list of stocks to buy.", from: "From both projects", status: "Planned" },
  { id: "structure", name: "Price structure layer", icon: "bars", what: "On the chart: breaks of structure, order blocks, fair-value gaps and the day's volume-weighted average price, each explained in plain words.", from: "From market-lab", status: "Planned" },
  { id: "journal", name: "Paper journal", icon: "notes", what: "A private notebook of the plans you tested and what happened afterwards, with a short factual note when an entry closes (what happened, the move against the Nifty 50). No real orders, ever.", from: "Ideas from the Day Trader skill and TradingAgents", status: "Planned" },
  { id: "risk", name: "Risk read-out", icon: "gauge", what: "How much a stock has moved: recent against one-year volatility, its deepest fall with dates and whether it recovered, a typical bad day, and how it moves with the Nifty 50. Each figure names the window it is built from.", from: "Idea from TradingAgents", status: "Planned" },
  { id: "case", name: "Case for and case against", icon: "compare", what: "Two short sections from FinLit's own figures: what the numbers support and what they challenge, then what the data cannot settle. A source after every figure, and no verdict or rating.", from: "Idea from TradingAgents", status: "Planned" },
];

// Signals desk (founder, 25 Nov 2026): shown only when an administrator switched this member's signals on (administrators always). These tools give
// trade calls and so do not follow FinLit's describe-only wording: an internal test to check they work end to end, kept to named members.
export const SIGNAL_TOOLS: { id: string; name: string; icon: string; what: string; from: string; status: string }[] = [
  { id: "rating", name: "Rating: Buy, Hold or Sell", icon: "gauge", what: "Analysts for price, news, results and money flows write their reads; a bull and a bear argue them; a manager gives a five-step rating from Buy to Sell with the reasons and the figures behind each.", from: "From TradingAgents", status: "Planned" },
  { id: "plan", name: "Trader's plan", icon: "line", what: "For a rated stock: an entry zone, a stop, a target and a time limit, written as a plan with what would cancel it.", from: "From TradingAgents and the Day Trader skill", status: "Planned" },
  { id: "size", name: "Trade-size debate", icon: "compare", what: "A cautious, a balanced and an aggressive reviewer argue how large the position should be against your budget and your loss limit per trade; the result shows each side's case.", from: "From TradingAgents and the Day Trader skill", status: "Planned" },
];

const SIGNALS_NOTE = " The Signals desk, switched on for your account by an administrator, does give trade calls (Buy, Hold, Sell, a plan and a size) as an internal test: they are unverified and are not FinLit research or advice.";

// How the Lab works, in four steps (shown above the tools so a first visit reads the flow at a glance).
const STEPS: { icon: string; title: string; text: string }[] = [
  { icon: "search", title: "Choose a stock", text: "Any NSE company FinLit follows." },
  { icon: "pencil", title: "Set a plan", text: "A start price and the two levels where you would get out." },
  { icon: "refresh", title: "Replay and test", text: "Thousands of replays from its own recent prices, and the rule on past days." },
  { icon: "pie", title: "Read the odds", text: "How often each level came first, in plain words and charts." },
];

const DISCLAIMER = "The Trading Lab is an education and research tool. It describes how rules and price patterns behaved in the past and simulates plans you enter; it does not tell anyone to buy, sell or hold, and it never places an order. Simulations and backtests are built from past prices and can be wrong or delayed; past results do not predict future returns. Intraday trading carries a high risk of loss, and most people who trade intraday lose money. Information only, not investment advice.";

/** The message for a visitor (sign in, then come back to `next`) or a member without a grant. Shared by every Lab page. */
export function LabGate({ reason, next = "/lab" }: { reason: "sign_in" | "not_granted"; next?: string }) {
  return (
    <div className="card tlab-gate" role="status">
      <span className="tlab-ic" aria-hidden="true"><Icon name="lock" /></span>
      <div>
        <h2>{reason === "sign_in" ? "Sign in to open the Trading Lab" : "The Trading Lab is open by invitation"}</h2>
        <p className="muted">{reason === "sign_in"
          ? "The Trading Lab is available to members the FinLit team has invited. Sign in first; if you have been invited, it opens here."
          : "It is not part of any plan: the FinLit team opens it to named members while the tools are being built and checked. Write to us if you would like to take part."}</p>
        {reason === "sign_in" ? <Link className="btn primary" to={`/login?next=${next}`}>Sign in</Link> : <Link className="btn" to="/contact">Contact the team</Link>}
      </div>
    </div>
  );
}

export function TradingLabPage() {
  useDocTitle("Trading Lab", "Research tools for NSE traders, open by invitation: simulations, backtests and setup scans described from past prices. Not investment advice.");
  const { user, ready } = useAuth();
  const q = useQuery({ queryKey: ["lab-access", user?.id ?? ""], queryFn: labAccess, enabled: ready, retry: false });
  const a = q.data;
  return (
    <>
      <section className="pagehead"><div className="aurora" style={{ opacity: 0.6 }} /><div className="wrap"><div className="eyebrow">By invitation</div>
        <h1 className="ui-title">Trading Lab</h1>
        <p>Research tools for NSE traders: simulations, backtests and setup scans, described from past prices. Nothing here is a trade call.</p></div></section>
      <section className="sec" style={{ paddingTop: 16 }}><div className="wrap tlab">
        {(!ready || q.isPending) && <div className="skeleton" style={{ height: 160 }} aria-label="Checking your access" />}
        {q.isError && <div className="formerr" role="alert">Your access could not be checked right now. Reload the page in a moment.</div>}
        {a && !a.access && <LabGate reason={a.reason === "sign_in" ? "sign_in" : "not_granted"} />}
        {a?.access && <>
          <p className="tlab-who muted">{a.reason === "admin" ? "You have access as an administrator." : a.expiresAt ? `You have access until ${new Date(a.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.` : "You have access."}</p>
          <Link to="/lab/flow" className="card tlab-feature" aria-labelledby="tlab-flow-h">
            <span className="tlab-ic" aria-hidden="true"><Icon name="activity" /></span>
            <span className="tlab-feature-t"><b id="tlab-flow-h">Order Flow</b><small className="muted">How every NSE F&amp;O stock is moving now: market depth, futures build-up, sectors and the stocks with the most facts lined up.</small></span>
            <span className="chip gold">Open</span>
          </Link>
          <ol className="tlab-steps" aria-label="How the Lab works">{STEPS.map((s, i) => (
            <li key={s.title}><span className="tlab-ic" aria-hidden="true"><Icon name={s.icon} /></span><b><span className="tlab-n">{i + 1}</span>{s.title}</b><small className="muted">{s.text}</small></li>))}</ol>
          <div className="tlab-grid">{LAB_TOOLS.map((t) => (
            <article className="card tlab-tool" key={t.id} aria-labelledby={`tlab-${t.id}`}>
              <div className="tlab-th"><span className="tlab-ic" aria-hidden="true"><Icon name={t.icon} /></span><h2 id={`tlab-${t.id}`}>{t.name}</h2><span className="chip">{t.status}</span></div>
              <p>{t.what}</p>
              <small className="muted">{t.from}</small>
            </article>))}</div>
          {a.signals && <section className="tlab-sig" aria-labelledby="tlab-sig-h">
            <div className="tlab-sigh"><h2 id="tlab-sig-h">Signals desk</h2><span className="chip gold">Signals on · internal test</span></div>
            <p className="muted">Switched on for your account by an administrator. These tools give trade calls (Buy, Hold, Sell, a plan and a size) and are being tested before any wider use; they are not FinLit research.</p>
            <div className="tlab-grid">{SIGNAL_TOOLS.map((t) => (
              <article className="card tlab-tool" key={t.id} aria-labelledby={`tlab-${t.id}`}>
                <div className="tlab-th"><span className="tlab-ic" aria-hidden="true"><Icon name={t.icon} /></span><h2 id={`tlab-${t.id}`}>{t.name}</h2><span className="chip">{t.status}</span></div>
                <p>{t.what}</p>
                <small className="muted">{t.from}</small>
              </article>))}</div>
          </section>}
          <p className="muted tlab-note">The tools arrive one at a time, each checked before it opens. Data: FinLit's own NSE prices (daily history and Dhan's intraday candles). Methods adapted, under their open licences, from <a href="https://github.com/heysanjeevv/market-lab" target="_blank" rel="noopener noreferrer">market-lab</a> (MIT), the <a href="https://github.com/Jakeschincariol/day-trader-skill" target="_blank" rel="noopener noreferrer">Day Trader skill</a> (MIT) and <a href="https://github.com/TauricResearch/TradingAgents" target="_blank" rel="noopener noreferrer">TradingAgents</a> (Apache-2.0).</p>
        </>}
        <div className="pdisc tlab-disc" role="note" aria-labelledby="tlab-disc-h"><h2 id="tlab-disc-h">Disclaimer</h2><p>{DISCLAIMER}{a?.signals ? SIGNALS_NOTE : ""}</p></div>
      </div></section>
    </>
  );
}
