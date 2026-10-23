# knotty

A playful modular synth in the browser: drop blocks on a mat and link them with cables that sag and bounce.

**Live: [knotty-synth.vercel.app](https://knotty-synth.vercel.app)** (desktop, with a mouse)

## How it works

- **Add a block**: drag it from the palette onto the mat (or click it).
- **Plug in**: pull a cable from one socket to another. While pulling, only compatible sockets light up.
- **Unplug**: pull from a socket that is already plugged in and let go in empty space; the cable falls.
- **Socket colors**: orange = sound, yellow = trigger (sequencer, keyboard), sky-blue ring = a setting that a sound can move.
- **Make sound**: sources (Oscillator, Noise) play continuously; an Envelope triggered by the Sequencer or the Keyboard cuts them into notes (a key held on the Keyboard holds the note). Everything ends up in the Output.
- **Modulate**: plug a slow Oscillator into a setting's socket (a filter's frequency, another oscillator's…) to make it move on its own.
- **Add chance**: the Random block rolls a die on each trigger and holds the value. Plug it into a Scale for random in-tune melodies, or into a setting to vary every note. "Values" sets how many faces the die has; for smooth drifts, use a slow Oscillator instead.
- **Chords and octaves**: a Transpose block moves the notes going through by some semitones. Behind a Keyboard, three of them (0, +4, +7) feeding three Oscillators play a major chord; −12 or +12 moves a line an octave.
- **Melodies**: switch a Sequencer to Notes mode for a piano roll: each row is a note (C down to C), and a step plays all its lit notes at once, one per Voice output from the lowest. Plug each voice into an Oscillator's Note input and an Envelope's Trigger.
- **More rows**: drag the grip on the bottom edge of a Sequencer or Mixer to add or remove rows (up to 16).
- **Stay organized**: the Comment block is a resizable frame with some text, to name the parts of a composition. Move it by its ⠿ grip; clicks elsewhere in the frame go through to the mat and the blocks.
- **Presets**: hold the big cross in the top right for 2 seconds to clear the mat, then "Load a preset" offers Soft, Groove and Metal.
- **Undo**: Ctrl+Z undoes the last change (a cable pulled out by mistake, a deleted block, a moved slider…), Ctrl+Shift+Z or Ctrl+Y redoes it. Cmd on a Mac.
- **Copy / paste**: Ctrl+C copies the selected blocks (Ctrl+click or drag a box to select several, Ctrl+A for all), Ctrl+V pastes them at the pointer with their settings, without their cables.
- Your patch is saved automatically in the browser.

## Run locally

```bash
npm install
npm run dev
```

Tests: `npm test` (unit), `npm run test:e2e` (in the browser).
