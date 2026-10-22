import * as Tone from "tone";
import { onSixteenth } from "../audio/clock";
import type { ModuleDef, ParamDef } from "./types";
import { driven, paramDef } from "./mod";

/** Time between two repeats, as note values: it follows the tempo. */
const TIMES = ["16n", "8n", "8n.", "4n"] as const;

const params: ParamDef[] = [
    { id: "time", label: "Time", min: 0, max: 3, default: 2, options: ["1/16", "1/8", "1/8 ·", "1/4"] },
    { id: "feedback", label: "Feedback", min: 0, max: 0.9, default: 0.45, step: 0.01 },
    { id: "wet", label: "Mix", min: 0, max: 1, default: 0.35, step: 0.01 },
];

/** The sound repeats while fading out, in time with the tempo. */
export const echo: ModuleDef = {
    type: "echo",
    label: "Echo",
    icon: "⟫",
    category: "effect",
    inputs: [{ id: "in", kind: "audio", label: "Input" }],
    outputs: [{ id: "out", kind: "audio" }],
    params,
    create(values) {
        const node = new Tone.FeedbackDelay({ delayTime: Tone.Time(TIMES[values.time] ?? "8n.").toSeconds(), maxDelay: 4 });
        const feedback = driven(node.feedback, paramDef(params, "feedback"), values.feedback);
        const wet = driven(node.wet, paramDef(params, "wet"), values.wet);
        let time = values.time;

        // The time is a note value: recompute it when the tempo changes.
        const sync = (at?: number) => {
            const seconds = Tone.Time(TIMES[time] ?? "8n.").toSeconds();
            if (Math.abs(Tone.Time(node.delayTime.value).toSeconds() - seconds) > 0.001) node.delayTime.rampTo(seconds, 0.05, at);
        };
        const unsubscribe = onSixteenth((t) => sync(t));

        return {
            input: () => node,
            output: () => node,
            setParam(id, value) {
                if (id === "time") {
                    time = value;
                    sync();
                }
                if (id === "feedback") feedback.set(value);
                if (id === "wet") wet.set(value);
            },
            modTarget: (id) => (id === "feedback" ? feedback.modTarget : id === "wet" ? wet.modTarget : undefined),
            dispose: () => {
                unsubscribe();
                feedback.dispose();
                wet.dispose();
                node.dispose();
            },
        };
    },
};
