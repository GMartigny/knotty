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
 */
export function examplePatch(): { nodes: ModuleNode[]; edges: CableEdge[] } {
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

        cable("mix", "out", "reverb", "in"),
        cable("reverb", "out", "out", "in"),
    ];

    return { nodes, edges };
}
