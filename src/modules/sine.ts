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
        { id: "decay", label: "Durée d'un coup", min: 0.02, max: 2, default: 0.3, step: 0.01, scale: "log", unit: "s" },
        { id: "volume", label: "Volume", min: -40, max: 0, default: -12, step: 0.5, unit: "dB" },
    ],
    create(params) {
        const source = new Tone.Oscillator({ type: "sine", frequency: params.frequency, volume: params.volume });
        const out = new Tone.Gain(1);
        const open = new Tone.Gain(1).connect(out);
        const env = new Tone.AmplitudeEnvelope({ attack: 0.003, decay: params.decay, sustain: 0, release: 0.02 }).connect(out);
        source.fan(open, env);

        return {
            input: () => undefined,
            output: () => out,
            setParam(id, value) {
                if (id === "frequency") source.frequency.rampTo(value, 0.03);
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
