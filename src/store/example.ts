import { registry } from "../modules/registry";
import { defaultParams, type ParamValues, type PortKind } from "../modules/types";
import type { CableEdge, ModuleNode } from "./graph";

/** Motif de 16 pas à partir des numéros de pas allumés (1 à 16). */
const steps = (...on: number[]) => on.reduce((pattern, s) => pattern | (1 << (s - 1)), 0);

const node = (id: string, type: string, x: number, y: number, params: ParamValues = {}): ModuleNode => ({
    id,
    type: "module",
    position: { x, y },
    data: { type, params: { ...defaultParams(registry[type]), ...params } },
});

type Patch = { nodes: ModuleNode[]; edges: CableEdge[] };

const cable = (source: string, sourceHandle: string, target: string, targetHandle: string, kind: PortKind = "audio"): CableEdge => ({
    id: `${source}:${sourceHandle}->${target}:${targetHandle}`,
    source,
    sourceHandle,
    target,
    targetHandle,
    type: "cable",
    data: { kind },
});

/**
 * Patch d'exemple : un petit morceau sur les 4 pistes du séquenceur.
 *  1. Grosse caisse — sinus grave, enveloppe courte, sur les temps
 *  2. Caisse claire — bruit, enveloppe, passe-bande, temps 2 et 4
 *  3. Charley — le même bruit, enveloppe très brève, passe-haut, à contretemps
 *  4. Basse — dent de scie, enveloppe, passe-bas balayé par un oscillateur lent
 * Le tout passe par un mixeur, une réverb légère et la sortie.
 * Mélodie — sur un second séquenceur : triangle vers 800 Hz dont la hauteur est balancée
 * par un sinus lent (atténué par un Volume) ; chaque note tombe ainsi à une hauteur différente.
 */
function groovePatch(): Patch {
    // Une ligne par piste ; les enveloppes font ~420 px de haut.
    const colSource = 460;
    const colEnv = 760;
    const colFilter = 1060;
    const row = (i: number) => i * 470;
    const shortHit = { attack: 0.002, sustain: 0, hold: 0.01 };

    const nodes: ModuleNode[] = [
        node("seq", "sequencer", 0, row(1) + 330, {
            bpm: 116,
            row0: steps(1, 5, 9, 13, 15),
            row1: steps(5, 13),
            row2: steps(3, 7, 11, 15, 16),
            row3: steps(1, 4, 7, 9, 11, 14),
        }),

        // 1. Grosse caisse
        node("kick-osc", "sine", colSource, row(0) + 60, { shape: 0, frequency: 52 }),
        node("kick-env", "envelope", colEnv, row(0), { ...shortHit, decay: 0.22, release: 0.08 }),

        // 2 et 3. Caisse claire et charley, à partir d'un seul bruit blanc
        node("noise", "noise", colSource, row(1) + 330, { color: 0 }),
        node("snare-env", "envelope", colEnv, row(1), { ...shortHit, decay: 0.11, release: 0.06 }),
        node("snare-filter", "filter", colFilter, row(1) + 60, { mode: 2, frequency: 1700, Q: 1.2 }),
        node("hat-env", "envelope", colEnv, row(2), { ...shortHit, decay: 0.03, release: 0.02 }),
        node("hat-filter", "filter", colFilter, row(2) + 60, { mode: 1, frequency: 7000, Q: 0.8 }),

        // 4. Basse balayée par un oscillateur lent
        node("bass-osc", "sine", colSource, row(3) + 20, { shape: 3, frequency: 55 }),
        node("bass-env", "envelope", colEnv, row(3), { attack: 0.004, decay: 0.18, sustain: 0.35, hold: 0.06, release: 0.12 }),
        node("bass-filter", "filter", colFilter, row(3) + 60, { mode: 0, frequency: 520, Q: 7 }),
        node("lfo", "sine", colSource, row(3) + 290, { shape: 0, frequency: 0.25 }),

        // Mélodie : son propre séquenceur, calé sur le même tempo
        node("mel-seq", "sequencer", 0, row(4) + 160, {
            bpm: 116,
            row0: steps(1, 4, 7, 9, 10, 13, 15),
            row1: 0,
            row2: 0,
            row3: 0,
        }),
        node("mel-osc", "sine", colSource, row(4) + 160, { shape: 2, frequency: 800 }),
        node("mel-lfo", "sine", -260, row(4) + 460, { shape: 0, frequency: 0.37 }),
        // Ampleur du balancement : −14 dB ≈ ±20 % autour de 800 Hz.
        node("mel-depth", "volume", 80, row(4) + 460, { volume: -14 }),
        node("mel-env", "envelope", colEnv, row(4) + 140, { attack: 0.005, decay: 0.16, sustain: 0.25, hold: 0.06, release: 0.28 }),
        node("mel-vol", "volume", colFilter, row(4) + 200, { volume: -5 }),

        // Mélange et sortie
        node("mix", "mixer", 1380, row(1) + 330, { level1: 100, level2: 55, level3: 35, level4: 65 }),
        node("reverb", "reverb", 1680, row(1) + 350, { decay: 2.2, wet: 0.22 }),
        node("out", "output", 1980, row(1) + 400),
    ];

    const edges: CableEdge[] = [
        // Pistes du séquenceur vers les enveloppes
        cable("seq", "row0", "kick-env", "gate", "trigger"),
        cable("seq", "row1", "snare-env", "gate", "trigger"),
        cable("seq", "row2", "hat-env", "gate", "trigger"),
        cable("seq", "row3", "bass-env", "gate", "trigger"),

        cable("kick-osc", "out", "kick-env", "in"),
        cable("kick-env", "out", "mix", "in1"),

        cable("noise", "out", "snare-env", "in"),
        cable("snare-env", "out", "snare-filter", "in"),
        cable("snare-filter", "out", "mix", "in2"),

        cable("noise", "out", "hat-env", "in"),
        cable("hat-env", "out", "hat-filter", "in"),
        cable("hat-filter", "out", "mix", "in3"),

        cable("bass-osc", "out", "bass-env", "in"),
        cable("bass-env", "out", "bass-filter", "in"),
        cable("bass-filter", "out", "mix", "in4"),
        cable("lfo", "out", "bass-filter", "mod:frequency"),

        cable("mel-seq", "row0", "mel-env", "gate", "trigger"),
        cable("mel-lfo", "out", "mel-depth", "in"),
        cable("mel-depth", "out", "mel-osc", "mod:frequency"),
        cable("mel-osc", "out", "mel-env", "in"),
        cable("mel-env", "out", "mel-vol", "in"),
        cable("mel-vol", "out", "reverb", "in"),

        cable("mix", "out", "reverb", "in"),
        cable("reverb", "out", "out", "in"),
    ];

    return { nodes, edges };
}

