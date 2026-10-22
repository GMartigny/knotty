import * as Tone from "tone";
import type { ModuleDef, ParamDef } from "./types";

export const MIXER_CHANNELS = 4;
export const channelInput = (i: number) => `in${i + 1}`;
export const channelLevel = (i: number) => `level${i + 1}`;

const params: ParamDef[] = Array.from({ length: MIXER_CHANNELS }, (_, i) => ({
    id: channelLevel(i),
    label: `Channel ${i + 1}`,
    min: 0,
    max: 100,
    default: 75,
    step: 1,
    unit: "%",
    // A single socket per row: the channel's audio input.
    modulatable: false as const,
    inputPort: channelInput(i),
}));

/** Mixes up to 4 sounds, each with its own level, into a single output. */
export const mixer: ModuleDef = {
    type: "mixer",
    label: "Mixer",
    icon: "≡",
    category: "effect",
    // Sockets placed on each channel's row, next to its slider.
    inputs: Array.from({ length: MIXER_CHANNELS }, (_, i) => ({
        id: channelInput(i),
        kind: "audio" as const,
        label: `Channel ${i + 1}`,
        inline: true,
    })),
    outputs: [{ id: "out", kind: "audio" }],
    params,
    create(values) {
        const out = new Tone.Gain(1);
        const channels = Array.from({ length: MIXER_CHANNELS }, (_, i) =>
            new Tone.Gain((values[channelLevel(i)] ?? 75) / 100).connect(out),
        );
        return {
            input: (port) => channels[Number(port.replace("in", "")) - 1],
            output: () => out,
            setParam(id, value) {
                const i = Number(id.replace("level", "")) - 1;
                channels[i]?.gain.rampTo(value / 100, 0.05);
            },
            dispose: () => {
                channels.forEach((c) => c.dispose());
                out.dispose();
            },
        };
    },
};
