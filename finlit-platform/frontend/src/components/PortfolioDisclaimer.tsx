import "../styles/portfolio-disc.css";

const TEXT = {
  equity: "This page describes the shares in your list using FinLit Prism scores, technical trend scores and past prices. The scores are calculated from many parameters, and not all of them are shown here. Until you add quantities, every share counts the same, so the figures describe the list, not your actual holdings. Prices and scores can be delayed or change after this page was worked out. Nothing here is investment advice, a recommendation to buy, sell or hold any share, or a prediction of future returns. Investments in the securities market are subject to market risks; please check the details and consult a registered adviser before you invest.",
  mf: "This page describes your mutual funds using FinLit's Health Score, the funds' published NAVs and the fund houses' monthly portfolio files. Holdings are published once a month and may have changed since; NAVs and scores can be delayed. The scores are calculated from many parameters, and not all of them are shown here. Until you add units, every fund counts the same, so the figures describe the list, not your actual investment. Past performance does not guarantee future returns. Nothing here is investment advice or a recommendation to buy, sell or hold any fund or share. Mutual fund investments are subject to market risks; read all scheme-related documents carefully.",
} as const;

/** The boxed Disclaimer at the end of a portfolio page (the same style as the Prism report's). */
export function PortfolioDisclaimer({ kind }: { kind: keyof typeof TEXT }) {
  return (
    <div className="pdisc" role="note" aria-labelledby={`pdisc-${kind}`}><h2 id={`pdisc-${kind}`}>Disclaimer</h2><p>{TEXT[kind]}</p></div>
  );
}
