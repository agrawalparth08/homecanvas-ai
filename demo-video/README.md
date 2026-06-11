# HomeCanvas demo video

A storyboard-driven product demo (~88s, 1080p30) built with [Remotion](https://remotion.dev). All visuals are React/SVG motion graphics in the app's design language, plus two committed **sample-home** screenshots — no private data. Narration is generated locally with macOS's built-in `say` TTS (voice: Samantha), keeping the project's zero-paid-APIs rule.

The rendered video lives at [`../docs/homecanvas-demo.mp4`](../docs/homecanvas-demo.mp4).

## Storyboard (9 scenes)

| # | Scene | Visual |
|---|---|---|
| 1 | `title` | Wordmark + tagline |
| 2 | `problem` | The "flat PDF" plan sheet |
| 3 | `trace` | Walls tracing over the plan + live 3D rising (isometric) |
| 4 | `canvas3d` | Ken Burns over a real canvas screenshot + view-mode chips |
| 5 | `edit` | Materials, style packs, stair rotate, pillar-delete warning |
| 6 | `ai` | Assistant chat: type → proposal → Apply |
| 7 | `photo` | Photo Mode: noise → converged still, sample counter |
| 8 | `privacy` | Local-first: laptop, crossed-out cloud, three claims |
| 9 | `outro` | Logo + `npm run dev` |

Scene lengths are derived from the narration audio (`src/durations.json`), so re-recording narration re-times the video automatically.

## Rebuild it

```bash
cd demo-video
npm install
node scripts/generate-narration.mjs   # macOS only: say → afconvert → durations.json
npx remotion studio src/index.ts      # live preview
npm run render                        # out/homecanvas-demo.mp4
```

Narration text lives in `src/narration.json` (captions use the same strings; `scripts/generate-narration.mjs` has a TTS-pronunciation override map). On non-macOS, keep the committed `public/narration/*.wav` and skip the generation step.
