// The page while a prebuilt screen is open: the screen view beside (or, on a phone, above) the list of screens, so another screen is one tap away.
import type { ReactNode } from "react";
import { Link } from "react-router";
import { PresetPanel } from "./PresetPanel";
import { ScreensStrip } from "./ScreensStrip";
import { ADVANCED_DESC, ScreenerHead } from "../ScreenerHead";
import { ScreenView } from "./ScreenView";
import type { PresetRoute } from "./usePresetRoute";
import { PLAN_FOR_PRISM } from "../../../lib/planGates";
import "../../../styles/presets.css";

export function PresetPage({ route, basics }: { route: PresetRoute; basics?: ReactNode }) {
  return (
    <div className="wrap scr-wrap sx-root" style={{ paddingTop: 22 }}>
      {/* task #243 (pack H): the same page header as the screener it belongs to, with the way back to all filters in its head bar */}
      <ScreenerHead title="Advanced stock screener" tier={PLAN_FOR_PRISM} desc={ADVANCED_DESC}>
        <Link to="/advanced-score-screener" className="sp-link xsh-link">Back to all filters →</Link>
      </ScreenerHead>
      <ScreensStrip route={route} />
      {basics && <PresetPanel route={route} hideGroups basics={basics} basicsActive={false} />}
      <div className="psx-main"><ScreenView key={route.id ?? ""} route={route} /></div>
    </div>);
}
