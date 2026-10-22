import * as Tone from "tone";
import type { ModuleDef } from "./types";

const TYPES = ["lowpass", "highpass", "bandpass"] as const;

export const filter: ModuleDef = {
    type: "filter",
    label: "Filtre",
    icon: "◠",
    category: "effect",
    inputs: [{ id: "in", kind: "audio" }],
    outputs: [{ id: "out", kind: "audio" }],
    params: [
        { id: "mode", label: "Type", min: 0, max: 2, default: 0, options: ["Graves", "Aigus", "Bande"] },
        { id: "frequency", label: "Fréquence", min: 40, max: 12000, default: 900, scale: "log", unit: "Hz" },
        { id: "Q", label: "Résonance", min: 0.1, max: 20, default: 4, step: 0.1 },
    ],
    create(params) {
        const node = new Tone.Filter({
            type: TYPES[params.mode] ?? "lowpass",
            frequency: params.frequency,
            Q: params.Q,
        });
        return {
            input: () => node,
            output: () => node,
            setParam(id, value) {
                if (id === "mode") node.type = TYPES[value] ?? "lowpass";
                if (id === "frequency") node.frequency.rampTo(value, 0.05);
                if (id === "Q") node.Q.rampTo(value, 0.05);
            },
            dispose: () => node.dispose(),
        };
    },
};
