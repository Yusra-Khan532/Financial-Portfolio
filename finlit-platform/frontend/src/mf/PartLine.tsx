// Task #403 (reworked 27 Nov 2026): one short "Higher is better: …" line on each of the Mutual Fund Score's four parts, wherever the parts are shown
// (fund and ETF pages, the MF portfolio's four parts, the sample card). One component, so every place says the same. Describes, never advises.
import { partLine } from "../lib/mfScore";
import "./part-line.css";

export function PartLine({ part, className = "" }: { part: string; className?: string }) {
  const text = partLine(part);
  return text ? <small className={("mfs-pl " + className).trim()} data-testid="part-line">{text}</small> : null;
}
