// Console > Data health: fund-house portfolio files (task #281 round 7), for the fund houses whose sites refuse the server (HDFC, Kotak, Edelweiss, Navi, Union;
// Baroda BNP refuses the relay). The owner's rule (21 Nov 2026): the server never disguises itself or goes around a block; a person downloads the SAME public
// monthly file in a normal browser and uploads it here. The server keeps the raw file and reads it with the nightly job's own reader for that house, then says
// exactly what it stored; a file nothing can be read from is kept and says so. The labels and ids below are stable, so a browser assistant can follow them.
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiGet, apiSend } from "../../lib/api";
import { useUI } from "../../lib/ui";

type HouseRow = { key: string; title: string; blocked: boolean; site: string; page: string; why: string; pdf: boolean; latest: string | null; latestLabel: string | null; needs: string | null };
type Upload = { id: number; house: string; month: string; file: string; kind: string; sizeBytes: number; by: string | null; at: string; status: string; stored: number };
type Overview = { due: string; dueLabel: string; houses: HouseRow[]; uploads: Upload[] };
type Result = { status: string; why: string; houseTitle: string; monthLabel: string; file: string; portfolios: number; stored: number; keptExisting: number;
  olderThanKept: number; schemes: { scheme: string; asOf: string; holdings: number; result: string }[]; unmatched: string[]; rejected: { scheme: string; problems: string[] }[]; errors: string[] };

const MAX_MB = 25;
const why = (e: unknown) => {
  if (e instanceof ApiError) { const b = e.body as { detail?: string | { detail?: string }; status?: string }; return (typeof b.detail === "object" ? b.detail?.detail : b.detail) || b.status || "Failed"; }
  return (e as Error).message || "Could not reach the server.";
};
function toBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("The file could not be read."));
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.readAsDataURL(f);
  });
}

