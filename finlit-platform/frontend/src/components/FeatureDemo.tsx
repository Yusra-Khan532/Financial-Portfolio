import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { demoFor, type Demo } from "../lib/featureDemos";
import STEPS from "../content/featureSteps.json";
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
 *  ask their device for less motion or to save data; they press play. If the clip cannot be loaded the poster stays up with a plain line, never a blank box. */
function Media({ d, full }: { d: Demo; full?: boolean }) {
  const m = media(d);
  const still = quiet() || saveData();
  const [bad, setBad] = useState(false);
  if (!m.video) return <img className="fd-media" src={m.poster} alt={`A picture of ${d.title} on FinLit`} width={1200} height={750} />;
  return (
    <>
      <video className="fd-media" src={m.video} poster={m.poster} muted loop playsInline autoPlay={!still} controls={full || still} preload={full ? "auto" : "metadata"} onError={() => setBad(true)}
        width={960} height={600} aria-label={`A short screen recording of ${d.title} on FinLit`} />
      {bad && <p className="fd-bad" role="status">The recording could not be loaded just now. Use the button below to open the real page.</p>}
    </>
  );
}

/** The (i) beside a feature on the Plans page: hover (on a computer) shows a small preview of the feature working; a click, Enter or a tap opens the full view.
 *  The preview is placed from its measured height, touches the (i) with no gap to cross, stays while the pointer is on it, and follows the (i) when the page scrolls. */
export function FeatureInfo({ feature, label }: { feature: string; label?: string }) {
  const d = demoFor(feature);
  const [peek, setPeek] = useState(false);
  const [full, setFull] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const timer = useRef<number>(0);
  const me = useId();

  /** Put the preview above or below the (i), whichever has room, from the preview's real height. */
  const place = () => {
    const a = btn.current?.getBoundingClientRect(), el = card.current;
    if (!a || !el) return;
    const w = el.offsetWidth, h = el.offsetHeight, gap = 4;
    if (a.bottom < 0 || a.top > innerHeight) { setPeek(false); return; }          // the (i) scrolled out of view
    const below = a.bottom + gap + h <= innerHeight - 8, above = a.top - gap - h >= 8;
    const top = below || !above ? Math.min(a.bottom + gap, Math.max(8, innerHeight - h - 8)) : a.top - gap - h;
    el.style.left = Math.max(12, Math.min(a.left + a.width / 2 - w / 2, innerWidth - w - 12)) + "px";
    el.style.top = top + "px";
    el.classList.toggle("above", !(below || !above));
  };
  useLayoutEffect(() => { if (peek) place(); });
  useEffect(() => {
    const other = (e: Event) => { if ((e as CustomEvent).detail !== me) setPeek(false); };
    addEventListener(CLOSE_OTHERS, other); return () => removeEventListener(CLOSE_OTHERS, other);
  }, [me]);
  useEffect(() => {
    if (!peek) return;
    let raf = 0;
    const follow = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };
    addEventListener("scroll", follow, true); addEventListener("resize", follow);
    return () => { cancelAnimationFrame(raf); removeEventListener("scroll", follow, true); removeEventListener("resize", follow); };
  }, [peek]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => window.clearTimeout(timer.current), []);
  if (!d) return label ? <>{label}</> : null;

  const show = () => { if (!canHover()) return; window.clearTimeout(timer.current); timer.current = window.setTimeout(() => { dispatchEvent(new CustomEvent(CLOSE_OTHERS, { detail: me })); setPeek(true); }, 220); };
  const hide = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setPeek(false), 400); };
  const stay = () => window.clearTimeout(timer.current);
  const open = () => { window.clearTimeout(timer.current); setPeek(false); setFull(true); };

  return (
    <>
      {/* the whole feature name and the (i) are one button, so there is a big target to hover or press */}
      <button ref={btn} type="button" className="fd-trig" aria-label={`See how ${d.title} works`} aria-haspopup="dialog"
        onMouseEnter={show} onMouseLeave={hide} onClick={(e) => { e.preventDefault(); e.stopPropagation(); open(); }}>
        {label && <span className="fd-lt">{label}</span>}<span className="fd-i" aria-hidden="true">i</span>
      </button>
      {peek && createPortal(
        <div ref={card} className="fd-peek" onMouseEnter={stay} onMouseLeave={hide} role="note" aria-label={`${d.title}: preview`}>
          <div className="fd-frame"><Media d={d} /></div>
          <b>{d.title}</b><p>{d.say}</p>
          <button type="button" className="fd-more" onClick={open}>{d.kind === "video" ? "Watch it full size" : "See it full size"} →</button>
        </div>, document.body)}
      {full && <FullView d={d} onClose={() => { setFull(false); btn.current?.focus({ preventScroll: true }); }} />}
    </>
  );
}

/** The full view: a dialog with the clip (with controls), what it shows and a link to the tool. Esc, the close button or a click outside closes it. */
function FullView({ d, onClose }: { d: Demo; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useLayoutEffect(() => {   // lock the page behind the player without letting it jump sideways when the scrollbar goes
    closeBtn.current?.focus({ preventScroll: true });
    const b = document.body, o = b.style.overflow, pr = b.style.paddingRight, sw = innerWidth - document.documentElement.clientWidth;
    b.style.overflow = "hidden"; if (sw > 0) b.style.paddingRight = sw + "px";
    return () => { b.style.overflow = o; b.style.paddingRight = pr; };
  }, []);
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
        {(STEPS as Record<string, string[]>)[d.id]?.length > 0 && <div className="fd-steps"><h3>What you will see</h3>
          <ol>{(STEPS as Record<string, string[]>)[d.id].map((t) => <li key={t}>{t}</li>)}</ol></div>}
        <div className="fd-foot">
          <p>{d.say}</p>
          <Link className="btn primary" to={d.to} onClick={onClose}>{d.toLabel} →</Link>
        </div>
        <p className="fd-fine">{d.kind === "video" ? "A short screen recording of the real page, with sample data." : "A picture of the real page, with sample data."} Information only, not investment advice.</p>
      </div>
    </div>, document.body);
}
