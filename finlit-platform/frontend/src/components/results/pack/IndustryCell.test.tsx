import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { IndustryCell } from "./ResultsPack";

// task #192: the results tables showed the provider's own field when a company had no industry ("DVR (broad group)"); now NSE's spelling, a labelled level, or a reason
const html = (name: string | null) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  qc.setQueryData(["taxonomy-index"], { macro_sectors: [{ macro_sector: "Energy" }], sectors: [{ sector: "Oil, Gas & Consumable Fuels" }], industries: [{ industry: "Oil" }], basic_industries: [] });
  return renderToStaticMarkup(<QueryClientProvider client={qc}><IndustryCell name={name} /></QueryClientProvider>);
};

describe("a result row's group", () => {
  it("is written in NSE's spelling, a labelled higher level stays as it is, and a blank says why", () => {
    expect(html("Oil Gas & Consumable Fuels")).toBe("Oil, Gas &amp; Consumable Fuels");
    expect(html("Macro sector: Industrials")).toBe("Macro sector: Industrials");
    const none = html(null);
    expect(none).toContain("Not classified"); expect(none).toContain("not in NSE&#x27;s classification lists");
    expect(none).not.toContain("broad group");
  });
});
