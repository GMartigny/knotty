import * as Tone from "tone";
import type { ModuleDef } from "./types";

export const reverb: ModuleDef = {
    type: "reverb",
    label: "Réverb",
    icon: "◎",
    category: "effect",
    inputs: [{ id: "in", kind: "audio" }],
    outputs: [{ id: "out", kind: "audio" }],
    params: [
        { id: "decay", label: "Durée", min: 0.3, max: 10, default: 3, step: 0.1, unit: "s" },
        { id: "wet", label: "Mix", min: 0, max: 1, default: 0.5, step: 0.01 },
    ],
    create(params) {
        // La génération de la réponse impulsionnelle est asynchrone : Tone gère l'attente.
        const node = new Tone.Reverb({ decay: params.decay, wet: params.wet });
        return {
            input: () => node,
            output: () => node,
            setParam(id, value) {
                if (id === "decay") node.decay = value;
                if (id === "wet") node.wet.rampTo(value, 0.05);
            },
            dispose: () => node.dispose(),
        };
    },
};
