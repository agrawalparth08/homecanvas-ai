# Platform walkthrough teaser (real-footage cut)

`../../docs/homecanvas-walkthrough.mp4` — 67s, 1080p30, narrated with the AI
Tokenomics ElevenLabs voice **inv_voice_1** (`EKYQ0Yq4eLPupAut2PUr`) via
`eleven_multilingual_v2` tuned (stability 0.48 / similarity 0.75 / style 0.05).
That engine is what the tokenomics `VOICE-settings.md` recommends for SHORT
narration beats — `eleven_v3` garbles word onsets under ~250 chars, which is
why the first cut (macOS `say`) sounded rough. Regenerate the VO with
`./generate-narration.sh <outdir>` (reads the key from
`~/.config/ai-tokenomics/elevenlabs.key`, never stored here), then re-run
`build-teaser.sh`.

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
