// Canciones de ejemplo: cada una enseña algo distinto (compases, swing, pistas duplicadas, muchos patrones…).
import { FORMAT, FORMAT_VERSION, TRACK_COLORS, VOICES, normalizeSong, demoSong } from './store.js';

// ===== Notación compacta =====
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midi(name) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`Nota no válida: ${name}`);
  return (Number(m[3]) + 1) * 12 + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

// "C4+E4+G4:0:4:90" → acorde en el paso 0, de 4 pasos, con fuerza 90 (por defecto 100)
const N = (str) => str.trim().split(/\s+/).flatMap((tok) => {
  const [names, s, l, v = '100'] = tok.split(':');
  return names.split('+').map((n) => ({ m: midi(n), s: Number(s), l: Number(l), v: Number(v) }));
});

// "X... x.o." → golpes por paso: X fuerte, x normal, o suave, . nada (los espacios se ignoran)
const VEL = { X: 120, x: 100, o: 60 };
const D = (str) => [...str.replace(/\s/g, '')].map((c) => VEL[c] ?? 0);

// Recorre las notas en bucle cada `every` pasos, desde `from` hasta `to` (arpegios y bajos repetidos)
function arp(names, to, every = 1, v = 90, from = 0) {
  const out = [];
  for (let s = from, k = 0; s < to; s += every, k++) out.push({ m: midi(names[k % names.length]), s, l: every, v });
  return out;
}

const DEFAULT_OCT = { bass: 1, piano: 3, lead: 4, pad: 3 };

// tracks: [{ id, name, voice, vol, pan, rev, trans }]; patterns: { A: { beats, lanes: { id: cadena o notas } } }
function make({ name, bpm, swing = 0, tracks, patterns, song }) {
  const ts = tracks.map((t, i) => ({ vol: 70, pan: 0, rev: 15, trans: 0, mute: false, solo: false, color: TRACK_COLORS[i], ...t }));
  const pats = {};
  Object.entries(patterns).forEach(([pid, p]) => {
    const beats = p.beats ?? 4;
    pats[pid] = {
      beats,
      lanes: ts.map((t) => {
        const x = p.lanes[t.id];
        if (VOICES[t.voice].kind === 'drum') {
          const hits = typeof x === 'string' ? D(x) : [];
          if (hits.length && hits.length !== beats * 4) console.warn(`${name} ${pid}/${t.id}: ${hits.length} pasos en vez de ${beats * 4}`);
          return { hits };
        }
        const notes = typeof x === 'string' ? N(x) : x ?? [];
        if (notes.some((n) => n.s + n.l > beats * 4)) console.warn(`${name} ${pid}/${t.id}: notas fuera del compás`);
        return { notes };
      }),
    };
  });
  // Teclado visible: empieza en la octava de la nota más grave que suena en la pista
  ts.forEach((t, i) => {
    if (VOICES[t.voice].kind === 'drum' || t.oct != null) return;
    const ms = Object.values(pats).flatMap((p) => p.lanes[i].notes.map((n) => n.m + t.trans * 12));
    t.oct = ms.length ? Math.max(0, Math.min(7, Math.floor(Math.min(...ms) / 12) - 1)) : DEFAULT_OCT[t.voice];
  });
  return normalizeSong({ format: FORMAT, version: FORMAT_VERSION, name, bpm, swing, masterVol: 85, tracks: ts, patterns: pats, song });
}

// ===== Canciones =====

