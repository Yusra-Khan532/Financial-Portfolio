// Task #262: the one-time note beside a size filter that was moved from Small to Micro (the four sizes of 20 Nov 2026; lib/sizeMigration.ts).
import { SIZE_NOTE, useSizeNote } from "../lib/sizeMigration";

export function SizeNote({ link = false, saved = false }: { link?: boolean; saved?: boolean }) {
  const [on, close] = useSizeNote(link, saved);
  if (!on) return null;
  return (
    <p className="size-note" role="status">{SIZE_NOTE} <button type="button" className="lnk" onClick={close} aria-label="Close the note on company sizes">Close</button></p>
  );
}
