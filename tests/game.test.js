import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { Course } from '../src/course.js';
import { mulberry32, dailySeed } from '../src/rng.js';
import { DX, MAX_SLOPE, VIEW_H, LEAD, FIXED_DT, RING_R } from '../src/constants.js';

const steps = (game, seconds, input) => {
  for (let i = 0; i < seconds / FIXED_DT; i++) game.step(FIXED_DT, typeof input === 'function' ? input(game) : input);
};

test('rng is deterministic and in [0, 1)', () => {
  const a = mulberry32(7);
  const b = mulberry32(7);
  for (let i = 0; i < 1000; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
  assert.equal(dailySeed(new Date(2026, 9, 17)), 20261017);
});

test('a course depends only on its seed, not on how far ahead it was generated', () => {
  const a = new Course(123);
  a.ensure(60000);
  const b = new Course(123);
  for (let x = 0; x <= 60000; x += 777) b.ensure(x);
  b.ensure(60000);
  assert.deepEqual(
    b.gaps.slice(0, a.gaps.length).map((g) => [g.x0, g.x1]),
    a.gaps.map((g) => [g.x0, g.x1]),
  );
  const ringsA = a.ringsBetween(0, 50000).map((r) => [r.x, r.y]);
  const ringsB = b.ringsBetween(0, 50000).map((r) => [r.x, r.y]);
  assert.deepEqual(ringsB, ringsA);
  assert.equal(a.center(41234), b.center(41234));
});

test('the first stretch has no gaps and gaps stay within width bounds', () => {
  const c = new Course(99);
  c.ensure(100000);
  assert.ok(c.gaps[0].x0 >= 4000);
  for (const g of c.gaps) {
    const w = g.x1 - g.x0;
    assert.ok(w >= 120 && w <= 340, `gap width ${w}`);
  }
  for (let i = 1; i < c.gaps.length; i++) assert.ok(c.gaps[i].x0 > c.gaps[i - 1].x1 + 400);
});

test('the ball waits until the player acts', () => {
  const g = new Game(1);
  const x = g.ball.x;
  steps(g, 1, { targetY: 300, start: false });
  assert.equal(g.phase, 'ready');
  assert.equal(g.ball.x, x);
  steps(g, 0.5, { targetY: 300, start: true });
  assert.equal(g.phase, 'run');
  assert.ok(g.ball.x > x);
});

test('the pen draws ahead of the ball within the band and the slope limit', () => {
  const g = new Game(5);
  let flip = false;
  steps(g, 3, () => {
    flip = !flip;
    return { targetY: flip ? 0 : VIEW_H, start: true };
  });
  assert.ok(g.pen.x >= g.ball.x + LEAD - 1);
  const t = g.terrain;
  for (let i = 1; i < t.n; i++) {
    const a = t.ys[i - 1];
    const b = t.ys[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    assert.ok(Math.abs(b - a) <= MAX_SLOPE * DX + 1e-9);
    const x = i * DX;
    assert.ok(b >= g.course.top(x) - 1e-9 && b <= g.course.bottom(x) + 1e-9);
  }
});

test('the pen cannot draw over gaps', () => {
  const g = new Game(3);
  const gap = (g.course.ensure(6000), g.course.gaps[0]);
  steps(g, 30, (game) => ({ targetY: VIEW_H / 2, start: true, ...(game.pen.x > gap.x1 + 40 ? {} : {}) }));
  for (let x = Math.ceil(gap.x0 / DX) * DX; x <= gap.x1 && x / DX < g.terrain.n; x += DX) {
    assert.ok(Number.isNaN(g.terrain.ys[x / DX]), `sample at ${x} should be empty`);
  }
});

test('landings feed the flow multiplier, a rough one resets it', () => {
  const g = new Game(1);
  g._onLand({ type: 'land', loss: 0.01, airTime: 1, impact: 10 });
  g._onLand({ type: 'land', loss: 0.05, airTime: 1, impact: 10 });
  assert.equal(g.flow, 1.7);
  assert.deepEqual(g.landings, { perfect: 1, clean: 1, rough: 0 });
  g._onLand({ type: 'land', loss: 0.01, airTime: 0.05, impact: 10 });
  assert.equal(g.flow, 1.7, 'short hops do not count');
  g._onLand({ type: 'land', loss: 0.3, airTime: 1, impact: 10 });
  assert.equal(g.flow, 1);
});

test('flying through a ring speeds the ball up and scores', () => {
  const g = new Game(1);
  g.course.ensure(5000);
  const ring = g.course.rings[0];
  g.ball.x = ring.x - RING_R * 2;
  g.ball.y = ring.y;
  g.ball.vx = 600;
  g.ball.vy = 0;
  const before = g.score;
  g._collectRings(ring.x - 20, ring.y, ring.x + 20, ring.y);
  assert.ok(ring.taken);
  assert.ok(g.speed > 600);
  assert.ok(g.score > before);
  assert.equal(g.rings, 1);
  g._collectRings(ring.x - 20, ring.y, ring.x + 20, ring.y);
  assert.equal(g.rings, 1, 'a ring counts once');
});

test('climbing out of the band stalls the run', () => {
  const g = new Game(2);
  steps(g, 20, { targetY: 0, start: true });
  assert.equal(g.phase, 'over');
  assert.ok(['stall', 'crash', 'fall'].includes(g.endReason));
});

test('the run is recorded for the ghost', () => {
  const g = new Game(4);
  steps(g, 2, { targetY: VIEW_H / 2, start: true });
  assert.ok(g.record.length > 100);
  assert.equal(g.record.length % 2, 0);
});

test('before release the line bends toward the pointer, and release leaves no step', () => {
  const g = new Game(1);
  steps(g, 0.5, { targetY: 150, start: false });
  const high = g.terrain.last();
  steps(g, 0.5, { targetY: 600, start: false });
  const low = g.terrain.last();
  assert.ok(low > high + 150, `pen end follows the pointer (${high} -> ${low})`);
  assert.equal(g.phase, 'ready');
  const n0 = g.terrain.n;
  steps(g, 0.5, { targetY: 600, start: true });
  assert.equal(g.phase, 'run');
  const t = g.terrain;
  const jump = Math.abs(t.ys[n0] - t.ys[n0 - 1]);
  assert.ok(jump < 2, `first drawn sample continues the line (step ${jump})`);
});
