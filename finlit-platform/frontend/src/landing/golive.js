// Task #407: the landing page's interactive parts, ported from the team's go-live pack (finlit-landing-golive-26nov.zip, index.html, 26 Nov 2026).
// The pack's two page scripts are kept close to the original so the behaviour matches the design exactly, with these changes for the live site:
//   - data comes from ./goliveData.js (areas and tools, plans, recordings) instead of JSON written into the page;
//   - the hero's company search reads the site's own search index and the latest close (opts.searchIndex, opts.quote) instead of a frozen list;
//   - links to the site are relative and go through the app's router (opts.navigate); only the WhatsApp share carries the full address;
//   - media lives under /landing/golive/; recordings are warmed when the visitor first points at the platform section, never on load;
//   - the pack's own theme button and its "preview" toast are gone (the site's header and theme switch are used); the tour follows the site's theme;
//   - every listener, observer and element added outside the page is removed when the page unmounts (the returned function).
// Every value written into the page goes through esc() first.
import { AREAS, PLANS, CLIPS, COMBINED } from "./goliveData.js";

/** @param {{ navigate: (to: string) => void, searchIndex: () => Promise<{ rows: [string, string][], sectors?: string[], sec?: number[], mc?: number[] }>, quote: (symbol: string) => Promise<{ price: number | null, changePct: number | null, priceDate: string | null } | null> }} opts
 *  @returns {() => void} */
