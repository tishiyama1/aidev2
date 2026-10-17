// Personal bests and the best run's ghost, kept per course seed.
// Storage can be unavailable (private mode, blocked site data): every access
// is guarded and the game works without it.
const PREFIX = 'sakigaki:v1:';

function read(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadBest(seed) {
  return read(`best:${seed}`);
}

export function loadGhost(seed) {
  const g = read(`ghost:${seed}`);
  return g && Array.isArray(g.pts) ? g : null;
}

// Saves the run if it beats the stored best; returns { newBest, best }.
export function saveRun(seed, game) {
  const run = { score: Math.floor(game.score), distance: Math.floor(game.distance) };
  const prev = loadBest(seed);
  const newBest = !prev || run.score > prev.score;
  if (newBest) {
    write(`best:${seed}`, run);
    pruneGhosts(seed);
    write(`ghost:${seed}`, { score: run.score, pts: game.record });
  }
  return { newBest, best: newBest ? run : prev };
}

// Keep only the current course's ghost; old days are not replayed.
function pruneGhosts(seed) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`${PREFIX}ghost:`) && k !== `${PREFIX}ghost:${seed}`) localStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
}
