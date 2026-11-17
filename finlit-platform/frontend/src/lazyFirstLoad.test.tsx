// @vitest-environment jsdom
// Page speed (17 Nov 2026): Ask FinLit AI and the search window are not in the first download; they load the first time they open (or when the
// browser is idle). A static import of either from a module of the first download would pull them back in silently, so this guards the imports.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AssistantLauncher } from "./components/AssistantLauncher";
import { OPEN_AI } from "./components/assistantEvents";

// The panel reads the member and FinLit AI's allowance (task #211); on the site it sits inside the providers of main.tsx, here a visitor is enough.
vi.mock("./lib/auth", async (orig) => ({ ...(await orig<typeof import("./lib/auth")>()), useAuth: () => ({ user: null }) }));
vi.mock("./lib/askAi", async (orig) => ({ ...(await orig<typeof import("./lib/askAi")>()), useAskQuota: () => ({ data: undefined }) }));
vi.mock("@tanstack/react-query", async (orig) => ({ ...(await orig<typeof import("@tanstack/react-query")>()), useQueryClient: () => ({ invalidateQueries: async () => {} }) }));

const SRC = __dirname;
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
});
const rel = (p: string) => p.slice(SRC.length + 1);

describe("Ask FinLit AI and search load when they are opened", () => {
  it("only the launcher and the panel's own lazy loader import the assistant module", () => {
    const users = files(SRC).filter((f) => /from ["']\.{1,2}\/(components\/)?Assistant["']/.test(readFileSync(f, "utf8"))).map(rel);
    expect(users).toEqual([]);   // AssistantLauncher loads it with import(), which this pattern does not match
  });

  it("only the search wrapper loads the search window", () => {
    const users = files(SRC).filter((f) => /from ["'][./a-z]*search\/SearchOverlay["']/.test(readFileSync(f, "utf8"))).map(rel);
    expect(users).toEqual([]);
  });

  it("the sign-in page is not imported by other pages (its password box has its own file)", () => {
    const users = files(SRC).filter((f) => /from ["']\.\/Login["']|from ["']\.\.\/pages\/Login["']/.test(readFileSync(f, "utf8"))).map(rel);
    expect(users).toEqual([]);
  });

  it("the first open event opens the panel once it has loaded", async () => {
    render(<MemoryRouter><AssistantLauncher /></MemoryRouter>);
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => { dispatchEvent(new Event(OPEN_AI)); });
    expect(await screen.findByRole("dialog", {}, { timeout: 5000 })).toBeTruthy();
  });
});
