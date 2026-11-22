/** Task #323 (developer file 21, parts 8 and 13): ETF lines of an equity statement go to the ETF portfolio, through that page's own endpoints.
 *  importFunds.ts holds the pure parts (the rows, the plan, the body, the buys, the message); this file sends them.
 *    1. POST /api/me/etf-portfolio/import-preview, 2. POST .../import-commit ("replace": an ETF already there takes the statement's units),
 *    3. a buy in the ETF book for each ticked ETF that has no buys there yet, at the file's average buy price (or at the statement's Rate when the
 *       member chose it), so the ETF page can work out Invested and Gain or loss. The book is read after the commit and sent back with only those
 *       buys added: an ETF that already has buys keeps them, and nothing is counted twice. */
import { apiGet, apiSend } from "./api";
import { DEFAULT_PF } from "./portfolio";
import type { Book } from "./etfBook";
import { bookAfterImport, etfBuys, etfCommit, etfMessage, etfPlan, etfPreviewRows, type EtfPlan, type EtfPreview, type FundLine } from "./importFunds";

const BASE = "/api/me/etf-portfolio";
const uid = () => "imp" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export async function previewFunds(funds: FundLine[]): Promise<EtfPlan> {
  const pv = await apiSend<EtfPreview>("POST", BASE + "/import-preview", { rows: etfPreviewRows(funds) });
  return etfPlan(funds, pv);
}

/** The buys added to the book (only ETFs with no buys stored), and the earlier import buys whose price was corrected (`bookAfterImport`). */
export async function addBookBuys(buys: { symbol: string; qty: number; price: number; pf?: string; date?: string }[]): Promise<{ added: { symbol: string }[]; fixed: string[] }> {
  if (!buys.length) return { added: [], fixed: [] };
  const b = await apiGet<Book>(BASE + "/book");
  const pf = b.portfolios[0]?.id ?? DEFAULT_PF;
  // an ETF with a quantity only (a "legacy" line of the book) is left as it is; one that gets a buy here takes the buy instead of that line
  const r = bookAfterImport(b.lots, buys, pf, uid);
  if (!r.added.length && !r.fixed.length) return { added: [], fixed: [] };
  await apiSend("PUT", BASE + "/book", { portfolios: b.portfolios, lots: r.lots.map(({ legacy: _l, ...l }) => l) });
  return { added: r.added.map((symbol) => ({ symbol })), fixed: r.fixed };
}

/** Sends the ticked ETFs and says what happened ("8 ETFs went to your ETF portfolio: 6 added, units set for A and B."). */
export async function sendFunds(plan: EtfPlan, ticked: Set<string>, rateAsBuy: boolean, rateOn?: string | null): Promise<string> {
  if (!ticked.size) return "";
  const res = await apiSend<{ added: number; replaced: number; skipped: number }>("POST", BASE + "/import-commit", etfCommit(plan, ticked));
  let fromRate = 0, priced = 0, fixed: string[] = [];
  try {
    const all = [...plan.add, ...plan.have];
    const r = await addBookBuys(etfBuys(plan, ticked, rateAsBuy, () => false));
    priced = r.added.length; fixed = r.fixed;
    fromRate = r.added.filter((b) => !(all.find((x) => x.symbol === b.symbol)?.avg)).length;
  } catch { /* the units are in; only the buy prices could not be saved, said below */ }
  const msg = etfMessage(res, plan.have.filter((x) => ticked.has(x.symbol)).map((x) => x.symbol), fromRate, rateOn);
  const avg = priced - fromRate;
  return msg + (avg ? ` ${avg === 1 ? "One has" : `${avg} have`} the file's average buy price.` : "")
    + (fixed.length ? ` The buy price of ${fixed.length === 1 ? fixed[0] : `${fixed.length} ETFs (${fixed.join(", ")})`} from an earlier import was corrected to the file's average.` : "");
}

/** The spreadsheet path (no dialog): every ETF the preview finds is sent, within the plan's room. */
export async function sendAllFunds(funds: FundLine[]): Promise<{ msg: string; notAdded: string[] }> {
  const plan = await previewFunds(funds);
  const ticked = new Set([...plan.add.slice(0, plan.room), ...plan.have].map((x) => x.symbol));
  const msg = await sendFunds(plan, ticked, false);
  return { msg: msg + (plan.over ? ` Your plan holds up to ${plan.limit} ETFs, so ${plan.over} ${plan.over === 1 ? "was" : "were"} not added.` : ""),
    notAdded: plan.notAdded.map((n) => n.line.input) };
}