// Vals en 3/4: un compás por patrón, acompañamiento «um-pa-pa»
function vals() {
  const drums = { kick: 'X... .... ....', hat: '.... o... o...' };
  const bar = (bass, chord, mel, pad) => ({
    beats: 3,
    lanes: { ...drums, bass: `${bass}:0:4`, piano: `${chord}:4:3:80 ${chord}:8:3:70`, lead: mel, pad: `${pad}:0:12:60` },
  });
  return make({
    name: 'Vals de la plaza', bpm: 156,
    tracks: [
      { id: 'kick', name: 'Bombo', voice: 'kick' },
      { id: 'hat', name: 'Escobillas', voice: 'hat', vol: 45, pan: 20, rev: 20 },
      { id: 'bass', name: 'Contrabajo', voice: 'bass' },
      { id: 'piano', name: 'Acordeón', voice: 'piano', vol: 55, pan: -20, rev: 30 },
      { id: 'lead', name: 'Melodía', voice: 'lead', vol: 55, pan: 10, rev: 35 },
      { id: 'pad', name: 'Cuerdas', voice: 'pad', vol: 40, pan: 25, rev: 60 },
    ],
    patterns: {
      A: bar('C2', 'E4+G4+C5', 'E5:0:6 G5:6:2 E5:8:4', 'C4+E4+G4'),
      B: bar('G1', 'F4+G4+B4', 'D5:0:6 F5:6:2 D5:8:4', 'B3+D4+G4'),
      C: bar('A1', 'E4+A4+C5', 'C5:0:4 E5:4:4 A5:8:4', 'A3+C4+E4'),
      D: bar('F1', 'F4+A4+C5', 'A5:0:6 G5:6:2 F5:8:2 D5:10:2', 'A3+C4+F4'),
      E: { beats: 3, lanes: { kick: 'X... .... ....', bass: 'C2:0:12', piano: 'E4+G4+C5:0:12:90', lead: 'C5:0:12', pad: 'C4+E4+G4:0:12:60' } },
    },
    song: ['A', 'B', 'A', 'B', 'C', 'D', 'C', 'B', 'A', 'B', 'A', 'B', 'C', 'D', 'A', 'E'],
  });
}

// Marcha en 2/4: redoble de entrada, tuba y trompeta, timbales al final
function marcha() {
  const drums = { kick: 'X... X...', snare: '..o. .oo.' };
  const C = { bass: 'C2:0:2 G1:4:2', piano: 'E4+G4:2:1:70 E4+G4:6:1:70' };
  const G = { bass: 'G1:0:2 D2:4:2', piano: 'B3+F4:2:1:70 B3+F4:6:1:70' };
  return make({
    name: 'Marcha del desfile', bpm: 112,
    tracks: [
      { id: 'kick', name: 'Bombo', voice: 'kick', vol: 75 },
      { id: 'snare', name: 'Redoblante', voice: 'snare', vol: 65, pan: -10, rev: 20 },
      { id: 'tom', name: 'Timbal', voice: 'tom', vol: 70, pan: 15, rev: 25 },
      { id: 'crash', name: 'Platillo', voice: 'openhat', vol: 50, pan: 20, rev: 30 },
      { id: 'bass', name: 'Tuba', voice: 'bass', vol: 70 },
      { id: 'lead', name: 'Trompeta', voice: 'lead', vol: 60, pan: 10, rev: 25 },
      { id: 'piano', name: 'Trombones', voice: 'piano', vol: 50, pan: -25, rev: 25 },
    ],
    patterns: {
      A: { beats: 2, lanes: { ...drums, crash: 'X... ....', ...C, lead: 'G4:0:2 C5:2:2 E5:4:3 C5:7:1' } },
      B: { beats: 2, lanes: { ...drums, ...C, lead: 'G5:0:4 E5:4:2 C5:6:2' } },
      C: { beats: 2, lanes: { ...drums, ...G, lead: 'D5:0:2 B4:2:2 G4:4:2 B4:6:2' } },
      D: { beats: 2, lanes: { ...drums, ...G, lead: 'D5:0:3 E5:3:1 D5:4:2 B4:6:2' } },
      E: { beats: 2, lanes: { kick: 'X... X...', tom: 'xxxx ....', crash: '.... X...', bass: 'C2:0:4 C1:4:4', lead: 'C5:0:4 C5:4:4:120', piano: 'E4+G4:4:4' } },
      F: { beats: 2, lanes: { snare: 'xoxo xoxX' } },
    },
    song: ['F', 'A', 'B', 'C', 'D', 'A', 'B', 'C', 'D', 'A', 'B', 'C', 'E'],
  });
}

