# CubiCasa5k extraction booster (optional, personal-use only)

An **optional** ML booster for the no-CAD raster extraction path. It runs the
CubiCasa5k floor-plan segmentation model and turns its wall prediction into the
same `PrimitivePlan` the heuristic CV pipeline produces, so the result flows
through the identical `buildSceneFromPrimitives` spine.

The core app **never depends on this**. If the runtime or model is absent, the
booster returns `null` and the heuristic pipeline is used instead.

## ⚠️ License: CC-BY-NC (non-commercial)

CubiCasa5k weights are **CC-BY-NC** — personal/research use only. They are **never
bundled** with this repo. This directory is generic mask plumbing
(`masks-to-plan.ts`, always present + permissively licensed); the weights it
consumes are **user-supplied**. Before any commercial use, swap this adapter for a
permissively-licensed model — the integration point is one function
(`runCubicasaBooster`), so the swap is cheap.

## Enabling it (two one-time local steps)

The wiring is already in place — the image-upload path calls the booster first and
falls back to heuristic CV automatically (`src/lib/import-plan.ts` →
`/api/extract/cubicasa`). You only need to provide the runtime + the model:

1. **Install the optional ONNX runtime** for the sidecar (kept out of the default
   install so non-users carry no weight — loaded via an opaque dynamic import, so
   its absence is a graceful no-op):

   ```bash
   npm install onnxruntime-node
   ```

2. **Download + convert the weights** (one command; heavy — installs torch, clones
   the model code, fetches a ~200 MB checkpoint, writes a ~300 MB ONNX into the
   GITIGNORED `asset-cache/models/`):

   ```bash
   npm run convert:cubicasa     # = python3 scripts/convert-cubicasa.py
   ```

Restart the sidecar. `GET /api/extract/cubicasa/available` now returns `true` and
every raster import is boosted. Neither the weights nor the ONNX are committed.

## How it's wired

- `scripts/convert-cubicasa.py` — downloads + exports the model (CC-BY-NC, local only).
- `server/adapters/cubicasa.ts` — detects the model, runs inference on raw RGBA.
- `POST /api/extract/cubicasa` + `GET …/available` — the sidecar endpoints.
- `src/lib/import-plan.ts` `tryCubicasaBoost()` — the client sends the page's RGBA
  to the sidecar and uses the returned `PrimitivePlan`, else heuristic CV.

## ONNX I/O note

CubiCasa5k has two heads (rooms + icons). This adapter uses the **rooms** head
(12 classes; index `2` is `Wall`). The exact tensor names and output layout
depend on how you export to ONNX — `runCubicasaBooster` assumes the first output
is the room logits in `CHW` order at `512×512`. Adjust the indexing in `booster.ts`
for your specific conversion if needed.

## What's tested vs not

- **Tested (no model needed):** `argmaxClassMap`, `wallMaskFromSeg`,
  `cubicasaSegToPlan` (a wall-class ring → walls via the shared raster path), and
  `resizeNormalizeChw` (model-input prep). See `*.test.ts`.
- **Not exercised here:** real ONNX inference (needs the NC weights +
  onnxruntime-web). `runCubicasaBooster` is a thin orchestration over the tested
  pieces.
