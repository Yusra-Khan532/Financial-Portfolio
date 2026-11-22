/** Reading a broker's holdings file (Excel .xlsx/.xls/.xlsm/.ods, .csv, .tsv, .txt, or the HTML table some brokers save as ".xls").
 *  A broker's export holds much more than names: quantity, average price, P&L, ISIN, dates and title rows. Only the ISIN and the share name are taken
 *  (task #128: the ISIN decides which company a line is; the name is used only on a line without one, see lib/isin.ts).
 *  The name column is found by looking at the VALUES (which column's cells match listed companies), then by its header, so the file does
 *  not need a particular layout; the ISIN column is the one whose cells hold valid ISINs. The spreadsheet library is loaded only when a spreadsheet is chosen. */
import { isinIn } from "./isin";
import { avgOf, combine, isoDay, isPriceLabel, normLabel, num, pickColumns, qtyRank, RATE_HEAD, TRADE_HEADS, type Part } from "./holdingsColumns";
import { setLines } from "./gridLines";

export type Grid = string[][];
export type NameMatcher = (name: string) => boolean;

const NAME_HEAD = /^(symbol|trading ?symbol|ticker|scrip( ?name)?|stock( ?name)?|share( ?name)?|instrument( ?name)?|security( ?name)?|company( ?name)?|name( of (the )?(security|scrip|stock|company|instrument))?|name|nse|bse|isin)\b/i;
const NOT_NAME = /^(total|grand total|sub ?total|net|portfolio|summary|invested|current|holdings|equity|equities|mutual funds?|cash|margin|p ?& ?l|unrealised|realised|as on|as of|date|client|name:|id|pan|account|ucc|dp|demat|sr\.? ?no|s\.? ?no)\b/i;
/** Words that are labels only when they stand alone or lead a short phrase, not when they open a company name ("Client Services Ltd"). */
const COMPANY_END = /\b(ltd|limited|corp|corporation|inc|co|company|bank|industries|finance|services|systems|technologies|enterprises)\.?$/i;
/** A bare column heading ("Symbol", "ISIN", "Scrip Name"): never a share name itself. */
const BARE_HEAD = /^(symbol|trading ?symbol|ticker|scrip( ?name)?|stock( ?name| ?symbol)?|share( ?name)?|instrument( ?name)?|security( ?name)?|company( ?name)?|name|nse|bse|isin|isin ?(code|no\.?|number)?|symbol ?name)$/i;
/** Other words that mark a header row (quantity, price, value, P&L ...). */
const HEAD_WORDS = /^(qty|quantity|units?|shares?|avg|average|price|ltp|cmp|cur|current|value|val|p ?& ?l|pnl|profit|loss|net chg|day chg|change|chg|buy|sell|cost|closing|invested|market|exchange|series|holdings?|returns?|unrealised|realised|amount|balance|free|pledged|collateral|t ?\+ ?1|dp)\b/i;
/** A column heading on its own ("Qty", "Value", "Avg price"): never a share name, even when a company is called "Value 360". */
const HEAD_ONLY = /^(qty|quantity|units?|avg|average|price|ltp|cmp|value|val|amount|balance|cost|invested|returns?|change|chg|series|exchange|market|closing|buy|sell|free|pledged|collateral|pnl|profit|loss)(\s+(price|value|qty|quantity|cost|amount|balance|chg|change|%|cost))*$/i;
const NUMERIC = /^[\s\d.,₹$%()+\-/:]*$/;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const MAX_ROWS = 5000;

/** Text that holds a name: not a number, a date, a total line or a lone code. */
export function plausibleName(s: string): boolean {
  const t = s.trim();
  if (t.length < 2 || t.length > 80) return false;
  if (NUMERIC.test(t) && !/^\d{6}$/.test(t)) return false;       // a six-digit BSE code is allowed
  if (BARE_HEAD.test(t) || HEAD_ONLY.test(t)) return false;
  if (NOT_NAME.test(t) && !(COMPANY_END.test(t) && !/^(total|grand total|sub ?total)\b/i.test(t))) return false;
  if (ISIN.test(t)) return false;                                // an ISIN says which company, but is not a name; the name column is used
  return true;
}

