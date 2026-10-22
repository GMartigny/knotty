import * as Tone from "tone";
import { SOURCE_LEVEL, type ModuleDef } from "./types";

/** Signal level of a value index: evenly spread from −1 to 1, scaled to a source's normal level. */
export const levelOf = (index: number, count: number) => (count > 1 ? -1 + (2 * index) / (count - 1) : 0) * SOURCE_LEVEL;

/**
 * Random: on each trigger, rolls a die and holds the value until the next one ("sample & hold").
 * The output is a stepped signal: into a Scale it makes random in-tune melodies, into a setting's
 * socket it makes each note a little different. "Values" sets how many faces the die has.
 */
export const random: ModuleDef = {
    type: "random",
    label: "Random",
    icon: "⚄",
    category: "sequencer",
    idleHint: { port: "gate", text: "Plug in a Trigger to roll the die." },
    inputs: [{ id: "gate", kind: "trigger", label: "Trigger" }],
    outputs: [{ id: "out", kind: "audio" }],
    params: [{ id: "values", label: "Values", min: 2, max: 16, default: 6, step: 1, modulatable: false }],
    create(params) {
        let count = Math.round(params.values ?? 6);
        let index = Math.floor(count / 2);
        // Displayed state: number of rolls so far × 100 + current face (so a repeated face still animates).
        let shown = -1;
        let rolls = 0;
        const signal = new Tone.Signal(levelOf(index, count));
        return {
            input: () => undefined,
            output: () => signal,
            setParam(id, value) {
                if (id !== "values") return;
                count = Math.round(value);
                // Keep the current face if it still exists, and its level on the new spread.
                index = Math.min(index, count - 1);
                signal.rampTo(levelOf(index, count), 0.02);
                if (shown >= 0) shown = rolls * 100 + index;
            },
            trigger: (_port, time) => {
                index = Math.floor(Math.random() * count);
                signal.setValueAtTime(levelOf(index, count), time);
                const face = index;
                Tone.getDraw().schedule(() => (shown = ++rolls * 100 + face), time);
            },
            position: () => shown,
            dispose: () => signal.dispose(),
        };
    },
};
