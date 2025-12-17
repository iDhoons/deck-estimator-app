# Deck Estimator WebApp - SPEC (v1)

## Modes
- consumer: estimate only (no cut plan, locked rules)
- pro: cut plan + trace coloring + advanced overrides

## Inputs
### Geometry
- Rectangle, L-shape, Free draw polygon
- Edit: move/delete points
- Unit: mm

### Direction
- user selects decking direction (angle or preset)

### Product
- productId
- stockLengthMm (single, fixed)
- widthOptionsMm
- thicknessMm
- fasteningModes: clip | screw
- gapMm: fixed 5

### Options
- stairs: optional (widthMm, totalRiseMm, steps auto/manual, side cladding optional)
- side profile editor: pro only (later)

## Outputs
- boards: qty, area
- substructure: primaryLenM, secondaryLenM
- anchors: qty
- footings (동바리/받침): qty
- fasteners: clips OR screws (intersection-based; screws = intersections * 2)
- price: user input (v1), pricebook (v2)

## Rules
- consumer loss: 3% + shapeFactor (cap)
- pro loss: from cut plan result (near-optimal)
- secondary spacing default: 400mm (consumer)
