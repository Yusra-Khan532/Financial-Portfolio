import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { apiGet } from "./lib/api";
import { filtersFromParams, listPath, summaryPath } from "./lib/deals";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UIProvider } from "./lib/ui";
import { AuthProvider } from "./lib/auth";
import { StateSync } from "./lib/sync";
import { VisitCounter } from "./lib/visits";
import { SplashDone } from "./lib/splash";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/source-serif-4/wght.css";
import "./styles/typescale.css";
import "./styles/finlit.css";
import "./styles/site.css";
import "./styles/stock2.css";
import "./styles/ownership.css";
import "./styles/tools.css";
import "./styles/charthelp.css";
import "./styles/premium.css";
import "./styles/account.css";
import "./styles/human-pages.css";
import "./styles/theme.css";
import "./styles/depth3d.css";
import "./styles/leadership.css";
import "./styles/prism.css";
import "./styles/pagefaqs.css";
import "./styles/luxe.css";
import "./styles/headerlinks.css";
import "./styles/design-system.css";
import { installDemo } from "./lib/demo";
import { installResilience } from "./lib/resilience";
import { installSvgTextFit } from "./lib/svgText";
// Loaded last so these (sidebar, earnings dialog, opaque overlays) win over the page styles above. Kept apart from the style list so a team change there never collides with it.
import "./styles/sidebar.css";
import "./styles/earnings.css";
import "./styles/calm.css";
import "./styles/type227.css";   // task #227: serif section titles, readable placeholders (after calm.css, which sets the type roles)
import "./styles/chartzoom.css";
import "./styles/site-green.css";   // task #161: the landing green is the dark background of every page (after the theme layers; overlay.css stays last)
import "./styles/ui-tokens.css";   // task #310: the design rules as variables (after every theme layer, so they win)
import "./styles/ui.css";   // task #310: the shared ui- pieces (Button, Tabs, Card, PageTitle, Input, Chip in components/ui)
import "./styles/task370.css";   // task #370: .btn.sm is the small button on every page (was only in dcf.css)
import "./styles/phone310.css";   // task #310 part E: the phone layer under 860px (header, bottom bar, toasts, 44px taps)
import "./styles/mobile-app.css";   // the phone app (docs/MOBILE-APP.md): tabs, section chips, Menu sheet, Tools button, slim footer, under 860px
import "./styles/ask-check.css";
import "./styles/overlay.css";
import { purgeLegacy } from "./lib/persist";

installDemo();
installResilience();
installSvgTextFit();
// Layout/behaviour flags written by releases before lib/persist.ts (raw, unversioned): drop them so stale values cannot reshape this release.
purgeLegacy(["finlit-side", "finlit-side-groups", "finlit-dash-open", "finlit-etf-cols-v2", "finlit-mf-cols-v4"], ["finlit.side."]);

const client = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

// The IPO pages' data starts downloading with the main script instead of after the IPO page's own script has arrived (that waited about 1.7 s on a
// desktop and 3.4 s on a phone, 27 Nov 2026). Same keys and requests as lib/ipo.ts (useIpos) and lib/ipoHistory.ts (useIpoHistory), so the page
// picks these up; if one fails, the page asks again as before.
{
  const path = window.location.pathname.slice(import.meta.env.BASE_URL.replace(/\/$/, "").length) || "/";
  if (/^\/ipo(\/all)?\/?$/.test(path)) {
    void client.prefetchQuery({ queryKey: ["ipo-history"], queryFn: () => apiGet("/api/ipos/history"), staleTime: 600_000 });
    void client.prefetchQuery({ queryKey: ["ipos", false], queryFn: () => apiGet<{ ipos: unknown[] }>("/api/ipos").then((d) => d.ipos), staleTime: 120_000 });
  }
  // Bulk & block deals (/ipo?view=deals, /deals): the list and the summary for the filters in the address, under the keys lib/deals.ts uses
  if (/^\/(ipo\/?|deals\/?)$/.test(path) && (path.startsWith("/deals") || new URLSearchParams(window.location.search).get("view") === "deals")) {
    const f = filtersFromParams(new URLSearchParams(window.location.search));
    void client.prefetchQuery({ queryKey: ["deals", listPath(f)], queryFn: () => apiGet(listPath(f)), staleTime: 300_000 });
    if (!f.client) void client.prefetchQuery({ queryKey: ["deals-summary", summaryPath(f)], queryFn: () => apiGet(summaryPath(f)), staleTime: 300_000 });
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <ErrorBoundary>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <AuthProvider>
          <UIProvider>
            <StateSync />
            <VisitCounter />
            <SplashDone />
            <App />
          </UIProvider>
        </AuthProvider>
      </BrowserRouter>
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>,
);

// Installable app + offline shell (not in demo or development, where a cached build would confuse changes).
if ("serviceWorker" in navigator && import.meta.env.PROD && import.meta.env.VITE_DEMO !== "1") {
  window.addEventListener("load", () => { navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined); });
}
