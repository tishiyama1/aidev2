// Visual check: lets the planner bot play in a real browser and saves a
// screenshot every `--every` seconds. Usage: node tests/e2e/visual.mjs [seed]
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { startServer, loadPlaywright, root } from './serve.mjs';

const seed = Number(process.argv[2]) || 20261017;
const out = join(root, 'tests/e2e/out');
await mkdir(out, { recursive: true });
const server = await startServer();
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${server.url}/index.html?seed=${seed}`);
await page.waitForFunction(() => window.__sakigaki?.game);
await page.evaluate(async () => {
  const { plannerBot } = await import('/tests/bots.js');
  const s = window.__sakigaki;
  let bot = plannerBot();
  let last = null;
  const drive = () => {
    const g = s.game;
    if (g !== last) { bot = plannerBot(); last = g; }
    if (g.phase !== 'over') s.input.targetY = bot(g).targetY;
    if (g.phase === 'ready') s.input.moved = 1000;
    requestAnimationFrame(drive);
  };
  drive();
});
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(2500);
  const st = await page.evaluate(() => ({ p: window.__sakigaki.game.phase, d: window.__sakigaki.game.distance | 0 }));
  await page.screenshot({ path: join(out, `v-${String(i).padStart(2, '0')}.png`) });
  console.log(i, st.p, st.d, 'm');
  if (st.p === 'over') break;
}
console.log(errors.length ? errors : 'no errors');
await browser.close();
server.close();
