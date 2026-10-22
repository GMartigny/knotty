import * as Tone from "tone";
import type { ModuleDef } from "./types";

/** Sends the sound to the speakers. The level is set upstream with a Volume block. */
export const output: ModuleDef = {
    type: "output",
    label: "Output",
    icon: "◉",
    category: "output",
    inputs: [{ id: "in", kind: "audio" }],
    outputs: [],
    // Switch shown in the block header (1 = sound on).
    params: [{ id: "on", label: "Sound", min: 0, max: 1, default: 1, hidden: true }],
    create(params) {
        const node = new Tone.Volume({ volume: -6, mute: params.on === 0 });
        // Safety limiter to protect ears from extreme resonances.
        const limiter = new Tone.Limiter(-1).toDestination();
        node.connect(limiter);
        return {
            input: () => node,
            output: () => undefined,
            setParam(id, value) {
                if (id === "on") node.mute = value === 0;
            },
            dispose: () => {
                node.dispose();
                limiter.dispose();
            },
        };
    },
};