// Hip hop con mucho swing: semicorcheas impares retrasadas
function hiphop() {
  const drums = { kick: 'X... ...x ..X. ....', snare: '.... X... .... X...', hat: 'x.o. x.o. x.o. x.oo', clap: '.... o... .... o...' };
  const Dm = { bass: 'D2:0:3 D2:7:2 F2:10:2 C2:14:2', piano: 'F4+A4+C5+E5:0:3:80 F4+A4+C5+E5:7:6:70' };
  const Gm = { bass: 'G1:0:3 G1:7:2 A#1:10:2 F1:14:2', piano: 'F4+A#4+D5:0:3:80 F4+A#4+D5:7:6:70' };
  return make({
    name: 'Boom bap con swing', bpm: 88, swing: 40,
    tracks: [
      { id: 'kick', name: 'Bombo', voice: 'kick', vol: 85 },
      { id: 'snare', name: 'Caja', voice: 'snare', vol: 70, rev: 15 },
      { id: 'hat', name: 'Charles', voice: 'hat', vol: 45, pan: 20 },
      { id: 'clap', name: 'Palmas', voice: 'clap', vol: 35, pan: -10, rev: 30 },
      { id: 'bass', name: 'Bajo', voice: 'bass', vol: 75 },
      { id: 'piano', name: 'Rhodes', voice: 'piano', vol: 55, pan: -15, rev: 25 },
      { id: 'lead', name: 'Silbido', voice: 'lead', vol: 40, pan: 15, rev: 45 },
    ],
    patterns: {
      A: { lanes: { ...drums, ...Dm } },
      B: { lanes: { ...drums, ...Gm } },
      C: { lanes: { ...drums, ...Dm, lead: 'A5:0:2 F5:2:2 D5:4:4 C5:10:2 D5:12:4' } },
      D: { lanes: { ...drums, ...Gm, lead: 'A#5:0:2 A5:2:2 G5:4:4 F5:10:2 D5:12:4' } },
      E: { lanes: { hat: 'x.o. x.o. x.o. x.o.', ...Dm } },
    },
    song: ['E', 'A', 'B', 'A', 'B', 'C', 'D', 'C', 'D', 'A', 'B', 'E'],
  });
}

// House: ocho patrones (intro, groove, melodía, break y subida) para enseñar una estructura larga
function house() {
  const four = 'X... X... X... X...';
  const full = { kick: four, clap: '.... x... .... x...', hat: 'xoxo xoxo xoxo xoxo', openhat: '..x. ..x. ..x. ..x.' };
  const offBass = (r) => N([2, 6, 10, 14].map((s) => `${r}1:${s}:1 ${r}2:${s + 1}:1`).join(' '));
  const Am = { ...full, bass: offBass('A'), piano: 'A4+C5+E5:3:2:90 A4+C5+E5:10:2:80' };
  const F = { ...full, bass: offBass('F'), piano: 'F4+A4+C5:3:2:90 F4+A4+C5:10:2:80' };
  return make({
    name: 'Noche de house', bpm: 124,
    tracks: [
      { id: 'kick', name: 'Bombo', voice: 'kick', vol: 85 },
      { id: 'clap', name: 'Palmas', voice: 'clap', vol: 55, rev: 25 },
      { id: 'hat', name: 'Charles', voice: 'hat', vol: 40, pan: 20 },
      { id: 'openhat', name: 'Charles abierto', voice: 'openhat', vol: 40, pan: -20, rev: 15 },
      { id: 'bass', name: 'Bajo', voice: 'bass', vol: 70 },
      { id: 'piano', name: 'Stabs', voice: 'piano', vol: 55, pan: -10, rev: 30 },
      { id: 'pad', name: 'Pad', voice: 'pad', vol: 40, pan: 15, rev: 65 },
      { id: 'lead', name: 'Melodía', voice: 'lead', vol: 50, pan: 10, rev: 35 },
    ],
    patterns: {
      A: { lanes: { kick: four, hat: 'o.o. o.o. o.o. o.o.' } },
      B: { lanes: { kick: four, clap: '.... x... .... x...', hat: 'xoxo xoxo xoxo xoxo', openhat: '..x. ..x. ..x. ..x.' } },
      C: { lanes: Am },
      D: { lanes: F },
      E: { lanes: { ...Am, pad: 'A3+C4+E4:0:16:70', lead: 'E5:0:3 A5:3:3 C6:6:2 B5:8:4 A5:12:4' } },
      F: { lanes: { ...F, pad: 'F3+A3+C4:0:16:70', lead: 'C6:0:3 A5:3:3 F5:6:2 G5:8:4 E5:12:4' } },
      G: { lanes: { hat: 'o.o. o.o. o.o. o.o.', pad: 'A3+C4+E4:0:8:80 F3+A3+C4:8:8:80' } },
      H: { lanes: { kick: 'X... X... X.X. XXXX', clap: 'x.x. x.x. xxxx XXXX', pad: 'G3+B3+D4:0:16:80' } },
    },
    song: ['A', 'A', 'B', 'B', 'C', 'D', 'C', 'D', 'G', 'H', 'E', 'F', 'E', 'F', 'C', 'D', 'A'],
  });
}

