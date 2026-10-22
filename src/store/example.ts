import { registry } from "../modules/registry";
import { defaultParams, type ParamValues, type PortKind } from "../modules/types";
import type { CableEdge, ModuleNode } from "./graph";
import { commentFrame } from "../modules/comment";

/** 16-step pattern from the numbers of the steps that are on (1 to 16). */
const steps = (...on: number[]) => on.reduce((pattern, s) => pattern | (1 << (s - 1)), 0);

const node = (id: string, type: string, x: number, y: number, params: ParamValues = {}): ModuleNode => ({
    id,
    type: "module",
    position: { x, y },
    data: { type, params: { ...defaultParams(registry[type]), ...params } },
});

/** Comment frame (behind the blocks) to name a part of the patch. */
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
 * "Groove" patch: a little tune on a 5-row sequencer.
 *  1. Kick — low sine, short envelope, on the beats
 *  2. Snare — noise, envelope, band-pass, beats 2 and 4
 *  3. Hi-hat — the same noise, very short envelope, high-pass, on the offbeats
 *  4. Bass — sawtooth, envelope, low-pass swept by a slow oscillator
 *  5. Melody — a triangle around 800 Hz whose pitch is swayed by a slow sine
 *     (attenuated by a Volume), so each note lands on a different pitch
 * A 5-channel mixer, a light reverb and the output.
 */
function groovePatch(): Patch {
    // One row per track; envelopes are ~420 px tall.
    const colSource = 460;
    const colEnv = 760;
    const colFilter = 1060;
    const row = (i: number) => i * 470;
    const shortHit = { attack: 0.002, sustain: 0, hold: 0.01 };
    const MEL_Y = row(4) + 300;

    const nodes: ModuleNode[] = [
        // Comment frames, to find your way around
        note("note-drums", -40, -70, 1360, 1420, "Drums: kick, snare and hi-hat (sequencer rows 1 to 3)"),
        note("note-bass", 420, 1360, 900, 710, "Bass (row 4), its filter swept by a slow oscillator"),
        note("note-melody", -200, MEL_Y - 90, 1220, 520, "Melody (row 5): a triangle whose pitch is swayed by a slow sine"),
        note("note-mix", 1340, 730, 900, 360, "Mix: every track → reverb → output"),

        node("seq", "sequencer", 0, row(1) + 330, {
            bpm: 116,
            row0: steps(1, 5, 9, 13, 15),
            row1: steps(5, 13),
            row2: steps(3, 7, 11, 15, 16),
            row3: steps(1, 4, 7, 9, 11, 14),
            // Row 5: the melody, on the same sequencer.
            rows: 5,
            row4: steps(1, 4, 7, 9, 10, 13, 15),
        }),

        // 1. Kick
        node("kick-osc", "sine", colSource, row(0) + 60, { shape: 0, frequency: 52 }),
        node("kick-env", "envelope", colEnv, row(0), { ...shortHit, decay: 0.22, release: 0.08 }),

        // 2 and 3. Snare and hi-hat, from a single white noise
        node("noise", "noise", colSource, row(1) + 330, { color: 0 }),
        node("snare-env", "envelope", colEnv, row(1), { ...shortHit, decay: 0.11, release: 0.06 }),
        node("snare-filter", "filter", colFilter, row(1) + 60, { mode: 2, frequency: 1700, Q: 1.2 }),
        node("hat-env", "envelope", colEnv, row(2), { ...shortHit, decay: 0.03, release: 0.02 }),
        node("hat-filter", "filter", colFilter, row(2) + 60, { mode: 1, frequency: 7000, Q: 0.8 }),

        // 4. Bass swept by a slow oscillator
        node("bass-osc", "sine", colSource, row(3) + 20, { shape: 3, frequency: 55 }),
        node("bass-env", "envelope", colEnv, row(3), { attack: 0.004, decay: 0.18, sustain: 0.35, hold: 0.06, release: 0.12 }),
        node("bass-filter", "filter", colFilter, row(3) + 60, { mode: 0, frequency: 520, Q: 7 }),
        node("lfo", "sine", colSource, row(3) + 340, { shape: 0, frequency: 0.25 }),

        // Melody, on row 5 of the sequencer
        node("mel-osc", "sine", colSource, MEL_Y, { shape: 2, frequency: 800 }),
        node("mel-lfo", "sine", -160, MEL_Y, { shape: 0, frequency: 0.37 }),
        // Sway depth: −14 dB ≈ ±20% around 800 Hz.
        node("mel-depth", "volume", 160, MEL_Y + 20, { volume: -14 }),
        node("mel-env", "envelope", colEnv, MEL_Y - 20, { attack: 0.005, decay: 0.16, sustain: 0.25, hold: 0.06, release: 0.28 }),

        // Mix and output
        // One channel per track, the melody included.
        node("mix", "mixer", 1380, row(1) + 330, { channels: 5, level1: 100, level2: 55, level3: 35, level4: 65, level5: 56 }),
        node("reverb", "reverb", 1680, row(1) + 350, { decay: 2.2, wet: 0.22 }),
        node("out", "output", 1980, row(1) + 400),
    ];

    const edges: CableEdge[] = [
        // Sequencer tracks to the envelopes
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

        cable("seq", "row4", "mel-env", "gate", "trigger"),
        cable("mel-lfo", "out", "mel-depth", "in"),
        cable("mel-depth", "out", "mel-osc", "mod:frequency"),
        cable("mel-osc", "out", "mel-env", "in"),
        cable("mel-env", "out", "mix", "in5"),

        cable("mix", "out", "reverb", "in"),
        cable("reverb", "out", "out", "in"),
    ];

    return { nodes, edges };
}

