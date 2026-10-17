// Ball physics: a point (the ball's centre) under gravity and drag that
// collides with the drawn terrain. Contact removes the velocity component into
// the surface, so a landing keeps exactly the part of its speed that runs
// along the ground: matching the slope loses nothing, a flat landing from a
// fall loses a lot. Rolling and flying are the same rule. A hard landing is
// never fatal: it costs speed and kicks the ball back up a little.
import {
  BALL_R,
  GRAVITY,
  DRAG,
  ROLL,
  BOUNCE_IMPACT,
  RESTITUTION,
  WALL_PEN,
  DETACH_EPS,
  LAND_MIN_AIR,
} from './constants.js';

export function createBall(x, y, vx, vy) {
  return { x, y, vx, vy, grounded: true, airTime: 0, nx: 0, ny: -1, rebound: false };
}

export function speedOf(ball) {
  return Math.hypot(ball.vx, ball.vy);
}

// Height of the ball's centre when resting on the terrain at x, or NaN.
export function restingY(terrain, x) {
  const g = terrain.heightAt(x);
  if (!Number.isFinite(g)) return NaN;
  const s = terrain.slopeAt(x);
  return g - BALL_R * Math.hypot(1, s);
}

// Advance one substep. Returns an event object or null.
export function stepBall(ball, terrain, h) {
  ball.vy += GRAVITY * h;
  const sp = Math.hypot(ball.vx, ball.vy);
  if (sp > 1e-9) {
    const decel = DRAG * sp * sp + (ball.grounded ? ROLL : 0);
    const k = Math.max(0, sp - decel * h) / sp;
    ball.vx *= k;
    ball.vy *= k;
  }

  ball.x += ball.vx * h;
  ball.y += ball.vy * h;

  const rest = restingY(terrain, ball.x);
  if (Number.isFinite(rest) && ball.y >= rest) {
    if (ball.y - rest > WALL_PEN) return { type: 'crash', reason: 'wall' };

    const s = terrain.slopeAt(ball.x);
    const inv = 1 / Math.hypot(s, 1);
    const nx = s * inv;
    const ny = -inv;
    const before = Math.hypot(ball.vx, ball.vy);
    const vn = ball.vx * nx + ball.vy * ny;
    ball.y = rest;
    if (vn < 0) {
      ball.vx -= vn * nx;
      ball.vy -= vn * ny;
    }
    ball.nx = nx;
    ball.ny = ny;
    const impact = Math.max(0, -vn);

    let event = null;
    if (!ball.grounded && ball.airTime > LAND_MIN_AIR) {
      const after = Math.hypot(ball.vx, ball.vy);
      event = {
        type: 'land',
        impact,
        airTime: ball.airTime,
        before,
        after,
        loss: before > 0 ? 1 - after / before : 0,
        rebound: ball.rebound, // touchdown at the end of a bounce
      };
      ball.rebound = false;
    }
    if (impact > BOUNCE_IMPACT) {
      const kick = (impact - BOUNCE_IMPACT) * RESTITUTION;
      ball.vx += kick * nx;
      ball.vy += kick * ny;
      ball.rebound = true;
    }
    ball.grounded = true;
    ball.airTime = 0;
    return event;
  }

  if (ball.grounded) {
    const above = Number.isFinite(rest) ? rest - ball.y : Infinity;
    if (above > DETACH_EPS) {
      ball.grounded = false;
      ball.airTime = 0;
      return { type: 'launch' };
    }
  } else {
    ball.airTime += h;
  }
  return null;
}
