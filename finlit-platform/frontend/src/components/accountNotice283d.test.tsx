// @vitest-environment jsdom
// Task #283 PR D: the server's one notice about saved items converted to FinLit Prism is shown as a card, once (closing marks it read on the server);
// FinLit Prism's score is an alert metric for Gold.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GROUPS, METRICS, describe as say, tierLocked } from "../lib/alertCatalog";

const markRead = vi.fn();
let items: { id: number; kind: string; title: string; body: string; read: boolean; link: string | null }[] = [];
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("../lib/alerts", async (orig) => ({ ...(await orig<typeof import("../lib/alerts")>()), useNotices: () => ({ items, unread: items.filter((x) => !x.read).length, markRead, clear: vi.fn() }) }));

const { AccountNotice } = await import("./Notifications");

describe("task #283 PR D: the account notice", () => {
  beforeEach(() => { markRead.mockReset(); });
  afterEach(cleanup);
  it("shows the server's notice in its own words until it is closed, then marks it read", () => {
    items = [{ id: 7, kind: "notice", title: "Notice title", body: "We changed 2 of your saved screens and alerts: a; b. Please check their levels.", read: false, link: null }];
    const { rerender } = render(<MemoryRouter><AccountNotice /></MemoryRouter>);
    expect(screen.getByRole("region", { name: "Notice title" }).textContent).toContain("We changed 2 of your saved screens and alerts");
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(markRead).toHaveBeenCalledWith([7]);
    rerender(<MemoryRouter><AccountNotice /></MemoryRouter>);
    expect(screen.queryByRole("region")).toBeNull();
  });
  it("shows nothing for a read notice or an alert", () => {
    items = [{ id: 8, kind: "notice", title: "Seen", body: "x", read: true, link: null }, { id: 9, kind: "alert", title: "Alert", body: "y", read: false, link: "/stocks/TCS" }];
    render(<MemoryRouter><AccountNotice /></MemoryRouter>);
    expect(screen.queryByRole("region")).toBeNull();
  });
});

describe("task #283 PR D: FinLit Prism's score as an alert", () => {
  it("is offered in its own group, for Gold", () => {
    expect(METRICS.prism_final).toMatchObject({ label: "FinLit Prism score", tier: "gold", group: "FinLit Prism" });
    expect(GROUPS).toContain("FinLit Prism"); expect(GROUPS).not.toContain("Retired score");
    expect(tierLocked("gold", "silver")).toBe(true); expect(tierLocked("gold", "gold")).toBe(false); expect(tierLocked("silver", "basic")).toBe(true); expect(tierLocked("basic", "basic")).toBe(false);
    expect(say({ metric: "prism_final", op: "above", value: 65 })).toBe("FinLit Prism score rises to or above 65");
  });
});
