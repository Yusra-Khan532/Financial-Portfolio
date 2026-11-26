// Console > Trading Lab access: the administrator opens the Trading Lab to named members (founder, 25 Nov 2026: "only admin can give access to
// anybody"). Access is not part of any plan; it can end on a date and be removed at any time; every change is in the audit log (server side).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUI } from "../../lib/ui";
import { labGrant, labGrants, labRevoke, type LabGrant } from "../../lib/lab";

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const why = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong. Try again.");   // ApiError carries the server's own sentence

export function LabAccess() {
  const qc = useQueryClient();
  const { toast } = useUI();
  const [email, setEmail] = useState(""), [days, setDays] = useState(""), [note, setNote] = useState("");
  const list = useQuery({ queryKey: ["admin-lab-grants"], queryFn: labGrants, retry: false });
  const done = () => qc.invalidateQueries({ queryKey: ["admin-lab-grants"] });
  const grant = useMutation({
    mutationFn: () => labGrant({ email: email.trim(), days: days ? Number(days) : null, note: note.trim() || null }),
    onSuccess: () => { toast(`Trading Lab opened for ${email.trim()}.`); setEmail(""); setDays(""); setNote(""); done(); },
    onError: (e) => toast(why(e)),
  });
  const revoke = useMutation({ mutationFn: (g: LabGrant) => labRevoke(g.userId), onSuccess: () => { toast("Access removed."); done(); }, onError: (e) => toast(why(e)) });
  const rows = list.data?.grants ?? [];
  return (
    <section className="card acct-c" aria-labelledby="lab-access-h">
      <h2 id="lab-access-h">Trading Lab access <span className="muted">({rows.filter((g) => g.active).length} active)</span></h2>
      <p className="muted">The Trading Lab is open only to the members you name here, whatever their plan. Administrators always have it. The member must have a FinLit account; access shows in their menu at their next page load.</p>
      <form className="row" style={{ flexWrap: "wrap", gap: 8, margin: "12px 0" }} onSubmit={(e) => { e.preventDefault(); if (email.trim()) grant.mutate(); }}>
        <input className="cs-in" type="email" required aria-label="Member's email" placeholder="Member's email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select aria-label="How long" value={days} onChange={(e) => setDays(e.target.value)}>
          <option value="">Until removed</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option>
        </select>
        <input className="cs-in" aria-label="Note (optional)" placeholder="Note (optional)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn primary" disabled={grant.isPending || !email.trim()}>{grant.isPending ? "Giving access…" : "Give access"}</button>
      </form>
      {list.isError && <div className="formerr">{why(list.error)}</div>}
      {list.isSuccess && rows.length === 0 && <p className="muted">Nobody has been given access yet.</p>}
      {rows.length > 0 && <div className="tw"><table className="qtt"><thead><tr><th>Member</th><th>Plan</th><th>Given</th><th>Ends</th><th>By</th><th>Note</th><th /></tr></thead>
        <tbody>{rows.map((g) => (
          <tr key={g.userId}><td><b>{g.email}</b>{g.name ? <small className="muted"> · {g.name}</small> : null}{!g.active && <span className="chip" style={{ marginLeft: 6 }}>Ended</span>}</td>
            <td>{g.plan}</td><td>{day(g.grantedAt)}</td><td>{g.expiresAt ? day(g.expiresAt) : "Until removed"}</td><td>{g.grantedBy || "—"}</td><td>{g.note || "—"}</td>
            <td><button className="btn" disabled={revoke.isPending} onClick={() => { if (window.confirm(`Remove Trading Lab access from ${g.email}?`)) revoke.mutate(g); }}>Remove</button></td></tr>))}</tbody></table></div>}
    </section>
  );
}
