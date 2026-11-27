// @vitest-environment jsdom
// Task #425: the DCF page's disclaimer is a drop-down (like the Methodology card, task #412, and the SIP disclaimer, task #424),
// and its wording is clearer: a lead line that stays visible when closed, then four plain points. Every fact of the old
// paragraph stays; it describes and never advises.
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DCF_DISCLAIMER_LEAD, DCF_DISCLAIMER_POINTS, DcfDisclaimer } from "./DcfDisclaimer";

const show = (member: string | null = null) => render(<MemoryRouter><DcfDisclaimer member={member} /></MemoryRouter>);
const card = () => document.querySelector("details.dcx-dsc") as HTMLDetailsElement;
const all = () => [DCF_DISCLAIMER_LEAD, ...DCF_DISCLAIMER_POINTS.flat()].join(" ");

afterEach(() => { cleanup(); localStorage.clear(); });

describe("task #425: the DCF disclaimer drop-down", () => {
  it("keeps every fact of the old disclaimer", () => {
    const t = all();
    expect(t).toContain("not investment advice");
    expect(t).toContain("A calculation tool for education.");
    expect(t).toContain("A DCF value is only as good as its assumptions: small changes in growth or discount rate move it a lot.");
    expect(t).toContain("The intrinsic value is an estimate from the inputs above, not a forecast of the future share price.");
    show();
    expect(card().querySelector("a")!.getAttribute("href")).toBe("/glossary#discounted-cash-flow-dcf");
    expect(card().querySelector("a")!.textContent).toBe("What is a DCF?");
  });
  it("describes, never advises", () => {
    expect(all()).not.toMatch(/\b(buy|sell|hold|reduce|avoid|accumulate|target|best|multibagger|top pick)\b/i);
  });
  it("is closed at first, and the closed row still reads as a disclaimer", () => {
    show();
    const d = card();
    expect(d.open).toBe(false);
    const row = d.querySelector(":scope > summary") as HTMLElement;
    expect(row.querySelector("h2")!.textContent).toBe("Disclaimer");
    expect(row.querySelector(".dcx-dsc-l")!.textContent).toBe("Information only, not investment advice.");
    expect(row.querySelector(".dcx-dsc-tg")!.textContent).toBe("Show");
    expect(row.querySelector(".dcx-dsc-b")).toBeNull();               // the points sit outside the row, so they fold away
    expect(d.querySelectorAll(".dcx-dsc-b li").length).toBe(4);
  });
  it("opens and closes from its title row, remembered per member under its own key", async () => {
    show("7");
    const row = card().querySelector(":scope > summary") as HTMLElement;
    fireEvent.click(row);
    await waitFor(() => expect(card().querySelector(".dcx-dsc-tg")!.textContent).toBe("Hide"));
    expect(card().open).toBe(true);
    expect(localStorage.getItem("finlit.dcf.disc.7")).toBe("open");
    fireEvent.click(row);
    await waitFor(() => expect(card().open).toBe(false));
    expect(localStorage.getItem("finlit.dcf.disc.7")).toBe("closed");
    cleanup(); localStorage.setItem("finlit.dcf.disc.7", "open");
    show("7");
    expect(card().open).toBe(true);
    expect(localStorage.getItem("finlit.dcf.meth.7")).toBeNull();       // the Methodology card is not moved with it
  });
  it("opens for printing so the whole disclaimer is on paper, then closes again without changing the remembered choice", async () => {
    show("7");
    expect(card().open).toBe(false);
    window.dispatchEvent(new Event("beforeprint"));
    expect(card().open).toBe(true);
    window.dispatchEvent(new Event("afterprint"));
    expect(card().open).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(card().open).toBe(false);
    expect(localStorage.getItem("finlit.dcf.disc.7")).toBeNull();
  });
  it("replaces the old loose paragraph on the page, and its CSS is scoped and sits with the Methodology rules", () => {
    const page = readFileSync(resolve(__dirname, "../pages/Dcf.tsx"), "utf8");
    expect(page).not.toMatch(/dcf-disc/);
    expect(page).toMatch(/<DcfDisclaimer member=/);
    const css = readFileSync(resolve(__dirname, "../styles/dcf-redesign.css"), "utf8");
    expect(css).toMatch(/\.dcx-dsc>summary::-webkit-details-marker/);
    expect(css.indexOf(".dcx-dsc{")).toBeGreaterThan(css.indexOf(".dcx-mg b{"));
    expect(css.indexOf(".dcx-dsc{")).toBeLessThan(css.indexOf(".dcx-mini{"));
  });
});
