import type { PageObject } from "./types";

const SIZES = [["L", "Large cap", "The 100 biggest listed companies by full market value (1st to 100th)."], ["M", "Mid cap", "The next 150 (101st to 250th)."], ["S", "Small cap", "Every company from 251st down."]] as const;

/** How many of the list's shares fall in each AMFI size. Same sizes as the Sector and size table. */
export function CompanySize({ page }: { page: PageObject }) {
  const c = page.size_count || {};
  return (
    <section className="pfx-card pfx-wide" aria-labelledby="pfx-cs">
      <div className="pfx-h"><h2 id="pfx-cs">Company size, as AMFI defines it</h2><p className="pfx-note">AMFI updates the list every six months, so a company can move between sizes.</p></div>
      <ul className="pfx-sizes">{SIZES.map(([k, name, rule]) => <li key={k}><span className="pfx-eyebrow">{name}</span><b className="pfx-big">{c[k] ?? 0}</b><small>{(c[k] ?? 0) === 1 ? "share" : "shares"} in your list</small><p className="pfx-note">{rule}</p></li>)}</ul>
    </section>
  );
}
