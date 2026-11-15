// Drawing over any chart (task #124, replacing the #115 panel): a pencil in the chart's top-right controls opens an iPad-style floating Markup toolbar over the
// chart. The toolbar is compact, draggable anywhere over the chart, minimisable and expandable, and its position is kept apart from the chart's layout (it never
// moves, shrinks or resizes the chart). Tools: pen, highlighter, eraser, text, shapes (line, arrows, rectangle, circle, level lines, Fibonacci), colour, undo
// and redo; thickness and opacity show only for the tools that use them. Drawing is held to the chart's PLOTTING AREA (the element marked `data-plot`), never on
// the axes, labels or controls. Drawings are saved in this browser for that exact chart view and never touch the data. Information only.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  COLOURS, FIB_LEVELS, MAX_SHAPES, MAX_TEXT, OPACITIES, SETTINGS_OF, SHAPE_TOOLS, TOOLS, WIDTHS, clampPt, defaultOpacity, fibLines, hitsAlong, hlWidth, loadStored, newId,
  saveShapes, thin, toPlot, type ColourId, type Plot, type Pt, type Shape, type ToolId,
} from "../lib/drawings";
import "../styles/drawlayer.css";

const ICON: Record<ToolId | "undo" | "redo" | "trash" | "done" | "shapes" | "grip" | "min" | "expand", string> = {
  pen: "M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19l-4 1zM14 7l3 3",
  line: "M5 19L19 5M5 19h.01M19 5h.01",
  arrow: "M5 19L19 5M10 5h9v9",
  darrow: "M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4",
  hline: "M3 12h18M7 9l-3 3 3 3M17 9l3 3-3 3",
  vline: "M12 3v18M9 7l3-3 3 3M9 17l3 3 3-3",
  rect: "M5 6h14v12H5z",
  ellipse: "M12 5c4.4 0 8 3.1 8 7s-3.6 7-8 7-8-3.1-8-7 3.6-7 8-7z",
  fib: "M4 5h16M4 9h16M4 13h16M4 17h16M4 21h16",
  text: "M5 6V4h14v2M12 4v16M9 20h6",
  hl: "M15 4l5 5-8 8H7v-5zM4 21h9",
  eraser: "M8 20h11M5.5 14.5l8-8a2 2 0 0 1 3 0l2.5 2.5a2 2 0 0 1 0 3l-6 6H9.5l-4-4a1 1 0 0 1 0-1.5z",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  redo: "M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3",
  trash: "M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13",
  done: "M5 12.5l4.5 4.5L19 7.5",
  shapes: "M4 13h7v7H4zM17.5 3.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM13 20l4-7 4 7z",
  grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
  min: "M6 12h12",
  expand: "M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5",
};
type IconName = keyof typeof ICON;
const Ic = ({ n }: { n: IconName }) => <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={n === "grip" ? 3 : 1.9} strokeLinecap="round" strokeLinejoin="round"><path d={ICON[n]} /></svg>;
const TWO_POINT: ToolId[] = ["line", "arrow", "darrow", "rect", "ellipse", "fib"];
const FREEHAND: ToolId[] = ["pen", "hl"];
const COLOUR_NAME: Record<ColourId, string> = { red: "Red", green: "Green", blue: "Blue", amber: "Amber", violet: "Violet", ink: "White (black in the light theme)" };
const TOOL = Object.fromEntries(TOOLS.map((t) => [t.id, t])) as Record<ToolId, (typeof TOOLS)[number]>;
const POS_KEY = "finlit-markup-pos";
const WIDE = 560;
const NARROW = 460, TINY = 380;                     // a chart narrower than this gets the smaller toolbar: smaller buttons and no dividers, so it stays compact                       // a chart at least this wide shows the colours in the toolbar; a narrower one keeps them behind one swatch
const swatch = (c: ColourId) => (COLOURS[c] === "currentColor" ? "var(--text)" : COLOURS[c]);
const readPos = (): { x: number; y: number } | null => { try { const p = JSON.parse(localStorage.getItem(POS_KEY) || "null"); return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null; } catch { return null; } };
const same = (a: Plot, b: Plot) => Math.abs(a.l - b.l) < 0.5 && Math.abs(a.t - b.t) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;

