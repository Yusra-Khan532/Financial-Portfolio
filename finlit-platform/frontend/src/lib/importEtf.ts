/** Task #323 (developer file 21, parts 8 and 13): ETF lines of an equity statement go to the ETF portfolio, through that page's own endpoints.
 *  importFunds.ts holds the pure parts (the rows, the plan, the body, the buys, the message); this file sends them.
 *    1. POST /api/me/etf-portfolio/import-preview, 2. POST .../import-commit ("skip": an ETF already in the list keeps its units here),
 *    3. developer file 32: the buys go to the ETF book's account that matches the Equity portfolio the file was imported into (made there when there is
 *       none), at the file's average buy price (or at the statement's Rate when the member chose it). The book is read after the commit and sent back
 *       with only that account changed; the server then sets each ETF's units from every account's buys, so a second account's units add to the
 *       first's and are never written over them. */
import { apiGet, apiSend } from "./api";
import type { Book } from "./etfBook";
import { bookAfterImport, etfAccountFor, etfAccountMessage, etfBuys, etfCommit, etfPlan, etfPreviewRows, type EqAccount, type EtfPlan, type EtfPreview, type FundLine } from "./importFunds";

const BASE = "/api/me/etf-portfolio";
const uid = () => "imp" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export async function previewFunds(funds: FundLine[]): Promise<EtfPlan> {
  const pv = await apiSend<EtfPreview>("POST", BASE + "/import-preview", { rows: etfPreviewRows(funds) });
  return etfPlan(funds, pv);
}

/** Developer file 32: the import's Equity portfolio (its id, name and broker) and the name of the Equity page's first portfolio. */
export type ImportAccount = EqAccount & { mainName?: string };

/** The buys put in the book, in the ETF account that matches the Equity portfolio (`etfAccountFor`, made when there is none), and what happened to each
 *  ETF there (`bookAfterImport`). The book is read after the commit and sent back whole; other accounts' buys are never changed. */
export async function addBookBuys(buys: { symbol: string; qty: number; price: number; pf?: string; date?: string; side?: "sell" }[], acct: ImportAccount = { id: "main", name: "My ETFs" },
  fresh: ReadonlySet<string> = new Set()):
  Promise<{ added: { symbol: string }[]; joined: string[]; fixed: string[]; kept: string[]; same: string[]; account: string; pf: string; created: boolean; full: boolean; twins: { symbol: string; account: string }[] }> {
  const b = await apiGet<Book>(BASE + "/book");
  const a = etfAccountFor(b.portfolios, acct, acct.mainName);
  if (!buys.length) return { added: [], joined: [], fixed: [], kept: [], same: [], account: a.name, pf: a.pf, created: false, full: a.full, twins: [] };
  const r = bookAfterImport(b.lots, buys, a.pf, uid, fresh);
  if (!r.added.length && !r.joined.length && !r.fixed.length && !a.created) return { added: [], joined: [], fixed: [], kept: r.kept, same: r.same, account: a.name, pf: a.pf, created: false, full: a.full, twins: [] };
  await apiSend("PUT", BASE + "/book", { portfolios: a.portfolios, lots: r.lots });
  const nameOf = (id: string) => a.portfolios.find((p) => p.id === id)?.name ?? "My ETFs";
  return { added: r.added.map((symbol) => ({ symbol })), joined: r.joined, fixed: r.fixed, kept: r.kept, same: r.same, account: a.name, pf: a.pf, created: a.created, full: a.full,
    twins: r.twins.map((t) => ({ symbol: t.symbol, account: nameOf(t.pf) })) };
}

/** Sends the ticked ETFs and says where they went ("2 ETFs went to your ETF portfolio, account "Dhan" (made there to match this portfolio): …");
 *  pf: that account's id on the ETF page (?pf=), null when the buys could not be saved. */
export async function sendFunds(plan: EtfPlan, ticked: Set<string>, rateAsBuy: boolean, rateOn?: string | null, acct?: ImportAccount): Promise<{ msg: string; pf: string | null }> {
  if (!ticked.size) return { msg: "", pf: null };
  await apiSend<{ added: number; replaced: number; skipped: number }>("POST", BASE + "/import-commit", etfCommit(plan, ticked));
  const all = [...plan.add, ...plan.have].filter((x) => ticked.has(x.symbol));
  try {
    // the ETFs new to the list: their units in the book until it is saved are the commit's own, not a buy of another account
    const r = await addBookBuys(etfBuys(plan, ticked, rateAsBuy, () => false), acct, new Set(plan.add.filter((x) => ticked.has(x.symbol)).map((x) => x.symbol)));
    const by = (sym: string) => all.find((x) => x.symbol === sym);
    const fresh = r.added.map((x) => x.symbol), got = [...fresh, ...r.joined, ...r.fixed];
    const traded = got.filter((s) => by(s)?.line.trades?.length).length;
    const priced = got.filter((s) => (by(s)?.avg ?? 0) > 0 || (rateAsBuy && (by(s)?.rate ?? 0) > 0) || by(s)?.line.trades?.length).length;
    const fromRate = got.filter((s) => !(by(s)?.avg) && rateAsBuy && (by(s)?.rate ?? 0) > 0 && !by(s)?.line.trades?.length).length;
    return { pf: r.pf, msg: etfAccountMessage({ account: r.account, created: r.created, full: r.full, fresh, joined: r.joined, fixed: r.fixed, kept: r.kept, same: r.same, priced, fromRate, traded, unpriced: got.length - priced, rateOn, twins: r.twins }) };
  } catch {
    const fresh = plan.add.filter((x) => ticked.has(x.symbol)).length;
    return { pf: null, msg: `${fresh ? `${fresh} ${fresh === 1 ? "ETF was" : "ETFs were"} added to your ETF portfolio, but ` : ""}the buys could not be saved to its accounts just now. Open the ETF portfolio and add ${fresh === 1 ? "it" : "them"} under Edit, or import the file again.` };
  }
}

/** The spreadsheet path (no dialog): every ETF the preview finds is sent, within the plan's room, to the account of the Equity portfolio it was imported into. */
export async function sendAllFunds(funds: FundLine[], acct?: ImportAccount): Promise<{ msg: string; notAdded: string[]; pf: string | null }> {
  const plan = await previewFunds(funds);
  const ticked = new Set([...plan.add.slice(0, plan.room), ...plan.have].map((x) => x.symbol));
  const { msg, pf } = await sendFunds(plan, ticked, false, null, acct);
  return { pf, msg: msg + (plan.over ? ` Your plan holds up to ${plan.limit} ETFs, so ${plan.over} ${plan.over === 1 ? "was" : "were"} not added.` : ""),
    notAdded: plan.notAdded.map((n) => n.line.input) };
}
