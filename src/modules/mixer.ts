import * as Tone from "tone";
import type { ModuleDef, ParamDef } from "./types";

/** Channels shown by a new mixer, and the most it can have. */
export const MIXER_CHANNELS = 4;
export const MIXER_MAX_CHANNELS = 16;
export const channelInput = (i: number) => `in${i + 1}`;
export const channelLevel = (i: number) => `level${i + 1}`;

const levels: ParamDef[] = Array.from({ length: MIXER_MAX_CHANNELS }, (_, i) => ({
    id: channelLevel(i),
    row: i,
    label: `Channel ${i + 1}`,
    // The row speaks for itself: one slider per channel, no label.
    bare: true,
    min: 0,
    max: 100,
    default: 75,
    step: 1,
    unit: "%",
    // A single socket per row: the channel's audio input.
    modulatable: false as const,
    inputPort: channelInput(i),
}));

/** Mixes up to 16 sounds, each with its own level, into a single output. */
export const mixer: ModuleDef = {
    type: "mixer",
    label: "Mixer",
    icon: "≡",
    category: "effect",
    // Sockets placed on each channel's row, next to its slider.
    inputs: Array.from({ length: MIXER_MAX_CHANNELS }, (_, i) => ({
        id: channelInput(i),
        row: i,
        kind: "audio" as const,
        label: `Channel ${i + 1}`,
        inline: true,
    })),
    outputs: [{ id: "out", kind: "audio" }],
    params: [
        // Number of channels, set by dragging the block's bottom edge.
        { id: "channels", label: "Channels", min: 1, max: MIXER_MAX_CHANNELS, default: MIXER_CHANNELS, hidden: true },
        ...levels,
    ],
    rows: { param: "channels", min: 1, max: MIXER_MAX_CHANNELS },
    create(values) {
        const out = new Tone.Gain(1);
        const channels = Array.from({ length: MIXER_MAX_CHANNELS }, (_, i) =>
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
