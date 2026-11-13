# FinLit browser extension (task #54)

Select a financial term or a listed company on any web page and a small FinLit card opens beside it: the **glossary meaning** of a term, or a **company's FinLit score, the one your plan has**: the FinLit IQ with its two parts on Silver, FinLit Prism with its four parts on Gold (below Silver, the card says what each plan shows)
(with market value, PE, ROE and Debt/Equity), with one button to open the full analysis on FinLit.

Chrome, Edge, Brave and other Chromium browsers (Manifest V3). Free, like the rest of FinLit.

## How it behaves (and why it is light)

| Rule | How it is kept |
| --- | --- |
| The person must select something | Nothing happens until text is selected. A small green button appears beside a selection of 2 to 80 characters (up to 8 words). The card opens only when that button is pressed (or via right-click "Look up on FinLit", or `Alt+Shift+F`). |
| Only the selected words are used | The page script reads `window.getSelection()` and the selection's on-screen position, nothing else: no page text, no article, no images, no forms. Selections inside text boxes are ignored. |
| The selected words never leave the browser | They are matched on lists kept inside the extension. Only the symbol of a *recognised company* is ever requested, and only when its card is opened. |
| Glossary = no request | The 450-term glossary is bundled (`data/glossary.json`, built from the site glossary by `build.py`). |
| Company list = one cached download | The site's public search list is fetched at most once a day (with `If-None-Match`, so a repeat costs a 304), only when a lookup is asked for, and kept in extension storage. |
| Company card = one tiny request | `GET /api/ext/company/SYMBOL`: two indexed row reads, kept in Redis five minutes, no report build, no view counting. The extension also keeps a card ten minutes. |
| Plan rules stay on the server | The score and key figures are Silver (as on the site); Basic and signed-out visitors get name, sector, price, market value and a note with a link, never the score. The free showcase company stays open. |
| Does not touch the host page | One element (`<finlit-extension>`) with a closed shadow root and constructable stylesheet; every piece of remote text is set with `textContent`. Top frame only. |
| User control | Toolbar menu: a switch for the whole extension and a switch per site. |

Nothing the card says tells anyone to buy, sell or hold: it describes, and every card carries the line "Describes; not a recommendation. Information only, not investment advice."

## Files

- `manifest.json`: MV3. Permissions: `storage` (the two switches and the cached company list), `contextMenus` (the right-click item), `activeTab` (the toolbar menu reads the current site's name for the per-site switch). Host access: FinLit's own three addresses only (`finlitventures.com`, `www.`, `app.`: the sign-in cookie belongs to the exact address). One content script on `http(s)` pages.
- `content.js`: selection button and the card. `background.js`: lookups and the only network calls. `lib/`: pure logic (tested). `popup.*`: toolbar menu.
- `build.py`: refreshes `data/glossary.json` from `frontend/src/content/glossary.json`; `python extension/build.py --zip` packs `dist/finlit-extension-<version>.zip` for the store.
- Tests: `frontend/src/extension.test.ts` (logic), `backend/tests/test_ext_api.py` (the API), `backend/tests/test_extension_package.py` (manifest, glossary in step with the site, privacy rules in the code).

## Try it

1. `python extension/build.py` (refreshes the glossary), then in Chrome open `chrome://extensions`, switch on Developer mode, **Load unpacked**, choose the `extension` folder.
2. Open any news page, select "EBITDA" or "Reliance", press the green button.

For a local server, save `apiBase` (only `http://localhost:PORT` is honoured) in the extension's storage: `chrome.storage.local.set({apiBase: "http://localhost:8000"})` from the service worker console.

## Publishing (Chrome Web Store)

1. `python extension/build.py --zip`, upload `extension/dist/finlit-extension-<version>.zip` in the Developer Dashboard (one-time registration fee applies).
2. The full step-by-step for the owner, with the listing text, screenshots and promo tile, is `store/LISTING.md`. Privacy policy URL: `https://finlitventures.com/browser-extension#privacy` (same text as `PRIVACY.md`).
3. Single purpose to state: "Show the meaning of a financial term, or a company's FinLit score (FinLit IQ or FinLit Prism, by plan), for text the user selects."
4. Permission justifications: `storage` (settings and cached company list), `contextMenus` (right-click lookup), `activeTab` (read the current site name for the per-site switch), host access to finlitventures.com (the company card), content script on all sites (shows the button next to text the user selects).
5. Raise `version` in `manifest.json` for every update; rerun `build.py` whenever the site glossary changes (a test fails until you do).

Listing: **FinLit Ventures: select to understand.** Select any financial term or listed company on a web page and see its meaning or FinLit score in a small card, without leaving the page. Reads only the words you select; they stay in your browser.

## Not in version 1 (suggestions)

Firefox build; a "my watchlist" mark on a company card; the NSE/BSE-listed ETFs and mutual funds.
