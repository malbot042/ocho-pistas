// Modelo de la canción, guardado en el navegador e importar/exportar JSON.

export const MAX_TRACKS = 16;
// Identificadores posibles; la canción sólo tiene algunos (al menos uno)
export const PATTERN_IDS = 'ABCDEFGHIJKLMNOP'.split('');
// Compases disponibles: negras por compás (cada negra son 4 pasos de semicorchea)
export const METERS = [2, 3, 4, 6, 8];
export const stepsOf = (pat) => pat.beats * 4;
export const patternIds = (song) => PATTERN_IDS.filter((id) => song.patterns[id]);
export const FORMAT = 'ocho-pistas';
export const FORMAT_VERSION = 1;

const STORAGE_KEY = 'ochopistas.song.v1';

export const VOICES = {
  kick:    { label: 'Bombo',           kind: 'drum' },
  snare:   { label: 'Caja',            kind: 'drum' },
  hat:     { label: 'Charles cerrado', kind: 'drum' },
  openhat: { label: 'Charles abierto', kind: 'drum' },
  clap:    { label: 'Palmas',          kind: 'drum' },
  tom:     { label: 'Tom',             kind: 'drum' },
  bass:    { label: 'Bajo sintetizado', kind: 'synth', lo: 24, defaultNote: 36 },
  piano:   { label: 'Piano eléctrico',  kind: 'synth', lo: 48, defaultNote: 60 },
  lead:    { label: 'Lead cuadrado',    kind: 'synth', lo: 60, defaultNote: 64 },
  pad:     { label: 'Pad cálido',       kind: 'synth', lo: 48, defaultNote: 60 },
};

export const PATTERN_COLORS = {
  A: '#8b7cff', B: '#38bdf8', C: '#f472b6', D: '#a3e635', E: '#fb923c', F: '#facc15', G: '#2dd4bf', H: '#c084fc',
  I: '#f87171', J: '#4ade80', K: '#60a5fa', L: '#e879f9', M: '#fbbf24', N: '#22d3ee', O: '#fb7185', P: '#94a3b8',
};

