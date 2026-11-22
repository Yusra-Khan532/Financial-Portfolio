// @vitest-environment jsdom
// The founder, 22 Nov 2026: "use the labelled tracker fund for FTSE 100". The FTSE 100 row is shown through a fund that tracks it: the row keeps its
// name, says "via ISF fund" beside it with the full note under the Europe rows, and prices the fund in pence (not as index points).
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const NOTE = "Shown through iShares Core FTSE 100 UCITS ETF (ISF), a fund that tracks the FTSE 100: the moves follow the index; the price is the fund's (pence), not the index level.";
const DATA = {
  asOfIst: "12:00", summary: { open: 0, markets: 1, indices: 1, down: 0, up: 1 }, disclaimer: "Information only, not investment advice.", sources: "EODHD",
  home: { city: "Mumbai", lat: 19.08, lon: 72.88, open: false },
  rows: [{ key: "ftse", label: "FTSE 100", group: "Europe", unit: "GBX", source: "EODHD", last: 921.4, asOf: "2026-11-20", d1: 0.62, w1: -1.1, m1: 2.05,
    line: [["2026-10-21", 903], ["2026-11-20", 921.4]], why: null, place: { city: "London", lat: 51.51, lon: -0.13, open: false },
    tracker: { name: "iShares Core FTSE 100 UCITS ETF (ISF)", code: "ISF", unit: "GBX", note: NOTE } }],
};
vi.mock("../../lib/api", async (orig) => ({ ...(await orig<typeof import("../../lib/api")>()), apiGet: async () => DATA }));
import { XCtx } from "./dx";   // task #316: the live card in full is its expanded view
import { GlobalMarkets } from "./GlobalMarkets";

afterEach(cleanup);

describe("FTSE 100 through a labelled tracker fund", () => {
  it("labels the row, prices the fund in pence and says what it is under the Europe rows", async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><XCtx.Provider value={true}><GlobalMarkets /></XCtx.Provider></QueryClientProvider>);
    const name = await screen.findByText("FTSE 100", { selector: "th" });
    const tr = name.closest("tr")!;
    const tag = within(tr).getByText("via ISF fund");
    expect(tag.getAttribute("title")).toBe(NOTE);
    expect(tr.textContent).toMatch(/921\.40p.*\+0\.62%.*−1\.10%.*\+2\.05%/);
    expect(document.querySelector('tbody[data-group="Europe"] .gm-why')!.textContent).toBe("FTSE 100: " + NOTE.replace(/^S/, "s"));
  });
});
