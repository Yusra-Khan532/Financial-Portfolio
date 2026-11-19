// Discovery as its own page (task #241, 19 Nov 2026: "bring discovery outside bot on workspace in find stocks"), laid out as the team drew it (task #245,
// "make the UI like this for discovery tab": themes as cards, one theme's companies as cards, sectors as cards; discovery/DiscoveryBoard). The view sits in
// the address (?view=sectors, ?theme=...&sector=...) so Back and a shared link land on the same view. The FinLit AI panel keeps its compact Discovery.
import { useSearchParams } from "react-router";
import { PageHeader } from "../components/PageHeader";
import { useDocTitle } from "../lib/title";
import { Icon } from "../lib/icons";
import { SectorsView, ThemeView, ThemesView, useDiscovery, type Go } from "../discovery/DiscoveryBoard";
import { THEME_ABOUT } from "../discovery/text";
import "../discovery/discovery.css";

export function DiscoveryPage() {
  useDocTitle("Discovery", "Companies grouped by the themes their own investor presentations talk about (AI, defence, solar, batteries, data centres, EVs, nuclear, drones and more), with the stage, the tone, recent filings and the NSE sector. Information only, not advice.");
  const [params, setParams] = useSearchParams();
  const theme = params.get("theme"), sector = params.get("sector"), view = params.get("view") === "sectors" ? "sectors" : "themes";
  const all = useDiscovery();
  const go: Go = (to) => {
    const t = to.theme === undefined ? theme : to.theme, s = to.sector === undefined ? sector : to.sector, v = to.view ?? view;
    const next = new URLSearchParams();
    if (t) { next.set("theme", t); if (s) next.set("sector", s); }
    if (v === "sectors") next.set("view", "sectors");
    setParams(next, { replace: !!theme && !!t && t === theme });
    if (t !== theme) window.scrollTo({ top: 0 });
  };
  const base = theme ? all.data?.themes.find((x) => x.name === theme) : undefined;
  const head = theme
    ? <PageHeader wrap eyebrow="Theme" title={theme} links={["/screener", "/research"]} learn={false}
        back={<button type="button" className="dsb-back" onClick={() => go({ theme: null, sector: null })}><Icon name="arrow" /> All themes</button>}
        description={<>{THEME_ABOUT[theme] ? `${THEME_ABOUT[theme]} ` : null}{base
          ? sector ? <>{(base.sectors?.[sector] ?? 0).toLocaleString("en-IN")} of its {base.primary.toLocaleString("en-IN")} companies are in {sector}.</>
          : <>{base.primary.toLocaleString("en-IN")} {base.primary === 1 ? "company" : "companies"} in this theme.</> : null}</>} />
    : <PageHeader wrap eyebrow="Research" title="Discovery" links={["/screener", "/superinvestors", "/research"]}
        description="See which themes listed companies talk about most in their latest investor presentations."
        meta={all.data?.companies ? <>{all.data.companies.toLocaleString("en-IN")} companies placed from their newest investor presentation{all.data.updated
          ? <>, updated {new Date(all.data.updated).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</> : null}.</> : undefined} />;
  return (
    <>
      {head}
      <div className="wrap dsb-page">
        {all.isError ? <p className="dsb-empty" role="alert">Discovery could not be loaded just now. Please try again in a moment.</p>
          : !all.data ? <p className="dsb-empty" aria-busy="true">Loading Discovery…</p>
          : theme ? <ThemeView key={theme} d={all.data} theme={theme} sector={sector} go={go} />
          : view === "sectors" ? <SectorsView d={all.data} go={go} /> : <ThemesView d={all.data} go={go} />}
      </div>
    </>
  );
}
