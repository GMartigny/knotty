# knotty

A playful modular synth in the browser: drop blocks on a mat and link them with cables that sag and bounce.

**Live: [knotty-synth.vercel.app](https://knotty-synth.vercel.app)** (desktop, with a mouse)

## How it works

- **Add a block**: drag it from the palette onto the mat (or click it).
- **Plug in**: pull a cable from one socket to another. While pulling, only compatible sockets light up.
- **Unplug**: pull from a socket that is already plugged in and let go in empty space; the cable falls.
- **Socket colors**: orange = sound, yellow = trigger (sequencer, keyboard), sky-blue ring = a setting that a sound can move.
- **Make sound**: sources (Oscillator, Noise) play continuously; an Envelope triggered by the Sequencer or the Keyboard cuts them into notes. Everything ends up in the Output.
- **Modulate**: plug a slow Oscillator into a setting's socket (a filter's frequency, another oscillator's…) to make it move on its own.
- **More rows**: drag the grip on the bottom edge of a Sequencer or Mixer to add or remove rows (up to 8).
- **Stay organized**: the Comment block is a resizable frame with some text, to name the parts of a composition. Move it by its ⠿ grip; clicks elsewhere in the frame go through to the mat and the blocks.
- **Presets**: hold the big cross in the top right for 2 seconds to clear the mat, then "Load a preset" offers Soft, Groove and Metal.
- Your patch is saved automatically in the browser.

## Run locally

```bash
npm install
npm run dev
```
