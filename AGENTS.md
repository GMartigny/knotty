# knotty — notes for agents

Vite + React 19 + TypeScript, React Flow (`@xyflow/react`), Tone.js, Zustand. UI, code comments, docs and commit messages are in English.

## Architecture

- **`src/store/graph.ts`**: the graph (blocks, cables, settings) in a Zustand store. It is the single source of truth.
- **`src/audio/engine.ts`**: subscribes to the store and applies the differences to the Tone.js graph (create, `connect`, `disconnect`, `dispose`). A `removing` block or a `dropping` cable (falling) is already treated as removed.
- **`src/audio/clock.ts`**: a shared sixteenth-note clock (`onSixteenth`), used by the sequencers and the Echo so they stay in sync and start without delay.
- **`src/modules/`**: one file per block type (`ModuleDef`: sockets, settings, creation of the Tone nodes). Adding a block = one file + one line in `registry.ts`.
- **`src/cables/`**: Verlet rope cables. The number of points depends on the length (one every ~16 px, between 8 and 40, so the ends stay supple). A single `requestAnimationFrame` loop animates the cables that are awake (only those are stepped and redrawn) and stops when everything is still; a cable still trembling by a pixel after 5 s is put to sleep. SVG paths are written directly to the DOM, without React re-renders.
- **`src/store/persist.ts`**: the patch is saved to `localStorage` 300 ms after each change and restored on load, in a compact form (`toCompact`): blocks as `[type, x, y, settings changed from their defaults, Comment text, width, height]` (settings keyed by one letter, `KEYS[rank in the type's params]`: reordering a type's settings changes the meaning of saved patches and links), cables as `[from block index, socket, to block index, socket]`, no ids (new ones on load). `readPatch` cleans it up for the current version: unknown blocks ignored, settings clamped and filled with their defaults, cables to missing sockets removed. No migration of older formats.
- **`src/store/share.ts`**: share links, `#patch=<compact JSON, deflate-raw, base64url>` (`CompressionStream`). `ShareButton` copies one; `useOpenSharedLink` opens one on load or on `hashchange`, as one undo step (`replacePatch`), then removes the fragment.
- **`src/store/example.ts`**: the presets (Soft, Groove, Metal). Blocks in a preset must not overlap, and each block must sit fully inside its Comment frame, below the frame's header.
- **`src/audio/levels.ts`**: each block's output level, exposed as the `--level` CSS variable for the glows, in one loop, written only when it moves by at least 5 % or drops to 0 (`nextLevel` in `src/lib/level.ts`). `--level` is registered non-inherited (`@property` in `styles.css`): setting it restyles only that element, not the whole block (a sequencer's grid). Use it only on the element it is written on. `usePosition` reads blocks' display state in one shared loop too.

## Cables and signals

Sockets are typed `audio`, `trigger` or `mod`; incompatible connections and loops are refused. A sound can also plug into a `mod` socket.

A trigger cable carries no sound: the engine subscribes the input (`trigger`) to the output (`listen`) and passes on the audio time of each pulse, and optionally a note (frequency) and a gate. Without a gate it is a hit of a set length (sequencer steps: the Envelope uses its Hold time); the Keyboard sends `"on"` when a key is pressed and `"off"` when it is released, and the Envelope holds the note at its sustain level until the last held key is released. Scale and Transpose pass gates on (Transpose sends a release with the same shift as its note); Transpose also shifts sound (`Tone.PitchShift`, audio `in`/`out`, its trigger sockets are `notes`), Random and Oscillator ignore `"off"`. As in a real modular, sources (Oscillator, Noise) play continuously at `SOURCE_DB` (−12 dB); the Envelope cuts them into notes. With no Trigger plugged in, the Envelope lets the sound through unchanged.

**Modulation**: every continuous slider has a `mod:<setting>` socket. The signal is added to the slider position: ±half the range, or ±100% of the value on a log scale, for a source at its normal level (`SOURCE_LEVEL`). Audio parameters are modulated in real time (`modTarget`, via `DrivenParam` in `src/modules/mod.ts`, because Tone.js resets a parameter to zero as soon as a signal is connected to it); Envelope times are read on each trigger (`setModSource`). A setting marked `modulatable: false` has no socket. A setting with `mute: "<id>"` gets a mute switch beside its slider, driving that hidden 0/1 setting (Mixer channels).

