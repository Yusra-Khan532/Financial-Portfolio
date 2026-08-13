import { useEffect, useState } from "react";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;
const REFRESH_MS = 60_000;

const formatPrice = (price, currency) => new Intl.NumberFormat(currency === "USD" ? "en-US" : "en-IN", {
  style: "currency", currency, maximumFractionDigits: 2,
}).format(price);

function TickerItem({ item }) {
  const isUp = item.direction === "up";
  const isDown = item.direction === "down";
  const marker = isUp ? "▲" : isDown ? "▼" : "•";
  const signedPercent = `${item.changePercent > 0 ? "+" : ""}${item.changePercent.toFixed(2)}%`;

  return <span className="inline-flex items-center gap-2 px-5 whitespace-nowrap text-xs">
    <span className="text-[#CBD5E1] font-medium">{item.name}</span>
    <span className="text-[#94A3B8] tabular-nums">{formatPrice(item.price, item.currency)}</span>
    <span className={isUp ? "text-[#75B89B]" : isDown ? "text-[#C98182]" : "text-[#94A3B8]"}>
      {marker} {signedPercent}
    </span>
  </span>;
}

export default function MarketTicker() {
  const [items, setItems] = useState([]);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`${API}/market-ticker`);
        if (!response.ok) throw new Error("Market data unavailable");
        const data = await response.json();
        if (active && data.items?.length) {
          setItems(data.items);
          setUnavailable(false);
        }
      } catch {
        if (active) setUnavailable(true);
      }
    };
    load();
    const interval = window.setInterval(load, REFRESH_MS);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  if (!items.length) {
    return <div className="market-ticker" data-testid="market-ticker" aria-live="off">
      <div className="market-ticker-status">{unavailable ? "Market data temporarily unavailable" : "Loading market data…"}</div>
    </div>;
  }

  const sequence = [...items, ...items];
  return <div className="market-ticker" data-testid="market-ticker" aria-live="off">
    <div className="market-ticker-track">
      <div className="market-ticker-content">{sequence.map((item, index) => <TickerItem item={item} key={`${item.symbol}-${index}`} />)}</div>
    </div>
  </div>;
}
