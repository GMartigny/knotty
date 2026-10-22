import * as Tone from "tone";
import type { ModuleDef, ParamDef } from "./types";

export const MIXER_CHANNELS = 4;
export const channelInput = (i: number) => `in${i + 1}`;
export const channelLevel = (i: number) => `level${i + 1}`;

const params: ParamDef[] = Array.from({ length: MIXER_CHANNELS }, (_, i) => ({
    id: channelLevel(i),
    label: `Voie ${i + 1}`,
    min: 0,
    max: 100,
    default: 75,
    step: 1,
    unit: "%",
    // Une seule prise par ligne : celle de l'entrée son de la voie.
    modulatable: false as const,
    inputPort: channelInput(i),
}));

/** Mélange jusqu'à 4 sons, chacun avec son niveau, vers une seule sortie. */
export const mixer: ModuleDef = {
    type: "mixer",
    label: "Mixeur",
    icon: "≡",
    category: "effect",
    // Prises placées sur la ligne de chaque voie, à côté de son curseur.
    inputs: Array.from({ length: MIXER_CHANNELS }, (_, i) => ({
        id: channelInput(i),
        kind: "audio" as const,
        label: `Voie ${i + 1}`,
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
