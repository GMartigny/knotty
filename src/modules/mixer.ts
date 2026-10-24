import * as Tone from "tone";
import type { ModuleDef, ParamDef } from "./types";

/** Channels shown by a new mixer, and the most it can have. */
const MIXER_CHANNELS = 4;
const MIXER_MAX_CHANNELS = 16;
const channelInput = (i: number) => `in${i + 1}`;
const channelLevel = (i: number) => `level${i + 1}`;
const channelMute = (i: number) => `mute${i + 1}`;

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
    mute: channelMute(i),
}));

/** A switch per channel to silence it without touching its level. */
const mutes: ParamDef[] = Array.from({ length: MIXER_MAX_CHANNELS }, (_, i) => ({
    id: channelMute(i),
    row: i,
    label: `Mute channel ${i + 1}`,
    min: 0,
    max: 1,
    default: 0,
    step: 1,
    hidden: true,
}));

/** Mixes up to 16 sounds, each with its own level and a mute switch, into a single output. */
export const mixer: ModuleDef = {
    type: "mixer",
    label: "Mixer",
    description: "Mixes up to 16 sounds into one, each with its own level and a mute switch. With one channel, it sets the level of a sound, or how much a modulation moves a setting.",
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
        // After the levels: saved patches key settings by their rank.
        ...mutes,
    ],
    rows: { param: "channels", min: 1, max: MIXER_MAX_CHANNELS },
    create(values) {
        const params = { ...values };
        const gainOf = (i: number) => (params[channelMute(i)] === 1 ? 0 : (params[channelLevel(i)] ?? 75) / 100);
        const out = new Tone.Gain(1);
        const channels = Array.from({ length: MIXER_MAX_CHANNELS }, (_, i) => new Tone.Gain(gainOf(i)).connect(out));
        return {
            input: (port) => channels[Number(port.replace("in", "")) - 1],
            output: () => out,
            setParam(id, value) {
                params[id] = value;
                const i = Number(id.replace(/^\D+/, "")) - 1;
                channels[i]?.gain.rampTo(gainOf(i), 0.05);
            },
            dispose: () => {
                channels.forEach((c) => c.dispose());
                out.dispose();
            },
        };
    },
};