export function initGoLive(opts) {
var listeners=[],observers=[],added=[];
function on(t,ty,fn,o){t.addEventListener(ty,fn,o);listeners.push([t,ty,fn,o])}
function track(o){observers.push(o);return o}
var G='/landing/golive/',TOUR='/landing/finlit-tour-light-720p.mp4';   /* the pack's tour files are the site's existing recordings (byte for byte) */
/* links to the site go through the app's router, so the page does not reload */
on(document,'click',function(e){if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;var a=e.target.closest&&e.target.closest('a[href^="/"]');if(!a||a.target||!(a.closest('.hh')||a.closest('.lp-rec')))return;e.preventDefault();opts.navigate(a.getAttribute('href'))});
(function(){
var B=AREAS,TP={'Free':'f','Gold':'g','Platinum':'p','MF + ETF':'m'};
var CHK='<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10.5l4 4 8-9"/></svg>';
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')}
function tag(p){return '<em class="lp-pl lp-tp-'+(TP[p]||'f')+'">'+esc(p)+'</em>'}
function iBtn(n){var v=!!recOf(n);return '<span class="lp-i'+(v?' has':'')+'" role="button" tabindex="0" data-rec="'+esc(n)+'" aria-label="'+(v?'Watch '+esc(n)+' in a short video':'About '+esc(n))+'" title="'+(v?'Watch a short video':'About this tool')+'">'+(v?PLAY:'i')+'</span>'}
function cqRow(n){for(var i=0;i<CQ.G.length;i++)for(var k=0;k<CQ.G[i].rows.length;k++)if(CQ.G[i].rows[k].n===n)return CQ.G[i].rows[k];return null}
function tags(t){if(t[2]==='Free')return tag('Free');var r=cqRow(t[1]),one=[];if(r){if(r.v[1]&&r.v[1]!=='N'&&t[2]!=='MF + ETF')one.push('MF + ETF');if(r.v[2]&&r.v[2]!=='N')one.push('Equity Portfolio')}return tag(t[2])+(one.length?'<small class="lp-also">or '+one.join(' or ')+'</small>':'')}
var CROWN='<svg class="lp-crown" viewBox="0 0 24 24" width="15" height="15" role="img" aria-label="FinLit\u2019s own model"><path d="M3 8.2l4.6 3.9L12 5l4.4 7.1L21 8.2 19.3 18H4.7z" fill="currentColor"/></svg>';
var EX={a:1,t:0};
/* parts of the product tour, in seconds; a tool with an entry here has a real recording */
var REC={'Advanced stock screener':[0,6],'Company report':[6,9.7],'FinLit Prism':[9.8,17.7],'Sector Pulse':[17.8,24],'Sector Rotation':[24,28.9],'Mutual Fund Score':[29,36.7]};
var CLIP=CLIPS;function recSlug(n){return n.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
function recOf(n){var p=G+'posters/'+recSlug(n)+'.jpg';return REC[n]?{src:TOUR,s:REC[n][0]+.9,e:REC[n][1],p:p}:CLIP[n]?{src:CLIP[n],s:0,e:null,p:p}:null}
/* warm the recordings of the area on screen, so a hover starts at once */
var WARM={};function recWarm(names){names.forEach(function(n){var r=recOf(n);if(!r)return;if(!WARM[r.p]){var im=new Image();im.src=r.p;WARM[r.p]=im}if(r.src!==TOUR&&!WARM[r.src]){var v=document.createElement('video');v.muted=true;v.preload='auto';v.src=r.src;WARM[r.src]=v}})}
function exSmall(){return innerWidth<760}
var ICO={"filter": "M3 5h18l-7 8v6l-4 2v-8z", "layers": "M12 3l9 4.5-9 4.5-9-4.5zM3 12l9 4.5 9-4.5M3 16.5l9 4.5 9-4.5", "sliders": "M4 7h9M17 7h3M4 17h3M11 17h9M15 5a2 2 0 110 4 2 2 0 010-4zM9 15a2 2 0 110 4 2 2 0 010-4z", "bookmark": "M6 3h12v18l-6-4-6 4z", "candles": "M4 7h4v9H4zM10 5h4v7h-4zM16 9h4v8h-4zM6 4v3M6 16v4M12 3v2M12 12v6M18 6v3M18 17v3", "grid": "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z", "trophy": "M8 4h8v5a4 4 0 01-8 0zM8 6H4.5a3.5 3.5 0 003.5 4M16 6h3.5a3.5 3.5 0 01-3.5 4M12 13v5M8 21h8", "code": "M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14", "list": "M9 6h11M9 12h11M9 18h11M4.5 6h.5M4.5 12h.5M4.5 18h.5", "percent": "M19 5L5 19M7 9a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z", "compass": "M12 3a9 9 0 100 18 9 9 0 000-18zM15.5 8.5l-2 5-5 2 2-5z", "building": "M5 21V5l7-2v18M12 8h7v13M8 9h1M8 13h1M8 17h1M15 12h1M15 16h1M3 21h18", "bell": "M6 16v-5a6 6 0 0112 0v5l2 2H4zM10 20a2 2 0 004 0", "users": "M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 6.5M18 14a5.5 5.5 0 013.5 6", "refresh": "M20 11a8 8 0 00-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0014.5 4.5L20 16M20 20v-4h-4", "venn": "M9 6.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM15 6.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11z", "pie": "M12 3v9h9a9 9 0 11-9-9zM15 3.5a8 8 0 015.5 5.5H15z", "chart": "M3 20h18M5 16l4-5 4 3 6-8", "scale": "M12 4v16M8 20h8M5 7h14M5 7l-3 6h6zM19 7l-3 6h6z", "gauge": "M4.5 17a8 8 0 1115 0M12 17l4-5", "database": "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3", "doc": "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5", "flag": "M5 21V4h12l-2 4 2 4H5", "clock": "M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2", "slides": "M3 4h18v12H3zM12 16v4M8 20h8", "link": "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7L11.5 6.8M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1.5-1.5", "eye": "M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z", "columns": "M4 4h5v16H4zM15 4h5v16h-5z", "calendar": "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4", "scatter": "M4 4v16h16M8 15h.5M11 11h.5M14 13h.5M17 7h.5M9 9h.5", "plus": "M12 5v14M5 12h14", "spark": "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z", "target": "M12 3a9 9 0 100 18 9 9 0 000-18zM12 7.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9zM12 11.5v1", "shield": "M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z", "calc": "M6 3h12v18H6zM9 7h6M9 11h.5M12 11h.5M15 11h.5M9 15h.5M12 15h.5M15 15h.5", "rupee": "M7 4h10M7 8h10M9 4c4 0 5 2 5 4s-2 4-6 4l6 8", "stairs": "M3 20h5v-5h5v-5h5V5h3", "bolt": "M13 2L4 14h7l-1 8 9-12h-7z", "note": "M5 4h14v12l-4 4H5zM15 20v-4h4M8 9h8M8 13h5", "phone": "M8 2h8v20H8zM11 18h2", "quad": "M4 4h16v16H4zM12 4v16M4 12h16M16 8h.5", "globe": "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z", "mic": "M9 3h6v10a3 3 0 01-6 0zM5 11a7 7 0 0014 0M12 18v3", "news": "M4 5h13v14H6a2 2 0 01-2-2zM17 9h3v8a2 2 0 01-2 2M8 9h5M8 13h5", "book": "M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3zM8 20V4", "chat": "M4 5h16v11H9l-5 4z", "cursor": "M5 3l14 7-6 1.5L10.5 18z", "plug": "M9 3v5M15 3v5M6 8h12v3a6 6 0 01-12 0zM12 17v4"};
var PLAY='<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M3.6 1.9v8.2L10.2 6z" fill="currentColor"/></svg>';
function tileH(x){var hl=x[0].charAt(0)==='*',n=hl?x[0].slice(1):x[0];return '<li class="lp-tl'+(hl?' lp-hl':'')+'"><span class="lp-tl-i"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(ICO[x[2]]||ICO.spark)+'"/></svg></span><span class="lp-tl-t"><b>'+esc(n)+'</b>'+(x[1]?'<small>'+esc(x[1]).replace(/\n/g,'<br>')+'</small>':'')+'</span></li>'}
function exDetail(t){var free=t[2]==='Free';return '<header><h3>'+esc(t[1])+(t[8]?CROWN:'')+'</h3>'+tag(t[2])+'</header><p class="lp-ex-l">'+esc(t[3])+'</p>'+(t[9]?'<ul class="lp-tls">'+t[9].map(tileH).join('')+'</ul>':'<ul>'+t[4].map(function(p){var hl=p.charAt(0)==='*';if(hl)p=p.slice(1);var c=p.indexOf(': ');return '<li'+(hl?' class="lp-hl"':'')+'>'+CHK+'<span>'+(hl&&c>0?'<b>'+esc(p.slice(0,c))+'</b>'+esc(p.slice(c+1)):esc(p))+'</span></li>'}).join('')+'</ul>')+(t[5]?'<p class="lp-ex-s">'+esc(t[5])+'</p>':'')+'<a class="lp-ex-go" href="'+(free?t[6]:'/plans')+'">'+(free?'Open '+esc(t[1]):'See what '+esc(t[2])+' includes')+' →</a>'}
function ex(){var h=document.getElementById('lp-ex');if(!h)return;var sm=exSmall(),b=B[EX.a],t=b.tools[EX.t];h.classList.toggle('lp-ex-sm',sm);
 h.querySelector('.lp-ex-a').innerHTML=B.map(function(x,i){return '<button type="button" role="tab" data-area="'+i+'" aria-selected="'+(i===EX.a)+'"><span><b>'+esc(x.name)+'</b>'+(i===EX.a&&!sm?'<small>'+esc(x.line)+'</small>':'')+'</span><i>'+x.tools.length+'</i></button>'}).join('');
 h.querySelector('.lp-ex-t').innerHTML='<p class="lp-ex-k"><span>'+(sm?esc(b.line):esc(b.name)+' · '+b.tools.length+' tools')+'</span>'+'<span class="lp-ex-st">'+(sm?'':'<span><i></i>Start here</span>')+'<span>'+CROWN+'FinLit\u2019s own model</span></span>'+'</p>'+b.tools.map(function(x,i){var on=i===EX.t&&(!sm||EX.open);return '<button type="button" data-tool="'+i+'" aria-pressed="'+on+'"'+(sm?' aria-expanded="'+on+'"':'')+'>'+(i<2?'<i class="lp-dot"></i>':'<i class="lp-dot0"></i>')+'<span>'+esc(x[1])+(x[7]?' <u class="lp-new">New</u>':'')+(x[8]?CROWN:'')+'</span>'+iBtn(x[1])+'</button>'+(sm&&on?'<div class="lp-ex-di">'+exDetail(x)+'</div>':'')}).join('');
 h.querySelector('.lp-ex-d').innerHTML=sm?'':exDetail(t);if(window.recWarmOK)recWarm(b.tools.map(function(x){return x[1]}))}
ex();
/* plans: areas down the side, plans across the top; an area opens into its tools, a tool into its parts; add-ons are the last group */
var CQ=PLANS,CS={open:{},det:{},plan:null,hl:null};
var TICK='<svg class="lq-y" viewBox="0 0 20 20" width="18" height="18" role="img" aria-label="In the plan"><path d="M4.5 10.6l3.6 3.6 7.4-8.2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',NO='<i class="lq-no" role="img" aria-label="Not in the plan"></i>';
var CHEV='<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7.5l5 5 5-5"/></svg>';
var CROWN='<svg class="lp-crown" viewBox="0 0 24 24" width="15" height="15" role="img" aria-label="FinLit’s own model"><path d="M3 8.2l4.6 3.9L12 5l4.4 7.1L21 8.2 19.3 18H4.7z" fill="currentColor"/></svg>';
var SHORT={1:'MF + ETF',2:'Equity'};
var CQ_WHO={0:'Look up any listed company',3:'Every company, scored by FinLit Prism',4:'Gold, plus sectors and the deeper tools',1:'For people who invest through funds',2:'For checking the shares you own'};
var CQ_SAY={0:'Free to start. No card needed.',3:'Everything in Free, plus {d} more tools.',4:'Everything in Gold, plus {d} more tools and higher limits.',1:'Everything in Free, plus {d} more tools for funds and ETFs.',2:'Everything in Free, plus {d} more tools for the shares you own.'};
function cqVal(v,ao){var ap=ao&&CQ.AP&&CQ.AP[ao];return v==='Y'?TICK:v==='N'?(ao?'<span class="lq-ao2" title="Not in this plan. Buy it on its own as the '+esc(ao)+' add-on'+(ap?', '+esc(ap)+' a year':'')+'."><em class="lq-add">Add-on</em><small>'+(ap?esc(ap)+' a year':'buy on its own')+'</small></span>':NO):'<b class="lq-v">'+esc(v)+'</b>'}
function cqHas(v){return v!=='N'&&v!=='A'}
function cqN(g,k){var n=0;g.rows.forEach(function(r){if(cqHas(r.v[k]))n++});return n}
function cqSum(g,k){var n=cqN(g,k),t=g.rows.length;if(g.addon){var a=t-n;return a?'<b>'+a+'</b><small>to add</small>':'<b>All in</b><small>the plan</small>'}
 return '<span class="lq-m" aria-hidden="true"><i style="width:'+Math.round(n/t*100)+'%"></i></span><b>'+n+'</b><small>of '+t+'</small>'}
function cqLow(r){var k=[0,3,4].filter(function(x){return cqHas(r.v[x])})[0];return k==null?'':CQ.P[k][0]}
/* price block: the yearly plan shown as a monthly figure, the 6-month rate struck beside it, the saving under it */
function inr(n){return '\u20b9'+Math.round(n).toLocaleString('en-IN')}
function cqPrice(k,cls){var p=CQ.P[k],q=p[4];
 if(!q)return '<div class="lq-pr free'+(cls||'')+'"><span class="lq-pm"><strong>\u20b90</strong></span></div>';
 return '<div class="lq-pr'+(cls||'')+'"><span class="lq-pm"><strong>'+inr(q.y/12)+'</strong><i>/month</i></span><em class="lq-py"><span class="lq-y1">'+inr(q.y)+' + GST</span> <span class="lq-y2">billed yearly</span></em></div>'}
/* cols: plan indexes, with 'gap' between the main plans and the one-area plans */
function cqTable(cols){var wd=innerWidth>=1100,tpl=(wd?'minmax(360px,3fr) ':'minmax(240px,2.2fr) ')+cols.map(function(k){return k==='gap'?'16px':(wd?'minmax(0,1fr)':'minmax(90px,1fr)')}).join(' '),st=' style="grid-template-columns:'+tpl+'"';
 function cc(k,i){return ' k'+k+(i===0?' cs':'')+(i===cols.length-1?' ce':'')}
 function each(fn){return cols.map(function(k,i){return k==='gap'?'<span class="lq-gap" aria-hidden="true"></span>':fn(k,cc(k,i))}).join('')}
 var gi=cols.indexOf('gap'),nMain=cols.filter(function(k){return k===0||k>2}).length,nOne=cols.filter(function(k){return k===1||k===2}).length;
 var h='<div class="lq-t"'+(CS.hl!=null?' data-hl="'+CS.hl+'"':'')+' role="table" aria-label="What each plan gives you">';
 h+='<div class="lq-r lq-head"'+st+'><div class="lq-lead">'+CQ.n+' tools in '+CQ.G.length+' areas</div>'+each(function(k,c){var p=CQ.P[k];return '<div class="lq-p'+c+'">'+(CS.hl===k?'<em class="lq-fit">Fits you</em>':'')+'<b><i style="background:'+p[2]+'"></i>'+esc(p[0])+'</b>'+cqPrice(k)+'<small>'+CQ.cnt[k]+' of '+CQ.n+' tools</small></div>'})+'</div>';
 CQ.G.forEach(function(g){var open=!!CS.open[g.id];
  h+='<div class="lq-g'+(open?' on':'')+(g.addon?' lq-ao':'')+'"><button type="button" class="lq-r lq-gh"'+st+' data-cqg="'+g.id+'" aria-expanded="'+open+'"><span class="lq-gl"><span class="lq-ch">'+CHEV+'</span><span><b>'+esc(g.name)+'</b><small>'+(g.addon?g.rows.length+' add-ons · a yearly price each':g.rows.length+' tools · '+esc(g.line))+'</small></span></span>'+each(function(k,c){return '<span class="lq-s'+c+'">'+cqSum(g,k)+'</span>'})+'</button>';
  if(open){g.rows.forEach(function(r){var d=!!CS.det[r.n],has=r.subs.length>0,lab='<span class="lq-n"><b>'+esc(r.n)+(r.usp?CROWN:'')+(r.new?'<em class="lq-new">New</em>':'')+'</b><small>'+esc(r.k||r.line)+'</small></span>';
    h+='<div class="lq-r lq-row'+(d?' on':'')+'"'+st+'>'+(has?'<button type="button" class="lq-f lq-fb" data-cqd="'+esc(r.n)+'" aria-expanded="'+d+'">'+lab+'<span class="lq-more">'+(d?'Hide':'Details')+CHEV+'</span></button>':'<div class="lq-f">'+lab+'</div>')+each(function(k,c){return '<div class="lq-c'+c+'">'+cqVal(r.v[k],r.ao)+'</div>'})+'</div>';
    if(d)r.subs.forEach(function(s){h+='<div class="lq-r lq-row lq-sub"'+st+'><div class="lq-f"><span class="lq-n"><b>'+esc(s.n)+'</b><small>'+esc(s.line)+'</small></span></div>'+each(function(k,c){return '<div class="lq-c'+c+'">'+cqVal(s.v[k],s.ao)+'</div>'})+'</div>'})});
   if(g.addon)h+='<p class="lq-aon">If your add-ons would cost more than the next plan, we offer you the plan instead.</p>'}
  h+='</div>'});
 h+='<div class="lq-r lq-cta"'+st+'><div class="lq-f">Payments open soon. Start on Free today.</div>'+each(function(k,c){return '<div class="lq-c'+c+'"><a class="btn '+(k===0?'hh-go':'hh-ghost')+'" href="/login?mode=signup">'+(k===0?'Start free':'Notify me')+'</a></div>'})+'</div>';
 return h+'</div>'}
/* phone: one plan at a time, picked from a row that stays in view; the same groups underneath */
function cqPhone(){var k=CS.plan==null?0:CS.plan,p=CQ.P[k],base=k===4?3:0,d=CQ.cnt[k]-CQ.cnt[base];
 var h='<div class="lp-pp" role="tablist" aria-label="Choose a plan to see">'+[0,3,4,1,2].map(function(x){return '<button type="button" role="tab" class="lp-pp-b" data-cqp="'+x+'" aria-selected="'+(x===k)+'">'+esc(SHORT[x]||CQ.P[x][0])+'</button>'}).join('')+'</div>';
 h+='<div class="lq-pv'+(CS.hl===k?' lq-pv-hl':'')+'" style="--pc:'+p[2]+'">'+(CS.hl===k?'<em class="lq-fit">Fits you</em>':'')+'<div class="lq-pv-t"><b><i></i>'+esc(p[0])+'</b>'+cqPrice(k,' lq-pr-ph')+'</div><p class="lq-pv-w">'+CQ_WHO[k]+'</p><span class="lq-m" role="img" aria-label="'+CQ.cnt[k]+' of '+CQ.n+' tools"><i style="width:'+Math.round(CQ.cnt[k]/CQ.n*100)+'%"></i></span><p><b>'+CQ.cnt[k]+' of '+CQ.n+' tools.</b> '+CQ_SAY[k].replace('{n}',CQ.cnt[k]).replace('{d}',d)+'</p><a class="btn lg '+(k===0?'hh-go':'hh-ghost')+'" href="/login?mode=signup">'+(k===0?'Create free account':'Tell me when '+esc(p[0])+' opens')+'</a></div><div class="lq-pa">';
 CQ.G.forEach(function(g){var open=!!CS.open[g.id],n=cqN(g,k),t=g.rows.length;
  h+='<section class="lq-g'+(open?' on':'')+(g.addon?' lq-ao':'')+'"><button type="button" class="lq-pb" data-cqg="'+g.id+'" aria-expanded="'+open+'"><span class="lq-ch">'+CHEV+'</span><span class="lq-pb-n"><b>'+esc(g.name)+'</b>'+(g.addon?'<small>'+(t-n?(t-n)+' you can add to '+esc(p[0]):'All in '+esc(p[0]))+'</small>':'<span class="lq-m" aria-hidden="true"><i style="width:'+Math.round(n/t*100)+'%"></i></span>')+'</span>'+(g.addon?'':'<em><b>'+n+'</b> of '+t+'</em>')+'</button>';
  if(open){h+='<ul class="lq-pl">'+g.rows.map(function(r){var v=r.v[k],dd=!!CS.det[r.n];return '<li class="'+(v==='N'?'no':'')+(dd?' on':'')+'"><button type="button" data-cqd="'+esc(r.n)+'" aria-expanded="'+dd+'"><span class="lq-n"><b>'+esc(r.n)+(r.usp?CROWN:'')+(r.new?'<em class="lq-new">New</em>':'')+'</b></span>'+(v==='N'?(r.ao?cqVal(v,r.ao):'<small>in '+esc(cqLow(r))+'</small>'):cqVal(v))+'</button>'+(dd?'<div class="lq-pd"><p>'+esc(r.line)+'</p>'+(r.subs.length?'<ul>'+r.subs.map(function(s){return '<li class="'+(s.v[k]==='N'?'no':'')+'"><span>'+esc(s.n)+'</span>'+cqVal(s.v[k],s.ao)+'</li>'}).join('')+'</ul>':'')+'</div>':'')+'</li>'}).join('')+'</ul>'+(g.addon?'<p class="lq-aon">If your add-ons would cost more than the next plan, we offer you the plan instead.</p>':'')}
  h+='</section>'});
 return h+'</div>'}
function cqMode(){return innerWidth>=1100?'wide':innerWidth>=760?'mid':'small'}
/* 26 Nov: the combined plan (Equity Portfolio + Mutual Fund + ETF), shown under the plans table.
   Its price and the five extras it adds from Gold are set here; the tool count (Free, both plans and the extras) is worked out from the plan data. */
var CQ_BUN=COMBINED;   /* task #410: the combined plan's price and extras live in ./goliveData.js, read by /plans too */
function cqBundle(){var a=CQ.P[2],b=CQ.P[1],g=CQ.P[3],names=CQ_BUN.extras.map(function(x){return x[0]}),has=function(v){return v&&v!=='N'},n=0;
 CQ.G.forEach(function(gr){gr.rows.forEach(function(r){if(has(r.v[0])||has(r.v[1])||has(r.v[2])||names.indexOf(r.n)>=0)n++})});
 var save=a[4].y+b[4].y-CQ_BUN.y,ok='<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>';
 return '<section class="lq-bun" aria-label="Combined plan">'
  +'<div class="lq-bun-a"><p class="lq-bun-k"><span class="lq-bun-tag">Combined plan</span><span class="lq-bun-save">'+inr(save)+' less than buying both</span></p>'
  +'<h3>'+esc(a[0])+' <span>+</span> '+esc(b[0])+'</h3><p>For investors who hold both shares and funds: both one-area plans in one, plus five extras from Gold.</p></div>'
  +'<div class="lq-bun-in"><p class="lq-bun-l">Everything in both plans</p><p class="lq-bun-pl"><span style="--pc:'+a[2]+'"><i></i>'+esc(a[0])+'</span><span style="--pc:'+b[2]+'"><i></i>'+esc(b[0])+'</span></p>'
  +'<p class="lq-bun-l">Plus, from Gold</p><ul>'+CQ_BUN.extras.map(function(x){return '<li>'+ok+'<span><b>'+esc(x[0])+'</b><small>'+esc(x[1])+'</small></span></li>'}).join('')+'</ul></div>'
  +'<div class="lq-bun-p"><div class="lq-pr lq-bun-pr"><span class="lq-pm"><strong>'+inr(CQ_BUN.y/12)+'</strong><i>/month</i></span><em class="lq-py"><span class="lq-y1">'+inr(CQ_BUN.y)+' + GST</span> <span class="lq-y2">billed yearly</span></em></div>'
  +'<span class="lq-bun-m" role="img" aria-label="'+n+' of '+CQ.n+' tools"><i style="width:'+Math.round(n/CQ.n*100)+'%"></i></span><small class="lq-bun-n">'+n+' of '+CQ.n+' tools</small>'
  +'<a class="btn lg hh-ghost" href="/login?mode=signup">Notify me</a></div>'
  +'<p class="lq-bun-up">Need Discover, the chart builder, DCF or Results? '+esc(g[0])+' has '+CQ.cnt[3]+' of '+CQ.n+' tools for '+inr(g[4].y)+' a year.</p>'
  +'</section>'}
function cq(){var el=document.getElementById('lp-cq');if(!el)return;var m=cqMode(),allG=CQ.G.every(function(g){return CS.open[g.id]});
 el.className='lp-cq-'+m;el.innerHTML=(m==='wide'?cqTable([0,3,4,1,2]):m==='small'?cqPhone():cqTable([0,3,4,1,2]))+cqBundle()+'<details class="lq-notes"'+(CS.notes?' open':'')+'><summary><span class="lq-ch">'+CHEV+'</span><b>About these plans</b><small>One-area plans, do-it-yourself add-ons, prices and GST</small></summary><div class="lq-notes-b"><p class="lq-foot">A one-area plan is added to your Free account, so its column shows everything you get, Free included. Both one-area plans bought separately are ₹5,000 a year. The combined plan above has both for ₹4,499, plus All my investments, the full dashboard, watchlists, the forum and FinLit AI. Gold includes everything in it, and more.</p><p class="lq-room"><b>Do-it-yourself add-ons.</b> A tool marked <em class="lq-add">Add-on</em> is not in that plan, but you can buy just that tool and add it to your plan for the yearly price shown under it. Any plan can also add more room for ₹199 a year each: 25 more watchlist stocks, 25 more holdings, 25 more alerts a week, or 10 more baskets. If your add-ons would cost more than the next plan, we offer you the plan instead.</p><p class="lq-n2">Expected prices, before GST. Plans are yearly: the monthly figure is the yearly price spread over 12 months, and you pay for the year at once. Payments are not live yet: start on Free and ask for a plan from your account; the team switches it on and confirms by email. Features and limits can change. FinLit gives readings, not tips: it never tells you to buy or sell. FinLit Ventures is a technology company and is not registered with SEBI or AMFI as an adviser or research analyst.</p></div></details>';
 var ld=document.querySelector('.lp-cq-lede');if(ld)ld.textContent=m==='small'?'Tap a plan to see what it gives you. Open an area to see every tool in it.':'Open an area to see its tools. Open a tool to see its parts and limits.';
 var kb=document.querySelector('.lq-bar');if(kb)kb.hidden=false;
 document.querySelector('[data-cq=groups]').textContent=allG?'Close all areas':'Open all areas';
 var cn=document.querySelector('.lp-cq-n');if(cn){cn.textContent='';cn.hidden=true}
 var nd=el.querySelector('.lq-notes');if(nd)nd.addEventListener('toggle',function(){CS.notes=nd.open})}
cq();var cqM=cqMode();
/* 26 Nov: Where to begin. Each box names the plan that fits when pointed at (phones show it straight away),
   and that plan lights up in the table below; a click still goes to it */
(function(){var gos=document.querySelectorAll('[data-goplan]');if(!gos.length)return;
 var fine=matchMedia('(hover:hover) and (pointer:fine)'),keep=null,saved=false,tm=null;
 gos.forEach(function(b){var k=+b.dataset.goplan,p=CQ.P[k],q=p[4],lb=b.querySelector('b');if(!lb||!p)return;
  b.style.setProperty('--pc',p[2]);
  var x=document.createElement('span');x.className='lp-go-x';lb.parentNode.insertBefore(x,lb);x.appendChild(lb);
  x.insertAdjacentHTML('beforeend','<span class="lp-go-s"><span class="lp-go-q" aria-hidden="true">See the plan that fits</span><span class="lp-go-p"><i></i><span>'+esc(p[0])+'</span>'+(q?'<em>'+inr(q.y/12)+'/month</em>':'')+'</span></span>');
  function on(){if(!fine.matches)return;clearTimeout(tm);if(!saved){keep=CS.hl;saved=true}if(CS.hl!==k){CS.hl=k;cq()}}
  function off(){clearTimeout(tm);tm=setTimeout(function(){if(saved){saved=false;if(CS.hl!==keep){CS.hl=keep;cq()}}},90)}
  b.addEventListener('mouseenter',on);b.addEventListener('mouseleave',off);
  b.addEventListener('focus',function(){try{if(b.matches(':focus-visible'))on()}catch(e){}});b.addEventListener('blur',off);
  b.addEventListener('click',function(){saved=false},true)});
})();
on(window,'resize',function(){var m=cqMode();if(m!==cqM){cqM=m;cq();ex()}});
function tourTheme(){var v=document.querySelector('video.lp-tour');if(!v||!v.dataset.dark)return;var dk=document.documentElement.getAttribute('data-theme')==='dark',src=dk?v.dataset.light:v.dataset.dark,po=dk?v.dataset.lightPoster:v.dataset.darkPoster;if(v.getAttribute('src')===src)return;var t=v.currentTime||0,pl=!v.paused;v.poster=po;v.src=src;v.addEventListener('loadedmetadata',function f(){v.removeEventListener('loadedmetadata',f);try{v.currentTime=t}catch(e){}if(pl){var p=v.play();if(p&&p.catch)p.catch(function(){})}});v.load()}
tourTheme();
track(new MutationObserver(tourTheme)).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
var hd=document.querySelector('header.top');if(hd&&getComputedStyle(hd).position==='sticky')document.documentElement.style.setProperty('--lp-top',hd.offsetHeight+'px');else document.documentElement.style.setProperty('--lp-top','0px');
function spy(){var cur=null;document.querySelectorAll('.lp-nav a[href^="#"]').forEach(function(a){var t=document.getElementById(a.getAttribute('href').slice(1));if(t&&t.getBoundingClientRect().top<180)cur=a});document.querySelectorAll('.lp-nav a[href^="#"]').forEach(function(a){a.classList.toggle('on',a===cur)})}
on(window,'scroll',spy,{passive:true});
on(document,'click',function(e){var b=e.target.closest('button,a');if(!b)return;
 if(b.dataset.plc){var li=b.closest('.lp-plan'),o=li.classList.toggle('open');b.setAttribute('aria-expanded',o);b.firstChild.nodeValue=o?'Hide the list ':'See what is in it ';return}
 if(b.dataset.aomore){var ao=b.closest('.lp-ao'),o2=ao.classList.toggle('open');b.setAttribute('aria-expanded',o2);b.firstChild.nodeValue=o2?'Show fewer add-ons ':'Show 6 more add-ons ';return}
 if(b.dataset.goplan!=null){e.preventDefault();var gk=+b.dataset.goplan;CS.hl=gk;CS.plan=gk;cq();document.querySelectorAll('[data-goplan]').forEach(function(x){x.setAttribute('aria-pressed',x===b)});var tg=cqMode()==='small'?document.querySelector('.lq-pv'):document.querySelector('.lq-head');if(tg){var hh=document.querySelector('header.top'),pp=cqMode()==='small'?document.querySelector('.lp-pp'):null,off=(hh?hh.offsetHeight:0)+(pp?pp.offsetHeight+12:0)+16;window.scrollTo({top:tg.getBoundingClientRect().top+scrollY-off,behavior:'smooth'})}return}
 if(b.dataset.cqp!=null){CS.plan=+b.dataset.cqp;cq();var pb=document.querySelector('.lp-pp-b[aria-selected=true]');if(pb&&pb.scrollIntoView)pb.scrollIntoView({block:'nearest',inline:'center'});return}
 if(b.dataset.cqg){CS.open[b.dataset.cqg]=!CS.open[b.dataset.cqg];cq();return}
 if(b.dataset.cqd){CS.det[b.dataset.cqd]=!CS.det[b.dataset.cqd];cq();return}
 if(b.dataset.cq==='groups'){var all=CQ.G.every(function(g){return CS.open[g.id]});CQ.G.forEach(function(g){CS.open[g.id]=!all});cq();return}
 if(b.dataset.hl!=null){var tb=b.closest('table'),k=b.dataset.hl,on=b.getAttribute('aria-pressed')!=='true';tb.querySelectorAll('.lp-ch').forEach(function(x){x.setAttribute('aria-pressed',on&&x===b)});tb.querySelectorAll('[data-c]').forEach(function(c){c.classList.toggle('lp-hl',on&&c.dataset.c===k)});return}
 if(b.dataset.area!=null){EX.a=+b.dataset.area;EX.t=0;EX.open=false;ex();if(exSmall()){var ab=document.querySelector('.lp-ex-a [aria-selected=true]');if(ab&&ab.scrollIntoView)ab.scrollIntoView({block:'nearest',inline:'center'})}return}
 if(b.dataset.tool!=null){var ti=+b.dataset.tool;EX.open=!(exSmall()&&EX.open&&EX.t===ti);EX.t=ti;ex();return}
 if(b.dataset.copy){var cp=b,txt=b.dataset.copy,done=function(ok){cp.textContent=ok?'Link copied':txt};try{navigator.clipboard.writeText(txt).then(function(){done(true)},function(){done(false)})}catch(err){done(false)}return}
 if(b.dataset.sh){var sf=b.closest('.lp-shots');sf.querySelectorAll('.lp-sh-tabs button').forEach(function(x){x.setAttribute('aria-selected',x===b)});sf.querySelectorAll('.lp-sh').forEach(function(p){p.hidden=p.dataset.shp!==b.dataset.sh});return}
 if(b.dataset.fct){var sc=b.closest('.hpz');sc.querySelectorAll('.lp-fct button').forEach(function(x){x.setAttribute('aria-selected',x===b)});sc.querySelectorAll('.lp-fp').forEach(function(p){p.hidden=p.dataset.fp!==b.dataset.fct});return}
 if(b.dataset.score){var w=b.closest('.lp-scores');w.querySelectorAll('.lp-sw button').forEach(function(x){x.setAttribute('aria-selected',x===b)});w.querySelector('#prism').hidden=b.dataset.score!=='prism';w.querySelector('#mf-score').hidden=b.dataset.score!=='mf';return}
 if(b.dataset.all!=null){var li=b.closest('.lp-area'),o=li.classList.toggle('lp-open');b.setAttribute('aria-expanded',o);b.textContent=o?b.dataset.less:b.dataset.more;return}
 if(b.tagName==='A'){var h=b.getAttribute('href')||'';if(h.charAt(0)==='#'){var t=document.getElementById(h.slice(1));if(t){e.preventDefault();t.scrollIntoView({behavior:'smooth'})}}return}
});
function exHover(e){var b=e.target&&e.target.closest&&e.target.closest('.lp-ex-t>button[data-tool]');if(!b||exSmall())return;var ti=+b.dataset.tool;if(ti===EX.t)return;EX.t=ti;var h=document.getElementById('lp-ex');if(!h)return;h.querySelectorAll('.lp-ex-t>button[data-tool]').forEach(function(x){x.setAttribute('aria-pressed',x===b)});h.querySelector('.lp-ex-d').innerHTML=exDetail(B[EX.a].tools[ti])}
on(document,'mouseover',exHover);on(document,'focusin',exHover);
on(document,'change',function(e){var t=e.target;if(t.dataset.diff==null)return;t.closest('.lp-cmp-d').querySelectorAll('table').forEach(function(tb){tb.classList.toggle('lp-diff',t.checked);diff(tb)})});
function diff(tb){var on=tb.classList.contains('lp-diff');tb.querySelectorAll('tbody tr:not(.lp-grp)').forEach(function(tr){var v=[].slice.call(tr.querySelectorAll('td:not([hidden])')).map(function(c){return c.textContent.trim()});var same=v.every(function(x){return x===v[0]});tr.hidden=on&&same});
 tb.querySelectorAll('tr.lp-grp').forEach(function(g){var n=g.nextElementSibling,any=false;while(n&&!n.classList.contains('lp-grp')){if(!n.hidden)any=true;n=n.nextElementSibling}g.hidden=!any})}
/* hero: type a company you own, pick it, and the card beside the heading becomes that company */
(function(){
/* Task #407: the pack shipped a frozen list of 5,844 companies with prices of one day; here the list is the site's own search index (the same one the
   header search uses, cached for the visit) and the price is the latest close from /api/search/quotes, shown with its own date. */
var box=document.getElementById('lp-co'),card=document.querySelector('figure.lp-card');if(!box||!card)return;
var inp=box.querySelector('input'),list=box.querySelector('.lp-co-list'),clr=box.querySelector('.lp-co-x'),EX_HTML=card.innerHTML,EX_LABEL=card.getAttribute('aria-label'),D=null,loading=null,cur=-1,hits=[],seq=0;
function load(){if(D)return Promise.resolve(D);if(!loading)loading=opts.searchIndex().then(function(ix){var S=(ix.sectors||[]).map(function(x){x=String(x).trim();return x===x.toUpperCase()?x.charAt(0)+x.slice(1).toLowerCase():x});
  D={S:S,R:ix.rows.map(function(r,i){return{s:r[0],n:r[1],sec:ix.sec?ix.sec[i]:-1,mc:ix.mc?ix.mc[i]:0,k:(r[1]+' '+r[0]).toLowerCase()}}).sort(function(a,b){return (b.mc||0)-(a.mc||0)})};return D},function(e){loading=null;throw e});return loading}
var NAMEFIX={ETERNAL:'Eternal (formerly Zomato)'};
function short(n){n=n.replace(/\s+(Ltd|Limited)\.?$/i,'');if(NAMEFIX[n])return NAMEFIX[n];if(n===n.toUpperCase()&&/[A-Z]{4}/.test(n)&&n.indexOf(' ')<0)n=n.charAt(0)+n.slice(1).toLowerCase();return n.replace(/ (Of|And|The|For) /g,function(m){return m.toLowerCase()})}
function size(mc){return mc>75000?'Large company':mc>=25000?'Mid company':mc>=10000?'Small company':mc>0?'Micro company':''}
function inr(x,d){return x.toLocaleString('en-IN',{minimumFractionDigits:d||0,maximumFractionDigits:d==null?2:d})}
function when(iso){var m=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],p=String(iso).slice(0,10).split('-');return p.length===3?(+p[2])+' '+m[+p[1]-1]+' '+p[0]:''}
var ALIAS={sbi:'SBIN','state bank':'SBIN',zomato:'ETERNAL',hul:'HINDUNILVR','l&t':'LT','l and t':'LT','m&m':'M&M',ril:'RELIANCE',airtel:'BHARTIARTL',lic:'LICI',hdfc:'HDFCBANK',icici:'ICICIBANK',kotak:'KOTAKBANK',maruti:'MARUTI',policybazaar:'POLICYBZR',jio:'JIOFIN'};
function find(q){q=q.trim().toLowerCase();if(q.length<2||!D)return[];var a=[],b=[],c=[],R=D.R,al=ALIAS[q];if(al){for(var z=0;z<R.length;z++)if(R[z].s===al){a.push(R[z]);break}}for(var i=0;i<R.length&&a.length<6;i++){var r=R[i],n=r.n.toLowerCase();if(a.indexOf(r)>=0)continue;if(n.indexOf(q)===0||r.s.toLowerCase()===q)a.push(r);else if(b.length<6&&(n.indexOf(' '+q)>0||r.s.toLowerCase().indexOf(q)===0))b.push(r);else if(c.length<6&&r.k.indexOf(q)>=0)c.push(r)}return a.concat(b,c).slice(0,6)}
function mark(n,q){var i=n.toLowerCase().indexOf(q.trim().toLowerCase());return i<0?esc(n):esc(n.slice(0,i))+'<b>'+esc(n.slice(i,i+q.trim().length))+'</b>'+esc(n.slice(i+q.trim().length))}
function show(){var q=inp.value;clr.hidden=!q;if(q.trim().length<2){list.hidden=true;inp.setAttribute('aria-expanded','false');return}
 if(!D){list.innerHTML='<li class="lp-co-f" aria-hidden="true">Loading the list of companies…</li>';list.hidden=false;inp.setAttribute('aria-expanded','true');
  load().then(function(){if(inp.value===q)show()},function(){list.innerHTML='<li class="lp-co-0">The list of companies could not load. Try again in a moment.</li>'});return}
 hits=find(q);cur=-1;
 list.innerHTML=hits.length?hits.map(function(r,i){return '<li role="option" id="lp-co-o'+i+'" data-i="'+i+'"><span><b class="lp-co-n">'+mark(short(r.n),q)+'</b><small>'+esc(r.s)+(D.S[r.sec]?' · '+esc(D.S[r.sec]):'')+'</small></span><em>'+esc(size(r.mc).replace(' company',''))+'</em></li>'}).join('')+'<li class="lp-co-f" aria-hidden="true">'+inr(D.R.length,0)+' listed companies to choose from</li>':'<li class="lp-co-0">No company by that name. Check the spelling, or try its NSE symbol.</li>';
 list.hidden=false;inp.setAttribute('aria-expanded','true')}
function hi(){[].forEach.call(list.querySelectorAll('[role=option]'),function(li,i){li.setAttribute('aria-selected',i===cur)});inp.setAttribute('aria-activedescendant',cur>=0?'lp-co-o'+cur:'')}
function wa(r){return 'https://wa.me/?text='+encodeURIComponent(short(r.n)+' on FinLit. Open it on a laptop: https://finlitventures.com/stocks/'+encodeURIComponent(r.s))}
function acts(r){var u='/stocks/'+encodeURIComponent(r.s);return '<div class="lp-co-act"><a class="btn lg hh-go" href="'+u+'">Open '+esc(short(r.n))+'’s report →</a><a class="btn lg hh-ghost lp-co-wa" href="'+wa(r)+'" target="_blank" rel="noopener">Send this report to my laptop</a></div>'}
function pxHtml(q){if(!q||q.price==null)return '<p class="lp-co-px"><small>No traded price yet</small></p>';var ch=q.changePct;return '<p class="lp-co-px"><b>₹'+inr(q.price)+'</b>'+(ch!=null?'<span class="'+(ch>=0?'up':'dn')+'">'+(ch>=0?'▲ +':'▼ −')+Math.abs(ch).toFixed(2)+'%</span>':'')+(q.priceDate?'<small>close, '+esc(when(q.priceDate))+'</small>':'')+'</p>'}
var vid=document.getElementById('lp-vid');
function pick(r){var my=++seq;card.hidden=false;if(vid){vid.hidden=true;var vv=vid.querySelector('video');if(vv)vv.pause()}list.hidden=true;inp.setAttribute('aria-expanded','false');inp.value=short(r.n);clr.hidden=false;inp.blur();card.classList.add('lp-co-on');
 if(r.s==='RELIANCE'){card.innerHTML=EX_HTML+acts(r)+'<p class="lp-co-bk"><button type="button" class="lp-co-back" data-coback="1">Back to the product tour</button></p>';card.setAttribute('aria-label',EX_LABEL)}
 else{card.setAttribute('aria-label',short(r.n)+' on FinLit');
  card.innerHTML='<header><span class="lp-co-av" aria-hidden="true">'+esc(short(r.n).charAt(0))+'</span><span class="lp-co-t"><b>'+esc(short(r.n))+'</b><small>'+(/^\d+$/.test(r.s)?'BSE: ':'NSE: ')+esc(r.s)+(D&&D.S[r.sec]?' · '+esc(D.S[r.sec]):'')+'</small></span><span class="lp-tag">'+esc(size(r.mc))+'</span></header><div class="lp-co-pxw" aria-live="polite"><p class="lp-co-px"><small>Loading the latest close…</small></p></div>'+(r.mc?'<p class="lp-co-mc">Market value ₹'+inr(r.mc,0)+' Cr</p>':'')+
  '<div class="lp-co-free"><h4>Free for this company, no card needed</h4><ul><li>'+CHK+'Company report: overview, financial statements, key ratios</li><li>'+CHK+'Latest quarter, shareholding and peers</li><li>'+CHK+'Annual reports and investor presentations</li></ul></div>'+
  '<div class="lp-co-lock"><span class="lp-co-ring" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z"/></svg></span><span><b>FinLit Prism rating</b><small>Four parts and two technical views, rated after the last close. Opens with Gold or Equity Portfolio.</small></span></div>'+acts(r)+
  '<figcaption>What opens for '+esc(short(r.n))+' on FinLit. Shown as an example, not a recommendation. <button type="button" class="lp-co-back" data-coback="1">Back to the product tour</button></figcaption>';
  opts.quote(r.s).then(function(q){if(my!==seq)return;var w=card.querySelector('.lp-co-pxw');if(w)w.innerHTML=pxHtml(q)},function(){if(my!==seq)return;var w=card.querySelector('.lp-co-pxw');if(w)w.innerHTML='<p class="lp-co-px"><small>The latest close could not load</small></p>'})}
 if(innerWidth<980){var y=card.getBoundingClientRect().top+scrollY-76;scrollTo({top:y,behavior:'smooth'})}}
function reset(){seq++;if(vid){card.hidden=true;vid.hidden=false;var vv=vid.querySelector('video');if(vv){var pr=vv.play();if(pr&&pr.catch)pr.catch(function(){})}}card.innerHTML=EX_HTML;card.setAttribute('aria-label',EX_LABEL);card.classList.remove('lp-co-on');inp.value='';clr.hidden=true;list.hidden=true}
inp.addEventListener('input',show);inp.addEventListener('focus',function(){load().catch(function(){});if(inp.value.trim().length>=2)show()});
inp.addEventListener('keydown',function(e){if(list.hidden)return;if(e.key==='ArrowDown'){e.preventDefault();cur=Math.min(hits.length-1,cur+1);hi()}else if(e.key==='ArrowUp'){e.preventDefault();cur=Math.max(0,cur-1);hi()}else if(e.key==='Enter'){e.preventDefault();var r=hits[cur<0?0:cur];if(r)pick(r)}else if(e.key==='Escape'){list.hidden=true;inp.setAttribute('aria-expanded','false')}});
list.addEventListener('mousedown',function(e){e.preventDefault()});
list.addEventListener('click',function(e){var li=e.target.closest('[data-i]');if(li)pick(hits[+li.dataset.i])});
on(document,'click',function(e){var t=e.target.closest&&e.target.closest('[data-co],[data-coback],.lp-co-x');if(t){if(t.dataset.co){var sym=t.dataset.co;load().then(function(d){var r=d.R.filter(function(x){return x.s===sym})[0];if(r)pick(r)},function(){})}else{reset();if(t.classList.contains('lp-co-x'))inp.focus()}return}if(!(e.target.closest&&e.target.closest('#lp-co'))){list.hidden=true;inp.setAttribute('aria-expanded','false')}});
})();
/* product tour in the hero, and a recording behind the i button of every tool */
(function(){
var CH=[['Screener',0],['Company report',6],['FinLit Prism',9.8],['Sector Pulse',17.8],['Sector Rotation',24],['Mutual Fund Score',29],['Portfolio',36.8]];
var fig=document.getElementById('lp-vid'),v=fig&&fig.querySelector('video'),cc=fig&&fig.querySelector('.lp-vid-c');
if(v&&cc){cc.innerHTML=CH.map(function(c,i){return '<button type="button" data-ch="'+i+'">'+esc(c[0])+'</button>'}).join('');
 var bs=cc.querySelectorAll('button');function mark(){var t=v.currentTime,k=0;CH.forEach(function(c,i){if(t>=c[1])k=i});[].forEach.call(bs,function(b,i){b.setAttribute('aria-pressed',i===k)})}
 v.addEventListener('timeupdate',mark);mark();
 cc.addEventListener('click',function(e){var b=e.target.closest('[data-ch]');if(!b)return;v.currentTime=CH[+b.dataset.ch][1]+.05;var p=v.play();if(p&&p.catch)p.catch(function(){})})}
function tool(n){for(var i=0;i<B.length;i++)for(var k=0;k<B[i].tools.length;k++)if(B[i].tools[k][1]===n)return B[i].tools[k];return null}
/* one player, used by both the hover preview and the full window */
function player(box,r,label){box.style.backgroundImage='url("'+r.p+'")';box.innerHTML='<video src="'+r.src+'" poster="'+r.p+'" muted playsinline preload="auto" aria-label="'+esc(label)+' on the live site"'+(r.e==null?' loop':'')+'></video>';var x=box.querySelector('video');
 x.addEventListener('loadedmetadata',function(){if(r.s)x.currentTime=r.s});if(r.e!=null)x.addEventListener('timeupdate',function(){if(x.currentTime>=r.e||x.currentTime<r.s-.3)x.currentTime=r.s});
 if(x.readyState>=1&&r.s)x.currentTime=r.s;var p=x.play();if(p&&p.catch)p.catch(function(){});return x}
/* hover preview */
var pop=document.createElement('div');pop.className='lp-pop';pop.hidden=true;pop.innerHTML='<div class="lp-pop-v"></div><p><b></b><span></span></p>';document.body.appendChild(pop);added.push(pop);var popFor=null,popT=null;
function popShow(i){var n=i.dataset.rec,t=tool(n);if(!t||popFor===i)return;popFor=i;var r=recOf(n),bx=pop.querySelector('.lp-pop-v');
 if(r)player(bx,r,n);else{bx.style.backgroundImage='';bx.innerHTML='<div class="lp-rec-0"><b>Recording to be added</b></div>'}
 pop.querySelector('b').textContent=n;pop.querySelector('span').textContent=r?'Click the play button for a bigger view':'Not recorded yet';pop.hidden=false;
 var a=i.getBoundingClientRect(),w=pop.offsetWidth,h=pop.offsetHeight,x=a.right+12,y=a.top+a.height/2-h/2;if(x+w>innerWidth-8)x=a.left-w-12;if(x<8)x=8;y=Math.max(8,Math.min(innerHeight-h-8,y));pop.style.left=x+'px';pop.style.top=y+'px'}
function popHide(){clearTimeout(popT);popFor=null;if(!pop.hidden){pop.hidden=true;pop.querySelector('.lp-pop-v').innerHTML=''}}
var canHover=window.matchMedia&&matchMedia('(hover:hover)').matches;
if(canHover){on(document,'mouseover',function(e){var i=e.target.closest&&e.target.closest('[data-rec]');if(i){clearTimeout(popT);popT=setTimeout(function(){popShow(i)},120)}else if(popFor)popHide()});
 on(document,'focusin',function(e){var i=e.target.closest&&e.target.closest('[data-rec]');if(i)popShow(i);else popHide()});on(window,'scroll',popHide,{passive:true})}
/* full window */
var plat=document.getElementById('platform');if(plat){var warmOnce=function(){window.recWarmOK=true;recWarm(B[EX.a].tools.map(function(x){return x[1]}));plat.removeEventListener('pointerenter',warmOnce);plat.removeEventListener('focusin',warmOnce)};plat.addEventListener('pointerenter',warmOnce);plat.addEventListener('focusin',warmOnce)}
var dlg=document.createElement('div');dlg.className='lp-rec';dlg.hidden=true;dlg.setAttribute('role','dialog');dlg.setAttribute('aria-modal','true');dlg.setAttribute('aria-label','Recording from the live site');
dlg.innerHTML='<div class="lp-rec-b"><header><div><p class="lp-rec-k">On the live site</p><h3></h3><p class="lp-rec-l"></p></div><button type="button" class="lp-rec-x" aria-label="Close">×</button></header><div class="lp-rec-v"></div><button type="button" class="lp-rec-fs" hidden>See it full screen</button><footer><a class="btn hh-go"></a><span></span></footer></div>';
document.body.appendChild(dlg);added.push(dlg);var rv=null,last=null;
function open(n){var t=tool(n);if(!t)return;popHide();last=document.activeElement;var r=recOf(n),free=t[2]==='Free';
 dlg.querySelector('h3').innerHTML=esc(t[1])+' '+tag(t[2]);dlg.querySelector('.lp-rec-l').textContent=t[3];
 var box=dlg.querySelector('.lp-rec-v');
 box.classList.toggle('zoom',!!r&&r.src!==TOUR);if(r){rv=player(box,r,n);dlg.querySelector('footer span').textContent=r.src===TOUR?'Screen recording from the live site. It repeats.':'The live page, captured and scrolled. It repeats.'}
 else{rv=null;box.style.backgroundImage='';box.innerHTML='<div class="lp-rec-0"><b>Recording to be added</b><p>A short screen recording of '+esc(t[1])+' on the live site will play here.</p></div>';dlg.querySelector('footer span').textContent='Not recorded yet.'}
 var a=dlg.querySelector('footer a');a.href=''+(free?t[6]:'/plans');a.textContent=free?'Open '+t[1]+' →':'See what '+t[2]+' includes →';
 fsBtn(); dlg.hidden=false;document.documentElement.classList.add('lp-rec-on');dlg.querySelector('.lp-rec-x').focus();var hv=document.querySelector('#lp-vid video');if(hv)hv.pause()}
function openTour(){popHide();last=document.activeElement;dlg.querySelector('h3').textContent='FinLit in 40 seconds';dlg.querySelector('.lp-rec-l').textContent='Screener, company report, FinLit Prism, sector pages, Mutual Fund Score and portfolio.';
 var box=dlg.querySelector('.lp-rec-v');box.classList.remove('zoom');box.style.backgroundImage='url("'+G+'tour-poster.jpg")';box.innerHTML='<video src="'+TOUR+'" poster="'+G+'tour-poster.jpg" muted playsinline controls preload="auto" aria-label="A tour of FinLit"></video>';rv=box.querySelector('video');var p=rv.play();if(p&&p.catch)p.catch(function(){});
 dlg.querySelector('footer span').textContent='Screen recording from the live site.';var a=dlg.querySelector('footer a');a.href='/login?mode=signup';a.textContent='Create free account →';fsBtn();dlg.hidden=false;document.documentElement.classList.add('lp-rec-on');dlg.querySelector('.lp-rec-x').focus()}
function fsBtn(){var f=dlg.querySelector('.lp-rec-fs');if(f)f.hidden=!(rv&&(rv.requestFullscreen||rv.webkitEnterFullscreen))}
function close(){if(dlg.hidden)return;dlg.hidden=true;if(rv)rv.pause();dlg.querySelector('.lp-rec-v').innerHTML='';document.documentElement.classList.remove('lp-rec-on');if(last&&last.focus)last.focus()}
on(document,'click',function(e){if(e.target.closest&&e.target.closest('[data-tour]')){e.preventDefault();openTour();return}if(e.target.closest&&e.target.closest('.lp-rec-fs')&&rv){try{var q=rv.requestFullscreen?rv.requestFullscreen():rv.webkitEnterFullscreen();if(q&&q.catch)q.catch(function(){})}catch(err){}return}var i=e.target.closest&&e.target.closest('[data-rec]');if(i){e.preventDefault();e.stopPropagation();open(i.dataset.rec);return}if(!dlg.hidden&&(e.target===dlg||e.target.closest('.lp-rec-x'))){e.stopPropagation();close()}},true);
on(document,'keydown',function(e){if(e.key==='Escape'){close();popHide()}var i=e.target.closest&&e.target.closest('[data-rec]');if(i&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();open(i.dataset.rec)}},true);
})();
/* hover buttons inside the scores: point at one and its part of the card lights up */
function lit(feat,on){var sec=feat.closest('.hpz');var cb=sec.querySelector('[data-fct=check]');if(on&&cb&&cb.getAttribute('aria-selected')!=='true')cb.click();var feats=[].slice.call(sec.querySelectorAll('.hpz-feat')),i=feats.indexOf(feat),id=feat.getAttribute('aria-describedby');
 var blocks=[].slice.call(sec.querySelectorAll('.hpz-blk')),parts=[].slice.call(sec.querySelectorAll('.hpz-part'));var target=id?[document.getElementById(id)]:(parts[i]?[parts[i]]:[]);var pool=id&&blocks.length>1?blocks:parts;
 pool.forEach(function(x){x.classList.toggle('lp-lit',on&&target.indexOf(x)>-1);x.classList.toggle('lp-dim',on&&target.indexOf(x)<0)});feat.classList.toggle('on',on)}
['mouseover','focusin'].forEach(function(ev){on(document,ev,function(e){var f=e.target.closest&&e.target.closest('.hpz-feat');if(f)lit(f,true)})});
['mouseout','focusout'].forEach(function(ev){on(document,ev,function(e){var f=e.target.closest&&e.target.closest('.hpz-feat');if(f)lit(f,false)})});
})();
/* ===== laptop: the hero fills the first screen, scaled up to use the space; the section bar comes in on scroll ===== */
(function(){
 var mq=window.matchMedia('(min-width:1100px)'),hero=document.querySelector('main .hh .hh-top'),wrap=hero&&hero.querySelector(':scope>.wrap'),head=document.querySelector('header.top');
 if(!hero||!wrap)return;
 function fit(){wrap.style.zoom='';hero.classList.remove('lp-fill');
  if(!mq.matches||/^#view-/.test(location.hash))return;
  hero.classList.add('lp-fill');
  var h=head?head.offsetHeight:0,w0=wrap.offsetWidth,h0=wrap.offsetHeight,zw=(window.innerWidth*.94)/w0,zh=(window.innerHeight-h-48)/h0,z=Math.max(1,Math.min(zw,zh,1.5)*.9);
  document.documentElement.style.setProperty('--lp-hdr',h+'px');
  if(z>1.02)wrap.style.zoom=z.toFixed(3)}
 var t=0;on(window,'resize',function(){clearTimeout(t);t=setTimeout(fit,80)});
 on(window,'hashchange',function(){setTimeout(fit,30)});
 if(document.fonts&&document.fonts.ready)document.fonts.ready.then(fit);
 fit();
})();
/* ===== hover a feature, light up its part of the picture (as on the live landing page) ===== */
(function(){
 function wire(sec,map){if(!sec)return;var feats=[].slice.call(sec.querySelectorAll('.hpz-feats .hpz-feat'));
  feats.forEach(function(f,i){var tg=map(i);if(!tg)return;f.tabIndex=0;
   function on(x){f.classList.toggle('lit',x);[].concat(tg()).forEach(function(t){if(t)t.classList.toggle('lit',x)})}
   f.addEventListener('mouseenter',function(){on(true)});f.addEventListener('mouseleave',function(){on(false)});
   f.addEventListener('focus',function(){on(true)});f.addEventListener('blur',function(){on(false)})})}
 var pz=document.getElementById('prism');
 wire(pz,function(i){return function(){return i===0?pz.querySelector('.lp-pz-a'):pz.querySelector('.lp-pz-b')}});
 var mf=document.getElementById('mf-score'),keys=['performance','risk','cost','quality'];
 wire(mf,function(i){return function(){return mf.querySelector('.lp-hlb[data-hl='+keys[i]+']')}});
})();



/* 26 Nov: on phones the product tour plays by itself in the hero, right under the opening line.
   Data Saver on: the card stays. Reduced motion: shows still, plays on tap. Plays only while on screen. */
(function(){
var fig=document.getElementById('lp-vid'),lede=document.querySelector('.hh-top .hh-lede'),v=fig&&fig.querySelector('video');if(!fig||!lede||!v)return;
var root=document.documentElement,home=fig.parentNode,next=fig.nextSibling,mq=matchMedia('(max-width:760px)'),
    still=matchMedia('(prefers-reduced-motion: reduce)').matches,
    slow=!!(navigator.connection&&navigator.connection.saveData);
if(still){v.removeAttribute('autoplay');v.pause()}
function go(){if(still||fig.hidden||root.classList.contains('lp-rec-on'))return;var p=v.play();if(p&&p.catch)p.catch(function(){})}
function place(){
 if(mq.matches&&!slow){if(fig.previousElementSibling!==lede){lede.parentNode.insertBefore(fig,lede.nextSibling)}root.classList.add('lp-vph')}
 else{if(fig.parentNode!==home){home.insertBefore(fig,next)}root.classList.remove('lp-vph')}
 go()}
place();if(mq.addEventListener)on(mq,'change',place);else if(mq.addListener)mq.addListener(place);
/* pause when scrolled away, carry on when back (unless the visitor paused it) */
var ours=false;
if('IntersectionObserver' in window){track(new IntersectionObserver(function(es){es.forEach(function(e){
 if(e.isIntersecting){if(ours||!v.played.length){ours=false;go()}}
 else if(!v.paused){ours=true;v.pause()}})},{threshold:.3})).observe(v)}
})();

return function cleanup(){
 listeners.forEach(function(l){l[0].removeEventListener(l[1],l[2],l[3])});observers.forEach(function(o){o.disconnect()});
 added.forEach(function(el){if(el.parentNode)el.parentNode.removeChild(el)});
 var r=document.documentElement;r.classList.remove('lp-rec-on','lp-vph');r.style.removeProperty('--lp-top');r.style.removeProperty('--lp-hdr');try{delete window.recWarmOK}catch(e){}
};
}