export const TRACK_COLORS = [
  '#fb923c', '#facc15', '#a3e635', '#2dd4bf', '#38bdf8', '#8b7cff', '#f472b6', '#c084fc',
  '#f87171', '#fbbf24', '#4ade80', '#22d3ee', '#818cf8', '#e879f9', '#fb7185', '#94a3b8',
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = (m) => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
export const isBlack = (m) => NOTE_NAMES[m % 12].includes('#');

export const isDrum = (track) => VOICES[track.voice]?.kind === 'drum';

const TRACK_DEFS = [
  { name: 'Bombo',   voice: 'kick',  color: '#fb923c', vol: 80, pan: 0,   rev: 5 },
  { name: 'Caja',    voice: 'snare', color: '#facc15', vol: 72, pan: 0,   rev: 20 },
  { name: 'Charles', voice: 'hat',   color: '#a3e635', vol: 55, pan: 15,  rev: 10 },
  { name: 'Palmas',  voice: 'clap',  color: '#2dd4bf', vol: 50, pan: -10, rev: 30 },
  { name: 'Bajo',    voice: 'bass',  color: '#38bdf8', vol: 76, pan: 0,   rev: 0,  oct: 1 },
  { name: 'Piano',   voice: 'piano', color: '#8b7cff', vol: 62, pan: -20, rev: 35, oct: 3 },
  { name: 'Melodía', voice: 'lead',  color: '#f472b6', vol: 58, pan: 10,  rev: 25, oct: 4 },
  { name: 'Pad',     voice: 'pad',   color: '#c084fc', vol: 45, pan: 25,  rev: 60, oct: 3 },
];

const clamp = (v, lo, hi, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

// Devuelve un carril con la forma que pide la pista y la longitud del patrón.
// Descarta lo que quede fuera y limita cada valor; sirve para importar, pegar y cambiar de compás.
export function fitLane(track, lane, steps) {
  if (isDrum(track)) {
    const h = Array.isArray(lane?.hits) ? lane.hits : [];
    return { hits: Array.from({ length: steps }, (_, s) => Math.round(clamp(h[s], 0, 127, 0))) };
  }
  const notes = Array.isArray(lane?.notes) ? lane.notes : [];
  return {
    notes: notes.filter((n) => Number(n?.s) < steps).slice(0, 256).map((n) => {
      const s = Math.round(clamp(n?.s, 0, steps - 1, 0));
      return {
        m: Math.round(clamp(n?.m, 0, 127, 60)),
        s,
        l: Math.round(clamp(n?.l, 1, steps - s, 1)),
        v: Math.round(clamp(n?.v, 1, 127, 100)),
      };
    }),
  };
}

export function emptyPattern(tracks, beats = 4) {
  return { beats, lanes: tracks.map((t) => fitLane(t, null, beats * 4)) };
}

export function newSong(name = 'Canción nueva') {
  const tracks = TRACK_DEFS.map((d) => ({ ...d, mute: false, solo: false, oct: d.oct ?? 3, trans: 0 }));
  const patterns = {};
  PATTERN_IDS.slice(0, 4).forEach((id) => { patterns[id] = emptyPattern(tracks); });
  return {
    format: FORMAT, version: FORMAT_VERSION,
    name, bpm: 120, swing: 10, masterVol: 85,
    tracks, patterns,
    song: ['A'],
  };
}

const hits = (list, vel = 100) => {
  const a = new Array(16).fill(0);
  list.forEach((s) => { a[s] = vel; });
  return a;
};

export function demoSong() {
  const s = newSong('Canción de ejemplo');
  const n = (m, st, l, v = 100) => ({ m, s: st, l, v });
  const A = s.patterns.A.lanes;
  A[0].hits = hits([0, 4, 8, 10, 12], 115);
  A[1].hits = hits([4, 12], 100);
  A[2].hits = hits([0, 2, 4, 6, 8, 10, 12, 14], 70);
  A[3].hits = hits([12, 14], 80);
  A[4].notes = [n(36, 0, 2, 110), n(36, 3, 2, 90), n(31, 6, 2, 100), n(29, 8, 2, 110), n(29, 11, 2, 90), n(31, 14, 2, 100)];
  A[5].notes = [n(60, 0, 4, 80), n(64, 0, 4, 80), n(67, 0, 4, 80), n(57, 8, 4, 80), n(60, 8, 4, 80), n(65, 8, 4, 80)];
  A[7].notes = [n(48, 0, 8, 70), n(55, 0, 8, 70), n(53, 8, 8, 70), n(57, 8, 8, 70)];

  // B = A + melodía
  s.patterns.B = JSON.parse(JSON.stringify(s.patterns.A));
  s.patterns.B.lanes[6].notes = [n(64, 0, 2, 100), n(67, 2, 2, 90), n(69, 4, 3, 110), n(67, 7, 1, 80), n(64, 8, 2, 100), n(62, 10, 2, 90), n(60, 12, 2, 105), n(62, 14, 2, 85)];
  s.patterns.B.lanes[5].notes = [n(60, 0, 4, 80), n(64, 0, 4, 80), n(67, 0, 4, 80), n(57, 4, 4, 80), n(60, 4, 4, 80), n(64, 4, 4, 80), n(53, 8, 4, 80), n(57, 8, 4, 80), n(60, 8, 4, 80), n(55, 12, 4, 85), n(59, 12, 4, 85), n(62, 12, 4, 85)];

  // C = puente: menos batería, pad abierto
  const C = s.patterns.C.lanes;
  C[0].hits = hits([0, 8], 110);
  C[2].hits = hits([2, 6, 10, 14], 60);
  C[4].notes = [n(33, 0, 4, 100), n(33, 6, 2, 80), n(29, 8, 4, 100), n(31, 12, 4, 100)];
  C[7].notes = [n(57, 0, 8, 75), n(60, 0, 8, 75), n(64, 0, 8, 75), n(53, 8, 8, 75), n(57, 8, 8, 75), n(60, 8, 8, 75)];
  C[6].notes = [n(72, 0, 4, 90), n(71, 4, 2, 80), n(69, 6, 2, 80), n(67, 8, 8, 90)];

  // D = redoble final
  const D = s.patterns.D.lanes;
  D[0].hits = hits([0, 4, 8, 12, 14], 115);
  D[1].hits = hits([8, 10, 11, 12, 13, 14, 15], 95);
  D[2].hits = hits([0, 2, 4, 6], 70);
  D[3].hits = hits([15], 100);
  D[4].notes = [n(31, 0, 4, 110), n(31, 4, 4, 100), n(31, 8, 2, 110), n(35, 12, 4, 110)];
  D[5].notes = [n(55, 0, 8, 85), n(59, 0, 8, 85), n(62, 0, 8, 85), n(65, 0, 8, 85)];

  s.song = ['A', 'A', 'B', 'B', 'C', 'B', 'D', 'A'];
  return s;
}

// ===== Validación (para JSON importados) =====
const cleanColor = (c, d) => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : d);

export function normalizeSong(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('El archivo no contiene una canción.');
  if (raw.format && raw.format !== FORMAT) throw new Error('El archivo no es una canción de Ocho Pistas.');
  if (!Array.isArray(raw.tracks) || raw.tracks.length < 1 || raw.tracks.length > MAX_TRACKS) {
    throw new Error(`La canción debe tener entre 1 y ${MAX_TRACKS} pistas.`);
  }
  const base = newSong();
  const tracks = raw.tracks.map((t, i) => {
    const d = base.tracks[i] ?? { ...base.tracks[i % 8], color: TRACK_COLORS[i] };
    const voice = VOICES[t?.voice] ? t.voice : d.voice;
    return {
      name: String(t?.name ?? d.name).slice(0, 30) || d.name,
      voice,
      color: cleanColor(t?.color, d.color),
      vol: clamp(t?.vol, 0, 100, d.vol),
      pan: clamp(t?.pan, -50, 50, d.pan),
      rev: clamp(t?.rev, 0, 100, d.rev),
      oct: Math.round(clamp(t?.oct, 0, 7, d.oct)),
      trans: Math.round(clamp(t?.trans, -3, 3, 0)),
      mute: !!t?.mute,
      solo: !!t?.solo,
    };
  });
  const patterns = {};
  PATTERN_IDS.forEach((pid) => {
    const p = raw.patterns?.[pid];
    if (!p || typeof p !== 'object') return;
    const beats = METERS.includes(p.beats) ? p.beats : 4;
    const lanes = Array.isArray(p.lanes) ? p.lanes : [];
    patterns[pid] = { beats, lanes: tracks.map((t, i) => fitLane(t, lanes[i], beats * 4)) };
  });
  if (!Object.keys(patterns).length) patterns.A = emptyPattern(tracks);
  const song = Array.isArray(raw.song) ? raw.song.filter((p) => patterns[p]).slice(0, 64) : [];
  return {
    format: FORMAT, version: FORMAT_VERSION,
    name: String(raw.name ?? 'Canción').slice(0, 60) || 'Canción',
    bpm: Math.round(clamp(raw.bpm, 40, 240, 120)),
    swing: Math.round(clamp(raw.swing, 0, 60, 0)),
    masterVol: clamp(raw.masterVol, 0, 100, 85),
    tracks, patterns,
    song: song.length ? song : [Object.keys(patterns)[0]],
  };
}

// ===== Navegador =====
export function loadLocal() {
  try {
    const txt = localStorage.getItem(STORAGE_KEY);
    if (!txt) return null;
    return normalizeSong(JSON.parse(txt));
  } catch (e) {
    console.warn('No se pudo leer la canción guardada:', e);
    return null;
  }
}

export function saveLocal(song) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(song));
    return true;
  } catch (e) {
    console.warn('No se pudo guardar:', e);
    return false;
  }
}

export function downloadSong(song) {
  const blob = new Blob([JSON.stringify(song, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safe = (song.name || 'cancion').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cancion';
  a.href = url;
  a.download = `${safe}.ochopistas.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readSongFile(file) {
  if (file.size > 2_000_000) throw new Error('El archivo es demasiado grande.');
  const text = await file.text();
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('El archivo no es un JSON válido.'); }
  return normalizeSong(raw);
}