/** Cleans a broker's way of writing a name: "TCS-EQ", "RELIANCE EQ", "HDFCBANK.NS", "INFY - BE", "ITC LTD. EQ" become the plain name. */
export function tidy(s: string): string {
  return s.replace(/ /g, " ").replace(/\s+/g, " ").trim()
    .replace(/^(NSE|BSE)\s*[:\-]\s*/i, "").replace(/\.(NS|BO)$/i, "")
    .replace(/\s*[-/]\s*(EQ|BE|BZ|SM|ST|N\d|T\d|IL|GB|IV)$/i, "").replace(/\s+(EQ|BE|BZ)$/i, "")
    .replace(/\s*\((EQ|BE|NSE|BSE)\)$/i, "");
}

/** A cell under a recognised name column: "BSE" there is BSE Ltd's symbol (a listed company), not the exchange's name as a heading.
 *  (task #323, developer file 21 part 13: the member's Upstox holdings report dropped BSE Ltd, 51 of 52 lines.) */
export const bodyName = (s: string): boolean => plausibleName(s) || s.trim() === "BSE";

export type GridLayout = { rows: Grid; headerRow: number; body: Grid; width: number; col: number; mode: "row" | "column" | "none"; names: string[] };

/** Where the names are in a grid: the header row, the body (up to a Total line), the name column and the names in it. */
export function gridLayout(grid: Grid, matches?: NameMatcher): GridLayout {
  const rows = grid.slice(0, MAX_ROWS).map((r) => r.map((c) => (c == null ? "" : String(c))));
  if (!rows.length) return { rows, headerRow: -1, body: [], width: 0, col: -1, mode: "none", names: [] };
  const width = Math.max(...rows.map((r) => r.length));
  // Header row: the first of the first 80 rows that names a column like a share column.
  // Title blocks ("Name  TEST USER", "Client ID ...") also hold words like "Name", so the row with the MOST heading-like cells wins (ties: the earliest).
  let headerRow = -1, headerScore = 0;
  for (let i = 0; i < Math.min(rows.length, 80); i++) {
    const cells = rows[i].map((c) => c.trim()).filter(Boolean);
    if (!cells.some((c) => NAME_HEAD.test(c))) continue;
    if (cells.length < 2 && !(cells.length === 1 && rows.length > 1 && i === rows.findIndex((r) => r.some((c) => c.trim())))) continue;   // a lone heading counts only as the first line of a one-column list
    const score = cells.filter((c) => NAME_HEAD.test(c) || HEAD_WORDS.test(c)).length;
    if (score > headerScore) { headerRow = i; headerScore = score; }
  }
  let body = rows.slice(headerRow + 1);
  const endAt = body.findIndex((r) => r.some((c) => /^(grand |sub ?)?total\s*[:\-]?\s*(value|holdings?|investment|invested|portfolio)?$/i.test(c.trim())));   // broker files end with a Total line and notes
  if (endAt > 0) body = body.slice(0, endAt);

  const colValues = (c: number) => body.map((r) => tidy(r[c] || "")).filter(bodyName);
  const headed = headerRow >= 0 ? rows[headerRow].map((h, c) => ({ c, rank: rankHead(h) })).filter((x) => x.rank > 0).sort((a, b) => b.rank - a.rank) : [];
  const score = (c: number) => { const v = colValues(c); return { c, v, hit: matches ? v.filter(matches).length : 0 }; };

  let best = { c: -1, v: [] as string[], hit: 0 };
  if (matches) for (let c = 0; c < width; c++) { const s = score(c); if (s.hit > best.hit || (s.hit === best.hit && s.hit > 0 && headed.some((h) => h.c === s.c) && !headed.some((h) => h.c === best.c))) best = s; }
  const out = (mode: GridLayout["mode"], col: number, names: string[]): GridLayout => ({ rows, headerRow, body: headerRow < 0 ? rows : body, width, col, mode, names: [...new Set(names)] });
  if (headerRow < 0 && rows.length === 1 && width > 1) return out("row", -1, rows[0].map(tidy).filter(plausibleName));   // "TCS, INFY, ITC" on one line is a list, not a table
  if (best.hit > 0) return out("column", best.c, best.v);                                 // the column whose cells are listed companies
  if (headed.length) return out("column", headed[0].c, colValues(headed[0].c));          // else the column headed like a share name
  if (headerRow < 0 && width) return out("column", 0, rows.map((r) => tidy(r[0] || "")).filter(plausibleName));   // pasted text: the first column
  return out("none", -1, []);
}

