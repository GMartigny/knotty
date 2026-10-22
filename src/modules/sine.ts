import * as Tone from "tone";
import { ModReader, type ModuleDef, type ParamDef } from "./types";
import { driven, paramDef } from "./mod";

const params: ParamDef[] = [
    // Descend jusqu'à 0,1 Hz pour servir d'oscillateur lent (modulation).
    { id: "frequency", label: "Fréquence", min: 0.1, max: 2000, default: 220, scale: "log", unit: "Hz" },
    { id: "decay", label: "Durée d'un coup", min: 0.02, max: 2, default: 0.3, step: 0.01, scale: "log", unit: "s", activeWith: "gate" },
];

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
    params,
    create(values) {
        // Niveau fixe : le volume se règle avec un bloc Volume.
        const source = new Tone.Oscillator({ type: "sine", volume: -12 });
        const frequency = driven(source.frequency, paramDef(params, "frequency"), values.frequency);
        const mods = new ModReader(params);
        let decay = values.decay;
        const out = new Tone.Gain(1);
        const open = new Tone.Gain(1).connect(out);
        const env = new Tone.AmplitudeEnvelope({ attack: 0.003, decay, sustain: 0, release: 0.02 }).connect(out);
        source.fan(open, env);

        return {
            input: () => undefined,
            output: () => out,
            setParam(id, value) {
                if (id === "frequency") frequency.set(value);
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
            modTarget: (id) => (id === "frequency" ? frequency.modTarget : undefined),
            setModSource: (id, read) => mods.set(id, read),
            dispose: () => {
                frequency.dispose();
                source.dispose();
                open.dispose();
                env.dispose();
                out.dispose();
            },
        };
    },
};
