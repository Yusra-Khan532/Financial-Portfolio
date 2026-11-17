// Task #195 (dashboard pack, 15 Nov 2026), "What your stocks say": one callout card per signal, side by side (green Good sign, teal Insight, gold Watch out,
// red Warning), each with its headline, one line, a count bar and a dropdown of grouped chips; one "Open all / Close all" for the set. Descriptive only.
import type { Signal } from "../../lib/dashPack";
import { Callout, CalloutOpenAll } from "../Callout";
import { cardIds } from "./DashCards";
import { Card, Rows } from "./parts";

export function SignalCards({ id, title, sub, signals, loading, empty }: { id: string; title: string; sub: string; signals: Signal[]; loading: boolean; empty?: string }) {
  const ids = cardIds(id, signals.length);
  return (
    <Card id={id} title={title} sub={sub} right={<CalloutOpenAll scope={id} n={signals.length} />} className="dsh-sig">
      {loading ? <Rows n={1} h={120} />
        : !signals.length ? <p className="dsh-note">{empty ?? "No signal stands out yet: none of your stocks moved 10% or more, reported results or has a peer ranking."}</p>
        : <div className="dsh-sig-grid" style={{ ["--n" as string]: Math.min(3, signals.length) }}>
            {signals.map((s, i) => <Callout key={ids[i]} id={ids[i]} kind={s.kind} title={s.title} line={s.line} meter={s.meter} more={s.more} groups={s.groups} note={s.note} />)}
          </div>}
    </Card>
  );
}
