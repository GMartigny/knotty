import * as Tone from "tone";
import { SOURCE_DB, type ModuleDef, type ParamDef } from "./types";
import { driven, paramDef } from "./mod";

export const SHAPES = ["sine", "square", "triangle", "sawtooth"] as const;

const params: ParamDef[] = [
    { id: "shape", label: "Shape", min: 0, max: 3, default: 0, options: ["Sine", "Square", "Triangle", "Saw"] },
    // Goes down to 0.1 Hz to act as a slow oscillator (modulation).
    { id: "frequency", label: "Frequency", min: 0.1, max: 2000, default: 220, scale: "log", unit: "Hz" },
    // Time to slide from one received note to the next (0 = clean jump), like a finger sliding on a string.
    { id: "glide", label: "Glide", min: 0, max: 0.5, default: 0, step: 0.005, unit: "s", modulatable: false },
];

/** Continuous oscillator (sine, square, triangle, sawtooth). To cut it into notes, run it through an Envelope. */
export const sine: ModuleDef = {
    type: "sine",
    label: "Oscillator",
    icon: "∿",
    category: "source",
    // A received note (e.g. from a Keyboard) sets the frequency until the next one.
    inputs: [{ id: "note", kind: "trigger", label: "Note" }],
    outputs: [{ id: "out", kind: "audio" }],
    params,
    create(values) {
        // Fixed level: loudness is set with a Volume block.
        const source = new Tone.Oscillator({ type: SHAPES[values.shape] ?? "sine", volume: SOURCE_DB });
        const frequency = driven(source.frequency, paramDef(params, "frequency"), values.frequency);
        let glide = values.glide ?? 0;
        // Samples for the mini-wave shown in the block.
        // ~0.34 s of memory at 48 kHz: enough to lock the wave down to ~7 Hz.
        const waveform = new Tone.Waveform(16384);
        source.connect(waveform);
        return {
            scope: () => waveform.getValue(),
            pitch: () => frequency.value,
            trigger: (_port, time, note, gate) => {
                // A released key doesn't change the pitch: the note keeps sounding through its release.
                if (note && gate !== "off") frequency.jump(note, time, glide);
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
