import React, { act } from "react";
import { createRoot } from "react-dom/client";
import usePremiumReport from "./usePremiumReport";
import { cmsRequest } from "@/lib/cms";
import { startPremiumReportPolling } from "@/lib/premiumReportPolling";
import { currentPremiumReport, rememberPremiumReport } from "@/lib/currentPremiumReport";
import { downloadPremiumReport } from "@/lib/premiumReportDownload";

jest.mock("@/lib/cms", () => ({ cmsRequest: jest.fn() }));
jest.mock("@/lib/premiumReportPolling", () => ({ startPremiumReportPolling: jest.fn() }));
jest.mock("@/lib/currentPremiumReport", () => ({ currentPremiumReport: jest.fn(), rememberPremiumReport: jest.fn() }));
jest.mock("@/lib/premiumReportDownload", () => ({ downloadPremiumReport: jest.fn() }));

let root, container, current;
const navigate = jest.fn();
const snapshot = { id: "report-id", state: "ready", snapshotReceipt: "receipt", company: { symbol: "TCS" } };
const previousActEnvironment = global.IS_REACT_ACT_ENVIRONMENT;

function Probe({ reportId }) {
  current = usePremiumReport({ reportId, navigate });
  return null;
}

beforeAll(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
afterAll(() => { global.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment; });
beforeEach(() => {
  jest.useFakeTimers();
  jest.resetAllMocks();
  currentPremiumReport.mockReturnValue(null);
  startPremiumReportPolling.mockReturnValue(jest.fn());
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.useRealTimers();
});

test("restores the signed current snapshot without polling a server job", async () => {
  currentPremiumReport.mockReturnValue(snapshot);
  await act(async () => root.render(<Probe reportId={snapshot.id} />));
  expect(current.report).toBe(snapshot);
  expect(current.loading).toBe(false);
  expect(startPremiumReportPolling).not.toHaveBeenCalled();
  expect(cmsRequest).not.toHaveBeenCalled();
});

test("generation sends the chosen company/basis and retains the snapshot before navigation", async () => {
  await act(async () => root.render(<Probe />));
  let finish;
  cmsRequest.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  let generation;
  await act(async () => { generation = current.generate("  TCS  ", "standalone"); });
  expect(current.submitting).toBe(true);
  expect(current.busy).toBe(true);
  expect(JSON.parse(cmsRequest.mock.calls[0][1].body)).toEqual({ query: "TCS", statement_type: "standalone", delivery: "inline" });
  await act(async () => { finish(snapshot); await generation; });
  expect(rememberPremiumReport).toHaveBeenCalledWith(snapshot);
  expect(navigate).toHaveBeenCalledWith(`/blog/admin/premium-reports/${snapshot.id}`);
  expect(rememberPremiumReport.mock.invocationCallOrder[0]).toBeLessThan(navigate.mock.invocationCallOrder[0]);
  expect(current.submitting).toBe(false);
});

test("expired administrator authentication returns to login and clears generation state", async () => {
  await act(async () => root.render(<Probe />));
  cmsRequest.mockRejectedValue({ status: 401, message: "Expired" });
  await act(async () => current.generate("TCS", "consolidated"));
  expect(navigate).toHaveBeenCalledWith("/blog/admin/login", { replace: true });
  expect(current.submitting).toBe(false);
  expect(rememberPremiumReport).not.toHaveBeenCalled();
});

test("legacy loading exposes retry state and cancels polling when the route changes", async () => {
  const stop = jest.fn();
  startPremiumReportPolling.mockReturnValue(stop);
  await act(async () => root.render(<Probe reportId="legacy" />));
  const callbacks = startPremiumReportPolling.mock.calls[0][0];
  expect(current.loading).toBe(true);
  cmsRequest.mockResolvedValue(snapshot);
  const signal = new AbortController().signal;
  await callbacks.load(signal);
  expect(cmsRequest).toHaveBeenCalledWith("/premium-reports/legacy", { signal });
  await act(async () => callbacks.onRetry(2500));
  expect(current.loading).toBe(false);
  expect(current.connectionIssue).toContain("3 seconds");
  await act(async () => callbacks.onData(snapshot));
  expect(current.report).toBe(snapshot);
  expect(current.connectionIssue).toBe("");
  await act(async () => root.render(<Probe />));
  expect(stop).toHaveBeenCalledTimes(1);
  expect(current.report).toBeNull();
});

test("company suggestions debounce and ignore responses to an obsolete query", async () => {
  await act(async () => root.render(<Probe />));
  let finishOld;
  cmsRequest.mockReturnValueOnce(new Promise((resolve) => { finishOld = resolve; }));
  await act(async () => current.setQuery("TC"));
  await act(async () => jest.advanceTimersByTime(349));
  expect(cmsRequest).not.toHaveBeenCalled();
  await act(async () => jest.advanceTimersByTime(1));
  const oldSignal = cmsRequest.mock.calls[0][1].signal;
  await act(async () => current.setQuery("TCS"));
  expect(oldSignal.aborted).toBe(true);
  await act(async () => finishOld({ items: [{ symbol: "OLD" }] }));
  expect(current.suggestions).toEqual([]);
  cmsRequest.mockResolvedValueOnce({ items: [{ symbol: "TCS" }] });
  await act(async () => jest.advanceTimersByTime(350));
  expect(current.suggestions).toEqual([{ symbol: "TCS" }]);
});

test("download uses the current snapshot and surfaces failures without leaving a spinner", async () => {
  currentPremiumReport.mockReturnValue(snapshot);
  await act(async () => root.render(<Probe reportId={snapshot.id} />));
  downloadPremiumReport.mockRejectedValue(new Error("Download unavailable"));
  await act(async () => current.download());
  expect(downloadPremiumReport).toHaveBeenCalledWith(snapshot, snapshot.id);
  expect(current.error).toBe("Download unavailable");
  expect(current.downloading).toBe(false);
});
