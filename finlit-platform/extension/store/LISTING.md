# Publishing the FinLit extension: what the owner does, step by step

A website cannot install an extension into someone's browser by itself: Chrome and Edge only allow one-click installs from their own stores. So the one-time job is to publish the extension there. After that the "Add to Chrome" buttons on the website open the store listing, where one click installs it and the browser keeps it updated.

## A. Chrome Web Store (about 30 minutes of work, then Google's review, usually 1 to 3 days)

1. Sign in to https://chrome.google.com/webstore/devconsole with the company Google account and pay the one-time registration fee (US$5).
2. Press **New item** and upload `extension/dist/finlit-extension-1.2.0.zip` (made by `python extension/build.py --zip`) or `frontend/public/extension/finlit-extension.zip` (the same files).
3. **Store listing** tab: paste the text below; upload `store/screenshots/*.png` (1280x800), `store/promo-tile-440x280.png` (small promo tile) and, as the icon, `icons/icon128.png`. Category: *Productivity* (or *Education*). Language: English.
4. **Privacy** tab:
   - Single purpose: *Show the meaning of a financial term, or a company's FinLit Prism score, for text the user selects.*
   - Permission justifications: **storage** (the on/off switches and a cached public company list); **contextMenus** (the right-click "Look up on FinLit" item); **activeTab** (the toolbar menu reads the current site's name for the per-site switch); **host permissions finlitventures.com, www.finlitventures.com and app.finlitventures.com** (fetch one company card, and note which of FinLit's addresses the person is signed in on); **content script on all sites** (shows the small button next to text the user selects; it reads only the selection).
   - Remote code: **No**. Data use: tick *none of the listed types are collected*; certify the three policy statements.
   - Privacy policy URL: `https://finlitventures.com/browser-extension#privacy`
5. **Distribution**: Public, all regions. Press **Submit for review**.
6. When it is approved, copy the listing address (looks like `https://chromewebstore.google.com/detail/finlit-ventures/<id>`) and send it to Claude (or put it in `frontend/src/lib/extension.ts` as `chromeStoreUrl`). The website's buttons then say **Add to Chrome** and open the listing.

## B. Microsoft Edge Add-ons (free, same zip)

1. https://partner.microsoft.com/dashboard/microsoftedge/overview, register (free), **Create new extension**, upload the same zip.
2. Fill the same text and images, privacy policy URL as above, submit. Put the listing address in `edgeStoreUrl`.

## C. Updating later

Raise `version` in `extension/manifest.json`, run `python extension/build.py --zip --site`, upload the new zip in the dashboard. Users get it automatically.

## Listing text

**Name:** FinLit Ventures: select to understand

**Summary (132 characters max):** Select any financial term or listed company on a web page and see its meaning or FinLit Prism score in a small card.

**Description:**
Select any financial term or listed company on any web page and a small FinLit card opens beside it, without leaving the page.

- Financial terms: the meaning in plain words, the formula where there is one, from the FinLit glossary of 450 terms.
- Listed companies: the FinLit Prism score with its four parts (Gold plan), market value, PE, ROE and debt to equity, with a button to open the full analysis on FinLit.

Built to be light and private: nothing happens until you select text. It reads only the words you select, never the page around them, and those words stay in your browser. Turn it off for one site or everywhere from the toolbar icon. Free. Company scores follow your FinLit plan: sign in at finlitventures.com to see them.

FinLit describes a company's financial health from its filings and prices. It is not a recommendation. Information only, not investment advice.
