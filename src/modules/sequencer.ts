import * as Tone from "tone";
import { onSixteenth } from "../audio/clock";
import type { ModuleDef, ParamDef, TriggerListener } from "./types";

/** Rows shown by a new sequencer, and the most it can have. */
export const SEQ_ROWS = 4;
export const SEQ_MAX_ROWS = 16;
export const SEQ_STEPS = 16;

/** Starting patterns, one integer per row: bit i turns step i on. */
const DEFAULT_PATTERNS = [
    0b0101010101010101, // every other step
    0b0001000000010000, // offbeat
    0b0000000000000000,
    0b0000000000000000,
];

export const rowParam = (row: number) => `row${row}`;
export const rowOutput = (row: number) => `row${row}`;
export const isStepOn = (pattern: number, step: number) => (pattern & (1 << step)) !== 0;
export const toggleStep = (pattern: number, step: number) => pattern ^ (1 << step);

const rowParams: ParamDef[] = Array.from({ length: SEQ_MAX_ROWS }, (_, row) => ({
    id: rowParam(row),
    row,
    label: `Row ${row + 1}`,
    min: 0,
    max: 2 ** SEQ_STEPS - 1,
    default: DEFAULT_PATTERNS[row] ?? 0,
    hidden: true,
}));

export const sequencer: ModuleDef = {
    type: "sequencer",
    label: "Sequencer",
    icon: "▦",
    category: "sequencer",
    inputs: [],
    outputs: Array.from({ length: SEQ_MAX_ROWS }, (_, row) => ({
        id: rowOutput(row),
        row,
        kind: "trigger" as const,
        label: `Row ${row + 1}`,
        inline: true,
    })),
    params: [
        // The tempo drives the whole sequencer: no modulation.
        { id: "bpm", label: "Tempo", min: 50, max: 200, default: 110, step: 1, unit: "bpm", modulatable: false },
        // Number of rows, set by dragging the block's bottom edge.
        { id: "rows", label: "Rows", min: 1, max: SEQ_MAX_ROWS, default: SEQ_ROWS, hidden: true },
        ...rowParams,
    ],
    rows: { param: "rows", min: 1, max: SEQ_MAX_ROWS },
    create(params) {
        const transport = Tone.getTransport();
        transport.bpm.value = params.bpm;

        const patterns = Array.from({ length: SEQ_MAX_ROWS }, (_, row) => params[rowParam(row)] ?? 0);
        const listeners = Array.from({ length: SEQ_MAX_ROWS }, () => new Set<TriggerListener>());
        let current = -1;

        // Subscribe to the shared clock: the step comes from the transport position,
        // so all sequencers stay in sync, and a new one starts on the next step.
        const unsubscribe = onSixteenth((time, n) => {
            const step = n % SEQ_STEPS;
            for (let row = 0; row < SEQ_MAX_ROWS; row++) {
                if (isStepOn(patterns[row], step)) for (const fn of listeners[row]) fn(time);
            }
            Tone.getDraw().schedule(() => (current = step), time);
        });

        return {
            input: () => undefined,
            output: () => undefined,
            setParam(param, value) {
                if (param === "bpm") transport.bpm.rampTo(value, 0.1);
                const row = Number(param.replace("row", ""));
                if (param.startsWith("row") && row < SEQ_MAX_ROWS) patterns[row] = value;
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
            },
        };
    },
};
