// Task #310: tabs and pills with one selected colour. The selected one is marked by an attribute (aria-selected for tabs,
// aria-pressed for toggles, aria-current for links), never by a class, so screen readers hear it too. Styles in src/styles/ui.css.
import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
import { cx } from "./cx";

export type TabsKind = "tabs" | "toggle";

export type TabsProps = HTMLAttributes<HTMLDivElement> & {
  /** "tabs": a tab list (each Tab is role="tab" and uses aria-selected). "toggle": a group of on/off pills (aria-pressed). */
  kind?: TabsKind;
  /** Accessible name of the group, e.g. "Period". */
  label?: string;
};
export function Tabs({ kind = "tabs", label, className, ...rest }: TabsProps) {
  return <div role={kind === "tabs" ? "tablist" : "group"} aria-label={label} className={cx("ui-tabs", className)} {...rest} />;
}

export type TabProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  /** Match the parent Tabs: "tabs" (default) or "toggle". */
  kind?: TabsKind;
};
export function Tab({ selected = false, kind = "tabs", className, type = "button", ...rest }: TabProps) {
  const state = kind === "tabs" ? { role: "tab" as const, "aria-selected": selected } : { "aria-pressed": selected };
  return <button type={type} {...state} className={cx("ui-tab", className)} {...rest} />;
}

/** The class of a tab for a link this component does not render (a router NavLink); mark the current one aria-current="page". */
export const tabClass = (extra?: string) => cx("ui-tab", extra);
