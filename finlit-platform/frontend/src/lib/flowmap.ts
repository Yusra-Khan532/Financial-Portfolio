// Order Flow > Flow board, the map (founder, 26 Nov 2026, with a reference video: "that seems to me the perfect view ... very easy for users").
// Left to right: every stock's line of the day, ending in a tower where each stock is one tick (rising on top, highest first; falling below, lowest
// last); from the tower a thin curve runs to the stock's own tile; the tiles stand in a grid, rising above, falling below. Pure: tested directly.
import type { FlowLines, FlowStock } from "./flow";

export type MapLine = { symbol: string; up: boolean; d: string };
export type Tick = { symbol: string; up: boolean; y: number; len: number };
export type Tile = { symbol: string; up: boolean; x: number; y: number; w: number; h: number; rank: number };
export type Link = { symbol: string; up: boolean; d: string };
export type FlowMap = {
  W: number; H: number; lines: MapLine[]; ticks: Tick[]; tiles: Tile[]; links: Link[];
  tower: { x: number; w: number; top: number; mid: number; bottom: number; up: number; down: number };
  grid: { y: number; label: string }[]; times: { x: number; label: string }[]; zeroY: number; split: number;
  more: { up: number; down: number };
};

const cmp = (a: FlowStock, b: FlowStock) => b.agreement.score - a.agreement.score || Math.abs(b.oiChangePct ?? 0) - Math.abs(a.oiChangePct ?? 0) || Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0);

