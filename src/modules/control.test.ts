import { describe, expect, it } from "vitest";
import { pickNote } from "./scale";
import { levelOf } from "./random";
import { isStepOn, toggleStep } from "./sequencer";
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
