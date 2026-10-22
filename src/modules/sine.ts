import * as Tone from "tone";
import type { ModuleDef } from "./types";

/**
 * Onde sinusoïdale. Comme le Bruit : continue tant que rien n'est branché sur « Déclencheur »,
 * puis jouée coup par coup dès qu'un câble trigger y arrive.
 */
export const sine: ModuleDef = {
    type: "sine",
    label: "Sinus",
    icon: "∿",
    category: "source",
    inputs: [{ id: "gate", kind: "trigger", label: "Déclencheur" }],
    outputs: [{ id: "out", kind: "audio" }],
    params: [
        { id: "frequency", label: "Fréquence", min: 30, max: 2000, default: 220, scale: "log", unit: "Hz" },
        { id: "decay", label: "Durée d'un coup", min: 0.02, max: 2, default: 0.3, step: 0.01, scale: "log", unit: "s", activeWith: "gate" },
    ],
    create(params) {
        // Niveau fixe : le volume se règle avec un bloc Volume.
        const source = new Tone.Oscillator({ type: "sine", frequency: params.frequency, volume: -12 });
        const out = new Tone.Gain(1);
        const open = new Tone.Gain(1).connect(out);
        const env = new Tone.AmplitudeEnvelope({ attack: 0.003, decay: params.decay, sustain: 0, release: 0.02 }).connect(out);
        source.fan(open, env);

        return {
            input: () => undefined,
            output: () => out,
            setParam(id, value) {
                if (id === "frequency") source.frequency.rampTo(value, 0.03);
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
