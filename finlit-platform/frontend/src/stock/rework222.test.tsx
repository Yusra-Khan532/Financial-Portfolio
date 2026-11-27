// @vitest-environment jsdom
// Task #222 rework (19 Nov pack): 18 News and filings (S1), the header's technical rows (A) and 14's "Show all" (B2), drawn.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import raw from "../lib/__fixtures__/events-TDPOWERSYS-19nov.json";
import type { Events } from "../lib/api";
import type { PrismInput } from "../lib/scoreBands";
import { NewsSection } from "./NewsSection";
import { TechRows } from "./Hero";
import { IndustryList } from "./pack/WhereStands";

afterEach(cleanup);
const EV = raw as unknown as Events;
// task #328 (developer file 27, change 7): rows past the first six are in the page but hidden (nf-hid) until "Show all" adds "all" to the card
const rows = (c: HTMLElement) => [...c.querySelectorAll(".nf-r")].filter((r) => !r.classList.contains("nf-hid") || !!r.closest(".nf-card.all"));
const months = (c: HTMLElement) => [...c.querySelectorAll(".nf-mo")].filter((m) => !m.classList.contains("nf-hid") || !!m.closest(".nf-card.all")).map((m) => m.querySelector(".nf-m")!.textContent);
const css = (f: string) => readFileSync(join(__dirname, "..", "styles", f), "utf8");

describe("18 News and filings (S1)", () => {
  it("the head, the simple words, 4 tiles that open their PDF in a new tab, the chips with counts and 6 rows first", () => {
    const { container: c } = render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><NewsSection e={EV} name="TD Power Systems Ltd" /></MemoryRouter></QueryClientProvider>);
    expect(c.querySelector("#news h2")!.textContent).toBe("News & filings");   // developer file 47: one heading per section (the second title is gone)
    expect(c.querySelector("#news .sh-desc")!.textContent).toContain("Filings to NSE, newest first.");
    expect(c.querySelector(".plain")!.textContent).toContain("TD Power Systems has made 24 filings with NSE since 11 Aug 2026, the latest on 16 Nov.");
    const tiles = [...c.querySelectorAll("a.nf-h")];
    expect(tiles.length).toBe(4); expect(tiles.every((t) => t.getAttribute("target") === "_blank" && /^https:/.test(t.getAttribute("href")!))).toBe(true);
    expect([...c.querySelectorAll(".nf-f .chip-b")].map((b) => b.textContent)).toEqual(["All 24", "Results & board meetings 2", "Dividends & corporate actions 4", "Investor calls & presentations 7", "Orders & agreements 2", "Shares & fund raising 9"]);
    expect(rows(c).length).toBe(6);
    expect(c.querySelector("#announcements")).not.toBeNull();                 // old links still land on the filings card
    expect(rows(c)[0].querySelector(".nf-k")!.textContent).toBe("NSE category: General Updates");
    expect(rows(c)[0].querySelector(".nf-d small")!.textContent).toBe("17:24");
    expect(rows(c)[0].querySelector(".nf-go")!.textContent).toBe("PDF ↗");
    // the arrow is its own button beside the PDF link; it opens the whole text of that one filing
    const arrow = rows(c)[0].querySelector<HTMLButtonElement>("button.nf-exp")!;
    expect(arrow.getAttribute("aria-expanded")).toBe("false"); expect(arrow.closest("a")).toBeNull();
    fireEvent.click(arrow);
    expect(rows(c)[0].classList.contains("open")).toBe(true); expect(arrow.getAttribute("aria-label")).toBe("Show one line");
    expect(rows(c)[1].classList.contains("open")).toBe(false);
  });
  it("Show all 24 / Show fewer, a chip shows only its group (no empty months), and the routine filing on request (dashed)", () => {
    const { container: c } = render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><NewsSection e={EV} name="TD Power Systems Ltd" /></MemoryRouter></QueryClientProvider>);
    fireEvent.click(screen.getByText("Show all 24"));
    expect(rows(c).length).toBe(24);
    expect(months(c)).toEqual(["November 2026", "October 2026", "September 2026", "August 2026"]);
    expect(c.querySelector(".nf-card")!.classList.contains("all")).toBe(true);   // the box that scrolls at 560 px
    fireEvent.click(screen.getByText("Show fewer")); expect(rows(c).length).toBe(6);
    fireEvent.click(within(c.querySelector(".nf-f") as HTMLElement).getByText("Shares & fund raising"));
    expect(rows(c).length).toBe(9); expect(months(c)).toEqual(["October 2026", "September 2026", "August 2026"]);
    expect(c.querySelector(".nf-all")).toBeNull();
    fireEvent.click(within(c.querySelector(".nf-f") as HTMLElement).getByText("All"));
    fireEvent.click(screen.getByText("Show 1 routine filing"));
    const rt = c.querySelector(".nf-r.nf-rt")!;
    expect(rt.textContent).toContain("Certificate under SEBI"); expect(screen.getByText("Hide routine filings")).toBeTruthy();
    expect(css("news-filings.css")).toMatch(/\.nf-card \.nf-r\.nf-rt \.nf-b \{ border-style: dashed;/);
  });
});

