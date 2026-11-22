// Task #310: the page title block (eyebrow, title, lede) in one of the three allowed title styles, and the H2 / H3 / label levels
// below it. Styles in src/styles/ui.css.
import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export type TitleVariant = "tool" | "read" | "marketing";

export type PageTitleProps = {
  children: ReactNode;
  /** "tool" (32px) for tool pages, "read" (40px) for legal, glossary, learn, blog and FAQ, "marketing" (64px) for home, about, plans, services. */
  variant?: TitleVariant;
  eyebrow?: ReactNode;
  lede?: ReactNode;
  /** The title's element; h1 unless the page already has one. */
  as?: "h1" | "h2";
  id?: string;
  className?: string;
};
export function PageTitle({ children, variant = "tool", eyebrow, lede, as: Tag = "h1", id, className }: PageTitleProps) {
  return (
    <>
      {eyebrow != null && <p className="ui-eyebrow">{eyebrow}</p>}
      <Tag id={id} className={cx("ui-title", variant !== "tool" && `ui-title--${variant}`, className)}>{children}</Tag>
      {lede != null && <p className="ui-lede">{lede}</p>}
    </>
  );
}

type HeadingProps = HTMLAttributes<HTMLHeadingElement>;
/** Section heading: serif 24px (40px on marketing pages). */
export function H2({ marketing = false, className, ...rest }: HeadingProps & { marketing?: boolean }) {
  return <h2 className={cx("ui-h2", marketing && "ui-h2--marketing", className)} {...rest} />;
}
/** Sub-heading: sans 16px, 600. */
export function H3({ className, ...rest }: HeadingProps) {
  return <h3 className={cx("ui-h3", className)} {...rest} />;
}
/** Label above a title or a column: sans 12px, 600, uppercase. */
export function Label({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx("ui-label", className)} {...rest} />;
}
