// Order Flow > Flow board layout (docs/TRADING-LAB.md "Order Flow" step 3): every stock with a known, non-zero change flows from its line of the
// day into Rising or Falling, then into its sector, then into its futures build-up. Each column holds the same stocks, and every stock is one unit
// of height in every column, so the width of each ribbon is exactly its number of stocks. Pure: no React, no DOM, so it is tested directly.
import type { Buildup, FlowLines, FlowStock } from "./flow";

export type Bucket = Buildup | "none";
/** Top to bottom: the rising build-ups, then stocks without one, then the falling build-ups (so ribbons cross as little as possible). */
export const BUCKETS: Bucket[] = ["long_buildup", "short_covering", "none", "short_buildup", "long_unwinding"];
const RISING_PARTS: Bucket[] = ["long_buildup", "short_covering", "none"];
const FALLING_PARTS: Bucket[] = ["none", "short_buildup", "long_unwinding"];

export type Rect = { x: number; y: number; w: number; h: number };
export type Ribbon = { key: string; from: { x: number; y0: number; y1: number }; to: { x: number; y0: number; y1: number }; up: boolean; sector: string; bucket?: Bucket; count: number };
export type LineMark = { symbol: string; sector: string; up: boolean; d: string; end: { x: number; y: number }; slot: { x: number; y: number } };
export type SectorBox = Rect & { sector: string; up: number; down: number; stocks: number };
export type BucketBox = Rect & { bucket: Bucket; count: number };
export type Board = {
  W: number; H: number; lines: LineMark[]; rising: Rect & { count: number }; falling: Rect & { count: number }; sectors: SectorBox[]; buckets: BucketBox[];
  ribbons: Ribbon[]; times: { x: number; label: string }[]; zeroY: number; unit: number;
  /** % grid of the lines area: y and label of each tick (whole or half per cent steps), and the area's left and right edge. */
  ticks: { y: number; label: string }[]; lineX: [number, number];
};

export const bucketOf = (s: FlowStock): Bucket => s.buildup ?? "none";

