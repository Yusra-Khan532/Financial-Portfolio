import { defineConfig, type Plugin, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Build identity: APP_VERSION / GIT_COMMIT (set by the Docker build, which has no .git) -> git short sha -> timestamp.
// It is compiled into the bundle (__APP_VERSION__) and written to dist/version.json, which the server sends with no-cache.
// The running page compares the two (src/lib/version.ts) and offers a refresh when they differ.
const builtAt = new Date().toISOString();
const gitSha = () => { try { return execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; } };
const fromEnv = (process.env.APP_VERSION || process.env.GIT_COMMIT || "").trim().slice(0, 12);
const version = fromEnv && fromEnv !== "unknown" ? fromEnv : gitSha() || builtAt.replace(/\D/g, "").slice(0, 14);
const versionFile = (): Plugin => ({
  name: "finlit-version-json",
  generateBundle() { this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version, builtAt }) + "\n" }); },
});

// The theme script runs before the first paint, so the page waits for it. As /theme-init.js it was cached at Cloudflare for only four hours and
// then fetched again from the origin, which took up to 16 s while the server was busy (27 Nov 2026). The build also ships it under a hashed name
// in assets/ (cached for a year, like the bundles) and the page asks for that one; /theme-init.js stays for pages cached before.
const themeInit = (): Plugin => {
  const source = readFileSync(new URL("./public/theme-init.js", import.meta.url), "utf8");
  const fileName = `assets/theme-init-${createHash("sha256").update(source).digest("hex").slice(0, 10)}.js`;
  let building = false;
  return {
    name: "finlit-theme-init",
    configResolved(c) { building = c.command === "build"; },
    transformIndexHtml: {
      order: "post",
      handler(html) { return building ? html.replace(/(<script src=")([^"]*?)theme-init\.js(")/, (_m, a, base, b) => `${a}${base}${fileName}${b}`) : html; },
    },
    generateBundle() { if (building) this.emitFile({ type: "asset", fileName, source }); },
  };
};

// One API for the browser, two backends behind it (matches the AWS application routing):
//   research service  -> /api/stocks/*, /api/screener/*, /api/results/*, /api/health, /api/auth/*, /api/me/*, /api/admin/*   (finlit-platform/backend)
//   site backend      -> everything else under /api, plus /api/stocks/admin/*   (site-api/backend)
const RESEARCH = process.env.RESEARCH_API || "http://127.0.0.1:8000";
const SITE = process.env.SITE_API || "http://127.0.0.1:8001";
const proxy: Record<string, ProxyOptions> = {
  "^/api/stocks/admin": { target: SITE, changeOrigin: true },
  "^/api/(stocks|screener|results|health|ping|auth|me|admin|ipos|deals|feed|alerts|notifications|premium|notify|feedback|indices|compare|forum|graphs|advanced|etf|mf|dcf|search|logos|client-errors|macro|markets|flows|options|commodity-prices|prism|earnings-calls|sectors|technicals|isin|ask|discovery|mail)": { target: RESEARCH, changeOrigin: true },
  "^/mcp$": { target: RESEARCH, changeOrigin: true, bypass: (req) => (req.method === "GET" && (req.headers.accept || "").includes("text/html") ? "/index.html" : undefined) },   // MCP endpoint for AI assistants; a browser opening /mcp gets the page
  "^/.well-known/mcp.json": { target: RESEARCH, changeOrigin: true },
  "/api": { target: SITE, changeOrigin: true },
};

export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react(), versionFile(), themeInit()],
  define: { __APP_VERSION__: JSON.stringify(version), __BUILT_AT__: JSON.stringify(builtAt) },
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
  build: { target: "es2022", sourcemap: "hidden", chunkSizeWarningLimit: 300 },
});
