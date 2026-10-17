// Pointer height drives the pen; arrow keys / W S work as a fallback.
import { VIEW_H } from './constants.js';

const KEY_SPEED = 700; // view units per second

export class Input {
  constructor(renderer, target = window) {
    this.renderer = renderer;
    this.targetY = VIEW_H * 0.5;
    this.moved = 0;
    this.pressed = false;
    this.up = false;
    this.down = false;
    this.onKey = null;
    let lastY = null;

    const track = (e) => {
      const p = renderer.toView(e.clientX, e.clientY);
      if (lastY !== null) this.moved += Math.abs(p.y - lastY);
      lastY = p.y;
      this.targetY = p.y;
    };
    target.addEventListener('pointermove', track);
    target.addEventListener('pointerdown', (e) => {
      track(e);
      this.pressed = true;
    });
    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key;
      if (k === 'ArrowUp' || k === 'w' || k === 'W') this.up = true;
      else if (k === 'ArrowDown' || k === 's' || k === 'S') this.down = true;
      else if (k === ' ' || k === 'Enter') this.pressed = true;
      else if (this.onKey) this.onKey(k);
      if (k.startsWith('Arrow') || k === ' ') e.preventDefault();
    });
    target.addEventListener('keyup', (e) => {
      const k = e.key;
      if (k === 'ArrowUp' || k === 'w' || k === 'W') this.up = false;
      else if (k === 'ArrowDown' || k === 's' || k === 'S') this.down = false;
    });
    target.addEventListener('blur', () => {
      this.up = false;
      this.down = false;
    });
  }

  update(dt) {
    const dir = (this.down ? 1 : 0) - (this.up ? 1 : 0);
    if (!dir) return;
    const y = Math.min(VIEW_H, Math.max(0, this.targetY + dir * KEY_SPEED * dt));
    this.moved += Math.abs(y - this.targetY);
    this.targetY = y;
  }

  consumePress() {
    const p = this.pressed;
    this.pressed = false;
    return p;
  }
}
