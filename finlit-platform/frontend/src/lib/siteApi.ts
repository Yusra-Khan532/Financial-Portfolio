// Client for the existing FinLit site backend (Financial-Portfolio/backend/server.py):
// content/CMS, portfolio report, contact, service enquiries, chat, market ticker, admin.
import { apiGet, apiUrl, ApiError } from "./api";

export type ContentItem = {
  id: string; title: string; slug: string; excerpt: string; author: string;
  contentType: "ARTICLE" | "PDF" | "SPREADSHEET" | "IMAGE" | "FILE";
  status: "DRAFT" | "PUBLISHED"; publishedAt?: string | null; updatedAt?: string; createdAt?: string;
  coverImageUrl?: string | null; coverImageKey?: string | null; articleHtml?: string; articleBody?: string;
  fileKey?: string | null; fileUrl?: string | null; originalFileName?: string | null; mimeType?: string | null; fileSize?: number | null;
  category?: "Myth Busters" | "Explainers" | "Hot Topics" | "Investing Basics" | "Industry Insights" | null; featured?: boolean;
};
export type PortfolioReport = {
  sourceFileName: string; generatedAt: string;
  profile: { reportPeriod: string; financialYear: string; deployedCapital: string };
  headline: { grossPnl: string; netPnl: string; grossRoi: string; netRoi: string };
  metrics: { key: string; label: string; value: string; tone?: string }[];
  charges: { total: number; totalFormatted: string; breakdown: Record<string, number> };
  tradeLedger: { security: string; symbol: string; quantity: number; buyDate: string; sellDate: string; holdingDays: number; realizedPnl: number }[];
  summary: { tradeCount: number; winningTrades: number; losingTrades: number; zeroPnlTrades: number };
  charts: {
    pnlAttribution: { stock: string; realizedPnl: number }[]; monthlyRealizedPnl: { month: string; realizedPnl: number }[];
    cumulativeRealizedPnl: { date: string; realizedPnl: number }[]; holdingPeriodDistribution: { bucket: string; trades: number }[];
    outcomes: { outcome: string; trades: number }[]; grossPnl: number;
  };
};
export type TickerItem = { name: string; symbol: string; price: number | null; change?: number | null; changePercent?: number | null; changePct?: number | null; category?: string };

async function send<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
  // The site backend stores a lead first and then emails the team; if only the email step fails it says so.
  // The visitor's message is safe, so show success (the team still sees it in the admin inbox).
  if (!res.ok && typeof data?.detail === "string" && /was saved/i.test(data.detail)) return {} as T;
  if (!res.ok) throw new ApiError(res.status, { detail: friendlyError(data, res.status) });
  return data as T;
}

/** FastAPI returns validation errors as a list; turn them into a sentence a visitor can act on. */
function friendlyError(data: any, status: number): string {
  const d = data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d.length) {
    const first = d[0];
    const field = Array.isArray(first.loc) ? String(first.loc[first.loc.length - 1]) : "";
    const msg = String(first.msg || "").replace(/^Value error, /, "");
    return field && !/valid|enter/i.test(msg) ? `${field[0].toUpperCase()}${field.slice(1)}: ${msg}` : msg || "Please check the form and try again.";
  }
  if (status === 429) return "Too many requests. Please wait a little and try again.";
  return "Something went wrong. Please try again.";
}

export const getContent = (type?: string) => apiGet<ContentItem[]>(`/api/content${type ? `?content_type=${encodeURIComponent(type)}` : ""}`);
export const getContentItem = (slug: string) => apiGet<ContentItem>(`/api/content/${encodeURIComponent(slug)}`);
export const getPortfolio = () => apiGet<PortfolioReport>("/api/portfolio/report");
export const getTicker = () => apiGet<{ items: TickerItem[] }>("/api/market-ticker");
export const assetUrl = (key: string) => apiUrl(`/api/content/assets/${encodeURIComponent(key)}`);

export type ContactPayload = { name: string; email: string; phone?: string; investment_size?: string; subject?: string; message?: string };
export const sendContact = (p: ContactPayload) => send<{ id?: string }>("/api/contact", p);
export const sendEnquiry = (p: { name: string; email: string; phone: string; services: string[]; message?: string }) => send<{ id?: string }>("/api/service-enquiry", p);
export type AssistantAnswer = { response: string; question_id?: string | null; saved_at?: string | null };
type Turn = { role: "user" | "assistant"; content: string };
export const askAssistant = (message: string, history: Turn[], preset = false, company?: string | null) =>
  send<AssistantAnswer>("/api/chat", { message, history: history.slice(-12), preset, ...(company ? { company } : {}) });

/** Task #138: the same answer, streamed. `onStep` hears each real step the site takes (saved answer, data look-ups, writing) while the visitor waits.
 *  Any problem with the stream itself (an older server, a proxy that buffers) falls back to the plain request; an answer error from the site is shown as it is. */
export async function askAssistantStream(message: string, history: Turn[], preset: boolean, onStep: (text: string) => void,
  onText: (text: string | null) => void = () => {}, company?: string | null): Promise<AssistantAnswer> {
  // onText: the answer's words as they are written (task #138); null takes back what was sent (the model turned to its data tools after all)
  const body = JSON.stringify({ message, history: history.slice(-12), preset, ...(company ? { company } : {}) });
  let res: Response;
  try {
    res = await fetch(apiUrl("/api/chat/stream"), { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "text/event-stream" }, body });
  } catch { return askAssistant(message, history, preset, company); }
  if (!res.ok || !res.body || !(res.headers.get("content-type") || "").includes("text/event-stream")) {
    if (res.status === 429 || res.status === 400) { let d: any = {}; try { d = await res.json(); } catch { /* not JSON */ } throw new ApiError(res.status, { detail: friendlyError(d, res.status) }); }
    return askAssistant(message, history, preset, company);
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let cut: number;
    while ((cut = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, cut); buf = buf.slice(cut + 2);
      const kind = /^event: (.+)$/m.exec(block)?.[1], raw = /^data: (.*)$/m.exec(block)?.[1];
      if (!kind || raw == null) continue;
      let data: any; try { data = JSON.parse(raw); } catch { continue; }
      if (kind === "step" && typeof data.text === "string") onStep(data.text);
      else if (kind === "delta" && typeof data.text === "string") onText(data.text);
      else if (kind === "retract") onText(null);
      else if (kind === "answer") return data as AssistantAnswer;
      else if (kind === "error") throw new ApiError(Number(data.status) || 502, { detail: typeof data.detail === "string" ? data.detail : friendlyError(data, 502) });
    }
    if (done) break;
  }
  return askAssistant(message, history, preset, company);   // the stream ended without an answer: ask once more the plain way
}
