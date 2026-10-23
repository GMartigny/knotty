import * as Tone from "tone";
import type { ModuleDef, ParamDef } from "./types";
import { driven, paramDef } from "./mod";

const params: ParamDef[] = [
    // Changing the decay recomputes the whole reverb: no modulation.
    { id: "decay", label: "Decay", min: 0.3, max: 10, default: 3, step: 0.1, unit: "s", modulatable: false },
    { id: "wet", label: "Mix", min: 0, max: 1, default: 0.5, step: 0.01 },
];

export const reverb: ModuleDef = {
    type: "reverb",
    label: "Reverb",
    description: "Puts the sound in a room, from a small one to a cathedral.",
    icon: "◎",
    category: "effect",
    inputs: [{ id: "in", kind: "audio", label: "Input" }],
    outputs: [{ id: "out", kind: "audio" }],
    params,
    create(values) {
        // Generating the impulse response is asynchronous: Tone handles the wait.
        const node = new Tone.Reverb({ decay: values.decay });
        const wet = driven(node.wet, paramDef(params, "wet"), values.wet);
        return {
            input: () => node,
            output: () => node,
            setParam(id, value) {
                if (id === "decay") node.decay = value;
                if (id === "wet") wet.set(value);
            },
            modTarget: (id) => (id === "wet" ? wet.modTarget : undefined),
            dispose: () => {
                wet.dispose();
                node.dispose();
            },
        };
    },
};
