import * as Tone from "tone";
import { defaultDepth, type ModTarget, type ParamDef } from "./types";

/**
 * Pilote un paramètre audio par un signal de base (la valeur du curseur).
 *
 * Dans Tone.js, brancher un signal sur un paramètre remet sa valeur propre à zéro :
 * le paramètre ne vaut plus que la somme de ce qui y est branché. On y branche donc
 * toujours ce signal de base, et la modulation vient s'y additionner.
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

    get modTarget(): ModTarget {
        return { param: this.target, depth: this.depth };
    }

    dispose() {
        this.base.dispose();
    }
}

/** Raccourci : profondeur par défaut déduite de la définition du réglage. */
export const driven = (target: Tone.InputNode, def: ParamDef, value: number) =>
    new DrivenParam(target, value, defaultDepth(def));

export const paramDef = (defs: ParamDef[], id: string) => defs.find((d) => d.id === id)!;
