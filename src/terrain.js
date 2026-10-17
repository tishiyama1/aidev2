// The ground the player has drawn: heights sampled every DX units from x = 0.
// NaN marks a sample inside a gap (no ground).
import { DX } from './constants.js';

export class Terrain {
  constructor() {
    this.ys = new Float64Array(4096);
    this.n = 0;
  }

  push(y) {
    if (this.n === this.ys.length) {
      const grown = new Float64Array(this.ys.length * 2);
      grown.set(this.ys);
      this.ys = grown;
    }
    this.ys[this.n++] = y;
  }

  get endX() {
    return (this.n - 1) * DX;
  }

  last() {
    return this.n > 0 ? this.ys[this.n - 1] : NaN;
  }

  // Linear interpolation; NaN where either neighbour is a gap or undrawn.
  heightAt(x) {
    const f = x / DX;
    const i = Math.floor(f);
    if (i < 0 || i + 1 >= this.n) return NaN;
    const a = this.ys[i];
    return a + (this.ys[i + 1] - a) * (f - i);
  }

  slopeAt(x) {
    const h0 = this.heightAt(x);
    const hl = this.heightAt(x - DX);
    const hr = this.heightAt(x + DX);
    if (Number.isFinite(hl) && Number.isFinite(hr)) return (hr - hl) / (2 * DX);
    if (Number.isFinite(hr) && Number.isFinite(h0)) return (hr - h0) / DX;
    if (Number.isFinite(hl) && Number.isFinite(h0)) return (h0 - hl) / DX;
    return 0;
  }
}