/**
 * "Soft" patch: a simple, calm starting point.
 * A 330 Hz triangle note, cut by an envelope with soft attacks and releases,
 * mellowed by a low-pass and drowned in reverb, on a slow, sparse rhythm.
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
 * "Metal" patch: a full band at 150 bpm, on two sequencers.
 *
 * Rhythm section ("drums" sequencer, 5 rows) — row 1: galloping double kick (very dry low sine);
 * row 2: snare on 2 and 4 (noise, band-pass); row 3: eighth-note hi-hat (noise, high-pass);
 * row 4: crash at the start of the bar (noise, long ring); row 5: eighth-note bass (low square,
 * low-pass), locked to the drums.
 *
 * Guitars ("band" sequencer, 2 rows) — row 1: rhythm guitar, E + B power chord in sawtooth,
 * palm-muted "chug" locked to the double kick, heavily distorted then filtered like a speaker cab;
 * row 2: two lead guitars in harmony — a slow triangle sweeps two Scales: E minor for the first,
 * G major (the same notes, shifted by one degree) for the second, which therefore plays a third
 * above, like twin guitars. Crisp attacks, barely slurred, light vibrato; distorted, cab-filtered, subtle echo.
 *
 * A 7-channel mixer (one per instrument) → subtle reverb → output.
 */
