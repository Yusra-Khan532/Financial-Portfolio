// @vitest-environment jsdom
// Task #387: Console > Email shows the counts, the upload result with its reasons, the problems SES reported, and the steps in order.
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";

const st = vi.hoisted(() => ({ summary: null as unknown, sent: [] as { path: string; body: unknown }[], reply: {} as unknown }));
vi.mock("../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../lib/api")>()),
  apiGet: async () => st.summary,
  apiSend: async (_m: string, path: string, body: unknown) => { st.sent.push({ path, body }); return st.reply; },
}));
vi.mock("../../lib/auth", () => ({ useAuth: () => ({ user: { email: "owner@finlit.test" } }) }));
import { MailAdmin } from "./MailAdmin";
import { Unsubscribe } from "../../pages/Unsubscribe";

const SUMMARY = { ready: true, from: "FinLit Ventures <contact@finlitventures.com>", ratePerSecond: 8, sendingNow: false,
  contacts: [{ source: "XYZ Hackathon, Oct 2026", status: "active", n: 3980 }, { source: "XYZ Hackathon, Oct 2026", status: "unsubscribed", n: 12 }],
  campaigns: [{ id: 7, subject: "Thanks for joining XYZ", body: "Hi {name}", why: "You registered for XYZ.", button_text: "Create your free account", button_url: "https://finlitventures.com/signup",
    created_at: "2026-11-24", queued: 0, sent: 500, failed: 3, skipped: 2, remaining: 3478 }],
  errors: [{ campaign_id: 7, error: "SES 400: Illegal address", n: 3, last: null }] };
afterEach(cleanup);
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);

describe("Console > Email", () => {
  beforeEach(() => { st.summary = SUMMARY; st.sent = []; st.reply = {}; });
  it("shows readiness, the list counts, each mail's progress and the problems in SES's own words", async () => {
    wrap(<MailAdmin />);
    expect(await screen.findByText("Ready to send")).toBeTruthy();
    expect(screen.getAllByText("3,980").length).toBe(2);                  // can be mailed: the total and the source row
    expect(screen.getByText("Thanks for joining XYZ")).toBeTruthy();
    expect(screen.getByText("3,478")).toBeTruthy();                       // left to send
    expect(screen.getByText(/3 × SES 400: Illegal address/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Change it" })).toBeNull(); // a mail already sent is not changed
    for (const h of ["People on the list", "Write a mail", "Your mails: look, test, send"]) expect(screen.getByText(h)).toBeTruthy();
  });
  it("says plainly when SES is not set up", async () => {
    st.summary = { ...SUMMARY, ready: false };
    wrap(<MailAdmin />);
    expect(await screen.findByText("Not set up")).toBeTruthy();
  });
  it("saves a mail with its button and sends a test to the admin's own address by default", async () => {
    wrap(<MailAdmin />);
    await screen.findByText("Ready to send");
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Hello XYZ" } });
    fireEvent.change(screen.getByLabelText("Mail text"), { target: { value: "Hi {name}, thank you for taking part." } });
    fireEvent.click(screen.getByRole("button", { name: "Save the mail" }));
    await waitFor(() => expect(st.sent.some((s) => s.path === "/api/admin/mail/campaigns")).toBe(true));
    const saved = st.sent.find((s) => s.path === "/api/admin/mail/campaigns")!.body as Record<string, string>;
    expect(saved.buttonText).toBe("Create your free account");
    expect(saved.why).toBe("You get this because you registered for XYZ Hackathon, Oct 2026.");
    fireEvent.click(screen.getByRole("button", { name: "Send test" }));
    await waitFor(() => expect(st.sent.some((s) => s.path === "/api/admin/mail/campaigns/7/test")).toBe(true));
    expect(st.sent.find((s) => s.path.endsWith("/test"))!.body).toEqual({ to: "owner@finlit.test" });
  });
});

describe("/unsubscribe", () => {
  it("changes nothing until the button is pressed", async () => {
    st.sent = []; st.reply = { status: "unsubscribed" };
    render(<MemoryRouter initialEntries={["/unsubscribe?t=5.abc"]}><Unsubscribe /></MemoryRouter>);
    expect(st.sent).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));
    expect(await screen.findByText(/You will not get FinLit Ventures mails/)).toBeTruthy();
    expect(st.sent[0]).toEqual({ path: "/api/mail/unsubscribe", body: { t: "5.abc" } });
  });
});
