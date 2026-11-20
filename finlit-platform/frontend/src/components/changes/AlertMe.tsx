// Task #272 (Watchlists and Alerts, 20 Nov pack): "Alert me" on a list page and "Tell me when a company on this list files". Both create the same list
// alert as Alerts › Create alert › A list › "A filing Discover sorts as…": one alert for the whole list (1 of the plan's alerts), checked on weekday
// evenings once the day's filings are in. Reusable by every list page (equity, MF, ETF, All my investments, Watchlists); mounted on Watchlists here.
import { useState } from "react";
import { Link } from "react-router";
import { DEFAULT_FILING_KINDS, FILING_KINDS, kindsText } from "../../lib/alertCatalog";
import { askBrowserPermission, browserPermission, useAlerts, type AlertRow, type Channel } from "../../lib/alerts";
import { useAuth } from "../../lib/auth";
import { Icon } from "../../lib/icons";
import { useUI } from "../../lib/ui";
import { KIND } from "../../lib/whatChanged";

type Err = { body?: { detail?: string | { detail?: string; status?: string; plan?: string }; status?: string; plan?: string } };
function errText(x: unknown): { detail: string; plan?: string } {
  const b = (x as Err)?.body, d = b?.detail;
  if (d && typeof d === "object") return { detail: d.detail || "The alert could not be saved. Please try again.", plan: d.plan };
  return { detail: (typeof d === "string" && d) || "The alert could not be saved. Please try again.", plan: b?.plan };
}

/** The member's live alert on this list, if any (the newest). */
export function useListAlert(listRef: string): AlertRow | null {
  const { alerts } = useAlerts();
  return alerts.find((a) => a.metric === "discover_filing" && a.list === listRef && a.status !== "done") ?? null;
}

function useCreate(listRef: string, onDone?: () => void) {
  const { user } = useAuth();
  const { toast, upgrade } = useUI();
  const { create, alerts, limit } = useAlerts();
  const [err, setErr] = useState<{ detail: string; plan?: string } | null>(null);
  const submit = (kinds: string[], digest: boolean, channels: Channel[]) => {
    setErr(null);
    if (!user) { upgrade("basic", "Alerts need a free account."); return; }
    create.mutate({ symbol: "", metric: "discover_filing", op: "event", value: null, list: listRef, kinds, digest, channels, repeat: "every" }, {
      onSuccess: () => { toast(`Alert set: ${kindsText(kinds)} at a company on this list.`); onDone?.(); },
      onError: (x) => setErr(errText(x)),
    });
  };
  return { submit, err, pending: create.isPending, used: alerts.filter((a) => a.status !== "done").length, limit };
}

function Warn({ err }: { err: { detail: string; plan?: string } | null }) {
  const { upgrade } = useUI();
  if (!err) return null;
  return <p className="wc-warn" role="alert">{err.detail} {err.plan && <button type="button" className="wc-lnk" onClick={() => upgrade((err.plan as "silver" | "gold") || "silver", err.detail)}>See plans</button>}</p>;
}

