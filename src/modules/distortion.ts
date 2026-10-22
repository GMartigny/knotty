import * as Tone from "tone";
import { SOURCE_LEVEL, type ModuleDef, type ParamDef } from "./types";
import { driven, paramDef } from "./mod";

const params: ParamDef[] = [
    { id: "drive", label: "Intensité", min: 1, max: 60, default: 8, scale: "log", step: 0.1 },
    { id: "wet", label: "Mix", min: 0, max: 1, default: 1, step: 0.01 },
];

/**
 * Le niveau de la partie saturée est compensé pour qu'un son à niveau normal ressorte
 * à peu près aussi fort, quelle que soit l'intensité.
 */
const makeup = (drive: number) => SOURCE_LEVEL / Math.tanh(SOURCE_LEVEL * drive);

/** Sature le son : chaud à faible intensité, agressif à forte intensité. */
export const distortion: ModuleDef = {
    type: "distortion",
    label: "Distorsion",
    icon: "ϟ",
    category: "effect",
    inputs: [{ id: "in", kind: "audio", label: "Entrée" }],
    outputs: [{ id: "out", kind: "audio" }],
    params,
    create(values) {
        const input = new Tone.Gain(1);
        // Gain d'entrée piloté (et modulable), puis courbe en tangente : plus on pousse, plus ça écrase.
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
