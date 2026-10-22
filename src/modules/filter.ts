import * as Tone from "tone";
import type { ModuleDef, ParamDef } from "./types";
import { driven, paramDef } from "./mod";

const TYPES = ["lowpass", "highpass", "bandpass"] as const;

const params: ParamDef[] = [
    { id: "mode", label: "Type", min: 0, max: 2, default: 0, options: ["Graves", "Aigus", "Bande"] },
    { id: "frequency", label: "Fréquence", min: 40, max: 12000, default: 900, scale: "log", unit: "Hz" },
    { id: "Q", label: "Résonance", min: 0.1, max: 20, default: 4, step: 0.1 },
];

export const filter: ModuleDef = {
    type: "filter",
    label: "Filtre",
    icon: "◠",
    category: "effect",
    inputs: [{ id: "in", kind: "audio", label: "Entrée" }],
    outputs: [{ id: "out", kind: "audio" }],
    params,
    create(values) {
        const node = new Tone.Filter({ type: TYPES[values.mode] ?? "lowpass" });
        const frequency = driven(node.frequency, paramDef(params, "frequency"), values.frequency);
        const Q = driven(node.Q, paramDef(params, "Q"), values.Q);
        // Échantillons de la sortie pour la mini-onde.
        const waveform = new Tone.Waveform(8192);
        node.connect(waveform);
        return {
            scope: () => waveform.getValue(),
            input: () => node,
            output: () => node,
            setParam(id, value) {
                if (id === "mode") node.type = TYPES[value] ?? "lowpass";
                if (id === "frequency") frequency.set(value);
                if (id === "Q") Q.set(value);
            },
            modTarget: (id) => (id === "frequency" ? frequency.modTarget : id === "Q" ? Q.modTarget : undefined),
            dispose: () => {
                waveform.dispose();
                frequency.dispose();
                Q.dispose();
                node.dispose();
            },
        };
    },
};
