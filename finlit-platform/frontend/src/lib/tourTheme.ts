// Which version of the landing page's product tour to show. By default the video is in the OPPOSITE theme to the page (a dark recording on the light
// page, a light one on the dark page) so it stands out; a visitor can pick Light or Dark, and the choice is remembered in this browser.
export type Look = "light" | "dark";
export type Choice = "auto" | Look;
export const TOUR_CHOICE_KEY = "finlit-tour-look";

export const opposite = (site: Look): Look => (site === "dark" ? "light" : "dark");
/** The look of the video to play for the page's theme and the visitor's choice ("auto" or nothing chosen: the opposite of the page). */
export const tourLook = (site: Look, choice: Choice | null | undefined): Look => (choice === "light" || choice === "dark" ? choice : opposite(site));
export const asChoice = (v: unknown): Choice => (v === "light" || v === "dark" ? v : "auto");