/** The share names in a grid of cells (rows of columns): the best column wins. `matches` says whether a name is a listed company. */
export function namesFromGrid(grid: Grid, matches?: NameMatcher): string[] {
  return gridLayout(grid, matches).names;
}


/** Higher = a more likely share-name header. ISIN is the weakest (it identifies, but is not a name). */
function rankHead(h: string): number {
  const t = h.trim().toLowerCase();
  if (!NAME_HEAD.test(t)) return 0;
  if (/^isin/.test(t)) return 1;
  if (/^(symbol|trading ?symbol|ticker)/.test(t)) return 5;
  if (/^(instrument|scrip|stock|security|company|share)/.test(t)) return 4;
  return 3;
}

/** Delimited text (a CSV, TSV, ;-separated or pasted list) into a grid. Quoted cells may hold the delimiter. */
export function gridFromText(text: string): Grid {
  const clean = text.replace(/^﻿/, "");
  // The delimiter is the one that splits the most lines into the same number of columns (>1); a title line alone must not decide it.
  const lines = clean.split(/\r?\n|\r/).filter((l) => l.trim()).slice(0, 60);
  const fieldCount = (line: string, dl: string) => { let n = 1, qq = false; for (const ch of line) { if (ch === '"') qq = !qq; else if (ch === dl && !qq) n++; } return n; };
  let d = ",", bestLines = 0;
  for (const dl of ["\t", ";", "|", ","]) {                    // listed in preference order for ties
    const freq = new Map<number, number>();
    for (const l of lines) { const n = fieldCount(l, dl); if (n > 1) freq.set(n, (freq.get(n) || 0) + 1); }
    const top = Math.max(0, ...freq.values());
    if (top > bestLines) { bestLines = top; d = dl; }
  }
  const out: Grid = [], at: number[] = [];
  let row: string[] = [], cell = "", q = false, n = 0;                       // n: the record being read, from 1 (a quoted cell over two lines is one record)
  const end = () => { n++; row.push(cell.trim()); cell = ""; if (row.some(Boolean)) { out.push(row); at.push(n); } row = []; };
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (q) { if (ch === '"') { if (clean[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === d) { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && clean[i + 1] === "\n") i++; end(); }
    else cell += ch;
  }
  end();
  return setLines(out, at);                                              // each row's line in the file (developer file 30, lib/gridLines)
}

const SHEET_TYPES = /\.(xlsx|xlsm|xlsb|xls|ods|html?|xml)$/i;
export const ACCEPT = ".xlsx,.xls,.xlsm,.xlsb,.ods,.csv,.tsv,.txt,.html,.htm,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const MAX_BYTES = 5_000_000;

/** A zip ends with an "end of central directory" record (PK 05 06) within its last 64 KB + 22 bytes. */
function hasZipEnd(b: Uint8Array): boolean {
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 5 && b[i + 3] === 6) return true;
  return false;
}

