// Timing of the landing page's product tour (record-home-tour.mjs): the hero's chapter buttons jump to fixed seconds (CH in
// frontend/src/landing/golive.js), so every recording is cut to the same section lengths and the buttons stay right in both themes.

/** The chapter buttons' list from the hero's script: [[name, seconds], ...]. */
export function chapterList(goliveSource) {
  const m = goliveSource.match(/var CH=(\[\[.*?\]\]);/);
  if (!m) throw new Error("CH (the tour's chapter list) was not found in src/landing/golive.js");
  return JSON.parse(m[1].replace(/'/g, '"'));
}

/** How long each section lasts in the video, then the end card: section k runs from its chapter button to the next one (or to the end card) plus the
 *  cross-fade the two share. The finished video is endAt + endLen seconds long. */
export function targetLengths(ch, endAt, endLen, fade) {
  const starts = [...ch, endAt];
  return [...ch.map((s, k) => starts[k + 1] - s + fade), endLen];
}

/** The second each section starts at in the joined video (its cross-fade begins there). */
export function startsOf(lengths, fade) {
  const out = [0];
  for (let i = 1; i < lengths.length; i++) out.push(out[i - 1] + lengths[i - 1] - fade);
  return out;
}
