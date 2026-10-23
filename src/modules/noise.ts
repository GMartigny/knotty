import * as Tone from "tone";
import { SOURCE_DB, type ModuleDef } from "./types";

const COLORS = ["white", "pink", "brown"] as const;

/** Continuous noise. To cut it into hits, run it through an Envelope. */
export const noise: ModuleDef = {
    type: "noise",
    label: "Noise",
    description: "A continuous hiss, white, pink or brown. Through an Envelope and a Filter, it makes drums.",
    icon: "≈",
    category: "source",
    inputs: [],
    outputs: [{ id: "out", kind: "audio" }],
    params: [{ id: "color", label: "Color", min: 0, max: 2, default: 1, options: ["White", "Pink", "Brown"] }],
    create(values) {
        // Fixed level: loudness is set with a Mixer (one channel is enough).
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
