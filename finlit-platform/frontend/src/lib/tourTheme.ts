// Which recording of the landing page's product tour to show (task #310 H, 22 Nov 2026): the SAME theme as the page, so the first product a visitor sees
// looks like the site they land on (a light recording on the cream page, the dark recording on the dark page). Task #152 removed the Show in Light / Dark
// buttons, so a choice an older visit stored in this browser is not read. Before task #310 H the tour played in the opposite theme to the page.
export type Look = "light" | "dark";

/** The look of the video to play for the page's theme: the page's own. */
export const tourLook = (site: Look): Look => site;

/** The files for each look, in public/landing: the 42-second 1280x720 H.264 tour and its poster, the FinLit Prism report card in that theme.
 *  scripts/record-home-tour.mjs records the light tour and makes both posters. */
export const TOUR_FILES: Record<Look, { video: string; poster: string }> = {
  light: { video: "finlit-tour-light-720p.mp4", poster: "finlit-tour-light-poster.webp" },
  dark: { video: "finlit-tour-dark-720p.mp4", poster: "finlit-tour-dark-poster.webp" },
};

/** The video and poster addresses for a look, under the site's base path. */
export const tourMedia = (look: Look, base = "/"): { video: string; poster: string } => {
  const b = base.endsWith("/") ? base : base + "/", f = TOUR_FILES[look];
  return { video: `${b}landing/${f.video}`, poster: `${b}landing/${f.poster}` };
};
