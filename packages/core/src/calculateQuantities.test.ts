import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { calculateQuantities } from "./calculateQuantities";
import type { FasteningMode } from "./types";

function loadFixture(name: string) {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), "utf-8")
  );
}

describe("calculateQuantities (fixtures)", () => {
  const cases: Array<{ fixture: string; mode: FasteningMode }> = [
    { fixture: "rect-2000x1000", mode: "clip" },
    { fixture: "rect-2000x1000", mode: "screw" },
    { fixture: "rect-2000x1000-rot90", mode: "clip" },
    { fixture: "rect-2000x1000-rot90", mode: "screw" }
  ];

  for (const c of cases) {
    it(`${c.fixture} ${c.mode}`, () => {
      const fx = loadFixture(c.fixture);
      const out = calculateQuantities(fx.plan, fx.product, fx.rules, c.mode);
      expect(out).toMatchSnapshot();
    });
  }
});
