// Task #310: the one card surface (--s1, one border, 18px corners; 12px for a small card inside another). Styles in src/styles/ui.css.
import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export type CardProps = HTMLAttributes<HTMLElement> & {
  size?: "md" | "sm";
  as?: "div" | "section" | "article" | "aside";
};
export function Card({ size = "md", as: Tag = "div", className, ...rest }: CardProps) {
  return <Tag className={cx("ui-card", size === "sm" && "ui-card--sm", className)} {...rest} />;
}
