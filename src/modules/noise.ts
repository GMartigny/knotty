import * as Tone from "tone";
import { SOURCE_DB, type ModuleDef } from "./types";

const COLORS = ["white", "pink", "brown"] as const;

/** Bruit continu. Pour le découper en coups, le faire passer dans une Enveloppe. */
export const noise: ModuleDef = {
    type: "noise",
    label: "Bruit",
    icon: "≈",
    category: "source",
    inputs: [],
    outputs: [{ id: "out", kind: "audio" }],
    params: [{ id: "color", label: "Couleur", min: 0, max: 2, default: 1, options: ["Blanc", "Rose", "Brun"] }],
    create(values) {
        // Niveau fixe : le volume se règle avec un bloc Volume.
        const source = new Tone.Noise({ type: COLORS[values.color] ?? "pink", volume: SOURCE_DB });
        return {
            input: () => undefined,
            output: () => source,
            setParam(id, value) {
                if (id === "color") source.type = COLORS[value] ?? "pink";
            },
            start: () => {
                if (source.state !== "started") source.start();
            },
            dispose: () => source.dispose(),
        };
    },
};
