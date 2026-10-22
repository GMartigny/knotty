import * as Tone from "tone";
import type { ModuleDef } from "./types";

export const output: ModuleDef = {
    type: "output",
    label: "Sortie",
    icon: "◉",
    category: "output",
    inputs: [{ id: "in", kind: "audio" }],
    outputs: [],
    params: [{ id: "volume", label: "Volume", min: -40, max: 6, default: -6, step: 0.5, unit: "dB" }],
    create(params) {
        const node = new Tone.Volume(params.volume);
        // Limiteur de sécurité pour protéger les oreilles des résonances extrêmes.
        const limiter = new Tone.Limiter(-1).toDestination();
        node.connect(limiter);
        return {
            input: () => node,
            output: () => undefined,
            setParam(id, value) {
                if (id === "volume") node.volume.rampTo(value, 0.05);
            },
            dispose: () => {
                node.dispose();
                limiter.dispose();
            },
        };
    },
};
