// The page while a prebuilt screen is open: the screen view beside (or, on a phone, above) the list of screens, so another screen is one tap away.
import type { ReactNode } from "react";
import { TitleCard } from "../PageParts";
import { PresetPanel } from "./PresetPanel";
import { ScreensStrip } from "./ScreensStrip";
import { FindStocksTabs } from "../FindStocksTabs";
import { ScreenView } from "./ScreenView";
import type { PresetRoute } from "./usePresetRoute";
import "../../../styles/presets.css";

export function PresetPage({ route, basics }: { route: PresetRoute; basics?: ReactNode }) {
  const basic = route.tab === "basic", home = basic ? "/score-screener" : "/advanced-score-screener";
  return (
    <div className="wrap scr-wrap" style={{ paddingTop: 22 }}>
      <FindStocksTabs />
      <TitleCard tier={basic ? "silver" : "gold"} title={basic ? "Every listed company, scored by FinLit IQ." : "Every listed company, rated by FinLit Prism."} sub="Prebuilt screens narrow the whole market with ready-made rules. Each one says what it checks, and you can change its options." learnTo={home} learnLabel="Back to all filters" art="screener" links={[]} />
      <ScreensStrip route={route} />
      {basics && <PresetPanel route={route} hideGroups basics={basics} basicsActive={false} />}
      <div className="psx-main"><ScreenView key={route.id ?? ""} route={route} /></div>
    </div>);
}