// Synthwave: el bajo y la melodía están duplicados y transpuestos una octava arriba/abajo
function octavas() {
  const drums = { kick: 'X... .... X... ....', snare: '.... X... .... X...', hat: 'x.x. x.x. x.x. x.x.' };
  const bar = (root, arpNotes, pad, mel) => {
    const bass = arp([root], 16, 2, 100);
    const lanes = { ...drums, bass, bassUp: bass, arp: arp(arpNotes, 16, 1, 70), pad: `${pad}:0:16:60` };
    if (mel) Object.assign(lanes, { lead: mel, leadUp: mel, leadDown: mel });
    return { lanes };
  };
  const mel = ['E5:0:4 A5:4:4 G5:8:2 E5:10:6', 'F5:0:4 E5:4:4 C5:8:8', 'G5:0:4 E5:4:2 G5:6:2 C6:8:8', 'B5:0:4 A5:4:4 G5:8:4 D5:12:4'];
  const chords = [['A1', ['A4', 'C5', 'E5', 'C5'], 'A3+C4+E4'], ['F1', ['F4', 'A4', 'C5', 'A4'], 'F3+A3+C4'],
    ['C2', ['G4', 'C5', 'E5', 'C5'], 'G3+C4+E4'], ['G1', ['G4', 'B4', 'D5', 'B4'], 'G3+B3+D4']];
  const patterns = {};
  chords.forEach((c, i) => {
    patterns['ABCD'[i]] = bar(...c);
    patterns['EFGH'[i]] = bar(...c, mel[i]);
  });
  return make({
    name: 'Octavas en paralelo', bpm: 100,
    tracks: [
      { id: 'kick', name: 'Bombo', voice: 'kick', vol: 80 },
      { id: 'snare', name: 'Caja', voice: 'snare', vol: 65, rev: 45 },
      { id: 'hat', name: 'Charles', voice: 'hat', vol: 40, pan: 15 },
      { id: 'bass', name: 'Bajo', voice: 'bass', vol: 70 },
      { id: 'bassUp', name: 'Bajo +1 oct', voice: 'bass', vol: 40, trans: 1 },
      { id: 'arp', name: 'Arpegio', voice: 'piano', vol: 40, pan: -30, rev: 35 },
      { id: 'pad', name: 'Pad', voice: 'pad', vol: 40, pan: 25, rev: 60 },
      { id: 'lead', name: 'Melodía', voice: 'lead', vol: 55, rev: 30 },
      { id: 'leadUp', name: 'Melodía +1 oct', voice: 'lead', vol: 32, pan: 25, rev: 40, trans: 1 },
      { id: 'leadDown', name: 'Melodía −1 oct', voice: 'lead', vol: 40, pan: -25, rev: 30, trans: -1 },
    ],
    patterns,
    song: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'E', 'F', 'G', 'H', 'A', 'B', 'C', 'D'],
  });
}

