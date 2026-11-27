// @vitest-environment jsdom
// Task #399: the SIP calculator's inputs are typed boxes with no slider; a value outside the wide limits is not clamped silently.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()), useUI: () => ({ toast: () => undefined }) }));
import { SipCalculator } from "./SipCalculator";

const page = (q = "") => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })}>
    <MemoryRouter initialEntries={["/sip-calculator" + q]}><SipCalculator /></MemoryRouter>
  </QueryClientProvider>);

afterEach(cleanup);

describe("task #399: SIP inputs", () => {
  it("has no slider, only typed boxes, each with its range written under it", () => {
    const { container } = page();
    expect(container.querySelectorAll('input[type="range"]').length).toBe(0);
    expect(screen.getByLabelText("Monthly investment")).toBeTruthy();
    expect(screen.getByText("₹100 to ₹10,00,00,000")).toBeTruthy();
    expect(screen.getByText("1 year to 60 years")).toBeTruthy();
    expect(screen.getByText("0% to 50%")).toBeTruthy();
  });
  it("takes an amount above the old ₹10 lakh cap", () => {
    page();
    const box = screen.getByLabelText("Monthly investment") as HTMLInputElement;
    fireEvent.focus(box); fireEvent.change(box, { target: { value: "5,00,00,000" } }); fireEvent.blur(box);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(box.value).toBe("5,00,00,000");
  });
  it("a value outside the limits shows a plain message and is not clamped silently", () => {
    page();
    const box = screen.getByLabelText("Investment period") as HTMLInputElement;
    fireEvent.focus(box); fireEvent.change(box, { target: { value: "200" } }); fireEvent.blur(box);
    expect(screen.getByRole("alert").textContent).toBe("Enter a number from 1 year to 60 years; 10 years is used until then.");
    expect(box.value).toBe("200");
    expect(box.getAttribute("aria-invalid")).toBe("true");
  });
  it("the team's image-2 values fit: lakh crore in the ring and a grouped multiple", () => {
    const { container } = page("?p=1000000&y=50&r=30");
    expect(container.querySelector(".sip-d-c small")!.textContent).toBe("1,81,229× what you put in");
    expect(container.querySelector(".sip-d-c b")!.textContent).toMatch(/ L Cr$/);
  });
});
