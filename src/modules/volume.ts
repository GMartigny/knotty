import * as Tone from "tone";
import type { ModuleDef } from "./types";
import { DrivenParam } from "./mod";

/** Sets the level of the sound going through. Modulated, it makes a tremolo. */
export const volume: ModuleDef = {
    type: "volume",
    label: "Volume",
    description: "Sets the level of a sound. Modulated, it makes a tremolo.",
    icon: "◖",
    category: "effect",
    inputs: [{ id: "in", kind: "audio", label: "Input" }],
    outputs: [{ id: "out", kind: "audio" }],
    params: [
        { id: "volume", label: "Volume", min: -40, max: 12, default: 0, step: 0.5, unit: "dB" },
        { id: "mute", label: "Sound", min: 0, max: 1, default: 0, options: ["On", "Muted"] },
    ],
    create(params) {
        const node = new Tone.Volume({ volume: params.volume, mute: params.mute === 1 });
        // Linear gain after the dB volume: modulation varies the level from 0 to 2×.
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
