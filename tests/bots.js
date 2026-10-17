// Scripted players used to check that the game rewards skill.
// Each bot is a function (game, dt) => input.
import { VIEW_H, BALL_R, DX, PEN_TAU, MAX_SLOPE, GRAVITY } from '../src/constants.js';
import { mulberry32 } from '../src/rng.js';
import { Terrain } from '../src/terrain.js';
import { stepBall } from '../src/physics.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const SIM_H = 1 / 480;

// Never moves the mouse: the pen draws parallel to the band.
export function idleBot() {
  return () => ({ targetY: VIEW_H * 0.5, start: true });
}

// A jittery hand with no intent.
export function randomBot(seed) {
  const r = mulberry32(seed);
  let y = VIEW_H * 0.5;
  let v = 0;
  return (game, dt) => {
    v += (r() - 0.5) * 9000 * dt;
    v *= 0.97;
    y = clamp(y + v * dt, 0, VIEW_H);
    if (y === 0 || y === VIEW_H) v = -v * 0.5;
    return { targetY: y, start: true };
  };
}

// Plans each jump by trying kicker angles and landing shapes against the real
// physics and keeping the one that leaves the most energy. Between gaps it
// keeps drawing gently downhill. `aimError` skews the predicted launch speed
// used to shape the landing, standing in for an imperfect human read.
export function plannerBot({ kickLen = 180, cruise = -40, aimError = 0, seed = 1 } = {}) {
  const r = mulberry32(seed);
  let plan = null;
  let y = null;
  let lastPenX = null;
  return (game) => {
    const { pen, course } = game;
    if (y === null) y = pen.y;
    const dx = lastPenX === null ? 0 : pen.x - lastPenX;
    lastPenX = pen.x;

    if (plan && pen.x > plan.end) plan = null;
    if (!plan) {
      const gap = course.gapAt(pen.x);
      if (gap && pen.x >= gap.x0 - kickLen && pen.x < gap.x0) {
        const err = aimError ? 1 + (r() * 2 - 1) * aimError : 1;
        plan = searchPlan(game, gap, err);
      }
    }

    if (plan) {
      // Lead the pen by its smoothing lag, as a practised hand would.
      y = plan.at(pen.x + game.ball.vx * PEN_TAU);
    } else {
      const bandSlope = (course.center(pen.x + 8) - course.center(pen.x)) / 8;
      const want = course.center(pen.x) + cruise;
      const slope = Math.max(0.03, bandSlope + clamp((want - y) / 200, -0.15, 0.15));
      y += slope * dx;
    }
    return { targetY: y - game.cam.y, start: true };
  };
}

function searchPlan(game, gap, speedError) {
  let best = null;
  for (const kick of [-0.15, -0.3, -0.45, -0.6, -0.8, -1.0]) {
    const flight = flightFor(game, gap, kick, 1);
    if (!flight) continue;
    for (const cutoff of [0.15, 0.3, 0.5, 0.8]) {
      const plan = landingPlan(game, gap, kick, flight, cutoff);
      const score = evaluate(game, plan);
      if (!best || score > best.score) best = { kick, cutoff, score, plan };
    }
  }
  if (!best) return landingPlan(game, gap, -0.45, null, 0.3);
  if (speedError === 1) return best.plan;
  return landingPlan(game, gap, best.kick, flightFor(game, gap, best.kick, speedError), best.cutoff);
}

function kickerFn(game, gap, kick) {
  const { pen, terrain, course } = game;
  const xs = pen.x;
  const y0 = terrain.last();
  const s0 = terrain.slopeAt(terrain.endX - DX);
  const len = Math.max(DX, gap.x0 - xs);
  return (x) => {
    const d = clamp(x - xs, 0, len);
    return Math.max(course.top(x) + 4, y0 + s0 * d + ((kick - s0) * d * d) / (2 * len));
  };
}

// Copy the drawn terrain and extend it with fn the way the pen would draw it.
function extendTerrain(game, fn, endX) {
  const { terrain, course } = game;
  const t = new Terrain();
  t.ys = terrain.ys.slice(0, terrain.n);
  t.n = terrain.n;
  for (let x = t.n * DX; x <= endX; x += DX) {
    if (course.inGap(x)) {
      t.push(NaN);
      continue;
    }
    let y = fn(x);
    const last = t.last();
    if (Number.isFinite(last)) y = clamp(y, last - MAX_SLOPE * DX, last + MAX_SLOPE * DX);
    t.push(clamp(y, course.top(x), course.bottom(x)));
  }
  return t;
}

