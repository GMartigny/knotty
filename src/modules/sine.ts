import * as Tone from "tone";
import type { ModuleDef, ParamDef } from "./types";
import { driven, paramDef } from "./mod";

const params: ParamDef[] = [
    // Descend jusqu'à 0,1 Hz pour servir d'oscillateur lent (modulation).
    { id: "frequency", label: "Fréquence", min: 0.1, max: 2000, default: 220, scale: "log", unit: "Hz" },
];

/** Onde sinusoïdale continue. Pour la découper en notes, la faire passer dans une Enveloppe. */
export const sine: ModuleDef = {
    type: "sine",
    label: "Sinus",
    icon: "∿",
    category: "source",
    inputs: [],
    outputs: [{ id: "out", kind: "audio" }],
    params,
    create(values) {
        // Niveau fixe : le volume se règle avec un bloc Volume.
        const source = new Tone.Oscillator({ type: "sine", volume: -12 });
        const frequency = driven(source.frequency, paramDef(params, "frequency"), values.frequency);
        return {
            input: () => undefined,
            output: () => source,
            setParam(id, value) {
                if (id === "frequency") frequency.set(value);
            },
            start: () => {
                if (source.state !== "started") source.start();
            },
            modTarget: (id) => (id === "frequency" ? frequency.modTarget : undefined),
            dispose: () => {
                frequency.dispose();
                source.dispose();
            },
        };
    },
};
