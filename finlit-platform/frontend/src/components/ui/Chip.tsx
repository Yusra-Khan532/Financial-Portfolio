// Task #310: a read-only mark (plan badge, "New", up and down). A chip is never clickable: anything clickable is a Tab or a Button.
// Styles in src/styles/ui.css.
import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export type ChipTone = "neutral" | "gain" | "loss" | "gold";
export type ChipProps = HTMLAttributes<HTMLSpanElement> & { tone?: ChipTone };
export function Chip({ tone = "neutral", className, ...rest }: ChipProps) {
  return <span className={cx("ui-chip", tone !== "neutral" && `ui-chip--${tone}`, className)} {...rest} />;
}
