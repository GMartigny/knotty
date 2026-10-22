# knotty — notes for agents

Vite + React 19 + TypeScript, React Flow (`@xyflow/react`), Tone.js, Zustand. UI, code comments, docs and commit messages are in English.

## Architecture

- **`src/store/graph.ts`**: the graph (blocks, cables, settings) in a Zustand store. It is the single source of truth.
- **`src/audio/engine.ts`**: subscribes to the store and applies the differences to the Tone.js graph (create, `connect`, `disconnect`, `dispose`). A `removing` block or a `dropping` cable (falling) is already treated as removed.
- **`src/audio/clock.ts`**: a shared sixteenth-note clock (`onSixteenth`), used by the sequencers and the Echo so they stay in sync and start without delay.
- **`src/modules/`**: one file per block type (`ModuleDef`: sockets, settings, creation of the Tone nodes). Adding a block = one file + one line in `registry.ts`.
- **`src/cables/`**: Verlet rope cables. The number of points depends on the length (one every ~16 px, between 8 and 40, so the ends stay supple). A single `requestAnimationFrame` loop animates all cables and stops when everything is still; SVG paths are written directly to the DOM, without React re-renders.
- **`src/store/persist.ts`**: the patch (blocks, positions, settings, cables, Comment text and size) is saved to `localStorage` 300 ms after each change and restored on load. On load it is cleaned up for the current version: unknown blocks ignored, settings filled with their defaults, cables to missing sockets removed.
- **`src/store/example.ts`**: the presets (Soft, Groove, Metal). Blocks in a preset must not overlap, and each block must sit fully inside its Comment frame, below the frame's header.
- **`src/audio/levels.ts`**: each block's output level, exposed as the `--level` CSS variable for the glows.

## Cables and signals

Sockets are typed `audio`, `trigger` or `mod`; incompatible connections and loops are refused. A sound can also plug into a `mod` socket.

A trigger cable carries no sound: the engine subscribes the input (`trigger`) to the output (`listen`) and passes on the audio time of each pulse, and optionally a note (frequency). As in a real modular, sources (Oscillator, Noise) play continuously at `SOURCE_DB` (−12 dB); the Envelope cuts them into notes. With no Trigger plugged in, the Envelope lets the sound through unchanged.

**Modulation**: every continuous slider has a `mod:<setting>` socket. The signal is added to the slider position: ±half the range, or ±100% of the value on a log scale, for a source at its normal level (`SOURCE_LEVEL`). Audio parameters are modulated in real time (`modTarget`, via `DrivenParam` in `src/modules/mod.ts`, because Tone.js resets a parameter to zero as soon as a signal is connected to it); Envelope times are read on each trigger (`setModSource`). A setting marked `modulatable: false` has no socket.

**Variable rows**: a `ModuleDef` with `rows` (Sequencer, Mixer) stores its row count in a hidden setting, changed by dragging `RowResizer` on the block's bottom edge. Sockets and settings tagged with a `row` beyond that count are hidden, and `portKind(…, params)` treats them as missing; `setRows` unplugs the cables on removed rows.

**Undo**: `graph.ts` keeps a history of patch snapshots (`undo`/`redo`, up to 100 steps). Every action that changes the patch calls `record()` *before* changing it; slider drags, text typing, row resizing and block drags are merged into one step (a `key` or a gesture flag). Fall animations only remove blocks and cables that are still falling, so an undo during a fall wins.

**Comment**: a `comment` node with no sound or sockets, rendered by `CommentBlock` behind blocks and cables (`zIndex: -1`, `elevateNodesOnSelect={false}`), resizable with `NodeResizer`. It only moves by its grip (`dragHandle`), and the frame itself lets the pointer through to the mat and the blocks.

## Checking

- `npm run build` (includes `tsc -b`).
- Manual Playwright tests on `vite preview` (port 4173): levels via `--level`, block overlaps and framing in the presets, no page errors.
- Automatic Vercel deployment on every push to `main`.
