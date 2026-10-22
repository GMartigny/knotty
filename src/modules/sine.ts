import * as Tone from "tone";
import { SOURCE_DB, type ModuleDef, type ParamDef } from "./types";
import { driven, paramDef } from "./mod";

export const SHAPES = ["sine", "square", "triangle", "sawtooth"] as const;

const params: ParamDef[] = [
    { id: "shape", label: "Forme", min: 0, max: 3, default: 0, options: ["Sinus", "Carré", "Triangle", "Scie"] },
    // Descend jusqu'à 0,1 Hz pour servir d'oscillateur lent (modulation).
    { id: "frequency", label: "Fréquence", min: 0.1, max: 2000, default: 220, scale: "log", unit: "Hz" },
    // Temps pour glisser d'une note reçue à la suivante (0 = saut net), comme un doigt qui glisse sur la corde.
    { id: "glide", label: "Glissé", min: 0, max: 0.5, default: 0, step: 0.005, unit: "s", modulatable: false },
];

/** Oscillateur continu (sinus, carré, triangle, dent de scie). Pour le découper en notes, le faire passer dans une Enveloppe. */
export const sine: ModuleDef = {
    type: "sine",
    label: "Oscillateur",
    icon: "∿",
    category: "source",
    // Une note reçue (depuis un Clavier) fixe la fréquence jusqu'à la suivante.
    inputs: [{ id: "note", kind: "trigger", label: "Note" }],
    outputs: [{ id: "out", kind: "audio" }],
    params,
    create(values) {
        // Niveau fixe : le volume se règle avec un bloc Volume.
        const source = new Tone.Oscillator({ type: SHAPES[values.shape] ?? "sine", volume: SOURCE_DB });
        const frequency = driven(source.frequency, paramDef(params, "frequency"), values.frequency);
        let glide = values.glide ?? 0;
        // Échantillons pour la mini-onde affichée dans le bloc.
        // ~0,34 s de mémoire à 48 kHz : assez pour caler l'onde jusqu'à ~7 Hz.
        const waveform = new Tone.Waveform(16384);
        source.connect(waveform);
        return {
            scope: () => waveform.getValue(),
            pitch: () => frequency.value,
            trigger: (_port, time, note) => {
                if (note) frequency.jump(note, time, glide);
            },
            input: () => undefined,
            output: () => source,
            setParam(id, value) {
                if (id === "frequency") frequency.set(value);
                if (id === "shape") source.type = SHAPES[value] ?? "sine";
                if (id === "glide") glide = value;
            },
            start: () => {
                if (source.state !== "started") source.start();
            },
            modTarget: (id) => (id === "frequency" ? frequency.modTarget : undefined),
            dispose: () => {
                waveform.dispose();
                frequency.dispose();
                source.dispose();
            },
        };
    },
};