**Sequencer modes**: Tracks (one trigger output per row, hits without notes) or Notes (a piano roll that plays itself: one oscillator → envelope voice per row, created on first use; the bottom row plays the base frequency, each row above a semitone higher, `rowFrequency`; sound out mixed on `out` and per row on `noteN`). Sockets and settings tagged with `when` only exist in one mode; switching mode unplugs the other mode's cables and `adjust` gives Notes an octave of rows.

**Model inputs**: an input with `model: true` takes the plugged block as a *model*, not its sound: the engine calls `setModel(port, model)` with a `Model` read live (type, `params()`, `tap(param)` for a setting's live signal, `input(port)` for the block feeding one of its inputs). `accepts` restricts which block types can plug in (`acceptsBlock`, checked on connect and on load). The Sequencer's Notes mode takes an Envelope (ADSR + hold, read on each step) and, through `input("in")`, the Oscillator feeding it: its shape, its Glide (each note slides from the closest note of the previous step, `glideFrom`), and its frequency bus (`tap("frequency")`: slider + modulation, audio-rate), which each row's voice follows through a `Multiply` by the row's interval. Effects between the Envelope and the model input (`MODEL_EFFECTS`, walked by `modelChain`) are copied per voice with `Model.copy()` (a new instance from the registry), rebuilt when the chain's types change, settings synced on each note. Copies take the original's modulations too: the engine keeps them per block (`copyOf`) and plugs the same scaled signal (or sampled reader) into them, including cables plugged later. No Reverb (too costly per voice).

**Variable rows**: a `ModuleDef` with `rows` (Sequencer, Mixer) stores its row count in a hidden setting, changed by dragging `RowResizer` on the block's bottom edge. Sockets and settings tagged with a `row` beyond that count are hidden, and `portKind(…, params)` treats them as missing; `setRows` unplugs the cables on removed rows.

**Undo**: `graph.ts` keeps a history of patch snapshots (`undo`/`redo`, up to 100 steps). Every action that changes the patch calls `record()` *before* changing it; slider drags, text typing, row resizing and block drags are merged into one step (a `key` or a gesture flag). Fall animations only remove blocks and cables that are still falling, so an undo during a fall wins.

**Copy / paste**: `copy()` keeps a deep copy of the selected nodes in the store (not the system clipboard), without cables; `paste(at?)` creates them with new ids at the pointer, or offset by 40 px per paste, selected, as one undo step. Shortcuts live in `App.tsx` (`usePatchShortcuts`) and leave text fields alone.

**Comment**: a `comment` node with no sound or sockets, rendered by `CommentBlock` behind blocks and cables (`zIndex: -1`, `elevateNodesOnSelect={false}`), resizable with `NodeResizer`. It only moves by its grip (`dragHandle`), and the frame itself lets the pointer through to the mat and the blocks.

## Checking

Quality gates run on their own; don't spend time re-running the whole suite by hand:

- **Vercel** builds with `npm test && npm run build` (`vercel.json`): a failing unit test or type error stops the deployment, and the site stays on the previous version.
- **GitHub Actions** (`.github/workflows/ci.yml`) runs on every push and pull request: typecheck + unit tests with coverage, and the Playwright browser tests (report uploaded as an artifact on failure).

Locally, run only what you touched: `npm test -- <file>` (Vitest, `src/**/*.test.ts`, jsdom) or `npm run test:e2e -- -g "<name>"` (Playwright, `e2e/`, on `vite preview` port 4173).

- Unit tests cover the logic that doesn't need Web Audio: the store (connections, undo/redo, rows, shared tempo, copy/paste), persistence, presets' integrity, settings math, notes, the rope physics, the Scale and Random logic.
- Browser tests cover the audio engine and the UI: presets' layout and sound, palette, cables, undo, hold-to-clear, rows, comments, keyboard, dice, copy/paste, persistence.
- Keep logic out of components and Tone nodes when it can be pure (e.g. `pickNote`, `fromSlider`), so it can be unit-tested.
- New feature → new tests next to it, in the same commit.
