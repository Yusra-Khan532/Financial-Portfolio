import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Task #104: the block "How is your dashboard working for you? ... Open the feedback page" was removed from every report and dashboard page: every page already has the Share feedback button.
const layout = readFileSync(join(process.cwd(), "src/components/Layout.tsx"), "utf8");

describe("page feedback", () => {
  it("shows no feedback block under the page content; the floating button stays", () => {
    expect(layout).not.toMatch(/FeedbackFooter/);
    expect(readFileSync(join(process.cwd(), "src/components/PageFeedback.tsx"), "utf8")).toMatch(/Share feedback|Raise a Query/);
  });
});
