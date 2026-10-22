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
    params: [],
    create() {
        const node = new Tone.Volume(-6);
        // Limiteur de sécurité pour protéger les oreilles des résonances extrêmes.
        const limiter = new Tone.Limiter(-1).toDestination();
        node.connect(limiter);
        return {
            input: () => node,
            output: () => undefined,
            setParam() {},
            dispose: () => {
                node.dispose();
                limiter.dispose();
            },
        };
    },
};
