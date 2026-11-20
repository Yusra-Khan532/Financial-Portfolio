// Task #276 (shared portfolio parts, §11 "Hidden sections"): a section with Hide. Hidden, it is a slim card: the title, "Hidden · " and the section's
// subtitle, and Show ▾. The choice is kept per section in this browser under the same key as the site's Hideable ("finlit.hide.pack.<id>"), so a section
// hidden before stays hidden. Other parts (the Sections ▾ menu) can read and change it: setHidden() tells every open section.
import { useEffect, useState, type ReactNode } from "react";
import { Tip } from "../../components/sectors/pack/Common";
import "../../styles/hideable.css";
import "./kit.css";

const key = (id: string) => `finlit.hide.pack.${id}`;
export const isHidden = (id: string) => { try { return localStorage.getItem(key(id)) === "1"; } catch { return false; } };
export function setHidden(id: string, v: boolean) {
  try { localStorage.setItem(key(id), v ? "1" : "0"); } catch { /* private window: lasts for this visit */ }
  window.dispatchEvent(new CustomEvent("ptk-hide", { detail: { id, v } }));
}
export function useHidden(id: string): [boolean, (v: boolean) => void] {
  const [h, set] = useState(() => isHidden(id));
  useEffect(() => { const on = (e: Event) => { const d = (e as CustomEvent<{ id: string; v: boolean }>).detail; if (d?.id === id) set(d.v); }; addEventListener("ptk-hide", on); return () => removeEventListener("ptk-hide", on); }, [id]);
  return [h, (v) => { set(v); setHidden(id, v); }];
}

export const EYE = <svg className="hz-ic" viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M3 3l14 14M8.6 5.2A8 8 0 0 1 10 5c4 0 6.8 3.2 7.8 5-.4.8-1.2 1.9-2.3 2.9M12.8 12.9A4 4 0 0 1 7.1 7.2M5.2 6.6C3.9 7.6 3 8.9 2.2 10c1 1.8 3.8 5 7.8 5 1 0 1.9-.2 2.7-.5" /></svg>;

/** The live page's section (sp-sec) with the slim hidden card. `subText`: the subtitle in words for the hidden card (the sub itself when it is text). */
export function Section({ id, title, help, how, sub, subText, hide, right, children, className = "" }: {
  id: string; title: string; help?: string; how?: string; sub?: ReactNode; subText?: string; hide?: boolean; right?: ReactNode; children: ReactNode; className?: string;
}) {
  const [hidden, setH] = useHidden(id);
  const sw = typeof sub === "string" ? sub : subText ?? "";
  if (hide && hidden) return (
    <section className="ptk-hz" aria-labelledby={id}>
      <div className="ptk-hz-t"><h2 id={id}>{title}</h2><p>Hidden{sw ? ` · ${sw}` : ""}</p></div>
      <button type="button" className="ptk-hz-b" aria-expanded="false" aria-label={`Show: ${title}`} onClick={() => setH(false)}>Show ▾</button>
    </section>);
  const body = (
    <section className={"sp-sec " + className} aria-labelledby={id}>
      <div className="sp-sec-h"><div><h2 id={id}>{title}{help && <Tip text={help} how={how} label={`About “${title}”`} />}</h2>{sub && <p className="sp-sub">{sub}</p>}</div>{right}</div>
      {children}
    </section>);
  if (!hide) return body;
  return <div className="hz">{body}<button type="button" className="hz-btn hz-on" aria-expanded="true" aria-label={`Hide: ${title}`} onClick={() => setH(true)}>{EYE}Hide</button></div>;
}