/** The months to choose from: the month due first, then the eleven before it ("YYYY-MM"). */
export function monthChoices(due: string): string[] {
  const [y, m] = due.split("-").map(Number);
  return Array.from({ length: 12 }, (_, i) => { const d = new Date(y, m - 1 - i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
}
const monthText = (ym: string) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

export function FundFiles() {
  const { toast } = useUI();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "fund-files"], queryFn: () => apiGet<Overview>("/api/admin/fund-files") });
  const [house, setHouse] = useState(""), [month, setMonth] = useState(""), [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<Result[]>([]), [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const up = useMutation({
    mutationFn: async () => {
      const out: Result[] = [];
      for (const f of files) {
        if (f.size > MAX_MB * 1024 * 1024) throw new Error(`${f.name} is larger than ${MAX_MB} MB.`);
        out.push(await apiSend<Result>("POST", "/api/admin/fund-files", { house, month, name: f.name, file: await toBase64(f) }));
      }
      return out;
    },
    onSuccess: (r) => { setErr(""); setResults(r); setFiles([]); if (input.current) input.current.value = ""; qc.invalidateQueries({ queryKey: ["admin", "fund-files"] }); toast("Uploaded."); },
    onError: (e) => { setResults([]); setErr(why(e)); },
  });
  const o = q.data;
  const chosen = o?.houses.find((h) => h.key === house);
  const months = o ? monthChoices(o.due) : [];
  const ready = !!house && !!month && files.length > 0 && !up.isPending;
  return (
    <section className="card acct-c" aria-label="Fund house files" id="fund-files">
      <h2>Fund house files (monthly portfolios)</h2>
      <p className="muted">Some fund houses' sites refuse FinLit's server, so their funds show no holdings. Download the fund house's public monthly portfolio file in your own
        browser and upload it here. The server keeps the file and reads it with the same reader as the nightly job, then lists what it stored. Nothing is guessed.</p>
      {q.isError && <div className="formerr" role="alert">The list could not be loaded: {why(q.error)}</div>}
      {o && (<>
        <h3>What each fund house needs</h3>
        <div className="tw"><table className="ff-needs" id="fund-files-needs" aria-label="Files each fund house needs">
          <thead><tr><th scope="col">Fund house</th><th scope="col">Latest holdings stored</th><th scope="col">Needs</th><th scope="col">Where to download</th></tr></thead>
          <tbody>{o.houses.filter((h) => h.blocked).map((h) => (
            <tr key={h.key} data-house={h.key}>
              <th scope="row">{h.title}<small className="muted"> {h.why}</small></th>
              <td>{h.latestLabel ?? "None"}</td>
              <td>{h.needs ? <b>needs the {h.needs} file</b> : "Up to date"}</td>
              <td><a href={h.page} target="_blank" rel="noopener noreferrer">{h.site}</a>{h.pdf ? " (factsheet PDF)" : " (Excel or zip)"}</td>
            </tr>))}</tbody>
        </table></div>
        <h3>Upload</h3>
        <div className="ff-form">
          <label htmlFor="fund-files-house">Fund house</label>
          <select id="fund-files-house" name="house" value={house} onChange={(e) => setHouse(e.target.value)}>
            <option value="">Choose…</option>
            <optgroup label="Sites that refuse the server">{o.houses.filter((h) => h.blocked).map((h) => <option key={h.key} value={h.key}>{h.title}</option>)}</optgroup>
            <optgroup label="Other fund houses">{o.houses.filter((h) => !h.blocked).map((h) => <option key={h.key} value={h.key}>{h.title}</option>)}</optgroup>
          </select>
          <label htmlFor="fund-files-month">Month the file is for</label>
          <select id="fund-files-month" name="month" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">Choose…</option>
            {months.map((m) => <option key={m} value={m}>{monthText(m)}</option>)}
          </select>
          <label htmlFor="fund-files-file">File (Excel .xlsx or .xls, zip, or PDF; up to {MAX_MB} MB each)</label>
          <input ref={input} id="fund-files-file" name="file" type="file" multiple accept=".xlsx,.xls,.zip,.pdf" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          <button id="fund-files-upload" className="btn primary" type="button" disabled={!ready} onClick={() => { setResults([]); setErr(""); up.mutate(); }}>
            {up.isPending ? "Uploading and reading…" : "Upload"}</button>
        </div>
        {chosen && <p className="muted">{chosen.why}</p>}
        {err && <div className="formerr" role="alert">{err}</div>}
        {results.map((r, i) => (
          <div key={i} role="status" className="ff-result">
            <p><b>{r.file}</b> ({r.houseTitle}, {r.monthLabel}): <b data-status={r.status}>{r.status}</b>. {r.why}</p>
            <table className="ff-result-table" id={i === 0 ? "fund-files-result" : undefined} aria-label="Upload result">
              <tbody>
                <tr><th scope="row">Portfolios found</th><td>{r.portfolios}</td></tr>
                <tr><th scope="row">Stored</th><td>{r.stored}</td></tr>
                {r.keptExisting > 0 && <tr><th scope="row">Kept the fuller one already stored</th><td>{r.keptExisting}</td></tr>}
                {r.olderThanKept > 0 && <tr><th scope="row">Older than the months kept</th><td>{r.olderThanKept}</td></tr>}
                <tr><th scope="row">Not matched to AMFI's list</th><td>{r.unmatched.length ? r.unmatched.join("; ") : "None"}</td></tr>
                <tr><th scope="row">Failed the checks</th><td>{r.rejected.length ? r.rejected.map((x) => `${x.scheme}: ${x.problems.join(", ")}`).join("; ") : "None"}</td></tr>
                {r.errors.length > 0 && <tr><th scope="row">Errors</th><td>{r.errors.join("; ")}</td></tr>}
              </tbody>
            </table>
          </div>))}
        {o.uploads.length > 0 && (<>
          <h3>Recent uploads</h3>
          <div className="tw"><table className="ff-uploads" aria-label="Recent uploads">
            <thead><tr><th scope="col">When</th><th scope="col">Fund house</th><th scope="col">Month</th><th scope="col">File</th><th scope="col">Result</th></tr></thead>
            <tbody>{o.uploads.map((u) => (
              <tr key={u.id}><td>{new Date(u.at).toLocaleString("en-IN")}</td><td>{o.houses.find((h) => h.key === u.house)?.title ?? u.house}</td><td>{monthText(u.month)}</td>
                <td>{u.file}</td><td>{u.status}{u.stored ? `, ${u.stored} stored` : ""}</td></tr>))}</tbody>
          </table></div></>)}
      </>)}
    </section>
  );
}
