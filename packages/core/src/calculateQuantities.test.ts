import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { calculateQuantities } from "./calculateQuantities.js";
import type { FasteningMode } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadFixture(name: string) {
  const path = join(__dirname, `../fixtures/${name}.json`);
  return JSON.parse(readFileSync(path, "utf-8"));
}

describe("calculateQuantities (fixtures)", () => {
  const cases: Array<{ fixture: string; mode: FasteningMode }> = [
    { fixture: "rect-2000x1000", mode: "clip" },
    { fixture: "rect-2000x1000", mode: "screw" },
    { fixture: "rect-2000x1000-rot90", mode: "clip" },
    { fixture: "rect-2000x1000-rot90", mode: "screw" },
    { fixture: "rect-2000x1000-with-stairs", mode: "clip" },
    { fixture: "rect-2000x1000-with-stairs", mode: "screw" },
  ];

  for (const c of cases) {
    it(`${c.fixture} ${c.mode}`, () => {
      const fx = loadFixture(c.fixture);
      const out = calculateQuantities(fx.plan, fx.product, fx.rules, c.mode);
      expect(out).toMatchSnapshot();
    });
  }
});
