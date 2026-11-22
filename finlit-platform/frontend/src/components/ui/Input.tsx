// Task #310: text fields and selects: 44px tall, 12px corners, the card surface. Styles in src/styles/ui.css.
// (typescale.css keeps every text field at 16px so phones do not zoom in on focus.)
import type { InputHTMLAttributes, Ref, SelectHTMLAttributes } from "react";
import { cx } from "./cx";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> };
export function Input({ className, type = "text", ...rest }: InputProps) {
  return <input type={type} className={cx("ui-input", className)} {...rest} />;
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> };
export function Select({ className, ...rest }: SelectProps) {
  return <select className={cx("ui-input", className)} {...rest} />;
}
