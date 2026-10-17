// Game rules with no DOM access, so the same code runs in the browser,
// in unit tests and under the test bots.
import {
  VIEW_H,
  BALL_SCREEN_X,
  LEAD,
  DX,
  PEN_TAU,
  MAX_SLOPE,
  PERFECT_LOSS,
  CLEAN_LOSS,
  FLOW_MAX,
  FLOW_MIN_AIR,
  STALL_SPEED,
  STALL_TIME,
  FALL_DEPTH,
  RING_R,
  RING_BOOST,
  START_X,
  START_SPEED,
  UNITS_PER_METER,
  SPEED_MULT_BASE,
} from './constants.js';
import { Course } from './course.js';
import { Terrain } from './terrain.js';
import { createBall, restingY, speedOf, stepBall } from './physics.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const RECORD_INTERVAL = 1 / 30;

export class Game {
  constructor(seed) {
    this.seed = seed;
    this.reset();
  }

  reset() {
    this.course = new Course(this.seed);
    this.terrain = new Terrain();
    this.phase = 'ready';
    this.time = 0;
    this.overTime = 0;
    this.score = 0;
    this.flow = 1;
    this.rings = 0;
    this.landings = { perfect: 0, clean: 0, rough: 0 };
    this.topSpeed = 0;
    this.endReason = null;
    this.stallTime = 0;
    this.events = [];
    this.record = [];
    this.recordTimer = 0;

    this._prefill();
    const x = START_X;
    const s = this.terrain.slopeAt(x);
    const inv = 1 / Math.hypot(1, s);
    this.ball = createBall(x, restingY(this.terrain, x), START_SPEED * inv, START_SPEED * s * inv);
    this.maxX = x;
    this.pen = { x: x + LEAD, y: this.terrain.last() };
    this._updateCamera();
    this.penScreenY = this.pen.y - this.cam.y;
  }

  get distance() {
    return (this.maxX - START_X) / UNITS_PER_METER;
  }

  get speed() {
    return speedOf(this.ball);
  }

  speedMult() {
    return Math.max(1, this.speed / SPEED_MULT_BASE);
  }

  drainEvents() {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  // input: { targetY: pen height in view coordinates, start: boolean }
  step(dt, input) {
    if (this.phase === 'over') {
      this.overTime += dt;
      return;
    }
    this.course.ensure(this.pen.x + 800);

    const target = clamp(input.targetY, 0, VIEW_H);
    this.penScreenY += (target - this.penScreenY) * (1 - Math.exp(-dt / PEN_TAU));

    if (this.phase === 'ready') {
      this._shapeStart();
      if (!input.start) return;
      this.phase = 'run';
      this.events.push({ type: 'start' });
    }

    this.time += dt;
    this._physics(dt);
    if (this.phase !== 'run') return;

    const penX = Math.max(this.pen.x, this.ball.x + LEAD);
    this._draw(penX, this._clampBand(penX, this.cam.y + this.penScreenY));
    this._updateCamera();
    this._score(dt);
    this._checkEnd(dt);
    this._record(dt);
  }

  _physics(dt) {
    const ball = this.ball;
    const n = clamp(Math.ceil((speedOf(ball) * dt) / 3), 1, 64);
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const px = ball.x;
      const py = ball.y;
      const ev = stepBall(ball, this.terrain, h);
      this._collectRings(px, py, ball.x, ball.y);
      if (!ev) continue;
      if (ev.type === 'crash') {
        this._end('crash', ev);
        return;
      }
      if (ev.type === 'land') this._onLand(ev);
      else this.events.push(ev);
    }
    this.topSpeed = Math.max(this.topSpeed, speedOf(ball));
  }

  _onLand(ev) {
    let quality = null;
    if (ev.airTime >= FLOW_MIN_AIR) {
      if (ev.loss < PERFECT_LOSS) {
        quality = 'perfect';
        this.flow = Math.min(FLOW_MAX, this.flow + 0.5);
      } else if (ev.loss < CLEAN_LOSS) {
        quality = 'clean';
        this.flow = Math.min(FLOW_MAX, this.flow + 0.2);
      } else {
        quality = 'rough';
        this.flow = 1;
      }
      this.landings[quality]++;
    }
    this.events.push({ ...ev, quality, flow: this.flow, x: this.ball.x, y: this.ball.y });
  }

