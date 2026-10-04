import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, BarChart3, RefreshCcw, Search } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import AdminShell from "@/components/cms/AdminShell";
import { cmsRequest, formatCmsDateTime } from "@/lib/cms";

const GOLD = "#F5A623";
const TEAL = "#75B89B";
const RED = "#C98182";
const BLUE = "#7AA7E8";
const MUTED = "#94A3B8";

const DEFAULT_QUERY = "RELIANCE";
const YEARLY_PERIOD_LIMIT = 6;
const QUARTERLY_PERIOD_LIMIT = YEARLY_PERIOD_LIMIT * 4;
const PRICE_RANGES = [
  { id: "1m", label: "1M", months: 1 },
  { id: "6m", label: "6M", months: 6 },
  { id: "1y", label: "1Yr", months: 12 },
  { id: "3y", label: "3Yr", months: 36 },
  { id: "5y", label: "5Yr", months: 60 },
  { id: "max", label: "Max", months: null },
];
const PRICE_INTERVALS = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];
const DASHBOARD_TABS = [
  { id: "summary", label: "Summary" },
  { id: "market-metrics", label: "Market Metrics" },
  { id: "research-report", label: "Report" },
  { id: "derived-metrics", label: "Metrics" },
  { id: "price-chart", label: "Chart" },
  { id: "insights", label: "Signals" },
  { id: "profit-loss", label: "P&L" },
  { id: "balance-sheet", label: "Balance Sheet" },
  { id: "cash-flow", label: "Cash Flow" },
  { id: "ratios", label: "Ratios" },
  { id: "shareholding", label: "Shareholding" },
  { id: "competitors", label: "Peers" },
  { id: "corporate-actions", label: "Actions" },
];
const NOISY_FINANCIAL_KEYS = new Set([
  "periodstart",
  "resultdate",
  "eps",
  "basiceps",
  "dilutedeps",
  "basicoutstandingshares",
  "dilutedoutstandingshares",
  "outstandingshares",
]);
const CORE_INCOME_ROWS = [
  "revenue",
  "expenses",
  "costofgoodssold",
  "employeebenefitexpense",
  "financecosts",
  "depreciationandamortisation",
  "otherincome",
  "operatingprofit",
  "profitbeforetax",
  "exceptionalitems",
  "taxexpense",
  "netprofit",
];
const CORE_CASH_ROWS = [
  "operating",
  "investing",
  "financing",
  "netcashflow",
  "purchaseoffixedintangibleassets",
  "purchaseofppeclassifiedasinvesting",
  "saleoffixedintangibleassets",
  "dividendspaidclassifiedasfinancing",
  "interestpaidclassifiedasfinancing",
];
const BALANCE_SHEET_GROUPS = [
  { key: "equitycapital", label: "Equity Capital", aliases: ["equitycapital", "sharecapital"] },
  { key: "reserves", label: "Reserves", aliases: ["reserves", "reservesandsurplus"] },
  {
    key: "borrowings",
    label: "Borrowings",
    children: ["borrowingscurrent", "borrowingsnoncurrent", "shorttermborrowings", "longtermborrowings", "currentborrowings", "noncurrentborrowings"],
  },
  {
    key: "otherliabilities",
    label: "Other Liabilities",
    aliases: ["totalliability"],
    children: ["tradpayables", "tradepayables", "currentfinancialliabilities", "othercurrentliabilities", "othernoncurrentliabilities", "provisions"],
  },
  { key: "totalliabilities", label: "Total Liabilities", aliases: ["totalasset"], strong: true },
  {
    key: "fixedassets",
    label: "Fixed Assets",
    children: ["propertyplantandequipment", "propertyplantandequipmentgross", "tangibleassets", "intangibleassets", "rightofuseassets"],
  },
  { key: "capitalworkinprogress", label: "CWIP", aliases: ["capitalworkinprogress", "cwip"] },
  { key: "investments", label: "Investments", aliases: ["investments", "currentinvestments", "noncurrentinvestments"] },
  {
    key: "otherassets",
    label: "Other Assets",
    aliases: ["currentassets"],
    children: ["currentassets", "currentfinancialassets", "cashandcashequivalents", "inventories", "tradereceivablescurrent", "assetsclassifiedasheldforsale"],
  },
  { key: "totalasset", label: "Total Assets", strong: true },
];
const CASH_FLOW_GROUPS = [
  {
    key: "operating",
    label: "Cash from Operating Activity",
    children: ["adjfordepreciationandamortisationexpense", "adjforinventories", "adjfortradepayablescurrent", "adjfortradereceivablescurrent", "adjforfinancecosts", "adjforinterestincome"],
  },
  {
    key: "investing",
    label: "Cash from Investing Activity",
    children: ["purchaseoffixedintangibleassets", "purchaseofppeclassifiedasinvesting", "saleoffixedintangibleassets", "purchaseofinvestments", "saleofinvestments", "adjfordividendincome"],
  },
  {
    key: "financing",
    label: "Cash from Financing Activity",
    children: ["dividendspaidclassifiedasfinancing", "interestpaidclassifiedasfinancing", "proceedsfromborrowings", "repaymentofborrowings"],
  },
  { key: "netcashflow", label: "Net Cash Flow", strong: true },
];
const PROFIT_LOSS_GROUPS = [
  {
    key: "revenue",
    label: "Revenue",
    children: ["totalincome", "interestearned", "interestincome", "revenuefromoperations", "incomefromoperations", "netsales", "sales"],
  },
  {
    key: "expenses",
    label: "Expenses",
    children: ["costofgoodssold", "cogs", "employeebenefitexpense", "employeebenefitsexpense", "financecosts", "operatingexpenses", "otherexpenses"],
  },
  { key: "operatingprofit", label: "Operating Profit", strong: true },
  {
    key: "otherincome",
    label: "Other Income",
    children: ["totalotherincome", "nonoperatingincome"],
  },
  { key: "interest", label: "Interest" },
  { key: "depreciation", label: "Depreciation" },
  { key: "profitbeforetax", label: "Profit before tax", strong: true },
  { key: "exceptionalitems", label: "Exceptional Items" },
  { key: "taxexpense", label: "Tax" },
  {
    key: "netprofit",
    label: "Net Profit",
    strong: true,
    children: ["eps", "basicreinr", "dilutedreinr", "dividendpayout"],
  },
];
const RATIO_PRIORITY = [
  "debtordays",
  "inventorydays",
  "dayspayable",
  "cashconversioncycle",
  "workingcapitaldays",
  "roce",
  "roe",
  "pe",
  "pb",
  "debt/equity",
  "interestcoverage",
  "currentratio",
  "quickratio",
  "assetturnover",
];
const RATIO_DESCRIPTIONS = {
  "P/E": "Shows how much investors are willing to pay for Rs. 1 of a company's earnings.",
  "P/B": "Compares market price with book value per share.",
  ROE: "Measures profit generated on shareholders' equity.",
  ROCE: "Measures return generated on capital employed in the business.",
  ROA: "Measures profit generated from the company's asset base.",
  "Debt / Equity": "Compares total debt with shareholders' equity.",
  "EV/EBITDA": "Compares enterprise value with operating earnings before depreciation and amortisation.",
  "Current Ratio": "Shows whether short-term assets can cover short-term liabilities.",
  "Quick Ratio": "Measures near-term liquidity excluding inventory.",
  "Interest Coverage": "Shows how comfortably operating profit can cover interest cost.",
};

function compactNumber(value, options = {}) {
  if (value === null || value === undefined || value === "") return "N/A";
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return String(value).trim().toLowerCase() === "nan" ? "N/A" : String(value);
  }
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: options.decimals ?? 2,
    notation: options.compact ? "compact" : "standard",
  }).format(number);
}

function valueWithUnit(value, unit) {
  const number = Number(value);
  const formatted = compactNumber(value, { compact: Number.isFinite(number) && Math.abs(number) >= 100000 });
  return unit && formatted !== "N/A" ? `${formatted} ${unit}` : formatted;
}

function numericValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace("%", ""));
  return Number.isFinite(number) ? number : null;
}

