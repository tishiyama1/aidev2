// Browser smoke test: serves the repo, plays a few seconds with the mouse,
// checks the game reacts and reports no errors, and saves screenshots.
// Usage: node tests/e2e/smoke.mjs   (screenshots go to tests/e2e/out/)
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { startServer, loadPlaywright, root } from './serve.mjs';

const out = join(root, 'tests/e2e/out');

const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) failures.push(msg);
};

const server = await startServer();
const url = `${server.url}/index.html?seed=20261017`;
await mkdir(out, { recursive: true });

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text()) && errors.push(m.text()));

const state = () =>
  page.evaluate(() => {
    const g = window.__sakigaki.game;
    return { phase: g.phase, distance: g.distance, speed: g.speed, terrain: g.terrain.n, reason: g.endReason };
  });

await page.goto(url);
await page.waitForFunction(() => window.__sakigaki?.game);
await page.waitForTimeout(500);
await page.screenshot({ path: join(out, '1-title.png') });
check((await state()).phase === 'ready', 'waits on the title until the player acts');

// A small movement bends the line but does not release the ball yet.
await page.mouse.move(640, 360);
const before = await page.evaluate(() => window.__sakigaki.game.terrain.last());
for (let y = 360; y >= 260; y -= 10) await page.mouse.move(640, y);
await page.waitForTimeout(300);
const bent = await page.evaluate(() => window.__sakigaki.game.terrain.last());
check((await state()).phase === 'ready' && bent < before - 40, 'a small movement bends the line before release');
await page.screenshot({ path: join(out, '1b-bend.png') });

// More movement releases the ball; sweep gently to draw hills.
const samples = [];
for (let i = 0; i < 90; i++) {
  await page.mouse.move(640, 360 + Math.sin(i / 8) * 90);
  await page.waitForTimeout(33);
  if (i === 45) await page.screenshot({ path: join(out, '2-run.png') });
  samples.push(await state());
}
const s1 = samples.find((s) => s.phase !== 'ready');
check(!!s1, 'mouse movement starts the run');
check(samples.some((s) => s.distance > 20), `ball travels (max ${Math.max(...samples.map((s) => s.distance)).toFixed(0)} m)`);
check(samples.at(-1).terrain > samples[0].terrain, 'pen keeps drawing terrain');

// Hold the pen at the bottom until the run ends, then restart with a click.
await page.mouse.move(640, 719);
await page.waitForFunction(() => window.__sakigaki.game.phase === 'over', null, { timeout: 30000 }).catch(() => {});
const ended = await state();
check(ended.phase === 'over', `run ends (${ended.reason})`);
await page.waitForTimeout(900);
await page.screenshot({ path: join(out, '3-result.png') });
await page.mouse.click(640, 360);
await page.waitForTimeout(200);
check((await state()).phase === 'ready', 'click on the result restarts');
const best = await page.evaluate(() => localStorage.getItem('sakigaki:v1:best:20261017'));
check(!!best, 'best score is saved');

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);

await browser.close();
server.close();
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log(`\nscreenshots: ${out}`);
