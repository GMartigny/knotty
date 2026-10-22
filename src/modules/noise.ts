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
        { id: "decay", label: "Durée d'un coup", min: 0.02, max: 1.5, default: 0.12, step: 0.01, scale: "log", unit: "s", activeWith: "gate" },
    ],
    create(params) {
        // Niveau fixe : le volume se règle avec un bloc Volume.
        const source = new Tone.Noise({ type: COLORS[params.color] ?? "pink", volume: -12 });
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
                if (id === "decay") env.decay = value;
            },
            start: () => {
                if (source.state !== "started") source.start();
            },
            // Relâcher seulement après l'attaque et le déclin, sinon le déclin n'a pas le temps de jouer.
            trigger: (_port, time) => env.triggerAttackRelease(Number(env.attack) + Number(env.decay), time),
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
