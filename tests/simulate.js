// Prints how far each bot gets on a set of seeds: `node tests/simulate.js`.
import { Game } from '../src/game.js';
import { idleBot, randomBot, plannerBot, runBot } from './bots.js';

const seeds = process.argv.slice(2).map(Number).filter(Boolean);
const list = seeds.length ? seeds : [20261017, 20261018, 20261019, 1, 2, 3, 42, 777];

const bots = {
  idle: () => idleBot(),
  random: (s) => randomBot(s),
  planner: () => plannerBot(),
  sloppy: (s) => plannerBot({ aimError: 0.12, seed: s }),
};

for (const [name, make] of Object.entries(bots)) {
  const rows = list.map((seed) => ({ seed, ...runBot(new Game(seed), make(seed)) }));
  const avg = (k) => Math.round(rows.reduce((a, r) => a + r[k], 0) / rows.length);
  console.log(`\n${name}: avg distance ${avg('distance')} m, avg score ${avg('score')}`);
  for (const r of rows) {
    const l = r.landings;
    console.log(
      `  ${String(r.seed).padEnd(9)} ${String(r.distance).padStart(6)} m  score ${String(r.score).padStart(7)}  ` +
        `${r.reason.padEnd(7)} t=${r.time}s top=${r.topSpeed} rings=${r.rings} P/C/R=${l.perfect}/${l.clean}/${l.rough}`,
    );
  }
}
