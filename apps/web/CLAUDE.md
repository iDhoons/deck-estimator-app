# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev          # Start Vite dev server with HMR

# Build
npm run build        # TypeScript check + Vite production build

# Lint
npm run lint         # ESLint
```

The `@deck/core` package (in `../../packages/core`) must be built before running this app:

```bash
cd ../../packages/core && npm run build
```

To run core package tests:

```bash
cd ../../packages/core && npm test
```

## Architecture

This is a deck estimator web application for Korean users. It calculates material quantities (boards, substructure, fasteners, anchors, footings) for deck construction projects.

### Monorepo Structure

- `apps/web/` - React frontend (this directory)
- `packages/core/` - Pure TypeScript calculation logic (`@deck/core`)

### Core Package (`@deck/core`)

Located at `packages/core/src/`:

- `types.ts` - Domain types: `Plan`, `Product`, `Ruleset`, `Quantities`, `CutPlan`, `Polygon`, `Point`
- `calculateQuantities.ts` - Main quantity calculation: area, board pieces, substructure lengths, fastener counts
- `cutPlan.ts` - Pro-mode cut plan generation with offcut reuse (greedy algorithm)
- `geometry.ts` - Polygon math: rotation, bounding box, span calculations

### Web App (`apps/web/src/`)

- `App.tsx` - Main app with mode selection (consumer/pro), shape presets, and state management
- `components/DeckCanvas.tsx` - SVG-based interactive polygon editor with pan/zoom/rotate, vertex dragging, and edge controls
- `components/ControlsPanel.tsx` - Shape selection, dimension display, corner rounding controls
- `components/ResultsPanel.tsx` - Quantity results display, cut plan visualization
- `geometry/` - Frontend-specific geometry utilities (polygon fitting, edge handles)
- `i18n/` - Korean localization (currently Korean-only)

### Key Concepts

- **Modes**: Consumer mode applies loss rate multipliers; Pro mode enables cut plan generation
- **Shape Types**: rectangle, lShape, tShape, circle, free (custom polygon)
- **Polygon Editing**: Edge controls for orthogonal shapes; vertex dragging for free shapes
- **Substructure**: Primary (멍에/beams) and secondary (장선/joists) members calculated via grid intersection
