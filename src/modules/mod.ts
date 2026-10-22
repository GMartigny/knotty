import * as Tone from "tone";
import { defaultDepth, type ModTarget, type ParamDef } from "./types";

/**
 * Drives an audio parameter with a base signal (the slider value).
 *
 * In Tone.js, connecting a signal to a parameter resets its own value to zero:
 * the parameter becomes just the sum of what is connected to it. So this base signal
 * is always connected, and modulation is added on top of it.
 */
export class DrivenParam {
    readonly base: Tone.Signal;

    constructor(
        private target: Tone.InputNode,
        value: number,
        private depth: (base: number) => number,
    ) {
        this.base = new Tone.Signal(value);
        this.base.connect(target);
    }

    set(value: number) {
        this.base.rampTo(value, 0.05);
    }

    /**
     * Move to a value at audio time `time` (e.g. a played note): immediate jump,
     * or exponential slide (natural for a frequency) over `glide` seconds.
     */
    jump(value: number, time: number, glide = 0) {
        if (glide <= 0) {
            this.base.cancelScheduledValues(time);
            this.base.setValueAtTime(value, time);
            return;
        }
        // Start from the value reached at that moment, even if a slide is in progress.
        this.base.cancelAndHoldAtTime(time);
        this.base.exponentialRampToValueAtTime(value, time + glide);
    }

    /** Current base value. */
    get value() {
        return this.base.getValueAtTime(Tone.now());
    }

    get modTarget(): ModTarget {
        return { param: this.target, depth: this.depth };
    }

    dispose() {
        this.base.dispose();
    }
}

/** Shortcut: default depth derived from the setting definition. */
export const driven = (target: Tone.InputNode, def: ParamDef, value: number) =>
    new DrivenParam(target, value, defaultDepth(def));

export const paramDef = (defs: ParamDef[], id: string) => defs.find((d) => d.id === id)!;
