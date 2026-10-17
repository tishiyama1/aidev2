// The course is the fixed part of the world: the drawable band's macro slope,
// the gaps the pen cannot draw over, and the rings in the air.
// Each feature type draws from its own RNG stream so the layout depends only
// on the seed, never on how far ahead callers happen to ask.
import { mulberry32 } from './rng.js';
import { BAND_HALF } from './constants.js';

const BAND_DX = 8;
const SAFE_START = 4000; // no gaps before this x
const FIRST_SEGMENT = 3400;
const START_SLOPE = 0.12;

export class Course {
  constructor(seed) {
    this.seed = seed;
    this.bandRng = mulberry32(seed);
    this.gapRng = mulberry32(seed ^ 0x9e3779b9);
    this.ringRng = mulberry32(Math.imul(seed, 2654435761) ^ 0x85ebca6b);

    this.band = [0];
    this.slope = START_SLOPE;
    this.segSlope = START_SLOPE;
    this.segEnd = FIRST_SEGMENT;

    this.gaps = [];
    this.nextGapX = SAFE_START;
    this.rings = [];
    this.nextClusterX = 1800;
  }

  // Generate features up to x (gaps, rings) and the band a little beyond.
  ensure(x) {
    this._bandTo(x + 1200);
    while (this.nextGapX < x) this._addGap();
    while (this.nextClusterX < x) this._addCluster();
  }

  center(x) {
    if (x <= 0) return this.band[0] + START_SLOPE * x;
    this._bandTo(x + BAND_DX);
    const f = x / BAND_DX;
    const i = Math.floor(f);
    const a = this.band[i];
    return a + (this.band[i + 1] - a) * (f - i);
  }

  top(x) {
    return this.center(x) - BAND_HALF;
  }

  bottom(x) {
    return this.center(x) + BAND_HALF;
  }

  inGap(x) {
    const g = this.gapAt(x);
    return g !== null && x >= g.x0 && x <= g.x1;
  }

  // First gap whose far edge is beyond x, or null.
  gapAt(x) {
    const gaps = this.gaps;
    let lo = 0;
    let hi = gaps.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (gaps[mid].x1 < x) lo = mid + 1;
      else hi = mid;
    }
    return lo < gaps.length ? gaps[lo] : null;
  }

  gapsBetween(a, b) {
    const out = [];
    for (const g of this.gaps) {
      if (g.x1 < a) continue;
      if (g.x0 > b) break;
      out.push(g);
    }
    return out;
  }

  ringsBetween(a, b) {
    const out = [];
    for (const r of this.rings) {
      if (r.x < a) continue;
      if (r.x > b) break;
      out.push(r);
    }
    return out;
  }

  _bandTo(x) {
    while ((this.band.length - 1) * BAND_DX < x) {
      const i = this.band.length;
      if (i * BAND_DX >= this.segEnd) this._nextSegment();
      // Blend toward the segment slope so the band never kinks.
      this.slope += (this.segSlope - this.slope) * 0.07;
      this.band.push(this.band[i - 1] + this.slope * BAND_DX);
    }
  }

  _nextSegment() {
    const r = this.bandRng;
    const start = this.segEnd;
    const roll = r();
    let slope;
    let len;
    if (roll < 0.2) {
      slope = 0.42 + 0.18 * r(); // drop
      len = 200 + 220 * r();
    } else if (roll < 0.34 && start > 6000) {
      slope = -0.02 - 0.04 * r(); // rise
      len = 300 + 400 * r();
    } else {
      slope = 0.09 + 0.1 * r();
      len = 1100 + 1300 * r();
    }
    this.segSlope = slope;
    this.segEnd = start + len;
  }

  _addGap() {
    const r = this.gapRng;
    const x0 = this.nextGapX;
    const difficulty = Math.min(1, (x0 - SAFE_START) / 40000);
    const w = 120 + r() * (50 + 170 * difficulty);
    const x1 = x0 + w;
    this.gaps.push({ x0, x1 });

    // Some gaps carry an arc of rings that rewards a well-aimed jump.
    if (r() < 0.65) {
      const n = 1 + Math.floor(r() * 3);
      const lift = 60 + r() * 80;
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 1);
        const x = x0 + w * t;
        this._insertRing(x, this.center(x) - 40 - lift * Math.sin(Math.PI * t));
      }
    }

    const spacing = (1800 - 1000 * difficulty) * (0.65 + 0.7 * r());
    this.nextGapX = x1 + Math.max(450, spacing);
  }

  // Ring clusters floating above the band: reachable only by launching.
  _addCluster() {
    const r = this.ringRng;
    const x0 = this.nextClusterX;
    const n = 3 + Math.floor(r() * 3);
    const base = BAND_HALF + 10 + r() * 70;
    for (let k = 0; k < n; k++) {
      const x = x0 + k * 60;
      this._insertRing(x, this.center(x) - base - 30 * Math.sin((Math.PI * k) / (n - 1)));
    }
    this.nextClusterX = x0 + 2200 + r() * 2600;
  }

  _insertRing(x, y) {
    const ring = { x, y };
    let i = this.rings.length;
    while (i > 0 && this.rings[i - 1].x > x) i--;
    this.rings.splice(i, 0, ring);
  }
}
