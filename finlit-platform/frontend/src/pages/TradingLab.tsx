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

const DISCLAIMER = "The Trading Lab is an education and research tool. It describes how rules and price patterns behaved in the past and simulates plans you enter; it does not tell anyone to buy, sell or hold, and it never places an order. Simulations and backtests are built from past prices and can be wrong or delayed; past results do not predict future returns. Intraday trading carries a high risk of loss, and most people who trade intraday lose money. Information only, not investment advice.";

function Gate({ reason }: { reason: "sign_in" | "not_granted" }) {
  return (
    <div className="card tlab-gate" role="status">
      <span className="tlab-ic" aria-hidden="true"><Icon name="lock" /></span>
      <div>
        <h2>{reason === "sign_in" ? "Sign in to open the Trading Lab" : "The Trading Lab is open by invitation"}</h2>
        <p className="muted">{reason === "sign_in"
          ? "The Trading Lab is available to members the FinLit team has invited. Sign in first; if you have been invited, it opens here."
          : "It is not part of any plan: the FinLit team opens it to named members while the tools are being built and checked. Write to us if you would like to take part."}</p>
        {reason === "sign_in" ? <Link className="btn primary" to="/login?next=/lab">Sign in</Link> : <Link className="btn" to="/contact">Contact the team</Link>}
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
        {a && !a.access && <Gate reason={a.reason === "sign_in" ? "sign_in" : "not_granted"} />}
        {a?.access && <>
          <p className="tlab-who muted">{a.reason === "admin" ? "You have access as an administrator." : a.expiresAt ? `You have access until ${new Date(a.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.` : "You have access."}</p>
          <div className="tlab-grid">{LAB_TOOLS.map((t) => (
            <article className="card tlab-tool" key={t.id} aria-labelledby={`tlab-${t.id}`}>
              <div className="tlab-th"><span className="tlab-ic" aria-hidden="true"><Icon name={t.icon} /></span><h2 id={`tlab-${t.id}`}>{t.name}</h2><span className="chip">{t.status}</span></div>
              <p>{t.what}</p>
              <small className="muted">{t.from}</small>
            </article>))}</div>
          <p className="muted tlab-note">The tools arrive one at a time, each checked before it opens. Data: FinLit's own NSE prices (daily history and Dhan's intraday candles). Methods adapted, under their open licences, from <a href="https://github.com/heysanjeevv/market-lab" target="_blank" rel="noopener noreferrer">market-lab</a> (MIT), the <a href="https://github.com/Jakeschincariol/day-trader-skill" target="_blank" rel="noopener noreferrer">Day Trader skill</a> (MIT) and <a href="https://github.com/TauricResearch/TradingAgents" target="_blank" rel="noopener noreferrer">TradingAgents</a> (Apache-2.0).</p>
        </>}
        <div className="pdisc tlab-disc" role="note" aria-labelledby="tlab-disc-h"><h2 id="tlab-disc-h">Disclaimer</h2><p>{DISCLAIMER}</p></div>
      </div></section>
    </>
  );
}
