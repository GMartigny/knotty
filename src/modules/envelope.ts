import * as Tone from "tone";
import { ModReader, type ModuleDef } from "./types";

/**
 * Enveloppe ADSR : façonne le volume du son qui la traverse à chaque déclenchement.
 * Sans câble sur « Déclencheur », elle laisse passer le son tel quel.
 */
export const envelope: ModuleDef = {
    type: "envelope",
    label: "Enveloppe",
    icon: "⋀",
    category: "effect",
    inputs: [
        { id: "in", kind: "audio", label: "Entrée" },
        { id: "gate", kind: "trigger", label: "Déclencheur" },
    ],
    outputs: [{ id: "out", kind: "audio" }],
    params: [
        { id: "attack", label: "Attaque", min: 0.001, max: 2, default: 0.01, scale: "log", step: 0.001, unit: "s", activeWith: "gate" },
        { id: "decay", label: "Déclin", min: 0.01, max: 2, default: 0.2, scale: "log", step: 0.01, unit: "s", activeWith: "gate" },
        { id: "sustain", label: "Maintien", min: 0, max: 1, default: 0.5, step: 0.01, activeWith: "gate" },
        { id: "hold", label: "Durée tenue", min: 0.01, max: 2, default: 0.15, scale: "log", step: 0.01, unit: "s", activeWith: "gate" },
        { id: "release", label: "Relâchement", min: 0.01, max: 4, default: 0.4, scale: "log", step: 0.01, unit: "s", activeWith: "gate" },
    ],
    create(params) {
        const input = new Tone.Gain(1);
        const out = new Tone.Gain(1);
        // Chemin direct, coupé dès qu'un câble trigger pilote l'enveloppe.
        const open = new Tone.Gain(1).connect(out);
        const env = new Tone.AmplitudeEnvelope({
            attack: params.attack,
            decay: params.decay,
            sustain: params.sustain,
            release: params.release,
        }).connect(out);
        input.fan(open, env);
        // Valeurs des curseurs ; la modulation éventuelle est appliquée à chaque déclenchement.
        const base = { ...params };
        const mods = new ModReader(envelope.params);

        return {
            input: () => input,
            output: () => out,
            setParam(id, value) {
                base[id] = value;
            },
            trigger: (_port, time) => {
                const v = (id: string) => mods.value(id, base[id]);
                env.attack = v("attack");
                env.decay = v("decay");
                env.sustain = v("sustain");
                env.release = v("release");
                // La note est tenue le temps de l'attaque, du déclin et de « Durée tenue », puis relâchée.
                env.triggerAttackRelease(Number(env.attack) + Number(env.decay) + v("hold"), time);
            },
            setTriggerConnected: (_port, connected) => open.gain.rampTo(connected ? 0 : 1, 0.03),
            setModSource: (id, read) => mods.set(id, read),
            dispose: () => {
                input.dispose();
                open.dispose();
                env.dispose();
                out.dispose();
            },
        };
    },
};
