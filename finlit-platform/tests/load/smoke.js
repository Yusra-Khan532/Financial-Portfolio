// k6 smoke test (docs/MONITORING.md): a light, read-only walk over public pages, run every night by .github/workflows/platform-load.yml.
// The p95 limit is P95_MS (default 1500 ms): GitHub's runners are in the US and the server in Sydney, so about 400 ms of every answer is distance.
// Never signs in, never writes. Two virtual visitors for one minute: enough to catch a slow or failing page, far too little to load the site.
//   k6 run -e BASE_URL=https://finlitventures.com finlit-platform/tests/load/smoke.js
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = (__ENV.BASE_URL || "https://finlitventures.com").replace(/\/$/, "");
export const PATHS = ["/", "/api/health", "/api/stocks/RELIANCE/brief", "/api/mf/118955", "/api/feed?limit=1", "/api/jobs/status"];

export const options = {
  vus: Number(__ENV.VUS || 2),
  duration: __ENV.DURATION || "1m",
  thresholds: { http_req_failed: ["rate<0.01"], http_req_duration: [`p(95)<${Number(__ENV.P95_MS || 1500)}`] },
  summaryTrendStats: ["avg", "p(95)", "max"],
};

export default function () {
  for (const p of PATHS) {
    const r = http.get(BASE + p, { headers: { "User-Agent": "FinLit-k6-smoke" }, tags: { page: p } });
    check(r, { "status 200": (x) => x.status === 200 });
    sleep(1);
  }
}
