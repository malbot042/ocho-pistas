import {
  STEPS, PATTERN_IDS, PATTERN_COLORS, VOICES, isDrum, isBlack, noteName,
  newSong, demoSong, loadLocal, saveLocal, downloadSong, readSongFile,
} from './store.js';
import { Engine } from './audio.js';

// ===== Estado =====
let song = loadLocal() || demoSong();
const ui = {
  view: 'seq',
  pattern: 'A',
  sel: 4,
  mode: 'pattern',
  noteLen: 2,
  playStep: -1,
  playPid: null,
  playChain: -1,
  clipboard: null,
};
const lastNote = {};
const engine = new Engine();

const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lane = (t, pid = ui.pattern) => song.patterns[pid].lanes[t];
const baseNote = (tr) => (tr.oct + 1) * 12;
const dbText = (v) => (v <= 0 ? '−∞ dB' : `${(40 * Math.log10(v / 100)).toFixed(1).replace('.', ',').replace('-', '−')} dB`);

// ===== Guardado =====
let saveTimer = null;
function changed({ render = true, mix = false } = {}) {
  if (mix) engine.applyMix(song);
  if (render) renderView();
  $('#saveStatus').textContent = 'Guardando…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    $('#saveStatus').textContent = saveLocal(song) ? 'Guardado en este navegador' : 'No se pudo guardar en el navegador';
  }, 350);
}

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function loadSong(s, msg) {
  if (engine.playing) stopPlay();
  song = s;
  ui.pattern = 'A';
  ui.sel = 4;
  renderAll();
  engine.applyMix(song);
  changed({ render: false });
  if (msg) toast(msg);
}

