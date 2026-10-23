import * as Tone from "tone";
import { ModReader, type ModuleDef, type ParamDef, type TriggerListener } from "./types";
import { midiOf, transposeFrequency } from "./notes";
import { onSixteenth } from "../audio/clock";

const params: ParamDef[] = [
    // Whole semitones; a sound on its socket moves it (±24 at a source's normal level), read on each note
    // (and on each sixteenth note for the sound going through).
    { id: "semitones", label: "Semitones", min: -24, max: 24, default: 0, step: 1, unit: "st" },
];

/** What the block shows: the last note in and out, packed in one number (in × 1000 + out), -1 before any. */
export const packNotes = (inMidi: number, outMidi: number) => inMidi * 1000 + outMidi;
export const unpackNotes = (packed: number) => ({ in: Math.floor(packed / 1000), out: packed % 1000 });

/** Grain length of the sound pitch shifter, in seconds: shorter is quicker but grainier on low notes. */
const WINDOW_S = 0.06;

/**
 * Transpose: moves by a number of semitones (12 = an octave), on two independent sides.
 * - Notes (triggers): exact. Several in parallel behind a Keyboard make chords (0, +4, +7: major);
 *   one behind a Scale doubles a melody an octave up. Hits without a note pass through unchanged.
 * - Sound: any sound (chords, noise, a whole mix), shifted like a harmonizer pedal, by replaying short
 *   grains faster or slower: a slight grain and a few tens of ms of delay.
 */
export const transpose: ModuleDef = {
    type: "transpose",
    label: "Transpose",
    description: "Moves notes, or any sound, by some semitones: octaves, harmonies, chords.",
    icon: "⇅",
    category: "sequencer",
    inputs: [
        { id: "notes", kind: "trigger", label: "Notes" },
        { id: "in", kind: "audio", label: "Sound" },
    ],
    outputs: [
        { id: "notes", kind: "trigger", label: "Notes" },
        { id: "out", kind: "audio", label: "Sound" },
    ],
    params,
    create(values) {
        const base = { ...values };
        const mods = new ModReader(params);
        const listeners = new Set<TriggerListener>();
        let shown = -1;
        /** Shift used by the note being held, so its release goes out with the same note. */
        let heldShift = 0;

        const shifter = new Tone.PitchShift({ pitch: base.semitones, windowSize: WINDOW_S });
        const semitones = () => Math.round(mods.value("semitones", base.semitones));
        // A sound on the Semitones socket moves the sound's shift too, at each sixteenth note.
        const stopClock = onSixteenth(() => {
            const shift = semitones();
            if (shifter.pitch !== shift) shifter.pitch = shift;
        });

        return {
            input: (port) => (port === "in" ? shifter : undefined),
            output: (port) => (port === "out" ? shifter : undefined),
            setParam(id, value) {
                base[id] = value;
                if (id === "semitones") shifter.pitch = semitones();
            },
            trigger: (_port, time, note, gate) => {
                if (note === undefined) {
                    for (const fn of listeners) fn(time, undefined, gate);
                    return;
                }
                const shift = gate === "off" ? heldShift : semitones();
                if (gate === "on") heldShift = shift;
                const out = transposeFrequency(note, shift);
                for (const fn of listeners) fn(time, out, gate);
                if (gate !== "off") {
                    const packed = packNotes(midiOf(note), midiOf(out));
                    Tone.getDraw().schedule(() => (shown = packed), time);
                }
            },
            listen(_port, fn) {
                listeners.add(fn);
                return () => listeners.delete(fn);
            },
            position: () => shown,
            setModSource: (id, read) => mods.set(id, read),
            dispose: () => {
                listeners.clear();
                stopClock();
                shifter.dispose();
            },
        };
    },
};
