import { describe, expect, it } from "vitest";
import { noticeLabels } from "./alerts";

describe("noticeLabels: a pop-up never says 'View stock' on something that is not a stock", () => {
  it("stock alert", () => expect(noticeLabels({ kind: "alert", title: "RELIANCE – price above", link: "/stocks/RELIANCE" })).toEqual({ head: "Alert triggered", action: "View stock" }));
  it("fund and ETF alerts", () => {
    expect(noticeLabels({ kind: "alert", title: "x", link: "/funds/120503" }).action).toBe("View fund");
    expect(noticeLabels({ kind: "alert", title: "x", link: "/etfs/NIFTYBEES" }).action).toBe("View ETF");
  });
  it("job alerts for admins (the founder's screenshot)", () => {
    expect(noticeLabels({ kind: "system", title: "FinLit job failing: technicals", link: "/console" })).toEqual({ head: "Job alert", action: "Open console" });
    expect(noticeLabels({ kind: "system", title: "Resolved: FinLit data is stale: prices", link: "/console" })).toEqual({ head: "Resolved", action: "Open console", text: "FinLit data is stale: prices" });
  });
  it("saved-screen update", () => expect(noticeLabels({ kind: "screen", title: "3 new", link: "/screener" })).toEqual({ head: "Screen update", action: "Open screener" }));
  it("no link: no button", () => expect(noticeLabels({ kind: "system", title: "x", link: null }).action).toBeNull());
});
