import * as Tone from "tone";
import type { ModuleDef } from "./types";

const COLORS = ["white", "pink", "brown"] as const;

export const noise: ModuleDef = {
    type: "noise",
    label: "Bruit",
    icon: "≈",
    category: "source",
    inputs: [],
    outputs: [{ id: "out", kind: "audio" }],
    params: [
        { id: "color", label: "Couleur", min: 0, max: 2, default: 1, options: ["Blanc", "Rose", "Brun"] },
        { id: "volume", label: "Volume", min: -40, max: 0, default: -12, step: 0.5, unit: "dB" },
    ],
    create(params) {
        const node = new Tone.Noise({ type: COLORS[params.color] ?? "pink", volume: params.volume });
        return {
            input: () => undefined,
            output: () => node,
            setParam(id, value) {
                if (id === "color") node.type = COLORS[value] ?? "pink";
                if (id === "volume") node.volume.rampTo(value, 0.05);
            },
            start: () => {
                if (node.state !== "started") node.start();
            },
            dispose: () => node.dispose(),
        };
    },
};
