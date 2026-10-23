import * as Tone from "tone";
import { ModReader, type ModuleDef, type ParamDef, type TriggerListener } from "./types";
import { midiOf, transposeFrequency } from "./notes";

const params: ParamDef[] = [
    // Whole semitones; a sound on its socket moves it (±24 at a source's normal level), read on each note.
    { id: "semitones", label: "Semitones", min: -24, max: 24, default: 0, step: 1, unit: "st" },
];

/** What the block shows: the last note in and out, packed in one number (in × 1000 + out), -1 before any. */
export const packNotes = (inMidi: number, outMidi: number) => inMidi * 1000 + outMidi;
export const unpackNotes = (packed: number) => ({ in: Math.floor(packed / 1000), out: packed % 1000 });

/**
 * Transpose: moves the notes going through by a number of semitones (12 = an octave).
 * Several in parallel behind a Keyboard make chords (0, +4, +7: major); one behind a Scale doubles
 * a melody an octave up. Hits without a note (sequencer steps) pass through unchanged.
 */
export const transpose: ModuleDef = {
    type: "transpose",
    label: "Transpose",
    description: "Moves the notes going through by some semitones: octaves, harmonies, chords.",
    icon: "⇅",
    category: "sequencer",
    inputs: [{ id: "in", kind: "trigger", label: "Notes" }],
    outputs: [{ id: "out", kind: "trigger", label: "Notes" }],
    params,
    create(values) {
        const base = { ...values };
        const mods = new ModReader(params);
        const listeners = new Set<TriggerListener>();
        let shown = -1;
        /** Shift used by the note being held, so its release goes out with the same note. */
        let heldShift = 0;

        return {
            input: () => undefined,
            output: () => undefined,
            setParam(id, value) {
                base[id] = value;
            },
            trigger: (_port, time, note, gate) => {
                if (note === undefined) {
                    for (const fn of listeners) fn(time, undefined, gate);
                    return;
                }
                const shift = gate === "off" ? heldShift : Math.round(mods.value("semitones", base.semitones));
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
            dispose: () => listeners.clear(),
        };
    },
};
