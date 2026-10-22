import * as Tone from "tone";
import type { ModuleDef } from "./types";

const COLORS = ["white", "pink", "brown"] as const;

/**
 * Bruit continu tant que rien n'est branché sur « Déclencheur » ;
 * dès qu'un câble trigger y arrive, il ne sonne qu'à chaque impulsion, avec une enveloppe courte.
 */
export const noise: ModuleDef = {
    type: "noise",
    label: "Bruit",
    icon: "≈",
    category: "source",
    inputs: [{ id: "gate", kind: "trigger", label: "Déclencheur" }],
    outputs: [{ id: "out", kind: "audio" }],
    params: [
        { id: "color", label: "Couleur", min: 0, max: 2, default: 1, options: ["Blanc", "Rose", "Brun"] },
        { id: "decay", label: "Durée d'un coup", min: 0.02, max: 1.5, default: 0.12, step: 0.01, scale: "log", unit: "s" },
        { id: "volume", label: "Volume", min: -40, max: 0, default: -12, step: 0.5, unit: "dB" },
    ],
    create(params) {
        const source = new Tone.Noise({ type: COLORS[params.color] ?? "pink", volume: params.volume });
        const out = new Tone.Gain(1);
        // Chemin continu, coupé quand le bruit est piloté par des déclenchements.
        const open = new Tone.Gain(1).connect(out);
        const env = new Tone.AmplitudeEnvelope({ attack: 0.002, decay: params.decay, sustain: 0, release: 0.02 }).connect(out);
        source.fan(open, env);

        return {
            input: () => undefined,
            output: () => out,
            setParam(id, value) {
                if (id === "color") source.type = COLORS[value] ?? "pink";
                if (id === "volume") source.volume.rampTo(value, 0.05);
                if (id === "decay") env.decay = value;
            },
            start: () => {
                if (source.state !== "started") source.start();
            },
            trigger: (_port, time) => env.triggerAttackRelease(0.005, time),
            setTriggerConnected: (_port, connected) => open.gain.rampTo(connected ? 0 : 1, 0.03),
            dispose: () => {
                source.dispose();
                open.dispose();
                env.dispose();
                out.dispose();
            },
        };
    },
};
