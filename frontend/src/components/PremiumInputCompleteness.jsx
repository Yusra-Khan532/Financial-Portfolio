export default function PremiumInputCompleteness({ completeness, className }) {
  let content;
  if (!completeness) {
    content = <p className="mt-3 text-sm text-[#93A4B9]">Recalculate this report to see the latest missing-input and history checks.</p>;
  } else if (completeness.complete) {
    content = <p className="mt-3 text-sm leading-6 text-[#84C8AD]">All applicable scoring factors have usable inputs and the required comparison history.</p>;
  } else {
    content = <>
      <p className="mt-3 text-sm leading-6 text-[#E7CA92]">Unavailable factors: {completeness.missingFactorCount} · Limited histories: {completeness.limitedHistoryCount}</p>
      <p className="mt-2 text-xs leading-5 text-[#93A4B9]">These limitations remain visible even where an input is excluded from the coverage percentage.</p>
      <ul className="mt-5 space-y-4">{completeness.items.map((item) =>
        <li key={`${item.category}-${item.metric}`} className="border-t border-[#26374D] pt-4">
          <p className="text-sm text-[#D0D9E5]">{item.category} · {item.label}</p>
          <p className="mt-2 text-sm leading-6 text-[#E7CA92]">{item.reason}</p>
          <p className="mt-1 text-xs leading-5 text-[#93A4B9]">{item.treatment}</p>
        </li>
      )}</ul>
    </>;
  }

  return <section className={className} aria-label="Input completeness">
    <h3 className="text-xl text-white">Input completeness</h3>
    {content}
  </section>;
}
