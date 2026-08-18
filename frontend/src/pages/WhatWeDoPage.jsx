import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { ArrowRight, Blocks, Compass, Layers, RefreshCcw, RotateCcw, Shuffle, Target } from "lucide-react";

const GOLD = "#F5A623", TEAL = "#2DD4BF", ease = [0.22, 1, 0.36, 1];
const kpis = [[144,"","cr","India, 2026","Govt. est. 2026"],[39,"","cr","Financially literate","NCFE 2026"],[12.5,"~","cr","Investing · portfolios under ₹30L","NSE · AMFI 2026"],[38.5,"~","cr","Addressable TAM","FLV estimate",true]];
const funnel = [["144cr","Total Population","Top of funnel","Govt. est. 2026",100],["39cr","Financially Literate","Qualified audience","NCFE 2026",27],["~38.5cr","Our Audience","Core TAM","FLV estimate",26.5,true]];
const tiers = [["Tier 1 · Metros","~14cr",36,"Mumbai · Delhi NCR · Bengaluru",GOLD],["Tier 2 · Rising","~14cr",36,"Pune · Jaipur · Lucknow · Surat",TEAL],["Tier 3 & Beyond","~11cr",28,"Smaller towns · rural India","#71839A"]];
const people = [["01","Scattered","Random SIPs, no plan.",Shuffle],["02","Stuck at Zero","Ready, doesn't know how.",Compass],["03","Unstructured","Earning well, no goals.",Blocks]];
const suite = [["Research","A clearer frame for the questions worth asking."],["Portfolio Reviews","See how your investments work together."],["Financial Planning","Connect financial decisions to life goals."],["Wealth Planning","Evolve a long-term approach as capital grows."],["0 → 1 Investing","Build foundations before adding complexity."],["Global Investing","Understand where international diversification fits."],["Risk & Allocation","Treat risk and allocation as portfolio decisions."]];
const nodes = [["01","Discover","See the gap",50,13.7],["02","Diagnose","What you hold",82.2,31.9],["03","Learn","Planning basics",82.2,68.1],["04","Act","By risk & capital",50,86.3],["05","Review","Set cadence",17.8,68.1],["06","Upgrade","Wealth planning",17.8,31.9]];
const nodeSides = ["top","right","right","bottom","left","left"];
const LOOP_CX = 390, LOOP_CY = 310, LOOP_RX = 290, LOOP_RY = 225, LOOP_NR = 26;
const toOrbit = (xPct, yPct) => [xPct / 100 * 780, yPct / 100 * 620];
const orbitArc = (a, b) => { const [x1, y1] = toOrbit(a[3], a[4]); const [x2, y2] = toOrbit(b[3], b[4]); return `M${x1},${y1} A${LOOP_RX},${LOOP_RY} 0 0,1 ${x2},${y2}`; };
const labelOffset = (side) => side === "top" ? { textAlign: "center", transform: "translate(-50%, calc(-100% - 40px))" }
  : side === "bottom" ? { textAlign: "center", transform: "translate(-50%, 40px)" }
  : side === "right" ? { textAlign: "left", transform: "translate(40px, -50%)" }
  : { textAlign: "right", transform: "translate(calc(-100% - 40px), -50%)" };
const principles = [["Goals before products","Start with what the money needs to accomplish.",Target],["Portfolio before individual picks","Evaluate how investments work together.",Layers],["Review before reaction","Let the plan evolve deliberately instead of reacting to every headline.",RefreshCcw]];

