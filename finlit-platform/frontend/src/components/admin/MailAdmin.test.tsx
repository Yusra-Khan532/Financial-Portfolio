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
import { MailAdmin, parsePasted, pastedCsv } from "./MailAdmin";
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

  it("Add people: addresses can be pasted, one or many, without a file (owner, 25 Nov 2026)", async () => {
    st.summary = SUMMARY; st.sent = [];
    st.reply = { rows: 3, added: 2, alreadyThere: 1, duplicates: 0, invalid: [], invalidCount: 0, typos: [], typoCount: 0, noMailServer: [], noMailServerCount: 0 };
    wrap(<MailAdmin />);
    const box = await screen.findByRole("textbox", { name: /Email addresses/ });
    expect((screen.getByRole("radio", { name: "Paste addresses" }) as HTMLInputElement).checked).toBe(true);   // pasting is the first choice; no file needed
    expect(screen.queryByLabelText("File")).toBeNull();
    const add = screen.getByRole("button", { name: "Check and add" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: /Where these people gave their address/ }), { target: { value: "Owner's contacts, Nov 2026" } });
    fireEvent.change(box, { target: { value: "priya@example.com\nRahul Verma <rahul@example.com>; anu@example.com\nhello there" } });
    expect(screen.getByText(/3 addresses found · 1 piece is not an address and will be left out/)).toBeTruthy();
    fireEvent.click(add);
    await waitFor(() => expect(st.sent).toHaveLength(1));
    const sent = st.sent[0] as { path: string; body: { filename: string; data: string; source: string } };
    expect(sent.path).toBe("/api/admin/mail/import");                                  // the same import as a file: same checks, nobody added twice
    expect(sent.body.filename).toBe("pasted.csv"); expect(sent.body.source).toBe("Owner's contacts, Nov 2026");
    expect(atob(sent.body.data)).toBe("email,name\npriya@example.com,\nrahul@example.com,Rahul Verma\nanu@example.com,\n");
    expect(await screen.findByText("2 added")).toBeTruthy();
    expect(screen.getByText(/1 left out: not an address/)).toBeTruthy();
    expect((box as HTMLTextAreaElement).value).toBe("");
  });
  it("one address alone works; Upload a file still offers the file", async () => {
    st.summary = SUMMARY;
    wrap(<MailAdmin />);
    fireEvent.click(await screen.findByRole("radio", { name: "Upload a file" }));
    expect(screen.getByLabelText("File")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /Email addresses/ })).toBeNull();
    expect(parsePasted("  one@example.com  ")).toEqual({ rows: [{ email: "one@example.com", name: "" }], skipped: [] });
  });
  it("reads every way people paste a list and writes a safe CSV", () => {
    expect(parsePasted('"Shah, Priya" <priya@example.com>\r\n, ,b@x.in;c@y.co').rows).toEqual([{ email: "priya@example.com", name: "Shah, Priya" }, { email: "b@x.in", name: "" }, { email: "c@y.co", name: "" }]);
    expect(parsePasted("Priya Shah <priya@example.com>").rows).toEqual([{ email: "priya@example.com", name: "Priya Shah" }]);
    expect(parsePasted("a@b.com, c@d.com ; e@f.com\n\ng@h.com").rows.map((r) => r.email)).toEqual(["a@b.com", "c@d.com", "e@f.com", "g@h.com"]);
    expect(parsePasted("not an email\nbad@").skipped).toEqual(["not an email"]);                           // "bad@" goes on, and the server names it as not valid
    expect(pastedCsv([{ email: "a@b.com", name: 'Ann "A", Ltd' }])).toBe('email,name\na@b.com,"Ann ""A"", Ltd"\n');
  });
});
