import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Terrain } from '../src/terrain.js';
import { createBall, restingY, speedOf, stepBall } from '../src/physics.js';
import { DX, GRAVITY, ROLL, DRAG, CRASH_IMPACT, BALL_R } from '../src/constants.js';

function terrainFrom(fn, length = 20000) {
  const t = new Terrain();
  for (let x = 0; x <= length; x += DX) t.push(fn(x));
  return t;
}

function run(ball, terrain, seconds, onEvent = () => {}) {
  const h = 1 / 480;
  for (let i = 0; i < seconds * 480; i++) {
    const ev = stepBall(ball, terrain, h);
    if (ev) onEvent(ev);
    if (ev && ev.type === 'crash') return ev;
  }
  return null;
}

test('a ball on flat ground slows down and stays on it', () => {
  const t = terrainFrom(() => 500);
  const b = createBall(100, restingY(t, 100), 400, 0);
  run(b, t, 1);
  assert.ok(b.grounded);
  assert.ok(speedOf(b) < 400);
  assert.ok(Math.abs(b.y - restingY(t, b.x)) < 0.5);
});

test('a straight slope accelerates the ball to the drag-limited speed', () => {
  const s = 0.15;
  const t = terrainFrom((x) => 500 + s * x, 400000);
  const b = createBall(100, restingY(t, 100), 0, 0);
  run(b, t, 40);
  const sin = s / Math.hypot(1, s);
  const terminal = Math.sqrt((GRAVITY * sin - ROLL) / DRAG);
  assert.ok(Math.abs(speedOf(b) - terminal) / terminal < 0.05, `${speedOf(b)} vs ${terminal}`);
});

test('a fast ball leaves a sharp crest and flies', () => {
  const t = terrainFrom((x) => (x < 1000 ? 500 : 500 + (x - 1000) * 0.8));
  const b = createBall(800, restingY(t, 800), 700, 0);
  const events = [];
  run(b, t, 0.4, (e) => events.push(e.type));
  assert.ok(events.includes('launch'));
});

test('landing along the slope keeps the speed, landing flat against it loses it', () => {
  const fall = (terrain) => {
    const b = createBall(100, 200, 500, 0);
    b.grounded = false;
    let land = null;
    run(b, terrain, 2, (e) => {
      if (e.type === 'land' && !land) land = e;
    });
    return land;
  };
  // Ground shaped like the ball's own flight path (recorded with drag),
  // beginning after a gap so the first contact comes after a real flight.
  const path = new Map();
  const probe = createBall(100, 200, 500, 0);
  probe.grounded = false;
  const empty = new Terrain();
  for (let i = 0; i < 960; i++) {
    stepBall(probe, empty, 1 / 480);
    path.set(Math.round(probe.x / DX) * DX, { y: probe.y, s: probe.vy / probe.vx });
  }
  const matched = fall(
    terrainFrom((x) => {
      const p = path.get(x);
      return x < 600 || !p ? NaN : p.y + BALL_R * Math.hypot(1, p.s);
    }, 1200),
  );
  const flat = fall(terrainFrom(() => 340)); // a drop just short of a crash
  assert.ok(matched, 'lands on the matched slope');
  assert.ok(flat, 'lands on flat ground');
  assert.ok(matched.loss < 0.03, `matched loss ${matched.loss}`);
  assert.ok(flat.loss > 0.25, `flat loss ${flat.loss}`);
});

test('a hard flat landing shatters the ball', () => {
  const t = terrainFrom(() => 3000);
  const b = createBall(100, 0, 100, 0);
  b.grounded = false;
  const ev = run(b, t, 3);
  assert.equal(ev?.type, 'crash');
  assert.ok(ev.impact > CRASH_IMPACT);
});

test('running into a step is a wall crash', () => {
  const t = terrainFrom((x) => (x < 600 ? 500 : 420));
  const b = createBall(400, restingY(t, 400), 600, 0);
  const ev = run(b, t, 1);
  assert.deepEqual(ev, { type: 'crash', reason: 'wall' });
});

test('a gap (NaN samples) has no ground', () => {
  const t = terrainFrom((x) => (x > 500 && x < 700 ? NaN : 500));
  assert.ok(Number.isNaN(t.heightAt(600)));
  const b = createBall(450, restingY(t, 450), 120, 0);
  run(b, t, 2);
  assert.ok(b.y > 700, 'falls into the gap');
});