describe("the header's technical rows (A)", () => {
  const rep = (s: number, sr: string, l: number, lr: string): PrismInput => ({ kind: "report", final: 60.6, word: "Average", status: "RATED", short: { score: s, rating: sr }, long: { score: l, rating: lr } });
  it("TD Power: −11 Short term ◆ Sideways and −2 Long term ◆ Sideways, each a link to #prism with the tooltip and label", () => {
    const { container: c } = render(<TechRows effPlan="gold" seesAll={false} prismIn={rep(-11, "SIDEWAYS", -2, "SIDEWAYS")} />);
    expect(c.querySelector(".hx-tech .hx-k")!.textContent).toBe("Technical");
    const a = [...c.querySelectorAll("a.hxt")];
    expect(a.map((x) => [x.textContent, x.className, x.getAttribute("href")])).toEqual([["−11Short term◆Sideways", "hxt mid", "#prism"], ["−2Long term◆Sideways", "hxt mid", "#prism"]]);
    expect(a[0].getAttribute("aria-label")).toBe("Technical short term −11, Sideways");
    expect(a[1].getAttribute("title")).toBe("Technical long term, 6–18 months. Shown separately; not part of the FinLit Prism score.");
  });
  it("an uptrend is green and a downtrend red; a plan without FinLit Prism shows no technical rows", () => {
    const { container: c } = render(<TechRows effPlan="gold" seesAll={false} prismIn={rep(22, "UPTREND", -40, "DOWNTREND")} />);
    expect([...c.querySelectorAll("a.hxt")].map((x) => x.className)).toEqual(["hxt pos", "hxt neg"]);
    cleanup();
    expect(render(<TechRows effPlan="silver" seesAll={false} prismIn={rep(22, "UPTREND", -40, "DOWNTREND")} />).container.textContent).toBe("");
  });
});

describe("14 Inside its industry (B2)", () => {
  const stocks = Array.from({ length: 50 }, (_, i) => ({ symbol: i === 17 ? "TDPOWERSYS" : `S${i + 1}`, return_6m_pct: 50 - i * 2.5 }) as never);
  it("the short list, the rank line, and Show all 50 / Show fewer", () => {
    const { container: c } = render(<MemoryRouter><IndustryList stocks={stocks} symbol="TDPOWERSYS" name="TD Power Systems" ind="Electrical Equipment" max={75} /></MemoryRouter>);
    const ranks = () => [...c.querySelectorAll(".ws-bars li")].map((li) => li.classList.contains("rk-gap") ? li.textContent : li.querySelector(".ws-rk")!.textContent);
    expect(ranks()).toEqual(["1", "2", "3", "4", "5", "10 more", "16", "17", "18", "19", "20", "25 more", "46", "47", "48", "49", "50"]);
    expect(c.querySelector(".ws-sum")!.textContent).toBe("TDPOWERSYS 18th of 50 · +7.5% · industry median −11.3%");
    fireEvent.click(screen.getByText("Show all 50"));
    expect(c.querySelectorAll(".ws-bars li:not(.rk-gap)").length).toBe(50); expect(c.querySelector(".ws-bars")!.className).toContain("all");
    fireEvent.click(screen.getByText("Show fewer")); expect(c.querySelectorAll(".ws-bars li").length).toBe(17);
  });
  it("B1: the two cards stretch and their links sit at the bottom", () => {
    const s = readFileSync(join(__dirname, "pack", "stands.css"), "utf8");
    expect(s).toMatch(/\.ws-two \{ align-items: stretch; \}/); expect(s).toMatch(/\.ws-two > \.sp-sec > \.sp-link \{ margin-top: auto;/); expect(s).toMatch(/\.ws-bars \{ max-width: none; \}/);
  });
});
