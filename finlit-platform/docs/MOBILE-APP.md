# FinLit on a phone: the app-style mobile site

Owner's request of 24-25 Nov 2026, built from the approved sample (`finlit-mobile-all-pages.html`) and the team's notes on it.
This file is the checklist, the analysis and the plan; every point is proven with a test or a screenshot in the pull requests listed at the end.

## How a phone gets it

The layout follows the browser's width, not a guess at the device:

- Under **860 px** wide (every phone held upright or sideways, small tablets) the site draws the phone app: a small top bar, five bottom tabs,
  section chips, the Menu sheet and the Tools button. The same addresses, the same data, no separate site.
- **"Desktop site"** in the phone browser's menu (Chrome, Safari, Samsung Internet) lays the page out about 980 px wide, so the existing
  desktop site appears by itself. The Menu sheet also has a "Desktop site" switch that does the same on any browser (kept on that device only).

## Checklist (the owner's and the team's words, one line each)

Owner, 25 Nov:
1. "If I open the website on with the link on the mobile, it will be like this that you are will be making." (the approved sample)
2. "if I convert to desktop site on mobile, so it will transfer into the desktop site that we have."
3. "the HTML file you shared, it was good. Of that the last you shared, mobile Finlit mobile all pages"
4. "definitely the upgradations are needed"
5. "you have to search … how you can do for properly, you explore properly, analyze properly"
6. "then you have to make an implementation plan"
7. "then you have to implement"
8. "after implementation also you have to check is everything is working fine, is everything is okay"
9. "is there any issue with touching issue"
10. "any UI issue"
11. "proper upgradations in 5 times of upgradation"
12. "have a final checkpost, and then kind of release"

Owner, 23 Nov (the first ask for the phone site):
13. "make a different structure according to the mobile point of view and according to the app point view"
14. "make more compact, very much compact"
15. "small like size reducing things, because … looking very messy and big things, so … unable to fit the things"
16. Learn from Groww, Upstox and Multibagg AI, "definitely we have to make in our own style"
17. "what is being very much used at the starting" first (priority order)

Team (WhatsApp, on the sample):
18. "charts vagerah first"
19. "thoda beech mei aur space" / "Thoda space badha dete hain" / "Vertical scrolling space" / "thoda aur padding"
20. "I like the color combination" (FinLit's own colours stay)
21. "what if we add a tool button hovering on bottom right, and clicking on it expands the tools list?"

What the live site shows at 390 px (audit of 23 Nov and the before-screenshots of 25 Nov):
22. Every page ends with ~2,300 px of footer (banner and five link columns) before the page's own end.
23. "Questions about this page" adds 400-1,100 px on most pages.
24. The title card fills most of the first screen (Sector Pulse 621 px, Glossary 609 px, IPOs 394 px, Screener 342 px): the data starts on screen 2.
25. The phone menu is four screens of links; the bottom bar has no Markets, Funds or Portfolio.
26. 30-80% of links and buttons are under 40 px tall.
27. The top bar shows the Word of the Day book, Ask AI, a search icon and Sign in, but no search box.

Standing rules: numbers correct and current with every blank saying why; describe, never advise; the disclaimer stays on every page;
Silver and Gold see what their plan allows; desktop and phone, light and dark; no background job is touched.

## Root causes (one shared part each)

- Footer (22): `components/Layout.tsx` `Footer` draws the desktop footer at every width.
- Questions (23): `components/PageFaqs.tsx` draws the full accordion at every width (only `/dashboard` folds it).
- Title cards (24): `components/PageHeader.tsx` (`.ph`, 43 pages) and the older `.sp-head` / `.gp-head` / `.wp-head` cards keep the desktop
  paddings, the 36 px serif title, the eyebrow, the art and the full description on a phone.
- Navigation (25, 27): `Layout.tsx` `MobileTabs` and `Header`, `styles/phone310.css`.
- Tap sizes (26): small chips, text links and "i" buttons with no 40 px tap area under 860 px.

## Plan (one pull request each, in this order)

| PR | What | Files | Proof |
|---|---|---|---|
| A | Phone app shell: top bar (logo, search box, Ask AI); bottom tabs Home · Markets · Discover · Portfolio · Menu; section chips on the Markets, Discover and Portfolio pages; the Menu sheet (account, most used, every page by group, theme, Tools button switch, Desktop site); the Tools button; a one-line footer and the questions folded into one row on a phone | `components/mobile/*` (new), `Layout.tsx`, `styles/mobile-app.css` (new, scoped `ma-`), `lib/mobileNav.ts` (new) | unit tests for the hub map and the menu; Playwright 390 px and 360 px, light and dark: no sideways scroll, every tap 40 px+, tabs, chips, Menu, Tools button, Desktop site at 980 px |
| B | Compact title cards on a phone: one-line title, two-line description, no eyebrow or art, links as a sideways chip row, stats two to a row | `styles/mobile-app.css` (scoped to `.ph`, `.sp-head`, `.gp-head`, `.wp-head` under 860 px) | before/after heights of the title card on 16 pages |
| C | Phone Home and Markets: `/` on a phone opens "Markets today" (Nifty chart first, indices, market mood, FII and DII, popular stocks, IPOs this week, results this week, tools); `/markets` is the Markets tab's first chip | `pages/MarketsToday.tsx` (new), `pages/Landing` switch, `App.tsx` route | real live data in the screenshots; desktop `/` unchanged |
| D | Upgrade rounds 1-5 (measured each time: first-data position, page height, small taps), then the final check and release | as found | before/after tables |

Not touched: desktop layouts (everything new sits under 860 px or in new phone-only components), the portfolio pages other sessions hold
(#388, #389), data, wording of pages, jobs.
