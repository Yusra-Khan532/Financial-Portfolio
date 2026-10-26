import { downloadPremiumReport } from "./premiumReportDownload";
import { cmsRequest } from "./cms";

jest.mock("./cms", () => ({ cmsRequest: jest.fn() }));

const reportId = "0123456789abcdef0123456789abcdef";
const report = { id: reportId, company: { symbol: "TCS" }, rating: { final: 65 }, snapshotExpiresAt: "2026-10-25T10:30:00Z", snapshotReceipt: "signed-receipt" };
let clicked;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  URL.createObjectURL = jest.fn(() => "blob:finlit-pdf");
  URL.revokeObjectURL = jest.fn();
  clicked = null;
  jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () { clicked = this; });
});
afterEach(() => { jest.restoreAllMocks(); jest.clearAllTimers(); jest.useRealTimers(); });

test("posts the exact signed report, downloads it and releases its object URL", async () => {
  const before = JSON.stringify(report);
  const pdf = new Blob(["pdf"], { type: "application/pdf" });
  cmsRequest.mockResolvedValue(pdf);
  await downloadPremiumReport(report, reportId);
  const [path, options] = cmsRequest.mock.calls[0];
  expect(path).toBe("/premium-reports/pdf");
  expect(options.responseType).toBe("blob");
  const { snapshotReceipt, ...snapshot } = report;
  expect(JSON.parse(options.body)).toEqual({ report: snapshot, receipt: snapshotReceipt });
  expect(clicked.href).toBe("blob:finlit-pdf");
  expect(clicked.download).toBe("FinLit-Premium-TCS-01234567.pdf");
  expect(document.body.contains(clicked)).toBe(false);
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  jest.advanceTimersByTime(30000);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:finlit-pdf");
  expect(JSON.stringify(report)).toBe(before);
});

test("legacy reports retain the one-use download-link flow", async () => {
  const { snapshotReceipt, ...legacy } = report;
  cmsRequest.mockResolvedValue({ url: "/api/premium-report-downloads/capability" });
  await downloadPremiumReport(legacy, reportId);
  expect(cmsRequest).toHaveBeenCalledWith(`/premium-reports/${reportId}/download-link`, { method: "POST" });
  expect(clicked.getAttribute("href")).toBe(`${process.env.REACT_APP_BACKEND_URL || ""}/api/premium-report-downloads/capability`);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

test("failed provider responses do not create a browser download", async () => {
  cmsRequest.mockRejectedValue(new Error("Expired snapshot"));
  await expect(downloadPremiumReport(report, reportId)).rejects.toThrow("Expired snapshot");
  expect(clicked).toBeNull();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

test("a failed browser click still removes the temporary anchor and releases the blob", async () => {
  cmsRequest.mockResolvedValue(new Blob(["pdf"]));
  HTMLAnchorElement.prototype.click.mockImplementation(function () { clicked = this; throw new Error("Click failed"); });
  await expect(downloadPremiumReport(report, reportId)).rejects.toThrow("Click failed");
  expect(document.body.contains(clicked)).toBe(false);
  jest.advanceTimersByTime(30000);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:finlit-pdf");
});
