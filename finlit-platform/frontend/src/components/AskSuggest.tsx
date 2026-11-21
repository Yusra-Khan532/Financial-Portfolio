// Task #268: the typing box's suggestions, as in the team's reference: a panel next to the box (never loose on the page), the listed questions grouped
// under headings with a short note on the right, then a last line for the words as typed. Arrow keys move through it, Enter picks, Escape closes.
import { useEffect, useId, useState, type KeyboardEvent } from "react";
import type { Q } from "../lib/askFlow";
import { Icon } from "../lib/icons";
import { fallbackLine, groupSuggestions } from "../lib/askSuggest";

/** The keyboard for one list of `count` options: ArrowDown / ArrowUp move (wrapping), Enter picks the active one, Escape closes. -1: none active. */
export function useSuggestKeys(count: number, open: boolean, pick: (i: number) => void, close: () => void) {
  const [active, setActive] = useState(-1);
  useEffect(() => { setActive(-1); }, [count, open]);
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || !count) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % count); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a <= 0 ? count - 1 : a - 1)); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(active); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
  };
  return { active, onKeyDown };
}

type Props = { id: string; text: string; qs: Q[]; company?: string | null; aiReady: boolean; aiPlan: boolean; left?: number | null; active: number; place: "up" | "down";
  onPick: (q: Q) => void; onAsk: () => void };

/** Options in order: the listed questions (grouped), then the line for the words as typed. Option i is `${id}-${i}` (aria-activedescendant). */
export function AskSuggest({ id, text, qs, company, aiReady, aiPlan, left, active, place, onPick, onAsk }: Props) {
  const groups = groupSuggestions(qs, company);
  const fb = fallbackLine(text, aiReady, aiPlan, left);
  const hid = useId();
  let i = -1;
  const opt = (key: string, label: string, note: string, go: () => void, cls = "") => {
    i += 1;
    const n = i;
    return <li key={key} id={`${id}-${n}`} role="option" aria-selected={active === n} className={"aif-sgo" + cls + (active === n ? " on" : "")}
      onMouseDown={(e) => e.preventDefault()} onClick={go}><span className="aif-sgq">{label}</span><span className="aif-sgn">{note}</span></li>;
  };
  return (
    <div className={"aif-sg aif-sg-" + place} role="listbox" id={id} aria-label="Suggested questions">
      {groups.map((g, gi) => (
        <ul key={g.title} role="group" aria-labelledby={`${hid}-${gi}`}>
          <li role="presentation" id={`${hid}-${gi}`} className="aif-sgh">{g.title}</li>
          {g.items.map((q) => opt(q.id + q.text, q.text, q.needsSecondCompany ? "Name the second company" : "Answers at once", () => onPick(q)))}
        </ul>))}
      <ul role="group" aria-label="Your words as typed">
        {opt("ask", fb.label, fb.note, onAsk, " aif-sgai")}
      </ul>
      <p className="aif-sgk" aria-hidden="true"><Icon name="arrow" /> ↑ ↓ to move · Enter to ask · Esc to close</p>
    </div>);
}

/** How many options AskSuggest shows for these questions (the listed ones plus the last line). */
export const suggestCount = (qs: readonly Q[]) => qs.length + 1;
