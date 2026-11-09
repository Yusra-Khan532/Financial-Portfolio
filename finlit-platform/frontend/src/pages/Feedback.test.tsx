// @vitest-environment jsdom
// Task #53: the feedback page's rules, the three steps, what is sent and what is not.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EMPTY, FEATURES, IMPROVE, WANTED, payload, problems, toggle } from "../lib/feedback";

const send = vi.fn(async (_m: string, _p: string, _b?: unknown) => ({}));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiSend: (m: string, p: string, b?: unknown) => send(m, p, b) }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
import { FeedbackPage } from "./Feedback";
beforeAll(() => { Element.prototype.scrollIntoView = () => {}; window.matchMedia = window.matchMedia || ((() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as never); });
afterEach(() => { cleanup(); send.mockClear(); });

describe("rules", () => {
  it("step 1 needs the four ratings and the 0 to 10 score; speed is optional", () => {
    expect(problems(0, EMPTY)).toHaveLength(5);
    expect(problems(0, { ...EMPTY, rating: 4, nps: 0, navigation: 3, data_quality: 5, tools: 4 })).toEqual([]);   // 0 is a real answer
  });
  it("step 2 needs a most valuable feature only when features were chosen; step 3 checks an email only when contact is wanted", () => {
    expect(problems(1, EMPTY)).toEqual([]); expect(problems(1, { ...EMPTY, used: ["Glossary"] })).toHaveLength(1);
    expect(problems(2, { ...EMPTY, contact_ok: false, email: "bad" })).toEqual([]); expect(problems(2, { ...EMPTY, contact_ok: true, email: "bad" })).toHaveLength(1);
    expect(problems(2, { ...EMPTY, contact_ok: true, email: "" })).toEqual([]);
  });
  it("sends the email only when contact was asked for, trims text and keeps the lists", () => {
    const f = { ...EMPTY, rating: 5, nps: 10, navigation: 4, data_quality: 4, tools: 4, likes: "  Plain words  ", email: "a@b.co", contact_ok: false };
    expect(payload(f).email).toBeNull(); expect(payload(f).likes).toBe("Plain words");
    expect(payload({ ...f, contact_ok: true }).email).toBe("a@b.co"); expect(payload(f).speed).toBeNull();
    expect(toggle(["a"], "b")).toEqual(["a", "b"]); expect(toggle(["a", "b"], "a")).toEqual(["b"]);
  });
  it("has the lists from the brief", () => { expect(FEATURES).toHaveLength(14); expect(IMPROVE).toHaveLength(8); expect(WANTED).toHaveLength(11); });
});

const view = () => render(<MemoryRouter><FeedbackPage /></MemoryRouter>);
const star = (legend: RegExp, n: number) => fireEvent.click(within(screen.getByRole("radiogroup", { name: legend })).getByRole("radio", { name: new RegExp(`^${n} of 5`) }));

describe("<FeedbackPage />", () => {
  it("will not leave step 1 until the required answers are given, and says what is missing", () => {
    view();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/smarter FinLit/);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(within(screen.getByRole("alert")).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByLabelText("Progress").querySelector(".now")?.textContent).toMatch(/Overall experience/);
  });
  it("goes through the three steps and sends everything once, with no email when contact is not wanted", async () => {
    view();
    star(/overall experience/i, 4); fireEvent.click(within(screen.getByRole("radiogroup", { name: /recommend/i })).getByRole("radio", { name: "9" }));
    star(/Ease of navigation/, 5); star(/Quality and depth/, 4); star(/Usefulness of analysis/, 3);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.click(screen.getByLabelText("Glossary")); fireEvent.click(screen.getByLabelText("Stock Screener"));
    fireEvent.change(screen.getByLabelText(/most value/), { target: { value: "Glossary" } });
    fireEvent.click(screen.getByLabelText("Mobile application"));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.change(screen.getByLabelText(/like most/), { target: { value: "Plain words" } });
    fireEvent.click(within(screen.getByRole("radiogroup", { name: /early access/ })).getByRole("radio", { name: "Yes" }));
    fireEvent.click(screen.getByRole("button", { name: /Submit feedback/ }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Thank you/));
    expect(send).toHaveBeenCalledTimes(1);
    const body = send.mock.calls[0][2] as Record<string, unknown>;
    expect(send.mock.calls[0][1]).toBe("/api/feedback");
    expect(body).toMatchObject({ rating: 4, nps: 9, navigation: 5, data_quality: 4, tools: 3, used: ["Glossary", "Stock Screener"], most_valuable: "Glossary", wanted: ["Mobile application"], likes: "Plain words", early_access: true, contact_ok: false, email: null, website: "" });
  });
  it("shows an email box only after Yes to contact, and drops a most-valuable choice whose feature is unticked", () => {
    view();
    star(/overall experience/i, 3); fireEvent.click(within(screen.getByRole("radiogroup", { name: /recommend/i })).getByRole("radio", { name: "0" }));
    star(/Ease of navigation/, 3); star(/Quality and depth/, 3); star(/Usefulness of analysis/, 3);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.click(screen.getByLabelText("Glossary")); fireEvent.change(screen.getByLabelText(/most value/), { target: { value: "Glossary" } });
    fireEvent.click(screen.getByLabelText("Glossary"));
    expect((screen.getByLabelText(/most value/) as HTMLSelectElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.queryByLabelText(/Your email/)).toBeNull();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: /contact you/ })).getByRole("radio", { name: "Yes" }));
    expect(screen.getByLabelText(/Your email/)).toBeTruthy();
  });
  it("Continue on step 2 never submits: the next click is a different button (no early send)", () => {
    view();
    star(/overall experience/i, 3); fireEvent.click(within(screen.getByRole("radiogroup", { name: /recommend/i })).getByRole("radio", { name: "5" }));
    star(/Ease of navigation/, 3); star(/Quality and depth/, 3); star(/Usefulness of analysis/, 3);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    const cont = screen.getByRole("button", { name: /Continue/ });
    fireEvent.click(cont);
    expect(send).not.toHaveBeenCalled();
    expect(cont.isConnected).toBe(false);                                   // replaced, not turned into the submit button
    expect(screen.getByRole("button", { name: /Submit feedback/ }).getAttribute("type")).toBe("submit");
  });
  it("keeps the answers and says so when sending fails", async () => {
    send.mockRejectedValueOnce(new Error("down"));
    view();
    star(/overall experience/i, 2); fireEvent.click(within(screen.getByRole("radiogroup", { name: /recommend/i })).getByRole("radio", { name: "5" }));
    star(/Ease of navigation/, 2); star(/Quality and depth/, 2); star(/Usefulness of analysis/, 2);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ })); fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.click(screen.getByRole("button", { name: /Submit feedback/ }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/still here/));
    expect(screen.getByRole("button", { name: /Submit feedback/ })).toBeTruthy();
  });
});
