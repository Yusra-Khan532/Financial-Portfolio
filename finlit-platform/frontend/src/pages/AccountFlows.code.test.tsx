// @vitest-environment jsdom
// Owner, 17 Nov 2026: 5 wrong passwords pause sign-in and point to Forgot password; Forgot password emails a 6-digit code and the next page takes the
// code with the new password (twice). The emailed link still opens the link version of the page.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ forgot: [] as string[], code: [] as unknown[][], login: null as unknown }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
vi.mock("../lib/account", async () => {
  const { ApiError } = await import("../lib/api");
  return {
    forgotPassword: async (email: string) => { calls.forgot.push(email); return { status: "check_email" }; },
    resetPasswordWithCode: async (...a: unknown[]) => { calls.code.push(a); if (a[1] === "111111") throw new ApiError(400, { status: "code_cancelled", detail: "Too many wrong codes, so this code no longer works. Request a new code." }); return { status: "password_changed" }; },
    resetPassword: async () => ({ status: "password_changed" }),
    verifyEmail: async () => ({}),
    resendVerification: async () => ({}),
    signUp: async () => ({}),
    signIn: async () => { throw calls.login; },
  };
});
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: null, refresh: async () => undefined }) }));
import { ForgotPassword, ResetPassword } from "./AccountFlows";
import { Login } from "./Login";
import { ApiError } from "../lib/api";

afterEach(() => { cleanup(); calls.forgot = []; calls.code = []; });
function Where() { const l = useLocation(); return <span data-testid="where">{l.pathname + l.search}</span>; }
const open = (path: string) => render(
  <QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/forgot-password" element={<><ForgotPassword /><Where /></>} /><Route path="/reset-password" element={<><ResetPassword /><Where /></>} />
      <Route path="/login" element={<><Login /><Where /></>} /></Routes>
  </MemoryRouter></QueryClientProvider>);

describe("Forgot password with an emailed code", () => {
  it("page 1 sends the code and moves to the code page with the email filled in", async () => {
    open("/forgot-password?email=asha%40example.com");
    expect((screen.getByLabelText("Email address") as HTMLInputElement).value).toBe("asha@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Send the code" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/reset-password?email=asha%40example.com&sent=1"));
    expect(calls.forgot).toEqual(["asha@example.com"]);
    expect(screen.getByRole("heading", { name: "Enter your code" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/6-digit code.*expires in 15 minutes/);
  });

  it("page 2 sends the code (spaces removed) with the new password, after checking both passwords match", async () => {
    open("/reset-password?email=asha%40example.com&sent=1");
    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "123 456" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "another-strong-phrase-77" } });
    fireEvent.change(screen.getByLabelText("Repeat new password"), { target: { value: "another-strong-phrase-78" } });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByRole("alert").textContent).toBe("The two passwords do not match.");
    expect(calls.code).toEqual([]);
    fireEvent.change(screen.getByLabelText("Repeat new password"), { target: { value: "another-strong-phrase-77" } });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Password changed" })).toBeTruthy());
    expect(calls.code).toEqual([["asha@example.com", "123456", "another-strong-phrase-77"]]);
  });

  it("a cancelled code says so and offers a new one", async () => {
    open("/reset-password?email=asha%40example.com");
    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "111111" } });
    for (const l of ["New password", "Repeat new password"]) fireEvent.change(screen.getByLabelText(l), { target: { value: "another-strong-phrase-77" } });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/no longer works/));
    fireEvent.click(screen.getByRole("button", { name: "Send a new code" }));
    await waitFor(() => expect(calls.forgot).toEqual(["asha@example.com"]));
  });

  it("the emailed link still opens the link version", () => {
    open("/reset-password?token=abc");
    expect(screen.getByRole("heading", { name: "Choose a new password" })).toBeTruthy();
    expect(screen.queryByLabelText("6-digit code")).toBeNull();
  });
});

describe("Sign in after wrong passwords", () => {
  const signIn = async () => {
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "asha@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  };
  it("shows the tries left, and from 2 left the way to reset", async () => {
    calls.login = new ApiError(401, { status: "invalid_credentials", detail: "Email or password is not correct. 3 tries left before sign-in pauses for 15 minutes.", triesLeft: 3 } as never);
    open("/login");
    await signIn();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("3 tries left"));
    expect(screen.queryByRole("link", { name: "Reset your password" })).toBeNull();
    calls.login = new ApiError(401, { status: "invalid_credentials", detail: "Email or password is not correct. 2 tries left before sign-in pauses for 15 minutes.", triesLeft: 2 } as never);
    await signIn();
    await waitFor(() => expect(screen.getByRole("link", { name: "Reset your password" }).getAttribute("href")).toBe("/forgot-password?email=asha%40example.com"));
  });
  it("after 5 wrong passwords: the pause message and the reset link", async () => {
    calls.login = new ApiError(429, { status: "too_many_wrong", retryAfter: 900, detail: "Too many wrong passwords. Wait 15 minutes, or reset your password with Forgot password." });
    open("/login");
    await signIn();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Too many wrong passwords. Wait 15 minutes"));
    expect(screen.getByRole("link", { name: "Reset your password" })).toBeTruthy();
  });
});
