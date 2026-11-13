// The insight cards the server writes under a sector chart (used by "A year of <industry>" on the industry page). Sector Pulse itself is drawn by
// components/sectors/pack (the final pages pack, 13 Nov 2026), which replaced the earlier mood chart and six-month strips of this file.
import { type PulseInsight } from "../../lib/sectorHistory";
import "../../styles/pulse-charts.css";

const KIND: Record<PulseInsight["kind"], string> = { good: "Good sign", insight: "Insight", watch: "Watch out", warning: "Warning" };

export function Insights({ items }: { items: PulseInsight[] | undefined }) {
  if (!items?.length) return null;
  return <ul className="pc-ins" aria-label="What this chart says">{items.map((i) => <li key={i.title} className={"pc-in pc-in-" + i.kind}><b><span>{KIND[i.kind]}</span> {i.title}</b><p>{i.text}</p></li>)}</ul>;
}