// ===== Cabecera =====
function renderHeader() {
  $('#songName').value = song.name;
  $('#bpm').value = song.bpm;
  $('#swing').value = song.swing;
  document.querySelectorAll('.tab').forEach((b) => {
    if (b.dataset.view === ui.view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  $('#modePattern').setAttribute('aria-pressed', String(ui.mode === 'pattern'));
  $('#modeSong').setAttribute('aria-pressed', String(ui.mode === 'song'));
  const dark = document.documentElement.dataset.theme === 'dark';
  $('#btnTheme').setAttribute('aria-label', dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
}

function renderAll() { renderHeader(); renderView(); }

function renderView() {
  if (ui.view === 'seq') app.innerHTML = viewSeq();
  else if (ui.view === 'notes') app.innerHTML = viewNotes();
  else app.innerHTML = viewMix();
  markPlayhead();
}

// ===== Vista: secuenciador =====
function patternPills() {
  return PATTERN_IDS.map((id) => `<button class="pill" data-act="pattern" data-id="${id}" aria-pressed="${ui.pattern === id}"><span class="dot" style="background:${PATTERN_COLORS[id]}"></span>${id}</button>`).join('');
}

function stepHeads() {
  let h = '';
  for (let s = 0; s < STEPS; s++) h += `<div class="step-head mono ${s % 4 === 0 ? 'beat' : ''}" data-col="${s}">${s + 1}</div>`;
  return h;
}

function viewSeq() {
  const anySolo = song.tracks.some((t) => t.solo);
  const rows = song.tracks.map((tr, t) => {
    const off = tr.mute || (anySolo && !tr.solo);
    const ln = lane(t);
    let cells = '';
    for (let s = 0; s < STEPS; s++) {
      const alt = Math.floor(s / 4) % 2 === 1 ? ' alt' : '';
      if (isDrum(tr)) {
        const v = ln.hits[s];
        const style = v ? ` style="background:${tr.color};opacity:${0.45 + 0.55 * v / 127}"` : '';
        cells += `<button class="step${alt}${v ? ' on' : ''}" data-act="step" data-t="${t}" data-s="${s}" data-col="${s}"${style} aria-label="${esc(tr.name)} paso ${s + 1}${v ? ' activo' : ''}"></button>`;
      } else {
        const starts = ln.notes.filter((n) => n.s === s);
        const covered = !starts.length && ln.notes.some((n) => s > n.s && s < n.s + n.l);
        const low = starts.length ? Math.min(...starts.map((n) => n.m)) : 0;
        const label = starts.length > 1 ? `${noteName(low)}+${starts.length - 1}` : starts.length ? noteName(low) : '';
        const style = starts.length ? ` style="background:${tr.color}"` : covered ? ` style="background:${tr.color};opacity:.45"` : '';
        cells += `<button class="step${alt}${starts.length || covered ? ' on' : ''}" data-act="step" data-t="${t}" data-s="${s}" data-col="${s}"${style} aria-label="${esc(tr.name)} paso ${s + 1}${label ? ' ' + label : ''}">${label}</button>`;
      }
    }
    return `<div class="grow${off ? ' row-off' : ''}">
      <div class="thead${ui.sel === t ? ' selected' : ''}">
        <button class="tselect" data-act="select" data-t="${t}">
          <span class="tcolor" style="background:${tr.color}"></span>
          <span style="min-width:0"><span class="tname">${esc(tr.name)}</span><span class="tinst">${VOICES[tr.voice].label}</span></span>
        </button>
        <button class="ms m" data-act="mute" data-t="${t}" aria-pressed="${tr.mute}" aria-label="Silenciar ${esc(tr.name)}">M</button>
        <button class="ms s" data-act="solo" data-t="${t}" aria-pressed="${tr.solo}" aria-label="Solo ${esc(tr.name)}">S</button>
      </div>
      <div class="steps">${cells}</div>
    </div>`;
  }).join('');

  const chain = song.song.map((pid, i) => `<div class="chain-item">
      <button class="chain-chip" data-act="chainPick" data-i="${i}" data-chain="${i}" style="background:${PATTERN_COLORS[pid]}" aria-label="Posición ${i + 1}: patrón ${pid}">${pid}</button>
      <span class="chain-bar mono">${i + 1}</span></div>`).join('');

  return `<section class="main-col">
    <div class="toolbar">
      <h1>Patrón ${ui.pattern}</h1>
      ${patternPills()}
      <div class="spacer"></div>
      <button class="pill" data-act="copy">Copiar</button>
      <button class="pill" data-act="paste" ${ui.clipboard ? '' : 'disabled'}>Pegar</button>
      <button class="pill" data-act="clearPattern">Limpiar</button>
    </div>
    <div class="card grid scroll-x"><div class="grid-inner">
      <div class="grow"><div class="small muted" style="font-weight:600">PISTAS</div><div class="steps">${stepHeads()}</div></div>
      ${rows}
    </div></div>
    <div class="card chain">
      <span style="font-weight:600">Canción</span>
      <span class="small muted" style="margin-right:6px">orden de patrones · ${song.song.length} × 1 compás</span>
      ${chain}
      <span class="spacer"></span>
      <span class="small muted">Añadir</span>
      ${PATTERN_IDS.map((id) => `<button class="pill" data-act="chainAdd" data-id="${id}" aria-label="Añadir patrón ${id}">${id}</button>`).join('')}
      <button class="pill" data-act="chainPop" ${song.song.length > 1 ? '' : 'disabled'} aria-label="Quitar el último">−</button>
    </div>
  </section>
  ${inspector()}`;
}

function inspector() {
  const t = ui.sel, tr = song.tracks[t];
  const drum = isDrum(tr);
  const opts = Object.entries(VOICES).filter(([, v]) => (v.kind === 'drum') === drum)
    .map(([k, v]) => `<option value="${k}" ${k === tr.voice ? 'selected' : ''}>${v.label}</option>`).join('');
  const ln = lane(t);
  const count = drum ? ln.hits.filter(Boolean).length : ln.notes.length;
  return `<aside class="card side">
    <div class="track-title"><span class="bar" style="background:${tr.color}"></span>
      <div><div class="small muted">Pista ${t + 1}</div><div class="big">${esc(tr.name)}</div></div></div>
    <label class="field">Nombre<input type="text" maxlength="30" value="${esc(tr.name)}" data-act="trackName" data-t="${t}"></label>
    <label class="field">Instrumento<select data-act="voice" data-t="${t}">${opts}</select></label>
    <label class="field">Volumen<input type="range" min="0" max="100" value="${tr.vol}" data-act="vol" data-t="${t}"></label>
    <label class="field">Panorama<input type="range" min="-50" max="50" value="${tr.pan}" data-act="pan" data-t="${t}"></label>
    <label class="field">Reverb<input type="range" min="0" max="100" value="${tr.rev}" data-act="rev" data-t="${t}"></label>
    <div class="divider">
      <div class="kv"><span class="muted">${drum ? 'Golpes' : 'Notas'} en el patrón ${ui.pattern}</span><b class="mono">${count}</b></div>
    </div>
    ${drum
      ? '<p class="small muted" style="margin:0">Pista de percusión: cada paso es un golpe. Clic con Mayús para alternar entre golpe suave y fuerte.</p>'
      : `<button class="btn-accent" data-act="goNotes">Editar notas de ${esc(tr.name)}</button>`}
    <button class="pill" data-act="clearTrack">Vaciar esta pista en el patrón</button>
  </aside>`;
}

// ===== Vista: notas =====
function viewNotes() {
  if (isDrum(song.tracks[ui.sel])) ui.sel = song.tracks.findIndex((tr) => !isDrum(tr));
  if (ui.sel < 0) {
    return '<section class="main-col"><div class="card empty-state">No hay pistas melódicas. Cambia el instrumento de alguna pista en el Secuenciador.</div></section>';
  }
  const t = ui.sel, tr = song.tracks[t], ln = lane(t), base = baseNote(tr);
  const tabs = song.tracks.map((x, i) => (isDrum(x) ? '' : `<button class="pill" data-act="select" data-t="${i}" aria-pressed="${i === t}"><span class="dot" style="background:${x.color}"></span>${esc(x.name)}</button>`)).join('');
  let rows = '';
  for (let m = base + 23; m >= base; m--) {
    const black = isBlack(m);
    let cells = '';
    for (let s = 0; s < STEPS; s++) {
      const hit = ln.notes.find((n) => n.m === m && s >= n.s && s < n.s + n.l);
      const start = hit && hit.s === s;
      const cls = black ? ' black' : (Math.floor(s / 4) % 2 ? ' alt' : '');
      const style = hit ? ` style="background:${tr.color}"` : '';
      cells += `<button class="cell${cls}${hit && !start ? ' cont' : ''}" data-act="cell" data-m="${m}" data-s="${s}" data-col="${s}"${style} aria-label="${noteName(m)} paso ${s + 1}${hit ? ' con nota' : ''}">${start ? noteName(m) : ''}</button>`;
    }
    rows += `<div class="rrow"><button class="key${black ? ' black' : ''}" data-act="key" data-m="${m}" aria-label="Escuchar ${noteName(m)}">${noteName(m)}</button><div class="rsteps">${cells}</div></div>`;
  }
  let vel = '';
  for (let s = 0; s < STEPS; s++) {
    const v = Math.max(0, ...ln.notes.filter((n) => n.s === s).map((n) => n.v));
    vel += `<button class="vel-bar" data-act="vel" data-s="${s}" ${v ? '' : 'disabled'} style="height:${v ? Math.round(v / 127 * 100) : 5}%;${v ? `background:${tr.color}` : ''}" aria-label="Intensidad paso ${s + 1}: ${v || 'sin nota'}"></button>`;
  }
  const lens = [1, 2, 4, 8].map((l) => `<button class="pill" data-act="len" data-l="${l}" aria-pressed="${ui.noteLen === l}">${l}</button>`).join('');
  return `<section class="main-col">
    <div class="toolbar">
      <h1>Notas · Patrón ${ui.pattern}</h1>
      ${tabs}
    </div>
    <div class="toolbar">
      <span class="small muted">Patrón</span>${patternPills()}
      <span class="spacer"></span>
      <span class="small muted">Octava</span>
      <button class="pill" data-act="oct" data-d="-1" aria-label="Bajar octava">−</button>
      <span class="mono" style="min-width:52px;text-align:center">${noteName(base)}</span>
      <button class="pill" data-act="oct" data-d="1" aria-label="Subir octava">+</button>
    </div>
    <div class="card roll scroll-x"><div class="roll-inner">
      <div class="rrow"><div></div><div class="rsteps">${stepHeads()}</div></div>
      ${rows}
    </div></div>
    <div class="card vel scroll-x"><div class="vel-inner">
      <div class="small muted" style="text-align:right;font-weight:600;padding-right:8px">FUERZA</div>
      <div class="vel-bars">${vel}</div>
    </div></div>
  </section>
  <aside class="card side">
    <div class="track-title"><span class="bar" style="background:${tr.color}"></span>
      <div><div class="small muted">Pista ${t + 1} · ${VOICES[tr.voice].label}</div><div class="big">${esc(tr.name)}</div></div></div>
    <div class="field">Duración de las notas nuevas (pasos)<div class="toolbar">${lens}</div></div>
    <div class="divider">
      <div class="kv"><span class="muted">Notas en el patrón ${ui.pattern}</span><b class="mono">${ln.notes.length}</b></div>
    </div>
    <p class="small muted" style="margin:0;line-height:1.55">Clic en una celda vacía para poner una nota; clic en una nota para quitarla. Pulsa el nombre de la nota a la izquierda para escucharla. Clic en una barra de fuerza para cambiar su intensidad.</p>
    <button class="pill" data-act="clearTrack">Vaciar notas de esta pista</button>
  </aside>`;
}

// ===== Vista: mezclador =====
function viewMix() {
  const strips = song.tracks.map((tr, t) => `<div class="card strip">
      <div class="strip-color" style="background:${tr.color}"></div>
      <div class="strip-name"><b>${esc(tr.name)}</b><span>${VOICES[tr.voice].label}</span></div>
      <div class="knob-row"><div class="lbl"><span>I</span><span>PAN</span><span>D</span></div>
        <input type="range" min="-50" max="50" value="${tr.pan}" data-act="pan" data-t="${t}" aria-label="Panorama ${esc(tr.name)}"></div>
      <div class="knob-row"><div class="lbl"><span>REVERB</span><span class="mono" data-revtext="${t}">${tr.rev}%</span></div>
        <input type="range" min="0" max="100" value="${tr.rev}" data-act="rev" data-t="${t}" aria-label="Reverb ${esc(tr.name)}"></div>
      <div class="fader-area">
        <div class="meter" aria-hidden="true"><div class="meter-track"><div class="meter-fill" data-meter="${t}"></div></div></div>
        <input class="vfader" type="range" min="0" max="100" value="${tr.vol}" data-act="vol" data-t="${t}" aria-label="Volumen ${esc(tr.name)}">
      </div>
      <div class="db mono" data-dbtext="${t}">${dbText(tr.vol)}</div>
      <div style="display:flex;gap:6px">
        <button class="ms m" data-act="mute" data-t="${t}" aria-pressed="${tr.mute}" aria-label="Silenciar ${esc(tr.name)}">M</button>
        <button class="ms s" data-act="solo" data-t="${t}" aria-pressed="${tr.solo}" aria-label="Solo ${esc(tr.name)}">S</button>
      </div>
    </div>`).join('');
  const master = `<div class="card strip master">
      <div class="strip-color" style="background:var(--text)"></div>
      <div class="strip-name"><b>Máster</b><span>Salida</span></div>
      <div class="knob-row" style="height:78px"></div>
      <div class="fader-area">
        <div class="meter" aria-hidden="true"><div class="meter-track"><div class="meter-fill" data-meter="-1"></div></div></div>
        <input class="vfader" type="range" min="0" max="100" value="${song.masterVol}" data-act="master" aria-label="Volumen máster">
      </div>
      <div class="db mono" data-dbtext="-1">${dbText(song.masterVol)}</div>
      <div style="height:28px"></div>
    </div>`;
  return `<section class="main-col">
    <div class="toolbar"><h1>Mezcla</h1><span class="small muted">Limitador activo en la salida para evitar saturar</span></div>
    <div class="scroll-x"><div class="strips">${strips}${master}</div></div>
  </section>`;
}

// ===== Cursor de reproducción =====
let nowEls = [];
function markPlayhead() {
  nowEls.forEach((el) => el.classList.remove('now'));
  nowEls = [];
  if (ui.playStep < 0) { $('#position').textContent = '01.1'; return; }
  if (ui.playPid === ui.pattern || ui.view === 'mix') {
    nowEls = [...app.querySelectorAll(`[data-col="${ui.playStep}"]`)];
  }
  const chip = app.querySelector(`[data-chain="${ui.playChain}"]`);
  if (ui.mode === 'song' && chip) nowEls.push(chip);
  nowEls.forEach((el) => el.classList.add('now'));
  const bar = ui.mode === 'song' ? ui.playChain + 1 : 1;
  $('#position').textContent = `${String(bar).padStart(2, '0')}.${Math.floor(ui.playStep / 4) + 1}`;
}

engine.onStep = (step, pid, chainIndex) => {
  ui.playStep = step;
  ui.playChain = chainIndex;
  const switched = pid && pid !== ui.playPid;
  ui.playPid = pid;
  // En modo canción la vista sigue al patrón que suena
  if (switched && ui.mode === 'song' && pid !== ui.pattern && ui.view !== 'mix') {
    ui.pattern = pid;
    renderView();
  } else {
    markPlayhead();
  }
};

// Medidores del mezclador
function meterLoop() {
  if (ui.view === 'mix' && engine.ctx) {
    app.querySelectorAll('[data-meter]').forEach((el) => {
      const lv = engine.level(Number(el.dataset.meter));
      el.style.height = `${Math.round(lv * 100)}%`;
      el.style.background = lv > 0.92 ? '#f87171' : lv > 0.75 ? '#facc15' : '#4ade80';
    });
  }
  requestAnimationFrame(meterLoop);
}
requestAnimationFrame(meterLoop);

// ===== Transporte =====
function startPlay() {
  engine.start(() => song, () => ui.mode, () => ui.pattern);
  document.body.classList.add('playing');
  $('#btnPlay').setAttribute('aria-label', 'Parar (barra espaciadora)');
}
function stopPlay() {
  engine.stop();
  document.body.classList.remove('playing');
  $('#btnPlay').setAttribute('aria-label', 'Reproducir (barra espaciadora)');
  ui.playStep = -1; ui.playPid = null; ui.playChain = -1;
  markPlayhead();
}

// ===== Acciones =====
function toggleStep(t, s, shift) {
  const tr = song.tracks[t], ln = lane(t);
  ui.sel = t;
  if (isDrum(tr)) {
    if (shift && ln.hits[s]) ln.hits[s] = ln.hits[s] > 90 ? 60 : 120;
    else ln.hits[s] = ln.hits[s] ? 0 : 100;
    if (ln.hits[s]) engine.preview(song, t, 60);
  } else {
    const covering = ln.notes.filter((n) => s >= n.s && s < n.s + n.l);
    if (covering.length) {
      ln.notes = ln.notes.filter((n) => !covering.includes(n));
    } else {
      const m = lastNote[t] ?? baseNote(tr) + 12;
      ln.notes.push({ m, s, l: Math.min(ui.noteLen, STEPS - s), v: 100 });
      engine.preview(song, t, m);
    }
  }
  changed();
}

function toggleCell(m, s) {
  const t = ui.sel, ln = lane(t);
  const hit = ln.notes.find((n) => n.m === m && s >= n.s && s < n.s + n.l);
  if (hit) {
    ln.notes = ln.notes.filter((n) => n !== hit);
  } else {
    ln.notes.push({ m, s, l: Math.min(ui.noteLen, STEPS - s), v: 100 });
    lastNote[t] = m;
    engine.preview(song, t, m);
  }
  changed();
}

function handleClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const act = el.dataset.act;
  const t = Number(el.dataset.t);
  switch (act) {
    case 'pattern': ui.pattern = el.dataset.id; renderView(); break;
    case 'select': ui.sel = t; renderView(); break;
    case 'step': toggleStep(t, Number(el.dataset.s), e.shiftKey); break;
    case 'mute': song.tracks[t].mute = !song.tracks[t].mute; changed({ mix: true }); break;
    case 'solo': song.tracks[t].solo = !song.tracks[t].solo; changed({ mix: true }); break;
    case 'goNotes': setView('notes'); break;
    case 'clearTrack': {
      const ln = lane(ui.sel);
      if (ln.hits) ln.hits.fill(0); else ln.notes = [];
      changed(); break;
    }
    case 'clearPattern':
      if (!confirm(`¿Vaciar todas las pistas del patrón ${ui.pattern}?`)) break;
      song.patterns[ui.pattern].lanes.forEach((l) => { if (l.hits) l.hits.fill(0); else l.notes = []; });
      changed(); break;
    case 'copy':
      ui.clipboard = JSON.parse(JSON.stringify(song.patterns[ui.pattern]));
      toast(`Patrón ${ui.pattern} copiado`); renderView(); break;
    case 'paste':
      if (!ui.clipboard) break;
      song.patterns[ui.pattern] = JSON.parse(JSON.stringify(ui.clipboard));
      // Ajusta los carriles si algún instrumento cambió de tipo
      song.patterns[ui.pattern].lanes = song.patterns[ui.pattern].lanes.map((l, i) => (
        isDrum(song.tracks[i]) ? (l.hits ? l : { hits: new Array(STEPS).fill(0) }) : (l.notes ? l : { notes: [] })));
      toast(`Pegado en el patrón ${ui.pattern}`); changed(); break;
    case 'chainAdd': if (song.song.length < 64) { song.song.push(el.dataset.id); changed(); } break;
    case 'chainPop': if (song.song.length > 1) { song.song.pop(); changed(); } break;
    case 'chainPick': ui.pattern = song.song[Number(el.dataset.i)]; renderView(); break;
    case 'cell': toggleCell(Number(el.dataset.m), Number(el.dataset.s)); break;
    case 'key': engine.preview(song, ui.sel, Number(el.dataset.m)); break;
    case 'len': ui.noteLen = Number(el.dataset.l); renderView(); break;
    case 'oct': {
      const tr = song.tracks[ui.sel];
      tr.oct = Math.max(0, Math.min(7, tr.oct + Number(el.dataset.d)));
      changed(); break;
    }
    case 'vel': {
      const s = Number(el.dataset.s);
      const ns = lane(ui.sel).notes.filter((n) => n.s === s);
      if (!ns.length) break;
      const cyc = [127, 100, 70, 40];
      const next = cyc[(cyc.findIndex((v) => v <= ns[0].v) + 1) % cyc.length];
      ns.forEach((n) => { n.v = next; });
      changed(); break;
    }
    default: break;
  }
}

function handleInput(e) {
  const el = e.target;
  const act = el.dataset?.act;
  if (!act) return;
  const t = Number(el.dataset.t);
  const v = Number(el.value);
  if (act === 'vol' || act === 'pan' || act === 'rev') {
    song.tracks[t][act] = v;
    if (act === 'vol') { const d = app.querySelector(`[data-dbtext="${t}"]`); if (d) d.textContent = dbText(v); }
    if (act === 'rev') { const d = app.querySelector(`[data-revtext="${t}"]`); if (d) d.textContent = `${v}%`; }
    changed({ render: false, mix: true });
  } else if (act === 'master') {
    song.masterVol = v;
    const d = app.querySelector('[data-dbtext="-1"]'); if (d) d.textContent = dbText(v);
    changed({ render: false, mix: true });
  } else if (act === 'trackName') {
    song.tracks[t].name = el.value.slice(0, 30);
    changed({ render: false });
  }
}

function handleChange(e) {
  const el = e.target;
  const act = el.dataset?.act;
  if (act === 'voice') {
    const t = Number(el.dataset.t);
    song.tracks[t].voice = el.value;
    changed();
    engine.preview(song, t, isDrum(song.tracks[t]) ? 60 : baseNote(song.tracks[t]) + 12);
  } else if (act === 'trackName') {
    if (!song.tracks[Number(el.dataset.t)].name.trim()) song.tracks[Number(el.dataset.t)].name = `Pista ${Number(el.dataset.t) + 1}`;
    changed();
  }
}

function setView(v) {
  ui.view = v;
  renderAll();
  window.scrollTo({ top: 0 });
}

// ===== Eventos globales =====
app.addEventListener('click', handleClick);
app.addEventListener('input', handleInput);
app.addEventListener('change', handleChange);

document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
$('#btnPlay').addEventListener('click', () => (engine.playing ? stopPlay() : startPlay()));
$('#btnRewind').addEventListener('click', () => { if (engine.playing) { stopPlay(); startPlay(); } });
$('#modePattern').addEventListener('click', () => { ui.mode = 'pattern'; renderHeader(); markPlayhead(); });
$('#modeSong').addEventListener('click', () => { ui.mode = 'song'; renderHeader(); markPlayhead(); });

$('#songName').addEventListener('input', (e) => { song.name = e.target.value.slice(0, 60); changed({ render: false }); });
$('#songName').addEventListener('change', (e) => { if (!e.target.value.trim()) { song.name = 'Canción'; renderHeader(); changed({ render: false }); } });
$('#bpm').addEventListener('change', (e) => {
  song.bpm = Math.max(40, Math.min(240, Math.round(Number(e.target.value) || 120)));
  e.target.value = song.bpm; changed({ render: false });
});
$('#swing').addEventListener('change', (e) => {
  song.swing = Math.max(0, Math.min(60, Math.round(Number(e.target.value) || 0)));
  e.target.value = song.swing; changed({ render: false });
});

$('#btnTheme').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('ochopistas.theme', next); } catch (err) { /* sin almacenamiento */ }
  renderHeader();
});

