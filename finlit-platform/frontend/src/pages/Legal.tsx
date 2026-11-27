import { Link, useParams } from "react-router";
import { COMPANY } from "../content/site";
import { useDocTitle } from "../lib/title";

const DOCS: Record<string, { title: string; body: [string, string][] }> = {
  terms: { title: "Terms of use", body: [
    ["Who we are", `${COMPANY.name} ("FinLit") provides investment research information, portfolio reviews and planning conversations through this website.`],
    ["Information, not advice", COMPANY.disclaimer + " Nothing on this site is an offer or recommendation to buy, sell or hold any security."],
    ["Using the site", "You may use the site for your own personal, lawful purposes. Do not scrape it, attempt to break its security, or resell its data."],
    ["Accuracy", "Figures come from company filings and a market data provider (FinEdge). Our software runs automated consistency checks before a report is published, but data can still be delayed, incomplete or wrong, and prices may lag the exchange. Verify against the company's own filings before you act."],
    ["Plans and payments", "Paid website plans are not on sale yet. Sessions and reviews listed on the Services page are arranged with our team directly. Prices and features may change; changes are announced before they apply."],
    ["Liability", "To the extent the law allows, FinLit is not liable for losses arising from decisions made using the site."],
    ["Contact", `Questions: ${COMPANY.email}.`],
  ] },
  privacy: { title: "Privacy notice", body: [
    ["What we collect", "Details you give us (name, email, mobile, messages) when you contact us, enquire about a service or create an account, and basic usage data needed to run and secure the site."],
    ["Why", "To reply to you, deliver services, keep the site secure and improve it. We ask for your consent where the law requires it, and you can withdraw it at any time."],
    ["Counting visits", "We count how often each page is opened, on our own server and without cookies or anything that identifies you: the page address, the name of the site you came from (for example Google), and whether your screen is phone- or desktop-sized. Your internet address is used only for about a minute, to stop one script inflating the counts, and is not kept. Pages opened by administrators or by automated tools are not counted."],
    ["Sign-in", "You sign in with your email address and a password. We keep only a salted, one-way hash of your password, never the password itself. Administrators also use an authenticator app. We may add other ways to sign in later."],
    ["Payments", "Paid plans are not on sale yet. When they are, card and UPI details will go to the payment provider and we will not see or store them."],
    ["AI assistant", "If you use the FinLit AI chat, your messages are sent to Google (Gemini) so it can write the answer. On Google's free tier, Google may use that content to improve its products. Do not type personal details or account numbers into the chat."],
    ["Who sees it", "Service providers who help us run the site: hosting (Render), databases (Neon and MongoDB Atlas), email delivery (Resend), and Google if you use the AI chat. They process data on our behalf under their standard terms. We do not sell personal data."],
    ["Where it is stored", "Our servers and databases run on cloud services, mainly in Singapore, and some content may be held in India. The backups we take ourselves are encrypted."],
    ["Your rights", `You can ask to access, correct, export or delete your data, or withdraw consent, by writing to ${COMPANY.email}.`],
    ["Retention", "We keep data only as long as needed for the purposes above or as the law requires."],
  ] },
  disclosures: { title: "Research disclosures", body: [
    ["Not a registered adviser", COMPANY.disclaimer],
    ["How scores are made", "Research scores, pros and cons, and notes are generated automatically by fixed rules in our software from company filings and market data. They are not individually reviewed by an analyst and can be wrong or out of date. The FinLit AI chat is separate: it uses a generative AI model (Google Gemini) and can also make mistakes."],
    ["Model", "FinLit Prism, FinLit's only company score, weighs four financial-health parts (Growth & Profitability, Valuation, Quality, Risk), each read against the company's industry group; its two technical views are shown separately and are not part of the score. The score has not been back-tested against future returns and does not predict them. The method is explained on every company page and on the FinLit Prism page."],
    ["Conflicts", "Team members may hold, or may trade, securities discussed on this site, and may do so before or after anything is published. The Portfolio page shows realised results from one broker statement. It is a record of past trades, not a recommendation, not audited, and not a promise or indication of future returns."],
    ["Company names and logos", "Company names, logos and trademarks belong to their owners. FinLit shows a company's logo only beside its name, unchanged, to identify the company being described (from the company's own website, or from Logo.dev where its site offers none); this does not mean the company endorses, sponsors or is connected with FinLit. A company that wants its logo changed or removed can write to us through the contact page, and we will act on it."],
    ["Risk", "Investments in securities markets are subject to market risks, including the loss of your capital. Read all related documents carefully before investing."],
  ] },
};

export function Legal() {
  const { doc = "terms" } = useParams();
  const d = DOCS[doc];
  useDocTitle(d?.title || "Legal");
  if (!d) return <div className="wrap state"><h2>We cannot find that page</h2></div>;
  return (
    <section className="sec"><div className="wrap legal">
      <div className="eyebrow">Legal</div><h1 className="ui-title ui-title--read" style={{ margin: "8px 0 8px" }}>{d.title}</h1>
      <p className="faint">Draft for review by FinLit's legal adviser before launch. Last updated October 2026.</p>
      {d.body.map(([h, t]) => <div key={h}><h2>{h}</h2><p>{t}</p></div>)}
      <p style={{ marginTop: 32 }}>{Object.keys(DOCS).filter((k) => k !== doc).map((k) => <Link key={k} to={`/legal/${k}`} style={{ marginRight: 16 }}>{DOCS[k].title}</Link>)}</p>
    </div></section>
  );
}

export function NotFound() {
  useDocTitle("Page not found");
  return <div className="wrap state"><h2>We cannot find that page</h2><p>The link may be old or mistyped. Search for a company, or go back to the home page.</p><Link className="btn primary" to="/">Go home</Link></div>;
}