function Reveal({ children, delay = 0, className = "" }) { const reduce = useReducedMotion(); return <motion.div className={className} initial={reduce ? false : { opacity:0, y:18 }} whileInView={{ opacity:1,y:0 }} viewport={{ once:true, margin:"-70px" }} transition={{ duration:reduce ? 0:.62, delay, ease }}>{children}</motion.div>; }
function Label({children}) { return <div className="text-[10px] font-medium uppercase tracking-[.3em] text-[#F5A623]">{children}</div>; }
function Badge({children,teal=false}) { return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] uppercase tracking-[.14em] ${teal ? "border-[#2DD4BF]/35 bg-[#2DD4BF]/10 text-[#5EEAD4]" : "border-white/10 text-[#71839A]"}`}><i className={`h-1.5 w-1.5 rounded-full ${teal ? "bg-[#2DD4BF]" : "bg-[#64748B]"}`} />{children}</span>; }
function CTA({to,children,ghost=false}) { return <Link to={to} className={`group inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050E1D] active:scale-[.98] ${ghost ? "border border-white/20 text-[#E2E8F0] hover:border-[#F5A623]/70 hover:text-[#F5A623]" : "bg-[#F5A623] text-[#050E1D] hover:bg-[#E8A01E] hover:shadow-[0_0_22px_rgba(245,166,35,.16)]"}`}>{children}<ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" /></Link>; }
function Count({value,prefix,suffix}) { const ref=useRef(null), visible=useInView(ref,{once:true}), reduce=useReducedMotion(), [n,setN]=useState(reduce?value:0); useEffect(()=>{if(!visible||reduce)return;let id;const start=performance.now(), tick=t=>{const p=Math.min((t-start)/820,1);setN(value*(1-Math.pow(1-p,3)));if(p<1)id=requestAnimationFrame(tick)};id=requestAnimationFrame(tick);return()=>cancelAnimationFrame(id)},[visible,reduce,value]); return <span ref={ref}>{prefix}{Number.isInteger(value)?Math.round(n):n.toFixed(1)}{suffix}</span>; }

const heroStages = [
  { name: "Confusion", x: 13, y: 80, r: 1.5, fill: "#0A1E3F", stroke: "#64748B", strokeOp: .55, sw: .8, labelOp: .6, anchor: "left" },
  { name: "Clarity", x: 40, y: 57, r: 1.9, fill: "#0A1E3F", stroke: GOLD, strokeOp: .6, sw: .9, labelOp: .72, anchor: "center" },
  { name: "Action", x: 66, y: 35, r: 2.3, fill: "#102C5E", stroke: GOLD, strokeOp: .85, sw: 1, labelOp: .85, anchor: "center" },
  { name: "Habit", x: 88, y: 15, r: 2.8, fill: GOLD, stroke: GOLD, strokeOp: 1, sw: 1, labelOp: .98, anchor: "right" },
];
const heroLabelTransform = (anchor) => anchor === "left" ? "translate(0, 20px)" : anchor === "right" ? "translate(-100%, 20px)" : "translate(-50%, 20px)";

function HeroGraphic() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(null);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });
  const onMove = (e) => { if (reduce) return; const r = e.currentTarget.getBoundingClientRect(); setParallax({ x: ((e.clientX - r.left) / r.width - .5) * 10, y: ((e.clientY - r.top) / r.height - .5) * 10 }); };
  const onLeave = () => setParallax({ x: 0, y: 0 });

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[27rem]" onMouseMove={onMove} onMouseLeave={onLeave}>
      <div className="what-we-do-grid pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_16%,rgba(245,166,35,.11),transparent_38%),radial-gradient(circle_at_14%_86%,rgba(100,116,139,.09),transparent_36%)]" />
      <motion.div animate={{ x: parallax.x, y: parallax.y }} transition={{ type: "spring", stiffness: 120, damping: 22 }} className="absolute inset-0">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible" fill="none" role="img" aria-labelledby="heroGraphicTitle">
          <title id="heroGraphicTitle">A trajectory from confusion to a confident investing habit</title>
          <defs><linearGradient id="heroLine" x1="0" y1="100" x2="100" y2="0"><stop stopColor="#64748B" stopOpacity=".6" /><stop offset="1" stopColor="#F5A623" /></linearGradient></defs>
          {[0, 1, 2].map((i) => {
            const a = heroStages[i], b = heroStages[i + 1], related = active !== null && (active === i || active === i + 1);
            return <motion.path key={`seg-${i}`} d={`M${a.x},${a.y} L${b.x},${b.y}`} stroke="url(#heroLine)" strokeWidth=".35" strokeLinecap="round" style={{ transition: "opacity .25s ease" }} opacity={active === null ? 1 : related ? 1 : .55} initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduce ? 0 : .55, delay: reduce ? 0 : .5 + i * .4, ease }} />;
          })}
          {!reduce && <motion.circle cx={heroStages[0].x} cy={heroStages[0].y} r=".9" fill="#FFE3A3" initial={{ opacity: 0, cx: heroStages[0].x, cy: heroStages[0].y }} animate={{ cx: heroStages.map((s) => s.x), cy: heroStages.map((s) => s.y), opacity: [0, 1, 1, 0] }} transition={{ duration: 2.1, ease: "easeInOut", delay: 2.6, repeat: Infinity, repeatDelay: 6.5 }} />}
          {!reduce && <motion.circle cx={heroStages[3].x} cy={heroStages[3].y} r={heroStages[3].r + 1.6} fill="none" stroke={GOLD} strokeWidth=".4" animate={{ opacity: [.12, .4, .12], scale: [1, 1.18, 1] }} transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut", delay: 2.2 }} style={{ transformOrigin: `${heroStages[3].x}px ${heroStages[3].y}px` }} />}
          {heroStages.map((s, i) => {
            const emphasized = active === i, dimmed = active !== null && !emphasized;
            return <motion.circle key={s.name} cx={s.x} cy={s.y} r={emphasized ? s.r + .4 : s.r} fill={s.fill} stroke={s.stroke} strokeWidth={s.sw} strokeOpacity={s.strokeOp} opacity={dimmed ? .68 : 1} style={{ transformOrigin: `${s.x}px ${s.y}px`, transition: "r .2s ease, opacity .2s ease" }} initial={{ scale: reduce ? 1 : 0 }} animate={{ scale: 1 }} transition={{ duration: .35, delay: reduce ? 0 : .3 + i * .35, ease }} />;
          })}
        </svg>
        {heroStages.map((s, i) => {
          const emphasized = active === i;
          return (
            <div key={`hit-${s.name}`} className="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-default" style={{ left: `${s.x}%`, top: `${s.y}%` }} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} tabIndex={0} aria-label={s.name}>
              <motion.div className="pointer-events-none absolute w-24 text-[10px] uppercase tracking-[.16em]" style={{ left: "50%", top: "50%", transform: heroLabelTransform(s.anchor), textAlign: s.anchor === "center" ? "center" : s.anchor }} initial={{ opacity: reduce ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : .4, delay: reduce ? 0 : .55 + i * .35, ease }}>
                <span style={{ transition: "color .2s ease, opacity .2s ease", opacity: emphasized ? 1 : s.labelOp }} className={emphasized ? "text-[#FFF8E7]" : "text-[#94A3B8]"}>{s.name}</span>
              </motion.div>
            </div>
          );
        })}
      </motion.div>
      <span className="pointer-events-none absolute bottom-3 right-1 text-[9px] uppercase tracking-[.22em] text-[#52647D]">FinLitVentures system</span>
    </div>
  );
}
function FunnelStage({item,index}){const ref=useRef(null), show=useInView(ref,{once:true,margin:"-100px"}),reduce=useReducedMotion(),[value,title,stage,badge,width,accent]=item;return <div ref={ref} className={`py-5 ${accent?"border-l-2 border-[#2DD4BF] pl-5":"border-l border-white/10 pl-5"}`}><div className="flex flex-wrap items-end justify-between gap-3"><div className="flex items-baseline gap-3"><span className={`font-serif-display text-4xl ${accent?"text-[#5EEAD4]":"text-white"}`}>{value}</span><div><h3 className="text-sm text-[#E2E8F0]">{title}</h3><p className="text-[10px] uppercase tracking-[.14em] text-[#64748B]">{stage}</p></div></div><Badge teal={accent}>{badge}</Badge></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[.06]"><motion.div className={`h-full rounded-full ${accent?"bg-[#2DD4BF]":"bg-[#F5A623]"}`} initial={{width:reduce?`${width}%`:0}} animate={{width:show?`${width}%`:0}} transition={{duration:reduce?0:.8,delay:reduce?0:index*.48,ease}}/></div>{accent&&<div className="mt-9 border-t border-white/10 pt-7"><Label>Who Makes Up The ~38.5cr</Label><div className="mt-5 grid gap-4 sm:grid-cols-2"><article className="relative overflow-hidden border-l-2 border-[#F5A623] bg-white/[.025] p-5"><span className="absolute right-5 top-5 h-9 w-9 bg-[#C89535] shadow-[7px_7px_0_#745322]"/><span className="text-[10px] uppercase tracking-[.18em] text-[#C89535]">Segment A</span><strong className="mt-3 block font-serif-display text-4xl text-[#E7C56B]">~26cr</strong><p className="mt-2 max-w-[15rem] text-sm text-[#CBD5E1]">Financially literate, not yet investing</p></article><article className="relative overflow-hidden border-l-2 border-[#2DD4BF] bg-[#2DD4BF]/[.035] p-5"><span className="absolute right-5 top-5 h-9 w-9 bg-[#2DD4BF] shadow-[7px_7px_0_#167F73]"/><span className="text-[10px] uppercase tracking-[.18em] text-[#5EEAD4]">Segment B</span><strong className="mt-3 block font-serif-display text-4xl text-[#5EEAD4]">~12.5cr</strong><p className="mt-2 max-w-[15rem] text-sm text-[#CBD5E1]">Already investing, under ₹30L portfolios</p></article></div><p className="mt-5 text-xs leading-relaxed text-[#94A3B8]"><span className="mr-2 text-[#5EEAD4]">FLV ESTIMATE</span>Our TAM funnel segments financially literate Indians into those planning to start investing (Segment A) and those already investing under ₹30L (Segment B). Net out ~50 lakh already-served HNIs and the addressable segment is a conservative ~38.5cr — financially aware, underserved by traditional wealth management.</p></div>}</div>}
function Geo(){const [active,setActive]=useState(0),ref=useRef(null),show=useInView(ref,{once:true}),reduce=useReducedMotion();return <div ref={ref}><div className="flex h-8 overflow-hidden rounded-md border border-white/10 bg-white/5" aria-label="Core TAM by city tier">{tiers.map(([name,,pct,,color],i)=><button type="button" key={name} aria-pressed={active===i} onMouseEnter={()=>setActive(i)} onFocus={()=>setActive(i)} onClick={()=>setActive(i)} className={`relative h-full origin-center transition-all duration-300 focus:z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${active!==i?"opacity-45":"z-[1] scale-y-110 opacity-100"}`} style={{width:show||reduce?`${pct}%`:"0%",backgroundColor:color,transitionDelay:`${i*90}ms`}}><span className="sr-only">{name}, {pct}%</span>{active===i&&<span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-[#050E1D]">{pct}%</span>}</button>)}</div><div className="mt-8 grid gap-3 sm:grid-cols-3">{tiers.map(([name,value,pct,cities,color],i)=><button type="button" key={name} onMouseEnter={()=>setActive(i)} onFocus={()=>setActive(i)} onClick={()=>setActive(i)} className={`border-t-2 py-4 text-left transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623] focus-visible:ring-offset-4 focus-visible:ring-offset-[#050E1D] ${active===i?"bg-white/[.035] px-4":"opacity-60"}`} style={{borderColor:color}}><div className="text-[10px] uppercase tracking-[.14em] text-[#71839A]">{name}</div><div className="mt-2 flex items-baseline gap-2"><span className="font-serif-display text-3xl text-white">{value}</span><span className="text-xs" style={{color}}>{pct}%</span></div><p className="mt-2 text-xs leading-relaxed text-[#94A3B8]">{cities}</p></button>)}</div></div>}
function Loop() {
  const [active, setActive] = useState(null);
  const ref = useRef(null);
  const show = useInView(ref, { once: true, margin: "-100px" });
  const reduce = useReducedMotion();
  const STEP = 0.13;
  const nodeDelay = (i) => STEP * (1 + i * 2);
  const pathDelay = (i) => STEP * (2 + i * 2);
  const [d1x, d1y] = toOrbit(nodes[0][3], nodes[0][4]);

  return (
    <div ref={ref}>
      <div className="relative mx-auto hidden aspect-[780/620] w-full max-w-[780px] lg:block">
        <svg viewBox="0 0 780 620" className="absolute inset-0 h-full w-full overflow-visible" role="img" aria-labelledby="loopTitle loopDesc">
          <title id="loopTitle">FinLitVentures Growth Loop</title>
          <desc id="loopDesc">A six-stage loop — Discover, Diagnose, Learn, Act, Review and Upgrade — where Review and Upgrade feed back into Discover as an investor's portfolio evolves.</desc>
          <defs>
            <linearGradient id="loopNodeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#102C5E" /><stop offset="100%" stopColor="#081B35" /></linearGradient>
            <radialGradient id="loopCenterGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor={TEAL} stopOpacity=".07" /><stop offset="100%" stopColor={TEAL} stopOpacity="0" /></radialGradient>
          </defs>

          <ellipse cx={LOOP_CX} cy={LOOP_CY} rx={LOOP_RX} ry={LOOP_RY} fill="none" stroke={TEAL} strokeOpacity=".12" strokeWidth="1.4" />
          <circle cx={LOOP_CX} cy={LOOP_CY} r="148" fill="url(#loopCenterGlow)" />
          <circle cx={LOOP_CX} cy={LOOP_CY} r="148" fill="none" stroke={TEAL} strokeOpacity=".16" strokeDasharray="1.5 6" />

          {nodes.map((node, i) => {
            const nextNode = nodes[(i + 1) % 6];
            const feedback = i === 5;
            const related = active !== null && (active === i || active === (i + 1) % 6);
            return (
              <motion.path
                key={`path-${node[0]}`}
                d={orbitArc(node, nextNode)}
                fill="none"
                stroke={TEAL}
                strokeWidth={feedback ? 2 : 1.6}
                style={{ transition: "stroke-opacity .2s ease" }}
                strokeOpacity={feedback ? 0.95 : active === null ? 0.42 : related ? 0.85 : 0.16}
                initial={{ pathLength: reduce ? 1 : 0 }}
                animate={{ pathLength: show ? 1 : 0 }}
                transition={{ duration: reduce ? 0 : feedback ? 0.3 : 0.22, delay: reduce ? 0 : pathDelay(i), ease }}
              />
            );
          })}

          <motion.circle
            cx={d1x} cy={d1y} r={LOOP_NR + 9} fill="none" stroke={TEAL} strokeWidth="2"
            initial={{ opacity: 0 }}
            animate={reduce ? { opacity: 0 } : show ? { opacity: [0, 0.9, 0], scale: [0.85, 1.18, 1.32] } : { opacity: 0 }}
            transition={{ duration: 0.7, delay: pathDelay(5) + 0.32, ease }}
            style={{ transformOrigin: `${d1x}px ${d1y}px` }}
          />

          {nodes.map((node, i) => {
            const [vx, vy] = toOrbit(node[3], node[4]);
            const gold = i === 3;
            const emphasized = active === i;
            const dimmed = active !== null && !emphasized;
            return (
              <motion.g
                key={`node-${node[0]}`}
                initial={{ opacity: reduce ? 1 : 0, scale: reduce ? 1 : 0.6 }}
                animate={{ opacity: show ? 1 : 0, scale: show ? 1 : 0.6 }}
                transition={{ duration: reduce ? 0 : 0.28, delay: reduce ? 0 : nodeDelay(i), ease }}
                style={{ transformOrigin: `${vx}px ${vy}px` }}
              >
                <circle
                  cx={vx} cy={vy} r={emphasized ? LOOP_NR + 2 : LOOP_NR} fill="url(#loopNodeFill)"
                  stroke={gold ? GOLD : TEAL}
                  strokeWidth={emphasized ? 2 : 1.5}
                  strokeOpacity={gold ? 1 : emphasized ? 1 : 0.72}
                  opacity={dimmed ? 0.55 : 1}
                  style={{ transition: "r .2s ease, stroke-width .2s ease, stroke-opacity .2s ease, opacity .2s ease" }}
                />
                <text
                  x={vx} y={vy} textAnchor="middle" dominantBaseline="central" fontSize="13" fontWeight="600"
                  fill={gold ? GOLD : "#E7F7F4"} opacity={dimmed ? 0.6 : 1}
                  style={{ transition: "opacity .2s ease" }}
                >{node[0]}</text>
              </motion.g>
            );
          })}
        </svg>

        {nodes.map((node, i) => {
          const [, title, sub] = node;
          const side = nodeSides[i];
          const gold = i === 3;
          const emphasized = active === i;
          return (
            <div
              key={`hit-${node[0]}`}
              className="absolute h-[52px] w-[52px] -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${node[3]}%`, top: `${node[4]}%` }}
              onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)} onBlur={() => setActive(null)}
              tabIndex={0} aria-label={`${node[0]} ${title}: ${sub}`}
            >
              <motion.div
                className="pointer-events-none absolute w-28"
                style={{ left: "50%", top: "50%", ...labelOffset(side) }}
                initial={{ opacity: reduce ? 1 : 0 }}
                animate={{ opacity: show ? 1 : 0 }}
                transition={{ duration: reduce ? 0 : 0.28, delay: reduce ? 0 : nodeDelay(i), ease }}
              >
                <div style={{ transition: "opacity .2s ease", opacity: active !== null && !emphasized ? 0.55 : 1 }}>
                  <div className={`font-serif-display text-base leading-none ${emphasized ? (gold ? "text-[#F5C669]" : "text-white") : "text-[#E2E8F0]"}`}>{title}</div>
                  <div className="mt-1 text-[10px] leading-tight text-[#71839A]">{sub}</div>
                </div>
              </motion.div>
            </div>
          );
        })}

        <motion.div
          className="pointer-events-none absolute left-1/2 top-1/2 w-44 -translate-x-1/2 -translate-y-1/2 text-center"
          initial={{ opacity: reduce ? 1 : 0 }}
          animate={{ opacity: show ? 1 : 0 }}
          transition={{ duration: reduce ? 0 : 0.35, delay: 0, ease }}
        >
          <div className="text-[9px] uppercase tracking-[.22em] text-[#5EEAD4]">Growth Loop</div>
          <div className="mt-2 text-[13px] leading-snug text-[#E2E8F0]">Confusion → Clarity<br />→ Action → Habit</div>
        </motion.div>
      </div>

      <ol className="relative ml-3 space-y-5 border-l border-[#2DD4BF]/25 pl-6 lg:hidden">
        {nodes.map(([number, title, sub], i) => {
          const gold = i === 3;
          return (
            <li key={number} className="relative">
              <span className={`absolute -left-[1.85rem] flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-medium ${gold ? "border-[#F5A623] bg-[#F5A623] text-[#050E1D]" : "border-[#2DD4BF]/50 bg-[#0A1E3F] text-[#5EEAD4]"}`}>{number}</span>
              <h3 className="font-serif-display text-xl text-white">{title}</h3>
              <p className="text-xs text-[#94A3B8]">{sub}</p>
            </li>
          );
        })}
      </ol>

      <div className="mt-7 flex items-center justify-center gap-2 text-center text-xs text-[#5EEAD4]">
        <RotateCcw size={14} />
        Review and Upgrade feed back into Discover as your portfolio evolves.
      </div>
    </div>
  );
}

