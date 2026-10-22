import { registry } from "../modules/registry";
import { defaultParams, type ParamValues, type PortKind } from "../modules/types";
import type { CableEdge, ModuleNode } from "./graph";
import { commentFrame } from "../modules/comment";

/** Motif de 16 pas à partir des numéros de pas allumés (1 à 16). */
const steps = (...on: number[]) => on.reduce((pattern, s) => pattern | (1 << (s - 1)), 0);

const node = (id: string, type: string, x: number, y: number, params: ParamValues = {}): ModuleNode => ({
    id,
    type: "module",
    position: { x, y },
    data: { type, params: { ...defaultParams(registry[type]), ...params } },
});

/** Cadre de Commentaire (derrière les blocs) pour nommer une partie du patch. */
const note = (id: string, x: number, y: number, width: number, height: number, text: string): ModuleNode => ({
    ...node(id, "comment", x, y),
    data: { type: "comment", params: {}, text },
    ...commentFrame(width, height),
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
        node("lfo", "sine", colSource, row(3) + 340, { shape: 0, frequency: 0.25 }),

        // Mélodie : son propre séquenceur, calé sur le même tempo
        node("mel-seq", "sequencer", 0, row(4) + 220, {
            bpm: 116,
            row0: steps(1, 4, 7, 9, 10, 13, 15),
            row1: 0,
            row2: 0,
            row3: 0,
        }),
        node("mel-osc", "sine", colSource, row(4) + 220, { shape: 2, frequency: 800 }),
        node("mel-lfo", "sine", -260, row(4) + 560, { shape: 0, frequency: 0.37 }),
        // Ampleur du balancement : −14 dB ≈ ±20 % autour de 800 Hz.
        node("mel-depth", "volume", 80, row(4) + 560, { volume: -14 }),
        node("mel-env", "envelope", colEnv, row(4) + 200, { attack: 0.005, decay: 0.16, sustain: 0.25, hold: 0.06, release: 0.28 }),
        node("mel-vol", "volume", colFilter, row(4) + 260, { volume: -5 }),

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

/**
 * Patch « Métal » : un groupe complet à 150 bpm, sur deux séquenceurs.
 *
 * Batterie (séquenceur « batterie ») — piste 1 : double pédale au galop (sinus grave très sec) ;
 * piste 2 : caisse claire sur 2 et 4 (bruit, passe-bande) ; piste 3 : charley en croches (bruit,
 * passe-haut) ; piste 4 : crash en début de mesure (bruit, longue résonance). Mixeur « batterie ».
 *
 * Groupe (séquenceur « groupe ») — piste 1 : guitare rythmique, power chord Mi + Si en dents de scie,
 * « chug » étouffé calé sur la double pédale, très distordu puis filtré comme un baffle ;
 * piste 2 : basse en croches (carré grave, passe-bas) ; piste 3 : deux guitares solo en harmonie —
 * un triangle lent balaie deux Gammes : Mi mineur pour la première, Sol majeur (mêmes notes, décalées
 * d'un cran) pour la seconde, qui joue donc une tierce au-dessus, comme des guitares jumelles.
 * Attaques nettes, à peine liées, léger vibrato ; très distordu et filtré comme un baffle, écho discret.
 *
 * Mixeur général → réverb discrète → sortie.
 */
function metalPatch(): Patch {
    // Colonnes : déclenchement, sources, enveloppes, traitements, mixage.
    const cSeq = 0;
    const cSrc = 460;
    const cEnv = 760;
    const cFx1 = 1060;
    const cFx2 = 1360;
    const cFx3 = 1660;
    const cMix = 1980;
    const cBus = 2300;
    const gallop = steps(1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15, 16);
    const dry = { attack: 0.001, sustain: 0, hold: 0.005 };
    const SOLO_Y = 3000;
    const HARM_Y = SOLO_Y + 780;

    const nodes: ModuleNode[] = [
        // ——— Cadres de commentaire, pour s'y retrouver ———
        note("note-drums", -40, -70, 1360, 1900, "Batterie : grosse caisse, caisse claire, charleston et cymbale"),
        note("note-band", -40, 1845, 1660, 1040, "Guitare rythmique (power chord Mi + Si) et basse"),
        note("note-solo", -380, SOLO_Y - 100, 2300, 1320, "Deux guitares solo en harmonie : la seconde joue une tierce au-dessus"),
        note("note-mix", 1940, 630, 1220, 1370, "Mixage : chaque piste → réverb → sortie"),

        // ——— Batterie ———
        node("drums", "sequencer", cSeq, 700, {
            bpm: 150,
            row0: gallop,
            row1: steps(5, 13),
            row2: steps(1, 3, 5, 7, 9, 11, 13, 15),
            row3: steps(1),
        }),
        node("kick-osc", "sine", cSrc, 60, { shape: 0, frequency: 50 }),
        node("kick-env", "envelope", cEnv, 0, { ...dry, decay: 0.11, release: 0.04 }),
        node("noise", "noise", cSrc, 760, { color: 0 }),
        node("snare-env", "envelope", cEnv, 470, { ...dry, decay: 0.14, release: 0.05 }),
        node("snare-filter", "filter", cFx1, 530, { mode: 2, frequency: 2000, Q: 0.9 }),
        node("hat-env", "envelope", cEnv, 940, { ...dry, decay: 0.035, release: 0.02 }),
        node("hat-filter", "filter", cFx1, 1000, { mode: 1, frequency: 9000, Q: 0.7 }),
        node("crash-env", "envelope", cEnv, 1410, { ...dry, decay: 1.4, release: 0.5 }),
        node("crash-filter", "filter", cFx1, 1470, { mode: 1, frequency: 5500, Q: 0.7 }),
        node("drum-mix", "mixer", cMix, 700, { level1: 100, level2: 80, level3: 30, level4: 35 }),

        // ——— Guitare rythmique ———
        node("band", "sequencer", cSeq, 2420, {
            bpm: 150,
            row0: gallop,
            row1: steps(1, 3, 5, 7, 9, 11, 13, 15),
            // Solo : peu de notes, tenues, en contretemps.
            row2: steps(1, 4, 7, 9, 12, 15),
            row3: 0,
        }),
        node("gtr-root", "sine", cSrc, 1900, { shape: 3, frequency: 82.4 }),
        node("gtr-fifth", "sine", cSrc, 2230, { shape: 3, frequency: 123.5 }),
        node("gtr-env", "envelope", cEnv, 1900, { attack: 0.003, decay: 0.1, sustain: 0.15, hold: 0.03, release: 0.06 }),
        node("gtr-dist", "distortion", cFx1, 1960, { drive: 45, wet: 1 }),
        node("gtr-cab", "filter", cFx2, 1960, { mode: 0, frequency: 2800, Q: 1.5 }),

        // ——— Basse ———
        node("bass-osc", "sine", cSrc, 2570, { shape: 1, frequency: 41.2 }),
        node("bass-env", "envelope", cEnv, 2380, { attack: 0.004, decay: 0.12, sustain: 0.3, hold: 0.04, release: 0.08 }),
        node("bass-filter", "filter", cFx1, 2440, { mode: 0, frequency: 500, Q: 2 }),

        // ——— Guitare solo ———
        // Phrases qui montent et redescendent, en Mi mineur, de Mi3 à Mi5.
        node("lead-sweep", "sine", cSeq - 340, SOLO_Y, { shape: 2, frequency: 0.3 }),
        node("lead-scale", "scale", cSeq, SOLO_Y, { scale: 1, root: 2, octave: 0 }),
        // Glissé très court : lie les notes sans l'effet « sirène ».
        node("lead-osc", "sine", cSrc, SOLO_Y, { shape: 3, frequency: 330, glide: 0.015 }),
        node("vibrato", "sine", cSeq - 340, SOLO_Y + 410, { shape: 0, frequency: 6 }),
        // Ampleur du vibrato : −40 dB ≈ ±1 %, juste de quoi faire vivre les notes tenues.
        node("vibrato-depth", "volume", cSeq, SOLO_Y + 430, { volume: -40 }),
        node("lead-env", "envelope", cEnv, SOLO_Y - 40, { attack: 0.004, decay: 0.18, sustain: 0.55, hold: 0.14, release: 0.12 }),
        node("lead-dist", "distortion", cFx1, SOLO_Y + 20, { drive: 45, wet: 1 }),
        node("lead-echo", "echo", cFx2, SOLO_Y + 20, { time: 2, feedback: 0.3, wet: 0.2 }),
        // Filtré bas, comme le baffle d'un ampli : retire le grésillement aigu.
        node("lead-filter", "filter", cFx3, SOLO_Y + 20, { mode: 0, frequency: 2600, Q: 1.8 }),
        // Seconde guitare : Sol majeur a les mêmes notes que Mi mineur, décalées d'un degré,
        // donc pour un même signal elle joue la tierce au-dessus de la première.
        node("harm-scale", "scale", cSeq, HARM_Y, { scale: 0, root: 4, octave: 0 }),
        node("harm-osc", "sine", cSrc, HARM_Y, { shape: 3, frequency: 392, glide: 0.015 }),
        node("harm-env", "envelope", cEnv, HARM_Y, { attack: 0.004, decay: 0.18, sustain: 0.55, hold: 0.14, release: 0.12 }),
        node("harm-dist", "distortion", cFx1, HARM_Y, { drive: 45, wet: 1 }),

        // ——— Mixage ———
        node("bus", "mixer", cBus, 1700, { level1: 90, level2: 70, level3: 75, level4: 45 }),
        node("reverb", "reverb", cBus + 300, 1720, { decay: 1.8, wet: 0.15 }),
        node("out", "output", cBus + 600, 1780),
    ];

    const edges: CableEdge[] = [
        // Batterie
        cable("drums", "row0", "kick-env", "gate", "trigger"),
        cable("drums", "row1", "snare-env", "gate", "trigger"),
        cable("drums", "row2", "hat-env", "gate", "trigger"),
        cable("drums", "row3", "crash-env", "gate", "trigger"),
        cable("kick-osc", "out", "kick-env", "in"),
        cable("noise", "out", "snare-env", "in"),
        cable("noise", "out", "hat-env", "in"),
        cable("noise", "out", "crash-env", "in"),
        cable("snare-env", "out", "snare-filter", "in"),
        cable("hat-env", "out", "hat-filter", "in"),
        cable("crash-env", "out", "crash-filter", "in"),
        cable("kick-env", "out", "drum-mix", "in1"),
        cable("snare-filter", "out", "drum-mix", "in2"),
        cable("hat-filter", "out", "drum-mix", "in3"),
        cable("crash-filter", "out", "drum-mix", "in4"),

        // Guitare rythmique
        cable("band", "row0", "gtr-env", "gate", "trigger"),
        cable("gtr-root", "out", "gtr-env", "in"),
        cable("gtr-fifth", "out", "gtr-env", "in"),
        cable("gtr-env", "out", "gtr-dist", "in"),
        cable("gtr-dist", "out", "gtr-cab", "in"),

        // Basse
        cable("band", "row1", "bass-env", "gate", "trigger"),
        cable("bass-osc", "out", "bass-env", "in"),
        cable("bass-env", "out", "bass-filter", "in"),

        // Guitare solo
        cable("lead-sweep", "out", "lead-scale", "in"),
        cable("band", "row2", "lead-scale", "gate", "trigger"),
        cable("lead-scale", "out", "lead-osc", "note", "trigger"),
        cable("lead-scale", "out", "lead-env", "gate", "trigger"),
        cable("vibrato", "out", "vibrato-depth", "in"),
        cable("vibrato-depth", "out", "lead-osc", "mod:frequency"),
        cable("lead-osc", "out", "lead-env", "in"),
        cable("lead-env", "out", "lead-dist", "in"),
        cable("lead-dist", "out", "lead-echo", "in"),
        cable("lead-echo", "out", "lead-filter", "in"),
        // Seconde guitare, en harmonie : même balayage, même rythme, même vibrato, même écho.
        cable("lead-sweep", "out", "harm-scale", "in"),
        cable("band", "row2", "harm-scale", "gate", "trigger"),
        cable("harm-scale", "out", "harm-osc", "note", "trigger"),
        cable("harm-scale", "out", "harm-env", "gate", "trigger"),
        cable("vibrato-depth", "out", "harm-osc", "mod:frequency"),
        cable("harm-osc", "out", "harm-env", "in"),
        cable("harm-env", "out", "harm-dist", "in"),
        cable("harm-dist", "out", "lead-echo", "in"),

        // Mixage
        cable("drum-mix", "out", "bus", "in1"),
        cable("gtr-cab", "out", "bus", "in2"),
        cable("bass-filter", "out", "bus", "in3"),
        cable("lead-filter", "out", "bus", "in4"),
        cable("bus", "out", "reverb", "in"),
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
    { id: "metal", label: "Métal", description: "Un groupe complet : batterie, guitares distordues, basse et solo", build: metalPatch },
];

/** Modèle chargé à la toute première visite. */
const FIRST_VISIT = "groove";

export const examplePatch = (id = FIRST_VISIT): Patch =>
    (EXAMPLES.find((e) => e.id === id) ?? EXAMPLES[0]).build();
