// The design bet is that drawing well matters. These checks fail if a change
// to physics or the course makes skill irrelevant or jumps impossible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { idleBot, randomBot, plannerBot, runBot } from './bots.js';

const SEEDS = [20261017, 20261018, 1, 2, 3, 42];
const avg = (make) =>
  SEEDS.reduce((a, s) => a + runBot(new Game(s), make(s)).distance, 0) / SEEDS.length;

test('doing nothing ends at the first gap', () => {
  for (const s of SEEDS) {
    const g = new Game(s);
    const r = runBot(g, idleBot());
    const firstGap = g.course.gaps[0];
    assert.ok(g.maxX < firstGap.x1 + 50, `seed ${s}: idle got past the first gap (${r.distance} m)`);
  }
});

test('a planning player goes much further than idle or random input', () => {
  const idle = avg(() => idleBot());
  const random = avg((s) => randomBot(s));
  const planner = avg(() => plannerBot());
  const sloppy = avg((s) => plannerBot({ aimError: 0.12, seed: s }));
  assert.ok(planner > idle * 4, `planner ${planner} vs idle ${idle}`);
  assert.ok(sloppy > idle * 3, `sloppy ${sloppy} vs idle ${idle}`);
  assert.ok(planner > random * 4, `planner ${planner} vs random ${random}`);
  assert.ok(planner > 1000, `planner should clear many gaps (${planner} m)`);
});