export default function WhatWeDoPage(){const [cap,setCap]=useState(0);useEffect(()=>{const description="Discover how FinLitVentures helps investors move from financial confusion to structured investing through portfolio reviews, financial planning, wealth planning, global investing and research-led decision making.",old=document.title;document.title="What We Do | FinLitVentures";let meta=document.querySelector('meta[name="description"]');if(!meta){meta=document.createElement("meta");meta.setAttribute("name","description");document.head.appendChild(meta)}const previous=meta.getAttribute("content");meta.setAttribute("content",description);return()=>{document.title=old;meta.setAttribute("content",previous||"")}},[]);return <main className="pt-24 md:pt-28">
<section className="relative overflow-hidden border-b border-white/10 px-6 py-16 md:px-10 md:py-24"><div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_28%,rgba(45,212,191,.08),transparent_22%),radial-gradient(circle_at_65%_0%,rgba(212,175,55,.12),transparent_30%)]"/><div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.05fr_.95fr] lg:gap-20"><Reveal><Label>What We Do</Label><h1 className="mt-5 max-w-xl font-serif-display text-5xl leading-[.94] tracking-tight text-white sm:text-6xl lg:text-7xl">Investing, <span className="text-[#E7C56B]">decoded.</span></h1><p className="mt-7 max-w-lg text-base leading-relaxed text-[#A6B4C4] md:text-lg">Research, planning and portfolio thinking, brought together around your goals, risk profile and capital — from your first rupee to long-term wealth.</p><div className="mt-9"><CTA to="/services">Explore Our Services</CTA></div></Reveal><Reveal delay={.15}><HeroGraphic/></Reveal></div></section>
<section className="px-6 py-16 md:px-10 md:py-24"><div className="mx-auto max-w-7xl"><Reveal><Label>India's Investing Gap</Label><h2 className="mt-3 max-w-2xl font-serif-display text-3xl leading-tight text-white sm:text-4xl">India invests blind. We're the fix.</h2><p className="mt-4 max-w-2xl text-sm leading-relaxed text-[#94A3B8]">27% of Indians are financially literate — most are just starting out or investing under ₹30L, with no plan and nowhere to learn.</p></Reveal><div className="mt-10 grid border-y border-white/10 sm:grid-cols-2 lg:grid-cols-4">{kpis.map(([value,prefix,suffix,label,badge,teal],i)=><Reveal key={label} delay={i*.05} className={`group py-6 sm:px-6 ${i?"sm:border-l sm:border-white/10":"sm:pl-0"}`}><div className="transition-transform duration-300 group-hover:-translate-y-1"><div className={`font-serif-display text-4xl sm:text-5xl ${teal?"text-[#5EEAD4]":"text-white"}`}><Count value={value} prefix={prefix} suffix={suffix}/></div><p className="mt-2 min-h-9 text-xs leading-snug text-[#94A3B8]">{label}</p><div className="mt-4"><Badge teal={teal}>{badge}</Badge></div></div></Reveal>)}</div></div></section>
<section className="border-y border-white/10 bg-[#07182F]/42 px-6 py-16 md:px-10 md:py-24"><div className="mx-auto max-w-4xl"><Reveal><Label>TAM Funnel</Label><h2 className="mt-3 max-w-2xl font-serif-display text-3xl leading-tight text-white sm:text-4xl">144cr people. ~38.5cr TAM at the bottom of the funnel.</h2><p className="mt-4 text-sm text-[#94A3B8]">Real drop-off, real opportunity — funnel scaled to population.</p></Reveal><div className="mt-9">{funnel.map((item,i)=><div key={item[1]}><FunnelStage item={item} index={i}/>{i<2&&<p className="py-2 text-center text-[10px] uppercase tracking-[.16em] text-[#71839A]">{i===0?"27% conversion to literacy":"minus ~0.5cr already-served HNI segment"}</p>}</div>)}</div><Reveal delay={.12} className="mt-6"><div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-y border-white/10 py-4 text-center"><span className="font-serif-display text-2xl text-white">39cr</span><span className="text-[#64748B]">−</span><span className="font-serif-display text-2xl text-white">0.5cr</span><span className="text-[#64748B]">=</span><span className="font-serif-display text-2xl text-[#5EEAD4]">~38.5cr</span><span className="text-[10px] uppercase tracking-[.14em] text-[#5EEAD4]">Core TAM</span></div><div className="mt-5 overflow-hidden rounded-md border border-white/10"><div className="flex text-xs"><div className="w-[67.5%] bg-white/[.035] px-4 py-3 text-[#CBD5E1]">Segment A · ~26cr not yet investing</div><div className="w-[32.5%] border-l border-white/10 bg-[#2DD4BF]/[.06] px-4 py-3 text-[#A7F3D0]">Segment B · ~12.5cr investing, &lt;₹30L</div></div></div></Reveal><p className="mt-5 border-l border-[#2DD4BF]/50 pl-4 text-xs leading-relaxed text-[#94A3B8]">FLV estimate, not official market-sizing data. The figure represents financially aware investors underserved by traditional wealth management.</p></div></section>
<section className="px-6 py-16 md:px-10 md:py-24"><div className="mx-auto max-w-7xl"><Reveal><div className="flex flex-wrap items-end justify-between gap-4"><div><Label>Geographic Segmentation</Label><h2 className="mt-3 max-w-xl font-serif-display text-3xl leading-tight text-white sm:text-4xl">Not all crores are equal. Tier 1 &amp; 2 hold the wallet.</h2></div><Badge>AMFI 2026</Badge></div><p className="mt-4 max-w-2xl text-xs text-[#71839A]">TAM segmented by city tier, using AMFI's individual-investor T30/B30 asset data.</p></Reveal><Reveal delay={.1} className="mt-9"><Geo/></Reveal></div></section>
<section className="border-y border-white/10 bg-[#07182F]/42 px-6 py-16 md:px-10 md:py-24"><div className="mx-auto max-w-7xl"><Reveal><Label>Who We Help</Label><h2 className="mt-3 max-w-2xl font-serif-display text-3xl leading-tight text-white sm:text-4xl">Three investor stages. One shared need: a plan.</h2></Reveal><div className="relative mt-10 grid gap-7 sm:grid-cols-3 sm:gap-0"><div className="absolute left-0 right-0 top-0 hidden h-px bg-gradient-to-r from-[#F5A623] via-[#2DD4BF] to-[#71839A] sm:block"/>{people.map(([n,title,text,Icon],i)=><Reveal key={title} delay={i*.1} className={`group pt-6 sm:px-7 ${i?"sm:border-l sm:border-white/10":"sm:pl-0"}`}><Icon size={21} strokeWidth={1.35} className="text-[#F5A623] transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-3"/><div className="mt-5 text-[10px] tracking-[.16em] text-[#71839A]">{n}</div><h3 className="mt-1 font-serif-display text-2xl text-white">{title}</h3><p className="mt-2 max-w-xs text-sm leading-relaxed text-[#94A3B8]">{text}</p></Reveal>)}</div></div></section>
<section className="border-y border-white/10 bg-[#07182F]/42 px-6 py-16 md:px-10 md:py-24"><div className="mx-auto max-w-7xl"><Reveal className="max-w-2xl"><Label>Solution</Label><h2 className="mt-3 font-serif-display text-3xl leading-tight text-white sm:text-4xl">The FinLitVentures Growth Loop.</h2><p className="mt-4 text-sm leading-relaxed text-[#94A3B8]">Confusion → Clarity → Action → Habit.</p></Reveal><Reveal delay={.1} className="mt-10 rounded-2xl border border-[#2DD4BF]/20 bg-[radial-gradient(circle_at_50%_0%,rgba(45,212,191,.06),transparent_60%)] bg-[#081B35]/40 p-6 md:p-10"><div className="grid gap-3 border-l border-white/10 pl-5 md:grid-cols-7 md:border-l-0 md:pl-0">{suite.map(([title,description],i)=><button type="button" key={title} onMouseEnter={()=>setCap(i)} onFocus={()=>setCap(i)} onClick={()=>setCap(i)} className={`relative text-left transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623] ${cap===i?"text-white":"text-[#71839A]"}`}><span className={`absolute -left-[1.65rem] top-2 h-2.5 w-2.5 rounded-full border md:-left-0 md:top-0 ${cap===i?"border-[#F5A623] bg-[#F5A623] shadow-[0_0_12px_rgba(245,166,35,.35)]":"border-[#64748B] bg-[#050E1D]"}`}/><span className="block text-[10px] tabular-nums">0{i+1}</span><span className="mt-2 block text-sm font-medium md:pr-4">{title}</span><span className={`mt-3 hidden text-xs leading-relaxed md:block ${cap===i?"text-[#A6B4C4]":"text-[#64748B]"}`}>{description}</span></button>)}</div><div className="mt-7 border-t border-white/10 pt-5 text-sm text-[#94A3B8] md:hidden">{suite[cap][1]}</div><p className="mt-9 max-w-2xl text-sm leading-relaxed text-[#94A3B8]">Every plan is built around your <span className="text-[#E7C56B]">risk profile</span>, <span className="text-[#E7C56B]">capital</span> and goals — combining active and passive investing where appropriate.</p><Link to="/services" className="group mt-5 inline-flex items-center gap-2 text-sm text-[#E7C56B] transition-colors hover:text-[#F5A623] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623]">Explore all services <ArrowRight size={15} className="transition-transform group-hover:translate-x-1"/></Link><div className="mt-12 border-t border-white/10 pt-10 md:mt-14 md:pt-12"><Loop/></div></Reveal></div></section>
<section className="px-6 py-16 md:px-10 md:py-24"><div className="mx-auto max-w-7xl"><Reveal><Label>How We Think About Portfolios</Label><h2 className="mt-3 font-serif-display text-3xl leading-tight text-white sm:text-4xl">Built around risk, capital and goals.</h2></Reveal><div className="mt-10 grid border-y border-white/10 sm:grid-cols-3">{principles.map(([title,text,Icon],i)=><Reveal key={title} delay={i*.08} className={`group py-7 sm:px-7 ${i?"border-t border-white/10 sm:border-l sm:border-t-0":"sm:pl-0"}`}><Icon size={21} strokeWidth={1.35} className="text-[#F5A623] transition-transform duration-300 group-hover:-translate-y-1"/><h3 className="mt-4 text-sm font-medium text-[#FFF8E7]">{title}</h3><p className="mt-2 max-w-xs text-xs leading-relaxed text-[#94A3B8]">{text}</p></Reveal>)}</div></div></section>
<section className="px-6 pb-16 md:px-10 md:pb-24"><Reveal className="relative mx-auto max-w-7xl overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(circle_at_84%_32%,rgba(45,212,191,.11),transparent_27%),radial-gradient(circle_at_60%_0%,rgba(245,166,35,.12),transparent_35%)] px-7 py-12 md:px-14 md:py-16"><div className="absolute -right-16 -top-24 h-72 w-72 rounded-full border border-[#D4AF37]/20"/><div className="relative flex flex-col gap-8 md:flex-row md:items-end md:justify-between"><div className="max-w-2xl"><Label>Start with clarity</Label><h2 className="mt-4 font-serif-display text-3xl leading-tight text-white sm:text-4xl">India's investor base is growing. We're building the starting layer.</h2><p className="mt-4 text-sm leading-relaxed text-[#A6B4C4]">Research · Reviews · Financial Planning · Wealth Planning · Global Investing</p></div><div className="flex shrink-0 flex-wrap gap-3"><CTA to="/services">Explore Our Services</CTA><CTA to="/contact" ghost>Get in Touch</CTA></div></div></Reveal></section>
</main>}
