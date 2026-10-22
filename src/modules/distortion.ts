import * as Tone from "tone";
import { SOURCE_LEVEL, type ModuleDef, type ParamDef } from "./types";
import { driven, paramDef } from "./mod";

const params: ParamDef[] = [
    { id: "drive", label: "Drive", min: 1, max: 60, default: 8, scale: "log", step: 0.1 },
    { id: "wet", label: "Mix", min: 0, max: 1, default: 1, step: 0.01 },
];

/**
 * The level of the distorted part is compensated so that a sound at normal level comes out
 * roughly as loud, whatever the drive.
 */
const makeup = (drive: number) => SOURCE_LEVEL / Math.tanh(SOURCE_LEVEL * drive);

/** Saturates the sound: warm at low drive, aggressive at high drive. */
export const distortion: ModuleDef = {
    type: "distortion",
    label: "Distortion",
    icon: "ϟ",
    category: "effect",
    inputs: [{ id: "in", kind: "audio", label: "Input" }],
    outputs: [{ id: "out", kind: "audio" }],
    params,
    create(values) {
        const input = new Tone.Gain(1);
        // Driven (and modulatable) input gain, then a tanh curve: the harder you push, the more it squashes.
        const boost = new Tone.Gain(0);
        const shaper = new Tone.WaveShaper((x) => Math.tanh(x), 4096);
        const level = new Tone.Gain(makeup(values.drive));
        const mix = new Tone.CrossFade();
        input.connect(mix.a);
        input.chain(boost, shaper, level, mix.b);
        const drive = driven(boost.gain, paramDef(params, "drive"), values.drive);
        const wet = driven(mix.fade, paramDef(params, "wet"), values.wet);

        return {
            input: () => input,
            output: () => mix,
            setParam(id, value) {
                if (id === "drive") {
                    drive.set(value);
                    level.gain.rampTo(makeup(value), 0.05);
                }
                if (id === "wet") wet.set(value);
            },
            modTarget: (id) => (id === "drive" ? drive.modTarget : id === "wet" ? wet.modTarget : undefined),
            dispose: () => {
                drive.dispose();
                wet.dispose();
                [input, boost, shaper, level, mix].forEach((n) => n.dispose());
            },
        };
    },
};
