import { useState } from "react";
import { FreeDrawCanvas } from "../components/FreeDrawCanvas";
import type { Point } from "@deck/core";

export function FreeDrawDemo() {
  const [completedPolygons, setCompletedPolygons] = useState<Point[][]>([]);

  const handlePolygonComplete = (points: Point[]) => {
    setCompletedPolygons((prev) => [...prev, points]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div style={{ padding: "1rem", borderBottom: "1px solid #ddd", background: "#fff" }}>
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Free Drawing Mode</h1>
        <p style={{ margin: "0.5rem 0 0 0", color: "#666", fontSize: "0.9rem" }}>
          Click to create points. Click near the first point to close the polygon.
        </p>
      </div>

      <div style={{ flex: 1, position: "relative" }}>
        <FreeDrawCanvas onPolygonComplete={handlePolygonComplete} />
      </div>

      {completedPolygons.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 80,
            right: 20,
            background: "rgba(255,255,255,0.95)",
            padding: "1rem",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            maxWidth: "300px",
            maxHeight: "400px",
            overflow: "auto",
          }}
        >
          <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1rem" }}>
            Completed Polygons ({completedPolygons.length})
          </h3>
          {completedPolygons.map((polygon, idx) => (
            <div
              key={idx}
              style={{
                marginBottom: "0.5rem",
                padding: "0.5rem",
                background: "#f5f5f5",
                borderRadius: "4px",
                fontSize: "0.85rem",
              }}
            >
              <strong>Polygon {idx + 1}</strong>
              <div style={{ marginTop: "0.25rem", color: "#666" }}>
                {polygon.length} vertices
              </div>
              <details style={{ marginTop: "0.25rem" }}>
                <summary style={{ cursor: "pointer", fontSize: "0.8rem" }}>
                  Show coordinates
                </summary>
                <pre
                  style={{
                    fontSize: "0.75rem",
                    margin: "0.25rem 0 0 0",
                    overflow: "auto",
                  }}
                >
                  {JSON.stringify(polygon, null, 2)}
                </pre>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
