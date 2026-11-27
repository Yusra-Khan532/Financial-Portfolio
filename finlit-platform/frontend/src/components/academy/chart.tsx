// F&O Academy charts: shared pieces. Each chart draws at the width its box has (so labels stay readable on a phone) and a fixed height in the
// page, taller in the ChartZoom dialog (useZoomHeight). Numbers are formatted the Indian way.
import { useEffect, useRef, useState, type ReactNode } from "react";

/** The width of the box (default 720 before it is measured, and in tests). */
export function useBoxWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { const n = Math.round(el.getBoundingClientRect().width); if (n > 120) setW((o) => (Math.abs(o - n) > 1 ? n : o)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export const inr = (x: number, d = 0) => `${x < 0 ? "−" : ""}₹${Math.abs(x).toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d })}`;
export const signedInr = (x: number) => (x > 0 ? "+" : "") + inr(x);
export const num = (x: number, d = 2) => x.toLocaleString("en-IN", { maximumFractionDigits: d });

/** "Nice" tick values between lo and hi (about `n` of them). */
export function ticks(lo: number, hi: number, n = 5): number[] {
  const span = hi - lo || 1, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n + 1) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

/** Short ₹ for an axis: ₹12.5k, ₹1.2L, ₹3.4Cr. */
export function axisInr(x: number): string {
  const a = Math.abs(x), s = x < 0 ? "−" : "";
  if (a >= 1e7) return `${s}₹${+(a / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${s}₹${+(a / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${s}₹${+(a / 1e3).toFixed(1)}k`;
  return `${s}₹${Math.round(a)}`;
}

/** A labelled number input. Keeps the typed text while it is being edited; reports only finite numbers. */
export function NumField({ label, value, onChange, step = 1, min, suffix, id }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; suffix?: string; id: string }) {
  const [text, setText] = useState(String(value));
  const [focus, setFocus] = useState(false);
  const shown = focus ? text : String(value);
  return (
    <label className="fa-field" htmlFor={id}>
      <span>{label}{suffix ? <small> ({suffix})</small> : null}</span>
      <input id={id} className="ui-input" type="number" inputMode="decimal" step={step} min={min} value={shown}
        onFocus={() => { setText(String(value)); setFocus(true); }} onBlur={() => setFocus(false)}
        onChange={(e) => { setText(e.target.value); const v = parseFloat(e.target.value); if (Number.isFinite(v) && (min == null || v >= min)) onChange(v); }} />
    </label>
  );
}

/** A two- or more-way switch drawn as pressed buttons (aria-pressed marks the selected one). */
export function Switch<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="fa-switch ui-tabs" role="group" aria-label={label}>
      {options.map(([v, name]) => <button key={v} type="button" className="ui-tab" aria-pressed={value === v} onClick={() => onChange(v)}>{name}</button>)}
    </div>
  );
}

/** The line under a chart that repeats the hover card's reading, so touch screens (which get no hover card) can read it too. */
export function Readout({ children }: { children: ReactNode }) {
  return <p className="fa-readout" aria-live="polite">{children}</p>;
}