// Balada en 6/4: arpegio de corcheas agrupado en 3 + 3 negras
function balada() {
  const drums = { kick: 'X... .... .... X... .... ....', hat: 'x... o... o... x... o... o...' };
  const bar = (bass, arpNotes, pad, mel) => ({
    beats: 6,
    lanes: { ...drums, bass, piano: arp(arpNotes, 24, 2, 75), pad: `${pad}:0:24:55`, ...(mel ? { lead: mel } : {}) },
  });
  const chords = [
    ['D2:0:12 A1:12:12', ['D4', 'F#4', 'A4', 'D5', 'A4', 'F#4'], 'D4+F#4+A4', 'F#5:0:8 E5:8:4 D5:12:8 A4:20:4'],
    ['B1:0:12 F#1:12:12', ['B3', 'D4', 'F#4', 'B4', 'F#4', 'D4'], 'B3+D4+F#4', 'D5:0:8 F#5:8:4 B5:12:12'],
    ['G1:0:12 D2:12:12', ['G3', 'B3', 'D4', 'G4', 'D4', 'B3'], 'G3+B3+D4', 'B5:0:8 A5:8:4 G5:12:8 F#5:20:4'],
    ['A1:0:12 E2:12:12', ['A3', 'C#4', 'E4', 'A4', 'E4', 'C#4'], 'A3+C#4+E4', 'E5:0:12 C#5:12:12'],
  ];
  const patterns = {};
  chords.forEach(([b, a, p, m], i) => {
    patterns['ABCD'[i]] = bar(b, a, p);
    patterns['EFGH'[i]] = bar(b, a, p, m);
  });
  patterns.I = { beats: 6, lanes: { kick: 'X... .... .... .... .... ....', bass: 'D2:0:24', piano: 'D4+F#4+A4:0:24:80', pad: 'D4+F#4+A4:0:24:55', lead: 'D5:0:24:90' } };
  return make({
    name: 'Balada en seis', bpm: 76,
    tracks: [
      { id: 'kick', name: 'Bombo', voice: 'kick', vol: 55 },
      { id: 'hat', name: 'Escobillas', voice: 'hat', vol: 35, pan: 20, rev: 30 },
      { id: 'bass', name: 'Bajo', voice: 'bass', vol: 60 },
      { id: 'piano', name: 'Piano', voice: 'piano', vol: 60, pan: -10, rev: 40 },
      { id: 'pad', name: 'Cuerdas', voice: 'pad', vol: 40, pan: 20, rev: 70 },
      { id: 'lead', name: 'Voz', voice: 'lead', vol: 55, rev: 50 },
    ],
    patterns,
    song: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'E', 'F', 'G', 'H', 'I'],
  });
}

