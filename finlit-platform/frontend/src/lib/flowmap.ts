// Order Flow > Flow board, the map (founder, 26 Nov 2026, with a reference video: "that seems to me the perfect view ... very easy for users").
// Left to right: every stock's line of the day, ending in a tower where each stock is one tick (rising on top, highest first; falling below, lowest
// last); from the tower a thin curve runs to the stock's own tile; the tiles stand in a grid, rising above, falling below. Pure: tested directly.
import type { FlowLines, FlowStock } from "./flow";

export type MapLine = { symbol: string; up: boolean; d: string };
export type Tick = { symbol: string; up: boolean; y: number; len: number };
export type Tile = { symbol: string; up: boolean; x: number; y: number; w: number; h: number; rank: number; big: boolean };
export type Link = { symbol: string; up: boolean; d: string };
export type FlowMap = {
  W: number; H: number; lines: MapLine[]; ticks: Tick[]; tiles: Tile[]; links: Link[];
  tower: { x: number; w: number; top: number; mid: number; bottom: number; up: number; down: number };
  grid: { y: number; label: string }[]; times: { x: number; label: string }[]; zeroY: number; split: number;
  more: { up: number; down: number };
};


/** Lays one side's stocks out as boxes sized by how far they moved: the smallest moves in narrow columns on the left, larger ones to the right,
 *  and the three largest as big cards in the last column (founder, 26 Nov 2026, from the reference video: "if there is a big gain, a big box"). */
export function sizedBoxes(list: FlowStock[], x0: number, x1: number, y0: number, y1: number, up: boolean, opts: { bigCount?: number; minH?: number; gap?: number } = {}): Tile[] {
  const GAP = opts.gap ?? 5, minH = opts.minH ?? 20, nb = Math.min(opts.bigCount ?? 3, list.length);
  const wt = (s: FlowStock) => Math.max(0.05, Math.abs(s.changePct ?? 0));
  const sorted = [...list].sort((a, b) => wt(b) - wt(a));                    // largest move first
  const big = sorted.slice(0, nb), rest = sorted.slice(nb);
  const H = y1 - y0, W = x1 - x0;
  // columns from the right: the big column, then columns holding more and smaller boxes the further left they go
  const cols: FlowStock[][] = [];
  let i = 0, count = 4;
  while (i < rest.length) { cols.push(rest.slice(i, i + count)); i += count; count = Math.min(count + 1, Math.max(4, Math.floor(H / (minH + GAP)))); }
  const colWeight = cols.map((c) => c.reduce((a, s) => a + wt(s), 0) / c.length);
  const bigW = big.length ? Math.max(W * 0.46, 330) : 0;
  const restW = W - bigW - (big.length && cols.length ? GAP * 2 : 0) - Math.max(0, cols.length - 1) * GAP;
  const totalCW = colWeight.reduce((a, b) => a + b, 0) || 1;
  const widths = colWeight.map((w) => Math.max(58, (w / totalCW) * restW));
  const scale = restW / (widths.reduce((a, b) => a + b, 0) || 1);
  const out: Tile[] = [];
  const stack = (items: FlowStock[], x: number, w: number, isBig: boolean) => {
    const avail = H - GAP * (items.length - 1);
    const ex = isBig ? 0.35 : 1.3;   // the three big cards stay close in height (each needs room for its chart); the small boxes follow the move strongly
    let hs = items.map((s) => Math.max(isBig ? 196 : minH, (Math.pow(wt(s), ex) / items.reduce((a, x) => a + Math.pow(wt(x), ex), 0)) * avail));
    const k = avail / hs.reduce((a, b) => a + b, 0); hs = hs.map((h) => h * k);
    let y = y0;
    items.forEach((s, j) => { out.push({ symbol: s.symbol, up, x, y, w, h: hs[j], rank: sorted.indexOf(s) + 1, big: isBig }); y += hs[j] + GAP; });
  };
  // left to right: the smallest column first
  let x = x0;
  for (let c = cols.length - 1; c >= 0; c--) { const w = widths[c] * scale; stack(cols[c], x, w, false); x += w + GAP; }
  if (big.length) stack(big, x1 - bigW, bigW, true);
  return out;
}

