// @vitest-environment jsdom
// Task #424: the SIP calculator's disclaimer is a drop-down. It stays on the page with its wording unchanged; the closed row still
// reads as a disclaimer (the "Disclaimer" title and "Information only, not investment advice." stay visible); the rest opens below,
// and open or closed is remembered per member like the DCF page's Methodology card (task #412).
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()), useUI: () => ({ toast: () => undefined }) }));
import { SIP_DISCLAIMER_LEAD, SIP_DISCLAIMER_REST, SipCalculator } from "./SipCalculator";

// the disclaimer as it was on the page before the change, word for word
const ORIGINAL = "Information only, not investment advice. A SIP calculator assumes the same return every month; real funds go up and down, and past returns do not guarantee future returns. Mutual fund investments are subject to market risks; read all scheme-related documents carefully.";

const page = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })}>
    <MemoryRouter initialEntries={["/sip-calculator"]}><SipCalculator /></MemoryRouter>
  </QueryClientProvider>);
const card = () => document.querySelector("details.sip-dsc") as HTMLDetailsElement;

afterEach(() => { cleanup(); localStorage.clear(); });

describe("task #424: the SIP disclaimer drop-down", () => {
  it("keeps the whole disclaimer, word for word", () => {
    expect(`${SIP_DISCLAIMER_LEAD} ${SIP_DISCLAIMER_REST}`).toBe(ORIGINAL);
    page();
    const d = card();
    expect(d).toBeTruthy();
    expect(d.querySelector(".sip-dsc-l")!.textContent).toBe(SIP_DISCLAIMER_LEAD);
    expect(d.querySelector(".sip-dsc-b")!.textContent).toBe(SIP_DISCLAIMER_REST);
    expect(document.querySelector(".sip-disc")).toBeNull();        // the old loose paragraph is gone, not kept beside it
  });
  it("is closed at first, and the closed row still reads as a disclaimer", () => {
    page();
    const d = card();
    expect(d.open).toBe(false);
    const row = d.querySelector(":scope > summary") as HTMLElement;
    expect(row.querySelector("h2")!.textContent).toBe("Disclaimer");
    expect(row.textContent).toContain("Information only, not investment advice.");
    expect(row.querySelector(".sip-dsc-tg")!.textContent).toBe("Show");
    expect(row.querySelector(".sip-dsc-b")).toBeNull();            // the rest sits outside the row, so it folds away
  });
  it("opens and closes from its title row, remembered for the visitor", async () => {
    page();
    const row = card().querySelector(":scope > summary") as HTMLElement;
    fireEvent.click(row);
    await waitFor(() => expect(card().querySelector(".sip-dsc-tg")!.textContent).toBe("Hide"));
    expect(card().open).toBe(true);
    expect(localStorage.getItem("finlit.sip.disc.guest")).toBe("open");
    fireEvent.click(row);
    await waitFor(() => expect(card().open).toBe(false));
    expect(localStorage.getItem("finlit.sip.disc.guest")).toBe("closed");
    cleanup(); localStorage.setItem("finlit.sip.disc.guest", "open");
    page();
    expect(card().open).toBe(true);
    expect(localStorage.getItem("finlit.dcf.meth.guest")).toBeNull();  // its own key: the DCF cards are not moved with it
  });
  it("its CSS is scoped to the SIP page and the old rule is gone", () => {
    const css = readFileSync(resolve(__dirname, "../styles/sip.css"), "utf8");
    expect(css).not.toMatch(/\.sip-disc\b/);
    expect(css).toMatch(/\.sip-dsc > summary::-webkit-details-marker/);
    expect(css).not.toMatch(/\.dcx-/);
  });
});
