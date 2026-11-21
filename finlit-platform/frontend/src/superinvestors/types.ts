// Task #289: the shapes /api/superinvestors/tracked and /api/superinvestors/<tracked-key> send (backend/finlit/superinvestors_tracked.py).
export type Move = "new" | "added" | "reduced" | "exited" | "unchanged";
export type Size = "Large" | "Mid" | "Small" | "Micro";
export type Prism = { label: string | null; score: number | null };
export type Tech = { short: string | null; long: string | null };
export type Peers = { chip: string | null; text: string | null };

export type TrackedHolding = {
  symbol: string; name: string; isin: string | null; asOf: string | null;
  stakeNow: number | null; stakeThen: number | null; changePts: number | null; move: Move; moveText: string; sourceError: boolean; names: number;
  by: { key: string; now: number | null; then: number | null }[];
  valueCr: number | null; changeValueCr: number | null; changeAbout: boolean; weightPct: number | null;
  size: Size | null; mcapCr: number | null; return1y: number | null; sector: string | null;
  prism: Prism; technical: Tech; peers: Peers; alsoHeldBy: string[];
};
export type FiledName = { key: string; name: string; kind: "person" | "firm"; companies: number };
export type MoveCounts = Record<"new" | "added" | "reduced" | "exited", number>;
export type NamedStakes = { pct: number | null; coverPct: number; why: string | null };
export type TrackedCard = {
  key: string; name: string; names: FiledName[]; groupedNames: number; companies: number; valueCr: number | null;
  moves: MoveCounts; movesTotal: number; namedStakes1y: NamedStakes; sameSizeMarketPct: number | null;
  sizes: { size: Size; text: string; pct: number; companies: number }[];
  sectors: { sector: string; valueCr: number; pct: number; companies: number }[];
  top: { symbol: string; name: string; weightPct: number | null }[];
};
export type TrackedMove = {
  investor: string; investorName: string; symbol: string; name: string; asOf: string | null; move: Move; moveText: string;
  stakeThen: number | null; stakeNow: number | null; changePts: number | null; changeValueCr: number | null; changeAbout: boolean; size: Size | null; prism: Prism;
};
export type Agree = {
  symbol: string; name: string; size: Size | null; heldBy: string[]; addedBy: string[]; cutBy: string[]; stake: number; valueCr: number;
  prism: Prism; technical: Tech; peers: Peers; return1y: number | null;
};
export type Meta = { asOf: string | null; fetchedFrom: string | null; fetchedTo: string | null; pricesAt?: string | null; source: string; disclaimer: string; noteNames: string; rule: string };
export type TrackedTab = Meta & {
  tiles: { tracked: number; companies: number; moves: number; heldBy2: number };
  moveCounts: Partial<MoveCounts>; sourceErrors: number; medians: Record<Size, number | null>;
  investors: TrackedCard[]; moves: TrackedMove[]; agree: Record<"held" | "added" | "cut", Agree[]>;
  allCount: { names: number; people: number; firms: number }; since: "year" | "quarter"; sinceText: string; trackedSource: string; namedStakesNote: string;
};
export type TrackedPage = Meta & TrackedCard & {
  kind_of_page: "tracked"; holdings: TrackedHolding[]; moveList: TrackedHolding[]; medians: Record<Size, number | null>; trackedSource: string; namedStakesNote: string;
};
export type Moved = { status: "moved"; to: string; name: string };