type Props = {
  /** Names the chart view (its series, range and kind), so each view keeps its own drawings. */
  id: string;
  /** False while the area shows a message instead of a chart. */
  enabled?: boolean;
  children: React.ReactNode;
  /** Given by a page that shows the pencil in its own chart controls (see `DrawToggle`); without it the layer shows its own pencil, top right. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The number of drawings on this chart, for the pencil's badge. */
  onCount?: (n: number) => void;
};

/** Task #164: several charts can have their markup open at once; the keyboard (Esc, undo, redo) acts on the one used last. */
let lastLayer: string | null = null;
export const touchLayer = (id: string) => { lastLayer = id; };
export const keysFor = (id: string) => lastLayer === null || lastLayer === id;

export function DrawLayer({ id, enabled = true, children, open: openProp, onOpenChange, onCount }: Props) {
  const controlled = openProp !== undefined;
  const [own, setOwn] = useState(false);
  const open = (controlled ? !!openProp : own) && enabled;
  const setOpen = useCallback((o: boolean) => { if (!controlled) setOwn(o); onOpenChange?.(o); }, [controlled, onOpenChange]);

  const box = useRef<HTMLDivElement>(null), bar = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [plot, setPlot] = useState<Plot>({ l: 0, t: 0, w: 0, h: 0 });
  const first = useRef<ReturnType<typeof loadStored> | null>(null);
  if (first.current === null) first.current = loadStored(id);
  const pending = useRef<Shape[] | null>(first.current.legacy ? first.current.shapes : null);   // drawings saved before #124, moved to the plotting area once it is measured
  const [shapes, setShapes] = useState<Shape[]>(() => (first.current!.legacy ? [] : first.current!.shapes));
  const [past, setPast] = useState<Shape[][]>([]), [future, setFuture] = useState<Shape[][]>([]);
  const [tool, setTool] = useState<ToolId>("pen"), [shapeTool, setShapeTool] = useState<ToolId>("arrow"), [colour, setColour] = useState<ColourId>("amber"), [width, setWidth] = useState<number>(WIDTHS[1]);
  const [alpha, setAlpha] = useState<Partial<Record<ToolId, number>>>({});
  const [draft, setDraft] = useState<Shape | null>(null);
  const [typing, setTyping] = useState<{ at: Pt; text: string } | null>(null);
  const [menu, setMenu] = useState<null | "shapes" | "colours" | "clear">(null);
  const [mini, setMini] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(readPos);
  const [erasing, setErasing] = useState<Set<string> | null>(null);     // the annotations an eraser drag has passed over so far (removed in one step on release)
  const erased = useRef<Set<string> | null>(null);                       // the same set, read on release: a quick click releases before the state above re-renders
  const drag = useRef<{ start: Pt; pts: Pt[] } | null>(null);
  const moving = useRef<{ dx: number; dy: number } | null>(null);
  const loaded = useRef(id);
  const typedAt = useRef(0);               // when the note box opened: the click that opened it must not close it again through a blur

  // The chart box and its plotting area (the chart marks it with data-plot; a chart without the mark is drawn on as a whole).
  const measure = useCallback(() => {
    const el = box.current; if (!el) return;
    const r = el.getBoundingClientRect(), m = el.querySelector("[data-plot]")?.getBoundingClientRect();
    const next: Plot = m && m.width > 4 && m.height > 4 ? { l: m.left - r.left, t: m.top - r.top, w: m.width, h: m.height } : { l: 0, t: 0, w: r.width, h: r.height };
    setSize((s) => (Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5 ? s : { w: r.width, h: r.height }));
    setPlot((p) => (same(p, next) ? p : next));
  }, []);
  const [tb, setTb] = useState({ w: 0, h: 0 });                          // the toolbar's own size, to keep it inside the chart
  useLayoutEffect(() => {                                                 // every render: the chart inside may have laid itself out again
    measure();
    const el = bar.current, w = el?.offsetWidth ?? 0, h = el?.offsetHeight ?? 0;
    setTb((t) => (t.w === w && t.h === h ? t : { w, h }));
  });
  useEffect(() => {
    const el = box.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure()); ro.observe(el); return () => ro.disconnect();
  }, [measure]);

  useEffect(() => {                                                                  // another chart view: its own drawings, a fresh history
    if (loaded.current === id) return;
    loaded.current = id;
    const st = loadStored(id); pending.current = st.legacy ? st.shapes : null;
    setShapes(st.legacy ? [] : st.shapes); setPast([]); setFuture([]); setDraft(null); setTyping(null); setMenu(null);
  }, [id]);
  useEffect(() => { if (pending.current && plot.w > 0 && size.w > 0) { const moved = toPlot(pending.current, size, plot); pending.current = null; setShapes(moved); } }, [plot, size]);
  useEffect(() => { if (loaded.current === id && !pending.current) saveShapes(id, shapes); }, [id, shapes]);
  useEffect(() => { onCount?.(shapes.length); }, [shapes.length, onCount]);

  const commit = useCallback((next: Shape[]) => { setPast((p) => [...p.slice(-49), shapes]); setFuture([]); setShapes(next.slice(-MAX_SHAPES)); }, [shapes]);
  const undo = () => { if (!past.length) return; setFuture((f) => [shapes, ...f]); setShapes(past[past.length - 1]); setPast(past.slice(0, -1)); };
  const redo = () => { if (!future.length) return; setPast((p) => [...p, shapes]); setShapes(future[0]); setFuture(future.slice(1)); };
  const clear = () => { if (shapes.length) commit([]); setMenu(null); };
  const close = () => { setOpen(false); setMenu(null); setTyping(null); };

  // keys work wherever the focus is while the toolbar is open (the pencil that opened it sits outside the chart)
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    if (!keysFor(id)) return;
    const inField = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (e.key === "Escape") { if (typing) setTyping(null); else if (menu) setMenu(null); else close(); return; }
    if (inField) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
  };
  useEffect(() => {
    if (!open) return;
    touchLayer(id);
    const h = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [open]);

  // ------------------------------------------------------------------ drawing, inside the plotting area only
  const opacity = alpha[tool] ?? defaultOpacity(tool);
  const at = (e: React.PointerEvent): Pt => { const r = (e.currentTarget as Element).getBoundingClientRect(); return clampPt([(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]); };
  const base = { id: "", c: colour, w: width, o: opacity };
  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!open || typing || e.button > 0) return;
    setMenu(null);
    const p = at(e), { w, h } = plot;
    if (tool === "eraser") { e.currentTarget.setPointerCapture?.(e.pointerId); drag.current = { start: p, pts: [p] }; erased.current = hitsAlong(shapes, [p], w, h); setErasing(new Set(erased.current)); return; }
    if (tool === "text") { e.preventDefault(); typedAt.current = Date.now(); setTyping({ at: p, text: "" }); return; }
    if (tool === "hline" || tool === "vline") { commit([...shapes, { ...base, id: newId(), k: tool, a: p }]); return; }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { start: p, pts: [p] };
    setDraft(FREEHAND.includes(tool) ? { ...base, id: "draft", k: tool as "pen", pts: [p] } : { ...base, id: "draft", k: tool as "line", a: p, b: p });
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current; if (!d) return;
    const p = at(e);
    if (tool === "eraser") { const all = erased.current || new Set<string>(), before = all.size; hitsAlong(shapes, [p], plot.w, plot.h).forEach((x) => all.add(x)); erased.current = all; if (all.size !== before) setErasing(new Set(all)); return; }
    if (FREEHAND.includes(tool)) { d.pts.push(p); setDraft({ ...base, id: "draft", k: tool as "pen", pts: [...d.pts] }); }
    else if (TWO_POINT.includes(tool)) setDraft({ ...base, id: "draft", k: tool as "line", a: d.start, b: p });
  };
  const up = () => {
    const d = drag.current, s = draft; drag.current = null; setDraft(null);
    if (tool === "eraser") { const gone = erased.current; erased.current = null; setErasing(null); if (gone && gone.size) commit(shapes.filter((x) => !gone.has(x.id))); return; }
    if (!d || !s) return;
    const { w, h } = plot;
    if (s.k === "pen" || s.k === "hl") { const pts = thin(s.pts, w, h); if (pts.length > 1 || s.pts.length > 1) commit([...shapes, { ...s, id: newId(), pts }]); }
    else if ("b" in s && Math.hypot((s.b[0] - s.a[0]) * w, (s.b[1] - s.a[1]) * h) >= 4) commit([...shapes, { ...s, id: newId() }]);   // a click without a drag draws nothing
  };
  const finishText = () => { if (typing && typing.text.trim()) commit([...shapes, { ...base, o: 1, id: newId(), k: "text", a: typing.at, t: typing.text.trim().slice(0, MAX_TEXT) }]); setTyping(null); };

  // ------------------------------------------------------------------ the floating toolbar: where it sits, and moving it
  const tbw = tb.w, tbh = tb.h;
  const place = (x: number, y: number) => ({ x: Math.max(0, Math.min(Math.max(0, size.w - tbw), x)), y: Math.max(0, Math.min(Math.max(0, size.h - tbh), y)) });
  const px = pos && size.w ? place(pos.x * size.w, pos.y * size.h) : place(plot.l + plot.w / 2 - tbw / 2, size.h - tbh - 2);   // first time: centred at the chart's bottom edge, over the date labels, as in the team's picture
  const grab = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button > 0) return;
    e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId);
    const r = box.current!.getBoundingClientRect();
    moving.current = { dx: e.clientX - r.left - px.x, dy: e.clientY - r.top - px.y };
  };
  const drift = (e: React.PointerEvent<HTMLElement>) => {
    const m = moving.current; if (!m || !size.w || !size.h) return;
    const r = box.current!.getBoundingClientRect(), p = place(e.clientX - r.left - m.dx, e.clientY - r.top - m.dy);
    setPos({ x: p.x / size.w, y: p.y / size.h });
  };
  const drop = () => { if (!moving.current) return; moving.current = null; try { if (pos) localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch { /* not kept */ } };
  const nudge = (e: React.KeyboardEvent<HTMLElement>) => {             // the grip moves with the arrow keys too
    const step = e.shiftKey ? 40 : 10, d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d || !size.w || !size.h) return;
    e.preventDefault(); const p = place(px.x + d[0], px.y + d[1]), next = { x: p.x / size.w, y: p.y / size.h };
    setPos(next); try { localStorage.setItem(POS_KEY, JSON.stringify(next)); } catch { /* not kept */ }
  };
  const popUp = px.y > 150;                                                // menus open above the toolbar, or below it near the top of the chart

  const shown = erasing && erasing.size ? shapes.filter((x) => !erasing.has(x.id)) : shapes;
  const all = draft ? [...shown, draft] : shown;
  const info = useMemo(() => TOOL[tool], [tool]);
  const settings = SETTINGS_OF(tool);
  const wide = size.w >= WIDE;
  const pick = (t: ToolId) => { setTool(t); setMenu(null); if (SHAPE_TOOLS.includes(t)) setShapeTool(t); };

  const toolBtn = (t: ToolId, label = TOOL[t].label) => (
    <button key={t} type="button" className={"dlm-b" + (tool === t ? " on" : "")} aria-pressed={tool === t} aria-label={label} title={`${label}: ${TOOL[t].hint}`} onClick={() => pick(t)}><Ic n={t} /></button>
  );
  const swatches = (cls: string) => (Object.keys(COLOURS) as ColourId[]).map((c) => (
    <button key={c} type="button" className={cls + (colour === c ? " on" : "")} aria-pressed={colour === c} aria-label={`Colour: ${COLOUR_NAME[c]}`} title={COLOUR_NAME[c]} onClick={() => { setColour(c); if (menu === "colours") setMenu(null); }}><i style={{ background: swatch(c) }} /></button>
  ));
  const isShape = SHAPE_TOOLS.includes(tool);

  const toolbar = open && (
    <div ref={bar} className={"dlm" + (mini ? " dlm-mini" : "") + (size.w && size.w < NARROW ? " dlm-narrow" : "") + (size.w && size.w < TINY ? " dlm-tiny" : "")} role="toolbar" aria-label="Chart markup tools" style={{ left: px.x, top: px.y, maxWidth: size.w ? size.w : undefined }}
      onPointerDown={(e) => e.stopPropagation()}>
      <div className="dlm-row">
        <button type="button" className="dlm-grip" aria-label="Move the markup toolbar (drag, or use the arrow keys)" title="Drag to move the toolbar"
          onPointerDown={grab} onPointerMove={drift} onPointerUp={drop} onPointerCancel={drop} onKeyDown={nudge}><Ic n="grip" /></button>
        {mini ? <>
          <span className="dlm-now" title={`${info.label} selected`}><Ic n={tool} /><i style={{ background: swatch(colour) }} /></span>
          <button type="button" className="dlm-b" aria-label="Expand the markup toolbar" title="Expand" onClick={() => setMini(false)}><Ic n="expand" /></button>
        </> : <>
          {toolBtn("pen")}{toolBtn("hl", "Highlighter")}{toolBtn("eraser", "Eraser")}{toolBtn("text")}
          <button type="button" className={"dlm-b" + (isShape ? " on" : "")} aria-pressed={isShape} aria-haspopup="menu" aria-expanded={menu === "shapes"} aria-label={`Shapes: ${TOOL[shapeTool].label}`} title="Shapes: line, arrows, rectangle, circle, level lines, Fibonacci"
            onClick={() => { if (!isShape) pick(shapeTool); setMenu(menu === "shapes" ? null : "shapes"); }}><Ic n={isShape ? tool : shapeTool} /><em className="dlm-caret" aria-hidden="true" /></button>
          <span className="dlm-sep" aria-hidden="true" />
          {wide ? <span className="dlm-cols" role="group" aria-label="Colour">{swatches("dlm-sw")}</span>
            : <button type="button" className="dlm-sw on" aria-haspopup="menu" aria-expanded={menu === "colours"} aria-label={`Colour: ${COLOUR_NAME[colour]}. Choose another`} title="Colour" onClick={() => setMenu(menu === "colours" ? null : "colours")}><i style={{ background: swatch(colour) }} /></button>}
          <span className="dlm-sep" aria-hidden="true" />
          <button type="button" className="dlm-b" disabled={!past.length} aria-label="Undo" title="Undo (Ctrl+Z)" onClick={undo}><Ic n="undo" /></button>
          <button type="button" className="dlm-b" disabled={!future.length} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" onClick={redo}><Ic n="redo" /></button>
          <button type="button" className="dlm-b" disabled={!shapes.length} aria-label="Clear all drawings" title="Remove every annotation from this chart" aria-expanded={menu === "clear"} onClick={() => setMenu(menu === "clear" ? null : "clear")}><Ic n="trash" /></button>
          <span className="dlm-sep" aria-hidden="true" />
          <button type="button" className="dlm-b" aria-label="Minimise the markup toolbar" title="Minimise" onClick={() => { setMini(true); setMenu(null); }}><Ic n="min" /></button>
        </>}
        <button type="button" className="dlm-b dlm-done" aria-label="Done drawing" title="Done (Esc)" onClick={close}><Ic n="done" /></button>
      </div>
      {!mini && (settings.width || settings.opacity) && (
        <div className="dlm-set" role="group" aria-label={`${info.label} settings`}>
          {settings.width && <span role="group" aria-label="Thickness"><small>Thickness</small>{WIDTHS.map((x, i) => <button key={x} type="button" className={"dlm-wd" + (width === x ? " on" : "")} aria-pressed={width === x} aria-label={`Thickness ${["thin", "medium", "thick"][i]}`} title={["Thin", "Medium", "Thick"][i]} onClick={() => setWidth(x)}><i style={{ height: x }} /></button>)}</span>}
          {settings.opacity && <span role="group" aria-label="Opacity"><small>Opacity</small>{OPACITIES.map((o) => <button key={o} type="button" className={"dlm-op" + (opacity === o ? " on" : "")} aria-pressed={opacity === o} aria-label={`Opacity ${o * 100}%`} title={`${o * 100}%`} onClick={() => setAlpha({ ...alpha, [tool]: o })}>{o * 100}%</button>)}</span>}
        </div>
      )}
      {menu === "shapes" && <div className={"dlm-pop" + (popUp ? " up" : "")} role="menu" aria-label="Shapes">{SHAPE_TOOLS.map((t) => (
        <button key={t} type="button" role="menuitemradio" aria-checked={tool === t} className={tool === t ? "on" : ""} title={TOOL[t].hint} onClick={() => pick(t)}><Ic n={t} /><span>{TOOL[t].label}</span></button>))}</div>}
      {menu === "colours" && <div className={"dlm-pop dlm-pop-sw" + (popUp ? " up" : "")} role="menu" aria-label="Colours">{swatches("dlm-sw")}</div>}
      {menu === "clear" && (
        <div className={"dlm-pop dlm-confirm" + (popUp ? " up" : "")} role="alertdialog" aria-label="Clear all annotations">
          <span>Remove all {shapes.length} annotation{shapes.length === 1 ? "" : "s"} from this chart? Undo can bring them back.</span>
          <button type="button" className="dlm-danger" autoFocus onClick={clear}>Clear all</button>
          <button type="button" onClick={() => setMenu(null)}>Cancel</button>
        </div>
      )}
      <span className="dl-sr" role="status">{info.label} selected: {info.hint}.</span>
    </div>
  );

  return (
    <div className="dl-outer" onPointerDownCapture={() => touchLayer(id)} onFocusCapture={() => touchLayer(id)}>
      <div className={"dl" + (open ? " drawing" : "")} ref={box}>
        {children}
        {enabled && plot.w > 0 && (
          <svg className={"dl-svg" + (open ? " on" : "")} width={plot.w} height={plot.h} style={{ left: plot.l, top: plot.t, pointerEvents: open ? "auto" : "none", cursor: open ? (tool === "eraser" ? "pointer" : tool === "text" ? "text" : "crosshair") : "default", touchAction: open ? "none" : "auto" }}
            onPointerDown={down} onMouseDown={(e) => { if (open && tool === "text") e.preventDefault(); }} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-hidden={!open} data-testid="dl-plot">
            {all.map((s) => <Mark key={s.id} s={s} w={plot.w} h={plot.h} />)}
          </svg>
        )}
        {typing && (
          <input className="dl-text" autoFocus maxLength={MAX_TEXT} value={typing.text} placeholder="Type, then Enter" aria-label="Note text"
            style={{ left: plot.l + typing.at[0] * plot.w, top: plot.t + typing.at[1] * plot.h, color: colour === "ink" ? undefined : COLOURS[colour] }}
            onChange={(e) => setTyping({ ...typing, text: e.target.value })} onBlur={() => { if (Date.now() - typedAt.current > 300) finishText(); }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") finishText(); else if (e.key === "Escape") setTyping(null); }} />
        )}
        {toolbar}
        {enabled && !controlled && (
          <div className="dl-bar"><DrawToggle open={open} count={shapes.length} onToggle={() => setOpen(!open)} className="dl-toggle" /></div>
        )}
      </div>
    </div>
  );
}

