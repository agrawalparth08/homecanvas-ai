# Floor-plan extraction: license hygiene research (CubiCasa5k replacement search)

**Date:** 2026-08-12
**Scope:** Can a permissively-licensed (MIT/Apache/BSD/CC-BY) floor-plan
extraction model replace the CubiCasa5k booster behind `runCubicasaBooster`
(`lib/extraction/cubicasa/booster.ts`, consumed by
`server/adapters/cubicasa.ts`) for commercial distribution?
**Bottom line:** No drop-in replacement exists today. Every permissively
*coded* architecture we found ships checkpoints trained on non-commercial
data, which taints the weights the same way CubiCasa's own weights are
tainted. The one clean path is train-your-own on `ResPlan` (CC BY 4.0,
released Aug 2025) using an MIT- or Apache-licensed architecture. See
Recommendation.

---

## The rule this memo applies throughout

A model has three separable license surfaces, and a commercial product needs
**all three clean**:

1. **Code license** — the training/inference code repo.
2. **Weights license** — the actual `.pth`/`.onnx`/checkpoint file. This is
   **not automatically the same as the code license** unless the repo's
   LICENSE file explicitly covers the whole repo (code + released artifacts)
   and the weights were trained on clean data. A repo can be MIT and still
   ship a checkpoint you can't use commercially, if that checkpoint was
   trained on restricted data — the checkpoint is a derivative work of the
   training set, and MIT on the *code* says nothing about that.
3. **Training-data license** — if unclean (research-only, CC-BY-NC,
   redistribution-prohibited), the resulting weights sit in the same legal
   grey zone CubiCasa's own weights are already in, defeating the point of
   switching.

Where a repo has **no LICENSE file at all**, default copyright law applies:
all rights reserved, nobody may use/copy/modify it, full stop. Several repos
below hit exactly this. Unstated = unusable, not "presumably fine."

---

## Ranked table — pretrained models (raster/scan floor-plan → walls/rooms/openings)

