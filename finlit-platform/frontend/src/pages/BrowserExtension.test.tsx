// @vitest-environment jsdom
// The FinLit extension is on the Chrome Web Store (22 Nov 2026): every "get it" button opens the store listing, where one click installs it, and the manual
// install (download the ZIP, unzip, Developer mode, Load unpacked) is gone from the page.
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXTENSION, installTarget } from "../lib/extension";

vi.mock("../components/PageHeader", () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
import { BrowserExtensionPage } from "./BrowserExtension";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const EDGE = CHROME + " Edg/131.0.0.0";
const STORE = "https://chromewebstore.google.com/detail/kbhfebaigibcikomgkommpgfhgkmbkbo";

beforeEach(() => { vi.spyOn(navigator, "userAgent", "get").mockReturnValue(CHROME); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); document.documentElement.removeAttribute("data-finlit-extension"); });

describe("the browser extension from the Chrome Web Store", () => {
  it("every button goes to the store listing, in Chrome and in Edge", () => {
    expect(EXTENSION.chromeStoreUrl).toBe(STORE);
    expect(installTarget(CHROME)).toEqual({ href: STORE, external: true, label: "Add to Chrome" });
    expect(installTarget(EDGE).href).toBe(STORE);
  });

  it("the page offers one click from the store and no manual install", () => {
    const { container } = render(<MemoryRouter><BrowserExtensionPage /></MemoryRouter>);
    const add = screen.getByRole("link", { name: /Add to Chrome/ });
    expect(add.getAttribute("href")).toBe(STORE);
    expect(add.getAttribute("target")).toBe("_blank");
    const text = container.textContent ?? "";
    for (const gone of ["Load unpacked", "Developer mode", "Download the ZIP", "Download the extension", "four steps", "unzip", "coming soon"]) expect(text).not.toContain(gone);
    expect(container.querySelector("a[download]")).toBeNull();
    expect(container.querySelector(".ext-steps")).toBeNull();
  });
});
