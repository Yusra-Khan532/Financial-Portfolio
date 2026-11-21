// @vitest-environment jsdom
// Task #281 round 7: Console > Data health > Fund house files. The houses whose sites refuse the server are listed with the file each needs; the upload has
// stable labels and ids (a browser assistant follows them); the result says exactly what was stored, and a file nothing could be read from says so.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ get: vi.fn(), send: vi.fn() }));
vi.mock("../../lib/api", async (orig) => ({ ...(await orig<typeof import("../../lib/api")>()), apiGet: api.get, apiSend: api.send }));
vi.mock("../../lib/ui", () => ({ useUI: () => ({ toast: () => {} }) }));
import { FundFiles, monthChoices } from "./FundFiles";

afterEach(cleanup);
const OVERVIEW = {
  due: "2026-10", dueLabel: "October 2026",
  houses: [
    { key: "hdfc", title: "HDFC Mutual Fund", blocked: true, site: "hdfcfund.com", page: "https://www.hdfcfund.com/statutory-disclosure/factsheets", why: "HDFC's site answers the server with 403.", pdf: true, latest: null, latestLabel: null, needs: "October 2026" },
    { key: "kotak", title: "Kotak Mahindra Mutual Fund", blocked: true, site: "kotakmf.com", page: "https://www.kotakmf.com/Information/portfolios", why: "Kotak's pages ask for a captcha.", pdf: false, latest: "2026-10-31", latestLabel: "October 2026", needs: null },
    { key: "sbi", title: "SBI Mutual Fund", blocked: false, site: "sbimf.com", page: "https://sbimf.com", why: "Read by the nightly job.", pdf: false, latest: "2026-10-31", latestLabel: "October 2026", needs: null },
  ],
  uploads: [],
};
const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><FundFiles /></QueryClientProvider>);

describe("fund house files", () => {
  it("lists the blocked houses with the file each needs and where to download it", async () => {
    api.get.mockResolvedValue(OVERVIEW);
    wrap();
    const table = await screen.findByRole("table", { name: "Files each fund house needs" });
    const hdfc = table.querySelector('tr[data-house="hdfc"]')!;
    expect(hdfc.textContent).toContain("needs the October 2026 file");
    expect(within(hdfc as HTMLElement).getByRole("link", { name: "hdfcfund.com" }).getAttribute("href")).toBe("https://www.hdfcfund.com/statutory-disclosure/factsheets");
    expect(table.querySelector('tr[data-house="kotak"]')!.textContent).toContain("Up to date");
    expect(table.querySelector('tr[data-house="sbi"]')).toBeNull();          // houses the nightly job reads are not asked for
  });

  it("uploads with the chosen house and month and shows what was stored", async () => {
    api.get.mockResolvedValue(OVERVIEW);
    api.send.mockResolvedValue({ status: "stored, no reader", why: "The file is kept, but no portfolio in it could be read: a reader for this fund house's layout is being built.",
      houseTitle: "Kotak Mahindra Mutual Fund", monthLabel: "October 2026", file: "kotak.xlsx", portfolios: 0, stored: 0, keptExisting: 0, olderThanKept: 0, schemes: [], unmatched: [], rejected: [], errors: [] });
    wrap();
    await screen.findByLabelText("Fund house");
    const upload = document.getElementById("fund-files-upload") as HTMLButtonElement;
    expect(upload.disabled).toBe(true);                                       // nothing chosen yet
    fireEvent.change(document.getElementById("fund-files-house")!, { target: { value: "kotak" } });
    fireEvent.change(document.getElementById("fund-files-month")!, { target: { value: "2026-10" } });
    const f = new File([new Uint8Array([0x50, 0x4b, 3, 4])], "kotak.xlsx");
    fireEvent.change(document.getElementById("fund-files-file")!, { target: { files: [f] } });
    expect(upload.disabled).toBe(false);
    fireEvent.click(upload);
    await waitFor(() => expect(api.send).toHaveBeenCalled());
    const [method, path, body] = api.send.mock.calls[0];
    expect([method, path, body.house, body.month, body.name]).toEqual(["POST", "/api/admin/fund-files", "kotak", "2026-10", "kotak.xlsx"]);
    const result = await screen.findByRole("table", { name: "Upload result" });
    expect(result.id).toBe("fund-files-result");
    expect(screen.getByText("stored, no reader")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("being built");
  });

  it("offers the month due first and the eleven before it", () => {
    const m = monthChoices("2026-10");
    expect(m[0]).toBe("2026-10");
    expect(m[1]).toBe("2026-09");
    expect(m).toHaveLength(12);
    expect(m[11]).toBe("2025-11");
  });
});
