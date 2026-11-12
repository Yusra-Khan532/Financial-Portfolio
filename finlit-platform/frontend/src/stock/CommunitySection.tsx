// "Community discussions" on a company report (task #43, redesigned in task #101): the company's discussions from the forum, read, answered and started without
// leaving the report. Everything posted here belongs to this company and shows under the same company in Discussion forums.
// Task #101: the section is a panel with a header (what it is, how many discussions and comments, the button to start one), the list beside a "Trending" column,
// and a one-line strip under the company header (CommunityStrip) so the discussion is seen without scrolling to the end of the report.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/api";
import { BOARD_NAME, forumMe, useStats, ago, type Page, type Post } from "../lib/forum";
import { Disclaimer, ThreadList, ThreadView } from "../components/forum/ForumParts";
import { Icon } from "../lib/icons";
import { SectionHead } from "./Sections";

const plural = (n: number, one: string, many = one + "s") => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
const shortName = (name: string) => name.replace(/\s+(Ltd|Limited)\.?$/i, "");

/** One line under the company header: how many discussions and comments there are about this company, and the way in. A visitor is invited to sign in. */
export function CommunityStrip({ symbol, name, jump }: { symbol: string; name: string; jump: (id: string) => void }) {
  const { data: me } = forumMe();
  const stats = useStats(symbol).data;
  if (!me) return null;
  const short = shortName(name), threads = stats?.threads ?? 0, replies = stats?.replies ?? 0;
  return (
    <div className="wrap">
      <a className="fo-strip" href="#community" onClick={(e) => { e.preventDefault(); jump("community"); }} aria-label={`Community discussions about ${short}: open`}>
        <span className="fo-strip-ic" aria-hidden="true"><Icon name="users" /></span>
        <span className="fo-strip-t"><b>Community</b>
          {me.signedIn
            ? (threads ? <span>{plural(threads, "discussion")} · {plural(replies, "comment")} about {short}</span> : <span>No discussions about {short} yet. Start the first one.</span>)
            : <span>What members are saying about {short}. Sign in (free) to read and join.</span>}</span>
        <span className="fo-strip-go">{me.signedIn ? (threads ? "Read the discussion" : "Start a discussion") : "Join the conversation"} <i aria-hidden="true">→</i></span>
      </a>
    </div>
  );
}

/** The three discussions members valued most (upvotes, then comments): a quick way into the best ones. */
function Trending({ symbol, onOpen }: { symbol: string; onOpen: (id: number) => void }) {
  const { data: me } = forumMe();
  const q = useQuery<Page<{ threads: Post[] }>>({ queryKey: ["forum", "trending", symbol], enabled: !!me?.signedIn, staleTime: 60_000, retry: false,
    queryFn: () => apiGet(`/api/forum/threads?sort=top&page=1&per=3&symbol=${encodeURIComponent(symbol)}`) });
  const list = q.data?.threads ?? [];
  if (!list.length) return null;
  return (
    <aside className="fo-trend" aria-label="Trending discussions">
      <h3>Trending</h3>
      <ol>{list.map((t) => (
        <li key={t.id}><button type="button" onClick={() => onOpen(t.id)}>
          <span className="fo-trend-t">{t.title}</span>
          <span className="fo-trend-m"><span title="Upvotes">▲ {t.upvotes}</span><span>{plural(t.replies, "comment")}</span><span>{ago(t.lastActivityAt)}</span></span>
        </button></li>))}</ol>
    </aside>
  );
}

export function CommunitySection({ symbol, name }: { symbol: string; name: string }) {
  const { data: me } = forumMe();
  const stats = useStats(symbol).data;
  const [open, setOpen] = useState<number | null>(null), [n, setN] = useState<number | null>(null);
  const top = useRef<HTMLElement>(null);
  const show = useCallback((id: number | null) => {
    setOpen(id);
    requestAnimationFrame(() => top.current?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  }, []);
  // arriving from the forum's "On the report page" link (#community): the report loads in pieces, so scroll once this section exists
  useEffect(() => { if (location.hash === "#community") { const t = window.setTimeout(() => top.current?.scrollIntoView({ block: "start" }), 400); return () => clearTimeout(t); } }, []);
  const short = shortName(name);
  const count = n == null ? null : plural(n, "discussion");
  const threads = stats?.threads ?? n ?? 0, replies = stats?.replies ?? 0;
  return (
    <section className="block fo-rep" ref={top} aria-label="Community discussions" style={{ "--sc": "var(--gold)" } as React.CSSProperties}>
      <SectionHead id="community" no="19 · Community" icon="users" title="Community discussions" color="--gold"
        sub={`What members are saying about ${short}. Opinion only, not advice.`}
        aside={me?.signedIn ? <Link className="btn" to={`/forum/c/${encodeURIComponent(symbol)}`}>Open in Discussion forums</Link> : undefined} />
      {me && !me.signedIn ? (
        <div className="fo-rep-gate">
          <b>Join the conversation about {short}</b>
          <span>Basic, Silver and Gold members each have their own board. Sign in (free) to read the discussions, reply and start your own.</span>
          <Link className="btn primary" to={`/login?next=${encodeURIComponent(`/stocks/${symbol}#community`)}`}>Sign in to discuss</Link>
        </div>
      ) : (
        <div className="fo-panel">
          <div className="fo-panel-h">
            <div className="fo-counts" aria-label="Activity on this company">
              <span><b>{threads.toLocaleString("en-IN")}</b> {threads === 1 ? "discussion" : "discussions"}</span>
              <span><b>{replies.toLocaleString("en-IN")}</b> {replies === 1 ? "comment" : "comments"}</span>
              {stats?.lastActivityAt && <span>last activity {ago(stats.lastActivityAt)}</span>}
            </div>
            <div className="fo-notes">
              {me?.board && <p className="fo-board fo-board-sm" role="note"><b>{BOARD_NAME[me.board]} board</b>{count ? ` · ${count}` : ""} · seen by {BOARD_NAME[me.board]} members only</p>}
              <Disclaimer compact />
            </div>
          </div>
          <div className={"fo-hub" + (open == null ? " has-aside" : "")}>
            <div className="fo-hub-main">
              {open != null
                ? <ThreadView id={open} onBack={() => show(null)} backLabel={`All discussions about ${short}`} />
                : <ThreadList symbol={symbol} local per={5} onOpen={show} onCount={setN} startLabel={`Start a discussion about ${short}`}
                    linkTo={(t) => `/forum/t/${t.id}`} />}
              {open == null && n != null && n > 5 && <p className="fo-rep-more"><Link to={`/forum/c/${encodeURIComponent(symbol)}`}>See all {count} in Discussion forums →</Link></p>}
            </div>
            {open == null && n != null && n > 1 && <Trending symbol={symbol} onOpen={show} />}
          </div>
        </div>
      )}
    </section>
  );
}