/** Every sheet of a file as a grid. Works on Excel (both formats), OpenDocument, CSV and the HTML/XML tables some brokers call ".xls". */
export async function gridsFromFile(file: File): Promise<Grid[]> {
  if (file.size > MAX_BYTES) throw new Error("That file is larger than 5 MB. Export only your holdings, or paste the names instead.");
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 8));
  const isZip = head[0] === 0x50 && head[1] === 0x4b, isOle = head[0] === 0xd0 && head[1] === 0xcf;
  const looksText = !isZip && !isOle;
  const asText = looksText ? new TextDecoder("utf-8").decode(buf) : "";
  const isMarkup = looksText && /^\s*(<\?xml|<!doctype|<html|<table|<\?mso)/i.test(asText.slice(0, 400));
  if (looksText && !isMarkup && !SHEET_TYPES.test(file.name)) return [gridFromText(asText)];   // plain CSV / pasted text: no library needed
  if (looksText && !isMarkup && /\.(csv|tsv|txt)$/i.test(file.name)) return [gridFromText(asText)];
  const bad = new Error("That file could not be read as a spreadsheet. Save it again as .xlsx or .csv, or paste the names instead.");
  if (isZip && !hasZipEnd(new Uint8Array(buf))) throw bad;                                     // truncated or corrupt zip: the library would guess at text
  if (isOle && !(head[2] === 0x11 && head[3] === 0xe0 && head[4] === 0xa1 && head[5] === 0xb1 && head[6] === 0x1a && head[7] === 0xe1)) throw bad;
  if (looksText && !isMarkup && new Uint8Array(buf, 0, Math.min(buf.byteLength, 4096)).includes(0)) throw bad;   // binary with a spreadsheet name but no spreadsheet signature
  const XLSX = await import("xlsx");
  let wb: import("xlsx").WorkBook;
  try { wb = XLSX.read(buf, { type: "array", cellDates: false, cellFormula: false, cellHTML: false, cellStyles: false, sheetRows: MAX_ROWS }); } catch { throw bad; }
  // each sheet's rows from its first used row (blank rows kept here only to number the others), then the blank rows left out as before (developer file 30)
  return wb.SheetNames.map((n) => {
    const ws = wb.Sheets[n], top = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]).s.r : 0;
    const all = (XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: true }) as unknown[][]).map((r) => (r ?? []).map((c) => (c == null ? "" : String(c))));
    const grid: Grid = [], at: number[] = [];
    all.forEach((r, k) => { if (r.some((c) => c !== "")) { grid.push(r); at.push(top + k + 1); } });
    return setLines(grid, at);
  });
}


/** The share names in a file; the sheet and column with the most listed companies win. */
export async function namesFromFile(file: File, matches?: NameMatcher): Promise<string[]> {
  const grids = await gridsFromFile(file);
  let best: string[] = [], bestHit = -1;
  for (const g of grids) {
    const names = namesFromGrid(g, matches), hit = matches ? names.filter(matches).length : names.length;
    if (hit > bestHit) { best = names; bestHit = hit; }
  }
  return best;
}

/* ------------------------------------------------------------------ entries with quantity and average buy price (22 Nov 2026)
 * Live today (holdingsFile chunk `E`, `entriesFromGrid`): each line gives { isin, name } only, and the page adds every share as qty 1,
 * price 0 (Holdings `wn`). Here the same layout gives each line its quantity and average buy price, from the columns holdingsColumns.ts
 * names, and a company on several lines (two accounts, two lots) is added up. A tradebook (Trade date / Trade type ...) gives names only. */

export type Entry = { isin?: string; name: string; qty?: number; avg?: number; avgHow?: "column" | "worked"; lines?: number; rate?: number; rateOn?: string };
/** qty / price: the headings used (null when the file has none); trades: the file is a tradebook, so no quantities are taken; rateLike: a "Rate" or
 *  "LTP" column that is today's price (named in the note so nobody thinks it was used); otherParts: companies whose pledged or locked shares sit in
 *  other columns and are not in the quantity used ("Quantity Available"), to be checked. */
