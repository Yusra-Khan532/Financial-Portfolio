// Older current-tab reports predate reader-facing commentary. Keep them usable
// without treating estimated or excluded inputs as company facts.
export function premiumReportReview(report) {
  if (report.review) return report.review;
  const parts = ["fundamental", "valuation", "quality", "risk"].map((key) => {
    const part = { key, name: key[0].toUpperCase() + key.slice(1), score: report.rating.status === "NOT RATED" ? null : report.rating.parts[key], pros: [], cons: [], mixed: [], unavailable: [] };
    report.rating.metrics.filter((row) => row.part === key && row.status !== "N").forEach((row) => {
      const missing = ["F", "L"].includes(row.status) || row.points == null;
      const bucket = missing ? "unavailable" : row.points >= 70 ? "pros" : row.points < 40 ? "cons" : "mixed";
      part[bucket].push({ metric: row.metric, label: row.label, valueText: row.value == null || missing ? "Not available" : `${Number(row.value).toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${row.unit || ""}`, summary: missing ? row.status === "F" ? "Not reported; an estimate is used in the assessment." : "Not reported; not assessed." : row.status === "S" ? "Industry data is used because company history is unavailable." : "" });
    });
    return part;
  });
  return { parts, notes: ["Generate a fresh report for the latest factor commentary and review notes."] };
}
