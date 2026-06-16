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

## Enabling it (one one-time local step)

The wiring is already in place — the image-upload path calls the booster first and
falls back to heuristic CV automatically (`src/lib/import-plan.ts` →
`/api/extract/cubicasa`). The ONNX runtime (`onnxruntime-node`) ships as a
dependency, loaded via an opaque dynamic import so a failed native load is still a
graceful no-op. You only need to provide the model:

- **Download + convert the weights** (one command; heavy — installs torch, clones
  the model code, fetches a ~200 MB checkpoint, writes a ~70 MB ONNX into the
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

## ONNX I/O note (validated against the official checkpoint)

The single output is a 44-channel map = 21 junction heatmaps + 12 room classes (at
`roomOffset` 21) + 11 icon classes, `CHW` at `512×512`; the booster argmaxes the
room slice and treats class `2` as `Wall`. Two preprocessing details matter and are
handled in `booster.ts`:

- **Input range is `[-1, 1]`** (`2*(x/255) - 1`, the repo's `svg_loader.py`), NOT
  `[0,1]` — feeding `[0,1]` runs but degrades predictions.
- **Aspect-preserving fit**: the image is fit (long side → 512) and padded, not
  squashed to a square; the seg is then cropped and `mmPerPx` corrected by the
  downscale, so a non-square plan keeps its real proportions and scale.

The export step (`convert-cubicasa.py`) builds the architecture directly and skips
`init_weights()` (an MPII backbone-pretraining load the repo doesn't ship and which
the full checkpoint overwrites anyway). Adjust the indexing here for a different
export.

## What's tested vs not

- **Tested in CI (no model needed):** `argmaxClassMap`, `wallMaskFromSeg`,
  `cubicasaSegToPlan` (a wall-class ring → walls via the shared raster path), and
  the model-input prep `resizeNormalizeChw` + `fitNormalizeChw` (aspect-fit +
  `[-1,1]` normalize). See `*.test.ts`.
- **Validated manually, not in CI:** real ONNX inference — CI can't run it (the NC
  weights are gitignored). `runCubicasaBooster` was driven end-to-end over the real
  penthouse plan: correct wall masks + correct real-world plan extent. It is a thin
  orchestration over the tested
  pieces.