/**
 * Patch « Doux » : un point de départ simple et calme.
 * Une note de triangle à 330 Hz, découpée par une enveloppe aux attaques et relâchements doux,
 * adoucie par un passe-bas et noyée dans la réverb, sur un rythme lent et clairsemé.
 */
function softPatch(): Patch {
    const nodes: ModuleNode[] = [
        node("seq", "sequencer", -120, 360, {
            bpm: 84,
            row0: steps(1, 7, 11),
            row1: 0,
            row2: 0,
            row3: 0,
        }),
        node("osc", "sine", 60, 0, { shape: 2, frequency: 330 }),
        node("env", "envelope", 380, 0, { attack: 0.03, decay: 0.5, sustain: 0.2, hold: 0.15, release: 0.9 }),
        node("filter", "filter", 680, 40, { mode: 0, frequency: 1200, Q: 1 }),
        node("reverb", "reverb", 980, 60, { decay: 4, wet: 0.45 }),
        node("out", "output", 1280, 100),
    ];
    const edges: CableEdge[] = [
        cable("seq", "row0", "env", "gate", "trigger"),
        cable("osc", "out", "env", "in"),
        cable("env", "out", "filter", "in"),
        cable("filter", "out", "reverb", "in"),
        cable("reverb", "out", "out", "in"),
    ];
    return { nodes, edges };
}

export interface Example {
    id: string;
    label: string;
    description: string;
    build(): Patch;
}

/** Modèles proposés au chargement, dans l'ordre du menu. */
export const EXAMPLES: Example[] = [
    { id: "soft", label: "Doux", description: "Un séquenceur, un oscillateur, une note calme : idéal pour démarrer", build: softPatch },
    { id: "groove", label: "Groove", description: "Batterie, basse et mélodie sur deux séquenceurs", build: groovePatch },
];

/** Modèle chargé à la toute première visite. */
const FIRST_VISIT = "groove";

export const examplePatch = (id = FIRST_VISIT): Patch =>
    (EXAMPLES.find((e) => e.id === id) ?? EXAMPLES[0]).build();
