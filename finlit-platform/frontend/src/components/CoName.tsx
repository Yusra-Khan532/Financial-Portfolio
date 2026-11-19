// Task #246 (name first, 19 Nov 2026): the one way to label a company in a list, table, chip or card. Built on lib/companyLabel.
// A BSE-only company (its symbol is a BSE code such as 526433) shows its NAME as the main label and "BSE 526433 · <what the small line showed before>" underneath;
// an NSE symbol shows exactly as before. The main label keeps the page's own tag and class; the small line keeps the page's own class when one is passed.
import type { ElementType, ReactNode } from "react";
import { Link } from "react-router";
import { coLabel, isBseCode, shortLabel, subLine } from "../lib/companyLabel";

export type CoNameProps = {
  symbol: string;
  name?: string | null;
  /** What the small line showed before (name, industry, sector, a note). For a BSE code the name is not repeated there. */
  sub?: string | null;
  /** Wrap the main label in a link: true for /stocks/<symbol>, or a path. */
  to?: boolean | string;
  /** Chips and tight cells: the short name (no "Ltd"), cut to `max` characters with "…"; the full name and code go in the title. No small line. */
  short?: boolean;
  max?: number;
  /** The tag the page used for the main label (b, strong, span). */
  as?: ElementType;
  className?: string;
  /** The small line's tag and class (the page's own; "small" with no class by default). */
  subAs?: ElementType;
  subClassName?: string;
  /** Text after the main label inside the same tag (e.g. a chip's weight " 12%"). */
  after?: ReactNode;
};

export function CoName({ symbol, name, sub, to = false, short = false, max = 22, as: Tag = "b", className, subAs: SubTag = "small", subClassName, after }: CoNameProps) {
  const r = { symbol, name };
  const l = coLabel(r);
  const main = short ? shortLabel(r, max) : l.main;
  // NSE: the title is what it was before (none), so the markup is unchanged; a BSE code always carries its full name and code (or the reason the name is missing).
  const title = isBseCode(symbol) ? l.title : undefined;
  const label = <Tag className={className} title={title}>{main}{after}</Tag>;
  const small = short ? null : subLine(r, sub);
  return (
    <>
      {to ? <Link to={typeof to === "string" ? to : `/stocks/${encodeURIComponent(symbol)}`}>{label}</Link> : label}
      {small != null && <SubTag className={subClassName}>{small}</SubTag>}
    </>
  );
}

export default CoName;
