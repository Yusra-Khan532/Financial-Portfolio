// Only the current report is retained in this tab; this is not a report history.
const KEY = 'premium_current_report';
let current = null;

export function rememberPremiumReport(report) {
  current = report;
  try { sessionStorage.setItem(KEY, JSON.stringify(report)); } catch { /* Keep the current page usable if storage is unavailable. */ }
}

export function currentPremiumReport(id) {
  let report = current;
  if (!report || report.id !== id) {
    try { report = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { report = null; }
  }
  if (!report || report.id !== id) return null;
  if (report.state !== 'ready' || !report.snapshotReceipt || !(Date.parse(report.snapshotExpiresAt) > Date.now())) {
    current = null;
    try { sessionStorage.removeItem(KEY); } catch { /* No stored history to clean up. */ }
    return null;
  }
  return report;
}

export function snapshotPDFRequest(report) {
  const { snapshotReceipt: receipt, ...snapshot } = report;
  return { report: snapshot, receipt };
}
