import * as Tone from "tone";
import { SOURCE_LEVEL, type ModuleDef, type TriggerListener } from "./types";

/** Degrees of each scale, in semitones from the root. */
const SCALES = [
    [0, 2, 4, 5, 7, 9, 11], // major
    [0, 2, 3, 5, 7, 8, 10], // minor
    [0, 3, 5, 7, 10], // pentatonic (minor)
];
/** Available roots, in semitones from C. */
const ROOTS = [0, 2, 4, 5, 7, 9, 11];
const OCTAVES = [3, 4, 5];
/** Range covered by the signal, in octaves. */
const SPAN = 2;

const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
/** Name of a MIDI note, e.g. 67 → "G4". */
export const noteName = (midi: number) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
const frequencyOf = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/**
 * Turns a signal into in-tune notes: on each trigger, the signal value (−1 … 1)
 * picks a note of the scale over two octaves. With no signal plugged in, plays the root.
 */
export const scale: ModuleDef = {
    type: "scale",
    label: "Scale",
    icon: "♯",
    category: "sequencer",
    inputs: [
        { id: "in", kind: "audio", label: "Signal" },
        { id: "gate", kind: "trigger", label: "Trigger" },
    ],
    outputs: [{ id: "out", kind: "trigger", label: "Notes" }],
    params: [
        { id: "scale", label: "Scale", min: 0, max: 2, default: 2, options: ["Major", "Minor", "Penta"] },
        { id: "root", label: "Root", min: 0, max: 6, default: 0, options: ["C", "D", "E", "F", "G", "A", "B"] },
        { id: "octave", label: "Octave", min: 0, max: 2, default: 1, options: OCTAVES.map(String) },
    ],
    create(values) {
        const v = { ...values };
        const input = new Tone.Gain(1);
        // Instantaneous signal value, read on each trigger.
        const meter = new Tone.DCMeter();
        input.connect(meter);
        const listeners = new Set<TriggerListener>();
        let last = -1;

        const pick = () => {
            const degrees = SCALES[v.scale] ?? SCALES[2];
            // All the scale's notes over the range, including the root of the octave above.
            const notes: number[] = [];
            for (let o = 0; o < SPAN; o++) for (const d of degrees) notes.push(o * 12 + d);
            notes.push(SPAN * 12);
            const m = Math.max(-1, Math.min(1, (meter.getValue() as number) / SOURCE_LEVEL || 0));
            const index = Math.round(((m + 1) / 2) * (notes.length - 1));
            return 12 * ((OCTAVES[v.octave] ?? 4) + 1) + (ROOTS[v.root] ?? 0) + notes[index];
        };

        return {
            input: (port) => (port === "in" ? input : undefined),
            output: () => undefined,
            setParam(id, value) {
                v[id] = value;
            },
            trigger: (_port, time) => {
                const midi = pick();
                Tone.getDraw().schedule(() => (last = midi), time);
                for (const fn of listeners) fn(time, frequencyOf(midi));
            },
            listen(_port, fn) {
                listeners.add(fn);
                return () => listeners.delete(fn);
            },
            position: () => last,
            dispose: () => {
                listeners.clear();
                meter.dispose();
                input.dispose();
            },
        };
    },
};
