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

## Enabling it

1. **Install the optional runtime** (kept out of the default install to avoid
   bloat for everyone who doesn't use it):

   ```bash
   npm install onnxruntime-web
   ```

   It is loaded with an opaque dynamic import, so its absence is a graceful no-op
   (`cubicasaRuntimeAvailable()` → `false`).

2. **Obtain + convert the model.** Clone the CubiCasa5k repo
   (`github.com/CubiCasa/CubiCasa5k`, CC-BY-NC), download the released PyTorch
   weights, and export to ONNX (`torch.onnx.export`, opset 17, input
   `1×3×512×512`). Place the result somewhere your app can read it (e.g.
   `asset-cache/models/cubicasa5k.onnx`).

3. **Wire it into the image extraction worker** alongside the heuristic path:

   ```ts
   import { runCubicasaBooster, cubicasaRuntimeAvailable } from './cubicasa/booster';

   const boosted = (await cubicasaRuntimeAvailable())
     ? await runCubicasaBooster({ model, image, wall: { mmPerPx } })
     : null;
   const plan = boosted ?? heuristicPlanFromImage(image, { mmPerPx }); // graceful fallback
   ```

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
