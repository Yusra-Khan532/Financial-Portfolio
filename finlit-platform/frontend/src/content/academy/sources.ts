// F&O Academy: the official documents the lessons cite (each address opened and read on 27 Nov 2026). A circular whose own page could not be
// opened is cited by its number and date, with SEBI's circulars list as the link.
import type { Source } from "./types";

export const SRC = {
  oct2024: { label: "SEBI circular SEBI/HO/MRD/TPD/P/CIR/2024/132, 1 October 2024: measures to strengthen the equity index derivatives framework", url: "https://www.sebi.gov.in/legal/circulars/oct-2024/measures-to-strengthen-equity-index-derivatives-framework-for-increased-investor-protection-and-market-stability_87208.html" },
  circulars: { label: "SEBI circulars (search by the circular number)", url: "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=7&smid=0" },
  risk2023: { label: "SEBI circular SEBI/HO/MIRSD/MIRSD-PoD-1/P/CIR/2023/73, 19 May 2023: risk disclosure for individual traders in equity F&O", url: "https://www.sebi.gov.in/legal/circulars/may-2023/risk-disclosure-with-respect-to-trading-by-individual-traders-in-equity-futures-and-options-segment_71426.html" },
  pr2024: { label: "SEBI press release, 23 September 2024: updated study of individual traders' profits and losses in equity F&O, FY22 to FY24", url: "https://www.sebi.gov.in/media-and-notifications/press-releases/sep-2024/updated-sebi-study-reveals-93-of-individual-traders-incurred-losses-in-equity-fando-between-fy22-and-fy24-aggregate-losses-exceed-1-8-lakh-crores-over-three-years_86906.html" },
  study2025: { label: "SEBI, July 2025: Comparative study of growth in Equity Derivatives Segment vis-à-vis Cash Market after recent measures (FY25 profits and losses)", url: "https://www.sebi.gov.in/sebi_data/attachdocs/jul-2025/1751900271726.pdf" },
  study2026: { label: "SEBI, August 2026: Profitability of Individual Traders in the Equity Derivatives Segment (FY25–FY26)", url: "https://www.sebi.gov.in/sebi_data/attachdocs/aug-2026/1787233506209.pdf" },
  behaviour2026: { label: "SEBI, August 2026: Trading Behaviour of Individual Traders in the Equity Derivatives Segment (FY25–FY26)", url: "https://www.sebi.gov.in/sebi_data/attachdocs/aug-2026/1787233601328.pdf" },
  nseCharges: { label: "NSE circular NSE/FA/73061, 27 February 2026: revision in transaction charges (from 1 March 2026)", url: "https://nsearchives.nseindia.com/content/circulars/FA73061.pdf" },
} satisfies Record<string, Source>;
