// "What it invests in" for one ETF. The section itself (top-10 bars on the ETF page, task #134, "Other holdings", full table, concentration, sector and asset split, monthly changes)
// is the shared one in src/holdings, also used by mutual funds. This file only fetches the portfolio and says so when it cannot.
import { HoldingsSection } from "../holdings";
import { useEtfPortfolio } from "../lib/etf";
import { Skeleton } from "./common";

export function EtfHoldings({ symbol }: { symbol: string }) {
  const { data, isLoading, isError } = useEtfPortfolio(symbol);
  if (isLoading) return <section className="card etf-sec" aria-label="What it invests in"><Skeleton rows={3} /></section>;
  return <HoldingsSection portfolio={isError || !data ? { unavailable: "The portfolio could not be loaded right now. Nothing was changed; please try again." } : data} title="What it invests in" unit="ETF" layout="bars" firstChanges={6} />;   // task #134: the 10 largest as bars, not a donut; the six biggest changes first
}
