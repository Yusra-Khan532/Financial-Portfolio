// "Community discussions" on a company report (task #43): the company's discussions from the forum, read, answered and started without
// leaving the report. Everything posted here belongs to this company and shows under the same company in the Discussion forum.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { BOARD_NAME, forumMe } from "../lib/forum";
import { Disclaimer, ThreadList, ThreadView } from "../components/forum/ForumParts";
import { SectionHead } from "./Sections";

export function CommunitySection({ symbol, name }: { symbol: string; name: string }) {
  const { data: me } = forumMe();
  const [open, setOpen] = useState<number | null>(null), [n, setN] = useState<number | null>(null);
  const top = useRef<HTMLElement>(null);
  const show = useCallback((id: number | null) => {
    setOpen(id);
    requestAnimationFrame(() => top.current?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  }, []);
  // arriving from the forum's "On the report page" link (#community): the report loads in pieces, so scroll once this section exists
  useEffect(() => { if (location.hash === "#community") { const t = window.setTimeout(() => top.current?.scrollIntoView({ block: "start" }), 400); return () => clearTimeout(t); } }, []);
  const short = name.replace(/\s+(Ltd|Limited)\.?$/i, "");
  const count = n == null ? null : `${n.toLocaleString("en-IN")} discussion${n === 1 ? "" : "s"}`;
  return (
    <section className="block fo-rep" ref={top} aria-label="Community discussions" style={{ "--sc": "var(--gold)" } as React.CSSProperties}>
      <SectionHead id="community" no="Community" icon="users" title="Community discussions" color="--gold"
        sub={`What members are saying about ${short}. Opinion only, not advice.`}
        aside={me?.signedIn ? <Link className="btn" to={`/forum/c/${encodeURIComponent(symbol)}`}>Open in the forum</Link> : undefined} />
      {me && !me.signedIn ? (
        <div className="fo-rep-gate">
          <b>Join the conversation about {short}</b>
          <span>Basic, Silver and Gold members each have their own board. Sign in (free) to read the discussions, reply and start your own.</span>
          <Link className="btn primary" to={`/login?next=${encodeURIComponent(`/stocks/${symbol}#community`)}`}>Sign in to discuss</Link>
        </div>
      ) : (
        <>
          <div className="fo-notes">
            {me?.board && <p className="fo-board fo-board-sm" role="note"><b>{BOARD_NAME[me.board]} board</b>{count ? ` · ${count}` : ""} · seen by {BOARD_NAME[me.board]} members only</p>}
            <Disclaimer compact />
          </div>
          {open != null
            ? <ThreadView id={open} onBack={() => show(null)} backLabel={`All discussions about ${short}`} />
            : <ThreadList symbol={symbol} local per={5} onOpen={show} onCount={setN} startLabel={`Start a discussion about ${short}`}
                linkTo={(t) => `/forum/t/${t.id}`} />}
          {open == null && n != null && n > 5 && <p className="fo-rep-more"><Link to={`/forum/c/${encodeURIComponent(symbol)}`}>See all {count} in the Discussion forum →</Link></p>}
        </>
      )}
    </section>
  );
}
