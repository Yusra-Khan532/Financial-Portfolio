// @vitest-environment jsdom
// Console > Email. Task #387 built it; the founder made it easy on 28 Nov 2026 ("too much confusing to send ... make it easy to use, easy to send
// the mail"): one "Send an email" screen with who gets it (all FinLit members and/or a list, with the count), subject, message, the mail as people
// see it, Send me a test and Send to N people; problems in plain words at the top; the send's progress and the mails sent before; lists folded away.
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";

type Sent = { path: string; body: unknown };
const st = vi.hoisted(() => ({ summary: null as unknown, sent: [] as Sent[], reply: {} as unknown, replies: {} as Record<string, unknown> }));
vi.mock("../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../lib/api")>()),
  apiGet: async () => st.summary,
  apiSend: async (_m: string, path: string, body: unknown) => {
    st.sent.push({ path, body });
    const k = Object.keys(st.replies).filter((p) => path.split("?")[0].startsWith(p)).sort((a, b) => b.length - a.length)[0];   // the most specific
    return k ? st.replies[k] : st.reply;
  },
}));
vi.mock("../../lib/auth", () => ({ useAuth: () => ({ user: { email: "owner@finlit.test" } }) }));
import { MailAdmin, adviceWords, missing, parsePasted, pastedCsv, testAddresses, whyLine } from "./MailAdmin";
import { Unsubscribe } from "../../pages/Unsubscribe";

const SUMMARY = { ready: true, from: "FinLit Ventures <contact@finlitventures.com>", ratePerSecond: 8, sendingNow: false, halted: null,
  account: { read: true, production: true, sendingEnabled: true, max24h: 50000, sent24h: 120, maxPerSecond: 14 },
  members: { members: 1240, unconfirmed: 40, mailable: 1235, optedout: 5 }, lists: [{ source: "XYZ Hackathon, Oct 2026", n: 3980, out: 12 }],
  contacts: [{ source: "XYZ Hackathon, Oct 2026", status: "active", n: 3980 }, { source: "XYZ Hackathon, Oct 2026", status: "unsubscribed", n: 12 },
    { source: "FinLit members", status: "active", n: 1235 }],
  campaigns: [{ id: 7, subject: "Thanks for joining XYZ", body: "Hi {name}", why: "You registered for XYZ.", button_text: null, button_url: null,
    created_at: "2026-11-24T10:00:00Z", queued: 0, sent: 500, failed: 3, skipped: 2, remaining: 3478 }],
  errors: [{ campaign_id: 7, error: "SES 400: Illegal address", plain: "This address cannot receive mail (it is malformed or its domain has no mail server).", n: 3, last: null }] };
afterEach(() => { cleanup(); try { localStorage.clear(); } catch { /* none */ } });
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
const sentTo = (p: string) => st.sent.filter((s) => s.path === p);

