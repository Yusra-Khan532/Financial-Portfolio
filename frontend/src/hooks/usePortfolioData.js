import { useEffect, useMemo, useState } from "react";
import * as fallbackPortfolio from "@/data/portfolio";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

function mergeMetrics(fallbackMetrics, incomingMetrics = []) {
  const incomingByKey = new Map(incomingMetrics.map((metric) => [metric.key, metric]));
  return fallbackMetrics.map((metric) => incomingByKey.get(metric.key) || metric);
}

function mergePortfolioData(incoming) {
  if (!incoming) return { ...fallbackPortfolio, source: "static", isFallback: true };
  return {
    ...fallbackPortfolio,
    ...incoming,
    profile: { ...fallbackPortfolio.profile, ...(incoming.profile || {}) },
    headline: { ...fallbackPortfolio.headline, ...(incoming.headline || {}) },
    metrics: mergeMetrics(fallbackPortfolio.metrics, incoming.metrics),
    source: incoming.source || "pdf",
    isFallback: false,
  };
}

export function usePortfolioData() {
  const [remoteData, setRemoteData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function loadPortfolio() {
      try {
        const response = await fetch(`${API}/portfolio/report`);
        if (!response.ok) throw new Error("No published portfolio upload.");
        const payload = await response.json();
        if (active) setRemoteData(payload);
      } catch {
        if (active) setRemoteData(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    loadPortfolio();
    return () => { active = false; };
  }, []);

  const data = useMemo(() => mergePortfolioData(remoteData), [remoteData]);
  return { data, loading };
}
