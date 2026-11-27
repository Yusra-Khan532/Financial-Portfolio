// F&O Academy (Learn): the statutory and exchange charges on one NSE F&O round trip (an opening and a closing trade), as announced.
// The site had no F&O charges calculator before (searched 27 Nov 2026), so this is the one. Every rate carries its source and the date it
// applies from; rates change, so the page says "check the exchange's current circular" beside them. Brokerage is the member's own figure.
//
// Rates (checked 27 Nov 2026):
//   STT (Finance Act, 2026, on trades from 1 April 2026): futures 0.05% of the seller's value; options 0.15% of the premium on the seller's
//     side; an option that is exercised: 0.15% of its intrinsic value, paid by the buyer.
//   NSE transaction charges with the IPFT contribution (circular NSE/FA/73061 of 27 February 2026, from 1 March 2026): futures ₹183 per crore
//     of traded value each side; options ₹3,553 per crore of traded premium each side.
//   SEBI turnover fee: ₹10 per crore of traded value (premium for options), each side.
//   Stamp duty (Indian Stamp Act, from 1 July 2020): futures 0.002%, options 0.003% of the premium, on the buyer's side only.
//   GST: 18% on brokerage, exchange charges and the SEBI fee (not on STT or stamp duty).
// Brokers may add clearing or platform fees of their own; the contract note is the final word.

export type Instrument = "futures" | "options";
export type CostIn = { instrument: Instrument; /** price (futures) or premium (options) of the opening trade */ entry: number; exit: number; lotSize: number; lots: number;
  /** "long": the opening trade is the buyer's; "short": the opening trade is the seller's (writer's) */ side: "long" | "short"; /** ₹ per executed order */ brokeragePerOrder: number };
export type CostLine = { key: "brokerage" | "stt" | "exchange" | "sebi" | "stamp" | "gst"; label: string; amount: number; basis: string };
export type CostOut = { qty: number; buyValue: number; sellValue: number; turnover: number; lines: CostLine[]; total: number; gross: number; net: number; /** points (₹ per unit) the price must move just to pay the charges */ breakevenPoints: number };

export const RATES = {
  stt: { futures: 0.0005, options: 0.0015, exercise: 0.0015, from: "1 April 2026", source: "Finance Act, 2026 (Securities Transaction Tax)" },
  exchange: { futures: 183 / 1e7, options: 3553 / 1e7, from: "1 March 2026", source: "NSE circular NSE/FA/73061, 27 February 2026 (transaction charges with the IPFT contribution)" },
  sebi: { rate: 10 / 1e7, source: "SEBI turnover fee, ₹10 per crore" },
  stamp: { futures: 0.00002, options: 0.00003, from: "1 July 2020", source: "Indian Stamp Act, 1899 as amended (buyer's side only)" },
  gst: { rate: 0.18, source: "GST at 18% on brokerage, exchange charges and the SEBI fee" },
} as const;

const r2 = (x: number) => Math.round(x * 100) / 100;

/** The charges on one round trip. Each line is rounded to paise; a broker's contract note may round per order and differ by a few paise. */
export function roundTrip(i: CostIn): CostOut {
  const qty = Math.max(0, i.lotSize) * Math.max(0, i.lots);
  const buyPrice = i.side === "long" ? i.entry : i.exit, sellPrice = i.side === "long" ? i.exit : i.entry;
  const buyValue = buyPrice * qty, sellValue = sellPrice * qty, turnover = buyValue + sellValue;
  const fut = i.instrument === "futures";
  const brokerage = r2(Math.max(0, i.brokeragePerOrder) * (qty > 0 ? 2 : 0));
  const stt = r2(sellValue * (fut ? RATES.stt.futures : RATES.stt.options));
  const exchange = r2(turnover * (fut ? RATES.exchange.futures : RATES.exchange.options));
  const sebi = r2(turnover * RATES.sebi.rate);
  const stamp = r2(buyValue * (fut ? RATES.stamp.futures : RATES.stamp.options));
  const gst = r2((brokerage + exchange + sebi) * RATES.gst.rate);
  const base = fut ? "value" : "premium";
  const lines: CostLine[] = [
    { key: "brokerage", label: "Brokerage", amount: brokerage, basis: `₹${i.brokeragePerOrder} an order × 2 orders (your broker's rate)` },
    { key: "stt", label: "STT", amount: stt, basis: `${fut ? "0.05%" : "0.15%"} of the seller's ${base}` },
    { key: "exchange", label: "Exchange charges", amount: exchange, basis: `${fut ? "₹183" : "₹3,553"} per crore of ${base}, both sides` },
    { key: "sebi", label: "SEBI fee", amount: sebi, basis: `₹10 per crore of ${base}, both sides` },
    { key: "stamp", label: "Stamp duty", amount: stamp, basis: `${fut ? "0.002%" : "0.003%"} of the buyer's ${base}` },
    { key: "gst", label: "GST", amount: gst, basis: "18% of brokerage, exchange charges and SEBI fee" },
  ];
  const total = r2(lines.reduce((s, l) => s + l.amount, 0));
  const gross = r2((sellPrice - buyPrice) * qty);
  return { qty, buyValue: r2(buyValue), sellValue: r2(sellValue), turnover: r2(turnover), lines, total, gross, net: r2(gross - total), breakevenPoints: qty > 0 ? Math.round((total / qty) * 100) / 100 : 0 };
}

/** STT on an option that is exercised at expiry: 0.15% of its intrinsic value, paid by the buyer. */
export const exerciseStt = (intrinsicPerUnit: number, qty: number) => r2(Math.max(0, intrinsicPerUnit) * qty * RATES.stt.exercise);
