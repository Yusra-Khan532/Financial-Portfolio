// F&O Academy (Learn > F&O Academy, /learn/fno-academy; the founder's MarketPulse ideas, item 6: "lessons with quizzes, inside Learn").
// Ten modules of short lessons on Indian F&O, each with a worked example in ₹, a quiz with a reason for every option and a reminder of the risk
// of loss; a payoff diagram, a Greeks explorer and a costs calculator. Open to everyone, like the rest of Learn (education, describe-only);
// only module 5's "see it on live data" links are for Trading Lab members. Progress is kept where Learn keeps a member's things (lib/academy.ts).
// Content: src/content/academy. Styles: styles/academy.css (prefix fa-). docs/TRADING-LAB.md "F&O Academy".
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { PageHeader } from "../components/PageHeader";
import { TipLayer } from "../components/lab/FlowTips";
import { CostsCalculator } from "../components/academy/CostsCalculator";
import { GreeksExplorer, IvSolver } from "../components/academy/GreeksExplorer";
import { PayoffWidget } from "../components/academy/PayoffWidget";
import { Quiz } from "../components/academy/Quiz";
import { LESSONS, MODULES, TOOLS, findLesson, findTool } from "../content/academy";
import { RISK_LINE, type Block, type Module, type Widget } from "../content/academy/types";
import { SRC } from "../content/academy/sources";
import { continueAt, isDone, moduleProgress, overallProgress, scores, setDone, setLast } from "../lib/academy";
import { useAuthMaybe } from "../lib/auth";
import { hasLab } from "../lib/lab";
import { STRUCTURES, type StructureId } from "../lib/payoff";
import { usePrefs } from "../lib/prefs";
import { useDocTitle } from "../lib/title";
import "../styles/orderflow.css";
import "../styles/academy.css";

export const BASE = "/learn/fno-academy";
const TITLE = "F&O Academy";
const DESC = "Free lessons on Indian futures and options: contracts, margins, options and the Greeks, open interest, volatility, common structures, costs and taxes, risk and SEBI's rules, each with a worked example and a quiz.";
export const FOOT = "The F&O Academy explains how exchange-traded futures and options work in India, from public rules and SEBI's own studies. It describes; it does not tell anyone what to trade, and nothing here is a view on any price. Rules, rates and lot sizes change: check the exchange's current circular. F&O carries a high risk of loss. Information only, not investment advice.";

function Bar({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="fa-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-valuetext={`${done} of ${total} lessons done`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return <>{blocks.map((b, i) => {
    if ("p" in b) return <p key={i}>{b.p}</p>;
    if ("list" in b) return <ul key={i} className="fa-list">{b.list.map((x) => <li key={x}>{x}</li>)}</ul>;
    if ("terms" in b) return <dl key={i} className="fa-terms">{b.terms.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}</dl>;
    if ("note" in b) return <p key={i} className="fa-note">{b.note}</p>;
    return <div key={i} className="fa-formula"><code>{b.formula}</code><p>{b.what}</p></div>;
  })}</>;
}

function WidgetFor({ w }: { w: Widget }) {
  if (w.kind === "payoff") return <PayoffWidget id={w.structure} />;
  if (w.kind === "greeks") return <GreeksExplorer />;
  if (w.kind === "iv") return <IvSolver />;
  return <CostsCalculator />;
}

function Tick({ on }: { on: boolean }) {
  return <span className={`fa-tick${on ? " on" : ""}`} aria-hidden="true">{on ? "✓" : ""}</span>;
}

