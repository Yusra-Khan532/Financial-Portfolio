// @vitest-environment jsdom
// Trading Lab access (founder, 25 Nov 2026: "only admin can give access to anybody"): the page shows its tools only to a member the server says has
// access, an invitation message otherwise; the menu entry appears only with the granted feature; the admin panel grants by email and removes.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasLab, hasSignals } from "../lib/lab";

const auth = { ready: true, user: { id: "u1", email: "m@example.com", role: "investor" } as unknown, features: [] as string[] };
vi.mock("../lib/auth", () => ({ useAuth: () => auth }));
const toast = vi.fn();
vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()), useUI: () => ({ toast }) }));
import { TradingLabPage } from "./TradingLab";
import { LabAccess } from "../components/admin/LabAccess";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let answer: (url: string, init?: RequestInit) => Response;
let calls: { url: string; method: string; body?: string }[];
beforeEach(() => {
  calls = []; toast.mockReset();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => { calls.push({ url: String(url), method: init?.method || "GET", body: init?.body as string | undefined }); return answer(String(url), init); }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const wrap = (el: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>);
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };

describe("Trading Lab page", () => {
  it("a member without a grant sees the invitation message, not the tools; the disclaimer is always there", async () => {
    answer = () => json(200, { access: false, reason: "not_granted", expiresAt: null });
    wrap(<TradingLabPage />); await settle();
    expect(screen.getByRole("heading", { name: "The Trading Lab is open by invitation" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Time Machine" })).toBeNull();
    expect(screen.getByRole("link", { name: "Contact the team" })).toBeTruthy();
    expect(screen.getByText(/does not tell anyone to buy, sell or hold, and it never places an order/)).toBeTruthy();
  });
  it("a visitor is asked to sign in", async () => {
    answer = () => json(200, { access: false, reason: "sign_in", expiresAt: null });
    wrap(<TradingLabPage />); await settle();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login?next=/lab");
  });
  it("a granted member sees the tools and until when the access lasts", async () => {
    answer = () => json(200, { access: true, reason: "granted", expiresAt: "2026-12-25T10:00:00Z" });
    wrap(<TradingLabPage />); await settle();
    for (const t of ["Time Machine", "Strategy backtest", "Setup scanner", "Price structure layer", "Paper journal", "Risk read-out", "Case for and case against"]) expect(screen.getByRole("heading", { name: t })).toBeTruthy();
    expect(screen.getByText(/You have access until 25 December 2026/)).toBeTruthy();
  });
  it("no banned advice word in the page's own text (describe, never advise)", async () => {
    answer = () => json(200, { access: true, reason: "admin", expiresAt: null });
    wrap(<TradingLabPage />); await settle();
    const text = document.body.textContent!.toLowerCase().replace("does not tell anyone to buy, sell or hold", "").replace("not a list of stocks to buy", "");
    for (const w of [" buy ", " sell ", " hold ", "target", " best ", "multibagger", "top pick", "accumulate"]) expect(text.includes(w), w).toBe(false);
  });
});

describe("Signals desk (founder, 25 Nov 2026: an internal test outside the describe-only wording)", () => {
  it("is hidden unless the member's signals are on", async () => {
    answer = () => json(200, { access: true, reason: "granted", expiresAt: null, signals: false });
    wrap(<TradingLabPage />); await settle();
    expect(screen.queryByRole("heading", { name: "Signals desk" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Rating: Buy, Hold or Sell" })).toBeNull();
    expect(screen.queryByText(/does give trade calls/)).toBeNull();
    expect(screen.getByRole("list", { name: "How the Lab works" }).querySelectorAll("li").length).toBe(4);
  });
  it("shows the rating, the trader's plan and the trade-size debate with an internal-test label when on", async () => {
    answer = () => json(200, { access: true, reason: "granted", expiresAt: null, signals: true });
    wrap(<TradingLabPage />); await settle();
    expect(screen.getByRole("heading", { name: "Signals desk" })).toBeTruthy();
    expect(screen.getByText("Signals on · internal test")).toBeTruthy();
    for (const t of ["Rating: Buy, Hold or Sell", "Trader's plan", "Trade-size debate"]) expect(screen.getByRole("heading", { name: t })).toBeTruthy();
    expect(screen.getByText(/does not tell anyone to buy, sell or hold/)).toBeTruthy();      // the Lab's disclaimer stays
    expect(screen.getByText(/The Signals desk, switched on for your account by an administrator, does give trade calls/)).toBeTruthy();   // and says what the desk is
  });
  it("hasSignals reads the feature the server lists", () => {
    expect(hasSignals(["trading_lab"])).toBe(false);
    expect(hasSignals(["trading_lab", "trading_lab_signals"])).toBe(true);
  });
});

describe("menu entry", () => {
  it("only with the granted feature", () => {
    expect(hasLab([])).toBe(false);
    expect(hasLab(undefined)).toBe(false);
    expect(hasLab(["trading_lab"])).toBe(true);
  });
});

describe("Console > Trading Lab access", () => {
  it("gives access by email with an end, lists the grant and removes it", async () => {
    let grants: unknown[] = [];
    answer = (url, init) => {
      if (url.endsWith("/api/admin/lab/grants") && (init?.method || "GET") === "GET") return json(200, { grants });
      if (init?.method === "PUT") { grants = [{ userId: "11111111-1111-1111-1111-111111111111", email: "m@example.com", name: "Asha", plan: "basic", grantedAt: "2026-11-25T10:00:00Z", expiresAt: "2026-12-25T10:00:00Z", note: "beta", grantedBy: "boss@example.com", active: true, signals: true }]; return json(200, { status: "saved" }); }
      if (init?.method === "PATCH") { grants = grants.map((g) => ({ ...(g as object), signals: JSON.parse(init.body as string).signals })); return json(200, { status: "saved" }); }
      if (init?.method === "DELETE") { grants = []; return json(200, { status: "removed" }); }
      return json(404, {});
    };
    vi.spyOn(window, "confirm").mockReturnValue(true);
    wrap(<LabAccess />); await settle();
    expect(screen.getByText("Nobody has been given access yet.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Member's email"), { target: { value: "m@example.com" } });
    fireEvent.change(screen.getByLabelText("How long"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value: "beta" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Give access" })); await settle();
    const put = calls.find((c) => c.method === "PUT")!;
    expect(JSON.parse(put.body!)).toEqual({ email: "m@example.com", days: 30, note: "beta", signals: true });
    expect(screen.getByText("m@example.com")).toBeTruthy();
    expect(screen.getByText("(1 active)")).toBeTruthy();
    const sw = screen.getByRole("switch", { name: "Signals for m@example.com" });
    expect(sw.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(sw); await settle();
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url.endsWith("/api/admin/lab/grants/11111111-1111-1111-1111-111111111111") && JSON.parse(patch.body!)).toEqual({ signals: false });
    expect(screen.getByRole("switch", { name: "Signals for m@example.com" }).getAttribute("aria-checked")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Remove" })); await settle();
    expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith("/api/admin/lab/grants/11111111-1111-1111-1111-111111111111"))).toBe(true);
    expect(screen.getByText("Nobody has been given access yet.")).toBeTruthy();
  });
});
