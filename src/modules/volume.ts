import * as Tone from "tone";
import type { ModuleDef } from "./types";
import { DrivenParam } from "./mod";

/** Règle le niveau du son qui le traverse. Modulé, il fait un trémolo. */
export const volume: ModuleDef = {
    type: "volume",
    label: "Volume",
    icon: "◖",
    category: "effect",
    inputs: [{ id: "in", kind: "audio", label: "Entrée" }],
    outputs: [{ id: "out", kind: "audio" }],
    params: [
        { id: "volume", label: "Volume", min: -40, max: 12, default: 0, step: 0.5, unit: "dB" },
        { id: "mute", label: "Son", min: 0, max: 1, default: 0, options: ["Actif", "Coupé"] },
    ],
    create(params) {
        const node = new Tone.Volume({ volume: params.volume, mute: params.mute === 1 });
        // Gain linéaire après le volume en dB : la modulation y fait varier le niveau de 0 à 2×.
        const tremolo = new Tone.Gain(0);
        node.connect(tremolo);
        const level = new DrivenParam(tremolo.gain, 1, () => 1);
        return {
            input: () => node,
            output: () => tremolo,
            setParam(id, value) {
                if (id === "volume") node.volume.rampTo(value, 0.05);
                if (id === "mute") node.mute = value === 1;
            },
            modTarget: (id) => (id === "volume" ? level.modTarget : undefined),
            dispose: () => {
                level.dispose();
                tremolo.dispose();
                node.dispose();
            },
        };
    },
};