// Lo-fi en 8/4: patrones de 32 pasos para frases largas con dos acordes
function lofi() {
  const drums = {
    kick: 'X... ...x ..X. ....'.repeat(2),
    snare: '.... X... .... X...'.repeat(2),
    hat: 'x.o. x.o. x.o. x.oo'.repeat(2),
  };
  const A = {
    ...drums,
    bass: 'F1:0:6 F1:10:4 C2:14:2 E1:16:6 E1:26:4 B1:30:2',
    piano: 'A4+C5+E5:0:6:75 A4+C5+E5:10:4:65 G4+B4+D5:16:6:75 G4+B4+D5:26:4:65',
    pad: 'F3+A3+C4+E4:0:16:50 E3+G3+B3+D4:16:16:50',
  };
  const B = {
    ...drums,
    bass: 'D2:0:6 D2:10:4 A1:14:2 C2:16:6 C2:26:4 G1:30:2',
    piano: 'F4+A4+C5:0:6:75 F4+A4+C5:10:4:65 E4+G4+B4:16:6:75 E4+G4+B4:26:4:65',
    pad: 'D3+F3+A3+C4:0:16:50 C3+E3+G3+B3:16:16:50',
  };
  return make({
    name: 'Frase larga (lo-fi)', bpm: 80, swing: 25,
    tracks: [
      { id: 'kick', name: 'Bombo', voice: 'kick', vol: 70 },
      { id: 'snare', name: 'Caja', voice: 'snare', vol: 50, rev: 30 },
      { id: 'hat', name: 'Charles', voice: 'hat', vol: 35, pan: 20 },
      { id: 'bass', name: 'Bajo', voice: 'bass', vol: 70 },
      { id: 'piano', name: 'Piano', voice: 'piano', vol: 55, pan: -15, rev: 35 },
      { id: 'lead', name: 'Melodía', voice: 'lead', vol: 42, pan: 15, rev: 45 },
      { id: 'pad', name: 'Pad', voice: 'pad', vol: 30, pan: 10, rev: 70 },
    ],
    patterns: {
      A: { beats: 8, lanes: A },
      B: { beats: 8, lanes: B },
      C: { beats: 8, lanes: { ...A, lead: 'C6:0:3 A5:3:3 G5:6:2 E5:8:8 D5:16:3 E5:19:3 G5:22:2 B5:24:8' } },
      D: { beats: 8, lanes: { ...B, lead: 'A5:0:4 F5:4:4 E5:8:2 D5:10:6 E5:16:4 G5:20:4 C6:24:8' } },
    },
    song: ['A', 'B', 'A', 'B', 'C', 'D', 'C', 'D', 'A', 'B'],
  });
}

// Reggaetón: ritmo dembow y bajo en 3 + 3 + 2
function dembow() {
  const drums = { kick: 'X... X... X... X...', snare: '...x ..x. ...x ..x.', hat: 'x.o. x.o. x.o. x.o.', clap: '.... ..x. .... ..x.' };
  const AmF = {
    bass: 'A1:0:3 A1:3:3 A1:6:2 F1:8:3 F1:11:3 F1:14:2',
    pad: 'A3+C4+E4:0:8:70 F3+A3+C4:8:8:70',
    piano: 'A4+C5+E5:3:2:70 A4+C5+E5:6:2:70 F4+A4+C5:11:2:70 F4+A4+C5:14:2:70',
  };
  const CG = {
    bass: 'C2:0:3 C2:3:3 C2:6:2 G1:8:3 G1:11:3 G1:14:2',
    pad: 'C4+E4+G4:0:8:70 B3+D4+G4:8:8:70',
    piano: 'C5+E5+G5:3:2:70 C5+E5+G5:6:2:70 G4+B4+D5:11:2:70 G4+B4+D5:14:2:70',
  };
  const melA = 'E5:0:2 E5:3:2 D5:6:2 C5:8:3 A4:11:5';
  return make({
    name: 'Dembow', bpm: 94,
    tracks: [
      { id: 'kick', name: 'Bombo', voice: 'kick', vol: 85 },
      { id: 'snare', name: 'Caja', voice: 'snare', vol: 65, rev: 15 },
      { id: 'hat', name: 'Charles', voice: 'hat', vol: 40, pan: 20 },
      { id: 'clap', name: 'Palmas', voice: 'clap', vol: 45, pan: -15, rev: 25 },
      { id: 'bass', name: 'Bajo', voice: 'bass', vol: 75 },
      { id: 'piano', name: 'Piano', voice: 'piano', vol: 45, pan: -20, rev: 30 },
      { id: 'pad', name: 'Pad', voice: 'pad', vol: 40, pan: 20, rev: 50 },
      { id: 'lead', name: 'Melodía', voice: 'lead', vol: 50, rev: 30 },
    ],
    patterns: {
      A: { lanes: { ...drums, ...AmF } },
      B: { lanes: { ...drums, ...CG } },
      C: { lanes: { ...drums, ...AmF, lead: melA } },
      D: { lanes: { ...drums, ...CG, lead: 'E5:0:2 G5:3:2 E5:6:2 D5:8:3 B4:11:5' } },
      E: { lanes: { hat: 'x.o. x.o. x.o. x.o.', pad: AmF.pad, lead: melA } },
    },
    song: ['A', 'B', 'A', 'B', 'C', 'D', 'C', 'D', 'E', 'E', 'C', 'D'],
  });
}

