// Console > Storage: how full the server disk is, what fills it, how fast it grows, and the database table by table (finlit/storage.py,
// GET /api/admin/storage, administrators only). Read live each time the tab opens and every five minutes while it stays open; it never changes anything.
// Styles: styles/storage-admin.css (stg-).
import { useQuery } from "@tanstack/react-query";
import { adminStorage, type StorageReport } from "../../lib/account";
import { ApiError } from "../../lib/api";
import "../../styles/storage-admin.css";

export const bytes = (n: number | null | undefined): string => {
  if (n == null) return "—";
  const gb = n / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 1 : 2)} GB`;
  const mb = n / 1024 ** 2;
  return mb >= 1 ? `${mb.toFixed(mb >= 10 ? 0 : 1)} MB` : `${Math.round(n / 1024)} KB`;
};
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const day = (s: string) => new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const when = (s: string) => new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const COLOURS = ["var(--k-blue, #2c5d8a)", "#8fb0cf", "#b7791f", "#2f6f55", "#6b9e86", "#9a7bb0", "#a9b8b1"];

export function Growth({ g, alertPct }: { g: StorageReport["growth"]; alertPct: number }) {
  if (!g.known) return <p className="muted stg-note">{g.why}</p>;
  const per = g.diskPerDay;
  return (
    <div className="hstat stg-grow">
      <div><b>{per > 0 ? "+" : ""}{bytes(Math.abs(per))}{per < 0 ? " less" : ""}</b><span>disk change a day ({g.days} days, {day(g.fromDay)} to {day(g.toDay)})</span></div>
      <div><b>{g.dbPerDay == null ? "—" : `${g.dbPerDay > 0 ? "+" : ""}${bytes(Math.abs(g.dbPerDay))}`}</b><span>of it the database, a day</span></div>
      <div><b>{g.daysToAlert == null ? (g.steady ? "Not growing" : "—") : g.daysToAlert === 0 ? "Reached" : `${g.daysToAlert.toLocaleString("en-IN")} days`}</b><span>until the {alertPct}% alert line, at this rate</span></div>
      <div><b>{g.daysToFull == null ? (g.steady ? "Not growing" : "—") : `${g.daysToFull.toLocaleString("en-IN")} days`}</b><span>until the disk is full, at this rate</span></div>
    </div>
  );
}

export function StorageAdmin() {
  const q = useQuery<StorageReport, ApiError>({ queryKey: ["admin-storage"], queryFn: adminStorage, retry: false, refetchInterval: 300_000 });
  if (q.isError) return <div className="formerr" role="alert">{(q.error.body?.detail as string) || "The storage figures could not be read."}</div>;
  const r = q.data;
  if (!r) return <div className="skeleton" style={{ height: 200 }} aria-label="Loading storage" />;
  const d = r.disk, db = r.database;
  const used = d ? pct(d.used, d.total) : 0;
  const parts = r.parts.filter((p) => p.bytes != null && p.bytes > 0);
  return (
    <>
      <section className="card acct-c stg">
        <h2>Server disk</h2>
        <p className="muted">Measured live on the server {when(r.at)}. The same disk holds the database, its backups, the app's data folders, the system and the Docker images. Nothing here changes or deletes anything.</p>
        {d ? <>
          <div className="hstat">
            <div><b>{bytes(d.total)}</b><span>disk size</span></div>
            <div><b>{bytes(d.used)}</b><span>used ({used}%)</span></div>
            <div><b>{bytes(d.free)}</b><span>free</span></div>
            <div><b>{r.alertPct}%</b><span>alert line ({bytes((d.total * r.alertPct) / 100)})</span></div>
          </div>
          <div className="prog stg-prog" role="progressbar" aria-valuenow={used} aria-valuemin={0} aria-valuemax={100} aria-label="Share of the disk used">
            <i style={{ width: `${used}%` }} className={used >= r.alertPct ? "stg-hot" : undefined} />
            <s style={{ left: `${r.alertPct}%` }} aria-hidden="true" />
          </div>
        </> : <p className="muted">The disk size could not be read from the server.</p>}

        <h3>What fills it</h3>
        {d && <div className="stg-bar" aria-hidden="true">{parts.map((p, i) => <i key={p.name} style={{ width: `${pct(p.bytes!, d.total)}%`, background: COLOURS[i % COLOURS.length] }} title={`${p.name}: ${bytes(p.bytes)}`} />)}</div>}
        <div className="tw"><table className="qtt stg-t">
          <thead><tr><th>Part</th><th className="n">Size</th><th className="n">Of the disk</th></tr></thead>
          <tbody>{r.parts.map((p) => <tr key={p.name}>
            <td><i className="stg-sw" style={{ background: COLOURS[parts.findIndex((x) => x.name === p.name) % COLOURS.length] }} aria-hidden="true" />{p.name}{p.note && <small className="muted stg-sub">{p.note}</small>}{p.name === "Database write-ahead log" && db.walWhy && <small className="muted stg-sub">{db.walWhy}</small>}</td>
            <td className="n">{bytes(p.bytes)}</td><td className="n">{d && p.bytes != null ? `${pct(p.bytes, d.total)}%` : "—"}</td></tr>)}
            {!r.backups.available && <tr><td colSpan={3} className="muted">Database backups: {r.backups.why}</td></tr>}
          </tbody></table></div>

        <h3>How fast it grows</h3>
        <Growth g={r.growth} alertPct={r.alertPct} />
        {r.history.length > 1 && <div className="tw"><table className="qtt stg-t stg-hist">
          <thead><tr><th>Day</th><th className="n">Disk used</th><th className="n">Database</th><th className="n">Backups</th></tr></thead>
          <tbody>{[...r.history].reverse().slice(0, 14).map((h) => <tr key={h.day}><td>{day(h.day)}</td><td className="n">{bytes(h.diskUsed)}</td><td className="n">{bytes(h.dbBytes)}</td><td className="n">{bytes(h.backupsBytes)}</td></tr>)}</tbody>
        </table></div>}
      </section>

      <section className="card acct-c stg">
        <h2>Inside the database</h2>
        <p className="muted">{bytes(db.bytes)} in {db.tableCount} tables. "Large values" are long texts and JSON kept apart from the rows; "dead rows" are old versions the database reuses but does not give back to the disk.</p>
        <div className="hstat">{db.groups.map((g) => <div key={g.name}><b>{bytes(g.bytes)}</b><span>{g.name} ({g.tables} tables)</span></div>)}
          <div><b>{bytes(db.systemBytes)}</b><span>Database system and internal tables</span></div></div>
        {db.hypertables.map((h) => <p key={h.name} className="muted stg-note"><b>{h.name}</b> (TimescaleDB): {h.compressed} of {h.chunks} time chunks compressed.</p>)}
        <div className="tw"><table className="qtt stg-t">
          <thead><tr><th>Table</th><th>Group</th><th className="n">Total</th><th className="n">Data</th><th className="n">Indexes</th><th className="n">Large values</th><th className="n">Rows</th><th className="n">Dead rows</th></tr></thead>
          <tbody>{db.tables.map((t) => <tr key={t.name}><td className="mono">{t.name}</td><td>{t.group}</td><td className="n"><b>{bytes(t.total)}</b></td><td className="n">{bytes(t.data)}</td><td className="n">{bytes(t.indexes)}</td><td className="n">{bytes(t.largeValues)}</td>
            <td className="n">{t.live.toLocaleString("en-IN")}</td><td className={"n" + (t.dead > Math.max(10000, t.live * 0.2) ? " stg-warn" : "")}>{t.dead.toLocaleString("en-IN")}</td></tr>)}
            {db.otherTables > 0 && <tr><td colSpan={2} className="muted">{db.otherTables} smaller tables</td><td className="n">{bytes(db.otherTablesBytes)}</td><td colSpan={5} /></tr>}
          </tbody></table></div>
      </section>

      {r.backups.available && <section className="card acct-c stg">
        <h2>Database backups</h2>
        <p className="muted">{r.backups.count} kept, {bytes(r.backups.bytes)} in all: today's newest 3 and one for each earlier day, for 7 days. They are copies for recovery only; nothing on the site or in the jobs reads them.</p>
        <div className="tw"><table className="qtt stg-t"><thead><tr><th>File</th><th>Taken</th><th className="n">Size</th></tr></thead>
          <tbody>{r.backups.files.map((f) => <tr key={f.name}><td className="mono">{f.name}</td><td>{when(f.at)}</td><td className="n">{bytes(f.bytes)}</td></tr>)}</tbody></table></div>
      </section>}
    </>
  );
}
