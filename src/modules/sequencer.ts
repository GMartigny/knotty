import * as Tone from "tone";
import type { ModuleDef, ParamDef, TriggerListener } from "./types";

export const SEQ_ROWS = 4;
export const SEQ_STEPS = 16;

/** Motifs de départ, un entier par ligne : le bit i allume le pas i. */
const DEFAULT_PATTERNS = [
    0b0101010101010101, // un coup sur deux
    0b0001000000010000, // contretemps
    0b0000000000000000,
    0b0000000000000000,
];

export const rowParam = (row: number) => `row${row}`;
export const rowOutput = (row: number) => `row${row}`;
export const isStepOn = (pattern: number, step: number) => (pattern & (1 << step)) !== 0;
export const toggleStep = (pattern: number, step: number) => pattern ^ (1 << step);

const rowParams: ParamDef[] = Array.from({ length: SEQ_ROWS }, (_, row) => ({
    id: rowParam(row),
    label: `Ligne ${row + 1}`,
    min: 0,
    max: 2 ** SEQ_STEPS - 1,
    default: DEFAULT_PATTERNS[row] ?? 0,
    hidden: true,
}));

export const sequencer: ModuleDef = {
    type: "sequencer",
    label: "Séquenceur",
    icon: "▦",
    category: "sequencer",
    inputs: [],
    outputs: Array.from({ length: SEQ_ROWS }, (_, row) => ({
        id: rowOutput(row),
        kind: "trigger" as const,
        label: `Ligne ${row + 1}`,
        inline: true,
    })),
    params: [{ id: "bpm", label: "Tempo", min: 50, max: 200, default: 110, step: 1, unit: "bpm" }, ...rowParams],
    create(params) {
        const transport = Tone.getTransport();
        transport.bpm.value = params.bpm;

        const patterns = Array.from({ length: SEQ_ROWS }, (_, row) => params[rowParam(row)] ?? 0);
        const listeners = Array.from({ length: SEQ_ROWS }, () => new Set<TriggerListener>());
        let current = -1;

        // Le pas est déduit de la position du transport : plusieurs séquenceurs restent calés entre eux.
        const sixteenth = Tone.Time("16n").toTicks();
        const id = transport.scheduleRepeat((time) => {
            const step = Math.round(transport.getTicksAtTime(time) / sixteenth) % SEQ_STEPS;
            for (let row = 0; row < SEQ_ROWS; row++) {
                if (isStepOn(patterns[row], step)) for (const fn of listeners[row]) fn(time);
            }
            Tone.getDraw().schedule(() => (current = step), time);
        }, "16n");

        return {
            input: () => undefined,
            output: () => undefined,
            setParam(param, value) {
                if (param === "bpm") transport.bpm.rampTo(value, 0.1);
                const row = Number(param.replace("row", ""));
                if (param.startsWith("row") && row < SEQ_ROWS) patterns[row] = value;
            },
            listen(port, fn) {
                const set = listeners[Number(port.replace("row", ""))];
                set?.add(fn);
                return () => set?.delete(fn);
            },
            position: () => current,
            dispose: () => {
                transport.clear(id);
                listeners.forEach((set) => set.clear());
            },
        };
    },
};