// Rock: guitarras abiertas a izquierda y derecha, redoble de toms y platillo
function rock() {
  const drums = { kick: 'X... ..X. X.X. ....', snare: '.... X... .... X...', hat: 'x.x. x.x. x.x. x.x.' };
  const E = { bass: arp(['E2'], 16, 2, 100), gtrL: 'E4+B4+E5:0:2 E4+B4+E5:3:2 E4+B4+E5:6:2 E4+B4+E5:8:6', gtrR: 'E4:0:2 G4:3:2 A4:6:2 B4:8:4 A4:12:2 G4:14:2' };
  return make({
    name: 'Rock de garaje', bpm: 132,
    tracks: [
      { id: 'kick', name: 'Bombo', voice: 'kick', vol: 80 },
      { id: 'snare', name: 'Caja', voice: 'snare', vol: 75, rev: 25 },
      { id: 'hat', name: 'Charles', voice: 'hat', vol: 45, pan: 20 },
      { id: 'crash', name: 'Platillo', voice: 'openhat', vol: 45, pan: -20, rev: 30 },
      { id: 'tom', name: 'Toms', voice: 'tom', vol: 70, pan: 15, rev: 20 },
      { id: 'bass', name: 'Bajo', voice: 'bass', vol: 75 },
      { id: 'gtrL', name: 'Guitarra izq.', voice: 'piano', vol: 60, pan: -45, rev: 20 },
      { id: 'gtrR', name: 'Guitarra der.', voice: 'lead', vol: 50, pan: 45, rev: 20 },
    ],
    patterns: {
      A: { lanes: { ...drums, crash: 'X... .... .... ....', ...E } },
      B: { lanes: { ...drums, bass: arp(['A1'], 16, 2, 100), gtrL: 'A3+E4+A4:0:2 A3+E4+A4:3:2 A3+E4+A4:6:2 A3+E4+A4:8:6', gtrR: 'A4:0:2 C5:3:2 D5:6:2 E5:8:4 D5:12:2 C5:14:2' } },
      C: { lanes: { ...drums, crash: 'X... .... X... ....', bass: [...arp(['D2'], 8, 2, 100), ...arp(['A1'], 16, 2, 100, 8)], gtrL: 'D4+A4+D5:0:8 A3+E4+A4:8:8', gtrR: 'F#5:0:4 E5:4:4 D5:8:4 C#5:12:4' } },
      D: { lanes: { ...E, kick: 'X... ..X. X... ....', snare: '.... X... .... ....', hat: 'x.x. x.x. .... ....', tom: '.... .... xxxx XXXX' } },
      E: { lanes: { kick: 'X... .... .... ....', crash: 'X... .... .... ....', bass: 'E2:0:16', gtrL: 'E4+B4+E5:0:16', gtrR: 'E5:0:16' } },
    },
    song: ['A', 'A', 'B', 'A', 'C', 'C', 'B', 'D', 'A', 'A', 'B', 'A', 'C', 'C', 'B', 'E'],
  });
}