  _collectRings(x0, y0, x1, y1) {
    const lo = Math.min(x0, x1) - RING_R;
    const hi = Math.max(x0, x1) + RING_R;
    for (const ring of this.course.ringsBetween(lo, hi)) {
      if (ring.taken) continue;
      if (segmentDistance(ring.x, ring.y, x0, y0, x1, y1) > RING_R) continue;
      ring.taken = true;
      this.rings++;
      const ball = this.ball;
      const sp = speedOf(ball);
      if (sp > 1e-6) {
        const k = (sp + RING_BOOST) / sp;
        ball.vx *= k;
        ball.vy *= k;
      }
      const points = Math.round(100 * this.flow);
      this.score += points;
      this.events.push({ type: 'ring', x: ring.x, y: ring.y, points, count: this.rings });
    }
  }

  _draw(newX, newY) {
    const prevX = this.pen.x;
    const prevY = this.pen.y;
    const span = newX - prevX;
    const iEnd = Math.floor(newX / DX);
    for (let i = this.terrain.n; i <= iEnd; i++) {
      const x = i * DX;
      if (this.course.inGap(x)) {
        this.terrain.push(NaN);
        continue;
      }
      const t = span > 0 ? clamp((x - prevX) / span, 0, 1) : 1;
      let y = prevY + (newY - prevY) * t;
      const last = this.terrain.last();
      if (Number.isFinite(last)) y = clamp(y, last - MAX_SLOPE * DX, last + MAX_SLOPE * DX);
      this.terrain.push(this._clampBand(x, y));
    }
    this.pen.x = newX;
    this.pen.y = newY;
  }

  _clampBand(x, y) {
    return clamp(y, this.course.top(x), this.course.bottom(x));
  }

  _updateCamera() {
    const b = this.ball;
    this.cam = {
      x: b.x - BALL_SCREEN_X,
      y: this.course.center(b.x + LEAD * 0.5) - VIEW_H * 0.5 - 30,
    };
  }

  _score() {
    const b = this.ball;
    if (b.x <= this.maxX) return;
    const dx = b.x - this.maxX;
    this.maxX = b.x;
    this.score += (dx / UNITS_PER_METER) * this.flow * this.speedMult();
  }

  _checkEnd(dt) {
    const b = this.ball;
    if (b.y > this.course.bottom(b.x) + FALL_DEPTH) {
      this._end('fall');
      return;
    }
    this.stallTime = b.vx < STALL_SPEED ? this.stallTime + dt : 0;
    if (this.stallTime > STALL_TIME) this._end('stall');
  }

  _record(dt) {
    this.recordTimer -= dt;
    if (this.recordTimer > 0) return;
    this.recordTimer += RECORD_INTERVAL;
    this.record.push(Math.round(this.ball.x), Math.round(this.ball.y));
  }

  _end(reason, ev) {
    this.phase = 'over';
    this.endReason = reason;
    this.overTime = 0;
    this.score = Math.floor(this.score);
    this.events.push({ type: 'end', reason, x: this.ball.x, y: this.ball.y, impact: ev?.impact ?? 0 });
  }

  _prefill() {
    // A short pre-drawn slope so the ball starts with somewhere to roll.
    const end = START_X + LEAD;
    for (let i = 0; i * DX <= end; i++) {
      const x = i * DX;
      const t = x / end;
      const ease = t * t * (3 - 2 * t);
      this.terrain.push(this.course.center(x) - 150 * (1 - ease));
    }
  }

  // Before the ball is released the stretch between ball and pen bends live
  // toward the pointer, so the first thing a player sees is the line obeying
  // their hand, and releasing never leaves a step in the ground.
  _shapeStart() {
    const t = this.terrain;
    const ia = Math.ceil((START_X + 60) / DX);
    const xa = ia * DX;
    const xb = (t.n - 1) * DX;
    const ya = t.ys[ia];
    const ma = (t.ys[ia] - t.ys[ia - 1]) / DX;
    const yb = this._clampBand(xb, this.cam.y + this.penScreenY);
    const mb = (this.course.center(xb + 8) - this.course.center(xb)) / 8;
    const span = xb - xa;
    for (let i = ia + 1; i < t.n; i++) {
      const u = (i * DX - xa) / span;
      const u2 = u * u;
      const u3 = u2 * u;
      const y =
        (2 * u3 - 3 * u2 + 1) * ya + (u3 - 2 * u2 + u) * span * ma + (-2 * u3 + 3 * u2) * yb + (u3 - u2) * span * mb;
      const prev = t.ys[i - 1];
      t.ys[i] = this._clampBand(i * DX, clamp(y, prev - MAX_SLOPE * DX, prev + MAX_SLOPE * DX));
    }
    this.pen.y = t.ys[t.n - 1];
  }
}

export const GHOST_INTERVAL = RECORD_INTERVAL;

function segmentDistance(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - x0) * dx + (py - y0) * dy) / len2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
}