/** The board for these stocks; `order` is the sectors top to bottom (the snapshot's own order: highest average change first). */
export function layout(stocks: FlowStock[], lines: FlowLines, order: string[], opts: { W?: number; minSector?: number; maxH?: number } = {}): Board {
  const W = opts.W ?? 1200, PAD = 16, GAP = 6, minSector = opts.minSector ?? 16, maxH = opts.maxH ?? 1100;
  const S = stocks.filter((s) => s.changePct != null && s.changePct !== 0);
  const sec = (s: FlowStock) => s.sector || "Other";
  const names = [...order.filter((n) => S.some((s) => sec(s) === n)), ...[...new Set(S.map(sec))].filter((n) => !order.includes(n)).sort()];
  const groups = names.map((n) => S.filter((s) => sec(s) === n));
  const n = Math.max(1, S.length), smallest = Math.max(1, Math.min(...groups.map((g) => g.length), n));
  const gaps = Math.max(0, names.length - 1) * GAP, BGAPS = (BUCKETS.length - 1) * GAP * 2;
  let unit = (640 - 2 * PAD - gaps) / n;
  unit = Math.max(unit, minSector / smallest);
  const most = Math.max(gaps, BGAPS);
  const H = Math.min(maxH, Math.max(420, Math.ceil(unit * n + most + 2 * PAD)));
  unit = Math.min(unit, (H - 2 * PAD - most) / n);

  // Columns: lines | Rising/Falling | sectors | build-ups
  const L0 = PAD, L1 = W * 0.36, NX = W * 0.43, NW = 12, SX = W * 0.58, SW = W * 0.13, BX = W * 0.86, BW = W - BX - PAD;
  const up = S.filter((s) => (s.changePct as number) > 0), down = S.filter((s) => (s.changePct as number) < 0);
  const mid = (H - (n * unit + GAP * 4)) / 2;
  const rising = { x: NX, y: Math.max(PAD, mid), w: NW, h: up.length * unit, count: up.length };
  const falling = { x: NX, y: rising.y + rising.h + GAP * 4, w: NW, h: down.length * unit, count: down.length };

  // Lines of the day, each ending in its own slot of its node (sector by sector, highest change first inside each)
  const vals = S.flatMap((s) => (lines.change[s.symbol] ?? []).filter((v): v is number => v != null)).concat(S.map((s) => s.changePct as number), [0]);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const T = Math.max(1, lines.times.length - 1);
  const lx = (i: number) => L0 + (i / T) * (L1 - L0), ly = (v: number) => PAD + ((hi - v) / span) * (H - 2 * PAD);
  const marks: LineMark[] = [];
  const slotted = (list: FlowStock[], node: Rect) => {
    let y = node.y;
    for (const name of names) for (const s of list.filter((x) => sec(x) === name).sort((a, b) => (b.changePct as number) - (a.changePct as number))) {
      const path = (lines.change[s.symbol] ?? []).map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null);
      const pts = path.length ? path.map(([i, v]) => [lx(i), ly(v)] as const) : [[L1, ly(s.changePct as number)] as const];
      const end = pts[pts.length - 1], slot = { x: node.x, y: y + unit / 2 };
      const cx = (end[0] + slot.x) / 2;
      const d = pts.map(([x, yy], k) => `${k ? "L" : "M"}${x.toFixed(1)},${yy.toFixed(1)}`).join("") + `C${cx.toFixed(1)},${end[1].toFixed(1)} ${cx.toFixed(1)},${slot.y.toFixed(1)} ${slot.x.toFixed(1)},${slot.y.toFixed(1)}`;
      marks.push({ symbol: s.symbol, sector: name, up: (s.changePct as number) > 0, d, end: { x: end[0], y: end[1] }, slot });
      y += unit;
    }
  };
  slotted(up, rising); slotted(down, falling);

  // Sectors, stacked with gaps, centred; rising part on top, falling below
  const colH = n * unit + gaps;
  let y = (H - colH) / 2;
  const sectors: SectorBox[] = groups.map((g, i) => {
    const box = { x: SX, y, w: SW, h: g.length * unit, sector: names[i], up: g.filter((s) => (s.changePct as number) > 0).length, down: g.filter((s) => (s.changePct as number) < 0).length, stocks: g.length };
    y += box.h + GAP;
    return box;
  });

  const ribbons: Ribbon[] = [];
  let ry = rising.y, fy = falling.y;
  for (const b of sectors) {
    if (b.up) { ribbons.push({ key: `r-${b.sector}`, from: { x: NX + NW, y0: ry, y1: ry + b.up * unit }, to: { x: SX, y0: b.y, y1: b.y + b.up * unit }, up: true, sector: b.sector, count: b.up }); ry += b.up * unit; }
    if (b.down) { ribbons.push({ key: `f-${b.sector}`, from: { x: NX + NW, y0: fy, y1: fy + b.down * unit }, to: { x: SX, y0: b.y + b.up * unit, y1: b.y + b.h }, up: false, sector: b.sector, count: b.down }); fy += b.down * unit; }
  }

  // Build-up buckets, stacked with double gaps; each sector's right edge split rising parts first, then falling parts
  const counts = BUCKETS.map((k) => S.filter((s) => bucketOf(s) === k).length);
  const bH = n * unit + BGAPS;
  let by = (H - bH) / 2;
  const buckets: BucketBox[] = BUCKETS.map((k, i) => { const box = { x: BX, y: by, w: BW, h: counts[i] * unit, bucket: k, count: counts[i] }; by += box.h + GAP * 2; return box; });
  const fill = new Map<string, number>(buckets.map((b) => [b.bucket, b.y]));
  // rising "none" fills the top of the None box, falling "none" the bottom, so ribbons into it do not cross
  for (const b of sectors) {
    let sy = b.y;
    const g = groups[names.indexOf(b.sector)];
    for (const [part, isUp] of [...RISING_PARTS.map((p) => [p, true] as const), ...FALLING_PARTS.map((p) => [p, false] as const)]) {
      const c = g.filter((s) => ((s.changePct as number) > 0) === isUp && bucketOf(s) === part).length;
      if (!c) continue;
      const ty = fill.get(part)!;
      ribbons.push({ key: `b-${b.sector}-${part}-${isUp ? "u" : "d"}`, from: { x: SX + SW, y0: sy, y1: sy + c * unit }, to: { x: BX, y0: ty, y1: ty + c * unit }, up: isUp, sector: b.sector, bucket: part, count: c });
      fill.set(part, ty + c * unit);
      sy += c * unit;
    }
  }
  const times = lines.times.length ? [0, Math.floor(T / 2), T].filter((v, i, a) => a.indexOf(v) === i).map((i) => ({ x: lx(i), label: lines.times[i] })) : [];
  const step = span > 12 ? 4 : span > 6 ? 2 : span > 3 ? 1 : 0.5;
  const ticks: { y: number; label: string }[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push({ y: ly(v), label: `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(step < 1 ? 1 : 0)}%` });
  return { W, H, lines: marks, rising, falling, sectors, buckets, ribbons, times, zeroY: ly(0), unit, ticks, lineX: [L0, L1] };
}

/** The filled band between two vertical edges, as an SVG path. */
export function ribbonPath(r: Ribbon): string {
  const { from: a, to: b } = r, cx = (a.x + b.x) / 2;
  return `M${a.x.toFixed(1)},${a.y0.toFixed(1)}C${cx.toFixed(1)},${a.y0.toFixed(1)} ${cx.toFixed(1)},${b.y0.toFixed(1)} ${b.x.toFixed(1)},${b.y0.toFixed(1)}`
    + `L${b.x.toFixed(1)},${b.y1.toFixed(1)}C${cx.toFixed(1)},${b.y1.toFixed(1)} ${cx.toFixed(1)},${a.y1.toFixed(1)} ${a.x.toFixed(1)},${a.y1.toFixed(1)}Z`;
}
