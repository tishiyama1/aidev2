// Procedural sound: a rolling hum and wind that follow speed, plus short cues.
// Browsers only allow audio after a click or key press, so unlock() is called
// from input handlers.
import { HARD_IMPACT } from './constants.js';

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    this.roll = ctx.createOscillator();
    this.roll.type = 'triangle';
    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;
    const rollFilter = ctx.createBiquadFilter();
    rollFilter.type = 'lowpass';
    rollFilter.frequency.value = 400;
    this.roll.connect(rollFilter).connect(this.rollGain).connect(this.master);
    this.roll.start();

    this.noise = this._noiseBuffer(2);
    const wind = ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.Q.value = 0.8;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
    wind.start();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
  }

  update(game) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const sp = game.speed;
    const running = game.phase === 'run';
    const grounded = game.ball.grounded;
    this.rollGain.gain.setTargetAtTime(running && grounded ? Math.min(0.1, sp / 9000) : 0, t, 0.05);
    this.roll.frequency.setTargetAtTime(45 + sp * 0.07, t, 0.05);
    const wind = running ? Math.min(0.14, sp / (grounded ? 14000 : 6000)) : 0;
    this.windGain.gain.setTargetAtTime(wind, t, 0.08);
    this.windFilter.frequency.setTargetAtTime(300 + sp * 1.2, t, 0.08);
  }

  onEvent(e) {
    if (!this.ctx) return;
    if (e.type === 'land') {
      this._thud(Math.min(1.4, e.impact / HARD_IMPACT));
      if (e.impact > HARD_IMPACT) this._burst(Math.min(0.4, (e.impact / HARD_IMPACT - 1) * 0.5 + 0.15));
      if (e.quality === 'perfect') this._chime([880, 1320], 0.12);
      else if (e.quality === 'clean') this._chime([660], 0.08);
    } else if (e.type === 'ring') {
      const n = PENTA[(e.count - 1) % PENTA.length];
      this._chime([523.25 * Math.pow(2, n / 12)], 0.12);
    } else if (e.type === 'end') {
      if (e.reason === 'crash') this._burst(0.5);
      else this._fall();
    }
  }

  _noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _env(gain, peak, attack, decay) {
    const t = this.ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  _thud(strength) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 0.15);
    o.connect(g).connect(this.master);
    this._env(g, 0.08 + strength * 0.35, 0.005, 0.18);
    o.start();
    o.stop(ctx.currentTime + 0.25);
  }

  _chime(freqs, peak) {
    const ctx = this.ctx;
    for (const f of freqs) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(g).connect(this.master);
      this._env(g, peak, 0.005, 0.45);
      o.start();
      o.stop(ctx.currentTime + 0.5);
    }
  }

  _burst(peak) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3000, ctx.currentTime);
    f.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.6);
    const g = ctx.createGain();
    s.connect(f).connect(g).connect(this.master);
    this._env(g, peak, 0.005, 0.7);
    s.start();
    s.stop(ctx.currentTime + 0.8);
  }

  _fall() {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(440, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.7);
    o.connect(g).connect(this.master);
    this._env(g, 0.15, 0.01, 0.75);
    o.start();
    o.stop(ctx.currentTime + 0.8);
  }
}
