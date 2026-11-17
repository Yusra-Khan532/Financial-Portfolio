import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { ApiError } from "../lib/api";
import { forgotPassword, resetPassword, resetPasswordWithCode, verifyEmail } from "../lib/account";
import { Icon } from "../lib/icons";
import { useDocTitle } from "../lib/title";
import { PasswordField } from "./Login";

const msg = (e: unknown) => e instanceof ApiError ? (e.status === 429 ? "Too many attempts. Please wait a little and try again." : e.body.detail || "Something went wrong.") : "We could not reach FinLit. Check your connection and try again.";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="login">
      <div className="aurora" style={{ opacity: 0.8 }} />
      <div className="wrap" style={{ display: "grid", placeItems: "center" }}>
        <div className="card login-card" style={{ width: "min(480px, 100%)" }}>
          <Link to="/" className="lg-mark" aria-label="FinLit home" style={{ height: 48, marginBottom: 14 }} />
          <h1 style={{ font: "400 28px var(--serif)", margin: "0 0 10px" }}>{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}

export function VerifyEmail() {
  useDocTitle("Confirm your email", "Confirm your email address to finish creating your FinLit account.");
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const fired = useRef(false);
  const m = useMutation({ mutationFn: () => verifyEmail(token) });
  useEffect(() => { if (token && !fired.current) { fired.current = true; m.mutate(); } }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Shell title={m.isSuccess ? "Email confirmed" : m.isError || !token ? "This link did not work" : "Confirming…"}>
      {m.isSuccess && <><p className="muted">Your account is ready. Sign in to continue.</p><Link className="btn primary" to="/login">Sign in <Icon name="arrow" /></Link></>}
      {(m.isError || !token) && <><p className="muted">{token ? msg(m.error) : "The link is incomplete."} Links work once and expire after 24 hours. Sign in and we will send a new one.</p><Link className="btn" to="/login">Go to sign in</Link></>}
      {m.isPending && <p className="muted" role="status">One moment…</p>}
    </Shell>
  );
}

export function ForgotPassword() {
  useDocTitle("Reset your password", "Reset your FinLit password by email.");
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") || "");
  const nav = useNavigate();
  // owner, 17 Nov 2026: the email carries a 6-digit code; the next page takes it with the new password (the link in the same email still works too)
  const m = useMutation({ mutationFn: () => forgotPassword(email.trim()), onSuccess: () => nav(`/reset-password?email=${encodeURIComponent(email.trim())}&sent=1`) });
  return (
    <Shell title="Reset your password">
      <form className="form" onSubmit={(e) => { e.preventDefault(); if (email.trim()) m.mutate(); }}>
        <p className="muted" style={{ margin: "0 0 14px" }}>Enter your email and we will send you a 6-digit code to choose a new password.</p>
        <label>Email address<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        {m.isError && <div className="formerr" role="alert">{msg(m.error)}</div>}
        <button className="btn primary lg" style={{ width: "100%" }} disabled={m.isPending}>{m.isPending ? "Sending…" : "Send the code"}</button>
      </form>
    </Shell>
  );
}

/** The second page: the code from the email and the new password (twice). */
function ResetWithCode() {
  useDocTitle("Enter your code", "Enter the code from your email and choose a new FinLit password.");
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") || "");
  const [code, setCode] = useState(""), [pw, setPw] = useState(""), [again, setAgain] = useState("");
  const [local, setLocal] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const nav = useNavigate();
  const m = useMutation({ mutationFn: () => resetPasswordWithCode(email.trim(), code.replace(/\s+/g, ""), pw), onSuccess: () => setTimeout(() => nav("/login", { replace: true }), 1800) });
  const again_ = useMutation({ mutationFn: () => forgotPassword(email.trim()), onSuccess: () => { setResent(true); setCode(""); m.reset(); } });
  const cancelled = m.error instanceof ApiError && m.error.body.status === "code_cancelled";
  return (
    <Shell title={m.isSuccess ? "Password changed" : "Enter your code"}>
      {m.isSuccess ? <p className="muted">All devices were signed out. Taking you to sign in…</p> : (
        <form className="form" onSubmit={(e) => {
          e.preventDefault();
          if (!/^\d{6}$/.test(code.replace(/\s+/g, ""))) return setLocal("Enter the 6-digit code from the email.");
          if (pw !== again) return setLocal("The two passwords do not match.");
          setLocal(null); m.mutate();
        }}>
          <p className="muted" style={{ margin: "0 0 14px" }} role="status">
            {resent ? "A new code is on its way. " : params.get("sent") ? "If an account exists for this email, we have sent a 6-digit code. " : ""}
            It expires in 15 minutes. Check your spam folder if it does not arrive.
          </p>
          <label>Email address<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>6-digit code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} required /></label>
          <PasswordField label="New password" value={pw} onChange={setPw} autoComplete="new-password" hint />
          <PasswordField label="Repeat new password" value={again} onChange={setAgain} autoComplete="new-password" />
          {(local || m.isError) && <div className="formerr" role="alert">{local || msg(m.error)}</div>}
          <button className="btn primary lg" style={{ width: "100%" }} disabled={m.isPending}>{m.isPending ? "Saving…" : "Change password"}</button>
          <p style={{ margin: "14px 0 0", fontSize: 14 }}>
            <button type="button" className="linkbtn" disabled={!email.trim() || again_.isPending} onClick={() => again_.mutate()}>{cancelled ? "Send a new code" : "Did not get it? Send a new code"}</button>
          </p>
        </form>
      )}
    </Shell>
  );
}

export function ResetPassword() {
  useDocTitle("Choose a new password", "Choose a new FinLit password.");
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [pw, setPw] = useState(""), [again, setAgain] = useState("");
  const [local, setLocal] = useState<string | null>(null);
  const nav = useNavigate();
  const m = useMutation({ mutationFn: () => resetPassword(token, pw), onSuccess: () => setTimeout(() => nav("/login", { replace: true }), 1800) });
  if (!token) return <ResetWithCode />;     // no link token: the code page (from "Forgot password")
  return (
    <Shell title={m.isSuccess ? "Password changed" : "Choose a new password"}>
      {m.isSuccess ? <p className="muted">All devices were signed out. Taking you to sign in…</p> : (
        <form className="form" onSubmit={(e) => { e.preventDefault(); if (pw !== again) return setLocal("The two passwords do not match."); setLocal(null); m.mutate(); }}>
          <PasswordField label="New password" value={pw} onChange={setPw} autoComplete="new-password" hint />
          <PasswordField label="Repeat new password" value={again} onChange={setAgain} autoComplete="new-password" />
          {(local || m.isError) && <div className="formerr" role="alert">{local || msg(m.error)}</div>}
          <button className="btn primary lg" style={{ width: "100%" }} disabled={m.isPending}>{m.isPending ? "Saving…" : "Change password"}</button>
        </form>
      )}
    </Shell>
  );
}
