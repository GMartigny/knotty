import * as Tone from "tone";
import { ModReader, type ModuleDef, type ParamDef } from "./types";

const COLORS = ["white", "pink", "brown"] as const;

const params: ParamDef[] = [
    { id: "color", label: "Couleur", min: 0, max: 2, default: 1, options: ["Blanc", "Rose", "Brun"] },
    { id: "decay", label: "Durée d'un coup", min: 0.02, max: 1.5, default: 0.12, step: 0.01, scale: "log", unit: "s", activeWith: "gate" },
];

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
    params,
    create(values) {
        // Niveau fixe : le volume se règle avec un bloc Volume.
        const source = new Tone.Noise({ type: COLORS[values.color] ?? "pink", volume: -12 });
        const mods = new ModReader(params);
        let decay = values.decay;
        const out = new Tone.Gain(1);
        // Chemin continu, coupé quand le bruit est piloté par des déclenchements.
        const open = new Tone.Gain(1).connect(out);
        const env = new Tone.AmplitudeEnvelope({ attack: 0.002, decay, sustain: 0, release: 0.02 }).connect(out);
        source.fan(open, env);

        return {
            input: () => undefined,
            output: () => out,
            setParam(id, value) {
                if (id === "color") source.type = COLORS[value] ?? "pink";
                if (id === "decay") decay = value;
            },
            start: () => {
                if (source.state !== "started") source.start();
            },
            trigger: (_port, time) => {
                env.decay = mods.value("decay", decay);
                // Relâcher seulement après l'attaque et le déclin, sinon le déclin n'a pas le temps de jouer.
                env.triggerAttackRelease(Number(env.attack) + Number(env.decay), time);
            },
            setTriggerConnected: (_port, connected) => open.gain.rampTo(connected ? 0 : 1, 0.03),
            setModSource: (id, read) => mods.set(id, read),
            dispose: () => {
                source.dispose();
                open.dispose();
                env.dispose();
                out.dispose();
            },
        };
    },
};
