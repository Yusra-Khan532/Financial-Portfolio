import { useId, useState } from "react";
import { Icon } from "../lib/icons";

// The password box of sign-in, sign-up, reset and the account page. In its own file so those pages do not pull the whole sign-in page into the
// first download (the sign-in page itself loads when it is opened).
const PW_RULES: [string, (p: string) => boolean][] = [["10 or more characters", (p) => p.length >= 10], ["Not a common password", (p) => !/^(password|12345|qwerty|letmein|welcome|admin|finlit)/i.test(p)]];

export function PasswordField({ label = "Password", value, onChange, autoComplete, hint }: { label?: string; value: string; onChange: (v: string) => void; autoComplete: string; hint?: boolean }) {
  const [show, setShow] = useState(false);
  const id = useId();
  return (
    <div className="fld">
      <label htmlFor={id}>{label}</label>
      <span className="pw">
        <input id={id} type={show ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} required maxLength={128} />
        <button type="button" className="pw-t" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>{show ? "Hide" : "Show"}</button>
      </span>
      {hint && <span className="pw-h" aria-live="polite">{PW_RULES.map(([t, ok]) => <i key={t} className={ok(value) ? "ok" : ""}><Icon name="check" />{t}</i>)}</span>}
    </div>
  );
}
