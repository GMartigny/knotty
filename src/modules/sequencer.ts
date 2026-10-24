import * as Tone from "tone";
import { onSixteenth } from "../audio/clock";
import { frequencyOf, midiC } from "./notes";
import { SHAPES } from "./sine";
import { SOURCE_DB, type Model, type ModuleDef, type ModuleInstance, type ParamDef, type ParamValues, type TriggerListener } from "./types";

/** Rows shown by a new sequencer, and the most it can have. */
const SEQ_ROWS = 4;
const SEQ_MAX_ROWS = 16;
export const SEQ_STEPS = 16;

export const MODE = { tracks: 0, notes: 1 } as const;

/** Notes mode, nothing plugged in: a sine on C4, and a short, soft envelope. */
export const DEFAULT_VOICE = { shape: 0, frequency: frequencyOf(midiC(4)), glide: 0 };
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

/**
 * Notes mode, with the Oscillator's Glide: where a new note slides from, the closest note of the
 * previous step that had notes (as intervals from the bottom row), or nowhere if there was none.
 */
export const glideFrom = (previous: number[], interval: number) =>
    previous.length ? previous.reduce((a, b) => (Math.abs(Math.log(b / interval)) < Math.abs(Math.log(a / interval)) ? b : a)) : undefined;

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
 * Effects a Notes sequencer copies when they sit between its model Envelope and its model input,
 * and the input their sound comes in by. (No Reverb: a copy per note would cost a lot for a sound
 * that is the same on the mix.)
 */
export const MODEL_EFFECTS: Record<string, string> = { distortion: "in", filter: "in", echo: "in", transpose: "in", mixer: "in1" };

/**
 * From the block plugged into the model input, upstream: the effects to copy, in playing order
 * (the one right after the Envelope first), and the Envelope at the start of the chain, if any.
 */
export function modelChain(model: Model | null | undefined): { envelope?: Model; effects: Model[] } {
    const effects: Model[] = [];
    let m = model ?? undefined;
    while (m && m.type !== "envelope" && MODEL_EFFECTS[m.type] && effects.length < 16) {
        effects.unshift(m);
        m = m.input(MODEL_EFFECTS[m.type]);
    }
    return { envelope: m?.type === "envelope" ? m : undefined, effects };
}

/**
 * Sequencer, two modes:
 * - Tracks: each row is a track with its own trigger output, a hit on every lit step (drums…);
 * - Notes: a piano roll that plays itself. An Envelope plugged in as a model gives the shape of the notes,
 *   and the Oscillator plugged into that Envelope gives their sound: its shape, its frequency (slider
 *   and modulation, live) for the bottom row, each row above a semitone higher, and its Glide (each note
 *   slides from the closest note of the previous step). Effects between the Envelope and the model input
 *   (Distortion, Filter, Echo, Transpose, one-channel Mixer) are copied too, one copy per note, so each
 *   note is distorted on its own. Its sound comes out mixed, and row by row.
 */
