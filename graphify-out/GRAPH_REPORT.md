# Graph Report - storytellingtest  (2026-08-26)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 52 nodes · 52 edges · 9 communities (8 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2477afb7`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 7

## God Nodes (most connected - your core abstractions)
1. `scripts` - 5 edges
2. `OwlRig()` - 3 edges
3. `Scrollytelling()` - 2 edges
4. `sampleWingWave()` - 2 edges
5. `isInRanges()` - 2 edges
6. `animejs` - 2 edges
7. `lenis` - 2 edges
8. `react` - 2 edges
9. `react-dom` - 2 edges
10. `@vitejs/plugin-react` - 2 edges

## Surprising Connections (you probably didn't know these)
- `Scrollytelling()` --calls--> `OwlRig()`  [EXTRACTED]
  Scrollytelling.jsx → OwlRig.jsx

## Import Cycles
- None detected.

## Communities (9 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.38
Nodes (5): isInRanges(), sampleWingWave(), SEGMENT_GAIN, SEGMENT_LAG_MS, event

### Community 1 - "Community 1"
Cohesion: 0.22
Nodes (9): animejs, lenis, dependencies, animejs, lenis, react, react-dom, react (+1 more)

### Community 2 - "Community 2"
Cohesion: 0.22
Nodes (6): IMAGE_X, OwlRig(), SHOULDER_PIVOT, WING_SPECS, B, Scrollytelling()

### Community 3 - "Community 3"
Cohesion: 0.33
Nodes (5): description, name, private, type, version

### Community 4 - "Community 4"
Cohesion: 0.40
Nodes (5): devDependencies, vite, @vitejs/plugin-react, vite, @vitejs/plugin-react

### Community 5 - "Community 5"
Cohesion: 0.40
Nodes (5): scripts, build, dev, preview, test

## Knowledge Gaps
- **23 isolated node(s):** `IMAGE_X`, `SHOULDER_PIVOT`, `WING_SPECS`, `WING_FAN_ANGLES`, `B` (+18 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Community 1` to `Community 3`?**
  _High betweenness centrality (0.119) - this node is a cross-community bridge._
- **Why does `scripts` connect `Community 5` to `Community 3`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Community 4` to `Community 3`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **What connects `IMAGE_X`, `SHOULDER_PIVOT`, `WING_SPECS` to the rest of the system?**
  _23 weakly-connected nodes found - possible documentation gaps or missing edges._