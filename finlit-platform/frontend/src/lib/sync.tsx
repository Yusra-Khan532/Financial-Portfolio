// Keeps watchlists, saved screens and appearance in step with the signed-in account.
//  - On sign-in the saved copy is loaded (or, for a brand-new account, this browser's copy is uploaded once).
//  - Later changes are saved a moment after the member stops editing.
//  - On sign-out the personal lists are removed from this device; appearance stays.
import { useEffect, useRef } from "react";
import { useAuth } from "./auth";
import { DEMO } from "./demo";
import { savable } from "./ledger";
import { loadState, savePortfolio, savePrefs, saveScreens, saveWatchlist } from "./account";
import { portfolio } from "./portfolio";
import { prefs, type Prefs } from "./prefs";
import { screens } from "./screens";
import { watch } from "./watchlist";
import { RANK } from "./ui";
import { mergeAcademy } from "./academyMerge";

const NO_ACADEMY = { academyDone: [], academyQuiz: [], academyLast: "" };

const debounce = <A extends unknown[]>(fn: (...a: A) => void, ms = 900) => { let t = 0; return (...a: A) => { window.clearTimeout(t); t = window.setTimeout(() => fn(...a), ms); }; };

const OWNER = "finlit-sync-owner";
export function StateSync() {
  const { user, plan } = useAuth();
  const uid = user?.id ?? null;
  const last = useRef<string | null>(null);
  const silver = RANK[plan] >= RANK.silver;

  useEffect(() => {
    if (DEMO) return;
    if (!uid) {
      prefs.onSave(null); watch.onSave(null); screens.onSave(null); portfolio.onSave(null);
      if (last.current) { watch.reset(); screens.replace([]); portfolio.reset(); prefs.set({ wordBookmarks: [], ...NO_ACADEMY }, true); } // signed out: personal lists (and Word of the Day bookmarks and F&O Academy progress) leave this device
      last.current = null;
      return;
    }
    let cancelled = false;
    const quiet = () => undefined;
    (async () => {
      // Lists left on this browser by a different account (sign-out was skipped, or the session ended) must not be adopted by, or uploaded to, this one.
      let owner: string | null = null;
      try { owner = localStorage.getItem(OWNER); if (owner && owner !== uid) { watch.reset(); screens.replace([]); portfolio.reset(); } } catch { /* storage unavailable */ }
      const local = prefs.get();
      let saved;
      try { saved = await loadState(); } catch { return; }
      if (cancelled) return;
      try { localStorage.setItem(OWNER, uid); } catch { /* storage unavailable */ }
      // Appearance: the account wins; a new account adopts this browser's choices.
      if (saved.prefs && Object.keys(saved.prefs).length) {
        // Task #315: Word of the Day bookmarks made as a visitor on this browser (no account has used it yet) join the account's, newest first;
        // the later "opened today" date wins, so the header's dot does not come back after signing in.
        const sp = saved.prefs as Partial<Prefs>;
        const mine = !owner && local.wordBookmarks.length ? [...new Set([...local.wordBookmarks, ...(Array.isArray(sp.wordBookmarks) ? sp.wordBookmarks : [])])] : null;
        const seen = local.wordSeen > (sp.wordSeen || "") ? local.wordSeen : null;
        // F&O Academy: progress made as a visitor joins the account's the same way (lessons done from both, the higher quiz score); progress left by a
        // different account on this browser is replaced by this account's
        const acad = !owner ? mergeAcademy(local, sp) : null;
        const other = owner && owner !== uid ? { academyDone: sp.academyDone ?? [], academyQuiz: sp.academyQuiz ?? [], academyLast: sp.academyLast ?? "" } : {};
        prefs.set({ ...sp, ...other, ...(mine ? { wordBookmarks: mine } : {}), ...(seen ? { wordSeen: seen } : {}), ...(acad ?? {}) }, true);
        if (mine || seen || acad) savePrefs(prefs.get()).catch(quiet);
      } else savePrefs(prefs.get()).catch(quiet);
      if (saved.screens?.length) screens.replace(saved.screens as never); else if (screens.get().length) saveScreens(screens.get()).catch(quiet);
      const wl = saved.watchlist;
      if (wl?.lists?.length) watch.replace({ lists: wl.lists, meta: wl.meta || {} });
      else if (silver && watch.total() > 0) saveWatchlist({ lists: watch.get().lists, meta: watch.get().meta }).catch(quiet);
      const pf = saved.portfolio?.holdings;
      if (pf?.length) portfolio.replace({ holdings: pf, ...(saved.portfolio?.portfolios?.length ? { portfolios: saved.portfolio.portfolios } : {}) });
      else if (silver && portfolio.get().holdings.length) savePortfolio(savable(portfolio.get().holdings), portfolio.get().portfolios).catch(quiet);
      last.current = uid;
      portfolio.onSave(debounce((s) => { if (silver) savePortfolio(savable(s.holdings), s.portfolios).catch(quiet); }));
      prefs.onSave(debounce((p) => savePrefs(p).catch(quiet)));
      screens.onSave(debounce((s) => saveScreens(s).catch(quiet)));
      watch.onSave(debounce((s) => { if (silver) saveWatchlist({ lists: s.lists, meta: s.meta }).catch(quiet); }));
    })();
    return () => { cancelled = true; };
  }, [uid, silver]);
  return null;
}