/** `perSide`: how many stocks each side shows as boxes (the largest moves); the rest are on the tower only. */
export function flowMap(stocks: FlowStock[], lines: FlowLines, opts: { W?: number; H?: number; perSide?: number } = {}): FlowMap {
  const W = opts.W ?? 1000, H = opts.H ?? 1000, perSide = opts.perSide ?? 24, PAD = 14, SPLIT = 34;
  const S = stocks.filter((s) => s.changePct != null && s.changePct !== 0);
  const up = S.filter((s) => (s.changePct as number) > 0).sort((a, b) => (b.changePct as number) - (a.changePct as number));
  const down = S.filter((s) => (s.changePct as number) < 0).sort((a, b) => (b.changePct as number) - (a.changePct as number));
  const tUp = [...up].sort((a, b) => (b.changePct as number) - (a.changePct as number)).slice(0, perSide);
  const tDown = [...down].sort((a, b) => (a.changePct as number) - (b.changePct as number)).slice(0, perSide);

  // Columns: lines | tower | links | boxes
  const L0 = PAD + 34, L1 = W * 0.27, TX = W * 0.29, TW = W * 0.035, GX = W * 0.38, GR = W - PAD;
  const n = Math.max(1, S.length), avail = H - 2 * PAD - SPLIT, unit = avail / n;
  const top = PAD, mid = top + up.length * unit, bottom = mid + SPLIT + down.length * unit;
  const maxAbs = Math.max(0.01, ...S.map((s) => Math.abs(s.changePct as number)));
  const ticks: Tick[] = [
    ...up.map((s, i) => ({ symbol: s.symbol, up: true, y: top + (i + 0.5) * unit, len: Math.max(2, (Math.abs(s.changePct as number) / maxAbs) * TW) })),
    ...down.map((s, i) => ({ symbol: s.symbol, up: false, y: mid + SPLIT + (i + 0.5) * unit, len: Math.max(2, (Math.abs(s.changePct as number) / maxAbs) * TW) })),
  ];
  const tickOf = new Map(ticks.map((t) => [t.symbol, t]));

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

  // boxes: the rising half above the split and the falling half below, each at least 30% of the height so a one-sided day still reads
  const usable = H - 2 * PAD - SPLIT, share = Math.min(0.56, Math.max(0.44, up.length / Math.max(1, up.length + down.length)));
  const upH = tUp.length && tDown.length ? usable * share : tUp.length ? usable : 0;
  const tiles = [...sizedBoxes(tUp, GX, GR, PAD, PAD + upH, true), ...sizedBoxes(tDown, GX, GR, PAD + upH + SPLIT, H - PAD, false)];
  const links: Link[] = tiles.map((tl) => {
    const t = tickOf.get(tl.symbol)!, x0 = TX + TW + 4, x1 = tl.x, y1 = tl.y + tl.h / 2, cx = (x0 + x1) / 2;
    return { symbol: tl.symbol, up: tl.up, d: `M${x0.toFixed(1)},${t.y.toFixed(1)}C${cx.toFixed(1)},${t.y.toFixed(1)} ${cx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}` };
  });

  const step = span > 12 ? 4 : span > 6 ? 2 : span > 3 ? 1 : 0.5;
  const grid: { y: number; label: string }[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) grid.push({ y: ly(v), label: `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(step < 1 ? 1 : 0)}%` });
  const times = lines.times.length ? [0, Math.floor(T / 2), T].filter((v, i, a) => a.indexOf(v) === i).map((i) => ({ x: lx(i), label: lines.times[i] })) : [];
  return { W, H, lines: mapLines, ticks, tiles, links, tower: { x: TX, w: TW, top, mid, bottom, up: up.length, down: down.length }, grid, times, zeroY: ly(0),
    split: PAD + upH + SPLIT / 2, more: { up: up.length - tUp.length, down: down.length - tDown.length } };
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