/** `perSide`: how many tiles each side shows (most facts lined up first); Infinity shows every stock. */
export function flowMap(stocks: FlowStock[], lines: FlowLines, opts: { W?: number; cols?: number; perSide?: number; tileH?: number } = {}): FlowMap {
  const W = opts.W ?? 1000, cols = opts.cols ?? 5, perSide = opts.perSide ?? 30, TH = opts.tileH ?? 46, GAP = 6, PAD = 14;
  const S = stocks.filter((s) => s.changePct != null && s.changePct !== 0);
  const up = S.filter((s) => (s.changePct as number) > 0).sort((a, b) => (b.changePct as number) - (a.changePct as number));
  const down = S.filter((s) => (s.changePct as number) < 0).sort((a, b) => (b.changePct as number) - (a.changePct as number));
  const tUp = [...up].sort(cmp).slice(0, perSide), tDown = [...down].sort(cmp).slice(0, perSide);
  const rowsUp = Math.ceil(tUp.length / cols), rowsDown = Math.ceil(tDown.length / cols);
  const SPLIT = 34;                                     // the gap between the rising and the falling half (it holds the zero mark)
  const tilesH = (rowsUp + rowsDown) * (TH + GAP) + SPLIT;
  const H = Math.max(440, tilesH + 2 * PAD);

  // Columns: lines | tower | links | tiles
  const L0 = PAD + 34, L1 = W * 0.34, TX = W * 0.37, TW = W * 0.045, GX = W * 0.5, GW = W - GX - PAD, TWD = (GW - (cols - 1) * GAP) / cols;
  // tower: every stock one tick, rising from the top down to the middle split, falling from the split down
  const n = Math.max(1, S.length), avail = H - 2 * PAD - SPLIT, unit = avail / n;
  const top = PAD, mid = top + up.length * unit, bottom = mid + SPLIT + down.length * unit;
  const maxAbs = Math.max(0.01, ...S.map((s) => Math.abs(s.changePct as number)));
  const ticks: Tick[] = [
    ...up.map((s, i) => ({ symbol: s.symbol, up: true, y: top + (i + 0.5) * unit, len: Math.max(2, (Math.abs(s.changePct as number) / maxAbs) * TW) })),
    ...down.map((s, i) => ({ symbol: s.symbol, up: false, y: mid + SPLIT + (i + 0.5) * unit, len: Math.max(2, (Math.abs(s.changePct as number) / maxAbs) * TW) })),
  ];
  const tickOf = new Map(ticks.map((t) => [t.symbol, t]));

  // lines of the day, each ending in its tick
  const vals = S.flatMap((s) => (lines.change[s.symbol] ?? []).filter((v): v is number => v != null)).concat(S.map((s) => s.changePct as number), [0]);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const T = Math.max(1, lines.times.length - 1);
  const lx = (i: number) => L0 + (i / T) * (L1 - L0), ly = (v: number) => PAD + ((hi - v) / span) * (H - 2 * PAD);
  const mapLines: MapLine[] = S.map((s) => {
    const path = (lines.change[s.symbol] ?? []).map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null);
    const pts = path.length ? path.map(([i, v]) => [lx(i), ly(v)] as const) : [[L1, ly(s.changePct as number)] as const];
    const end = pts[pts.length - 1], t = tickOf.get(s.symbol)!, cx = (end[0] + TX) / 2;
    const d = pts.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("") + `C${cx.toFixed(1)},${end[1].toFixed(1)} ${cx.toFixed(1)},${t.y.toFixed(1)} ${TX.toFixed(1)},${t.y.toFixed(1)}`;
    return { symbol: s.symbol, up: (s.changePct as number) > 0, d };
  });

  // tiles: rising rows from the top, falling rows below the split (centred in the board's height)
  const y0 = (H - tilesH) / 2;
  const place = (list: FlowStock[], startY: number, isUp: boolean): Tile[] => list.map((s, i) => ({
    symbol: s.symbol, up: isUp, rank: i + 1, w: TWD, h: TH, x: GX + (i % cols) * (TWD + GAP), y: startY + Math.floor(i / cols) * (TH + GAP),
  }));
  const tiles = [...place(tUp, y0, true), ...place(tDown, y0 + rowsUp * (TH + GAP) + SPLIT, false)];
  const links: Link[] = tiles.map((tl) => {
    const t = tickOf.get(tl.symbol)!, x0 = TX + TW + 4, x1 = tl.x, y1 = tl.y + tl.h / 2, cx = (x0 + x1) / 2;
    return { symbol: tl.symbol, up: tl.up, d: `M${x0.toFixed(1)},${t.y.toFixed(1)}C${cx.toFixed(1)},${t.y.toFixed(1)} ${cx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}` };
  });

  const step = span > 12 ? 4 : span > 6 ? 2 : span > 3 ? 1 : 0.5;
  const grid: { y: number; label: string }[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) grid.push({ y: ly(v), label: `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(step < 1 ? 1 : 0)}%` });
  const times = lines.times.length ? [0, Math.floor(T / 2), T].filter((v, i, a) => a.indexOf(v) === i).map((i) => ({ x: lx(i), label: lines.times[i] })) : [];
  return { W, H, lines: mapLines, ticks, tiles, links, tower: { x: TX, w: TW, top, mid, bottom, up: up.length, down: down.length }, grid, times, zeroY: ly(0),
    split: mid + SPLIT / 2, more: { up: up.length - tUp.length, down: down.length - tDown.length } };
}

/** 15-minute bars from the 3-minute snapshots of one stock, in rupees: open, high, low, close of the snapshots inside each 15 minutes.
 *  The snapshots are samples, so a bar's high and low are those of its snapshots, not every trade (the card says so). */
export function bars(change: (number | null)[] | undefined, times: string[], previousClose: number | null, every = 5): { o: number; h: number; l: number; c: number; t: string }[] {
  if (!change || previousClose == null) return [];
  const px = change.map((v) => (v == null ? null : previousClose * (1 + v / 100)));
  const out: { o: number; h: number; l: number; c: number; t: string }[] = [];
  for (let i = 0; i < px.length; i += every) {
    const g = px.slice(i, i + every).filter((v): v is number => v != null);
    if (!g.length) continue;
    out.push({ o: g[0], h: Math.max(...g), l: Math.min(...g), c: g[g.length - 1], t: times[i] ?? "" });
  }
  return out;
}
