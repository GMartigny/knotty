import * as Tone from "tone";
import type { ModuleDef } from "./types";

/** Envoie le son vers les haut-parleurs. Le niveau se règle en amont avec un bloc Volume. */
export const output: ModuleDef = {
    type: "output",
    label: "Sortie",
    icon: "◉",
    category: "output",
    inputs: [{ id: "in", kind: "audio" }],
    outputs: [],
    // Interrupteur affiché dans l'en-tête du bloc (1 = son actif).
    params: [{ id: "on", label: "Son", min: 0, max: 1, default: 1, hidden: true }],
    create(params) {
        const node = new Tone.Volume({ volume: -6, mute: params.on === 0 });
        // Limiteur de sécurité pour protéger les oreilles des résonances extrêmes.
        const limiter = new Tone.Limiter(-1).toDestination();
        node.connect(limiter);
        return {
            input: () => node,
            output: () => undefined,
            setParam(id, value) {
                if (id === "on") node.mute = value === 0;
            },
            dispose: () => {
                node.dispose();
                limiter.dispose();
            },
        };
    },
};
