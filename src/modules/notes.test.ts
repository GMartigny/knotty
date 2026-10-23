import { describe, expect, it } from "vitest";
import { frequencyOf, midiC, midiOf, noteName, transposeFrequency } from "./notes";
import { packNotes, unpackNotes } from "./transpose";

describe("notes", () => {
    it("name MIDI notes with their octave", () => {
        expect(noteName(60)).toBe("C4");
        expect(noteName(67)).toBe("G4");
        expect(noteName(70)).toBe("A♯4");
        expect(noteName(40)).toBe("E2");
    });

    it("tune A4 to 440 Hz, an octave doubling the frequency", () => {
        expect(frequencyOf(69)).toBe(440);
        expect(frequencyOf(81)).toBeCloseTo(880);
        expect(frequencyOf(60)).toBeCloseTo(261.63, 2);
    });

    it("find the C of an octave", () => {
        expect(midiC(4)).toBe(60);
        expect(midiC(3)).toBe(48);
    });
});

describe("transposing", () => {
    it("finds the nearest MIDI note of a frequency", () => {
        expect(midiOf(440)).toBe(69);
        expect(midiOf(261.63)).toBe(60);
        expect(midiOf(frequencyOf(73) * 1.01)).toBe(73);
    });

    it("moves a frequency by semitones", () => {
        expect(transposeFrequency(440, 12)).toBeCloseTo(880);
        expect(transposeFrequency(440, -12)).toBeCloseTo(220);
        expect(midiOf(transposeFrequency(frequencyOf(60), 7))).toBe(67);
        expect(transposeFrequency(440, 0)).toBe(440);
    });

    it("packs the shown notes in and out in one number", () => {
        expect(unpackNotes(packNotes(60, 67))).toEqual({ in: 60, out: 67 });
        expect(unpackNotes(packNotes(64, 40))).toEqual({ in: 64, out: 40 });
    });
});
