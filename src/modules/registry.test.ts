import { describe, expect, it } from "vitest";
import { compatible, moduleList, portKind, registry } from "./registry";
import { ModReader, defaultDepth, defaultParams, isActive, isModulatable, modParamOf, modPort, rowCount, type ParamDef } from "./types";

describe("block definitions", () => {
    it("have unique types", () => {
        expect(new Set(moduleList.map((m) => m.type)).size).toBe(moduleList.length);
    });

    it.each(moduleList.map((m) => [m.type, m] as const))("%s: settings have sane ranges and defaults", (_, def) => {
        const ids = def.params.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const p of def.params) {
            expect(p.min).toBeLessThan(p.max);
            expect(p.default).toBeGreaterThanOrEqual(p.min);
            expect(p.default).toBeLessThanOrEqual(p.max);
            if (p.options) expect(p.options.length).toBe(p.max - p.min + 1);
            if (p.scale === "log") expect(p.min).toBeGreaterThan(0);
        }
    });

    it.each(moduleList.map((m) => [m.type, m] as const))("%s: sockets are unique and settings' inputs exist", (_, def) => {
        const ins = def.inputs.map((p) => p.id);
        const outs = def.outputs.map((p) => p.id);
        expect(new Set(ins).size).toBe(ins.length);
        expect(new Set(outs).size).toBe(outs.length);
        for (const p of def.params) if (p.inputPort) expect(ins).toContain(p.inputPort);
        if (def.idleHint) expect(ins).toContain(def.idleHint.port);
    });

    it.each(moduleList.map((m) => [m.type, m] as const))("%s: has a short description for the palette", (_, def) => {
        expect(def.description.length).toBeGreaterThan(20);
        expect(def.description.length).toBeLessThan(200);
    });

    it("variable rows are stored in an existing hidden setting", () => {
        for (const def of moduleList.filter((m) => m.rows)) {
            const p = def.params.find((d) => d.id === def.rows!.param);
            expect(p?.hidden).toBe(true);
            expect(p?.min).toBe(def.rows!.min);
            expect(p?.max).toBe(def.rows!.max);
        }
    });
});

describe("sockets", () => {
    it("know their signal kind", () => {
        expect(portKind("sine", "out", "out")).toBe("audio");
        expect(portKind("envelope", "gate", "in")).toBe("trigger");
        expect(portKind("filter", "mod:frequency", "in")).toBe("mod");
        expect(portKind("filter", "nope", "in")).toBeUndefined();
        expect(portKind("nope", "out", "out")).toBeUndefined();
    });

    it("have no modulation socket for choices, hidden or excluded settings", () => {
        expect(portKind("filter", "mod:mode", "in")).toBeUndefined();
        expect(portKind("sequencer", "mod:bpm", "in")).toBeUndefined();
        expect(portKind("sequencer", "mod:row0", "in")).toBeUndefined();
    });

    it("on hidden rows don't exist", () => {
        const params = defaultParams(registry.sequencer);
        expect(portKind("sequencer", "row3", "out", params)).toBe("trigger");
        expect(portKind("sequencer", "row4", "out", params)).toBeUndefined();
        expect(portKind("sequencer", "row4", "out", { ...params, rows: 5 })).toBe("trigger");
        // Without settings, every row counts (definitions only).
        expect(portKind("sequencer", "row15", "out")).toBe("trigger");
        expect(portKind("mixer", "in5", "in", defaultParams(registry.mixer))).toBeUndefined();
    });

    it("let audio drive a setting, but never mix sound and triggers", () => {
        expect(compatible("audio", "audio")).toBe(true);
        expect(compatible("audio", "mod")).toBe(true);
        expect(compatible("trigger", "trigger")).toBe(true);
        expect(compatible("audio", "trigger")).toBe(false);
        expect(compatible("trigger", "audio")).toBe(false);
        expect(compatible("trigger", "mod")).toBe(false);
    });
});

describe("helpers", () => {
    it("name modulation sockets after their setting", () => {
        expect(modPort("frequency")).toBe("mod:frequency");
        expect(modParamOf("mod:frequency")).toBe("frequency");
        expect(modParamOf("in")).toBeUndefined();
    });

    it("count rows, Infinity on fixed blocks", () => {
        expect(rowCount(registry.sequencer, { rows: 7 })).toBe(7);
        expect(rowCount(registry.sequencer, {})).toBe(4);
        expect(rowCount(registry.filter, {})).toBe(Infinity);
        expect(isActive(registry.mixer, { channels: 2 }, { row: 1 })).toBe(true);
        expect(isActive(registry.mixer, { channels: 2 }, { row: 2 })).toBe(false);
        expect(isActive(registry.mixer, { channels: 2 }, {})).toBe(true);
    });

    it("know which sliders can be modulated", () => {
        const [shape, frequency, glide] = registry.sine.params;
        expect(isModulatable(shape)).toBe(false);
        expect(isModulatable(frequency)).toBe(true);
        expect(isModulatable(glide)).toBe(false);
    });

    it("modulate by ±half the range, or ±100% of the value on a log scale", () => {
        const lin: ParamDef = { id: "q", label: "Q", min: 0, max: 20, default: 4 };
        const log: ParamDef = { id: "f", label: "F", min: 20, max: 2000, default: 200, scale: "log" };
        expect(defaultDepth(lin)(4)).toBe(10);
        expect(defaultDepth(log)(300)).toBe(300);
    });

    it("read on-demand modulation, clamped to the range", () => {
        const defs: ParamDef[] = [
            { id: "sustain", label: "S", min: 0, max: 1, default: 0.5 },
            { id: "attack", label: "A", min: 0.001, max: 2, default: 0.01, scale: "log" },
        ];
        const mods = new ModReader(defs);
        expect(mods.value("sustain", 0.5)).toBe(0.5);
        mods.set("sustain", () => 0.5);
        expect(mods.value("sustain", 0.5)).toBe(0.75);
        mods.set("sustain", () => 1);
        expect(mods.value("sustain", 0.9)).toBe(1);
        // Log scale: ±2 octaves.
        mods.set("attack", () => 0.5);
        expect(mods.value("attack", 0.1)).toBeCloseTo(0.2);
        mods.set("attack", () => NaN);
        expect(mods.value("attack", 0.1)).toBe(0.1);
        mods.set("sustain", null);
        expect(mods.value("sustain", 0.5)).toBe(0.5);
    });
});
