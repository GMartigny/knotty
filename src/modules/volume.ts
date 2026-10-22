import * as Tone from "tone";
import type { ModuleDef } from "./types";

/** Règle le niveau du son qui le traverse. */
export const volume: ModuleDef = {
    type: "volume",
    label: "Volume",
    icon: "◖",
    category: "effect",
    inputs: [{ id: "in", kind: "audio" }],
    outputs: [{ id: "out", kind: "audio" }],
    params: [
        { id: "volume", label: "Volume", min: -40, max: 12, default: 0, step: 0.5, unit: "dB" },
        { id: "mute", label: "Son", min: 0, max: 1, default: 0, options: ["Actif", "Coupé"] },
    ],
    create(params) {
        const node = new Tone.Volume({ volume: params.volume, mute: params.mute === 1 });
        return {
            input: () => node,
            output: () => node,
            setParam(id, value) {
                if (id === "volume") node.volume.rampTo(value, 0.05);
                if (id === "mute") node.mute = value === 1;
            },
            dispose: () => node.dispose(),
        };
    },
};
