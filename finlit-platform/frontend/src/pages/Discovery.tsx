// Discovery as its own page (task #241, 19 Nov 2026: "bring discovery outside bot on workspace in find stocks"): the same view as the FinLit AI
// panel's Discovery section (components/AskDiscovery, backend finlit/discovery), with a page's room, in the Workspace menu under Find stocks.
import { PageHeader } from "../components/PageHeader";
import { AskDiscovery } from "../components/AskDiscovery";
import { useDocTitle } from "../lib/title";
import "../styles/ask-ai.css";

export function DiscoveryPage() {
  useDocTitle("Discovery", "Companies grouped by the themes their own investor presentations talk about (AI, defence, solar, batteries, data centres, EVs, nuclear, drones and more), with the stage, the tone, recent filings and the NSE sector. Information only, not advice.");
  return (
    <>
      <PageHeader wrap eyebrow="Research" title="Discovery" links={["/screener", "/superinvestors", "/research"]}
        description={<>Themes from companies' own investor presentations: AI, defence, solar, batteries, data centres, EVs, nuclear, drones and more. Each company sits in the theme its newest presentation talks about most, with the stage its own words show, the tone, its recent exchange filings and its NSE sector.</>} />
      <div className="wrap disc-page"><AskDiscovery /></div>
    </>
  );
}
