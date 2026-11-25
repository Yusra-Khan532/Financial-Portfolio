// @vitest-environment jsdom
// Console > Storage: the disk, what fills it, the growth, the database by table and the backups, as the server measures them.
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StorageReport } from "../../lib/account";

const GB = 1024 ** 3, MB = 1024 ** 2;
let REPORT: StorageReport;
vi.mock("../../lib/account", async (orig) => ({ ...(await orig<typeof import("../../lib/account")>()), adminStorage: async () => REPORT }));
import { StorageAdmin, bytes } from "./StorageAdmin";

const base = (): StorageReport => ({
  at: "2026-11-25T10:00:00Z", alertPct: 85,
  disk: { total: 40 * GB, used: 24 * GB, free: 16 * GB },
  parts: [{ name: "Database", bytes: 2.5 * GB }, { name: "Database write-ahead log", bytes: 600 * MB }, { name: "Database backups", bytes: 1.2 * GB },
    { name: "NSE daily files", bytes: 240 * MB }, { name: "System, Docker images, swap file and logs", bytes: 19.5 * GB, note: "The rest of the used space." }],
  database: { bytes: 2.5 * GB, walBytes: 600 * MB, tableCount: 166, otherTables: 0, otherTablesBytes: 0, systemBytes: 50 * MB, deadRows: 90000,
    groups: [{ name: "Prices and charts", bytes: 1.1 * GB, tables: 9 }, { name: "Company reports and scores", bytes: 0.9 * GB, tables: 40 }],
    tables: [{ name: "price_daily", group: "Prices and charts", total: 900 * MB, data: 600 * MB, indexes: 300 * MB, largeValues: 0, live: 8_700_000, dead: 1200, chunks: 320, compressedChunks: 0 },
      { name: "snapshots", group: "Company reports and scores", total: 500 * MB, data: 100 * MB, indexes: 20 * MB, largeValues: 380 * MB, live: 52_000, dead: 40_000 }],
    hypertables: [{ name: "price_daily", chunks: 320, compressed: 0 }] },
  backups: { available: true, count: 2, bytes: 1.2 * GB, files: [{ name: "finlit-2026-11-25_203000.dump", bytes: 0.6 * GB, at: "2026-11-25T20:30:00Z" }, { name: "finlit-2026-11-24_203000.dump", bytes: 0.6 * GB, at: "2026-11-24T20:30:00Z" }] },
  folders: [{ name: "NSE daily files", path: "/data/nse", bytes: 240 * MB }],
  history: [{ day: "2026-11-15", diskUsed: 23 * GB, diskTotal: 40 * GB, dbBytes: 2.4 * GB, backupsBytes: 1.1 * GB }, { day: "2026-11-25", diskUsed: 24 * GB, diskTotal: 40 * GB, dbBytes: 2.5 * GB, backupsBytes: 1.2 * GB }],
  growth: { known: true, fromDay: "2026-11-15", toDay: "2026-11-25", days: 10, diskPerDay: 0.1 * GB, dbPerDay: 0.01 * GB, daysToAlert: 100, daysToFull: 160 },
});
const open = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><StorageAdmin /></QueryClientProvider>);
afterEach(cleanup);

describe("Console > Storage", () => {
  it("shows the disk size, used, free and the alert line", async () => {
    REPORT = base(); open();
    await screen.findByRole("heading", { name: "Server disk" });
    expect(document.body.textContent).toMatch(/40\.0 GB\s*disk size/);
    expect(document.body.textContent).toMatch(/24\.0 GB\s*used \(60%\)/);
    expect(document.body.textContent).toMatch(/16\.0 GB\s*free/);
    expect(document.body.textContent).toMatch(/85%\s*alert line \(34\.0 GB\)/);
    expect(screen.getByRole("progressbar", { name: "Share of the disk used" }).getAttribute("aria-valuenow")).toBe("60");
  });
  it("names what fills the disk, with each part's share", async () => {
    REPORT = base(); open();
    await screen.findByRole("heading", { name: "What fills it" });
    const rows = [...document.querySelectorAll(".stg-t")[0].querySelectorAll("tbody tr")].map((r) => r.textContent);
    expect(rows[0]).toMatch(/Database2\.50 GB6\.3%/);
    expect(rows[2]).toMatch(/Database backups1\.20 GB3%/);
    expect(rows[4]).toMatch(/System, Docker images, swap file and logs.*19\.5 GB48\.8%/);
  });
  it("gives the daily growth and the days left before the alert and before full", async () => {
    REPORT = base(); open();
    await screen.findByRole("heading", { name: "How fast it grows" });
    expect(document.body.textContent).toMatch(/\+102 MBdisk change a day \(10 days/);
    expect(document.body.textContent).toMatch(/100 daysuntil the 85% alert line/);
    expect(document.body.textContent).toMatch(/160 daysuntil the disk is full/);
  });
  it("with one reading, says when the growth appears", async () => {
    REPORT = { ...base(), history: base().history.slice(1), growth: { known: false, why: "The growth appears once there are readings on two different days." } }; open();
    expect(await screen.findByText(/The growth appears once there are readings on two different days/)).toBeTruthy();
  });
  it("lists the database table by table, with groups, compression and too many dead rows marked", async () => {
    REPORT = base(); open();
    await screen.findByRole("heading", { name: "Inside the database" });
    expect(document.body.textContent).toMatch(/1\.10 GBPrices and charts \(9 tables\)/);
    expect(document.body.textContent).toMatch(/price_daily \(TimescaleDB\): 0 of 320 time chunks compressed/);
    const snap = [...document.querySelectorAll("tr")].find((r) => r.textContent?.startsWith("snapshots"))!;
    expect(snap.querySelector(".stg-warn")!.textContent).toBe("40,000");
  });
  it("lists the backups and says they are for recovery only; a hidden folder says why", async () => {
    REPORT = base(); open();
    await screen.findByRole("heading", { name: "Database backups" });
    expect(document.body.textContent).toMatch(/2 kept, 1\.20 GB in all/);
    expect(document.body.textContent).toMatch(/nothing on the site or in the jobs reads them/);
    cleanup();
    REPORT = { ...base(), backups: { available: false, why: "The backups folder is not visible to the app (/backups); it is mounted read-only from the next deploy on." } }; open();
    expect(await screen.findByText(/Database backups: The backups folder is not visible/)).toBeTruthy();
  });
  it("formats sizes", () => {
    expect(bytes(40 * GB)).toBe("40.0 GB"); expect(bytes(2.5 * GB)).toBe("2.50 GB"); expect(bytes(600 * MB)).toBe("600 MB"); expect(bytes(5 * MB)).toBe("5.0 MB"); expect(bytes(null)).toBe("—");
  });
});
