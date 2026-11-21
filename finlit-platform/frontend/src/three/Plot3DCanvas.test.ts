// Task #302: a 3D chart whose numbers change (every input of the DCF calculator) must draw again. The old scene's teardown forces its WebGL context
// lost (stage.ts), so the next scene needs a new canvas; on the same canvas the renderer got the lost context and the chart vanished.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Plot3D after its numbers change", () => {
  it("draws on a new canvas for every new spec, while the teardown still frees the old context", () => {
    const plot = readFileSync(join(process.cwd(), "src/three/Plot3D.tsx"), "utf8"), stage = readFileSync(join(process.cwd(), "src/three/stage.ts"), "utf8");
    expect(plot).toMatch(/const key = JSON\.stringify\(spec\);/);
    expect(plot).toMatch(/<canvas key=\{key\} ref=\{ref\} className="p3d-cv"/);
    expect(plot).toMatch(/\}, \[key\]\);/);
    expect(stage).toMatch(/renderer\.forceContextLoss\(\)/);
  });
});
