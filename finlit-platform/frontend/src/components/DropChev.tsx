// The report's one drop-down arrow (company report handover, 17 Nov 2026, README 1.3): a 24 px round button with a thin border and ▾ at the right of a <summary>,
// turning 180° when the drop-down opens. Every <details> in the report shows it. Put it last inside the <summary> and add the class "xdd" to the <details>;
// "xdd notes" gives the dashed-when-closed look of the note drop-downs. Styles: styles/report216.css.
export function DropChev() {
  return (
    <span className="xdd-chev" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path d="M6 9l6 6 6-6" /></svg>
    </span>
  );
}
