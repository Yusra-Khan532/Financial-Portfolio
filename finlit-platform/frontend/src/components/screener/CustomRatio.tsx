// A custom ratio in one sentence (task #61). The builder itself is the Custom ratio drawer (RatioDrawer.tsx, task #64 Part 3), which replaced the
// full-width panel above the results (its Applied criteria, Add another ratio, Reset and Run screener are gone).
import { ratioLabel, ratioRange, type CustomRatio, type MetricInfo, type SavedRatio } from "../../lib/proscreen";


export function ratioSentence(r: CustomRatio | SavedRatio, byKey: Map<string, MetricInfo>): string {
  const n = byKey.get(r.num)?.label ?? r.num, d = byKey.get(r.den)?.label ?? r.den, g = ratioRange(r as CustomRatio);
  const lim = g.min != null && g.max != null ? ` between ${g.min} and ${g.max}` : g.min != null ? ` > ${g.min}` : g.max != null ? ` < ${g.max}` : "";
  return `${ratioLabel(r as CustomRatio)}: ${n} ÷ ${d}${lim}`;
}
