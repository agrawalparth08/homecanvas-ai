const { chromium } = require('/Users/parthagrawal/.claude/skills/gstack/node_modules/playwright-core');
const path = require('path');
const OUT = '/private/tmp/claude-501/-Users-parthagrawal-claude-code-workarea/a59e37e4-6f42-4186-9ae1-5c01f2d15029/scratchpad/cards';
const BASE = 'file:///private/tmp/claude-501/-Users-parthagrawal-claude-code-workarea/a59e37e4-6f42-4186-9ae1-5c01f2d15029/scratchpad/cards.html';
require('fs').mkdirSync(OUT, { recursive: true });

const CAPS = [
  { slot: 'home',      k: 'Multi-project workspace', t: 'A project for every client', s: 'Trace a new plan, or open one you have already built.' },
  { slot: 'tour',      k: 'Plan → 3D',              t: 'Walk the home before it is built', s: 'Orbit, walk, and tour your plan room by room.' },
  { slot: 'stylepack', k: 'Style packs',            t: 'Restyle a whole home in one click', s: 'Indian Modern, Japandi, Rajasthani — or your own saved packs.' },
  { slot: 'tower',     k: 'Multi-floor & towers',   t: 'Stack floors in seconds', s: 'Duplicate a level for towers and multi-unit layouts.' },
  { slot: 'boards',    k: 'Client boards + BOQ',    t: 'Branded PDFs, ready to price', s: 'Export room boards with a bill of quantities.' },
  { slot: 'batch',     t: 'Render every room overnight', k: 'Batch rendering', s: 'Queue ray-traced Cycles stills and come back to a finished set.' },
  { slot: 'viewer',    k: 'Client viewer export',   t: 'Send one interactive file', s: 'A self-contained 3D walkthrough that opens in any browser.' },
  { slot: 'hindi',     k: 'Hindi UI · local-first', t: 'Your language, your machine', s: 'Work in English or Hindi. Nothing ever leaves your device.' },
];

(async () => {
  const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

  for (const kind of ['title', 'outro']) {
    await page.goto(`${BASE}?kind=${kind}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, `${kind}.png`) });
    console.log(`card ${kind}: ok`);
  }
  const total = CAPS.length;
  for (let i = 0; i < CAPS.length; i++) {
    const c = CAPS[i];
    const q = new URLSearchParams({ kind: 'cap', k: c.k, t: c.t, s: c.s, n: String(i + 1).padStart(2, '0'), d: String(total).padStart(2, '0') });
    await page.goto(`${BASE}?${q}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `cap-${c.slot}.png`), omitBackground: true });
    console.log(`caption ${c.slot}: ok`);
  }
  await browser.close();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