describe("Console > Email: Send an email", () => {
  beforeEach(() => {
    st.summary = SUMMARY; st.sent = []; st.reply = {};
    st.replies = { "/api/admin/mail/audience": { n: 1235 }, "/api/admin/mail/preview": { html: "<p>Hi Priya,</p>", adviceWords: [] }, "/api/admin/mail/campaigns": { id: 9 } };
  });

  it("one screen: who gets it with counts (all members ticked first), subject, message, the mail beside it, and two buttons", async () => {
    wrap(<MailAdmin />);
    expect(await screen.findByText("Ready to send")).toBeTruthy();
    expect(screen.getByText(/Daily limit:/).textContent).toMatch(/Daily limit: 50,000 mails · sent in the last 24 hours: 120/);
    const to = screen.getByRole("group", { name: "To" });
    const all = within(to).getByRole("checkbox", { name: /All FinLit members/ }) as HTMLInputElement;
    expect(all.checked).toBe(true);
    expect(within(to).getAllByText("1,235").length).toBeGreaterThan(0);
    expect(within(to).getByText(/40 have not confirmed their address yet · 5 unsubscribed and are left out/)).toBeTruthy();
    expect((within(to).getByRole("checkbox", { name: /XYZ Hackathon, Oct 2026/ }) as HTMLInputElement).checked).toBe(false);
    expect(await within(to).findByText(/Will go to/)).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Subject" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Message" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send me a test" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send to 1,235 people" })).toBeTruthy();
    expect(await screen.findByTitle("How the mail looks")).toBeTruthy();
    expect(screen.queryByRole("spinbutton")).toBeNull();                                 // no batch-count field unless "Send in steps" is chosen
    expect(screen.getByText(/Still needed: a subject · the message/)).toBeTruthy();
  });

  it("ticking a list counts everyone once and the footer line follows who it goes to", async () => {
    wrap(<MailAdmin />);
    const to = await screen.findByRole("group", { name: "To" });
    st.replies["/api/admin/mail/audience"] = { n: 5100 };
    fireEvent.click(within(to).getByRole("checkbox", { name: /XYZ Hackathon/ }));
    await waitFor(() => expect(sentTo("/api/admin/mail/audience").some((s) => JSON.stringify(s.body) === JSON.stringify({ members: true, sources: ["XYZ Hackathon, Oct 2026"], emails: [] }))).toBe(true));
    expect(await screen.findByRole("button", { name: "Send to 5,100 people" })).toBeTruthy();
    expect(within(to).getByText(/\(each person once\)/)).toBeTruthy();
    expect((screen.getByLabelText(/Why they get this/) as HTMLInputElement).value).toBe("You get this because you have a FinLit account or registered for XYZ Hackathon, Oct 2026.");
  });

  it("Send to N people: one confirm naming the count and the subject, then everyone chosen is queued (no count), and the form clears", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    st.replies["/api/admin/mail/campaigns/9/send"] = { queued: 1235 };
    wrap(<MailAdmin />);
    await screen.findByRole("group", { name: "To" });
    fireEvent.change(screen.getByRole("textbox", { name: "Subject" }), { target: { value: "FinLit is open" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "Hi {name},\n\nYour FinLit account is ready to use." } });
    const send = await screen.findByRole("button", { name: "Send to 1,235 people" }) as HTMLButtonElement;
    // 1,235 people is more than a personal note may go to (the default): the form says so and asks for Plain email
    await waitFor(() => expect(screen.getByText(/at most 500 people for a personal note \(choose Plain email for more/)).toBeTruthy());
    expect(send.disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Plain email/ }));
    await waitFor(() => expect(send.disabled).toBe(false));
    fireEvent.click(send);
    expect(confirm.mock.calls[0][0]).toMatch(/^Send "FinLit is open" to 1,235 people now\?/);
    await waitFor(() => expect(sentTo("/api/admin/mail/campaigns/9/send")).toHaveLength(1));
    const saved = sentTo("/api/admin/mail/campaigns")[0].body as Record<string, unknown>;
    expect(saved).toMatchObject({ subject: "FinLit is open", why: "You get this because you have a FinLit account.", buttonText: null, buttonUrl: null,
      format: "plain", fromName: null, fromAddress: null });                                       // the format the form chose
    expect(sentTo("/api/admin/mail/campaigns/9/send")[0].body).toEqual({ members: true, sources: [], count: undefined });
    expect(await screen.findByText(/Sending to 1,235 people/)).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Subject" }) as HTMLInputElement).value).toBe("");
    confirm.mockRestore();
  });

  it("Send me a test saves the draft itself and sends to the admin's own address", async () => {
    wrap(<MailAdmin />);
    await screen.findByRole("group", { name: "To" });
    fireEvent.change(screen.getByRole("textbox", { name: "Subject" }), { target: { value: "FinLit is open" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "Hi {name},\n\nYour FinLit account is ready to use." } });
    fireEvent.click(screen.getByRole("button", { name: "Send me a test" }));
    await waitFor(() => expect(sentTo("/api/admin/mail/campaigns/9/test")).toHaveLength(1));
    expect(sentTo("/api/admin/mail/campaigns/9/test")[0].body).toEqual({ to: "owner@finlit.test" });
    expect(await screen.findByText(/Test sent to owner@finlit.test/)).toBeTruthy();
  });

  // "These addresses" (founder, 28 Nov 2026: "I can send the mail for like 5 to 6 persons ... just paste at there and send")
  it("These addresses: paste a few, see how many were found, and Send to N people sends exactly them (with what was left out)", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    st.replies["/api/admin/mail/campaigns/9/send"] = { queued: 3, leftOut: { invalid: [], typos: ["x@gmial.com"], noMailServer: [], unsubscribed: [] } };
    wrap(<MailAdmin />);
    const to = await screen.findByRole("group", { name: "To" });
    fireEvent.click(within(to).getByRole("checkbox", { name: /All FinLit members/ }));               // only the pasted people
    fireEvent.click(within(to).getByRole("checkbox", { name: /These addresses/ }));
    st.replies["/api/admin/mail/audience"] = { n: 4 };
    fireEvent.change(within(to).getByRole("textbox", { name: /Email addresses/ }),
      { target: { value: "a@x.in, B@X.in; b@x.in\nAnu Shah <anu@x.in>\nx@gmial.com\nnot an address" } });
    expect(within(to).getByText(/4 addresses found · 1 not an address \(left out\)/)).toBeTruthy();
    await waitFor(() => expect(sentTo("/api/admin/mail/audience").some((s) => JSON.stringify(s.body) === JSON.stringify({ members: false, sources: [], emails: ["a@x.in", "b@x.in", "anu@x.in", "x@gmial.com"] }))).toBe(true));
    expect((screen.getByLabelText(/Why they get this/) as HTMLInputElement).value).toBe("You get this because you shared your email address with FinLit Ventures.");
    fireEvent.change(screen.getByRole("textbox", { name: "Subject" }), { target: { value: "A quick request" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "Hi there,\n\nPlease share your feedback with us." } });
    fireEvent.click(await screen.findByRole("button", { name: "Send to 4 people" }));
    await waitFor(() => expect(sentTo("/api/admin/mail/campaigns/9/send")).toHaveLength(1));
    expect(sentTo("/api/admin/mail/campaigns/9/send")[0].body).toEqual({ members: false, sources: [], emails: ["a@x.in", "b@x.in", "anu@x.in", "x@gmial.com"] });
    expect(await screen.findByText(/Sending to 3 people/)).toBeTruthy();
    expect(screen.getByText(/Some pasted addresses were left out/)).toBeTruthy();
    expect(screen.getByText(/1 left out: look misspelt/)).toBeTruthy();
    confirm.mockRestore();
  });

  it("Send a test to: up to five addresses, prefilled with the admin's own", async () => {
    st.replies["/api/admin/mail/campaigns/9/test"] = { status: "sent", sent: ["owner@finlit.test", "pa@x.in"], failed: [] };
    wrap(<MailAdmin />);
    await screen.findByRole("group", { name: "To" });
    fireEvent.change(screen.getByRole("textbox", { name: "Subject" }), { target: { value: "A quick request" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "Hi there,\n\nPlease share your feedback with us." } });
    const box = screen.getByRole("textbox", { name: /Send a test to/ }) as HTMLInputElement;
    expect(box.value).toBe("owner@finlit.test");
    fireEvent.change(box, { target: { value: "owner@finlit.test, a@x.in, b@x.in, c@x.in, d@x.in, e@x.in" } });
    expect(screen.getByText("A test goes to at most 5 addresses.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Send test" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(box, { target: { value: "owner@finlit.test; PA@x.in" } });
    fireEvent.click(screen.getByRole("button", { name: "Send test" }));
    await waitFor(() => expect(sentTo("/api/admin/mail/campaigns/9/test")).toHaveLength(1));
    expect(sentTo("/api/admin/mail/campaigns/9/test")[0].body).toEqual({ to: "owner@finlit.test, pa@x.in" });
    expect(await screen.findByText(/Test sent to owner@finlit.test, pa@x.in/)).toBeTruthy();
  });

  it("the footer line and what is still needed take the pasted addresses into account", () => {
    expect(whyLine(false, [], true)).toBe("You get this because you shared your email address with FinLit Ventures.");
    expect(whyLine(true, [], true)).toBe("You get this because you have a FinLit account or shared your email address with FinLit Ventures.");
    expect(testAddresses("a@x.in b@x.in").ok).toBe(true);
    expect(testAddresses("a@x.in, nope").why).toBe("Not an email address: nope");
  });

  it("advice words are named as they are typed and the send waits for them to go", async () => {
    wrap(<MailAdmin />);
    await screen.findByRole("group", { name: "To" });
    fireEvent.change(screen.getByRole("textbox", { name: "Subject" }), { target: { value: "Best stocks now" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "Hi {name},\n\nTime to buy, says nobody at FinLit." } });
    expect(screen.getByText(/Please take out:/).textContent).toMatch(/Please take out: best stocks, buy/);
    expect((await screen.findByRole("button", { name: /^Send to/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(adviceWords("Read the report", "how a company is doing")).toEqual([]);
  });

  it("plain words at the top: not set up, test mode with the fix, a stopped send with Carry on", async () => {
    st.summary = { ...SUMMARY, ready: false };
    wrap(<MailAdmin />);
    expect(await screen.findByText("Not set up")).toBeTruthy();
    cleanup();
    st.summary = { ...SUMMARY, account: { ...SUMMARY.account, production: false } };
    wrap(<MailAdmin />);
    expect(await screen.findByText("Test mode")).toBeTruthy();
    expect(screen.getByText(/Request production access/)).toBeTruthy();
    cleanup();
    st.summary = { ...SUMMARY, halted: { reason: "Amazon SES is still in test mode (the sandbox): …", error: "SES 400: Email address is not verified." },
      campaigns: [{ ...SUMMARY.campaigns[0], id: 8, subject: "FinLit is open", queued: 1200, sent: 35, failed: 0, skipped: 0 }, SUMMARY.campaigns[0]] };
    wrap(<MailAdmin />);
    expect(await screen.findByText("Sending stopped")).toBeTruthy();
    expect(screen.getByText("Stopped: FinLit is open")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Carry on sending" }));
    await waitFor(() => expect(sentTo("/api/admin/mail/resume")).toHaveLength(1));
  });

  it("the mails sent before show their counts, why some failed in plain words, and Try the failed ones again", async () => {
    st.replies["/api/admin/mail/campaigns/7/retry"] = { queued: 3 };
    wrap(<MailAdmin />);
    expect(await screen.findByText("Thanks for joining XYZ")).toBeTruthy();
    expect(screen.getByText(/3 × This address cannot receive mail/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try the failed ones again" }));
    await waitFor(() => expect(sentTo("/api/admin/mail/campaigns/7/retry")).toHaveLength(1));
    expect(await screen.findByText("3 queued again.")).toBeTruthy();
  });

  it("founder, 28 Nov 2026: 'Hi there,' (no invented name), Personal note chosen first, an optional From name and address, and the Primary-tab hint", async () => {
    wrap(<MailAdmin />);
    const msgBox = await screen.findByRole("textbox", { name: "Message" }) as HTMLTextAreaElement;
    expect(msgBox.value).toBe("Hi there,\n\n");
    expect(msgBox.value).not.toContain("{name}");
    const radios = screen.getAllByRole("radio").filter((r) => (r as HTMLInputElement).name === "mla-fmt").map((r) => r.parentElement!.textContent ?? "");
    expect(radios.map((t) => t.split(/Reads|Text|Styled/)[0])).toEqual(["Personal note", "Plain email", "Designed email with a button"]);   // the order
    expect((screen.getByRole("radio", { name: /Personal note/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/Reads like a mail from a person: exactly your text, no unsubscribe header and no footer\. The best chance of Gmail's Primary tab for small sends/)).toBeTruthy();
    expect((screen.getByRole("radio", { name: /Designed email with a button/ }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText(/Gmail decides the tab for each person, so Primary is likely, not guaranteed/)).toBeTruthy();
    expect(screen.getByText("Add a link line")).toBeTruthy();                                       // text only: the button is a line
    const addr = screen.getByRole("textbox", { name: /From address/ }) as HTMLInputElement;
    fireEvent.change(addr, { target: { value: "Pranshu Me" } });
    expect(screen.getByText(/a From address of letters, digits, dots or dashes before @finlitventures.com/)).toBeTruthy();
    fireEvent.change(addr, { target: { value: "pranshu" } });
    fireEvent.change(screen.getByRole("textbox", { name: /From name/ }), { target: { value: "Pranshu from FinLit Ventures" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Subject" }), { target: { value: "FinLit is open" } });
    fireEvent.change(msgBox, { target: { value: "Hi there,\n\nYour FinLit account is ready to use." } });
    await waitFor(() => expect(sentTo("/api/admin/mail/preview").some((s) => (s.body as { fromName: string }).fromName === "Pranshu from FinLit Ventures")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Send me a test" }));
    await waitFor(() => expect(sentTo("/api/admin/mail/campaigns").length).toBe(1));
    expect(sentTo("/api/admin/mail/campaigns")[0].body).toMatchObject({ format: "personal", fromName: "Pranshu from FinLit Ventures", fromAddress: "pranshu" });
  });

  it("Unsubscribe an address: a 'stop' reply is recorded", async () => {
    st.replies["/api/admin/mail/unsubscribe"] = { status: "unsubscribed", email: "ravi@x.in", droppedFromQueue: 0 };
    wrap(<MailAdmin />);
    await screen.findByRole("group", { name: "To" });
    expect(screen.getByText("Unsubscribe an address")).toBeTruthy();
    const box = screen.getByRole("textbox", { name: "Email address" }) as HTMLInputElement;
    fireEvent.change(box, { target: { value: "Ravi@x.in" } });
    fireEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));
    await waitFor(() => expect(sentTo("/api/admin/mail/unsubscribe")).toHaveLength(1));
    expect(sentTo("/api/admin/mail/unsubscribe")[0].body).toEqual({ email: "Ravi@x.in" });
    expect(await screen.findByText(/ravi@x.in is unsubscribed and will never be mailed again/)).toBeTruthy();
  });

  it("a mail saved but not sent (Mail 2) opens in the form, switches to Plain email and is sent as that same mail", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const mail2 = { id: 2, subject: "Welcome to FinLit", body: "Hi {name},\n\nYour FinLit account is ready to use.", why: "You get this because you have a FinLit account.",
      button_text: "Open FinLit", button_url: "https://finlitventures.com", format: "html" as const, from_name: null, created_at: "2026-11-28T05:00:00Z",
      queued: 0, sent: 0, failed: 0, skipped: 0, remaining: 1235 };
    st.summary = { ...SUMMARY, campaigns: [mail2, ...SUMMARY.campaigns] };
    st.replies["/api/admin/mail/campaigns/2/send"] = { queued: 1235 };
    wrap(<MailAdmin />);
    expect(await screen.findByText("Saved, not sent yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open in the form" }));
    expect(await screen.findByText("Send an email: Welcome to FinLit")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Subject" }) as HTMLInputElement).value).toBe("Welcome to FinLit");
    expect((screen.getByRole("radio", { name: /Designed email with a button/ }) as HTMLInputElement).checked).toBe(true);   // as it was saved
    fireEvent.click(screen.getByRole("radio", { name: /Plain email/ }));
    const send = await screen.findByRole("button", { name: "Send to 1,235 people" }) as HTMLButtonElement;
    await waitFor(() => expect(send.disabled).toBe(false));
    fireEvent.click(send);
    await waitFor(() => expect(sentTo("/api/admin/mail/campaigns/2/send")).toHaveLength(1));
    expect(st.sent.find((s) => s.path === "/api/admin/mail/campaigns?id=2")!.body).toMatchObject({ format: "plain", subject: "Welcome to FinLit", buttonText: "Open FinLit" });
    confirm.mockRestore();
  });

  it("the helpers: the footer line and what is still needed", () => {
    expect(whyLine(true, [])).toBe("You get this because you have a FinLit account.");
    expect(whyLine(false, ["A"])).toBe("You get this because you registered for A.");
    expect(whyLine(false, ["A", "B"])).toBe("You get this because you gave us your address at a FinLit event.");
    const ok = { subject: "Hello", body: "Hi there,\n\nA full message here.", why: "You get this because you have a FinLit account.", buttonText: "", buttonUrl: "",
      format: "plain" as const, fromName: "", fromAddress: "" };
    expect(missing({ ...ok, body: "Hi there,\n\n" }, 10, true, [])).toEqual(["the message"]);        // the greeting alone is not a message
    expect(missing(ok, 10, true, [])).toEqual([]);
    expect(missing(ok, 10, false, [])).toEqual(["choose who gets it"]);
    expect(missing({ ...ok, buttonText: "Open" }, 10, true, [])).toEqual(["the button's link"]);
    expect(missing({ ...ok, buttonText: "Open", buttonUrl: "http://x.in" }, 10, true, [])).toEqual(["a button link that starts with https://"]);
  });
});

describe("/unsubscribe", () => {
  it("changes nothing until the button is pressed", async () => {
    st.sent = []; st.reply = { status: "unsubscribed" }; st.replies = {};
    render(<MemoryRouter initialEntries={["/unsubscribe?t=5.abc"]}><Unsubscribe /></MemoryRouter>);
    expect(st.sent).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));
    expect(await screen.findByText(/You will not get FinLit Ventures mails/)).toBeTruthy();
    expect(st.sent[0]).toEqual({ path: "/api/mail/unsubscribe", body: { t: "5.abc" } });
  });
});

describe("Add people from a list", () => {
  beforeEach(() => { st.summary = SUMMARY; st.sent = []; st.replies = { "/api/admin/mail/audience": { n: 1235 }, "/api/admin/mail/preview": { html: "", adviceWords: [] } }; });
  it("addresses can be pasted, one or many, without a file (owner, 25 Nov 2026)", async () => {
    st.replies["/api/admin/mail/import"] = { rows: 3, added: 2, alreadyThere: 1, duplicates: 0, invalid: [], invalidCount: 0, typos: [], typoCount: 0, noMailServer: [], noMailServerCount: 0 };
    wrap(<MailAdmin />);
    const box = await screen.findByRole("textbox", { name: /Email addresses/ });
    expect((screen.getByRole("radio", { name: "Paste addresses" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByLabelText("File")).toBeNull();
    const add = screen.getByRole("button", { name: "Check and add" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: /Name of this list/ }), { target: { value: "Owner's contacts, Nov 2026" } });
    fireEvent.change(box, { target: { value: "priya@example.com\nRahul Verma <rahul@example.com>; anu@example.com\nhello there" } });
    expect(screen.getByText(/3 addresses found · 1 piece is not an address and will be left out/)).toBeTruthy();
    fireEvent.click(add);
    await waitFor(() => expect(sentTo("/api/admin/mail/import")).toHaveLength(1));
    const sent = sentTo("/api/admin/mail/import")[0] as { path: string; body: { filename: string; data: string; source: string } };
    expect(sent.body.filename).toBe("pasted.csv"); expect(sent.body.source).toBe("Owner's contacts, Nov 2026");
    expect(atob(sent.body.data)).toBe("email,name\npriya@example.com,\nrahul@example.com,Rahul Verma\nanu@example.com,\n");
    expect(await screen.findByText("2 added")).toBeTruthy();
    expect(screen.getByText(/1 left out: not an address/)).toBeTruthy();
    expect((box as HTMLTextAreaElement).value).toBe("");
  });
  it("one address alone works; Upload a file still offers the file", async () => {
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
    expect(parsePasted("not an email\nbad@").skipped).toEqual(["not an email"]);
    expect(pastedCsv([{ email: "a@b.com", name: 'Ann "A", Ltd' }])).toBe('email,name\na@b.com,"Ann ""A"", Ltd"\n');
  });
});
