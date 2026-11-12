import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Task #66: the install box beside the example card was mostly empty. It lists what the extension does (four short lines drawn from extension/README.md) and keeps the button on its bottom edge.
const page = readFileSync(join(process.cwd(), "src/pages/BrowserExtension.tsx"), "utf8");
const css = readFileSync(join(process.cwd(), "src/styles/extension.css"), "utf8");

describe("Browser extension page, first box", () => {
  it("lists four things the extension does, in every state of the box", () => {
    expect(page.match(/<WhatYouGet \/>/g)?.length).toBe(3);
    for (const t of ["Any term, in plain words", "A company's score at a glance", "One click, any page", "Only what you select"]) expect(page).toContain(t);
  });
  it("keeps the two boxes one height and the button at the bottom edge of the first", () => {
    expect(css).toMatch(/\.ext-hero \{[^}]*align-items: stretch;/);
    expect(css).toMatch(/\.ext-hero > \.ext-card > \.ext-btns \{ margin-top: auto;/);
  });
});
