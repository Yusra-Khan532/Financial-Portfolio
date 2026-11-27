// "Alert me on new deals": a member follows a share or a client; after each evening's run of the deals job, one notification lists the new bulk and block
// deals in what they follow (finlit/deals.py notify_follows; /api/me/deal-follows). A visitor is offered to sign in. Describes; never advises.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "react-router";
import { apiGet, apiSend, ApiError } from "../lib/api";
import { useAuthMaybe } from "../lib/auth";

type Follows = { symbols: string[]; clients: string[]; max: number };

/** `value`: the NSE symbol, or the client key the server gave (Deal.clientKey, already in its normalised form). */
export function DealFollow({ what, value, label }: { what: "symbol" | "client"; value: string; label: string }) {
  const auth = useAuthMaybe(), user = auth?.user, loc = useLocation(), qc = useQueryClient();
  const f = useQuery({ queryKey: ["deal-follows"], queryFn: () => apiGet<Follows>("/api/me/deal-follows"), enabled: !!user, staleTime: 60_000 });
  const key = what === "symbol" ? value.toUpperCase() : value;
  const on = !!f.data && (what === "symbol" ? f.data.symbols : f.data.clients).includes(key);
  const m = useMutation({
    mutationFn: (follow: boolean) => apiSend<Follows>(follow ? "PUT" : "DELETE", `/api/me/deal-follows/${what}/${encodeURIComponent(value)}`),
    onSuccess: (d) => qc.setQueryData(["deal-follows"], d),
  });
  if (!user) return <span className="bbd-fl muted"><Link to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`}>Sign in</Link> to get an alert on new deals {what === "symbol" ? "in" : "by"} {label}.</span>;
  const err = m.error instanceof ApiError ? m.error.body?.detail ?? m.error.message : m.error ? "That did not work. Please try again." : null;
  return <span className="bbd-fl">
    <button type="button" className={"dbx-ddb" + (on ? " on" : "")} aria-pressed={on} disabled={m.isPending || f.isLoading} onClick={() => m.mutate(!on)}>
      {on ? `Alerts on: new deals ${what === "symbol" ? "in" : "by"} ${label}` : `Alert me on new deals ${what === "symbol" ? "in" : "by"} ${label}`}</button>
    {err && <small className="formerr" role="alert">{String(err)}</small>}
  </span>;
}
