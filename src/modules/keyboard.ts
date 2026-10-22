import * as Tone from "tone";
import type { ModuleDef, TriggerListener } from "./types";

/**
 * Touches du clavier d'ordinateur, par position physique (`event.code`) : la rangée du milieu
 * donne les touches blanches, celle du dessus les noires, comme sur un piano.
 * Sur un clavier AZERTY : Q S D F G H J K (blanches) et Z E T Y U (noires).
 */
export const KEY_CODES = ["KeyA", "KeyW", "KeyS", "KeyE", "KeyD", "KeyF", "KeyT", "KeyG", "KeyY", "KeyH", "KeyU", "KeyJ", "KeyK"];
/** Demi-tons noirs (dièses) dans l'octave. */
export const BLACK = new Set([1, 3, 6, 8, 10]);
export const NOTE_NAMES = ["Do", "Do♯", "Ré", "Ré♯", "Mi", "Fa", "Fa♯", "Sol", "Sol♯", "La", "La♯", "Si", "Do"];

const OCTAVES = [2, 3, 4, 5];
const C4 = 261.63;

export const noteFrequency = (octaveIndex: number, semitone: number) =>
    C4 * Math.pow(2, (OCTAVES[octaveIndex] ?? 4) - 4) * Math.pow(2, semitone / 12);

/** Ne pas jouer quand on tape du texte, ni avec un raccourci. */
const ignored = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    return (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        t?.isContentEditable ||
        (t instanceof HTMLInputElement && t.type !== "range") ||
        t instanceof HTMLTextAreaElement
    );
};

/** Joue des notes depuis le clavier de l'ordinateur ou le mini-piano du bloc. */
export const keyboard: ModuleDef = {
    type: "keyboard",
    label: "Clavier",
    icon: "♪",
    category: "sequencer",
    inputs: [],
    outputs: [{ id: "out", kind: "trigger", label: "Notes" }],
    params: [{ id: "octave", label: "Octave", min: 0, max: 3, default: 2, options: OCTAVES.map(String) }],
    create(values) {
        let octave = values.octave ?? 2;
        const listeners = new Set<TriggerListener>();
        /** Touches enfoncées, en masque de bits (pour l'affichage). */
        let held = 0;

        const play = (semitone: number) => {
            const time = Tone.now();
            const note = noteFrequency(octave, semitone);
            for (const fn of listeners) fn(time, note);
        };

        const down = (e: KeyboardEvent) => {
            const i = KEY_CODES.indexOf(e.code);
            if (i < 0 || ignored(e)) return;
            e.preventDefault();
            if (e.repeat) return;
            held |= 1 << i;
            play(i);
        };
        const up = (e: KeyboardEvent) => {
            const i = KEY_CODES.indexOf(e.code);
            if (i >= 0) held &= ~(1 << i);
        };
        const blur = () => (held = 0);
        window.addEventListener("keydown", down);
        window.addEventListener("keyup", up);
        window.addEventListener("blur", blur);

        return {
            input: () => undefined,
            output: () => undefined,
            setParam(id, value) {
                if (id === "octave") octave = value;
            },
            listen(_port, fn) {
                listeners.add(fn);
                return () => listeners.delete(fn);
            },
            position: () => held,
            play,
            dispose: () => {
                window.removeEventListener("keydown", down);
                window.removeEventListener("keyup", up);
                window.removeEventListener("blur", blur);
                listeners.clear();
            },
        };
    },
};
