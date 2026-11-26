// FinLit Trading Lab (founder, 25 Nov 2026): research tools for NSE traders, open only to members an administrator names (Console > Trading Lab
// access). Ideas and methods from two MIT-licensed projects, rebuilt on FinLit's own NSE data: market-lab (github.com/heysanjeevv/market-lab) and the
// Day Trader skill (github.com/Jakeschincariol/day-trader-skill), plus ideas from TradingAgents (Apache-2.0). Describe, never advise: no orders, no trade calls; simulations run on plans the member
// types in, and every number says what it is built from. docs/TRADING-LAB.md is the plan and the record of what was kept out and why.
import { Link, Navigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { Icon } from "../lib/icons";
import { labAccess } from "../lib/lab";
import { useDocTitle } from "../lib/title";
import "../styles/portfolio-disc.css";
import "../styles/tradinglab.css";

const DISCLAIMER = "The Trading Lab describes how NSE F&O stocks are moving from exchange prices and futures open interest. It does not tell anyone to buy, sell or hold, and it never places an order. Intraday and F&O trading carry a high risk of loss; most people who trade them lose money. Information only, not investment advice.";

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
  useDocTitle("Trading Lab", "Order Flow for NSE F&O stocks, open by invitation. Not investment advice.");
  const { user, ready } = useAuth();
  const q = useQuery({ queryKey: ["lab-access", user?.id ?? ""], queryFn: labAccess, enabled: ready, retry: false });
  const a = q.data;
  // The founder, 26 Nov 2026: the Lab shows only what works, no plans or descriptions. Members with access go straight to the working tools.
  if (a?.access) return <Navigate to="/lab/flow" replace />;
  return (
    <>
      <section className="pagehead"><div className="aurora" style={{ opacity: 0.6 }} /><div className="wrap"><div className="eyebrow">By invitation</div>
        <h1 className="ui-title">Trading Lab</h1></div></section>
      <section className="sec" style={{ paddingTop: 16 }}><div className="wrap tlab">
        {(!ready || q.isPending) && <div className="skeleton" style={{ height: 160 }} aria-label="Checking your access" />}
        {q.isError && <div className="formerr" role="alert">Your access could not be checked right now. Reload the page in a moment.</div>}
        {a && !a.access && <LabGate reason={a.reason === "sign_in" ? "sign_in" : "not_granted"} />}
        <div className="pdisc tlab-disc" role="note" aria-labelledby="tlab-disc-h"><h2 id="tlab-disc-h">Disclaimer</h2><p>{DISCLAIMER}</p></div>
      </div></section>
    </>
  );
}
