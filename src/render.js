// Canvas drawing. The world is clipped to a fixed 1280x720 view so every
// screen shape sees the same distance ahead of the pen.
import { VIEW_W, VIEW_H, BALL_R, DX, RING_R, UNITS_PER_METER, CRUISE_SPEED } from './constants.js';
import { GHOST_INTERVAL } from './game.js';

const C = {
  bg: '#0B0F14',
  ground: 'rgba(16, 27, 36, 0.55)',
  void: '#05070A',
  band: '#1C2732',
  edge: '#2A3B48',
  line: '127, 227, 255',
  warm: '#FFB347',
  text: '#F2F6F8',
  dim: '#7D8B96',
};
const DISPLAY = '"Dela Gothic One", "Zen Kaku Gothic New", sans-serif';
const SANS = '"Zen Kaku Gothic New", sans-serif';
const TRAIL_LEN = 26;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Cool blue when slow, white at cruising speed, amber when fast.
function heat(speed, alpha = 1) {
  const cool = [111, 184, 255];
  const white = [255, 255, 255];
  const warm = [255, 179, 71];
  const t = clamp((speed / CRUISE_SPEED - 0.35) / 1.2, 0, 1);
  const [a, b, k] = t < 0.5 ? [cool, white, t * 2] : [white, warm, (t - 0.5) * 2];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * k));
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.popups = [];
    this.trail = [];
    this.shake = 0;
    this.time = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.scale = Math.min(this.canvas.width / VIEW_W, this.canvas.height / VIEW_H);
    this.ox = (this.canvas.width - VIEW_W * this.scale) / 2;
    this.oy = (this.canvas.height - VIEW_H * this.scale) / 2;
  }

  // Client (CSS pixel) coordinates to view coordinates.
  toView(clientX, clientY) {
    return {
      x: (clientX * this.dpr - this.ox) / this.scale,
      y: (clientY * this.dpr - this.oy) / this.scale,
    };
  }

  reset() {
    this.particles = [];
    this.popups = [];
    this.trail = [];
    this.shake = 0;
  }

  onEvent(e) {
    if (e.type === 'land') {
      const n = Math.round(clamp(e.impact / 25, 2, 24));
      this._burst(e.x, e.y, n, e.quality === 'perfect' ? C.warm : '#FFFFFF', e.impact * 0.6, -Math.PI / 2, 1.6);
      if (e.quality === 'perfect') this._popup(`PERFECT ×${e.flow.toFixed(1)}`, e.x, e.y - 34, C.warm, 18);
      else if (e.quality === 'clean') this._popup(`CLEAN ×${e.flow.toFixed(1)}`, e.x, e.y - 34, C.text, 15);
      else if (e.quality === 'rough') this._popup('ROUGH', e.x, e.y - 34, C.dim, 13);
      if (e.quality === 'rough') this.shake = Math.max(this.shake, 4);
    } else if (e.type === 'ring') {
      this._burst(e.x, e.y, 16, C.warm, 260, 0, Math.PI * 2);
      this._popup(`+${e.points}`, e.x, e.y - 30, C.warm, 16);
    } else if (e.type === 'end') {
      if (e.reason === 'crash') {
        this._burst(e.x, e.y, 46, '#FFFFFF', 520, 0, Math.PI * 2);
        this._burst(e.x, e.y, 18, `rgb(${C.line})`, 320, 0, Math.PI * 2);
        this.shake = 14;
      }
    }
  }

  _burst(x, y, n, color, speed, dir, spread) {
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const v = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0,
        max: 0.4 + Math.random() * 0.5,
        color,
        size: 1.5 + Math.random() * 2,
      });
    }
  }

  _popup(text, x, y, color, size) {
    this.popups.push({ text, x, y, color, size, life: 0, max: 1.1 });
  }

  draw(game, dt, ui) {
    this.time += dt;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.shake *= Math.exp(-dt * 9);
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    ctx.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, VIEW_W, VIEW_H);
    ctx.clip();
    ctx.translate(sx, sy);

    const cam = game.cam;
    this._background(game);
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    this._band(game);
    this._gaps(game);
    this._terrain(game);
    this._rings(game);
    if (ui.ghost) this._ghost(game, ui.ghost);
    this._ball(game);
    this._pen(game);
    this._effects(dt);
    ctx.restore();
    this._offscreen(game);
    ctx.restore();

    this._hud(game, ui);
    if (game.phase === 'ready' && ui.showTitle) this._title(ui);
    if (game.phase === 'over') this._result(game, ui);
  }

  _background(game) {
    const ctx = this.ctx;
    const spacing = 220;
    const off = -((game.cam.x * 0.4) % spacing);
    ctx.strokeStyle = '#0F161D';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = off; x < VIEW_W; x += spacing) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, VIEW_H);
    }
    ctx.stroke();

    // Speed streaks once the ball is really moving.
    const sp = game.speed;
    const fast = sp / CRUISE_SPEED;
    if (fast > 1.05 && game.phase === 'run') {
      const a = clamp((fast - 1.05) / 0.7, 0, 1) * 0.35;
      ctx.strokeStyle = `rgba(${C.line}, ${a})`;
      ctx.beginPath();
      for (let i = 0; i < 14; i++) {
        const y = (i * 151 + 37) % VIEW_H;
        const len = 60 + (i % 4) * 40;
        const x = VIEW_W - ((game.cam.x * (1.4 + (i % 3) * 0.3) + i * 211) % (VIEW_W + len));
        ctx.moveTo(x, y);
        ctx.lineTo(x + len, y);
      }
      ctx.stroke();
    }
  }

  _band(game) {
    const ctx = this.ctx;
    const { course, cam } = game;
    ctx.strokeStyle = C.band;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 8]);
    for (const edge of ['top', 'bottom']) {
      ctx.beginPath();
      for (let x = cam.x - 20; x <= cam.x + VIEW_W + 20; x += 40) {
        const y = course[edge](x);
        if (x === cam.x - 20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  _gaps(game) {
    const ctx = this.ctx;
    const { course, cam } = game;
    for (const g of course.gapsBetween(cam.x - 50, cam.x + VIEW_W + 50)) {
      const top = Math.min(course.top(g.x0), course.top(g.x1)) - 30;
      ctx.fillStyle = C.void;
      ctx.fillRect(g.x0, top, g.x1 - g.x0, cam.y + VIEW_H - top + 40);
      ctx.strokeStyle = C.edge;
      ctx.setLineDash([1, 6]);
      ctx.beginPath();
      ctx.moveTo(g.x0, top);
      ctx.lineTo(g.x0, cam.y + VIEW_H + 20);
      ctx.moveTo(g.x1, top);
      ctx.lineTo(g.x1, cam.y + VIEW_H + 20);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  _terrain(game) {
    const ctx = this.ctx;
    const { terrain, cam, pen } = game;
    const i0 = Math.max(0, Math.floor((cam.x - 20) / DX));
    const i1 = terrain.n - 1;
    const bottom = cam.y + VIEW_H + 40;

    // Collect solid runs once, then fill and stroke them.
    const runs = [];
    let run = null;
    for (let i = i0; i <= i1; i++) {
      const y = terrain.ys[i];
      if (Number.isFinite(y)) {
        if (!run) runs.push((run = []));
        run.push(i * DX, y);
      } else run = null;
    }

    ctx.fillStyle = C.ground;
    for (const r of runs) {
      ctx.beginPath();
      ctx.moveTo(r[0], bottom);
      for (let k = 0; k < r.length; k += 2) ctx.lineTo(r[k], r[k + 1]);
      ctx.lineTo(r[r.length - 2], bottom);
      ctx.closePath();
      ctx.fill();
    }

    const grad = ctx.createLinearGradient(cam.x, 0, pen.x, 0);
    grad.addColorStop(0, `rgba(${C.line}, 0.25)`);
    grad.addColorStop(0.55, `rgba(${C.line}, 1)`);
    grad.addColorStop(1, 'rgba(255, 255, 255, 1)');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [width, style] of [
      [12, `rgba(${C.line}, 0.07)`],
      [6, `rgba(${C.line}, 0.14)`],
      [3, grad],
    ]) {
      ctx.lineWidth = width;
      ctx.strokeStyle = style;
      for (const r of runs) {
        ctx.beginPath();
        ctx.moveTo(r[0], r[1]);
        for (let k = 2; k < r.length; k += 2) ctx.lineTo(r[k], r[k + 1]);
        ctx.stroke();
      }
    }
  }

  _rings(game) {
    const ctx = this.ctx;
    const { course, cam } = game;
    const pulse = 1 + Math.sin(this.time * 5) * 0.06;
    for (const r of course.ringsBetween(cam.x - 40, cam.x + VIEW_W + 40)) {
      if (r.taken) continue;
      for (const [w, a] of [
        [8, 0.15],
        [3, 1],
      ]) {
        ctx.lineWidth = w;
        ctx.strokeStyle = a === 1 ? C.warm : `rgba(255, 179, 71, ${a})`;
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, (RING_R * 0.3) * pulse, RING_R * 0.85 * pulse, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  _ghost(game, ghost) {
    if (game.phase === 'ready') return;
    const pts = ghost.pts;
    const f = game.time / GHOST_INTERVAL;
    const i = Math.floor(f);
    if (i * 2 + 3 >= pts.length) return;
    const t = f - i;
    const x = pts[i * 2] + (pts[i * 2 + 2] - pts[i * 2]) * t;
    const y = pts[i * 2 + 1] + (pts[i * 2 + 3] - pts[i * 2 + 1]) * t;
    const ctx = this.ctx;
    ctx.strokeStyle = `rgba(${C.line}, 0.45)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, BALL_R, 0, Math.PI * 2);
    ctx.stroke();
  }

  _ball(game) {
    const ctx = this.ctx;
    const b = game.ball;
    const sp = game.speed;
    if (game.phase === 'run') {
      this.trail.push(b.x, b.y);
      if (this.trail.length > TRAIL_LEN * 2) this.trail.splice(0, 2);
    }
    if (game.phase === 'over' && game.endReason === 'crash') return;

    const n = this.trail.length / 2;
    for (let k = 0; k < n - 1; k++) {
      const a = (k / n) * 0.35 * clamp(sp / CRUISE_SPEED, 0.2, 1);
      ctx.fillStyle = heat(sp, a);
      ctx.beginPath();
      ctx.arc(this.trail[k * 2], this.trail[k * 2 + 1], BALL_R * (0.45 + (0.5 * k) / n), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = heat(sp, 0.18);
    ctx.beginPath();
    ctx.arc(b.x, b.y, BALL_R * 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
  }

  _pen(game) {
    if (game.phase === 'over') return;
    const ctx = this.ctx;
    const { pen, course, terrain, cam } = game;
    const drawn = terrain.last();
    const tipY = Number.isFinite(drawn) ? drawn : pen.y;
    const aimY = clamp(cam.y + game.penScreenY, course.top(pen.x), course.bottom(pen.x));

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 6]);
    ctx.beginPath();
    ctx.moveTo(pen.x, course.top(pen.x));
    ctx.lineTo(pen.x, course.bottom(pen.x));
    ctx.stroke();
    ctx.setLineDash([]);

    if (Math.abs(aimY - tipY) > 3) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.beginPath();
      ctx.arc(pen.x, aimY, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const pulse = 1 + Math.sin(this.time * 6) * 0.12;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pen.x, tipY, 14 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.beginPath();
    ctx.arc(pen.x, tipY, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(pen.x, tipY, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  _effects(dt) {
    const ctx = this.ctx;
    this.particles = this.particles.filter((p) => (p.life += dt) < p.max);
    for (const p of this.particles) {
      p.vy += 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      ctx.globalAlpha = 1 - p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    this.popups = this.popups.filter((p) => (p.life += dt) < p.max);
    ctx.textAlign = 'center';
    for (const p of this.popups) {
      const k = p.life / p.max;
      ctx.globalAlpha = 1 - k * k;
      ctx.fillStyle = p.color;
      ctx.font = `${p.size}px ${DISPLAY}`;
      ctx.fillText(p.text, p.x, p.y - k * 40);
    }
    ctx.globalAlpha = 1;
  }

  _offscreen(game) {
    const sy = game.ball.y - game.cam.y;
    if (sy > -BALL_R) return;
    const sx = game.ball.x - game.cam.x;
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.moveTo(sx, 8);
    ctx.lineTo(sx - 7, 20);
    ctx.lineTo(sx + 7, 20);
    ctx.closePath();
    ctx.fill();
  }

  _hud(game, ui) {
    const ctx = this.ctx;
    if (game.phase === 'ready' && ui.showTitle) return;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.text;
    ctx.font = `30px ${DISPLAY}`;
    const dist = `${Math.floor(game.distance)} m`;
    ctx.fillText(dist, 40, 58);
    const w = ctx.measureText(dist).width;
    if (game.flow > 1) {
      ctx.fillStyle = C.warm;
      ctx.font = `20px ${DISPLAY}`;
      ctx.fillText(`×${game.flow.toFixed(1)}`, 40 + w + 16, 58);
    }
    ctx.fillStyle = C.dim;
    ctx.font = `15px ${SANS}`;
    ctx.fillText(`${Math.floor(game.score).toLocaleString()}`, 42, 84);

    if (ui.best) {
      ctx.textAlign = 'right';
      ctx.fillText(`BEST ${Math.floor(ui.best.distance)} m · ${ui.best.score.toLocaleString()}`, VIEW_W - 40, 52);
    }
  }

  _title(ui) {
    const ctx = this.ctx;
    const a = 0.85 + Math.sin(this.time * 2) * 0.1;
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(242, 246, 248, ${a})`;
    ctx.font = `112px ${DISPLAY}`;
    ctx.fillText('サキガキ', VIEW_W / 2, 150);
    ctx.fillStyle = `rgb(${C.line})`;
    ctx.font = `18px ${DISPLAY}`;
    spaced(ctx, 'LEADLINE', VIEW_W / 2, 190, 9);
    ctx.fillStyle = C.dim;
    ctx.font = `14px ${SANS}`;
    ctx.fillText(ui.courseLabel, VIEW_W / 2, 222);
    if (ui.best) ctx.fillText(`BEST ${Math.floor(ui.best.distance)} m · ${ui.best.score.toLocaleString()}`, VIEW_W / 2, 244);
  }

  _result(game, ui) {
    const ctx = this.ctx;
    const k = clamp(game.overTime / 0.5, 0, 1);
    ctx.fillStyle = `rgba(11, 15, 20, ${0.6 * k})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = k;
    ctx.textAlign = 'center';

    ctx.fillStyle = C.dim;
    ctx.font = `16px ${DISPLAY}`;
    spaced(ctx, { crash: 'CRASH', stall: 'STALL', fall: 'FALL' }[game.endReason] ?? '', VIEW_W / 2, 230, 6);

    ctx.fillStyle = C.text;
    ctx.font = `96px ${DISPLAY}`;
    ctx.fillText(`${Math.floor(game.distance)} m`, VIEW_W / 2, 340);
    ctx.font = `24px ${DISPLAY}`;
    ctx.fillText(game.score.toLocaleString(), VIEW_W / 2, 386);

    ctx.fillStyle = C.dim;
    ctx.font = `14px ${SANS}`;
    const l = game.landings;
    ctx.fillText(
      `PERFECT ${l.perfect} · CLEAN ${l.clean} · ROUGH ${l.rough} · RING ${game.rings} · TOP ${Math.round((game.topSpeed / UNITS_PER_METER) * 3.6)} km/h`,
      VIEW_W / 2,
      420,
    );

    if (ui.result?.newBest) {
      ctx.fillStyle = C.warm;
      ctx.font = `18px ${DISPLAY}`;
      spaced(ctx, 'NEW BEST', VIEW_W / 2, 470, 6);
    }

    if (game.overTime > 0.6) {
      const p = 0.55 + Math.sin(this.time * 4) * 0.3;
      ctx.globalAlpha = k * p;
      ctx.fillStyle = C.text;
      ctx.font = `40px ${SANS}`;
      ctx.fillText('↻', VIEW_W / 2, 560);
    }
    ctx.globalAlpha = 1;
  }
}

function spaced(ctx, text, cx, y, gap) {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
  let x = cx - total / 2;
  const align = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((c, i) => {
    ctx.fillText(c, x, y);
    x += widths[i] + gap;
  });
  ctx.textAlign = align;
}
