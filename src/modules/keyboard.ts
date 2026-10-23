import * as Tone from "tone";
import type { ModuleDef, TriggerListener } from "./types";
import { frequencyOf, midiC } from "./notes";
import { isTextField } from "../lib/dom";

/**
 * Computer keyboard keys, by physical position (`event.code`): the middle row
 * gives the white keys, the row above the black ones, like on a piano.
 * On a QWERTY keyboard: A S D F G H J K (white) and W E T Y U (black).
 */
export const KEY_CODES = ["KeyA", "KeyW", "KeyS", "KeyE", "KeyD", "KeyF", "KeyT", "KeyG", "KeyY", "KeyH", "KeyU", "KeyJ", "KeyK"];
/** Black semitones (sharps) in the octave. */
export const BLACK = new Set([1, 3, 6, 8, 10]);

const OCTAVES = [2, 3, 4, 5];

const noteFrequency = (octaveIndex: number, semitone: number) => frequencyOf(midiC(OCTAVES[octaveIndex] ?? 4) + semitone);

/** Don't play while typing text, nor with a shortcut. */
const ignored = (e: KeyboardEvent) => e.ctrlKey || e.metaKey || e.altKey || isTextField(e.target);

/** Plays notes from the computer keyboard or the block's mini-piano. */
export const keyboard: ModuleDef = {
    type: "keyboard",
    label: "Keyboard",
    description: "Play notes with your computer keyboard (A to K) or the mini-piano. A held key holds the note.",
    icon: "♪",
    category: "sequencer",
    inputs: [],
    outputs: [{ id: "out", kind: "trigger", label: "Notes" }],
    params: [{ id: "octave", label: "Octave", min: 0, max: 3, default: 2, options: OCTAVES.map(String) }],
    create(values) {
        let octave = values.octave ?? 2;
        const listeners = new Set<TriggerListener>();
        /** Pressed keys, as a bitmask (for display). */
        let held = 0;

        /** A key pressed or released: the note lasts as long as it is held. */
        const play = (semitone: number, down: boolean) => {
            const bit = 1 << semitone;
            if (down === Boolean(held & bit)) return;
            held = down ? held | bit : held & ~bit;
            const time = Tone.now();
            const note = noteFrequency(octave, semitone);
            for (const fn of listeners) fn(time, note, down ? "on" : "off");
        };

        const down = (e: KeyboardEvent) => {
            const i = KEY_CODES.indexOf(e.code);
            if (i < 0 || ignored(e)) return;
            e.preventDefault();
            if (!e.repeat) play(i, true);
        };
        const up = (e: KeyboardEvent) => {
            const i = KEY_CODES.indexOf(e.code);
            if (i >= 0) play(i, false);
        };
        // The window loses focus with keys still down: release them all.
        const blur = () => KEY_CODES.forEach((_, i) => play(i, false));
        window.addEventListener("keydown", down);
        window.addEventListener("keyup", up);
        window.addEventListener("blur", blur);

        return {
            input: () => undefined,
            output: () => undefined,
            setParam(id, value) {
                if (id === "octave") octave = value;
            },
            listen(_port, fn) {
                listeners.add(fn);
                return () => listeners.delete(fn);
            },
            position: () => held,
            play,
            dispose: () => {
                window.removeEventListener("keydown", down);
                window.removeEventListener("keyup", up);
                window.removeEventListener("blur", blur);
                listeners.clear();
            },
        };
    },
};
