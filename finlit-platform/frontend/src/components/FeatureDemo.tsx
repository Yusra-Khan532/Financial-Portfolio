import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { demoFor, type Demo } from "../lib/featureDemos";
import "../styles/feature-demo.css";

const BASE = import.meta.env.BASE_URL;
const media = (d: Demo) => d.kind === "video"
  ? { video: `${BASE}plans/demos/${d.id}.mp4`, poster: `${BASE}plans/demos/${d.id}.jpg` }
  : { video: null, poster: `${BASE}landing/tools/${d.image}.webp` };
const quiet = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const saveData = () => !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
const canHover = () => typeof matchMedia !== "undefined" && matchMedia("(hover: hover) and (pointer: fine)").matches;
/** Only one demo is open at a time: opening one tells the others to close. */
const CLOSE_OTHERS = "finlit:feature-demo";

/** The clip or picture of a feature. In the hover preview it plays muted on a loop; in the full view it has controls. Autoplay is off for people who
 *  ask their device for less motion or to save data; they press play. */
function Media({ d, full }: { d: Demo; full?: boolean }) {
  const m = media(d);
  const still = quiet() || saveData();
  if (!m.video) return <img className="fd-media" src={m.poster} alt={`A picture of ${d.title} on FinLit`} width={1200} height={750} />;
  return <video className="fd-media" src={m.video} poster={m.poster} muted loop playsInline autoPlay={!still} controls={full || still} preload={full ? "auto" : "metadata"}
    width={960} height={600} aria-label={`A short screen recording of ${d.title} on FinLit`} />;
}

/** The (i) beside a feature on the Plans page: hover (on a computer) shows a small preview of the feature working; a click, Enter or a tap opens the full view. */
export function FeatureInfo({ feature }: { feature: string }) {
  const d = demoFor(feature);
  const [peek, setPeek] = useState(false);
  const [full, setFull] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const timer = useRef<number>(0);
  const me = useId();

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const w = Math.min(340, innerWidth - 24), h = 290;
    const above = r.bottom + h + 12 > innerHeight && r.top > h + 12;
    setPos({ left: Math.max(12, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 12)), top: above ? r.top - h - 8 : r.bottom + 8, above });
  }, []);
  useEffect(() => {
    const other = (e: Event) => { if ((e as CustomEvent).detail !== me) { setPeek(false); } };
    addEventListener(CLOSE_OTHERS, other); return () => removeEventListener(CLOSE_OTHERS, other);
  }, [me]);
  useEffect(() => {
    if (!peek) return;
    const away = () => setPeek(false);
    addEventListener("scroll", away, true); addEventListener("resize", away);
    return () => { removeEventListener("scroll", away, true); removeEventListener("resize", away); };
  }, [peek]);
  if (!d) return null;

  const show = () => { if (!canHover()) return; window.clearTimeout(timer.current); timer.current = window.setTimeout(() => { place(); dispatchEvent(new CustomEvent(CLOSE_OTHERS, { detail: me })); setPeek(true); }, 280); };
  const hide = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setPeek(false), 180); };
  const open = () => { window.clearTimeout(timer.current); setPeek(false); setFull(true); };

  return (
    <>
      <button ref={btn} type="button" className="fd-i" aria-label={`See how ${d.title} works`} aria-haspopup="dialog"
        onMouseEnter={show} onMouseLeave={hide} onClick={(e) => { e.preventDefault(); e.stopPropagation(); open(); }}>i</button>
      {peek && pos && createPortal(
        <div className={"fd-peek" + (pos.above ? " above" : "")} style={{ left: pos.left, top: pos.top }} onMouseEnter={() => window.clearTimeout(timer.current)} onMouseLeave={hide} role="note" aria-label={`${d.title}: preview`}>
          <div className="fd-frame"><Media d={d} /></div>
          <b>{d.title}</b><p>{d.say}</p>
          <button type="button" className="fd-more" onClick={open}>{d.kind === "video" ? "Watch it full size" : "See it full size"} →</button>
        </div>, document.body)}
      {full && <FullView d={d} onClose={() => { setFull(false); btn.current?.focus(); }} />}
    </>
  );
}

/** The full view: a dialog with the clip (with controls), what it shows and a link to the tool. Esc, the close button or a click outside closes it. */
function FullView({ d, onClose }: { d: Demo; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useLayoutEffect(() => { closeBtn.current?.focus(); const o = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = o; }; }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key === "Tab" && box.current) {   // keep the keyboard inside the dialog
        const f = [...box.current.querySelectorAll<HTMLElement>("button, a[href], video[controls]")];
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return createPortal(
    <div className="fd-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="fd-dlg" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={box}>
        <header><h2 id={titleId}>{d.title}</h2><button ref={closeBtn} type="button" className="fd-x" onClick={onClose} aria-label="Close">×</button></header>
        <div className="fd-frame big"><Media d={d} full /></div>
        <div className="fd-foot">
          <p>{d.say}</p>
          <Link className="btn primary" to={d.to} onClick={onClose}>{d.toLabel} →</Link>
        </div>
        <p className="fd-fine">{d.kind === "video" ? "A short screen recording of the real page, with sample data." : "A picture of the real page, with sample data."} Information only, not investment advice.</p>
      </div>
    </div>, document.body);
}
