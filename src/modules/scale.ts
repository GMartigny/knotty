import * as Tone from "tone";
import { SOURCE_LEVEL, type ModuleDef, type TriggerListener } from "./types";
import { frequencyOf, midiC } from "./notes";

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

/**
 * MIDI note picked by a signal value `m` (−1 … 1, clamped) among the notes of a scale
 * over two octaves from the root, the root of the octave above included: −1 → the root, 1 → two octaves up.
 */
export function pickNote(m: number, scaleIndex: number, rootIndex: number, octaveIndex: number) {
    const degrees = SCALES[scaleIndex] ?? SCALES[2];
    const notes: number[] = [];
    for (let o = 0; o < SPAN; o++) for (const d of degrees) notes.push(o * 12 + d);
    notes.push(SPAN * 12);
    const clamped = Math.max(-1, Math.min(1, m || 0));
    const index = Math.round(((clamped + 1) / 2) * (notes.length - 1));
    return midiC(OCTAVES[octaveIndex] ?? 4) + (ROOTS[rootIndex] ?? 0) + notes[index];
}

/**
 * Turns a signal into in-tune notes: on each trigger, the signal value (−1 … 1)
 * picks a note of the scale over two octaves. With no signal plugged in, plays the middle root.
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
        /** Last note picked (audio side), sent again when the key that picked it is released. */
        let held = -1;

        const pick = () => pickNote((meter.getValue() as number) / SOURCE_LEVEL, v.scale, v.root, v.octave);

        return {
            input: (port) => (port === "in" ? input : undefined),
            output: () => undefined,
            setParam(id, value) {
                v[id] = value;
            },
            trigger: (_port, time, _note, gate) => {
                // A key released: pass it on with the note being held, without picking a new one.
                if (gate === "off") {
                    if (held >= 0) for (const fn of listeners) fn(time, frequencyOf(held), "off");
                    return;
                }
                const midi = pick();
                held = midi;
                Tone.getDraw().schedule(() => (last = midi), time);
                for (const fn of listeners) fn(time, frequencyOf(midi), gate);
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
