// k6 weekly test (docs/MONITORING.md): a fuller, still modest, read-only run on Sunday night (IST), when the site is quiet.
// Ramps to 10 virtual visitors over 2 minutes, holds 5 minutes, ramps down. Public pages only: never signs in, never writes.
// The weekend sector job runs then too; 10 visitors is about what an ordinary busy hour brings, so it measures, it does not stress.
//   k6 run -e BASE_URL=https://finlitventures.com finlit-platform/tests/load/weekly.js
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = (__ENV.BASE_URL || "https://finlitventures.com").replace(/\/$/, "");
const PATHS = ["/", "/api/health", "/api/stocks/RELIANCE/brief", "/api/stocks/TCS/brief", "/api/mf/118955", "/api/feed?limit=1", "/api/jobs/status", "/api/screener/universe"];

export const options = {
  stages: [{ duration: "2m", target: Number(__ENV.VUS || 10) }, { duration: "5m", target: Number(__ENV.VUS || 10) }, { duration: "1m", target: 0 }],
  thresholds: { http_req_failed: ["rate<0.01"], "http_req_duration{heavy:no}": [`p(95)<${Number(__ENV.P95_MS || 1500)}`], "http_req_duration{heavy:yes}": ["p(95)<4000"] },
  summaryTrendStats: ["avg", "p(95)", "max"],
};

export default function () {
  const p = PATHS[Math.floor(Math.random() * PATHS.length)];
  const r = http.get(BASE + p, { headers: { "User-Agent": "FinLit-k6-weekly" }, tags: { page: p, heavy: p.includes("/screener/universe") ? "yes" : "no" } });
  check(r, { "status 200": (x) => x.status === 200 });
  sleep(2 + Math.random() * 3);
}
