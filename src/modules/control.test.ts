import { describe, expect, it } from "vitest";
import { pickNote } from "./scale";
import { levelOf } from "./random";
import { MODE, SEQ_VOICES, isStepOn, rowNote, stepNotes, toggleStep } from "./sequencer";
import { portKind, registry } from "./registry";
import { defaultParams, isActive } from "./types";
import { noteName } from "./notes";
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
    const base = { ...defaultParams(registry.sequencer), mode: MODE.notes, rows: 13, top: 2, row0: 0, row1: 0 };

    it("is a piano roll: the top row is a C, each row below a semitone lower", () => {
        expect(noteName(rowNote(base, 0))).toBe("C5");
        expect(noteName(rowNote(base, 1))).toBe("B4");
        expect(noteName(rowNote(base, 12))).toBe("C4");
        expect(noteName(rowNote({ ...base, top: 0 }, 0))).toBe("C3");
    });

    it("plays every lit note of a step, from the lowest, up to one per voice", () => {
        const chord = { ...base, row0: 1, row5: 1, row8: 1, row12: 1 | 2 };
        expect(stepNotes(chord, 0).map(noteName)).toEqual(["C4", "E4", "G4", "C5"]);
        expect(stepNotes(chord, 1).map(noteName)).toEqual(["C4"]);
        expect(stepNotes(chord, 2)).toEqual([]);
        const crowded = { ...base, row0: 1, row1: 1, row2: 1, row3: 1, row4: 1 };
        expect(stepNotes(crowded, 0)).toHaveLength(SEQ_VOICES);
        expect(noteName(stepNotes(crowded, 0)[0])).toBe("G♯4");
    });

    it("ignores rows that are hidden", () => {
        expect(stepNotes({ ...base, rows: 2, row5: 1 }, 0)).toEqual([]);
    });

    it("shows row outputs in tracks mode, voice outputs in notes mode", () => {
        const tracks = defaultParams(registry.sequencer);
        expect(portKind("sequencer", "row0", "out", tracks)).toBe("trigger");
        expect(portKind("sequencer", "voice1", "out", tracks)).toBeUndefined();
        expect(portKind("sequencer", "row0", "out", base)).toBeUndefined();
        expect(portKind("sequencer", "voice4", "out", base)).toBe("trigger");
        const top = registry.sequencer.params.find((p) => p.id === "top")!;
        expect(isActive(registry.sequencer, tracks, top)).toBe(false);
        expect(isActive(registry.sequencer, base, top)).toBe(true);
    });

    it("gets an octave of rows when switched to notes", () => {
        const adjust = registry.sequencer.adjust!;
        expect(adjust({ ...base, rows: 4 }, "mode")).toEqual({ rows: 13 });
        expect(adjust({ ...base, rows: 16 }, "mode")).toEqual({});
        expect(adjust({ ...base, mode: MODE.tracks, rows: 4 }, "mode")).toEqual({});
        expect(adjust({ ...base, rows: 4 }, "bpm")).toEqual({});
    });
});