export const sequencer: ModuleDef = {
    type: "sequencer",
    label: "Sequencer",
    description:
        "Plays its steps in a loop. Tracks mode: a trigger output per row, for drums. Notes mode: a piano roll that plays itself, sounding like the Envelope (with its Oscillator and effects) plugged in.",
    icon: "▦",
    category: "sequencer",
    inputs: [
        {
            id: "model",
            kind: "audio",
            label: "Envelope (with its Oscillator and effects) to copy",
            model: true,
            accepts: ["envelope", ...Object.keys(MODEL_EFFECTS)],
            when: notes,
        },
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
        let model: Model | null = null;
        const mix = new Tone.Gain(1);
        const rowOuts = Array.from({ length: SEQ_MAX_ROWS }, () => new Tone.Gain(1));
        /**
         * A row's voice. Its frequency follows the model Oscillator's live frequency (slider + modulation)
         * through `ratio`, the row's interval; with no Oscillator, it is set directly.
         */
        interface Voice {
            row: number;
            osc: Tone.Oscillator;
            env: Tone.AmplitudeEnvelope;
            ratio: Tone.Multiply;
            follows?: Tone.ToneAudioNode;
            /** Its copies of the model's effects, after the envelope, and their types ("distortion,filter"). */
            effects: { instance: ModuleInstance; params: ParamValues; index: number }[];
            chain: string;
        }
        const voices = new Map<number, Voice>();
        const voiceOf = (row: number) => {
            let v = voices.get(row);
            if (!v) {
                const osc = new Tone.Oscillator({ volume: SOURCE_DB }).start();
                const env = new Tone.AmplitudeEnvelope();
                const ratio = new Tone.Multiply(1);
                osc.connect(env);
                env.fan(rowOuts[row], mix);
                v = { row, osc, env, ratio, effects: [], chain: "" };
                voices.set(row, v);
            }
            return v;
        };
        const disposeEffects = (v: Voice) => {
            for (const { instance } of v.effects) instance.dispose();
            v.effects = [];
        };
        /** Gives a voice its own copy of the model's effects (rebuilt if the chain changed), with their current settings. */
        const copyEffects = (v: Voice, effects: Model[]) => {
            const chain = effects.map((e) => e.type).join(",");
            if (chain !== v.chain) {
                v.env.disconnect();
                disposeEffects(v);
                let last: Tone.ToneAudioNode = v.env;
                for (const [index, e] of effects.entries()) {
                    const params = e.params();
                    const instance = e.copy();
                    if (!instance) continue;
                    instance.start?.();
                    const into = instance.input(MODEL_EFFECTS[e.type]);
                    const out = instance.output("out");
                    if (!into || !out) {
                        instance.dispose();
                        continue;
                    }
                    last.connect(into as Tone.InputNode);
                    last = out as Tone.ToneAudioNode;
                    v.effects.push({ instance, params, index });
                }
                last.fan(rowOuts[v.row], mix);
                v.chain = chain;
            }
            // Settings changed on the model's effects since the last note.
            v.effects.forEach((copy) => {
                const params = effects[copy.index]?.params();
                if (!params || params === copy.params) return;
                for (const [key, value] of Object.entries(params)) if (copy.params[key] !== value) copy.instance.setParam(key, value);
                copy.params = params;
            });
        };
        /** Plugs a voice's frequency to the model Oscillator's live frequency (or unplugs it). */
        const follow = (v: Voice, frequency: Tone.ToneAudioNode | undefined) => {
            if (v.follows === frequency) return;
            if (v.follows) {
                try {
                    v.follows.disconnect(v.ratio);
                } catch {
                    // the Oscillator it followed is gone
                }
                v.ratio.disconnect();
            }
            v.follows = frequency;
            if (frequency) frequency.chain(v.ratio, v.osc.frequency);
        };

        /** Notes of the last step that played some (intervals from the bottom row), for the glide. */
        let previousNotes: number[] = [];
        const playNotes = (time: number, step: number) => {
            const { envelope, effects } = modelChain(model);
            const oscillator = envelope?.input("in");
            const sine = oscillator?.type === "sine" ? oscillator : undefined;
            const sound = { ...DEFAULT_VOICE, ...sine?.params() };
            const shape = { ...DEFAULT_SHAPE, ...envelope?.params() };
            const live = sine?.tap("frequency");
            const glide = sound.glide ?? 0;
            const rows = values.rows ?? SEQ_ROWS;
            const played: number[] = [];
            for (let row = 0; row < rows; row++) {
                if (!isStepOn(values[rowParam(row)] ?? 0, step)) continue;
                const v = voiceOf(row);
                const { osc, env } = v;
                copyEffects(v, effects);
                osc.type = SHAPES[sound.shape] ?? "sine";
                follow(v, live);
                const interval = rowFrequency(1, rows, row);
                played.push(interval);
                // Following the Oscillator, a voice sets its interval; otherwise its own frequency.
                const pitch = live ? v.ratio.factor : osc.frequency;
                const scale = live ? 1 : sound.frequency;
                // With a Glide, the note slides from the closest note of the previous step.
                const from = glide > 0 ? glideFrom(previousNotes, interval) : undefined;
                pitch.cancelScheduledValues(time);
                if (from !== undefined && from !== interval) {
                    pitch.setValueAtTime(from * scale, time);
                    pitch.exponentialRampToValueAtTime(interval * scale, time + glide);
                } else pitch.setValueAtTime(interval * scale, time);
                env.attack = shape.attack;
                env.decay = shape.decay;
                env.sustain = shape.sustain;
                env.release = shape.release;
                env.triggerAttackRelease(shape.attack + shape.decay + shape.hold, time);
            }
            if (played.length) previousNotes = played;
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
            setModel(_port, plugged) {
                model = plugged;
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
                for (const v of voices.values()) {
                    const { osc, env, ratio } = v;
                    disposeEffects(v);
                    osc.dispose();
                    env.dispose();
                    ratio.dispose();
                }
                rowOuts.forEach((g) => g.dispose());
                mix.dispose();
            },
        };
    },
};