| Model | Code license | Weights license | Training-data license | Fidelity vs CubiCasa | Integration effort | Verdict |
|---|---|---|---|---|---|---|
| **CubiCasa5k** (incumbent) | CC BY-NC 4.0 (single repo-wide LICENSE covers code + weights + data — [confirmed](https://github.com/CubiCasa/CubiCasa5k/blob/master/LICENSE)) | CC BY-NC 4.0 | CC BY-NC 4.0 (self) | Baseline (100%) | Already integrated | **Keep as opt-in personal-use booster** — current isolation (never bundled, user-converts) is correct |
| **RoomFormer** official checkpoint ([ywyue/RoomFormer](https://github.com/ywyue/RoomFormer), CVPR 2023) | MIT ([full text confirmed](https://github.com/ywyue/RoomFormer/blob/main/LICENSE)) | Unstated separately → inherits training-data restriction | Structured3D (Terms of Use: "non-commercial research and educational purposes only" — [confirmed](https://structured3d-dataset.org/)) + SceneCAD, built on ScanNet (Terms of Use explicitly non-commercial, [binds employer if researcher works for a for-profit entity](https://github.com/ScanNet/ScanNet)) | High — SOTA two-level-query transformer, best fidelity of everything surveyed | N/A — checkpoint unusable commercially | **Do not ship the official checkpoint.** Architecture + code are the best MIT starting point for retraining |
| **RoomFormer, self-trained on ResPlan** | MIT | Self (clean, if you train it and don't touch Structured3D/SceneCAD) | ResPlan, CC BY 4.0 ([confirmed](https://github.com/m-agour/ResPlan)) | Unverified — no one has published this combination yet | High — real training project: adapt ResPlan's polygon/graph format to RoomFormer's COCO-style ingestion, GPU training run, eval against CubiCasa on held-out rasters | **Recommended path** if HomeCanvas wants to actually replace CubiCasa |
| **SAM / SAM2 zero-shot + custom semantic head, trained on ResPlan** | Apache 2.0 ([Meta, confirmed](https://ai.meta.com/blog/segment-anything-2/)) | Apache 2.0 for SAM base weights; self for the thin head | ResPlan CC BY 4.0 (head only) | Medium — zero-shot room *boundary* masks are strong out of the box (SAM is domain-agnostic); no wall/door/window/room-type semantics without the head | Medium — lighter than full retrain, same ONNX runtime already in the repo | **Viable faster/cheaper path**, worth prototyping before committing to full RoomFormer retrain |
| **DeepFloorplan** ([zlzeng/DeepFloorplan](https://github.com/zlzeng/DeepFloorplan)) | GPL-3.0 ([raw LICENSE confirmed](https://raw.githubusercontent.com/zlzeng/DeepFloorplan/master/LICENSE): GNU GPL v3 header) | Inherits GPL-3.0 (viral copyleft — forces source disclosure of anything statically linking it, independent of the NC problem below) | R2V rasters from LIFULL HOME'S (proprietary; [application required, LIFULL can terminate access if a private company is involved](https://www.nii.ac.jp/dsc/idr/en/lifull/documents/notice.pdf)) + Rent3D/R3D ([license unstated](https://www.cs.toronto.edu/~fidler/projects/rent3D.html) — small 215-apartment academic set, no terms found) | Medium | N/A | **Do not use** — GPL viral risk *and* unclean data, two independent disqualifiers |
| **FloorplanTransformation / Raster-to-Vector** ([art-programmer/FloorplanTransformation](https://github.com/art-programmer/FloorplanTransformation), ICCV 2017) | MIT (badge + README footer confirmed) | Ambiguous — pretrained model reportedly "fine-tuned based on a pose-estimation network from an external source" (unverified separate license); repo also states rasters can't be redistributed at all | LIFULL HOME'S rasters — authors explicitly say **"we don't have permission to share the rasterized images"** | Medium — 2017-era, superseded by RoomFormer/HEAT | Code is easy to drop in, but there's no legally clean way to get training images to retrain it (LIFULL) | **Do not use** — code is clean, the only available training imagery isn't |
| **HEAT** ([woodfrog/heat](https://github.com/woodfrog/heat), CVPR 2022) | GPL v3 (LICENSE_GPL) **plus an explicit blanket restriction** — README states verbatim: *"The code, data, and pre-trained models in this repo are for non-commercial research purposes only"* | Same explicit non-commercial restriction, stated for code, data, and weights together | Structured3D (non-commercial ToS) | High — strong structured-reconstruction transformer | N/A | **Do not use** — most explicitly restricted option in the survey, restriction covers code *and* weights *and* data by the authors' own words |
| **VectorFloorSeg / VecFloorSeg** ([DrZiji/VecFloorSeg](https://github.com/DrZiji/VecFloorSeg), CVPR 2023) | **No LICENSE file in the repo at all** → default "all rights reserved," nobody may use it | N/A (same default) | Trained directly on CubiCasa5k (CC BY-NC) | High | N/A | **Do not use** — doubly disqualified (no license grant, and even if there were one, weights are CubiCasa-derived) |
| **FloorNet** ([art-programmer/FloorNet](https://github.com/art-programmer/FloorNet), CVPR 2018) | Unstated/unconfirmed | Unstated | Custom RGBD scan dataset | Medium | Wrong input modality entirely — takes RGBD video scans, not a single raster floor-plan image, and its layout solver depends on **Gurobi**, a commercial optimizer free only for academic use | **Skip** — wrong interface shape for `runCubicasaBooster` (raster image → plan), independent of licensing |
| **MonteFloor** (ICCV 2021) | No public code released | N/A | N/A | N/A (used only to *generate* the Structured3D floorplan variant HEAT/RoomFormer train on) | N/A | **Skip** — nothing to integrate |
| **FloorSAM** ([Silentbarber/FloorSAM](https://github.com/Silentbarber/FloorSAM), arXiv 2509.15750, 2025) | Unconfirmed — not stated in available sources, needs direct repo check before any use | Apache 2.0 for the underlying SAM base model it wraps | LiDAR point-cloud density maps, not raster images | Unverified | Wrong input modality — built for LiDAR scans, not the single raster image `runCubicasaBooster` receives | **Skip for now** (wrong modality, unconfirmed code license) — but it's a real-world proof that SAM's Apache-2.0 weights generalize to room-boundary segmentation, which supports the SAM-based path above |

---

## Adversarial notes on the two most-cited "permissive" claims

- **RoomFormer's MIT license is real and verified** (fetched the raw LICENSE
  file, full text is standard MIT, copyright Yuanwen Yue 2022). But MIT on
  the *code* does not launder the *checkpoint*. Treat "the repo says MIT" and
  "I can commercially ship the .pth file in that repo" as two different
  claims — the second one is false here because Structured3D's and
  ScanNet's own Terms of Use are non-commercial, confirmed directly from
  [structured3d-dataset.org](https://structured3d-dataset.org/) and the
  [ScanNet GitHub license page](https://github.com/ScanNet/ScanNet/blob/master/LICENSE).
- **WAFFLE's "Wikimedia Commons license"** (stated verbatim in its README,
  [TAU-VAILab/WAFFLE](https://github.com/TAU-VAILab/WAFFLE)) is not a real,
  single license name — Wikimedia Commons hosts files under a mix of
  individually-chosen licenses (CC BY, CC BY-SA, public domain, etc.) per
  upload. A repo pointing to `https://commons.wikimedia.org/wiki/Commons:Licensing/en`
  instead of naming one license is a yellow flag: it means "go check each of
  the ~18,500 floorplans individually," not "this dataset is CC BY." A raw
  fetch for `LICENSE` at the repo root [404'd](https://raw.githubusercontent.com/TAU-VAILab/WAFFLE/main/LICENSE),
  confirming there's no single license file to point to. Also a domain-fit
  problem independent of licensing: WAFFLE skews toward notable/historic
  buildings pulled from Wikipedia articles, not dense modern residential
  apartment plans — lower training value for HomeCanvas's use case even
  before the license question.

---

## Datasets — can HomeCanvas legally train a fresh model?

**Yes, with one real option today: [ResPlan](https://github.com/m-agour/ResPlan) (Aug 2025).**
17,000 residential floor plans (3.4x CubiCasa5k's 5,000) with vector
polygon geometry for walls/doors/windows and a 17-class room taxonomy plus
room-connectivity graphs — richer semantics than CubiCasa needs to match.
License is explicit and unambiguous, stated in the repo's own LICENSE file
and quoted in the README: **"CC BY 4.0 (data) and MIT (code)."** No
pretrained weights ship with it — it's the dataset plus loading/baseline
code only, so using it means running an actual training job, not downloading
a checkpoint.

One residual risk worth flagging adversarially rather than waving away: the
ResPlan authors built it by scraping "publicly accessible real-estate
listing pages" and vectorizing the floor-plan images found there. The CC BY
4.0 license the authors attached covers the *derived vector geometry they
produced*, which is their own creative/measurement work product — but the
underlying floor-plan images belonged to real-estate agents/brokers who
didn't license them to ResPlan's authors. This is a lower-risk profile than
reproducing the images themselves (HomeCanvas would train on vector geometry,
not redistribute the source raster images), and it's meaningfully cleaner
than a dataset that is *itself* NC-labeled — but it isn't a zero-risk,
airtight chain of title. Flag it, don't treat it as fully resolved.

Other datasets checked, all disqualified or unverified:

| Dataset | License | Verdict |
|---|---|---|
| RPLAN | Restricted-access application process; described as non-commercial research/academic use only, no redistribution ([staff.ustc.edu.cn project page](http://staff.ustc.edu.cn/~fuxm/projects/DeepLayout/index.html)) | Avoid |
| Structured3D | Explicit Terms of Use: non-commercial research/educational only; code scripts are MIT but that doesn't cover the data ([structured3d-dataset.org](https://structured3d-dataset.org/)) | Avoid |
| ScanNet (underlies SceneCAD) | Terms of Use: non-commercial research only, binds a researcher's employer if it's a for-profit entity ([ScanNet/ScanNet LICENSE](https://github.com/ScanNet/ScanNet/blob/master/LICENSE)) | Avoid |
| FloorPlanCAD | CC BY-NC 4.0 on the annotations; creators don't even own copyright on the underlying CAD drawings ([ICCV 2021 paper](https://openaccess.thecvf.com/content/ICCV2021/papers/Fan_FloorPlanCAD_A_Large-Scale_CAD_Drawing_Dataset_for_Panoptic_Symbol_Spotting_ICCV_2021_paper.pdf)) | Avoid — also wrong domain (architectural CAD symbol-spotting, not room segmentation) |
| ReCo (residential community layout) | CC BY-NC-SA 4.0 ([FDUDSDE/ReCo-Dataset](https://github.com/FDUDSDE/ReCo-Dataset)) | Avoid — also wrong domain (urban/community layout, not individual floor plans) |
| LIFULL HOME'S (underlies R2V/DeepFloorplan) | Proprietary; application required; LIFULL can terminate access if a for-profit company is involved ([official notice PDF](https://www.nii.ac.jp/dsc/idr/en/lifull/documents/notice.pdf)) | Avoid |
| MSD — Modified Swiss Dwellings (ECCV 2024) | **Unverified.** No LICENSE file found in the [GitHub repo](https://github.com/caspervanengelenburg/msd), and the README doesn't state one. 5,300+ multi-apartment-complex floor plans, largest genuinely novel structure (building complexes, not single units) in the survey. | **Do not assume permissive** — go check the [4TU.ResearchData DOI page](https://data.4tu.nl/datasets/e1d89cb5-6872-48fc-be63-aadd687ee6f9) directly (4TU-hosted research data usually carries an explicit CC license on the DOI landing page even when the code mirror omits it) before using it for anything |
| WAFFLE | Ambiguous, see adversarial note above | Needs a per-image license audit before use; not a blanket "permissive" dataset as currently documented |

**Feasibility verdict:** training your own model on legally clean data is
feasible today specifically because ResPlan exists (it didn't a year ago —
CubiCasa5k was genuinely the only dense, semantically-rich raster-plan
dataset of its kind before mid-2025). It requires a real training project
(GPU time, format-adaptation engineering, accuracy validation against
CubiCasa5k on held-out real-world plans), not a config swap. MSD is a
plausible second data source but must be confirmed at the source (4TU) before
inclusion, not assumed permissive from the GitHub mirror's silence.

---

## Local-runnable open-weight general segmentation option

**Meta's Segment Anything (SAM / SAM2), Apache 2.0**, genuinely open weights,
confirmed by Meta's own announcement. It has no floor-plan-specific training
and gives no room-type/wall/door/window semantics out of the box, but its
zero-shot masks generalize surprisingly well to floor-plan room boundaries
(this is exactly what the LiDAR-based [FloorSAM](https://arxiv.org/abs/2509.15750)
paper demonstrates, albeit on a different input modality). It's runnable
locally through the same ONNX runtime path CubiCasa already uses
(`onnxruntime-node`). The realistic integration is: SAM for room-boundary
proposals + a small, separately-trained classifier/decoder head (trained on
ResPlan, CC BY 4.0) to assign wall/door/window/room-type semantics and emit
the `PrimitivePlan` shape `runCubicasaBooster` expects. This is cheaper to
build than a full RoomFormer retrain and worth prototyping first — if the
zero-shot room masks are good enough, the head-training project is much
smaller than a full segmentation-model retrain.

---

## Recommendation

1. **Now:** keep CubiCasa5k exactly as it is today —
   `lib/extraction/cubicasa/booster.ts` / `server/adapters/cubicasa.ts`,
   opt-in, weights never bundled or committed, user runs
   `npm run convert:cubicasa` themselves, `lib/extraction/cubicasa/README.md`
   already carries the CC-BY-NC warning. This isolation is correct and
   should not change — it's what makes CubiCasa safe to ship as a *personal*
   feature at all.
2. **Do not** swap in RoomFormer's, HEAT's, DeepFloorplan's, or
   VecFloorSeg's official pretrained checkpoints for commercial use — all
   four are disqualified on the weights/training-data axis regardless of
   what their code license says.
3. **If/when commercial distribution requires dropping CubiCasa entirely:**
   the only clean path found is train-your-own — RoomFormer's MIT-licensed
   architecture (best fidelity) or a SAM-Apache-2.0-plus-thin-head approach
   (cheaper, faster to validate), trained on ResPlan (CC BY 4.0, 17K plans,
   confirmed license). Budget this as an actual ML project — data-format
   adaptation, a training run, and accuracy validation against CubiCasa on
   held-out real floor plans — not a one-line adapter swap. The interface
   contract (`runCubicasaBooster` in, `PrimitivePlan` out) is already
   designed for exactly this kind of swap, so the integration cost once a
   model exists is low; the cost is entirely in producing the model.
4. Before committing to MSD as a second training-data source, confirm its
   license directly on the [4TU.ResearchData DOI page](https://data.4tu.nl/datasets/e1d89cb5-6872-48fc-be63-aadd687ee6f9) —
   its GitHub mirror states no license at all, which legally defaults to "no
   permission granted," not "presumably fine because it's academic."
