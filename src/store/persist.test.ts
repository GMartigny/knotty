import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPatch, savePatch } from "./persist";
import { createCable, createNode } from "./nodes";

const KEY = "knotty:patch:v1";
const store = (value: unknown) => localStorage.setItem(KEY, typeof value === "string" ? value : JSON.stringify(value));

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe("loading a saved patch", () => {
    it("returns null when there is nothing, or nothing readable", () => {
        expect(loadPatch()).toBeNull();
        store("{oops");
        expect(loadPatch()).toBeNull();
        store({ nodes: "no" });
        expect(loadPatch()).toBeNull();
    });

    it("cleans it up for the current version", () => {
        store({
            nodes: [
                { id: "s1", type: "sequencer", x: 0, y: 0, params: { bpm: 999, rows: 40, row0: 5, ghost: 3 } },
                { id: "s2", type: "sequencer", x: 0, y: 400, params: { bpm: 90 } },
                { id: "e1", type: "envelope", x: 500, y: 0, params: { attack: "fast" } },
                { id: "x", type: "theremin", x: 0, y: 0, params: {} },
                { id: "c", type: "comment", x: 0, y: 0, params: {}, text: "Drums", w: 20, h: 300 },
            ],
            edges: [
                { source: "s1", sourceHandle: "row0", target: "e1", targetHandle: "gate" },
                { source: "s1", sourceHandle: "row0", target: "e1", targetHandle: "gate" },
                { source: "s1", sourceHandle: "row0", target: "x", targetHandle: "in" },
                { source: "s1", sourceHandle: "row0", target: "e1", targetHandle: "in" },
            ],
        });
        const { nodes, edges } = loadPatch()!;
        // Unknown block type dropped.
        expect(nodes.map((n) => n.id)).toEqual(["s1", "s2", "e1", "c"]);
        const [s1, s2, e1, c] = nodes;
        // Clamped to the range, unknown settings dropped, defaults filled in.
        expect(s1.data.params).toMatchObject({ bpm: 200, rows: 16, row0: 5 });
        expect(s1.data.params.ghost).toBeUndefined();
        expect(e1.data.params.attack).toBe(0.01);
        // The tempo is shared.
        expect(s2.data.params.bpm).toBe(200);
        // A Comment keeps its text; a size too small falls back to the default.
        expect(c).toMatchObject({ data: { text: "Drums" }, width: 380, height: 300 });
        // Duplicate, dangling and incompatible cables dropped.
        expect(edges.map((e) => e.id)).toEqual(["s1:row0->e1:gate"]);
    });

    it("turns a Volume (removed) into a one-channel Mixer at the same level", () => {
        store({
            nodes: [
                { id: "n", type: "noise", x: 0, y: 0, params: {} },
                { id: "v", type: "volume", x: 0, y: 0, params: { volume: -12, mute: 0 } },
                { id: "m", type: "volume", x: 0, y: 0, params: { volume: 6, mute: 1 } },
                { id: "o", type: "output", x: 0, y: 0, params: {} },
            ],
            edges: [
                { source: "n", sourceHandle: "out", target: "v", targetHandle: "in" },
                { source: "v", sourceHandle: "out", target: "o", targetHandle: "in" },
            ],
        });
        const { nodes, edges } = loadPatch()!;
        expect(nodes[1].data).toMatchObject({ type: "mixer", params: { channels: 1, level1: 25 } });
        expect(nodes[2].data.params.level1).toBe(0);
        expect(edges.map((e) => e.id)).toEqual(["n:out->v:in1", "v:out->o:in"]);
    });

    it("drops cables on rows that are hidden", () => {
        store({
            nodes: [
                { id: "s", type: "sequencer", x: 0, y: 0, params: { rows: 2 } },
                { id: "e", type: "envelope", x: 0, y: 0, params: {} },
            ],
            edges: [{ source: "s", sourceHandle: "row3", target: "e", targetHandle: "gate" }],
        });
        expect(loadPatch()!.edges).toEqual([]);
    });
});

describe("saving", () => {
    it("writes once, shortly after the last change, without falling blocks or cables", () => {
        vi.useFakeTimers();
        const seq = createNode("sequencer", { x: 1.4, y: 2.6 }, { id: "s" });
        const env = createNode("envelope", { x: 0, y: 0 }, { id: "e" });
        const falling = { ...createNode("noise", { x: 0, y: 0 }, { id: "n" }), data: { type: "noise", params: {}, removing: true } };
        const note = createNode("comment", { x: 0, y: 0 }, { id: "c", text: "Hi" });
        const cable = createCable("s", "row0", "e", "gate", "trigger");
        const dropping = { ...createCable("n", "out", "e", "in", "audio"), data: { kind: "audio" as const, dropping: "source" as const } };

        savePatch([seq], []);
        savePatch([seq, env, falling, note], [cable, dropping]);
        expect(localStorage.getItem(KEY)).toBeNull();
        vi.advanceTimersByTime(400);

        const saved = JSON.parse(localStorage.getItem(KEY)!);
        expect(saved.nodes.map((n: { id: string }) => n.id)).toEqual(["s", "e", "c"]);
        expect(saved.nodes[0]).toMatchObject({ x: 1, y: 3 });
        expect(saved.nodes[2]).toMatchObject({ text: "Hi", w: 380, h: 240 });
        expect(saved.edges).toEqual([{ source: "s", sourceHandle: "row0", target: "e", targetHandle: "gate" }]);

        // And it loads back the same.
        const loaded = loadPatch()!;
        expect(loaded.nodes.map((n) => n.id)).toEqual(["s", "e", "c"]);
        expect(loaded.edges.map((e) => e.id)).toEqual(["s:row0->e:gate"]);
    });
});