/** The pencil a chart shows in its top-right controls (task #124). It opens and closes the floating markup toolbar; the badge counts the drawings. */
export function DrawToggle({ open, count, onToggle, className = "" }: { open: boolean; count: number; onToggle: () => void; className?: string }) {
  return (
    <button type="button" className={className + (open ? " on" : "")} aria-pressed={open} aria-label={open ? "Close the markup tools" : "Annotate this chart"} title={open ? "Close the markup tools (Esc)" : "Annotate this chart"}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}>
      <Ic n="pen" />{!open && count > 0 && <b className="dl-n" aria-label={`${count} drawing${count === 1 ? "" : "s"}`}>{count}</b>}
    </button>
  );
}

function Mark({ s, w, h }: { s: Shape; w: number; h: number }) {
  const col = COLOURS[s.c], X = (p: Pt) => p[0] * w, Y = (p: Pt) => p[1] * h;
  const op = s.o ?? (s.k === "hl" ? 0.32 : 1);
  const common = { stroke: col, strokeWidth: s.w, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeOpacity: op };
  const wrap = (el: React.ReactNode) => <g style={{ color: "var(--text)" }}>{el}</g>;
  switch (s.k) {
    case "pen": return wrap(<polyline {...common} points={s.pts.map((p) => `${X(p).toFixed(1)},${Y(p).toFixed(1)}`).join(" ")} />);
    case "line": return wrap(<line {...common} x1={X(s.a)} y1={Y(s.a)} x2={X(s.b)} y2={Y(s.b)} />);
    case "arrow": {
      const x1 = X(s.a), y1 = Y(s.a), x2 = X(s.b), y2 = Y(s.b), ang = Math.atan2(y2 - y1, x2 - x1), L = 10 + s.w * 2.2;
      const hd = (da: number) => `${x2 - L * Math.cos(ang + da)},${y2 - L * Math.sin(ang + da)}`;
      return wrap(<g {...common}><line x1={x1} y1={y1} x2={x2} y2={y2} /><polyline points={`${hd(0.45)} ${x2},${y2} ${hd(-0.45)}`} /></g>);
    }
    case "darrow": {
      const x1 = X(s.a), y1 = Y(s.a), x2 = X(s.b), y2 = Y(s.b), ang = Math.atan2(y2 - y1, x2 - x1), L = 10 + s.w * 2.2;
      const hd = (x: number, y: number, a: number, da: number) => `${x - L * Math.cos(a + da)},${y - L * Math.sin(a + da)}`;
      return wrap(<g {...common}><line x1={x1} y1={y1} x2={x2} y2={y2} /><polyline points={`${hd(x2, y2, ang, 0.45)} ${x2},${y2} ${hd(x2, y2, ang, -0.45)}`} /><polyline points={`${hd(x1, y1, ang + Math.PI, 0.45)} ${x1},${y1} ${hd(x1, y1, ang + Math.PI, -0.45)}`} /></g>);
    }
    case "hl": return wrap(<polyline {...common} strokeWidth={hlWidth(s.w)} points={s.pts.map((p) => `${X(p).toFixed(1)},${Y(p).toFixed(1)}`).join(" ")} />);
    case "hline": return wrap(<line {...common} x1={0} x2={w} y1={Y(s.a)} y2={Y(s.a)} strokeDasharray="6 4" />);
    case "vline": return wrap(<line {...common} y1={0} y2={h} x1={X(s.a)} x2={X(s.a)} strokeDasharray="6 4" />);
    case "rect": return wrap(<rect {...common} x={Math.min(X(s.a), X(s.b))} y={Math.min(Y(s.a), Y(s.b))} width={Math.abs(X(s.b) - X(s.a))} height={Math.abs(Y(s.b) - Y(s.a))} rx={3} fill={col === "currentColor" ? "none" : col} fillOpacity={0.1 * op} />);
    case "ellipse": return wrap(<ellipse {...common} cx={(X(s.a) + X(s.b)) / 2} cy={(Y(s.a) + Y(s.b)) / 2} rx={Math.abs(X(s.b) - X(s.a)) / 2} ry={Math.abs(Y(s.b) - Y(s.a)) / 2} fill={col === "currentColor" ? "none" : col} fillOpacity={0.08 * op} />);
    case "fib": {
      const x0 = Math.min(X(s.a), X(s.b)), x1 = Math.max(X(s.a), X(s.b), x0 + 60), lines = fibLines(s.a, s.b);
      return wrap(<g>{lines.map((l, i) => <g key={l.level}>
        <line {...common} strokeWidth={Math.max(1, s.w / 2)} x1={x0} x2={x1} y1={l.y * h} y2={l.y * h} strokeDasharray={i === 0 || i === FIB_LEVELS.length - 1 ? undefined : "4 4"} />
        <text x={Math.min(x1 + 4, w - 34)} y={l.y * h + 4} fill={col} fillOpacity={op} fontSize={11} fontFamily="IBM Plex Mono, monospace" stroke="var(--s1)" strokeWidth={3} paintOrder="stroke">{(l.level * 100).toFixed(1).replace(".0", "")}%</text></g>)}</g>);
    }
    case "text": return wrap(<text x={X(s.a)} y={Y(s.a)} fill={col} fillOpacity={op} fontSize={14} fontWeight={600} fontFamily="IBM Plex Sans, system-ui, sans-serif" stroke="var(--s1)" strokeWidth={3} paintOrder="stroke">{s.t}</text>);
  }
}
