// @vitest-environment jsdom
// Task #297: "Add to Google Calendar" on the IPO and Results calendars: a visitor is asked to sign in; a member gets Google Calendar's "add by URL"
// link with their private FinLit calendar address, in the Google account of their sign-up email; the address can be copied for other apps and replaced.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const FEED = { url: "https://finlitventures.com/api/calendar/tok1.ics", webcal: "webcal://finlitventures.com/api/calendar/tok1.ics",
  google: "https://calendar.google.com/calendar/render?cid=webcal%3A%2F%2Ffinlitventures.com%2Fapi%2Fcalendar%2Ftok1.ics&authuser=member%40gmail.com",
  email: "member@gmail.com", name: "FinLit: IPOs and your results", lastReadAt: null,
  holds: ["IPO opening, closing and listing days, 30 days back to 120 ahead", "Results dates of the companies in your portfolio and watchlists"],
  note: "Google Calendar reads the address again by itself every few hours." };
const auth = { user: null as null | { email: string } };
const send = vi.fn(async () => ({ ...FEED, url: "https://finlitventures.com/api/calendar/tok2.ics", google: FEED.google.replace("tok1", "tok2") }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiGet: async () => FEED, apiSend: (...a: unknown[]) => send(...(a as [])) }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuthMaybe: () => auth }));
import { CalendarSync } from "./CalendarSync";

afterEach(() => { cleanup(); auth.user = null; send.mockClear(); });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={["/ipo"]}><CalendarSync /></MemoryRouter></QueryClientProvider>);

describe("task #297: Add to Google Calendar", () => {
  it("asks a visitor to sign in, and comes back to the page", () => {
    show();
    const a = screen.getByRole("link", { name: /Add to Google Calendar/ });
    expect(a.getAttribute("href")).toBe("/login?next=%2Fipo");
    expect(document.body.textContent).toMatch(/Sign in to add IPO and results dates to your Google Calendar\./);
  });
  it("gives a member Google Calendar's subscribe link in their sign-up account", async () => {
    auth.user = { email: "member@gmail.com" };
    show();
    const a = await screen.findByRole("link", { name: /Add to Google Calendar/ });
    expect(a.getAttribute("href")).toBe(FEED.google);
    expect(a.getAttribute("target")).toBe("_blank");
    expect(document.body.textContent).toMatch(/Opens in the Google account member@gmail\.com\./);
  });
  it("shows the address for other calendar apps and replaces it", async () => {
    auth.user = { email: "member@gmail.com" };
    show();
    await screen.findByRole("link", { name: /Add to Google Calendar/ });                       // the address is in
    fireEvent.click(screen.getByRole("button", { name: "Other calendar apps" }));
    expect((screen.getByRole("textbox", { name: "Your calendar address" }) as HTMLInputElement).value).toBe(FEED.url);
    expect(screen.getByRole("link", { name: "Open in my calendar app" }).getAttribute("href")).toBe(FEED.webcal);
    fireEvent.click(screen.getByRole("button", { name: "Replace the address" }));
    await waitFor(() => expect((screen.getByRole("textbox", { name: "Your calendar address" }) as HTMLInputElement).value).toMatch(/tok2\.ics$/));
    expect(send).toHaveBeenCalledWith("POST", "/api/me/calendar/reset");
    expect(screen.getByRole("link", { name: /Add to Google Calendar/ }).getAttribute("href")).toMatch(/tok2/);
  });
  it("sits on the IPO calendar and the Results calendar", () => {
    expect(readFileSync(join(__dirname, "..", "pages", "Ipo.tsx"), "utf8")).toMatch(/actions=\{<CalendarSync \/>\}/);
    expect(readFileSync(join(__dirname, "..", "pages", "Results.tsx"), "utf8")).toMatch(/<ResultsHead actions=\{<CalendarSync \/>\}/);
  });
});
