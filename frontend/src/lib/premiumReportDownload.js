import { cmsRequest } from "@/lib/cms";
import { snapshotPDFRequest } from "@/lib/currentPremiumReport";

// Download the exact signed calculation, with a legacy link fallback.
export async function downloadPremiumReport(report, reportId) {
  let objectUrl;
  let anchor;
  try {
    let downloadUrl;
    if (report.snapshotReceipt) {
      const pdf = await cmsRequest("/premium-reports/pdf", {
        method: "POST",
        body: JSON.stringify(snapshotPDFRequest(report)),
        responseType: "blob"
      });
      objectUrl = URL.createObjectURL(pdf);
      downloadUrl = objectUrl;
    } else {
      const link = await cmsRequest(`/premium-reports/${reportId}/download-link`, {
        method: "POST"
      });
      downloadUrl = `${process.env.REACT_APP_BACKEND_URL || ""}${link.url}`;
    }
    anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = `FinLit-Premium-${report.company.symbol}-${reportId.slice(0, 8)}.pdf`;
    anchor.rel = "noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor?.remove();
    if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
  }
}