export type GridAmounts = { qty: string | null; price: string | null; priceHow: "column" | "worked" | null; trades: boolean; rateLike: string | null; otherParts?: number; rate?: string | null; rateOn?: string | null };
export type GridEntries = { entries: Entry[]; amounts: GridAmounts };

/** Port of live `E`, with each line's quantity and average buy price. */
export function entriesWithAmounts(grid: Grid, matches?: NameMatcher): GridEntries {
  const L = gridLayout(grid, matches);
  const none: GridAmounts = { qty: null, price: null, priceHow: null, trades: false, rateLike: null };
  const seen = new Map<string, Entry>(), parts = new Map<string, Part[]>(), order: string[] = [];
  const rates = new Map<string, { rate: number; on?: string }>(), dates = new Map<string, number>();
  const add = (e: Entry) => {
    const key = e.isin || "n:" + e.name.toUpperCase();
    if (!(e.isin || e.name)) return;
    if (!seen.has(key)) { seen.set(key, { isin: e.isin, name: e.name }); order.push(key); }
    if (e.rate != null && !rates.has(key)) { rates.set(key, { rate: e.rate, ...(e.rateOn ? { on: e.rateOn } : {}) }); if (e.rateOn) dates.set(e.rateOn, (dates.get(e.rateOn) ?? 0) + 1); }
    if (e.qty != null) parts.set(key, [...(parts.get(key) || []), { qty: e.qty, ...(e.avg != null ? { avg: e.avg } : {}) }]);
    else parts.set(key, [...(parts.get(key) || []), { qty: NaN }]);
  };
  const clean = (s: string, isin?: string) => {
    const t = tidy(isin && s.toUpperCase().includes(isin) ? s.replace(new RegExp(isin, "i"), " ").replace(/^[\s:,\-–|]+|[\s:,\-–|]+$/g, "") : s);
    return bodyName(t) ? t : "";
  };
  if (L.mode === "row" || (L.headerRow < 0 && L.rows.length === 1)) {
    (L.rows[0] || []).forEach((c) => { const isin = isinIn(c); add({ isin, name: clean(c, isin) }); });
    return { entries: order.map((k) => seen.get(k)!).filter((e) => e.isin || plausibleName(e.name)), amounts: none };
  }
  // quantity and price columns, from the heading row
  const heads = L.headerRow >= 0 ? L.rows[L.headerRow] : [];
  const pick = pickColumns(heads);
  const trades = heads.some((h) => h.trim() && !isPriceLabel(h) && (TRADE_HEADS.test(normLabel(h)) || /^(buy|sell|purchase|redemption)( ?\/ ?(sell|buy))?$/i.test(normLabel(h))));
  const qtyCol = trades ? -1 : pick.qty;
  const hows = new Set<"column" | "worked">();
  const amountsOf = (r: string[]) => {
    if (qtyCol < 0) return {};
    const q = num(r[qtyCol]);
    if (!(q != null && q > 0)) return {};
    const p = avgOf(q, pick.avg >= 0 ? num(r[pick.avg]) : null, pick.cost >= 0 ? num(r[pick.cost]) : null);
    if (p) hows.add(p.how);
    const rt = pick.rate >= 0 ? num(r[pick.rate]) : null, on = pick.date >= 0 ? isoDay(r[pick.date]) : null;
    return { qty: q, ...(p ? { avg: p.avg } : {}), ...(rt != null && rt > 0 ? { rate: rt, ...(on ? { rateOn: on } : {}) } : {}) };
  };
  let isinCol = -1, isinHits = 0;
  for (let c = 0; c < L.width; c++) { const n = L.body.filter((r) => isinIn(r[c] || "")).length; if (n > isinHits) { isinCol = c; isinHits = n; } }
  if (isinCol < 0) {
    if (L.col < 0) return { entries: L.names.map((name) => ({ name })), amounts: none };
    for (const r of L.body) { const name = clean(r[L.col] || ""); if (name) add({ name, ...amountsOf(r) }); }
  } else {
    for (const r of L.body) {
      const isin = isinIn(r[isinCol] || "");
      const name = L.col >= 0 && L.col !== isinCol ? clean(r[L.col] || "") : clean(r[isinCol] || "", isin);
      if (isin) add({ isin, name, ...amountsOf(r) }); else if (name && L.mode === "column") add({ name, ...amountsOf(r) });
    }
  }
  const entries = order.map((k) => {
    const e = seen.get(k)!, ps = parts.get(k) || [];
    if (!ps.length || ps.some((p) => !Number.isFinite(p.qty))) return e;     // a line with no quantity: no total for this company
    const c = combine(ps), rt = rates.get(k);
    return { ...e, qty: c.qty, lines: c.parts, ...(c.avg != null ? { avg: c.avg, avgHow: hows.has("worked") && pick.avg < 0 ? "worked" as const : "column" as const } : {}), ...(rt ? { rate: rt.rate, ...(rt.on ? { rateOn: rt.on } : {}) } : {}) };
  });
  const priceCol = pick.avg >= 0 ? pick.avg : pick.cost;
  // the quantity used is only the free part ("Quantity Available", "Free Qty"): count the companies with pledged / locked shares in other columns
  const partCols = qtyCol >= 0 && pick.qtyRank >= 3 ? heads.map((h, i) => (i !== qtyCol && /\b(qty|quantity|bal(ance)?|shares)\b/.test(normLabel(h)) && qtyRank(h) === 99 && /\b(pledged?|locked|lock ?in|freeze|frozen|lent|collateral|margin|loan|discrepant|t ?\+ ?\d)\b/.test(normLabel(h)) ? i : -1)).filter((i) => i >= 0) : [];
  const otherParts = partCols.length ? new Set(L.body.filter((r) => partCols.some((c) => (num(r[c]) ?? 0) > 0)).map((r) => (isinCol >= 0 ? isinIn(r[isinCol] || "") : undefined) || (L.col >= 0 ? clean(r[L.col] || "") : ""))).size : 0;
  return {
    entries,
    amounts: {
      qty: qtyCol >= 0 ? pick.qtyLabel : null,
      price: qtyCol >= 0 && priceCol >= 0 && hows.size ? (pick.avg >= 0 ? pick.avgLabel : pick.costLabel) : null,
      priceHow: hows.size ? (pick.avg >= 0 ? "column" : "worked") : null,
      trades,
      rateLike: heads.map((h) => h.trim()).find((h) => RATE_HEAD.test(h)) ?? null,
      rate: rates.size && qtyCol >= 0 ? pick.rateLabel : null,
      rateOn: [...dates.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      ...(otherParts ? { otherParts } : {}),
    },
  };
}

/** Live `entriesFromGrid` keeps its shape ({ isin, name } and now qty / avg on each). */
export const entriesFromGrid = (grid: Grid, matches?: NameMatcher): Entry[] => entriesWithAmounts(grid, matches).entries;

/** Port of live `P` (`entriesFromFile`): the sheet with the most listed companies wins; its columns' headings come along for the page's note. */
export async function entriesAndAmountsFromFile(file: File, matches?: NameMatcher): Promise<GridEntries> {
  const grids = await gridsFromFile(file);
  let best: GridEntries = { entries: [], amounts: { qty: null, price: null, priceHow: null, trades: false, rateLike: null } }, bestHit = -1;
  for (const g of grids) {
    const r = entriesWithAmounts(g, matches), hit = r.entries.filter((e) => e.isin || !matches || matches(e.name)).length;
    if (hit > bestHit) { best = r; bestHit = hit; }
  }
  return best;
}

/** Same as live: the entries only (each now with qty / avg when the file has them). */
export async function entriesFromFile(file: File, matches?: NameMatcher): Promise<Entry[]> { return (await entriesAndAmountsFromFile(file, matches)).entries; }
