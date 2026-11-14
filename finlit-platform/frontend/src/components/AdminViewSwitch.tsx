// What an administrator sees (founder, 14 Nov 2026): every plan's features at once ("Everything", the default), or exactly what one plan sees, to check it.
// The header holds the switch; while a plan is previewed a strip under the header says so, with a way back. Switching reloads the page so every answer is
// asked for again as the new view (lib/adminView adds the "view as" header; the server serves the request as that plan).
import { useAuth } from "../lib/auth";
import { getAdminView, setAdminView, type AdminView } from "../lib/adminView";
import "../styles/adminView.css";

const LABEL: Record<AdminView, string> = { all: "Everything", basic: "Basic", silver: "Silver", gold: "Gold" };
const go = (v: AdminView) => { setAdminView(v); window.location.reload(); };

export function AdminViewSwitch({ className = "" }: { className?: string }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return null;
  const v = getAdminView();
  return (
    <label className={"avw " + className} title="Administrators: see every plan's features at once, or exactly what one plan sees">
      <span className="avw-k">View</span>
      <select value={v} onChange={(e) => go(e.target.value as AdminView)} aria-label="View the site as">
        {(Object.keys(LABEL) as AdminView[]).map((k) => <option key={k} value={k}>{k === "all" ? "Everything (admin)" : `As ${LABEL[k]}`}</option>)}
      </select>
    </label>
  );
}

export function AdminViewStrip() {
  const { isAdmin } = useAuth();
  const v = getAdminView();
  if (!isAdmin) return null;
  // On a phone the header has no room for the switch: it sits in this strip instead, which a phone shows in every view.
  return (
    <div className={"avw-strip" + (v === "all" ? " avw-all" : "")} role="status">
      {v !== "all" && <span>Previewing the <b>{LABEL[v]}</b> plan: the site shows exactly what a {LABEL[v]} member sees.</span>}
      <AdminViewSwitch className="avw-mob" />
      {v !== "all" && <button type="button" onClick={() => go("all")}>Back to everything</button>}
    </div>
  );
}
