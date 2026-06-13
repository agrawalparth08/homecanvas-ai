# HomeCanvas — 2D → 3D Extraction Overhaul (Two-Path Plan)

Status: DRAFT for `/plan-eng-review`
Goal: materially improve the quality of converting a 2D floor plan into a correct,
editable 3D home — via **two front doors**: (A) precise CAD when the user has a
DWG/DXF, and (B) a genuinely better image/PDF path when they don't.

---

## 1. Current state (ground truth, from code)

- **No raster CV exists.** No OpenCV, distance-transform, skeleton, or Hough. For any
  image/scanned PDF the only path is the user clicking wall corners in the wizard.
- **The only auto-trace is DXF-only and half-wired.** `POST /api/private-home/auto-trace`
  → `autoTraceDxf` ([auto-trace.ts](../lib/extraction/auto-trace.ts)) → `parseDxf` →
  heal → detectRooms. It returns **room rectangles only** — `{rooms, wallCount, unitsToMm}`.
  Nothing in the UI calls it, and it does **not** produce a real `HomeScene`.
- **The "rects → real 3D scene" builder is not reusable.** Wall thickness, shared-wall
  merging, opening placement, heights, stairs, lights all live in
  `scripts/generate-my-home-scene.ts` (`buildFloor`/`buildArrangement`), usable only by
  the my-home script, hard-coded to traced JSON.
- **The DXF parser is geometry-poor** ([dxf.ts](../lib/ingestion/dxf.ts)): ignores **layers**
  entirely, **drops every non-axis-aligned segment**, ignores **arcs/bulges**, ignores
  **INSERT blocks** (doors/windows are almost always blocks), has **no openings/columns/stairs**.
- **The DWG is never used.** `convertDwgToDxf` ([converters.ts](../server/adapters/converters.ts))
  is a stub with zero callers; no converter is installed.
- **Z is faked.** Heights/ceilings/roof are defaults; `ELEVATION & SECTION NO. 6.pdf` is unused.
- **Scale is manual** (a calibration line); thresholds are pixel magic numbers
  (`maxGap=320`, snap `tol=16`) that break at other DPIs.
- **Room detection can falsely merge** — `detectRooms` uses midpoint-blocking, so a wall
  that only partly covers a cell edge is treated as fully open/closed.

**Implication:** the single highest-leverage work isn't "better CV" — it's (1) a reusable
scene-builder spine, and (2) actually exploiting vector data (CAD layers, and vector PDFs)
that's currently discarded.

---

## 2. Design principle — one spine, two front doors

```
            ┌───────────── Path A: CAD ─────────────┐
 DWG ─► DXF ─► layer-aware vector parse ─► PrimitivePlan ─┐
            └───────────────────────────────────────┘    │
                                                          ├─► SHARED SPINE ─► HomeScene
            ┌──────────── Path B: no CAD ───────────┐    │   (rects+segments+openings
 PDF ─► is-vector? ─► vector-path extract ──────────┐│    │    +columns+heights →
 IMG ─► raster CV (OpenCV worker) ──────────────────┼┼────┘    walls/rooms/floors/stairs)
        assisted tracing (always available floor) ──┘│         + confidence + provenance
                                                      ▼
                                          Verify/correct UI (existing wizard, extended)
```

Both paths emit the same intermediate, **`PrimitivePlan`** (a typed bag of
walls-with-thickness, openings, columns, stairs, room hints, labels, scale, provenance).
A single `buildSceneFromPrimitives()` turns that into a validated `HomeScene` through the
existing commit pipeline. Everything downstream (verify wizard, confidence ghosting,
3D view, undo) is shared.

---

## 3. Phase 0 — Shared spine (prerequisite for BOTH paths)

0.1 **Define `PrimitivePlan`** in `lib/extraction/primitive-plan.ts` (zod):
   `{ unitsToMm, walls: Segment[] (a,b,thickness?,height?,layer?), openings: Opening[]
   (kind, host hint, center, width, sill?, head?), columns: Rect[], stairs: StairHint[],
   roomHints: {polygon|rect, label?}[], labels, bounds, source, confidenceInputs }`.

0.2 **Extract the scene builder** out of `generate-my-home-scene.ts` into
   `lib/extraction/build-scene.ts`: `buildSceneFromPrimitives(plan, opts) → HomeScene`.
   Reuse `buildArrangement`/shared-wall merge/opening placement; generalize from
   axis-rects to arbitrary wall segments + room polygons. Refactor the my-home script to
   call it (keeps the one regression we can eyeball).

