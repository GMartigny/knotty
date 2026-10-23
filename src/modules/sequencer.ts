import * as Tone from "tone";
import { onSixteenth } from "../audio/clock";
import { frequencyOf, midiC } from "./notes";
import type { ModuleDef, ParamDef, ParamValues, TriggerListener } from "./types";

/** Rows shown by a new sequencer, and the most it can have. */
const SEQ_ROWS = 4;
const SEQ_MAX_ROWS = 16;
export const SEQ_STEPS = 16;
/** Notes mode: how many notes a step can play at once, one output each (from the lowest). */
export const SEQ_VOICES = 4;

export const MODE = { tracks: 0, notes: 1 } as const;
/** Notes mode: the note of the top row, a C. */
const TOP_OCTAVES = [3, 4, 5, 6];

/** Starting patterns, one integer per row: bit i turns step i on. */
const DEFAULT_PATTERNS = [
    0b0101010101010101, // every other step
    0b0001000000010000, // offbeat
    0b0000000000000000,
    0b0000000000000000,
];

export const rowParam = (row: number) => `row${row}`;
export const rowOutput = (row: number) => `row${row}`;
export const voiceOutput = (voice: number) => `voice${voice + 1}`;
export const isStepOn = (pattern: number, step: number) => (pattern & (1 << step)) !== 0;
export const toggleStep = (pattern: number, step: number) => pattern ^ (1 << step);

/** Notes mode: MIDI note of a row. The top row is a C; each row below is a semitone lower, like a piano roll. */
export const rowNote = (params: ParamValues, row: number) => midiC(TOP_OCTAVES[params.top] ?? 5) - row;

/** Notes mode: the notes a step plays, from the lowest, one per voice (extra notes are left out). */
export const stepNotes = (params: ParamValues, step: number) => {
    const notes: number[] = [];
    for (let row = 0; row < (params.rows ?? SEQ_ROWS); row++) {
        if (isStepOn(params[rowParam(row)] ?? 0, step)) notes.push(rowNote(params, row));
    }
    return notes.sort((a, b) => a - b).slice(0, SEQ_VOICES);
};

const tracks = { param: "mode", value: MODE.tracks };
const notes = { param: "mode", value: MODE.notes };

const rowParams: ParamDef[] = Array.from({ length: SEQ_MAX_ROWS }, (_, row) => ({
    id: rowParam(row),
    row,
    label: `Row ${row + 1}`,
    min: 0,
    max: 2 ** SEQ_STEPS - 1,
    default: DEFAULT_PATTERNS[row] ?? 0,
    hidden: true,
}));

/**
 * Sequencer, two modes:
 * - Tracks: each row is a track with its own output, a hit on every lit step (drums…);
 * - Notes: a piano roll, each row is a semitone; a step plays all its lit notes at once,
 *   one per Voice output, from the lowest (melodies, chords).
 */
export const sequencer: ModuleDef = {
    type: "sequencer",
    label: "Sequencer",
    icon: "▦",
    category: "sequencer",
    inputs: [],
    outputs: [
        ...Array.from({ length: SEQ_MAX_ROWS }, (_, row) => ({
            id: rowOutput(row),
            row,
            when: tracks,
            kind: "trigger" as const,
            label: `Row ${row + 1}`,
            inline: true,
        })),
        ...Array.from({ length: SEQ_VOICES }, (_, voice) => ({
            id: voiceOutput(voice),
            when: notes,
            kind: "trigger" as const,
            label: voice === 0 ? "Voice 1 (lowest note)" : `Voice ${voice + 1}`,
        })),
    ],
    params: [
        { id: "mode", label: "Mode", min: 0, max: 1, default: MODE.tracks, options: ["Tracks", "Notes"] },
        // The tempo is the transport's, shared by all sequencers (and the Echo): no modulation.
        { id: "bpm", label: "Tempo", min: 50, max: 200, default: 110, step: 1, unit: "bpm", modulatable: false, shared: true },
        { id: "top", label: "Top note", min: 0, max: 3, default: 2, options: TOP_OCTAVES.map((o) => `C${o}`), when: notes },
        // Number of rows, set by dragging the block's bottom edge.
        { id: "rows", label: "Rows", min: 1, max: SEQ_MAX_ROWS, default: SEQ_ROWS, hidden: true },
        ...rowParams,
    ],
    rows: { param: "rows", min: 1, max: SEQ_MAX_ROWS },
    // Switched to notes: at least an octave of rows (C down to C).
    adjust: (params, changed): ParamValues => (changed === "mode" && params.mode === MODE.notes && params.rows < 13 ? { rows: 13 } : {}),
    create(params) {
        const transport = Tone.getTransport();
        transport.bpm.value = params.bpm;

        const values = { ...params };
        const rowListeners = Array.from({ length: SEQ_MAX_ROWS }, () => new Set<TriggerListener>());
        const voiceListeners = Array.from({ length: SEQ_VOICES }, () => new Set<TriggerListener>());
        let current = -1;

        // Subscribe to the shared clock: the step comes from the transport position,
        // so all sequencers stay in sync, and a new one starts on the next step.
        const unsubscribe = onSixteenth((time, n) => {
            const step = n % SEQ_STEPS;
            if (values.mode === MODE.notes) {
                stepNotes(values, step).forEach((midi, voice) => {
                    for (const fn of voiceListeners[voice]) fn(time, frequencyOf(midi));
                });
            } else {
                for (let row = 0; row < SEQ_MAX_ROWS; row++) {
                    if (isStepOn(values[rowParam(row)] ?? 0, step)) for (const fn of rowListeners[row]) fn(time);
                }
            }
            Tone.getDraw().schedule(() => (current = step), time);
        });

        return {
            input: () => undefined,
            output: () => undefined,
            setParam(param, value) {
                values[param] = value;
                if (param === "bpm") transport.bpm.rampTo(value, 0.1);
            },
            listen(port, fn) {
                const voice = port.startsWith("voice") ? Number(port.slice(5)) - 1 : -1;
                const set = voice >= 0 ? voiceListeners[voice] : rowListeners[Number(port.replace("row", ""))];
                set?.add(fn);
                return () => set?.delete(fn);
            },
            position: () => current,
            dispose: () => {
                unsubscribe();
                [...rowListeners, ...voiceListeners].forEach((set) => set.clear());
            },
        };
    },
};
