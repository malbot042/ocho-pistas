# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Ocho Pistas is a step music sequencer (8 tracks by default, up to 16) that runs entirely in the browser. It is plain HTML/CSS/vanilla JS (ES modules) with **no dependencies, no build step, no package.json, no linter and no test suite**. It is deployed as a static site on GitHub Pages (`.nojekyll` at the root) at https://malbot042.github.io/ocho-pistas/.

All UI text, code comments, commit messages and the README are in **Spanish**; keep new strings and comments in Spanish.

## Running

ES modules don't load from `file://`, so serve the directory:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

There are no automated tests; verify changes by using the app in a browser (sound only starts after a user gesture, because the `AudioContext` is created lazily).

## Architecture

Four modules, loaded from `index.html` via `<script type="module" src="js/main.js">`:

- **`js/store.js`** — song data model, defaults (`newSong`, `demoSong`), validation (`normalizeSong`), localStorage persistence and JSON import/export. No DOM rendering.
- **`js/demos.js`** — `DEMOS` list shown under *Archivo → Canciones de ejemplo*. Songs are written in a compact notation (drums `"X... x.o."`, notes `"C4+E4+G4:start:len[:vel]"`, `arp()` for repeated figures) and built by `make()`, which assigns colors, picks the visible octave from the lowest sounding note and passes everything through `normalizeSong`. `make()` `console.warn`s if a drum string or note doesn't fit the pattern's meter.
- **`js/audio.js`** — `Engine` class: Web Audio graph, synthesized instruments, and the playback scheduler. Reads the song but never mutates it.
- **`js/main.js`** — owns all mutable state, renders the views, handles events and transport.

### Song model

- **1–`MAX_TRACKS` (16) tracks** (8 in `newSong`); tracks can be duplicated/deleted, which splices the matching lane in every pattern. The engine pre-creates 16 channels and indexes them by track position, so any reorder must call `changed({ mix: true })`.
- Patterns are a subset of `PATTERN_IDS` (`A`–`P`, at least one); always iterate them with `patternIds(song)`. `song.song` is the chain of pattern IDs (max 64) played in *Canción* mode.
- Each pattern has `beats` (one of `METERS`: 2, 3, 4, 6, 8) and `lanes[]`, one per track. Its length is `stepsOf(pat)` = `beats * 4` sixteenth-note steps; there is no global step count. `fitLane(track, lane, steps)` coerces a lane to the right shape/length (used by `normalizeSong`, paste and meter changes). A lane's shape depends on the track voice's `kind` in `VOICES`:
  - `drum` → `{ hits: number[steps] }` (velocity 0–127, 0 = off)
  - `synth` → `{ notes: [{ m, s, l, v }] }` (MIDI note, start step, length in steps, velocity)
- `track.trans` (−3..3 octaves) transposes at playback; notes store the *written* pitch. `track.oct` is only the visible piano-roll range. The note editor and grid labels show sounding pitch (written + `trans * 12`), see `shift()` in main.js.
- The voice selector only offers voices of the same kind, so lane shapes stay consistent; paste re-coerces lanes in case they don't match.
- The JSON file format (`format: "ocho-pistas"`, `version: 1`) is documented in `README.md`. **`normalizeSong` is the single gate** for both imported files and the localStorage copy: it clamps every field and fills defaults. When adding a field to the model, update `TRACK_DEFS`/`newSong`, `normalizeSong`, and the README format section together. Breaking changes should bump `FORMAT_VERSION` and the `STORAGE_KEY` (`ochopistas.song.v1`).

### UI pattern (main.js)

- Module-level `song` (persisted) and `ui` (view, selected pattern/track, mode, playhead, clipboard; not persisted).
- Views (`viewSeq`, `viewNotes`, `viewMix`) return HTML strings and `renderView()` replaces `#app.innerHTML` wholesale. User-provided text must go through `esc()`.
- Events are delegated on `#app`: elements carry `data-act="…"` (plus `data-t`, `data-s`, `data-m`, …) and are dispatched in `handleClick` / `handleInput` / `handleChange`. Add new controls by adding a `data-act` value and a case there.
- **Every mutation calls `changed({ render, mix })`**: `mix: true` pushes volume/pan/reverb/mute/solo to the engine, `render` re-renders the view, and a 350 ms debounced `saveLocal` follows. Continuous inputs (sliders, text fields) use `render: false` so the element being dragged/typed into isn't destroyed; they patch readouts (`data-dbtext`, `data-revtext`) directly instead.
- Playhead highlighting: cells are tagged `data-col="<step>"` and chain chips `data-chain="<index>"`; `markPlayhead()` toggles the `.now` class without re-rendering.

### Audio engine (audio.js)

- `ensure()` builds the graph on first use. Per track: `gain → StereoPanner → master`, `gain → send → shared Convolver reverb`, with an analyser on the panner for meters. Master: `gain → DynamicsCompressor (limiter) → analyser → destination`.
- Mute/solo are implemented in `applyMix` by setting channel gain to 0.
- Scheduler is the lookahead pattern: `setInterval` every 25 ms schedules steps falling within the next 0.12 s at exact `AudioContext` times. Swing delays odd steps. Scheduled steps are pushed to `uiQueue` and drained in a `requestAnimationFrame` loop that calls `engine.onStep` so the UI stays in sync with what is actually heard.
- `start()` receives getter callbacks (`() => song`, `() => ui.mode`, `() => ui.pattern`), so edits and loading a new song take effect live during playback.
- **Adding an instrument:** add an entry to `VOICES` in `store.js` (`kind`, label, and for synths `lo`/`defaultNote`) and a matching `case` in `Engine.play()`.

### Theming

Colors are CSS custom properties defined under `:root[data-theme="dark"]` and `:root[data-theme="light"]` in `styles.css`; any new color token must be defined in both. An inline script in `index.html` sets `data-theme` before first paint from localStorage key `ochopistas.theme` or `prefers-color-scheme`.