0.3 **Wire auto-trace → scene → commit:** new `POST /api/private-home/build-scene`
   takes a `PrimitivePlan` (or a source file ref) and returns a `HomeScene` saved as a
   draft; the verify wizard loads it for correction instead of starting blank.

0.4 **Scale-aware geometry:** convert healing/snap/room thresholds from pixels to **mm**
   (drive off `unitsToMm`/calibration). Replace `detectRooms` midpoint-blocking with
   **interval-coverage** (a wall blocks an edge only if it covers ≥X% of it).

*Tests:* primitive-plan zod round-trips; build-scene from a known primitive set →
expected walls/rooms/openings; my-home script still produces an equivalent scene
(snapshot); interval-coverage room cases (partial walls no longer merge).

---

## 4. Path A — CAD (DWG/DXF provided) — the precision path

A1. **DWG → DXF, wired + installed.** Implement a sidecar job calling `convertDwgToDxf`;
   detect LibreDWG (`dwg2dxf`) / ODA; document `brew install libredwg`. Endpoint
   `POST /api/private-home/cad-import` accepts `.dwg`/`.dxf`, converts if needed, returns
   job id. Graceful "converter not installed → here's the one-liner" message.

A2. **Layer-aware, geometry-rich DXF parse** (rewrite [dxf.ts](../lib/ingestion/dxf.ts)):
   - Read **layer** per entity; classify via a configurable map
     (`WALL|DOOR|WINDOW|COLUMN|STAIR|DIM|FURNITURE|TEXT|other`) with sensible regex
     defaults (`*WALL*`, `A-WALL`, `*DOOR*`, `*WIN*`, `*COL*`, `*STAIR*`…) **plus** a
     "learn from this file" override the user confirms once (layer table shown in UI).
   - Keep **angled** segments (general `Segment{a,b}`, not just v/h); tessellate **arc
     bulges** in LWPOLYLINE; read `ARC`/`CIRCLE` for columns.
   - **INSERT blocks** → openings/stairs by block name + insertion point + the host wall.
   - Wall **thickness** from double-line pairs or layer metadata; fall back to default.
   - Emit a `PrimitivePlan` (not just rects).

A3. **CAD → scene end to end:** parse → `PrimitivePlan` → `buildSceneFromPrimitives` →
   draft scene → verify UI. Run it on the real penthouse DWG; compare against the
   hand-traced my-home as the accuracy yardstick.

A4. **UI:** "Import CAD (DWG/DXF)" on UploadPage → progress → **layer-mapping confirm**
   step (toggle which layers are walls/doors/…) → auto-built scene opens in verify.

*Tests:* layer classification table; arc tessellation; INSERT→opening; fixture DXF with
angled wall survives; DWG-converter detection (mocked); end-to-end DXF→HomeScene.

---

## 5. Path B — no CAD (image / PDF) — the "better approach"

Ordered by quality, each a fallback for the previous:

B1. **Vector-PDF first (biggest quick win).** Many "PDF plans" are vector ≈ CAD. Promote
   the existing `getOperatorList` extractor (today only in `scripts/trace/lib.mjs`) into
   `lib/ingestion/pdf-vector.ts`: detect if a PDF page is vector-rich; if so, extract
   stroked paths + colors → `PrimitivePlan` (same color/stroke heuristics already proven
   on the penthouse: black=walls, orange=openings, magenta=columns), skipping raster CV
   entirely. Wire as the default for vector PDFs.

B2. **Raster CV for true images/scans** — new `lib/extraction/raster-cv.ts` in a Web
   Worker using `@techstark/opencv-js` (in the approved stack, currently unused):
   deskew (Hough) → adaptive threshold → **strip text** via OCR connected-components →
   wall mask via distance-transform thickness filter → **skeletonize** (Zhang–Suen) →
   vectorize (marching-squares + Douglas–Peucker) → axis/angle snap → `PrimitivePlan`.
   Door/window heuristics: wall-gap + arc detection (low confidence, ghosted).

B3. **Auto-scale from dimensions.** Use existing OCR + `parseFeetInches`; detect dimension
   lines/leaders, match the nearest dim string, solve mm/px automatically (manual
   calibration line becomes the fallback, not the default).

B4. **Assisted-tracing floor stays.** CV output is *suggestions* the user accepts/edits in
   the wizard; if CV confidence is low it degrades to today's manual trace. Optional
   flagged **CubiCasa5k ONNX** booster (`onnxruntime-web`, personal-use adapter) deferred
   behind a setting — recommend NOT in v1.