/** The lessons of one module as a list: done ticks, the quiz score, the current lesson marked aria-current. */
function LessonList({ m, current }: { m: Module; current?: string }) {
  const p = usePrefs();
  const sc = scores(p);
  return (
    <ol className="fa-lessons">
      {m.lessons.map((l, i) => {
        const done = isDone(l.id, p), s = sc.get(l.id);
        return (
          <li key={l.id}>
            <Link to={`${BASE}/${l.id}`} aria-current={l.id === current ? "page" : undefined}>
              <Tick on={done} /><span className="fa-ln">{m.n}.{i + 1}</span><span className="fa-lt">{l.title}</span>
              {s && <span className="fa-ls">{s.score}/{s.of}</span>}
              <span className="sr-only">{done ? " (done)" : ""}{s ? ` (quiz ${s.score} of ${s.of})` : ""}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function Hub() {
  useDocTitle(TITLE, DESC);
  const p = usePrefs();
  const signedIn = !!useAuthMaybe()?.user;
  const all = overallProgress(p);
  const next = continueAt(p);
  const nx = next ? findLesson(next.id) : null;
  return (
    <>
      <PageHeader titleVariant="read" eyebrow="Learn" title={TITLE} learn={false}
        description="How Indian futures and options work, in ten short modules: worked examples in rupees, a quiz after every lesson, and tools to try the numbers." />
      <section className="fa-continue ui-card" aria-label="Your progress">
        <div>
          <p className="fa-eyebrow">{next?.started ? "Continue where you left off" : next ? "Start here" : "Every lesson is done"}</p>
          {nx ? <h2><Link to={`${BASE}/${nx.lesson.id}`}>{nx.module.n}.{nx.module.lessons.indexOf(nx.lesson) + 1} {nx.lesson.title}</Link></h2>
            : <h2>You have finished all {all.total} lessons</h2>}
          <p className="muted">{nx ? `Module ${nx.module.n}: ${nx.module.title}` : "Quizzes can be taken again at any time; your highest scores stay."}</p>
        </div>
        <div className="fa-continue-r">
          <p><b>{all.done}</b> of {all.total} lessons done</p>
          <Bar done={all.done} total={all.total} label="All lessons" />
          {nx && <Link className="ui-btn ui-btn--primary" to={`${BASE}/${nx.lesson.id}`}>{next?.started ? "Continue" : "Start lesson 1.1"}</Link>}
        </div>
      </section>
      <p className="fa-saved muted">Your progress is kept in this browser{signedIn ? " and with your account" : "; sign in to keep it with your account on every device"}.</p>

      <section aria-labelledby="fa-mods">
        <h2 id="fa-mods" className="fa-h2">Modules</h2>
        <div className="fa-mods">
          {MODULES.map((m) => {
            const mp = moduleProgress(m, p);
            return (
              <article key={m.id} className="fa-mod ui-card">
                <p className="fa-eyebrow">Module {m.n}</p>
                <h3>{m.title}</h3>
                <p className="muted">{m.line}</p>
                <div className="fa-mod-p"><Bar done={mp.done} total={mp.total} label={`Module ${m.n} progress`} /><span>{mp.done} of {mp.total}</span></div>
                <LessonList m={m} />
              </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="fa-tools">
        <h2 id="fa-tools" className="fa-h2">Practice tools</h2>
        <div className="fa-tools">
          {TOOLS.map((t) => <Link key={t.id} className="fa-tool ui-card" to={`${BASE}/${t.id}`}><h3>{t.title}</h3><p className="muted">{t.line}</p></Link>)}
        </div>
      </section>

      <section className="fa-about ui-card" aria-labelledby="fa-about">
        <h2 id="fa-about">Before you start</h2>
        <ul className="fa-list">
          <li>The Academy is free and open to everyone. It explains; it never tells anyone what to trade.</li>
          <li>Rules are described as announced, with their circular and date, as of November 2026. Rules, rates and lot sizes change: check the exchange's current circular.</li>
          <li>SEBI's own studies found that most individual traders lost money in equity F&O in every year studied: 87.7% in FY26 (<a href={SRC.study2026.url} target="_blank" rel="noopener noreferrer">SEBI, August 2026</a>). Module 9 has the details.</li>
          <li>Examples use illustrative lot sizes and premiums, and the tools use the figures you enter.</li>
        </ul>
      </section>
    </>
  );
}

function LessonView({ id }: { id: string }) {
  const found = findLesson(id)!;
  const { lesson: l, module: m, index } = found;
  const k = m.lessons.indexOf(l) + 1;
  useDocTitle(`${l.title} · ${TITLE}`, l.summary);
  const p = usePrefs();
  const auth = useAuthMaybe();
  const lab = hasLab(auth?.features);
  useEffect(() => { setLast(l.id); window.scrollTo?.(0, 0); }, [l.id]);
  const done = isDone(l.id, p);
  const mp = moduleProgress(m, p);
  const prev = index > 0 ? LESSONS[index - 1] : null, next = index < LESSONS.length - 1 ? LESSONS[index + 1] : null;
  return (
    <>
      <PageHeader titleVariant="read" learn={false} title={l.title} description={l.summary}
        back={<nav className="fa-crumbs" aria-label="Breadcrumb"><Link to={BASE}>F&O Academy</Link><span aria-hidden="true">›</span><span>Module {m.n}: {m.title}</span><span aria-hidden="true">›</span><span>Lesson {m.n}.{k}</span></nav>} />
      <div className="fa-layout">
        <aside className="fa-side" aria-label={`Module ${m.n} lessons`}>
          <details className="fa-side-d" open>
            <summary><span>Module {m.n}: {m.title}</span><span className="muted">{mp.done} of {mp.total} done</span></summary>
            <Bar done={mp.done} total={mp.total} label={`Module ${m.n} progress`} />
            <LessonList m={m} current={l.id} />
          </details>
        </aside>
        <article className="fa-lesson" aria-label={`Lesson ${m.n}.${k}: ${l.title}`}>
          <div className="fa-prose"><Blocks blocks={l.body} /></div>
          {l.widget && <WidgetFor w={l.widget} />}
          <section className="fa-example" aria-labelledby="fa-ex-h">
            <p className="fa-eyebrow">Worked example</p>
            <h2 id="fa-ex-h">{l.example.title}</h2>
            <ol>{l.example.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            <p className="fa-ex-r">{l.example.result}</p>
          </section>
          {l.live && lab && <p className="fa-live"><Link to={l.live.to}>{l.live.label}</Link><span className="muted"> (Trading Lab members)</span></p>}
          {l.sources && <section className="fa-sources" aria-label="Sources"><p className="fa-eyebrow">Sources</p><ul>{l.sources.map((s) => <li key={s.label}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a></li>)}</ul></section>}
          <Quiz key={l.id} lessonId={l.id} questions={l.quiz} />
          <div className="fa-done">
            <button type="button" className={`ui-btn ${done ? "ui-btn--secondary" : "ui-btn--primary"}`} aria-pressed={done} onClick={() => setDone(l.id, !done)}>{done ? "✓ Lesson done" : "Mark lesson as done"}</button>
          </div>
          <p className="fa-risk" role="note">{RISK_LINE}</p>
          <nav className="fa-pn" aria-label="Lessons">
            {prev ? <Link to={`${BASE}/${prev.lesson.id}`} className="fa-pn-a"><small>Previous</small><span>{prev.lesson.title}</span></Link> : <span />}
            {next ? <Link to={`${BASE}/${next.lesson.id}`} className="fa-pn-a r"><small>Next</small><span>{next.lesson.title}</span></Link> : <Link to={BASE} className="fa-pn-a r"><small>Finished</small><span>Back to the Academy</span></Link>}
          </nav>
        </article>
      </div>
    </>
  );
}

function ToolView({ id }: { id: string }) {
  const t = findTool(id)!;
  useDocTitle(`${t.title} · ${TITLE}`, t.line);
  const [s, setS] = useState<StructureId>("covered-call");
  const lesson = findLesson(t.lesson);
  return (
    <>
      <PageHeader titleVariant="read" learn={false} title={t.title} description={t.line}
        back={<nav className="fa-crumbs" aria-label="Breadcrumb"><Link to={BASE}>F&O Academy</Link><span aria-hidden="true">›</span><span>Practice tools</span></nav>} />
      <div className="fa-toolpage">
        {id === "payoff-diagram" && <>
          <label className="fa-field fa-pick" htmlFor="fa-structure"><span>Structure</span>
            <select id="fa-structure" className="ui-input" value={s} onChange={(e) => setS(e.target.value as StructureId)}>{STRUCTURES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          </label>
          <PayoffWidget key={s} id={s} />
        </>}
        {id === "greeks-explorer" && <><GreeksExplorer /><IvSolver /></>}
        {id === "costs-calculator" && <CostsCalculator />}
        {lesson && <p className="fa-live">Explained in lesson {lesson.module.n}.{lesson.module.lessons.indexOf(lesson.lesson) + 1}: <Link to={`${BASE}/${lesson.lesson.id}`}>{lesson.lesson.title}</Link></p>}
        <p className="fa-risk" role="note">{RISK_LINE}</p>
      </div>
    </>
  );
}

function Missing() {
  useDocTitle(TITLE, DESC);
  return (
    <div className="ui-card fa-missing" role="status">
      <h2>This lesson is not in the Academy</h2>
      <p className="muted">The address may be mistyped, or the lesson has moved.</p>
      <Link className="ui-btn ui-btn--primary" to={BASE}>Open the F&O Academy</Link>
    </div>
  );
}

export function FnoAcademyPage() {
  const { slug } = useParams();
  const view = !slug ? <Hub /> : findLesson(slug) ? <LessonView id={slug} /> : findTool(slug) ? <ToolView id={slug} /> : <Missing />;
  return (
    <TipLayer>
      <div className="wrap fa" data-testid="fno-academy">
        {view}
        <footer className="fa-foot"><p>{FOOT}</p></footer>
      </div>
    </TipLayer>
  );
}
