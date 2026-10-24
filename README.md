# knotty

A playful modular synth in the browser: drop blocks on a mat and link them with cables that sag and bounce.

**Live: [knotty-synth.vercel.app](https://knotty-synth.vercel.app)** (desktop, with a mouse)

## How it works

- **Add a block**: drag it from the palette onto the mat (or click it). Rest the pointer on one to see what it does.
- **Plug in**: pull a cable from one socket to another. While pulling, only compatible sockets light up.
- **Unplug**: pull from a socket that is already plugged in and let go in empty space; the cable falls.
- **Socket colors**: orange = sound, yellow = trigger (sequencer, keyboard), sky-blue ring = a setting that a sound can move.
- **Make sound**: sources (Oscillator, Noise) play continuously; an Envelope triggered by the Sequencer or the Keyboard cuts them into notes (a key held on the Keyboard holds the note). Everything ends up in the Output.
- **Modulate**: plug a slow Oscillator into a setting's socket (a filter's frequency, another oscillator's…) to make it move on its own.
- **Add chance**: the Random block rolls a die on each trigger and holds the value. Plug it into a Scale for random in-tune melodies, or into a setting to vary every note. "Values" sets how many faces the die has; for smooth drifts, use a slow Oscillator instead.
- **Chords and octaves**: a Transpose block moves the notes going through by some semitones. Behind a Keyboard, three of them (0, +4, +7) feeding three Oscillators play a major chord; −12 or +12 moves a line an octave. It also moves any sound plugged into its Sound socket (a sequencer's notes, chords, noise…), like a harmonizer pedal: a fixed shift, with a slight grain.
- **Melodies**: switch a Sequencer to Notes mode for a piano roll that plays itself: each row is a semitone above the one below, and every lit step plays its notes (chords too). Plug an Envelope into it: the notes take its shape, and the sound of the Oscillator feeding that Envelope, whose frequency (vibrato included) sets the bottom row and whose Glide slides from one note to the next. Effects placed between that Envelope and the sequencer (Distortion, Filter, Echo, Transpose, a one-channel Mixer) are copied too, one per note: each note is distorted on its own, so chords don't grind. The sound comes out mixed (All notes, at the top) and row by row.
- **More rows**: drag the grip on the bottom edge of a Sequencer or Mixer to add or remove rows (up to 16). Each Mixer channel has a switch to mute it without losing its level.
- **Stay organized**: the Comment block is a resizable frame with some text, to name the parts of a composition. Move it by its ⠿ grip; clicks elsewhere in the frame go through to the mat and the blocks.
- **Presets**: hold the big cross in the top right for 2 seconds to clear the mat, then "Load a preset" offers Soft, Groove and Metal.
- **Undo**: Ctrl+Z undoes the last change (a cable pulled out by mistake, a deleted block, a moved slider…), Ctrl+Shift+Z or Ctrl+Y redoes it. Cmd on a Mac.
- **Copy / paste**: Ctrl+C copies the selected blocks (hold Ctrl or Shift and click blocks or drag a box to select several, Ctrl+A for all), Ctrl+V pastes them at the pointer with their settings, without their cables.
- **Share**: the link button in the top right copies a link that holds the whole patch. Opening it replaces the mat (Ctrl+Z brings yours back).
- Your patch is saved automatically in the browser.

## Run locally

```bash
npm install
npm run dev
```

Tests: `npm test` (unit), `npm run test:e2e` (in the browser).
