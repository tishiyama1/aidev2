import { FIXED_DT } from './constants.js';
import { dailySeed } from './rng.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { loadBest, loadGhost, saveRun } from './storage.js';

const START_MOVE = 160; // pointer travel (view units) that releases the ball
const RESTART_DELAY = 0.6;

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || dailySeed();
const courseLabel = params.get('seed') ? `#${seed}` : formatDate(seed);

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const input = new Input(renderer);
const sound = new Sound();

let game = new Game(seed);
let best = loadBest(seed);
let ghost = loadGhost(seed);
let result = null;
let showTitle = true;
let acc = 0;
let last = performance.now();

input.onKey = (k) => {
  if (k === 'm' || k === 'M') sound.toggleMute();
};
window.addEventListener('resize', () => renderer.resize());

function restart() {
  game = new Game(seed);
  ghost = loadGhost(seed);
  result = null;
  input.moved = 0;
  renderer.reset();
  acc = 0;
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  input.update(dt);
  let press = input.consumePress();
  if (press) sound.unlock();
  if (game.phase === 'over' && press && game.overTime > RESTART_DELAY) {
    restart();
    press = false; // the restarting click should not also release the ball
  }

  const start = game.phase === 'ready' && (press || input.moved > START_MOVE);
  if (start) showTitle = false;

  acc += dt;
  while (acc >= FIXED_DT) {
    game.step(FIXED_DT, { targetY: input.targetY, start });
    acc -= FIXED_DT;
  }

  for (const e of game.drainEvents()) {
    renderer.onEvent(e);
    sound.onEvent(e);
    if (e.type === 'end') {
      result = saveRun(seed, game);
      best = result.best;
    }
  }
  sound.update(game);
  canvas.style.cursor = game.phase === 'over' ? 'pointer' : 'none';
  renderer.draw(game, dt, { ghost, best, result, showTitle, courseLabel });
  requestAnimationFrame(frame);
}

function formatDate(s) {
  const y = Math.floor(s / 10000);
  const m = String(Math.floor(s / 100) % 100).padStart(2, '0');
  const d = String(s % 100).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

// Test hook: lets the smoke test read state without reaching into modules.
window.__sakigaki = {
  get game() {
    return game;
  },
  input,
  seed,
};

const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
fontsReady.finally(() => requestAnimationFrame(frame));