// Menú Archivo
const menu = $('#fileMenu');
const btnMenu = $('#btnMenu');
function closeMenu() { menu.hidden = true; btnMenu.setAttribute('aria-expanded', 'false'); }
btnMenu.addEventListener('click', (e) => {
  e.stopPropagation();
  menu.hidden = !menu.hidden;
  btnMenu.setAttribute('aria-expanded', String(!menu.hidden));
  if (!menu.hidden) menu.querySelector('button').focus();
});
document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); });
menu.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  closeMenu();
  const a = b.dataset.action;
  if (a === 'new') {
    if (confirm('¿Empezar una canción nueva? La actual se perderá si no la has descargado.')) loadSong(newSong(), 'Canción nueva creada');
  } else if (a === 'demo') {
    if (confirm('¿Cargar la canción de ejemplo? La actual se perderá si no la has descargado.')) loadSong(demoSong(), 'Canción de ejemplo cargada');
  } else if (a === 'export') {
    downloadSong(song); toast('Canción descargada como .json');
  } else if (a === 'import') {
    $('#fileInput').click();
  }
});

async function importFile(file) {
  try {
    const s = await readSongFile(file);
    loadSong(s, `Abierta: ${s.name}`);
  } catch (err) {
    toast(err.message || 'No se pudo abrir el archivo');
  }
}
$('#fileInput').addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (f) importFile(f);
  e.target.value = '';
});

// Arrastrar y soltar un .json
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types?.includes('Files')) { dragDepth++; $('#dropHint').hidden = false; } });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#dropHint').hidden = true; });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault(); dragDepth = 0; $('#dropHint').hidden = true;
  const f = e.dataTransfer?.files?.[0];
  if (f) importFile(f);
});

// Teclado: espacio = reproducir/parar; Escape cierra el menú
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !menu.hidden) { closeMenu(); btnMenu.focus(); return; }
  const tag = (e.target.tagName || '').toLowerCase();
  if (e.code === 'Space' && !['input', 'select', 'textarea', 'button'].includes(tag)) {
    e.preventDefault();
    if (engine.playing) stopPlay(); else startPlay();
  }
});

renderAll();
saveLocal(song);