// Fly a copy of the ball off the kicker; returns the sampled flight or null.
function flightFor(game, gap, kick, speedError) {
  const { course } = game;
  const terrain = extendTerrain(game, kickerFn(game, gap, kick), gap.x0 - DX);
  const b = { ...game.ball };
  for (let i = 0; i < 480 * 6 && b.x < gap.x0; i++) {
    const ev = stepBall(b, terrain, SIM_H);
    if (ev && ev.type === 'crash') return null;
    if (b.vx < 0) return null;
  }
  if (b.x < gap.x0) return null;
  b.vx *= speedError;
  b.vy *= speedError;
  const empty = new Terrain();
  const path = [];
  for (let i = 0; i < 480 * 3; i++) {
    stepBall(b, empty, SIM_H);
    path.push(b.x, b.y, b.vy / b.vx);
    if (b.y > course.bottom(b.x) + 200) break;
  }
  return (x) => {
    for (let i = 0; i + 3 < path.length; i += 3) {
      if (path[i + 3] >= x) {
        const t = (x - path[i]) / (path[i + 3] - path[i] || 1);
        const s = path[i + 2];
        return { y: path[i + 1] + (path[i + 4] - path[i + 1]) * t + BALL_R * Math.hypot(1, s), s };
      }
    }
    return null;
  };
}

function landingPlan(game, gap, kick, flight, cutoff) {
  const { course } = game;
  const kicker = kickerFn(game, gap, kick);
  const fallback = { y: course.center(gap.x1), s: 0.1 };
  let xr = gap.x1;
  if (flight) {
    for (;;) {
      const f = flight(xr);
      if (!f || f.s > cutoff || f.y > course.bottom(xr) - 20) break;
      xr += DX;
    }
  }
  const fr = (flight && flight(xr)) || fallback;
  const sb = Math.max(0.03, (course.center(xr + 8) - course.center(xr)) / 8);
  const easeLen = 400;
  // Land a little below the predicted path near the far edge for safety.
  const margin = (x) => 14 * Math.max(0, 1 - (x - gap.x1) / 140);
  return {
    end: xr + easeLen,
    at(x) {
      if (x < gap.x0) return kicker(x);
      if (x < xr) {
        const xx = Math.max(x, gap.x1);
        const f = flight && flight(xx);
        return (f ? f.y : fr.y) + margin(xx);
      }
      const d = x - xr;
      if (d < easeLen) return fr.y + fr.s * d + ((sb - fr.s) * d * d) / (2 * easeLen);
      return fr.y + ((fr.s + sb) / 2) * easeLen + sb * (d - easeLen);
    },
  };
}

// Energy left at the end of the plan, counting height within the band.
function evaluate(game, plan) {
  const { course } = game;
  const terrain = extendTerrain(game, (x) => plan.at(x), plan.end);
  const b = { ...game.ball };
  for (let i = 0; i < 480 * 8 && b.x < plan.end - 40; i++) {
    const ev = stepBall(b, terrain, SIM_H);
    if (ev && ev.type === 'crash') return -Infinity;
    if (b.y > course.bottom(b.x) + 100 || b.vx < 20) return -Infinity;
  }
  const v2 = b.vx * b.vx + b.vy * b.vy;
  return v2 - 2 * GRAVITY * (b.y - course.center(b.x));
}

export function runBot(game, bot, { maxTime = 300, dt = 1 / 120 } = {}) {
  let t = 0;
  while (game.phase !== 'over' && t < maxTime) {
    game.step(dt, bot(game, dt));
    game.drainEvents();
    t += dt;
  }
  return {
    distance: Math.round(game.distance),
    score: Math.floor(game.score),
    reason: game.endReason ?? 'timeout',
    time: Math.round(game.time),
    rings: game.rings,
    landings: { ...game.landings },
    topSpeed: Math.round(game.topSpeed),
  };
}
