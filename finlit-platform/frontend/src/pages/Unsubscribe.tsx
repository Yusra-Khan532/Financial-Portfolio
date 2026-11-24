// /unsubscribe?t=…: the page the unsubscribe link in every FinLit mail opens (task #387). One button; nothing changes until it is pressed, so a
// mail scanner that opens the link unsubscribes nobody. Mail apps with a one-click button post straight to the server instead.
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ApiError, apiSend } from "../lib/api";
import { useDocTitle } from "../lib/title";

export function Unsubscribe() {
  useDocTitle("Unsubscribe");
  const [q] = useSearchParams(), t = q.get("t") || "";
  const [state, setState] = useState<"ask" | "busy" | "done" | "bad">(t ? "ask" : "bad");
  const go = async () => {
    setState("busy");
    try { await apiSend("POST", "/api/mail/unsubscribe", { t }); setState("done"); } catch (e) { setState(e instanceof ApiError && e.status === 400 ? "bad" : "ask"); }
  };
  return (
    <section className="sec"><div className="wrap" style={{ maxWidth: 560 }}>
      <h1 className="ui-title">Unsubscribe</h1>
      {state === "done" ? <p role="status">Done. You will not get FinLit Ventures mails at this address again.</p>
        : state === "bad" ? <p role="alert">This unsubscribe link is not complete. Reply to the mail with "unsubscribe", or write to contact@finlitventures.com, and we will take you off the list.</p>
        : <><p>Stop getting mails from FinLit Ventures (contact@finlitventures.com) at this address?</p>
          <button type="button" className="btn primary" onClick={go} disabled={state === "busy"}>{state === "busy" ? "Unsubscribing…" : "Unsubscribe"}</button></>}
      <p className="muted" style={{ marginTop: 24 }}><Link to="/">Go to finlitventures.com</Link></p>
    </div></section>
  );
}
