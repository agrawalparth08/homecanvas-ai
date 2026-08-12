# Platform walkthrough teaser (real-footage cut)

`../../docs/homecanvas-walkthrough.mp4` — 71s, 1080p30, narrated (macOS `say`
voice "Rishi", the documented local fallback; set `ELEVENLABS_API_KEY` and use
the parent project's narration script for the premium voice).

Pipeline (all under this folder; paths in the scripts point at the session
scratchpad — repoint `S=`/`CLIPS=` before re-running):

1. `capture-suite.cjs` — records real app screens (Home, tour, style pack,
   tower, boards, batch, viewer, Hindi) with playwright-core + SwiftShader
   against a running `npm run dev` (5173) + sidecar (4871). No private data —
   sample-home only.
2. `render-cards.cjs` + `cards.html` — render the title/outro cards and the
   transparent lower-third captions (real brand theme, Inter) to PNG.
3. `build-teaser.sh` — trims/normalizes clips to 1080p segments, overlays the
   captions with fade-ins, concatenates, lays the narration track (loudnorm
   -16 LUFS), and muxes the final mp4.

Storyboard: title → multi-project workspace → plan-to-3D tour → style packs →
towers → client boards + BOQ → batch renders → client viewer export →
Hindi/local-first → outro. Ten beats, one per shipped capability.
