import { useMemo } from "react";
import { calculateQuantities, type FasteningMode, type Plan, type Product, type Ruleset } from "@deck/core";

function App() {
  const out = useMemo(() => {
    const plan: Plan = {
      unit: "mm",
      polygon: {
        outer: [
          { xMm: 0, yMm: 0 },
          { xMm: 2000, yMm: 0 },
          { xMm: 2000, yMm: 1000 },
          { xMm: 0, yMm: 1000 }
        ]
      },
      boardWidthMm: 140,
      deckingDirectionDeg: 0,
      stairs: {
        enabled: true,
        footprintPolygon: {
          outer: [
            { xMm: 0, yMm: 1000 },
            { xMm: 1000, yMm: 1000 },
            { xMm: 1000, yMm: 1300 },
            { xMm: 0, yMm: 1300 }
          ]
        }
      }
    };

    const product: Product = {
      id: "DN34",
      name: "DN34",
      stockLengthMm: 3000,
      widthOptionsMm: [95, 120, 140, 150],
      thicknessMm: 25,
      gapMm: 5,
      fasteningModes: ["clip", "screw"]
    };

    const rules: Ruleset = {
      mode: "consumer",
      gapMm: 5,
      secondarySpacingMm: 400,
      primarySpacingMm: 600,
      anchorSpacingMm: 1000,
      footingSpacingMm: 1000,
      consumerLoss: { base: 0.03, vertexFactor: 0.003, cutoutFactor: 0.005, cap: 0.06 },
      screwPerIntersection: 2,
      showAdvancedOverrides: false,
      enableCutPlan: false
    };

    const mode: FasteningMode = "clip";
    return calculateQuantities(plan, product, rules, mode);
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Deck Estimator</h1>
      <pre style={{ background: "#111", color: "#0f0", padding: 12, borderRadius: 8, overflow: "auto" }}>
        {JSON.stringify(out, null, 2)}
      </pre>
    </div>
  );
}

export default App;
