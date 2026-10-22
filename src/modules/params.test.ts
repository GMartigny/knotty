import { describe, expect, it } from "vitest";
import { formatValue, fromSlider, toSlider } from "./params";
import type { ParamDef } from "./types";

const lin: ParamDef = { id: "mix", label: "Mix", min: 0, max: 1, default: 0.5, step: 0.01 };
const log: ParamDef = { id: "frequency", label: "Frequency", min: 40, max: 12000, default: 900, scale: "log", unit: "Hz" };
const db: ParamDef = { id: "volume", label: "Volume", min: -40, max: 12, default: 0, step: 0.5, unit: "dB" };
const time: ParamDef = { id: "attack", label: "Attack", min: 0.001, max: 2, default: 0.01, scale: "log", step: 0.001, unit: "s" };

describe("sliders", () => {
    it("map the range ends to 0 and 1", () => {
        expect(toSlider(lin, 0)).toBe(0);
        expect(toSlider(lin, 1)).toBe(1);
        expect(toSlider(log, 40)).toBeCloseTo(0);
        expect(toSlider(log, 12000)).toBeCloseTo(1);
    });

    it("are logarithmic for frequencies: the middle is the geometric mean", () => {
        expect(fromSlider(log, 0.5)).toBe(Math.round(Math.sqrt(40 * 12000)));
    });

    it("round to the step without float noise", () => {
        expect(fromSlider(lin, 0.3)).toBe(0.3);
        expect(fromSlider(time, 0.123456)).toBe(Number(fromSlider(time, 0.123456).toFixed(3)));
        expect(String(fromSlider(db, 0.51))).toMatch(/^-?\d+(\.5)?$/);
    });

    it("stay within the range", () => {
        expect(fromSlider(lin, 1.2)).toBe(1);
        expect(fromSlider(db, -0.1)).toBe(-40);
    });

    it("round-trip a value", () => {
        for (const v of [0, 0.25, 0.5, 1]) expect(fromSlider(lin, toSlider(lin, v))).toBe(v);
        expect(fromSlider(log, toSlider(log, 900))).toBe(900);
    });
});

describe("formatValue", () => {
    it("shows durations under a second in milliseconds", () => {
        expect(formatValue(time, 0.002)).toBe("2 ms");
        expect(formatValue(time, 1.5)).toBe("1.50 s");
    });

    it("shortens thousands", () => {
        expect(formatValue(log, 12000)).toBe("12.0k Hz");
    });

    it("formats negative values like positive ones", () => {
        expect(formatValue(db, -12)).toBe("-12 dB");
        expect(formatValue(db, -12.5)).toBe("-12.5 dB");
        expect(formatValue(db, 12.5)).toBe("12.5 dB");
    });

    it("leaves out the unit when there is none", () => {
        expect(formatValue(lin, 0.35)).toBe("0.35");
    });
});
