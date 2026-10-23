import * as Tone from "tone";
import type { ModuleDef, ParamDef } from "./types";
import { driven, paramDef } from "./mod";

const TYPES = ["lowpass", "highpass", "bandpass"] as const;

const params: ParamDef[] = [
    { id: "mode", label: "Type", min: 0, max: 2, default: 0, options: ["Low", "High", "Band"] },
    { id: "frequency", label: "Frequency", min: 40, max: 12000, default: 900, scale: "log", unit: "Hz" },
    { id: "Q", label: "Resonance", min: 0.1, max: 20, default: 4, step: 0.1 },
];

export const filter: ModuleDef = {
    type: "filter",
    label: "Filter",
    description: "Keeps the low, the high or the middle frequencies. Its resonance makes it sing.",
    icon: "◠",
    category: "effect",
    inputs: [{ id: "in", kind: "audio", label: "Input" }],
    outputs: [{ id: "out", kind: "audio" }],
    params,
    create(values) {
        const node = new Tone.Filter({ type: TYPES[values.mode] ?? "lowpass" });
        const frequency = driven(node.frequency, paramDef(params, "frequency"), values.frequency);
        const Q = driven(node.Q, paramDef(params, "Q"), values.Q);
        return {
            input: () => node,
            output: () => node,
            setParam(id, value) {
                if (id === "mode") node.type = TYPES[value] ?? "lowpass";
                if (id === "frequency") frequency.set(value);
                if (id === "Q") Q.set(value);
            },
            modTarget: (id) => (id === "frequency" ? frequency.modTarget : id === "Q" ? Q.modTarget : undefined),
            dispose: () => {
                frequency.dispose();
                Q.dispose();
                node.dispose();
            },
        };
    },
};