function parsePriceDate(date) {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function periodStart(date, interval) {
  if (interval === "monthly") return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  if (interval === "weekly") {
    const weekStart = new Date(date);
    const day = weekStart.getDay() || 7;
    weekStart.setDate(weekStart.getDate() - day + 1);
    return weekStart.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function aggregatePriceCandles(history, interval) {
  const rows = [...(history || [])]
    .filter((row) => row.date && Number.isFinite(Number(row.close)))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (interval === "daily") return rows;

  const groups = new Map();
  rows.forEach((row) => {
    const parsedDate = parsePriceDate(row.date);
    if (!parsedDate) return;
    const key = periodStart(parsedDate, interval);
    const current = groups.get(key);
    if (!current) {
      groups.set(key, {
        date: row.date,
        open: Number(row.open) || Number(row.close),
        high: Number(row.high) || Number(row.close),
        low: Number(row.low) || Number(row.close),
        close: Number(row.close),
        volume: Number(row.volume) || 0,
      });
      return;
    }
    current.date = row.date;
    current.high = Math.max(current.high, Number(row.high) || Number(row.close));
    current.low = Math.min(current.low, Number(row.low) || Number(row.close));
    current.close = Number(row.close);
    current.volume += Number(row.volume) || 0;
  });

  return Array.from(groups.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function emaValue(previous, close, windowSize) {
  const multiplier = 2 / (windowSize + 1);
  return close * multiplier + previous * (1 - multiplier);
}

function standardDeviation(values) {
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

function rsiValue(items, index, windowSize = 14) {
  if (index < windowSize) return null;
  let gains = 0;
  let losses = 0;
  for (let offset = index - windowSize + 1; offset <= index; offset += 1) {
    const change = Number(items[offset].close) - Number(items[offset - 1].close);
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }
  if (losses === 0) return 100;
  const relativeStrength = gains / windowSize / (losses / windowSize);
  return 100 - (100 / (1 + relativeStrength));
}

function priceChartData(history, interval = "daily") {
  const rows = aggregatePriceCandles(history, interval);
  const emaState = { ema20: null, ema50: null, ema200: null };
  return rows.map((row, index) => ({
    ...row,
    date: row.date,
    label: new Date(`${row.date}T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" }),
    price: Number(row.close),
    volume: Number(row.volume) || 0,
  })).map((row, index, items) => {
    const close = Number(row.close);
    emaState.ema20 = emaState.ema20 === null ? close : emaValue(emaState.ema20, close, 20);
    emaState.ema50 = emaState.ema50 === null ? close : emaValue(emaState.ema50, close, 50);
    emaState.ema200 = emaState.ema200 === null ? close : emaValue(emaState.ema200, close, 200);
    const bollingerWindow = items.slice(Math.max(0, index - 19), index + 1).map((item) => Number(item.close));
    const bollingerMiddle = bollingerWindow.length === 20 ? bollingerWindow.reduce((sum, value) => sum + value, 0) / 20 : null;
    const bollingerDeviation = bollingerMiddle === null ? null : standardDeviation(bollingerWindow);
    const previous = items[index - 1];
    const pivot = previous ? (Number(previous.high) + Number(previous.low) + Number(previous.close)) / 3 : null;
    return {
      ...row,
      ema20: index >= 19 ? emaState.ema20 : null,
      ema50: index >= 49 ? emaState.ema50 : null,
      ema200: index >= 199 ? emaState.ema200 : null,
      rsi: rsiValue(items, index),
      bollingerMiddle,
      bollingerUpper: bollingerMiddle === null ? null : bollingerMiddle + (2 * bollingerDeviation),
      bollingerLower: bollingerMiddle === null ? null : bollingerMiddle - (2 * bollingerDeviation),
      pivot,
      resistance1: pivot === null ? null : (2 * pivot) - Number(previous.low),
      support1: pivot === null ? null : (2 * pivot) - Number(previous.high),
    };
  });
}

function filterPriceRange(rows, rangeId) {
  const selectedRange = PRICE_RANGES.find((range) => range.id === rangeId) || PRICE_RANGES[2];
  if (!selectedRange.months || rows.length < 2) return rows;
  const latest = new Date(`${rows[rows.length - 1].date}T00:00:00`);
  if (Number.isNaN(latest.getTime())) return rows;
  const cutoff = new Date(latest);
  cutoff.setMonth(cutoff.getMonth() - selectedRange.months);
  return rows.filter((row) => new Date(`${row.date}T00:00:00`) >= cutoff);
}

function descriptionBullets(description) {
  const matches = String(description || "").replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]?/g) || [];
  const bullets = matches.map((item) => item.trim()).filter(Boolean).slice(0, 5);
  return bullets.length ? bullets : [description].filter(Boolean);
}

function ratioByName(ratios, name) {
  return (ratios || []).find((ratio) => String(ratio.name || "").toUpperCase() === name.toUpperCase());
}

function normalizeMetricName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function financialRowKey(row) {
  return normalizeMetricName(row?.category || row?.label);
}

function displayPeriodLabel(period) {
  const text = String(period || "");
  const quarterMatch = text.match(/^Q([1-4])\s+(20\d{2}|19\d{2})$/i);
  if (!quarterMatch) return text;
  const quarterEndMonth = {
    1: "Mar",
    2: "Jun",
    3: "Sep",
    4: "Dec",
  }[Number(quarterMatch[1])];
  return `${quarterEndMonth} ${quarterMatch[2]}`;
}

function hasMeaningfulHistory(row) {
  const values = (row?.history || []).map((point) => numericValue(point.value)).filter((value) => value !== null);
  if (!values.length) return false;
  return values.some((value) => Math.abs(value) > 0.000001);
}

function cleanFinancialRows(rows, period, priorityKeys = []) {
  const priority = priorityKeys.map(normalizeMetricName);
  const limited = limitHistoryRows(rows, period)
    .filter((row) => {
      const key = financialRowKey(row);
      if (!key || NOISY_FINANCIAL_KEYS.has(key) || key.endsWith("date")) return false;
      return hasMeaningfulHistory(row);
    });

  const priorityRows = priority
    .map((key) => limited.find((row) => financialRowKey(row) === key))
    .filter(Boolean);
  const prioritySet = new Set(priorityRows.map((row) => financialRowKey(row)));
  const rest = limited
    .filter((row) => !prioritySet.has(financialRowKey(row)))
    .sort((a, b) => String(a.label || a.category).localeCompare(String(b.label || b.category)));

  return priorityRows.length ? [...priorityRows, ...rest.slice(0, 8)] : rest.slice(0, 14);
}

function statementRows(rows, period) {
  return limitHistoryRows(rows, period)
    .filter((row) => {
      const key = financialRowKey(row);
      if (!key || NOISY_FINANCIAL_KEYS.has(key) || key.endsWith("date")) return false;
      return hasMeaningfulHistory(row);
    });
}

function firstRowByKeys(rowMap, keys) {
  return (keys || []).map((key) => rowMap.get(normalizeMetricName(key))).find(Boolean);
}

function mergeRows(rows, category, label) {
  const historyByPeriod = new Map();
  rows.forEach((row) => {
    (row.history || []).forEach((point) => {
      const value = pointValue(point);
      if (value === null) return;
      const current = historyByPeriod.get(point.period) || { period: point.period, value: 0, change: null };
      current.value += value;
      historyByPeriod.set(point.period, current);
    });
  });
  const history = Array.from(historyByPeriod.values()).sort((a, b) => String(b.period).localeCompare(String(a.period)));
  return { category, label, history };
}

function buildGroupedStatementRows(rows, period, expanded, groups, fallbackLimit = 0) {
  const sourceRows = statementRows(rows, period);
  const byKey = new Map(sourceRows.map((row) => [financialRowKey(row), row]));
  const consumed = new Set();
  const output = [];

  groups.forEach((group) => {
    const parent = firstRowByKeys(byKey, [group.key, ...(group.aliases || [])]);
    const parentKey = parent ? financialRowKey(parent) : normalizeMetricName(group.key);
    const childRows = (group.children || [])
      .map((key) => byKey.get(normalizeMetricName(key)))
      .filter(Boolean)
      .filter((row) => financialRowKey(row) !== parentKey);
    const syntheticParent = !parent && group.children?.length && childRows.length
      ? mergeRows(childRows, group.key, group.label)
      : null;
    const parentRow = parent || syntheticParent;
    if (!parentRow && !childRows.length) return;

    if (parent) consumed.add(financialRowKey(parent));
    childRows.forEach((row) => consumed.add(financialRowKey(row)));
    output.push({
      ...parentRow,
      category: group.key,
      label: group.label,
      strong: group.strong,
      expandable: childRows.length > 0,
      childCount: childRows.length,
      depth: 0,
    });

    if (expanded[group.key]) {
      childRows.forEach((row) => output.push({ ...row, depth: 1 }));
    }
  });

  sourceRows
    .filter((row) => !consumed.has(financialRowKey(row)))
    .slice(0, fallbackLimit)
    .forEach((row) => output.splice(Math.max(0, output.length - 1), 0, { ...row, depth: 0 }));

  return output;
}

function buildProfitLossRows(rows, period, expanded) {
  return buildGroupedStatementRows(rows, period, expanded, PROFIT_LOSS_GROUPS, 0);
}

function ratioByAnyName(ratios, names) {
  const normalizedNames = names.map(normalizeMetricName);
  return (ratios || []).find((ratio) => normalizedNames.includes(normalizeMetricName(ratio.name)));
}

function scoreFromThresholds(value, thresholds, lowerIsBetter = false) {
  const number = numericValue(value);
  if (number === null) return null;
  const [weak, fair, good, great] = thresholds;
  const raw = lowerIsBetter
    ? number <= great ? 92 : number <= good ? 76 : number <= fair ? 58 : number <= weak ? 38 : 18
    : number >= great ? 92 : number >= good ? 76 : number >= fair ? 58 : number >= weak ? 38 : 18;
  return raw;
}

function averageScore(values) {
  const usable = values.filter((value) => value !== null && value !== undefined);
  if (!usable.length) return null;
  return Math.round(usable.reduce((sum, value) => sum + value, 0) / usable.length);
}

function scoreLabel(score) {
  if (score === null || score === undefined) return "Insufficient data";
  if (score >= 78) return "Strong";
  if (score >= 62) return "Healthy";
  if (score >= 45) return "Mixed";
  return "Watch";
}

function scoreTone(score) {
  if (score === null || score === undefined) return "neutral";
  if (score >= 62) return "positive";
  if (score >= 45) return "neutral";
  return "caution";
}

function categoryHistory(rows, category) {
  const item = (rows || []).find((row) => row.category === category);
  return item?.history || [];
}

function uniquePeriodsFromHistory(rows, field = "history") {
  return Array.from(new Set((rows || []).flatMap((row) => (row?.[field] || []).map((point) => point.period).filter(Boolean))));
}

function financialPeriodLimit(period) {
  return period === "quarterly" ? QUARTERLY_PERIOD_LIMIT : YEARLY_PERIOD_LIMIT;
}

function limitHistoryRows(rows, period) {
  const limit = financialPeriodLimit(period);
  return (rows || []).map((row) => ({
    ...row,
    history: (row.history || []).slice(0, limit),
  }));
}

function limitPeriods(items, period) {
  return (items || []).slice(-financialPeriodLimit(period));
}

function periodListLabel(periods) {
  if (!periods.length) return "No periods available";
  if (periods.length <= 6) return periods.join(", ");
  return `${periods.slice(0, 3).join(", ")} ... ${periods.slice(-2).join(", ")}`;
}

function combineHistories(rows, series, period = "yearly") {
  const periods = new Map();
  const limitedRows = limitHistoryRows(rows, period);
  series.forEach(({ key, category }) => {
    categoryHistory(limitedRows, category).forEach((point) => {
      const current = periods.get(point.period) || { period: point.period };
      current[key] = Number(point.value) || 0;
      periods.set(point.period, current);
    });
  });
  return Array.from(periods.values()).reverse();
}

function balanceChartData(balanceSheet, period = "yearly") {
  return limitPeriods([...(balanceSheet?.history || [])].reverse(), period).map((row) => ({
    period: row.period,
    assets: Number(row.total_asset) || 0,
    liabilities: Number(row.total_liability) || 0,
  }));
}

function shareholdingChartData(shareholding, period = "yearly") {
  const labels = {
    promoters: "Promoters",
    fii: "FII",
    other_dii: "Other DII",
    mutual_funds: "Mutual Funds",
    retail_and_other: "Retail/Others",
  };
  const periods = new Map();
  (shareholding || []).forEach((row) => {
    (row.history || []).forEach((point) => {
      const current = periods.get(point.period) || { period: point.period };
      current[labels[row.category] || row.label || row.category] = Number(point.value) || 0;
      periods.set(point.period, current);
    });
  });
  return limitPeriods(Array.from(periods.values()).reverse(), period);
}

function latestHistory(rows) {
  return (rows || []).map((row) => ({
    ...row,
    latest: row.history?.[0],
  }));
}

function percentValue(value) {
  const number = numericValue(value);
  return number === null ? null : `${compactNumber(number)}%`;
}

function percentText(value) {
  const number = numericValue(value);
  return number === null ? "N/A" : `${compactNumber(number)}%`;
}

function latestPoint(rows, category) {
  return categoryHistory(rows, category)[0];
}

function oldestPoint(rows, category) {
  const history = categoryHistory(rows, category);
  return history[history.length - 1];
}

function pointValue(point) {
  return numericValue(point?.value);
}

function safeRatio(numerator, denominator, multiplier = 100) {
  const top = numericValue(numerator);
  const bottom = numericValue(denominator);
  if (top === null || bottom === null || bottom === 0) return null;
  return (top / bottom) * multiplier;
}

function latestPricePoint(history) {
  const rows = priceChartData(history || [], "daily");
  return rows[rows.length - 1] || null;
}

function priceReturn(history, sessions) {
  const rows = priceChartData(history || [], "daily");
  if (rows.length <= sessions) return null;
  const latest = rows[rows.length - 1];
  const previous = rows[Math.max(0, rows.length - 1 - sessions)];
  return safeRatio(Number(latest?.price) - Number(previous?.price), previous?.price);
}

function parseActionDate(action) {
  const value = action?.ex_date || action?.record_date || action?.announcement_date || action?.date;
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dividendReturn(actions, price, months = 12, endDate) {
  const latestPrice = numericValue(price);
  if (!latestPrice) return null;
  const latestDate = endDate ? parsePriceDate(endDate) : null;
  const cutoff = latestDate || new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const dividendTotal = (actions || []).reduce((sum, action) => {
    if (!normalizeMetricName(action.action_type || action.type).includes("dividend")) return sum;
    const date = parseActionDate(action);
    if (date && date < cutoff) return sum;
    return sum + (numericValue(action.amount) || 0);
  }, 0);
  return dividendTotal ? (dividendTotal / latestPrice) * 100 : 0;
}

function averageHistoryValue(history, count = 4) {
  const values = (history || []).slice(0, count).map((point) => pointValue(point)).filter((value) => value !== null);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function marginSeries(numeratorHistory, denominatorHistory) {
  const denominatorByPeriod = new Map((denominatorHistory || []).map((point) => [point.period, pointValue(point)]));
  return (numeratorHistory || []).map((point) => {
    const numerator = pointValue(point);
    const denominator = denominatorByPeriod.get(point.period);
    return {
      period: point.period,
      value: numerator !== null && denominator ? (numerator / denominator) * 100 : null,
    };
  }).filter((point) => point.value !== null);
}

function averageRatioFromHistories(numeratorHistory, denominatorHistory, count = 5, multiplier = 1) {
  const denominatorByPeriod = new Map((denominatorHistory || []).map((point) => [point.period, pointValue(point)]));
  const values = (numeratorHistory || []).slice(0, count).map((point) => {
    const denominator = denominatorByPeriod.get(point.period);
    return denominator ? (pointValue(point) / denominator) * multiplier : null;
  }).filter((value) => value !== null && Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function latestVsAverage(history, averageCount = 4) {
  const latest = pointValue(history?.[0]);
  const average = averageHistoryValue(history, averageCount);
  if (latest === null || average === null) return null;
  return latest - average;
}

function cagrPercent(latest, oldest, periods) {
  const latestValue = numericValue(latest);
  const oldestValue = numericValue(oldest);
  if (!latestValue || !oldestValue || latestValue <= 0 || oldestValue <= 0 || periods <= 0) return null;
  return ((latestValue / oldestValue) ** (1 / periods) - 1) * 100;
}

function spreadText(companyValue, sectorValue, unit = "") {
  const company = numericValue(companyValue);
  const sector = numericValue(sectorValue);
  if (company === null || sector === null) return null;
  const spread = company - sector;
  const formatted = `${spread >= 0 ? "+" : ""}${compactNumber(spread)}${unit}`;
  return `${formatted} vs sector`;
}

function insightTone(value, direction = "higher") {
  if (value === null || value === undefined) return "neutral";
  if (direction === "lower") return value <= 0 ? "positive" : "caution";
  return value >= 0 ? "positive" : "caution";
}

function comparisonTone(companyValue, sectorValue, direction = "higher") {
  const company = numericValue(companyValue);
  const sector = numericValue(sectorValue);
  if (company === null || sector === null) return "neutral";
  return insightTone(company - sector, direction);
}

function buildResearchReport(data) {
  if (!data) return null;
  const incomeRows = data.incomeStatement?.income_statement || [];
  const cashRows = data.cashFlow?.cash_flow || [];
  const revenueHistory = categoryHistory(incomeRows, "revenue");
  const profitHistory = categoryHistory(incomeRows, "net_profit");
  const operatingHistory = categoryHistory(incomeRows, "operating_profit");
  const cfoHistory = categoryHistory(cashRows, "operating");
  const latestBalance = data.balanceSheet?.history?.[0];
  const latestRevenue = revenueHistory[0];
  const latestProfit = profitHistory[0];
  const latestOperating = operatingHistory[0];
  const latestCfo = cfoHistory[0];
  const salesCagr = cagrPercent(latestRevenue?.value, revenueHistory[revenueHistory.length - 1]?.value, Math.max(1, revenueHistory.length - 1));
  const profitCagr = cagrPercent(latestProfit?.value, profitHistory[profitHistory.length - 1]?.value, Math.max(1, profitHistory.length - 1));
  const opm = numericValue(latestRevenue?.value) ? (numericValue(latestOperating?.value) / numericValue(latestRevenue?.value)) * 100 : null;
  const npm = numericValue(latestRevenue?.value) ? (numericValue(latestProfit?.value) / numericValue(latestRevenue?.value)) * 100 : null;
  const cashConversion = numericValue(latestProfit?.value) ? (numericValue(latestCfo?.value) / numericValue(latestProfit?.value)) * 100 : null;
  const liabilityRatio = numericValue(latestBalance?.total_asset) ? (numericValue(latestBalance?.total_liability) / numericValue(latestBalance?.total_asset)) * 100 : null;
  const roe = ratioByAnyName(data.ratios, ["ROE", "Return On Equity", "ReturnOnEquity"]);
  const roce = ratioByAnyName(data.ratios, ["ROCE", "Return On Capital", "ReturnOnCapital"]);
  const netMargin = ratioByAnyName(data.ratios, ["Net Margin", "NetMargin"]);
  const assetTurnover = ratioByAnyName(data.ratios, ["Asset Turnover", "AssetTurnover"]);
  const priceData = priceChartData(data.priceHistory || [], "daily");
  const latestPrice = priceData[priceData.length - 1];
  const priceReturn1y = priceData.length > 240 && latestPrice?.price
    ? ((latestPrice.price - priceData[Math.max(0, priceData.length - 252)].price) / priceData[Math.max(0, priceData.length - 252)].price) * 100
    : null;

  const dimensions = [
    {
      name: "Quality",
      score: averageScore([
        scoreFromThresholds(roe?.company_value, [6, 10, 14, 18]),
        scoreFromThresholds(roce?.company_value, [7, 12, 16, 22]),
        scoreFromThresholds(cashConversion, [40, 70, 95, 120]),
      ]),
      metrics: [
        ["ROE", percentText(roe?.company_value)],
        ["ROCE", percentText(roce?.company_value)],
        ["CFO / PAT", percentText(cashConversion)],
      ],
    },
    {
      name: "Growth",
      score: averageScore([
        scoreFromThresholds(salesCagr, [2, 6, 10, 16]),
        scoreFromThresholds(profitCagr, [2, 8, 14, 22]),
        scoreFromThresholds(latestRevenue?.change, [0, 5, 10, 18]),
      ]),
      metrics: [
        ["Sales CAGR", percentText(salesCagr)],
        ["Profit CAGR", percentText(profitCagr)],
        ["Latest sales growth", percentText(latestRevenue?.change)],
      ],
    },
    {
      name: "Profitability",
      score: averageScore([
        scoreFromThresholds(opm, [6, 10, 15, 22]),
        scoreFromThresholds(npm || netMargin?.company_value, [4, 7, 10, 16]),
        scoreFromThresholds(assetTurnover?.company_value, [0.3, 0.6, 0.9, 1.3]),
      ]),
      metrics: [
        ["OPM", percentText(opm)],
        ["Net margin", percentText(npm || netMargin?.company_value)],
        ["Asset turnover", compactNumber(assetTurnover?.company_value)],
      ],
    },
    {
      name: "Balance Sheet",
      score: averageScore([
        scoreFromThresholds(liabilityRatio, [80, 65, 50, 35], true),
        scoreFromThresholds(cashConversion, [40, 70, 95, 120]),
      ]),
      metrics: [
        ["Liabilities / assets", percentText(liabilityRatio)],
        ["Total assets", valueWithUnit(latestBalance?.total_asset, data.balanceSheet?.units_in)],
        ["Operating cash flow", valueWithUnit(latestCfo?.value, data.cashFlow?.units_in)],
      ],
    },
    {
      name: "Technical",
      score: averageScore([
        latestPrice?.ema50 ? scoreFromThresholds(((latestPrice.price - latestPrice.ema50) / latestPrice.ema50) * 100, [-8, -2, 2, 8]) : null,
        latestPrice?.ema200 ? scoreFromThresholds(((latestPrice.price - latestPrice.ema200) / latestPrice.ema200) * 100, [-12, -3, 3, 12]) : null,
        latestPrice?.rsi ? scoreFromThresholds(latestPrice.rsi, [35, 45, 55, 65]) : null,
      ]),
      metrics: [
        ["1Y price return", percentText(priceReturn1y)],
        ["RSI 14", compactNumber(latestPrice?.rsi)],
        ["Vs 200 DMA", latestPrice?.ema200 ? percentText(((latestPrice.price - latestPrice.ema200) / latestPrice.ema200) * 100) : "N/A"],
      ],
    },
  ];

  const overall = averageScore(dimensions.map((item) => item.score));
  const facts = [
    { label: "Latest Revenue", value: valueWithUnit(latestRevenue?.value, data.incomeStatement?.units_in), meta: latestRevenue?.period },
    { label: "Latest PAT", value: valueWithUnit(latestProfit?.value, data.incomeStatement?.units_in), meta: latestProfit?.period },
    { label: "OPM", value: percentText(opm), meta: latestOperating?.period },
    { label: "CFO / PAT", value: percentText(cashConversion), meta: latestCfo?.period },
    { label: "Total Assets", value: valueWithUnit(latestBalance?.total_asset, data.balanceSheet?.units_in), meta: latestBalance?.period },
    { label: "Peers", value: compactNumber(data.competitors?.length || 0), meta: "Comparable set" },
  ];

  const narrative = [
    salesCagr !== null ? `Sales compounded at ${percentText(salesCagr)} across the available history.` : null,
    profitCagr !== null ? `Profit compounded at ${percentText(profitCagr)}, with latest PAT growth at ${percentText(latestProfit?.change)}.` : null,
    cashConversion !== null ? `Cash conversion is ${percentText(cashConversion)}, which is ${cashConversion >= 90 ? "supportive of earnings quality" : "a point to monitor against reported profits"}.` : null,
    liabilityRatio !== null ? `Liabilities stand at ${percentText(liabilityRatio)} of assets, giving a quick balance-sheet risk marker.` : null,
  ].filter(Boolean);

  return { overall, dimensions, facts, narrative };
}

function metricTone(value, goodDirection = "higher", neutralBand = 0) {
  const number = numericValue(value);
  if (number === null) return "neutral";
  if (Math.abs(number) <= neutralBand) return "neutral";
  return goodDirection === "lower"
    ? number < 0 ? "positive" : "caution"
    : number > 0 ? "positive" : "caution";
}

function metricDisplay(value, type = "percent", unit) {
  if (type === "money") return valueWithUnit(value, unit);
  if (type === "number") return compactNumber(value);
  if (type === "currency") return value === null || value === undefined ? "N/A" : `Rs. ${compactNumber(value)}`;
  return percentText(value);
}

function buildDerivedMetricGroups(data) {
  if (!data) return [];
  const incomeRows = data.incomeStatement?.income_statement || [];
  const cashRows = data.cashFlow?.cash_flow || [];
  const revenueHistory = categoryHistory(incomeRows, "revenue");
  const profitHistory = categoryHistory(incomeRows, "net_profit");
  const operatingHistory = categoryHistory(incomeRows, "operating_profit");
  const expensesHistory = categoryHistory(incomeRows, "expenses");
  const taxHistory = categoryHistory(incomeRows, "tax_expense");
  const cfoHistory = categoryHistory(cashRows, "operating");
  const investingHistory = categoryHistory(cashRows, "investing");
  const financingHistory = categoryHistory(cashRows, "financing");
  const latestRevenue = revenueHistory[0];
  const previousRevenue = revenueHistory[1];
  const latestProfit = profitHistory[0];
  const previousProfit = profitHistory[1];
  const latestOperating = operatingHistory[0];
  const latestExpenses = expensesHistory[0];
  const latestTax = taxHistory[0];
  const latestCfo = cfoHistory[0];
  const latestInvesting = investingHistory[0];
  const latestFinancing = financingHistory[0];
  const latestBalance = data.balanceSheet?.history?.[0];
  const previousBalance = data.balanceSheet?.history?.[1];
  const pricePoint = latestPricePoint(data.priceHistory);
  const opmHistory = marginSeries(operatingHistory, revenueHistory);
  const npmHistory = marginSeries(profitHistory, revenueHistory);
  const roe = ratioByAnyName(data.ratios, ["ROE", "Return On Equity", "ReturnOnEquity"]);
  const roce = ratioByAnyName(data.ratios, ["ROCE", "Return On Capital", "ReturnOnCapital"]);
  const pe = ratioByAnyName(data.ratios, ["P/E", "PE", "Price Earnings", "PriceEarnings"]);
  const pb = ratioByAnyName(data.ratios, ["P/B", "PB", "Price Book", "PriceBook"]);
  const currentRatio = ratioByAnyName(data.ratios, ["Current Ratio", "CurrentRatio"]);
  const quickRatio = ratioByAnyName(data.ratios, ["Quick Ratio", "QuickRatio"]);
  const debtEquity = ratioByAnyName(data.ratios, ["Total Debt To Equity", "Debt Equity", "DebtToEquity"]);
  const interestCoverage = ratioByAnyName(data.ratios, ["Interest Coverage", "InterestCoverage"]);
  const latestRevenueValue = pointValue(latestRevenue);
  const previousRevenueValue = pointValue(previousRevenue);
  const latestProfitValue = pointValue(latestProfit);
  const previousProfitValue = pointValue(previousProfit);
  const latestCfoValue = pointValue(latestCfo);
  const salesCagr = cagrPercent(latestRevenue?.value, revenueHistory[revenueHistory.length - 1]?.value, Math.max(1, revenueHistory.length - 1));
  const profitCagr = cagrPercent(latestProfit?.value, profitHistory[profitHistory.length - 1]?.value, Math.max(1, profitHistory.length - 1));
  const revenueAcceleration = previousRevenue?.change === null || previousRevenue?.change === undefined ? null : numericValue(latestRevenue?.change) - numericValue(previousRevenue?.change);
  const profitAcceleration = previousProfit?.change === null || previousProfit?.change === undefined ? null : numericValue(latestProfit?.change) - numericValue(previousProfit?.change);
  const operatingMargin = safeRatio(latestOperating?.value, latestRevenue?.value);
  const netMargin = safeRatio(latestProfit?.value, latestRevenue?.value);
  const expenseRatio = safeRatio(latestExpenses?.value, latestRevenue?.value);
  const taxRate = safeRatio(latestTax?.value, latestProfit?.value);
  const cfoToPat = safeRatio(latestCfo?.value, latestProfit?.value);
  const freeCashFlow = latestCfoValue !== null && pointValue(latestInvesting) !== null ? latestCfoValue + pointValue(latestInvesting) : null;
  const fcfToPat = safeRatio(freeCashFlow, latestProfit?.value);
  const financingToCfo = safeRatio(latestFinancing?.value, latestCfo?.value);
  const assetGrowth = safeRatio(numericValue(latestBalance?.total_asset) - numericValue(previousBalance?.total_asset), previousBalance?.total_asset);
  const liabilityGrowth = safeRatio(numericValue(latestBalance?.total_liability) - numericValue(previousBalance?.total_liability), previousBalance?.total_liability);
  const liabilityAssetRatio = safeRatio(latestBalance?.total_liability, latestBalance?.total_asset);
  const priceVsEma50 = pricePoint?.ema50 ? safeRatio(pricePoint.price - pricePoint.ema50, pricePoint.ema50) : null;
  const priceVsEma200 = pricePoint?.ema200 ? safeRatio(pricePoint.price - pricePoint.ema200, pricePoint.ema200) : null;

  return [
    {
      title: "Growth Momentum",
      subtitle: "How sales and earnings are moving versus prior periods.",
      metrics: [
        { label: "Sales CAGR", value: salesCagr, detail: `${revenueHistory[revenueHistory.length - 1]?.period || "Oldest"} to ${latestRevenue?.period || "latest"}`, tone: metricTone(salesCagr), type: "percent" },
        { label: "Profit CAGR", value: profitCagr, detail: `${profitHistory[profitHistory.length - 1]?.period || "Oldest"} to ${latestProfit?.period || "latest"}`, tone: metricTone(profitCagr), type: "percent" },
        { label: "Latest Sales Growth", value: latestRevenue?.change, detail: latestRevenue?.period, tone: metricTone(latestRevenue?.change), type: "percent" },
        { label: "Sales Acceleration", value: revenueAcceleration, detail: "Latest growth minus previous growth", tone: metricTone(revenueAcceleration), type: "percent" },
        { label: "Profit Acceleration", value: profitAcceleration, detail: "Latest PAT growth minus previous growth", tone: metricTone(profitAcceleration), type: "percent" },
        { label: "Revenue Delta", value: latestRevenueValue !== null && previousRevenueValue !== null ? latestRevenueValue - previousRevenueValue : null, detail: `${previousRevenue?.period || "Previous"} to ${latestRevenue?.period || "latest"}`, tone: metricTone(latestRevenueValue - previousRevenueValue), type: "money", unit: data.incomeStatement?.units_in },
      ],
    },
    {
      title: "Profitability",
      subtitle: "Margins, return ratios and operating leverage.",
      metrics: [
        { label: "Operating Margin", value: operatingMargin, detail: latestOperating?.period, tone: metricTone(operatingMargin), type: "percent" },
        { label: "Net Margin", value: netMargin, detail: latestProfit?.period, tone: metricTone(netMargin), type: "percent" },
        { label: "OPM vs 4P Avg", value: latestVsAverage(opmHistory), detail: "Latest margin less trailing average", tone: metricTone(latestVsAverage(opmHistory)), type: "percent" },
        { label: "NPM vs 4P Avg", value: latestVsAverage(npmHistory), detail: "Latest margin less trailing average", tone: metricTone(latestVsAverage(npmHistory)), type: "percent" },
        { label: "Expense Ratio", value: expenseRatio, detail: "Expenses / revenue", tone: metricTone(expenseRatio - 80, "lower"), type: "percent" },
        { label: "Tax / PAT", value: taxRate, detail: "Tax expense / net profit", tone: "neutral", type: "percent" },
        { label: "ROE", value: roe?.company_value, detail: spreadText(roe?.company_value, roe?.sector_value, "%"), tone: comparisonTone(roe?.company_value, roe?.sector_value), type: "percent" },
        { label: "ROCE", value: roce?.company_value, detail: spreadText(roce?.company_value, roce?.sector_value, "%"), tone: comparisonTone(roce?.company_value, roce?.sector_value), type: "percent" },
      ],
    },
    {
      title: "Cash Quality",
      subtitle: "Checks whether reported profit is supported by cash flow.",
      metrics: [
        { label: "CFO / PAT", value: cfoToPat, detail: latestCfo?.period, tone: metricTone(cfoToPat - 100), type: "percent" },
        { label: "Free Cash Flow", value: freeCashFlow, detail: "Operating cash flow + investing cash flow", tone: metricTone(freeCashFlow), type: "money", unit: data.cashFlow?.units_in },
        { label: "FCF / PAT", value: fcfToPat, detail: "Free cash flow / net profit", tone: metricTone(fcfToPat - 70), type: "percent" },
        { label: "Financing / CFO", value: financingToCfo, detail: "Financing cash flow / operating cash flow", tone: metricTone(Math.abs(numericValue(financingToCfo) || 0) - 75, "lower"), type: "percent" },
      ],
    },
    {
      title: "Balance Sheet",
      subtitle: "Scale, leverage and short-term solvency markers.",
      metrics: [
        { label: "Assets Growth", value: assetGrowth, detail: `${previousBalance?.period || "Previous"} to ${latestBalance?.period || "latest"}`, tone: metricTone(assetGrowth), type: "percent" },
        { label: "Liability Growth", value: liabilityGrowth, detail: `${previousBalance?.period || "Previous"} to ${latestBalance?.period || "latest"}`, tone: metricTone(liabilityGrowth, "lower"), type: "percent" },
        { label: "Liabilities / Assets", value: liabilityAssetRatio, detail: latestBalance?.period, tone: metricTone(liabilityAssetRatio - 60, "lower"), type: "percent" },
        { label: "Current Ratio", value: currentRatio?.company_value, detail: "Latest ratio", tone: metricTone(numericValue(currentRatio?.company_value) - 1), type: "number" },
        { label: "Quick Ratio", value: quickRatio?.company_value, detail: "Latest ratio", tone: metricTone(numericValue(quickRatio?.company_value) - 1), type: "number" },
        { label: "Debt / Equity", value: debtEquity?.company_value, detail: "Lower is usually cleaner", tone: metricTone(numericValue(debtEquity?.company_value) - 1, "lower"), type: "number" },
        { label: "Interest Coverage", value: interestCoverage?.company_value, detail: "Higher means more cushion", tone: metricTone(numericValue(interestCoverage?.company_value) - 3), type: "number" },
      ],
    },
    {
      title: "Valuation & Technical",
      subtitle: "Market multiples and price-position context.",
      metrics: [
        { label: "P/E", value: pe?.company_value, detail: spreadText(pe?.company_value, pe?.sector_value), tone: comparisonTone(pe?.company_value, pe?.sector_value, "lower"), type: "number" },
        { label: "P/B", value: pb?.company_value, detail: spreadText(pb?.company_value, pb?.sector_value), tone: comparisonTone(pb?.company_value, pb?.sector_value, "lower"), type: "number" },
        { label: "1M Return", value: priceReturn(data.priceHistory, 21), detail: "Approx trading sessions", tone: metricTone(priceReturn(data.priceHistory, 21)), type: "percent" },
        { label: "6M Return", value: priceReturn(data.priceHistory, 126), detail: "Approx trading sessions", tone: metricTone(priceReturn(data.priceHistory, 126)), type: "percent" },
        { label: "1Y Return", value: priceReturn(data.priceHistory, 252), detail: "Approx trading sessions", tone: metricTone(priceReturn(data.priceHistory, 252)), type: "percent" },
        { label: "Price vs 50 DMA", value: priceVsEma50, detail: "Latest close vs EMA 50", tone: metricTone(priceVsEma50), type: "percent" },
        { label: "Price vs 200 DMA", value: priceVsEma200, detail: "Latest close vs EMA 200", tone: metricTone(priceVsEma200), type: "percent" },
        { label: "RSI 14", value: pricePoint?.rsi, detail: "Momentum oscillator", tone: pricePoint?.rsi > 70 ? "caution" : pricePoint?.rsi < 35 ? "neutral" : "positive", type: "number" },
      ],
    },
  ];
}

function buildMarketMetricsSnapshot(data) {
  if (!data) return null;
  const annualData = data.annualData || data;
  const incomeRows = data.incomeStatement?.income_statement || [];
  const annualIncomeRows = annualData.incomeStatement?.income_statement || incomeRows;
  const cashRows = data.cashFlow?.cash_flow || [];
  const annualCashRows = annualData.cashFlow?.cash_flow || cashRows;
  const price = data.quote?.price || data.quote?.lastPrice;
  const revenue = latestPoint(incomeRows, "revenue");
  const netProfit = latestPoint(incomeRows, "net_profit");
  const operatingProfit = latestPoint(incomeRows, "operating_profit");
  const interest = latestPoint(incomeRows, "interest");
  const exceptionalItems = latestPoint(incomeRows, "exceptional_items");
  const latestBalance = data.balanceSheet?.history?.[0];
  const cfo = latestPoint(cashRows, "operating");
  const annualRevenueHistory = categoryHistory(annualIncomeRows, "revenue");
  const annualOperatingHistory = categoryHistory(annualIncomeRows, "operating_profit");
  const annualInterestHistory = categoryHistory(annualIncomeRows, "interest");
  const annualDebtHistory = categoryHistory(annualData.balanceSheet?.balance_sheet, "borrowings");
  const annualEquityHistory = categoryHistory(annualData.balanceSheet?.balance_sheet, "equity");
  const annualCashHistory = categoryHistory(annualData.balanceSheet?.balance_sheet, "cash_and_cash_equivalents");
  const annualCfoHistory = categoryHistory(annualCashRows, "operating");
  const pe = ratioByAnyName(data.ratios, ["P/E", "PE", "Price Earnings"]);
  const pb = ratioByAnyName(data.ratios, ["P/B", "PB", "Price Book"]);
  const roe = ratioByAnyName(data.ratios, ["ROE", "Return On Equity"]);
  const roce = ratioByAnyName(data.ratios, ["ROCE", "Return On Capital"]);
  const debtEquity = ratioByAnyName(data.ratios, ["Debt / Equity", "Debt Equity", "Total Debt To Equity"]);
  const dividendYield = ratioByAnyName(data.ratios, ["Dividend Yield", "DividendYield"]);
  const evEbit = ratioByAnyName(data.ratios, ["EV/EBIT", "Enterprise Value To EBIT"]);
  const evEbitda = ratioByAnyName(data.ratios, ["EV/EBITDA"]);
  const evSales = ratioByAnyName(data.ratios, ["EV/Sales", "Enterprise Value To Sales"]);
  const taxRate = ratioByAnyName(data.ratios, ["Effective Tax Rate", "Tax Rate"]);
  const latestPrice = latestPricePoint(data.priceHistory);
  const latestDividendReturn = dividendReturn(data.corporateActions, price, 12, latestPrice?.date);
  const promoter = latestPoint(data.shareholding, "promoters");
  const fii = latestPoint(data.shareholding, "fii");
  const otherDii = latestPoint(data.shareholding, "other_dii");
  const mutualFunds = latestPoint(data.shareholding, "mutual_funds");
  const retail = latestPoint(data.shareholding, "retail_and_other");
  const institutionHolding = [fii, otherDii, mutualFunds].reduce((sum, point) => sum + (numericValue(point?.value) || 0), 0);
  const annualRevenue = latestPoint(annualIncomeRows, "revenue");
  const annualOperatingProfit = latestPoint(annualIncomeRows, "operating_profit");
  const annualNetProfit = latestPoint(annualIncomeRows, "net_profit");
  const annualCfo = latestPoint(annualCashRows, "operating");
  const salesCagr = cagrPercent(annualRevenue?.value, oldestPoint(annualIncomeRows, "revenue")?.value, Math.max(1, annualRevenueHistory.length - 1));
  const ebitCagr = cagrPercent(annualOperatingProfit?.value, oldestPoint(annualIncomeRows, "operating_profit")?.value, Math.max(1, annualOperatingHistory.length - 1));
  const opm = safeRatio(operatingProfit?.value, revenue?.value);
  const netMargin = safeRatio(netProfit?.value, revenue?.value);
  const ebitToInterest = averageRatioFromHistories(annualOperatingHistory, annualInterestHistory, 5, 1);
  const cfoToProfit = safeRatio(annualCfo?.value, annualNetProfit?.value);
  const netDebtToEquity = averageRatioFromHistories(
    annualDebtHistory.map((point) => {
      const cashPoint = annualCashHistory.find((item) => item.period === point.period);
      return { ...point, value: (pointValue(point) || 0) - (pointValue(cashPoint) || 0) };
    }),
    annualEquityHistory,
    5,
    1,
  );
  const dividendPayout = safeRatio(dividendYield?.company_value, pe?.company_value, 100);
  const totalReturnRows = [
    ["3 Months", 63],
    ["6 Months", 126],
    ["1 Year", 252],
    ["2 Years", 504],
    ["3 Years", 756],
    ["4 Years", 1008],
    ["5 Years", 1260],
  ].map(([label, sessions]) => {
    const priceRet = priceReturn(data.priceHistory, sessions);
    const divRet = dividendReturn(data.corporateActions, price, Math.round(sessions / 21), latestPrice?.date);
    return {
      label,
      priceReturn: priceRet,
      dividendReturn: divRet,
      totalReturn: priceRet !== null || divRet !== null ? (priceRet || 0) + (divRet || 0) : null,
    };
  });

  return {
    stockDna: [
      ["Industry", data.profile?.industry || data.profile?.sector],
      ["Market cap", data.profile?.marketCap ? `Rs. ${compactNumber(data.profile.marketCap)} Cr` : null],
      ["P/E", compactNumber(pe?.company_value)],
      ["Industry P/E", compactNumber(pe?.sector_value)],
      ["Dividend Yield", percentText(dividendYield?.company_value ?? latestDividendReturn)],
      ["Debt Equity", compactNumber(debtEquity?.company_value)],
      ["Return on Equity", percentText(roe?.company_value)],
      ["Price to Book", compactNumber(pb?.company_value)],
      ["Net Sales", valueWithUnit(revenue?.value, data.incomeStatement?.units_in)],
      ["Net Profit", valueWithUnit(netProfit?.value, data.incomeStatement?.units_in)],
    ].filter(([, value]) => value && value !== "N/A"),
    returns: totalReturnRows,
    quality: [
      ["Sales Growth (5Y)", percentText(salesCagr)],
      ["EBIT Growth (5Y)", percentText(ebitCagr)],
      ["EBIT to Interest", compactNumber(ebitToInterest)],
      ["Net Debt to Equity", compactNumber(netDebtToEquity ?? debtEquity?.company_value)],
      ["Tax Ratio", percentText(taxRate?.company_value)],
      ["Dividend Payout", percentText(dividendPayout)],
      ["Institutional Holding", percentText(institutionHolding)],
      ["ROCE", percentText(roce?.company_value)],
      ["ROE", percentText(roe?.company_value)],
      ["CFO / PAT", percentText(cfoToProfit)],
    ],
    valuation: [
      ["P/E Ratio", compactNumber(pe?.company_value)],
      ["Industry P/E", compactNumber(pe?.sector_value)],
      ["Price to Book Value", compactNumber(pb?.company_value)],
      ["EV to EBIT", compactNumber(evEbit?.company_value)],
      ["EV to EBITDA", compactNumber(evEbitda?.company_value)],
      ["EV to Sales", compactNumber(evSales?.company_value)],
      ["Dividend Yield", percentText(dividendYield?.company_value ?? latestDividendReturn)],
      ["ROCE (Latest)", percentText(roce?.company_value)],
      ["ROE (Latest)", percentText(roe?.company_value)],
    ],
    technicals: [
      ["RSI", compactNumber(latestPrice?.rsi)],
      ["Price vs 50 DMA", latestPrice?.ema50 ? percentText(safeRatio(latestPrice.price - latestPrice.ema50, latestPrice.ema50)) : "N/A"],
      ["Price vs 200 DMA", latestPrice?.ema200 ? percentText(safeRatio(latestPrice.price - latestPrice.ema200, latestPrice.ema200)) : "N/A"],
      ["1M Price Return", percentText(priceReturn(data.priceHistory, 21))],
      ["6M Price Return", percentText(priceReturn(data.priceHistory, 126))],
      ["1Y Price Return", percentText(priceReturn(data.priceHistory, 252))],
    ],
    shareholding: [
      ["Promoters", percentText(promoter?.value)],
      ["FII", percentText(fii?.value)],
      ["DII + MF", percentText((numericValue(otherDii?.value) || 0) + (numericValue(mutualFunds?.value) || 0))],
      ["Retail/Others", percentText(retail?.value)],
      ["Period", displayPeriodLabel(promoter?.period || fii?.period || "")],
    ],
    financialSnapshot: [
      ["Net Sales", valueWithUnit(revenue?.value, data.incomeStatement?.units_in), percentText(revenue?.change)],
      ["Operating Profit", valueWithUnit(operatingProfit?.value, data.incomeStatement?.units_in), percentText(operatingProfit?.change)],
      ["Interest", valueWithUnit(interest?.value, data.incomeStatement?.units_in), percentText(interest?.change)],
      ["Exceptional Items", valueWithUnit(exceptionalItems?.value, data.incomeStatement?.units_in), percentText(exceptionalItems?.change)],
      ["OPM", percentText(opm), "-"],
      ["Net Margin", percentText(netMargin), "-"],
      ["Operating Cash Flow", valueWithUnit(cfo?.value, data.cashFlow?.units_in), percentText(cfo?.change)],
      ["Total Assets", valueWithUnit(latestBalance?.total_asset, data.balanceSheet?.units_in), "-"],
      ["Net Profit", valueWithUnit(netProfit?.value, data.incomeStatement?.units_in), percentText(netProfit?.change)],
    ],
  };
}

function buildInvestorInsights(data) {
  if (!data) return [];
  const incomeRows = data.incomeStatement?.income_statement || [];
  const cashRows = data.cashFlow?.cash_flow || [];
  const revenueLatest = latestPoint(incomeRows, "revenue");
  const revenueOldest = oldestPoint(incomeRows, "revenue");
  const profitLatest = latestPoint(incomeRows, "net_profit");
  const profitOldest = oldestPoint(incomeRows, "net_profit");
  const operatingLatest = latestPoint(incomeRows, "operating_profit");
  const cfoLatest = latestPoint(cashRows, "operating");
  const latestBalance = data.balanceSheet?.history?.[0];
  const promoterHistory = categoryHistory(data.shareholding, "promoters");
  const fiiHistory = categoryHistory(data.shareholding, "fii");
  const diiHistory = categoryHistory(data.shareholding, "other_dii");
  const mfHistory = categoryHistory(data.shareholding, "mutual_funds");
  const revenuePeriods = Math.max(1, (categoryHistory(incomeRows, "revenue").length || 1) - 1);
  const profitPeriods = Math.max(1, (categoryHistory(incomeRows, "net_profit").length || 1) - 1);
  const salesCagr = cagrPercent(revenueLatest?.value, revenueOldest?.value, revenuePeriods);
  const profitCagr = cagrPercent(profitLatest?.value, profitOldest?.value, profitPeriods);
  const opm = numericValue(revenueLatest?.value) ? (numericValue(operatingLatest?.value) / numericValue(revenueLatest?.value)) * 100 : null;
  const npm = numericValue(revenueLatest?.value) ? (numericValue(profitLatest?.value) / numericValue(revenueLatest?.value)) * 100 : null;
  const cashConversion = numericValue(profitLatest?.value) ? (numericValue(cfoLatest?.value) / numericValue(profitLatest?.value)) * 100 : null;
  const liabilityRatio = numericValue(latestBalance?.total_asset) ? (numericValue(latestBalance?.total_liability) / numericValue(latestBalance?.total_asset)) * 100 : null;
  const promoterChange = promoterHistory.length > 1 ? numericValue(promoterHistory[0]?.value) - numericValue(promoterHistory[promoterHistory.length - 1]?.value) : null;
  const fiiChange = fiiHistory.length > 1 ? numericValue(fiiHistory[0]?.value) - numericValue(fiiHistory[fiiHistory.length - 1]?.value) : null;
  const diiLatest = (numericValue(diiHistory[0]?.value) || 0) + (numericValue(mfHistory[0]?.value) || 0);
  const diiOldest = (numericValue(diiHistory[diiHistory.length - 1]?.value) || 0) + (numericValue(mfHistory[mfHistory.length - 1]?.value) || 0);
  const diiChange = diiHistory.length || mfHistory.length ? diiLatest - diiOldest : null;
  const pe = ratioByName(data.ratios, "P/E");
  const roe = ratioByName(data.ratios, "ROE");
  const roce = ratioByName(data.ratios, "ROCE");

  return [
    {
      group: "Growth",
      items: [
        { label: "Sales CAGR", value: percentValue(salesCagr), meta: `${revenueOldest?.period || "Oldest"} to ${revenueLatest?.period || "latest"}`, tone: insightTone(salesCagr) },
        { label: "Profit CAGR", value: percentValue(profitCagr), meta: `${profitOldest?.period || "Oldest"} to ${profitLatest?.period || "latest"}`, tone: insightTone(profitCagr) },
        { label: "Latest Sales Growth", value: percentValue(revenueLatest?.change), meta: revenueLatest?.period, tone: insightTone(numericValue(revenueLatest?.change)) },
      ],
    },
    {
      group: "Profitability",
      items: [
        { label: "OPM", value: percentValue(opm), meta: operatingLatest?.period, tone: insightTone(opm) },
        { label: "Net Margin", value: percentValue(npm), meta: profitLatest?.period, tone: insightTone(npm) },
        { label: "ROE", value: percentValue(roe?.company_value), meta: spreadText(roe?.company_value, roe?.sector_value, "%"), tone: comparisonTone(roe?.company_value, roe?.sector_value) },
        { label: "ROCE", value: percentValue(roce?.company_value), meta: spreadText(roce?.company_value, roce?.sector_value, "%"), tone: comparisonTone(roce?.company_value, roce?.sector_value) },
      ],
    },
    {
      group: "Cash & Balance Sheet",
      items: [
        { label: "CFO / Net Profit", value: percentValue(cashConversion), meta: cfoLatest?.period, tone: cashConversion === null ? "neutral" : insightTone(cashConversion - 100) },
        { label: "Liabilities / Assets", value: percentValue(liabilityRatio), meta: latestBalance?.period, tone: liabilityRatio === null ? "neutral" : insightTone(liabilityRatio - 50, "lower") },
        { label: "Total Assets", value: valueWithUnit(latestBalance?.total_asset, data.balanceSheet?.units_in), meta: latestBalance?.period, tone: "neutral" },
      ],
    },
    {
      group: "Ownership & Valuation",
      items: [
        { label: "Promoter Change", value: promoterChange === null ? "N/A" : `${promoterChange >= 0 ? "+" : ""}${compactNumber(promoterChange)}%`, meta: "Available holding history", tone: insightTone(promoterChange) },
        { label: "FII Change", value: fiiChange === null ? "N/A" : `${fiiChange >= 0 ? "+" : ""}${compactNumber(fiiChange)}%`, meta: "Available holding history", tone: insightTone(fiiChange) },
        { label: "DII + MF Change", value: diiChange === null ? "N/A" : `${diiChange >= 0 ? "+" : ""}${compactNumber(diiChange)}%`, meta: "Available holding history", tone: insightTone(diiChange) },
        { label: "P/E vs Sector", value: compactNumber(pe?.company_value), meta: spreadText(pe?.company_value, pe?.sector_value), tone: comparisonTone(pe?.company_value, pe?.sector_value, "lower") },
      ],
    },
  ];
}

function flattenInsights(insights) {
  return insights.flatMap((group) => group.items.map((item) => ({ ...item, group: group.group })));
}

function buildScreeningNotes(insights) {
  const items = flattenInsights(insights).filter((item) => item.value && item.value !== "N/A");
  const strengths = items
    .filter((item) => item.tone === "positive")
    .slice(0, 4)
    .map((item) => `${item.label}: ${item.value}${item.meta ? ` (${item.meta})` : ""}`);
  const watchouts = items
    .filter((item) => item.tone === "caution")
    .slice(0, 4)
    .map((item) => `${item.label}: ${item.value}${item.meta ? ` (${item.meta})` : ""}`);
  return { strengths, watchouts };
}

function toneClasses(tone) {
  if (tone === "positive") return "text-[#8CC8AA]";
  if (tone === "caution") return "text-[#E7A5A6]";
  return "text-[#CBD5E1]";
}

function InvestorInsights({ insights }) {
  const notes = buildScreeningNotes(insights);
  return (
    <DataSection id="insights" title="Insights" subtitle="Screening signals computed from fundamentals, ratios, price and holding history.">
      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <section className="border border-[#75B89B]/20 bg-[#75B89B]/5 p-4">
          <h3 className="text-sm font-medium text-white">Strengths</h3>
          {notes.strengths.length ? (
            <ul className="mt-3 space-y-2 text-sm leading-6 text-[#CBD5E1]">
              {notes.strengths.map((point) => <li key={point}>+ {point}</li>)}
            </ul>
          ) : <p className="mt-3 text-sm text-[#94A3B8]">No positive screening signals in the current dataset.</p>}
        </section>
        <section className="border border-[#C98182]/20 bg-[#C98182]/5 p-4">
          <h3 className="text-sm font-medium text-white">Watchouts</h3>
          {notes.watchouts.length ? (
            <ul className="mt-3 space-y-2 text-sm leading-6 text-[#CBD5E1]">
              {notes.watchouts.map((point) => <li key={point}>- {point}</li>)}
            </ul>
          ) : <p className="mt-3 text-sm text-[#94A3B8]">No caution flags in the current dataset.</p>}
        </section>
      </div>
      <div className="grid gap-px overflow-hidden border border-white/10 bg-white/10 lg:grid-cols-2">
        {insights.map((group) => (
          <section key={group.group} className="bg-[#071326] p-4">
            <h3 className="text-sm font-medium text-white">{group.group}</h3>
            <div className="mt-4 divide-y divide-white/10">
              {group.items.map((item) => (
                <div key={`${group.group}-${item.label}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-3 first:pt-0 last:pb-0">
                  <div>
                    <div className="text-sm text-[#CBD5E1]">{item.label}</div>
                    <div className="mt-1 text-xs text-[#71839A]">{item.meta || "Unavailable"}</div>
                  </div>
                  <div className={`text-right text-sm font-medium ${toneClasses(item.tone)}`}>{item.value || "N/A"}</div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </DataSection>
  );
}

function ResearchReport({ report }) {
  if (!report) return null;
  const tone = scoreTone(report.overall);
  return (
    <DataSection
      id="research-report"
      title="Research Report"
      subtitle="A structured view of financial trends, balance sheet strength, ownership and market context."
    >
      <div className="grid gap-px overflow-hidden border border-[#233650] bg-[#233650] xl:grid-cols-[240px_minmax(0,1fr)]">
        <section className="bg-[#050E1D]/85 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
          <div className="font-mono text-[10px] uppercase tracking-[.16em] text-[#71839A]">Composite Score</div>
              <div className="mt-2 text-sm font-medium text-white">{scoreLabel(report.overall)}</div>
            </div>
            <div className={`text-4xl font-semibold tabular-nums ${toneClasses(tone)}`}>{report.overall ?? "--"}</div>
          </div>
          <div className="mt-5 h-1.5 overflow-hidden bg-white/10">
            <div className={`h-full ${tone === "positive" ? "bg-[#75B89B]" : tone === "caution" ? "bg-[#C98182]" : "bg-[#D4AF37]"}`} style={{ width: `${report.overall || 0}%` }} />
          </div>
          <p className="mt-4 text-xs leading-6 text-[#94A3B8]">
            Composite view of quality, growth, profitability, balance sheet and technical conditions.
          </p>
        </section>

        <div className="grid gap-px bg-[#233650] md:grid-cols-2 xl:grid-cols-5">
          {report.dimensions.map((dimension) => (
            <section key={dimension.name} className="bg-[#071326]/90 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-[.12em] text-[#CBD5E1]">{dimension.name}</h3>
                  <div className="mt-1 text-xs text-[#71839A]">{scoreLabel(dimension.score)}</div>
                </div>
                <div className={`text-xl font-semibold tabular-nums ${toneClasses(scoreTone(dimension.score))}`}>{dimension.score ?? "--"}</div>
              </div>
              <div className="mt-4 space-y-2">
                {dimension.metrics.map(([label, value]) => (
                  <div key={`${dimension.name}-${label}`} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-[#94A3B8]">{label}</span>
                    <span className="text-right text-[#CBD5E1]">{value}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <div className="mt-3 grid gap-px overflow-hidden border border-[#233650] bg-[#233650] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {report.facts.map((fact) => (
          <div key={fact.label} className="bg-[#071326]/90 p-4">
            <div className="font-mono text-[10px] uppercase tracking-[.14em] text-[#71839A]">{fact.label}</div>
            <div className="mt-1 font-mono text-[15px] font-medium tabular-nums text-white">{fact.value}</div>
            <div className="mt-1 text-xs text-[#94A3B8]">{fact.meta || ""}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 border border-[#233650] bg-[#02060D] p-4">
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[.14em] text-[#F5A623]">Report Notes</h3>
        {report.narrative.length ? (
          <ul className="mt-3 grid gap-2 text-sm leading-6 text-[#CBD5E1] lg:grid-cols-2">
            {report.narrative.map((note) => (
              <li key={note} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 bg-[#F5A623]" />
                <span>{note}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-[#94A3B8]">Not enough clean historical data to generate report notes.</p>
        )}
      </div>
    </DataSection>
  );
}

function KeyValuePanel({ title, rows, columns = ["Metric", "Value"] }) {
  const visibleRows = (rows || []).filter((row) => row.slice(1).some((value) => value && value !== "N/A"));
  if (!visibleRows.length) return null;
  return (
    <div className="border border-[#233650] bg-[#02060D]">
      <div className="border-b border-[#233650] px-3 py-2 font-mono text-[10px] uppercase tracking-[.14em] text-[#F5A623]">{title}</div>
      <table className="w-full text-left text-xs">
        <thead className="text-[10px] uppercase tracking-[.12em] text-[#71839A]">
          <tr>
            {columns.map((column) => <th key={column} className="px-3 py-2 font-normal">{column}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#233650]/70">
          {visibleRows.map((row) => (
            <tr key={row.join("-")}>
              {row.map((value, index) => (
                <td key={`${row[0]}-${index}`} className={`px-3 py-2 ${index === 0 ? "text-white" : "font-mono tabular-nums text-[#CBD5E1]"}`}>{value || "N/A"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarketMetricsSection({ snapshot }) {
  if (!snapshot) return null;
  return (
    <DataSection
      id="market-metrics"
      title="Market Metrics"
      subtitle="A compact view of valuation, ownership, quality, technicals and recent returns."
    >
      <div className="grid gap-4 xl:grid-cols-3">
        <KeyValuePanel title="Stock DNA" rows={snapshot.stockDna} />
        <KeyValuePanel title="Shareholding Snapshot" rows={snapshot.shareholding} />
        <KeyValuePanel title="Technicals Key Factors" rows={snapshot.technicals} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <KeyValuePanel title="Quality Key Factors" rows={snapshot.quality} />
        <KeyValuePanel title="Valuation Key Factors" rows={snapshot.valuation} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <KeyValuePanel title="Total Returns" rows={snapshot.returns.map((row) => [row.label, percentText(row.priceReturn), percentText(row.dividendReturn), percentText(row.totalReturn)])} columns={["Period", "Price Return", "Dividend", "Total"]} />
        <KeyValuePanel title="Financial Snapshot" rows={snapshot.financialSnapshot} columns={["Metric", "Latest", "Change"]} />
      </div>
    </DataSection>
  );
}

function DerivedMetricsSection({ groups }) {
  if (!groups?.length) return null;
  return (
    <DataSection
      id="derived-metrics"
      title="Derived Metrics"
      subtitle="Calculated analytics from statements, ratios and price history."
    >
      <div className="grid gap-3">
        {groups.map((group) => (
          <section key={group.title} className="border border-[#233650] bg-[#02060D]">
            <div className="border-b border-[#233650] p-3">
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[.14em] text-[#F5A623]">{group.title}</h3>
              <p className="mt-1 text-xs leading-5 text-[#94A3B8]">{group.subtitle}</p>
            </div>
            <div className="grid gap-px bg-[#233650] sm:grid-cols-2 lg:grid-cols-4">
              {group.metrics.map((metric) => (
                <div key={`${group.title}-${metric.label}`} className="bg-[#030914] p-3">
                  <div className="font-mono text-[10px] uppercase tracking-[.14em] text-[#71839A]">{metric.label}</div>
                  <div className={`mt-1 font-mono text-[15px] font-semibold tabular-nums ${toneClasses(metric.tone)}`}>
                    {metricDisplay(metric.value, metric.type, metric.unit)}
                  </div>
                  <div className="mt-1 min-h-5 text-xs leading-5 text-[#94A3B8]">{metric.detail || "Unavailable"}</div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </DataSection>
  );
}

function PriceVolumeChart({ data, symbol }) {
  const [priceRange, setPriceRange] = useState("1y");
  const [priceInterval, setPriceInterval] = useState("daily");
  const [indicators, setIndicators] = useState({
    volume: true,
    ema20: false,
    ema50: true,
    ema200: false,
    rsi: false,
    bollinger: false,
    pivots: false,
  });
  const chartData = useMemo(() => priceChartData(data, priceInterval), [data, priceInterval]);
  const visibleChartData = useMemo(() => filterPriceRange(chartData, priceRange), [chartData, priceRange]);
  const sampledTicks = useMemo(() => {
    if (visibleChartData.length <= 6) return visibleChartData.map((row) => row.date);
    const step = Math.max(1, Math.floor(visibleChartData.length / 5));
    return visibleChartData.filter((_, index) => index % step === 0).map((row) => row.date);
  }, [visibleChartData]);
  const toggleIndicator = (key) => {
    setIndicators((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <DataSection
      id="price-chart"
      title="Price Chart"
      subtitle={chartData.length ? `${symbol || "Stock"} price and traded volume from historical market data.` : "Historical candles are not available for this stock."}
    >
      <div className="mb-4 space-y-2">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {PRICE_RANGES.map((range) => (
              <button
                key={range.id}
                type="button"
                onClick={() => setPriceRange(range.id)}
                className={`h-7 border px-2.5 font-mono text-[11px] font-medium uppercase tracking-[.08em] transition-colors ${priceRange === range.id ? "border-[#F5A623]/70 bg-[#F5A623]/15 text-[#F5A623]" : "border-[#233650] text-[#7F90A8] hover:border-[#40546E] hover:bg-white/[.04] hover:text-white"}`}
              >
                {range.label}
              </button>
            ))}
          </div>
          <div className="flex border border-[#233650] bg-[#02060D] text-xs">
            {PRICE_INTERVALS.map((interval) => (
              <button
                key={interval.id}
                type="button"
                onClick={() => setPriceInterval(interval.id)}
                className={`border-l border-[#233650] px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[.08em] first:border-l-0 ${priceInterval === interval.id ? "bg-[#75B89B]/15 text-[#8CC8AA]" : "text-[#7F90A8] hover:bg-white/[.04] hover:text-white"}`}
              >
                {interval.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-[#233650] pt-2 font-mono text-[11px] uppercase tracking-[.06em] text-[#CBD5E1]">
          {[
            ["volume", "Volume"],
            ["ema20", "EMA 20"],
            ["ema50", "EMA 50"],
            ["ema200", "EMA 200"],
            ["rsi", "RSI"],
            ["bollinger", "Bollinger Bands"],
            ["pivots", "Pivot Points"],
          ].map(([key, label]) => (
            <label key={key} className="inline-flex items-center gap-2">
              <input type="checkbox" checked={indicators[key]} onChange={() => toggleIndicator(key)} className="h-4 w-4 accent-[#F5A623]" />
              {label}
            </label>
          ))}
        </div>
      </div>
      {visibleChartData.length ? (
        <div className="h-[300px] min-w-0 sm:h-[390px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={visibleChartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(148,163,184,0.16)" vertical={false} />
              <XAxis
                dataKey="date"
                ticks={sampledTicks}
                tickFormatter={(value) => new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" })}
                stroke="#94A3B8"
                fontSize={10}
                axisLine={false}
                tickLine={false}
              />
              <YAxis yAxisId="price" stroke="#94A3B8" fontSize={10} width={42} axisLine={false} tickLine={false} tickFormatter={(value) => compactNumber(value, { compact: true })} />
              <YAxis yAxisId="volume" orientation="right" hide domain={[0, "dataMax"]} />
              <YAxis yAxisId="rsi" orientation="right" hide domain={[0, 100]} />
              <Tooltip content={<PriceTooltip />} />
              {indicators.volume ? <Bar yAxisId="volume" dataKey="volume" name="Volume" fill="rgba(122,167,232,0.24)" radius={[2, 2, 0, 0]} /> : null}
              <Line yAxisId="price" type="monotone" dataKey="price" name="Price" stroke="#F5A623" strokeWidth={2} dot={false} />
              {indicators.ema20 ? <Line yAxisId="price" type="monotone" dataKey="ema20" name="EMA 20" stroke="#E7C56B" strokeWidth={1.4} dot={false} connectNulls /> : null}
              {indicators.ema50 ? <Line yAxisId="price" type="monotone" dataKey="ema50" name="EMA 50" stroke="#75B89B" strokeWidth={1.6} dot={false} connectNulls /> : null}
              {indicators.ema200 ? <Line yAxisId="price" type="monotone" dataKey="ema200" name="EMA 200" stroke="#7AA7E8" strokeWidth={1.6} dot={false} connectNulls /> : null}
              {indicators.bollinger ? <Line yAxisId="price" type="monotone" dataKey="bollingerUpper" name="BB Upper" stroke="#A78BFA" strokeWidth={1.1} strokeDasharray="4 4" dot={false} connectNulls /> : null}
              {indicators.bollinger ? <Line yAxisId="price" type="monotone" dataKey="bollingerMiddle" name="BB Middle" stroke="#A78BFA" strokeWidth={1} dot={false} connectNulls /> : null}
              {indicators.bollinger ? <Line yAxisId="price" type="monotone" dataKey="bollingerLower" name="BB Lower" stroke="#A78BFA" strokeWidth={1.1} strokeDasharray="4 4" dot={false} connectNulls /> : null}
              {indicators.pivots ? <Line yAxisId="price" type="stepAfter" dataKey="pivot" name="Pivot" stroke="#CBD5E1" strokeWidth={1.1} dot={false} connectNulls /> : null}
              {indicators.pivots ? <Line yAxisId="price" type="stepAfter" dataKey="resistance1" name="R1" stroke="#C98182" strokeWidth={1} dot={false} connectNulls /> : null}
              {indicators.pivots ? <Line yAxisId="price" type="stepAfter" dataKey="support1" name="S1" stroke="#75B89B" strokeWidth={1} dot={false} connectNulls /> : null}
              {indicators.rsi ? <Line yAxisId="rsi" type="monotone" dataKey="rsi" name="RSI 14" stroke="#F472B6" strokeWidth={1.4} dot={false} connectNulls /> : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : null}
      {!chartData.length ? (
        <div className="border border-white/10 bg-[#050E1D]/45 p-5 text-sm text-[#94A3B8]">
          Price history will appear here when historical market data is available for the selected instrument.
        </div>
      ) : null}
    </DataSection>
  );
}

function PriceTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const visible = payload.filter((item) => item.value !== null && item.value !== undefined);
  const formatValue = (item) => {
    if (item.dataKey === "volume") return compactNumber(item.value, { compact: true });
    if (item.dataKey === "rsi") return compactNumber(item.value);
    return `Rs. ${compactNumber(item.value)}`;
  };
  return (
    <div className="rounded-lg border border-white/10 bg-[#07182F] px-3 py-2 text-xs shadow-xl">
      <div className="font-medium text-white">{new Date(`${label}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
      <div className="mt-2 space-y-1">
        {visible.map((item) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-6">
            <span style={{ color: item.color }}>{item.name}</span>
            <span className="text-[#CBD5E1]">{formatValue(item)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardTabs({ onSelect }) {
  return (
    <nav className="sticky top-0 z-10 -mx-4 overflow-x-auto border-y border-white/10 bg-[#061225]/95 px-4 py-2 backdrop-blur sm:mx-0 sm:border sm:px-3">
      <div className="flex min-w-max gap-px bg-white/10">
        {DASHBOARD_TABS.map((tab) => (
          <button
            key={`${tab.id}-${tab.label}`}
            type="button"
            onClick={() => onSelect(tab)}
            className="bg-[#061225] px-3 py-2 text-xs uppercase tracking-[.08em] text-[#94A3B8] transition-colors hover:bg-[#0A1E3F] hover:text-white"
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function PeriodToggle({ period, onChange }) {
  return (
    <div className="flex flex-col gap-3 border border-white/10 bg-[#08172C]/35 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-[10px] uppercase tracking-[.14em] text-[#71839A]">Financial data period</div>
        <p className="mt-1 text-sm text-[#94A3B8]">Switches supported charts and statement tables between yearly and quarterly data.</p>
      </div>
      <div className="flex border border-white/10 bg-[#050E1D]/55 text-sm">
        {[
          ["yearly", "Yearly"],
          ["quarterly", "Quarterly"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            className={`border-l border-white/10 px-4 py-2 font-medium first:border-l-0 ${period === value ? "bg-[#D4AF37]/15 text-[#E7C56B]" : "text-[#94A3B8] hover:bg-white/[.04] hover:text-white"}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PeriodCoverageNotice({ period, data }) {
  const requestedCount = financialPeriodLimit(period);
  const incomePeriods = uniquePeriodsFromHistory(limitHistoryRows(data?.incomeStatement?.income_statement, period));
  const cashPeriods = uniquePeriodsFromHistory(limitHistoryRows(data?.cashFlow?.cash_flow, period));
  const balancePeriods = limitPeriods([...(data?.balanceSheet?.history || [])].reverse(), period).map((row) => row.period).filter(Boolean).reverse();
  return (
    <div className="border border-white/10 bg-[#050E1D]/40 p-4 text-sm text-[#CBD5E1]">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[.14em] text-[#71839A]">Available financial periods</div>
          <p className="mt-1 text-[#94A3B8]">
            {period === "yearly"
              ? `Yearly view can show up to ${requestedCount} years; ${incomePeriods.length || 0} are available.`
              : `Quarterly view can show up to ${requestedCount} quarters; ${incomePeriods.length || 0} income-statement quarters are available.`}
          </p>
        </div>
        <div className="grid gap-1 text-xs text-[#94A3B8] md:min-w-[340px]">
          <span>Income statement: {periodListLabel(incomePeriods)}</span>
          <span>Cash flow: {periodListLabel(cashPeriods)}</span>
          <span>Balance sheet: {periodListLabel(balancePeriods)}</span>
        </div>
      </div>
    </div>
  );
}

function MultiMetricChart({ id, title, subtitle, data, unit, bars, stacked = false }) {
  return (
    <DataSection id={id} title={title} subtitle={subtitle}>
      <div className="h-64 min-w-0 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="period" stroke="#94A3B8" fontSize={10} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip content={<MultiTooltip unit={unit} />} />
            <Legend wrapperStyle={{ color: MUTED, fontSize: 12 }} />
            {bars.map((bar) => (
              <Bar key={bar.key} dataKey={bar.key} name={bar.label} fill={bar.color} radius={stacked ? 0 : [4, 4, 0, 0]} stackId={stacked ? "stack" : undefined} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </DataSection>
  );
}

function MultiTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-[#07182F] px-3 py-2 text-xs shadow-xl">
      <div className="font-medium text-white">{label}</div>
      <div className="mt-2 space-y-1">
        {payload.map((item) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-6">
            <span style={{ color: item.color }}>{item.name}</span>
            <span className="text-[#CBD5E1]">{valueWithUnit(item.value, unit)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryHistoryTable({ id, title, subtitle, rows, unit, period = "yearly", priorityRows = [] }) {
  const [expanded, setExpanded] = useState({});
  const categories = id === "profit-loss"
    ? buildProfitLossRows(rows, period, expanded)
    : id === "balance-sheet"
      ? buildGroupedStatementRows(rows, period, expanded, BALANCE_SHEET_GROUPS, 0)
      : id === "cash-flow"
        ? buildGroupedStatementRows(rows, period, expanded, CASH_FLOW_GROUPS, 0)
        : cleanFinancialRows(rows, period, priorityRows);
  const periods = uniquePeriodsFromHistory(categories);
  const minWidth = Math.max(760, 220 + periods.length * 130);
  const toggleRow = (key) => setExpanded((current) => ({ ...current, [key]: !current[key] }));

  return (
    <DataSection id={id} title={title} subtitle={subtitle}>
      {categories.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" style={{ minWidth }}>
            <thead className="border-b border-[#233650] font-mono text-[10px] uppercase tracking-[.14em] text-[#F5A623]">
              <tr>
                <th className="sticky left-0 bg-[#06101D] px-3 py-2 font-normal">Metric</th>
                {periods.map((periodLabel) => <th key={periodLabel} className="px-3 py-2 font-normal">{displayPeriodLabel(periodLabel)}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#233650]/70">
              {categories.map((row) => (
                <tr key={`${row.category}-${row.depth || 0}`} className={row.strong ? "bg-white/[.035] font-semibold" : ""}>
                  <td className={`sticky left-0 bg-[#06101D] px-3 py-2 ${row.depth ? "pl-8 text-[#9FB0C4]" : "text-white"}`}>
                    {row.expandable ? (
                      <button
                        type="button"
                        onClick={() => toggleRow(row.category)}
                        className="mr-1 inline-flex h-5 w-5 items-center justify-center border border-[#34506D] font-mono text-[11px] text-[#AEBBD0] hover:border-[#F5A623] hover:text-[#F5A623]"
                        aria-label={`${expanded[row.category] ? "Collapse" : "Expand"} ${row.label || row.category}`}
                      >
                        {expanded[row.category] ? "-" : "+"}
                      </button>
                    ) : row.depth ? (
                      <span className="mr-2 text-[#526782]">└</span>
                    ) : null}
                    {row.label || row.category?.replaceAll("_", " ")}
                  </td>
                  {periods.map((periodLabel) => {
                    const point = row.history?.find((item) => item.period === periodLabel);
                    return <td key={periodLabel} className="px-3 py-2 text-[#CBD5E1]">{valueWithUnit(point?.value, unit)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border border-white/10 bg-[#050E1D]/45 p-5 text-sm text-[#94A3B8]">
          No clean statement rows are available for this section.
        </div>
      )}
    </DataSection>
  );
}

function RatioTable({ ratios }) {
  const priorityIndex = new Map(RATIO_PRIORITY.map((key, index) => [normalizeMetricName(key), index]));
  const ratioRows = [...(ratios || [])].sort((a, b) => {
    const aRank = priorityIndex.get(normalizeMetricName(a.name)) ?? 999;
    const bRank = priorityIndex.get(normalizeMetricName(b.name)) ?? 999;
    if (aRank !== bRank) return aRank - bRank;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
  const benchmarkRows = ratioRows.filter((ratio) => numericValue(ratio.sector_value) !== null);
  const standaloneRows = ratioRows.filter((ratio) => numericValue(ratio.sector_value) === null);
  const splitRows = (items) => {
    const splitIndex = Math.ceil(items.length / 2);
    return [items.slice(0, splitIndex), items.slice(splitIndex)].filter((group) => group.length);
  };
  const renderTables = (items, includeSector) => (
    <div className="grid gap-4 xl:grid-cols-2">
      {splitRows(items).map((group, groupIndex) => (
        <div key={`ratio-group-${includeSector ? "bench" : "single"}-${groupIndex}`} className="overflow-x-auto border border-white/10 bg-[#050E1D]/35">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="border-b border-white/10 text-[10px] uppercase tracking-[.14em] text-[#71839A]">
              <tr>
                <th className="px-4 py-3 font-normal">Ratio</th>
                <th className="px-4 py-3 font-normal">Company</th>
                {includeSector ? <th className="px-4 py-3 font-normal">Sector</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {group.map((ratio) => {
                const help = RATIO_DESCRIPTIONS[ratio.name];
                return (
                  <tr key={ratio.name}>
                    <td className="px-4 py-3 text-white">
                      <span className="inline-flex items-center gap-1.5">
                        {ratio.name}
                        <span title={help || "Ratio definition is not available yet."} className="inline-flex h-4 w-4 items-center justify-center border border-[#34506D] text-[10px] text-[#8EA2BA]">
                          ?
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#CBD5E1]">{compactNumber(ratio.company_value)}</td>
                    {includeSector ? <td className="px-4 py-3 text-[#94A3B8]">{compactNumber(ratio.sector_value)}</td> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );

  return (
    <DataSection
      id="ratios"
      title="Ratios"
      subtitle={benchmarkRows.length ? "Operating and return ratios first, with sector benchmarks separated when present." : "Company ratio values. Sector benchmarks are not available for the current ratio set."}
    >
      <div className="space-y-5">
        {benchmarkRows.length ? (
          <div>
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[.14em] text-[#F5A623]">With sector benchmark</div>
            {renderTables(benchmarkRows, true)}
          </div>
        ) : null}
        {standaloneRows.length ? (
          <div>
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[.14em] text-[#71839A]">Company ratios</div>
            {renderTables(standaloneRows, false)}
          </div>
        ) : null}
        {!ratioRows.length ? (
          <div className="border border-white/10 bg-[#050E1D]/45 p-5 text-sm text-[#94A3B8]">
            No ratio rows are available for this company.
          </div>
        ) : null}
      </div>
    </DataSection>
  );
}

function HistoryTable({ id, title, subtitle, rows, unit }) {
  const normalized = latestHistory(rows);
  return (
    <DataSection id={id} title={title} subtitle={subtitle}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-white/10 text-[10px] uppercase tracking-[.14em] text-[#71839A]">
            <tr>
              <th className="px-4 py-3 font-normal">Holder</th>
              <th className="px-4 py-3 font-normal">Latest</th>
              <th className="px-4 py-3 font-normal">Period</th>
              <th className="px-4 py-3 font-normal">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {normalized.map((row) => (
              <tr key={row.category}>
                <td className="px-4 py-3 text-white">{row.label || row.category?.replaceAll("_", " ")}</td>
                <td className="px-4 py-3 text-[#CBD5E1]">{valueWithUnit(row.latest?.value, unit)}</td>
                <td className="px-4 py-3 text-[#94A3B8]">{row.latest?.period || "Latest period"}</td>
                <td className="px-4 py-3 text-[#94A3B8]">{row.latest?.change !== undefined ? percentText(row.latest.change) : "N/A"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DataSection>
  );
}

function SnapshotRatios({ metrics }) {
  const visibleMetrics = metrics.slice(0, 8);
  return (
    <div className="grid grid-cols-2 border border-[#233650] bg-[#233650]">
      {visibleMetrics.map((metric) => {
        const value = metric.format === "currency" ? `Rs. ${compactNumber(metric.value)}` : valueWithUnit(metric.value, metric.unit);
        return (
          <div key={metric.label} className="bg-[#02060D] p-2.5">
            <div className="font-mono text-[10px] uppercase tracking-[.12em] text-[#6F8098]">{metric.label}</div>
            <div className="mt-1 font-mono text-[15px] font-semibold tabular-nums text-white">{value}</div>
            <div className="mt-1 min-h-4 text-[11px] text-[#7F90A8]">
              {metric.benchmark !== undefined && metric.benchmark !== null ? `Sector ${compactNumber(metric.benchmark)}` : metric.period || ""}
              {metric.change !== undefined && metric.change !== null ? ` | ${percentText(metric.change)}` : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CompanySummary({ data, quote, metrics }) {
  const price = quote.price || quote.lastPrice;
  const change = numericValue(quote.changePercent);
  const keyFacts = [
    ["Symbol", data.instrument?.symbol],
    ["ISIN", data.instrument?.isin],
    ["Sector", data.profile?.sector || "Sector unavailable"],
    ["Statement", data.statementType ? `${data.statementType}${data.statementType !== data.requestedStatementType ? ` (fallback from ${data.requestedStatementType})` : ""}` : null],
  ].filter(([, value]) => value);
  return (
    <section id="summary" className="terminal-panel scroll-mt-28 border">
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="p-3 md:p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[.18em] text-[#F5A623]">Equity Research Snapshot</div>
              <h2 className="mt-1 text-2xl font-semibold leading-tight text-white md:text-3xl">{data.instrument?.name || data.instrument?.symbol}</h2>
            </div>
            <div className="min-w-36 border-l-0 border-[#233650] text-left sm:border-l sm:pl-5 sm:text-right">
              <div className="font-mono text-[10px] uppercase tracking-[.14em] text-[#71839A]">Last Price</div>
              <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-white">{price ? `Rs. ${compactNumber(price)}` : "N/A"}</div>
              <div className={`mt-1 text-sm ${change >= 0 ? "text-[#8CC8AA]" : "text-[#E7A5A6]"}`}>{quote.changePercent !== undefined ? percentText(quote.changePercent) : "Quote unavailable"}</div>
            </div>
          </div>

          <div className="mt-4 grid gap-px overflow-hidden border border-[#233650] bg-[#233650] sm:grid-cols-2 lg:grid-cols-3">
            {keyFacts.map(([label, value]) => (
              <div key={label} className="bg-[#030914] px-3 py-2">
                <span className="font-mono text-[10px] uppercase tracking-[.12em] text-[#71839A]">{label}</span>
                <span className="ml-2 text-xs text-[#CBD5E1]">{value}</span>
              </div>
            ))}
          </div>

          {data.profile?.description ? (
            <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_.85fr]">
              <div>
                <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[.14em] text-[#F5A623]">About</h3>
                <p className="mt-2 text-sm leading-6 text-[#CBD5E1]">{descriptionBullets(data.profile.description)[0]}</p>
              </div>
              <div>
                <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[.14em] text-[#F5A623]">Key Points</h3>
                <ul className="mt-2 space-y-1.5 text-sm leading-6 text-[#CBD5E1]">
                  {descriptionBullets(data.profile.description).slice(1, 5).map((point) => (
                    <li key={point} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 bg-[#F5A623]" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="border-t border-[#233650] p-3 xl:border-l xl:border-t-0 md:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[.14em] text-[#F5A623]">Key Metrics</div>
              <div className="mt-1 text-xs text-[#7F90A8]">Compact valuation and return ratios</div>
            </div>
          </div>
          <SnapshotRatios metrics={metrics} />
        </aside>
      </div>
    </section>
  );
}

function CorporateActionsSection({ actions }) {
  return (
    <DataSection id="corporate-actions" title="Corporate Actions" subtitle="Dividends, splits, bonuses and other announced events.">
      {actions?.length ? (
        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-2 pb-1">
            {actions.slice(0, 10).map((action, index) => {
              const details = actionDetails(action);
              return (
                <div key={`${action.name || action.purpose || action.type}-${index}`} className="w-80 border border-[#233650] bg-[#02060D] p-3">
                  <div className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-white">{action.name || action.purpose || action.type || "Corporate action"}</div>
                  <div className="mt-1 font-mono text-[11px] text-[#F5A623]">{actionDate(action)}</div>
                  {details ? <div className="mt-2 text-xs leading-relaxed text-[#CBD5E1]">{details}</div> : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : <div className="text-sm text-[#94A3B8]">No corporate actions are available.</div>}
    </DataSection>
  );
}

function CompetitorsSection({ competitors, onOpen }) {
  return (
    <DataSection id="competitors" title="Competitors" subtitle="Click a peer to drill into its fundamentals without changing the search style.">
      {competitors?.length ? (
        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-2 pb-1">
            {competitors.slice(0, 10).map((competitor) => (
              <button key={competitor.instrumentKey} type="button" onClick={() => onOpen(competitor)} className="w-80 border border-[#233650] bg-[#02060D] p-3 text-left transition-colors hover:border-[#F5A623]/70 hover:bg-[#08111F]">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-white">{competitor.name || competitor.symbol || competitor.instrumentKey}</span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[.14em] text-[#F5A623]">Open</span>
                </div>
                <div className="mt-2 text-xs text-[#94A3B8]">
                  {[competitor.symbol, competitor.isin, competitor.sector || "Sector unavailable"].filter(Boolean).join(" | ")}
                </div>
                {competitor.sectorMarketCapInr ? <div className="mt-2 text-xs text-[#8CC8AA]">Sector market cap {competitor.sectorMarketCapInr}</div> : null}
                {competitor.summary ? <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-[#CBD5E1]">{competitor.summary}</p> : null}
              </button>
            ))}
          </div>
        </div>
      ) : <div className="text-sm text-[#94A3B8]">No peer set is available.</div>}
    </DataSection>
  );
}

function actionDate(action) {
  if (action.expiry_date) return action.expiry_date;
  if (action.ex_date || action.record_date || action.announcement_date) {
    return action.ex_date || action.record_date || action.announcement_date;
  }
  const details = action.event_details || [];
  const dateDetail = details.find((item) => /date/i.test(item.name || "") && primitiveDetailValue(item.value));
  return dateDetail ? String(dateDetail.value) : "Date unavailable";
}

function actionDetails(action) {
  const details = action.event_details || [];
  const interesting = details
    .filter((item) => !/date/i.test(item.name || "") && primitiveDetailValue(item.value))
    .slice(0, 4);
  if (interesting.length) {
    return interesting.map((item) => `${item.name}: ${item.value}`).join(" | ");
  }
  if (action.amount !== undefined && action.amount !== null) return `Amount: ${action.amount}`;
  if (action.ratio) return `Ratio: ${action.ratio}`;
  return "";
}

function primitiveDetailValue(value) {
  return value !== null && value !== undefined && value !== "" && typeof value !== "object";
}

function DataSection({ id, title, subtitle, children }) {
  return (
    <section id={id} className="terminal-panel min-w-0 scroll-mt-28 border p-3 sm:p-4">
      <div className="mb-4 flex flex-col gap-1 border-b pb-3 md:flex-row md:items-end md:justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-[.16em] text-[#F5A623]">{title}</h2>
        {subtitle ? <p className="max-w-3xl text-xs text-[#7F90A8]">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function TerminalStatusBar({ data, loading }) {
  if (!data) return null;
  const metrics = data.devMetrics || {};
  const rows = [
    ["TICKER", data.instrument?.symbol],
    ["ISIN", data.instrument?.isin],
    ["REQ", formatDurationMs(metrics.clientMs || metrics.backendMs || 0)],
    ["PTS", compactNumber(metrics.totalRecords || 0)],
    ["MODE", loading ? "FETCHING" : data.cached ? "CACHE" : "LIVE"],
  ].filter(([, value]) => value);
  return (
    <div className="terminal-command-strip border border-[#233650] bg-[#02060D]">
      <div className="flex min-w-max items-center divide-x divide-[#233650] overflow-x-auto text-[11px] uppercase tracking-[.12em]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center gap-2 px-3 py-2">
            <span className="text-[#5D6E86]">{label}</span>
            <span className="font-semibold text-[#DDE6F2]">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function sourceMixLabel(metrics) {
  const share = metrics?.providerRecordShare || {};
  const rows = [
    ["FE", share.finedge],
    ["UPX", share.upstox],
    ["MIX", share.mixed],
  ].filter(([, value]) => Number(value) > 0);
  return rows.length ? rows.map(([label, value]) => `${label} ${compactNumber(value)}%`).join(" / ") : null;
}

function DevMetricsPanel({ data }) {
  const metrics = data?.devMetrics;
  if (!metrics) return null;
  const sectionRows = Object.entries(metrics.sections || {}).filter(([, details]) => details.records > 0);
  const commandLines = [
    `finlit@fundamentals ~ % fetch ${data.instrument?.symbol || data.query || "SECURITY"} --statement ${data.statementType || data.requestedStatementType || "reported"} --period ${data.requestedPeriod || "current"}`,
    `total_fetch=${formatDurationMs(metrics.clientMs || metrics.backendMs || 0)} backend=${formatDurationMs(metrics.backendMs || 0)} mode=${data.cached ? "cache" : "fresh"}${metrics.cacheAgeSeconds !== undefined ? ` cache_age=${compactNumber(metrics.cacheAgeSeconds)}s` : ""}`,
    `records_total=${compactNumber(metrics.totalRecords || 0)} source_mix="${sourceMixLabel(metrics) || "unavailable"}"`,
    `provider_records=${Object.entries(metrics.providerRecords || {}).filter(([, value]) => value > 0).map(([provider, value]) => `${provider}:${compactNumber(value)}`).join(" ")}`,
  ];
  const logLines = sectionRows.map(([section, details]) => (
    `[${providerLogTag(details.provider)}] ${section.padEnd(18, " ")} ${String(details.source || "unknown").padEnd(14, " ")} ${compactNumber(details.records)} pts`
  ));
  return (
    <DataSection id="dev-metrics" title="Dev Metrics" subtitle="Fetch timing and payload mix for this fundamentals page.">
      <div className="border border-[#1F2D1F] bg-[#020502] p-0 font-mono shadow-[inset_0_1px_0_rgba(77,255,136,0.12)]">
        <div className="flex items-center gap-2 border-b border-[#1F2D1F] bg-[#050A05] px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
          <span className="ml-2 text-[11px] uppercase tracking-[.14em] text-[#6EA67A]">finlit diagnostics</span>
        </div>
        <div className="overflow-x-auto px-3 py-3 text-[12px] leading-6">
          <pre className="m-0 min-w-max whitespace-pre text-[#B9F6C8]">
            {[
              ...commandLines,
              "",
              "# section payloads",
              ...logLines,
            ].join("\n")}
          </pre>
        </div>
      </div>
    </DataSection>
  );
}

function providerLogTag(provider) {
  if (provider === "finedge") return "FE ";
  if (provider === "upstox") return "UPX";
  if (provider === "mixed") return "MIX";
  return "UNK";
}

function formatDurationMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "N/A";
  if (number > 0 && number < 1) return "<1 ms";
  if (number === 0) return "<1 ms";
  return `${compactNumber(number)} ms`;
}

export default function StockFundamentalsAdminPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [submittedQuery, setSubmittedQuery] = useState(DEFAULT_QUERY);
  const [statementType, setStatementType] = useState("consolidated");
  const [period, setPeriod] = useState("yearly");
  const [data, setData] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingScrollId, setPendingScrollId] = useState("");
  const requestSequence = useRef(0);

  const loadFundamentals = useCallback(async () => {
    const search = submittedQuery.trim();
    if (!search) return;
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    setLoading(true);
    setError("");
    try {
      const requestStartedAt = performance.now();
      const params = new URLSearchParams({ query: search, statement_type: statementType, period });
      const annualParams = new URLSearchParams({ query: search, statement_type: statementType, period: "yearly" });
      const [response, annualResponse] = await Promise.all([
        cmsRequest(`/stocks/admin/fundamentals?${params.toString()}`),
        period === "quarterly" ? cmsRequest(`/stocks/admin/fundamentals?${annualParams.toString()}`) : Promise.resolve(null),
      ]);
      const clientMs = Math.round(performance.now() - requestStartedAt);
      if (requestSequence.current === requestId) {
        setData({
          ...response,
          annualData: annualResponse || response,
          devMetrics: {
            ...(response.devMetrics || {}),
            annualCompanionMs: annualResponse?.devMetrics?.totalMs,
            clientMs,
          },
        });
        setError("");
      }
    } catch (requestError) {
      if (requestSequence.current !== requestId) return;
      if (requestError.status === 401) navigate("/blog/admin/login", { replace: true });
      else setError(requestError.message);
    } finally {
      if (requestSequence.current === requestId) setLoading(false);
    }
  }, [navigate, period, statementType, submittedQuery]);

  useEffect(() => { loadFundamentals(); }, [loadFundamentals]);

  useEffect(() => {
    if (loading || !pendingScrollId) return;
    document.getElementById(pendingScrollId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setPendingScrollId("");
  }, [loading, pendingScrollId, data]);

  useEffect(() => {
    const search = query.trim();
    if (search.length < 2) {
      setSuggestions([]);
      return undefined;
    }
    const timeout = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ query: search });
        const response = await cmsRequest(`/stocks/admin/fundamentals/search?${params.toString()}`);
        setSuggestions(response.items || []);
      } catch {
        setSuggestions([]);
      }
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const quote = useMemo(() => data?.quote || {}, [data]);
  const incomeUnit = data?.incomeStatement?.units_in;
  const chartData = useMemo(() => {
    const incomeRows = data?.incomeStatement?.income_statement || [];
    const cashRows = data?.cashFlow?.cash_flow || [];
    return {
      income: combineHistories(incomeRows, [
        { key: "revenue", category: "revenue" },
        { key: "preTaxProfit", category: "operating_profit" },
        { key: "netProfit", category: "net_profit" },
      ], period),
      cash: combineHistories(cashRows, [
        { key: "operating", category: "operating" },
        { key: "investing", category: "investing" },
        { key: "financing", category: "financing" },
      ], period),
      balance: balanceChartData(data?.balanceSheet, period),
      shareholding: shareholdingChartData(data?.shareholding, period),
    };
  }, [data, period]);

  const dashboardMetrics = useMemo(() => {
    if (!data) return [];
    return [
      ...((data.highlights || []).filter((metric) => ["P/E", "P/B", "ROE", "ROCE"].includes(metric.label))),
    ].filter((metric) => metric.value !== null && metric.value !== undefined && metric.value !== "");
  }, [data]);
  const investorInsights = useMemo(() => buildInvestorInsights(data), [data]);
  const researchReport = useMemo(() => buildResearchReport(data), [data]);
  const derivedMetricGroups = useMemo(() => buildDerivedMetricGroups(data), [data]);
  const marketMetricsSnapshot = useMemo(() => buildMarketMetricsSnapshot(data), [data]);

  const submit = (event) => {
    event.preventDefault();
    const normalizedQuery = query.trim().toUpperCase();
    if (!normalizedQuery) {
      toast.error("Enter a stock symbol, company name, ISIN, or instrument key.");
      return;
    }
    setQuery(normalizedQuery);
    setSubmittedQuery(normalizedQuery);
  };

  const updateQuery = (value) => {
    setQuery(value.toUpperCase());
  };

  const openCompetitor = (competitor) => {
    const instrumentKey = competitor?.instrumentKey;
    if (!instrumentKey) return;
    setQuery(competitor.symbol || competitor.name || instrumentKey);
    setSubmittedQuery(instrumentKey);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const selectDashboardTab = (tab) => {
    document.getElementById(tab.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const updatePeriod = (nextPeriod) => {
    if (nextPeriod === period) return;
    setPendingScrollId("profit-loss-chart");
    setPeriod(nextPeriod);
  };

  return (
    <div className="stock-fundamentals-page">
      <AdminShell>
      <header className="mt-5 border border-[#233650] bg-[#02060D] p-3 lg:flex lg:items-end lg:justify-between">
        <div>
          <Link to="/blog/admin" className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[.12em] text-[#7F90A8] hover:text-white"><ArrowLeft size={14} />Back to CMS</Link>
          <div className="mt-4 text-[10px] uppercase tracking-[.22em] text-[#F5A623]">Admin Terminal / Equity Research</div>
          <h1 className="mt-1 font-mono text-2xl font-semibold uppercase leading-tight text-white sm:text-3xl">Stock fundamentals</h1>
          <p className="mt-2 max-w-2xl text-xs text-[#7F90A8]">Price, profile, ratios, statements, holdings, actions, peers and diagnostics.</p>
        </div>
        <button onClick={loadFundamentals} disabled={loading} className="mt-4 inline-flex h-9 items-center justify-center gap-2 self-start border border-[#40546E] px-3 font-mono text-xs uppercase tracking-[.1em] text-[#CBD5E1] hover:border-[#F5A623] hover:text-white disabled:opacity-60 lg:mt-0 lg:self-auto">
          <RefreshCcw size={16} />Refresh
        </button>
      </header>

      <section className="mt-3 border border-[#233650] bg-[#030914] p-3">
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_140px] md:items-end">
          <label>
            <span className="mb-2 block text-[10px] uppercase tracking-[.14em] text-[#71839A]">Security</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71839A]" />
              <input
                list="stock-fundamental-suggestions"
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
                className="cms-input h-12 pr-4"
                style={{ paddingLeft: "2.5rem" }}
                placeholder="RELIANCE, INFY, HDFCBANK, ISIN..."
              />
            </div>
            <datalist id="stock-fundamental-suggestions">
              {suggestions.map((item) => (
                <option
                  key={item.instrumentKey}
                  value={item.symbol || item.name}
                  label={`${item.name || item.symbol} | ${item.exchange || item.segment || "Equity"}`}
                />
              ))}
            </datalist>
          </label>
          <SelectControl label="Statement" value={statementType} onChange={setStatementType} options={[["consolidated", "Consolidated"], ["standalone", "Standalone"]]} />
          <button disabled={loading} className="inline-flex h-12 items-center justify-center gap-2 bg-[#F5A623] px-4 font-mono text-xs font-semibold uppercase tracking-[.1em] text-[#050E1D] hover:bg-[#E7C56B] disabled:opacity-60">
            <BarChart3 size={16} />{loading ? "Loading..." : "Load data"}
          </button>
        </form>
      </section>

      {error ? (
        <section className="mt-8 border border-[#C98182]/25 bg-[#C98182]/5 p-6">
          <h2 className="text-lg text-white">Fundamentals could not be loaded.</h2>
          <p className="mt-2 text-sm text-[#94A3B8]">{error}</p>
        </section>
      ) : null}

      {loading && !data ? <div className="py-20 text-center text-sm text-[#71839A]">Fetching stock fundamentals...</div> : null}

      {data ? (
        <div className="mt-3 space-y-3">
          <TerminalStatusBar data={data} loading={loading} />
          <CompanySummary data={data} quote={quote} metrics={dashboardMetrics} />

          <DashboardTabs onSelect={selectDashboardTab} />

          <MarketMetricsSection snapshot={marketMetricsSnapshot} />

          <ResearchReport report={researchReport} />

          <DerivedMetricsSection groups={derivedMetricGroups} />

          <InvestorInsights insights={investorInsights} />

          <PriceVolumeChart data={data.priceHistory} symbol={data.instrument?.symbol || data.instrument?.name} />

          <PeriodToggle period={period} onChange={updatePeriod} />

          <section className="grid gap-4 xl:grid-cols-2">
            {chartData.income.length ? (
              <MultiMetricChart
                id="profit-loss-chart"
                title="Profit & Loss Overview"
                subtitle={`${period === "quarterly" ? "Quarterly" : "Yearly"} sales, operating profit and net profit from the income statement.`}
                data={chartData.income}
                unit={incomeUnit}
                bars={[
                  { key: "revenue", label: "Revenue", color: GOLD },
                  { key: "preTaxProfit", label: "Pre-tax Profit", color: TEAL },
                  { key: "netProfit", label: "Net Profit", color: BLUE },
                ]}
              />
            ) : null}
            {chartData.cash.length ? (
              <MultiMetricChart
                id="cash-flow-chart"
                title="Cash Flow Overview"
                subtitle="Operating, investing and financing cash flows."
                data={chartData.cash}
                unit={data.cashFlow?.units_in}
                bars={[
                  { key: "operating", label: "Operating", color: TEAL },
                  { key: "investing", label: "Investing", color: RED },
                  { key: "financing", label: "Financing", color: BLUE },
                ]}
              />
            ) : null}
            {chartData.balance.length ? (
              <MultiMetricChart
                id="balance-sheet-chart"
                title="Balance Sheet Scale"
                subtitle={`${period === "quarterly" ? "Quarterly" : "Yearly"} total assets and liabilities.`}
                data={chartData.balance}
                unit={data.balanceSheet?.units_in}
                bars={[
                  { key: "assets", label: "Total Assets", color: GOLD },
                  { key: "liabilities", label: "Liabilities", color: BLUE },
                ]}
              />
            ) : null}
            {chartData.shareholding.length ? (
              <MultiMetricChart
                id="shareholding-chart"
                title="Shareholding Pattern"
                subtitle={`${period === "quarterly" ? "Quarterly" : "Latest"} ownership mix, stacked by holder category.`}
                data={chartData.shareholding}
                unit="%"
                stacked
                bars={[
                  { key: "Promoters", label: "Promoters", color: GOLD },
                  { key: "FII", label: "FII", color: BLUE },
                  { key: "Other DII", label: "Other DII", color: TEAL },
                  { key: "Mutual Funds", label: "Mutual Funds", color: "#A78BFA" },
                  { key: "Retail/Others", label: "Retail/Others", color: MUTED },
                ]}
              />
            ) : null}
          </section>

          <PeriodCoverageNotice period={period} data={data} />

          <section className="border border-white/10 bg-[#050E1D]/45 p-5">
            <div className="text-[10px] uppercase tracking-[.16em] text-[#71839A]">Financial Statements</div>
            <h2 className="mt-2 text-xl font-medium text-white">Detailed Statements</h2>
            <p className="mt-1 text-sm text-[#94A3B8]">Core statement rows grouped for fast review.</p>
          </section>

          <CategoryHistoryTable id="profit-loss" title={period === "quarterly" ? "Quarterly Results" : "Profit & Loss"} subtitle={`Core statement lines in ${data.incomeStatement?.units_in || "reported units"}. Showing up to ${financialPeriodLimit(period)} ${period === "quarterly" ? "quarters" : "years"}.`} rows={data.incomeStatement?.income_statement} unit={data.incomeStatement?.units_in} period={period} priorityRows={CORE_INCOME_ROWS} />
          <CategoryHistoryTable id="balance-sheet" title="Balance Sheet" subtitle={`Liabilities and assets in ${data.balanceSheet?.units_in || "reported units"}. Expand grouped lines for breakdowns.`} rows={data.balanceSheet?.balance_sheet} unit={data.balanceSheet?.units_in} period={period} priorityRows={[]} />
          <CategoryHistoryTable id="cash-flow" title="Cash Flow" subtitle="Core operating, investing and financing cash-flow lines." rows={data.cashFlow?.cash_flow} unit={data.cashFlow?.units_in} period={period} priorityRows={CORE_CASH_ROWS} />
          <RatioTable ratios={data.ratios} />
          <HistoryTable id="shareholding" title="Shareholding Pattern" subtitle="Latest ownership mix from available filing history." rows={data.shareholding} unit="%" />

          <CorporateActionsSection actions={data.corporateActions} />
          <CompetitorsSection competitors={data.competitors} onOpen={openCompetitor} />
          <DevMetricsPanel data={data} />
        </div>
      ) : null}
      </AdminShell>
    </div>
  );
}

function SelectControl({ label, value, onChange, options }) {
  return (
    <label>
      <span className="mb-2 block text-[10px] uppercase tracking-[.14em] text-[#71839A]">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="cms-input h-12 min-w-40">
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}
