import * as Tone from "tone";
import { SOURCE_LEVEL, type ModuleDef, type TriggerListener } from "./types";

/** Degrés de chaque gamme, en demi-tons depuis la tonique. */
const SCALES = [
    [0, 2, 4, 5, 7, 9, 11], // majeure
    [0, 2, 3, 5, 7, 8, 10], // mineure
    [0, 3, 5, 7, 10], // pentatonique (mineure)
];
/** Toniques proposées, en demi-tons depuis Do. */
const ROOTS = [0, 2, 4, 5, 7, 9, 11];
const OCTAVES = [3, 4, 5];
/** Étendue couverte par le signal, en octaves. */
const SPAN = 2;

const NAMES = ["Do", "Do♯", "Ré", "Ré♯", "Mi", "Fa", "Fa♯", "Sol", "Sol♯", "La", "La♯", "Si"];
/** Nom d'une note MIDI, ex. 67 → « Sol4 ». */
export const noteName = (midi: number) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
const frequencyOf = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/**
 * Transforme un signal en notes justes : à chaque déclenchement, la valeur du signal (−1 … 1)
 * choisit une note de la gamme sur deux octaves. Sans signal branché, joue la tonique.
 */
export const scale: ModuleDef = {
    type: "scale",
    label: "Gamme",
    icon: "♯",
    category: "sequencer",
    inputs: [
        { id: "in", kind: "audio", label: "Signal" },
        { id: "gate", kind: "trigger", label: "Déclencheur" },
    ],
    outputs: [{ id: "out", kind: "trigger", label: "Notes" }],
    params: [
        { id: "scale", label: "Gamme", min: 0, max: 2, default: 2, options: ["Majeure", "Mineure", "Penta"] },
        { id: "root", label: "Tonique", min: 0, max: 6, default: 0, options: ["Do", "Ré", "Mi", "Fa", "Sol", "La", "Si"] },
        { id: "octave", label: "Octave", min: 0, max: 2, default: 1, options: OCTAVES.map(String) },
    ],
    create(values) {
        const v = { ...values };
        const input = new Tone.Gain(1);
        // Valeur instantanée du signal, lue à chaque déclenchement.
        const meter = new Tone.DCMeter();
        input.connect(meter);
        const listeners = new Set<TriggerListener>();
        let last = -1;

        const pick = () => {
            const degrees = SCALES[v.scale] ?? SCALES[2];
            // Toutes les notes de la gamme sur l'étendue, tonique de l'octave du dessus comprise.
            const notes: number[] = [];
            for (let o = 0; o < SPAN; o++) for (const d of degrees) notes.push(o * 12 + d);
            notes.push(SPAN * 12);
            const m = Math.max(-1, Math.min(1, (meter.getValue() as number) / SOURCE_LEVEL || 0));
            const index = Math.round(((m + 1) / 2) * (notes.length - 1));
            return 12 * ((OCTAVES[v.octave] ?? 4) + 1) + (ROOTS[v.root] ?? 0) + notes[index];
        };

        return {
            input: (port) => (port === "in" ? input : undefined),
            output: () => undefined,
            setParam(id, value) {
                v[id] = value;
            },
            trigger: (_port, time) => {
                const midi = pick();
                Tone.getDraw().schedule(() => (last = midi), time);
                for (const fn of listeners) fn(time, frequencyOf(midi));
            },
            listen(_port, fn) {
                listeners.add(fn);
                return () => listeners.delete(fn);
            },
            position: () => last,
            dispose: () => {
                listeners.clear();
                meter.dispose();
                input.dispose();
            },
        };
    },
};
