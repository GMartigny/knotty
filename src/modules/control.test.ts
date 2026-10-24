import { describe, expect, it } from "vitest";
import { pickNote } from "./scale";
import { levelOf } from "./random";
import { MODE, MODEL_EFFECTS, glideFrom, modelChain, isStepOn, rowFrequency, toggleStep } from "./sequencer";
import { acceptsBlock, portKind, registry } from "./registry";
import { defaultParams, type Model } from "./types";
import { frequencyOf, midiOf, noteName } from "./notes";
import { SOURCE_LEVEL } from "./types";

describe("Scale", () => {
    const name = (m: number, scale = 2, root = 0, octave = 1) => noteName(pickNote(m, scale, root, octave));

    it("spans two octaves from the root", () => {
        expect(name(-1)).toBe("C4");
        expect(name(0)).toBe("C5");
        expect(name(1)).toBe("C6");
        expect(name(-1, 2, 2, 0)).toBe("E3");
    });

    it("only plays notes of the scale", () => {
        const minorPentaOfE = new Set(["E", "G", "A", "B", "D"]);
        for (let m = -1; m <= 1; m += 0.01) expect(minorPentaOfE.has(name(m, 2, 2, 0).replace(/\d/g, ""))).toBe(true);
    });

    it("plays a third above in G major for the same signal as E minor (twin guitars)", () => {
        for (let m = -1; m <= 1; m += 0.05) {
            const low = pickNote(m, 1, 2, 0);
            const high = pickNote(m, 0, 4, 0);
            expect([3, 4]).toContain(high - low);
        }
    });

    it("clamps the signal and treats silence as the middle", () => {
        expect(pickNote(5, 0, 0, 1)).toBe(pickNote(1, 0, 0, 1));
        expect(pickNote(NaN, 0, 0, 1)).toBe(pickNote(0, 0, 0, 1));
    });
});

describe("Random", () => {
    it("spreads its values evenly over the whole range of a source", () => {
        expect(levelOf(0, 6)).toBeCloseTo(-SOURCE_LEVEL);
        expect(levelOf(5, 6)).toBeCloseTo(SOURCE_LEVEL);
        expect(levelOf(1, 3)).toBe(0);
        expect(levelOf(0, 1)).toBe(0);
    });
});

describe("Sequencer patterns", () => {
    it("store one bit per step", () => {
        let pattern = 0;
        pattern = toggleStep(pattern, 0);
        pattern = toggleStep(pattern, 15);
        expect(isStepOn(pattern, 0)).toBe(true);
        expect(isStepOn(pattern, 1)).toBe(false);
        expect(isStepOn(pattern, 15)).toBe(true);
        expect(toggleStep(pattern, 0)).toBe(1 << 15);
    });
});

describe("Sequencer notes mode", () => {
    const base = { ...defaultParams(registry.sequencer), mode: MODE.notes, rows: 13 };

    it("is a piano roll: the bottom row plays the base, each row above a semitone higher", () => {
        const c4 = frequencyOf(60);
        expect(rowFrequency(c4, 13, 12)).toBeCloseTo(c4);
        expect(noteName(midiOf(rowFrequency(c4, 13, 11)))).toBe("C♯4");
        expect(noteName(midiOf(rowFrequency(c4, 13, 0)))).toBe("C5");
        // The base is the model Oscillator's frequency, whatever it is.
        expect(rowFrequency(440, 4, 3)).toBe(440);
        expect(rowFrequency(440, 4, 0)).toBeCloseTo(440 * Math.pow(2, 3 / 12));
    });

    it("has sound outputs (per row and mixed) and model inputs in notes mode, trigger outputs in tracks mode", () => {
        const tracks = defaultParams(registry.sequencer);
        expect(portKind("sequencer", "row0", "out", tracks)).toBe("trigger");
        expect(portKind("sequencer", "note0", "out", tracks)).toBeUndefined();
        expect(portKind("sequencer", "out", "out", tracks)).toBeUndefined();
        expect(portKind("sequencer", "model", "in", tracks)).toBeUndefined();
        expect(portKind("sequencer", "row0", "out", base)).toBeUndefined();
        expect(portKind("sequencer", "note12", "out", base)).toBe("audio");
        expect(portKind("sequencer", "note13", "out", base)).toBeUndefined();
        expect(portKind("sequencer", "out", "out", base)).toBe("audio");
        expect(portKind("sequencer", "model", "in", base)).toBe("audio");
    });

    it("only takes an Envelope as model", () => {
        expect(acceptsBlock("sequencer", "model", "envelope")).toBe(true);
        expect(acceptsBlock("sequencer", "model", "sine")).toBe(false);
        expect(acceptsBlock("sequencer", "model", "noise")).toBe(false);
        // Effects behind the Envelope are copied with it; not a Reverb (too costly per note).
        expect(acceptsBlock("sequencer", "model", "distortion")).toBe(true);
        expect(acceptsBlock("sequencer", "model", "reverb")).toBe(false);
        // Other inputs take anything compatible.
        expect(acceptsBlock("filter", "in", "noise")).toBe(true);
    });

    it("glides each note from the closest note of the previous step", () => {
        expect(glideFrom([], 1)).toBeUndefined();
        expect(glideFrom([1.5], 1)).toBe(1.5);
        // Closest in pitch (ratio), not in hertz.
        expect(glideFrom([0.5, 2.1], 1)).toBe(0.5);
        expect(glideFrom([0.5, 1.9], 1)).toBe(1.9);
        expect(glideFrom([1, 1.25, 1.5], 1.3)).toBe(1.25);
    });

    it("gets an octave of rows when switched to notes", () => {
        const adjust = registry.sequencer.adjust!;
        expect(adjust({ ...base, rows: 4 }, "mode")).toEqual({ rows: 13 });
        expect(adjust({ ...base, rows: 16 }, "mode")).toEqual({});
        expect(adjust({ ...base, mode: MODE.tracks, rows: 4 }, "mode")).toEqual({});
        expect(adjust({ ...base, rows: 4 }, "bpm")).toEqual({});
    });
});

describe("the model chain of a Notes sequencer", () => {
    /** A fake model block of some type, fed by `from` on the input its sound comes in by. */
    const block = (type: string, from?: Model): Model => ({
        type,
        params: () => ({}),
        tap: () => undefined,
        input: (port) => (port === (MODEL_EFFECTS[type] ?? "in") ? from : undefined),
        copy: () => undefined,
    });

    it("goes up through the effects to the Envelope, effects in playing order", () => {
        const env = block("envelope", block("sine"));
        const filter = block("filter", env);
        const level = block("mixer", filter);
        const dist = block("distortion", level);
        const { envelope, effects } = modelChain(dist);
        expect(envelope).toBe(env);
        expect(effects.map((e) => e.type)).toEqual(["filter", "mixer", "distortion"]);
    });

    it("an Envelope alone has no effects; a chain without Envelope has none either", () => {
        const env = block("envelope");
        expect(modelChain(env)).toEqual({ envelope: env, effects: [] });
        expect(modelChain(block("distortion", block("sine"))).envelope).toBeUndefined();
        expect(modelChain(null)).toEqual({ envelope: undefined, effects: [] });
    });
});
