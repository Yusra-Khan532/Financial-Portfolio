const tones = {
  positive: "text-[#84C8AD] border-[#39715D] bg-[#102C27]",
  negative: "text-[#E0A0A0] border-[#7B4247] bg-[#301D27]",
  caution: "text-[#E7CA92] border-[#8B7148] bg-[#2D281D]",
  muted: "text-[#B6C5D8] border-[#384960] bg-[#102035]",
};

function Signals({ assessment, label }) {
  const available = assessment.factors.filter((factor) => factor.status === "available");
  const missing = assessment.factors.filter((factor) => factor.status === "unavailable");
  const labelFor = (signal) => signal > 0 ? "Supportive" : signal < 0 ? "Unfavourable" : "Neutral";
  return <div className="min-w-0">
    <h4 className="font-medium text-white">{label} signals</h4>
    <p className="mt-1 text-xs text-[#93A4B9]">{assessment.availableCount} of {assessment.requiredCount} required signals available</p>
    {available.length ? <ul className="mt-4 divide-y divide-[#26374D]">{available.map((factor) => <li key={factor.key} className="py-3">
      <div className="flex flex-wrap justify-between gap-2 text-sm"><span className="text-[#D0D9E5]">{factor.label}</span><span className={factor.signal > 0 ? "text-[#84C8AD]" : factor.signal < 0 ? "text-[#E0A0A0]" : "text-[#E7CA92]"}>{labelFor(factor.signal)}</span></div>
      <p className="mt-1 text-xs leading-5 text-[#93A4B9]">{factor.detail}</p>
    </li>)}</ul> : <p className="mt-4 text-sm text-[#93A4B9]">No verified signals are available.</p>}
    {missing.length ? <details className="mt-4 rounded-lg border border-[#384960] p-3"><summary className="cursor-pointer text-sm text-[#E7CA92]">What is missing ({missing.length})</summary><ul className="mt-3 space-y-3">{missing.map((factor) => <li key={factor.key}><p className="text-sm text-[#D0D9E5]">{factor.label}</p><p className="mt-1 text-xs leading-5 text-[#93A4B9]">{factor.detail}</p></li>)}</ul></details> : null}
  </div>;
}

export default function PremiumTechnicalAssessment({ assessment }) {
  if (!assessment) return null;
  return <section aria-label="Short and long-term assessment" className="rounded-xl border border-[#384960] bg-[#0A1626] p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[.2em] text-[#D6AE62]">Market outlook</p><h3 className="mt-2 text-2xl text-white">Short &amp; long-term assessment</h3></div><p className="text-xs text-[#93A4B9]">Daily close: {assessment.asOf || "Unavailable"} · {assessment.provider}</p></div>
    <div className="mt-6 grid gap-4 sm:grid-cols-2">{[["Short term", assessment.shortTerm], ["Long term", assessment.longTerm]].map(([label, part]) => <div key={label} className="rounded-xl border border-[#26374D] bg-[#07111F] p-5">
      <h4 className="text-sm text-[#D0D9E5]">{label} <span className="ml-2 text-xs text-[#93A4B9]">{part.horizon}</span></h4>
      <p className="mt-3 text-3xl text-white">{part.score == null ? "Unavailable" : `${part.score > 0 ? "+" : ""}${part.score.toFixed(1)}`}</p>
      <p className="mt-2 text-xs text-[#93A4B9]">{part.score == null ? "Required price or benchmark history is incomplete" : `${part.rating} · Scale −100 to +100`}</p>
      {part.score != null ? <div className="mt-4"><div role="meter" aria-label={`${label} score`} aria-valuemin={-100} aria-valuemax={100} aria-valuenow={part.score} className="relative h-2 rounded-full bg-gradient-to-r from-[#A55361] via-[#A58D59] to-[#479C82]"><div className="absolute inset-y-0 left-1/2 w-px bg-[#07111F]" /><div className="absolute -top-1 h-4 w-1 rounded bg-white" style={{left: `${Math.max(0, Math.min(100, (part.score + 100) / 2))}%`, transform: "translateX(-50%)"}} /></div><div className="mt-2 flex justify-between text-[10px] text-[#93A4B9]"><span>−100</span><span>0</span><span>+100</span></div></div> : null}
      {part.stageCapped ? <p className="mt-2 text-xs text-[#E7CA92]">Limited by the current market stage.</p> : null}
    </div>)}</div>
    <div className={`mt-4 rounded-lg border px-4 py-3 ${tones[assessment.verdict.tone] || tones.muted}`}><p className="text-xs uppercase tracking-wider">Combined verdict</p><p className="mt-1 font-medium">{assessment.verdict.label}</p></div>
    <div className="mt-5 space-y-2">{assessment.notes.map((note, index) => <p key={index} className="text-xs leading-5 text-[#B6C5D8]">{note}</p>)}</div>
    <div className="mt-6 grid gap-7 border-t border-[#26374D] pt-6 lg:grid-cols-2"><Signals assessment={assessment.shortTerm} label="Short-term" /><Signals assessment={assessment.longTerm} label="Long-term" /></div>
    <p className="mt-5 text-xs text-[#93A4B9]">Sector comparison is switched off. This assessment is separate from the financial-health score.</p>
  </section>;
}
