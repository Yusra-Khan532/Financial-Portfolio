// The feedback page's questions and the pure rules that check an answer and build what is sent (task #53). The lists match backend/finlit/feedback.py.
export const FEATURES = ["Stock Screener", "Model-Based Scoring / FinLit IQ", "Set Your Own Model", "Advanced Valuation Tools", "DCF and Financial Analysis", "Extended DuPont Analysis",
  "Chart Builder and Correlation", "Portfolio Import and Analysis", "IPO Analysis", "Company News", "Discussion Forum", "Macro Economics Simulator", "Glossary", "Other"];
export const IMPROVE = ["User interface and navigation", "Data accuracy and reliability", "More financial metrics and ratios", "Better stock screening capabilities", "More detailed company analysis",
  "Faster loading and performance", "Better explanations of financial indicators", "Other"];
export const WANTED = ["Advanced portfolio analytics", "Stock comparison and peer benchmarking", "Custom alerts and notifications", "More historical financial data", "Sector-wise analysis",
  "Mutual fund analysis", "AI-assisted financial explanations", "More macroeconomic indicators", "Community discussions and investor insights", "Mobile application", "Other"];

export type Form = {
  rating: number; nps: number | null; navigation: number; data_quality: number; tools: number; speed: number;
  used: string[]; most_valuable: string; hard_to_use: string; improve: string[]; wanted: string[];
  likes: string; fix_now: string; expected: string; early_access: boolean | null; contact_ok: boolean | null; email: string;
};
export const EMPTY: Form = { rating: 0, nps: null, navigation: 0, data_quality: 0, tools: 0, speed: 0, used: [], most_valuable: "", hard_to_use: "", improve: [], wanted: [], likes: "", fix_now: "", expected: "", early_access: null, contact_ok: null, email: "" };
export const STEPS = ["Overall experience", "Features and improvements", "Final thoughts"] as const;
export const MAX_TEXT = 2000;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** What is missing or wrong on a step (empty when the step can be left). Step 1 needs the four main ratings and the 0-10 score; step 2 needs the most valuable feature when any was used; step 3 needs an address only when contact was asked for. */
export function problems(step: number, f: Form): string[] {
  const out: string[] = [];
  if (step === 0) {
    if (!f.rating) out.push("Rate your overall experience.");
    if (f.nps == null) out.push("Say how likely you are to recommend FinLit (0 to 10).");
    if (!f.navigation) out.push("Rate how easy it was to navigate.");
    if (!f.data_quality) out.push("Rate the quality and depth of the data.");
    if (!f.tools) out.push("Rate the usefulness of the analysis and tools.");
  }
  if (step === 1 && f.used.length && !f.most_valuable) out.push("Pick the feature that gives you the most value.");
  if (step === 2 && f.contact_ok && f.email.trim() && !EMAIL.test(f.email.trim())) out.push("That email address does not look right. Fix it or leave it empty.");
  return out;
}
export const clean = (s: string) => s.trim().slice(0, MAX_TEXT);
/** The body sent to POST /api/feedback. The email goes only when the person asked to be contacted. */
export function payload(f: Form, trap = ""): Record<string, unknown> {
  return { rating: f.rating, nps: f.nps, navigation: f.navigation, data_quality: f.data_quality, tools: f.tools, speed: f.speed || null, used: f.used, most_valuable: f.most_valuable || null,
    hard_to_use: clean(f.hard_to_use) || null, improve: f.improve, wanted: f.wanted, likes: clean(f.likes) || null, fix_now: clean(f.fix_now) || null, expected: clean(f.expected) || null,
    early_access: !!f.early_access, contact_ok: !!f.contact_ok, email: f.contact_ok && f.email.trim() ? f.email.trim() : null, website: trap };
}
export const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];
export const starWord = (n: number) => WORDS[n] ?? "";
