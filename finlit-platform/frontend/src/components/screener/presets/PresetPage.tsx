// The page while a prebuilt screen is open: the screen view beside (or, on a phone, above) the list of screens, so another screen is one tap away.
import type { ReactNode } from "react";
import { Link } from "react-router";
import { TierChip } from "../../Gate";
import { PresetPanel } from "./PresetPanel";
import { ScreensStrip } from "./ScreensStrip";
import { FindStocksTabs } from "../FindStocksTabs";
import { ScreenView } from "./ScreenView";
import type { PresetRoute } from "./usePresetRoute";
import "../../../styles/presets.css";

export function PresetPage({ route, basics }: { route: PresetRoute; basics?: ReactNode }) {
  const basic = route.tab === "basic", home = basic ? "/score-screener" : "/advanced-score-screener";
  return (
    <div className="wrap scr-wrap sx-root" style={{ paddingTop: 22 }}>
      <FindStocksTabs />
      {/* the same one-line header as the screener it belongs to (task #64, B-4 / V-4): name, plan and the way back to all filters */}
      <section className="card sx-head" aria-labelledby="psx-h1">
        <div className="sx-h1row"><h1 id="psx-h1" title="Prebuilt screens narrow the whole market with ready-made rules. Each one says what it checks, and you can change its options.">{basic ? "Basic stock screener" : "Advanced stock screener"}</h1>
          <TierChip tier={basic ? "silver" : "gold"} /><span className="sx-hsp" /><Link to={home} className="sx-hlink">Back to all filters</Link></div>
      </section>
      <ScreensStrip route={route} />
      {basics && <PresetPanel route={route} hideGroups basics={basics} basicsActive={false} />}
      <div className="psx-main"><ScreenView key={route.id ?? ""} route={route} /></div>
    </div>);
}
