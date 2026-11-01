// Motor de audio: instrumentos sintetizados con Web Audio y un programador con anticipación.
import { MAX_TRACKS, isDrum, stepsOf } from './store.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Engine {
  constructor() {
    this.ctx = null;
    this.channels = [];
    this.playing = false;
    this.timer = null;
    this.lookahead = 0.12;     // segundos programados por adelantado
    this.tickMs = 25;
    this.onStep = null;        // (step, patternId, chainIndex) para la interfaz
    this.uiQueue = [];
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 8;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.15;
    this.masterAnalyser = ctx.createAnalyser();
    this.masterAnalyser.fftSize = 512;
    this.master.connect(this.limiter).connect(this.masterAnalyser).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.2, 2.5);
    this.reverbOut = ctx.createGain();
    this.reverbOut.gain.value = 0.7;
    this.reverb.connect(this.reverbOut).connect(this.master);

    this.noise = this.makeNoise();
    for (let i = 0; i < MAX_TRACKS; i++) {
      const gain = ctx.createGain();
      const pan = ctx.createStereoPanner();
      const send = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      gain.connect(pan).connect(this.master);
      pan.connect(analyser);
      gain.connect(send).connect(this.reverb);
      this.channels.push({ gain, pan, send, analyser });
    }
    return ctx;
  }

  makeNoise() {
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  makeImpulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  // Aplica volumen, panorama, envío, silencio y solo de la canción
  applyMix(song) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const anySolo = song.tracks.some((tr) => tr.solo);
    song.tracks.forEach((tr, i) => {
      const ch = this.channels[i];
      const audible = !tr.mute && (!anySolo || tr.solo);
      const v = audible ? Math.pow(tr.vol / 100, 2) : 0;
      ch.gain.gain.setTargetAtTime(v, t, 0.02);
      ch.pan.pan.setTargetAtTime(tr.pan / 50, t, 0.02);
      ch.send.gain.setTargetAtTime((tr.rev / 100) * 0.8, t, 0.02);
    });
    // Canales sin pista (por ejemplo, tras eliminar una)
    this.channels.slice(song.tracks.length).forEach((ch) => ch.gain.gain.setTargetAtTime(0, t, 0.02));
    this.master.gain.setTargetAtTime(Math.pow(song.masterVol / 100, 2) * 1.1, t, 0.02);
  }

  // ===== Instrumentos =====
  play(voice, ch, time, midi, dur, vel) {
    const ctx = this.ctx;
    const out = this.channels[ch].gain;
    const v = Math.max(0.05, vel / 127);
    const env = (g, a, peak, decayTo, decayTime) => {
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + a);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, decayTo), time + a + decayTime);
    };
    const noiseSrc = () => { const s = ctx.createBufferSource(); s.buffer = this.noise; return s; };

    switch (voice) {
      case 'kick': {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.frequency.setValueAtTime(150, time);
        o.frequency.exponentialRampToValueAtTime(42, time + 0.13);
        env(g, 0.003, 1.0 * v, 0.0001, 0.42);
        o.connect(g).connect(out); o.start(time); o.stop(time + 0.5);
        break;
      }
      case 'snare': {
        const n = noiseSrc(); const f = ctx.createBiquadFilter(); const g = ctx.createGain();
        f.type = 'highpass'; f.frequency.value = 1200;
        env(g, 0.002, 0.6 * v, 0.0001, 0.2);
        n.connect(f).connect(g).connect(out); n.start(time); n.stop(time + 0.25);
        const o = ctx.createOscillator(); const g2 = ctx.createGain();
        o.type = 'triangle'; o.frequency.setValueAtTime(190, time);
        env(g2, 0.002, 0.5 * v, 0.0001, 0.1);
        o.connect(g2).connect(out); o.start(time); o.stop(time + 0.15);
        break;
      }
      case 'hat':
      case 'openhat': {
        const n = noiseSrc(); const f = ctx.createBiquadFilter(); const g = ctx.createGain();
        f.type = 'highpass'; f.frequency.value = 7500;
        const len = voice === 'hat' ? 0.05 : 0.32;
        env(g, 0.001, 0.45 * v, 0.0001, len);
        n.connect(f).connect(g).connect(out); n.start(time); n.stop(time + len + 0.05);
        break;
      }
      case 'clap': {
        const n = noiseSrc(); const f = ctx.createBiquadFilter(); const g = ctx.createGain();
        f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.8;
        g.gain.setValueAtTime(0.0001, time);
        [0, 0.011, 0.022].forEach((o) => {
          g.gain.setValueAtTime(0.7 * v, time + o);
          g.gain.exponentialRampToValueAtTime(0.05, time + o + 0.009);
        });
        g.gain.setValueAtTime(0.5 * v, time + 0.033);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
        n.connect(f).connect(g).connect(out); n.start(time); n.stop(time + 0.25);
        break;
      }
      case 'tom': {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.frequency.setValueAtTime(220, time);
        o.frequency.exponentialRampToValueAtTime(110, time + 0.25);
        env(g, 0.003, 0.8 * v, 0.0001, 0.35);
        o.connect(g).connect(out); o.start(time); o.stop(time + 0.4);
        break;
      }
      case 'bass': {
        const o = ctx.createOscillator(); const f = ctx.createBiquadFilter(); const g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = mtof(midi);
        f.type = 'lowpass'; f.Q.value = 7;
        f.frequency.setValueAtTime(1600, time);
        f.frequency.exponentialRampToValueAtTime(260, time + 0.18);
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(0.55 * v, time + 0.005);
        g.gain.setTargetAtTime(0.35 * v, time + 0.01, 0.08);
        g.gain.setTargetAtTime(0.0001, time + dur, 0.03);
        o.connect(f).connect(g).connect(out); o.start(time); o.stop(time + dur + 0.25);
        break;
      }
      case 'piano': {
        const f0 = mtof(midi);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(0.3 * v, time + 0.004);
        g.gain.exponentialRampToValueAtTime(0.08 * v, time + 0.6);
        g.gain.setTargetAtTime(0.0001, time + dur, 0.12);
        [[1, 'sine', 1], [2, 'triangle', 0.25], [4, 'sine', 0.06]].forEach(([mul, type, amp]) => {
          const o = ctx.createOscillator(); const og = ctx.createGain();
          o.type = type; o.frequency.value = f0 * mul; og.gain.value = amp;
          o.connect(og).connect(g); o.start(time); o.stop(time + dur + 0.8);
        });
        g.connect(out);
        break;
      }
      case 'lead': {
        const o = ctx.createOscillator(); const f = ctx.createBiquadFilter(); const g = ctx.createGain();
        o.type = 'square'; o.frequency.value = mtof(midi);
        f.type = 'lowpass'; f.frequency.value = 2600; f.Q.value = 2;
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(0.18 * v, time + 0.01);
        g.gain.setTargetAtTime(0.13 * v, time + 0.02, 0.1);
        g.gain.setTargetAtTime(0.0001, time + dur, 0.05);
        o.connect(f).connect(g).connect(out); o.start(time); o.stop(time + dur + 0.4);
        break;
      }
      case 'pad': {
        const f = ctx.createBiquadFilter(); const g = ctx.createGain();
        f.type = 'lowpass'; f.frequency.value = 1300;
        g.gain.setValueAtTime(0.0001, time);
        g.gain.linearRampToValueAtTime(0.09 * v, time + Math.min(0.35, dur * 0.5));
        g.gain.setTargetAtTime(0.0001, time + dur, 0.25);
        [-8, 0, 7].forEach((cents) => {
          const o = ctx.createOscillator();
          o.type = 'sawtooth'; o.frequency.value = mtof(midi); o.detune.value = cents;
          o.connect(f); o.start(time); o.stop(time + dur + 1.5);
        });
        f.connect(g).connect(out);
        break;
      }
      default: break;
    }
  }

  // Suena una nota suelta (al pulsar una celda o una tecla)
  preview(song, trackIdx, midi) {
    this.ensure();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.applyMix(song);
    const tr = song.tracks[trackIdx];
    const dur = 60 / song.bpm / 4 * 2;
    const m = isDrum(tr) ? 60 : (midi ?? 60) + tr.trans * 12;
    this.play(tr.voice, trackIdx, this.ctx.currentTime + 0.01, m, dur, 100);
  }

  // ===== Transporte =====
  start(getSong, getMode, getPattern) {
    this.ensure();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.getSong = getSong; this.getMode = getMode; this.getPattern = getPattern;
    this.playing = true;
    this.step = 0;
    this.chainIndex = 0;
    this.nextTime = this.ctx.currentTime + 0.06;
    this.uiQueue = [];
    this.applyMix(getSong());
    this.timer = setInterval(() => this.tick(), this.tickMs);
    this.tick();
    const draw = () => {
      if (!this.playing) return;
      const now = this.ctx.currentTime;
      let last = null;
      while (this.uiQueue.length && this.uiQueue[0].time <= now) last = this.uiQueue.shift();
      if (last && this.onStep) this.onStep(last.step, last.pid, last.chainIndex);
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }

  stop() {
    this.playing = false;
    clearInterval(this.timer);
    this.timer = null;
    if (this.onStep) this.onStep(-1, null, -1);
  }

  currentPatternId() {
    const song = this.getSong();
    if (this.getMode() === 'song') return song.song[this.chainIndex % song.song.length];
    return this.getPattern();
  }

  tick() {
    const song = this.getSong();
    const stepDur = 60 / song.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + this.lookahead) {
      const pid = this.currentPatternId();
      const pat = song.patterns[pid];
      const swingDelay = this.step % 2 === 1 ? stepDur * (song.swing / 100) * 0.66 : 0;
      const t = this.nextTime + swingDelay;
      song.tracks.forEach((tr, i) => {
        const lane = pat.lanes[i];
        if (isDrum(tr)) {
          const vel = lane.hits[this.step];
          if (vel > 0) this.play(tr.voice, i, t, 60, stepDur, vel);
        } else {
          const shift = tr.trans * 12;
          lane.notes.forEach((n) => {
            if (n.s === this.step) this.play(tr.voice, i, t, n.m + shift, n.l * stepDur * 0.95, n.v);
          });
        }
      });
      this.uiQueue.push({ time: t, step: this.step, pid, chainIndex: this.chainIndex });
      this.nextTime += stepDur;
      this.step++;
      // Cada patrón tiene su propio compás; >= cubre el cambio a uno más corto a mitad de compás
      if (this.step >= stepsOf(pat)) {
        this.step = 0;
        if (this.getMode() === 'song') this.chainIndex = (this.chainIndex + 1) % song.song.length;
      }
    }
  }

  // Nivel RMS (0..1) de un canal, o del máster con i = -1
  level(i) {
    if (!this.ctx) return 0;
    const an = i < 0 ? this.masterAnalyser : this.channels[i].analyser;
    const buf = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let k = 0; k < buf.length; k++) sum += buf[k] * buf[k];
    return Math.min(1, Math.sqrt(sum / buf.length) * 3.2);
  }
}
