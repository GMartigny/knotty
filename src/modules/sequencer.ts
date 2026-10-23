import * as Tone from "tone";
import { onSixteenth } from "../audio/clock";
import { frequencyOf, midiC } from "./notes";
import { SHAPES } from "./sine";
import { SOURCE_DB, type ModuleDef, type ParamDef, type ParamValues, type TriggerListener } from "./types";

/** Rows shown by a new sequencer, and the most it can have. */
const SEQ_ROWS = 4;
const SEQ_MAX_ROWS = 16;
export const SEQ_STEPS = 16;

export const MODE = { tracks: 0, notes: 1 } as const;

/** Notes mode, nothing plugged in: a sine on C4, and a short, soft envelope. */
export const DEFAULT_VOICE = { shape: 0, frequency: frequencyOf(midiC(4)) };
export const DEFAULT_SHAPE = { attack: 0.01, decay: 0.2, sustain: 0.5, hold: 0.15, release: 0.4 };

/** Starting patterns, one integer per row: bit i turns step i on. */
const DEFAULT_PATTERNS = [
    0b0101010101010101, // every other step
    0b0001000000010000, // offbeat
    0b0000000000000000,
    0b0000000000000000,
];

export const rowParam = (row: number) => `row${row}`;
/** Tracks mode: a row's trigger output. */
export const rowOutput = (row: number) => `row${row}`;
/** Notes mode: a row's sound output. */
export const noteOutput = (row: number) => `note${row}`;
export const isStepOn = (pattern: number, step: number) => (pattern & (1 << step)) !== 0;
export const toggleStep = (pattern: number, step: number) => pattern ^ (1 << step);

/**
 * Notes mode: frequency of a row. The bottom row plays the base (the plugged Oscillator's frequency),
 * each row above a semitone higher, like a piano roll.
 */
export const rowFrequency = (base: number, rows: number, row: number) => base * Math.pow(2, (rows - 1 - row) / 12);

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
 * - Tracks: each row is a track with its own trigger output, a hit on every lit step (drums…);
 * - Notes: a piano roll that plays itself. Each row is a semitone above the one below; the bottom one
 *   is the frequency of the Oscillator plugged in as a model, and every note copies that Oscillator's
 *   shape and the plugged Envelope's settings. Its sound comes out mixed, and row by row.
 */
export const sequencer: ModuleDef = {
    type: "sequencer",
    label: "Sequencer",
    description:
        "Plays its steps in a loop. Tracks mode: a trigger output per row, for drums. Notes mode: a piano roll that plays itself, using an Oscillator and an Envelope as models.",
    icon: "▦",
    category: "sequencer",
    inputs: [
        { id: "voice", kind: "audio", label: "Oscillator (sound, bottom note)", model: true, accepts: ["sine"], when: notes },
        { id: "shape", kind: "audio", label: "Envelope (note shape)", model: true, accepts: ["envelope"], when: notes },
    ],
    outputs: [
        ...Array.from({ length: SEQ_MAX_ROWS }, (_, row) => ({
            id: rowOutput(row),
            row,
            when: tracks,
            kind: "trigger" as const,
            label: `Row ${row + 1}`,
            inline: true,
        })),
        ...Array.from({ length: SEQ_MAX_ROWS }, (_, row) => ({
            id: noteOutput(row),
            row,
            when: notes,
            kind: "audio" as const,
            label: `Row ${row + 1} sound`,
            inline: true,
        })),
        { id: "out", kind: "audio" as const, label: "All notes, mixed", when: notes, inline: true },
    ],
    params: [
        { id: "mode", label: "Mode", min: 0, max: 1, default: MODE.tracks, options: ["Tracks", "Notes"] },
        // The tempo is the transport's, shared by all sequencers (and the Echo): no modulation.
        { id: "bpm", label: "Tempo", min: 50, max: 200, default: 110, step: 1, unit: "bpm", modulatable: false, shared: true },
        // Number of rows, set by dragging the block's bottom edge.
        { id: "rows", label: "Rows", min: 1, max: SEQ_MAX_ROWS, default: SEQ_ROWS, hidden: true },
        ...rowParams,
    ],
    rows: { param: "rows", min: 1, max: SEQ_MAX_ROWS },
    // Switched to notes: at least an octave of rows (C up to C).
    adjust: (params, changed): ParamValues => (changed === "mode" && params.mode === MODE.notes && params.rows < 13 ? { rows: 13 } : {}),
    create(params) {
        const transport = Tone.getTransport();
        transport.bpm.value = params.bpm;

        const values = { ...params };
        const listeners = Array.from({ length: SEQ_MAX_ROWS }, () => new Set<TriggerListener>());
        let current = -1;

        // ——— Notes mode: one voice per row (oscillator → envelope), created when first played ———
        const models: Record<string, (() => ParamValues) | null> = { voice: null, shape: null };
        const mix = new Tone.Gain(1);
        const rowOuts = Array.from({ length: SEQ_MAX_ROWS }, () => new Tone.Gain(1));
        const voices = new Map<number, { osc: Tone.Oscillator; env: Tone.AmplitudeEnvelope }>();
        const voiceOf = (row: number) => {
            let v = voices.get(row);
            if (!v) {
                const osc = new Tone.Oscillator({ volume: SOURCE_DB }).start();
                const env = new Tone.AmplitudeEnvelope();
                osc.connect(env);
                env.fan(rowOuts[row], mix);
                v = { osc, env };
                voices.set(row, v);
            }
            return v;
        };

        const playNotes = (time: number, step: number) => {
            const sound = { ...DEFAULT_VOICE, ...models.voice?.() };
            const shape = { ...DEFAULT_SHAPE, ...models.shape?.() };
            const rows = values.rows ?? SEQ_ROWS;
            for (let row = 0; row < rows; row++) {
                if (!isStepOn(values[rowParam(row)] ?? 0, step)) continue;
                const { osc, env } = voiceOf(row);
                osc.type = SHAPES[sound.shape] ?? "sine";
                osc.frequency.setValueAtTime(rowFrequency(sound.frequency, rows, row), time);
                env.attack = shape.attack;
                env.decay = shape.decay;
                env.sustain = shape.sustain;
                env.release = shape.release;
                env.triggerAttackRelease(shape.attack + shape.decay + shape.hold, time);
            }
        };

        // Subscribe to the shared clock: the step comes from the transport position,
        // so all sequencers stay in sync, and a new one starts on the next step.
        const unsubscribe = onSixteenth((time, n) => {
            const step = n % SEQ_STEPS;
            if (values.mode === MODE.notes) playNotes(time, step);
            else {
                for (let row = 0; row < SEQ_MAX_ROWS; row++) {
                    if (isStepOn(values[rowParam(row)] ?? 0, step)) for (const fn of listeners[row]) fn(time);
                }
            }
            Tone.getDraw().schedule(() => (current = step), time);
        });

        return {
            input: () => undefined,
            output: (port) => (port.startsWith("note") ? rowOuts[Number(port.slice(4))] : mix),
            setParam(param, value) {
                values[param] = value;
                if (param === "bpm") transport.bpm.rampTo(value, 0.1);
            },
            setModel(port, read) {
                models[port] = read;
            },
            listen(port, fn) {
                const set = listeners[Number(port.replace("row", ""))];
                set?.add(fn);
                return () => set?.delete(fn);
            },
            position: () => current,
            dispose: () => {
                unsubscribe();
                listeners.forEach((set) => set.clear());
                for (const { osc, env } of voices.values()) {
                    osc.dispose();
                    env.dispose();
                }
                rowOuts.forEach((g) => g.dispose());
                mix.dispose();
            },
        };
    },
};
