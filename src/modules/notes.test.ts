import { describe, expect, it } from "vitest";
import { frequencyOf, midiC, noteName } from "./notes";

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
