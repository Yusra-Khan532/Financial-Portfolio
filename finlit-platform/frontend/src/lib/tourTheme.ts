// Which version of the landing page's product tour to show: always the OPPOSITE theme to the page (a dark recording on the light page, a light one on the dark
// page) so it stands out. Task #152 removed the Show in Light / Dark buttons, so a choice an older visit stored in this browser is no longer read.
export type Look = "light" | "dark";

export const opposite = (site: Look): Look => (site === "dark" ? "light" : "dark");
/** The look of the video to play for the page's theme: the opposite of the page. */
export const tourLook = (site: Look): Look => opposite(site);
