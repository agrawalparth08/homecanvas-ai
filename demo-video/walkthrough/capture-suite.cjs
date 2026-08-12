/* Full teaser capture suite — one browser, one context per clip, renamed to slot files. */
const { chromium } = require('/Users/parthagrawal/.claude/skills/gstack/node_modules/playwright-core');
const { renameSync, readdirSync, writeFileSync } = require('fs');
const path = require('path');
const OUT = '/private/tmp/claude-501/-Users-parthagrawal-claude-code-workarea/a59e37e4-6f42-4186-9ae1-5c01f2d15029/scratchpad/captures-raw';

const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const VP = { width: 1600, height: 1000 };

async function clip(browser, name, fn) {
  const dir = path.join(OUT, name);
  const context = await browser.newContext({ viewport: VP, recordVideo: { dir, size: VP } });
  const page = await context.newPage();
  try {
    await fn(page);
  } finally {
    await context.close();
  }
  const file = readdirSync(dir).find((f) => f.endsWith('.webm'));
  if (file) renameSync(path.join(dir, file), path.join(OUT, `${name}.webm`));
  console.log(`clip ${name}: ${file ? 'ok' : 'MISSING'}`);
}

const settle = (page, ms) => page.waitForTimeout(ms);

(async () => {
  const browser = await chromium.launch({ args: ARGS });

  // 1) Home: projects workspace + onboarding, gentle hovers
  await clip(browser, 'home', async (page) => {
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
    await settle(page, 1800);
    await page.mouse.move(690, 520, { steps: 30 });
    await settle(page, 900);
    await page.mouse.move(980, 520, { steps: 30 });
    await settle(page, 900);
    await page.mouse.move(1349, 29, { steps: 25 });
    await settle(page, 1200);
  });

  // 2) Orbit: slow drag around the dollhouse
  await clip(browser, 'orbit', async (page) => {
    await page.goto('http://localhost:5173/design/sample-home', { waitUntil: 'networkidle' });
    await settle(page, 5000);
    await page.mouse.move(700, 450);
    await page.mouse.down();
    await page.mouse.move(1000, 430, { steps: 90 });
    await page.mouse.move(1150, 480, { steps: 60 });
    await page.mouse.up();
    await settle(page, 800);
  });

  // 3) Tour: guided room-to-room camera
  await clip(browser, 'tour', async (page) => {
    await page.goto('http://localhost:5173/design/sample-home', { waitUntil: 'networkidle' });
    await settle(page, 4500);
    await page.getByRole('button', { name: 'Tour', exact: true }).click();
    await settle(page, 13000);
  });

  // 4) Style pack: whole-home restyle, two packs back to back
  await clip(browser, 'stylepack', async (page) => {
    await page.goto('http://localhost:5173/design/sample-home', { waitUntil: 'networkidle' });
    await settle(page, 4500);
    const cards = page.locator('.group\\/pack', { hasText: 'Rajasthani Heritage' });
    await cards.getByRole('button', { name: 'Whole home' }).click();
    await settle(page, 2600);
    const japandi = page.locator('.group\\/pack', { hasText: 'Fusion Japandi' });
    await japandi.getByRole('button', { name: 'Whole home' }).click();
    await settle(page, 2600);
    // leave the scene as we found it
    await page.getByRole('button', { name: 'Undo' }).click();
    await settle(page, 300);
    await page.getByRole('button', { name: 'Undo' }).click();
    await settle(page, 600);
  });

  // 5) Boards: scroll the branded room boards
  await clip(browser, 'boards', async (page) => {
    await page.goto('http://localhost:5173/variants', { waitUntil: 'networkidle' });
    await settle(page, 2500);
    for (let i = 0; i < 6; i += 1) {
      await page.mouse.wheel(0, 420);
      await settle(page, 700);
    }
  });

  // 6) Batch dialog: live progress + finished frames
  await clip(browser, 'batch', async (page) => {
    await page.goto('http://localhost:5173/design/sample-home', { waitUntil: 'networkidle' });
    await settle(page, 4000);
    await page.getByRole('button', { name: 'Render all' }).click();
    await settle(page, 7000);
  });

  // 7) Tower: duplicate the floor twice, hop to the new level
  await clip(browser, 'tower', async (page) => {
    page.on('dialog', (d) => void d.accept('2'));
    await page.goto('http://localhost:5173/design/sample-home', { waitUntil: 'networkidle' });
    await settle(page, 4500);
    await page.getByTitle(/Duplicate the current floor/).click();
    await settle(page, 2000);
    await page.getByRole('button', { name: 'Level 3', exact: true }).click();
    await settle(page, 3000);
    await page.getByRole('button', { name: 'Undo' }).click();
    await settle(page, 300);
    await page.getByRole('button', { name: 'Undo' }).click();
    await settle(page, 700);
  });

  // 8) Hindi: flip the language live
  await clip(browser, 'hindi', async (page) => {
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
    await settle(page, 1500);
    await page.getByRole('button', { name: 'Designer profile' }).click();
    await settle(page, 900);
    await page.getByRole('button', { name: 'हिन्दी' }).click();
    await settle(page, 1400);
    await page.keyboard.press('Escape');
    await settle(page, 2200);
    await page.getByRole('button', { name: 'Designer profile' }).click();
    await settle(page, 700);
    await page.getByRole('button', { name: 'English' }).click();
    await page.keyboard.press('Escape');
    await settle(page, 800);
  });

  // 9) Client viewer: the standalone HTML a client receives
  await clip(browser, 'viewer', async (page) => {
    const res = await page.request.get('http://localhost:4871/api/scenes/sample-home/viewer?brand=Studio%20Parth');
    writeFileSync('/tmp/hc-viewer.html', await res.text());
    await page.goto('file:///tmp/hc-viewer.html', { waitUntil: 'load' });
    await settle(page, 3500);
    await page.mouse.move(800, 500);
    await page.mouse.down();
    await page.mouse.move(1100, 470, { steps: 80 });
    await page.mouse.up();
    await settle(page, 1200);
  });

  await browser.close();
  console.log('ALL CLIPS DONE');
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