/** The short form "Alert me" opens on a list page (the pack's alerts-02 picture). */
export function AlertMeForm({ listRef, listLabel, onClose }: { listRef: string; listLabel: string; onClose: () => void }) {
  const { toast } = useUI();
  const [kinds, setKinds] = useState<string[]>(DEFAULT_FILING_KINDS), [digest, setDigest] = useState(false), [browser, setBrowser] = useState(false);
  const c = useCreate(listRef, onClose);
  const flip = (k: string) => setKinds((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]));
  const pickBrowser = async (on: boolean) => {
    if (!on) { setBrowser(false); return; }
    const p = browserPermission();
    if (p === "unsupported") { toast("This browser cannot show notifications. In-app alerts still work."); return; }
    if (p === "denied") { toast("Notifications are blocked for this site. Allow them in the browser's site settings, then try again."); return; }
    if (p === "default" && (await askBrowserPermission()) !== "granted") { toast("Browser notifications were not allowed."); return; }
    setBrowser(true);
  };
  return (
    <form className="wc-am" aria-label={`Tell me when a company in ${listLabel} files`} onSubmit={(e) => { e.preventDefault(); if (kinds.length && !c.pending) c.submit(kinds, digest, browser ? ["app", "browser"] : ["app"]); }}>
      <h3><Icon name="bell" />Tell me when a company in {listLabel} files</h3>
      <div className="wc-kc" role="group" aria-label="Kinds of filing">
        {FILING_KINDS.map((k) => (
          <label key={k.k} className={"wc-ck" + (kinds.includes(k.k) ? " on" : "")}>
            <input type="checkbox" checked={kinds.includes(k.k)} onChange={() => flip(k.k)} /><i className={"wc-dot " + (KIND[k.k]?.tone ?? "")} aria-hidden="true" />{KIND[k.k]?.tile ?? k.chip}
          </label>))}
      </div>
      <div className="wc-amf">
        <fieldset className="wc-fs"><legend>How often</legend>
          <label><input type="radio" name={"wc-often-" + listRef} checked={!digest} onChange={() => setDigest(false)} />Each filing</label>
          <label><input type="radio" name={"wc-often-" + listRef} checked={digest} onChange={() => setDigest(true)} />One summary a day</label>
        </fieldset>
        <fieldset className="wc-fs"><legend>Notify via</legend>
          <label><input type="checkbox" checked readOnly disabled />In-app</label>
          <label><input type="checkbox" checked={browser} onChange={(e) => pickBrowser(e.target.checked)} />Browser</label>
        </fieldset>
        <p className="wc-amn">Checked on weekday evenings, once the day's filings are in. One alert for the whole list: 1 of your {c.limit}.</p>
        <div className="wc-amb">
          <button type="button" className="wc-lnk" onClick={onClose}>Cancel</button>
          <button type="submit" className="wc-go" disabled={!kinds.length || c.pending}>{c.pending ? "Saving…" : "Set alert"}</button>
        </div>
      </div>
      {!kinds.length && <p className="wc-warn" role="status">Pick at least one kind of filing.</p>}
      <Warn err={c.err} />
    </form>
  );
}

/** "Tell me when a company on this list files" (New), beside the Watchlists page's "Tell me when a label changes". */
export function ListFilesCard({ listRef, title = "Tell me when a company on this list files" }: { listRef: string; title?: string }) {
  const [kinds, setKinds] = useState<string[]>(DEFAULT_FILING_KINDS);
  const on = useListAlert(listRef);
  const { remove } = useAlerts();
  const { toast } = useUI();
  const c = useCreate(listRef);
  const flip = (k: string) => setKinds((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]));
  return (
    <section className="wp-sec wc-files" aria-labelledby="wc-files-h">
      <h2 id="wc-files-h">{title} <span className="wc-new">New</span></h2>
      <p className="wp-sub">An order win, new capacity or any of Discover's eight kinds, from the exchange filings of each weekday.</p>
      <div className="wp-alert" role="group" aria-label="Which filings">
        {FILING_KINDS.map((k) => <button key={k.k} type="button" className="wp-pill" aria-pressed={kinds.includes(k.k)} onClick={() => flip(k.k)}>{k.chip}</button>)}
        <button type="button" className="wp-set wc-set" disabled={!kinds.length || c.pending} onClick={() => c.submit(kinds, false, ["app"])}>{c.pending ? "Saving…" : "Set alert for this list"}</button>
        {on && <p className="wp-on" role="status">On for this list: {kindsText(on.kinds)}{on.digest ? ", one summary a day" : ""}. <Link to="/alerts">Manage in Alerts</Link>
          <button type="button" onClick={() => remove.mutate(on.id, { onSuccess: () => toast("Filing alert switched off for this list.") })}>Switch off</button></p>}
      </div>
      <Warn err={c.err} />
    </section>
  );
}
