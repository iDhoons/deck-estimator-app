import { useMemo, useState } from "react";
import { calculateQuantities, type FasteningMode, type Plan, type Product, type Ruleset } from "@deck/core";
import { ko as t } from "./i18n/ko";

const product: Product = {
  id: "DN34",
  name: "DN34",
  stockLengthMm: 3000,
  widthOptionsMm: [95, 120, 140, 150],
  thicknessMm: 25,
  gapMm: 5,
  fasteningModes: ["clip", "screw"]
};

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

const baseRules: Omit<Ruleset, "mode"> = {
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

function App() {
  const [mode, setMode] = useState<"consumer" | "pro">("consumer");
  const [fastening, setFastening] = useState<FasteningMode>("clip");

  const rules: Ruleset = useMemo(() => ({ ...baseRules, mode }), [mode]);

  const out = useMemo(() => {
    return calculateQuantities(plan, product, rules, fastening);
  }, [rules, fastening]);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 1000 }}>
      <h1 style={{ marginBottom: 12 }}>{t.appTitle}</h1>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ padding: 12, border: "1px solid #333", borderRadius: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>{t.mode}</div>
          <label style={{ marginRight: 10 }}>
            <input type="radio" name="mode" checked={mode === "consumer"} onChange={() => setMode("consumer")} />{" "}
            {t.consumer} ({t.consumerDesc})
          </label>
          <label>
            <input type="radio" name="mode" checked={mode === "pro"} onChange={() => setMode("pro")} />{" "}
            {t.pro} ({t.proDesc})
          </label>
        </div>

        <div style={{ padding: 12, border: "1px solid #333", borderRadius: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>{t.fastening}</div>
          <label style={{ marginRight: 10 }}>
            <input type="radio" name="fastening" checked={fastening === "clip"} onChange={() => setFastening("clip")} />{" "}
            {t.clip}
          </label>
          <label>
            <input type="radio" name="fastening" checked={fastening === "screw"} onChange={() => setFastening("screw")} />{" "}
            {t.screw}
          </label>
        </div>

        <div style={{ padding: 12, border: "1px solid #333", borderRadius: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>{t.summary}</div>
          <div>
            {t.totalArea}: <b>{out.area.totalM2.toFixed(2)} {t.unitM2}</b>
          </div>
          <div>
            {t.deckArea}: <b>{out.area.deckM2.toFixed(2)} {t.unitM2}</b>
          </div>
          <div>
            {t.stairsArea}: <b>{out.area.stairsM2.toFixed(2)} {t.unitM2}</b>
          </div>
          <div>
            {t.boards}: <b>{out.boards.pieces}</b> {t.unitPcs}
          </div>
          <div>
            {t.lossRate}: <b>{(out.boards.lossRateApplied ?? 0).toFixed(3)}</b>
          </div>
        </div>
      </div>

      <pre style={{ background: "#111", color: "#0f0", padding: 12, borderRadius: 8, overflow: "auto" }}>
        {JSON.stringify(out, null, 2)}
      </pre>
    </div>
  );
}

export default App;