// Un compás distinto en cada patrón: 4/4, 3/4, 2/4, 6/4 y cierre en 8/4
function mezclados() {
  return make({
    name: 'Compases mezclados', bpm: 108,
    tracks: [
      { id: 'kick', name: 'Bombo', voice: 'kick', vol: 80 },
      { id: 'snare', name: 'Caja', voice: 'snare', vol: 65, rev: 25 },
      { id: 'hat', name: 'Charles', voice: 'hat', vol: 40, pan: 20 },
      { id: 'bass', name: 'Bajo', voice: 'bass', vol: 70 },
      { id: 'pad', name: 'Pad', voice: 'pad', vol: 40, pan: -15, rev: 60 },
      { id: 'lead', name: 'Melodía', voice: 'lead', vol: 55, pan: 10, rev: 30 },
    ],
    patterns: {
      A: { beats: 4, lanes: { kick: 'X... .... X... ....', snare: '.... x... .... x...', hat: 'x.x. x.x. x.x. x.x.', bass: 'D2:0:4 D2:6:2 A1:8:4 C2:12:4', pad: 'D4+F4+A4:0:16:60', lead: 'A5:0:4 F5:4:4 D5:8:8' } },
      B: { beats: 3, lanes: { kick: 'X... .... ....', snare: '.... x... x...', hat: 'x.x. x.x. x.x.', bass: 'A#1:0:12', pad: 'A#3+D4+F4:0:12:60', lead: 'D5:0:4 F5:4:4 A#5:8:4' } },
      C: { beats: 2, lanes: { kick: 'X... X...', snare: '..x. ..xx', hat: 'xoxo xoxo', bass: 'C2:0:4 C2:4:4', pad: 'C4+E4+G4:0:8:60', lead: 'G5:0:4 E5:4:4' } },
      D: { beats: 6, lanes: { kick: 'X... .... .... X... .... ....', snare: '.... .... x... .... .... x...', hat: 'x.x. '.repeat(6), bass: 'G1:0:12 A1:12:12', pad: 'G3+A#3+D4:0:12:60 A3+C#4+E4:12:12:60', lead: 'D5:0:4 G5:4:4 A#5:8:4 A5:12:12' } },
      E: { beats: 8, lanes: { kick: 'X... .... X... .... X... .... .... ....', snare: '.... x... .... x... .... .... xxxx XXXX', hat: 'x.x. '.repeat(6) + '.... ....', bass: 'D2:0:16 D1:16:16', pad: 'D4+F4+A4:0:32:60', lead: 'D6:0:8 A5:8:8 F5:16:4 E5:20:4 D5:24:8' } },
    },
    song: ['A', 'B', 'C', 'D', 'A', 'B', 'C', 'D', 'E'],
  });
}

export const DEMOS = [
  { id: 'pop', title: 'Pop (ejemplo original)', desc: '4/4 · 4 patrones en cadena', make: demoSong },
  { id: 'vals', title: 'Vals de la plaza', desc: '3/4 · acompañamiento um-pa-pa', make: vals },
  { id: 'marcha', title: 'Marcha del desfile', desc: '2/4 · redoble, tuba y timbales', make: marcha },
  { id: 'hiphop', title: 'Boom bap con swing', desc: '4/4 · swing al 40 %', make: hiphop },
  { id: 'house', title: 'Noche de house', desc: '4/4 · 8 patrones: intro, break y subida', make: house },
  { id: 'octavas', title: 'Octavas en paralelo', desc: '10 pistas · bajo y melodía duplicados en otras octavas', make: octavas },
  { id: 'balada', title: 'Balada en seis', desc: '6/4 · arpegio de piano en 3 + 3', make: balada },
  { id: 'lofi', title: 'Frase larga (lo-fi)', desc: '8/4 · patrones de 32 pasos y swing suave', make: lofi },
  { id: 'dembow', title: 'Dembow', desc: '4/4 · ritmo de reggaetón y bajo 3 + 3 + 2', make: dembow },
  { id: 'rock', title: 'Rock de garaje', desc: '4/4 · guitarras en estéreo, toms y platillo', make: rock },
  { id: 'mezclados', title: 'Compases mezclados', desc: '4/4, 3/4, 2/4, 6/4 y 8/4 en una canción', make: mezclados },
];
