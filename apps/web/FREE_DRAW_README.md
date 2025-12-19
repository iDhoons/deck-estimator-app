# Free Drawing Mode

A free drawing canvas that allows users to create custom polygons by clicking to add vertices.

## Features

### Grid System
- **100mm grid** - All points snap to a 100mm grid for precision
- Grid lines visible in the background
- Logical coordinate system in millimeters

### Point Accumulation
- **Left-click** to add a vertex
- Points are added in order to form a polygon
- Points automatically snap to the nearest 100mm grid intersection

### Polygon States

#### 1 Point
- Renders as a single point (circle)

#### 2 Points
- Renders as a dashed line (polyline)
- Both vertices shown as circles

#### 3+ Points
- Renders as a filled preview polygon
- Dashed outline indicates it's still in draft mode
- All vertices shown as circles
- First vertex shows a dotted circle indicating the close radius

### Polygon Closing
- Click within **20mm** of the first point to close the polygon
- Closed polygon moves from draft layer to final shapes layer
- Draft is cleared and ready for a new shape
- Callback triggered with completed polygon points

## Controls

- **왼쪽 클릭** (Left-click) - Add vertex to current draft
- **오른쪽 클릭** (Right-click) - Pan the canvas
- **마우스 휠** (Mouse wheel) - Zoom in/out
- **회전** (Rotate) - Rotate the view by 15°
- **중앙 맞추기** (Center) - Reset view to default
- **축소/확대** (Zoom out/in) - Adjust zoom level
- **지우기** (Clear) - Clear all shapes and draft

## Usage

### Access the Demo
1. Run the development server: `npm run dev`
2. Navigate to: `http://localhost:5173/#free-draw`

### Drawing a Shape
1. Click anywhere on the canvas to place the first vertex
2. Continue clicking to add more vertices
3. When you have 3+ vertices, click near the first vertex (within 20mm) to close the polygon
4. The completed polygon will be added to the final shapes layer
5. Start clicking again to create a new shape

### Integration

```tsx
import { FreeDrawCanvas } from "./components/FreeDrawCanvas";
import type { Point } from "@deck/core";

function MyComponent() {
  const handlePolygonComplete = (points: Point[]) => {
    console.log("Completed polygon:", points);
    // Do something with the polygon
  };

  return <FreeDrawCanvas onPolygonComplete={handlePolygonComplete} />;
}
```

## Architecture

### Layers (bottom to top)
1. **Grid layer** - Background 100mm grid (non-interactive)
2. **Final shapes layer** - Completed, finalized polygons
3. **Draft layer** - Current polygon being drawn
4. **Controls layer** - UI buttons for view manipulation

### State Management
- `draftPoints: Point[]` - Points in the current draft polygon
- `finalShapes: Point[][]` - Array of completed polygons
- View transformation state (pan, zoom, rotation)

### Coordinate System
- World coordinates in millimeters
- Grid spacing: 100mm
- Close threshold: 20mm
- All coordinates are `{ xMm: number, yMm: number }`

## Implementation Details

### Grid Snapping
```typescript
function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}
```

### Polygon Closing Logic
- Calculates Euclidean distance from new point to first point
- If distance ≤ 20mm, closes the polygon
- Moves polygon from draft to final shapes
- Clears draft state

### Pan/Zoom
- Right-click or middle-click to pan
- Mouse wheel to zoom (range: 0.2x to 5x)
- Rotation in 15° increments
- View transformation preserves world coordinates

## Files

- `src/components/FreeDrawCanvas.tsx` - Main canvas component
- `src/pages/FreeDrawDemo.tsx` - Demo page with UI
- `src/main.tsx` - Routing setup for hash-based navigation

## Future Enhancements (Not Implemented)

These features are intentionally excluded per requirements:
- ❌ Length correction UI
- ❌ Angle constraints
- ❌ Edit handles for existing shapes
- ❌ Pricing or quantity calculation
- ❌ Mode switching UI