function metalPatch(): Patch {
    // Columns: triggering, sources, envelopes, processing, mixing.
    const cSeq = 0;
    const cSrc = 460;
    const cEnv = 760;
    const cFx1 = 1060;
    const cFx2 = 1360;
    const cFx3 = 1660;
    const cBus = 2300;
    const gallop = steps(1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15, 16);
    const dry = { attack: 0.001, sustain: 0, hold: 0.005 };
    const SOLO_Y = 3000;
    const HARM_Y = SOLO_Y + 780;

    const nodes: ModuleNode[] = [
        // ——— Comment frames, to find your way around ———
        note("note-drums", -40, -70, 1360, 1900, "Rhythm section: kick, snare, hi-hat, cymbal, and row 5 drives the bass below"),
        note("note-band", -40, 1845, 1660, 1040, "Guitars on a 2-row sequencer: rhythm (E + B power chord) and solo. Plus the bass"),
        note("note-solo", -380, SOLO_Y - 100, 2300, 1320, "Two lead guitars in harmony: the second one plays a third above"),
        note("note-mix", 2260, 1630, 900, 380, "Mix: one channel per instrument → reverb → output"),

        // ——— Drums ———
        node("drums", "sequencer", cSeq, 700, {
            bpm: 150,
            row0: gallop,
            row1: steps(5, 13),
            row2: steps(1, 3, 5, 7, 9, 11, 13, 15),
            row3: steps(1),
            // The bass locks to the drums: eighth notes, on the same sequencer.
            rows: 5,
            row4: steps(1, 3, 5, 7, 9, 11, 13, 15),
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

        // ——— Rhythm guitar ———
        // Guitars: rhythm on row 1, solo on row 2. Two rows are all it needs.
        node("band", "sequencer", cSeq, 2420, {
            bpm: 150,
            rows: 2,
            row0: gallop,
            // Solo: few notes, held, on the offbeats.
            row1: steps(1, 4, 7, 9, 12, 15),
        }),
        node("gtr-root", "sine", cSrc, 1900, { shape: 3, frequency: 82.4 }),
        node("gtr-fifth", "sine", cSrc, 2230, { shape: 3, frequency: 123.5 }),
        node("gtr-env", "envelope", cEnv, 1900, { attack: 0.003, decay: 0.1, sustain: 0.15, hold: 0.03, release: 0.06 }),
        node("gtr-dist", "distortion", cFx1, 1960, { drive: 45, wet: 1 }),
        node("gtr-cab", "filter", cFx2, 1960, { mode: 0, frequency: 2800, Q: 1.5 }),

        // ——— Bass ———
        node("bass-osc", "sine", cSrc, 2570, { shape: 1, frequency: 41.2 }),
        node("bass-env", "envelope", cEnv, 2380, { attack: 0.004, decay: 0.12, sustain: 0.3, hold: 0.04, release: 0.08 }),
        node("bass-filter", "filter", cFx1, 2440, { mode: 0, frequency: 500, Q: 2 }),

        // ——— Lead guitar ———
        // Phrases that rise and fall, in E minor, from E3 to E5.
        node("lead-sweep", "sine", cSeq - 340, SOLO_Y, { shape: 2, frequency: 0.3 }),
        node("lead-scale", "scale", cSeq, SOLO_Y, { scale: 1, root: 2, octave: 0 }),
        // Very short glide: slurs the notes without the "siren" effect.
        node("lead-osc", "sine", cSrc, SOLO_Y, { shape: 3, frequency: 330, glide: 0.015 }),
        node("vibrato", "sine", cSeq - 340, SOLO_Y + 410, { shape: 0, frequency: 6 }),
        // Vibrato depth: −40 dB ≈ ±1%, just enough to bring held notes to life.
        node("vibrato-depth", "volume", cSeq, SOLO_Y + 430, { volume: -40 }),
        node("lead-env", "envelope", cEnv, SOLO_Y - 40, { attack: 0.004, decay: 0.18, sustain: 0.55, hold: 0.14, release: 0.12 }),
        node("lead-dist", "distortion", cFx1, SOLO_Y + 20, { drive: 45, wet: 1 }),
        node("lead-echo", "echo", cFx2, SOLO_Y + 20, { time: 2, feedback: 0.3, wet: 0.2 }),
        // Filtered low, like an amp's speaker cab: removes the harsh fizz.
        node("lead-filter", "filter", cFx3, SOLO_Y + 20, { mode: 0, frequency: 2600, Q: 1.8 }),
        // Second guitar: G major has the same notes as E minor, shifted by one degree,
        // so for the same signal it plays a third above the first one.
        node("harm-scale", "scale", cSeq, HARM_Y, { scale: 0, root: 4, octave: 0 }),
        node("harm-osc", "sine", cSrc, HARM_Y, { shape: 3, frequency: 392, glide: 0.015 }),
        node("harm-env", "envelope", cEnv, HARM_Y, { attack: 0.004, decay: 0.18, sustain: 0.55, hold: 0.14, release: 0.12 }),
        node("harm-dist", "distortion", cFx1, HARM_Y, { drive: 45, wet: 1 }),

        // ——— Mix ———
        // One channel per instrument: kick, snare, hi-hat, cymbal, rhythm guitar, bass, solos.
        node("bus", "mixer", cBus, 1700, {
            channels: 7,
            level1: 90,
            level2: 72,
            level3: 27,
            level4: 32,
            level5: 70,
            level6: 75,
            level7: 45,
        }),
        node("reverb", "reverb", cBus + 300, 1720, { decay: 1.8, wet: 0.15 }),
        node("out", "output", cBus + 600, 1780),
    ];

    const edges: CableEdge[] = [
        // Drums
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

        // Rhythm guitar
        cable("band", "row0", "gtr-env", "gate", "trigger"),
        cable("gtr-root", "out", "gtr-env", "in"),
        cable("gtr-fifth", "out", "gtr-env", "in"),
        cable("gtr-env", "out", "gtr-dist", "in"),
        cable("gtr-dist", "out", "gtr-cab", "in"),

        // Bass
        cable("drums", "row4", "bass-env", "gate", "trigger"),
        cable("bass-osc", "out", "bass-env", "in"),
        cable("bass-env", "out", "bass-filter", "in"),

        // Lead guitar
        cable("lead-sweep", "out", "lead-scale", "in"),
        cable("band", "row1", "lead-scale", "gate", "trigger"),
        cable("lead-scale", "out", "lead-osc", "note", "trigger"),
        cable("lead-scale", "out", "lead-env", "gate", "trigger"),
        cable("vibrato", "out", "vibrato-depth", "in"),
        cable("vibrato-depth", "out", "lead-osc", "mod:frequency"),
        cable("lead-osc", "out", "lead-env", "in"),
        cable("lead-env", "out", "lead-dist", "in"),
        cable("lead-dist", "out", "lead-echo", "in"),
        cable("lead-echo", "out", "lead-filter", "in"),
        // Second guitar, in harmony: same sweep, same rhythm, same vibrato, same echo.
        cable("lead-sweep", "out", "harm-scale", "in"),
        cable("band", "row1", "harm-scale", "gate", "trigger"),
        cable("harm-scale", "out", "harm-osc", "note", "trigger"),
        cable("harm-scale", "out", "harm-env", "gate", "trigger"),
        cable("vibrato-depth", "out", "harm-osc", "mod:frequency"),
        cable("harm-osc", "out", "harm-env", "in"),
        cable("harm-env", "out", "harm-dist", "in"),
        cable("harm-dist", "out", "lead-echo", "in"),

        // Mix
        cable("kick-env", "out", "bus", "in1"),
        cable("snare-filter", "out", "bus", "in2"),
        cable("hat-filter", "out", "bus", "in3"),
        cable("crash-filter", "out", "bus", "in4"),
        cable("gtr-cab", "out", "bus", "in5"),
        cable("bass-filter", "out", "bus", "in6"),
        cable("lead-filter", "out", "bus", "in7"),
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

/** Presets offered for loading, in menu order. */
export const EXAMPLES: Example[] = [
    { id: "soft", label: "Soft", description: "One sequencer, one oscillator, one calm note: perfect to get started", build: softPatch },
    { id: "groove", label: "Groove", description: "Drums, bass and melody on two sequencers", build: groovePatch },
    { id: "metal", label: "Metal", description: "A full band: drums, distorted guitars, bass and solos", build: metalPatch },
];

/** Preset loaded on the very first visit. */
const FIRST_VISIT = "groove";

export const examplePatch = (id = FIRST_VISIT): Patch =>
    (EXAMPLES.find((e) => e.id === id) ?? EXAMPLES[0]).build();