*Tests:* vector-PDF detection + extraction on a committed synthetic vector PDF; raster-CV
on synthetic plans with known geometry (recall/precision thresholds); skeleton/vectorize
units; auto-scale solver on labeled fixtures.

---

## 6. Cross-cutting

- **Z-axis / "proper 3D":** default heights now; Phase Z (later) parses
  `ELEVATION & SECTION NO. 6.pdf` for storey height, parapet, roof slope; per-room
  height override in inspector meanwhile.
- **Confidence + provenance:** every primitive carries `source` + inputs;
  `scoreConfidence` already ghosts low-confidence; CAD = high, vector-PDF = high/med,
  raster-CV = low/med, manual = high. Review queue unchanged.
- **Privacy:** all local; DWG/section stay gitignored; converter is exec-only.

---

## 7. Sequencing

1. **Phase 0** (spine) — unblocks everything; ships value (auto-trace finally makes a scene).
2. **Path A** (A1–A4) — highest accuracy ceiling, improves the real home now.
3. **Path B1** (vector PDF) — cheap, high quality, reuses proven heuristics.
4. **Path B2–B3** (raster CV + auto-scale) — the general-user magic.
5. **Phase Z / CubiCasa** — optional, later.

First execution slice after approval: **Phase 0 + A1–A2** (spine + CAD parse), since the
user explicitly wants the DWG path first.

---

## 8. Top risks

| Risk | Mitigation |
|---|---|
| Refactor of scene-builder regresses my-home | Snapshot test before/after; keep script calling new lib |
| DWG layer conventions vary by drafter | Defaults + one-time user confirm of the layer table |
| Raster CV accuracy on messy builder scans | Framed as suggestions over the assisted-trace floor; honest confidence |
| OpenCV.js worker size/perf | Lazy-load in worker; only on the raster fallback path |
| Arc/angled walls ripple into geometry core | wall-network already polyline/bulge-ready per the original plan |

---

## 9. Locked decisions (from /plan-eng-review)

- **D1 — Scope:** build the **whole plan** (Phase 0 + Path A + Path B + Path Z), sequenced
  A → (B ∥ C) → Z. Not reduced.
- **D2 — Angled/curved walls: HYBRID.** Axis-aligned grid room-detector by default; a
  general polygon (planar-subdivision) fallback kicks in only when angled walls are
  detected. Arcs tessellated on import. Both paths kept in sync + tested.
- **D3 — Heights/Z: AUTO-PARSE the section PDF.** A section-parsing pipeline (OCR dims +
  floor/ceiling line detection from `ELEVATION & SECTION NO. 6.pdf`) sets storey height,
  parapet, roof slope automatically; manual global storey-height + per-room override
  remain as the correction floor.
- **A2 — Keep the `PrimitivePlan` intermediate** (shared DRY seam for both front doors).
- **Mandatory (regression rule):** extracting `buildSceneFromPrimitives` ships with a
  **before/after snapshot test** proving the my-home scene is unchanged; the
  `detectRooms` midpoint→interval-coverage change ships with a partial-wall no-merge
  regression test.
- **DRY:** color heuristics consolidated into one shared `lib/extraction/color-features.ts`
  (TS) used by both `scripts/trace/*` and `pdf-vector.ts` — no second copy.
- **Thresholds:** all healing/snap/room thresholds converted px → mm (scale-aware).
- **CAD converter:** external LibreDWG/ODA, detect + graceful `brew install libredwg`
  message; never silent-fail.

### Failure modes that must be handled (not silent)
1. DWG converter missing → blocks CAD path → show install one-liner.
2. Vector-PDF false positive on a raster scan → empty geometry → offer "switch to raster".
3. OpenCV worker OOM on huge scans → cap resolution + clear error.

### NOT in scope
CubiCasa ONNX booster; photogrammetry/site-photo→geometry; curved-wall *editing* UI
(curves imported/tessellated, not hand-editable); multi-floor auto-registration.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 3 decisions locked (D1-D3), 2 critical regressions gated, 5 reqs folded |
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | not run (import + layer-confirm + height UI worth one later) |
| Outside Voice | Claude subagent | Independent challenge | 0 | — | offered |

**UNRESOLVED:** none — all three forks decided.
**VERDICT:** ENG CLEARED — architecture locked, ready to implement. Sequence A → (B ∥ C) → Z.
