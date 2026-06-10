# HomeCanvas AI

Turn a 2D residential floor plan into an **interactive, near-photoreal, editable 3D home** — explore materials, colors, furniture, and Indian-context design styles, then save and compare variants. **Local-first: your files never leave this machine.** No paid APIs anywhere.

> **Status: Phase 1 of 8.** Interactive 3D canvas with the full scene-graph/patch architecture, material & style editing, locks, undo/redo, and local variants. Upload/tracing, automatic extraction, agent chat, and the path-traced Photo Mode arrive in later phases (see Roadmap).

![Phase 1: sample penthouse in the design canvas](docs/design-canvas.png)

## Quick start

Requires **Node ≥ 22.13** (uses the built-in fetch + modern ESM; pdf.js in later phases needs it too).

```bash
npm install
npm run dev          # web app on http://localhost:5173 + local sidecar on 127.0.0.1:4871
```

Open http://localhost:5173 → **Sample Penthouse** → click rooms/walls/furniture, swap materials, apply style packs, undo, save variants.

**Strongly recommended once** (25 MB, makes materials dramatically better):

```bash
npm run fetch:assets   # downloads CC0 PBR textures + HDRIs (Poly Haven) into asset-cache/
```

Everything still works without it — materials fall back to flat PBR colors and the environment falls back to procedural light panels.

### Windows note

Everything is cross-platform (`node:path`, no bashisms, npm scripts only). On the GTX 1060-class machine, rendering auto-degrades gracefully; a quality toggle lands alongside Photo Mode (P5).

## Using your own home

Your real files live in a **gitignored, never-uploaded** folder:

```bash
npm run init:private     # creates private-home-inputs/ with the full layout
# drop files in:
#   private-home-inputs/raw/floor-plan-main.pdf (or .png/.jpg)
#   private-home-inputs/raw/*.dwg|*.dxf                 (optional CAD)
#   private-home-inputs/raw/dimensions.pdf, electrical.pdf, ...
#   private-home-inputs/raw/site-photos/                (photos of your empty rooms)
#   private-home-inputs/raw/reference-tiles|furniture|colors|moodboards/
npm run detect:private   # see what the app recognizes
```

The home screen shows a **My Home** card when files are detected. Phase 1 supports loading
`private-home-inputs/processed/scene-json/my-home.scene.json` if present (or starting from the
sample and reshaping); the upload + scale-calibration + **snap-assisted tracing** wizard that turns
your real plan into that scene is Phase 2; automatic extraction is Phase 3.

## Privacy guarantees

- `/private-home-inputs/`, `/asset-cache/`, and `/.homecanvas/` are gitignored from the first commit.
- All processing is local: the only backend is a sidecar bound to `127.0.0.1` with an Origin check
  (so random websites can't poke a localhost API that reads your files).
- There is **no code path that uploads anything**. Asset fetching is download-only (CC0 from Poly Haven).
- The future Claude bridge (P4) is **off by default, human-driven, and disclosed**: using it means
  *you* explicitly hand a request to your own local Claude Code session.

## Architecture (the 30-second tour)

```
Vite SPA (React 19 + R3F)        Hono sidecar (127.0.0.1)
  renderer = pure projection  ←→   fs: scenes/variants/manifest/assets
  of the scene graph                 (atomic temp+rename writes)
        ↓ every edit
  ScenePatch (zod-validated domain ops)
        ↓
  ONE commit pipeline (lib/scene/commit.ts):
    parse → immer produceWithPatches → effect-set lock check
    → full validation → per-variant log entry
```

Three rules everything follows:

1. **The scene graph is the source of truth** — a zod-validated JSON document (`lib/scene/schemas.ts`).
   The renderer never owns state; agents (later) never touch meshes.
2. **Deterministic code does geometry; AI does judgment.** Wall mitering, opening cuts, stairs,
   validation, undo — all pure TypeScript in `lib/geometry` + `lib/scene`, heavily unit-tested.
   No CSG: walls are a **wall-network** (mitered junction outlines, interval-merged parametric
   openings, continuous UVs — `lib/geometry/walls.ts`).
3. **Undo/redo replays inverse patches through the same validation gate** — locks cannot be bypassed,
   not even by undo. Locks guard an *effect set* (any entity whose bytes would change), so indirect
   edits (style sweeps, shared-material updates → copy-on-write) are caught too.

Key directories:

| Path | What lives there |
|---|---|
| `lib/scene/` | schemas (zod 4), commit pipeline, validation, migrations (+ frozen fixture corpus in `tests/fixtures/schema-versions/`) |
| `lib/geometry/` | wall-network, rooms/polygons, parametric stairs, scale/calibration, buffer extrusion |
| `lib/styles/` | material library, 5 style packs (12 by P5), pack→patch expansion |
| `lib/agent/` | provider interface; deterministic MockAgentProvider (default); Claude bridge + future providers are stubs |
| `lib/fixtures/` | committed sample penthouse; private-home detection |
| `src/` | React app: canvas (archviz-lite: AgX tone mapping, HDRI IBL, N8AO, PCF shadows, SMAA/bloom), inspector, panels, store |
| `server/` | Hono sidecar: manifest/scene/variant/asset routes |
| `scripts/` | `init:private`, `detect:private`, `fetch:assets` |

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | web + sidecar together |
| `npm test` / `npm run typecheck` / `npm run lint` | Vitest (75 tests) / `tsc --noEmit` strict / ESLint |
| `npm run init:private` / `detect:private` | create / scan the private fixture tree |
| `npm run fetch:assets` | pull curated CC0 textures + HDRIs locally |

## Roadmap

- **P2** — upload UI, per-floor scale calibration, snap-assisted manual tracing over your real plan, verification wizard
- **P3** — local heuristic extraction (raster CV + OCR'd labels/dimensions), DXF parsing, optional user-installed DWG converters
- **P4** — agent chat: structured edit proposals (preview → approve), Mock provider full, human-driven Claude Code bridge
- **P5** — CC0 glTF furniture, collision-aware placement, reference-image palettes, full 12 style packs, **Photo Mode** (three-gpu-pathtracer + OIDN denoise — photoreal stills in ~1–4 min even on a GTX 1060)
- **P6** — extraction review loops, geometry-correction proposals, re-extraction reconciliation
- **P7** — exports, design boards, variant comparison, optional Blender Cycles quality ceiling

## Honest limitations (also shown in-product)

- Uploaded 2D plans will need manual verification; dimensions are approximate unless you confirm them.
- Visualizations are for **design exploration, not construction drawings**.
- Furniture sizes/materials are approximations; placeholder geometry until P5 brings real models.
- Curved walls are stored in the schema (arc-ready) but not yet rendered; straight walls at any angle work.
- DWG support (P3) depends on a user-installed converter (ODA File Converter or `brew install libredwg`) — never bundled, never cloud.
- AI suggestions (P4+) are design aids, not a replacement for an architect or interior designer.
