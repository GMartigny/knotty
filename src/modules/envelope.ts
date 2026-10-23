import * as Tone from "tone";
import { ModReader, type ModuleDef } from "./types";

/**
 * ADSR envelope: shapes the volume of the sound going through it on each trigger.
 * With no cable on "Trigger", it lets the sound through unchanged.
 */
export const envelope: ModuleDef = {
    type: "envelope",
    label: "Envelope",
    description: "Cuts a sound into notes on each trigger: attack, decay, sustain and release.",
    icon: "⋀",
    category: "effect",
    idleHint: { port: "gate", text: "Plug in a Trigger to cut the sound into notes." },
    inputs: [
        { id: "in", kind: "audio", label: "Input" },
        { id: "gate", kind: "trigger", label: "Trigger" },
    ],
    outputs: [{ id: "out", kind: "audio" }],
    params: [
        { id: "attack", label: "Attack", min: 0.001, max: 2, default: 0.01, scale: "log", step: 0.001, unit: "s" },
        { id: "decay", label: "Decay", min: 0.01, max: 2, default: 0.2, scale: "log", step: 0.01, unit: "s" },
        { id: "sustain", label: "Sustain", min: 0, max: 1, default: 0.5, step: 0.01 },
        // For sequencer steps only: a keyboard note lasts as long as its key is held.
        { id: "hold", label: "Hold", min: 0.01, max: 2, default: 0.15, scale: "log", step: 0.01, unit: "s" },
        { id: "release", label: "Release", min: 0.01, max: 4, default: 0.4, scale: "log", step: 0.01, unit: "s" },
    ],
    create(params) {
        const input = new Tone.Gain(1);
        const out = new Tone.Gain(1);
        // Direct path, cut as soon as a trigger cable drives the envelope.
        const open = new Tone.Gain(1).connect(out);
        const env = new Tone.AmplitudeEnvelope({
            attack: params.attack,
            decay: params.decay,
            sustain: params.sustain,
            release: params.release,
        }).connect(out);
        input.fan(open, env);
        // Slider values; any modulation is applied on each trigger.
        const base = { ...params };
        const mods = new ModReader(envelope.params);
        /** Keys currently held on the Trigger input. */
        let held = 0;

        return {
            input: () => input,
            output: () => out,
            setParam(id, value) {
                base[id] = value;
            },
            trigger: (_port, time, _note, gate) => {
                // A key released: the note ends once no key is held any more.
                if (gate === "off") {
                    if (held > 0 && --held === 0) env.triggerRelease(time);
                    return;
                }
                const v = (id: string) => mods.value(id, base[id]);
                env.attack = v("attack");
                env.decay = v("decay");
                env.sustain = v("sustain");
                env.release = v("release");
                if (gate === "on") {
                    // A key pressed: the note stays at the sustain level while it is held.
                    held++;
                    env.triggerAttack(time);
                    return;
                }
                // A sequencer step: the note is held for the attack, decay and "Hold" times, then released.
                env.triggerAttackRelease(Number(env.attack) + Number(env.decay) + v("hold"), time);
            },
            setTriggerConnected: (_port, connected) => {
                open.gain.rampTo(connected ? 0 : 1, 0.03);
                // Unplugged with a key held: don't leave the note hanging.
                if (!connected && held) {
                    held = 0;
                    env.triggerRelease();
                }
            },
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
