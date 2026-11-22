// Task #310: the one button. Three looks plus the Prism look (Prism actions only); styles in src/styles/ui.css.
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "prism";
export type ButtonSize = "md" | "sm";

/** The class list of a button, for elements this component does not render itself (a router Link, a label). */
export const buttonClass = (variant: ButtonVariant = "secondary", size: ButtonSize = "md", extra?: string) =>
  cx("ui-btn", `ui-btn--${variant}`, size === "sm" && "ui-btn--sm", extra);

type Common = { variant?: ButtonVariant; size?: ButtonSize };
export type ButtonProps = Common & ButtonHTMLAttributes<HTMLButtonElement> & {
  /** A button that is switched on (e.g. Watching): rendered as aria-pressed, which gives it the selected look. */
  pressed?: boolean;
};

/** `primary` is the one main action on a screen; `secondary` any other; `quiet` inside toolbars and table rows. */
export function Button({ variant = "secondary", size = "md", pressed, className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} aria-pressed={pressed} className={buttonClass(variant, size, className)} {...rest} />;
}

export type ButtonLinkProps = Common & AnchorHTMLAttributes<HTMLAnchorElement>;
/** A plain link that looks like a button (for an in-app route, give a router Link `className={buttonClass(...)}`). */
export function ButtonLink({ variant = "secondary", size = "md", className, ...rest }: ButtonLinkProps) {
  return <a className={buttonClass(variant, size, className)} {...rest} />;
}
